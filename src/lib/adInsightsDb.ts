// Leitura do Gerenciador de Anúncios novo. Nada aqui grava no ERP, exceto as metas (system_config "ads_goals") e o
// histórico de ações (system_config "ads_actions_log"). O token da Meta fica na edge function ad-manager.
// FASE 2: ações na Meta só pelas actions já publicadas "toggle" e "update_budget", e só depois do "Confirmar".
// Cache de 5 minutos por período (o botão Atualizar ignora o cache).
import { supabase } from './supabase';
import { loadTracking, type TrackLoad } from './waTrackingDb';
import { DEFAULT_GOALS, goalsJson, metaFetchWindow, parseGoals, type Goals, type MetaCreative, type MetaDaily, type MetaPeriod, type SaleCost, type Window } from './adInsights';
import { LOG_KEY, appendLog, parseLog, type BudgetEntity, type LogEntry, type PlanItem } from './adActions';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const CACHE_MS = 5 * 60 * 1000;
export const GOALS_KEY = 'ads_goals';

async function callAdManager<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, {
    method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let data: { success?: boolean; error?: string } & Record<string, unknown>;
  try { data = await res.json(); } catch { throw new Error('A função ad-manager não respondeu'); }
  if (!data || !data.success) throw new Error((data && data.error) || 'Erro ao ler a Meta');
  return data as unknown as T;
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fresh: boolean, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await run();
  cache.set(key, { at: Date.now(), value });
  return value;
}
export const cacheAge = (key: string): number | null => { const h = cache.get(key); return h ? h.at : null; };

// ── Meta ──
export interface MetaLoad { daily: MetaDaily[]; period: MetaPeriod[] }
export function loadMeta(r: { cur: Window; prev: Window }, fresh = false): Promise<MetaLoad> {
  const w = metaFetchWindow(r);
  return cached(`meta|${w.since}|${w.until}|${w.periodSince}`, fresh, async () => {
    const d = await callAdManager<{ daily: MetaDaily[]; period: MetaPeriod[] }>({ action: 'dashboard', part: 'metrics', ...w });
    return { daily: d.daily || [], period: d.period || [] };
  });
}
export function loadCreatives(ids: string[], fresh = false): Promise<MetaCreative[]> {
  const list = [...new Set(ids.filter((id) => /^\d{5,25}$/.test(id)))].sort();
  if (!list.length) return Promise.resolve([]);
  return cached(`criativos|${list.join(',')}`, fresh, async () => (await callAdManager<{ ads: MetaCreative[] }>({ action: 'dashboard', part: 'creatives', ids: list })).ads || []);
}

// ── ERP: conversas/vendas (a carga do Rastreamento) do período anterior até o fim do atual ──
export function loadErp(r: { cur: Window; prev: Window }, fresh = false): Promise<TrackLoad> {
  const w = { from: r.prev.from, to: r.cur.to, fromDay: r.prev.fromDay, toDay: r.cur.toDay, days: r.prev.days + r.cur.days };
  return cached(`erp|${w.fromDay}|${w.toDay}`, fresh, () => loadTracking(w));
}

// ── Início do rastreio conversa → anúncio: o 1º registro de wa_ad_attribution / wa_leads com anúncio (só leitura) ──
let trackStartCache: { at: number; value: number | null } | null = null;
export async function loadTrackStart(fresh = false): Promise<number | null> {
  if (!fresh && trackStartCache && Date.now() - trackStartCache.at < CACHE_MS) return trackStartCache.value;
  const first = async (run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<number | null> => {
    try {
      const { data, error } = await run();
      const row = !error && Array.isArray(data) ? (data[0] as { first_message_at?: string | null } | undefined) : undefined;
      const t = row && row.first_message_at ? Date.parse(row.first_message_at) : NaN;
      return Number.isFinite(t) ? t : null;
    } catch { return null; }
  };
  const [attr, lead] = await Promise.all([
    first(() => supabase.from('wa_ad_attribution').select('first_message_at').not('first_message_at', 'is', null).order('first_message_at', { ascending: true }).limit(1)),
    first(() => supabase.from('wa_leads').select('first_message_at').eq('origin', 'anuncio').not('first_message_at', 'is', null).order('first_message_at', { ascending: true }).limit(1)),
  ]);
  const list = [attr, lead].filter((t): t is number => t != null);
  const value = list.length ? Math.min(...list) : null;
  trackStartCache = { at: Date.now(), value };
  return value;
}

// custo do produto (total_cost − entrega) e modelos vendidos de cada venda, em lotes
export async function loadSaleCosts(ids: string[]): Promise<Map<string, SaleCost>> {
  const out = new Map<string, SaleCost>();
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += 150) {
    const part = list.slice(i, i + 150);
    const [salesRes, itemsRes] = await Promise.all([
      supabase.from('sales').select('id, total_cost, delivery_fee, delivery_cost').in('id', part),
      supabase.from('sale_items').select('sale_id, quantity, products(model, color, category)').in('sale_id', part),
    ]);
    const items = (itemsRes.data || []) as unknown as { sale_id: string; quantity: number; products: { model?: string; color?: string; category?: string } | null }[];
    ((salesRes.data || []) as unknown as { id: string; total_cost: number | null; delivery_fee: number | null; delivery_cost: number | null }[]).forEach((s) => {
      const n = (v: unknown) => Number(v || 0);
      const cost = s.total_cost == null ? null : Math.max(0, n(s.total_cost) - n(s.delivery_fee) - n(s.delivery_cost));
      out.set(s.id, { id: s.id, productCost: cost, models: [] });
    });
    items.forEach((it) => {
      const s = out.get(it.sale_id);
      const p = it.products;
      if (!s || !p || (p.category && p.category !== 'smartwatch')) return;
      const name = [p.model, p.color].filter(Boolean).join(' - ') || 'Produto';
      const cur = s.models.find((m) => m.name === name);
      if (cur) cur.qty += Number(it.quantity) || 1; else s.models.push({ name, qty: Number(it.quantity) || 1 });
    });
  }
  return out;
}

