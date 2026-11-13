// Cliente REST mínimo do Supabase (PostgREST) com a chave de servidor. Só roda no backend (função da Vercel).
// As tabelas nfe_config e nfe_notas têm RLS ligada e nenhum acesso para anon/authenticated: só a chave de servidor lê e grava.
export function criarDb({ url, key, fetchFn = fetch }) {
  if (!url || !key) throw new Error('faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel');
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1/`;
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const pedir = async (caminho, init = {}) => {
    const r = await fetchFn(base + caminho, { ...init, headers: { ...H, ...(init.headers || {}) } });
    const texto = await r.text();
    const json = texto ? (() => { try { return JSON.parse(texto); } catch { return texto; } })() : null;
    if (!r.ok) {
      const e = new Error((json && (json.message || json.hint)) || `Supabase HTTP ${r.status}`);
      e.code = json && json.code; e.status = r.status;
      throw e;
    }
    return json;
  };
  return {
    select: (tabela, query = '') => pedir(`${tabela}?${query}`),
    insert: async (tabela, linha) => { const r = await pedir(tabela, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(linha) }); return Array.isArray(r) ? r[0] : r; },
    patch: (tabela, filtro, dados) => pedir(`${tabela}?${filtro}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dados) }),
    rpc: (fn, args) => pedir(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) }),
  };
}
