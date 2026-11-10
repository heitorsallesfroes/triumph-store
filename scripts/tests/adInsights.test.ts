// Testes das regras do Gerenciador de Anúncios novo (src/lib/adInsights.ts), com dados de exemplo.
// Sem dependências: node scripts/tests/adInsights.test.ts
// - lucro real, ROAS real, custo por venda/conversa (com o imposto do anúncio)
// - faixas de ROAS: acima de 7 ótimo, 6 a 7 bom, 4 a 6 ok, abaixo de 4 ruim
// - categorias (Resolver / Ajustar / Pode render mais / Acompanhar), diagnóstico (máx. 3 frases) e recomendação
// - ligação conversa → anúncio → venda do ERP (💰, telefone, @lid), sem contar venda orgânica nem antes do contato
// - desgaste, funil (maior perda), dinheiro por categoria, horários, tempo de resposta, Conferir com a Meta, metas
import assert from 'node:assert/strict';
import { buildConversations, type TrackInput } from '../../src/lib/waTracking.ts';
import {
  ACTION, DEFAULT_GOALS, adRanges, buildAdCards, categoryBoxes, erpByAd, funnelOf, goalsJson, hourMap, metaCheck, metaFetchWindow, moneyOf,
  moneySplit, parseGoals, replyBands, roasTier, suggestGoals, totalsOf, verdictOf, wearOf, windowOf,
  attributeSales, dayBR, periodSales, roasTrio, salesTxt, startsBeforeTracking,
  type MetaDaily, type SaleCost, type Goals,
} from '../../src/lib/adInsights.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const sp = (s: string) => new Date(`${s}-03:00`).toISOString();
const NOW = Date.parse('2026-11-10T15:00:00-03:00'); // terça
const R = adRanges('7', NOW); // 04/11 a 10/11; anterior 28/10 a 03/11
const TAX = 0.1;

const days7 = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
const meta = (ad: string, name: string, date: string, spend: number, impressions: number, clicks: number, extra: Partial<MetaDaily> = {}): MetaDaily => ({
  ad_id: ad, ad_name: name, adset_id: 's1', adset_name: 'Conjunto 1', campaign_id: 'c1', campaign_name: 'Campanha WhatsApp', date, spend, impressions, clicks, reach: impressions / 1.5,
  frequency: 1.5, conversations: 0, purchases: 0, ...extra,
});
const spread = (ad: string, name: string, spend: number, impressions: number, clicks: number, extra: Partial<MetaDaily> = {}) =>
  days7.map((d) => meta(ad, name, d, spend / 7, impressions / 7, clicks / 7, extra));

