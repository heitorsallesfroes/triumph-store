// A venda pelo WhatsApp (💰 da extensão, extension/sale-calc.js) grava EXATAMENTE o que a tela "Nova Venda" do ERP
// grava (src/pages/Sales.tsx). Sem dependências: node scripts/tests/saleParity.test.ts
//
// Não é uma cópia da conta: o teste recorta do Sales.tsx o código de verdade (calculatePaymentFee, calculateTotals,
// calculateVolumes, o fornecedor por smartwatch, o insert de sales, sale_items e sale_accessories,
// parsearFormulario e updatePaymentMethod), usa o cardFees.ts / systemConfig.ts / cpfValidation.ts reais e roda a
// mesma venda nos dois lados. Se alguém mudar a conta do ERP, este teste falha até a extensão acompanhar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const SALES = read('src/pages/Sales.tsx');

// ── recortes do código do ERP ──
// trecho de "marker" até a chave que fecha o 1º "{" depois dele (o código recortado não tem chaves em textos)
function block(src: string, marker: string, from = 0): string {
  const at = src.indexOf(marker, from);
  if (at < 0) throw new Error(`não achei no ERP: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error(`chaves sem fim: ${marker}`);
}
const objectAfter = (src: string, marker: string) => { const b = block(src, marker); return b.slice(b.indexOf('{', marker.length - 1)); };
// (o aviso "experimental" do Node não interessa aqui)
const strip = (code: string) => { const w = process.emitWarning; process.emitWarning = () => {}; try { return stripTypeScriptTypes(code); } finally { process.emitWarning = w; } };

const calcPaymentFee = block(SALES, 'const calculatePaymentFee = (pm: PaymentEntry, amount: number) => {');
const calcTotals = block(SALES, 'const calculateTotals = () => {');
const calcVolumes = block(SALES, 'const calculateVolumes = (productsList: SaleProduct[]) => {');
const parsear = block(SALES, 'const parsearFormulario = (texto: string) => {');
const updatePM = block(SALES, 'const updatePaymentMethod = (index: number, field: string, value: string | number) => {');
const submit = block(SALES, 'const handleSubmit = async (e: React.FormEvent) => {');
const swLines = /const smartwatchItems = saleProducts\.filter\([^\n]*\n\s*const isMultiSupplier = [^\n]*/.exec(submit);
const multiLine = /if \(isMultiSupplier\) \{\n\s*(supplierId = [^\n]*)/.exec(submit);
if (!swLines || !multiLine) throw new Error('não achei o fornecedor por smartwatch no ERP');
const newSale = submit.slice(submit.indexOf("const { data: saleData, error: saleError } = await supabase"));
const insertObj = objectAfter(newSale, ".insert([\n          {");
const itemsObj = objectAfter(newSale, 'const saleItemsData = saleProducts.map((sp) => ({');
const accObj = objectAfter(newSale, 'const accessoriesData = saleAccessories.map((sa) => ({');

// cardFees.ts, systemConfig.ts (DEFAULTS + getConfig*) e cpfValidation.ts de verdade
const CONFIG = read('src/lib/systemConfig.ts');
const cfgCode = [block(CONFIG, 'const DEFAULTS: Record<string, string> = {'), block(CONFIG, 'export function getConfigString(key: string): string {'), block(CONFIG, 'export function getConfigNumber(key: string): number {')].join('\n');
const CARDFEES = read('src/lib/cardFees.ts').replace(/^import .*$/m, '');
const CPF = read('src/lib/cpfValidation.ts');
const lib = (s: string) => strip(s).replace(/^export /gm, '');

// ERP: (estado da tela, taxas do banco, agora) → { row, saleItemsData, accessoriesData, totals }
const erpBody = `
  ${lib(cfgCode).replace('const DEFAULTS', 'const DEFAULTS_')}
  let cache = { ...DEFAULTS_, ...dbConfig };
  const DEFAULTS = DEFAULTS_;
  ${lib(CARDFEES)}
  ${lib(CPF)}
  let { saleProducts, saleAccessories, manualItems, paymentMethods, formData, saleDate, paymentStatus, perProductSupplierIds, citySearch, neighborhoodSearch, supplierId, products } = st;
  ${strip(calcPaymentFee)}
  ${strip(calcTotals)}
  ${strip(calcVolumes)}
  formData = { ...formData, volumes: calculateVolumes(saleProducts) };
  ${strip(swLines[0])}
  if (isMultiSupplier) { ${strip(multiLine[1])} }
  const cityName = citySearch.trim();
  const neighborhoodName = neighborhoodSearch.trim();
  const totals = calculateTotals();
  const row = ${strip(`(${insertObj})`)};
  const saleData = { id: 'SALE' };
  const saleItemsData = saleProducts.map((sp) => (${strip(`(${itemsObj})`)}));
  const accessoriesData = saleAccessories.map((sa) => (${strip(`(${accObj})`)}));
  return { row, saleItemsData, accessoriesData, totals };
`;
const erpSale = new Function('st', 'dbConfig', 'Date', erpBody) as (st: unknown, cfg: Record<string, string>, D: DateConstructor) => any;

const erpParse = (texto: string) => {
  const body = `
    ${lib(CPF)}
    let formData = {};
    const out = { cep: null };
    const setFormData = (fn) => { formData = typeof fn === 'function' ? fn(formData) : fn; };
    const setNeighborhoodSearch = (v) => { out.neighborhood = v; };
    const setCitySearch = (v) => { out.city = v; };
    const setCpfDisplay = () => {}; const setCpfError = () => {}; const setShowPasteForm = () => {};
    const handleCepChange = (c) => { out.cep = c; };
    ${strip(parsear)}
    parsearFormulario(texto);
    return { ...formData, ...(out.neighborhood ? { neighborhood: out.neighborhood } : {}), ...(out.city ? { city: out.city } : {}), cepLookup: out.cep };
  `;
  return new Function('texto', body)(texto);
};
const erpUpdatePM = (list: unknown[], index: number, field: string, value: unknown) => {
  const body = `let paymentMethods = list; let out = null; const setPaymentMethods = (v) => { out = v; }; ${strip(updatePM)};
    updatePaymentMethod(index, field, value); return out;`;
  return new Function('list', 'index', 'field', 'value', body)(list, index, field, value);
};

// ── extensão ──
const ctx = vm.createContext({ console, Intl, Date, Math });
vm.runInContext(read('extension/sale-calc.js'), ctx, { filename: 'sale-calc.js' });
const TS = ctx.TspSale;
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ── a mesma venda nos dois lados ──
const NOW = Date.parse('2026-11-07T17:42:13.456Z');
class FixedDate extends Date {
  constructor(...a: any[]) { if (a.length) super(...(a as [number])); else super(NOW); }
  static now() { return NOW; }
}
type P = { id: string; model: string; color: string; category: string; price: number; cost: number; current_stock: number };
const PRODUCTS: P[] = [
  { id: 'p-sw1', model: 'Smartwatch Ultra', color: 'Preto', category: 'smartwatch', price: 499.9, cost: 210, current_stock: 4 },
  { id: 'p-pul', model: 'Pulseira Milanese', color: 'Prata', category: 'pulseira', price: 59.9, cost: 12.5, current_stock: 9 },
  { id: 'p-sw2', model: 'Smartwatch Kids', color: 'Rosa', category: 'smartwatch', price: 299, cost: 120, current_stock: 2 },
];
const prod = (id: string) => PRODUCTS.find((p) => p.id === id)!;

interface Sale {
  saleDate: string; form: Record<string, any>; items: { product_id: string; quantity: number; unit_price: number; unit_cost: number }[];
  accessories?: { accessory_id: string; quantity: number; cost: number; custom_name?: string }[]; manual?: { name: string; price: number; cost: number; quantity: number }[];
  payments: Record<string, any>[]; paymentStatus: 'pago' | 'a_cobrar'; supplierId?: string; perItem?: Record<string, string>; cfg?: Record<string, string>;
}
function both(s: Sale) {
  const erp = erpSale({
    saleProducts: s.items.map((it) => ({ ...it, product: prod(it.product_id) })),
    saleAccessories: (s.accessories || []).map((a) => ({ ...a, accessory: { id: a.accessory_id, name: 'acc', cost: 1 } })),
    manualItems: s.manual || [], paymentMethods: s.payments, formData: { ...s.form, supplier_id: s.supplierId || '' }, saleDate: s.saleDate,
    paymentStatus: s.paymentStatus, perProductSupplierIds: s.perItem || {}, citySearch: s.form.city, neighborhoodSearch: s.form.neighborhood,
    supplierId: s.supplierId || '', products: PRODUCTS,
  }, s.cfg || {}, FixedDate as unknown as DateConstructor);
  const ext = TS.buildSale({
    form: { ...s.form, sale_date: s.saleDate, payment_status: s.paymentStatus },
    items: s.items.map((it) => ({ ...it, category: prod(it.product_id).category })),
    accessories: s.accessories || [], manualItems: s.manual || [], payments: s.payments, cfg: s.cfg || {},
    supplierId: s.supplierId || null, itemSuppliers: s.perItem || {}, now: NOW,
  });
  return {
    erp: plain(erp),
    ext: plain({ row: ext.row, saleItemsData: ext.saleItems.map((x: object) => ({ sale_id: 'SALE', ...x })), accessoriesData: ext.saleAccessories.map((x: object) => ({ sale_id: 'SALE', ...x })), totals: ext.totals }),
  };
}
const baseForm = {
  customer_name: 'Maria Souza', customer_phone: '5521987654321', customer_cpf: '52998224725', address_street: 'Rua das Flores', address_number: '120',
  address_complement: 'Ap 302', city: 'Niterói ', neighborhood: ' Icaraí', state: 'RJ', zip_code: '24220000', delivery_type: 'correios', motoboy_id: '',
  delivery_fee: 0, delivery_cost: 15, delivery_notes: '  Deixar na portaria  ',
};

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('venda com 2 produtos (custo editado), acessório, item manual, 2 formas de pagamento e Correios: igual ao ERP', () => {
  const sale: Sale = {
    saleDate: '2026-10-30', paymentStatus: 'pago', supplierId: 'sup-1', form: baseForm,
    items: [{ product_id: 'p-sw1', quantity: 1, unit_price: 489.9, unit_cost: 199.5 }, { product_id: 'p-pul', quantity: 2, unit_price: 49.9, unit_cost: 12.5 }],
    accessories: [{ accessory_id: 'a-cx', quantity: 1, cost: 3.2 }],
    manual: [{ name: 'Película extra', price: 20, cost: 4, quantity: 1 }],
    payments: [{ method: 'pix', card_brand: '', installments: 0, amount: 300 }, { method: 'credit_card', card_brand: 'elo_amex', installments: 6, amount: 309.7 }],
  };
  const { erp, ext } = both(sale);
  assert.deepEqual(ext, erp);
  // conferência do que interessa (para o teste não passar com os dois lados vazios)
  assert.ok(Math.abs(erp.row.total_sale_price - 609.7) < 1e-9);
  assert.equal(erp.row.customer_cpf, '52998224725');
  assert.equal(erp.row.city, 'Niterói');
  assert.equal(erp.row.delivery_cost, 15);
  assert.equal(erp.row.card_brand, 'elo_amex');
  assert.equal(erp.row.installments, 6);
  assert.equal(erp.row.supplier_id, 'sup-1');
  assert.equal(erp.row.sale_date, '2026-10-30T17:42:13.456Z');
  assert.equal(erp.row.manual_items.length, 1);
  assert.equal(erp.saleItemsData[0].unit_cost, 199.5);
  assert.ok(Math.abs(erp.row.card_fee - 309.7 * 0.0726) < 1e-9);
  assert.deepEqual(Object.keys(ext.row), Object.keys(erp.row)); // mesmas colunas, na mesma ordem
});
test('link de pagamento depois da data das taxas do link (pela DATA DA VENDA), valor 0, motoboy: igual ao ERP', () => {
  const cfg = { fee_link_start_date: '2026-10-01', fee_link_vm_credit_3: '0.0599' };
  for (const saleDate of ['2026-09-30', '2026-10-15']) {
    const { erp, ext } = both({
      saleDate, paymentStatus: 'a_cobrar', cfg, form: { ...baseForm, delivery_type: 'motoboy', motoboy_id: 'm-1', delivery_fee: 20, delivery_cost: 0, customer_cpf: '' },
      items: [{ product_id: 'p-pul', quantity: 1, unit_price: 59.9, unit_cost: 12.5 }],
      payments: [{ method: 'payment_link', card_brand: 'visa_mastercard', installments: 3, amount: 0 }],
    });
    assert.deepEqual(ext, erp, saleDate);
    assert.equal(erp.row.delivery_fee, 20);
    assert.equal(erp.row.customer_cpf, null);
    assert.ok(Math.abs(erp.row.card_fee - 59.9 * (saleDate >= '2026-10-01' ? 0.0599 : 0.0466)) < 1e-9, saleDate);
  }
});
test('2 smartwatches: fornecedor por smartwatch (o da venda é o do 1º) e volumes = 2: igual ao ERP', () => {
  const { erp, ext } = both({
    saleDate: '2026-11-07', paymentStatus: 'a_cobrar', form: { ...baseForm, delivery_type: 'loja_fisica' }, perItem: { 'p-sw1': 'sup-a', 'p-sw2': 'sup-b' },
    items: [{ product_id: 'p-sw1', quantity: 1, unit_price: 499.9, unit_cost: 210 }, { product_id: 'p-sw2', quantity: 1, unit_price: 299, unit_cost: 120 }],
    payments: [{ method: 'debit_card', card_brand: 'visa_mastercard', installments: 0, amount: 0 }],
  });
  assert.deepEqual(ext, erp);
  assert.deepEqual([erp.row.supplier_id, erp.row.volumes, erp.row.delivery_cost, erp.saleItemsData.map((x: any) => x.supplier_id)], ['sup-a', 2, 0, ['sup-a', 'sup-b']]);
});
test('"Outros" com valor bruto/líquido e acessório personalizado: igual ao ERP', () => {
  const { erp, ext } = both({
    saleDate: '2026-11-01', paymentStatus: 'pago', form: { ...baseForm, delivery_type: 'loja_fisica', customer_phone: '' },
    items: [{ product_id: 'p-sw2', quantity: 1, unit_price: 280, unit_cost: 120 }], accessories: [{ accessory_id: 'a-1', quantity: 2, cost: 1.5, custom_name: 'Brinde' }],
    payments: [{ method: 'outros', card_brand: '', installments: 0, amount: 280, net_amount: 266 }],
  });
  assert.deepEqual(ext, erp);
  assert.deepEqual([erp.row.card_fee, erp.row.customer_phone, erp.accessoriesData[0].custom_name], [14, null, 'Brinde']);
});
test('"Colar formulário": a mesma leitura do ERP (e o CEP vai buscar o endereço)', () => {
  const texts = [
    'Nome: Ana Paula Lima\nRua: Av. Roberto Silveira\nNúmero: 455\nComplemento: Bloco 2 apartamento 1101\nBairro: Icaraí\nCidade: Niterói\nEstado: Rio de Janeiro\nCEP: 24.230-160\nCPF: 529.982.247-25',
    'nome ana\nendereço rua x\nnº 12\nbairro centro\ncep 01001-000\nuf sp',
    'Oi, tudo bem?',
  ];
  for (const t of texts) {
    const erp = erpParse(t);
    const cepLookup = erp.cepLookup;
    delete erp.cepLookup;
    const ext = plain(TS.parseForm(t));
    assert.deepEqual(ext, erp, t);
    assert.equal(cepLookup || null, ext.zip_code || null);
  }
  assert.equal(TS.parseForm(texts[0]).address_complement, 'Bloco 2 apartament'); // 18 caracteres, como o ERP
});
test('forma de pagamento: trocar a forma limpa bandeira/parcelas como o ERP', () => {
  const start = [{ method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, amount: 100 }];
  for (const [field, value] of [['method', 'pix'], ['method', 'debit_card'], ['method', 'payment_link'], ['method', 'outros'], ['card_brand', 'elo_amex'], ['installments', 3], ['amount', 50]] as [string, unknown][]) {
    assert.deepEqual(plain(TS.updatePayment(start[0], field, value)), erpUpdatePM(start, 0, field, value)[0], `${field}=${value}`);
  }
  assert.deepEqual(plain(TS.initialPayment()), { method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, amount: 0 });
  assert.ok(SALES.includes("setPaymentMethods([...paymentMethods, { method: 'pix', card_brand: '', installments: 0, amount: 0 }])"));
  assert.deepEqual(plain(TS.newPaymentEntry()), { method: 'pix', card_brand: '', installments: 0, amount: 0 });
});
test('troca do tipo de entrega igual ao ERP (Correios com custo 13,11; motoboy sem taxa)', () => {
  assert.ok(SALES.includes("delivery_type: e.target.value, motoboy_id: '', delivery_fee: 0, delivery_cost: e.target.value === 'correios' ? 13.11 : 0"));
  assert.deepEqual(plain(TS.deliveryChange('correios')), { delivery_type: 'correios', motoboy_id: '', delivery_fee: 0, delivery_cost: 13.11 });
  assert.deepEqual(plain(TS.deliveryChange('motoboy')), { delivery_type: 'motoboy', motoboy_id: '', delivery_fee: 0, delivery_cost: 0 });
  assert.ok(SALES.includes('delivery_fee: 20,')); // taxa inicial do motoboy
  assert.equal(TS.DEFAULT_DELIVERY_FEE, 20);
});
test('validações do ERP: sem itens, CPF inválido, motoboy sem bairro/cidade, total alocado diferente', () => {
  const f = { ...baseForm, delivery_type: 'motoboy' };
  const items = [{ product_id: 'p-pul', quantity: 1, unit_price: 59.9, unit_cost: 12.5 }];
  const pays = [{ method: 'pix', card_brand: '', installments: 0, amount: 0 }];
  assert.equal(TS.validateSale({ form: f, items: [], manualItems: [], payments: pays }), 'Por favor, adicione pelo menos um produto ou item');
  assert.equal(TS.validateSale({ form: { ...f, customer_cpf: '12345678900' }, items, payments: pays }), 'CPF inválido');
  assert.equal(TS.validateSale({ form: { ...f, city: '', neighborhood: '' }, items, payments: pays }), 'Preencha os campos obrigatórios para entrega via motoboy: Bairro, Cidade');
  assert.equal(TS.validateSale({ form: f, items, payments: [{ ...pays[0], amount: 50 }] }), 'Total alocado (R$ 50.00) não bate com o valor da venda (R$ 59.90)');
  assert.equal(TS.validateSale({ form: f, items, payments: [{ ...pays[0], amount: 30 }, { ...pays[0], amount: 29.9 }] }), null);
  // as mesmas mensagens do ERP
  ['Por favor, adicione pelo menos um produto ou item', "alert('CPF inválido')", 'Preencha os campos obrigatórios para entrega via motoboy', 'não bate com o valor da venda'].forEach((m) => assert.ok(SALES.includes(m) || read('src/lib/addressValidation.ts').includes(m), m));
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 14).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
