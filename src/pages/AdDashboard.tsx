// Gerenciador de Anúncios novo: painel de decisão com a venda REAL do ERP ligada ao anúncio (conversa → anúncio → venda).
// FASE 2: sem "lucro" (categorias e cores pelo ROAS e custo por venda) e ações na Meta — Pausar/Ativar anúncio e
// orçamento da campanha (CBO) ou do conjunto — só pelas actions já publicadas "toggle" e "update_budget" da edge
// function, SEMPRE depois do "Confirmar" na janela com a lista exata do que vai mudar (regras: src/lib/adActions.ts).
// Histórico em system_config "ads_actions_log". A versão antiga (src/pages/AdManager.tsx) continua em "Versão antiga" (?pagina=anuncios&aba=antiga).
// Regras: src/lib/adInsights.ts · leitura: src/lib/adInsightsDb.ts · README: src/pages/AdDashboard.README.md
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Pause, Play, RefreshCw, Settings2, X } from 'lucide-react';
import AdManager from './AdManager';
import { getAdTaxRate } from '../lib/adTax';
import { initialTab, writeTab } from '../lib/erpRoute';
import { useErpRefresh } from '../lib/erpRefresh';
import { buildConversations, businessHoursOf, adsManagerUrl, type TrackModel, type TrackSaleRow } from '../lib/waTracking';
import {
  AD_PERIODS, ATTRIB_LABEL, CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_GOALS, TIER_COLOR, TIER_LABEL,
  adStartOf, attributeSales, dayBR, dayFull, igOrganicSaleIds, organicSaleIds, periodSales, roasTrio, salesTxt, startsBeforeTracking,
  adRanges, buildAdCards, categoryBoxes, deltaOf, erpByAd, hourMap, metaCheck, moneySplit, replyBands, roasTier, suggestGoals, totalsOf,
  type AdCard, type AdPeriod, type AttribMode, type Attribution, type Category, type Goals, type MetaCreative, type RoasTrio, type SaleCost, type Window,
} from '../lib/adInsights';
import {
  appendActionsLog, loadActionsLog, loadBudgets, loadCreatives, loadErp, loadGoals, loadMeta, loadSaleCosts, loadTrackStart, saveGoals, sendPlanItem, whoAmI,
  type Budgets, type MetaLoad,
} from '../lib/adInsightsDb';
import {
  BUDGET_STEPS, KIND_LABEL, MIN_BUDGET, appendLog, budgetOwnerOf, logOf, planBudget, planToggle, uniqueOwners,
  type AdRef, type BudgetOwner, type LogEntry, type Plan,
} from '../lib/adActions';
import { spDay } from '../lib/waPanel';

const ORANGE = '#f97316';
const PAGE = 'ad-manager';
const bd = 'var(--border-main)';
const box: React.CSSProperties = { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderTopColor: bd, borderRightColor: bd, borderBottomColor: bd, borderLeftColor: bd, borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-main)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chip = (on: boolean): React.CSSProperties => ({ ...btn, padding: '6px 12px', borderRadius: 999, ...(on ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : {}) });
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };

const fmtMoney = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2, minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }));
const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('pt-BR'));
const fmtX = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(1).replace('.', ',')}×`);
const fmtPct = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(d).replace('.', ',')}%`);
const fmtDec = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d).replace('.', ','));
function fmtMinutes(m: number | null): string {
  if (m == null) return '—';
  const v = Math.round(m);
  if (v < 60) return `${v} min`;
  if (v < 1440) return `${Math.floor(v / 60)} h${v % 60 ? ` ${v % 60} min` : ''}`;
  const d = Math.floor(v / 1440); const h = Math.round((v % 1440) / 60);
  return `${d} d${h ? ` ${h} h` : ''}`;
}
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Arquivado', DELETED: 'Excluído', WITH_ISSUES: 'Com problema', IN_PROCESS: 'Em análise', PENDING_REVIEW: 'Em análise', DISAPPROVED: 'Reprovado' };

const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };

// ── Página: nova (padrão) ou a antiga ─────────────────────────────────────
export default function AdDashboard() {
  const [old, setOld] = useState(() => initialTab(PAGE, ['novo', 'antiga'] as const, 'novo') === 'antiga');
  const go = (o: boolean) => { setOld(o); writeTab(PAGE, o ? 'antiga' : null); };
  if (old) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button type="button" style={btn} onClick={() => go(false)} data-testid="ads-new-link"><ArrowLeft size={14} /> Voltar ao Gerenciador novo</button>
        </div>
        <AdManager />
      </div>
    );
  }
  return <Dashboard onOld={() => go(true)} />;
}

interface Loaded {
  key: string; at: number; ranges: { cur: Window; prev: Window }; meta: MetaLoad; metaError: string | null;
  model: TrackModel; costs: Map<string, SaleCost>; missing: string[]; sales: TrackSaleRow[];
}

