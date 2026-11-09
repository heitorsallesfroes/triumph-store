// Testes da 2.13.3 (nome da conversa a partir da venda): node extension/tests/salename.test.cjs
// - primeiro nome do cliente da venda (sem "Cliente", sem números, primeira letra maiúscula)
// - ordem: definido à mão → da venda → aprendido; o à mão nunca é trocado; o aprendido não troca o da venda
// - 💰 registrar e 📈 ligar gravam o nome "da venda"; se a gravação falhar, a venda continua
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CH = '5521987654321@c.us';
const EV = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// banco falso só com wa_chat_names (e o que a ligação 📈 lê)
function api({ names = [], failNames = false, sale = null, event = null } = {}) {
  const db = { names: names.map((x) => ({ ...x })), posts: [] };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (table === 'wa_chat_names') {
      const chat = (u.searchParams.get('chat_id') || '').replace(/^eq\./, '');
      if (method === 'GET') return res(200, db.names.filter((x) => x.chat_id === chat));
      if (method === 'POST') {
        if (failNames) return res(400, { code: '23514', message: 'new row violates check constraint "wa_chat_names_source_check"' });
        db.posts.push(body);
        const old = db.names.find((x) => x.chat_id === body.chat_id);
        if (old) Object.assign(old, body); else db.names.push(body);
        return res(201, null);
      }
      if (method === 'DELETE') { db.names = db.names.filter((x) => x.chat_id !== chat); return res(204, null); }
    }
    if (table === 'wa_conversion_events') {
      if (method === 'GET' && !/event_id/.test(u.searchParams.get('select') || '')) return res(200, []);
      if (method === 'GET') return res(200, event ? [event] : []);
      return res(204, null);
    }
    if (table === 'sales') {
      if (method === 'GET') return res(200, sale ? [sale] : []);
      return res(204, null);
    }
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, db };
}

test('primeiro nome do cliente: sem "Cliente", sem números, primeira letra maiúscula', () => {
  const { a } = api();
  const f = a.saleFirstName;
  assert.strictEqual(f('MARIA DA SILVA'), 'Maria');
  assert.strictEqual(f('maria souza'), 'Maria');
  assert.strictEqual(f('Cliente Fernanda 2'), 'Fernanda');
  assert.strictEqual(f('cliente 123 joão'), 'João');
  assert.strictEqual(f('Ana-paula Costa'), 'Ana-Paula');
  assert.strictEqual(f('  élida   '), 'Élida');
  assert.strictEqual(f('Cliente 123'), null);
  assert.strictEqual(f('12345'), null);
  assert.strictEqual(f(''), null);
  assert.strictEqual(f(null), null);
  assert.strictEqual(f('J.'), null); // uma letra só não vira nome
});
test('ordem: o da venda troca o aprendido; o aprendido não troca o da venda; o definido à mão nunca é trocado', async () => {
  const { a, db } = api({ names: [{ chat_id: CH, name: 'Mari', source: 'aprendido' }] });
  const r1 = await a.setChatName({ chatId: CH, name: 'Maria', source: 'venda' });
  assert.deepStrictEqual([r1.name, r1.source], ['Maria', 'venda']);
  const r2 = await a.setChatName({ chatId: CH, name: 'Mariazinha', source: 'aprendido' });
  assert.deepStrictEqual([r2.name, r2.source, r2.skipped], ['Maria', 'venda', true]);
  await a.setChatName({ chatId: CH, name: 'Dona Maria', source: 'manual' });
  const r3 = await a.setChatName({ chatId: CH, name: 'Fernanda', source: 'venda' });
  assert.deepStrictEqual([r3.name, r3.source, r3.skipped], ['Dona Maria', 'manual', true]);
  assert.deepStrictEqual(db.names.map((x) => [x.name, x.source]), [['Dona Maria', 'manual']]);
  // a outra venda depois troca o nome "da venda"
  const { a: b } = api({ names: [{ chat_id: CH, name: 'Maria', source: 'venda' }] });
  assert.strictEqual((await b.setChatName({ chatId: CH, name: 'Fernanda', source: 'venda' })).name, 'Fernanda');
  await assert.rejects(a.setChatName({ chatId: CH, name: 'X', source: 'outra' }), /Origem inválida/);
});
test('📈 ligar a venda à conversa grava o primeiro nome "da venda" (sem nome à mão) e devolve para o painel', async () => {
  const sale = { id: '5a1e0001-0000-4000-8000-000000000001', customer_name: 'cliente MARIA souza', customer_phone: '21987654321', sale_date: '2026-11-08', total_sale_price: 100, wa_chat_id: null, status: 'concluido' };
  const event = { event_id: EV, chat_id: CH, sale_id: null };
  const { a, db } = api({ sale, event });
  let r;
  r = await a.linkSaleToPurchase({ eventId: EV, saleId: sale.id, fillPhone: false });
  assert.deepStrictEqual([r.chatName && r.chatName.name, r.chatName && r.chatName.source], ['Maria', 'venda']);
  assert.deepStrictEqual(db.names.map((x) => [x.chat_id, x.name, x.source]), [[CH, 'Maria', 'venda']]);
  // com nome à mão: não troca
  const m = api({ sale, event, names: [{ chat_id: CH, name: 'Dona Maria', source: 'manual' }] });
  const r2 = await m.a.linkSaleToPurchase({ eventId: EV, saleId: sale.id, fillPhone: false });
  assert.strictEqual(r2.chatName.name, 'Dona Maria');
  assert.strictEqual(m.db.posts.length, 0);
});
test('sem a migration (o banco recusa a origem "venda"): a ligação continua e o nome fica como estava', async () => {
  const sale = { id: '5a1e0001-0000-4000-8000-000000000001', customer_name: 'Maria', customer_phone: null, sale_date: '2026-11-08', total_sale_price: 100, wa_chat_id: null, status: 'concluido' };
  const { a, db } = api({ sale, event: { event_id: EV, chat_id: CH, sale_id: null }, failNames: true, names: [{ chat_id: CH, name: 'Mari', source: 'aprendido' }] });
  const r = await a.linkSaleToPurchase({ eventId: EV, saleId: sale.id, fillPhone: false });
  assert.ok(r.linked && r.linked.id === sale.id);
  assert.strictEqual(r.chatName, null);
  assert.deepStrictEqual(db.names.map((x) => x.name), ['Mari']);
});
test('💰 registrar pela conversa: o servidor grava o nome "da venda" e devolve; o painel mostra "da venda"', () => {
  const s = src('supabase-api.js');
  assert.match(s, /const chatName = extra\.wa_chat_id \? await chatNameFromSale\(extra\.wa_chat_id, row\.customer_name\) : null;/);
  const c = src('content.js');
  assert.match(c, /chatNameFromSaleResult\(f\.chatId, res && res\.chatName\)/);
  assert.match(c, /v\.source === 'venda' \? 'da venda'/);
  const mig = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261110130000_wa_chat_names_venda.sql'), 'utf8');
  assert.match(mig, /check \(source in \('manual', 'aprendido', 'venda'\)\)/);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
