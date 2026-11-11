// Testes da aba Instagram, com dados de exemplo. Sem dependências: node scripts/tests/igInsights.test.ts
// 1. Regras de src/lib/igInsights.ts: engajamento, ordenação, melhor formato, melhores dias/horários, top 3,
//    frequência × alcance, ▲▼, público e formatos.
// 2. Edge function (supabase/functions/instagram/ig.ts) com a Graph API SIMULADA (nunca chama a Meta): login
//    obrigatório, só GET, token fora das respostas, métrica recusada pulada com aviso, 90 dias em janelas de 30.
import assert from 'node:assert/strict';
import {
  audienceShare, bestFormat, bestTimes, bioTaps, deltaOf, deltaText, engagementOf, fmtDuration, fmtN, fmtWhen, frequencyVsReach, sortAges, sortMedia, topBy,
  type IgMedia, type IgMetrics, type MediaKind,
} from '../../src/lib/igInsights.ts';
import { bucketsOf, chunksOf, dayOfEndTime, handle, windowsOf, type Deps } from '../../supabase/functions/instagram/ig.ts';

const tests: [string, () => unknown][] = [];
const test = (name: string, fn: () => unknown) => tests.push([name, fn]);

const M = (p: Partial<IgMetrics> = {}): IgMetrics => ({ reach: null, views: null, likes: null, comments: null, saved: null, shares: null, total_interactions: null, follows: null, profile_visits: null, avg_watch_ms: null, total_watch_ms: null, ...p });
const post = (id: string, kind: MediaKind, when: string, p: Partial<IgMetrics>): IgMedia => ({ id, kind, caption: `post ${id}`, permalink: `https://www.instagram.com/p/${id}/`, timestamp: new Date(`${when}-03:00`).toISOString(), thumb: null, metrics: M(p) });

// 2026-11: dia 2 = segunda, 3 = terça, 6 = sexta, 7 = sábado
const LIST: IgMedia[] = [
  post('1', 'REEL', '2026-11-02T19:00:00', { reach: 5000, views: 9000, likes: 300, comments: 20, saved: 80, shares: 50, follows: 40 }),
  post('2', 'REEL', '2026-11-06T20:00:00', { reach: 3000, views: 5000, likes: 150, comments: 10, saved: 30, shares: 10, follows: 15 }),
  post('3', 'CAROUSEL', '2026-11-03T09:00:00', { reach: 2000, views: 3000, likes: 200, comments: 30, saved: 120, shares: 20, follows: 5 }),
  post('4', 'CAROUSEL', '2026-11-07T10:00:00', { reach: 1000, views: 1500, likes: 80, comments: 5, saved: 40, shares: 5, follows: 2 }),
  post('5', 'IMAGE', '2026-11-02T13:00:00', { reach: 800, views: 1000, likes: 40, comments: 2, saved: 3, shares: 1, follows: 0 }),
];

test('taxa de engajamento = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance; sem alcance = null', () => {
  assert.equal(engagementOf(LIST[0].metrics), (300 + 20 + 80 + 50) / 5000);
  assert.equal(engagementOf(M({ reach: 0, likes: 5 })), null);
  assert.equal(engagementOf(M({ reach: 100, likes: 5 })), 0.05);
});

test('ordenar por qualquer métrica: maior primeiro, sem valor no fim', () => {
  assert.deepEqual(sortMedia(LIST, 'views').map((m) => m.id), ['1', '2', '3', '4', '5']);
  assert.deepEqual(sortMedia(LIST, 'saved').map((m) => m.id), ['3', '1', '4', '2', '5']);
  assert.deepEqual(sortMedia(LIST, 'engagement').map((m) => m.id), ['3', '4', '1', '2', '5']);
  const withNull = [...LIST, post('6', 'IMAGE', '2026-11-08T10:00:00', {})];
  assert.equal(sortMedia(withNull, 'follows').at(-1)!.id, '6');
});