function Dashboard({ onOld }: { onOld: () => void }) {
  // padrão: 7 dias, nunca antes do início do rastreio (autoClamp até escolher outro período)
  const [period, setPeriodRaw] = useState<AdPeriod>('7');
  const [autoClamp, setAutoClamp] = useState(true);
  const setPeriod = (p: AdPeriod) => { setAutoClamp(false); setPeriodRaw(p); };
  const [attrib, setAttrib] = useState<AttribMode>(() => (store.get('ads:atrib') === 'identificado' ? 'identificado' : 'estimado'));
  const [trackStart, setTrackStart] = useState<number | null | undefined>(undefined); // undefined = carregando
  const [custom, setCustom] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [mode, setMode] = useState<'simples' | 'completo'>(() => (store.get('ads:modo') === 'completo' ? 'completo' : 'simples'));
  const [filter, setFilter] = useState<Category | null>(null);
  const [goalsState, setGoalsState] = useState<{ goals: Goals; saved: boolean; suggested: boolean } | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);
  const [creatives, setCreatives] = useState<Map<string, MetaCreative>>(new Map());
  const [tick, setTick] = useState(0);
  const freshRef = useRef(false);
  // FASE 2: ações
  const [tab, setTab] = useState<'painel' | 'historico'>('painel');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [budgets, setBudgets] = useState<Budgets | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; error: string | null }> | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [metaTick, setMetaTick] = useState(0); // recarrega status e orçamento depois de enviar

  useEffect(() => { store.set('ads:atrib', attrib); }, [attrib]);
  useEffect(() => { store.set('ads:modo', mode); }, [mode]);

  // início do rastreio conversa → anúncio (1º registro de wa_ad_attribution / wa_leads com anúncio)
  useEffect(() => {
    let alive = true;
    loadTrackStart(tick > 0).then((t) => { if (alive) setTrackStart(t); }).catch(() => { if (alive) setTrackStart(null); });
    return () => { alive = false; };
  }, [tick]);
  const trackStartDay = trackStart == null ? null : spDay(trackStart);
  const ranges = useMemo(() => {
    const r = adRanges(period, Date.now(), custom);
    if (autoClamp && period === '7' && trackStartDay && startsBeforeTracking(r.cur, trackStartDay) && trackStartDay <= r.cur.toDay) return adRanges('custom', Date.now(), { start: trackStartDay, end: r.cur.toDay });
    return r;
  }, [period, custom, tick, autoClamp, trackStartDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const goSinceTracking = () => { if (!trackStartDay) return; setPeriod('custom'); setCustom({ start: trackStartDay, end: spDay(Date.now()) }); };
  const key = `${ranges.cur.fromDay}|${ranges.cur.toDay}`;
  const customReady = period !== 'custom' || (!!custom.start && !!custom.end);

  // metas: as salvas (system_config "ads_goals") ou as faixas padrão + sugestão pela média dos últimos 30 dias
  useEffect(() => {
    let alive = true;
    loadGoals().then((g) => { if (alive) setGoalsState({ ...g, suggested: false }); });
    return () => { alive = false; };
  }, []);

  // carga: topo primeiro (Meta + ERP + custos), depois os cartões e as miniaturas
  useEffect(() => {
    if (!customReady || trackStart === undefined) return;
    let alive = true;
    const fresh = freshRef.current; freshRef.current = false;
    setLoading(true); setError(null); setCardsReady(false);
    (async () => {
      let metaError: string | null = null;
      const [meta, erp] = await Promise.all([
        loadMeta(ranges, fresh).catch((e: Error) => { metaError = e.message; return { daily: [], period: [] } as MetaLoad; }),
        loadErp(ranges, fresh),
      ]);
      const model = buildConversations(erp.input, businessHoursOf(erp.settings));
      // custo: das vendas ligadas a anúncio e de TODAS as vendas do período (modo Estimado / ROAS geral)
      const ids = [...erpByAd(model, ranges.cur).values(), ...erpByAd(model, ranges.prev).values()].flatMap((a) => a.saleIds)
        .concat(periodSales(erp.input.sales, ranges.cur).map((s) => s.id), periodSales(erp.input.sales, ranges.prev).map((s) => s.id));
      const costs = await loadSaleCosts(ids).catch(() => new Map<string, SaleCost>());
      if (!alive) return;
      setData({ key, at: Date.now(), ranges, meta, metaError, model, costs, missing: erp.missing, sales: erp.input.sales });
      setLoading(false);
      setTimeout(() => { if (alive) setCardsReady(true); }, 0);
    })().catch((e: Error) => { if (alive) { setError(e.message || 'Não consegui carregar'); setLoading(false); } });
    return () => { alive = false; };
  }, [key, customReady, tick, trackStart === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { freshRef.current = true; setTick((t) => t + 1); };
  useErpRefresh(refresh);

  // sugestão de metas (sem metas salvas): média dos últimos 30 dias
  useEffect(() => {
    if (!goalsState || goalsState.saved || goalsState.suggested) return;
    let alive = true;
    (async () => {
      const r30 = adRanges('30');
      const [meta, erp] = await Promise.all([loadMeta(r30).catch(() => ({ daily: [], period: [] } as MetaLoad)), loadErp(r30)]);
      const model = buildConversations(erp.input, businessHoursOf(erp.settings));
      const costs = await loadSaleCosts([...erpByAd(model, r30.cur).values()].flatMap((a) => a.saleIds)).catch(() => new Map<string, SaleCost>());
      const t = totalsOf(model, meta.daily, costs, getAdTaxRate(), r30.cur);
      if (alive) setGoalsState((cur) => (cur && !cur.saved ? { goals: suggestGoals(t, cur.goals), saved: false, suggested: true } : cur));
    })().catch(() => { if (alive) setGoalsState((cur) => (cur ? { ...cur, suggested: true } : cur)); });
    return () => { alive = false; };
  }, [goalsState]);

  const goals = goalsState ? goalsState.goals : DEFAULT_GOALS;
  const taxRate = getAdTaxRate();
  const ready = !!data && data.key === key;
  // vendas sem origem repartidas pelas conversas de cada anúncio (modo Estimado)
  const att = useMemo(() => {
    if (!ready || !data) return null;
    // 12/11: as vendas do Instagram orgânico têm origem e não são de anúncio: ficam fora da repartição
    // 12/11: Orgânico / sem conversa e "Anúncio não identificado" também ficam fora da repartição
    const of = (w: Window): Attribution => { const ps = periodSales(data.sales, w); return attributeSales(erpByAd(data.model, w), ps, data.costs, trackStart ?? null, igOrganicSaleIds(data.model, w), organicSaleIds(data.model, ps)); };
    return { cur: of(data.ranges.cur), prev: of(data.ranges.prev) };
  }, [ready, data, trackStart]);
  const totals = useMemo(() => (ready && data && att ? {
    cur: totalsOf(data.model, data.meta.daily, data.costs, taxRate, data.ranges.cur, { mode: attrib, attribution: att.cur }),
    prev: totalsOf(data.model, data.meta.daily, data.costs, taxRate, data.ranges.prev, { mode: attrib, attribution: att.prev }),
  } : null), [ready, data, taxRate, att, attrib]);
  const trio = useMemo(() => (ready && data && att ? { cur: roasTrio(data.meta.daily, taxRate, data.ranges.cur, att.cur), prev: roasTrio(data.meta.daily, taxRate, data.ranges.prev, att.prev) } : null), [ready, data, taxRate, att]);
  const cards = useMemo(() => (ready && data && cardsReady && att ? buildAdCards({ model: data.model, meta: data.meta.daily, period: data.meta.period, costs: data.costs, taxRate, goals, mode: attrib, attribution: att.cur }, data.ranges.cur) : null), [ready, data, cardsReady, taxRate, goals, att, attrib]);

  // miniaturas / vídeos / prévia dos anúncios do período
  const adIds = useMemo(() => (cards ? cards.map((c) => c.adId).filter((id): id is string => !!id && /^\d+$/.test(id)).sort().join(',') : ''), [cards]);
  useEffect(() => {
    if (!adIds) return;
    let alive = true;
    loadCreatives(adIds.split(','), metaTick > 0).then((l) => { if (alive) setCreatives(new Map(l.map((c) => [c.id, c]))); }).catch(() => {});
    return () => { alive = false; };
  }, [adIds, metaTick]);

  // orçamentos: campanha (CBO) ou conjunto dono de cada anúncio
  const campaignIds = useMemo(() => (cards ? [...new Set(cards.map((c) => c.campaignId).filter((id): id is string => !!id))].sort().join(',') : ''), [cards]);
  useEffect(() => {
    if (!campaignIds || !data) return;
    let alive = true;
    loadBudgets(data.ranges.cur, campaignIds.split(','), metaTick > 0).then((b) => { if (alive) setBudgets(b); }).catch(() => { if (alive) setBudgets({ campaigns: new Map(), adsets: new Map() }); });
    return () => { alive = false; };
  }, [campaignIds, metaTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let alive = true; loadActionsLog().then((l) => { if (alive) setLog(l); }); return () => { alive = false; }; }, []);

  const ownerOf = (c: AdCard): BudgetOwner | null => (budgets ? budgetOwnerOf(c, budgets.campaigns, budgets.adsets) : null);
  const refOf = (c: AdCard): AdRef => ({ adId: c.adId || '', name: c.name, campaignId: c.campaignId, status: (c.adId && creatives.get(c.adId)?.status) || null });
  const pickCards = (keys: Set<string>) => (cards || []).filter((c) => keys.has(c.key));
  const ask = (p: Plan) => { setResults(null); setPlan(p); };
  const act = {
    toggle: (list: AdCard[], target: 'ACTIVE' | 'PAUSED') => ask(planToggle(list.map(refOf), target, log)),
    pct: (owners: (BudgetOwner | null)[], pct: number) => ask(planBudget(uniqueOwners(owners), { pct }, log)),
    set: (owner: BudgetOwner, value: number) => ask(planBudget([owner], { value }, log)),
  };
  // envio: SÓ depois do "Confirmar"; um item por vez; resultado item por item; histórico; recarrega status/orçamento
  const confirmPlan = async () => {
    if (!plan || sending || !plan.ready.length) return;
    setSending(true);
    const out: Record<string, { ok: boolean; error: string | null }> = {};
    const who = await whoAmI();
    const entries: LogEntry[] = [];
    for (const it of plan.ready) {
      const at = new Date().toISOString();
      try { await sendPlanItem(it); out[it.key] = { ok: true, error: null }; } catch (e) { out[it.key] = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
      entries.push(logOf(it, who, at, out[it.key].ok, out[it.key].error));
      setResults({ ...out });
    }
    setLog((cur) => appendLog(cur, entries));
    try { setLog(await appendActionsLog(entries)); setLogError(null); } catch (e) { setLogError(e instanceof Error ? e.message : 'não consegui gravar o histórico'); }
    setSending(false);
    setMetaTick((t) => t + 1);
  };

  return (
    <div className="adx" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1400, margin: '0 auto' }}>
      <style>{CSS}</style>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Gerenciador de Anúncios</h1>
          <p style={{ margin: '4px 0 0', ...muted, fontSize: 13 }}>Venda real do ERP ligada a cada anúncio · ações na Meta só depois de você confirmar</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={{ ...btn, borderColor: 'transparent', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'underline' }} onClick={onOld} data-testid="ads-old-link">Versão antiga</button>
          <div role="group" aria-label="Modo" style={{ display: 'inline-flex', border: '1px solid var(--border-main)', borderRadius: 999, overflow: 'hidden' }}>
            {(['simples', 'completo'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`ads-mode-${m}`}
                style={{ padding: '6px 12px', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === m ? ORANGE : 'transparent', color: mode === m ? '#fff' : 'var(--text-primary)' }}>
                {m === 'simples' ? 'Simples' : 'Completo'}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Vendas" style={{ display: 'inline-flex', border: '1px solid var(--border-main)', borderRadius: 999, overflow: 'hidden' }}
            title="Estimado: reparte as vendas sem origem entre os anúncios pelas conversas de cada um. Só identificado: só as vendas ligadas com certeza.">
            {(['estimado', 'identificado'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={attrib === m} onClick={() => setAttrib(m)} data-testid={`ads-attrib-${m}`}
                style={{ padding: '6px 12px', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: attrib === m ? '#3b82f6' : 'transparent', color: attrib === m ? '#fff' : 'var(--text-primary)' }}>
                {ATTRIB_LABEL[m]}
              </button>
            ))}
          </div>
          <button type="button" style={btn} onClick={() => setShowGoals(true)} aria-label="Metas" title="Metas" data-testid="ads-goals-btn"><Settings2 size={15} /> Metas</button>
          <button type="button" style={btn} onClick={refresh} disabled={loading} data-testid="ads-refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          {data && <span style={muted} data-testid="ads-updated">Atualizado às {hhmm(data.at)}</span>}
        </div>
      </header>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Período">
        {AD_PERIODS.map(([p, label]) => (
          <button key={p} type="button" style={chip(period === p)} aria-pressed={period === p} onClick={() => setPeriod(p)} data-testid={`ads-period-${p}`}>{label}</button>
        ))}
        {period === 'custom' && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" aria-label="De" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} style={dateInput} />
            <span style={muted}>até</span>
            <input type="date" aria-label="Até" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} style={dateInput} />
          </span>
        )}
        {ready && data && <span style={{ ...muted, marginLeft: 4 }}>{dayLabel(data.ranges.cur)} · comparado com {dayLabel(data.ranges.prev)}</span>}
      </div>

      {error && <Banner kind="error">Não consegui carregar: {error}</Banner>}
      {ready && data && data.metaError && (
        <Banner kind="warn">
          Não consegui ler a Meta ({data.metaError}). Os números do ERP aparecem; gasto, ROAS e custos ficam zerados.
          {/ação|Nível inválido|404|not found/i.test(data.metaError) ? ' A função ad-manager precisa ser publicada de novo com a leitura do painel (supabase functions deploy ad-manager).' : ''}
        </Banner>
      )}
      {ready && data && trackStartDay && startsBeforeTracking(data.ranges.cur, trackStartDay) && (
        <Banner kind="warn">
          <span data-testid="ads-track-warn">O rastreio de anúncios começou em {dayBR(trackStartDay)} — antes disso as vendas não estão ligadas a anúncios.</span>{' '}
          <button type="button" style={{ ...btn, padding: '4px 10px', marginLeft: 6 }} onClick={goSinceTracking} data-testid="ads-track-use">Usar desde {dayBR(trackStartDay)}</button>
        </Banner>
      )}
      {ready && data && data.missing.length > 0 && <Banner kind="info">Ainda sem: {data.missing.join(', ')}. O resto já funciona.</Banner>}
      {logError && <Banner kind="warn">As ações foram enviadas, mas não consegui gravar o histórico ({logError}).</Banner>}

      <div role="tablist" aria-label="Abas" style={{ display: 'flex', gap: 6 }}>
        <button type="button" role="tab" aria-selected={tab === 'painel'} style={chip(tab === 'painel')} onClick={() => setTab('painel')} data-testid="ads-tab-painel">Painel</button>
        <button type="button" role="tab" aria-selected={tab === 'historico'} style={chip(tab === 'historico')} onClick={() => setTab('historico')} data-testid="ads-tab-historico">Histórico de ações{log.length ? ` (${log.length})` : ''}</button>
      </div>

      {tab === 'historico' ? <ActionsLog log={log} /> : (<>

      <RoasRow trio={trio} loading={!ready || !trio} />
      <Top totals={totals} loading={!ready || !totals} attrib={attrib} />

      {cards ? (
        <>
          <Decisions cards={cards} filter={filter} setFilter={setFilter} />
          <MoneyBar cards={cards} />
          <CardsList cards={cards} filter={filter} setFilter={setFilter} creatives={creatives}
            selected={selected} setSelected={setSelected} ownerOf={ownerOf} budgetsReady={!!budgets} busy={sending || !!plan} act={act} />
          {mode === 'completo' && data && (
            <>
              <MetaCheck cards={cards} />
              <HourMap model={data.model} w={data.ranges.cur} />
              <TimeToSale cards={cards} model={data.model} w={data.ranges.cur} />
            </>
          )}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }} aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="adx-skel" style={{ height: 96 }} />)}
        </div>
      )}
      </>)}

      {cards && selected.size > 0 && tab === 'painel' && (
        <BulkBar count={pickCards(selected).length} busy={sending || !!plan} onClear={() => setSelected(new Set())}
          onToggle={(t) => act.toggle(pickCards(selected), t)} onPct={(p) => act.pct(pickCards(selected).map(ownerOf), p)} />
      )}
      {plan && <ConfirmDialog plan={plan} sending={sending} results={results} onConfirm={confirmPlan} onClose={() => { if (!sending) { setPlan(null); setResults(null); } }} />}

      {showGoals && goalsState && (
        <GoalsDialog value={goalsState.goals} saved={goalsState.saved} onClose={() => setShowGoals(false)}
          onSaved={(g) => { setGoalsState({ goals: g, saved: true, suggested: true }); setShowGoals(false); }} />
      )}
    </div>
  );
}

