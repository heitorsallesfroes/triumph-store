// Supabase FALSO para o teste da aba WhatsApp no Chrome real (scripts/tests/waChrome.test.ts). Substitui
// src/lib/supabase.ts no pacote do teste: lê e filtra as tabelas de window.__DB (como o PostgREST), sem rede.
// window.__MISSING = ['tabela'] faz a tabela "não existir". window.__QUERIES guarda cada consulta (para conferir).
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
interface W { __DB: Record<string, Row[]>; __MISSING?: string[]; __QUERIES?: { table: string; filters: string[]; range: [number, number] | null }[] }
const w = () => globalThis as unknown as W;

const cmp = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a ?? ''); const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};
const parseList = (v: unknown) => (Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')));

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private desc: string[] = [];
  private orders: [string, boolean][] = [];
  private rng: [number, number] | null = null;
  private lim: number | null = null;
  private single = false;
  private countMode = false;
  private head = false;
  constructor(private table: string) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (opts && opts.count) this.countMode = true; if (opts && opts.head) this.head = true; return this; }
  private add(d: string, f: Filter) { this.desc.push(d); this.filters.push(f); return this; }
  eq(c: string, v: unknown) { return this.add(`${c}=eq.${v}`, (r) => r[c] === v || String(r[c]) === String(v)); }
  neq(c: string, v: unknown) { return this.add(`${c}=neq.${v}`, (r) => String(r[c]) !== String(v)); }
  gte(c: string, v: unknown) { return this.add(`${c}=gte.${v}`, (r) => r[c] != null && cmp(r[c], v) >= 0); }
  gt(c: string, v: unknown) { return this.add(`${c}=gt.${v}`, (r) => r[c] != null && cmp(r[c], v) > 0); }
  lte(c: string, v: unknown) { return this.add(`${c}=lte.${v}`, (r) => r[c] != null && cmp(r[c], v) <= 0); }
  lt(c: string, v: unknown) { return this.add(`${c}=lt.${v}`, (r) => r[c] != null && cmp(r[c], v) < 0); }
  in(c: string, v: unknown) { const set = new Set(parseList(v).map(String)); return this.add(`${c}=in.${[...set].join(',')}`, (r) => set.has(String(r[c]))); }
  is(c: string, v: unknown) { return this.add(`${c}=is.${v}`, (r) => (v === null ? r[c] == null : r[c] === v)); }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, !o || o.ascending !== false]); return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.single = true; return this; }
  then<A = { data: unknown; error: unknown; count?: number | null }, B = never>(ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
  private run() {
    const g = w();
    (g.__QUERIES = g.__QUERIES || []).push({ table: this.table, filters: this.desc, range: this.rng });
    if ((g.__MISSING || []).includes(this.table)) return { data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' }, count: null };
    let rows = (g.__DB[this.table] || []).filter((r) => this.filters.every((f) => f(r)));
    if (this.orders.length) rows = [...rows].sort((a, b) => { for (const [c, asc] of this.orders) { const d = cmp(a[c], b[c]); if (d) return asc ? d : -d; } return 0; });
    const count = rows.length;
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.head) rows = [];
    const data = this.single ? (rows[0] ? { ...rows[0] } : null) : rows.map((r) => ({ ...r }));
    return { data, error: null, count: this.countMode ? count : null };
  }
}

export const supabase = {
  from: (table: string) => new Query(table),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};
export type Product = Record<string, unknown>;
export type Accessory = Record<string, unknown>;
