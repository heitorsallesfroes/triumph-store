// Acesso ao Supabase (REST + Storage) usado pelo background.
// Escreve só: wa_items.usage_count (+1) e as etiquetas CRM (wa_labels, wa_contacts, wa_contact_labels),
// sempre a pedido de um clique no painel.
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

  async function fetchLibrary() {
    const [categories, items] = await Promise.all([
      rest('wa_categories?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      fetchItems(),
    ]);
    return { categories, items };
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

  root.WaApi = {
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel,
    fetchLabelCounts, fetchLabelClients,
    PALETTE, fetchSchema, createLabel, updateLabel, deleteLabel, reorderLabels,
    getContactNote, setContactNote, bulkAddContactsToLabel, moveContactLabel, fetchAllLabelClients,
  };
})(globalThis);
