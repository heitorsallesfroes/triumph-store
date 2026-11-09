// Testes da 2.15.1 (nome completo do cliente no 💰): node extension/tests/fullname.test.cjs
// - perfil com emoji e "~" vira "Ana Maria Oliveira"; "Cliente", "/", números e modelos de relógio saem
// - perfil que não combina com o nome aprendido não é usado (fica o aprendido)
// - cliente que já comprou: o nome da última venda do ERP com o mesmo telefone vem primeiro
// - iniciais maiúsculas com da/de/dos minúsculos; botões só quando há 2+ opções
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const sc = vm.createContext({ console, Intl });
vm.runInContext(src('sale-calc.js'), sc, { filename: 'sale-calc.js' });
const TS = sc.TspSale;
const names = (r) => Array.from(r.options, (o) => o.name);

test('iniciais maiúsculas, da/de/dos minúsculos', () => {
  assert.strictEqual(TS.titleCaseName('ANA MARIA OLIVEIRA'), 'Ana Maria Oliveira');
  assert.strictEqual(TS.titleCaseName('maria DA silva dos santos'), 'Maria da Silva dos Santos');
  assert.strictEqual(TS.titleCaseName('JOÃO DE SOUZA'), 'João de Souza');
  assert.strictEqual(TS.titleCaseName("ana d'ávila"), "Ana D'Ávila");
});

test('perfil limpo: sem "~", emojis, números, "Cliente", "/", modelos de relógio', () => {
  assert.strictEqual(TS.cleanProfileName('~Ana Maria Oliveira 🌸✨'), 'Ana Maria Oliveira');
  assert.strictEqual(TS.cleanProfileName('~ 💅 ANA MARIA OLIVEIRA 💅'), 'Ana Maria Oliveira');
  assert.strictEqual(TS.cleanProfileName('Cliente Ana Maria 2'), 'Ana Maria');
  assert.strictEqual(TS.cleanProfileName('Ana Maria / Apple Watch Series 9'), 'Ana Maria');
  assert.strictEqual(TS.cleanProfileName('Cliente / Ana Maria Oliveira'), 'Ana Maria Oliveira');
  assert.strictEqual(TS.cleanProfileName('Ana Maria - IWO W26 Pro'), 'Ana Maria');
  assert.strictEqual(TS.cleanProfileName('ana maria da silva'), 'Ana Maria da Silva');
  assert.strictEqual(TS.cleanProfileName('🌸🌸'), '');
  assert.strictEqual(TS.cleanProfileName('+55 21 98765-4321'), '');
});

test('perfil com emoji e "~" que combina com o nome aprendido: usa o nome completo + botões', () => {
  const r = TS.customerNameChoice({ pushname: '~Ana Maria Oliveira 🌸', learned: 'Ana' });
  assert.strictEqual(r.value, 'Ana Maria Oliveira');
  assert.deepStrictEqual(names(r), ['Ana', 'Ana Maria Oliveira']);
  assert.strictEqual(r.options[1].source, 'perfil');
});

test('nome salvo na agenda vem antes do perfil', () => {
  const r = TS.customerNameChoice({ contactName: 'Ana Maria Oliveira Cliente', pushname: '~Ana M 🌸', learned: 'ana' });
  assert.strictEqual(r.value, 'Ana Maria Oliveira');
  assert.strictEqual(r.options[1].source, 'agenda');
});

test('acentos não atrapalham a comparação com o nome aprendido', () => {
  assert.strictEqual(TS.customerNameChoice({ pushname: 'Joao Pedro Lima', learned: 'João' }).value, 'Joao Pedro Lima');
});

test('perfil que não combina com o nome aprendido: fica o aprendido, sem botões', () => {
  const r = TS.customerNameChoice({ pushname: '~Carlos Eduardo 🚗', learned: 'Ana' });
  assert.strictEqual(r.value, 'Ana');
  assert.strictEqual(r.options.length, 0);
});

test('perfil com uma palavra só: não serve, fica o aprendido', () => {
  assert.strictEqual(TS.customerNameChoice({ pushname: '~Ana 🌸', learned: 'Ana' }).value, 'Ana');
  assert.strictEqual(TS.customerNameChoice({ pushname: 'Ana da', learned: 'Ana' }).value, 'Ana');
});

test('sem nome aprendido: usa o perfil com 2+ palavras', () => {
  const r = TS.customerNameChoice({ pushname: '~Carlos Eduardo Souza 🚗' });
  assert.strictEqual(r.value, 'Carlos Eduardo Souza');
  assert.strictEqual(r.options.length, 0);
});

