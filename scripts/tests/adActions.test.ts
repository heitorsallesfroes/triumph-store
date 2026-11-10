// Testes das ações do Gerenciador de Anúncios (FASE 2, src/lib/adActions.ts), sem a Meta (nada é enviado).
// Sem dependências: node scripts/tests/adActions.test.ts
// - cálculo do novo orçamento (±10/20%, "Definir valor") e limites: mínimo R$ 10/dia, no máximo ±50% por ação,
//   aviso acima de +20% (aprendizado da Meta)
// - dono do orçamento: campanha (CBO) ou conjunto; agrupamento por campanha sem repetir
// - nenhuma ação na mesma campanha em menos de 1 minuto; plano com a lista exata; histórico (últimas 300)
import assert from 'node:assert/strict';
import {
  COOLDOWN_MS, LOG_MAX, appendLog, budgetByPct, budgetOwnerOf, checkBudget, cooldownLeft, logOf, parseLog, planBudget, planToggle, uniqueOwners,
  type BudgetEntity, type BudgetOwner, type LogEntry,
} from '../../src/lib/adActions.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const NOW = Date.parse('2026-11-10T15:00:00-03:00');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const nb = (s: string | string[]): string | string[] => (Array.isArray(s) ? s.map((x) => x.replace(/\s/g, ' ')) : s.replace(/\s/g, ' ')); // R$ usa espaço fino

const campaigns = new Map<string, BudgetEntity>([
  ['900001', { id: '900001', name: 'CBO VENDAS WPP', daily: 200, lifetime: null }],
  ['900002', { id: '900002', name: 'ABO TESTES', daily: null, lifetime: null }],
  ['900003', { id: '900003', name: 'LANÇAMENTO', daily: null, lifetime: 3000 }],
]);
const adsets = new Map<string, BudgetEntity>([
  ['800001', { id: '800001', name: 'Conjunto RJ', daily: 50, lifetime: null }],
  ['800002', { id: '800002', name: 'Conjunto SP', daily: 12, lifetime: null }],
]);
const ad = (adId: string, name: string, campaignId: string | null, adsetId: string | null) => ({ adId, name, campaignId, adsetId, campaign: null, adset: null });
const owner = (a: ReturnType<typeof ad>) => budgetOwnerOf(a, campaigns, adsets);
const A = ad('100001', 'A', '900001', '700001'); const B = ad('100002', 'B', '900001', '700002'); const C = ad('100003', 'C', '900002', '800001');
const D = ad('100004', 'D', '900002', '800002'); const E = ad('100005', 'E', '900003', '700009');

test('dono do orçamento: campanha com orçamento = CBO; senão o conjunto', () => {
  const oa = owner(A)!; const oc = owner(C)!; const oe = owner(E)!;
  assert.deepEqual([oa.level, oa.id, oa.name, oa.daily], ['campaign', '900001', 'CBO VENDAS WPP', 200]);
  assert.deepEqual([oc.level, oc.id, oc.campaignId, oc.daily], ['adset', '800001', '900002', 50]);
  assert.deepEqual([oe.level, oe.daily, oe.lifetime], ['campaign', null, 3000], 'vitalício');
  assert.equal(owner(ad('1', 'x', null, null)), null);
  assert.equal(owner(ad('1', 'x', '900002', '7777')), null, 'conjunto sem orçamento conhecido');
});

test('agrupamento: os anúncios da mesma campanha CBO viram UMA mudança', () => {
  const list = uniqueOwners([A, B, C, D, A].map(owner));
  assert.deepEqual(list.map((o) => `${o.level}:${o.id}`), ['campaign:900001', 'adset:800001', 'adset:800002']);
  const p = planBudget([A, B, C].map(owner) as BudgetOwner[], { pct: 10 }, [], NOW);
  assert.equal(p.ready.length, 2);
  assert.deepEqual(nb(p.lines), ['Campanha CBO VENDAS WPP: R$ 200/dia → R$ 220/dia', 'Conjunto Conjunto RJ: R$ 50/dia → R$ 55/dia']);
});

test('cálculo do novo orçamento: ±10%, ±20%, centavos', () => {
  assert.deepEqual([-20, -10, 10, 20].map((p) => budgetByPct(200, p)), [160, 180, 220, 240]);
  assert.equal(budgetByPct(33.33, 10), 36.66);
  assert.equal(budgetByPct(47.5, -20), 38);
  const p = planBudget([owner(A)!], { pct: 20 }, [], NOW);
  assert.deepEqual([p.ready[0].budget, nb(p.ready[0].before), nb(p.ready[0].after)], [240, 'R$ 200/dia', 'R$ 240/dia']);
  const v = planBudget([owner(A)!], { value: 250.5 }, [], NOW);
  assert.equal(v.ready[0].budget, 250.5); assert.equal(nb(v.lines[0]), 'Campanha CBO VENDAS WPP: R$ 200/dia → R$ 250,50/dia');
});

