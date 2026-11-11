// Instagram — HISTÓRICO (stories e foto do dia) na edge function "instagram", com a Graph API SIMULADA (nunca chama a
// Meta de verdade) e o banco em memória.   node scripts/tests/igHistory.test.ts
import assert from 'node:assert/strict';
import { handleCollect, spDay, type DailyAccountRow, type DailyMediaRow, type HistStore, type StoryRow } from '../../supabase/functions/instagram/collect.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);
const IG = '17841442995645189';
const TOKEN = 'EAAG-token-do-sistema';
const NOW = Date.parse('2026-11-12T13:00:00.000Z'); // 10h em SP
const H = 3600000;

function memStore(seedDays: string[] = []) {
  const db = { stories: new Map<string, Any>(), account: new Map<string, Any>(seedDays.map((d) => [d, { day: d }])), media: new Map<string, Any>(), log: [] as Any[] };
  const store: HistStore = {
    cronKey: async () => 'chave-da-rotina',
    upsertStories: async (rows: StoryRow[]) => { rows.forEach((r) => db.stories.set(r.id, { ...(db.stories.get(r.id) || { first_seen_at: new Date(NOW).toISOString() }), ...r })); },
    upsertDailyAccount: async (rows: DailyAccountRow[]) => { rows.forEach((r) => db.account.set(r.day, { ...r })); },
    upsertDailyMedia: async (rows: DailyMediaRow[]) => { rows.forEach((r) => db.media.set(`${r.day}|${r.media_id}`, { ...r })); },
    accountDays: async (from, to) => [...db.account.keys()].filter((d) => d >= from && d <= to),
    log: async (row) => { db.log.push(row); },
  };
  return { db, store };
}

// Graph API simulada (só GET)
function graph(o: { stories?: Any[]; storyIns?: Record<string, Record<string, number>>; reject?: string[]; fatal?: boolean } = {}) {
  const calls: Any[] = [];
  const res = (status: number, b: Any) => ({ ok: status === 200, status, json: async () => b });
  const fetch = async (url: string) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+\//, '');
    const q = u.searchParams;
    const metrics = (q.get('metric') || '').split(',').filter(Boolean);
    calls.push({ path, metric: q.get('metric'), breakdown: q.get('breakdown'), since: q.get('since'), token: q.get('access_token') });
    if (o.fatal) return res(400, { error: { message: `Token inválido access_token=${TOKEN}`, code: 190 } });
    const bad = metrics.filter((m) => (o.reject || []).includes(m));
    if (bad.length) return res(400, { error: { message: `(#100) metric ${bad[0]} not supported`, code: 100 } });
    if (path === `${IG}/stories`) return res(200, { data: o.stories || [] });
    if (path === IG) return res(200, { id: IG, followers_count: 12345 });
    if (path === `${IG}/media`) return res(200, { data: [{ id: '1801', media_type: 'VIDEO', media_product_type: 'REELS', caption: 'Reel', permalink: 'https://instagram.com/p/1', timestamp: new Date(NOW - 5 * 24 * H).toISOString().replace('.000Z', '+0000'), thumbnail_url: 'https://x/t.jpg' }], paging: {} });
    if (path === `${IG}/insights`) {
      const day = spDay(Number(q.get('since')) * 1000 + H);
      const n = Number(day.slice(8, 10));
      if (metrics[0] === 'follows_and_unfollows') return res(200, { data: [{ name: 'follows_and_unfollows', total_value: { breakdowns: [{ results: [{ dimension_values: ['FOLLOWER'], value: 10 + n }, { dimension_values: ['NON_FOLLOWER'], value: 2 }] }] } }] });
      return res(200, { data: metrics.map((m) => ({ name: m, total_value: { value: m === 'reach' ? 1000 + n : 100 + n } })) });
    }
    const ins = path.match(/^(\d+)\/insights$/);
    if (ins) {
      const v = (o.storyIns || {})[ins[1]] || {};
      if (q.get('breakdown') === 'story_navigation_action_type') return res(200, { data: [{ name: 'navigation', total_value: { value: v.navigation ?? 0, breakdowns: [{ results: [['TAP_FORWARD', v.taps_forward], ['TAP_BACK', v.taps_back], ['TAP_EXIT', v.exits], ['SWIPE_FORWARD', v.swipe_forward]].filter((x) => x[1] != null).map(([k, val]) => ({ dimension_values: [k], value: val })) }] } }] });
      return res(200, { data: metrics.map((m) => ({ name: m, values: [{ value: v[m] ?? 0 }] })) });
    }
    return res(400, { error: { message: `rota não simulada ${path}`, code: 100 } });
  };
  return { fetch, calls };
}
const deps = (g: Any, store: HistStore, extra: Any = {}) => ({ token: TOKEN, igUserId: IG, getUser: async (j: string) => (j === 'jwt-ok' ? { id: 'u1' } : null), fetch: g.fetch, now: () => NOW, store, ...extra });
const story = (id: string, hoursAgo: number, type = 'IMAGE') => ({ id, media_type: type, media_url: `https://x/${id}.jpg`, thumbnail_url: `https://x/${id}-t.jpg`, permalink: `https://instagram.com/stories/x/${id}`, timestamp: new Date(NOW - hoursAgo * H).toISOString().replace('.000Z', '+0000') });