// ── Metas (system_config "ads_goals": lê e grava SÓ essa chave) ──
export async function loadGoals(): Promise<{ goals: Goals; saved: boolean }> {
  try {
    const { data } = await supabase.from('system_config').select('key, value').eq('key', GOALS_KEY).maybeSingle();
    const raw = data && (data as { value?: string }).value;
    return raw ? { goals: parseGoals(raw), saved: true } : { goals: { ...DEFAULT_GOALS }, saved: false };
  } catch { return { goals: { ...DEFAULT_GOALS }, saved: false }; }
}
export async function saveGoals(g: Goals): Promise<void> {
  const { error } = await supabase.from('system_config').upsert({ key: GOALS_KEY, value: goalsJson(g), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ── FASE 2: ações na Meta (só as actions já publicadas: "toggle" e "update_budget") ──
// Orçamentos pela leitura antiga da função (level "campaign" / "adset"): campanha com daily_budget = CBO; sem
// orçamento na campanha, os conjuntos dela (os que tiveram gasto no período).
export interface Budgets { campaigns: Map<string, BudgetEntity>; adsets: Map<string, BudgetEntity> }
type ListRow = { id: string; name?: string | null; daily_budget?: string | null; lifetime_budget?: string | null };
const entityOf = (r: ListRow): BudgetEntity => {
  const n = (v: string | null | undefined) => { const x = v == null ? NaN : Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  return { id: String(r.id), name: r.name || '', daily: n(r.daily_budget), lifetime: n(r.lifetime_budget) };
};
export function loadBudgets(w: Window, campaignIds: string[], fresh = false): Promise<Budgets> {
  const ids = [...new Set(campaignIds.filter((id) => /^\d{5,25}$/.test(id)))].sort();
  return cached(`orcamentos|${w.fromDay}|${w.toDay}|${ids.join(',')}`, fresh, async () => {
    const dateRange = { since: w.fromDay, until: w.toDay };
    const camp = await callAdManager<{ data: ListRow[] }>({ level: 'campaign', dateRange, parentId: null, statusFilter: 'all' });
    const campaigns = new Map((camp.data || []).map((r) => [String(r.id), entityOf(r)]));
    const adsets = new Map<string, BudgetEntity>();
    const noBudget = ids.filter((id) => { const c = campaigns.get(id); return !c || (c.daily == null && c.lifetime == null); });
    await Promise.all(noBudget.map(async (id) => {
      try {
        const s = await callAdManager<{ data: ListRow[] }>({ level: 'adset', dateRange, parentId: id, statusFilter: 'all' });
        (s.data || []).forEach((r) => adsets.set(String(r.id), entityOf(r)));
      } catch { /* sem conjuntos: o cartão mostra "orçamento não encontrado" */ }
    }));
    return { campaigns, adsets };
  });
}
// envia UM item já confirmado; erro da Meta → Error com a mensagem dela
export async function sendPlanItem(it: PlanItem): Promise<void> {
  if (it.kind === 'orcamento') {
    if (it.budget == null) throw new Error('sem valor');
    await callAdManager({ action: 'update_budget', objectId: it.objectId, dailyBudget: it.budget });
  } else {
    await callAdManager({ action: 'toggle', objectId: it.objectId, targetStatus: it.status });
  }
}
// quem está logado (e-mail do Supabase Auth)
export async function whoAmI(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); return (data && data.session && data.session.user && data.session.user.email) || 'usuário do ERP'; } catch { return 'usuário do ERP'; }
}
// histórico: system_config "ads_actions_log" (lê e grava SÓ essa chave; últimas 300)
export async function loadActionsLog(): Promise<LogEntry[]> {
  try {
    const { data } = await supabase.from('system_config').select('key, value').eq('key', LOG_KEY).maybeSingle();
    return parseLog(data && (data as { value?: string }).value);
  } catch { return []; }
}
export async function appendActionsLog(add: LogEntry[]): Promise<LogEntry[]> {
  const cur = await loadActionsLog(); // relê antes de gravar (outra aba pode ter gravado)
  const next = appendLog(cur, add);
  const { error } = await supabase.from('system_config').upsert({ key: LOG_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return next;
}
