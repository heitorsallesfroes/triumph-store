// Regras do HISTÓRICO do Instagram (src/lib/igInsights.ts): stories por dia, ranking, "o que funciona", cruzamento
// com o link dos stories, totais/semanas do histórico e seguidores ao longo do tempo.   node scripts/tests/igStories.test.ts
import assert from 'node:assert/strict';
import { bestStories, exitRate, followersSeries, historySince, historyTotals, historyWeekly, periodLabel, storiesByDay, storyFinal, storyLinkByDay, storyWhatWorks, type IgDayAccount, type IgStory } from '../../src/lib/igInsights.ts';

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
// hora de São Paulo → ISO
const at = (day: string, hour: number, min = 0) => new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`)).toISOString();
const st = (id: string, day: string, hour: number, views: number | null, o: Partial<IgStory> = {}): IgStory => ({
  id, media_type: 'IMAGE', thumb: null, permalink: null, posted_at: at(day, hour), expires_at: at(day, hour), last_read_at: new Date(Date.parse(at(day, hour)) + 23.5 * 3600000).toISOString(),
  views, reach: views == null ? null : Math.round(views * 0.8), replies: 1, shares: null, total_interactions: null, follows: null, profile_visits: null, navigation: null, taps_forward: null, taps_back: null, exits: null, swipe_forward: null, ...o,
});
const STORIES = [
  st('1', '2026-11-10', 9, 100), st('2', '2026-11-10', 20, 300), st('3', '2026-11-10', 20, 280),
  st('4', '2026-11-11', 9, 120), st('5', '2026-11-11', 23, 90, { replies: 5 }),
  st('6', '2026-11-12', 20, 320), st('7', '2026-11-12', 1, 50), // 1h da madrugada de SP ainda é o dia 12
  st('8', '2026-11-09', 20, null), // sem views (a Meta não devolveu): fora das contas
];

test('stories por dia: dia de São Paulo, mais novo primeiro, somas do dia', () => {
  const d = storiesByDay(STORIES);
  assert.deepEqual(d.map((x) => [x.day, x.stories.map((s) => s.id).join(','), x.views]), [['2026-11-12', '7,6', 370], ['2026-11-11', '4,5', 210], ['2026-11-10', '1,2,3', 680], ['2026-11-09', '8', 0]]);
});
test('ranking: mais views (empate: alcance, respostas); sem views fica fora', () => {
  assert.deepEqual(bestStories(STORIES, 3).map((s) => s.id), ['6', '2', '3']);
  assert.ok(!bestStories(STORIES, 10).some((s) => s.id === '8'));
});
test('o que funciona: média de views, melhor hora (2+ stories), quantos stories por dia (2+ dias no grupo)', () => {
  const w = storyWhatWorks(STORIES);
  assert.equal(w.stories, 7);
  assert.equal(Math.round(w.avgViews as number), Math.round((100 + 300 + 280 + 120 + 90 + 320 + 50) / 7));
  assert.deepEqual([w.bestHour?.label, w.bestHour?.stories, w.bestHour?.avgViews], ['20h', 3, 300]); // 23h tem só 1 story e não disputa
  assert.deepEqual(w.perDay.map((p) => [p.id, p.days, p.avgPerDay]), [['2-3', 3, (680 + 210 + 370) / 3]]);
  assert.equal(w.bestPerDay?.id, '2-3');
  assert.ok(/2\+ stories/.test(w.why));
  const poucos = storyWhatWorks([st('a', '2026-11-10', 9, 10)]);
  assert.equal(poucos.bestHour, null);
  assert.equal(poucos.bestPerDay, null);
});
test('leitura final × parcial, taxa de saída', () => {
  assert.equal(storyFinal(STORIES[0]), true);
  assert.equal(storyFinal({ posted_at: at('2026-11-10', 9), last_read_at: at('2026-11-10', 20) }), false);
  assert.equal(exitRate({ exits: 30, views: 300 }), 0.1);
  assert.equal(exitRate({ exits: null, views: 300 }), null);
});
test('link dos stories: cliques, conversas e vendas por dia de story (São Paulo)', () => {
  const rows = storyLinkByDay(storiesByDay(STORIES), [{ created_at: at('2026-11-10', 21) }, { created_at: at('2026-11-10', 22) }, { created_at: at('2026-11-12', 1, 30) }],
    [{ firstAt: Date.parse(at('2026-11-10', 21, 10)), sales: 1, revenue: 499.9 }, { firstAt: Date.parse(at('2026-11-12', 10)), sales: 0, revenue: 0 }]);
  const d10 = rows.find((r) => r.day === '2026-11-10')!;
  const d12 = rows.find((r) => r.day === '2026-11-12')!;
  assert.deepEqual([d10.stories, d10.views, d10.clicks, d10.conversations, d10.sales, d10.revenue], [3, 680, 2, 1, 1, 499.9]);
  assert.deepEqual([d12.clicks, d12.conversations, d12.sales], [1, 1, 0]);
});
const day = (d: string, o: Partial<IgDayAccount> = {}): IgDayAccount => ({ day: d, followers: null, reach: 100, views: 200, accounts_engaged: 10, total_interactions: 20, profile_views: 5, profile_links_taps: 1, gained: 3, lost: 1, ...o });
test('histórico: totais pela soma dos dias, por semana (segunda-feira), "guardado desde"', () => {
  const rows = [day('2026-11-02'), day('2026-11-03', { gained: 5, lost: 0 }), day('2026-11-09'), day('2026-11-10', { reach: null })];
  const t = historyTotals(rows, '2026-11-03', '2026-11-10');
  assert.deepEqual([t.days, t.reach, t.views, t.follows, t.unfollows, t.net_followers, t.profile_links_taps], [3, 200, 600, 11, 2, 9, 3]);
  assert.deepEqual(historyWeekly(rows, '2026-11-01', '2026-11-30').map((w) => [w.day, w.views, w.gained]), [['2026-11-02', 400, 8], ['2026-11-09', 400, 6]]);
  assert.equal(historySince(rows), '2026-11-02');
  assert.equal(historySince([]), null);
  assert.equal(historyTotals([], '2026-01-01', '2026-12-31').reach, null);
  assert.deepEqual([periodLabel(30), periodLabel(180), periodLabel(365)], ['30 dias', '6 meses', '12 meses']);
});
test('seguidores ao longo do tempo: foto do dia quando existe; antes dela, refeito pelos ganhos/perdas do dia seguinte', () => {
  const s = followersSeries([day('2026-11-10', { gained: 3, lost: 1 }), day('2026-11-11', { gained: 4, lost: 1 }), day('2026-11-12', { followers: 1000, gained: 5, lost: 2 })]);
  assert.deepEqual(s.map((x) => [x.day, x.followers, x.real]), [['2026-11-10', 994, false], ['2026-11-11', 997, false], ['2026-11-12', 1000, true]]);
});

let ok = 0;
for (const [n, f] of tests) { try { f(); ok++; console.log(`ok   ${n}`); } catch (e) { console.log(`FAIL ${n}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; } }
console.log(`\n${ok}/${tests.length} testes passaram`);
