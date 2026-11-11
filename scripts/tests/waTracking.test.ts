// Testes das contas da aba WhatsApp → Rastreamento (src/lib/waTracking.ts) e do Cliente/Telefone da aba
// Conversões (src/lib/waConversions.ts: conversionContact). Sem dependências: node scripts/tests/waTracking.test.ts
import assert from 'node:assert/strict';
import { periodRanges, type SendRow } from '../../src/lib/waPanel.ts';
import {
  buildConversations, businessMinutesBetween, conversationsCsv, conversationsIn, formatPhone, journey, originByDay,
  salesByDay, searchConversations, sortConversations, trackingWindow, trackSummary, waLinkOf, businessHoursOf, businessHoursLabel, saleLinksText, saleDateFilter, type TrackInput,
  filterStage, pageInfo, DEFAULT_SORT, STAGE_FILTERS, buyFunnel, conversationTimeline, salesCsv,
} from '../../src/lib/waTracking.ts';
import * as tracking from '../../src/lib/waTracking.ts';
import { conversionContact, maskPhoneDigits } from '../../src/lib/waConversions.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const sp = (s: string) => new Date(`${s}-03:00`).toISOString(); // horário de SP
const ms = (s: string) => Date.parse(`${s}-03:00`);

const NOW = Date.parse('2026-11-06T15:00:00-03:00'); // sexta
const R = periodRanges('7d', NOW).cur; // 31/10 a 06/11
const base = (): TrackInput => ({ leads: [], attributions: [], sends: [], replies: [], sales: [], names: [], conversions: [] });
let n = 0;
const send = (chat: string, at: string, extra: Partial<SendRow> = {}): SendRow => ({ id: `s${++n}`, chat_id: chat, created_at: sp(at), source: 'manual', source_id: null, item_id: null, status: 'enviado', origin: 'manual', ...extra });
const lead = (chat: string, at: string, extra: Record<string, unknown> = {}) => ({ chat_id: chat, phone: null, first_message_at: sp(at), origin: 'organico', ad_id: null, ad_title: null, ...extra });

const A = '5511911112222@c.us';
const B = '5511933334444@c.us';
const L = '777@lid';

// Cenário: A (anúncio, respondemos em 30 min, cliente respondeu, comprou R$ 300 com 💰, Contato+Compra no Facebook),
// L (@lid com telefone, orgânico, sem resposta, falou em pix sem venda), B (orgânico, antigo: fora do período),
// C (orgânico, respondemos e o cliente respondeu; venda ANTES do 1º contato não conta)
function scenario(): TrackInput {
  const input = base();
  input.leads.push(
    lead(A, '2026-11-02T10:00:00', { phone: '5511911112222', origin: 'anuncio', ad_id: 'AD1', ad_title: 'Relógio Promo', last_message_at: sp('2026-11-03T09:00:00') }),
    lead(L, '2026-11-03T19:00:00', { phone: '5511955556666' }),
    lead(B, '2026-10-20T10:00:00'),
    lead('5511944445555@c.us', '2026-11-05T09:00:00'),
  );
  input.attributions.push({ chat_id: A, phone: '5511911112222', contact_name: 'Maria WhatsApp', ad_id: 'AD1', ad_title: 'Relógio Promo', first_message_at: sp('2026-11-02T10:00:00') });
  input.names.push({ chat_id: A, name: 'Maria', source: 'aprendido' });
  input.sends.push(
    send(A, '2026-11-02T10:30:00'), send(A, '2026-11-02T11:00:00', { origin: 'rapida', source: 'rapida' }),
    send(B, '2026-11-02T12:00:00'),
    send('5511944445555@c.us', '2026-11-05T09:10:00'),
  );
  input.replies.push(
    { chat_id: A, replied_at: sp('2026-11-02T10:40:00'), send_log_id: 'x1', minutes: 10 },
    { chat_id: '5511944445555@c.us', replied_at: sp('2026-11-05T09:20:00'), send_log_id: 'x2', minutes: 10 },
  );
  input.sales.push(
    { id: 'v1', sale_date: '2026-11-04', created_at: sp('2026-11-04T15:00:00'), total_sale_price: 300, customer_phone: null, customer_name: 'Maria S.', wa_chat_id: A, origin: 'anuncio' },
    { id: 'v0', sale_date: '2026-11-01', created_at: sp('2026-11-01T12:00:00'), total_sale_price: 90, customer_phone: '11944445555', customer_name: null, wa_chat_id: null },
  );
  input.conversions.push(
    { chat_id: A, event_name: 'Contact', error: null, value: null, test: false, status: 'enviado', created_at: sp('2026-11-02T10:01:00') },
    { chat_id: A, event_name: 'Purchase', error: null, value: 300, test: false, status: 'enviado', created_at: sp('2026-11-04T15:01:00') },
    { chat_id: L, event_name: 'Contact', error: null, value: null, test: true, status: 'enviado', created_at: sp('2026-11-03T19:01:00') }, // teste: não conta
  );
  return input;
}

