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

  async function restRaw(path, init = {}) {
    const { SUPABASE_URL } = cfg();
    const res = await supaFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  // 2.4.1 (desempenho): duas leituras iguais ao mesmo tempo viram uma só (inclusive de abas
  // diferentes, porque tudo passa por este background) e as listas que mudam pouco (etiquetas,
  // biblioteca, configurações) ficam 45 s em memória. Qualquer gravação limpa a memória.
  const READ_CACHE_MS = 45 * 1000;
  const CACHED_READ = /^(wa_labels|wa_categories|wa_items|wa_item_parts|wa_settings|system_config)\?/;
  const readCache = new Map();
  const inflight = new Map();
  const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function clearReadCache() { readCache.clear(); }

  async function rest(path, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' || init.body !== undefined) {
      readCache.clear();
      try { return await restRaw(path, init); } finally { readCache.clear(); }
    }
    const hit = readCache.get(path);
    if (hit && Date.now() - hit.at < READ_CACHE_MS) return copy(hit.data);
    let p = inflight.get(path);
    if (!p) {
      p = restRaw(path, init).then((data) => {
        if (CACHED_READ.test(path)) readCache.set(path, { data, at: Date.now() });
        return data;
      }).finally(() => inflight.delete(path));
      inflight.set(path, p);
    }
    return copy(await p);
  }

  // Todas as linhas, em páginas de 1000 (o Supabase corta cada resposta em 1000). path com order.
  async function restAll(path, max = 50000) {
    const out = [];
    for (let off = 0; off < max; off += 1000) {
      const rows = await rest(`${path}&limit=1000&offset=${off}`);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  const ITEM_COLUMNS = 'id,category_id,type,title,body,file_url,file_name,file_size,usage_count,position,created_at';
  const ITEM_ORDER = 'order=position.asc,created_at.asc';

  // Pede também record_seconds; se a coluna ainda não existe no banco (erro 400), busca sem ela
  // 2.1.0: pede também as etiquetas "ao enviar"; sem essas colunas (migration 20261103150000) busca sem elas
  const ON_SEND_COLUMNS = 'on_send_add_label_id,on_send_remove_label_id';
  // 2.7.1: etiquetas do WhatsApp "ao enviar" (migration 20261105120000); sem elas, busca sem
  const ON_SEND_WA_COLUMNS = 'on_send_add_wa_label_id,on_send_remove_wa_label_id';
  // Coluna opcional que o banco disser que não existe sai da consulta, e tenta de novo
  async function fetchItems() {
    let optional = ['record_seconds', ...ON_SEND_COLUMNS.split(','), ...ON_SEND_WA_COLUMNS.split(',')];
    // cada par "ao enviar" (CRM, WhatsApp) vem junto na sua migration
    const group = (c) => (c.startsWith('on_send_') ? (c.includes('_wa_') ? 'on_send_wa' : 'on_send_crm') : c);
    for (;;) {
      try {
        return await rest(`wa_items?select=${[ITEM_COLUMNS, ...optional].join(',')}&${ITEM_ORDER}`);
      } catch (err) {
        const gone = /^Supabase 400:/.test(err.message) ? optional.filter((c) => new RegExp(`\\b${c}\\b`).test(err.message)) : [];
        if (!gone.length) throw err;
        optional = optional.filter((c) => !gone.some((g) => group(g) === group(c)));
      }
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
  const countInflight = new Map();
  function countRows(path) {
    let p = countInflight.get(path);
    if (!p) {
      p = countRowsRaw(path).finally(() => countInflight.delete(path));
      countInflight.set(path, p);
    }
    return p;
  }

  async function countRowsRaw(path) {
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
  const WA_LABEL_ID_RE = /^[\w.:@-]{1,40}$/;
  const waLabelId = (v) => {
    if (v == null || v === '') return null;
    const s = String(v);
    if (!WA_LABEL_ID_RE.test(s)) throw new Error('Etiqueta do WhatsApp inválida');
    return s;
  };

  async function saveItem({ id, category_id, title, parts, on_send_add_label_id, on_send_remove_label_id, on_send_add_wa_label_id, on_send_remove_wa_label_id }) {
    if (id !== undefined && id !== null) checkUuid(id, 'Item inválido');
    checkUuid(category_id, 'Categoria inválida');
    const cleanTitle = cleanText(title, TITLE_MAX, 'Título');
    if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS) throw new Error(`De 1 a ${MAX_PARTS} partes`);
    const list = parts.map(checkPart);
    // 2.1.0: etiquetas CRM "ao enviar" (opcionais; só gravadas se as colunas existirem)
    const addLabel = on_send_add_label_id == null || on_send_add_label_id === '' ? null : checkUuid(on_send_add_label_id, 'Etiqueta inválida');
    const removeLabel = on_send_remove_label_id == null || on_send_remove_label_id === '' ? null : checkUuid(on_send_remove_label_id, 'Etiqueta inválida');
    if (addLabel && addLabel === removeLabel) throw new Error('Escolha etiquetas diferentes para colocar e tirar');
    const wantsLabels = on_send_add_label_id !== undefined || on_send_remove_label_id !== undefined;
    const labelCols = wantsLabels && (await probe('wa_items.on_send', () => hasColumn('wa_items', 'on_send_add_label_id')));
    if ((addLabel || removeLabel) && !labelCols) throw new Error('Atualize o banco para usar este recurso');
    // 2.7.1: etiquetas do WhatsApp "ao enviar" (id como texto; só gravadas se as colunas existirem)
    const addWa = waLabelId(on_send_add_wa_label_id);
    const removeWa = waLabelId(on_send_remove_wa_label_id);
    if (addWa && addWa === removeWa) throw new Error('Escolha etiquetas do WhatsApp diferentes para colocar e tirar');
    const wantsWa = on_send_add_wa_label_id !== undefined || on_send_remove_wa_label_id !== undefined;
    const waCols = wantsWa && (await probe('wa_items.on_send_wa', () => hasColumn('wa_items', 'on_send_add_wa_label_id')));
    if ((addWa || removeWa) && !waCols) throw new Error('Atualize o banco para usar este recurso');
    const hasTable = await partsTableExists();
    if (!hasTable && list.length > 1) throw new Error(PARTS_MISSING);
    const first = list[0];
    const fields = {
      category_id, title: cleanTitle, type: first.type, body: first.body,
      file_url: first.file_url, file_name: first.file_name, file_size: first.file_size,
      ...(labelCols ? { on_send_add_label_id: addLabel, on_send_remove_label_id: removeLabel } : {}),
      ...(waCols ? { on_send_add_wa_label_id: addWa, on_send_remove_wa_label_id: removeWa } : {}),
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
    return storeBytes(bytes, m, fileName);
  }

  // Grava os bytes no bucket wa-media (o mesmo upload de sempre) e devolve o endereço público
  async function storeBytes(bytes, m, fileName) {
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

  // ── 2.7.0: Biblioteca de mídias (wa_media_folders + wa_media; migration 20261105090000) ──
  // Os arquivos ficam no mesmo bucket wa-media. sha256 (calculado aqui, dos bytes) evita subir o mesmo
  // arquivo duas vezes. Sem as tabelas: "Atualize o banco para usar este recurso".
  const MEDIA_TABLES = ['wa_media', 'wa_media_folders'];
  const MEDIA_TYPES = ['imagem', 'video', 'audio', 'documento'];
  const MB = 1024 * 1024;
  const MEDIA_LIMITS = { imagem: 5 * MB, audio: 16 * MB, video: 16 * MB, documento: 20 * MB };
  const MEDIA_COLS = 'id,folder_id,type,title,caption,file_url,file_name,file_size,mime,sha256,usage_count,position,created_at';
  const MEDIA_QUOTA_BYTES = 1024 * MB; // 1 GB (só para o aviso de espaço)

  async function mediaRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, MEDIA_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }
  async function mediaRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, MEDIA_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function sha256Of(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const mediaTitleOf = (fileName) => String(fileName || 'arquivo').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo';

  async function fetchMediaLibrary() {
    const [folders, media] = await Promise.all([
      mediaRestAll('wa_media_folders?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      mediaRestAll(`wa_media?select=${MEDIA_COLS}&order=created_at.desc,id.asc`),
    ]);
    const used = media.reduce((sum, m) => sum + (Number(m.file_size) || 0), 0);
    return { folders, media, used, quota: MEDIA_QUOTA_BYTES };
  }

  async function createMediaFolder({ name }) {
    const n = cleanText(name, 60, 'Nome da pasta');
    const last = await mediaRest('wa_media_folders?select=position&order=position.desc&limit=1');
    const rows = await mediaRest('wa_media_folders', json('POST', 'return=representation', { name: n, position: last.length ? (Number(last[0].position) || 0) + 1 : 0 }));
    return rows[0];
  }
  async function renameMediaFolder({ id, name }) {
    checkUuid(id, 'Pasta inválida');
    await mediaRest(`wa_media_folders?id=eq.${id}`, json('PATCH', 'return=minimal', { name: cleanText(name, 60, 'Nome da pasta') }));
    return true;
  }
  // Apagar a pasta não apaga as mídias: elas ficam "sem pasta" (on delete set null)
  async function deleteMediaFolder({ id }) {
    checkUuid(id, 'Pasta inválida');
    await mediaRest(`wa_media?folder_id=eq.${id}`, json('PATCH', 'return=minimal', { folder_id: null }));
    await mediaRest(`wa_media_folders?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }
  async function reorderMediaFolders({ ids }) {
    if (!Array.isArray(ids) || ids.length > 200) throw new Error('Lista inválida');
    for (let i = 0; i < ids.length; i++) {
      checkUuid(ids[i], 'Pasta inválida');
      await mediaRest(`wa_media_folders?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { position: i }));
    }
    return true;
  }

  // Sobe um arquivo para a biblioteca. Mesmo arquivo (sha256) já salvo: não sobe de novo e devolve o que existe.
  // enforceLimits=false: arquivo vindo do editor de mensagens (vale o limite de sempre, 40 MB).
  async function uploadMedia({ type, base64, mime, fileName, title, caption, folderId, enforceLimits = true }) {
    if (!MEDIA_TYPES.includes(type)) throw new Error('Tipo de mídia inválido');
    const m = typeof mime === 'string' ? mime.toLowerCase().split(';')[0].trim() : '';
    if (!UPLOAD_MIME[type].includes(m)) throw new Error('Tipo de arquivo não aceito');
    if (typeof base64 !== 'string' || !base64) throw new Error('Arquivo vazio');
    const limit = enforceLimits === false ? MAX_FILE_BYTES : MEDIA_LIMITS[type];
    if (base64.length > Math.ceil(limit / 3) * 4 + 4) throw new Error(`Arquivo acima de ${Math.round(limit / MB)} MB`);
    const bytes = fromBase64(base64);
    if (!bytes.length) throw new Error('Arquivo vazio');
    if (bytes.length > limit) throw new Error(`Arquivo acima de ${Math.round(limit / MB)} MB`);
    const folder = folderId == null || folderId === '' ? null : checkUuid(folderId, 'Pasta inválida');
    const sha = await sha256Of(bytes);
    const same = await mediaRest(`wa_media?select=${MEDIA_COLS}&sha256=eq.${sha}`);
    if (same.length) return { duplicate: true, media: same[0] };
    const file = await storeBytes(bytes, m, fileName);
    const last = await mediaRest('wa_media?select=position&order=position.desc&limit=1');
    const row = {
      folder_id: folder, type, title: title ? cleanText(title, 120, 'Título') : mediaTitleOf(file.file_name), caption: clip(caption, 4096),
      file_url: file.file_url, file_name: file.file_name, file_size: file.file_size, mime: m, sha256: sha, usage_count: 0,
      position: last.length ? (Number(last[0].position) || 0) + 1 : 0,
    };
    try {
      const rows = await mediaRest('wa_media', json('POST', 'return=representation', row));
      return { duplicate: false, media: rows[0] };
    } catch (err) {
      // Outra aba subiu o mesmo arquivo no mesmo instante (índice único do sha256)
      if (/^Supabase 409:/.test(err.message)) {
        const again = await mediaRest(`wa_media?select=${MEDIA_COLS}&sha256=eq.${sha}`);
        if (again.length) return { duplicate: true, media: again[0] };
      }
      throw err;
    }
  }

  async function updateMedia({ id, title, caption, folderId }) {
    checkUuid(id, 'Mídia inválida');
    const patch = {};
    if (title !== undefined) patch.title = cleanText(title, 120, 'Título');
    if (caption !== undefined) patch.caption = typeof caption === 'string' && caption.trim() ? caption.slice(0, 4096) : null;
    if (folderId !== undefined) patch.folder_id = folderId == null || folderId === '' ? null : checkUuid(folderId, 'Pasta inválida');
    if (!Object.keys(patch).length) throw new Error('Nada para mudar');
    const rows = await mediaRest(`wa_media?id=eq.${id}`, json('PATCH', 'return=representation', patch));
    if (!rows.length) throw new Error('Mídia não encontrada');
    return rows[0];
  }

  async function incrementMediaUsage({ id }) {
    checkUuid(id, 'Mídia inválida');
    const rows = await mediaRest(`wa_media?select=usage_count&id=eq.${id}`);
    if (!rows.length) return 0;
    const n = (Number(rows[0].usage_count) || 0) + 1;
    await mediaRest(`wa_media?id=eq.${id}`, json('PATCH', 'return=minimal', { usage_count: n }));
    return n;
  }

  // Onde o arquivo está em uso: mensagens rápidas (item ou parte), disparos (mensagem exclusiva) e
  // automações que enviam essas mensagens rápidas
  async function mediaUsage({ id }) {
    checkUuid(id, 'Mídia inválida');
    const rows = await mediaRest(`wa_media?select=id,file_url&id=eq.${id}`);
    if (!rows.length) throw new Error('Mídia não encontrada');
    const url = rows[0].file_url;
    const enc = encodeURIComponent(url);
    const itemIds = new Set();
    (await rest(`wa_items?select=id&file_url=eq.${enc}`)).forEach((r) => itemIds.add(r.id));
    try { (await rest(`wa_item_parts?select=item_id&file_url=eq.${enc}`)).forEach((r) => itemIds.add(r.item_id)); } catch (err) { if (!missingTable(err, 'wa_item_parts')) throw err; }
    const items = itemIds.size ? await rest(`wa_items?select=id,title&id=in.${inList([...itemIds])}`) : [];
    let campaigns = [];
    if ((await campaignsTables()) && (await campaignsV2())) {
      campaigns = await rest(`wa_campaigns?select=id,name&parts=cs.${encodeURIComponent(JSON.stringify([{ file_url: url }]))}`);
    }
    let automations = [];
    if (itemIds.size && (await automationTables())) {
      const all = await autoRestAll(`wa_automations?select=id,name,actions&order=id.asc`);
      automations = all.filter((a) => [...itemIds].some((iid) => JSON.stringify(a.actions || []).includes(iid))).map((a) => ({ id: a.id, name: a.name }));
    }
    return {
      inUse: items.length + campaigns.length + automations.length > 0,
      items: items.map((x) => x.title), campaigns: campaigns.map((x) => x.name), automations: automations.map((x) => x.name),
    };
  }

  // Apagar: só se nada estiver usando. O arquivo sai do bucket se nenhuma outra mídia apontar para ele.
  async function deleteMedia({ id }) {
    const usage = await mediaUsage({ id });
    if (usage.inUse) return { deleted: false, usage };
    const rows = await mediaRest(`wa_media?select=id,file_url&id=eq.${id}`);
    if (!rows.length) return { deleted: true };
    const url = rows[0].file_url;
    await mediaRest(`wa_media?id=eq.${id}`, { method: 'DELETE' });
    const others = await mediaRest(`wa_media?select=id&file_url=eq.${encodeURIComponent(url)}&limit=1`);
    if (!others.length && isAllowedFileUrl(url)) {
      const { SUPABASE_URL } = cfg();
      const path = url.slice(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`.length);
      try { await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE' }); } catch { /* o registro já saiu; o arquivo fica */ }
    }
    return { deleted: true };
  }

  // Importa as mídias que já estão nas mensagens rápidas (sem subir de novo: mesmo file_url; sha256 vazio).
  // Não muda nada nas mensagens.
  const MIME_OF_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', pdf: 'application/pdf' };
  async function importMediaFromItems() {
    const have = new Set((await mediaRestAll('wa_media?select=file_url&order=id.asc')).map((r) => r.file_url));
    const items = await restAll('wa_items?select=id,title,type,file_url,file_name,file_size&order=id.asc');
    const titleOf = new Map(items.map((i) => [i.id, i.title]));
    const found = [];
    items.forEach((i) => { if (MEDIA_TYPES.includes(i.type) && i.file_url) found.push({ type: i.type, file_url: i.file_url, file_name: i.file_name, file_size: i.file_size, title: i.title, caption: null }); });
    try {
      const parts = await restAll('wa_item_parts?select=id,item_id,type,body,file_url,file_name,file_size,position&file_url=not.is.null&order=id.asc');
      parts.forEach((p) => { if (MEDIA_TYPES.includes(p.type) && p.file_url) found.push({ type: p.type, file_url: p.file_url, file_name: p.file_name, file_size: p.file_size, title: titleOf.get(p.item_id) || p.file_name, caption: p.type === 'audio' ? null : p.body || null }); });
    } catch (err) { if (!missingTable(err, 'wa_item_parts')) throw err; }
    const rows = [];
    const seen = new Set(have);
    found.forEach((f) => {
      if (!isAllowedFileUrl(f.file_url) || seen.has(f.file_url)) return;
      seen.add(f.file_url);
      const ext = String(f.file_name || f.file_url).split('.').pop().toLowerCase();
      rows.push({
        folder_id: null, type: f.type, title: mediaTitleOf(f.title || f.file_name), caption: f.caption ? String(f.caption).slice(0, 4096) : null,
        file_url: f.file_url, file_name: f.file_name ? String(f.file_name).slice(0, 200) : null, file_size: Number.isFinite(Number(f.file_size)) ? Number(f.file_size) : null,
        mime: MIME_OF_EXT[ext] || null, sha256: null, usage_count: 0, position: 0,
      });
    });
    for (let i = 0; i < rows.length; i += 200) await mediaRest('wa_media', json('POST', 'return=minimal', rows.slice(i, i + 200)));
    return { added: rows.length, already: found.length - rows.length };
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
  async function probe(key, fn, retryMs = 5 * 60 * 1000) {
    const hit = probeCache.get(key);
    if (hit && (hit.value || Date.now() - hit.at < retryMs)) return hit.value;
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
    const campaigns = await campaignsTables();
    return {
      available: true, settings: rows[0], campaigns, campaignsV2: campaigns && (await campaignsV2()), automations: await automationTables(),
      salesOrigin: await salesOrigin(),
      automationsV25: await automationsV25(),
    };
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
    const ttl = intIn(ttlS, 30, 300, 'Tempo da trava');
    const now = new Date();
    const nowIso = now.toISOString();
    const until = new Date(now.getTime() + ttl * 1000).toISOString();
    const cond = encodeURIComponent(`(lease_until.is.null,lease_until.lt."${nowIso}",runner_id.eq."${runnerId}")`);
    // 2.4.1: a renovação devolve as configurações (o motor não precisa lê-las de novo) e, sem a
    // trava, não faz a segunda leitura
    const rows = await engineRest(`wa_settings?id=eq.1&or=${cond}&select=${SETTINGS_COLUMNS}`,
      json('PATCH', 'return=representation', { runner_id: runnerId, lease_until: until }));
    if (rows.length && rows[0].runner_id === runnerId) return { held: true, lease_until: rows[0].lease_until, settings: rows[0] };
    return { held: false, lease_until: null };
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
      engineRest(`wa_flow_variants?select=${VARIANT_COLUMNS}&order=flow_id.asc,position.asc,id.asc&limit=1000`),
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
    const rows = await restAll(`wa_contact_labels?select=contact_id,contact:wa_contacts!inner(${cols})&label_id=in.${inList(labelIds)}&order=contact_id.asc,label_id.asc`, 5000);
    const byId = new Map();
    rows.forEach((r) => {
      if (r.contact && !byId.has(r.contact.id)) byId.set(r.contact.id, { id: r.contact.id, name: r.contact.name || null, phone: r.contact.phone || null, chat_id: r.contact.chat_id || null, labelIds: [], links: [] });
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  // Todas as etiquetas CRM de cada contato (labelIds) e quando entrou em cada uma (links)
  async function addContactLinks(byId) {
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      // 2.1.0: created_at = quando o contato entrou na etiqueta (gatilho "entrou na etiqueta" e run_key)
      const links = await restAll(`wa_contact_labels?select=contact_id,label_id,created_at&contact_id=in.${inList(ids.slice(i, i + 100))}&order=contact_id.asc,label_id.asc`);
      links.forEach((l) => {
        const c = byId.get(l.contact_id);
        if (c) { c.labelIds.push(l.label_id); c.links.push({ label_id: l.label_id, created_at: l.created_at || null }); }
      });
    }
    return byId;
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

  // ── Disparos (2.0.0-D2): wa_campaigns + wa_campaign_targets ──
  // Nada sai sem o usuário confirmar "Iniciar disparo" (startCampaign). A lista de alvos é
  // uma "foto" da etiqueta naquele momento. Sem as tabelas: "Atualize o banco para usar este recurso".

  const CAMPAIGN_COLUMNS = 'id,name,label_id,item_id,status,start_at,allow_new_chats,skip_recent_days,created_at';
  const TARGET_STATUS = ['pendente', 'enviando', 'enviado', 'falhou', 'pulado'];
  // 2.2.0 (migration 20261103160000): mensagem exclusiva, ações depois de enviar e filtros do público
  const CAMPAIGN_V2_COLUMNS = 'parts,after_actions,filters';
  const AFTER_ACTIONS = ['adicionar_etiqueta', 'remover_etiqueta', 'mover'];
  const CAMPAIGN_FILTERS = ['tem_etiqueta', 'nao_tem_etiqueta', 'respondeu_recente'];
  const campaignsV2 = () => probe('wa_campaigns.v2', () => hasColumn('wa_campaigns', 'after_actions'));
  const campCols = async () => ((await campaignsV2()) ? `${CAMPAIGN_COLUMNS},${CAMPAIGN_V2_COLUMNS}` : CAMPAIGN_COLUMNS);

  async function campRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function campRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  function checkCampaignInput(c, v2 = false) {
    const p = c || {};
    const label_id = checkUuid(p.label_id, 'Escolha a etiqueta CRM');
    // Mensagem: exclusiva do disparo (partes, como wa_item_parts) ou uma mensagem salva
    let parts = null;
    if (p.parts != null) {
      if (!Array.isArray(p.parts) || !p.parts.length || p.parts.length > MAX_PARTS) throw new Error(`Mensagem do disparo: de 1 a ${MAX_PARTS} partes`);
      parts = p.parts.map(checkPart);
    }
    const item_id = parts ? null : (p.item_id == null || p.item_id === '' ? null : checkUuid(p.item_id, 'Escolha a mensagem salva'));
    if (!parts && !item_id) throw new Error('Escreva a mensagem do disparo ou escolha uma mensagem salva');
    const after = Array.isArray(p.after_actions) ? p.after_actions : [];
    if (after.length > 10) throw new Error('No máximo 10 ações depois de enviar');
    const after_actions = after.map((a, i) => {
      if (!a || !AFTER_ACTIONS.includes(a.type)) throw new Error(`Depois de enviar, ação ${i + 1}: tipo inválido`);
      const l = checkUuid(a.label_id, `Depois de enviar, ação ${i + 1}: escolha a etiqueta`);
      if (a.type === 'mover' && l === label_id) throw new Error(`Depois de enviar, ação ${i + 1}: mover para uma etiqueta diferente da do disparo`);
      return { type: a.type, label_id: l };
    });
    const fl = Array.isArray(p.filters) ? p.filters : [];
    if (fl.length > 10) throw new Error('No máximo 10 filtros');
    const filters = fl.map((f, i) => {
      if (!f || !CAMPAIGN_FILTERS.includes(f.type)) throw new Error(`Filtro ${i + 1}: tipo inválido`);
      if (f.type === 'respondeu_recente') return { type: f.type, days: intIn(f.days, 1, 365, `Filtro ${i + 1}: dias`) };
      const l = checkUuid(f.label_id, `Filtro ${i + 1}: escolha a etiqueta`);
      if (l === label_id) throw new Error(`Filtro ${i + 1}: escolha uma etiqueta diferente da principal`);
      return { type: f.type, label_id: l };
    });
    if (!v2 && (parts || after_actions.length || filters.length)) throw new Error(ENGINE_MISSING);
    const out = {
      name: cleanText(p.name, 60, 'Nome do disparo'),
      label_id,
      item_id,
      allow_new_chats: p.allow_new_chats === true,
      skip_recent_days: intIn(p.skip_recent_days ?? 7, 0, 90, 'Pular quem recebeu nos últimos (dias)'),
      start_at: null,
      ...(v2 ? { parts, after_actions, filters } : {}),
    };
    if (p.start_at !== undefined && p.start_at !== null && p.start_at !== '') {
      const t = Date.parse(p.start_at);
      if (typeof p.start_at !== 'string' || !Number.isFinite(t)) throw new Error('Data e hora inválidas');
      if (t > Date.now() + 366 * 24 * 3600 * 1000) throw new Error('No máximo 1 ano para frente');
      out.start_at = new Date(t).toISOString();
    }
    return out;
  }

  // Lista com o progresso de cada disparo (contagem por status dos alvos)
  async function fetchCampaigns() {
    const list = await campRest(`wa_campaigns?select=${await campCols()}&order=created_at.desc&limit=30`);
    const counts = Object.fromEntries(list.map((c) => [c.id, { pendente: 0, enviando: 0, enviado: 0, falhou: 0, pulado: 0 }]));
    if (list.length) {
      const rows = await campRestAll(`wa_campaign_targets?select=campaign_id,status&campaign_id=in.${inList(list.map((c) => c.id))}&order=id.asc`);
      rows.forEach((r) => { if (counts[r.campaign_id] && r.status in counts[r.campaign_id]) counts[r.campaign_id][r.status]++; });
    }
    return list.map((c) => ({ ...c, counts: counts[c.id] }));
  }

  async function saveCampaign({ id, campaign }) {
    const row = checkCampaignInput(campaign, await campaignsV2());
    if (id !== undefined && id !== null) {
      checkUuid(id, 'Disparo inválido');
      const rows = await campRest(`wa_campaigns?id=eq.${id}&status=eq.rascunho`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Só dá para editar disparo em rascunho');
      return { id };
    }
    const rows = await campRest('wa_campaigns', json('POST', 'return=representation', { ...row, status: 'rascunho' }));
    return { id: rows[0].id };
  }

  async function deleteCampaign({ id }) {
    checkUuid(id, 'Disparo inválido');
    const rows = await campRest(`wa_campaigns?id=eq.${id}&status=in.(rascunho,concluida,cancelada)`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!rows.length) throw new Error('Pause ou cancele o disparo antes de excluir');
    return true;
  }

  async function campaignById(id) {
    checkUuid(id, 'Disparo inválido');
    const rows = await campRest(`wa_campaigns?select=${await campCols()}&id=eq.${id}`);
    if (!rows.length) throw new Error('Disparo não encontrado');
    return rows[0];
  }

  // Foto da etiqueta: quem vai e quem é pulado (e por quê). Não grava nada.
  async function campaignSnapshot(c) {
    if (!c.label_id) throw new Error('A etiqueta CRM do disparo foi excluída');
    const allLabels = await rest('wa_labels?select=id,name');
    const noSend = allLabels.find((l) => noSendKey(l.name) === noSendKey(NO_SEND));
    const labelNameOf = (id) => { const l = allLabels.find((x) => x.id === id); return l ? l.name : 'excluída'; };
    const contacts = await flowCandidates({ labelIds: [c.label_id] });
    const recent = new Set();
    if (c.skip_recent_days > 0 && contacts.length) {
      const since = new Date(Date.now() - c.skip_recent_days * 24 * 3600 * 1000).toISOString();
      const logs = await engineRest(`wa_send_log?select=contact_id,chat_id&status=eq.enviado&created_at=gte.${encodeURIComponent(since)}&limit=50000`);
      logs.forEach((l) => { if (l.contact_id) recent.add(l.contact_id); if (l.chat_id) recent.add(l.chat_id); });
    }
    const targets = contacts.map((ct) => {
      const chat = ct.chat_id && SCHED_CHAT_RE.test(ct.chat_id) ? ct.chat_id : (ct.phone && /^\d{8,15}$/.test(ct.phone) ? `${ct.phone}@c.us` : null);
      const base = { contact_id: ct.id, chat_id: chat, name: ct.name ? String(ct.name).slice(0, 100) : (ct.phone || null) };
      if (noSend && ct.labelIds.includes(noSend.id)) return { ...base, status: 'pulado', reason: 'Não enviar' };
      if (!chat) return { ...base, status: 'pulado', reason: 'sem telefone' };
      for (const f of c.filters || []) {
        if (f.type === 'tem_etiqueta' && !ct.labelIds.includes(f.label_id)) return { ...base, status: 'pulado', reason: `não tem a etiqueta ${labelNameOf(f.label_id)}`.slice(0, 60) };
        if (f.type === 'nao_tem_etiqueta' && ct.labelIds.includes(f.label_id)) return { ...base, status: 'pulado', reason: `tem a etiqueta ${labelNameOf(f.label_id)}`.slice(0, 60) };
      }
      if (recent.has(ct.id) || recent.has(chat)) return { ...base, status: 'pulado', reason: `recebeu envio nos últimos ${c.skip_recent_days} dias` };
      return { ...base, status: 'pendente', reason: null };
    });
    const skipped = {};
    targets.filter((t) => t.status === 'pulado').forEach((t) => { skipped[t.reason] = (skipped[t.reason] || 0) + 1; });
    return { targets, total: targets.length, willSend: targets.filter((t) => t.status === 'pendente').length, skipped };
  }

  // Para a tela de confirmação: números e as conversas que vão (para conferir as carregadas)
  const previewOf = (c, snap) => ({
    total: snap.total, willSend: snap.willSend, skipped: snap.skipped, allow_new_chats: c.allow_new_chats,
    chatIds: snap.targets.filter((t) => t.status === 'pendente').map((t) => t.chat_id),
    // 2.2.0 (Simular): quem vai e quem é pulado, com nome e motivo (só para a tela)
    targets: snap.targets.slice(0, 2000).map((t) => ({ name: t.name, chat_id: t.chat_id, contact_id: t.contact_id, status: t.status, reason: t.reason })),
  });

  async function previewCampaign({ id }) {
    const c = await campaignById(id);
    if (c.status !== 'rascunho') throw new Error('Este disparo já foi iniciado');
    return previewOf(c, await campaignSnapshot(c));
  }

  // Simular no editor, antes de salvar: valida o formulário e tira a "foto" sem gravar nada
  async function simulateCampaign({ campaign }) {
    const c = checkCampaignInput(campaign, await campaignsV2());
    return previewOf(c, await campaignSnapshot(c));
  }

  // Duplicar: rascunho igual (mensagem, ações, filtros), sem alvos
  async function duplicateCampaign({ id }) {
    const c = await campaignById(id);
    const row = {
      name: `${c.name} (cópia)`.slice(0, 60), label_id: c.label_id, item_id: c.item_id, status: 'rascunho', start_at: null,
      allow_new_chats: !!c.allow_new_chats, skip_recent_days: c.skip_recent_days,
      ...('after_actions' in c ? { parts: c.parts || null, after_actions: c.after_actions || [], filters: c.filters || [] } : {}),
    };
    const rows = await campRest('wa_campaigns', json('POST', 'return=representation', row));
    return { id: rows[0].id };
  }

  // Iniciar (só a pedido do usuário, na confirmação): reserva o rascunho, grava a foto e libera
  async function startCampaign({ id }) {
    const c = await campaignById(id);
    if (c.status !== 'rascunho') throw new Error('Este disparo já foi iniciado');
    if (!c.item_id && !(Array.isArray(c.parts) && c.parts.length)) throw new Error('O disparo está sem mensagem');
    const held = await campRest(`wa_campaigns?id=eq.${id}&status=eq.rascunho`, json('PATCH', 'return=representation', { status: 'pausada' }));
    if (!held.length) throw new Error('Este disparo já foi iniciado');
    let snap;
    try {
      snap = await campaignSnapshot(c);
      for (let i = 0; i < snap.targets.length; i += 500) {
        await campRest('wa_campaign_targets', json('POST', 'return=minimal', snap.targets.slice(i, i + 500).map((t) => ({ ...t, campaign_id: id }))));
      }
    } catch (err) {
      await campRest(`wa_campaign_targets?campaign_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await campRest(`wa_campaigns?id=eq.${id}&status=eq.pausada`, json('PATCH', 'return=minimal', { status: 'rascunho' })).catch(() => {});
      throw err;
    }
    const future = c.start_at && Date.parse(c.start_at) > Date.now();
    const status = future ? 'agendada' : 'rodando';
    await campRest(`wa_campaigns?id=eq.${id}&status=eq.pausada`, json('PATCH', 'return=minimal', { status, start_at: c.start_at || new Date().toISOString() }));
    return { status, total: snap.total, willSend: snap.willSend };
  }

  const CAMPAIGN_ACTIONS = {
    pause: { from: ['rodando', 'agendada'], to: () => 'pausada' },
    resume: { from: ['pausada'], to: (c) => (c.start_at && Date.parse(c.start_at) > Date.now() ? 'agendada' : 'rodando') },
    cancel: { from: ['rascunho', 'agendada', 'rodando', 'pausada'], to: () => 'cancelada' },
  };

  async function campaignAction({ id, action }) {
    const a = Object.prototype.hasOwnProperty.call(CAMPAIGN_ACTIONS, action) ? CAMPAIGN_ACTIONS[action] : null;
    if (!a) throw new Error('Ação inválida');
    const c = await campaignById(id);
    if (!a.from.includes(c.status)) throw new Error('Não dá para fazer isso agora');
    const to = a.to(c);
    const rows = await campRest(`wa_campaigns?id=eq.${id}&status=eq.${c.status}`, json('PATCH', 'return=representation', { status: to }));
    if (!rows.length) throw new Error('O disparo mudou: atualize a lista');
    if (to === 'cancelada') {
      await campRest(`wa_campaign_targets?campaign_id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=minimal', { status: 'pulado', reason: 'disparo cancelado' }));
    }
    return { status: to };
  }

  // Próximo alvo de um disparo rodando (o motor chama). Libera os agendados que chegaram na hora
  // e conclui os que acabaram. Alvo preso em "enviando" (aba fechou no meio) vira falhou, sem reenvio.
  async function nextCampaignTarget() {
    const now = new Date().toISOString();
    await campRest(`wa_campaigns?status=eq.agendada&start_at=lte.${encodeURIComponent(now)}`, json('PATCH', 'return=minimal', { status: 'rodando' }));
    const running = await campRest(`wa_campaigns?select=${await campCols()}&status=eq.rodando&order=created_at.asc&limit=10`);
    for (const c of running) {
      const next = await campRest(`wa_campaign_targets?select=id,campaign_id,contact_id,chat_id,name,status&campaign_id=eq.${c.id}&status=eq.pendente&order=id.asc&limit=1`);
      if (next.length) return { campaign: c, target: next[0] };
      const busy = await campRest(`wa_campaign_targets?select=id&campaign_id=eq.${c.id}&status=eq.enviando&limit=1`);
      if (busy.length) {
        await campRest(`wa_campaign_targets?campaign_id=eq.${c.id}&status=eq.enviando`, json('PATCH', 'return=minimal', { status: 'falhou', reason: 'envio não confirmado' }));
      }
      await campRest(`wa_campaigns?id=eq.${c.id}&status=eq.rodando`, json('PATCH', 'return=minimal', { status: 'concluida' }));
    }
    return null;
  }

  // Reserva do alvo: só sai de 'pendente' para 'enviando' uma vez
  async function claimTarget({ id }) {
    checkUuid(id, 'Alvo inválido');
    const rows = await campRest(`wa_campaign_targets?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'enviando' }));
    return rows.length ? rows[0] : null;
  }

  // Resultado: enviado/falhou saem de 'enviando'; pulado sai de 'pendente' ou 'enviando'
  async function finishTarget({ id, status, reason }) {
    checkUuid(id, 'Alvo inválido');
    if (!['enviado', 'falhou', 'pulado'].includes(status)) throw new Error('Status inválido');
    const from = status === 'pulado' ? 'in.(pendente,enviando)' : 'eq.enviando';
    const patch = { status, reason: cleanReason(reason) };
    if (status === 'enviado') patch.sent_at = new Date().toISOString();
    const rows = await campRest(`wa_campaign_targets?id=eq.${id}&status=${from}`, json('PATCH', 'return=representation', patch));
    return { updated: rows.length > 0 };
  }

  async function campaignTargets({ id, offset = 0, limit = 200 }) {
    checkUuid(id, 'Disparo inválido');
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 200)));
    const rows = await campRest(`wa_campaign_targets?select=id,name,status,reason,sent_at&campaign_id=eq.${id}&order=id.asc&offset=${off}&limit=${lim + 1}`);
    return { targets: rows.slice(0, lim), hasMore: rows.length > lim };
  }

  // ── Automações (2.1.0): wa_automations + wa_automation_runs ──
  // QUANDO (gatilho) → SE (condições) → ENTÃO (ações em ordem). Configurar só por clique (editor);
  // o motor do painel reserva (wa_automation_runs, unique) antes de executar.

  const AUTOMATION_TABLES = ['wa_automations', 'wa_automation_runs'];
  const AUTOMATION_COLUMNS = 'id,name,active,position,trigger_type,trigger_label_id,wait_minutes,schedule_days,schedule_time,conditions,actions,ignore_older_days,created_at';
  const TRIGGERS = ['sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora', 'venda_registrada'];
  const CONDITIONS = ['tem_etiqueta', 'nao_tem_etiqueta', 'anuncio', 'parada_max_dias'];
  const ACTIONS = ['enviar', 'adicionar_etiqueta', 'remover_etiqueta', 'mover', 'parar', 'adicionar_etiqueta_wa', 'remover_etiqueta_wa'];
  const WA_ACTIONS = ['adicionar_etiqueta_wa', 'remover_etiqueta_wa'];
  // 2.5.0 (migration 20261104120000): etiqueta do WhatsApp no gatilho, "primeira vez que viu" e inscrição manual
  const WA_LABEL_RE = /^[\w.:-]{1,40}$/;
  const AUTOMATION_V25_COLUMNS = 'trigger_label_source,trigger_wa_label_id';
  // "não" é testado de novo só a cada 30 min (2.4.1: poucas consultas); recarregar o WhatsApp testa na hora
  const automationsV25 = () => probe('automations.v25', () => hasColumn('wa_automations', 'trigger_label_source'), 30 * 60 * 1000);
  const autoCols = async () => ((await automationsV25()) ? `${AUTOMATION_COLUMNS},${AUTOMATION_V25_COLUMNS}` : AUTOMATION_COLUMNS);
  const checkWaLabel = (v, what) => { if (typeof v !== 'string' || !WA_LABEL_RE.test(v)) throw new Error(what); return v; };
  const RUN_KEY_RE = /^[\w:@.+-]{1,120}$/;

  const automationTables = () => probe('automations', async () => {
    try {
      await rest('wa_automations?select=id&limit=1');
      await rest('wa_automation_runs?select=id&limit=1');
      return true;
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) return false;
      throw err;
    }
  });

  async function autoRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function autoRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // 2.4.1: "tem algo ativo?" para o motor: leituras mínimas (id / poucas linhas), juntas
  async function engineActivity({ automations = true, campaigns = true } = {}) {
    const nowMs = Date.now();
    const soon = encodeURIComponent(new Date(nowMs + 2 * 60 * 1000).toISOString());
    const none = () => [];
    const cols = automations ? await autoCols() : '';
    const [sch, camp, auto] = await Promise.all([
      rest(`wa_schedules?select=id&status=eq.pendente&send_at=lte.${soon}&limit=1`).catch(none),
      campaigns ? rest('wa_campaigns?select=id,status,start_at&status=in.(agendada,rodando)&order=created_at.asc&limit=20').catch(none) : [],
      automations
        ? autoRest(`wa_automations?select=${cols}&active=eq.true&order=position.asc,created_at.asc`)
        : rest('wa_flows?select=id&active=eq.true&limit=1').catch(none),
    ]);
    const campaignOn = camp.some((c) => c.status === 'rodando' || (c.start_at && Date.parse(c.start_at) <= nowMs + 2 * 60 * 1000));
    // 2.5.0: inscrições manuais ativas nas automações ativas (1 leitura, só se houver automação ativa)
    let enrollments = [];
    if (automations && auto.length && (await automationsV25())) enrollments = await activeEnrollments({ automationIds: auto.map((a) => a.id) }).catch(none);
    return automations
      ? { schedules: sch.length > 0, campaigns: campaignOn, automations: auto, flows: false, enrollments }
      : { schedules: sch.length > 0, campaigns: campaignOn, automations: null, flows: auto.length > 0 };
  }

  const cleanKeyword = (v, what) => {
    const kw = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (!kw || kw.length > 60) throw new Error(`${what}: palavra do anúncio de 1 a 60 caracteres`);
    return kw;
  };

  function checkCondition(c, i) {
    const what = `Condição ${i + 1}`;
    if (!c || typeof c !== 'object' || !CONDITIONS.includes(c.type)) throw new Error(`${what}: tipo inválido`);
    if (c.type === 'tem_etiqueta' || c.type === 'nao_tem_etiqueta') return { type: c.type, label_id: checkUuid(c.label_id, `${what}: escolha a etiqueta`) };
    if (c.type === 'anuncio') return { type: 'anuncio', keyword: cleanKeyword(c.keyword, what) };
    return { type: 'parada_max_dias', days: intIn(c.days, 1, 365, `${what}: dias`) };
  }

  function checkAction(a, i, triggerLabel, waTrigger = false) {
    const what = `Ação ${i + 1}`;
    if (!a || typeof a !== 'object' || !ACTIONS.includes(a.type)) throw new Error(`${what}: tipo inválido`);
    if (a.type === 'parar') return { type: 'parar' };
    if (WA_ACTIONS.includes(a.type)) return { type: a.type, wa_label_id: checkWaLabel(a.wa_label_id, `${what}: escolha a etiqueta do WhatsApp`) };
    if (a.type === 'enviar') {
      const variants = Array.isArray(a.variants) ? a.variants : [];
      if (variants.length > 10) throw new Error(`${what}: no máximo 10 variantes`);
      const list = variants.map((v, j) => {
        const w = `${what}, variante ${j + 1}`;
        if (!v || !['etiqueta', 'anuncio'].includes(v.when)) throw new Error(`${w}: condição inválida`);
        const item_id = checkUuid(v.item_id, `${w}: escolha a mensagem`);
        return v.when === 'etiqueta' ? { when: 'etiqueta', label_id: checkUuid(v.label_id, `${w}: escolha a etiqueta`), item_id } : { when: 'anuncio', keyword: cleanKeyword(v.keyword, w), item_id };
      });
      const item_id = a.item_id == null || a.item_id === '' ? null : checkUuid(a.item_id, `${what}: mensagem inválida`);
      if (!item_id && !list.length) throw new Error(`${what}: escolha a mensagem`);
      return { type: 'enviar', item_id, variants: list };
    }
    const label_id = checkUuid(a.label_id, `${what}: escolha a etiqueta`);
    if (a.type === 'mover' && label_id === triggerLabel) throw new Error(`${what}: mover para uma etiqueta diferente da do gatilho`);
    if (a.type === 'mover' && !triggerLabel && !waTrigger) throw new Error(`${what}: sem etiqueta no gatilho, use "adicionar etiqueta"`);
    return { type: a.type, label_id };
  }

  function checkAutomation(input) {
    const a = input || {};
    if (!TRIGGERS.includes(a.trigger_type)) throw new Error('Escolha o gatilho (Quando)');
    // 2.5.0: etiqueta do gatilho do CRM (padrão) ou do WhatsApp
    const source = a.trigger_label_source === 'whatsapp' ? 'whatsapp' : 'crm';
    if (source === 'whatsapp' && a.trigger_type === 'venda_registrada') throw new Error('"Venda registrada" usa só etiqueta CRM');
    const row = {
      name: cleanText(a.name, 60, 'Nome da automação'),
      active: a.active === true,
      trigger_type: a.trigger_type,
      trigger_label_source: source,
      trigger_wa_label_id: source === 'whatsapp' ? checkWaLabel(a.trigger_wa_label_id, 'Escolha a etiqueta do WhatsApp do gatilho') : null,
      // 2.3.0: "venda registrada" não precisa de etiqueta (vale para quem teve a venda registrada pela conversa)
      trigger_label_id: source === 'whatsapp' ? null : a.trigger_type === 'venda_registrada' && (a.trigger_label_id == null || a.trigger_label_id === '')
        ? null : checkUuid(a.trigger_label_id, 'Escolha a etiqueta CRM do gatilho'),
      wait_minutes: null, schedule_days: null, schedule_time: null,
      ignore_older_days: intIn(a.ignore_older_days ?? 15, 1, 365, 'Ignorar conversas paradas há (dias)'),
    };
    if (a.trigger_type === 'sem_resposta' || a.trigger_type === 'entrou_etiqueta') row.wait_minutes = intIn(a.wait_minutes, 1, 525600, 'Espera (minutos)');
    if (a.trigger_type === 'dia_hora') {
      const days = Array.isArray(a.schedule_days) ? [...new Set(a.schedule_days)] : null;
      if (!days || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Escolha pelo menos um dia da semana');
      if (typeof a.schedule_time !== 'string' || !HM_RE.test(a.schedule_time.slice(0, 5))) throw new Error('Escolha a hora');
      row.schedule_days = days.sort((x, y) => x - y);
      row.schedule_time = a.schedule_time.slice(0, 5);
    }
    const conditions = Array.isArray(a.conditions) ? a.conditions : [];
    if (conditions.length > 10) throw new Error('No máximo 10 condições');
    row.conditions = conditions.map(checkCondition);
    const actions = Array.isArray(a.actions) ? a.actions : [];
    if (!actions.length || actions.length > 10) throw new Error('De 1 a 10 ações');
    row.actions = actions.map((x, i) => checkAction(x, i, row.trigger_label_id, source === 'whatsapp'));
    if (!row.actions.some((x) => x.type !== 'parar')) throw new Error('Escolha pelo menos uma ação');
    return row;
  }

  async function fetchAutomations() {
    return autoRest(`wa_automations?select=${await autoCols()}&order=position.asc,created_at.asc`);
  }

  async function saveAutomation({ id, automation }) {
    const row = checkAutomation(automation);
    if (row.trigger_type === 'venda_registrada' && !(await salesOrigin())) throw new Error(ENGINE_MISSING);
    // 2.5.0: sem a migration 20261104120000, etiqueta do WhatsApp não dá; o resto salva como antes
    if (!(await automationsV25())) {
      if (row.trigger_label_source === 'whatsapp' || row.actions.some((x) => WA_ACTIONS.includes(x.type))) throw new Error(ENGINE_MISSING);
      delete row.trigger_label_source;
      delete row.trigger_wa_label_id;
    }
    if (id !== undefined && id !== null) {
      checkUuid(id, 'Automação inválida');
      const rows = await autoRest(`wa_automations?id=eq.${id}`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Automação não encontrada');
      return { id };
    }
    const last = await autoRest('wa_automations?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    const rows = await autoRest('wa_automations', json('POST', 'return=representation', { ...row, position }));
    return { id: rows[0].id };
  }

  async function setAutomationActive({ id, active }) {
    checkUuid(id, 'Automação inválida');
    if (typeof active !== 'boolean') throw new Error('Valor inválido');
    const rows = await autoRest(`wa_automations?id=eq.${id}`, json('PATCH', 'return=representation', { active }));
    return { active: rows.length ? rows[0].active : null };
  }

  async function deleteAutomation({ id }) {
    checkUuid(id, 'Automação inválida');
    await autoRest(`wa_automations?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Execuções já feitas das automações (para não repetir): "automação:contato:run_key"
  async function automationRuns({ automationIds, contactIds }) {
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return [];
    // 2.4.1: com a lista de contatos, só as execuções deles (filtro no banco, em lotes de 100)
    const base = `wa_automation_runs?select=automation_id,contact_id,run_key&automation_id=in.${inList(automationIds)}`;
    let rows = [];
    if (Array.isArray(contactIds)) {
      if (contactIds.length > 5000) throw new Error('Lista inválida');
      contactIds.forEach((c) => checkUuid(c, 'Contato inválido'));
      const ids = [...new Set(contactIds)];
      for (let i = 0; i < ids.length; i += 100) {
        rows.push(...await autoRestAll(`${base}&contact_id=in.${inList(ids.slice(i, i + 100))}&order=id.asc`));
      }
    } else {
      rows = await autoRestAll(`${base}&order=id.asc`);
    }
    return rows.map((r) => `${r.automation_id}:${r.contact_id}:${r.run_key}`);
  }

  // Reserva: só quem conseguir gravar a linha (unique) executa
  async function automationReserve({ automationId, contactId, runKey }) {
    checkUuid(automationId, 'Automação inválida');
    checkUuid(contactId, 'Contato inválido');
    if (typeof runKey !== 'string' || !RUN_KEY_RE.test(runKey)) throw new Error('Execução inválida');
    const rows = await autoRest('wa_automation_runs?on_conflict=automation_id,contact_id,run_key',
      json('POST', 'resolution=ignore-duplicates,return=representation', { automation_id: automationId, contact_id: contactId, run_key: runKey }));
    return { reserved: rows.length > 0, id: rows.length ? rows[0].id : null };
  }

  // Nada foi enviado (erro antes do envio): libera para tentar de novo mais tarde
  async function automationUnreserve({ id }) {
    checkUuid(id, 'Execução inválida');
    await autoRest(`wa_automation_runs?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // ── 2.5.0: etiqueta do WhatsApp no gatilho ("primeira vez que viu") e "Adicionar à automação" ──
  // wa_native_label_seen: uma linha por conversa + etiqueta nativa. Saiu: removed_at. Voltou depois:
  // a mesma linha recomeça (first_seen_at novo, removed_at vazio) e conta como entrada nova.

  const v25OrMissing = async () => { if (!(await automationsV25())) throw new Error(ENGINE_MISSING); };
  const clipName = (v) => (typeof v === 'string' && v.trim() && !/^[+\d\s().-]+$/.test(v) ? v.trim().replace(/\s+/g, ' ').slice(0, 100) : null);
  function checkChats(list, max) {
    if (!Array.isArray(list) || list.length > max) throw new Error('Lista inválida');
    return list.map((c) => {
      const chatId = c && (c.chatId || c.id);
      if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
      const phone = typeof c.phone === 'string' && /^\d{8,15}$/.test(c.phone) ? c.phone : null; // 2.6.0: telefone de conversa @lid
      return { chatId, name: clipName(c.name), phone };
    });
  }

  // Conversa sem contato no CRM: cria (telefone pelo id @c.us, ou o nome) e grava chat_id, como já é feito
  async function ensureChatContacts(chats) {
    if (!chats.length) return;
    const found = await contactsByChats(chats.map((c) => c.chatId));
    const hasCol = await chatIdColumn();
    const at = new Date().toISOString();
    const rows = [];
    const keys = new Set();
    chats.forEach((c) => {
      if (found[c.chatId]) return;
      const phone = phoneOfChat(c.chatId) || c.phone || null;
      const key = phone ? `tel:${phone}` : c.name ? nameKey(c.name) : null;
      if (!key || keys.has(key)) return;
      keys.add(key);
      rows.push({ key, name: c.name, phone: phone || null, updated_at: at, ...(hasCol ? { chat_id: c.chatId } : {}) });
    });
    for (let i = 0; i < rows.length; i += 200) {
      await rest('wa_contacts?on_conflict=key', json('POST', 'resolution=ignore-duplicates,return=minimal', rows.slice(i, i + 200)));
    }
    // Já existia só pelo nome (sem telefone e sem conversa): liga a conversa a ele
    if (hasCol) {
      for (const r of rows.filter((x) => !x.phone)) {
        await rest(`wa_contacts?key=${eq(r.key)}&phone=is.null&chat_id=is.null`, json('PATCH', 'return=minimal', { chat_id: r.chat_id }));
      }
    }
  }

  async function upsertSeen(labelId, chats) {
    const at = new Date().toISOString();
    for (let i = 0; i < chats.length; i += 500) {
      await rest('wa_native_label_seen?on_conflict=chat_id,wa_label_id', json('POST', 'resolution=merge-duplicates,return=minimal',
        chats.slice(i, i + 500).map((c) => ({ chat_id: c.chatId, wa_label_id: labelId, first_seen_at: at, last_seen_at: at, removed_at: null }))));
    }
  }
  async function markGone(labelId, chatIds) {
    const at = new Date().toISOString();
    for (let i = 0; i < chatIds.length; i += 100) {
      await rest(`wa_native_label_seen?wa_label_id=eq.${encodeURIComponent(labelId)}&chat_id=in.${inList(chatIds.slice(i, i + 100))}&removed_at=is.null`,
        json('PATCH', 'return=minimal', { removed_at: at, last_seen_at: at }));
    }
  }

  // Eventos chat.update_label (add/remove) que a aba com a trava juntou. Vale o último de cada conversa+etiqueta.
  async function nativeLabelEvents({ events }) {
    await v25OrMissing();
    if (!Array.isArray(events) || events.length > 200) throw new Error('Lista inválida');
    const last = new Map();
    events.forEach((e) => {
      const [c] = checkChats([e], 1);
      const labelId = checkWaLabel(e && e.labelId, 'Etiqueta inválida');
      if (!['add', 'remove'].includes(e.type)) throw new Error('Evento inválido');
      last.set(`${labelId}|${c.chatId}`, { ...c, labelId, type: e.type });
    });
    let added = 0;
    let removed = 0;
    const labels = [...new Set([...last.values()].map((e) => e.labelId))];
    for (const labelId of labels) {
      const evs = [...last.values()].filter((e) => e.labelId === labelId);
      const adds = evs.filter((e) => e.type === 'add');
      const gone = evs.filter((e) => e.type === 'remove').map((e) => e.chatId);
      if (adds.length) {
        const active = new Set();
        for (let i = 0; i < adds.length; i += 100) {
          const rows = await rest(`wa_native_label_seen?select=chat_id&wa_label_id=eq.${encodeURIComponent(labelId)}&removed_at=is.null&chat_id=in.${inList(adds.slice(i, i + 100).map((a) => a.chatId))}`);
          rows.forEach((r) => active.add(r.chat_id));
        }
        const fresh = adds.filter((a) => !active.has(a.chatId)); // já estava: não muda a data de entrada
        if (fresh.length) {
          await ensureChatContacts(fresh);
          await upsertSeen(labelId, fresh);
          added += fresh.length;
        }
      }
      if (gone.length) { await markGone(labelId, gone); removed += gone.length; }
    }
    return { added, removed };
  }

  // Varredura de uma etiqueta nativa: quem está nela agora (lista do WhatsApp Web). Novos entram com a data
  // de agora; quem já estava fica como está (sem duplicar); quem saiu ganha removed_at (só com a lista completa).
  async function nativeLabelSweep({ labelId, chats, complete }) {
    await v25OrMissing();
    checkWaLabel(labelId, 'Etiqueta inválida');
    const list = checkChats(chats, 5000);
    const current = new Map(list.map((c) => [c.chatId, c]));
    const rows = await restAll(`wa_native_label_seen?select=chat_id&wa_label_id=eq.${encodeURIComponent(labelId)}&removed_at=is.null&order=chat_id.asc`);
    const active = new Set(rows.map((r) => r.chat_id));
    const fresh = [...current.values()].filter((c) => !active.has(c.chatId));
    const gone = complete === true ? [...active].filter((id) => !current.has(id)) : [];
    if (fresh.length) {
      await ensureChatContacts(fresh);
      await upsertSeen(labelId, fresh);
    }
    if (gone.length) await markGone(labelId, gone);
    return { added: fresh.length, removed: gone.length, total: current.size };
  }

  const contactCols = async () => ((await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone');
  const blankCandidate = (r, chatId = null) => ({ id: r.id, name: r.name || null, phone: r.phone || null, chat_id: r.chat_id || chatId || null, labelIds: [], links: [], waSeen: {}, enrolled: {}, enrollmentIds: {} });
  async function contactsById(ids) {
    const out = [];
    const cols = await contactCols();
    for (let i = 0; i < ids.length; i += 100) out.push(...await rest(`wa_contacts?select=${cols}&id=in.${inList(ids.slice(i, i + 100))}`));
    return out;
  }

  // Contatos completos (id, nome, telefone, chat_id) de um lote de conversas, numa leitura (+ telefone se faltar)
  async function contactRowsByChats(chatIds) {
    const out = {};
    const ids = [...new Set(chatIds.filter((c) => typeof c === 'string' && SCHED_CHAT_RE.test(c)))];
    const hasCol = await chatIdColumn();
    const cols = await contactCols();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      if (hasCol) (await rest(`wa_contacts?select=${cols}&chat_id=in.${inList(part)}`)).forEach((r) => { out[r.chat_id] = r; });
      const phones = part.filter((c) => !out[c]).map(phoneOfChat).filter(Boolean);
      if (phones.length) (await rest(`wa_contacts?select=${cols}&phone=in.${inList(phones)}`)).forEach((r) => { const k = `${r.phone}@c.us`; if (!out[k]) out[k] = r; });
    }
    return out;
  }

  // Contatos das conversas que estão nas etiquetas nativas dos gatilhos (com waSeen = "entrou em")
  async function nativeLabelCandidates({ waLabelIds }) {
    await v25OrMissing();
    if (!Array.isArray(waLabelIds) || !waLabelIds.length || waLabelIds.length > 50) throw new Error('Lista inválida');
    waLabelIds.forEach((l) => checkWaLabel(l, 'Etiqueta inválida'));
    const seen = await restAll(`wa_native_label_seen?select=chat_id,wa_label_id,first_seen_at&wa_label_id=in.${inList(waLabelIds)}&removed_at=is.null&order=chat_id.asc,wa_label_id.asc`, 20000);
    const chatIds = [...new Set(seen.map((r) => r.chat_id))];
    if (!chatIds.length) return [];
    let byChat = await contactRowsByChats(chatIds);
    const missing = chatIds.filter((c) => !byChat[c]);
    if (missing.length) {
      await ensureChatContacts(missing.map((chatId) => ({ chatId, name: null })));
      byChat = { ...byChat, ...(await contactRowsByChats(missing)) };
    }
    const byId = new Map();
    seen.forEach((r) => {
      const c = byChat[r.chat_id];
      if (!c) return;
      if (!byId.has(c.id)) byId.set(c.id, blankCandidate(c, r.chat_id));
      const x = byId.get(c.id);
      x.waSeen[r.wa_label_id] = r.first_seen_at;
      if (!x.chat_id) x.chat_id = r.chat_id;
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  async function activeEnrollments({ automationIds }) {
    await v25OrMissing();
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return [];
    return restAll(`wa_automation_enrollments?select=id,automation_id,contact_id,chat_id,enrolled_at&removed_at=is.null&automation_id=in.${inList(automationIds)}&order=id.asc`, 20000);
  }

  // Contatos inscritos à mão (enrolled = { automação: enrolled_at })
  async function enrollmentCandidates({ enrollments }) {
    await v25OrMissing();
    if (!Array.isArray(enrollments) || enrollments.length > 20000) throw new Error('Lista inválida');
    const list = enrollments.map((e) => ({
      id: checkUuid(e && e.id, 'Inscrição inválida'), automation_id: checkUuid(e.automation_id, 'Automação inválida'),
      contact_id: checkUuid(e.contact_id, 'Contato inválido'), enrolled_at: typeof e.enrolled_at === 'string' ? e.enrolled_at : null,
      chat_id: typeof e.chat_id === 'string' && SCHED_CHAT_RE.test(e.chat_id) ? e.chat_id : null,
    }));
    if (!list.length) return [];
    const byId = new Map((await contactsById([...new Set(list.map((e) => e.contact_id))])).map((c) => [c.id, blankCandidate(c)]));
    list.forEach((e) => {
      const c = byId.get(e.contact_id);
      if (!c || !e.enrolled_at) return;
      c.enrolled[e.automation_id] = e.enrolled_at;
      c.enrollmentIds[e.automation_id] = e.id;
      if (!c.chat_id && e.chat_id) c.chat_id = e.chat_id;
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  // "Adicionar à automação" (botão 🔁): o contato da conversa entra a partir de AGORA. Cria o contato se preciso.
  async function enrollContact({ automationId, identity, chatId, name }) {
    await v25OrMissing();
    checkUuid(automationId, 'Automação inválida');
    const chat = typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId) ? chatId : null;
    let contactId = null;
    if (identity) {
      const id = checkIdentity({ ...identity, chatId: identity.chatId || chat });
      const contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
      contactId = contact && contact.id;
    } else if (chat) {
      await ensureChatContacts([{ chatId: chat, name: clipName(name) }]);
      const found = (await contactsByChats([chat]))[chat];
      contactId = found ? found.id : null;
    }
    if (!contactId) throw new Error('Não achei o contato desta conversa');
    const autos = await autoRest(`wa_automations?select=id,trigger_type&id=eq.${automationId}`);
    if (!autos.length) throw new Error('Automação não encontrada');
    if (autos[0].trigger_type === 'venda_registrada') throw new Error('"Venda registrada" não aceita inscrição manual');
    const open = await rest(`wa_automation_enrollments?select=id,enrolled_at&automation_id=eq.${automationId}&contact_id=eq.${contactId}&removed_at=is.null`);
    if (open.length) return { enrolled: false, already: true, contactId, id: open[0].id, enrolled_at: open[0].enrolled_at };
    try {
      const rows = await rest('wa_automation_enrollments', json('POST', 'return=representation',
        { automation_id: automationId, contact_id: contactId, chat_id: chat, enrolled_at: new Date().toISOString() }));
      return { enrolled: true, contactId, id: rows[0].id, enrolled_at: rows[0].enrolled_at };
    } catch (err) {
      // Outra aba inscreveu no mesmo instante (índice único das inscrições ativas)
      if (/^Supabase 409:/.test(err.message)) return { enrolled: false, already: true, contactId };
      throw err;
    }
  }

  // "Tirar desta automação": encerra a inscrição e/ou marca a entrada atual pela etiqueta como "não rodar"
  async function leaveAutomation({ automationId, contactId, enrollmentId, entryKey }) {
    await v25OrMissing();
    checkUuid(automationId, 'Automação inválida');
    checkUuid(contactId, 'Contato inválido');
    let done = false;
    if (enrollmentId) {
      checkUuid(enrollmentId, 'Inscrição inválida');
      await rest(`wa_automation_enrollments?id=eq.${enrollmentId}&automation_id=eq.${automationId}&removed_at=is.null`,
        json('PATCH', 'return=minimal', { removed_at: new Date().toISOString() }));
      done = true;
    }
    if (entryKey !== undefined && entryKey !== null) {
      const runKey = `fora@${entryKey}`;
      if (typeof entryKey !== 'string' || !RUN_KEY_RE.test(runKey)) throw new Error('Entrada inválida');
      await autoRest('wa_automation_runs?on_conflict=automation_id,contact_id,run_key',
        json('POST', 'resolution=ignore-duplicates,return=minimal', { automation_id: automationId, contact_id: contactId, run_key: runKey }));
      done = true;
    }
    if (!done) throw new Error('Nada para tirar');
    return { left: true };
  }

  // Tela da conversa: o contato (sem criar), etiquetas CRM, etiquetas nativas vistas, inscrições e execuções
  async function chatAutomationState({ identity, chatId }) {
    const chat = typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId) ? chatId : null;
    const v25 = await automationsV25();
    let ref = null;
    if (identity) {
      const found = await findContact(checkIdentity(identity));
      if (found && !found.promotable) ref = found;
    }
    if (!ref && chat) ref = (await contactsByChats([chat]))[chat] || null;
    const waSeen = {};
    if (v25 && chat) {
      const rows = await rest(`wa_native_label_seen?select=wa_label_id,first_seen_at&chat_id=eq.${encodeURIComponent(chat)}&removed_at=is.null`);
      rows.forEach((r) => { waSeen[r.wa_label_id] = r.first_seen_at; });
    }
    if (!ref) return { v25, contact: null, waSeen, ranKeys: [] };
    const [c] = await contactsById([ref.id]);
    if (!c) return { v25, contact: null, waSeen, ranKeys: [] };
    const byId = await addContactLinks(new Map([[c.id, blankCandidate(c, chat)]]));
    const contact = byId.get(c.id);
    contact.waSeen = waSeen;
    if (v25) {
      const enr = await rest(`wa_automation_enrollments?select=id,automation_id,enrolled_at&contact_id=eq.${c.id}&removed_at=is.null`);
      enr.forEach((e) => { contact.enrolled[e.automation_id] = e.enrolled_at; contact.enrollmentIds[e.automation_id] = e.id; });
    }
    const runs = await autoRestAll(`wa_automation_runs?select=automation_id,contact_id,run_key&contact_id=eq.${c.id}&order=id.asc`);
    return { v25, contact, waSeen, ranKeys: runs.map((r) => `${r.automation_id}:${r.contact_id}:${r.run_key}`) };
  }

  // ── Mensagem rápida que etiqueta (2.1.0) ──
  // Depois que a mensagem INTEIRA saiu: põe/tira o contato das etiquetas CRM do item.
  // Acha o contato pelo id, pela conversa aberta (identity) ou pelo id da conversa; cria se preciso.
  async function applySendLabels({ addLabelId, removeLabelId, contactId, identity, chatId, name }) {
    const add = addLabelId == null || addLabelId === '' ? null : checkUuid(addLabelId, 'Etiqueta inválida');
    const remove = removeLabelId == null || removeLabelId === '' ? null : checkUuid(removeLabelId, 'Etiqueta inválida');
    if (!add && !remove) return { applied: false };
    let contact = null;
    if (contactId) {
      contact = { id: checkUuid(contactId, 'Contato inválido') };
    } else if (identity) {
      const id = checkIdentity(identity);
      contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
    } else if (typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId)) {
      const found = (await contactsByChats([chatId]))[chatId];
      if (found) contact = { id: found.id };
      else {
        const phone = phoneOfChat(chatId);
        const nm = typeof name === 'string' && name.trim() && !/^[+\d\s().-]+$/.test(name) ? name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
        if (phone) contact = await ensureContact({ key: `tel:${phone}`, phone, name: nm });
        else if (nm) contact = await ensureContact({ key: nameKey(nm), phone: null, name: nm });
        if (contact) await rememberChatId(contact, chatId).catch(() => {});
      }
    }
    if (!contact) return { applied: false };
    if (remove) await rest(`wa_contact_labels?contact_id=eq.${contact.id}&label_id=eq.${remove}`, { method: 'DELETE' });
    if (add) await followAdd({ contactId: contact.id, labelId: add });
    return { applied: true, contactId: contact.id, labelIds: await labelIdsOf(contact.id) };
  }

  // Nome salvo no CRM para o contato da conversa aberta (para o {nome})
  async function getContactName(identity) {
    const found = await findContact(checkIdentity(identity));
    if (!found) return { name: null };
    const rows = await rest(`wa_contacts?select=name&id=eq.${found.id}`);
    return { name: rows.length ? rows[0].name || null : null };
  }

  // ── Venda pela conversa (2.3.0) ──
  // Grava nas tabelas do ERP EXATAMENTE como a tela "Nova Venda" (src/pages/Sales.tsx): sales,
  // sale_items, sale_accessories, status 'em_separacao', estoque baixado na criação (como o ERP) e o
  // Tiny avisado pela mesma Edge Function. Nunca grava finalized_at (o trigger do banco faz isso ao
  // finalizar no ERP). Os cálculos ficam em sale-calc.js (cópia dos do ERP). Só a pedido do clique.

  const SALE = () => root.TspSale;
  const salesOrigin = () => probe('sales.wa_chat_id', () => hasColumn('sales', 'wa_chat_id'));
  const FEE_KEY_RE = /^fee_(vm|ea)_(debit|credit_\d{1,2})$|^fee_link_(vm|ea)_credit_\d{1,2}$|^fee_link_start_date$/; // 2.6.1/2.6.2: + taxas e data do link
  const clip = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
  const clipText = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const numIn = (v, min, max, what) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${what}: valor inválido`);
    return Math.round(n * 100) / 100;
  };

  async function feeConfig() {
    const rows = await rest('system_config?select=key,value');
    return Object.fromEntries(rows.filter((r) => FEE_KEY_RE.test(r.key)).map((r) => [r.key, r.value]));
  }

  // Listas do ERP para o formulário (produtos com estoque e preço, acessórios, motoboys, cidades, bairros)
  async function erpCatalog() {
    const [products, accessories, motoboys, cities, neighborhoods, fees, originAvailable] = await Promise.all([
      rest('products?select=id,model,color,category,price,cost,current_stock&order=model.asc&limit=5000'),
      rest('accessories?select=id,name,cost&order=name.asc&limit=2000'),
      rest('motoboys?select=id,name&order=name.asc'),
      rest('cities?select=id,name&order=name.asc&limit=5000'),
      rest('neighborhoods?select=id,name&order=name.asc&limit=10000'),
      feeConfig(),
      salesOrigin(),
    ]);
    return { products, accessories, motoboys, cities, neighborhoods, fees, originAvailable, erpUrl: (root.WA_CONFIG && root.WA_CONFIG.ERP_URL) || null };
  }

  // Cidade/bairro novos entram na lista do ERP (o ERP faz o mesmo ao salvar a venda)
  async function ensurePlace(table, name) {
    if (!name) return;
    const rows = await rest(`${table}?select=id,name`);
    if (rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) return;
    try {
      await rest(table, json('POST', 'return=minimal', { name }));
    } catch (err) {
      if (!/duplicate|23505|409/.test(err.message)) throw err;
    }
  }

  function checkSaleInput(s) {
    const S = SALE();
    const deliveryTypes = S.DELIVERY_TYPES.map(([k]) => k);
    const methods = S.PAYMENT_METHODS.map(([k]) => k);
    if (!deliveryTypes.includes(s.delivery_type)) throw new Error('Tipo de entrega inválido');
    if (!methods.includes(s.payment_method)) throw new Error('Forma de pagamento inválida');
    const card = ['credit_card', 'debit_card', 'payment_link'].includes(s.payment_method);
    const brand = card && S.CARD_BRANDS.some(([k]) => k === s.card_brand) ? s.card_brand : '';
    const installments = s.payment_method === 'credit_card' || s.payment_method === 'payment_link' ? intIn(Number(s.installments) || 0, 0, 12, 'Parcelas') : 0;
    if (!Array.isArray(s.items) || !s.items.length || s.items.length > 30) throw new Error('Adicione pelo menos um produto');
    const merged = new Map();
    s.items.forEach((it, i) => {
      const id = checkUuid(it && it.product_id, `Produto ${i + 1} inválido`);
      const quantity = intIn(Number(it.quantity), 1, 999, `Quantidade do produto ${i + 1}`);
      const unit_price = numIn(it.unit_price, 0, 1000000, `Valor do produto ${i + 1}`);
      // Como o ERP: o mesmo produto de novo soma na quantidade
      if (merged.has(id)) merged.get(id).quantity += quantity;
      else merged.set(id, { product_id: id, quantity, unit_price });
    });
    const accs = Array.isArray(s.accessories) ? s.accessories : [];
    if (accs.length > 30) throw new Error('Acessórios demais');
    const accessories = accs.map((a, i) => ({ accessory_id: checkUuid(a && a.accessory_id, `Acessório ${i + 1} inválido`), quantity: intIn(Number(a.quantity), 1, 999, `Quantidade do acessório ${i + 1}`) }));
    const form = {
      customer_name: clip(s.customer_name, 100) || '',
      customer_phone: clip(s.customer_phone, 30),
      address_street: clip(s.address_street, 200),
      address_number: clip(s.address_number, 30),
      address_complement: clip(s.address_complement, 200),
      city: clip(s.city, 80) || '',
      neighborhood: clip(s.neighborhood, 80) || '',
      state: clip(s.state, 30),
      zip_code: clip(s.zip_code, 12),
      delivery_type: s.delivery_type,
      motoboy_id: s.delivery_type === 'motoboy' && s.motoboy_id ? checkUuid(s.motoboy_id, 'Motoboy inválido') : null,
      delivery_fee: s.delivery_type === 'motoboy' ? numIn(s.delivery_fee ?? S.DEFAULT_DELIVERY_FEE, 0, 10000, 'Taxa do motoboy') : 0,
      delivery_cost: s.delivery_type === 'correios' ? numIn(s.delivery_cost ?? 0, 0, 10000, 'Frete') : 0,
      delivery_notes: clipText(s.delivery_notes, 1000),
      payment_status: s.payment_status === 'pago' ? 'pago' : 'a_cobrar',
    };
    const v = S.validateAddress(form.delivery_type, form);
    if (!v.isValid) throw new Error(v.message);
    const extra = {
      wa_chat_id: typeof s.wa_chat_id === 'string' && SCHED_CHAT_RE.test(s.wa_chat_id) ? s.wa_chat_id : null,
      origin: s.origin === 'anuncio' ? 'anuncio' : 'organico',
      ad_source: clip(s.ad_source, 60),
      ad_title: clip(s.ad_title, 300),
      ad_url: typeof s.ad_url === 'string' && /^https?:\/\/\S{1,500}$/.test(s.ad_url) ? s.ad_url : null,
      wa_warranty_months: s.warranty_months == null || s.warranty_months === '' ? null : intIn(Number(s.warranty_months), 0, 120, 'Garantia (meses)'),
    };
    return { form, items: [...merged.values()], accessories, payment: { method: s.payment_method, card_brand: brand, installments }, extra };
  }

  async function createSaleFromChat({ sale }) {
    const S = SALE();
    const { form, items, accessories, payment, extra } = checkSaleInput(sale || {});
    // Dados frescos do banco: custo (unit_cost) e categoria do produto, custo do acessório, taxas
    const products = await rest(`products?select=id,model,color,category,price,cost,current_stock,tiny_id&id=in.${inList(items.map((i) => i.product_id))}`);
    const byId = new Map(products.map((p) => [p.id, p]));
    items.forEach((it) => { if (!byId.has(it.product_id)) throw new Error('Produto não encontrado'); });
    const accRows = accessories.length ? await rest(`accessories?select=id,name,cost&id=in.${inList(accessories.map((a) => a.accessory_id))}`) : [];
    const accById = new Map(accRows.map((a) => [a.id, a]));
    accessories.forEach((a) => { if (!accById.has(a.accessory_id)) throw new Error('Acessório não encontrado'); });
    const cfg = await feeConfig();
    const calcItems = items.map((it) => ({ ...it, unit_cost: Number(byId.get(it.product_id).cost) || 0, category: byId.get(it.product_id).category }));
    const calcAcc = accessories.map((a) => ({ ...a, cost: Number(accById.get(a.accessory_id).cost) || 0 }));
    // Igual ao estado inicial do ERP: uma forma de pagamento, valor 0 (= o total da venda)
    const payments = [{ method: payment.method, card_brand: payment.card_brand, installments: payment.installments, amount: 0 }];
    await ensurePlace('cities', form.city);
    await ensurePlace('neighborhoods', form.neighborhood);
    const { row, saleItems, saleAccessories } = S.buildSale({ form, items: calcItems, accessories: calcAcc, payments, cfg });
    if (await salesOrigin()) Object.assign(row, extra);
    const created = await rest('sales', json('POST', 'return=representation', row));
    const saleId = created[0].id;
    try {
      await rest('sale_items', json('POST', 'return=minimal', saleItems.map((x) => ({ ...x, sale_id: saleId }))));
      if (saleAccessories.length) await rest('sale_accessories', json('POST', 'return=minimal', saleAccessories.map((x) => ({ ...x, sale_id: saleId }))));
    } catch (err) {
      // Sem itens a venda ficaria errada no ERP: desfaz (o estoque ainda não foi mexido)
      await rest(`sale_items?sale_id=eq.${saleId}`, { method: 'DELETE' }).catch(() => {});
      await rest(`sales?id=eq.${saleId}`, { method: 'DELETE' }).catch(() => {});
      throw err;
    }
    // Estoque: o ERP baixa na criação da venda (products.current_stock) e avisa o Tiny
    let tinyFailed = 0;
    for (const it of items) {
      const fresh = await rest(`products?select=current_stock,tiny_id&id=eq.${it.product_id}`);
      if (!fresh.length) continue;
      const novo = (Number(fresh[0].current_stock) || 0) - it.quantity;
      await rest(`products?id=eq.${it.product_id}`, json('PATCH', 'return=minimal', { current_stock: novo }));
      if (fresh[0].tiny_id) {
        try {
          const { SUPABASE_URL } = root.WA_CONFIG;
          const res = await supaFetch(`${SUPABASE_URL}/functions/v1/update-tiny-stock`, json('POST', 'return=minimal', { tiny_id: fresh[0].tiny_id, quantidade: novo }));
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.success) tinyFailed++;
        } catch { tinyFailed++; }
      }
    }
    return { id: saleId, total: row.total_sale_price, status: row.status, tinyFailed };
  }

  // Venda desta conversa nas últimas 24 h (para avisar antes de registrar outra)
  async function recentChatSale({ chatId, phone }) {
    const since = encodeURIComponent(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if (await salesOrigin()) {
      if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { exists: false };
      const rows = await rest(`sales?select=id&wa_chat_id=eq.${encodeURIComponent(chatId)}&created_at=gte.${since}&limit=1`);
      return { exists: rows.length > 0 };
    }
    const p = clip(phone, 30);
    if (!p) return { exists: false };
    const rows = await rest(`sales?select=id&customer_phone=eq.${encodeURIComponent(p)}&created_at=gte.${since}&limit=1`);
    return { exists: rows.length > 0 };
  }

  // Últimas 20 vendas registradas pela extensão
  async function fetchChatSales() {
    if (!(await salesOrigin())) throw new Error(ENGINE_MISSING);
    return rest('sales?select=id,customer_name,total_sale_price,status,sale_date,created_at,wa_chat_id&wa_chat_id=not.is.null&order=created_at.desc&limit=20');
  }

  // Contato da conversa (cria e guarda o chat_id se preciso) + "tirar das automações e pôr em Cliente"
  async function saleContactLabels({ chatId, name, phone, addLabelId, removeLabelIds }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const add = addLabelId ? checkUuid(addLabelId, 'Etiqueta inválida') : null;
    const remove = Array.isArray(removeLabelIds) ? removeLabelIds.slice(0, 50).map((l) => checkUuid(l, 'Etiqueta inválida')) : [];
    const ph = phoneOfChat(chatId) || (typeof phone === 'string' && /^\d{8,15}$/.test(phone.replace(/\D/g, '')) ? phone.replace(/\D/g, '') : null);
    let found = (await contactRowsByChats([chatId]))[chatId];
    // 2.6.3: contato com o chat_id desta conversa mas telefone de outra pessoa: não usa (evita etiquetar a pessoa errada)
    if (found && found.phone && ph && found.phone !== ph) found = null;
    let contactId = found && found.id;
    if (!contactId) {
      const nm = clip(name, 100);
      const c = ph ? await ensureContact({ key: `tel:${ph}`, phone: ph, name: nm }) : nm ? await ensureContact({ key: nameKey(nm), phone: null, name: nm }) : null;
      if (!c) return { contactId: null, labelIds: [] };
      await rememberChatId(c, chatId).catch(() => {});
      contactId = c.id;
    }
    for (const l of remove) await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${l}`, { method: 'DELETE' });
    if (add) await followAdd({ contactId, labelId: add });
    return { contactId, labelIds: await labelIdsOf(contactId) };
  }

  // Gatilho "venda registrada": contatos das vendas registradas pela extensão nos últimos dias
  async function saleTriggerCandidates({ sinceDays = 2 } = {}) {
    if (!(await salesOrigin())) return [];
    const days = intIn(Number(sinceDays) || 2, 1, 30, 'Dias');
    const since = encodeURIComponent(new Date(Date.now() - days * 86400000).toISOString());
    const sales = await rest(`sales?select=id,wa_chat_id,created_at&wa_chat_id=not.is.null&created_at=gte.${since}&order=created_at.asc&limit=500`);
    if (!sales.length) return [];
    const byChat = await contactsByChats(sales.map((s) => s.wa_chat_id));
    const ids = [...new Set(Object.values(byChat).map((c) => c.id))];
    if (!ids.length) return [];
    const cols = (await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone';
    const contacts = await rest(`wa_contacts?select=${cols}&id=in.${inList(ids)}`);
    const links = await restAll(`wa_contact_labels?select=contact_id,label_id,created_at&contact_id=in.${inList(ids)}&order=contact_id.asc,label_id.asc`);
    const info = new Map(contacts.map((c) => [c.id, { id: c.id, name: c.name || null, phone: c.phone || null, chat_id: c.chat_id || null, labelIds: [], links: [] }]));
    links.forEach((l) => { const c = info.get(l.contact_id); if (c) { c.labelIds.push(l.label_id); c.links.push({ label_id: l.label_id, created_at: l.created_at }); } });
    return sales.filter((s) => byChat[s.wa_chat_id] && info.has(byChat[s.wa_chat_id].id))
      .map((s) => ({ ...info.get(byChat[s.wa_chat_id].id), chat_id: info.get(byChat[s.wa_chat_id].id).chat_id || s.wa_chat_id, sale_id: s.id }));
  }

  // ── Conversões do Facebook (2.4.0): Edge Function meta-purchase-event ──
  // A extensão só chama a função (mesmo host do Supabase, com o login do usuário). O token do
  // Facebook fica nos secrets da função; aqui não existe.

  const CONV_TABLE = 'wa_conversion_events';
  const META_FN = 'meta-purchase-event';

  async function callMetaFunction(body) {
    const { SUPABASE_URL } = cfg();
    let res;
    try {
      res = await supaFetch(`${SUPABASE_URL}/functions/v1/${META_FN}`, json('POST', 'return=minimal', body));
    } catch {
      throw new Error('Sem conexão com o servidor');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  }

  // Função publicada? Secrets configurados? (só sim/não, nunca os valores)
  async function metaStatus() {
    const r = await callMetaFunction({ check: true });
    if (r.status === 404) return { published: false, loggedIn: null, configured: null };
    if (r.status === 401) return { published: true, loggedIn: false, configured: null };
    const c = r.data && r.data.configured;
    return { published: true, loggedIn: true, configured: c ? { token: !!c.token, dataset: !!c.dataset, waba: !!c.waba, test_code: !!c.test_code } : null };
  }

  // 2.6.0: anúncio que vai junto (Compra e Contato): id, título, app, conversionSource e o código de clique
  const adBody = (ad) => ({
    title: clip(ad.title, 200), source_id: clip(ad.source_id, 100), source_app: clip(ad.source_app, 40), conversion_source: clip(ad.conversion_source, 40),
    ctwa_clid: typeof ad.ctwa_clid === 'string' && /^[\w.:=+/-]{8,500}$/.test(ad.ctwa_clid) ? ad.ctwa_clid : null,
  });

  async function sendPurchaseEvent({ event }) {
    const e = event || {};
    if (typeof e.event_id !== 'string' || !UUID_RE.test(e.event_id)) throw new Error('Identificador do evento inválido');
    const value = Number(e.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new Error('Valor deve ser maior que 0 e até 100.000');
    if (typeof e.chat_id !== 'string' || !SCHED_CHAT_RE.test(e.chat_id)) throw new Error('Conversa inválida');
    const ad = e.ad && typeof e.ad === 'object' ? e.ad : {};
    const body = {
      chat_id: e.chat_id, phone: String(e.phone || '').replace(/\D/g, '').slice(0, 15), contact_name: clip(e.contact_name, 100),
      value: Math.round(value * 100) / 100, currency: 'BRL', event_time: Math.floor(Number(e.event_time)), event_id: e.event_id,
      description: clip(e.description, 200), test: e.test === true,
      ad: adBody(ad),
    };
    const r = await callMetaFunction(body);
    if (r.status === 404) throw new Error('A função meta-purchase-event ainda não foi publicada no Supabase');
    if (r.status === 401) throw new Error('Entre com sua conta do sistema (aviso no topo do painel)');
    if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || `Erro ${r.status}`);
    return { events_received: r.data.events_received ?? 0, fbtrace_id: r.data.fbtrace_id || null, duplicate: !!r.data.duplicate, method: r.data.method || null, test: !!r.data.test, retried_without_clid: !!r.data.retried_without_clid };
  }

  // 2.6.0: "Contato" (lead novo de anúncio). Sem valor; a Edge Function gera o event_id pela conversa
  // (um por conversa, nunca duplica). Precisa do telefone ou do código de clique.
  async function sendContactEvent({ event }) {
    const e = event || {};
    if (typeof e.chat_id !== 'string' || !SCHED_CHAT_RE.test(e.chat_id)) throw new Error('Conversa inválida');
    const ad = e.ad && typeof e.ad === 'object' ? e.ad : {};
    const body = {
      event_name: 'Contact', chat_id: e.chat_id, phone: String(e.phone || '').replace(/\D/g, '').slice(0, 15), contact_name: clip(e.contact_name, 100),
      currency: 'BRL', event_time: Math.floor(Number(e.event_time)), test: e.test === true, ad: adBody(ad),
    };
    const r = await callMetaFunction(body);
    if (r.status === 404) throw new Error('A função meta-purchase-event ainda não foi publicada no Supabase');
    if (r.status === 401) throw new Error('Entre com sua conta do sistema (aviso no topo do painel)');
    if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || `Erro ${r.status}`);
    return { events_received: r.data.events_received ?? 0, duplicate: !!r.data.duplicate, method: r.data.method || null, test: !!r.data.test };
  }

  // 2.6.0: interruptor do "Contato" automático, guardado em system_config (vale para todos os computadores;
  // sem migration). since = quando foi ligado: só leads que chegarem depois disso.
  const META_CONTACT_KEY = 'wa_meta_contact';
  async function metaContactConfig() {
    const rows = await rest(`system_config?select=key,value&key=eq.${META_CONTACT_KEY}`);
    let v = null;
    try { v = rows.length ? JSON.parse(rows[0].value) : null; } catch { v = null; }
    return { on: !!(v && v.on === true), since: v && typeof v.since === 'string' ? v.since : null, test: !!(v && v.test === true) };
  }
  async function setMetaContactConfig({ on, test }) {
    if (typeof on !== 'boolean' || typeof test !== 'boolean') throw new Error('Valor inválido');
    const cur = await metaContactConfig();
    const since = on ? (cur.on && cur.since ? cur.since : new Date().toISOString()) : null;
    const value = JSON.stringify({ on, since, test });
    await rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key: META_CONTACT_KEY, value, updated_at: new Date().toISOString() }));
    return { on, since, test };
  }

  // ── 2.6.2: anúncio de onde o lead veio (wa_ad_attribution; migration 20261104160000) ──
  // Uma linha por conversa. Gravar de novo não sobrescreve: só completa o ctwa_clid se estava vazio.
  const AD_TABLE = 'wa_ad_attribution';
  const AD_COLS = 'chat_id,phone,contact_name,ad_id,ad_title,source_app,source_url,conversion_source,ctwa_clid,first_message_at,created_at';

  async function getAdAttribution({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { row: null };
    try {
      const rows = await rest(`${AD_TABLE}?select=${AD_COLS}&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`);
      return { row: rows.length ? rows[0] : null };
    } catch (err) {
      if (tableMissing(err, [AD_TABLE])) return { row: null, missing: true };
      throw err;
    }
  }

  function checkAttribution(it) {
    const x = it || {};
    if (typeof x.chatId !== 'string' || !SCHED_CHAT_RE.test(x.chatId)) throw new Error('Conversa inválida');
    const ad = x.ad && typeof x.ad === 'object' ? x.ad : {};
    const url = clip(ad.sourceUrl, 500);
    const t = Number(x.t);
    return {
      chat_id: x.chatId,
      phone: typeof x.phone === 'string' && /^\d{8,15}$/.test(x.phone) ? x.phone : null,
      contact_name: clip(x.name, 100),
      ad_id: clip(ad.sourceId, 100), ad_title: clip(ad.title, 200), source_app: clip(ad.sourceApp, 40),
      source_url: url && /^https?:\/\//.test(url) ? url : null, conversion_source: clip(ad.conversionSource, 40),
      ctwa_clid: typeof ad.ctwaClid === 'string' && /^[\w.:=+/-]{8,500}$/.test(ad.ctwaClid) ? ad.ctwaClid : null,
      first_message_at: Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null,
    };
  }

  // Grava as conversas que ainda não estão na tabela; as que já estão ficam como estão (só ganham o
  // ctwa_clid se ele estava vazio). Uma leitura por lote de 100 + uma gravação por lote.
  async function saveAdAttributions({ items }) {
    if (!Array.isArray(items) || items.length > 3000) throw new Error('Lista inválida');
    const rows = [];
    const seen = new Set();
    items.forEach((it) => { const r = checkAttribution(it); if (!seen.has(r.chat_id)) { seen.add(r.chat_id); rows.push(r); } });
    let added = 0;
    let completed = 0;
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100);
        const have = new Map((await rest(`${AD_TABLE}?select=chat_id,ctwa_clid&chat_id=in.${inList(part.map((r) => r.chat_id))}`)).map((r) => [r.chat_id, r]));
        const fresh = part.filter((r) => !have.has(r.chat_id));
        if (fresh.length) {
          await rest(`${AD_TABLE}?on_conflict=chat_id`, json('POST', 'resolution=ignore-duplicates,return=minimal', fresh));
          added += fresh.length;
        }
        for (const r of part.filter((x) => have.has(x.chat_id) && !have.get(x.chat_id).ctwa_clid && x.ctwa_clid)) {
          await rest(`${AD_TABLE}?chat_id=eq.${encodeURIComponent(r.chat_id)}&ctwa_clid=is.null`, json('PATCH', 'return=minimal', { ctwa_clid: r.ctwa_clid, updated_at: new Date().toISOString() }));
          completed++;
        }
      }
    } catch (err) {
      if (tableMissing(err, [AD_TABLE])) throw new Error(ENGINE_MISSING);
      throw err;
    }
    return { added, completed };
  }

  // 2.6.0: nome e telefone salvos no CRM para a conversa (sem criar nada)
  async function chatContactInfo({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { name: null, phone: null };
    const c = (await contactRowsByChats([chatId]))[chatId];
    return { name: c && c.name ? c.name : null, phone: c && c.phone ? c.phone : null };
  }

  async function convRest(path) {
    try {
      return await rest(path);
    } catch (err) {
      if (tableMissing(err, [CONV_TABLE])) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // 2.6.0: event_name, se a coluna existir; senão o "Contato" vem marcado no error ("evento: Contact")
  const convEventName = () => probe('wa_conversion_events.event_name', () => hasColumn(CONV_TABLE, 'event_name'), 30 * 60 * 1000);
  async function fetchConversions({ limit = 50 } = {}) {
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const cols = `event_id,chat_id,contact_name,value,ad_title,ad_id,method,test,status,events_received,error,created_at${(await convEventName()) ? ',event_name' : ''}`;
    const rows = await convRest(`${CONV_TABLE}?select=${cols}&order=created_at.desc&limit=${lim}`);
    return rows.map((r) => {
      const marked = typeof r.error === 'string' && /^evento: Contact/.test(r.error);
      const error = marked ? r.error.replace(/^evento: Contact( · )?/, '') || null : r.error;
      return { ...r, event_name: r.event_name || (marked ? 'Contact' : 'Purchase'), error };
    });
  }

  // Evento já enviado para esta conversa nos últimos 7 dias (para avisar antes)
  async function recentConversion({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { exists: false };
    const since = encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString());
    try {
      const rows = await convRest(`${CONV_TABLE}?select=value,created_at,test&chat_id=eq.${encodeURIComponent(chatId)}&status=eq.enviado&value=not.is.null&created_at=gte.${since}&order=created_at.desc&limit=1`);
      return rows.length ? { exists: true, value: Number(rows[0].value), at: rows[0].created_at, test: !!rows[0].test } : { exists: false };
    } catch (err) {
      if (err.message === ENGINE_MISSING) return { exists: false, missing: true };
      throw err;
    }
  }

  // Valor padrão: total da última venda desta conversa no ERP (pela conversa ou pelo telefone)
  async function lastChatSaleValue({ chatId, phone }) {
    const cols = 'total_sale_price,sale_date';
    let rows = [];
    if ((await salesOrigin()) && typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId)) {
      rows = await rest(`sales?select=${cols}&wa_chat_id=eq.${encodeURIComponent(chatId)}&status=neq.cancelado&status=neq.reembolsado&order=created_at.desc&limit=1`);
    }
    const p = clip(phone, 30);
    if (!rows.length && p) rows = await rest(`sales?select=${cols}&customer_phone=eq.${encodeURIComponent(p)}&status=neq.cancelado&status=neq.reembolsado&order=created_at.desc&limit=1`);
    return rows.length ? { value: Number(rows[0].total_sale_price) || null } : { value: null };
  }

  root.WaApi = {
    engineActivity, clearReadCache,
    nativeLabelEvents, nativeLabelSweep, nativeLabelCandidates, activeEnrollments, enrollmentCandidates, enrollContact,
    leaveAutomation, chatAutomationState,
    metaStatus, sendPurchaseEvent, fetchConversions, recentConversion, lastChatSaleValue,
    sendContactEvent, metaContactConfig, setMetaContactConfig, chatContactInfo, getAdAttribution, saveAdAttributions,
    erpCatalog, createSaleFromChat, recentChatSale, fetchChatSales, saleContactLabels, saleTriggerCandidates,
    fetchAutomations, saveAutomation, setAutomationActive, deleteAutomation, automationRuns, automationReserve,
    automationUnreserve, applySendLabels, getContactName,
    fetchCampaigns, saveCampaign, deleteCampaign, previewCampaign, startCampaign, campaignAction, nextCampaignTarget,
    claimTarget, finishTarget, campaignTargets, simulateCampaign, duplicateCampaign,
    getEngineSettings, updateEngineSettings, claimLease, sendCounts, lastSendAt, logSend, finishSendLog, fetchSendLog,
    chatContact, ensureNoSendLabel, fetchFlows, saveFlow, setFlowActive, deleteFlow, flowCandidates, contactLabelIds,
    followReserve, followAdd, followMove, ENGINE_MISSING,
    fetchSchedules, createSchedule, cancelSchedule, dueSchedules, claimSchedule, finishSchedule,
    saveItem, deleteItem, createCategory, renameCategory, deleteCategory, uploadFile, partsTableExists,
    fetchMediaLibrary, createMediaFolder, renameMediaFolder, deleteMediaFolder, reorderMediaFolders, uploadMedia, updateMedia,
    incrementMediaUsage, mediaUsage, deleteMedia, importMediaFromItems,
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel,
    fetchLabelCounts, fetchLabelClients,
    PALETTE, fetchSchema, createLabel, updateLabel, deleteLabel, reorderLabels,
    getContactNote, setContactNote, bulkAddContactsToLabel, moveContactLabel, fetchAllLabelClients,
  };
})(globalThis);
