// Página do teste no Chrome real: só o Gerenciador de Anúncios (novo + "Versão antiga"), com o Supabase falso
// (fakeSupabase.ts no lugar de src/lib/supabase.ts) e a Meta falsa (fetch da edge function ad-manager respondido
// daqui, com window.__META). Toda gravação no Supabase vai para window.__WRITES (o teste confere que só existe a de
// system_config "ads_goals"). Ver scripts/tests/adChrome.test.ts.
import { createRoot } from 'react-dom/client';
import AdDashboard from '../../../src/pages/AdDashboard';
import { supabase } from '../../../src/lib/supabase';
import { loadSystemConfig } from '../../../src/lib/systemConfig';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as unknown as Any;
g.__WRITES = [];
g.__META_CALLS = [];

// gravações: registra tabela, operação e dados (e grava system_config no banco falso, para a releitura)
const from0 = supabase.from.bind(supabase) as (t: string) => Any;
(supabase as Any).from = (table: string) => {
  const q = from0(table);
  (['insert', 'update', 'upsert', 'delete'] as const).forEach((op) => {
    const orig = q[op].bind(q);
    q[op] = (data?: Any, ...rest: unknown[]) => {
      g.__WRITES.push({ table, op, data });
      if (table === 'system_config' && op === 'upsert' && data) {
        const rows: Any[] = g.__DB.system_config = (g.__DB.system_config || []).filter((r: Any) => r.key !== data.key);
        rows.push({ ...data });
      }
      return orig(data, ...rest);
    };
  });
  return q;
};

// Meta falsa: a edge function ad-manager
const fetch0 = window.fetch.bind(window);
window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url);
  if (!u.includes('/functions/v1/ad-manager')) return fetch0(url, init);
  const body = init && init.body ? JSON.parse(String(init.body)) : {};
  g.__META_CALLS.push(body);
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (g.__META_FAIL) return json({ success: false, error: 'Nível inválido' });
  if (body.action === 'dashboard' && body.part === 'metrics') {
    const daily = (g.__META.daily as Any[]).filter((r) => r.date >= body.since && r.date <= body.until);
    return json({ success: true, since: body.since, until: body.until, daily, period: g.__META.period });
  }
  if (body.action === 'dashboard' && body.part === 'creatives') return json({ success: true, ads: (g.__META.creatives as Any[]).filter((c) => body.ids.includes(c.id)) });
  // FASE 2: Meta SIMULADA para as ações (nada sai daqui). __META_ERR_IDS: ids que a "Meta" recusa.
  const errIds: string[] = g.__META_ERR_IDS || [];
  if (body.action === 'toggle') {
    (g.__META_ACTIONS = g.__META_ACTIONS || []).push(body);
    if (errIds.includes(body.objectId)) return json({ success: false, error: '(#200) Simulado: sem permissão para este anúncio' });
    const c = (g.__META.creatives as Any[]).find((x) => x.id === body.objectId);
    if (c) c.status = body.targetStatus;
    return json({ success: true });
  }
  if (body.action === 'update_budget') {
    (g.__META_ACTIONS = g.__META_ACTIONS || []).push(body);
    if (errIds.includes(body.objectId)) return new Response(JSON.stringify({ success: false, error: '(#100) Simulado: orçamento inválido' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    const e = [...(g.__META.campaigns || []), ...(g.__META.adsets || [])].find((x: Any) => x.id === body.objectId);
    if (e) e.daily_budget = Number(body.dailyBudget).toFixed(2);
    return json({ success: true });
  }
  // (com as métricas zeradas que a leitura antiga também devolve, para a "Versão antiga" não quebrar)
  const zero = { spend: '0.00', impressions: '0', reach: '0', clicks: '0', cpm: '0.00', cpc: '0.00', ctr: '0.00', purchases: 0, initiate_checkout: 0, purchase_value: '0.00', cost_per_purchase: '0.00' };
  if (body.level === 'campaign') return json({ success: true, data: (g.__META.campaigns || []).map((c: Any) => ({ ...zero, ...c })) });
  if (body.level === 'adset') return json({ success: true, data: (g.__META.adsets || []).filter((s: Any) => s.parent === body.parentId).map((s: Any) => ({ ...zero, ...s })) });
  return json({ success: true, data: [] }); // versão antiga (list)
};

const el = document.getElementById('root');
// como o App: as configurações (imposto do anúncio) carregam antes da página
loadSystemConfig().finally(() => { if (el) createRoot(el).render(<AdDashboard />); });