// ── Utilitários ──
test('telefone formatado, link wa.me e máscara', () => {
  assert.equal(formatPhone('5511987654321'), '(11) 98765-4321');
  assert.equal(formatPhone('1133334444'), '(11) 3333-4444');
  assert.equal(formatPhone('351912345678'), '+351912345678');
  assert.equal(formatPhone(null), '');
  assert.equal(waLinkOf('(11) 98765-4321'), 'https://wa.me/5511987654321');
  assert.equal(waLinkOf(null), null);
  assert.equal(maskPhoneDigits('11987654321'), '(11) 9****-4321');
  assert.equal(maskPhoneDigits('551133334444'), '(11) ****-4444');
  assert.equal(maskPhoneDigits('123'), '—');
});
const BH_8_18 = { days: [1, 2, 3, 4, 5, 6], startMin: 8 * 60, endMin: 18 * 60 };
test('horário comercial: seg–sáb 8h–18h (São Paulo), atravessando a noite e o domingo', () => {
  assert.equal(businessMinutesBetween(ms('2026-11-02T10:00:00'), ms('2026-11-02T10:45:00'), BH_8_18), 45); // segunda
  assert.equal(businessMinutesBetween(ms('2026-11-02T17:30:00'), ms('2026-11-03T08:30:00'), BH_8_18), 60); // 30 min + 30 min
  assert.equal(businessMinutesBetween(ms('2026-11-07T17:00:00'), ms('2026-11-09T09:00:00'), BH_8_18), 120); // sábado 17h → segunda 9h (domingo não conta)
  assert.equal(businessMinutesBetween(ms('2026-11-08T10:00:00'), ms('2026-11-08T12:00:00'), BH_8_18), 0); // domingo
  assert.equal(businessMinutesBetween(ms('2026-11-02T20:00:00'), ms('2026-11-02T22:00:00'), BH_8_18), 0);
  assert.equal(businessMinutesBetween(ms('2026-11-02T10:00:00'), ms('2026-11-02T09:00:00'), BH_8_18), 0);
});
test('horário comercial = o do motor de envios (wa_settings); sem wa_settings, o padrão do motor (seg–sáb 9h–19h)', () => {
  assert.deepEqual(businessHoursOf(null), { days: [1, 2, 3, 4, 5, 6], startMin: 540, endMin: 1140 });
  const bh = businessHoursOf({ business_days: [1, 2, 3, 4, 5], business_start: '08:30:00', business_end: '18:00:00' });
  assert.deepEqual(bh, { days: [1, 2, 3, 4, 5], startMin: 510, endMin: 1080 });
  assert.equal(businessHoursLabel(bh), 'seg, ter, qua, qui, sex, 8h30 às 18h');
  assert.equal(businessMinutesBetween(ms('2026-11-07T10:00:00'), ms('2026-11-09T09:00:00'), bh), 30); // sábado fora; segunda 8h30–9h
  assert.equal(businessMinutesBetween(ms('2026-11-02T08:00:00'), ms('2026-11-02T09:30:00')), 30); // padrão: 9h
  assert.deepEqual(businessHoursOf({ business_days: 'x', business_start: 'nada' }), { days: [1, 2, 3, 4, 5, 6], startMin: 540, endMin: 1140 });
});
test('filtro de sales.sale_date: inclui as vendas do último dia (hoje às 14h27 entrava fora)', () => {
  const w = trackingWindow(R, NOW);
  const f = saleDateFilter(w);
  assert.deepEqual(f, { gte: '2026-10-31', lt: '2026-11-07' });
  const saleDate = '2026-11-06T14:27:03.239+00:00'; // venda de "hoje" (NOW = 06/11 15h)
  assert.ok(saleDate >= f.gte && saleDate < f.lt, 'a venda de hoje entra');
  assert.ok(!(saleDate <= '2026-11-06'), 'o filtro antigo ("<= hoje") cortava a venda de hoje');
});
test('janela de carga: 90 dias antes para telefones, até agora para respostas/vendas', () => {
  const w = trackingWindow(R, NOW + 1000);
  assert.equal(w.knownFrom, R.from - 90 * 86400000);
  assert.equal(w.until, R.to);
  assert.equal(trackingWindow(R, R.to + 5000).until, R.to + 5000);
});

// ── Conversas ──
test('conversa: nome aprendido → WhatsApp → telefone; origem, 1ª resposta, etapa, Facebook', () => {
  const m = buildConversations(scenario());
  const list = conversationsIn(m, R, 'todas');
  assert.equal(list.length, 3); // B é de antes do período
  const a = list.find((c) => c.chatId === A)!;
  assert.deepEqual([a.name, a.nameSource, a.phoneLabel, a.ad, a.adTitle], ['Maria', 'aprendido', '(11) 91111-2222', true, 'Relógio Promo']);
  assert.equal(a.replyMinutes, 30);
  assert.equal(a.replyBusinessMinutes, 30);
  assert.deepEqual([a.replied, a.stage, a.sales, a.revenue], [true, 'comprou', 1, 300]);
  assert.deepEqual([a.fbContact, a.fbPurchase], [true, true]);
  assert.equal(a.lastAt, ms('2026-11-03T09:00:00')); // last_message_at da extensão
  assert.equal(a.waLink, 'https://wa.me/5511911112222');
  const l = list.find((c) => c.chatId === L)!;
  assert.deepEqual([l.name, l.nameSource, l.phone, l.stage, l.replyMinutes, l.fbContact], ['(11) 95555-6666', 'telefone', '5511955556666', 'contato', null, false]);
  const c = list.find((x) => x.chatId === '5511944445555@c.us')!;
  assert.deepEqual([c.stage, c.sales], ['respondeu', 0]); // a venda v0 é de antes do 1º contato
  assert.equal(c.lastAt, ms('2026-11-05T09:20:00')); // sem last_message_at: a última resposta
});
test('conversa: sem nome aprendido usa o nome do WhatsApp (anúncio) e depois o cliente da venda', () => {
  const input = scenario();
  input.names = [];
  let a = buildConversations(input).conversations.find((c) => c.chatId === A)!;
  assert.deepEqual([a.name, a.nameSource], ['Maria WhatsApp', 'whatsapp']);
  input.attributions[0].contact_name = null;
  a = buildConversations(input).conversations.find((c) => c.chatId === A)!;
  assert.deepEqual([a.name, a.nameSource], ['Maria S.', 'whatsapp']);
});
test('a mesma pessoa como @lid e @c.us é uma conversa só (a mais antiga)', () => {
  const input = base();
  input.leads.push(lead(L, '2026-11-02T10:00:00', { phone: '5511955556666' }), lead('5511955556666@c.us', '2026-11-03T10:00:00'));
  input.sends.push(send('5511955556666@c.us', '2026-11-02T10:05:00'));
  const list = conversationsIn(buildConversations(input), R, 'todas');
  assert.equal(list.length, 1);
  assert.equal(list[0].firstAt, ms('2026-11-02T10:00:00'));
  assert.equal(list[0].replyMinutes, 5);
});
test('conversa de anúncio de antes da 2.10.0 (só em wa_ad_attribution) entra como rastreada', () => {
  const input = base();
  input.attributions.push({ chat_id: A, phone: '5511911112222', contact_name: 'Ana', ad_id: 'AD7', ad_title: 'Óculos', first_message_at: sp('2026-11-01T08:00:00') });
  const [c] = conversationsIn(buildConversations(input), R, 'todas');
  assert.deepEqual([c.ad, c.adTitle, c.name], [true, 'Óculos', 'Ana']);
});

