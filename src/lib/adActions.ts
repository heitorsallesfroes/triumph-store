// Gerenciador de Anúncios (FASE 2): ações na Meta com segurança — as regras, puras (sem React nem Supabase), para dar
// para conferir e testar: node scripts/tests/adActions.test.ts
//
// Usa SÓ as actions já publicadas da edge function ad-manager: "toggle" (status ACTIVE/PAUSED de um anúncio) e
// "update_budget" (daily_budget de uma campanha CBO ou de um conjunto). Nada é enviado sem o "Confirmar" da janela
// que mostra a lista exata do que vai mudar.
//
// Proteções: orçamento mínimo R$ 10/dia; no máximo +50% ou −50% por ação; aviso acima de +20% de uma vez (pode
// reiniciar o aprendizado da Meta); nenhuma ação numa campanha que recebeu outra há menos de 1 minuto.

export const MIN_BUDGET = 10;
export const MAX_STEP = 0.5; // ±50% por ação
export const WARN_STEP = 0.2; // aviso acima de +20%
export const COOLDOWN_MS = 60 * 1000;
export const LOG_KEY = 'ads_actions_log';
export const LOG_MAX = 300;
export const BUDGET_STEPS = [-20, -10, 10, 20] as const;

// ── Dono do orçamento de um anúncio ───────────────────────────────────────
// Campanha com daily_budget = CBO (orçamento na campanha); senão, o orçamento está no conjunto.
export interface BudgetEntity { id: string; name: string; daily: number | null; lifetime: number | null }
export interface BudgetOwner {
  level: 'campaign' | 'adset'; id: string; name: string; campaignId: string; campaignName: string;
  daily: number | null; lifetime: number | null;
}
export function budgetOwnerOf(
  ad: { campaignId: string | null; adsetId: string | null; campaign: string | null; adset: string | null },
  campaigns: Map<string, BudgetEntity>, adsets: Map<string, BudgetEntity>,
): BudgetOwner | null {
  if (!ad.campaignId) return null;
  const c = campaigns.get(ad.campaignId);
  const campaignName = (c && c.name) || ad.campaign || 'Campanha';
  if (c && (c.daily != null || c.lifetime != null)) return { level: 'campaign', id: c.id, name: campaignName, campaignId: c.id, campaignName, daily: c.daily, lifetime: c.lifetime };
  const s = ad.adsetId ? adsets.get(ad.adsetId) : undefined;
  if (s && (s.daily != null || s.lifetime != null)) return { level: 'adset', id: s.id, name: s.name || ad.adset || 'Conjunto', campaignId: ad.campaignId, campaignName, daily: s.daily, lifetime: s.lifetime };
  return null;
}
export const ownerLabel = (o: Pick<BudgetOwner, 'level' | 'name'>) => `${o.level === 'campaign' ? 'Campanha' : 'Conjunto'} ${o.name}`;

// donos dos anúncios selecionados, sem repetir (a mesma campanha CBO aparece uma vez só)
export function uniqueOwners(owners: (BudgetOwner | null)[]): BudgetOwner[] {
  const out = new Map<string, BudgetOwner>();
  owners.forEach((o) => { if (o && !out.has(`${o.level}:${o.id}`)) out.set(`${o.level}:${o.id}`, o); });
  return [...out.values()];
}

// ── Cálculo e limites do orçamento ────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
export const budgetByPct = (cur: number, pct: number) => r2(cur * (1 + pct / 100));
export interface BudgetCheck { ok: boolean; error: string | null; warn: string | null; change: number | null }
export function checkBudget(cur: number | null, next: number): BudgetCheck {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (cur == null || !(cur > 0)) return { ok: false, error: 'sem orçamento diário para mudar', warn: null, change: null };
  if (!Number.isFinite(next)) return { ok: false, error: 'valor inválido', warn: null, change: null };
  const change = next / cur - 1;
  if (Math.abs(next - cur) < 0.005) return { ok: false, error: 'o valor é igual ao atual', warn: null, change: 0 };
  if (next < MIN_BUDGET) return { ok: false, error: `abaixo do mínimo de ${brl(MIN_BUDGET)}/dia`, warn: null, change };
  if (change > MAX_STEP + 1e-9) return { ok: false, error: `aumento de ${Math.round(change * 100)}%: o máximo é +50% por ação`, warn: null, change };
  if (change < -MAX_STEP - 1e-9) return { ok: false, error: `redução de ${Math.round(-change * 100)}%: o máximo é −50% por ação`, warn: null, change };
  const warn = change > WARN_STEP + 1e-9 ? `aumento de ${Math.round(change * 100)}% de uma vez: pode reiniciar o aprendizado da Meta` : null;
  return { ok: true, error: null, warn, change };
}

// ── Histórico (system_config "ads_actions_log") ───────────────────────────
export type ActionKind = 'pausar' | 'ativar' | 'orcamento';
export interface LogEntry {
  at: string; who: string; kind: ActionKind; level: 'ad' | 'campaign' | 'adset'; objectId: string; name: string;
  campaignId: string | null; before: string; after: string; ok: boolean; error: string | null;
}
export function parseLog(raw: string | null | undefined): LogEntry[] {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? (v.filter((e) => e && typeof e === 'object' && typeof e.at === 'string') as LogEntry[]) : []; } catch { return []; }
}
// mais recente primeiro, só as últimas 300
export const appendLog = (list: LogEntry[], add: LogEntry[], max = LOG_MAX): LogEntry[] =>
  [...add, ...list].sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);

