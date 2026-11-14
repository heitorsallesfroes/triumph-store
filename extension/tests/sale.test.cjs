// Testes da 2.12.3 (venda pelo WhatsApp 💰 igual à "Nova Venda" do ERP). node extension/tests/sale.test.cjs
// - supabase-api.js com um banco falso em memória: createSaleFromChat grava sales / sale_items / sale_accessories
//   exatamente como o buildSale (que o scripts/tests/saleParity.test.ts compara com o código do Sales.tsx), com o
//   custo editado, 2 formas de pagamento, Correios, CPF, itens manuais, fornecedor, estoque, Tiny e origem automática
// - recusa o que o ERP recusa (sem item, CPF inválido, total alocado diferente, motoboy sem bairro/cidade)
// - lookupCep (ViaCEP, como o ERP): só o CEP sai
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

const CHAT = '5521987654321@c.us';
const P1 = '11111111-1111-4111-8111-111111111111'; // smartwatch, com Tiny
const P2 = '22222222-2222-4222-8222-222222222222'; // pulseira
const A1 = '33333333-3333-4333-8333-333333333333';
const SUP = '44444444-4444-4444-8444-444444444444';

function api({ attribution = true, cepBody = null, noPosition = false } = {}) {
  const db = {
    products: [
      { id: P1, model: 'Smartwatch Ultra', color: 'Preto', category: 'smartwatch', price: 499.9, cost: 210, current_stock: 4, tiny_id: 'T-1' },
      { id: P2, model: 'Pulseira Milanese', color: 'Prata', category: 'pulseira', price: 59.9, cost: 12.5, current_stock: 9, tiny_id: null },
      { id: '55555555-5555-4555-8555-555555555555', model: 'Película extra', color: '', category: 'acessorio', price: 20, cost: 4, current_stock: 0 },
    ],
    accessories: [{ id: A1, name: 'Caixa presente', cost: 3.2 }],
    suppliers: [{ id: SUP, name: 'Fornecedor SP' }],
    cities: [{ id: 'c1', name: 'Niterói' }], neighborhoods: [],
    system_config: [{ key: 'fee_ea_credit_6', value: '0.0726' }, { key: 'store_name', value: 'x' }],
    sales: [], sale_items: [], sale_accessories: [],
    wa_ad_attribution: attribution ? [{ chat_id: CHAT, ad_title: 'Relógio Promo', source_app: 'Instagram', source_url: 'https://fb.me/ad1' }] : [],
  };
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), json: async () => body });
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.startsWith('https://viacep.com.br/')) return res(200, cepBody || { cep: '24220-000', logradouro: 'Rua Gavião Peixoto', bairro: 'Icaraí', localidade: 'Niterói', uf: 'RJ' });
    if (url.includes('/functions/v1/update-tiny-stock')) return res(200, { success: true });
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const rows = db[table] || (db[table] = []);
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k));
    const match = (r) => filters.every(([k, v]) => {
      if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
      if (v.startsWith('in.')) return v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(r[k]));
      return true;
    });
    if (method === 'GET') return res(200, rows.filter(match));
    if (method === 'POST') {
      // 2.19.0: antes da migration sale_items_position a coluna não existe
      if (noPosition && table === 'sale_items' && (Array.isArray(body) ? body : [body]).some((r) => 'position' in r)) return res(400, { code: 'PGRST204', message: "Could not find the 'position' column of 'sale_items' in the schema cache" });
      const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: r.id || `${table}-${rows.length + 1}`, ...r }));
      rows.push(...list);
      return res(201, list);
    }
    if (method === 'PATCH') { rows.filter(match).forEach((r) => Object.assign(r, body)); return res(204, null); }
    if (method === 'DELETE') { db[table] = rows.filter((r) => !match(r)); return res(204, null); }
    return res(400, null);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, Date, Math, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('sale-calc.js'), ctx, { filename: 'sale-calc.js' });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, TS: ctx.TspSale, db, calls };
}