// ── Cartões, gráficos e jornada ──
test('cartões: totais, % rastreadas, tempo médio da 1ª resposta, vendas e taxa contato → compra', () => {
  const list = conversationsIn(buildConversations(scenario()), R, 'todas');
  const s = trackSummary(list);
  assert.deepEqual([s.total, s.ad, s.untracked], [3, 1, 2]);
  assert.ok(Math.abs((s.adPct as number) - 1 / 3) < 1e-9);
  assert.equal(s.answered, 2);
  assert.equal(s.avgReplyMinutes, 20); // (30 + 10) / 2
  assert.deepEqual([s.bought, s.sales, s.revenue], [1, 1, 300]);
  assert.ok(Math.abs((s.conversion as number) - 1 / 3) < 1e-9);
  const empty = trackSummary([]);
  assert.deepEqual([empty.adPct, empty.avgReplyMinutes, empty.conversion], [null, null, null]);
});
test('tempo da 1ª resposta só em horário comercial (lead às 17h50, resposta às 8h10 do dia seguinte = 20 min)', () => {
  const input = base();
  input.leads.push(lead(A, '2026-11-03T17:50:00'));
  input.sends.push(send(A, '2026-11-04T08:10:00'));
  const list = conversationsIn(buildConversations(input, BH_8_18), R, 'todas');
  assert.equal(Math.round(trackSummary(list).avgReplyMinutes as number), 860);
  assert.equal(trackSummary(list, true).avgReplyMinutes, 20);
  // com o horário do motor (9h–19h): 17h50 → 19h (70 min) + 0 antes das 9h
  assert.equal(trackSummary(conversationsIn(buildConversations(input), R, 'todas'), true).avgReplyMinutes, 70);
});