// ── Cenário ──
// A (111): 10 conversas, 6 responderam, 3 vendas de R$ 1.000 (custo R$ 400 cada); gasto R$ 300 → ROAS 9,09 (ótimo)
// B (222): 8 conversas, 1 venda de R$ 1.500; gasto R$ 500 → ROAS 2,73 (ruim)
// C (333): gasto R$ 20, 1 conversa → pouco dado
// D (444): 6 conversas, 1 venda de R$ 1.100; gasto R$ 200 → ROAS 5 (ok)
// + venda orgânica (não conta), venda antes do 1º contato (não conta), conversa @lid com venda pelo telefone (conta)
function input(): TrackInput {
  const leads: TrackInput['leads'] = []; const sends: TrackInput['sends'] = []; const replies: TrackInput['replies'] = []; const sales: TrackInput['sales'] = [];
  let n = 0;
  const conv = (ad: string, title: string, phone: string, at: string, opts: { reply?: boolean; replyAfterMin?: number; chat?: string } = {}) => {
    const chat = opts.chat || `${phone}@c.us`;
    leads.push({ chat_id: chat, phone, first_message_at: sp(at), origin: 'anuncio', ad_id: ad, ad_title: title });
    if (opts.replyAfterMin != null) sends.push({ id: `s${++n}`, chat_id: chat, created_at: new Date(Date.parse(sp(at)) + opts.replyAfterMin * 60000).toISOString(), source: 'manual', source_id: null, item_id: null, status: 'enviado', origin: 'manual' });
    if (opts.reply) replies.push({ chat_id: chat, replied_at: new Date(Date.parse(sp(at)) + 3600000).toISOString(), send_log_id: 'x', minutes: 5 });
    return chat;
  };
  const sale = (id: string, total: number, at: string, chat: string | null, phone: string | null) =>
    sales.push({ id, sale_date: at.slice(0, 10), created_at: sp(at), total_sale_price: total, customer_phone: phone, wa_chat_id: chat, origin: chat ? 'anuncio' : null });
  // A
  for (let i = 0; i < 10; i++) {
    const ph = `55219000010${String(i).padStart(2, '0')}`;
    const chat = conv('111', 'Relógio A', ph, `2026-11-0${5 + (i % 4)}T1${i % 10}:00:00`, { reply: i < 6, replyAfterMin: i < 3 ? 3 : 45 });
    if (i < 3) sale(`va${i}`, 1000, `2026-11-0${6 + (i % 4)}T18:00:00`, chat, ph);
  }
  // B
  for (let i = 0; i < 8; i++) {
    const ph = `55219000020${String(i).padStart(2, '0')}`;
    const chat = conv('222', 'Relógio B', ph, `2026-11-05T1${i}:30:00`, { reply: i < 2, replyAfterMin: 200 });
    if (i === 0) sale('vb0', 1500, '2026-11-08T11:00:00', chat, ph);
  }
  // C
  conv('333', 'Relógio C', '5521900003000', '2026-11-09T10:00:00');
  // D: uma das conversas é @lid; a venda vem só pelo telefone (sem wa_chat_id)
  for (let i = 0; i < 6; i++) {
    const ph = `55219000040${String(i).padStart(2, '0')}`;
    conv('444', 'Relógio D', ph, `2026-11-06T09:0${i}:00`, { reply: i < 3, chat: i === 0 ? '9988776655@lid' : undefined });
  }
  sale('vd0', 1100, '2026-11-07T16:00:00', null, '5521900004000');
  // venda orgânica (sem anúncio) e venda antes do 1º contato do anúncio
  leads.push({ chat_id: '5521900009999@c.us', phone: '5521900009999', first_message_at: sp('2026-11-05T10:00:00'), origin: 'organico', ad_id: null, ad_title: null });
  sale('vorg', 900, '2026-11-06T10:00:00', '5521900009999@c.us', '5521900009999');
  leads.push({ chat_id: '5521900008888@c.us', phone: '5521900008888', first_message_at: sp('2026-11-09T10:00:00'), origin: 'anuncio', ad_id: '111', ad_title: 'Relógio A' });
  sale('vantes', 700, '2026-11-04T10:00:00', null, '5521900008888');
  // período anterior: A vendeu 1 (R$ 1.000) com 2 conversas
  leads.push({ chat_id: '5521900007001@c.us', phone: '5521900007001', first_message_at: sp('2026-10-30T10:00:00'), origin: 'anuncio', ad_id: '111', ad_title: 'Relógio A' });
  leads.push({ chat_id: '5521900007002@c.us', phone: '5521900007002', first_message_at: sp('2026-10-30T11:00:00'), origin: 'anuncio', ad_id: '111', ad_title: 'Relógio A' });
  sale('vprev', 1000, '2026-10-31T15:00:00', '5521900007001@c.us', '5521900007001');
  return { leads, attributions: [], sends, replies, sales, names: [], conversions: [
    { chat_id: `55219000010${'00'}@c.us`, event_name: 'Purchase', error: null, value: 1000, test: false, status: 'enviado', created_at: sp('2026-11-06T18:05:00'), sale_id: 'va0' },
  ] };
}
const metaRows = (): MetaDaily[] => [
  ...spread('111', 'Relógio A', 300, 30000, 600, { purchases: 1 }),
  ...spread('222', 'Relógio B', 500, 50000, 1000),
  ...spread('333', 'Relógio C', 20, 2000, 30),
  ...spread('444', 'Relógio D', 200, 20000, 400),
  // período anterior: só A, R$ 150
  ...['2026-10-30', '2026-10-31'].map((d) => meta('111', 'Relógio A', d, 75, 7000, 140)),
];
const costs = (): Map<string, SaleCost> => new Map([
  ['va0', { id: 'va0', productCost: 400, models: [{ name: 'W10 - Preto', qty: 1 }] }],
  ['va1', { id: 'va1', productCost: 400, models: [{ name: 'W10 - Preto', qty: 1 }] }],
  ['va2', { id: 'va2', productCost: 400, models: [{ name: 'W10 - Rosa', qty: 1 }] }],
  ['vb0', { id: 'vb0', productCost: 700, models: [{ name: 'Ultra 9', qty: 1 }] }],
  ['vd0', { id: 'vd0', productCost: 500, models: [{ name: 'W10 - Preto', qty: 1 }] }],
  ['vprev', { id: 'vprev', productCost: 400, models: [] }],
]);
const goals: Goals = { ...DEFAULT_GOALS, cpaTarget: 200, profitMin: 100 };
const model = buildConversations(input());
const cards = buildAdCards({ model, meta: metaRows(), period: [{ ad_id: '111', reach: 20000, frequency: 1.5, impressions: 30000 }], costs: costs(), taxRate: TAX, goals }, R.cur);
const card = (k: string) => { const c = cards.find((x) => x.key === k); assert.ok(c, `cartão ${k}`); return c!; };