const dateInput: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-main)', background: 'var(--bg-inner)', color: 'var(--text-primary)', fontSize: 13 };
const dayLabel = (w: Window) => { const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`; return w.fromDay === w.toDay ? f(w.fromDay) : `${f(w.fromDay)} a ${f(w.toDay)}`; };

function Banner({ kind, children }: { kind: 'error' | 'warn' | 'info'; children: React.ReactNode }) {
  const c = kind === 'error' ? '#ef4444' : kind === 'warn' ? ORANGE : '#3b82f6';
  return <div role={kind === 'error' ? 'alert' : 'status'} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${c}55`, background: `${c}14`, color: 'var(--text-primary)', fontSize: 13 }}>{children}</div>;
}

// ── Topo "Como estou?" ────────────────────────────────────────────────────
function Delta({ cur, prev, goodUp = true }: { cur: number | null; prev: number | null; goodUp?: boolean }) {
  const d = deltaOf(cur, prev);
  if (d == null) return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }} title="Sem base no período anterior">—</span>;
  if (Math.abs(d) < 0.005) return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>= 0%</span>;
  const up = d > 0; const good = up === goodUp;
  const c = good ? '#16a34a' : '#ef4444';
  return <span title="Comparado com o período anterior" style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}1f`, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>{up ? '▲' : '▼'} {fmtPct(Math.abs(d))}</span>;
}
// três números de ROAS lado a lado: geral da loja × identificado × vendas sem origem
function RoasRow({ trio, loading }: { trio: { cur: RoasTrio; prev: RoasTrio } | null; loading: boolean }) {
  const t = trio;
  const gTier = t ? roasTier(t.cur.general) : null; const iTier = t ? roasTier(t.cur.identified) : null;
  return (
    <section aria-label="ROAS" data-testid="ads-roas-trio">
      <div className="adx-trio">
        {loading || !t ? [0, 1, 2].map((i) => <div key={i} className="adx-skel" style={{ height: 96 }} />) : (
          <>
            <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="ads-roas-geral">
              <span style={eyebrow}>ROAS geral da loja</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="adx-big" style={{ color: gTier ? TIER_COLOR[gTier] : 'var(--text-primary)' }}>{fmtX(t.cur.general)}</span>
                <Delta cur={t.cur.general} prev={t.prev.general} />
              </div>
              <span style={muted}>Faturamento de TODAS as vendas do ERP no período ({fmtInt(t.cur.all.count)} · {fmtMoney(t.cur.all.revenue)}) ÷ gasto com imposto.</span>
            </div>
            <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="ads-roas-ident">
              <span style={eyebrow}>ROAS identificado</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="adx-big" style={{ color: iTier ? TIER_COLOR[iTier] : 'var(--text-primary)' }}>{fmtX(t.cur.identified)}</span>
                <Delta cur={t.cur.identified} prev={t.prev.identified} />
              </div>
              <span style={muted}>Só as vendas ligadas com certeza a um anúncio conhecido ({fmtInt(t.cur.identifiedSum.count)} · {fmtMoney(t.cur.identifiedSum.revenue)}) ÷ gasto com imposto.</span>
            </div>
            <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="ads-sem-origem">
              <span style={eyebrow}>Vendas sem origem</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="adx-big" style={{ color: 'var(--text-primary)' }}>{fmtInt(t.cur.unattributed.count)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>{fmtMoney(t.cur.unattributed.revenue)}</span>
              </div>
              <span style={muted}>Vendas do período sem origem conhecida (de conversas de anúncio, mas antes do 1º contato){t.cur.preTrack.count ? ` — ${fmtInt(t.cur.preTrack.count)} antes do início do rastreio, não repartidas` : ''}; no modo Estimado são repartidas pelas conversas de cada anúncio.</span>
            </div>
          </>
        )}
      </div>
      {/* 12/11: o que fica FORA da repartição entre os anúncios */}
      {!loading && t && (
        <div style={{ ...box, marginTop: 10, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'baseline' }} data-testid="ads-fora">
          <span style={eyebrow}>Fora da repartição</span>
          <span style={{ fontSize: 13 }} data-testid="ads-organico"><b>Orgânico / sem conversa</b>: {fmtInt(t.cur.organic.count)} · {fmtMoney(t.cur.organic.revenue)}</span>
          <span style={{ fontSize: 13 }} data-testid="ads-ig-organico"><b>Instagram (orgânico)</b>: {fmtInt(t.cur.instagram.count)} · {fmtMoney(t.cur.instagram.revenue)}</span>
          <span style={{ fontSize: 13 }} data-testid="ads-sem-id"><b>Anúncio não identificado</b> (conversas de anúncio sem ad_id; fora do ROAS dos anúncios): {fmtInt(t.cur.noAdId.count)} · {fmtMoney(t.cur.noAdId.revenue)}</span>
        </div>
      )}
    </section>
  );
}

function Top({ totals, loading, attrib }: { totals: { cur: ReturnType<typeof totalsOf>; prev: ReturnType<typeof totalsOf> } | null; loading: boolean; attrib: AttribMode }) {
  const t = totals;
  const est = attrib === 'estimado';
  const tier = t ? roasTier(t.cur.roas) : null;
  const items: { k: string; label: string; value: string; cur: number | null; prev: number | null; goodUp: boolean; sub?: string; color?: string; info: string }[] = t ? [
    { k: 'gasto', label: 'Gasto', value: fmtMoney(t.cur.spendReal), cur: t.cur.spendReal, prev: t.prev.spendReal, goodUp: false, sub: `${fmtMoney(t.cur.spend)} na Meta + ${fmtMoney(t.cur.tax)} de imposto`, info: 'Gasto da conta na Meta no período + imposto do anúncio (Configurações).' },
    { k: 'faturamento', label: 'Faturamento', value: fmtMoney(t.cur.revenue), cur: t.cur.revenue, prev: t.prev.revenue, goodUp: true, sub: est ? `${fmtInt(t.cur.sales)} vendas do período (todas)` : `${fmtInt(t.cur.sales)} vendas de anúncio`, info: est ? 'Modo Estimado: todas as vendas do ERP no período (as ligadas a anúncio + as sem origem).' : 'Vendas do ERP no período ligadas com certeza a conversas que vieram de anúncio (💰, 📈 ou telefone).' },
    { k: 'roas', label: est ? 'ROAS real (estimado)' : 'ROAS real (identificado)', value: fmtX(t.cur.roas), cur: t.cur.roas, prev: t.prev.roas, goodUp: true, color: tier ? TIER_COLOR[tier] : undefined, sub: tier ? `faixa: ${TIER_LABEL[tier]}` : undefined, info: 'Faturamento ÷ (gasto + imposto). Faixas: acima de 7 ótimo, 6 a 7 bom, 4 a 6 ok, abaixo de 4 ruim.' },
    { k: 'cpv', label: 'Custo por venda', value: fmtMoney(t.cur.cpa), cur: t.cur.cpa, prev: t.prev.cpa, goodUp: false, info: est ? '(Gasto + imposto) ÷ todas as vendas do período.' : '(Gasto + imposto) ÷ vendas ligadas a anúncio.' },
    { k: 'cpc', label: 'Custo por conversa', value: fmtMoney(t.cur.cpc), cur: t.cur.cpc, prev: t.prev.cpc, goodUp: false, sub: `${fmtInt(t.cur.conversations)} conversas de anúncio`, info: '(Gasto + imposto) ÷ conversas que começaram por anúncio no período.' },
  ] : [];
  return (
    <section aria-label="Como estou?" data-testid="ads-top">
      <h2 style={{ ...eyebrow, margin: '0 0 8px' }}>Como estou?</h2>
      <div className="adx-top">
        {loading || !t ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="adx-skel" style={{ height: 104 }} />) : items.map((it) => (
          <div key={it.k} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={`ads-kpi-${it.k}`} title={it.info}>
            <span style={eyebrow}>{it.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="adx-big" style={{ color: it.color || 'var(--text-primary)' }}>{it.value}</span>
              <Delta cur={it.cur} prev={it.prev} goodUp={it.goodUp} />
            </div>
            {it.sub && <span style={muted}>{it.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 4 cartões de decisão + "Para onde foi o seu dinheiro" ─────────────────
function Decisions({ cards, filter, setFilter }: { cards: AdCard[]; filter: Category | null; setFilter: (c: Category | null) => void }) {
  const boxes = categoryBoxes(cards);
  return (
    <section aria-label="Decisões" className="adx-dec" data-testid="ads-decisions">
      {boxes.map((b) => {
        const c = CATEGORY_COLOR[b.category]; const on = filter === b.category;
        return (
          <button key={b.category} type="button" aria-pressed={on} onClick={() => setFilter(on ? null : b.category)} data-testid={`ads-dec-${b.category}`}
            style={{ ...box, textAlign: 'left', cursor: 'pointer', borderTopColor: on ? c : 'var(--border-main)', borderRightColor: on ? c : 'var(--border-main)', borderBottomColor: on ? c : 'var(--border-main)', borderLeftWidth: 5, borderLeftColor: c, background: on ? `${c}14` : 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...eyebrow, color: c }}>{CATEGORY_LABEL[b.category]}</span>
            <span className="adx-big" style={{ color: 'var(--text-primary)' }}>{b.count} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>anúncio{b.count === 1 ? '' : 's'}</span></span>
            <span style={muted}>{fmtMoney(b.spendReal)} gastos · {fmtMoney(b.revenue)} vendidos</span>
          </button>
        );
      })}
    </section>
  );
}
function MoneyBar({ cards }: { cards: AdCard[] }) {
  const split = moneySplit(cards);
  const total = split.reduce((s, x) => s + x.spendReal, 0);
  return (
    <section style={box} aria-label="Para onde foi o seu dinheiro" data-testid="ads-moneybar">
      <h2 style={{ ...eyebrow, margin: '0 0 10px' }}>Para onde foi o seu dinheiro</h2>
      {total <= 0 ? <span style={muted}>Sem gasto no período.</span> : (
        <>
          <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-inner)' }}>
            {split.filter((s) => s.pct > 0).map((s) => <div key={s.category} title={`${s.label}: ${fmtPct(s.pct)} · ${fmtMoney(s.spendReal)}`} style={{ width: `${s.pct * 100}%`, background: CATEGORY_COLOR[s.category] }} />)}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            {split.map((s) => (
              <span key={s.category} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLOR[s.category] }} />
                <b>{s.label}</b> {fmtPct(s.pct)} · {fmtMoney(s.spendReal)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ── Cartões por criativo ──────────────────────────────────────────────────
interface Act {
  toggle: (list: AdCard[], target: 'ACTIVE' | 'PAUSED') => void;
  pct: (owners: (BudgetOwner | null)[], pct: number) => void;
  set: (owner: BudgetOwner, value: number) => void;
}
interface CardsListProps {
  cards: AdCard[]; filter: Category | null; setFilter: (c: Category | null) => void; creatives: Map<string, MetaCreative>;
  selected: Set<string>; setSelected: (s: Set<string>) => void; ownerOf: (c: AdCard) => BudgetOwner | null; budgetsReady: boolean; busy: boolean; act: Act;
}
function CardsList({ cards, filter, setFilter, creatives, selected, setSelected, ownerOf, budgetsReady, busy, act }: CardsListProps) {
  const flip = (keys: string[], on: boolean) => { const s = new Set(selected); keys.forEach((k) => (on ? s.add(k) : s.delete(k))); setSelected(s); };
  const cats = filter ? [filter] : CATEGORY_ORDER;
  if (!cards.length) return <div style={{ ...box, textAlign: 'center', ...muted }}>Nenhum anúncio com gasto ou venda neste período.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="ads-cards">
      {filter && <div><button type="button" style={btn} onClick={() => setFilter(null)} data-testid="ads-filter-clear"><X size={14} /> Mostrar todas as categorias</button></div>}
      {cats.map((cat) => {
        const list = cards.filter((c) => c.verdict.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} aria-label={CATEGORY_LABEL[cat]} data-testid={`ads-group-${cat}`}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: CATEGORY_COLOR[cat], display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: CATEGORY_COLOR[cat] }} />{CATEGORY_LABEL[cat]} <span style={{ ...muted, fontWeight: 600 }}>({list.length})</span>
              {(() => { const all = list.every((c) => selected.has(c.key)); return (
                <button type="button" style={{ ...btn, padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }} onClick={() => flip(list.map((c) => c.key), !all)} data-testid={`ads-select-${cat}`}>
                  {all ? 'Desmarcar desta categoria' : 'Selecionar todos desta categoria'}
                </button>
              ); })()}
            </h2>
            <div className="adx-cards">{list.map((c) => (
              <AdCardView key={c.key} c={c} cr={c.adId ? creatives.get(c.adId) || null : null} selected={selected.has(c.key)} onSelect={(on) => flip([c.key], on)}
                owner={ownerOf(c)} budgetsReady={budgetsReady} busy={busy} act={act} />
            ))}</div>
          </section>
        );
      })}
    </div>
  );
}

function Spark({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const v = values.map((x) => (x == null || !Number.isFinite(x) ? null : x));
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <span style={muted}>—</span>;
  const W = 84; const H = 24; const min = Math.min(...nums); const max = Math.max(...nums); const span = max - min || 1;
  const pts = v.map((x, i) => (x == null ? null : `${(i / (v.length - 1)) * W},${H - 2 - ((x - min) / span) * (H - 4)}`)).filter(Boolean).join(' ');
  return <svg width={W} height={H} role="img" aria-label={label} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function AdCardView({ c, cr, selected, onSelect, owner, budgetsReady, busy, act }: {
  c: AdCard; cr: MetaCreative | null; selected: boolean; onSelect: (on: boolean) => void; owner: BudgetOwner | null; budgetsReady: boolean; busy: boolean; act: Act;
}) {
  const [why, setWhy] = useState(false);
  const [play, setPlay] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const catColor = CATEGORY_COLOR[c.verdict.category];
  const tier = c.verdict.tier; // Acompanhar (pouco dado): sem faixa, sem julgamento
  const worstKey = c.verdict.category === 'acompanhar' ? null : c.funnel.worst; // nem "maior perda"
  const tierColor = tier ? TIER_COLOR[tier] : 'var(--text-muted)';
  const thumb = cr ? cr.thumbnail_url || cr.image_url : null;
  const status = cr && cr.status ? STATUS_LABEL[cr.status] || cr.status : null;
  const active = cr && cr.status === 'ACTIVE';
  const link = (cr && cr.preview_url) || (c.adId ? adsManagerUrl(c.adId) : null);
  const start = adStartOf(cr, c.firstDeliveryDay); // 12/11: data de início e dias rodando
  const maxFunnel = Math.max(1, ...c.funnel.steps.map((s) => s.value));
  const series = c.wear.series;
  return (
    <article style={{ ...box, padding: 0, overflow: 'hidden', borderTopWidth: 4, borderTopColor: tier ? tierColor : catColor, display: 'flex', flexDirection: 'column' }} data-testid="ads-card" data-ad={c.key} data-category={c.verdict.category} data-tier={tier || ''}>
      <div style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 76, height: 76, flex: '0 0 76px', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-inner)', position: 'relative' }}>
          {play && cr && cr.video_url ? <video src={cr.video_url} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : thumb && imgOk ? <img src={thumb} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setImgOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} data-testid="ads-thumb" />
              : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', ...muted }}>sem foto</div>}
          {cr && cr.is_video && !play && (
            <button type="button" aria-label="Ver o vídeo" onClick={() => (cr.video_url ? setPlay(true) : link && window.open(link, '_blank', 'noopener'))}
              style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.25)', border: 'none', cursor: 'pointer', color: '#fff' }}><Play size={22} fill="#fff" /></button>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Selecionar ${c.name}`} data-testid="ads-card-select" style={{ marginTop: 3, width: 16, height: 16, accentColor: ORANGE }} />
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.25, wordBreak: 'break-word' }} data-testid="ads-card-name">{c.name}</div>
          </label>
          {(c.campaign || c.adset) && <div style={{ ...muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.campaign || ''} › ${c.adset || ''}`}>{c.campaign || '—'} › {c.adset || '—'}</div>}
          {start && (
            <div style={{ ...muted, marginTop: 2 }} data-testid="ads-card-start"
              title={start.exact ? 'Início pela Meta (criação do anúncio ou início do conjunto, o que for depois). Conta os dias desde o início, inclusive pausado.' : 'A Meta não mandou a data de início (publique a função ad-manager atualizada): este é o 1º dia com entrega nos dados carregados.'}>
              {start.exact ? `Início ${dayFull(start.day)} · ${start.days} dia${start.days === 1 ? '' : 's'} rodando` : `Entrega desde ${dayFull(start.day)} · pelo menos ${start.days} dia${start.days === 1 ? '' : 's'}`}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {status && <span style={pill(active ? '#22c55e' : '#94a3b8')}>{status}</span>}
            {tier && <span style={pill(tierColor)} data-testid="ads-card-tier">ROAS {TIER_LABEL[tier]}</span>}
          </div>
        </div>
      </div>

      <div className="adx-metrics" style={{ padding: '0 14px' }}>
        <Metric label="Gasto" value={fmtMoney(c.money.spendReal)} />
        <Metric label="Conversas" value={fmtInt(c.money.conversations)} />
        <Metric label="Vendas" value={salesTxt(c.money.sales)} testId="ads-card-sales" />
        <Metric label="Custo/venda" value={fmtMoney(c.money.cpa)} />
        <Metric label="Faturamento" value={fmtMoney(c.money.revenue)} />
        <Metric label="ROAS real" value={fmtX(c.money.roas)} color={tier ? tierColor : undefined} testId="ads-card-roas" />
      </div>

      {c.mode === 'estimado' && (
        <div style={{ padding: '6px 14px 0', ...muted }} data-testid="ads-card-split">
          {c.identifiedSales} venda{c.identifiedSales === 1 ? '' : 's'} identificada{c.identifiedSales === 1 ? '' : 's'} + {salesTxt(c.estimatedSales)} estimada{c.estimatedSales < 1.95 ? '' : 's'}
        </div>
      )}

      <div style={{ padding: '12px 14px 0' }}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>Funil</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="ads-funnel">
          {c.funnel.steps.map((s) => {
            const worst = worstKey === s.key;
            return (
              <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 64px', alignItems: 'center', gap: 6, fontSize: 12 }} data-worst={worst ? '1' : undefined}>
                <span style={{ color: worst ? '#ef4444' : 'var(--text-secondary)', fontWeight: worst ? 800 : 500 }}>{s.label}</span>
                <span style={{ height: 8, borderRadius: 999, background: 'var(--bg-inner)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.max(2, Math.sqrt(s.value / maxFunnel) * 100)}%`, background: worst ? '#ef4444' : ORANGE, opacity: worst ? 1 : 0.75 }} />
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }} title={s.rate != null ? `${fmtPct(s.rate, 1)} da etapa anterior` : undefined}>
                  {fmtInt(s.value)}{s.rate != null && <span style={{ ...muted, fontSize: 10 }}> {fmtPct(s.rate, s.rate < 0.1 ? 1 : 0)}</span>}
                </span>
              </div>
            );
          })}
        </div>
        {worstKey && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Maior perda: {c.funnel.steps.find((s) => s.key === worstKey)?.label.toLowerCase()}</div>}
      </div>

      <div style={{ padding: '12px 14px 0' }}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>Desgaste ({series.length ? `${series.length} dias` : 'sem dias'})</div>
        <div className="adx-wear">
          <WearItem label="CTR" value={fmtPct(c.ctr == null ? null : c.ctr / 100, 2)}><Spark values={series.map((d) => d.ctr)} color="#3b82f6" label="CTR por dia" /></WearItem>
          <WearItem label="CPM" value={fmtMoney(c.cpm)}><Spark values={series.map((d) => d.cpm)} color="#a855f7" label="CPM por dia" /></WearItem>
          <WearItem label="Frequência" value={fmtDec(c.frequency)}><Spark values={series.map((d) => d.frequency || null)} color={ORANGE} label="Frequência por dia" /></WearItem>
        </div>
        {c.wear.tired && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: ORANGE }} data-testid="ads-wear-warn">⚠ {c.wear.text}</div>}
      </div>

      <div style={{ padding: '12px 14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }} data-testid="ads-reasons">
          {c.verdict.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div style={{ alignSelf: 'flex-start', fontWeight: 800, fontSize: 13, color: catColor, background: `${catColor}18`, padding: '6px 10px', borderRadius: 10 }} data-testid="ads-action">{c.verdict.action}</div>
      </div>

      {c.models.length > 0 && (
        <div style={{ padding: '10px 14px 0', fontSize: 12, color: 'var(--text-secondary)' }} data-testid="ads-models">
          <b style={{ color: 'var(--text-primary)' }}>Modelos vendidos:</b> {c.models.slice(0, 4).map((m) => `${m.name}${m.qty > 1 ? ` (${m.qty})` : ''}`).join(' · ')}{c.models.length > 4 ? ` · +${c.models.length - 4}` : ''}
        </div>
      )}

      <CardActions c={c} cr={cr} owner={owner} budgetsReady={budgetsReady} busy={busy} act={act} />

      <div style={{ display: 'flex', gap: 8, padding: 14, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" style={btn} aria-expanded={why} onClick={() => setWhy((w) => !w)} data-testid="ads-why">{why ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Por quê?</button>
        {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }} data-testid="ads-view"><ExternalLink size={14} /> Ver anúncio</a>}
      </div>
      {why && (
        <div style={{ margin: '0 14px 14px', padding: 12, borderRadius: 12, background: 'var(--bg-inner)', fontSize: 12, color: 'var(--text-secondary)' }} data-testid="ads-why-box">
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Regra: {c.verdict.rule}</div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', margin: 0 }}>
            {c.verdict.numbers.map(([k, v]) => <Fragment2 key={k} k={k} v={v} />)}
          </dl>
        </div>
      )}
    </article>
  );
}
// ── FASE 2: ações (nada é enviado daqui: os botões só montam o plano; quem envia é o "Confirmar") ────
const fmtBudget = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}/dia`);
function CardActions({ c, cr, owner, budgetsReady, busy, act }: { c: AdCard; cr: MetaCreative | null; owner: BudgetOwner | null; budgetsReady: boolean; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const st = cr ? cr.status : null;
  const canToggle = !!c.adId && /^\d{5,25}$/.test(c.adId) && st !== 'ARCHIVED' && st !== 'DELETED';
  const paused = st === 'PAUSED';
  const where = owner ? (owner.level === 'campaign' ? 'da campanha' : 'do conjunto') : '';
  const num = Number(value.replace(/\./g, '').replace(',', '.'));
  const small: React.CSSProperties = { ...btn, padding: '5px 9px', fontSize: 12 };
  return (
    <div style={{ margin: '12px 14px 0', padding: 10, borderRadius: 12, background: 'var(--bg-inner)', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="ads-card-actions">
      {canToggle && (
        <div>
          <button type="button" disabled={busy || !cr} onClick={() => act.toggle([c], paused ? 'ACTIVE' : 'PAUSED')} data-testid="ads-toggle"
            style={{ ...small, ...(paused ? { background: '#16a34a', borderColor: '#16a34a', color: '#fff' } : {}) }}>
            {paused ? <><Play size={13} /> Ativar anúncio</> : <><Pause size={13} /> Pausar anúncio</>}
          </button>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }} data-testid="ads-budget">
        {!budgetsReady ? 'Orçamento: carregando…'
          : !owner ? 'Orçamento: não encontrado na Meta'
            : owner.daily == null ? <>Orçamento total {where}: <b>{fmtMoney(owner.lifetime)}</b> (vitalício: mude na Meta)</>
              : <>Orçamento {where}: <b style={{ color: 'var(--text-primary)' }} data-testid="ads-budget-value">{fmtBudget(owner.daily)}</b>{owner.level === 'campaign' ? ' (CBO)' : ''}</>}
      </div>
      {owner && owner.daily != null && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {BUDGET_STEPS.map((p) => (
            <button key={p} type="button" style={small} disabled={busy} onClick={() => act.pct([owner], p)} data-testid={`ads-budget-${p > 0 ? 'mais' : 'menos'}${Math.abs(p)}`}>{p > 0 ? '+' : '−'}{Math.abs(p)}%</button>
          ))}
          {!editing ? <button type="button" style={small} disabled={busy} onClick={() => { setValue(String(owner.daily).replace('.', ',')); setEditing(true); }} data-testid="ads-budget-set">Definir valor</button> : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={muted}>R$</span>
              <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Novo orçamento por dia" style={{ ...dateInput, width: 84 }} data-testid="ads-budget-input" />
              <button type="button" style={{ ...small, background: ORANGE, borderColor: ORANGE, color: '#fff' }} disabled={busy || !Number.isFinite(num) || num <= 0}
                onClick={() => { act.set(owner, num); setEditing(false); }} data-testid="ads-budget-review">Revisar</button>
              <button type="button" style={small} onClick={() => setEditing(false)} aria-label="Cancelar">✕</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BulkBar({ count, busy, onClear, onToggle, onPct }: { count: number; busy: boolean; onClear: () => void; onToggle: (t: 'ACTIVE' | 'PAUSED') => void; onPct: (p: number) => void }) {
  const [x, setX] = useState('10');
  const n = Math.round(Number(x.replace(',', '.')));
  const ok = Number.isFinite(n) && n > 0 && n <= 50;
  const small: React.CSSProperties = { ...btn, padding: '6px 10px', fontSize: 12 };
  return (
    <div className="adx-bulk" role="region" aria-label="Ações nos selecionados" data-testid="ads-bulk">
      <b style={{ fontSize: 13, color: 'var(--text-primary)' }} data-testid="ads-bulk-count">{count} selecionado{count === 1 ? '' : 's'}</b>
      <button type="button" style={small} disabled={busy} onClick={() => onToggle('PAUSED')} data-testid="ads-bulk-pause"><Pause size={13} /> Pausar selecionados</button>
      <button type="button" style={small} disabled={busy} onClick={() => onToggle('ACTIVE')} data-testid="ads-bulk-activate"><Play size={13} /> Ativar selecionados</button>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <span style={muted}>Orçamento</span>
        <button type="button" style={small} disabled={busy || !ok} onClick={() => onPct(-n)} data-testid="ads-bulk-minus">−{ok ? n : 'X'}%</button>
        <input inputMode="numeric" value={x} onChange={(e) => setX(e.target.value)} aria-label="Porcentagem do orçamento" style={{ ...dateInput, width: 52, textAlign: 'center' }} data-testid="ads-bulk-pct" />
        <button type="button" style={small} disabled={busy || !ok} onClick={() => onPct(n)} data-testid="ads-bulk-plus">+{ok ? n : 'X'}%</button>
      </span>
      {!ok && <span style={{ ...muted, color: '#ef4444' }}>de 1% a 50%</span>}
      <button type="button" style={{ ...small, marginLeft: 'auto' }} onClick={onClear} data-testid="ads-bulk-clear"><X size={13} /> Limpar seleção</button>
    </div>
  );
}

// janela de confirmação: a lista exata do que vai mudar; nada é enviado sem o "Confirmar"
function ConfirmDialog({ plan, sending, results, onConfirm, onClose }: {
  plan: Plan; sending: boolean; results: Record<string, { ok: boolean; error: string | null }> | null; onConfirm: () => void; onClose: () => void;
}) {
  const done = !!results && !sending && plan.ready.every((i) => results[i.key]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Confirmar ação na Meta" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="ads-confirm">
      <div style={{ ...box, width: 'min(600px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{done ? 'Resultado' : `${plan.title} — confirme`}</h2>
          <button type="button" style={{ ...btn, padding: 6 }} onClick={onClose} disabled={sending} aria-label="Fechar"><X size={16} /></button>
        </div>
        {!results && (
          <>
            {plan.ready.length ? (
              <div>
                <div style={{ ...eyebrow, marginBottom: 6 }}>Vai mudar na Meta</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }} data-testid="ads-confirm-lines">
                  {plan.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            ) : <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }} data-testid="ads-confirm-empty">Nada para enviar.</p>}
            {plan.warnings.map((w) => <Banner key={w} kind="warn"><span data-testid="ads-confirm-warn">⚠ {w}</span></Banner>)}
            {plan.blocked.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }} data-testid="ads-confirm-blocked">
                <div style={{ ...eyebrow, marginBottom: 4 }}>Fica de fora</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{plan.blocked.map((i) => <li key={i.key}>{i.name}: {i.blocked}</li>)}</ul>
              </div>
            )}
          </>
        )}
        {results && (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="ads-results">
            {plan.ready.map((i) => {
              const r = results[i.key];
              return (
                <li key={i.key} data-testid="ads-result" data-ok={r ? (r.ok ? '1' : '0') : ''} style={{ color: 'var(--text-primary)' }}>
                  {!r ? '⏳' : r.ok ? '✅' : '❌'} {i.kind === 'orcamento' ? `${i.name}: ${i.before} → ${i.after}` : `${KIND_LABEL[i.kind]} ${i.name}`}
                  {r && !r.ok && <div style={{ fontSize: 12, color: '#ef4444', marginLeft: 22 }}>Erro da Meta: {r.error}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {done ? <button type="button" style={btn} onClick={onClose} data-testid="ads-confirm-close">Fechar</button> : (
            <>
              <button type="button" style={btn} onClick={onClose} disabled={sending} data-testid="ads-confirm-cancel">Cancelar</button>
              <button type="button" style={{ ...btn, background: ORANGE, borderColor: ORANGE, color: '#fff', opacity: sending || !plan.ready.length ? 0.6 : 1 }} onClick={onConfirm}
                disabled={sending || !plan.ready.length || !!results} data-testid="ads-confirm-ok">{sending ? 'Enviando…' : 'Confirmar'}</button>
            </>
          )}
        </div>
        <p style={{ ...muted, margin: 0 }}>Proteções: orçamento mínimo de {fmtMoney(MIN_BUDGET)}/dia, no máximo ±50% por ação e nada na mesma campanha em menos de 1 minuto.</p>
      </div>
    </div>
  );
}

// aba "Histórico de ações": system_config "ads_actions_log" (últimas 300)
function ActionsLog({ log }: { log: LogEntry[] }) {
  const th: React.CSSProperties = { ...eyebrow, textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-main)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border-main)', color: 'var(--text-primary)', verticalAlign: 'top' };
  return (
    <section style={box} aria-label="Histórico de ações" data-testid="ads-log">
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Histórico de ações</h2>
      <p style={{ ...muted, margin: '0 0 10px' }}>Tudo o que foi enviado à Meta por esta página (últimas 300).</p>
      {!log.length ? <span style={muted}>Nenhuma ação ainda.</span> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr><th style={th}>Quando</th><th style={th}>Quem</th><th style={th}>O quê</th><th style={th}>Antes → depois</th><th style={th}>Resultado</th></tr></thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={`${e.at}-${e.objectId}-${i}`} data-testid="ads-log-row">
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={td}>{e.who}</td>
                  <td style={td}>{KIND_LABEL[e.kind] || e.kind} · {e.name}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.before} → {e.after}</td>
                  <td style={{ ...td, color: e.ok ? '#16a34a' : '#ef4444' }}>{e.ok ? '✅ feito' : `❌ ${e.error || 'erro'}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const Fragment2 = ({ k, v }: { k: string; v: string }) => (<><dt style={{ color: 'var(--text-muted)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</dd></>);
const pill = (c: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, color: c, background: `${c}1f`, padding: '2px 8px', borderRadius: 999 });
function Metric({ label, value, color, testId }: { label: string; value: string; color?: string; testId?: string }) {
  return <div style={{ minWidth: 0 }}><div style={{ ...eyebrow, fontSize: 10 }}>{label}</div><div style={{ fontSize: 16, fontWeight: 800, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} data-testid={testId}>{value}</div></div>;
}
function WearItem({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label} <b style={{ color: 'var(--text-primary)' }}>{value}</b></div>{children}</div>;
}

// ── Extras (modo Completo) ────────────────────────────────────────────────
function MetaCheck({ cards }: { cards: AdCard[] }) {
  const rows = metaCheck(cards);
  const th: React.CSSProperties = { ...eyebrow, textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border-main)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--border-main)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' };
  return (
    <section style={box} aria-label="Conferir com a Meta" data-testid="ads-check">
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Conferir com a Meta</h2>
      <p style={{ ...muted, margin: '0 0 10px' }}>Compras que a Meta atribuiu (actions purchase do insight) × vendas identificadas no ERP × vendas estimadas (repartição das sem origem) × compras que a nossa API de conversões (📈) enviou.</p>
      {!rows.length ? <span style={muted}>Nenhuma compra no período.</span> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Anúncio</th><th style={th}>Compras que a Meta atribuiu</th><th style={th}>Vendas identificadas</th><th style={th}>Vendas estimadas</th><th style={th}>Enviadas (CAPI)</th><th style={th}>Diferença (Meta × identificadas)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</td>
                  <td style={td}>{fmtInt(r.metaPurchases)}</td><td style={{ ...td, fontWeight: 700 }}>{fmtInt(r.erpSales)}</td><td style={td}>{r.estimated > 0.05 ? salesTxt(r.estimated) : '—'}</td><td style={td}>{fmtInt(r.capiPurchases)}</td>
                  <td style={{ ...td, color: r.diff === 0 ? 'var(--text-muted)' : r.diff > 0 ? ORANGE : '#3b82f6' }}>{r.diff > 0 ? `Meta +${r.diff}` : r.diff < 0 ? `ERP +${-r.diff}` : 'igual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function HourMap({ model, w }: { model: TrackModel; w: Window }) {
  const [what, setWhat] = useState<'conversations' | 'sales'>('conversations');
  const map = useMemo(() => hourMap(model, w), [model, w]);
  const grid = map[what];
  const max = Math.max(1, ...grid.flat());
  const color = what === 'sales' ? '22,163,74' : '249,115,22';
  return (
    <section style={box} aria-label="Mapa de horários" data-testid="ads-hours">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Mapa de horários</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={chip(what === 'conversations')} onClick={() => setWhat('conversations')}>Conversas</button>
          <button type="button" style={chip(what === 'sales')} onClick={() => setWhat('sales')}>Vendas</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, minmax(16px, 1fr))', gap: 2, minWidth: 560 }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>)}
          {grid.map((row, d) => [
            <span key={`l${d}`} style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{WEEK[d]}</span>,
            ...row.map((v, h) => <span key={`${d}-${h}`} title={`${WEEK[d]} ${h}h: ${v} ${what === 'sales' ? 'vendas' : 'conversas'}`} style={{ height: 18, borderRadius: 4, background: v ? `rgba(${color},${0.15 + 0.85 * (v / max)})` : 'var(--bg-inner)' }} />),
          ])}
        </div>
      </div>
    </section>
  );
}

function TimeToSale({ cards, model, w }: { cards: AdCard[]; model: TrackModel; w: Window }) {
  const bands = useMemo(() => replyBands(model, w), [model, w]);
  const withSales = cards.filter((c) => c.medianMinutesToSale != null);
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border-main)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' };
  return (
    <section className="adx-two" aria-label="Tempo até a venda" data-testid="ads-time">
      <div style={box}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Tempo até a venda</h2>
        <p style={{ ...muted, margin: '0 0 8px' }}>Mediana do 1º contato até a venda, por anúncio.</p>
        {!withSales.length ? <span style={muted}>Sem vendas no período.</span> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {withSales.sort((a, b) => (a.medianMinutesToSale ?? 0) - (b.medianMinutesToSale ?? 0)).map((c) => (
              <tr key={c.key}><td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtMinutes(c.medianMinutesToSale)}</td><td style={{ ...td, textAlign: 'right', ...muted }}>{c.identifiedSales} venda{c.identifiedSales === 1 ? '' : 's'}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
      <div style={box}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Vendas pelo tempo da 1ª resposta</h2>
        <p style={{ ...muted, margin: '0 0 8px' }}>Conversas de anúncio do período, pela demora da loja em responder.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {bands.map((b) => (
            <tr key={b.key}><td style={td}>{b.label}</td><td style={{ ...td, textAlign: 'right' }}>{fmtInt(b.conversations)} conversas</td><td style={{ ...td, textAlign: 'right' }}>{fmtInt(b.sold)} compraram</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtPct(b.rate)}</td></tr>
          ))}
        </tbody></table>
      </div>
    </section>
  );
}

// ── Metas (engrenagem): grava SÓ system_config "ads_goals" ────────────────
function GoalsDialog({ value, saved, onClose, onSaved }: { value: Goals; saved: boolean; onClose: () => void; onSaved: (g: Goals) => void }) {
  const [f, setF] = useState(() => ({
    cpaTarget: value.cpaTarget == null ? '' : String(value.cpaTarget),
    roasGreat: String(value.roasGreat), roasGood: String(value.roasGood), roasOk: String(value.roasOk),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) ? null : n; };
  const save = async () => {
    const g: Goals = { ...value, cpaTarget: num(f.cpaTarget), roasGreat: num(f.roasGreat) ?? DEFAULT_GOALS.roasGreat, roasGood: num(f.roasGood) ?? DEFAULT_GOALS.roasGood, roasOk: num(f.roasOk) ?? DEFAULT_GOALS.roasOk };
    if (!(g.roasGreat >= g.roasGood && g.roasGood >= g.roasOk)) { setErr('As faixas de ROAS precisam estar em ordem: ótimo ≥ bom ≥ ok.'); return; }
    setBusy(true); setErr(null);
    try { await saveGoals(g); onSaved(g); } catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui salvar'); setBusy(false); }
  };
  const field = (k: keyof typeof f, label: string, hint: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-primary)' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <input inputMode="decimal" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} style={{ ...dateInput, fontSize: 14 }} data-testid={`ads-goal-${k}`} />
      <span style={muted}>{hint}</span>
    </label>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Metas" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="ads-goals">
      <div style={{ ...box, width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Metas</h2>
          <button type="button" style={{ ...btn, padding: 6 }} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        {!saved && <p style={{ ...muted, margin: 0 }}>Ainda sem metas salvas: o custo por venda vem sugerido pela média dos últimos 30 dias.</p>}
        {field('cpaTarget', 'Custo por venda alvo (R$)', 'Acima disso (+20%) o anúncio vai para "Ajustar".')}
        <div style={{ ...eyebrow, marginTop: 4 }}>Faixas de ROAS real</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {field('roasGreat', 'Ótimo acima de', 'verde forte')}
          {field('roasGood', 'Bom a partir de', 'verde')}
          {field('roasOk', 'Ok a partir de', 'amarelo · abaixo = ruim (vermelho)')}
        </div>
        <p style={{ ...muted, margin: 0 }}>Pouco dado (menos de R$ {value.minSpend} gastos, ou menos de {value.minConversations} conversas sem venda) fica em "Acompanhar", sem julgamento.</p>
        {err && <div role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btn} onClick={onClose}>Cancelar</button>
          <button type="button" style={{ ...btn, background: ORANGE, borderColor: ORANGE, color: '#fff' }} onClick={save} disabled={busy} data-testid="ads-goals-save">{busy ? 'Salvando…' : 'Salvar metas'}</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.adx .adx-top{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.adx .adx-bulk{position:sticky;bottom:12px;z-index:40;display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;border-radius:14px;background:var(--bg-card);border:2px solid #f97316;box-shadow:0 8px 24px rgba(0,0,0,0.18)}
.adx .adx-trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.adx .adx-dec{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.adx .adx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.adx .adx-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 12px}
.adx .adx-wear{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.adx .adx-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.adx .adx-big{font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}
.adx .adx-skel{border-radius:16px;background:linear-gradient(90deg,var(--bg-inner) 0,var(--bg-hover) 50%,var(--bg-inner) 100%);background-size:200px 100%;animation:adxSk 1.2s ease-in-out infinite}
@keyframes adxSk{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
@media (prefers-reduced-motion: reduce){.adx .adx-skel{animation:none}}
@media (max-width:1180px){.adx .adx-top{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.adx .adx-top,.adx .adx-dec{grid-template-columns:repeat(2,minmax(0,1fr))}.adx .adx-two,.adx .adx-trio{grid-template-columns:1fr}.adx .adx-cards{grid-template-columns:1fr}.adx .adx-big{font-size:21px}}
`;

