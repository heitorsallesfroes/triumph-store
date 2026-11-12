// Cliente do Supabase SÓ DE LEITURA para os testes com os dados reais (waAutomationsReal.test.ts e o Chrome com
// REAL=1): monta a mesma consulta encadeada do supabase-js (select/eq/neq/gte/lte/in/ilike/order/range/limit,
// contagem com head) e faz SÓ GET/HEAD no PostgREST. insert/update/upsert/delete/rpc dão erro na hora.
// Usa a URL e a chave anon públicas da extensão (extension/config.js), as mesmas do .env do ERP.
type Res = { data: unknown; error: { message: string } | null; count: number | null };
const enc = (v: unknown) => encodeURIComponent(String(v));
const list = (v: unknown[]) => `(${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')})`;

export function readOnlyClient(url: string, key: string, onQuery?: (method: string, path: string) => void) {
  class Q implements PromiseLike<Res> {
    private params: string[] = [];
    private cols = '*';
    private head = false;
    private wantCount = false;
    private rng: [number, number] | null = null;
    private lim: number | null = null;
    private table: string;
    constructor(table: string) { this.table = table; }
    select(cols = '*', opts?: { count?: string; head?: boolean }) { this.cols = cols.replace(/\s+/g, ''); this.head = !!(opts && opts.head); this.wantCount = !!(opts && opts.count); return this; }
    private f(c: string, op: string, v: string) { this.params.push(`${enc(c)}=${op}.${v}`); return this; }
    eq(c: string, v: unknown) { return this.f(c, 'eq', enc(v)); }
    neq(c: string, v: unknown) { return this.f(c, 'neq', enc(v)); }
    gte(c: string, v: unknown) { return this.f(c, 'gte', enc(v)); }
    gt(c: string, v: unknown) { return this.f(c, 'gt', enc(v)); }
    lte(c: string, v: unknown) { return this.f(c, 'lte', enc(v)); }
    lt(c: string, v: unknown) { return this.f(c, 'lt', enc(v)); }
    is(c: string, v: unknown) { return this.f(c, 'is', String(v)); }
    not(c: string, op: string, v: unknown) { return this.f(c, `not.${op}`, String(v)); } // 12/11: .not('x', 'is', null)
    in(c: string, v: unknown[]) { return this.f(c, 'in', enc(list(v))); }
    ilike(c: string, v: string) { return this.f(c, 'ilike', enc(v.replace(/%/g, '*'))); }
    order(c: string, o?: { ascending?: boolean }) { this.params.push(`order=${enc(c)}.${o && o.ascending === false ? 'desc' : 'asc'}`); return this; }
    range(a: number, b: number) { this.rng = [a, b]; return this; }
    limit(n: number) { this.lim = n; return this; }
    insert(): never { throw new Error('somente leitura'); }
    update(): never { throw new Error('somente leitura'); }
    upsert(): never { throw new Error('somente leitura'); }
    delete(): never { throw new Error('somente leitura'); }
    then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return this.run().then(ok, bad);
    }
    private async run(): Promise<Res> {
      const qs = [`select=${enc(this.cols)}`, ...this.params];
      if (this.rng) qs.push(`offset=${this.rng[0]}`, `limit=${this.rng[1] - this.rng[0] + 1}`);
      else if (this.lim != null) qs.push(`limit=${this.lim}`);
      const method = this.head ? 'HEAD' : 'GET';
      const path = `${this.table}?${qs.join('&')}`;
      if (onQuery) onQuery(method, path);
      const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}` };
      if (this.wantCount) headers.Prefer = 'count=exact';
      const res = await fetch(`${url}/rest/v1/${path}`, { method, headers });
      const count = this.wantCount ? Number((res.headers.get('content-range') || '').split('/')[1]) : null;
      if (!res.ok) return { data: null, error: { message: `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}` }, count: null };
      const data = this.head ? null : await res.json();
      return { data, error: null, count: Number.isFinite(count) ? count : null };
    }
  }
  return {
    from: (table: string) => new Q(table),
    rpc: () => { throw new Error('somente leitura'); },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
  };
}