test('faixas de ROAS: acima de 7 ótimo, 6 a 7 bom, 4 a 6 ok, abaixo de 4 ruim', () => {
  assert.deepEqual([7.01, 7, 6.5, 6, 5.99, 4, 3.99, 0].map((r) => roasTier(r)), ['otimo', 'bom', 'bom', 'bom', 'ok', 'ok', 'ruim', 'ruim']);
  assert.equal(roasTier(null), null);
  assert.deepEqual([DEFAULT_GOALS.roasGreat, DEFAULT_GOALS.roasGood, DEFAULT_GOALS.roasOk], [7, 6, 4]);
});

test('lucro real, ROAS real e custos com o imposto do anúncio', () => {
  const m = moneyOf(300, 0.1, 3000, 1200, 3, 10);
  assert.deepEqual([m.spendReal, m.tax, m.profit, m.sales, m.conversations], [330, 30, 1470, 3, 10]);
  assert.equal(m.roas!.toFixed(4), (3000 / 330).toFixed(4));
  assert.equal(m.cpa, 110);
  assert.equal(m.cpc, 33);
  assert.equal(moneyOf(0, 0.1, 0, 0, 0, 0).roas, null);
});

test('ligação conversa → anúncio → venda: 💰, telefone e @lid contam; orgânica e venda antes do contato não', () => {
  const by = erpByAd(model, R.cur);
  assert.deepEqual([by.get('111')!.conversations, by.get('111')!.responded, by.get('111')!.sales, by.get('111')!.revenue], [11, 6, 3, 3000]);
  assert.deepEqual([by.get('222')!.conversations, by.get('222')!.sales, by.get('222')!.revenue], [8, 1, 1500]);
  assert.deepEqual([by.get('444')!.conversations, by.get('444')!.sales, by.get('444')!.saleIds], [6, 1, ['vd0']]);
  const all = [...by.values()].flatMap((a) => a.saleIds);
  assert.ok(!all.includes('vorg'), 'venda orgânica não entra');
  assert.ok(!all.includes('vantes'), 'venda antes do 1º contato pelo anúncio não entra');
  assert.equal(by.get('111')!.capiPurchases, 1, 'va0 ligada pelo 📈 (Purchase enviado)');
  const prev = erpByAd(model, R.prev);
  assert.deepEqual([prev.get('111')!.conversations, prev.get('111')!.sales], [2, 1]);
});