// A venda do pedido: 2 produtos (custo do 1º editado), acessório, item manual, PIX + crédito Elo 6x, Correios,
// CPF e endereço do "Colar formulário"
const PASTED = 'Nome: Maria Souza\nRua: Rua das Flores\nNúmero: 120\nComplemento: Ap 302\nBairro: Icaraí\nCidade: Niterói\nEstado: RJ\nCEP: 24220-000\nCPF: 529.982.247-25';
function chatSale(TS, extra = {}) {
  const pasted = TS.parseForm(PASTED);
  return {
    sale_date: '2026-10-30', customer_phone: '5521987654321', ...pasted,
    items: [{ product_id: P1, quantity: 1, unit_price: 489.9, unit_cost: 199.5 }, { product_id: P2, quantity: 2, unit_price: 49.9, unit_cost: 12.5 }],
    accessories: [{ accessory_id: A1, quantity: 1, cost: 3.2 }],
    manual_items: [{ name: 'Película extra', price: 20, cost: 4, quantity: 1 }, { name: 'Capa nova', price: 15, cost: 2, quantity: 1 }],
    payments: [{ method: 'pix', card_brand: '', installments: 0, amount: 300 }, { method: 'credit_card', card_brand: 'elo_amex', installments: 6, amount: 324.7 }],
    payment_status: 'pago', delivery_type: 'correios', delivery_cost: 15, delivery_fee: 0, delivery_notes: 'Deixar na portaria',
    supplier_name: 'fornecedor sp', wa_chat_id: CHAT, ad: null,
    ...extra,
  };
}

