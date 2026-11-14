// Ordem dos itens da venda (src/lib/saleItemsOrder.ts). Sem rede e sem banco: node scripts/tests/saleItemsOrder.test.ts
// 1) smartwatch primeiro, mesmo inserido depois da pulseira; brinde R$ 0,00 por último;
// 2) mesma categoria: position, depois created_at, depois a ordem do array; 3) categoria pelo mapa (produto separado);
// 4) insertSaleItems grava position = ordem de adição e, sem a coluna (migration não aplicada), grava sem ela.
import assert from 'node:assert/strict';
import { orderSaleItems, byAddedOrder, insertSaleItems } from '../../src/lib/saleItemsOrder.ts';

const names = (xs: { n: string }[]) => xs.map((x) => x.n);
const sw = (n: string, o = {}) => ({ n, unit_price: 499.9, products: { category: 'smartwatch' }, ...o });
const acc = (n: string, o = {}) => ({ n, unit_price: 59.9, products: { category: 'acessorio' }, ...o });

// 1) venda da extensão: a pulseira voltou primeiro do banco (id aleatório), o relógio foi adicionado antes
assert.deepEqual(names(orderSaleItems([acc('pulseira', { position: 1 }), sw('relogio', { position: 0 })])), ['relogio', 'pulseira']);
// sem position (migration não aplicada): smartwatch primeiro mesmo assim
assert.deepEqual(names(orderSaleItems([acc('pulseira'), sw('relogio')])), ['relogio', 'pulseira']);
// brinde por último, mesmo adicionado primeiro
assert.deepEqual(names(orderSaleItems([acc('fone', { unit_price: 0, position: 0 }), acc('pulseira', { position: 2 }), sw('relogio', { position: 1 })])), ['relogio', 'pulseira', 'fone']);
// 2) mesmo grupo: position; empate → created_at; empate → array
assert.deepEqual(names(orderSaleItems([sw('b', { position: 1 }), sw('a', { position: 0 })])), ['a', 'b']);
assert.deepEqual(names(orderSaleItems([acc('y', { created_at: '2026-11-14T10:00:01Z' }), acc('x', { created_at: '2026-11-14T10:00:00Z' })])), ['x', 'y']);
assert.deepEqual(names(orderSaleItems([acc('p'), acc('q'), acc('r')])), ['p', 'q', 'r']);
assert.deepEqual(names(byAddedOrder([acc('pulseira', { position: 1 }), sw('relogio', { position: 0 })])), ['relogio', 'pulseira']);
// 3) categoria vinda de um mapa (Histórico busca os produtos à parte); products como array (PostgREST)
const cat = new Map([['P1', 'acessorio'], ['P2', 'smartwatch']]);
assert.deepEqual(names(orderSaleItems([{ n: 'pul', product_id: 'P1', unit_price: 10 }, { n: 'rel', product_id: 'P2', unit_price: 400 }], cat)), ['rel', 'pul']);
assert.deepEqual(names(orderSaleItems([acc('pul'), { n: 'rel', unit_price: 1, products: [{ category: 'smartwatch' }] }])), ['rel', 'pul']);
assert.deepEqual(orderSaleItems(null), []);

// 4) gravação
function fakeDb(hasColumn: boolean) {
  const calls: unknown[][] = [];
  return {
    calls,
    from: () => ({
      insert: async (rows: Record<string, unknown>[]) => {
        calls.push(rows);
        if (!hasColumn && rows.some((r) => 'position' in r)) return { error: { code: 'PGRST204', message: "Could not find the 'position' column of 'sale_items' in the schema cache" } };
        return { error: null };
      },
    }),
  };
}
(async () => {
  const rows = [{ product_id: 'relogio' }, { product_id: 'pulseira' }];
  const a = fakeDb(true);
  assert.equal((await insertSaleItems(a, rows)).error, null);
  assert.deepEqual(a.calls, [[{ product_id: 'relogio', position: 0 }, { product_id: 'pulseira', position: 1 }]]);
  const b = fakeDb(false);
  assert.equal((await insertSaleItems(b, rows)).error, null);
  assert.equal(b.calls.length, 2);
  assert.deepEqual(b.calls[1], rows, 'sem a coluna: grava sem position');
  // outro erro não é engolido
  const c = { from: () => ({ insert: async () => ({ error: { code: '23503', message: 'foreign key violation' } }) }) };
  assert.equal((await insertSaleItems(c, rows)).error?.code, '23503');
  console.log('saleItemsOrder: ok');
})().catch((e) => { console.error(e); process.exit(1); });
