// Acesso ao Supabase (REST + Storage) usado pelo background.
// Escreve só a pedido de um clique no painel: wa_items.usage_count (+1), as etiquetas CRM
// (wa_labels, wa_contacts, wa_contact_labels) e a biblioteca pelo editor (wa_categories, wa_items,
// wa_item_parts e arquivos novos no bucket wa-media).
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

  async function rest(path, init = {}) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(init.headers || {}),
      },
    });
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

  function checkIdentity(identity) {
    const { key, phone, name } = identity || {};
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
    if (typeof key !== 'string') throw new Error('Identificação inválida');
    if (key.startsWith('tel:')) {
      if (!/^\d{8,15}$/.test(phone || '') || key !== `tel:${phone}`) throw new Error('Telefone inválido');
      return { key, phone, name: cleanName };
    }
    if (!cleanName || key !== nameKey(cleanName)) throw new Error('Identificação inválida');
    return { key, phone: null, name: cleanName };
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
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
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
    const rows = await rest(`wa_contacts?select=id,key&key=in.${inList(list.map((c) => c.key))}`);
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
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
    const path = `${crypto.randomUUID()}/${sanitizeFileName(fileName)}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': m, 'x-upsert': 'false' },
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

  root.WaApi = {
    saveItem, deleteItem, createCategory, renameCategory, deleteCategory, uploadFile, partsTableExists,
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel,
    fetchLabelCounts, fetchLabelClients,
    PALETTE, fetchSchema, createLabel, updateLabel, deleteLabel, reorderLabels,
    getContactNote, setContactNote, bulkAddContactsToLabel, moveContactLabel, fetchAllLabelClients,
  };
})(globalThis);
