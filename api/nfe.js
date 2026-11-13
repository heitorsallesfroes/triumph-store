// 🧾 Rota única da NF-e própria (função serverless da Vercel): /api/nfe?op=...
// Só aceita usuário logado no ERP (JWT do Supabase no Authorization; sem login = 401).
// Segredos só em variáveis de ambiente da Vercel: NFE_CERT_B64, NFE_CERT_SENHA, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   GET  ?op=painel                → config, certificado e lista de notas
//   GET  ?op=venda&id=<venda>      → notas da venda
//   GET  ?op=xml&id=<nota>         → XML (nfeProc se autorizada)
//   GET  ?op=sefaz                 → status do serviço (homologação e produção)
//   POST { op:'emitir', ... }      → emite (FASE 1: só homologação)
//   POST { op:'consultar', id }    → consulta uma nota pendente
//   POST { op:'config', ... }      → salva dados do emitente e da numeração
import { criarDb } from './_lib/db.js';
import * as FIS from './_lib/fiscal.js';
import { lerCertificado } from './_lib/nfe.js';

const env = (k) => (process.env[k] || '').trim();
let certCache = null;
function certificadoDoAmbiente() {
  const b64 = env('NFE_CERT_B64'), senha = process.env.NFE_CERT_SENHA || '';
  if (!b64 || !senha) return null;
  if (!certCache || certCache.b64 !== b64) certCache = { b64, cert: lerCertificado(b64, senha) };
  return certCache.cert;
}

// confere o JWT do usuário no Supabase Auth (mesmo login do ERP)
export async function usuarioLogado(req, { url, key, fetchFn = fetch }) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || '');
  const token = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token || token.split('.').length !== 3 || !url || !key) return null;
  try {
    const r = await fetchFn(`${String(url).replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}

export function criarHandler(deps = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const url = deps.url ?? (env('SUPABASE_URL') || env('VITE_SUPABASE_URL'));
    const key = deps.key ?? (env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY'));
    const user = await usuarioLogado(req, { url, key, fetchFn: deps.fetchFn });
    if (!user) return res.status(401).json({ error: 'faça login no ERP' });
    let ctx;
    try {
      ctx = { db: deps.db || criarDb({ url, key, fetchFn: deps.fetchFn }), cert: deps.cert || certificadoDoAmbiente, soapOpts: deps.soapOpts };
    } catch (e) { return res.status(500).json({ error: e.message }); }
    const q = req.query || {};
    try {
      if (req.method === 'GET') {
        if (q.op === 'venda') return res.status(200).json(await FIS.notasDaVenda(ctx, q.id));
        if (q.op === 'xml') return res.status(200).json(await FIS.xml(ctx, q.id));
        if (q.op === 'sefaz') return res.status(200).json(await FIS.statusSefaz(ctx));
        return res.status(200).json(await FIS.painel(ctx));
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (b.op === 'emitir') return res.status(200).json(await FIS.emitir(ctx, b));
      if (b.op === 'consultar') return res.status(200).json(await FIS.consultar(ctx, b.id));
      if (b.op === 'config') return res.status(200).json(await FIS.salvarConfig(ctx, b));
      return res.status(400).json({ error: 'op inválida' });
    } catch (e) {
      const m = String(e && e.message || e);
      if (/nfe_(config|notas|reservar|devolver)/.test(m) && /(exist|vazia|find|schema cache)/i.test(m)) return res.status(200).json({ erro: 'Aplique no Supabase a migration das notas fiscais (supabase/migrations/20261120120000_nfe_emissor.sql).' });
      return res.status(500).json({ error: m.slice(0, 300) });
    }
  };
}

export default criarHandler();
