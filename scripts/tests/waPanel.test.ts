// Testes das regras do Painel de resultados do WhatsApp (src/lib/waPanel.ts).
// Sem dependências: node scripts/tests/waPanel.test.ts  (Node 22.6+ roda TypeScript direto)
import assert from 'node:assert/strict';
import {
  periodRanges, computePanel, buildIndex, summaryFor, followFunnel, quickMessageTable, automationTable, adTable, leadHeatmap,
  dailySeries, saleTime, spDay, delta, median, originOf, stepOfSend, loadWindow, mergeActivityLeads,
  type PanelInput, type SendRow,
} from '../../src/lib/waPanel.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const sp = (s: string) => new Date(`${s}-03:00`).toISOString(); // "2026-11-02T10:00:00" no horário de SP

const NOW = Date.parse('2026-11-06T15:00:00-03:00'); // sexta
const ranges = periodRanges('7d', NOW); // 31/10 a 06/11; anterior 24/10 a 30/10
const steps = (input: PanelInput) => new Map(input.items.filter((i) => i.follow_step).map((i) => [i.id, i.follow_step as number]));

const base = (): PanelInput => ({ leads: [], replies: [], sends: [], sales: [], attributions: [], items: [], names: {} });
let n = 0;
const send = (chat: string, at: string, extra: Partial<SendRow> = {}): SendRow => ({ id: `s${++n}`, chat_id: chat, created_at: sp(at), source: 'rapida', source_id: null, item_id: null, status: 'enviado', origin: 'rapida', follow_step: null, ...extra });

// ── Períodos ──
test('período: 7 dias e o anterior de mesmo tamanho', () => {
  assert.equal(ranges.cur.fromDay, '2026-10-31');
  assert.equal(ranges.cur.toDay, '2026-11-06');
  assert.equal(ranges.prev.fromDay, '2026-10-24');
  assert.equal(ranges.prev.toDay, '2026-10-30');
  assert.equal(ranges.cur.days, 7);
});
test('período: hoje, ontem, este mês (mesmo trecho do mês passado) e personalizado', () => {
  assert.equal(periodRanges('hoje', NOW).cur.fromDay, '2026-11-06');
  assert.equal(periodRanges('hoje', NOW).prev.fromDay, '2026-11-05');
  assert.equal(periodRanges('ontem', NOW).cur.toDay, '2026-11-05');
  const mes = periodRanges('mes', NOW);
  assert.deepEqual([mes.cur.fromDay, mes.cur.toDay, mes.prev.fromDay, mes.prev.toDay], ['2026-11-01', '2026-11-06', '2026-10-01', '2026-10-06']);
  const marco = periodRanges('mes', Date.parse('2026-03-31T10:00:00-03:00'));
  assert.equal(marco.prev.toDay, '2026-02-28'); // fevereiro não tem 31
  const c = periodRanges('custom', NOW, { start: '2026-10-10', end: '2026-10-01' });
  assert.deepEqual([c.cur.fromDay, c.cur.toDay, c.cur.days], ['2026-10-01', '2026-10-10', 10]);
  assert.equal(c.prev.toDay, '2026-09-30');
});
test('período: limites no horário de São Paulo', () => {
  assert.equal(spDay(Date.parse('2026-11-01T02:30:00Z')), '2026-10-31'); // 23:30 em SP
  assert.equal(ranges.cur.from, Date.parse('2026-10-31T00:00:00-03:00'));
});
test('janela de carga cobre 7 dias antes e depois e 90 dias de telefones', () => {
  const w = loadWindow(ranges);
  assert.equal(w.until, ranges.cur.to + 7 * 86400000);
  assert.equal(w.sendsFrom, ranges.prev.from - 7 * 86400000);
  assert.equal(w.knownFrom, ranges.prev.from - 90 * 86400000);
});

