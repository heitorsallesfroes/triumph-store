// Gerenciador de Anúncios (FASE 1, só leitura): as contas e as regras do painel de decisão, puras (sem React nem
// Supabase), para dar para conferir e testar: node scripts/tests/adInsights.test.ts
//
// De onde vem cada número:
//   - Meta (edge function ad-manager, action "dashboard"): gasto, impressões, cliques, frequência e CTR/CPM por dia;
//   - ERP (a mesma lógica da aba WhatsApp → Rastreamento, src/lib/waTracking.ts): conversa → anúncio (wa_leads /
//     wa_ad_attribution, pelo ad_id) → venda do ERP ligada à conversa (💰, 📈 ou telefone);
//   - custo do produto: sales.total_cost − delivery_fee − delivery_cost (igual ao Relatório mensal);
//   - imposto do anúncio: system_config.ad_tax_rate (src/lib/adTax.ts) sobre o gasto da Meta.
//
// Lucro real = faturamento − custo dos produtos − (gasto da Meta + imposto).
// ROAS real = faturamento ÷ (gasto + imposto). Custo por venda / por conversa = (gasto + imposto) ÷ vendas / conversas.
import { median, spDay, spWeekdayHour } from './waPanel.ts';
import type { Conversation, TrackModel } from './waTracking.ts';

// ── Linhas da Meta (edge function) ────────────────────────────────────────
export interface MetaDaily {
  ad_id: string; ad_name: string | null; adset_id: string | null; adset_name: string | null; campaign_id: string | null; campaign_name: string | null;
  date: string; spend: number; impressions: number; clicks: number; reach: number; frequency: number; conversations: number; purchases: number;
}
export interface MetaPeriod { ad_id: string; reach: number; frequency: number; impressions: number }
export interface MetaCreative {
  id: string; name: string | null; status: string | null; thumbnail_url: string | null; image_url: string | null;
  is_video: boolean; video_url: string | null; preview_url: string | null;
}
// custo e modelos de uma venda do ERP
export interface SaleCost { id: string; productCost: number | null; models: { name: string; qty: number }[] }

export interface Window { from: number; to: number; fromDay: string; toDay: string; days: number }

// ── Metas (system_config "ads_goals") ─────────────────────────────────────
// Faixas de ROAS real (padrão pedido em 10/11): acima de 7 ótimo (verde forte), 6 a 7 bom (verde), 4 a 6 ok (amarelo),
// abaixo de 4 ruim (vermelho). cpaTarget/profitMin: null = ainda sem meta (sugestão pela média dos últimos 30 dias).
export interface Goals {
  roasGreat: number; roasGood: number; roasOk: number;
  cpaTarget: number | null; profitMin: number | null;
  minSpend: number; minConversations: number;
}
export const DEFAULT_GOALS: Goals = { roasGreat: 7, roasGood: 6, roasOk: 4, cpaTarget: null, profitMin: null, minSpend: 30, minConversations: 5 };
const posNum = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
export function parseGoals(raw: string | null | undefined): Goals {
  let o: Record<string, unknown> = {};
  try { const p = raw ? JSON.parse(raw) : null; if (p && typeof p === 'object') o = p as Record<string, unknown>; } catch { o = {}; }
  const g: Goals = { ...DEFAULT_GOALS };
  (['roasGreat', 'roasGood', 'roasOk', 'minSpend', 'minConversations'] as const).forEach((k) => { const v = posNum(o[k]); if (v != null) g[k] = v; });
  g.cpaTarget = posNum(o.cpaTarget);
  g.profitMin = o.profitMin == null || o.profitMin === '' || !Number.isFinite(Number(o.profitMin)) ? null : Number(o.profitMin);
  // faixas sempre em ordem (ótimo ≥ bom ≥ ok)
  if (!(g.roasGreat >= g.roasGood && g.roasGood >= g.roasOk)) { g.roasGreat = DEFAULT_GOALS.roasGreat; g.roasGood = DEFAULT_GOALS.roasGood; g.roasOk = DEFAULT_GOALS.roasOk; }
  return g;
}
export const goalsJson = (g: Goals) => JSON.stringify({
  roasGreat: g.roasGreat, roasGood: g.roasGood, roasOk: g.roasOk, cpaTarget: g.cpaTarget, profitMin: g.profitMin, minSpend: g.minSpend, minConversations: g.minConversations,
});

