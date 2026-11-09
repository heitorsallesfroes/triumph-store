// Testes da 2.12.7 (busca de produtos por pedaços de palavras, product-search.js): node extension/tests/search.test.cjs
// A cópia do ERP (src/lib/productSearch.ts) é conferida por scripts/tests/productSearch.test.ts.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'product-search.js'), 'utf8'), ctx, { filename: 'product-search.js' });
const S = ctx.TspSearch;

const CATALOG = [
  { label: 'Pulseira Aço Milanese - Rose Gold 38/41mm' },
  { label: 'Pulseira Aço Milanese - Prata 42/44mm' },
  { label: 'Pulseira Silicone - Rosa 38/41mm' },
  { label: 'S11 - Rose Gold' },
  { label: 'S11 - Preto' },
  { label: 'S10 - Rose Gold' },
  { label: 'Película S11' },
  { label: 'Carregador S11' },
];
const plain = (v) => JSON.parse(JSON.stringify(v)); // (arrays do vm são de outro "realm")
const labels = (q, items = CATALOG) => plain(S.searchItems(items, q).map((h) => h.item.label));
const bold = (h) => plain(S.highlightParts(h.item.label, h.ranges).filter((p) => p.bold).map((p) => p.text));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('"pul ros go 38" acha a Pulseira Aço Milanese Rose Gold 38/41mm (e só ela)', () => {
  assert.deepStrictEqual(labels('pul ros go 38'), ['Pulseira Aço Milanese - Rose Gold 38/41mm']);
});
test('"s11 rose" acha o S11 Rose Gold (e não o S10 nem o S11 Preto)', () => {
  assert.deepStrictEqual(labels('s11 rose'), ['S11 - Rose Gold']);
});
test('"aco mil" acha com acento (Aço); "AÇO MIL" também', () => {
  assert.deepStrictEqual(labels('aco mil'), ['Pulseira Aço Milanese - Prata 42/44mm', 'Pulseira Aço Milanese - Rose Gold 38/41mm']);
  assert.deepStrictEqual(labels('AÇO MIL'), labels('aco mil'));
});
test('a ordem dos pedaços não importa', () => {
  assert.deepStrictEqual(labels('38 go ros pul'), labels('pul ros go 38'));
  assert.deepStrictEqual(labels('rose s11'), labels('s11 rose'));
  assert.deepStrictEqual(labels('mil aco'), labels('aco mil'));
});
test('"/", "-" e "." não contam: 38/41 acha com "38", "3841" e "38/41"', () => {
  const r = labels('3841');
  assert.deepStrictEqual(r, ['Pulseira Aço Milanese - Rose Gold 38/41mm', 'Pulseira Silicone - Rosa 38/41mm']);
  assert.deepStrictEqual(labels('38/41'), r);
  assert.deepStrictEqual(labels('38'), r);
  assert.deepStrictEqual(labels('s.11'), labels('s11'));
});
test('sem pedaço nenhum (vazio ou só espaços) não acha nada; pedaço que não existe zera', () => {
  assert.deepStrictEqual(labels(''), []);
  assert.deepStrictEqual(labels('   '), []);
  assert.deepStrictEqual(labels('pul xyz'), []);
});
test('ordem: primeiro os pedaços no começo das palavras ("s11 x" antes de "x s11" só no meio)', () => {
  const items = [{ label: 'Capa ros11' }, { label: 'Rose S11' }];
  assert.deepStrictEqual(labels('s11', [{ label: 'Abcs11' }, { label: 'S11 Preto' }]), ['S11 Preto', 'Abcs11']);
  assert.deepStrictEqual(labels('ros', [{ label: 'Capa Microsoft' }, { label: 'Rose' }]), ['Rose', 'Capa Microsoft']);
  assert.deepStrictEqual(labels('s11', items), ['Rose S11', 'Capa ros11']);
});
test('empate: mais vendido, depois mais recente, senão alfabético', () => {
  assert.deepStrictEqual(labels('s11', [{ label: 'S11 B' }, { label: 'S11 A' }]), ['S11 A', 'S11 B']);
  assert.deepStrictEqual(labels('s11', [{ label: 'S11 A', createdAt: '2026-01-01T00:00:00Z' }, { label: 'S11 B', createdAt: '2026-05-01T00:00:00Z' }]), ['S11 B', 'S11 A']);
  assert.deepStrictEqual(labels('s11', [{ label: 'S11 A', sold: 3, createdAt: '2026-01-01' }, { label: 'S11 B', sold: 9, createdAt: '2025-01-01' }]), ['S11 B', 'S11 A']);
  assert.deepStrictEqual(labels('s', [{ label: 'S2' }, { label: 'S10' }]), ['S2', 'S10']);
});
test('negrito no pedaço achado, no texto original (com acento e com a barra)', () => {
  const [h] = S.searchItems(CATALOG, 'pul ros go 38');
  assert.deepStrictEqual(bold(h), ['Pul', 'Ros', 'Go', '38']);
  const [a] = S.searchItems([{ label: 'Pulseira Aço Milanese' }], 'aco mil');
  assert.deepStrictEqual(bold(a), ['Aço', 'Mil']);
  const [b] = S.searchItems([{ label: 'Rose Gold 38/41mm' }], '3841');
  assert.deepStrictEqual(bold(b), ['38/41']);
  assert.strictEqual(S.highlightParts(h.item.label, h.ranges).map((p) => p.text).join(''), h.item.label);
});
test('pedaços que se sobrepõem viram um negrito só', () => {
  const [h] = S.searchItems([{ label: 'Milanese' }], 'mila lan');
  assert.deepStrictEqual(bold(h), ['Milan']);
});
test('limit corta a lista', () => {
  assert.strictEqual(S.searchItems(CATALOG, 'pulseira', { limit: 2 }).length, 2);
});
test('content.js usa a busca (TspSearch) no 💰 e product-search.js carrega antes do content.js', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.ok(/TspSearch\.searchItems\(cands, f\.search/.test(c));
  assert.ok(/TspSearch\.highlightParts\(/.test(c));
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const iso = m.content_scripts.find((cs) => !cs.world && cs.js.includes('content.js'));
  assert.ok(iso.js.indexOf('product-search.js') >= 0 && iso.js.indexOf('product-search.js') < iso.js.indexOf('content.js'));
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