// ── 2.12.4: vendas que não entravam (conversas sem wa_leads, @lid, venda ligada pelo 📈) ──
// Réplica do dia 07/11: Joyce Lima (💰 na conversa @lid + 📈), Bruno Gomes e Lucas Azevedo (venda do ERP ligada pelo
// 📈, que preencheu o wa_chat_id), Tiago (💰), nenhuma dessas conversas em wa_leads nem em wa_ad_attribution
const JOY = '20384099373197@lid'; const BRU = '75944383520903@lid'; const LUC = '162487689326671@lid'; const TIA = '141785493987502@lid';
function dia07(): TrackInput {
  const input = base();
  const sale = (id: string, name: string, phone: string, total: number, at: string, chat: string, origin: string | null = null) =>
    ({ id, customer_name: name, customer_phone: phone, total_sale_price: total, sale_date: sp(at), created_at: sp(at), wa_chat_id: chat, origin });
  input.sales.push(
    sale('f7af97e8-454c', 'Joyce Lima', '5521977467586', 307, '2026-11-06T11:26:27', JOY, 'organico'),
    sale('e90d2f30-ce29', 'Bruno Gomes', '(21) 98820-1983', 478, '2026-11-06T10:21:18', BRU),
    sale('bbc520c9-072e', 'Lucas Azevedo', '(21) 97187-5271', 614, '2026-11-06T10:45:12', LUC),
    sale('f114b6e0-0583', 'Tiago Santos', '(83) 9419-3994', 379, '2026-11-06T11:55:06', TIA, 'anuncio'),
  );
  const conv = (chat: string, sale: string, setChat: boolean, at: string, name: string) => ({ chat_id: chat, event_name: 'Purchase', error: null, value: 1, test: false, status: 'enviado', created_at: sp(at), contact_name: name, sale_id: sale, sale_link_set_chat: setChat });
  input.conversions.push(
    conv(LUC, 'bbc520c9-072e', true, '2026-11-06T10:54:38', 'Lucas Azevedo'), conv(BRU, 'e90d2f30-ce29', true, '2026-11-06T10:57:32', 'Bruno Gomes'),
    conv(JOY, 'f7af97e8-454c', false, '2026-11-06T11:31:49', 'Joyce Lima'),
  );
  input.sends.push(send(LUC, '2026-11-06T09:04:21'), send(BRU, '2026-11-06T09:50:39'), send(JOY, '2026-11-06T11:05:14'));
  input.replies.push({ chat_id: LUC, replied_at: sp('2026-11-06T09:06:39'), send_log_id: 'r1', minutes: 2 }, { chat_id: JOY, replied_at: sp('2026-11-06T11:06:39'), send_log_id: 'r2', minutes: 1 });
  input.names.push({ chat_id: LUC, name: 'Lucas', source: 'aprendido' }, { chat_id: JOY, name: 'Joyce', source: 'aprendido' });
  return input;
}
test('bug 07/11: vendas do 💰 e do 📈 em conversas sem wa_leads (@lid) entram em "Vendas das conversas" e "Comprou"', () => {
  const list = conversationsIn(buildConversations(dia07()), R, 'todas');
  const s = trackSummary(list);
  assert.deepEqual([s.total, s.fresh, s.older, s.bought, s.sales, s.revenue], [4, 0, 4, 4, 4, 1778]);
  assert.equal(s.conversion, 1);
  assert.equal(s.avgReplyMinutes, null); // início não registrado: fora da média
  const by = (chat: string) => list.find((c) => c.chatId === chat)!;
  assert.deepEqual(by(JOY).saleLinks.map((x) => x.how), [['zap', 'compra']]);
  assert.deepEqual(by(BRU).saleLinks.map((x) => x.how), [['compra']]); // o wa_chat_id foi preenchido pelo 📈
  assert.deepEqual(by(LUC).saleLinks.map((x) => x.how), [['compra']]);
  assert.deepEqual(by(TIA).saleLinks.map((x) => x.how), [['zap']]);
  assert.deepEqual([by(JOY).name, by(JOY).tracked, by(JOY).stage, by(JOY).phoneLabel], ['Joyce', false, 'comprou', '(21) 97746-7586']);
  assert.equal(by(LUC).firstAt, ms('2026-11-06T09:04:21')); // 1ª atividade conhecida
  assert.equal(by(TIA).ad, true); // venda do 💰 com origem anúncio
  assert.equal(by(BRU).name, 'Bruno Gomes'); // sem nome aprendido: o nome do evento
  assert.equal(saleLinksText(by(JOY), (n) => `R$ ${n}`), '#f7af97e8 R$ 307: registrada pelo 💰 nesta conversa + ligada pelo 📈 (Compra enviada ao Facebook)');
  assert.deepEqual(journey(list).map((x) => x.count), [4, 4, 4]);
  const byContact = salesByDay(buildConversations(dia07()), R, 'todas', 'venda').filter((x) => x.vendas);
  assert.deepEqual(byContact, [{ day: '2026-11-06', vendas: 4, receita: 1778 }]);
});
test('conversa que já existia: só as vendas do período; venda fora do período não traz a conversa', () => {
  const input = dia07();
  input.sales.push({ id: 'velha', customer_name: 'Joyce Lima', customer_phone: '5521977467586', total_sale_price: 100, sale_date: sp('2026-10-20T10:00:00'), created_at: sp('2026-10-20T10:00:00'), wa_chat_id: JOY, origin: null });
  const m = buildConversations(input);
  const joy = conversationsIn(m, R, 'todas').find((c) => c.chatId === JOY)!;
  assert.deepEqual([joy.sales, joy.revenue], [1, 307]);
  const antes = periodRanges('custom', NOW, { start: '2026-10-15', end: '2026-10-25' }).cur;
  const old = conversationsIn(m, antes, 'todas');
  assert.deepEqual(old.map((c) => [c.chatId, c.revenue]), [[JOY, 100]]);
});
test('a venda do 💰 (@lid + telefone) cai na conversa nova registrada com o número (@c.us) — uma conversa só', () => {
  const input = base();
  input.leads.push(lead('5521977467586@c.us', '2026-11-06T10:00:00'));
  input.sales.push({ id: 'v-joy', customer_name: 'Joyce', customer_phone: '(21) 97746-7586', total_sale_price: 307, sale_date: sp('2026-11-06T11:00:00'), created_at: sp('2026-11-06T11:00:00'), wa_chat_id: JOY, origin: 'organico' });
  input.sends.push(send(JOY, '2026-11-06T10:10:00'));
  const list = conversationsIn(buildConversations(input), R, 'todas');
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].tracked, list[0].sales, list[0].replyMinutes, list[0].saleLinks[0].how], [true, 1, 10, ['zap']]);
});
test('venda do ERP sem conversa, com o telefone de uma conversa conhecida: "telefone"; telefone desconhecido: fica de fora', () => {
  const input = base();
  input.leads.push(lead(A, '2026-11-02T10:00:00', { phone: '5511911112222' }));
  input.sales.push(
    { id: 'erp-1', customer_name: 'Maria', customer_phone: '(11) 91111-2222', total_sale_price: 200, sale_date: sp('2026-11-03T12:00:00'), created_at: sp('2026-11-03T12:00:00'), wa_chat_id: null },
    { id: 'erp-2', customer_name: 'Outro', customer_phone: '(11) 90000-0000', total_sale_price: 999, sale_date: sp('2026-11-03T12:00:00'), created_at: sp('2026-11-03T12:00:00'), wa_chat_id: null },
  );
  const m = buildConversations(input);
  const list = conversationsIn(m, R, 'todas');
  assert.deepEqual(list.map((c) => [c.chatId, c.revenue, c.saleLinks.map((x) => x.how)]), [[A, 200, [['telefone']]]]);
  assert.equal(m.sales.length, 1);
});
test('filtro de origem: anúncio / não rastreada', () => {
  const m = buildConversations(scenario());
  assert.deepEqual(conversationsIn(m, R, 'anuncio').map((c) => c.chatId), [A]);
  assert.equal(conversationsIn(m, R, 'nao_rastreada').length, 2);
});
test('origem por dia: barras empilhadas com todos os dias do período', () => {
  const d = originByDay(conversationsIn(buildConversations(scenario()), R, 'todas'), R);
  assert.equal(d.length, 7);
  assert.deepEqual(d.find((x) => x.day === '2026-11-02'), { day: '2026-11-02', anuncio: 1, nao_rastreada: 0 });
  assert.deepEqual(d.find((x) => x.day === '2026-11-03'), { day: '2026-11-03', anuncio: 0, nao_rastreada: 1 });
  assert.equal(d.reduce((x, p) => x + p.anuncio + p.nao_rastreada, 0), 3);
});
test('jornada acumulada: Fez contato → Respondeu → Comprou', () => {
  const j = journey(conversationsIn(buildConversations(scenario()), R, 'todas'));
  assert.deepEqual(j.map((x) => [x.stage, x.count]), [['contato', 3], ['respondeu', 2], ['comprou', 1]]);
  assert.ok(Math.abs((j[1].pct as number) - 2 / 3) < 1e-9);
  assert.deepEqual(journey([]).map((x) => x.pct), [null, null, null]);
});
test('vendas por dia: pela data do 1º contato x pela data da venda', () => {
  const input = scenario();
  // venda de uma conversa antiga (B), feita no período
  input.sales.push({ id: 'v2', sale_date: '2026-11-06', created_at: sp('2026-11-06T10:00:00'), total_sale_price: 50, customer_phone: null, wa_chat_id: B });
  const m = buildConversations(input);
  const byContact = salesByDay(m, R, 'todas', 'contato').filter((x) => x.vendas);
  assert.deepEqual(byContact, [{ day: '2026-11-02', vendas: 1, receita: 300 }]);
  const bySale = salesByDay(m, R, 'todas', 'venda').filter((x) => x.vendas);
  assert.deepEqual(bySale, [{ day: '2026-11-01', vendas: 1, receita: 90 }, { day: '2026-11-04', vendas: 1, receita: 300 }, { day: '2026-11-06', vendas: 1, receita: 50 }]);
  assert.deepEqual(salesByDay(m, R, 'anuncio', 'venda').filter((x) => x.vendas).map((x) => x.receita), [300]);
  assert.equal(salesByDay(m, R, 'todas', 'contato').length, 7);
});