test('melhor formato: média de alcance por tipo; formato com 1 post só não disputa', () => {
  const r = bestFormat(LIST);
  assert.equal(r.best!.kind, 'REEL');
  assert.equal(r.best!.reach, 4000);
  assert.equal(r.best!.posts, 2);
  assert.equal(r.bestEngagement!.kind, 'CAROUSEL');
  assert.equal(r.rows.find((x) => x.kind === 'IMAGE')!.posts, 1);
  assert.equal(r.lowData, false);
  assert.match(r.why, /Reel: 4\.000 em 2 posts/);
  // um único post de cada: ninguém tem 2+, vale o maior com aviso de poucos dados
  const one = bestFormat([LIST[4], LIST[2]]);
  assert.equal(one.best!.kind, 'CAROUSEL');
  assert.equal(one.lowData, true);
});

test('melhores dias e horários (São Paulo), só faixas com 2+ posts', () => {
  const t = bestTimes(LIST);
  assert.equal(t.bestDay!.label, 'Segunda'); // posts 1 e 5: média 2.900
  assert.equal(t.bestDay!.reach, 2900);
  assert.equal(t.bestBand!.label, 'Noite (18h–24h)'); // posts 1 e 2: média 4.000
  assert.equal(t.days.find((d) => d.label === 'Sexta')!.posts, 1);
  assert.equal(t.bands.find((b) => b.id === 'manha')!.posts, 2);
  // 19h de SP = 22h UTC: a faixa é a de SP
  assert.equal(bestTimes([LIST[0], LIST[1]]).bands[0].id, 'noite');
});

test('top 3 conteúdos que mais trouxeram seguidores e salvamentos', () => {
  assert.deepEqual(topBy(LIST, 'follows').map((m) => m.id), ['1', '2', '3']);
  assert.deepEqual(topBy(LIST, 'saved').map((m) => m.id), ['3', '1', '4']);
  assert.equal(topBy([LIST[4]], 'follows').length, 0); // 0 seguidores não entra
});

test('frequência × alcance: semanas com mais posts × as outras (3+ semanas)', () => {
  const many = [
    post('a', 'REEL', '2026-10-13T10:00:00', { reach: 1000 }),
    post('b', 'REEL', '2026-10-20T10:00:00', { reach: 1000 }), post('c', 'REEL', '2026-10-21T10:00:00', { reach: 1000 }), post('d', 'REEL', '2026-10-22T10:00:00', { reach: 1000 }),
    post('e', 'REEL', '2026-10-27T10:00:00', { reach: 500 }),
  ];
  const f = frequencyVsReach(many, null, { fromDay: '2026-10-12', toDay: '2026-11-01' }); // 3 semanas: 1, 3, 1 posts
  assert.equal(f.mode, 'week');
  assert.equal(f.rows.length, 3);
  assert.equal(f.high, 3000);
  assert.equal(f.low, 750);
  assert.match(f.text, /Semanas com mais de 1 post: alcance médio de 3\.000 por semana; nas outras: 750/);
});

test('frequência × alcance com poucas semanas: dias com post × sem post (alcance diário da conta)', () => {
  const daily = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((day, i) => ({ day, reach: [3000, 2000, 1000, 1000][i], views: null, gained: null, lost: null }));
  const f = frequencyVsReach([LIST[0], LIST[2]], daily, { fromDay: '2026-11-02', toDay: '2026-11-05' });
  assert.equal(f.mode, 'day');
  assert.equal(f.high, 2500);
  assert.equal(f.low, 1000);
  assert.match(f.text, /Dias com post: alcance médio de 2\.500; dias sem post: 1\.000 \(\+150%\)/);
  assert.equal(frequencyVsReach([], null, { fromDay: '2026-11-02', toDay: '2026-11-05' }).mode, 'none');
});