// ── Atribuição de venda ──
test('venda pelo WhatsApp: 💰 da conversa ou venda do ERP com o telefone de uma conversa', () => {
  const input = base();
  input.leads.push({ chat_id: '5511911112222@c.us', phone: '5511911112222', first_message_at: sp('2026-11-01T10:00:00'), origin: 'organico', ad_id: null, ad_title: null });
  input.leads.push({ chat_id: '123456@lid', phone: '5511933334444', first_message_at: sp('2026-11-01T11:00:00'), origin: 'organico', ad_id: null, ad_title: null });
  input.sales.push(
    { id: 'v1', sale_date: '2026-11-02', created_at: sp('2026-11-02T14:00:00'), total_sale_price: 100, customer_phone: null, wa_chat_id: '5511955556666@c.us', origin: 'organico' }, // 💰
    { id: 'v2', sale_date: '2026-11-03', created_at: null, total_sale_price: 200, customer_phone: '(11) 91111-2222', wa_chat_id: null }, // ERP, telefone de lead @c.us
    { id: 'v3', sale_date: '2026-11-03', created_at: null, total_sale_price: 300, customer_phone: '11933334444', wa_chat_id: null }, // ERP, telefone de lead @lid
    { id: 'v4', sale_date: '2026-11-03', created_at: null, total_sale_price: 400, customer_phone: '11977778888', wa_chat_id: null }, // ERP, nunca falou no WhatsApp
  );
  const idx = buildIndex(input);
  assert.deepEqual(idx.waSales.map((s) => s.id).sort(), ['v1', 'v2', 'v3']);
  const s = summaryFor(input, idx, ranges.cur, steps(input));
  assert.equal(s.sales, 3);
  assert.equal(s.revenue, 600);
  assert.equal(s.ticket, 200);
  assert.equal(s.leads, 2);
  assert.equal(s.leadsBought, 2); // os dois leads compraram depois da 1ª mensagem
  assert.equal(s.conversion, 1);
});
test('hora da venda: created_at do mesmo dia; senão meio-dia da data da venda', () => {
  assert.equal(saleTime({ sale_date: '2026-11-02', created_at: sp('2026-11-02T09:15:00') }), Date.parse(sp('2026-11-02T09:15:00')));
  assert.equal(saleTime({ sale_date: '2026-11-02', created_at: sp('2026-11-05T09:15:00') }), Date.parse(sp('2026-11-02T12:00:00')));
});
test('venda depois de follow-up: até 7 dias depois do último follow-up recebido', () => {
  const input = base();
  input.items.push({ id: 'f1', title: 'Follow 1', follow_step: 1 });
  input.sends.push(
    send('5511900000001@c.us', '2026-10-30T10:00:00', { item_id: 'f1', follow_step: 1 }), // 3 dias antes da venda
    send('5511900000002@c.us', '2026-10-25T10:00:00', { item_id: 'f1', follow_step: 1 }), // 8 dias antes: fora
    send('5511900000003@c.us', '2026-11-04T10:00:00', { item_id: 'f1', follow_step: 1 }), // depois da venda: não conta
    send('5511900000004@c.us', '2026-11-01T10:00:00', { origin: 'manual', source: 'manual' }), // não é follow-up
  );
  ['1', '2', '3', '4'].forEach((d, i) => input.sales.push({ id: `v${d}`, sale_date: '2026-11-02', created_at: sp('2026-11-02T15:00:00'), total_sale_price: 10 * (i + 1), customer_phone: null, wa_chat_id: `551190000000${d}@c.us` }));
  const s = summaryFor(input, buildIndex(input), ranges.cur, steps(input));
  assert.equal(s.sales, 4);
  assert.equal(s.afterFollow, 1);
  assert.equal(s.afterFollowRevenue, 10);
});
test('envio antigo sem etapa usa a etapa da mensagem rápida (manual nunca é follow-up)', () => {
  const st = new Map([['f2', 2]]);
  assert.equal(stepOfSend(send('x@c.us', '2026-11-01T10:00:00', { item_id: 'f2', follow_step: null }), st), 2);
  assert.equal(stepOfSend(send('x@c.us', '2026-11-01T10:00:00', { item_id: 'f2', follow_step: 3 }), st), 3);
  assert.equal(stepOfSend(send('x@c.us', '2026-11-01T10:00:00', { origin: 'manual', source: 'manual', item_id: 'f2' }), st), null);
  assert.equal(originOf({ origin: null, source: 'follow' }), 'automacao');
  assert.equal(originOf({ origin: null, source: 'agendado' }), 'agendada');
});
test('venda de anúncio: anúncio da conversa (wa_ad_attribution / lead de anúncio) ou origem da venda', () => {
  const input = base();
  input.attributions.push({ chat_id: '5511900000010@c.us', phone: '5511900000010', ad_id: 'A1', ad_title: 'Promo', first_message_at: sp('2026-11-01T08:00:00') });
  input.leads.push({ chat_id: '5511900000011@c.us', phone: null, first_message_at: sp('2026-11-01T09:00:00'), origin: 'anuncio', ad_id: 'A2', ad_title: 'Outro' });
  input.sales.push(
    { id: 'a', sale_date: '2026-11-02', total_sale_price: 50, customer_phone: '11900000010', wa_chat_id: null },
    { id: 'b', sale_date: '2026-11-02', total_sale_price: 60, customer_phone: null, wa_chat_id: '5511900000011@c.us' },
    { id: 'c', sale_date: '2026-11-02', total_sale_price: 70, customer_phone: null, wa_chat_id: '5511900000012@c.us', origin: 'anuncio' },
    { id: 'd', sale_date: '2026-11-02', total_sale_price: 80, customer_phone: null, wa_chat_id: '5511900000013@c.us', origin: 'organico' },
  );
  const s = summaryFor(input, buildIndex(input), ranges.cur, steps(input));
  assert.equal(s.fromAd, 3);
  assert.equal(s.fromAdRevenue, 180);
  assert.equal(s.leadsAd, 2); // o anúncio antigo (só wa_ad_attribution) também conta como lead de anúncio
});

