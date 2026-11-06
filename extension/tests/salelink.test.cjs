// Testes da 2.10.5 (ligar a Compra do 📈 à venda do ERP). node extension/tests/salelink.test.cjs
// - escolha da venda (engine.js: matchSalesForPurchase): pelo telefone, pelo valor, nenhuma
// - supabase-api.js com fetch falso: ligar/desligar só mexe em wa_chat_id, telefone vazio e no sale_id da compra
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ectx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;

const NOW = Date.parse('2026-11-06T15:00:00-03:00');
const CHAT = '5511911112222@c.us';
const day = (d) => `2026-11-${String(d).padStart(2, '0')}T13:00:00-03:00`;
const sale = (id, extra) => ({ id, customer_name: `Cliente ${id}`, customer_phone: null, sale_date: day(5), total_sale_price: 100, wa_chat_id: null, status: 'finalizado', ...extra });

test('telefone: normaliza como o painel (10/11 dígitos ganham 55; com máscara)', () => {
  assert.strictEqual(E.normBrPhone('(11) 91111-2222'), '5511911112222');
  assert.strictEqual(E.normBrPhone('5511911112222'), '5511911112222');
  assert.strictEqual(E.normBrPhone('123'), null);
  assert.strictEqual(E.salePhoneOf('5511933334444'), '(11) 93333-4444');
});
test('achar pelo telefone: uma venda dos últimos 7 dias com o telefone da conversa', () => {
  const m = plain(E.matchSalesForPurchase({ chatId: CHAT, phone: '5511911112222', value: 100, now: NOW, sales: [
    sale('a', { customer_phone: '(11) 91111-2222', sale_date: day(2) }),
    sale('velha', { customer_phone: '11911112222', sale_date: '2026-10-25T12:00:00-03:00' }), // mais de 7 dias
    sale('cancelada', { customer_phone: '11911112222', status: 'cancelado' }),
    sale('outra-conversa', { customer_phone: '11911112222', wa_chat_id: '5511999999999@c.us' }),
  ] }));
  assert.deepStrictEqual(m.byPhone.map((x) => x.id), ['a']);
  assert.deepStrictEqual(m.byValue, []);
});
test('mais de uma pelo telefone: todas (mais nova primeiro) para escolher; venda do 💰 desta conversa entra', () => {
  const m = plain(E.matchSalesForPurchase({ chatId: CHAT, phone: '5511911112222', value: 100, now: NOW, sales: [
    sale('a', { customer_phone: '11911112222', sale_date: day(1) }),
    sale('b', { customer_phone: null, wa_chat_id: CHAT, sale_date: day(4) }),
    sale('c', { customer_phone: '5511911112222', sale_date: day(3) }),
  ] }));
  assert.deepStrictEqual(m.byPhone.map((x) => x.id), ['b', 'c', 'a']);
});
test('já ligada a outra compra: fica de fora', () => {
  const m = plain(E.matchSalesForPurchase({ chatId: CHAT, phone: '5511911112222', value: 100, now: NOW, taken: ['a'], sales: [sale('a', { customer_phone: '11911112222' })] }));
  assert.deepStrictEqual(m.byPhone, []);
});
test('escolher por valor: sem telefone ou outro telefone, 3 dias, ±10%, mais perto primeiro', () => {
  const m = plain(E.matchSalesForPurchase({ chatId: CHAT, phone: '5511911112222', value: 200, now: NOW, sales: [
    sale('sem-tel', { total_sale_price: 190, sale_date: day(5) }),
    sale('outro-tel', { customer_phone: '11977776666', total_sale_price: 205, sale_date: day(4) }),
    sale('longe', { total_sale_price: 260, sale_date: day(5) }), // > 10%
    sale('antiga', { total_sale_price: 200, sale_date: day(2) }), // > 3 dias
    sale('de-outra-conversa', { total_sale_price: 200, wa_chat_id: '5511999999999@c.us' }),
  ] }));
  assert.deepStrictEqual(m.byPhone, []);
  assert.deepStrictEqual(m.byValue.map((x) => x.id), ['outro-tel', 'sem-tel']);
});
test('nenhuma: listas vazias (o painel oferece "Lançar venda no ERP")', () => {
  const m = plain(E.matchSalesForPurchase({ chatId: CHAT, phone: '5511911112222', value: 999, now: NOW, sales: [sale('x', { total_sale_price: 100 })] }));
  assert.deepStrictEqual([m.byPhone.length, m.byValue.length], [0, 0]);
});