test('acesso: só com a chave da rotina (x-cron-key) ou com login do ERP', async () => {
  const { store } = memStore();
  const g = graph();
  assert.equal((await handleCollect(null, null, { action: 'collect_stories' }, deps(g, store))).status, 401);
  assert.equal((await handleCollect(null, 'errada', { action: 'collect_stories' }, deps(g, store))).status, 401);
  assert.equal((await handleCollect('Bearer anon-key', 'chave-da-rotina', { action: 'collect_stories' }, deps(g, store))).status, 200);
  assert.equal((await handleCollect('Bearer jwt-ok', null, { action: 'collect_daily' }, deps(g, store))).status, 200);
  assert.equal((await handleCollect('Bearer jwt-ok', null, { action: 'collect_qualquer' }, deps(g, store))).status, 400);
  assert.ok(g.calls.every((c: Any) => c.token === TOKEN), 'token só na chamada do servidor');
});
test('stories: lê os ativos com os insights e o detalhe da navegação; cada hora atualiza e fica a ÚLTIMA leitura', async () => {
  const { db, store } = memStore();
  const g = graph({ stories: [story('901', 3), story('902', 1, 'VIDEO')], storyIns: { 901: { views: 300, reach: 250, replies: 4, shares: 2, total_interactions: 9, follows: 1, profile_visits: 7, navigation: 400, taps_forward: 300, taps_back: 20, exits: 70, swipe_forward: 10 }, 902: { views: 120, reach: 100 } } });
  const r = await handleCollect(null, 'chave-da-rotina', { action: 'collect_stories' }, deps(g, store));
  assert.equal(r.json.stories, 2);
  const s = db.stories.get('901');
  assert.deepEqual([s.views, s.reach, s.replies, s.shares, s.total_interactions, s.follows, s.profile_visits, s.navigation, s.taps_forward, s.taps_back, s.exits, s.swipe_forward], [300, 250, 4, 2, 9, 1, 7, 400, 300, 20, 70, 10]);
  assert.equal(s.expires_at, new Date(NOW - 3 * H + 24 * H).toISOString());
  assert.equal(db.stories.get('902').thumb, 'https://x/902-t.jpg', 'vídeo: a miniatura');
  // 1 h depois: números maiores substituem; métrica recusada agora não apaga o valor de antes
  const g2 = graph({ stories: [story('901', 4)], storyIns: { 901: { views: 350, reach: 280, replies: 5 } }, reject: ['shares'] });
  const r2 = await handleCollect(null, 'chave-da-rotina', { action: 'collect_stories' }, deps(g2, store, { now: () => NOW + H }));
  const s2 = db.stories.get('901');
  assert.deepEqual([s2.views, s2.reach, s2.replies, s2.shares], [350, 280, 5, 2]);
  assert.ok((r2.json.warnings as string[]).some((w) => /shares/.test(w)), 'métrica recusada: aviso');
  assert.ok(db.log.some((l: Any) => l.kind === 'stories' && l.ok && l.warnings.some((w: string) => /shares/.test(w))), 'aviso no ig_collect_log');
  assert.equal(db.stories.get('902').views, 120, 'o story que expirou fica com a última leitura');
  assert.ok(g.calls.some((c: Any) => c.path === '901/insights' && c.breakdown === 'story_navigation_action_type'));
});
test('diário: ontem com seguidores + os dias que faltam dos últimos 30; posts dos últimos 30 dias (foto do dia)', async () => {
  const yesterday = spDay(NOW - 24 * H);
  const have = Array.from({ length: 25 }, (_, i) => spDay(NOW - (i + 2) * 24 * H)); // já tem 25 dias (anteontem para trás)
  const { db, store } = memStore(have);
  const g = graph();
  const r = await handleCollect('Bearer jwt-ok', null, { action: 'collect_daily' }, deps(g, store));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.days, 5, 'ontem + os 4 dias que faltavam dos últimos 30');
  const y = db.account.get(yesterday);
  const n = Number(yesterday.slice(8, 10));
  assert.deepEqual([y.followers, y.reach, y.views, y.accounts_engaged, y.total_interactions, y.profile_views, y.profile_links_taps, y.gained, y.lost], [12345, 1000 + n, 100 + n, 100 + n, 100 + n, 100 + n, 100 + n, 10 + n, 2]);
  const old = [...db.account.values()].find((x: Any) => x.day !== yesterday && x.reach != null);
  assert.equal(old.followers, null, 'dia completado depois: sem a foto dos seguidores');
  assert.equal(db.media.get(`${yesterday}|1801`).kind, 'REEL');
  assert.ok(g.calls.every((c: Any) => !/\/(media_publish|messages|comments)/.test(c.path)), 'só leitura');
  assert.ok(db.log.some((l: Any) => l.kind === 'diario' && l.ok));
});
test('erro grave da Meta (token): para, responde o erro SEM o token e registra no log', async () => {
  const { db, store } = memStore();
  const r = await handleCollect(null, 'chave-da-rotina', { action: 'collect_stories' }, deps(graph({ fatal: true }), store));
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.json).includes(TOKEN) && !JSON.stringify(db.log).includes(TOKEN), JSON.stringify(r.json));
  assert.ok(db.log.some((l: Any) => !l.ok));
});
test('sem stories ativos: nada gravado, sem erro', async () => {
  const { db, store } = memStore();
  const r = await handleCollect(null, 'chave-da-rotina', { action: 'collect_stories' }, deps(graph({ stories: [] }), store));
  assert.deepEqual([r.status, r.json.stories, db.stories.size], [200, 0, 0]);
});

(async () => {
  let ok = 0;
  for (const [n, f] of tests) { try { await f(); ok++; console.log(`ok   ${n}`); } catch (e) { console.log(`FAIL ${n}\n     ${String((e as Error).stack || e).split('\n').slice(0, 5).join('\n     ')}`); process.exitCode = 1; } }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