test('comparação com o período anterior (▲▼)', () => {
  assert.equal(deltaText(deltaOf(120, 100)), '▲ 20%');
  assert.equal(deltaText(deltaOf(80, 100)), '▼ 20%');
  assert.equal(deltaText(deltaOf(100, 100)), '= 0%');
  assert.equal(deltaText(deltaOf(5, 0)), '▲ novo');
  assert.equal(deltaText(deltaOf(null, 10)), '—');
  assert.equal(deltaOf(-5, -10).dir, 'up'); // seguidores líquidos: de −10 para −5 melhorou
});

test('toques no link da bio: website_clicks ou profile_links_taps', () => {
  const t = { reach: 1, views: 1, accounts_engaged: 1, total_interactions: 1, profile_views: 1, website_clicks: null, profile_links_taps: 7, follows: 1, unfollows: 0, net_followers: 1 };
  assert.equal(bioTaps(t), 7);
  assert.equal(bioTaps({ ...t, website_clicks: 3 }), 3);
});

test('público: % sobre o total, faixas etárias em ordem', () => {
  const c = audienceShare([{ key: 'Niterói', value: 30 }, { key: 'Rio de Janeiro', value: 60 }, { key: 'São Gonçalo', value: 10 }], 2);
  assert.deepEqual(c.map((x) => [x.label, x.pct]), [['Rio de Janeiro', 0.6], ['Niterói', 0.3]]);
  const ages = sortAges([{ key: '35-44', value: 5 }, { key: '18-24', value: 10 }, { key: '25-34', value: 20 }]);
  assert.deepEqual(audienceShare(ages, 10, true).map((x) => x.label), ['18-24', '25-34', '35-44']);
  assert.deepEqual(audienceShare([], 3), []);
});

test('formatos: números, duração, data/hora de SP', () => {
  assert.equal(fmtN(1234), '1.234');
  assert.equal(fmtN(12345), '12,3 mil');
  assert.equal(fmtN(2500000), '2,5 mi');
  assert.equal(fmtDuration(12400), '12 s');
  assert.equal(fmtDuration(185000), '3 min 5 s');
  assert.equal(fmtWhen('2026-11-02T22:00:00.000Z'), '02/11/2026 às 19:00');
});

