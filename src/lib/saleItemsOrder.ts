// Ordem dos itens da venda em todas as telas (Histórico, Recibo, Resumo WhatsApp, Nota fiscal, etiqueta…):
//   1º o smartwatch (products.category = 'smartwatch'), depois os outros itens pagos, brindes de R$ 0,00 por último;
//   dentro do mesmo grupo, a ordem em que foram adicionados (sale_items.position, depois created_at; sem elas, a ordem recebida).
// sale_items.position vem da migration 20261125120000_sale_items_position.sql. Antes dela a coluna não existe:
// as leituras usam "*" (traz position quando existir) e as gravações tentam de novo sem a coluna.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = Record<string, any>;

function productOf(it: AnyItem): AnyItem | null {
  const p = it.products ?? it.product ?? null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

function categoryOf(it: AnyItem): string {
  return String(it.category ?? productOf(it)?.category ?? '').toLowerCase();
}

function isGift(it: AnyItem): boolean {
  if (it.unit_price == null && it.price == null) return false;
  return Number(it.unit_price ?? it.price) === 0;
}

function positionOf(it: AnyItem): number {
  const n = it.position;
  return n == null || n === '' || !Number.isFinite(Number(n)) ? Number.POSITIVE_INFINITY : Number(n);
}

function createdOf(it: AnyItem): number {
  const t = it.created_at ? Date.parse(it.created_at) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

// position, depois created_at; Infinity - Infinity = NaN vira 0 (empate → ordem do array)
function addedCmp(a: AnyItem, b: AnyItem): number {
  return (positionOf(a) - positionOf(b) || 0) || (createdOf(a) - createdOf(b) || 0);
}

function groupOf(it: AnyItem, categoryById?: Map<string, string>): number {
  const cat = categoryOf(it) || (categoryById && it.product_id ? String(categoryById.get(it.product_id) || '').toLowerCase() : '');
  const gift = isGift(it) ? 2 : 0;
  return gift + (cat === 'smartwatch' ? 0 : 1);
}

/** Ordem em que os itens foram adicionados (position; empate/sem position = ordem do array). */
export function byAddedOrder<T extends AnyItem>(items: T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => addedCmp(a.it, b.it) || (a.i - b.i))
    .map((x) => x.it);
}

/** Ordem de exibição: smartwatch primeiro, brindes R$ 0,00 por último, ordem de adição dentro do grupo. */
export function orderSaleItems<T extends AnyItem>(items: T[] | null | undefined, categoryById?: Map<string, string>): T[] {
  return (items || [])
    .map((it, i) => ({ it, i, g: groupOf(it, categoryById) }))
    .sort((a, b) => (a.g - b.g) || addedCmp(a.it, b.it) || (a.i - b.i))
    .map((x) => x.it);
}

function missingPositionColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  return /position/i.test(String(err.message || '')) && (err.code === 'PGRST204' || err.code === '42703' || /column/i.test(String(err.message || '')));
}

/** Insere os itens gravando position = ordem do array; sem a coluna (migration não aplicada), insere sem ela. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertSaleItems(db: { from: (t: string) => any }, rows: AnyItem[]) {
  if (!rows.length) return { error: null };
  const withPos = rows.map((r, i) => ({ ...r, position: i }));
  const res = await db.from('sale_items').insert(withPos);
  if (res.error && missingPositionColumn(res.error)) return db.from('sale_items').insert(rows);
  return res;
}
