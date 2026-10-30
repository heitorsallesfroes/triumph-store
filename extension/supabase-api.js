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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
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

  root.WaApi = { fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES };
})(globalThis);