// ── 2.12.8: "Possíveis vendas não marcadas" saiu ──
test('2.12.8: "Possíveis vendas não marcadas" e o sinal de compra saíram', () => {
  assert.equal('possibleUnmarkedSales' in tracking, false);
  const c = conversationsIn(buildConversations(scenario()), R, 'todas')[0];
  assert.equal('buySignalAt' in c, false);
});

// ── 2.12.8: todas as conversas (wa_chat_activity), como o Tintim ──
const OLD = '5511966667777@c.us'; // conversa antiga (começou em setembro) que voltou a falar no período
const QUIET = '5511988889999@c.us'; // conversa antiga em que só a loja falou no período
const OFF = '5511922223333@c.us'; // chegou com o PC desligado: entrou pela varredura da abertura (72 h)
function withActivity(): TrackInput {
  const input = scenario();
  input.activity = [
    { chat_id: OLD, phone: '5511966667777', name: 'Paula WhatsApp', first_seen_at: sp('2026-09-01T10:00:00'), first_message_at: sp('2026-09-01T10:00:00'), last_message_at: sp('2026-11-06T14:00:00'), last_from: 'cliente', last_customer_at: sp('2026-11-06T14:00:00'), is_new_lead: false },
    { chat_id: QUIET, phone: '5511988889999', name: 'Rui', first_seen_at: sp('2026-08-01T10:00:00'), first_message_at: null, last_message_at: sp('2026-11-05T11:00:00'), last_from: 'loja', last_customer_at: sp('2026-10-01T10:00:00'), is_new_lead: null },
    { chat_id: OFF, phone: '5511922223333', name: 'Bia', first_seen_at: sp('2026-11-06T08:00:00'), first_message_at: sp('2026-11-05T23:10:00'), last_message_at: sp('2026-11-05T23:30:00'), last_from: 'loja', last_customer_at: sp('2026-11-05T23:10:00'), is_new_lead: true },
    { chat_id: A, phone: '5511911112222', name: null, first_seen_at: sp('2026-11-02T10:00:00'), first_message_at: sp('2026-11-02T10:00:00'), last_message_at: sp('2026-11-06T12:00:00'), last_from: 'loja', last_customer_at: sp('2026-11-06T11:00:00'), is_new_lead: true },
  ];
  input.activityDays = [
    { chat_id: OLD, day: '2026-11-06', from_customer: true, from_store: true },
    { chat_id: QUIET, day: '2026-11-05', from_customer: false, from_store: true },
    { chat_id: OFF, day: '2026-11-05', from_customer: true, from_store: true },
    { chat_id: A, day: '2026-11-06', from_customer: true, from_store: true },
  ];
  return input;
}
test('2.12.8: as conversas do período são TODAS as ativas (o cliente falou no período), não só leads', () => {
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  const ids = list.map((c) => c.chatId).sort();
  assert.deepEqual(ids, [A, L, '5511944445555@c.us', OLD, OFF].sort()); // QUIET (só a loja falou) não entra; B fora do período
  const old = list.find((c) => c.chatId === OLD)!;
  assert.deepEqual([old.periodActive, old.periodLead, old.tracked, old.name, old.lastFrom], [true, false, false, 'Paula WhatsApp', 'cliente']);
  assert.equal(old.lastAt, ms('2026-11-06T14:00:00'));
  assert.equal(old.firstAt, ms('2026-09-01T10:00:00')); // a 1ª mensagem conhecida
  const a = list.find((c) => c.chatId === A)!;
  assert.deepEqual([a.periodLead, a.periodActive, a.lastAt, a.lastFrom], [true, true, ms('2026-11-06T12:00:00'), 'loja']);
});
test('2.12.8: "Conversas ativas" e "Leads novos" separados (lead do período conta nos dois)', () => {
  const s = trackSummary(conversationsIn(buildConversations(withActivity()), R, 'todas'));
  assert.deepEqual([s.total, s.active, s.leads, s.leadsAd], [5, 5, 4, 1]);
  // por origem: só anúncio
  const sAd = trackSummary(conversationsIn(buildConversations(withActivity()), R, 'anuncio'));
  assert.deepEqual([sAd.active, sAd.leads], [1, 1]);
});
test('2.12.8: conversa que chegou com o PC desligado (varredura de 72 h ao abrir) entra como lead novo do dia em que chegou', () => {
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  const off = list.find((c) => c.chatId === OFF)!;
  assert.deepEqual([off.periodLead, off.periodActive, off.tracked, off.ad, off.name], [true, true, true, false, 'Bia']);
  assert.equal(off.firstAt, ms('2026-11-05T23:10:00'));
  const day = originByDay(list, R).find((d) => d.day === '2026-11-05')!;
  assert.equal(day.nao_rastreada, 2); // a 5555 (wa_leads) e a Bia (atividade)
  // sem a atividade (migration não aplicada), ela simplesmente não aparece
  const plain = conversationsIn(buildConversations(scenario()), R, 'todas');
  assert.equal(plain.some((c) => c.chatId === OFF), false);
});
test('2.12.8: conversa antiga ativa só leva as vendas do período; resposta a envio nosso também conta como ativa', () => {
  const input = withActivity();
  input.sales.push(
    { id: 'old1', sale_date: '2026-10-10', created_at: sp('2026-10-10T10:00:00'), total_sale_price: 999, customer_phone: null, wa_chat_id: OLD },
    { id: 'old2', sale_date: '2026-11-06', created_at: sp('2026-11-06T14:30:00'), total_sale_price: 120, customer_phone: null, wa_chat_id: OLD },
  );
  input.replies.push({ chat_id: QUIET, replied_at: sp('2026-11-04T10:00:00'), send_log_id: 'x9', minutes: 5 }); // o Rui respondeu
  const list = conversationsIn(buildConversations(input), R, 'todas', input.replies);
  const old = list.find((c) => c.chatId === OLD)!;
  assert.deepEqual([old.stage, old.sales, old.revenue], ['comprou', 1, 120]);
  assert.ok(list.find((c) => c.chatId === QUIET)?.periodActive);
});