// ── Funil ──
test('funil: conta conversas, resposta, tempo mediano, compra e "seguiu sem responder"', () => {
  const input = base();
  input.items.push({ id: 'f1', title: 'Follow 1', follow_step: 1 }, { id: 'f2', title: 'Follow 2', follow_step: 2 });
  const a1 = send('5511900000021@c.us', '2026-11-01T10:00:00', { item_id: 'f1', follow_step: 1, origin: 'automacao', source: 'follow' });
  const a1b = send('5511900000021@c.us', '2026-11-01T18:00:00', { item_id: 'f1', follow_step: 1, origin: 'automacao', source: 'follow' }); // mesma conversa de novo
  const b1 = send('5511900000022@c.us', '2026-11-01T10:00:00', { item_id: 'f1', follow_step: 1 });
  const c1 = send('5511900000023@c.us', '2026-11-01T10:00:00', { item_id: 'f1', follow_step: 1 });
  const d1 = send('5511900000024@c.us', '2026-11-01T10:00:00', { item_id: 'f1', follow_step: 1 });
  const b2 = send('5511900000022@c.us', '2026-11-03T10:00:00', { item_id: 'f2', follow_step: 2 });
  input.sends.push(a1, a1b, b1, c1, d1, b2);
  input.replies.push(
    { chat_id: '5511900000021@c.us', replied_at: sp('2026-11-01T10:10:00'), send_log_id: a1.id, minutes: 10 },
    { chat_id: '5511900000024@c.us', replied_at: sp('2026-11-01T10:30:00'), send_log_id: d1.id, minutes: 30 },
  );
  input.sales.push({ id: 'v', sale_date: '2026-11-04', total_sale_price: 500, customer_phone: null, wa_chat_id: '5511900000021@c.us' });
  const f = followFunnel(input, buildIndex(input), ranges.cur, steps(input));
  assert.equal(f.length, 2);
  const s1 = f[0];
  assert.deepEqual([s1.step, s1.received, s1.responded, s1.medianMinutes, s1.bought, s1.revenue, s1.advancedNoReply], [1, 4, 2, 20, 1, 500, 1]);
  assert.equal(s1.respondedPct, 0.5);
  assert.equal(s1.advancedPct, 0.25);
  assert.deepEqual([f[1].step, f[1].received, f[1].responded], [2, 1, 0]);
});

