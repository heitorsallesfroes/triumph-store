// Testes da 2.12.4 (o que fazer depois de registrar a venda pelo 💰). node extension/tests/saleafter.test.cjs
// - engine.js: saleAfterDefaults (padrões e a última escolha lembrada) e saleWaPlan (o que tirar/pôr nas etiquetas do
//   WhatsApp: "Todas menos a que vai colocar", "Não enviar" nunca sai, etiqueta apagada)
// - content.js: as escolhas só são aplicadas depois que createSaleFromChat deu certo (venda que falha não mexe em nada)
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

const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math, Promise });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;

const WA = [{ id: '1', name: 'CLIENTE' }, { id: '2', name: 'EMBALAR' }, { id: '3', name: 'Não Enviar' }, { id: '4', name: 'Lead novo' }];
const CRM = [{ id: 'c-cli', name: 'Cliente' }, { id: 'c-vip', name: 'VIP' }];

test('padrão: tirar de tudo marcado; etiqueta do WhatsApp "Cliente" (sem acento/maiúscula); tirar nenhuma; CRM não mexe', () => {
  assert.deepStrictEqual(plain(E.saleAfterDefaults(null, WA, CRM)), { leaveAll: true, waAdd: '1', waRemove: '', crmAdd: '' });
  assert.deepStrictEqual(plain(E.saleAfterDefaults(null, [{ id: '9', name: 'Outra' }], CRM)), { leaveAll: true, waAdd: '', waRemove: '', crmAdd: '' });
});
test('lembra a última escolha (enquanto as etiquetas existirem)', () => {
  const saved = { leaveAll: false, waAdd: '2', waRemove: E.SALE_WA_ALL, crmAdd: 'c-vip' };
  assert.deepStrictEqual(plain(E.saleAfterDefaults(saved, WA, CRM)), saved);
  // escolheu "Nenhuma" de propósito: continua nenhuma (não volta para "Cliente")
  assert.strictEqual(E.saleAfterDefaults({ leaveAll: true, waAdd: '', waRemove: '', crmAdd: '' }, WA, CRM).waAdd, '');
  // etiqueta apagada: volta ao padrão
  const gone = plain(E.saleAfterDefaults({ leaveAll: true, waAdd: '77', waRemove: '78', crmAdd: 'c-apagada' }, WA, CRM));
  assert.deepStrictEqual(gone, { leaveAll: true, waAdd: '1', waRemove: '', crmAdd: '' });
});
test('"Não enviar" nunca fica como etiqueta a tirar, nem salva', () => {
  assert.strictEqual(E.saleAfterDefaults({ waRemove: '3' }, WA, CRM).waRemove, '');
});
test('plano das etiquetas do WhatsApp: "Todas menos a que vai colocar" nunca tira "Não enviar"', () => {
  const plan = plain(E.saleWaPlan({ waAdd: '1', waRemove: E.SALE_WA_ALL }, WA, ['1', '2', '3', '4', '99']));
  assert.deepStrictEqual(plan, { add: '1', remove: ['2', '4'], missing: false }); // 99 não existe mais; 3 = Não enviar; 1 = a que vai colocar
  assert.deepStrictEqual(plain(E.saleWaPlan({ waAdd: '', waRemove: '3' }, WA, [])), { add: null, remove: [], missing: false });
  assert.deepStrictEqual(plain(E.saleWaPlan({ waAdd: '1', waRemove: '1' }, WA, [])), { add: '1', remove: [], missing: false });
  assert.deepStrictEqual(plain(E.saleWaPlan({ waAdd: '2', waRemove: '4' }, WA, [])), { add: '2', remove: ['4'], missing: false });
  assert.deepStrictEqual(plain(E.saleWaPlan({ waAdd: '55', waRemove: '' }, WA, [])), { add: null, remove: [], missing: true });
});

// content.js: a ordem do registrar (venda primeiro; etiquetas e automações só depois de gravada)
test('content.js: createSaleFromChat que falha não chama etiquetas nem automações', () => {
  const c = src('content.js');
  const start = c.indexOf('  async function registerSale(confirmedDup) {');
  const end = c.indexOf('\n  }\n', start) > 0 ? c.indexOf('\n  }\n', start) : c.indexOf('\r\n  }\r\n', start);
  const body = c.slice(start, end);
  const sale = body.indexOf("call('createSaleFromChat'");
  const fail = body.indexOf('Nenhuma etiqueta ou automação foi mexida');
  const after = body.indexOf('applySaleAfter(f)');
  assert.ok(sale > 0 && fail > sale && after > fail, 'a venda vem antes; a falha retorna antes de aplicar');
  assert.ok(!/saleContactLabels|setWaLabel|leaveAutomation|seqRunAction/.test(body.slice(0, after)), 'nada de etiqueta/automação antes da venda gravada');
  assert.ok(!/Tirar das automações e pôr na etiqueta CRM/.test(c), 'a opção antiga saiu');
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