test('cartões: categorias, ROAS por anúncio e modelos vendidos', () => {
  const a = card('111'); const b = card('222'); const c = card('333'); const d = card('444');
  assert.equal(a.verdict.category, 'escalar'); assert.equal(a.verdict.tier, 'otimo'); assert.equal(a.verdict.action, ACTION.escalar);
  assert.equal(a.money.profit, 1470);
  assert.deepEqual(a.models, [{ name: 'W10 - Preto', qty: 2 }, { name: 'W10 - Rosa', qty: 1 }]);
  assert.equal(b.verdict.category, 'resolver'); assert.equal(b.verdict.tier, 'ruim');
  assert.equal(c.verdict.category, 'acompanhar'); assert.equal(c.verdict.action, ACTION.esperar);
  assert.equal(d.verdict.category, 'ajustar'); assert.equal(d.verdict.tier, 'ok');
  assert.equal(d.money.roas!.toFixed(6), '5.000000');
  assert.deepEqual(cards.map((x) => x.verdict.category), ['resolver', 'ajustar', 'escalar', 'acompanhar'], 'ordem: Resolver, Ajustar, Pode render mais, Acompanhar');
  cards.forEach((x) => assert.ok(x.verdict.reasons.length >= 1 && x.verdict.reasons.length <= 3, `${x.key}: 1 a 3 frases`));
  assert.ok(b.verdict.reasons[0].startsWith('ROAS real 2,7 (ruim)'), b.verdict.reasons[0]);
  assert.ok(/abaixo de 4,0/.test(b.verdict.rule), b.verdict.rule);
  assert.ok(b.verdict.numbers.some(([k, v]) => k === 'ROAS real' && v === '2,7'));
});

test('pouco dado (< R$ 30 ou < 5 conversas sem venda) → Acompanhar, sem julgamento', () => {
  const base = { responded: 0, impressions: 1000, clicks: 10, wear: { tired: false, text: null }, funnelWorst: null, funnelSteps: [] };
  assert.equal(verdictOf({ ...base, money: moneyOf(25, 0, 0, 0, 0, 20) }, DEFAULT_GOALS).category, 'acompanhar');
  assert.equal(verdictOf({ ...base, money: moneyOf(100, 0, 0, 0, 0, 3) }, DEFAULT_GOALS).category, 'acompanhar');
  // com custo por venda alvo: 3 conversas e gasto já acima do alvo, sem venda → Resolver
  assert.equal(verdictOf({ ...base, money: moneyOf(250, 0, 0, 0, 0, 3) }, { ...DEFAULT_GOALS, cpaTarget: 200 }).category, 'resolver');
  // gastou, conversou e não vendeu → Resolver com "não vendeu nada" e revisão de oferta/atendimento
  const v = verdictOf({ ...base, money: moneyOf(300, 0, 0, 0, 0, 12), funnelWorst: 'vendas', funnelSteps: funnelOf({ impressions: 10000, clicks: 200, conversations: 12, responded: 8, sales: 0 }).steps }, DEFAULT_GOALS);
  assert.equal(v.category, 'resolver'); assert.equal(v.action, ACTION.oferta);
  assert.ok(v.reasons[0].includes('não vendeu nada'), v.reasons[0]);
});

test('bom ROAS mas acima da meta de custo por venda ou abaixo do lucro mínimo → Ajustar', () => {
  const base = { responded: 5, impressions: 10000, clicks: 200, wear: { tired: false, text: null }, funnelWorst: null, funnelSteps: [] };
  const m = moneyOf(300, 0, 2000, 1500, 1, 10); // ROAS 6,7 (bom), custo/venda 300, lucro 200/venda
  assert.equal(verdictOf({ ...base, money: m }, DEFAULT_GOALS).category, 'escalar');
  assert.equal(verdictOf({ ...base, money: m }, { ...DEFAULT_GOALS, cpaTarget: 200 }).category, 'ajustar');
  assert.equal(verdictOf({ ...base, money: m }, { ...DEFAULT_GOALS, profitMin: 500 }).category, 'ajustar');
  const tired = verdictOf({ ...base, money: m, wear: { tired: true, text: 'CTR caiu' } }, DEFAULT_GOALS);
  assert.deepEqual([tired.category, tired.action], ['ajustar', ACTION.criativo]);
});