// ── ERP 09/11: Rastreamento como o Tintim ──
test('aguardando 1ª resposta: começou com o cliente e a loja não falou (envio, dia da loja ou última da loja tiram)', () => {
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  const by = Object.fromEntries(list.map((c) => [c.chatId, c.awaiting]));
  // L: lead sem nenhuma resposta → aguardando; A e 5555: a loja respondeu; OFF: dia com mensagem da loja; OLD: não é lead
  assert.deepEqual([by[L], by[A], by['5511944445555@c.us'], by[OFF], by[OLD]], [true, false, false, false, false]);
  assert.equal(trackSummary(list).awaiting, 1);
});
test('1ª resposta "a partir da 2ª mensagem": ignora a 1ª mensagem nossa (automática / saudação)', () => {
  const list = conversationsIn(buildConversations(scenario()), R, 'todas');
  const a = list.find((c) => c.chatId === A)!;
  assert.deepEqual([a.replyMinutes, a.replyMinutes2], [30, 60]); // 10:30 e 11:00 depois da 1ª mensagem às 10:00
  assert.equal(trackSummary(list, false, true).avgReplyMinutes, 60);
  assert.equal(trackSummary(list, false, false).avgReplyMinutes, 20); // (30 + 10) / 2
});
test('tempo médio de jornada: do 1º contato até a 1ª venda (só quem comprou)', () => {
  const s = trackSummary(conversationsIn(buildConversations(scenario()), R, 'todas'));
  assert.deepEqual([s.journeyCount, Math.round((s.journeyDays as number) * 100) / 100], [1, 2.21]); // 02/11 10:00 → 04/11 15:00
});
test('visão geral: rastreadas × não rastreadas entre as ATIVAS; origem por dia soma o total de ativas; funil Fez contato → Comprou', () => {
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  const s = trackSummary(list);
  assert.deepEqual([s.active, s.activeAd, s.activeUntracked], [5, 1, 4]);
  const days = originByDay(list, R);
  assert.equal(days.reduce((x, d) => x + d.anuncio + d.nao_rastreada, 0), s.active);
  assert.deepEqual(days.find((d) => d.day === '2026-11-06'), { day: '2026-11-06', anuncio: 0, nao_rastreada: 1 }); // a OLD voltou a falar
  assert.deepEqual(buyFunnel(list), { contact: 5, bought: 1, boughtPct: 0.2 });
});
test('detalhes da conversa (👁): linha do tempo com 1º contato, anúncio, envios, respostas, venda e eventos do Facebook', () => {
  const input = scenario();
  input.items = [{ id: 'it1', title: 'Follow 1', follow_step: 1 }];
  input.sends.push(send(A, '2026-11-03T10:00:00', { origin: 'automacao', source: 'follow', item_id: 'it1' }));
  const a = conversationsIn(buildConversations(input), R, 'todas').find((c) => c.chatId === A)!;
  const tl = conversationTimeline(a, input, (n) => `R$ ${n}`);
  assert.deepEqual(tl.map((e) => e.kind), ['contato', 'anuncio', 'facebook', 'loja', 'resposta', 'loja', 'follow', 'venda', 'facebook']);
  assert.match(tl[1].text, /Relógio Promo/);
  assert.match(tl[6].text, /“Follow 1”/);
  assert.match(tl[7].text, /Comprou R\$ 300/);
  for (let i = 1; i < tl.length; i++) assert.ok(tl[i].t >= tl[i - 1].t);
});
test('relatório de vendas (CSV): as mesmas vendas do gráfico, com contato, origem e valor', () => {
  const m = buildConversations(scenario());
  const csv = salesCsv(m, R, 'todas', 'venda').split('\r\n');
  assert.equal(csv.length, 3); // cabeçalho + 2 vendas no período (v0 e v1)
  assert.equal(csv[0].split(';')[0], 'Data da venda');
  assert.ok(csv[2].includes(';Maria;(11) 91111-2222;Meta Ads;Relógio Promo;') && csv[2].endsWith(';300,00;registrada pelo 💰 nesta conversa'), csv[2]);
  assert.equal(salesCsv(m, R, 'anuncio', 'contato').split('\r\n').length, 2);
});

// ── 2.12.8: tabela ──
test('2.12.8: ordem padrão = última mensagem, mais recente primeiro', () => {
  assert.deepEqual(DEFAULT_SORT, { key: 'lastAt', desc: true });
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  const sorted = sortConversations(list, DEFAULT_SORT.key, DEFAULT_SORT.desc);
  // OLD 06/11 14:00 · A 06/11 12:00 · OFF 05/11 23:30 · 5555 05/11 09:20 (resposta) · L 03/11 19:00
  assert.deepEqual(sorted.map((c) => c.chatId), [OLD, A, OFF, '5511944445555@c.us', L]);
  sorted.slice(1).forEach((c, i) => assert.ok(c.lastAt <= sorted[i].lastAt));
});
test('2.12.8: filtro de etapa Todas / Comprou / Respondeu / Só fez contato', () => {
  assert.deepEqual(STAGE_FILTERS.map((x) => x[1]), ['Todas', 'Comprou', 'Respondeu', 'Só fez contato']);
  const list = conversationsIn(buildConversations(withActivity()), R, 'todas');
  assert.equal(filterStage(list, 'todas').length, 5);
  assert.deepEqual(filterStage(list, 'comprou').map((c) => c.chatId), [A]);
  assert.deepEqual(filterStage(list, 'respondeu').map((c) => c.chatId), ['5511944445555@c.us']);
  assert.deepEqual(filterStage(list, 'contato').map((c) => c.chatId).sort(), [L, OLD, OFF].sort());
});
test('2.12.8: paginação: "Página X de Y · N conversas", 25 por página, nunca passa da última', () => {
  assert.deepEqual(pageInfo(60, 0, 25), { page: 0, pages: 3, from: 0, to: 25, total: 60, label: 'Página 1 de 3 · 60 conversas', hasPrev: false, hasNext: true });
  assert.deepEqual([pageInfo(60, 1, 25).from, pageInfo(60, 1, 25).to, pageInfo(60, 1, 25).label], [25, 50, 'Página 2 de 3 · 60 conversas']);
  assert.deepEqual([pageInfo(60, 2, 25).to, pageInfo(60, 2, 25).hasNext], [60, false]);
  assert.equal(pageInfo(60, 9, 25).page, 2); // página que não existe mais (a lista diminuiu) → a última
  assert.equal(pageInfo(60, -3, 25).page, 0);
  assert.equal(pageInfo(0, 0, 25).label, 'Página 1 de 1 · 0 conversas');
  assert.equal(pageInfo(1, 0, 25).label, 'Página 1 de 1 · 1 conversa');
  assert.equal(pageInfo(1200, 0, 50, ['evento', 'eventos']).label, 'Página 1 de 24 · 1.200 eventos');
});

