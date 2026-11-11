// Página do teste no Chrome real (igChrome.test.ts e igHistoryChrome.test.ts): só a aba Instagram, com o Supabase falso (fakeSupabase.ts no lugar de
// src/lib/supabase.ts, com uma sessão de login falsa) e a edge function "instagram" de verdade (ig.ts) rodando
// aqui dentro, mas com a Graph API SIMULADA (window.__GRAPH; nada sai do Chrome). Cada chamada à "Meta" vai para
// window.__GRAPH_CALLS e cada gravação no Supabase para window.__WRITES. Ver scripts/tests/igChrome.test.ts.
import { createRoot } from 'react-dom/client';
import Instagram from '../../../src/pages/Instagram';
import { supabase } from '../../../src/lib/supabase';
import { handle } from '../../../supabase/functions/instagram/ig';
import { handleCollect } from '../../../supabase/functions/instagram/collect';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as unknown as Any;
g.__WRITES = [];
g.__GRAPH_CALLS = [];
g.__FN_CALLS = [];
if (g.__GRAPH) g.__GRAPH.media.sort((a: Any, b: Any) => String(b.raw.timestamp).localeCompare(String(a.raw.timestamp))); // a Meta devolve do mais novo para o mais antigo
const IG = '17841442995645189';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(supabase as Any).auth.getSession = async () => ({ data: { session: { access_token: 'jwt-do-erp', user: { id: 'u1', email: 'teste@loja' } } } });
const from0 = supabase.from.bind(supabase) as (t: string) => Any;
(supabase as Any).from = (table: string) => {
  const q = from0(table);
  (['insert', 'update', 'upsert', 'delete'] as const).forEach((op) => { const orig = q[op].bind(q); q[op] = (data?: Any, ...rest: unknown[]) => { g.__WRITES.push({ table, op }); return orig(data, ...rest); }; });
  return q;
};

// Graph API simulada (só responde GET; o "método" fica registrado)
async function graph(url: string) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v\d+\.\d+\//, '');
  const q = u.searchParams;
  g.__GRAPH_CALLS.push({ method: 'GET', path, metric: q.get('metric'), token: q.get('access_token') });
  const G = g.__GRAPH;
  const res = (o: unknown, status = 200) => ({ ok: status === 200, status, json: async () => o });
  const metrics = (q.get('metric') || '').split(',').filter(Boolean);
  const bad = metrics.filter((m) => (G.reject || []).includes(m));
  if (bad.length) return res({ error: { message: `(#100) The Media Insights API does not support the ${bad[0]} metric`, code: 100 } }, 400);
  if (path === IG) return res(G.profile);
  if (path === `${IG}/insights`) {
    if (metrics[0] === 'follower_demographics') {
      const bd = q.get('breakdown') as string;
      return res({ data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ dimension_keys: [bd], results: (G.audience[bd] || []).map(([k, v]: [string, number]) => ({ dimension_values: [k], value: v })) }] } }] });
    }
    const since = Number(q.get('since')); const until = Number(q.get('until'));
    const cur = since >= G.curSince; // período atual × anterior
    const days = Math.max(1, Math.round((until - since) / 86400));
    const dayIdx = Math.floor((since - G.curSince) / 86400);
    const base = (cur ? G.totalsCur : G.totalsPrev) as Record<string, number>;
    const scale = days === 1 ? 1 / 30 : 1; // período inteiro: os totais do fixture
    return res({ data: metrics.map((m) => m === 'follows_and_unfollows'
      ? { name: m, total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [{ dimension_values: ['FOLLOWER'], value: days === 1 ? 2 + (dayIdx % 3) : Math.round(base.follows * scale) }, { dimension_values: ['NON_FOLLOWER'], value: days === 1 ? 1 : Math.round(base.unfollows * scale) }] }] } }
      : { name: m, total_value: { value: days === 1 ? Math.round((base[m] || 0) / 30 * (1 + (dayIdx % 4) / 4)) : Math.round((base[m] || 0) * scale) } }) });
  }
  // histórico: stories ativos e os insights de cada um (window.__GRAPH.stories = [{ raw, ins }])
  if (path === `${IG}/stories`) return res({ data: (G.stories || []).map((x: Any) => x.raw) });
  const sIns = path.match(/^(\d+)\/insights$/);
  const sto = sIns ? (G.stories || []).find((x: Any) => x.raw.id === sIns[1]) : null;
  if (sto) {
    if (q.get('breakdown') === 'story_navigation_action_type') return res({ data: [{ name: 'navigation', total_value: { value: sto.ins.navigation || 0, breakdowns: [{ results: [['TAP_FORWARD', sto.ins.taps_forward], ['TAP_EXIT', sto.ins.exits]].filter((x) => x[1] != null).map(([k, v]) => ({ dimension_values: [k], value: v })) }] } }] });
    return res({ data: metrics.map((k) => ({ name: k, values: [{ value: sto.ins[k] ?? 0 }] })) });
  }
  if (path === `${IG}/media`) { if (G.mediaDelay) await sleep(G.mediaDelay); return res({ data: G.media.map((m: Any) => m.raw), paging: {} }); }
  const ins = path.match(/^(\d+)\/insights$/);
  if (ins) { const m = G.media.find((x: Any) => x.raw.id === ins[1]); return res({ data: metrics.map((k) => ({ name: k, period: 'lifetime', values: [{ value: m.ins[k] ?? 0 }] })) }); }
  const one = G.media.find((x: Any) => x.raw.id === path);
  if (one) return res({ ...one.raw, owner: { id: IG } });
  return res({ error: { message: 'rota não simulada', code: 100 } }, 400);
}