test('limites: mínimo R$ 10/dia, no máximo ±50% por ação, aviso acima de +20%', () => {
  assert.equal(checkBudget(200, 300).ok, true, '+50% pode');
  assert.equal(checkBudget(200, 301).ok, false); assert.match(checkBudget(200, 301).error!, /máximo é \+50%/);
  assert.equal(checkBudget(200, 100).ok, true, '−50% pode');
  assert.match(checkBudget(200, 99).error!, /máximo é −50%/);
  assert.match(checkBudget(12, 9.6).error!, /mínimo de R\$\s?10,00/);
  assert.equal(checkBudget(12, 10).ok, true);
  assert.equal(checkBudget(200, 240).warn, null, '+20% sem aviso');
  assert.match(checkBudget(200, 250).warn!, /aprendizado da Meta/);
  assert.equal(checkBudget(200, 150).warn, null, 'redução não avisa');
  assert.equal(checkBudget(null, 50).ok, false); assert.equal(checkBudget(200, 200).ok, false, 'igual ao atual');
  assert.equal(checkBudget(200, NaN).ok, false);
  // no plano: o conjunto de R$ 12 com −20% (9,60) fica de fora; o vitalício também
  const p = planBudget([owner(A), owner(D), owner(E)] as BudgetOwner[], { pct: -20 }, [], NOW);
  assert.deepEqual(p.ready.map((i) => i.objectId), ['900001']);
  assert.deepEqual(p.blocked.map((i) => i.objectId), ['800002', '900003']);
  assert.match(p.blocked[0].blocked!, /mínimo/); assert.match(p.blocked[1].blocked!, /vitalício/);
  const w = planBudget([owner(A)!], { value: 260 }, [], NOW);
  assert.equal(w.warnings.length, 1); assert.match(w.warnings[0], /CBO VENDAS WPP: aumento de 30%.*aprendizado/);
  assert.equal(planBudget([owner(A)!], { value: 400 }, [], NOW).ready.length, 0, '+100% bloqueado');
});

const entry = (campaignId: string, msAgo: number, ok = true): LogEntry => ({ at: iso(msAgo), who: 'eu', kind: 'orcamento', level: 'campaign', objectId: campaignId, name: 'x', campaignId, before: 'R$ 1', after: 'R$ 2', ok, error: null });

test('nenhuma ação na mesma campanha em menos de 1 minuto', () => {
  assert.ok(cooldownLeft('900001', [entry('900001', 20000)], NOW) > 0);
  assert.equal(cooldownLeft('900001', [entry('900001', COOLDOWN_MS + 1)], NOW), 0);
  assert.equal(cooldownLeft('900001', [entry('900002', 1000)], NOW), 0, 'outra campanha');
  assert.ok(cooldownLeft('900001', [entry('900001', 1000, false)], NOW) > 0, 'também depois de erro');
  const log = [entry('900001', 30000)];
  const p = planBudget([owner(A), owner(C)] as BudgetOwner[], { pct: 10 }, log, NOW);
  assert.deepEqual(p.ready.map((i) => i.objectId), ['800001']);
  assert.match(p.blocked[0].blocked!, /menos de 1 minuto \(espere 30 s\)/);
  // pausar anúncio da mesma campanha também espera
  const t = planToggle([{ adId: A.adId, name: 'A', campaignId: '900001', status: 'ACTIVE' }, { adId: C.adId, name: 'C', campaignId: '900002', status: 'ACTIVE' }], 'PAUSED', log, NOW);
  assert.deepEqual(t.ready.map((i) => i.name), ['C']);
  // vários anúncios da mesma campanha na MESMA ação: pode
  assert.equal(planToggle([{ adId: A.adId, name: 'A', campaignId: '900001', status: 'ACTIVE' }, { adId: B.adId, name: 'B', campaignId: '900001', status: 'ACTIVE' }], 'PAUSED', [], NOW).ready.length, 2);
});

test('Pausar/Ativar: lista exata, sem repetir, e quem já está no status fica de fora', () => {
  const ads = [
    { adId: '100001', name: 'A', campaignId: '900001', status: 'ACTIVE' }, { adId: '100002', name: 'B', campaignId: '900001', status: 'ACTIVE' },
    { adId: '100003', name: 'C', campaignId: '900002', status: 'PAUSED' }, { adId: '100001', name: 'A', campaignId: '900001', status: 'ACTIVE' },
    { adId: 'titulo:Relógio', name: 'Sem id', campaignId: null, status: null },
  ];
  const p = planToggle(ads, 'PAUSED', [], NOW);
  assert.deepEqual(p.lines, ['Pausar 2 anúncios: A, B']);
  assert.deepEqual(p.ready.map((i) => [i.objectId, i.status, i.before, i.after]), [['100001', 'PAUSED', 'ativo', 'pausado'], ['100002', 'PAUSED', 'ativo', 'pausado']]);
  assert.deepEqual(p.blocked.map((i) => i.blocked), ['já está pausado', 'anúncio sem id da Meta']);
  const a = planToggle(ads.slice(2, 3), 'ACTIVE', [], NOW);
  assert.deepEqual(a.lines, ['Ativar 1 anúncio: C']);
});

test('histórico: mais recente primeiro, últimas 300, leitura segura', () => {
  const many = Array.from({ length: 299 }, (_, i) => entry('9', 100000 + i * 1000));
  const p = planToggle([{ adId: '100001', name: 'A', campaignId: '900001', status: 'ACTIVE' }], 'PAUSED', [], NOW);
  const add = [logOf(p.ready[0], 'heitor@loja', iso(0), true, null), logOf(p.ready[0], 'heitor@loja', iso(-1), false, 'Erro da Meta')];
  const next = appendLog(many, add);
  assert.equal(next.length, LOG_MAX);
  assert.deepEqual([next[0].ok, next[0].error, next[1].who, next[1].kind, next[1].before, next[1].after], [false, 'Erro da Meta', 'heitor@loja', 'pausar', 'ativo', 'pausado']);
  assert.deepEqual(parseLog('{quebrado'), []); assert.deepEqual(parseLog(null), []); assert.deepEqual(parseLog('{"a":1}'), []);
  assert.equal(parseLog(JSON.stringify(next)).length, 300);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
console.log(`${tests.length - failed}/${tests.length} testes passaram`);
if (failed) process.exitCode = 1;