test('desgaste: CTR caindo 20%+ e frequência subindo 10%+ → aviso', () => {
  const d = (i: number, ctr: number, f: number) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, spend: 10, impressions: 1000, clicks: ctr * 10, frequency: f, ctr, cpm: 10 });
  const tired = wearOf(Array.from({ length: 10 }, (_, i) => d(i, i < 5 ? 2 : 1.2, i < 5 ? 1.4 : 2.2)), '2026-11-30');
  assert.equal(tired.tired, true); assert.ok(/CTR caiu 40%/.test(tired.text || ''), tired.text || '');
  assert.equal(wearOf(Array.from({ length: 10 }, (_, i) => d(i, 2, 1.5)), '2026-11-30').tired, false);
  assert.equal(wearOf(Array.from({ length: 4 }, (_, i) => d(i, i < 2 ? 2 : 1, 1 + i)), '2026-11-30').tired, false, 'menos de 6 dias: sem julgar');
  assert.equal(card('111').wear.series.length, 9, '7 dias do período + 2 do anterior (até 14 dias para o mini gráfico)');
});

test('funil: a maior perda é a etapa mais abaixo da referência', () => {
  const f = funnelOf({ impressions: 10000, clicks: 200, conversations: 30, responded: 3, sales: 1 });
  assert.equal(f.worst, 'respondidas');
  assert.deepEqual(f.steps.map((s) => s.value), [10000, 200, 30, 3, 1]);
  assert.equal(funnelOf({ impressions: 10000, clicks: 300, conversations: 60, responded: 40, sales: 10 }).worst, null, 'tudo acima da referência: sem destaque');
});

test('topo: totais da conta e ▲▼ vs período anterior', () => {
  const t = totalsOf(model, metaRows(), costs(), TAX, R.cur);
  assert.equal(t.spend, 1020); assert.equal(t.spendReal, 1122);
  assert.deepEqual([t.revenue, t.sales, t.productCost], [5600, 5, 2400]);
  assert.equal(t.profit, 5600 - 2400 - 1122);
  assert.equal(t.conversations, 11 + 8 + 1 + 6);
  const p = totalsOf(model, metaRows(), costs(), TAX, R.prev);
  assert.deepEqual([p.spend, p.revenue, p.sales, p.conversations], [150, 1000, 1, 2]);
});

test('decisões e "Para onde foi o seu dinheiro"', () => {
  const boxes = categoryBoxes(cards);
  assert.deepEqual(boxes.map((b) => [b.category, b.count]), [['resolver', 1], ['ajustar', 1], ['escalar', 1], ['acompanhar', 1]]);
  assert.equal(boxes[0].spendReal, 550);
  const split = moneySplit(cards);
  assert.deepEqual(split.map((s) => s.label), ['Dando resultado', 'Atenção', 'Poucos dados', 'Prejuízo']);
  assert.equal(Math.round(split.reduce((s, x) => s + x.pct, 0) * 1000) / 1000, 1);
});

test('extras: horários, tempo da 1ª resposta, Conferir com a Meta', () => {
  const h = hourMap(model, R.cur);
  assert.equal(h.conversations.flat().reduce((a, b) => a + b, 0), 26);
  assert.equal(h.sales.flat().reduce((a, b) => a + b, 0), 5);
  const bands = replyBands(model, R.cur);
  assert.deepEqual(bands.map((b) => [b.key, b.conversations, b.sold]), [['ate5', 3, 3], ['ate30', 0, 0], ['ate120', 7, 0], ['mais', 8, 1], ['sem', 8, 1]]);
  const chk = metaCheck(cards);
  const a = chk.find((r) => r.key === '111')!;
  assert.deepEqual([a.metaPurchases, a.erpSales, a.capiPurchases, a.diff], [7, 3, 1, 4]);
  assert.ok(card('111').medianMinutesToSale! > 0);
});

test('metas: padrão, leitura segura, sugestão pela média de 30 dias', () => {
  assert.deepEqual(parseGoals(null), DEFAULT_GOALS);
  assert.deepEqual(parseGoals('lixo'), DEFAULT_GOALS);
  const g = parseGoals(goalsJson({ ...DEFAULT_GOALS, cpaTarget: 150, profitMin: 80, roasOk: 3 }));
  assert.deepEqual([g.cpaTarget, g.profitMin, g.roasOk, g.roasGood, g.roasGreat], [150, 80, 3, 6, 7]);
  assert.deepEqual(parseGoals('{"roasGreat":3,"roasGood":6,"roasOk":4}').roasGreat, 7, 'faixas fora de ordem voltam ao padrão');
  const s = suggestGoals({ sales: 4, cpa: 123.4, profit: 1000 }, DEFAULT_GOALS);
  assert.deepEqual([s.cpaTarget, s.profitMin], [123, 250]);
  assert.equal(suggestGoals({ sales: 4, cpa: 123.4, profit: 1000 }, { ...DEFAULT_GOALS, cpaTarget: 99 }).cpaTarget, 99, 'meta salva não é trocada');
});