export type RoasTier = 'otimo' | 'bom' | 'ok' | 'ruim';
export const TIER_LABEL: Record<RoasTier, string> = { otimo: 'ótimo', bom: 'bom', ok: 'ok', ruim: 'ruim' };
export const TIER_COLOR: Record<RoasTier, string> = { otimo: '#15803d', bom: '#22c55e', ok: '#eab308', ruim: '#ef4444' };
export function roasTier(roas: number | null, g: Pick<Goals, 'roasGreat' | 'roasGood' | 'roasOk'> = DEFAULT_GOALS): RoasTier | null {
  if (roas == null || !Number.isFinite(roas)) return null;
  if (roas > g.roasGreat) return 'otimo';
  if (roas >= g.roasGood) return 'bom';
  if (roas >= g.roasOk) return 'ok';
  return 'ruim';
}

// ── Contas básicas ────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export const spendReal = (bruto: number, taxRate: number) => bruto * (1 + (Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0));
export interface Money { spend: number; tax: number; spendReal: number; revenue: number; productCost: number; profit: number; roas: number | null; sales: number; conversations: number; cpa: number | null; cpc: number | null }
export function moneyOf(spendBruto: number, taxRate: number, revenue: number, productCost: number, sales: number, conversations: number): Money {
  const real = spendReal(spendBruto, taxRate);
  return {
    spend: r2(spendBruto), tax: r2(real - spendBruto), spendReal: r2(real), revenue: r2(revenue), productCost: r2(productCost),
    profit: r2(revenue - productCost - real), roas: div(revenue, real), sales, conversations, cpa: div(real, sales), cpc: div(real, conversations),
  };
}
export const deltaOf = (cur: number | null, prev: number | null): number | null => (cur == null || prev == null ? null : prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / Math.abs(prev));

// ── ERP: conversa → anúncio → venda ───────────────────────────────────────
export const adKeyOf = (c: Pick<Conversation, 'adId' | 'adTitle'>) => (c.adId ? String(c.adId) : c.adTitle ? `titulo:${c.adTitle}` : 'sem-id');
const inWin = (t: number, w: Pick<Window, 'from' | 'to'>) => t >= w.from && t <= w.to;
export interface ErpAd {
  key: string; adId: string | null; title: string | null;
  conversations: number; responded: number; sales: number; revenue: number; saleIds: string[];
  capiPurchases: number; minutesToSale: number[];
}
// Por anúncio, no período: conversas que COMEÇARAM pelo anúncio no período; vendas do período das conversas que vieram
// de anúncio (começadas em qualquer data); "respondidas" = o cliente respondeu a uma mensagem nossa ou comprou.
export function erpByAd(model: TrackModel, w: Pick<Window, 'from' | 'to'>): Map<string, ErpAd> {
  const out = new Map<string, ErpAd>();
  const get = (c: Conversation) => {
    const k = adKeyOf(c);
    let a = out.get(k);
    if (!a) { a = { key: k, adId: c.adId || null, title: c.adTitle || null, conversations: 0, responded: 0, sales: 0, revenue: 0, saleIds: [], capiPurchases: 0, minutesToSale: [] }; out.set(k, a); }
    if (!a.title && c.adTitle) a.title = c.adTitle;
    return a;
  };
  model.conversations.forEach((c) => {
    if (!c.ad) return;
    const started = c.tracked && inWin(c.firstAt, w);
    const sales = c.saleLinks.filter((s) => inWin(s.t, w) && (!c.tracked || s.t >= c.firstAt));
    if (!started && !sales.length) return;
    const a = get(c);
    if (started) { a.conversations++; if (c.replied || c.sales > 0) a.responded++; }
    sales.forEach((s) => {
      if (a.saleIds.includes(s.id)) return;
      a.sales++; a.revenue = r2(a.revenue + s.total); a.saleIds.push(s.id);
      if (s.how.includes('compra')) a.capiPurchases++;
      if (c.tracked) a.minutesToSale.push((s.t - c.firstAt) / 60000);
    });
  });
  return out;
}

