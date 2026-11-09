// Testes das contas da aba WhatsApp → RESULTADOS (src/lib/waResults.ts). Sem dependências: node scripts/tests/waResults.test.ts
import assert from 'node:assert/strict';
import { periodRanges, type PanelInput, type SendRow } from '../../src/lib/waPanel.ts';
import { computeResults } from '../../src/lib/waResults.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const sp = (s: string) => new Date(`${s}-03:00`).toISOString();
const NOW = Date.parse('2026-11-06T15:00:00-03:00');
const R = periodRanges('30d', NOW).cur;
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const AUTO = 'a0000000-0000-4000-8000-000000000001';
const CAMP = 'c0000000-0000-4000-8000-000000000001';
const [F1, F2, F3, Q1, Q2, D1] = ['i1', 'i2', 'i3', 'q1', 'q2', 'd1'];
const chat = (n: number) => `55119000000${String(n).padStart(2, '0')}@c.us`;
let n = 0;
const send = (c: string, at: string, extra: Partial<SendRow>): SendRow => ({ id: `s${++n}`, chat_id: c, created_at: sp(at), source: 'follow', source_id: AUTO, item_id: F1, status: 'enviado', origin: 'automacao', follow_step: null, ...extra });
const reply = (c: string, at: string, sendId: string, minutes = 10) => ({ chat_id: c, replied_at: sp(at), send_log_id: sendId, minutes });
const sale = (id: string, c: string, at: string, total: number) => ({ id, sale_date: at.slice(0, 10), created_at: sp(at), total_sale_price: total, customer_phone: null, wa_chat_id: c, origin: null });

// Régua "Follow-up" (automação AUTO): A respondeu no 1º; B recebeu os 3 e comprou depois do 3º; C respondeu e comprou
// depois do 2º. Acumulados (mensagem rápida marcada como follow-up): D respondeu à etapa 1; E recebeu 1 e 2 e comprou.
// Disparo "Black Friday": 2 enviadas, 1 respondida.
function scenario(): PanelInput {
  const A = chat(1); const B = chat(2); const C = chat(3); const D = chat(4); const E = chat(5); const G = chat(6); const H = chat(7);
  const sA = send(A, '2026-11-01T10:00:00', { item_id: F1 });
  const sB = [send(B, '2026-11-01T10:00:00', { item_id: F1 }), send(B, '2026-11-02T10:00:00', { item_id: F2 }), send(B, '2026-11-04T10:00:00', { item_id: F3 })];
  const sC = [send(C, '2026-11-01T10:00:00', { item_id: F1 }), send(C, '2026-11-02T10:00:00', { item_id: F2 })];
  const qD = send(D, '2026-11-01T09:00:00', { source: 'rapida', origin: 'rapida', source_id: null, item_id: Q1, follow_step: 1 });
  const qE = [send(E, '2026-11-01T09:00:00', { source: 'rapida', origin: 'rapida', source_id: null, item_id: Q1, follow_step: 1 }), send(E, '2026-11-03T09:00:00', { source: 'rapida', origin: 'rapida', source_id: null, item_id: Q2, follow_step: 2 })];
  const dG = send(G, '2026-11-02T08:00:00', { source: 'disparo', origin: 'disparo', source_id: CAMP, item_id: D1 });
  const dH = send(H, '2026-11-02T08:00:00', { source: 'disparo', origin: 'disparo', source_id: CAMP, item_id: D1 });
  return {
    leads: [], attributions: [], names: { [AUTO]: 'Régua de follow-up', [CAMP]: 'Black Friday' },
    items: [{ id: F1, title: 'Follow 1' }, { id: F2, title: 'Follow 2' }, { id: F3, title: 'Follow 3' }, { id: Q1, title: 'Oi, sumiu?', follow_step: 1 }, { id: Q2, title: 'Última chance', follow_step: 2 }, { id: D1, title: 'Promo BF' }],
    sends: [sA, ...sB, ...sC, qD, ...qE, dG, dH],
    replies: [reply(A, '2026-11-01T12:00:00', sA.id, 120), reply(C, '2026-11-02T11:00:00', sC[1].id, 60), reply(D, '2026-11-01T09:30:00', qD.id, 30), reply(G, '2026-11-02T09:00:00', dG.id, 60)],
    sales: [sale('v1', B, '2026-11-04T15:00:00', 200), sale('v2', C, '2026-11-03T12:00:00', 100), sale('v3', E, '2026-11-05T12:00:00', 50)],
  };
}