test('períodos: 7 dias, anterior do mesmo tamanho, janela da Meta com 14 dias para o desgaste', () => {
  assert.deepEqual([R.cur.fromDay, R.cur.toDay, R.cur.days, R.prev.fromDay, R.prev.toDay], ['2026-11-04', '2026-11-10', 7, '2026-10-28', '2026-11-03']);
  assert.deepEqual(metaFetchWindow(R), { since: '2026-10-28', until: '2026-11-10', periodSince: '2026-11-04' });
  const h = adRanges('hoje', NOW);
  assert.deepEqual([h.cur.fromDay, h.prev.fromDay], ['2026-11-10', '2026-11-09']);
  assert.deepEqual(metaFetchWindow(h).since, '2026-10-28');
  const n = adRanges('90', NOW);
  assert.equal(n.cur.days, 90); assert.equal(n.prev.days, 90);
  const c = adRanges('custom', NOW, { start: '2026-11-08', end: '2026-12-31' });
  assert.deepEqual([c.cur.fromDay, c.cur.toDay], ['2026-11-08', '2026-11-10'], 'não passa de hoje');
  assert.equal(windowOf('2026-11-01', '2026-11-01').days, 1);
});

// ── Modo "Estimado": repartição das vendas sem origem (10/11) ──
// No período: 5 vendas identificadas (A 3, B 1, D 1 = R$ 5.600) + 2 sem origem (orgânica R$ 900 em 06/11 e a venda
// antes do 1º contato R$ 700 em 04/11). Conversas de anúncio: A 11, B 8, C 1, D 6 = 26.
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} ${a} ≠ ${b}`);
const pSales = periodSales(input().sales, R.cur);
const erpCur = erpByAd(model, R.cur);
const T0 = Date.parse('2026-11-04T00:00:00-03:00');

test('estimado: soma das vendas estimadas = vendas sem origem (quantidade e R$)', () => {
  const a = attributeSales(erpCur, pSales, costs(), T0);
  assert.equal(a.all.count, 7); near(a.all.revenue, 7200);
  assert.equal(a.identified.count, 5); near(a.identified.revenue, 5600);
  assert.equal(a.unattributed.count, 2); near(a.unattributed.revenue, 1600);
  assert.equal(a.totalConversations, 26); assert.ok(a.distributed);
  const sh = [...a.shares.values()];
  near(sh.reduce((x, s) => x + s.sales, 0), a.unattributed.count, 'vendas');
  near(sh.reduce((x, s) => x + s.revenue, 0), a.unattributed.revenue, 'R$');
  near(sh.reduce((x, s) => x + s.share, 0), 1, 'partes');
  near(a.shares.get('111')!.sales, 2 * 11 / 26, 'A pela proporção das conversas');
  // cartões no modo Estimado: identificadas + estimada; soma do faturamento = identificado + repartido
  const est = buildAdCards({ model, meta: metaRows(), period: [], costs: costs(), taxRate: TAX, goals, mode: 'estimado', attribution: a }, R.cur);
  const cA = est.find((c) => c.key === '111')!;
  assert.equal(cA.identifiedSales, 3); near(cA.estimatedSales, 2 * 11 / 26); near(cA.money.sales, 3 + 2 * 11 / 26);
  near(est.reduce((x, c) => x + c.money.revenue, 0), 5600 + 1600, 'faturamento dos cartões');
  assert.ok(cA.verdict.numbers.some(([k, v]) => k === 'Vendas estimadas' && /11 de 26 conversas/.test(v)), '"Por quê?" explica a estimada');
  // "Só identificado": nada estimado
  const ident = buildAdCards({ model, meta: metaRows(), period: [], costs: costs(), taxRate: TAX, goals, mode: 'identificado', attribution: a }, R.cur);
  assert.ok(ident.every((c) => c.estimatedSales === 0 && c.money.sales === c.identifiedSales));
  // topo: Estimado usa TODAS as vendas do período; identificado, só as ligadas
  const tE = totalsOf(model, metaRows(), costs(), TAX, R.cur, { mode: 'estimado', attribution: a });
  const tI = totalsOf(model, metaRows(), costs(), TAX, R.cur, { mode: 'identificado', attribution: a });
  near(tE.revenue, 7200); assert.equal(tE.sales, 7); near(tI.revenue, 5600);
  const trio = roasTrio(metaRows(), TAX, R.cur, a);
  near(trio.general!, 7200 / 1122); near(trio.identified!, 5600 / 1122); assert.equal(trio.unattributed.count, 2);
  // Conferir com a Meta: coluna das estimadas ao lado das identificadas
  const chk = metaCheck(est).find((r) => r.key === '111')!;
  assert.deepEqual([chk.metaPurchases, chk.erpSales], [7, 3]); near(chk.estimated, 2 * 11 / 26);
});

test('estimado: anúncio sem conversa no período não recebe venda estimada', () => {
  const erp = new Map(erpCur);
  erp.set('999', { key: '999', adId: '999', title: 'Antigo', conversations: 0, responded: 0, sales: 0, revenue: 0, saleIds: [], capiPurchases: 0, minutesToSale: [] });
  const a = attributeSales(erp, pSales, costs(), T0);
  assert.equal(a.shares.has('999'), false);
  near([...a.shares.values()].reduce((x, s) => x + s.sales, 0), 2);
  // anúncio só com gasto na Meta (sem conversa): cartão sem estimada
  const est = buildAdCards({ model, meta: [...metaRows(), ...spread('555', 'Relógio E', 210, 9000, 90)], period: [], costs: costs(), taxRate: TAX, goals, mode: 'estimado', attribution: attributeSales(erpCur, pSales, costs(), T0) }, R.cur);
  const e = est.find((c) => c.key === '555')!;
  assert.equal(e.estimatedSales, 0); assert.equal(e.money.sales, 0); assert.equal(e.share, null);
  // sem nenhuma conversa de anúncio: nada é repartido
  const none = attributeSales(new Map(), pSales, costs(), T0);
  assert.equal(none.distributed, false); assert.equal(none.shares.size, 0); assert.equal(none.unattributed.count, 7);
});

test('estimado: período antes do início do rastreio', () => {
  // rastreio começou em 05/11: a venda sem origem de 04/11 fica fora da repartição (antes do rastreio)
  const a = attributeSales(erpCur, pSales, costs(), Date.parse('2026-11-05T00:00:00-03:00'));
  assert.equal(a.preTrack.count, 1); near(a.preTrack.revenue, 700);
  assert.equal(a.distributable.count, 1); near([...a.shares.values()].reduce((x, s) => x + s.sales, 0), 1);
  assert.equal(a.unattributed.count, 2, 'continua contando como sem origem');
  // período inteiro antes do rastreio: nada repartido
  const late = attributeSales(erpCur, pSales, costs(), Date.parse('2026-11-20T00:00:00-03:00'));
  assert.equal(late.distributed, false); assert.equal(late.preTrack.count, 2);
  assert.ok([...late.shares.values()].every((s) => s.sales === 0 && s.revenue === 0));
  // sem nenhum registro de anúncio ainda (null): nada repartido
  assert.equal(attributeSales(erpCur, pSales, costs(), null).distributed, false);
  // aviso no topo
  assert.equal(startsBeforeTracking(R.cur, '2026-11-05'), true);
  assert.equal(startsBeforeTracking(R.cur, '2026-11-04'), false);
  assert.equal(startsBeforeTracking(R.cur, null), false);
  assert.equal(dayBR('2026-11-04'), '04/11');
  assert.deepEqual([salesTxt(3), salesTxt(1.8), salesTxt(2.999)], ['3', '1,8', '3']);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
console.log(`${tests.length - failed}/${tests.length} testes passaram`);
if (failed) process.exitCode = 1;