// ── Meta: somas por anúncio na janela ─────────────────────────────────────
export interface MetaAgg {
  adId: string; name: string | null; campaign: string | null; adset: string | null;
  spend: number; impressions: number; clicks: number; conversations: number; purchases: number;
  days: { date: string; spend: number; impressions: number; clicks: number; frequency: number; ctr: number | null; cpm: number | null }[];
}
export function metaByAd(rows: MetaDaily[], w: Pick<Window, 'fromDay' | 'toDay'>): Map<string, MetaAgg> {
  const out = new Map<string, MetaAgg>();
  rows.forEach((r) => {
    let a = out.get(r.ad_id);
    if (!a) { a = { adId: r.ad_id, name: r.ad_name, campaign: r.campaign_name, adset: r.adset_name, spend: 0, impressions: 0, clicks: 0, conversations: 0, purchases: 0, days: [] }; out.set(r.ad_id, a); }
    a.name = a.name || r.ad_name; a.campaign = a.campaign || r.campaign_name; a.adset = a.adset || r.adset_name;
    a.days.push({ date: r.date, spend: r.spend, impressions: r.impressions, clicks: r.clicks, frequency: r.frequency, ctr: div(r.clicks * 100, r.impressions), cpm: div(r.spend * 1000, r.impressions) });
    if (r.date < w.fromDay || r.date > w.toDay) return;
    a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.clicks; a.conversations += r.conversations; a.purchases += r.purchases;
  });
  out.forEach((a) => { a.days.sort((x, y) => x.date.localeCompare(y.date)); a.spend = r2(a.spend); });
  return out;
}
export const metaSpendIn = (rows: MetaDaily[], w: Pick<Window, 'fromDay' | 'toDay'>) => r2(rows.filter((r) => r.date >= w.fromDay && r.date <= w.toDay).reduce((s, r) => s + r.spend, 0));