test('nome aprendido entra só com o primeiro nome', () => {
  assert.strictEqual(TS.customerNameChoice({ learned: 'ana maria' }).value, 'Ana');
});

test('cliente que já comprou: o nome da última venda vem primeiro, com os outros como botões', () => {
  const r = TS.customerNameChoice({ saleName: 'ANA MARIA DOS SANTOS', pushname: '~Ana Maria Oliveira 🌸', learned: 'Ana' });
  assert.strictEqual(r.value, 'Ana Maria dos Santos');
  assert.deepStrictEqual(names(r), ['Ana', 'Ana Maria Oliveira', 'Ana Maria dos Santos']);
  // venda com o mesmo nome do perfil: não repete
  const r2 = TS.customerNameChoice({ saleName: 'ana maria oliveira', pushname: '~Ana Maria Oliveira', learned: 'Ana' });
  assert.deepStrictEqual(names(r2), ['Ana', 'Ana Maria Oliveira']);
  // a venda vale mesmo se o perfil for de outra pessoa
  assert.strictEqual(TS.customerNameChoice({ saleName: 'Ana Souza', pushname: 'Carlos Lima', learned: 'Ana' }).value, 'Ana Souza');
});

test('sem nada da conversa: continua usando o nome do WhatsApp (como antes)', () => {
  assert.strictEqual(TS.customerNameChoice({ fallback: 'Fernanda' }).value, 'Fernanda');
  assert.strictEqual(TS.customerNameChoice({}).value, '');
});

// ── supabase-api: nome da última venda com o mesmo telefone ──
function api({ sales = [], origin = true } = {}) {
  const urls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'sales') {
      const sel = u.searchParams.get('select') || '';
      if (!/customer_name/.test(sel)) return origin ? res(200, []) : res(400, { code: '42703', message: 'column sales.wa_chat_id does not exist' });
      const ph = u.searchParams.get('customer_phone');
      const chat = u.searchParams.get('wa_chat_id');
      let rows = sales.filter((s) => s.customer_name);
      if (ph) { const list = ph.replace(/^in\.\(|\)$/g, '').split(/","/).map((x) => x.replace(/^"|"$/g, '')); rows = rows.filter((s) => list.includes(s.customer_phone)); }
      if (chat) rows = rows.filter((s) => `eq.${s.wa_chat_id}` === chat);
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return res(200, rows.slice(0, 1).map((s) => ({ customer_name: s.customer_name })));
    }
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, urls };
}

test('variantes do telefone incluem os formatos do ERP', () => {
  const { a } = api();
  const v = a.salePhoneVariants('5521987654321');
  for (const x of ['5521987654321', '21987654321', '(21) 98765-4321', '21 98765-4321', '+55 21 98765-4321']) assert.ok(v.includes(x), x);
  assert.deepStrictEqual(Array.from(a.salePhoneVariants('123')), []);
});

test('última venda com o mesmo telefone (gravado formatado no ERP)', async () => {
  const { a } = api({ sales: [
    { customer_name: 'Ana Velha', customer_phone: '21987654321', created_at: '2026-01-01' },
    { customer_name: 'ANA MARIA OLIVEIRA', customer_phone: '(21) 98765-4321', created_at: '2026-10-01' },
    { customer_name: 'Outra Pessoa', customer_phone: '(11) 91111-2222', created_at: '2026-11-01' },
  ] });
  const r = await a.lastSaleCustomerName({ chatId: '5521987654321@c.us', phone: '5521987654321' });
  assert.strictEqual(r.name, 'ANA MARIA OLIVEIRA');
  assert.strictEqual(TS.customerNameChoice({ saleName: r.name, learned: 'Ana' }).value, 'Ana Maria Oliveira');
});

test('sem venda pelo telefone: tenta a venda desta conversa; sem nada, null', async () => {
  const { a } = api({ sales: [{ customer_name: 'Bia Lima', customer_phone: null, wa_chat_id: '123456789@lid', created_at: '2026-10-01' }] });
  assert.strictEqual((await a.lastSaleCustomerName({ chatId: '123456789@lid', phone: '' })).name, 'Bia Lima');
  assert.strictEqual((await a.lastSaleCustomerName({ chatId: '999@lid', phone: '5521900000000' })).name, null);
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  console.log(`${tests.length - fail}/${tests.length} testes passaram`);
  if (fail) process.exitCode = 1;
})();