// a edge function "instagram" (ig.ts) no lugar da rede
const fetch0 = window.fetch.bind(window);
window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  const s = String(url);
  if (!s.includes('/functions/v1/instagram')) return fetch0(url, init);
  const body = init && init.body ? JSON.parse(String(init.body)) : {};
  const auth = (init && init.headers && (init.headers as Record<string, string>).Authorization) || null;
  g.__FN_CALLS.push({ ...body, auth, method: init && init.method });
  if (g.__IG_404) return new Response('{"code":"NOT_FOUND","message":"Requested function was not found"}', { status: 404 });
  const deps = { token: 'TOKEN-SECRETO', getUser: async (jwt: string) => (jwt === 'jwt-do-erp' ? { id: 'u1' } : null), fetch: graph, now: () => Date.now() };
  // coleta do histórico (collect.ts de verdade) gravando no banco falso (window.__DB), como a service role faria
  if (String(body.action || '').startsWith('collect_')) {
    const t = (name: string): Any[] => (g.__DB[name] = g.__DB[name] || []);
    const up = (name: string, key: (x: Any) => string) => async (rows: Any[]) => { rows.forEach((row) => { const i = t(name).findIndex((x) => key(x) === key(row)); if (i >= 0) t(name)[i] = { ...t(name)[i], ...row }; else t(name).push({ first_seen_at: new Date().toISOString(), ...row }); }); };
    const out = await handleCollect(auth, null, body, { ...deps, store: {
      cronKey: async () => null, upsertStories: up('ig_stories', (x) => x.id), upsertDailyAccount: up('ig_daily_account', (x) => x.day), upsertDailyMedia: up('ig_daily_media', (x) => `${x.day}|${x.media_id}`),
      accountDays: async (a: string, b: string) => t('ig_daily_account').map((x) => String(x.day)).filter((d) => d >= a && d <= b),
      log: async (row: Any) => { t('ig_collect_log').push({ created_at: new Date().toISOString(), ...row }); },
    } });
    return new Response(JSON.stringify(out.json), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  }
  const out = await handle(auth, body, deps);
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { 'Content-Type': 'application/json' } });
};

const el = document.getElementById('root');
if (el) createRoot(el).render(<Instagram />);
