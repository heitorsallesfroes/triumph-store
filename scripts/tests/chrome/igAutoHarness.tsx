// Página do teste no Chrome real do Instagram FASE 3 (scripts/tests/igAutoChrome.test.ts): a página Instagram (abas
// Visão geral / Direct / Automações) com o Supabase falso (fakeSupabase.ts, dados em window.__DB). A edge function
// "ig-manage" é a DE VERDADE (supabase/functions/ig-manage/manage.ts), rodando aqui no navegador sobre o banco falso,
// com a Meta SIMULADA (window.__META guarda cada chamada). Nada sai do Chrome.
// ?cfg=semsegredos → sem IG_APP_ID/IG_APP_SECRET/IG_WEBHOOK_VERIFY_TOKEN; ?cfg=desconectado → sem conta;
// ?cfg=vencendo → token vence em 5 dias e a renovação automática falhou.
import { createRoot } from 'react-dom/client';
import Instagram from '../../../src/pages/Instagram';
import { supabase } from '../../../src/lib/supabase';
import { parseRoute, writeRoute } from '../../../src/lib/erpRoute';
import { handleManage } from '../../../supabase/functions/ig-manage/manage';
import { parseSettings } from '../../../supabase/functions/_shared/igRules';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as unknown as Any;
g.__WRITES = [];
g.__FN_CALLS = [];
g.__META = [];
g.__CONFIRMS = [];
window.confirm = (m?: string) => { g.__CONFIRMS.push(String(m)); return true; };
(supabase as Any).auth.getSession = async () => ({ data: { session: { access_token: 'jwt-do-erp', user: { id: 'u1', email: 'teste@loja' } } } });
const cfg = new URLSearchParams(location.search).get('cfg') || '';
const tbl = (t: string): Any[] => (g.__DB[t] = g.__DB[t] || []);

// gravações do ERP: system_config (upsert) e ig_automations (insert/update) gravam de verdade no banco falso
const from0 = supabase.from.bind(supabase) as (t: string) => Any;
let seq = 0;
(supabase as Any).from = (table: string) => {
  const q = from0(table);
  (['insert', 'update', 'upsert', 'delete'] as const).forEach((op) => { const orig = q[op].bind(q); q[op] = (data?: Any, ...rest: unknown[]) => { g.__WRITES.push({ table, op, data }); return orig(data, ...rest); }; });
  if (table === 'system_config') {
    q.upsert = (row: Any) => {
      g.__WRITES.push({ table, op: 'upsert', data: row });
      const cur = tbl('system_config').find((r) => r.key === row.key);
      if (cur) Object.assign(cur, row); else tbl('system_config').push({ ...row });
      return Promise.resolve({ data: null, error: null });
    };
  }
  if (table === 'ig_automations') {
    const rows = () => tbl('ig_automations');
    q.insert = (row: Any) => {
      g.__WRITES.push({ table, op: 'insert', data: row });
      return { select: async () => {
        if (rows().some((r) => r.code === row.code)) return { data: null, error: { message: 'duplicate key value violates unique constraint "ig_automations_code_key"' } };
        const r = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ...row };
        rows().push(r);
        return { data: [{ ...r }], error: null };
      } };
    };
    q.update = (row: Any) => {
      g.__WRITES.push({ table, op: 'update', data: row });
      const doIt = (id: string) => { const r = rows().find((x) => x.id === id); if (r) Object.assign(r, row); return r; };
      return { eq: (_c: string, id: string) => {
        const p: Any = Promise.resolve().then(() => { doIt(id); return { data: null, error: null }; });
        p.select = async () => { const r = doIt(id); return { data: r ? [{ ...r }] : [], error: null }; };
        return p;
      } };
    };
  }
  return q;
};

// ── a Meta SIMULADA (para a ig-manage de verdade) ──
const metaFetch = async (url: string, init: Any = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  g.__META.push({ url, method: init.method || 'GET', body });
  const res = (status: number, b: Any) => ({ ok: status < 300, status, json: async () => b });
  if (/\/me\/media/.test(url)) return res(200, { data: g.__POSTS || [] });
  if (/\/me\/messages$/.test(url)) {
    if (body.message.attachment && g.__REJECT_BUTTON) return res(400, { error: { message: 'Template não suportado', code: 100 } });
    return res(200, { message_id: `m_out_${g.__META.length}` });
  }
  if (/refresh_access_token/.test(url)) return res(200, { access_token: 'IGAA-renovado', expires_in: 5184000 });
  return res(404, { error: { message: 'não simulado' } });
};
const store: Any = {
  async settings() { return parseSettings(tbl('system_config')); },
  async account() { return g.__ACCOUNT ? { ...g.__ACCOUNT } : null; },
  async patchAccount(p: Any) { Object.assign(g.__ACCOUNT, p); },
  async saveAccount(p: Any) { g.__ACCOUNT = { ...p }; },
  async conversation(igsid: string) { const c = tbl('ig_conversations').find((x) => x.igsid === igsid); return c ? { ...c } : null; },
  async saveMessage(row: Any) { if (tbl('ig_messages').some((m) => m.mid === row.mid)) return false; tbl('ig_messages').push({ ...row }); return true; },
  async touchConversation(igsid: string, p: Any) { const c = tbl('ig_conversations').find((x) => x.igsid === igsid); if (c && p.at >= c.last_at) Object.assign(c, { last_at: p.at, last_text: p.text, last_from: p.from }); return c; },
  async markWaSent(igsid: string, at: string, code: string) { const c = tbl('ig_conversations').find((x) => x.igsid === igsid); if (c) Object.assign(c, { wa_sent_at: at, wa_code: code }); },
  async newState(s: string) { g.__STATE = s; },
  async useState() { return false; },
  async kv() { return null; },
  async log(level: string, message: string) { tbl('ig_webhook_log').push({ created_at: new Date().toISOString(), level, message }); },
};
const fetch0 = window.fetch.bind(window);
window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url);
  if (!u.includes('/functions/v1/')) return fetch0(url, init);
  const body = init && init.body ? JSON.parse(String(init.body)) : {};
  g.__FN_CALLS.push({ fn: u.split('/functions/v1/')[1], ...body });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/functions/v1/ig-manage')) {
    const hdr = new Headers((init && init.headers) as HeadersInit);
    const out = await handleManage('POST', 'https://proj.supabase.co/functions/v1/ig-manage', hdr, body, {
      appId: cfg === 'semsegredos' ? '' : '1234567890', appSecret: cfg === 'semsegredos' ? '' : 'segredo', verifyToken: cfg === 'semsegredos' ? '' : 'v',
      supabaseUrl: 'https://jcnvlqfpmmejtzfhfjix.supabase.co', erpUrl: 'https://triumph-store.vercel.app', store, fetch: metaFetch as Any, now: () => Date.now(),
      getUser: async (jwt: string) => (jwt === 'jwt-do-erp' ? { id: 'u1' } : null), randomHex: () => 'ab'.repeat(16),
    });
    return json(out.json, out.status);
  }
  // Visão geral (função "instagram"): não é o foco deste teste
  return json({ success: false, error: 'Visão geral simulada sem dados' }, 400);
};

if (cfg === 'desconectado' || cfg === 'semsegredos') g.__ACCOUNT = null;
// token vencendo (5 dias) e a renovação automática falhando
if (cfg === 'vencendo' && g.__ACCOUNT) Object.assign(g.__ACCOUNT, { token_expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), refresh_error: 'A Meta recusou a renovação' });
writeRoute(parseRoute(location.search) || { page: 'instagram', tab: null });
const el = document.getElementById('root');
if (el) createRoot(el).render(<Instagram />);