// ── Tabela ──
test('busca por nome (sem acento) e por telefone; ordenar por colunas (vazio no fim)', () => {
  const list = conversationsIn(buildConversations(scenario()), R, 'todas');
  assert.deepEqual(searchConversations(list, 'MARIA').map((c) => c.chatId), [A]);
  assert.deepEqual(searchConversations(list, '95555').map((c) => c.chatId), [L]);
  assert.deepEqual(searchConversations(list, 'relogio').map((c) => c.chatId), [A]);
  assert.equal(searchConversations(list, '  ').length, 3);
  assert.deepEqual(sortConversations(list, 'firstAt', true).map((c) => c.chatId), ['5511944445555@c.us', L, A]);
  assert.deepEqual(sortConversations(list, 'stage', true).map((c) => c.stage), ['comprou', 'respondeu', 'contato']);
  assert.deepEqual(sortConversations(list, 'reply', false).map((c) => c.replyMinutes), [10, 30, null]);
  assert.deepEqual(sortConversations(list, 'reply', true).map((c) => c.replyMinutes), [30, 10, null]);
  assert.equal(sortConversations(list, 'name', false)[0].name, '(11) 94444-5555');
});
test('CSV com ";" e vírgula decimal, aspas quando precisa', () => {
  const input = scenario();
  input.names[0].name = 'Maria "Mari"; Silva';
  const csv = conversationsCsv(sortConversations(conversationsIn(buildConversations(input), R, 'todas'), 'firstAt', false));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0].split(';')[0], 'Contato');
  assert.equal(lines[1], '"Maria ""Mari""; Silva";(11) 91111-2222;Meta Ads;Relógio Promo;Comprou;1;300,00;sim;02/11/2026 10:00;03/11/2026 09:00;;30;sim;sim');
  assert.ok(lines[2].includes(';Não rastreada;;Fez contato;0;0,00;'));
});
test('sem dados: tudo zerado, sem quebrar', () => {
  const m = buildConversations(base());
  assert.deepEqual(conversationsIn(m, R, 'todas'), []);
  assert.equal(salesByDay(m, R, 'todas', 'venda').length, 7);
  assert.equal(conversationsCsv([]).split('\r\n').length, 1);
});

// ── Conversões (Facebook): Cliente e Telefone ──
test('conversões: Cliente/Telefone vêm do evento, da conversa, do lead, do anúncio ou da venda ligada (mascarado)', () => {
  const empty = { leadPhone: {}, attribution: {}, chatName: {}, sales: {} };
  assert.deepEqual(conversionContact({ chat_id: A, contact_name: 'Ana', sale_id: null }, empty), { name: 'Ana', phone: '(11) 9****-2222' });
  assert.deepEqual(conversionContact({ chat_id: L, contact_name: null, sale_id: null }, empty), { name: '—', phone: '—' });
  const src = {
    leadPhone: { [L]: '5511955556666' }, attribution: { '888@lid': { phone: '5511977778888', contact_name: 'João WA' } },
    chatName: { [L]: 'Carla' }, sales: { v1: { customer_name: 'Pedro', customer_phone: '(21) 99999-1234' } },
  };
  assert.deepEqual(conversionContact({ chat_id: L, contact_name: null, sale_id: null }, src), { name: 'Carla', phone: '(11) 9****-6666' });
  assert.deepEqual(conversionContact({ chat_id: '888@lid', contact_name: '  ', sale_id: null }, src), { name: 'João WA', phone: '(11) 9****-8888' });
  assert.deepEqual(conversionContact({ chat_id: '999@lid', contact_name: null, sale_id: 'v1' }, src), { name: 'Pedro', phone: '(21) 9****-1234' });
  assert.deepEqual(conversionContact({ chat_id: null, contact_name: null, sale_id: null }, src), { name: '—', phone: '—' });
});

// ── ERP 09/11: bloco "Anúncio" do 👁 ──
test('anúncio da conversa: título, origem, miniatura, Ver criativo e Gerenciador (conta 546602844126870)', () => {
  const { conversationAd, adsManagerUrl, adBadgeTitle } = tracking;
  const c = { ad: true, adId: '120200000000001', adTitle: 'Relógio Promo', chatIds: [A, L] };
  const rows = [
    { chat_id: B, phone: null, ad_id: 'X', ad_title: 'Outro', first_message_at: sp('2026-11-01T10:00:00'), source_url: 'https://www.instagram.com/p/OUTRO/' },
    { chat_id: L, phone: null, ad_id: null, ad_title: null, first_message_at: null, thumbnail_url: 'https://scontent.xx.fbcdn.net/t.jpg' },
    { chat_id: A, phone: null, ad_id: '120200000000001', ad_title: 'Relógio Promo', first_message_at: sp('2026-11-02T10:00:00'), source_app: 'instagram',
      source_url: 'https://www.instagram.com/reel/XYZ/', media_type: 'VIDEO' },
  ];
  const ad = conversationAd(c, rows)!;
  assert.equal(ad.title, 'Relógio Promo');
  assert.equal(ad.platform, 'Instagram');
  assert.equal(ad.creativeUrl, 'https://www.instagram.com/reel/XYZ/');
  assert.equal(ad.thumbnailUrl, 'https://scontent.xx.fbcdn.net/t.jpg');
  assert.equal(ad.mediaType, 'VIDEO');
  assert.equal(ad.managerUrl, 'https://www.facebook.com/adsmanager/manage/ads?act=546602844126870&selected_ad_ids=120200000000001');
  // conversa que não veio de anúncio: sem bloco
  assert.equal(conversationAd({ ...c, ad: false }, rows), null);
  // sem source_url: só o Gerenciador; Facebook pela origem
  const noUrl = conversationAd({ ...c, chatIds: [A] }, [{ ...rows[2], source_url: null, source_app: 'facebook' }])!;
  assert.deepEqual([noUrl.creativeUrl, noUrl.platform, !!noUrl.managerUrl], [null, 'Facebook', true]);
  // sem ad_id: só o "Ver criativo"; título e id vêm do registro se a conversa não tiver
  const noId = conversationAd({ ad: true, adId: null, adTitle: null, chatIds: [A] }, [{ ...rows[2], ad_id: null }])!;
  assert.deepEqual([noId.title, noId.managerUrl, noId.creativeUrl], ['Relógio Promo', null, 'https://www.instagram.com/reel/XYZ/']);
  // sem miniatura nem registro: só o título
  const bare = conversationAd({ ad: true, adId: null, adTitle: 'Só título', chatIds: [A] }, [])!;
  assert.deepEqual([bare.title, bare.thumbnailUrl, bare.creativeUrl, bare.managerUrl, bare.platform], ['Só título', null, null, null, null]);
  // link que não é http(s) e id que não é número não viram botão
  const bad = conversationAd({ ad: true, adId: 'AD1', adTitle: null, chatIds: [A] }, [{ ...rows[2], source_url: 'javascript:alert(1)', thumbnail_url: 'data:image/png;base64,AAA' }])!;
  assert.deepEqual([bad.creativeUrl, bad.thumbnailUrl, bad.managerUrl], [null, null, null]);
  assert.equal(adsManagerUrl(' 123 '), 'https://www.facebook.com/adsmanager/manage/ads?act=546602844126870&selected_ad_ids=123');
  // passar o mouse na etiqueta Meta Ads
  assert.equal(adBadgeTitle({ ad: true, adTitle: 'Relógio Promo' }), 'Anúncio: Relógio Promo');
  assert.match(adBadgeTitle({ ad: true, adTitle: null }), /sem título/);
  assert.equal(adBadgeTitle({ ad: false, adTitle: null }), '');
});