// ── Tabelas ──
test('mensagem rápida: enviadas, responderam, tempo mediano, vendas em até 7 dias (sem repetir venda)', () => {
  const input = base();
  input.items.push({ id: 'q1', title: 'Boas-vindas' }, { id: 'q2', title: 'Preço' });
  const s1 = send('5511900000031@c.us', '2026-11-01T10:00:00', { item_id: 'q1' });
  const s2 = send('5511900000031@c.us', '2026-11-02T10:00:00', { item_id: 'q1' });
  const s3 = send('5511900000032@c.us', '2026-11-01T10:00:00', { item_id: 'q1' });
  const s4 = send('5511900000033@c.us', '2026-11-01T10:00:00', { item_id: 'q2' });
  input.sends.push(s1, s2, s3, s4, send('5511900000034@c.us', '2026-10-20T10:00:00', { item_id: 'q2' })); // fora do período
  input.replies.push({ chat_id: '5511900000031@c.us', replied_at: sp('2026-11-01T10:04:00'), send_log_id: s1.id, minutes: 4 }, { chat_id: '5511900000032@c.us', replied_at: sp('2026-11-01T11:00:00'), send_log_id: s3.id, minutes: 60 });
  input.sales.push(
    { id: 'v1', sale_date: '2026-11-03', total_sale_price: 100, customer_phone: null, wa_chat_id: '5511900000031@c.us' },
    { id: 'v2', sale_date: '2026-11-20', total_sale_price: 900, customer_phone: null, wa_chat_id: '5511900000033@c.us' }, // mais de 7 dias
  );
  const t = quickMessageTable(input, buildIndex(input), ranges.cur);
  const q1 = t.find((r) => r.id === 'q1')!;
  assert.deepEqual([q1.name, q1.sent, q1.replied, q1.medianMinutes, q1.sales, q1.revenue], ['Boas-vindas', 3, 2, 32, 1, 100]);
  const q2 = t.find((r) => r.id === 'q2')!;
  assert.deepEqual([q2.sent, q2.replied, q2.sales], [1, 0, 0]);
  assert.equal(t[0].id, 'q1'); // mais usadas primeiro
});
test('automações e disparos: agrupa por automação/disparo com o nome; agendadas juntas; manual e rápida fora', () => {
  const input = base();
  input.names = { A: 'Follow carrinho', D: 'Black Friday' };
  const x = send('5511900000041@c.us', '2026-11-01T10:00:00', { origin: 'automacao', source: 'follow', source_id: 'A' });
  input.sends.push(x,
    send('5511900000042@c.us', '2026-11-01T10:00:00', { origin: null, source: 'follow', source_id: 'A' }), // linha antiga sem origin
    send('5511900000043@c.us', '2026-11-01T10:00:00', { origin: 'disparo', source: 'disparo', source_id: 'D' }),
    send('5511900000044@c.us', '2026-11-01T10:00:00', { origin: 'agendada', source: 'agendado', source_id: 'S1' }),
    send('5511900000045@c.us', '2026-11-01T10:00:00', { origin: 'manual', source: 'manual' }));
  input.replies.push({ chat_id: '5511900000041@c.us', replied_at: sp('2026-11-01T12:00:00'), send_log_id: x.id, minutes: 120 });
  const t = automationTable(input, buildIndex(input), ranges.cur);
  assert.deepEqual(t.map((r) => [r.name, r.sent, r.replied]), [['Follow carrinho', 2, 1], ['Black Friday', 1, 0], ['Mensagens agendadas', 1, 0]]);
});
test('anúncios: leads, responderam, vendas e R$ por anúncio', () => {
  const input = base();
  input.leads.push(
    { chat_id: '5511900000051@c.us', phone: null, first_message_at: sp('2026-11-01T10:00:00'), origin: 'anuncio', ad_id: 'AD1', ad_title: 'Óculos' },
    { chat_id: '5511900000052@c.us', phone: null, first_message_at: sp('2026-11-02T10:00:00'), origin: 'anuncio', ad_id: 'AD1', ad_title: 'Óculos' },
    { chat_id: '5511900000053@c.us', phone: null, first_message_at: sp('2026-11-02T10:00:00'), origin: 'organico', ad_id: null, ad_title: null },
  );
  const s = send('5511900000051@c.us', '2026-11-01T10:05:00');
  input.sends.push(s);
  input.replies.push({ chat_id: '5511900000051@c.us', replied_at: sp('2026-11-01T10:20:00'), send_log_id: s.id, minutes: 15 });
  input.sales.push({ id: 'v', sale_date: '2026-11-03', total_sale_price: 250, customer_phone: null, wa_chat_id: '5511900000051@c.us' });
  const t = adTable(input, buildIndex(input), ranges.cur);
  assert.equal(t.length, 1);
  assert.deepEqual([t[0].adId, t[0].title, t[0].leads, t[0].replied, t[0].sales, t[0].revenue], ['AD1', 'Óculos', 2, 1, 1, 250]);
});
test('horários: lead de segunda 10h30 cai em [1][10]; leads por dia separam anúncio e orgânico', () => {
  const input = base();
  input.leads.push(
    { chat_id: '5511900000061@c.us', phone: null, first_message_at: sp('2026-11-02T10:30:00'), origin: 'anuncio', ad_id: null, ad_title: null },
    { chat_id: '5511900000062@c.us', phone: null, first_message_at: sp('2026-11-02T23:50:00'), origin: 'organico', ad_id: null, ad_title: null },
  );
  const idx = buildIndex(input);
  const h = leadHeatmap(input, idx, ranges.cur);
  assert.equal(h[1][10], 1);
  assert.equal(h[1][23], 1);
  const d = dailySeries(input, idx, ranges.cur);
  assert.equal(d.length, 7);
  const mon = d.find((p) => p.day === '2026-11-02')!;
  assert.deepEqual([mon.anuncio, mon.organico], [1, 1]);
});
test('respondidas: conversas (não mensagens) e comparação com o período anterior', () => {
  const input = base();
  input.replies.push(
    { chat_id: '5511900000071@c.us', replied_at: sp('2026-11-01T10:00:00'), send_log_id: 'x1', minutes: 1 },
    { chat_id: '5511900000071@c.us', replied_at: sp('2026-11-02T10:00:00'), send_log_id: 'x2', minutes: 1 },
    { chat_id: '5511900000072@c.us', replied_at: sp('2026-11-02T10:00:00'), send_log_id: 'x3', minutes: 1 },
    { chat_id: '5511900000073@c.us', replied_at: sp('2026-10-26T10:00:00'), send_log_id: 'x4', minutes: 1 },
  );
  const r = computePanel(input, ranges);
  assert.equal(r.summary.replied, 2);
  assert.equal(r.previous.replied, 1);
  assert.equal(delta(r.summary.replied, r.previous.replied), 1); // +100%
  assert.equal(delta(5, 0), null); // sem base
  assert.equal(delta(0, 0), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});
test('compras enviadas ao Facebook vêm prontas (atual e anterior)', () => {
  const input = { ...base(), fb: { cur: { count: 3, total: 450.5 }, prev: { count: 1, total: 100 } } };
  const r = computePanel(input, ranges);
  assert.deepEqual([r.summary.fbPurchases, r.summary.fbRevenue, r.previous.fbPurchases], [3, 450.5, 1]);
});
// ── 2.12.8: Conversas ativas x Leads novos ──
test('2.12.8: "Conversas ativas" (o cliente falou no período, novas ou antigas) separado de "Leads novos" (1º contato)', () => {
  const input = base();
  const OLD1 = '5511900000081@c.us'; const OLD2 = '5511900000082@c.us'; const LEAD = '5511900000083@c.us'; const STORE = '5511900000084@c.us'; const PREV = '5511900000085@c.us';
  input.leads.push({ chat_id: LEAD, phone: '5511900000083', first_message_at: sp('2026-11-04T10:00:00'), origin: 'organico', ad_id: null, ad_title: null });
  input.activityDays = [
    { chat_id: OLD1, day: '2026-11-03', from_customer: true, from_store: false },
    { chat_id: OLD1, day: '2026-11-05', from_customer: true, from_store: true }, // a mesma conversa em 2 dias: conta 1
    { chat_id: OLD2, day: '2026-11-06', from_customer: true, from_store: false },
    { chat_id: LEAD, day: '2026-11-04', from_customer: true, from_store: true }, // lead do período: conta 1 só
    { chat_id: STORE, day: '2026-11-05', from_customer: false, from_store: true }, // só a loja falou: não conta
    { chat_id: PREV, day: '2026-10-28', from_customer: true, from_store: false }, // período anterior
  ];
  input.replies.push({ chat_id: STORE, replied_at: sp('2026-10-29T10:00:00'), send_log_id: 'r1', minutes: 3 }); // respondeu no anterior
  const r = computePanel(input, ranges);
  assert.deepEqual([r.summary.active, r.summary.leads], [3, 1]);
  assert.deepEqual([r.previous.active, r.previous.leads], [2, 0]);
});
test('2.12.8: lead novo achado pela atividade (is_new_lead) entra nos leads sem repetir o de wa_leads', () => {
  const leads = [{ chat_id: 'a@c.us', phone: null, first_message_at: sp('2026-11-02T10:00:00'), origin: 'anuncio', ad_id: 'X', ad_title: 'Promo' }];
  const out = mergeActivityLeads(leads, [
    { chat_id: 'a@c.us', phone: null, first_message_at: sp('2026-11-02T10:00:00'), last_message_at: null, last_from: null, last_customer_at: null, is_new_lead: true },
    { chat_id: '5511900000091@c.us', phone: '5511900000091', first_message_at: sp('2026-11-05T23:00:00'), last_message_at: null, last_from: null, last_customer_at: null, is_new_lead: true },
    { chat_id: '5511900000092@c.us', phone: null, first_message_at: sp('2026-11-05T23:00:00'), last_message_at: null, last_from: null, last_customer_at: null, is_new_lead: false },
    { chat_id: '5511900000093@c.us', phone: null, first_message_at: null, last_message_at: null, last_from: null, last_customer_at: null, is_new_lead: true },
  ]);
  assert.deepEqual(out.map((l) => [l.chat_id, l.origin]), [['a@c.us', 'anuncio'], ['5511900000091@c.us', 'organico']]);
  assert.equal(mergeActivityLeads(leads, undefined), leads);
});

test('ERP 09/11: "Aguardando 1ª resposta agora" = leads dos últimos 7 dias sem nenhuma mensagem da loja depois', () => {
  const input = base();
  const lead = (n: number, at: string) => ({ chat_id: `55119000001${n}@c.us`, phone: null, first_message_at: sp(at), origin: 'organico', ad_id: null, ad_title: null });
  input.leads.push(lead(1, '2026-11-06T10:00:00'), lead(2, '2026-11-06T11:00:00'), lead(3, '2026-11-05T09:00:00'), lead(4, '2026-11-05T09:00:00'), lead(5, '2026-10-20T09:00:00'));
  input.sends.push(send('551190000012@c.us', '2026-11-06T11:05:00')); // a loja respondeu a 2
  input.activityDays = [{ chat_id: '551190000013@c.us', day: '2026-11-05', from_customer: true, from_store: true }]; // a loja falou com a 3
  input.activity = [{ chat_id: '551190000014@c.us', phone: null, first_message_at: null, last_message_at: sp('2026-11-05T10:00:00'), last_from: 'loja', last_customer_at: null, is_new_lead: true }]; // última da loja
  const r = computePanel(input, ranges); // 5: de outubro (fora dos 7 dias)
  assert.equal(r.awaiting, 1); // só a 1
  assert.equal(computePanel(input, periodRanges('7d', Date.parse('2026-10-21T12:00:00-03:00'))).awaiting, 1); // período passado: até o fim dele (a 5)
});
test('ERP 09/11: "vendas depois de follow-up" conta também os envios das automações/réguas', () => {
  const input = base();
  const C = '5511900000081@c.us';
  input.sends.push(send(C, '2026-11-02T10:00:00', { source: 'follow', origin: 'automacao', source_id: 'auto1' }));
  input.sales.push({ id: 'v9', sale_date: '2026-11-04', created_at: sp('2026-11-04T10:00:00'), total_sale_price: 80, customer_phone: null, wa_chat_id: C });
  const s = computePanel(input, ranges).summary;
  assert.deepEqual([s.sales, s.afterFollow, s.afterFollowRevenue], [1, 1, 80]);
});

test('sem dados: tudo zerado, sem erro', () => {
  const r = computePanel(base(), ranges);
  assert.equal(r.summary.leads, 0);
  assert.equal(r.summary.active, 0);
  assert.equal(r.summary.ticket, null);
  assert.equal(r.summary.conversion, null);
  assert.deepEqual([r.funnel, r.quick, r.ads, r.automations], [[], [], [], []]);
  assert.equal(r.daily.length, 7);
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
