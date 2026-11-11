// Página do teste no Chrome real do Instagram FASE 2 (scripts/tests/igTrackingChrome.test.ts):
//   /            → a página Instagram (abas; Rastreio) com o Supabase falso (fakeSupabase.ts, dados em window.__DB)
//   /?view=wa    → WhatsApp → Rastreamento (origem Instagram orgânico separada)
// Gravações vão para window.__WRITES; ig_links grava de verdade no banco falso (com apelido/código únicos). A edge
// function "instagram" (lista de posts do "post ligado") é SIMULADA aqui (window.__POSTS). Nada sai do Chrome.
import { createRoot } from 'react-dom/client';
import Instagram from '../../../src/pages/Instagram';
import WaTracking from '../../../src/components/whatsapp/WaTracking';
import { supabase } from '../../../src/lib/supabase';
import { parseRoute, writeRoute } from '../../../src/lib/erpRoute';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as unknown as Any;
g.__WRITES = [];
g.__FN_CALLS = [];
(supabase as Any).auth.getSession = async () => ({ data: { session: { access_token: 'jwt-do-erp', user: { id: 'u1', email: 'teste@loja' } } } });

const from0 = supabase.from.bind(supabase) as (t: string) => Any;
let seq = 0;
(supabase as Any).from = (table: string) => {
  const q = from0(table);
  (['insert', 'update', 'upsert', 'delete'] as const).forEach((op) => { const orig = q[op].bind(q); q[op] = (data?: Any, ...rest: unknown[]) => { g.__WRITES.push({ table, op, data }); return orig(data, ...rest); }; });
  if (table === 'ig_links') {
    const rows = (): Any[] => (g.__DB.ig_links = g.__DB.ig_links || []);
    const dup = (row: Any, id: string | null) => rows().some((r) => r.id !== id && (r.slug === row.slug || r.code === row.code));
    q.insert = (row: Any) => {
      g.__WRITES.push({ table, op: 'insert', data: row });
      return { select: async () => {
        if (dup(row, null)) return { data: null, error: { message: 'duplicate key value violates unique constraint "ig_links_slug_key"' } };
        const r = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date().toISOString(), ...row };
        rows().push(r);
        return { data: [{ ...r }], error: null };
      } };
    };
    q.update = (row: Any) => {
      g.__WRITES.push({ table, op: 'update', data: row });
      return { eq: (_c: string, id: string) => ({ select: async () => {
        if (dup(row, id)) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        const r = rows().find((x) => x.id === id);
        if (r) Object.assign(r, row);
        return { data: r ? [{ ...r }] : [], error: null };
      } }) };
    };
  }
  return q;
};

// edge function "instagram" simulada: só a lista de posts (action media)
const fetch0 = window.fetch.bind(window);
window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url);
  if (!u.includes('/functions/v1/')) return fetch0(url, init);
  const body = init && init.body ? JSON.parse(String(init.body)) : {};
  g.__FN_CALLS.push({ url: u, ...body });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/functions/v1/instagram') && body.action === 'media') return json({ success: true, items: g.__POSTS || [], truncated: false, warnings: [] });
  return json({ success: false, error: 'não simulado' }, 400);
};

const view = new URLSearchParams(location.search).get('view');
writeRoute(parseRoute(location.search) || { page: 'instagram', tab: null });
const el = document.getElementById('root');
if (el) createRoot(el).render(view === 'wa' ? <div style={{ padding: 16 }}><WaTracking /></div> : <Instagram />);