test('grava sales igual ao buildSale do ERP (custo editado, 2 formas, Correios, CPF) + conversa e origem automática', async () => {
  const { api: a, TS, db } = api();
  const r = await a.createSaleFromChat({ sale: chatSale(TS) });
  assert.strictEqual(db.sales.length, 1);
  const row = db.sales[0];
  const expected = TS.buildSale({
    form: { ...TS.parseForm(PASTED), sale_date: '2026-10-30', customer_phone: '5521987654321', delivery_type: 'correios', delivery_cost: 15, delivery_fee: 0, delivery_notes: 'Deixar na portaria', payment_status: 'pago', zip_code: '24220000' },
    items: [{ product_id: P1, quantity: 1, unit_price: 489.9, unit_cost: 199.5, category: 'smartwatch' }, { product_id: P2, quantity: 2, unit_price: 49.9, unit_cost: 12.5, category: 'pulseira' }],
    accessories: [{ accessory_id: A1, quantity: 1, cost: 3.2 }],
    manualItems: [{ name: 'Película extra', price: 20, cost: 4, quantity: 1 }, { name: 'Capa nova', price: 15, cost: 2, quantity: 1 }],
    payments: [{ method: 'pix', card_brand: '', installments: 0, amount: 300 }, { method: 'credit_card', card_brand: 'elo_amex', installments: 6, amount: 324.7 }],
    cfg: { fee_ea_credit_6: '0.0726' }, supplierId: SUP,
  }).row;
  const { id, sale_date: sd, wa_chat_id, origin, ad_source, ad_title, ad_url, ...rest } = row;
  const { sale_date: esd, ...exp } = expected;
  assert.deepStrictEqual(plain(rest), plain(exp));
  assert.ok(sd.startsWith('2026-10-30T'), sd); // a data escolhida, com a hora de agora (como o ERP)
  assert.deepStrictEqual([wa_chat_id, origin, ad_source, ad_title, ad_url], [CHAT, 'anuncio', 'Instagram', 'Relógio Promo', 'https://fb.me/ad1']);
  assert.deepStrictEqual([row.customer_cpf, row.zip_code, row.state, row.city, row.neighborhood, row.address_complement], ['52998224725', '24220000', 'RJ', 'Niterói', 'Icaraí', 'Ap 302']);
  assert.strictEqual(row.status, 'em_separacao');
  assert.strictEqual(row.payment_method, 'pix');
  assert.strictEqual(row.card_brand, 'elo_amex');
  assert.strictEqual(row.installments, 6);
  assert.strictEqual(row.supplier_id, SUP); // achou "fornecedor sp" pelo nome (sem criar outro)
  assert.strictEqual(db.suppliers.length, 1);
  assert.ok(Math.abs(row.card_fee - 324.7 * 0.0726) < 1e-9);
  assert.ok(!('wa_warranty_months' in row), 'sem garantia');
  assert.strictEqual(r.id, id);
  assert.strictEqual(r.origin, 'anuncio');
});
test('sale_items com o custo editado, sale_accessories com o custo, itens manuais viram produto como no ERP', async () => {
  const { api: a, TS, db } = api();
  await a.createSaleFromChat({ sale: chatSale(TS) });
  const saleId = db.sales[0].id;
  assert.deepStrictEqual(plain(db.sale_items.map(({ id, ...x }) => x)), [
    { sale_id: saleId, product_id: P1, quantity: 1, unit_price: 489.9, total_price: 489.9, unit_cost: 199.5, position: 0 },
    { sale_id: saleId, product_id: P2, quantity: 2, unit_price: 49.9, total_price: 99.8, unit_cost: 12.5, position: 1 },
  ]);
  assert.deepStrictEqual(plain(db.sale_accessories.map(({ id, ...x }) => x)), [{ sale_id: saleId, accessory_id: A1, custom_name: null, quantity: 1, cost: 3.2 }]);
  assert.deepStrictEqual(plain(db.sales[0].manual_items), [{ name: 'Película extra', price: 20, cost: 4, quantity: 1 }, { name: 'Capa nova', price: 15, cost: 2, quantity: 1 }]);
  // "Película extra" já existia; "Capa nova" vira produto acessório com estoque 0
  const novos = db.products.filter((p) => p.category === 'acessorio');
  assert.deepStrictEqual(novos.map((p) => [p.model, p.cost, p.price, p.current_stock]), [['Película extra', 4, 20, 0], ['Capa nova', 2, 15, 0]]);
});
test('estoque baixado, Tiny avisado, e o custo editado grava no produto (saveProductCost do ERP)', async () => {
  const { api: a, TS, db, calls } = api();
  const r = await a.createSaleFromChat({ sale: chatSale(TS) });
  const p1 = db.products.find((p) => p.id === P1);
  const p2 = db.products.find((p) => p.id === P2);
  assert.deepStrictEqual([p1.current_stock, p2.current_stock, p1.cost, p2.cost], [3, 7, 199.5, 12.5]);
  const tiny = calls.filter((c) => c.url.includes('update-tiny-stock'));
  assert.deepStrictEqual(tiny.map((c) => c.body), [{ tiny_id: 'T-1', quantidade: 3 }]);
  assert.strictEqual(r.tinyFailed, 0);
  assert.ok(!calls.some((c) => c.method === 'PATCH' && c.url.includes(`products?id=eq.${P2}`) && c.body && 'cost' in c.body), 'custo sem mudança não é gravado');
});
test('sem anúncio registrado nem visto: orgânico; anúncio visto nas mensagens: anúncio', async () => {
  let x = api({ attribution: false });
  await x.api.createSaleFromChat({ sale: chatSale(x.TS) });
  assert.deepStrictEqual([x.db.sales[0].origin, x.db.sales[0].ad_title], ['organico', null]);
  x = api({ attribution: false });
  await x.api.createSaleFromChat({ sale: chatSale(x.TS, { ad: { title: 'Anúncio visto', platform: 'Facebook', url: null } }) });
  assert.deepStrictEqual([x.db.sales[0].origin, x.db.sales[0].ad_title, x.db.sales[0].ad_source], ['anuncio', 'Anúncio visto', 'Facebook']);
});
test('fornecedor novo pelo nome é criado (como o ERP); 2 smartwatches: um por produto', async () => {
  let x = api();
  await x.api.createSaleFromChat({ sale: chatSale(x.TS, { supplier_name: 'Importadora Nova' }) });
  assert.strictEqual(x.db.suppliers.length, 2);
  assert.strictEqual(x.db.sales[0].supplier_id, x.db.suppliers[1].id);
  x = api();
  x.db.products[1].category = 'smartwatch';
  const SUP2 = '66666666-6666-4666-8666-666666666666';
  await x.api.createSaleFromChat({ sale: chatSale(x.TS, { item_suppliers: { [P1]: SUP, [P2]: SUP2 } }) });
  assert.deepStrictEqual([x.db.sales[0].supplier_id, x.db.sales[0].volumes, ...x.db.sale_items.map((i) => i.supplier_id)], [SUP, 3, SUP, SUP2]);
});
test('recusa o que o ERP recusa e não grava nada', async () => {
  const cases = [
    [{ items: [], manual_items: [] }, /adicione pelo menos um produto ou item/],
    [{ customer_cpf: '12345678900' }, /CPF inválido/],
    [{ payments: [{ method: 'pix', amount: 300 }, { method: 'credit_card', card_brand: 'elo_amex', installments: 6, amount: 100 }] }, /não bate com o valor da venda/],
    [{ delivery_type: 'motoboy', neighborhood: '', city: '' }, /entrega via motoboy: Bairro, Cidade/],
    [{ customer_name: '' }, /nome do cliente/],
    [{ payments: [{ method: 'boleto', amount: 0 }] }, /Forma de pagamento 1 inválida/],
  ];
  for (const [extra, re] of cases) {
    const { api: a, TS, db } = api();
    await assert.rejects(a.createSaleFromChat({ sale: chatSale(TS, extra) }), re);
    assert.strictEqual(db.sales.length, 0);
  }
});
test('formas de pagamento: bandeira/parcelas limpas fora do cartão; valor 0 em todas = o total na 1ª (como o ERP)', async () => {
  const { api: a, TS, db } = api();
  await a.createSaleFromChat({ sale: chatSale(TS, { payments: [{ method: 'pix', card_brand: 'visa_mastercard', installments: 5, amount: 0 }] }) });
  assert.deepStrictEqual(plain(db.sales[0].payment_methods), [{ method: 'pix', card_brand: '', installments: 0, amount: 0 }]);
  assert.strictEqual(db.sales[0].card_fee, 0);
  assert.strictEqual(db.sales[0].installments, 1);
});
test('lookupCep: ViaCEP só com o CEP (8 dígitos); CEP errado = nada', async () => {
  const { api: a, calls } = api();
  assert.deepStrictEqual(plain(await a.lookupCep({ cep: '24220-000' })), { logradouro: 'Rua Gavião Peixoto', bairro: 'Icaraí', localidade: 'Niterói', uf: 'RJ' });
  assert.strictEqual(calls[0].url, 'https://viacep.com.br/ws/24220000/json/');
  assert.strictEqual(await a.lookupCep({ cep: '123' }), null);
  assert.strictEqual(calls.length, 1);
  const b = api({ cepBody: { erro: true } });
  assert.strictEqual(await b.api.lookupCep({ cep: '00000000' }), null);
});
test('colar formulário + CEP: preenche como o ERP (o CEP completa rua, UF, cidade e bairro)', () => {
  const { TS } = api();
  const f = { address_street: '', state: '', city: '', neighborhood: '', ...TS.parseForm('Nome: João\nCEP: 24220-000\nNúmero: 5') };
  const g = plain(TS.applyCep(f, { logradouro: 'Rua Gavião Peixoto', bairro: 'Icaraí', localidade: 'Niterói', uf: 'RJ' }));
  assert.deepStrictEqual([g.customer_name, g.address_number, g.zip_code, g.address_street, g.state, g.city, g.neighborhood], ['João', '5', '24220000', 'Rua Gavião Peixoto', 'RJ', 'Niterói', 'Icaraí']);
});
test('2.19.0: sale_items.position = ordem de adição (pulseira antes do relógio fica 0/1); sem a coluna grava sem ela', async () => {
  const { api: a, TS, db } = api();
  const s = chatSale(TS);
  s.items = [...s.items].reverse();
  await a.createSaleFromChat({ sale: s });
  assert.deepStrictEqual(db.sale_items.map((i) => [i.product_id, i.position]), [[P2, 0], [P1, 1]]);
  const b = api({ noPosition: true });
  await b.api.createSaleFromChat({ sale: chatSale(b.TS) });
  assert.strictEqual(b.db.sales.length, 1, 'a venda fica gravada');
  assert.deepStrictEqual(b.db.sale_items.map((i) => [i.product_id, 'position' in i]), [[P1, false], [P2, false]]);
});
test('mensagem do entregador: sem a linha de horário', () => {
  const { TS } = api();
  const m = TS.courierMessage({ customer_name: 'Maria', customer_phone: '21 98765-4321', address_street: 'Rua A', address_number: '1', address_complement: 'Ap 2', neighborhood: 'Icaraí', city: 'Niterói', items: [{ quantity: 1, name: 'Relógio' }], total: 100, payment_method: 'pix', payment_status: 'a_cobrar', notes: 'Portaria' });
  assert.ok(!/Horário/.test(m), m);
  assert.ok(/Complemento: Ap 2/.test(m) && /Valor a cobrar: R\$ 100,00 \(PIX\)/.test(m) && /Obs\.: Portaria/.test(m), m);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