// ── Desgaste (CTR caindo + frequência subindo) ────────────────────────────
export interface Wear { ctrNow: number | null; ctrBefore: number | null; freqNow: number | null; freqBefore: number | null; tired: boolean; text: string | null; series: MetaAgg['days'] }
export function wearOf(days: MetaAgg['days'], untilDay: string, maxDays = 14): Wear {
  const s = days.filter((d) => d.date <= untilDay && d.impressions > 0).slice(-maxDays);
  const none: Wear = { ctrNow: null, ctrBefore: null, freqNow: null, freqBefore: null, tired: false, text: null, series: s };
  if (s.length < 6) return none;
  const half = Math.floor(s.length / 2);
  const early = s.slice(0, half); const late = s.slice(-half);
  const ctr = (l: typeof s) => div(l.reduce((x, d) => x + d.clicks, 0) * 100, l.reduce((x, d) => x + d.impressions, 0));
  const freq = (l: typeof s) => { const v = l.map((d) => d.frequency).filter((f) => f > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const out: Wear = { ...none, ctrBefore: ctr(early), ctrNow: ctr(late), freqBefore: freq(early), freqNow: freq(late) };
  const ctrDrop = out.ctrBefore && out.ctrNow != null ? out.ctrNow / out.ctrBefore - 1 : 0;
  const freqUp = out.freqBefore && out.freqNow != null ? out.freqNow / out.freqBefore - 1 : 0;
  out.tired = ctrDrop <= -0.2 && freqUp >= 0.1;
  if (out.tired) out.text = `CTR caiu ${Math.round(-ctrDrop * 100)}% e a frequência subiu ${Math.round(freqUp * 100)}%: o público está cansando deste criativo.`;
  return out;
}

// ── Funil: impressões → cliques → conversas → respondidas → vendas ────────
export interface FunnelStep { key: 'impressoes' | 'cliques' | 'conversas' | 'respondidas' | 'vendas'; label: string; value: number; rate: number | null }
export const FUNNEL_LABEL = { impressoes: 'Impressões', cliques: 'Cliques', conversas: 'Conversas', respondidas: 'Responderam', vendas: 'Vendas' } as const;
// referências quando não há média da conta: CTR 1%, 15% dos cliques viram conversa, metade responde, 10% compra
export const FUNNEL_REF = { cliques: 0.01, conversas: 0.15, respondidas: 0.5, vendas: 0.1 };
export type FunnelRef = typeof FUNNEL_REF;
export function funnelOf(x: { impressions: number; clicks: number; conversations: number; responded: number; sales: number }, ref: FunnelRef = FUNNEL_REF): { steps: FunnelStep[]; worst: FunnelStep['key'] | null } {
  const vals: [FunnelStep['key'], number][] = [['impressoes', x.impressions], ['cliques', x.clicks], ['conversas', x.conversations], ['respondidas', x.responded], ['vendas', x.sales]];
  const steps = vals.map(([key, value], i): FunnelStep => ({ key, label: FUNNEL_LABEL[key], value, rate: i ? div(value, vals[i - 1][1]) : null }));
  // maior perda: a etapa que mais fica abaixo da referência (taxa ÷ referência menor)
  let worst: FunnelStep['key'] | null = null; let low = Infinity;
  steps.slice(1).forEach((s) => {
    if (s.rate == null) return;
    const k = s.key as keyof FunnelRef;
    const score = ref[k] > 0 ? s.rate / ref[k] : Infinity;
    if (score < low && score < 1) { low = score; worst = s.key; }
  });
  return { steps, worst };
}
// média da conta (soma de todos os anúncios), para comparar cada um com a própria loja
export function accountRef(list: { impressions: number; clicks: number; conversations: number; responded: number; sales: number }[]): FunnelRef {
  const t = list.reduce((a, x) => ({ i: a.i + x.impressions, c: a.c + x.clicks, v: a.v + x.conversations, r: a.r + x.responded, s: a.s + x.sales }), { i: 0, c: 0, v: 0, r: 0, s: 0 });
  return {
    cliques: div(t.c, t.i) ?? FUNNEL_REF.cliques, conversas: div(t.v, t.c) ?? FUNNEL_REF.conversas,
    respondidas: div(t.r, t.v) ?? FUNNEL_REF.respondidas, vendas: div(t.s, t.r) ?? FUNNEL_REF.vendas,
  };
}

// ── Categoria, diagnóstico e recomendação ─────────────────────────────────
export type Category = 'resolver' | 'ajustar' | 'escalar' | 'acompanhar';
export const CATEGORY_ORDER: Category[] = ['resolver', 'ajustar', 'escalar', 'acompanhar'];
export const CATEGORY_LABEL: Record<Category, string> = { resolver: 'Resolver agora', ajustar: 'Ajustar', escalar: 'Pode render mais', acompanhar: 'Acompanhar' };
export const CATEGORY_COLOR: Record<Category, string> = { resolver: '#ef4444', ajustar: '#f97316', escalar: '#22c55e', acompanhar: '#3b82f6' };
// "Para onde foi o seu dinheiro"
export const MONEY_LABEL: Record<Category, string> = { escalar: 'Dando resultado', ajustar: 'Atenção', acompanhar: 'Poucos dados', resolver: 'Prejuízo' };
export const ACTION = {
  esperar: '→ Esperar mais dados', criativo: '→ Preparar criativo novo', escalar: '→ Pode subir orçamento 20%', oferta: '→ Revisar oferta/atendimento',
} as const;

const brl = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const x1 = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));
const pctTxt = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(n < 0.1 ? 1 : 0).replace('.', ',')}%`);

export interface Verdict { category: Category; tier: RoasTier | null; reasons: string[]; action: string; rule: string; numbers: [string, string][] }
export interface VerdictInput {
  money: Money; responded: number; impressions: number; clicks: number; wear: Pick<Wear, 'tired' | 'text'>;
  funnelWorst: FunnelStep['key'] | null; funnelSteps: FunnelStep[];
}
export function verdictOf(x: VerdictInput, g: Goals): Verdict {
  const m = x.money;
  const tier = m.sales > 0 || m.spendReal > 0 ? roasTier(m.roas ?? 0, g) : null;
  const profitPerSale = m.sales ? m.profit / m.sales : null;
  const numbers: [string, string][] = [
    ['Gasto (com imposto)', brl(m.spendReal)], ['Faturamento', brl(m.revenue)], ['Custo dos produtos', brl(m.productCost)], ['Lucro real', brl(m.profit)],
    ['ROAS real', x1(m.roas)], ['Vendas', String(m.sales)], ['Conversas', String(m.conversations)], ['Custo por venda', brl(m.cpa)], ['Custo por conversa', brl(m.cpc)],
    ['Lucro por venda', brl(profitPerSale)],
    ['Metas', `ROAS ótimo > ${x1(g.roasGreat)} · bom ≥ ${x1(g.roasGood)} · ok ≥ ${x1(g.roasOk)} · custo/venda ${brl(g.cpaTarget)} · lucro/venda ≥ ${brl(g.profitMin)}`],
  ];
  const funnelTxt = (): string | null => {
    const s = x.funnelSteps.find((f) => f.key === x.funnelWorst);
    if (!s) return null;
    const msg: Record<string, string> = {
      cliques: `Pouca gente clica: CTR ${pctTxt(s.rate)}.`,
      conversas: `Clicam mas pouca gente chama no WhatsApp: ${pctTxt(s.rate)} dos cliques viram conversa.`,
      respondidas: `Muita conversa fica sem resposta do cliente: só ${pctTxt(s.rate)} responderam.`,
      vendas: `Conversam mas compram pouco: ${pctTxt(s.rate)} de quem respondeu comprou.`,
    };
    return msg[s.key] || null;
  };
  const creativeLoss = x.funnelWorst === 'cliques' || x.funnelWorst === 'conversas';

  // 1. pouco dado → Acompanhar, sem julgamento
  const fewSpend = m.spendReal < g.minSpend;
  const fewConv = m.conversations < g.minConversations && m.sales === 0 && (g.cpaTarget == null || m.spendReal < g.cpaTarget);
  if (fewSpend || fewConv) {
    return {
      category: 'acompanhar', tier: m.sales ? tier : null, action: ACTION.esperar, numbers,
      reasons: [fewSpend ? `Gastou só ${brl(m.spendReal)} até agora: ainda é cedo para julgar.` : `Só ${m.conversations} conversa${m.conversations === 1 ? '' : 's'} até agora: ainda é cedo para julgar.`],
      rule: `Pouco dado: gasto abaixo de ${brl(g.minSpend)}${fewConv ? `, ou menos de ${g.minConversations} conversas sem venda${g.cpaTarget != null ? ` com gasto abaixo do custo por venda alvo (${brl(g.cpaTarget)})` : ''}` : ''} → Acompanhar.`,
    };
  }

  const reasons: string[] = [];
  const add = (s: string | null) => { if (s && reasons.length < 3 && !reasons.includes(s)) reasons.push(s); };
  const cpaHigh = g.cpaTarget != null && m.cpa != null && m.cpa > g.cpaTarget * 1.2;
  const profitLow = g.profitMin != null && profitPerSale != null && profitPerSale < g.profitMin;
  const roasTxt = `ROAS real ${x1(m.roas ?? 0)} (${TIER_LABEL[tier || 'ruim']}).`;

  if (tier === 'ruim') {
    add(m.sales ? roasTxt : `Gastou ${brl(m.spendReal)} e não vendeu nada.`);
    if (m.profit < 0) add(`Prejuízo de ${brl(-m.profit)} no período.`);
    if (x.wear.tired) add(x.wear.text);
    add(funnelTxt());
    const action = x.wear.tired || creativeLoss ? ACTION.criativo : ACTION.oferta;
    return { category: 'resolver', tier, reasons, action, numbers, rule: `ROAS real abaixo de ${x1(g.roasOk)} (ruim) → Resolver agora. Recomendação: ${action === ACTION.criativo ? 'a perda maior está no anúncio (clique/conversa) ou o criativo cansou' : 'a perda maior está depois da conversa (resposta/venda)'}.` };
  }
  if (tier === 'ok' || cpaHigh || profitLow || x.wear.tired) {
    add(roasTxt);
    if (cpaHigh) add(`Custo por venda ${brl(m.cpa)}, acima da meta (${brl(g.cpaTarget)}).`);
    if (profitLow) add(`Lucro por venda ${brl(profitPerSale)}, abaixo do mínimo (${brl(g.profitMin)}).`);
    if (x.wear.tired) add(x.wear.text);
    add(funnelTxt());
    const action = x.wear.tired || creativeLoss ? ACTION.criativo : ACTION.oferta;
    const why = [tier === 'ok' ? `ROAS real entre ${x1(g.roasOk)} e ${x1(g.roasGood)} (ok)` : null, cpaHigh ? 'custo por venda mais de 20% acima da meta' : null,
      profitLow ? 'lucro por venda abaixo do mínimo' : null, x.wear.tired ? 'CTR caiu 20%+ com a frequência subindo 10%+' : null].filter(Boolean).join('; ');
    return { category: 'ajustar', tier, reasons, action, numbers, rule: `${why} → Ajustar.` };
  }
  add(roasTxt);
  add(`Lucro real de ${brl(m.profit)} com ${m.sales} venda${m.sales === 1 ? '' : 's'}.`);
  if (g.cpaTarget != null && m.cpa != null) add(`Custo por venda ${brl(m.cpa)}, dentro da meta (${brl(g.cpaTarget)}).`);
  return { category: 'escalar', tier, reasons, action: ACTION.escalar, numbers, rule: `ROAS real ${x1(g.roasGood)} ou mais (bom/ótimo), dentro das metas e sem desgaste → Pode render mais.` };
}

// ── Montagem por anúncio ──────────────────────────────────────────────────
export interface AdCard {
  key: string; adId: string | null; name: string; campaign: string | null; adset: string | null;
  money: Money; impressions: number; clicks: number; ctr: number | null; cpm: number | null; frequency: number | null;
  responded: number; metaConversations: number; metaPurchases: number; capiPurchases: number;
  medianMinutesToSale: number | null; models: { name: string; qty: number }[]; costMissing: number;
  wear: Wear; funnel: ReturnType<typeof funnelOf>; verdict: Verdict;
}
export interface BuildInput {
  model: TrackModel; meta: MetaDaily[]; period: MetaPeriod[]; costs: Map<string, SaleCost>; taxRate: number; goals: Goals;
}
export function buildAdCards(inp: BuildInput, w: Window): AdCard[] {
  const erp = erpByAd(inp.model, w);
  const meta = metaByAd(inp.meta, w);
  const freq = new Map(inp.period.map((p) => [p.ad_id, p.frequency]));
  const keys = new Set<string>([...[...meta.values()].filter((m) => m.spend > 0 || m.impressions > 0).map((m) => m.adId), ...erp.keys()]);
  const base = [...keys].map((key) => {
    const e = erp.get(key) || null;
    const m = meta.get(key) || null;
    let productCost = 0; let costMissing = 0;
    const models = new Map<string, number>();
    (e ? e.saleIds : []).forEach((id) => {
      const c = inp.costs.get(id);
      if (!c || c.productCost == null) costMissing++; else productCost += c.productCost;
      (c ? c.models : []).forEach((x) => models.set(x.name, (models.get(x.name) || 0) + x.qty));
    });
    const money = moneyOf(m ? m.spend : 0, inp.taxRate, e ? e.revenue : 0, productCost, e ? e.sales : 0, e ? e.conversations : 0);
    return {
      key, adId: m ? m.adId : e ? e.adId : null,
      name: (m && m.name) || (e && e.title) || (key === 'sem-id' ? 'Anúncio não identificado' : 'Anúncio sem nome'),
      campaign: m ? m.campaign : null, adset: m ? m.adset : null, money,
      impressions: m ? m.impressions : 0, clicks: m ? m.clicks : 0,
      ctr: m ? div(m.clicks * 100, m.impressions) : null, cpm: m ? div(m.spend * 1000, m.impressions) : null, frequency: freq.get(key) ?? null,
      responded: e ? e.responded : 0, metaConversations: m ? m.conversations : 0, metaPurchases: m ? m.purchases : 0, capiPurchases: e ? e.capiPurchases : 0,
      medianMinutesToSale: e ? median(e.minutesToSale) : null,
      models: [...models.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
      costMissing, wear: wearOf(m ? m.days : [], w.toDay),
    };
  });
  const ref = accountRef(base.map((b) => ({ impressions: b.impressions, clicks: b.clicks, conversations: b.money.conversations, responded: b.responded, sales: b.money.sales })));
  return base.map((b) => {
    const funnel = funnelOf({ impressions: b.impressions, clicks: b.clicks, conversations: b.money.conversations, responded: b.responded, sales: b.money.sales }, ref);
    const verdict = verdictOf({ money: b.money, responded: b.responded, impressions: b.impressions, clicks: b.clicks, wear: b.wear, funnelWorst: funnel.worst, funnelSteps: funnel.steps }, inp.goals);
    return { ...b, funnel, verdict };
  }).sort((a, b) => CATEGORY_ORDER.indexOf(a.verdict.category) - CATEGORY_ORDER.indexOf(b.verdict.category) || b.money.spendReal - a.money.spendReal);
}

// ── Topo "Como estou?" ────────────────────────────────────────────────────
// Totais: gasto da conta inteira na Meta; vendas/conversas de TODAS as conversas de anúncio (inclusive sem ad_id).
export function totalsOf(model: TrackModel, meta: MetaDaily[], costs: Map<string, SaleCost>, taxRate: number, w: Window): Money & { costMissing: number } {
  let revenue = 0; let sales = 0; let conversations = 0; let productCost = 0; let costMissing = 0;
  erpByAd(model, w).forEach((e) => {
    revenue += e.revenue; sales += e.sales; conversations += e.conversations;
    e.saleIds.forEach((id) => { const c = costs.get(id); if (!c || c.productCost == null) costMissing++; else productCost += c.productCost; });
  });
  return { ...moneyOf(metaSpendIn(meta, w), taxRate, revenue, productCost, sales, conversations), costMissing };
}
export interface CategoryBox { category: Category; count: number; spendReal: number; revenue: number; profit: number }
export function categoryBoxes(cards: AdCard[]): CategoryBox[] {
  return CATEGORY_ORDER.map((category) => {
    const l = cards.filter((c) => c.verdict.category === category);
    return { category, count: l.length, spendReal: r2(l.reduce((s, c) => s + c.money.spendReal, 0)), revenue: r2(l.reduce((s, c) => s + c.money.revenue, 0)), profit: r2(l.reduce((s, c) => s + c.money.profit, 0)) };
  });
}
export interface MoneySlice { category: Category; label: string; spendReal: number; pct: number }
export function moneySplit(cards: AdCard[]): MoneySlice[] {
  const boxes = categoryBoxes(cards);
  const total = boxes.reduce((s, b) => s + b.spendReal, 0);
  return (['escalar', 'ajustar', 'acompanhar', 'resolver'] as Category[]).map((category) => {
    const b = boxes.find((x) => x.category === category)!;
    return { category, label: MONEY_LABEL[category], spendReal: b.spendReal, pct: total > 0 ? b.spendReal / total : 0 };
  });
}

// ── Extras ────────────────────────────────────────────────────────────────
// Mapa de horários (SP): conversas que começaram por anúncio e vendas dessas conversas, [dia da semana 0=dom][hora]
export function hourMap(model: TrackModel, w: Pick<Window, 'from' | 'to'>): { conversations: number[][]; sales: number[][] } {
  const grid = () => Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const conversations = grid(); const sales = grid();
  model.conversations.forEach((c) => {
    if (!c.ad) return;
    if (c.tracked && inWin(c.firstAt, w)) { const { weekday, hour } = spWeekdayHour(c.firstAt); conversations[weekday][hour]++; }
    c.saleLinks.forEach((s) => { if (inWin(s.t, w)) { const { weekday, hour } = spWeekdayHour(s.t); sales[weekday][hour]++; } });
  });
  return { conversations, sales };
}
// Vendas por faixa do tempo da 1ª resposta da loja (conversas de anúncio que começaram no período)
export const REPLY_BANDS: { key: string; label: string; max: number }[] = [
  { key: 'ate5', label: 'Até 5 min', max: 5 }, { key: 'ate30', label: '5 a 30 min', max: 30 }, { key: 'ate120', label: '30 min a 2 h', max: 120 },
  { key: 'mais', label: 'Mais de 2 h', max: Infinity },
];
export interface ReplyBandRow { key: string; label: string; conversations: number; sold: number; rate: number | null }
export function replyBands(model: TrackModel, w: Pick<Window, 'from' | 'to'>): ReplyBandRow[] {
  const rows: ReplyBandRow[] = [...REPLY_BANDS.map((b) => ({ key: b.key, label: b.label, conversations: 0, sold: 0, rate: null })), { key: 'sem', label: 'Sem resposta registrada', conversations: 0, sold: 0, rate: null }];
  model.conversations.forEach((c) => {
    if (!c.ad || !c.tracked || !inWin(c.firstAt, w)) return;
    const m = c.replyMinutes;
    const row = m == null ? rows[rows.length - 1] : rows[REPLY_BANDS.findIndex((b) => m <= b.max)];
    row.conversations++;
    if (c.saleLinks.some((s) => s.t >= c.firstAt)) row.sold++;
  });
  return rows.map((r) => ({ ...r, rate: div(r.sold, r.conversations) }));
}
// "Conferir com a Meta": compras que a Meta conta × vendas reais do ERP × Purchase enviados pela nossa CAPI
export interface CheckRow { key: string; name: string; metaPurchases: number; erpSales: number; capiPurchases: number; diff: number }
export function metaCheck(cards: AdCard[]): CheckRow[] {
  return cards.filter((c) => c.metaPurchases || c.money.sales || c.capiPurchases)
    .map((c) => ({ key: c.key, name: c.name, metaPurchases: c.metaPurchases, erpSales: c.money.sales, capiPurchases: c.capiPurchases, diff: c.metaPurchases - c.money.sales }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.erpSales - a.erpSales);
}
// Metas sugeridas pela média dos últimos 30 dias: custo por venda médio e lucro médio por venda
export function suggestGoals(t: Pick<Money, 'sales' | 'cpa' | 'profit'>, cur: Goals): Goals {
  return {
    ...cur,
    cpaTarget: cur.cpaTarget ?? (t.cpa != null ? Math.round(t.cpa) : null),
    profitMin: cur.profitMin ?? (t.sales ? Math.round(t.profit / t.sales) : null),
  };
}

// ── Períodos (SP) ─────────────────────────────────────────────────────────
export type AdPeriod = 'hoje' | 'ontem' | '7' | '14' | '30' | '90' | 'custom';
export const AD_PERIODS: [AdPeriod, string][] = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Escolher datas']];
const DAY = 86400000;
const startOf = (day: string) => Date.parse(`${day}T00:00:00-03:00`);
const addDay = (day: string, n: number) => spDay(startOf(day) + n * DAY + 12 * 3600000);
export function windowOf(fromDay: string, toDay: string): Window {
  return { from: startOf(fromDay), to: startOf(toDay) + DAY - 1, fromDay, toDay, days: Math.round((startOf(toDay) - startOf(fromDay)) / DAY) + 1 };
}
export function adRanges(p: AdPeriod, now = Date.now(), custom?: { start: string; end: string }): { cur: Window; prev: Window } {
  const today = spDay(now);
  let fromDay = today; let toDay = today;
  if (p === 'ontem') { fromDay = addDay(today, -1); toDay = fromDay; }
  else if (p === '7' || p === '14' || p === '30' || p === '90') fromDay = addDay(today, -(Number(p) - 1));
  else if (p === 'custom' && custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.start) && /^\d{4}-\d{2}-\d{2}$/.test(custom.end)) {
    fromDay = custom.start <= custom.end ? custom.start : custom.end; toDay = custom.start <= custom.end ? custom.end : custom.start;
    if (toDay > today) toDay = today;
    if (fromDay > toDay) fromDay = toDay;
  }
  const cur = windowOf(fromDay, toDay);
  const pTo = addDay(fromDay, -1);
  return { cur, prev: windowOf(addDay(pTo, -(cur.days - 1)), pTo) };
}
// dias que a Meta precisa mandar: o período anterior (▲▼) e pelo menos 14 dias até o fim (mini gráfico do desgaste)
export function metaFetchWindow(r: { cur: Window; prev: Window }): { since: string; until: string; periodSince: string } {
  const spark = addDay(r.cur.toDay, -13);
  return { since: r.prev.fromDay < spark ? r.prev.fromDay : spark, until: r.cur.toDay, periodSince: r.cur.fromDay };
}