// ── edge function com a Graph API SIMULADA ──
const NOW = Date.parse('2026-11-10T15:00:00-03:00');
const TOKEN = 'TOKEN-SECRETO-123';
interface Call { path: string; q: URLSearchParams }
function fakeGraph(opts: { reject?: string[]; media?: Record<string, unknown>[]; failAll?: number } = {}) {
  const calls: Call[] = [];
  const fetch: Deps['fetch'] = async (url) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://graph.facebook.com');
    const path = u.pathname.replace('/v25.0/', '');
    calls.push({ path, q: u.searchParams });
    const json = (o: unknown, status = 200) => ({ ok: status === 200, status, json: async () => o });
    if (opts.failAll) return json({ error: { message: `Invalid OAuth access_token=${TOKEN}`, code: opts.failAll } }, 400);
    const metrics = (u.searchParams.get('metric') || '').split(',').filter(Boolean);
    const bad = metrics.filter((m) => (opts.reject || []).includes(m));
    if (bad.length) return json({ error: { message: `(#100) metric[0] must be one of the following values: ... (${bad.join(',')})`, code: 100 } }, 400);
    if (path === '17841442995645189') return json({ id: '17841442995645189', username: 'store_triumph', name: 'Triumph Store', followers_count: 5200, follows_count: 300, media_count: 410, profile_picture_url: 'https://cdn/p.jpg' });
    if (path === '17841442995645189/insights') {
      const since = Number(u.searchParams.get('since')); const until = Number(u.searchParams.get('until'));
      const days = Math.max(1, Math.round((until - since) / 86400));
      if (metrics[0] === 'follower_demographics') {
        const bd = u.searchParams.get('breakdown');
        const results = bd === 'city' ? [{ dimension_values: ['Niterói, Rio de Janeiro'], value: 900 }, { dimension_values: ['Rio de Janeiro, Rio de Janeiro'], value: 1800 }]
          : bd === 'age' ? [{ dimension_values: ['25-34'], value: 2000 }, { dimension_values: ['18-24'], value: 1000 }] : [{ dimension_values: ['F'], value: 1200 }, { dimension_values: ['M'], value: 3000 }];
        return json({ data: [{ name: 'follower_demographics', period: 'lifetime', total_value: { breakdowns: [{ dimension_keys: [bd], results }] } }] });
      }
      return json({ data: metrics.map((m) => m === 'follows_and_unfollows'
        ? { name: m, period: 'day', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [{ dimension_values: ['FOLLOWER'], value: 10 * days }, { dimension_values: ['NON_FOLLOWER'], value: 3 * days }] }] } }
        : { name: m, period: 'day', total_value: { value: 100 * days } }) });
    }
    if (path === '17841442995645189/media') return json({ data: opts.media || [], paging: {} });
    if (/^\d+\/insights$/.test(path)) return json({ data: metrics.map((m) => ({ name: m, period: 'lifetime', values: [{ value: m === 'reach' ? 1000 : 10 }] })) });
    if (/^\d+$/.test(path)) return json({ ...(opts.media || []).find((m) => m.id === path), owner: { id: path === '999999' ? '123456' : '17841442995645189' } });
    return json({ error: { message: 'rota não simulada', code: 100 } }, 400);
  };
  return { calls, fetch };
}
const deps = (g: ReturnType<typeof fakeGraph>): Deps => ({ token: TOKEN, getUser: async (jwt) => (jwt === 'jwt-ok' ? { id: 'u1' } : null), fetch: g.fetch, now: () => NOW });
const MEDIA = [
  { id: '18011', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/r.jpg', permalink: 'https://www.instagram.com/reel/18011/', timestamp: '2026-11-08T22:00:00+0000', like_count: 50, comments_count: 4, caption: 'Reel' },
  { id: '18012', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/18012/', timestamp: '2026-11-05T12:00:00+0000', children: { data: [{ media_type: 'IMAGE', media_url: 'https://cdn/c1.jpg' }] } },
  { id: '18013', media_type: 'IMAGE', media_product_type: 'FEED', media_url: 'https://cdn/i.jpg', permalink: 'https://www.instagram.com/p/18013/', timestamp: '2026-09-01T12:00:00+0000' },
];

test('períodos: N dias de SP terminando agora; anterior do mesmo tamanho; 90 dias em janelas de 30; gráfico por dia/semana', () => {
  const w = windowsOf(7, NOW);
  assert.equal(w.cur.fromDay, '2026-11-04');
  assert.equal(w.cur.toDay, '2026-11-10');
  assert.equal(w.prev.fromDay, '2026-10-28');
  assert.equal(w.prev.toDay, '2026-11-03');
  assert.equal(chunksOf(windowsOf(90, NOW).cur).length, 3);
  assert.equal(bucketsOf(windowsOf(30, NOW).cur).size, 'day');
  assert.equal(bucketsOf(windowsOf(30, NOW).cur).list.length, 30);
  assert.equal(bucketsOf(windowsOf(90, NOW).cur).size, 'week');
});

test('function: sem login do ERP = 401 e nenhuma chamada à Meta', async () => {
  const g = fakeGraph();
  const r = await handle(null, { action: 'account', days: 30 }, deps(g));
  assert.equal(r.status, 401);
  assert.equal((await handle('Bearer anon-key', { action: 'account', days: 30 }, deps(g))).status, 401);
  assert.equal(g.calls.length, 0);
});

test('function account/top: perfil, totais do período e do anterior, seguidores líquidos; só GET com o token só na URL', async () => {
  const g = fakeGraph();
  const r = await handle('Bearer jwt-ok', { action: 'account', part: 'top', days: 7 }, deps(g));
  assert.equal(r.status, 200);
  const j = r.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(j.profile.username, 'store_triumph');
  assert.equal(j.profile.followers, 5200);
  assert.ok(j.cur.reach > 0 && j.prev.reach > 0);
  assert.equal(j.cur.net_followers, j.cur.follows - j.cur.unfollows);
  assert.ok(j.cur.follows > j.cur.unfollows);
  assert.deepEqual(j.warnings, []);
  assert.ok(!JSON.stringify(r.json).includes(TOKEN), 'token não volta para o navegador');
  assert.ok(g.calls.every((c) => c.q.get('access_token') === TOKEN));
  assert.ok(g.calls.every((c) => !c.q.get('metric') || !c.q.get('metric')!.includes('impressions')), 'não pede "impressions"');
});

test('function: métrica recusada pela Meta é pulada com aviso (o resto continua)', async () => {
  const g = fakeGraph({ reject: ['profile_views', 'website_clicks', 'follows'], media: MEDIA });
  const r = await handle('Bearer jwt-ok', { action: 'account', part: 'top', days: 30 }, deps(g));
  const j = r.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(r.status, 200);
  assert.equal(j.cur.profile_views, null);
  assert.equal(j.cur.website_clicks, null);
  assert.ok(j.cur.reach > 0 && j.cur.profile_links_taps > 0);
  assert.equal(j.warnings.length, 2, JSON.stringify(j.warnings));
  assert.match(j.warnings.join('\n'), /métrica "profile_views" não aceita pela Meta e foi pulada/);
  // nos posts: "follows" recusado → aviso UMA vez por formato, os outros números continuam
  const m = await handle('Bearer jwt-ok', { action: 'media', days: 30 }, deps(g));
  const mj = m.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(m.status, 200);
  assert.deepEqual(mj.items.map((x: any) => x.id), ['18011', '18012']); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(mj.items[0].kind, 'REEL');
  assert.equal(mj.items[1].kind, 'CAROUSEL');
  assert.equal(mj.items[1].thumb, 'https://cdn/c1.jpg');
  assert.equal(mj.items[0].metrics.follows, null);
  assert.equal(mj.items[0].metrics.reach, 1000);
  assert.equal(mj.items[0].metrics.avg_watch_ms, 10);
  assert.equal(mj.warnings.filter((w: string) => w.includes('"follows"')).length, 2); // Reels e Carrosséis
});

test('function: 90 dias = janelas de 30 dias (com aviso); gráfico por semana', async () => {
  const g = fakeGraph();
  const r = await handle('Bearer jwt-ok', { action: 'account', part: 'top', days: 90 }, deps(g));
  const j = r.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ranges = g.calls.filter((c) => c.q.get('since')).map((c) => (Number(c.q.get('until')) - Number(c.q.get('since'))) / 86400);
  assert.ok(ranges.every((d) => d <= 30), JSON.stringify(ranges));
  assert.match(j.warnings.join(), /soma de janelas de 30 dias/);
  const d = await handle('Bearer jwt-ok', { action: 'account', part: 'daily', days: 90 }, deps(fakeGraph()));
  assert.equal((d.json as any).size, 'week'); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal((d.json as any).rows.length, 13); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('function: gráfico diário, público, detalhe só da conta, erro sem token', async () => {
  const d = await handle('Bearer jwt-ok', { action: 'account', part: 'daily', days: 7 }, deps(fakeGraph()));
  const dj = d.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(dj.rows.length, 7);
  assert.deepEqual([dj.rows[0].gained, dj.rows[0].lost, dj.rows[0].reach], [10, 3, 100]);
  const a = await handle('Bearer jwt-ok', { action: 'account', part: 'audience' }, deps(fakeGraph()));
  const aj = a.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(aj.audience.city[0].key, 'Rio de Janeiro, Rio de Janeiro');
  assert.equal(aj.audience.gender[0].key, 'M');
  const g = fakeGraph({ media: [...MEDIA, { id: '999999', media_type: 'IMAGE' }] });
  const det = await handle('Bearer jwt-ok', { action: 'media_detail', id: '18011' }, deps(g));
  assert.equal(det.status, 200);
  assert.equal((det.json as any).item.permalink, 'https://www.instagram.com/reel/18011/'); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal((await handle('Bearer jwt-ok', { action: 'media_detail', id: '999999' }, deps(g))).status, 502);
  assert.equal((await handle('Bearer jwt-ok', { action: 'media_detail', id: '../me' }, deps(g))).status, 400);
  const bad = await handle('Bearer jwt-ok', { action: 'account', days: 7 }, deps(fakeGraph({ failAll: 190 })));
  assert.equal(bad.status, 502);
  assert.ok(!JSON.stringify(bad.json).includes(TOKEN), JSON.stringify(bad.json));
  assert.equal((await handle('Bearer jwt-ok', { action: 'publicar' }, deps(fakeGraph()))).status, 400);
  assert.equal((await handle('Bearer jwt-ok', { action: 'account', days: 45 }, deps(fakeGraph()))).status, 400);
});

test('function: gráfico diário com o alcance da série diária da Meta (dias da Meta) e a conferência soma dos dias × total', async () => {
  const day0 = windowsOf(7, NOW).cur.since;
  const views = (since: number) => (new Date((since + 12 * 3600) * 1000).getUTCDay() === 0 ? 40 : 1000); // domingo baixo (dado real)
  const calls: string[] = [];
  const g: Deps['fetch'] = async (url) => {
    const u = new URL(url); const q = u.searchParams; const m = q.get('metric') || '';
    calls.push(`${m}|${q.get('metric_type')}`);
    const since = Number(q.get('since')); const until = Number(q.get('until'));
    const res = (o: unknown) => ({ ok: true, status: 200, json: async () => o });
    if (q.get('metric_type') === 'time_series') {
      // a Meta devolve um valor por dia dela, com end_time no fim do dia (08:00 UTC)
      const values = []; for (let t = day0; t < until; t += 86400) { const d = new Date((t + 12 * 3600) * 1000).toISOString().slice(0, 10); values.push({ value: views(t) / 2, end_time: `${new Date(Date.parse(`${d}T00:00:00Z`) + 86400000 + 8 * 3600000).toISOString().slice(0, 19)}+0000` }); }
      return res({ data: [{ name: 'reach', period: 'day', values }] });
    }
    if (m === 'follows_and_unfollows') return res({ data: [{ name: m, total_value: { breakdowns: [{ results: [{ dimension_values: ['FOLLOWER'], value: 2 }, { dimension_values: ['NON_FOLLOWER'], value: 1 }] }] } }] });
    // total de views no intervalo = soma dos dias
    let total = 0; for (let t = since; t < until; t += 86400) total += views(t);
    return res({ data: m.split(',').map((k) => ({ name: k, total_value: { value: total } })) });
  };
  const r = await handle('Bearer jwt-ok', { action: 'account', part: 'daily', days: 7 }, { token: TOKEN, getUser: async () => ({ id: 'u1' }), fetch: g, now: () => NOW });
  const j = r.json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.reach_source, 'serie');
  const sun = j.rows.find((x: any) => new Date(`${x.day}T12:00:00Z`).getUTCDay() === 0); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.deepEqual([sun.views, sun.reach], [40, 20], 'domingo baixo = dado real, no dia certo');
  assert.ok(j.rows.every((x: any) => x.reach != null), JSON.stringify(j.rows)); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(j.check.ok, true, JSON.stringify(j.check));
  assert.equal(j.check.daily_sum, j.check.period_total);
  assert.ok(!calls.some((c) => c.startsWith('reach,views')), 'com a série, o alcance não é pedido dia a dia');
  assert.equal(dayOfEndTime('2026-11-09T08:00:00+0000'), '2026-11-08');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
}
console.log(`\n${tests.length - fail}/${tests.length} ok`);
if (fail) process.exitCode = 1;
