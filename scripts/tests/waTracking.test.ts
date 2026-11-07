// Testes das contas da aba WhatsApp → Rastreamento (src/lib/waTracking.ts) e do Cliente/Telefone da aba
// Conversões (src/lib/waConversions.ts: conversionContact). Sem dependências: node scripts/tests/waTracking.test.ts
import assert from 'node:assert/strict';
import { periodRanges, type SendRow } from '../../src/lib/waPanel.ts';
import {
  buildConversations, businessMinutesBetween, conversationsCsv, conversationsIn, formatPhone, journey, originByDay, possibleUnmarkedSales,
  salesByDay, searchConversations, sortConversations, trackingWindow, trackSummary, waLinkOf, type TrackInput,
} from '../../src/lib/waTracking.ts';
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
    lead(L, '2026-11-03T19:00:00', { phone: '5511955556666', buy_signal_at: sp('2026-11-03T19:30:00') }),
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
test('horário comercial: seg–sáb 8h–18h (São Paulo), atravessando a noite e o domingo', () => {
  assert.equal(businessMinutesBetween(ms('2026-11-02T10:00:00'), ms('2026-11-02T10:45:00')), 45); // segunda
  assert.equal(businessMinutesBetween(ms('2026-11-02T17:30:00'), ms('2026-11-03T08:30:00')), 60); // 30 min + 30 min
  assert.equal(businessMinutesBetween(ms('2026-11-07T17:00:00'), ms('2026-11-09T09:00:00')), 120); // sábado 17h → segunda 9h (domingo não conta)
  assert.equal(businessMinutesBetween(ms('2026-11-08T10:00:00'), ms('2026-11-08T12:00:00')), 0); // domingo
  assert.equal(businessMinutesBetween(ms('2026-11-02T20:00:00'), ms('2026-11-02T22:00:00')), 0);
  assert.equal(businessMinutesBetween(ms('2026-11-02T10:00:00'), ms('2026-11-02T09:00:00')), 0);
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
  const list = conversationsIn(buildConversations(input), R, 'todas');
  assert.equal(Math.round(trackSummary(list).avgReplyMinutes as number), 860);
  assert.equal(trackSummary(list, true).avgReplyMinutes, 20);
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

// ── Possíveis vendas não marcadas ──
test('possíveis vendas não marcadas: sinal de compra e nenhuma venda ligada', () => {
  const input = scenario();
  input.leads[0].buy_signal_at = sp('2026-11-04T14:00:00'); // A tem sinal, mas já tem venda
  const list = possibleUnmarkedSales(conversationsIn(buildConversations(input), R, 'todas'));
  assert.deepEqual(list.map((c) => [c.chatId, c.waLink]), [[L, 'https://wa.me/5511955556666']]);
  input.leads[1].buy_signal_at = null;
  assert.equal(possibleUnmarkedSales(conversationsIn(buildConversations(input), R, 'todas')).length, 0);
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
  assert.equal(lines[1], '"Maria ""Mari""; Silva";(11) 91111-2222;Meta Ads;Relógio Promo;Comprou;1;300,00;02/11/2026 10:00;03/11/2026 09:00;30;sim;sim');
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

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