// campanhas que receberam ação há menos de 1 minuto (o que já foi enviado, deu certo ou não)
export function cooldownLeft(campaignId: string | null, log: Pick<LogEntry, 'at' | 'campaignId'>[], now = Date.now()): number {
  if (!campaignId) return 0;
  let left = 0;
  log.forEach((e) => {
    if (e.campaignId !== campaignId) return;
    const t = Date.parse(e.at);
    if (Number.isFinite(t) && now - t < COOLDOWN_MS && now - t >= -COOLDOWN_MS) left = Math.max(left, COOLDOWN_MS - (now - t));
  });
  return left;
}

// ── Plano: a lista exata do que vai mudar ─────────────────────────────────
export interface AdRef { adId: string; name: string; campaignId: string | null; status: string | null }
export interface PlanItem {
  key: string; kind: ActionKind; level: 'ad' | 'campaign' | 'adset'; objectId: string; name: string; campaignId: string | null;
  before: string; after: string; // texto para a janela e para o histórico
  status?: 'ACTIVE' | 'PAUSED'; budget?: number; // o que vai para a Meta
  blocked: string | null; warn: string | null;
}
export interface Plan { title: string; items: PlanItem[]; ready: PlanItem[]; blocked: PlanItem[]; warnings: string[]; lines: string[] }
const money = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}/dia`);
export const STATUS_TXT: Record<string, string> = { ACTIVE: 'ativo', PAUSED: 'pausado' };

function finish(title: string, items: PlanItem[], log: LogEntry[], now: number): Plan {
  items.forEach((it) => {
    if (it.blocked) return;
    const left = cooldownLeft(it.campaignId, log, now);
    if (left > 0) it.blocked = `a campanha recebeu outra ação há menos de 1 minuto (espere ${Math.ceil(left / 1000)} s)`;
  });
  const ready = items.filter((i) => !i.blocked);
  const blocked = items.filter((i) => i.blocked);
  const lines: string[] = [];
  const toggles = ready.filter((i) => i.kind !== 'orcamento');
  (['pausar', 'ativar'] as const).forEach((k) => {
    const l = toggles.filter((i) => i.kind === k);
    if (l.length) lines.push(`${k === 'pausar' ? 'Pausar' : 'Ativar'} ${l.length} anúncio${l.length === 1 ? '' : 's'}: ${l.map((i) => i.name).join(', ')}`);
  });
  ready.filter((i) => i.kind === 'orcamento').forEach((i) => lines.push(`${i.name}: ${i.before} → ${i.after}`));
  return { title, items, ready, blocked, warnings: ready.map((i) => i.warn).filter((w): w is string => !!w), lines };
}

// Pausar / Ativar anúncios (os que já estão no status pedido ficam de fora, com o motivo)
export function planToggle(ads: AdRef[], target: 'ACTIVE' | 'PAUSED', log: LogEntry[], now = Date.now()): Plan {
  const kind: ActionKind = target === 'PAUSED' ? 'pausar' : 'ativar';
  const seen = new Set<string>();
  const items = ads.filter((a) => { if (seen.has(a.adId)) return false; seen.add(a.adId); return true; }).map((a): PlanItem => ({
    key: `ad:${a.adId}`, kind, level: 'ad', objectId: a.adId, name: a.name, campaignId: a.campaignId,
    before: a.status ? STATUS_TXT[a.status] || a.status.toLowerCase() : '—', after: STATUS_TXT[target], status: target,
    blocked: !/^\d{5,25}$/.test(a.adId) ? 'anúncio sem id da Meta' : a.status === target ? `já está ${STATUS_TXT[target]}` : a.status === 'ARCHIVED' || a.status === 'DELETED' ? 'anúncio arquivado/excluído' : null,
    warn: null,
  }));
  return finish(`${kind === 'pausar' ? 'Pausar' : 'Ativar'} anúncio${items.length === 1 ? '' : 's'}`, items, log, now);
}

// Orçamento: ±X% (um ou vários donos) ou "Definir valor" (um dono)
export function planBudget(owners: BudgetOwner[], change: { pct: number } | { value: number }, log: LogEntry[], now = Date.now()): Plan {
  const items = uniqueOwners(owners).map((o): PlanItem => {
    const next = o.daily == null ? NaN : 'pct' in change ? budgetByPct(o.daily, change.pct) : r2(change.value);
    const chk = o.lifetime != null && o.daily == null ? { ok: false, error: 'orçamento total (vitalício): mude na Meta', warn: null } : checkBudget(o.daily, next);
    return {
      key: `${o.level}:${o.id}`, kind: 'orcamento', level: o.level, objectId: o.id, name: ownerLabel(o), campaignId: o.campaignId,
      before: money(o.daily), after: Number.isFinite(next) ? money(next) : '—', budget: Number.isFinite(next) ? next : undefined,
      blocked: chk.ok ? null : chk.error, warn: chk.ok && chk.warn ? `${ownerLabel(o)}: ${chk.warn}` : null,
    };
  });
  const title = 'pct' in change ? `Orçamento ${change.pct > 0 ? '+' : '−'}${Math.abs(change.pct)}%` : 'Definir orçamento';
  return finish(title, items, log, now);
}

// resultado de um envio → linha do histórico
export const logOf = (it: PlanItem, who: string, at: string, ok: boolean, error: string | null): LogEntry => ({
  at, who, kind: it.kind, level: it.level, objectId: it.objectId, name: it.name, campaignId: it.campaignId, before: it.before, after: it.after, ok, error,
});
export const KIND_LABEL: Record<ActionKind, string> = { pausar: 'Pausar', ativar: 'Ativar', orcamento: 'Orçamento' };