// ERP 11/11: Vendas × Facebook (só leitura)
test('Vendas × Facebook: faturamento do ERP × Compras enviadas (sem teste), diferença e as vendas sem conversão', () => {
  const { salesFbGap, recentFbGap, fbGapText, waWebUrl } = tracking;
  const C1 = '5511911112222@c.us'; const C2 = '5511933334444@c.us'; const CL = '777@lid';
  const sale = (id: string, at: string, total: number, extra: Record<string, unknown> = {}) => ({ id, sale_date: at.slice(0, 10), created_at: sp(at), total_sale_price: total, customer_phone: null, customer_name: `Cliente ${id}`, wa_chat_id: null, ...extra });
  const conv = (at: string, value: number | null, extra: Record<string, unknown> = {}) => ({ chat_id: C1, error: null, value, test: false, status: 'enviado', created_at: sp(at), event_name: value == null ? 'Contact' : 'Purchase', sale_id: null, ...extra });
  const sales = [
    sale('s1', '2026-11-05T10:00:00', 734, { wa_chat_id: C1, customer_phone: '11911112222' }), // ligada pelo sale_id
    sale('s2', '2026-11-05T11:00:00', 500, { wa_chat_id: C2 }), // Compra da mesma conversa, sem ligação, 1 dia depois
    sale('s3', '2026-11-06T09:00:00', 466, { wa_chat_id: CL, customer_phone: '(11) 95555-6666' }), // sem Compra (só teste e falhou)
    sale('s4', '2026-11-04T09:00:00', 250), // balcão: sem conversa
    sale('s5', '2026-10-20T09:00:00', 999, { wa_chat_id: C1 }), // fora do período
  ];
  const conversions = [
    conv('2026-11-05T10:05:00', 734, { sale_id: 's1' }),
    conv('2026-11-06T11:00:00', 500, { chat_id: C2 }),
    conv('2026-11-06T09:10:00', 466, { chat_id: CL, test: true }),
    conv('2026-11-06T09:20:00', 466, { chat_id: CL, status: 'falhou' }),
    conv('2026-11-06T09:30:00', null, { chat_id: CL }), // Contato não é Compra
    conv('2026-10-20T09:10:00', 999, { chat_id: C1 }), // fora do período (não soma no Facebook)
  ];
  const g = salesFbGap(sales, conversions, R);
  assert.deepEqual([g.erp, g.fb, g.diff], [{ count: 4, total: 1950 }, { count: 2, total: 1234 }, { total: 716, count: 2 }]);
  assert.deepEqual(g.missing.map((x) => [x.id, x.total, x.hasChat, x.openUrl]), [
    ['s3', 466, true, 'https://web.whatsapp.com/send?phone=5511955556666'], // @lid: pelo telefone da venda
    ['s4', 250, false, null], // sem conversa — não dá para enviar
  ]);
  // a Compra da mesma conversa cobre UMA venda só (a mais próxima) e só até 7 dias
  const two = salesFbGap([sale('a', '2026-11-02T10:00:00', 100, { wa_chat_id: C2 }), sale('b', '2026-11-05T10:00:00', 200, { wa_chat_id: C2 })], [conv('2026-11-05T12:00:00', 200, { chat_id: C2 })], R);
  assert.deepEqual(two.missing.map((x) => x.id), ['a']);
  const far = salesFbGap([sale('a', '2026-11-05T10:00:00', 100, { wa_chat_id: C2 })], [conv('2026-10-25T10:00:00', 100, { chat_id: C2 })], R);
  assert.deepEqual(far.missing.map((x) => x.id), ['a'], 'Compra de mais de 7 dias antes não cobre');
  // aviso do topo: só hoje e ontem (06/11 e 05/11) — s3 (hoje, sem Compra); s1/s2 cobertas; s4 é de 04/11
  assert.deepEqual(recentFbGap(sales, conversions, NOW), { count: 1, total: 466 });
  assert.equal(fbGapText({ count: 2, total: 1200 }, (n) => `R$ ${n}`), '2 vendas sem conversão enviada (R$ 1200)');
  assert.equal(fbGapText({ count: 1, total: 466 }, (n) => `R$ ${n}`), '1 venda sem conversão enviada (R$ 466)');
  assert.equal(waWebUrl('5511911112222@c.us', null), 'https://web.whatsapp.com/send?phone=5511911112222');
  assert.equal(waWebUrl(null, null), null);
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