// ── supabase-api.js ──
function api({ migration = true, event = {}, saleRow = {} } = {}) {
  const calls = [];
  const ev = { event_id: '11111111-1111-1111-1111-111111111111', chat_id: CHAT, value: 100, sale_id: null, sale_link_set_chat: false, sale_link_set_phone: null, test: false, status: 'enviado', created_at: '2026-11-06T12:00:00Z', ...event };
  const sl = { id: '22222222-2222-2222-2222-222222222222', customer_name: 'Maria', customer_phone: null, sale_date: '2026-11-05T12:00:00Z', total_sale_price: 100, wa_chat_id: null, status: 'finalizado', ...saleRow };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (!migration && /select=sale_id&limit=1/.test(p)) return res(400, { message: 'column wa_conversion_events.sale_id does not exist' });
    if (method === 'GET' && p.startsWith('wa_conversion_events?select=event_id')) return res(200, [ev]);
    if (method === 'GET' && p.startsWith('wa_conversion_events?select=sale_id,event_id')) return res(200, []);
    if (method === 'GET' && p.startsWith('sales?select=') && p.includes('&id=eq.')) return res(200, [sl]);
    if (method === 'GET' && p.startsWith('sales?select=')) return res(200, [sl]);
    if (method === 'PATCH') return res(204, null);
    return res(200, []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('supabase-api.js'), ctx);
  return { a: ctx.WaApi, calls, ev, sl };
}
const patches = (calls) => calls.filter((c) => c.method === 'PATCH');
test('ligar: grava wa_chat_id só se vazio (filtro no banco) e o sale_id na compra; nada de valores', async () => {
  const { a, calls, ev, sl } = api();
  const r = await a.linkSaleToPurchase({ eventId: ev.event_id, saleId: sl.id, fillPhone: false });
  const p = patches(calls);
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].path, `sales?id=eq.${sl.id}&wa_chat_id=is.null`);
  assert.deepStrictEqual(p[0].body, { wa_chat_id: CHAT });
  assert.strictEqual(p[1].path, `wa_conversion_events?event_id=eq.${ev.event_id}`);
  assert.deepStrictEqual(p[1].body, { sale_id: sl.id, sale_link_set_chat: true, sale_link_set_phone: null });
  assert.strictEqual(r.linked.customer_name, 'Maria');
});
test('escolher por valor: preenche o telefone vazio da venda (e só ele)', async () => {
  const { a, calls, ev, sl } = api();
  await a.linkSaleToPurchase({ eventId: ev.event_id, saleId: sl.id, phone: '(11) 91111-2222', fillPhone: true });
  const p = patches(calls);
  assert.deepStrictEqual(p.map((x) => x.body), [{ wa_chat_id: CHAT }, { customer_phone: '(11) 91111-2222' }, { sale_id: sl.id, sale_link_set_chat: true, sale_link_set_phone: '(11) 91111-2222' }]);
  assert.strictEqual(p[1].path, `sales?id=eq.${sl.id}&or=(customer_phone.is.null,customer_phone.eq.)`);
  for (const x of p.filter((c) => c.path.startsWith('sales'))) assert.ok(Object.keys(x.body).every((k) => ['wa_chat_id', 'customer_phone'].includes(k)));
});
test('venda que já tem telefone/wa_chat_id desta conversa: não mexe na venda, só liga a compra', async () => {
  const { a, calls, ev, sl } = api({ saleRow: { customer_phone: '11911112222', wa_chat_id: CHAT } });
  await a.linkSaleToPurchase({ eventId: ev.event_id, saleId: sl.id, phone: '(11) 91111-2222', fillPhone: true });
  const p = patches(calls);
  assert.deepStrictEqual(p.map((x) => x.path.split('?')[0]), ['wa_conversion_events']);
  assert.deepStrictEqual(p[0].body, { sale_id: sl.id, sale_link_set_chat: false, sale_link_set_phone: null });
});
test('não liga venda de outra conversa, cancelada, nem compra já ligada a outra venda', async () => {
  await assert.rejects(api({ saleRow: { wa_chat_id: '5511999999999@c.us' } }).a.linkSaleToPurchase({ eventId: '11111111-1111-1111-1111-111111111111', saleId: '22222222-2222-2222-2222-222222222222' }), /outra conversa/);
  await assert.rejects(api({ saleRow: { status: 'reembolsado' } }).a.linkSaleToPurchase({ eventId: '11111111-1111-1111-1111-111111111111', saleId: '22222222-2222-2222-2222-222222222222' }), /cancelada/);
  await assert.rejects(api({ event: { sale_id: '33333333-3333-3333-3333-333333333333' } }).a.linkSaleToPurchase({ eventId: '11111111-1111-1111-1111-111111111111', saleId: '22222222-2222-2222-2222-222222222222' }), /já está ligada/);
});
test('desligar: desfaz só o que a ligação preencheu (wa_chat_id e telefone, se ainda forem os mesmos)', async () => {
  const { a, calls, ev } = api({ event: { sale_id: '22222222-2222-2222-2222-222222222222', sale_link_set_chat: true, sale_link_set_phone: '(11) 91111-2222' } });
  await a.unlinkSaleFromPurchase({ eventId: ev.event_id });
  const p = patches(calls);
  assert.deepStrictEqual(p.map((x) => [x.path, x.body]), [
    ['sales?id=eq.22222222-2222-2222-2222-222222222222&wa_chat_id=eq.5511911112222@c.us', { wa_chat_id: null }],
    ['sales?id=eq.22222222-2222-2222-2222-222222222222&customer_phone=eq.(11) 91111-2222', { customer_phone: null }],
    [`wa_conversion_events?event_id=eq.${ev.event_id}`, { sale_id: null, sale_link_set_chat: false, sale_link_set_phone: null }],
  ]);
});
test('desligar venda que já era da conversa (💰): só tira o sale_id da compra', async () => {
  const { a, calls, ev } = api({ event: { sale_id: '22222222-2222-2222-2222-222222222222', sale_link_set_chat: false, sale_link_set_phone: null } });
  await a.unlinkSaleFromPurchase({ eventId: ev.event_id });
  assert.deepStrictEqual(patches(calls).map((x) => x.path.split('?')[0]), ['wa_conversion_events']);
});
test('busca: devolve a compra, as vendas recentes e as já ligadas a outras compras', async () => {
  const { a, ev } = api();
  const r = plain(await a.purchaseSaleLink({ eventId: ev.event_id }));
  assert.strictEqual(r.available, true);
  assert.strictEqual(r.event.chat_id, CHAT);
  assert.strictEqual(r.sales.length, 1);
  assert.strictEqual(r.linked, null);
});
test('sem a migration: busca diz "indisponível" e ligar pede para atualizar o banco (nada gravado)', async () => {
  const { a, calls, ev, sl } = api({ migration: false });
  assert.strictEqual((await a.purchaseSaleLink({ eventId: ev.event_id })).available, false);
  await assert.rejects(a.linkSaleToPurchase({ eventId: ev.event_id, saleId: sl.id }), /Atualize o banco/);
  assert.strictEqual(patches(calls).length, 0);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
