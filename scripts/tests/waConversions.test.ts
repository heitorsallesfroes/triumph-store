// Testes da coluna "Venda do ERP" da aba Conversões (Facebook) — 2.10.5. node scripts/tests/waConversions.test.ts
import assert from 'node:assert/strict';
import { linkedSaleLabel } from '../../src/lib/waConversions.ts';

const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const tests: [string, () => void][] = [
  ['sem venda ligada: "—"', () => assert.equal(linkedSaleLabel(null, undefined, money), '—')],
  ['ligada: "#id · cliente · R$"', () => assert.equal(linkedSaleLabel('5a1e0001-0000-4000-8000-000000000001', { id: '5a1e0001-0000-4000-8000-000000000001', customer_name: 'Maria', total_sale_price: '100' }, money), '#5a1e0001 · Maria · R$ 100,00')],
  ['venda sem nome', () => assert.equal(linkedSaleLabel('abcdef12-x', { id: 'abcdef12-x', customer_name: null, total_sale_price: 50 }, money), '#abcdef12 · cliente sem nome · R$ 50,00')],
  ['venda apagada ou sem acesso', () => assert.equal(linkedSaleLabel('abcdef12-x', undefined, money), '#abcdef12 (venda apagada ou sem acesso)')],
];
let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
