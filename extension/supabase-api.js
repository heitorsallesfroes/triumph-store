// Acesso ao Supabase (REST + Storage) usado pelo background.
// Escreve só a pedido de um clique no painel: wa_items.usage_count (+1), as etiquetas CRM
// (wa_labels, wa_contacts, wa_contact_labels) e a biblioteca pelo editor (wa_categories, wa_items,
// wa_item_parts e arquivos novos no bucket wa-media) e os agendamentos (wa_schedules: criar e cancelar
// por clique; o executor do painel reserva e marca o resultado dos que o usuário agendou).
// 2.0.0: motor de envios (wa_settings, wa_send_log), réguas de follow (wa_flows, wa_flow_variants)
// e disparos (wa_campaigns, wa_campaign_targets): configurar só por clique; o motor do painel reserva,
// registra e troca as etiquetas da régua dos contatos que entraram nela.
(function (root) {
  // Mensagens entre background e página têm limite (~64 MB); o arquivo vai em base64 (+33%).
  const MAX_FILE_BYTES = 40 * 1024 * 1024;
  const BUCKET = 'wa-media';

  function cfg() {
    if (!root.WA_CONFIG || !root.WA_CONFIG.SUPABASE_URL || !root.WA_CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('config.js sem SUPABASE_URL / SUPABASE_ANON_KEY');
    }
    return root.WA_CONFIG;
  }

  // 1.9.1: com sessão (auth.js) vai o Bearer do usuário; sem sessão, a chave anon como antes
  function supaFetch(url, init = {}) {
    if (root.WaAuth && typeof root.WaAuth.authFetch === 'function') return root.WaAuth.authFetch(url, init);
    const { SUPABASE_ANON_KEY } = cfg();
    return fetch(url, { ...init, headers: { ...(init.headers || {}), apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  }

  async function rest(path, init = {}) {
    const { SUPABASE_URL } = cfg();
    const res = await supaFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  const ITEM_COLUMNS = 'id,category_id,type,title,body,file_url,file_name,file_size,usage_count,position,created_at';
  const ITEM_ORDER = 'order=position.asc,created_at.asc';

  // Pede também record_seconds; se a coluna ainda não existe no banco (erro 400), busca sem ela
  async function fetchItems() {
    try {
      return await rest(`wa_items?select=${ITEM_COLUMNS},record_seconds&${ITEM_ORDER}`);
    } catch (err) {
      if (/^Supabase 400:/.test(err.message) && /record_seconds/.test(err.message)) {
        return rest(`wa_items?select=${ITEM_COLUMNS}&${ITEM_ORDER}`);
      }
      throw err;
    }
  }

  // Tabela nova ainda não criada no banco (migration não aplicada)
  const missingTable = (err, table) => /^Supabase (400|404):/.test(err.message)
    && new RegExp(`\\b${table}\\b`).test(err.message) && /PGRST205|42P01|does not exist|Could not find the table/.test(err.message);

  const PART_COLUMNS = 'id,item_id,position,type,body,file_url,file_name,file_size,wait_seconds,typing_seconds';

  // Partes de todos os itens; null = tabela wa_item_parts ainda não existe
  async function fetchParts() {
    try {
      return await rest(`wa_item_parts?select=${PART_COLUMNS}&order=item_id.asc,position.asc&limit=10000`);
    } catch (err) {
      if (missingTable(err, 'wa_item_parts')) return null;
      throw err;
    }
  }

  async function fetchLibrary() {
    const [categories, items, parts] = await Promise.all([
      rest('wa_categories?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      fetchItems(),
      fetchParts(),
    ]);
    if (parts) {
      const byItem = new Map();
      parts.forEach((p) => {
        if (!byItem.has(p.item_id)) byItem.set(p.item_id, []);
        byItem.get(p.item_id).push(p);
      });
      items.forEach((i) => {
        const list = (byItem.get(i.id) || []).sort((a, b) => a.position - b.position);
        if (list.length) i.parts = list;
      });
    }
    return { categories, items, partsAvailable: parts !== null };
  }

  async function incrementUsage(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('id inválido');
    const rows = await rest(`wa_items?select=usage_count&id=eq.${id}`);
    if (!rows.length) throw new Error('Item não encontrado');
    const usage_count = (rows[0].usage_count || 0) + 1;
    await rest(`wa_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ usage_count }),
    });
    return usage_count;
  }

  // Só baixa arquivos do bucket wa-media do próprio projeto
  function isAllowedFileUrl(url) {
    return typeof url === 'string' && url.startsWith(`${cfg().SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  async function fetchFile(url) {
    if (!isAllowedFileUrl(url)) throw new Error('URL de arquivo não permitida');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download falhou (${res.status})`);
    const tooBig = 'Arquivo acima de 40 MB: grande demais para anexar pela extensão';
    if (Number(res.headers.get('content-length') || 0) > MAX_FILE_BYTES) throw new Error(tooBig);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(tooBig);
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
    return { base64: toBase64(buffer), mime, size: buffer.byteLength };
  }

  // ── Etiquetas ──────────────────────────────────────────────────────────────
  // Contato = só nome e telefone (dígitos). Nunca grava texto de mensagem.

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const eq = (value) => `eq.${encodeURIComponent(value)}`;
  const nameKey = (name) => `nome:${name.toLowerCase().replace(/\s+/g, ' ').trim()}`;

  // chatId (2.0.0): id da conversa individual, quando a extensão sabe (só é gravado se a coluna existir)
  const IDENTITY_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  function checkIdentity(identity) {
    const { key, phone, name, chatId } = identity || {};
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
    const chat = typeof chatId === 'string' && IDENTITY_CHAT_RE.test(chatId) ? chatId : null;
    if (typeof key !== 'string') throw new Error('Identificação inválida');
    if (key.startsWith('tel:')) {
      if (!/^\d{8,15}$/.test(phone || '') || key !== `tel:${phone}`) throw new Error('Telefone inválido');
      return { key, phone, name: cleanName, chatId: chat };
    }
    if (!cleanName || key !== nameKey(cleanName)) throw new Error('Identificação inválida');
    return { key, phone: null, name: cleanName, chatId: chat };
  }

  // Coluna nova ainda não criada no banco: o PostgREST responde 400 citando o nome dela
  const missingColumn = (err, column) => /^Supabase 400:/.test(err.message) && new RegExp(`\\b${column}\\b`).test(err.message);

  // Pede também hidden; sem a coluna, nenhuma etiqueta fica oculta
  async function fetchLabels() {
    const base = 'wa_labels?select=id,name,color,position';
    const order = '&order=position.asc,created_at.asc';
    try {
      return await rest(`${base},hidden${order}`);
    } catch (err) {
      if (missingColumn(err, 'hidden')) return rest(base + order);
      throw err;
    }
  }

  // Procura pelo telefone; se não achar, um contato salvo antes só pelo mesmo nome (para promover)
  async function findContact(id) {
    const rows = await rest(`wa_contacts?select=id,key,phone&key=${eq(id.key)}`);
    if (rows.length) return rows[0];
    if (id.phone && id.name) {
      const byName = await rest(`wa_contacts?select=id,key,phone&key=${eq(nameKey(id.name))}&phone=is.null`);
      if (byName.length) return { ...byName[0], promotable: true };
    }
    return null;
  }

  async function labelIdsOf(contactId) {
    const rows = await rest(`wa_contact_labels?select=label_id&contact_id=eq.${contactId}`);
    return rows.map((r) => r.label_id);
  }

  async function getContactLabels(identity) {
    const contact = await findContact(checkIdentity(identity));
    return contact ? labelIdsOf(contact.id) : [];
  }

  // Só é chamado ao aplicar uma etiqueta: abrir a conversa não grava nada
  async function ensureContact(id) {
    const found = await findContact(id);
    if (found && !found.promotable) return found;
    const now = new Date().toISOString();
    if (found) {
      const rows = await rest(`wa_contacts?id=eq.${found.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ key: id.key, phone: id.phone, name: id.name, updated_at: now }),
      });
      return rows[0];
    }
    const rows = await rest('wa_contacts?on_conflict=key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ key: id.key, name: id.name, phone: id.phone, updated_at: now }),
    });
    return rows[0];
  }

  // Marca ou desmarca uma etiqueta; devolve as etiquetas do contato depois da mudança
  async function setContactLabel({ identity, labelId, on }) {
    const id = checkIdentity(identity);
    if (typeof labelId !== 'string' || !UUID_RE.test(labelId)) throw new Error('Etiqueta inválida');
    if (on) {
      const contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
      await rest('wa_contact_labels?on_conflict=contact_id,label_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ contact_id: contact.id, label_id: labelId }),
      });
      return labelIdsOf(contact.id);
    }
    const contact = await findContact(id);
    if (!contact) return [];
    await rest(`wa_contact_labels?contact_id=eq.${contact.id}&label_id=eq.${labelId}`, { method: 'DELETE' });
    return labelIdsOf(contact.id);
  }

  // ── Aba Etiquetas (só leitura) ─────────────────────────────────────────────

  // Total de linhas sem baixá-las (HEAD + Prefer: count=exact → Content-Range "*/N")
  async function countRows(path) {
    const { SUPABASE_URL } = cfg();
    const res = await supaFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const total = Number((res.headers.get('content-range') || '').split('/')[1]);
    if (!Number.isFinite(total)) throw new Error('Contagem indisponível');
    return total;
  }

  // { labelId: quantidade de clientes }
  async function fetchLabelCounts() {
    const labels = await rest('wa_labels?select=id');
    const counts = await Promise.all(labels.map((l) => countRows(`wa_contact_labels?label_id=eq.${l.id}`)));
    return Object.fromEntries(labels.map((l, i) => [l.id, counts[i]]));
  }

  // Busca por nome (contém, sem diferenciar maiúsculas) ou por trecho do telefone
  function clientSearchFilter(search) {
    const text = String(search || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text) return '';
    const parts = [`name.ilike.*${text}*`];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 3) parts.push(`phone.like.*${digits}*`);
    return `&contact.or=${encodeURIComponent(`(${parts.join(',')})`)}`;
  }

  // Clientes de uma etiqueta, mais recentes primeiro, em páginas (máx. 200, abaixo do limite de 1000).
  // A nota nunca sai daqui: vira só hasNote (sem a coluna notes, hasNote = false).
  async function fetchLabelClients({ labelId, offset = 0, limit = 50, search = '' }) {
    if (typeof labelId !== 'string' || !UUID_RE.test(labelId)) throw new Error('Etiqueta inválida');
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const query = (cols) => rest(
      `wa_contact_labels?select=created_at,contact:wa_contacts!inner(${cols})` +
      `&label_id=eq.${labelId}&order=created_at.desc,contact_id.asc&offset=${off}&limit=${lim + 1}` +
      clientSearchFilter(search),
    );
    let rows;
    try {
      rows = await query('id,key,name,phone,notes');
    } catch (err) {
      if (!missingColumn(err, 'notes')) throw err;
      rows = await query('id,key,name,phone');
    }
    return {
      clients: rows.slice(0, lim).map((r) => ({
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
        byName: String(r.contact.key).startsWith('nome:'),
        addedAt: r.created_at || null,
        hasNote: typeof r.contact.notes === 'string' && r.contact.notes.trim() !== '',
      })),
      hasMore: rows.length > lim,
    };
  }

  // ── Etiquetas CRM: gerenciar (só a pedido de um clique no painel) ─────────

  const PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];
  const NOTE_MAX = 2000;
  const LABEL_NAME_MAX = 40;
  const NOTES_MISSING = 'Nota disponível após atualizar o banco';
  const HIDDEN_MISSING = 'Ocultar disponível após atualizar o banco';
  const json = (method, prefer, body) => ({
    method,
    headers: { 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(body),
  });

  function checkUuid(id, what = 'Etiqueta inválida') {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error(what);
    return id;
  }

  function checkLabelName(name) {
    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (!clean || clean.length > LABEL_NAME_MAX) throw new Error(`Nome da etiqueta CRM: 1 a ${LABEL_NAME_MAX} caracteres`);
    return clean;
  }

  function checkColor(color) {
    const c = typeof color === 'string' ? color.toLowerCase() : '';
    if (!PALETTE.includes(c)) throw new Error('Cor fora da paleta');
    return c;
  }

  const duplicateName = (err) => /^Supabase 409:/.test(err.message) || /duplicate key|23505/.test(err.message);

  // Quais colunas novas (migration 20261031120000) já existem no banco
  async function hasColumn(table, column) {
    try {
      await rest(`${table}?select=${column}&limit=1`);
      return true;
    } catch (err) {
      if (missingColumn(err, column)) return false;
      throw err;
    }
  }

  async function fetchSchema() {
    const [hidden, notes] = await Promise.all([hasColumn('wa_labels', 'hidden'), hasColumn('wa_contacts', 'notes')]);
    return { hidden, notes };
  }

  async function createLabel({ name, color }) {
    const clean = checkLabelName(name);
    const c = checkColor(color);
    const last = await rest('wa_labels?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    try {
      const rows = await rest('wa_labels', json('POST', 'return=representation', { name: clean, color: c, position }));
      const l = rows[0];
      return { id: l.id, name: l.name, color: l.color, position: l.position };
    } catch (err) {
      if (duplicateName(err)) throw new Error('Já existe uma etiqueta CRM com esse nome');
      throw err;
    }
  }

  async function updateLabel({ id, name, color, hidden, position }) {
    checkUuid(id);
    const patch = {};
    if (name !== undefined) patch.name = checkLabelName(name);
    if (color !== undefined) patch.color = checkColor(color);
    if (hidden !== undefined) {
      if (typeof hidden !== 'boolean') throw new Error('Valor inválido');
      patch.hidden = hidden;
    }
    if (position !== undefined) {
      if (!Number.isInteger(position) || position < 0 || position > 100000) throw new Error('Posição inválida');
      patch.position = position;
    }
    if (!Object.keys(patch).length) throw new Error('Nada para mudar');
    try {
      await rest(`wa_labels?id=eq.${id}`, json('PATCH', 'return=minimal', patch));
    } catch (err) {
      if (patch.hidden !== undefined && missingColumn(err, 'hidden')) throw new Error(HIDDEN_MISSING);
      if (duplicateName(err)) throw new Error('Já existe uma etiqueta CRM com esse nome');
      throw err;
    }
    return true;
  }

  // Apaga as marcações e a etiqueta. Contatos nunca são apagados.
  async function deleteLabel({ id }) {
    checkUuid(id);
    await rest(`wa_contact_labels?label_id=eq.${id}`, { method: 'DELETE' });
    await rest(`wa_labels?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Grava position = ordem da lista
  async function reorderLabels({ ids }) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new Error('Lista inválida');
    ids.forEach((id) => checkUuid(id));
    if (new Set(ids).size !== ids.length) throw new Error('Lista inválida');
    for (let i = 0; i < ids.length; i++) {
      await rest(`wa_labels?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { position: i }));
    }
    return true;
  }

  // Nota do contato aberto (só leitura; não cria contato)
  async function getContactNote(identity) {
    const id = checkIdentity(identity);
    if (!(await hasColumn('wa_contacts', 'notes'))) return { available: false, note: '' };
    const found = await findContact(id);
    if (!found) return { available: true, note: '' };
    const rows = await rest(`wa_contacts?select=notes&id=eq.${found.id}`);
    return { available: true, note: (rows[0] && rows[0].notes) || '' };
  }

  // Grava a nota (cria o contato se ainda não existir). Texto vazio apaga a nota.
  async function setContactNote({ identity, note }) {
    const id = checkIdentity(identity);
    if (typeof note !== 'string' || note.length > NOTE_MAX) throw new Error(`Nota: até ${NOTE_MAX} caracteres`);
    if (!(await hasColumn('wa_contacts', 'notes'))) throw new Error(NOTES_MISSING);
    const text = note.trim();
    const contact = await ensureContact(id);
    await rest(`wa_contacts?id=eq.${contact.id}`, json('PATCH', 'return=minimal', { notes: text || null, updated_at: new Date().toISOString() }));
    return { note: text };
  }

  // Valor para filtro in.(...) do PostgREST, entre aspas
  const inList = (values) => encodeURIComponent(`(${values.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`);

  // Copiar do WhatsApp: até 100 contatos por vez para uma etiqueta CRM.
  // Contatos novos são criados (nome e telefone); os que já existem não são alterados.
  async function bulkAddContactsToLabel({ labelId, contacts }) {
    checkUuid(labelId);
    if (!Array.isArray(contacts) || !contacts.length || contacts.length > 100) throw new Error('Lote inválido (1 a 100 contatos)');
    const byKey = new Map();
    contacts.forEach((c) => {
      const id = checkIdentity(c);
      if (!byKey.has(id.key)) byKey.set(id.key, id);
    });
    const list = [...byKey.values()];
    await rest('wa_contacts?on_conflict=key', json('POST', 'resolution=ignore-duplicates,return=minimal',
      list.map((c) => ({ key: c.key, name: c.name, phone: c.phone }))));
    const hasChatCol = list.some((c) => c.chatId) && (await chatIdColumn());
    const rows = await rest(`wa_contacts?select=id,key${hasChatCol ? ',chat_id' : ''}&key=in.${inList(list.map((c) => c.key))}`);
    // 2.0.0: grava o id da conversa de quem ainda não tem (ou mudou)
    if (hasChatCol) {
      const want = new Map(list.filter((c) => c.chatId).map((c) => [c.key, c.chatId]));
      for (const r of rows) {
        if (want.has(r.key) && r.chat_id !== want.get(r.key)) await rememberChatId(r, want.get(r.key)).catch(() => {});
      }
    }
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { added: 0, addedTel: 0, addedName: 0, already: 0 };
    const existing = await rest(`wa_contact_labels?select=contact_id&label_id=eq.${labelId}&contact_id=in.${inList(ids)}`);
    const had = new Set(existing.map((r) => r.contact_id));
    const fresh = rows.filter((r) => !had.has(r.id));
    if (fresh.length) {
      await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
        fresh.map((r) => ({ contact_id: r.id, label_id: labelId }))));
    }
    const addedTel = fresh.filter((r) => String(r.key).startsWith('tel:')).length;
    return { added: fresh.length, addedTel, addedName: fresh.length - addedTel, already: had.size };
  }

  // Quadro CRM: põe na etiqueta de destino e depois tira da de origem (o contato nunca fica sem as duas)
  async function moveContactLabel({ contactId, from, to }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(from);
    checkUuid(to);
    if (from === to) throw new Error('Mesma etiqueta');
    await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
      { contact_id: contactId, label_id: to }));
    await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${from}`, { method: 'DELETE' });
    return true;
  }

  // Todos os contatos de uma etiqueta (páginas de 200), para o CSV
  async function fetchAllLabelClients({ labelId }) {
    checkUuid(labelId);
    const all = [];
    for (let offset = 0; offset < 100000; offset += 200) {
      const page = await fetchLabelClients({ labelId, offset, limit: 200 });
      page.clients.forEach((c) => all.push({ name: c.name, phone: c.phone, byName: c.byName }));
      if (!page.hasMore) break;
    }
    return all;
  }

  // ── Biblioteca: editor do painel (1.9.0). Só a pedido de um clique; tudo validado aqui ──

  const ITEM_TYPES = ['texto', 'audio', 'imagem', 'video', 'documento'];
  const MAX_PARTS = 10;
  const TEXT_MAX = 4096;
  const TITLE_MAX = 80;
  const CATEGORY_MAX = 60;
  const PARTS_MISSING = 'Atualize o banco para usar este recurso';
  // Tipos de arquivo aceitos no upload, por tipo de parte
  const UPLOAD_MIME = {
    imagem: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4'],
    audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm'],
    documento: ['application/pdf'],
  };

  const cleanText = (v, max, what) => {
    const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (!t || t.length > max) throw new Error(`${what}: 1 a ${max} caracteres`);
    return t;
  };
  const intIn = (v, min, max, what) => {
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${what}: ${min} a ${max}`);
    return v;
  };

  function checkPart(p, index) {
    const n = index + 1;
    if (!p || typeof p !== 'object' || !ITEM_TYPES.includes(p.type)) throw new Error(`Parte ${n}: tipo inválido`);
    const wait_seconds = intIn(p.wait_seconds ?? 0, 0, 600, `Parte ${n}: esperar`);
    const typing_seconds = intIn(p.typing_seconds ?? 0, 0, 60, `Parte ${n}: digitando`);
    if (p.type === 'texto') {
      if (typeof p.body !== 'string' || !p.body.trim() || p.body.length > TEXT_MAX) throw new Error(`Parte ${n}: texto de 1 a ${TEXT_MAX} caracteres`);
      return { type: 'texto', body: p.body, file_url: null, file_name: null, file_size: null, wait_seconds, typing_seconds };
    }
    if (!isAllowedFileUrl(p.file_url)) throw new Error(`Parte ${n}: arquivo inválido`);
    const file_name = typeof p.file_name === 'string' && p.file_name.trim() ? p.file_name.trim().slice(0, 200) : 'arquivo';
    const size = p.file_size == null ? null : Number(p.file_size);
    if (size != null && (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES)) throw new Error(`Parte ${n}: arquivo acima de 40 MB`);
    let body = null;
    if (p.type !== 'audio' && typeof p.body === 'string' && p.body.trim()) {
      if (p.body.length > TEXT_MAX) throw new Error(`Parte ${n}: legenda até ${TEXT_MAX} caracteres`);
      body = p.body;
    }
    return { type: p.type, body, file_url: p.file_url, file_name, file_size: size, wait_seconds, typing_seconds };
  }

  async function partsTableExists() {
    try {
      await rest('wa_item_parts?select=id&limit=1');
      return true;
    } catch (err) {
      if (missingTable(err, 'wa_item_parts')) return false;
      throw err;
    }
  }

  // Cria ou edita um item. A parte 1 é espelhada nos campos do wa_items (para o ERP continuar mostrando algo).
  // Sem a tabela de partes: só item de 1 parte (campos do wa_items, como antes).
  async function saveItem({ id, category_id, title, parts }) {
    if (id !== undefined && id !== null) checkUuid(id, 'Item inválido');
    checkUuid(category_id, 'Categoria inválida');
    const cleanTitle = cleanText(title, TITLE_MAX, 'Título');
    if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS) throw new Error(`De 1 a ${MAX_PARTS} partes`);
    const list = parts.map(checkPart);
    const hasTable = await partsTableExists();
    if (!hasTable && list.length > 1) throw new Error(PARTS_MISSING);
    const first = list[0];
    const fields = {
      category_id, title: cleanTitle, type: first.type, body: first.body,
      file_url: first.file_url, file_name: first.file_name, file_size: first.file_size,
    };
    let itemId = id;
    if (itemId) {
      const rows = await rest(`wa_items?id=eq.${itemId}`, json('PATCH', 'return=representation', fields));
      if (!rows.length) throw new Error('Item não encontrado');
    } else {
      const last = await rest(`wa_items?select=position&category_id=eq.${category_id}&order=position.desc&limit=1`);
      const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
      const rows = await rest('wa_items', json('POST', 'return=representation', { ...fields, position }));
      itemId = rows[0].id;
    }
    if (hasTable) {
      await rest(`wa_item_parts?item_id=eq.${itemId}`, { method: 'DELETE' });
      await rest('wa_item_parts', json('POST', 'return=minimal', list.map((p, i) => ({ ...p, item_id: itemId, position: i }))));
    }
    return { id: itemId };
  }

  // Apaga o item; as partes vão junto (on delete cascade). Arquivos no Storage ficam.
  async function deleteItem({ id }) {
    checkUuid(id, 'Item inválido');
    await rest(`wa_items?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  async function createCategory({ name }) {
    const clean = cleanText(name, CATEGORY_MAX, 'Nome da categoria');
    const last = await rest('wa_categories?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    const rows = await rest('wa_categories', json('POST', 'return=representation', { name: clean, position }));
    return { id: rows[0].id, name: rows[0].name, position: rows[0].position };
  }

  async function renameCategory({ id, name }) {
    checkUuid(id, 'Categoria inválida');
    const clean = cleanText(name, CATEGORY_MAX, 'Nome da categoria');
    await rest(`wa_categories?id=eq.${id}`, json('PATCH', 'return=minimal', { name: clean }));
    return true;
  }

  // Só apaga categoria vazia (no banco, apagar a categoria apagaria as mensagens dela)
  async function deleteCategory({ id }) {
    checkUuid(id, 'Categoria inválida');
    const items = await rest(`wa_items?select=id&category_id=eq.${id}&limit=1`);
    if (items.length) throw new Error('A categoria tem mensagens: mova ou exclua as mensagens antes');
    await rest(`wa_categories?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  const sanitizeFileName = (name) => String(name || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'arquivo';

  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Grava no bucket público wa-media (caminho <uuid>/<nome-sanitizado>), como o ERP
  async function uploadFile({ partType, base64, mime, fileName }) {
    const allowed = UPLOAD_MIME[partType];
    if (!allowed) throw new Error('Tipo de parte inválido');
    const m = typeof mime === 'string' ? mime.toLowerCase().split(';')[0].trim() : '';
    if (!allowed.includes(m)) throw new Error('Tipo de arquivo não aceito');
    if (typeof base64 !== 'string' || !base64) throw new Error('Arquivo vazio');
    if (base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) throw new Error('Arquivo acima de 40 MB');
    const bytes = fromBase64(base64);
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Arquivo acima de 40 MB');
    const { SUPABASE_URL } = cfg();
    const path = `${crypto.randomUUID()}/${sanitizeFileName(fileName)}`;
    const res = await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': m, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload falhou (${res.status}): ${text.slice(0, 120)}`);
    }
    return {
      file_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`,
      file_name: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 200) : 'arquivo',
      file_size: bytes.length,
    };
  }

  // ── Agendamentos (1.9.0): criados por um clique; enviados pelo executor do painel na hora marcada ──

  const SCHED_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  const SCHED_COLUMNS = 'id,chat_id,chat_name,item_id,body,send_at,status,error_code,sent_at,created_at';
  const SCHED_FINAL = ['enviada', 'falhou', 'cancelada', 'expirada'];
  const SCHED_MISSING = 'Atualize o banco para usar este recurso';

  async function schedRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (missingTable(err, 'wa_schedules')) throw new Error(SCHED_MISSING);
      throw err;
    }
  }

  // Pendentes (e "enviando") + últimos 3 dias; sem a tabela: { available: false }
  async function fetchSchedules() {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    try {
      const [pending, recent] = await Promise.all([
        schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=in.(pendente,enviando)&order=send_at.asc&limit=200`),
        schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=in.(${SCHED_FINAL.join(',')})&send_at=gte.${encodeURIComponent(since)}&order=send_at.desc&limit=100`),
      ]);
      return { available: true, pending, recent };
    } catch (err) {
      if (err.message === SCHED_MISSING) return { available: false, pending: [], recent: [] };
      throw err;
    }
  }

  async function createSchedule({ chat_id, chat_name, item_id, body, send_at }) {
    if (typeof chat_id !== 'string' || !SCHED_CHAT_RE.test(chat_id)) throw new Error('Conversa inválida (só conversas individuais)');
    const name = typeof chat_name === 'string' && chat_name.trim() ? chat_name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
    const hasItem = item_id !== undefined && item_id !== null;
    if (hasItem) checkUuid(item_id, 'Mensagem salva inválida');
    let text = null;
    if (!hasItem) {
      if (typeof body !== 'string' || !body.trim() || body.length > TEXT_MAX) throw new Error(`Mensagem: 1 a ${TEXT_MAX} caracteres`);
      text = body;
    }
    const when = Date.parse(send_at);
    if (typeof send_at !== 'string' || !Number.isFinite(when)) throw new Error('Data e hora inválidas');
    if (when < Date.now() - 60 * 1000) throw new Error('Escolha uma data e hora no futuro');
    if (when > Date.now() + 366 * 24 * 3600 * 1000) throw new Error('No máximo 1 ano para frente');
    const rows = await schedRest('wa_schedules', json('POST', 'return=representation', {
      chat_id, chat_name: name, item_id: hasItem ? item_id : null, body: text, send_at: new Date(when).toISOString(), status: 'pendente',
    }));
    return { id: rows[0].id };
  }

  // Só cancela se ainda estiver pendente
  async function cancelSchedule({ id }) {
    checkUuid(id, 'Agendamento inválido');
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'cancelada' }));
    return { cancelled: rows.length > 0 };
  }

  // Pendentes com horário vencido (mais antigos primeiro)
  async function dueSchedules() {
    const now = new Date().toISOString();
    return schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=eq.pendente&send_at=lte.${encodeURIComponent(now)}&order=send_at.asc&limit=20`);
  }

  // Reserva: só uma aba/PC consegue passar de 'pendente' para 'enviando' (o filtro status=eq.pendente garante)
  async function claimSchedule({ id }) {
    checkUuid(id, 'Agendamento inválido');
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'enviando' }));
    return rows.length ? rows[0] : null;
  }

  // Resultado final. 'expirada' só sai de 'pendente'; os outros, de 'enviando'.
  async function finishSchedule({ id, status, error_code }) {
    checkUuid(id, 'Agendamento inválido');
    if (!SCHED_FINAL.includes(status)) throw new Error('Status inválido');
    if (error_code != null && (typeof error_code !== 'string' || !/^[a-z_]{1,40}$/.test(error_code))) throw new Error('Código inválido');
    const from = status === 'expirada' ? 'pendente' : 'enviando';
    const patch = { status, error_code: error_code || null };
    if (status === 'enviada') patch.sent_at = new Date().toISOString();
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.${from}`, json('PATCH', 'return=representation', patch));
    return { updated: rows.length > 0 };
  }

  // ── Motor de envios (2.0.0-D1): configurações, trava, histórico e réguas (follows) ──
  // Tudo validado aqui. Sem as tabelas (migration 20261103130000): { available: false } ou
  // "Atualize o banco para usar este recurso".

  const ENGINE_MISSING = 'Atualize o banco para usar este recurso';
  const ENGINE_TABLES = ['wa_settings', 'wa_flows', 'wa_flow_variants', 'wa_send_log'];
  const CAMPAIGN_TABLES = ['wa_campaigns', 'wa_campaign_targets'];
  const SETTINGS_COLUMNS = 'id,paused_all,max_per_hour,max_per_day,min_interval_s,max_interval_s,business_start,business_end,business_days,runner_id,lease_until,updated_at';
  const RUNNER_RE = /^[a-z0-9]{4,40}$/;
  const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const SEND_SOURCES = ['follow', 'disparo', 'agendado'];
  const SEND_STATUS = ['enviando', 'enviado', 'falhou', 'pulado'];
  const REASON_MAX = 60;

  // Tabela que não existe: o PostgREST responde 404 (PGRST205) ou 400/42P01
  const tableMissing = (err, tables) => /^Supabase (400|404):/.test(err.message)
    && (tables.some((t) => new RegExp(`\\b${t}\\b`).test(err.message)) || /^Supabase 404:/.test(err.message));

  async function engineRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, ENGINE_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // Colunas/tabelas novas: "sim" fica guardado; "não" é testado de novo depois de 5 min
  const probeCache = new Map();
  async function probe(key, fn) {
    const hit = probeCache.get(key);
    if (hit && (hit.value || Date.now() - hit.at < 5 * 60 * 1000)) return hit.value;
    let value = false;
    try { value = await fn(); } catch { value = false; }
    probeCache.set(key, { value, at: Date.now() });
    return value;
  }
  const chatIdColumn = () => probe('wa_contacts.chat_id', () => hasColumn('wa_contacts', 'chat_id'));
  const campaignsTables = () => probe('campaigns', async () => {
    try {
      await rest('wa_campaigns?select=id&limit=1');
      await rest('wa_campaign_targets?select=id&limit=1');
      return true;
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) return false;
      throw err;
    }
  });

  // Grava o id da conversa do contato (quando a extensão sabe e a coluna existe)
  async function rememberChatId(contact, chatId) {
    if (!contact || !chatId || contact.chat_id === chatId) return;
    if (!(await chatIdColumn())) return;
    await rest(`wa_contacts?id=eq.${contact.id}`, json('PATCH', 'return=minimal', { chat_id: chatId }));
  }

  async function getEngineSettings() {
    let rows;
    try {
      rows = await rest(`wa_settings?select=${SETTINGS_COLUMNS}&id=eq.1`);
    } catch (err) {
      if (tableMissing(err, ['wa_settings'])) return { available: false };
      throw err;
    }
    if (!rows.length) {
      await rest('wa_settings?on_conflict=id', json('POST', 'resolution=ignore-duplicates,return=minimal', { id: 1 }));
      rows = await rest(`wa_settings?select=${SETTINGS_COLUMNS}&id=eq.1`);
    }
    if (!rows.length) return { available: false };
    return { available: true, settings: rows[0], campaigns: await campaignsTables() };
  }

  const hmOf = (v) => String(v || '').slice(0, 5);

  async function updateEngineSettings(patch) {
    const p = patch || {};
    const out = {};
    if (p.paused_all !== undefined) {
      if (typeof p.paused_all !== 'boolean') throw new Error('Valor inválido');
      out.paused_all = p.paused_all;
    }
    if (p.max_per_hour !== undefined) out.max_per_hour = intIn(p.max_per_hour, 1, 200, 'Envios por hora');
    if (p.max_per_day !== undefined) out.max_per_day = intIn(p.max_per_day, 1, 2000, 'Envios por dia');
    if (p.min_interval_s !== undefined) out.min_interval_s = intIn(p.min_interval_s, 10, 3600, 'Intervalo mínimo (s)');
    if (p.max_interval_s !== undefined) out.max_interval_s = intIn(p.max_interval_s, 10, 3600, 'Intervalo máximo (s)');
    if (p.business_start !== undefined) {
      if (!HM_RE.test(p.business_start)) throw new Error('Início do expediente inválido');
      out.business_start = p.business_start;
    }
    if (p.business_end !== undefined) {
      if (!HM_RE.test(p.business_end)) throw new Error('Fim do expediente inválido');
      out.business_end = p.business_end;
    }
    if (p.business_days !== undefined) {
      const days = Array.isArray(p.business_days) ? [...new Set(p.business_days)] : null;
      if (!days || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Escolha pelo menos um dia');
      out.business_days = days.sort((a, b) => a - b);
    }
    if (!Object.keys(out).length) throw new Error('Nada para mudar');
    const current = (await getEngineSettings());
    if (!current.available) throw new Error(ENGINE_MISSING);
    const merged = { ...current.settings, ...out };
    if (merged.min_interval_s > merged.max_interval_s) throw new Error('O intervalo mínimo não pode passar do máximo');
    if (hmOf(merged.business_start) >= hmOf(merged.business_end)) throw new Error('O expediente precisa terminar depois de começar');
    const rows = await engineRest(`wa_settings?id=eq.1&select=${SETTINGS_COLUMNS}`,
      json('PATCH', 'return=representation', { ...out, updated_at: new Date().toISOString() }));
    return { settings: rows[0] };
  }

  // Trava: só assume se ninguém tem, se venceu, ou se já é nossa
  async function claimLease({ runnerId, ttlS }) {
    if (typeof runnerId !== 'string' || !RUNNER_RE.test(runnerId)) throw new Error('Identificador inválido');
    const ttl = intIn(ttlS, 30, 120, 'Tempo da trava');
    const now = new Date();
    const nowIso = now.toISOString();
    const until = new Date(now.getTime() + ttl * 1000).toISOString();
    const cond = encodeURIComponent(`(lease_until.is.null,lease_until.lt."${nowIso}",runner_id.eq."${runnerId}")`);
    const rows = await engineRest(`wa_settings?id=eq.1&or=${cond}&select=runner_id,lease_until`,
      json('PATCH', 'return=representation', { runner_id: runnerId, lease_until: until }));
    if (rows.length && rows[0].runner_id === runnerId) return { held: true, lease_until: rows[0].lease_until };
    const cur = await engineRest('wa_settings?id=eq.1&select=lease_until');
    return { held: false, lease_until: cur.length ? cur[0].lease_until : null };
  }

  async function countRows2(path) {
    try {
      return await countRows(path);
    } catch (err) {
      if (/^Supabase 40[04]/.test(err.message)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // Envios que contam nos limites: tudo menos 'pulado'
  async function sendCounts({ hourSince, daySince }) {
    const h = Date.parse(hourSince);
    const d = Date.parse(daySince);
    if (!Number.isFinite(h) || !Number.isFinite(d)) throw new Error('Data inválida');
    const base = 'wa_send_log?status=neq.pulado&created_at=gte.';
    const [hour, day] = await Promise.all([
      countRows2(base + encodeURIComponent(new Date(h).toISOString())),
      countRows2(base + encodeURIComponent(new Date(d).toISOString())),
    ]);
    return { hour, day };
  }

  // Momento do último envio (para respeitar o intervalo depois de recarregar a página)
  async function lastSendAt() {
    const rows = await engineRest('wa_send_log?select=created_at&status=neq.pulado&order=created_at.desc&limit=1');
    return { at: rows.length ? rows[0].created_at : null };
  }

  const optUuid = (v, what) => {
    if (v === undefined || v === null) return null;
    return checkUuid(v, what);
  };
  const cleanReason = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, REASON_MAX) : null);

  async function logSend({ source, source_id, contact_id, chat_id, item_id, status, reason }) {
    if (!SEND_SOURCES.includes(source)) throw new Error('Origem inválida');
    if (!SEND_STATUS.includes(status)) throw new Error('Status inválido');
    const chat = chat_id == null ? null : (typeof chat_id === 'string' && SCHED_CHAT_RE.test(chat_id) ? chat_id : null);
    const rows = await engineRest('wa_send_log', json('POST', 'return=representation', {
      source, source_id: optUuid(source_id, 'Origem inválida'), contact_id: optUuid(contact_id, 'Contato inválido'),
      chat_id: chat, item_id: optUuid(item_id, 'Mensagem inválida'), status, reason: cleanReason(reason),
    }));
    return { id: rows[0].id };
  }

  async function finishSendLog({ id, status, reason }) {
    checkUuid(id, 'Registro inválido');
    if (!SEND_STATUS.includes(status) || status === 'enviando') throw new Error('Status inválido');
    await engineRest(`wa_send_log?id=eq.${id}&status=eq.enviando`, json('PATCH', 'return=minimal', { status, reason: cleanReason(reason) }));
    return true;
  }

  const phoneOfChat = (chatId) => {
    const m = /^(\d{8,15})@c\.us$/.exec(chatId || '');
    return m ? m[1] : null;
  };

  // Contatos de um lote de conversas: { chatId: { id, name } } (por chat_id ou telefone)
  async function contactsByChats(chatIds) {
    const out = {};
    const ids = [...new Set(chatIds.filter((c) => typeof c === 'string' && SCHED_CHAT_RE.test(c)))];
    if (!ids.length) return out;
    const hasCol = await chatIdColumn();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      if (hasCol) {
        const rows = await rest(`wa_contacts?select=id,name,chat_id&chat_id=in.${inList(part)}`);
        rows.forEach((r) => { out[r.chat_id] = { id: r.id, name: r.name }; });
      }
      const phones = part.filter((c) => !out[c]).map(phoneOfChat).filter(Boolean);
      if (phones.length) {
        const rows = await rest(`wa_contacts?select=id,name,phone&phone=in.${inList(phones)}`);
        rows.forEach((r) => { out[`${r.phone}@c.us`] = out[`${r.phone}@c.us`] || { id: r.id, name: r.name }; });
      }
    }
    return out;
  }

  // Contato da conversa e se ele tem a etiqueta (ex.: "Não enviar")
  async function chatContact({ chatId, labelId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const found = (await contactsByChats([chatId]))[chatId];
    if (!found) return { contactId: null, hasLabel: false };
    if (!labelId) return { contactId: found.id, hasLabel: false };
    checkUuid(labelId);
    const rows = await rest(`wa_contact_labels?select=label_id&contact_id=eq.${found.id}&label_id=eq.${labelId}`);
    return { contactId: found.id, hasLabel: rows.length > 0 };
  }

  // Últimos envios automáticos com o nome do contato (só para a tela)
  async function fetchSendLog({ limit = 50 } = {}) {
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const rows = await engineRest(`wa_send_log?select=id,source,contact_id,chat_id,status,reason,created_at&order=created_at.desc&limit=${lim}`);
    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
    const names = {};
    for (let i = 0; i < contactIds.length; i += 100) {
      const got = await rest(`wa_contacts?select=id,name,phone&id=in.${inList(contactIds.slice(i, i + 100))}`);
      got.forEach((c) => { names[c.id] = c.name || c.phone || null; });
    }
    const byChat = await contactsByChats(rows.filter((r) => !r.contact_id && r.chat_id).map((r) => r.chat_id));
    return rows.map((r) => ({
      id: r.id, source: r.source, status: r.status, reason: r.reason, created_at: r.created_at,
      name: (r.contact_id && names[r.contact_id]) || (r.chat_id && byChat[r.chat_id] && byChat[r.chat_id].name) || null,
    }));
  }

  // Etiqueta CRM "Não enviar" (cinza): cria se não existir
  const NO_SEND = 'Não enviar';
  const noSendKey = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  async function ensureNoSendLabel() {
    const find = async () => (await rest('wa_labels?select=id,name')).find((l) => noSendKey(l.name) === noSendKey(NO_SEND));
    const found = await find();
    if (found) return { id: found.id, created: false };
    try {
      const l = await createLabel({ name: NO_SEND, color: '#6b7280' });
      return { id: l.id, created: true };
    } catch (err) {
      const again = await find(); // outra aba criou ao mesmo tempo
      if (again) return { id: again.id, created: false };
      throw err;
    }
  }

  // ── Réguas (wa_flows + wa_flow_variants) ──

  const FLOW_COLUMNS = 'id,name,active,label_id,wait_minutes,item_id,next_label_id,reply_label_id,ignore_older_days,position,created_at';
  const VARIANT_COLUMNS = 'id,flow_id,position,condition,label_id,ad_keyword,item_id';

  async function fetchFlows() {
    const [flows, variants] = await Promise.all([
      engineRest(`wa_flows?select=${FLOW_COLUMNS}&order=position.asc,created_at.asc`),
      engineRest(`wa_flow_variants?select=${VARIANT_COLUMNS}&order=flow_id.asc,position.asc&limit=10000`),
    ]);
    return flows.map((f) => ({ ...f, variants: variants.filter((v) => v.flow_id === f.id).sort((a, b) => a.position - b.position) }));
  }

  function checkVariant(v, i) {
    const n = i + 1;
    if (!v || typeof v !== 'object' || !['etiqueta', 'anuncio'].includes(v.condition)) throw new Error(`Variante ${n}: condição inválida`);
    const item_id = checkUuid(v.item_id, `Variante ${n}: escolha a mensagem`);
    if (v.condition === 'etiqueta') return { condition: 'etiqueta', label_id: checkUuid(v.label_id, `Variante ${n}: escolha a etiqueta`), ad_keyword: null, item_id };
    const kw = typeof v.ad_keyword === 'string' ? v.ad_keyword.trim().replace(/\s+/g, ' ') : '';
    if (!kw || kw.length > 60) throw new Error(`Variante ${n}: palavra do anúncio de 1 a 60 caracteres`);
    return { condition: 'anuncio', label_id: null, ad_keyword: kw, item_id };
  }

  async function saveFlow(input) {
    const f = input || {};
    if (f.id !== undefined && f.id !== null) checkUuid(f.id, 'Régua inválida');
    const row = {
      name: cleanText(f.name, 60, 'Nome da régua'),
      active: f.active === true,
      label_id: checkUuid(f.label_id, 'Escolha a etiqueta de entrada'),
      wait_minutes: intIn(f.wait_minutes, 1, 43200, 'Espera (minutos)'),
      item_id: optUuid(f.item_id, 'Mensagem inválida'),
      next_label_id: optUuid(f.next_label_id, 'Etiqueta inválida'),
      reply_label_id: optUuid(f.reply_label_id, 'Etiqueta inválida'),
      ignore_older_days: intIn(f.ignore_older_days ?? 15, 1, 365, 'Ignorar conversas paradas há (dias)'),
    };
    if (row.next_label_id === row.label_id || row.reply_label_id === row.label_id) throw new Error('A etiqueta de saída precisa ser diferente da de entrada');
    const variants = Array.isArray(f.variants) ? f.variants : [];
    if (variants.length > 10) throw new Error('No máximo 10 variantes');
    const list = variants.map(checkVariant);
    if (!row.item_id && !list.length) throw new Error('Escolha a mensagem (padrão ou uma variante)');
    let id = f.id;
    if (id) {
      const rows = await engineRest(`wa_flows?id=eq.${id}`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Régua não encontrada');
    } else {
      const last = await engineRest('wa_flows?select=position&order=position.desc&limit=1');
      const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
      const rows = await engineRest('wa_flows', json('POST', 'return=representation', { ...row, position }));
      id = rows[0].id;
    }
    await engineRest(`wa_flow_variants?flow_id=eq.${id}`, { method: 'DELETE' });
    if (list.length) {
      await engineRest('wa_flow_variants', json('POST', 'return=minimal', list.map((v, i) => ({ ...v, flow_id: id, position: i }))));
    }
    return { id };
  }

  async function setFlowActive({ id, active }) {
    checkUuid(id, 'Régua inválida');
    if (typeof active !== 'boolean') throw new Error('Valor inválido');
    const rows = await engineRest(`wa_flows?id=eq.${id}`, json('PATCH', 'return=representation', { active }));
    return { active: rows.length ? rows[0].active : null };
  }

  async function deleteFlow({ id }) {
    checkUuid(id, 'Régua inválida');
    await engineRest(`wa_flows?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Contatos com qualquer uma das etiquetas de entrada, com TODAS as etiquetas CRM de cada um
  async function flowCandidates({ labelIds }) {
    if (!Array.isArray(labelIds) || !labelIds.length || labelIds.length > 50) throw new Error('Lista inválida');
    labelIds.forEach((l) => checkUuid(l));
    const cols = (await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone';
    const rows = await rest(`wa_contact_labels?select=contact_id,contact:wa_contacts!inner(${cols})&label_id=in.${inList(labelIds)}&limit=5000`);
    const byId = new Map();
    rows.forEach((r) => {
      if (r.contact && !byId.has(r.contact.id)) byId.set(r.contact.id, { id: r.contact.id, name: r.contact.name || null, phone: r.contact.phone || null, chat_id: r.contact.chat_id || null, labelIds: [] });
    });
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      const links = await rest(`wa_contact_labels?select=contact_id,label_id&contact_id=in.${inList(ids.slice(i, i + 100))}&limit=10000`);
      links.forEach((l) => { const c = byId.get(l.contact_id); if (c) c.labelIds.push(l.label_id); });
    }
    return [...byId.values()];
  }

  async function contactLabelIds({ contactId }) {
    checkUuid(contactId, 'Contato inválido');
    return labelIdsOf(contactId);
  }

  // Reserva do follow: só quem apagar a ligação contato↔etiqueta da régua envia
  async function followReserve({ contactId, labelId }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(labelId);
    const rows = await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${labelId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    return { reserved: Array.isArray(rows) && rows.length > 0 };
  }

  async function followAdd({ contactId, labelId }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(labelId);
    await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
      { contact_id: contactId, label_id: labelId }));
    return true;
  }

  async function followMove({ contactId, fromLabelId, toLabelId }) {
    checkUuid(fromLabelId);
    checkUuid(toLabelId);
    if (fromLabelId === toLabelId) throw new Error('Mesma etiqueta');
    const r = await followReserve({ contactId, labelId: fromLabelId });
    if (!r.reserved) return { moved: false };
    await followAdd({ contactId, labelId: toLabelId });
    return { moved: true };
  }

  root.WaApi = {
    getEngineSettings, updateEngineSettings, claimLease, sendCounts, lastSendAt, logSend, finishSendLog, fetchSendLog,
    chatContact, ensureNoSendLabel, fetchFlows, saveFlow, setFlowActive, deleteFlow, flowCandidates, contactLabelIds,
    followReserve, followAdd, followMove, ENGINE_MISSING,
    fetchSchedules, createSchedule, cancelSchedule, dueSchedules, claimSchedule, finishSchedule,
    saveItem, deleteItem, createCategory, renameCategory, deleteCategory, uploadFile, partsTableExists,
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel,
    fetchLabelCounts, fetchLabelClients,
    PALETTE, fetchSchema, createLabel, updateLabel, deleteLabel, reorderLabels,
    getContactNote, setContactNote, bulkAddContactsToLabel, moveContactLabel, fetchAllLabelClients,
  };
})(globalThis);