test('funil por caminho: título com as mensagens de cada etapa, entraram · compraram · R$', () => {
  const r = computeResults(scenario(), R);
  assert.equal(r.paths.length, 1);
  const p = r.paths[0];
  assert.deepEqual([p.name, p.titles, p.entered, p.bought, p.revenue], ['Régua de follow-up', ['Follow 1', 'Follow 2', 'Follow 3'], 3, 2, 300]);
  assert.equal(Math.round((p.boughtPct as number) * 100), 67);
});
test('funil por caminho, por etapa: chegaram; respondeu = antes do próximo follow; comprou até 7 dias depois do último follow; seguiu', () => {
  const [s1, s2, s3] = computeResults(scenario(), R).paths[0].stages;
  // etapa 1: A, B e C; só A respondeu (a resposta da C veio depois do Follow 2); B e C seguiram 1 dia depois
  assert.deepEqual([s1.reached, s1.responded, s1.medianMinutes, s1.bought, s1.followed, s1.followDays], [3, 1, 120, 0, 2, 1]);
  // etapa 2: B e C; C respondeu em 1h e comprou (R$ 100); B seguiu 2 dias depois
  assert.deepEqual([s2.reached, s2.responded, s2.medianMinutes, s2.bought, s2.revenue, s2.followed, s2.followDays], [2, 1, 60, 1, 100, 1, 2]);
  // etapa 3: B comprou (R$ 200) e não seguiu (fim)
  assert.deepEqual([s3.reached, s3.responded, s3.bought, s3.revenue, s3.followed], [1, 0, 1, 200, 0]);
});
test('acumulados: follow-ups fora de régua pela etapa marcada (mesmas regras)', () => {
  const acc = computeResults(scenario(), R).accumulated;
  assert.deepEqual(plain(acc.map((s) => [s.step, s.title, s.reached, s.responded, s.bought, s.revenue, s.followed])), [[1, 'Oi, sumiu?', 2, 1, 0, 0, 1], [2, 'Última chance', 1, 0, 1, 50, 0]]);
});
test('resultado por mensagem de follow-up: receberam · responderam % e tempo · compraram % e R$ (disparo não entra)', () => {
  const m = computeResults(scenario(), R).messages;
  const by = Object.fromEntries(m.map((x) => [x.title, x]));
  assert.deepEqual(Object.keys(by).sort(), ['Follow 1', 'Follow 2', 'Follow 3', 'Oi, sumiu?', 'Última chance']);
  assert.deepEqual([by['Follow 1'].received, by['Follow 1'].responded, by['Follow 1'].bought], [3, 1, 0]);
  assert.deepEqual([by['Follow 2'].received, by['Follow 2'].responded, by['Follow 2'].bought, by['Follow 2'].revenue], [2, 1, 1, 100]);
  assert.deepEqual([by['Oi, sumiu?'].step, by['Oi, sumiu?'].received, by['Oi, sumiu?'].responded, by['Oi, sumiu?'].medianMinutes], [1, 2, 1, 30]);
  assert.equal(m[0].step, 1); // etapas marcadas primeiro
});
test('disparos: enviadas · responderam % · vendas · R$', () => {
  const c = computeResults(scenario(), R).campaigns;
  assert.deepEqual(plain(c.map((x) => [x.name, x.sent, x.replied, x.repliedPct, x.sales])), [['Black Friday', 2, 1, 0.5, 0]]);
});
test('rodapé: vendas pelo WhatsApp, depois de um follow e de anúncio', () => {
  const f = computeResults(scenario(), R).footer;
  assert.deepEqual([f.sales, f.revenue, f.afterFollow], [3, 350, 3]);
});
test('2.14.0: disparo com variações mostra por variação (enviadas · responderam % · vendas); sem variação, nada a mais', () => {
  const sc = scenario();
  assert.deepEqual(computeResults(sc, R).campaigns[0].variants, []);
  const I = chat(8); const J = chat(9); const K = chat(10);
  const v0 = send(I, '2026-11-03T08:00:00', { source: 'disparo', origin: 'disparo', source_id: CAMP, item_id: D1, variant: 0 });
  const v1a = send(J, '2026-11-03T08:05:00', { source: 'disparo', origin: 'disparo', source_id: CAMP, item_id: D1, variant: 1 });
  const v1b = send(K, '2026-11-03T08:10:00', { source: 'disparo', origin: 'disparo', source_id: CAMP, item_id: D1, variant: 1 });
  sc.sends.push(v0, v1a, v1b);
  sc.replies.push(reply(J, '2026-11-03T09:00:00', v1a.id, 55));
  sc.sales.push(sale('v9', K, '2026-11-04T10:00:00', 80));
  const c = computeResults(sc, R).campaigns[0];
  assert.deepEqual([c.sent, c.replied], [5, 2]);
  assert.deepEqual(plain(c.variants.map((v) => [v.name, v.sent, v.replied, v.repliedPct, v.sales, v.revenue])), [['Variação 1', 1, 0, 0, 0, 0], ['Variação 2', 2, 1, 0.5, 1, 80]]);
});
test('fora do período / sem dados: nada quebra', () => {
  const r = computeResults(scenario(), periodRanges('hoje', NOW).cur);
  assert.deepEqual([r.paths.length, r.accumulated.length, r.messages.length, r.campaigns.length], [0, 0, 0, 0]);
  const e = computeResults({ leads: [], attributions: [], names: {}, items: [], sends: [], replies: [], sales: [] }, R);
  assert.deepEqual([e.paths, e.accumulated, e.messages, e.campaigns, e.footer.sales], [[], [], [], [], 0]);
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 10).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
