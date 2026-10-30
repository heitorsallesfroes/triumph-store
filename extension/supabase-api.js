// Acesso ao Supabase (REST + Storage) usado pelo background.
// Só leitura, exceto somar 1 em wa_items.usage_count.
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

  async function fetchLibrary() {
    const [categories, items] = await Promise.all([
      rest('wa_categories?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      rest('wa_items?select=id,category_id,type,title,body,file_url,file_name,file_size,usage_count,position,created_at&order=position.asc,created_at.asc'),
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

  async function fetchLabels() {
    return rest('wa_labels?select=id,name,color,position&order=position.asc,created_at.asc');
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

  // Clientes de uma etiqueta, mais recentes primeiro, em páginas (máx. 200, abaixo do limite de 1000)
  async function fetchLabelClients({ labelId, offset = 0, limit = 50, search = '' }) {
    if (typeof labelId !== 'string' || !UUID_RE.test(labelId)) throw new Error('Etiqueta inválida');
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const rows = await rest(
      `wa_contact_labels?select=created_at,contact:wa_contacts!inner(id,key,name,phone)` +
      `&label_id=eq.${labelId}&order=created_at.desc,contact_id.asc&offset=${off}&limit=${lim + 1}` +
      clientSearchFilter(search),
    );
    return {
      clients: rows.slice(0, lim).map((r) => ({
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
        byName: String(r.contact.key).startsWith('nome:'),
      })),
      hasMore: rows.length > lim,
    };
  }

  root.WaApi = {
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel,
    fetchLabelCounts, fetchLabelClients,
  };
})(globalThis);
