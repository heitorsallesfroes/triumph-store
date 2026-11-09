// A busca da Nova Venda do ERP (src/lib/productSearch.ts) e a do 💰 da extensão (extension/product-search.js) são
// o MESMO código (2.12.7). Sem dependências: node scripts/tests/productSearch.test.ts
// 1) o trecho entre "início da busca" e "fim da busca" é igual nos dois (tirando os tipos do TypeScript e os espaços);
// 2) os dois dão o mesmo resultado nos exemplos; 3) os exemplos pedidos ("pul ros go 38", "s11 rose", "aco mil").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as erp from '../../src/lib/productSearch.ts';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (code: string) => { const w = process.emitWarning; process.emitWarning = () => {}; try { return stripTypeScriptTypes(code); } finally { process.emitWarning = w; } };
const region = (src: string, name: string) => {
  const a = src.indexOf('// ── início da busca ──');
  const b = src.indexOf('// ── fim da busca ──');
  if (a < 0 || b < a) throw new Error(`marcadores "início/fim da busca" não achados em ${name}`);
  return src.slice(a, b);
};
const squash = (s: string) => s.replace(/\s+/g, '');

const EXT_SRC = read('extension/product-search.js');
const ctx = vm.createContext({});
vm.runInContext(EXT_SRC, ctx, { filename: 'product-search.js' });
const ext = (ctx as { TspSearch: typeof erp }).TspSearch;

const CATALOG = [
  { label: 'Pulseira Aço Milanese Rose Gold 38/41mm' },
  { label: 'Pulseira Aço Milanese Prata 42/44mm', createdAt: '2026-03-01T00:00:00Z' },
  { label: 'Pulseira Silicone Rosa 38/41mm', sold: 4 },
  { label: 'S11 Rose Gold' },
  { label: 'S11 Preto' },
  { label: 'S10 Rose Gold' },
  { label: 'Película S11' },
  { label: 'Carregador S11', createdAt: '2026-06-01T00:00:00Z' },
  { label: 'Caixa presente' },
];
const QUERIES = ['pul ros go 38', 's11 rose', 'aco mil', 'AÇO MIL', '38 go ros pul', 'rose s11', 'mil aco', '3841', '38/41', 's11', 'pulseira', 'ros', 'x', '', '  ', 's.11', 'mila lan'];
const labels = (q: string) => erp.searchItems(CATALOG, q).map((h) => h.item.label);
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

const tests: [string, () => void][] = [
  ['o código da busca é o mesmo no ERP e na extensão (fora os tipos)', () => {
    const tsRegion = region(read('src/lib/productSearch.ts'), 'src/lib/productSearch.ts');
    assert.equal(squash(strip(tsRegion)), squash(region(EXT_SRC, 'extension/product-search.js')),
      'extension/product-search.js está diferente de src/lib/productSearch.ts: copie o trecho de novo');
  }],
  ['as duas exportam as mesmas funções', () => {
    assert.deepEqual(Object.keys(ext).sort(), ['highlightParts', 'matchTokens', 'normalizeSearch', 'searchItems', 'searchTokens']);
    for (const k of Object.keys(ext)) assert.equal(typeof (erp as Record<string, unknown>)[k], 'function', k);
  }],
  ['as duas dão o mesmo resultado (lista, ordem e negrito)', () => {
    for (const q of QUERIES) {
      const a = erp.searchItems(CATALOG, q).map((h) => [h.item.label, h.ranges, erp.highlightParts(h.item.label, h.ranges)]);
      const b = ext.searchItems(CATALOG, q).map((h) => [h.item.label, h.ranges, ext.highlightParts(h.item.label, h.ranges)]);
      assert.deepEqual(plain(b), plain(a), q);
    }
  }],
  ['"pul ros go 38" acha a Pulseira Milanese Rose Gold 38/41', () => assert.deepEqual(labels('pul ros go 38'), ['Pulseira Aço Milanese Rose Gold 38/41mm'])],
  ['"s11 rose" acha o S11 Rose Gold', () => assert.deepEqual(labels('s11 rose'), ['S11 Rose Gold'])],
  ['"aco mil" acha com acento', () => assert.deepEqual(labels('aco mil'), ['Pulseira Aço Milanese Prata 42/44mm', 'Pulseira Aço Milanese Rose Gold 38/41mm'])],
  ['a ordem dos pedaços não importa', () => {
    assert.deepEqual(labels('38 go ros pul'), labels('pul ros go 38'));
    assert.deepEqual(labels('rose s11'), labels('s11 rose'));
    assert.deepEqual(labels('mil aco'), labels('aco mil'));
  }],
  ['começo de palavra primeiro; empate por mais vendido, mais recente e nome', () => {
    // "ros": Rosa/Rose no começo; o mais vendido (Silicone, sold 4) primeiro, depois alfabético
    assert.deepEqual(labels('ros'), ['Pulseira Silicone Rosa 38/41mm', 'Pulseira Aço Milanese Rose Gold 38/41mm', 'S10 Rose Gold', 'S11 Rose Gold']);
    // "s11": todos no começo da palavra; o mais recente (Carregador) primeiro, depois alfabético
    assert.deepEqual(labels('s11'), ['Carregador S11', 'Película S11', 'S11 Preto', 'S11 Rose Gold']);
  }],
  ['negrito no pedaço achado', () => {
    const [h] = erp.searchItems(CATALOG, 'pul ros go 38');
    assert.deepEqual(erp.highlightParts(h.item.label, h.ranges).filter((p) => p.bold).map((p) => p.text), ['Pul', 'Ros', 'Go', '38']);
  }],
  ['UnifiedSearch (Nova Venda) usa a busca e o negrito', () => {
    const c = read('src/components/UnifiedSearch.tsx');
    assert.match(c, /from '\.\.\/lib\/productSearch'/);
    assert.match(c, /searchItems\(candidates, searchTerm\)/);
    assert.match(c, /highlightParts\(item\.label, ranges\)/);
  }],
];
let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
