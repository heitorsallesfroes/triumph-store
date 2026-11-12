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
// FASE 2 (10/11): sem "lucro" — categorias e cores usam só o ROAS (faixas) e o custo por venda.
// ROAS real = faturamento ÷ (gasto + imposto). Custo por venda / por conversa = (gasto + imposto) ÷ vendas / conversas.
import { median, saleTime, spDay, spWeekdayHour } from './waPanel.ts';
import type { Conversation, TrackModel, TrackSaleRow } from './waTracking.ts';

// ── Linhas da Meta (edge function) ────────────────────────────────────────
export interface MetaDaily {
  ad_id: string; ad_name: string | null; adset_id: string | null; adset_name: string | null; campaign_id: string | null; campaign_name: string | null;
  date: string; spend: number; impressions: number; clicks: number; reach: number; frequency: number; conversations: number; purchases: number;
}
export interface MetaPeriod { ad_id: string; reach: number; frequency: number; impressions: number }
export interface MetaCreative {
  id: string; name: string | null; status: string | null; thumbnail_url: string | null; image_url: string | null;
  is_video: boolean; video_url: string | null; preview_url: string | null;
  created_time?: string | null; start_time?: string | null; // 12/11: criação do anúncio e início do conjunto (ad-manager novo)
}
// custo e modelos de uma venda do ERP
export interface SaleCost { id: string; productCost: number | null; models: { name: string; qty: number }[] }

export interface Window { from: number; to: number; fromDay: string; toDay: string; days: number }

// ── Metas (system_config "ads_goals") ─────────────────────────────────────
// Faixas de ROAS real (padrão pedido em 10/11): acima de 7 ótimo (verde forte), 6 a 7 bom (verde), 4 a 6 ok (amarelo),
// abaixo de 4 ruim (vermelho). cpaTarget: null = ainda sem meta (sugestão pela média dos últimos 30 dias).
export interface Goals {
  roasGreat: number; roasGood: number; roasOk: number;
  cpaTarget: number | null;
  minSpend: number; minConversations: number;
}
export const DEFAULT_GOALS: Goals = { roasGreat: 7, roasGood: 6, roasOk: 4, cpaTarget: null, minSpend: 30, minConversations: 5 };
const posNum = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
export function parseGoals(raw: string | null | undefined): Goals {
  let o: Record<string, unknown> = {};
  try { const p = raw ? JSON.parse(raw) : null; if (p && typeof p === 'object') o = p as Record<string, unknown>; } catch { o = {}; }
  const g: Goals = { ...DEFAULT_GOALS };
  (['roasGreat', 'roasGood', 'roasOk', 'minSpend', 'minConversations'] as const).forEach((k) => { const v = posNum(o[k]); if (v != null) g[k] = v; });
  g.cpaTarget = posNum(o.cpaTarget);
  // faixas sempre em ordem (ótimo ≥ bom ≥ ok)
  if (!(g.roasGreat >= g.roasGood && g.roasGood >= g.roasOk)) { g.roasGreat = DEFAULT_GOALS.roasGreat; g.roasGood = DEFAULT_GOALS.roasGood; g.roasOk = DEFAULT_GOALS.roasOk; }
  return g;
}
export const goalsJson = (g: Goals) => JSON.stringify({
  roasGreat: g.roasGreat, roasGood: g.roasGood, roasOk: g.roasOk, cpaTarget: g.cpaTarget, minSpend: g.minSpend, minConversations: g.minConversations,
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
export interface Money { spend: number; tax: number; spendReal: number; revenue: number; productCost: number; roas: number | null; sales: number; conversations: number; cpa: number | null; cpc: number | null }
export function moneyOf(spendBruto: number, taxRate: number, revenue: number, productCost: number, sales: number, conversations: number): Money {
  const real = spendReal(spendBruto, taxRate);
  return {
    spend: r2(spendBruto), tax: r2(real - spendBruto), spendReal: r2(real), revenue: r2(revenue), productCost: r2(productCost),
    roas: div(revenue, real), sales, conversations, cpa: div(real, sales), cpc: div(real, conversations),
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
// 12/11: as vendas de uma conversa depois do 1º contato — as do rastreio (saleLinks) + as do MESMO dia do 1º contato que
// o rastreio deixou de fora porque a hora do sale_date (meio-dia) ficou antes da hora da 1ª mensagem
function convSales(model: TrackModel, c: Conversation): Conversation['saleLinks'] {
  if (!c.tracked) return c.saleLinks;
  const have = new Set(c.saleLinks.map((s) => s.id));
  const extra = (model.sales || []).filter((s) => s.convKey === c.key && !have.has(s.id) && s.t < c.firstAt && spDay(s.t) === spDay(c.firstAt));
  return extra.length ? [...c.saleLinks, ...extra] : c.saleLinks;
}
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
    const sales = convSales(model, c).filter((s) => inWin(s.t, w) && afterContact(s.t, c)); // 12/11: mesmo dia do 1º contato conta
    if (!started && !sales.length) return;
    const a = get(c);
    if (started) { a.conversations++; if (c.replied || c.sales > 0) a.responded++; }
    sales.forEach((s) => {
      if (a.saleIds.includes(s.id)) return;
      a.sales++; a.revenue = r2(a.revenue + s.total); a.saleIds.push(s.id);
      if (s.how.includes('compra')) a.capiPurchases++;
      if (c.tracked) a.minutesToSale.push(Math.max(0, s.t - c.firstAt) / 60000);
    });
  });
  return out;
}

// ── Vendas sem origem e modo "Estimado" (10/11; regras revistas em 12/11) ──
// Modo "Estimado" (padrão): as vendas do período sem origem conhecida, feitas a partir do início do rastreio, são
// repartidas entre os anúncios na proporção das conversas que cada um gerou no período. Ficam FORA da repartição:
//   - antes do início do rastreio (= o 1º lead de ANÚNCIO de verdade, com ad_id — loadTrackStart);
//   - Instagram orgânico (conversa que começou por um link rastreável do Instagram, sem anúncio);
//   - Orgânico / sem conversa (12/11): venda ligada só a conversas do WhatsApp sem anúncio e sem Instagram, ou sem
//     conversa nenhuma ligada;
//   - Anúncio não identificado (conversas de anúncio sem ad_id): o cartão continua, com as vendas ligadas a ele, mas
//     ele não recebe parte da repartição, as conversas dele não contam no total e as vendas dele ficam fora do ROAS
//     identificado (total à parte no topo).
// O que sobra para repartir: vendas de conversas de anúncio feitas antes do 1º contato registrado.
// Modo "Só identificado": só as vendas ligadas com certeza a um anúncio.
// Datas: a venda conta pelo dia de sale_date (saleTime); "depois do 1º contato" = no mesmo dia ou depois (sale_date só
// tem o dia confiável: a hora vem do created_at quando é do mesmo dia, senão meio-dia).
export type AttribMode = 'estimado' | 'identificado';
export const ATTRIB_LABEL: Record<AttribMode, string> = { estimado: 'Estimado', identificado: 'Só identificado' };
export const NO_AD_ID = 'sem-id';
export interface PeriodSale { id: string; t: number; total: number }
// todas as vendas do ERP no período (a carga já tira os status inválidos)
export function periodSales(rows: Pick<TrackSaleRow, 'id' | 'sale_date' | 'created_at' | 'total_sale_price'>[], w: Pick<Window, 'from' | 'to'>): PeriodSale[] {
  const seen = new Set<string>(); const out: PeriodSale[] = [];
  rows.forEach((s) => {
    const t = saleTime(s);
    if (!Number.isFinite(t) || !inWin(t, w) || seen.has(s.id)) return;
    seen.add(s.id); out.push({ id: s.id, t, total: Number(s.total_sale_price) || 0 });
  });
  return out;
}
export interface SalesSum { count: number; revenue: number; productCost: number; costMissing: number; ids: string[] }
export interface AdShare { key: string; conversations: number; share: number; sales: number; revenue: number; productCost: number; costMissing: number }
export interface Attribution {
  all: SalesSum;
  identified: SalesSum; // ligadas com certeza a um anúncio CONHECIDO (com ad_id)
  noAdId: SalesSum; // ligadas a conversas de anúncio sem ad_id ("Anúncio não identificado"; fora do ROAS identificado)
  instagram: SalesSum; // Instagram orgânico (não repartidas)
  organic: SalesSum; // Orgânico / sem conversa (não repartidas)
  unattributed: SalesSum; // o resto: sem origem
  preTrack: SalesSum; // sem origem e antes do início do rastreio (não repartidas)
  distributable: SalesSum; // sem origem a partir do início do rastreio (repartidas, se houver conversa de anúncio)
  totalConversations: number; distributed: boolean; trackStart: number | null;
  shares: Map<string, AdShare>;
}
const sumOf = (list: PeriodSale[], costs: Map<string, SaleCost>): SalesSum => {
  let productCost = 0; let costMissing = 0;
  list.forEach((s) => { const c = costs.get(s.id); if (!c || c.productCost == null) costMissing++; else productCost += c.productCost; });
  return { count: list.length, revenue: r2(list.reduce((x, s) => x + s.total, 0)), productCost: r2(productCost), costMissing, ids: list.map((s) => s.id) };
};
// a venda é "depois do 1º contato": no mesmo dia (São Paulo) ou depois
export const afterContact = (t: number, c: Pick<Conversation, 'tracked' | 'firstAt'>) => !c.tracked || t >= c.firstAt || spDay(t) === spDay(c.firstAt);
// vendas do período ligadas a conversas do Instagram orgânico (a mesma regra de erpByAd: depois do 1º contato)
export function igOrganicSaleIds(model: TrackModel, w: Pick<Window, 'from' | 'to'>): Set<string> {
  const out = new Set<string>();
  model.conversations.forEach((c) => {
    if (c.ad || !c.ig) return;
    convSales(model, c).forEach((s) => { if (inWin(s.t, w) && afterContact(s.t, c)) out.add(s.id); });
  });
  return out;
}
// 12/11: vendas do período "Orgânico / sem conversa": sem nenhuma conversa ligada, ou ligadas só a conversas do
// WhatsApp sem anúncio e sem Instagram (venda de conversa de anúncio, mesmo antes do 1º contato, não entra aqui)
export function organicSaleIds(model: TrackModel, sales: PeriodSale[]): Set<string> {
  // pela ligação venda → conversa do rastreio (model.sales), mesmo a venda de antes do 1º contato
  const byKey = new Map(model.conversations.map((c) => [c.key, c]));
  const kinds = new Map<string, Set<'ad' | 'ig' | 'org'>>();
  const add = (id: string, c: Conversation | undefined) => { if (!c) return; const k = kinds.get(id) || new Set(); k.add(c.ad ? 'ad' : c.ig ? 'ig' : 'org'); kinds.set(id, k); };
  (model.sales || []).forEach((s) => add(s.id, byKey.get(s.convKey)));
  model.conversations.forEach((c) => c.saleLinks.forEach((s) => add(s.id, c)));
  return new Set(sales.filter((s) => { const k = kinds.get(s.id); return !k || (!k.has('ad') && !k.has('ig')); }).map((s) => s.id));
}
// trackStart: início do rastreio (ms); null = ainda sem nenhum lead de anúncio → nada é repartido
// igOrganic / organic: igOrganicSaleIds / organicSaleIds; ligada a anúncio vale primeiro
export function attributeSales(erp: Map<string, ErpAd>, sales: PeriodSale[], costs: Map<string, SaleCost>, trackStart: number | null, igOrganic: Set<string> = new Set(), organic: Set<string> = new Set()): Attribution {
  const known = new Set<string>(); const noId = new Set<string>();
  erp.forEach((a) => a.saleIds.forEach((id) => (a.key === NO_AD_ID ? noId : known).add(id)));
  const identified = sales.filter((s) => known.has(s.id));
  const noAdId = sales.filter((s) => !known.has(s.id) && noId.has(s.id));
  const linked = (s: PeriodSale) => known.has(s.id) || noId.has(s.id);
  const instagram = sales.filter((s) => !linked(s) && igOrganic.has(s.id));
  const org = sales.filter((s) => !linked(s) && !igOrganic.has(s.id) && organic.has(s.id));
  const unattributed = sales.filter((s) => !linked(s) && !igOrganic.has(s.id) && !organic.has(s.id));
  const before = unattributed.filter((s) => trackStart == null || s.t < trackStart);
  const after = unattributed.filter((s) => trackStart != null && s.t >= trackStart);
  const dist = sumOf(after, costs);
  // "Anúncio não identificado" não entra na repartição (nem as conversas dele no total)
  const totalConversations = [...erp.values()].filter((a) => a.key !== NO_AD_ID).reduce((x, a) => x + a.conversations, 0);
  const distributed = totalConversations > 0 && dist.count > 0;
  const shares = new Map<string, AdShare>();
  erp.forEach((a) => {
    if (a.conversations <= 0 || a.key === NO_AD_ID) return; // anúncio sem conversa no período não recebe
    const share = a.conversations / totalConversations;
    const k = distributed ? share : 0;
    shares.set(a.key, { key: a.key, conversations: a.conversations, share, sales: dist.count * k, revenue: dist.revenue * k, productCost: dist.productCost * k, costMissing: dist.costMissing * k });
  });
  return {
    all: sumOf(sales, costs), identified: sumOf(identified, costs), noAdId: sumOf(noAdId, costs), instagram: sumOf(instagram, costs), organic: sumOf(org, costs),
    unattributed: sumOf(unattributed, costs), preTrack: sumOf(before, costs), distributable: dist,
    totalConversations, distributed, trackStart, shares,
  };
}
// ── 12/11: início do anúncio e "dias rodando" ──
// Início = o mais tarde entre a criação do anúncio e o início do conjunto (Meta, dia de São Paulo). Sem isso (função
// ad-manager antiga): o 1º dia com entrega nos dados carregados (exact = false: "pelo menos N dias"). Dias rodando =
// dias de calendário desde o início, contando o dia do início (pausas não descontam).
export interface AdStart { day: string; days: number; exact: boolean }
const metaTime = (v: string | null | undefined) => (v ? Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN);
export function adStartOf(cr: Pick<MetaCreative, 'created_time' | 'start_time'> | null, firstDeliveryDay: string | null, now = Date.now()): AdStart | null {
  const ts = cr ? [metaTime(cr.created_time), metaTime(cr.start_time)].filter(Number.isFinite) : [];
  const day = ts.length ? spDay(Math.max(...ts)) : firstDeliveryDay;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const today = spDay(now);
  const days = day > today ? 0 : Math.round((Date.parse(`${today}T12:00:00-03:00`) - Date.parse(`${day}T12:00:00-03:00`)) / 86400000) + 1;
  return { day, days, exact: ts.length > 0 };
}
// o período começa antes do início do rastreio?
export const startsBeforeTracking = (w: Pick<Window, 'fromDay'>, trackStartDay: string | null) => !!trackStartDay && w.fromDay < trackStartDay;
export const dayBR = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const dayFull = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
// vendas com 1 casa quando estimadas (3 · 1,8)
export const salesTxt = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','));

// ── Meta: somas por anúncio na janela ─────────────────────────────────────
export interface MetaAgg {
  adId: string; name: string | null; campaign: string | null; adset: string | null; campaignId: string | null; adsetId: string | null;
  spend: number; impressions: number; clicks: number; conversations: number; purchases: number;
  days: { date: string; spend: number; impressions: number; clicks: number; frequency: number; ctr: number | null; cpm: number | null }[];
}
export function metaByAd(rows: MetaDaily[], w: Pick<Window, 'fromDay' | 'toDay'>): Map<string, MetaAgg> {
  const out = new Map<string, MetaAgg>();
  rows.forEach((r) => {
    let a = out.get(r.ad_id);
    if (!a) { a = { adId: r.ad_id, name: r.ad_name, campaign: r.campaign_name, adset: r.adset_name, campaignId: r.campaign_id, adsetId: r.adset_id, spend: 0, impressions: 0, clicks: 0, conversations: 0, purchases: 0, days: [] }; out.set(r.ad_id, a); }
    a.name = a.name || r.ad_name; a.campaign = a.campaign || r.campaign_name; a.adset = a.adset || r.adset_name; a.campaignId = a.campaignId || r.campaign_id; a.adsetId = a.adsetId || r.adset_id;
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
export const MONEY_LABEL: Record<Category, string> = { escalar: 'Dando resultado', ajustar: 'Atenção', acompanhar: 'Poucos dados', resolver: 'ROAS ruim' };
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
  const numbers: [string, string][] = [
    ['Gasto (com imposto)', brl(m.spendReal)], ['Faturamento', brl(m.revenue)],
    ['ROAS real', x1(m.roas)], ['Vendas', salesTxt(m.sales)], ['Conversas', String(m.conversations)], ['Custo por venda', brl(m.cpa)], ['Custo por conversa', brl(m.cpc)],
    ['Metas', `ROAS ótimo > ${x1(g.roasGreat)} · bom ≥ ${x1(g.roasGood)} · ok ≥ ${x1(g.roasOk)} · custo/venda ${brl(g.cpaTarget)}`],
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
  const roasTxt = `ROAS real ${x1(m.roas ?? 0)} (${TIER_LABEL[tier || 'ruim']}).`;

  if (tier === 'ruim') {
    add(m.sales ? roasTxt : `Gastou ${brl(m.spendReal)} e não vendeu nada.`);
    if (cpaHigh) add(`Custo por venda ${brl(m.cpa)}, acima da meta (${brl(g.cpaTarget)}).`);
    if (x.wear.tired) add(x.wear.text);
    add(funnelTxt());
    const action = x.wear.tired || creativeLoss ? ACTION.criativo : ACTION.oferta;
    return { category: 'resolver', tier, reasons, action, numbers, rule: `ROAS real abaixo de ${x1(g.roasOk)} (ruim) → Resolver agora. Recomendação: ${action === ACTION.criativo ? 'a perda maior está no anúncio (clique/conversa) ou o criativo cansou' : 'a perda maior está depois da conversa (resposta/venda)'}.` };
  }
  if (tier === 'ok' || cpaHigh || x.wear.tired) {
    add(roasTxt);
    if (cpaHigh) add(`Custo por venda ${brl(m.cpa)}, acima da meta (${brl(g.cpaTarget)}).`);
    if (x.wear.tired) add(x.wear.text);
    add(funnelTxt());
    const action = x.wear.tired || creativeLoss ? ACTION.criativo : ACTION.oferta;
    const why = [tier === 'ok' ? `ROAS real entre ${x1(g.roasOk)} e ${x1(g.roasGood)} (ok)` : null, cpaHigh ? 'custo por venda mais de 20% acima da meta' : null, x.wear.tired ? 'CTR caiu 20%+ com a frequência subindo 10%+' : null].filter(Boolean).join('; ');
    return { category: 'ajustar', tier, reasons, action, numbers, rule: `${why} → Ajustar.` };
  }
  add(roasTxt);
  add(`Faturou ${brl(m.revenue)} com ${salesTxt(m.sales)} venda${salesTxt(m.sales) === '1' ? '' : 's'}.`);
  if (g.cpaTarget != null && m.cpa != null) add(`Custo por venda ${brl(m.cpa)}, dentro da meta (${brl(g.cpaTarget)}).`);
  return { category: 'escalar', tier, reasons, action: ACTION.escalar, numbers, rule: `ROAS real ${x1(g.roasGood)} ou mais (bom/ótimo), dentro das metas e sem desgaste → Pode render mais.` };
}

// ── Montagem por anúncio ──────────────────────────────────────────────────
export interface AdCard {
  key: string; adId: string | null; name: string; campaign: string | null; adset: string | null; campaignId: string | null; adsetId: string | null;
  money: Money; impressions: number; clicks: number; ctr: number | null; cpm: number | null; frequency: number | null;
  responded: number; metaConversations: number; metaPurchases: number; capiPurchases: number;
  medianMinutesToSale: number | null; models: { name: string; qty: number }[]; costMissing: number;
  wear: Wear; funnel: ReturnType<typeof funnelOf>; verdict: Verdict;
  // vendas identificadas (ligadas com certeza) e estimadas (repartição das sem origem; 0 no modo "Só identificado")
  mode: AttribMode; identifiedSales: number; identifiedRevenue: number; estimatedSales: number; estimatedRevenue: number; share: number | null;
  firstDeliveryDay: string | null; // 1º dia com gasto/impressão nos dados carregados (reserva do "início")
}
export interface BuildInput {
  model: TrackModel; meta: MetaDaily[]; period: MetaPeriod[]; costs: Map<string, SaleCost>; taxRate: number; goals: Goals;
  // modo Estimado: a repartição das vendas sem origem (attributeSales). Sem isso (ou "identificado"): só as identificadas.
  mode?: AttribMode; attribution?: Attribution;
}
export function buildAdCards(inp: BuildInput, w: Window): AdCard[] {
  const erp = erpByAd(inp.model, w);
  const att = inp.attribution || null;
  const mode: AttribMode = inp.mode === 'estimado' && att ? 'estimado' : 'identificado';
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
    const sh = att ? att.shares.get(key) || null : null;
    const est = mode === 'estimado' && sh ? sh : null;
    const idSales = e ? e.sales : 0; const idRevenue = e ? e.revenue : 0;
    const money = moneyOf(m ? m.spend : 0, inp.taxRate, idRevenue + (est ? est.revenue : 0), productCost + (est ? est.productCost : 0), idSales + (est ? est.sales : 0), e ? e.conversations : 0);
    return {
      mode, identifiedSales: idSales, identifiedRevenue: idRevenue, estimatedSales: est ? est.sales : 0, estimatedRevenue: est ? r2(est.revenue) : 0, share: sh ? sh.share : null,
      key, adId: m ? m.adId : e ? e.adId : null,
      name: (m && m.name) || (e && e.title) || (key === 'sem-id' ? 'Anúncio não identificado' : 'Anúncio sem nome'),
      campaign: m ? m.campaign : null, adset: m ? m.adset : null, campaignId: m ? m.campaignId : null, adsetId: m ? m.adsetId : null, money,
      impressions: m ? m.impressions : 0, clicks: m ? m.clicks : 0,
      ctr: m ? div(m.clicks * 100, m.impressions) : null, cpm: m ? div(m.spend * 1000, m.impressions) : null, frequency: freq.get(key) ?? null,
      responded: e ? e.responded : 0, metaConversations: m ? m.conversations : 0, metaPurchases: m ? m.purchases : 0, capiPurchases: e ? e.capiPurchases : 0,
      medianMinutesToSale: e ? median(e.minutesToSale) : null,
      models: [...models.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
      costMissing, wear: wearOf(m ? m.days : [], w.toDay),
      firstDeliveryDay: m ? m.days.filter((d) => d.spend > 0 || d.impressions > 0).map((d) => d.date).sort()[0] || null : null,
    };
  });
  const ref = accountRef(base.map((b) => ({ impressions: b.impressions, clicks: b.clicks, conversations: b.money.conversations, responded: b.responded, sales: b.money.sales })));
  return base.map((b) => {
    const funnel = funnelOf({ impressions: b.impressions, clicks: b.clicks, conversations: b.money.conversations, responded: b.responded, sales: b.money.sales }, ref);
    const verdict = verdictOf({ money: b.money, responded: b.responded, impressions: b.impressions, clicks: b.clicks, wear: b.wear, funnelWorst: funnel.worst, funnelSteps: funnel.steps }, inp.goals);
    const vi = verdict.numbers.findIndex(([k]) => k === 'Vendas');
    verdict.numbers.splice(vi < 0 ? verdict.numbers.length : vi, vi < 0 ? 0 : 1, ...sourceNumbers(b, att));
    return { ...b, funnel, verdict };
  }).sort((a, b) => CATEGORY_ORDER.indexOf(a.verdict.category) - CATEGORY_ORDER.indexOf(b.verdict.category) || b.money.spendReal - a.money.spendReal);
}

// "Por quê?": de onde vieram as vendas e o faturamento do anúncio
function sourceNumbers(b: Pick<AdCard, 'key' | 'mode' | 'identifiedSales' | 'identifiedRevenue' | 'estimatedSales' | 'estimatedRevenue' | 'share' | 'money'>, att: Attribution | null): [string, string][] {
  const out: [string, string][] = [['Vendas', salesTxt(b.money.sales)], ['Vendas identificadas', `${b.identifiedSales} (${brl(b.identifiedRevenue)}): ligadas com certeza a este anúncio (conversa → venda)`]];
  if (b.mode !== 'estimado' || !att) { out.push(['Vendas estimadas', 'modo "Só identificado": nenhuma']); return out; }
  const u = att.distributable;
  if (b.key === NO_AD_ID) out.push(['Vendas estimadas', 'nenhuma: conversas de anúncio sem ad_id ficam fora da repartição (e fora do ROAS identificado)']);
  else if (!b.share) out.push(['Vendas estimadas', 'nenhuma: o anúncio não gerou conversa no período']);
  else if (!att.distributed) out.push(['Vendas estimadas', 'nenhuma: não há vendas sem origem para repartir no período']);
  else out.push(['Vendas estimadas', `${salesTxt(b.estimatedSales)} (${brl(b.estimatedRevenue)}) = ${b.money.conversations} de ${att.totalConversations} conversas de anúncio (${pctTxt(b.share)}) × ${u.count} vendas sem origem (${brl(u.revenue)})`]);
  return out;
}

// ── Topo "Como estou?" ────────────────────────────────────────────────────
// Totais: gasto da conta inteira na Meta; vendas/conversas de TODAS as conversas de anúncio (inclusive sem ad_id).
// Modo Estimado (com attribution): faturamento, vendas e custo dos produtos de TODAS as vendas do ERP no período.
export function totalsOf(model: TrackModel, meta: MetaDaily[], costs: Map<string, SaleCost>, taxRate: number, w: Window, opt?: { mode: AttribMode; attribution: Attribution }): Money & { costMissing: number } {
  let revenue = 0; let sales = 0; let conversations = 0; let productCost = 0; let costMissing = 0;
  erpByAd(model, w).forEach((e) => {
    revenue += e.revenue; sales += e.sales; conversations += e.conversations;
    e.saleIds.forEach((id) => { const c = costs.get(id); if (!c || c.productCost == null) costMissing++; else productCost += c.productCost; });
  });
  if (opt && opt.mode === 'estimado') {
    const a = opt.attribution.all;
    revenue = a.revenue; sales = a.count; productCost = a.productCost; costMissing = a.costMissing;
  }
  return { ...moneyOf(metaSpendIn(meta, w), taxRate, revenue, productCost, sales, conversations), costMissing };
}
// Os três números de ROAS do topo
export interface RoasTrio { general: number | null; identified: number | null; unattributed: SalesSum; preTrack: SalesSum; all: SalesSum; identifiedSum: SalesSum; instagram: SalesSum; organic: SalesSum; noAdId: SalesSum }
export function roasTrio(meta: MetaDaily[], taxRate: number, w: Window, att: Attribution): RoasTrio {
  const spend = spendReal(metaSpendIn(meta, w), taxRate);
  return { general: div(att.all.revenue, spend), identified: div(att.identified.revenue, spend), unattributed: att.unattributed, preTrack: att.preTrack, all: att.all, identifiedSum: att.identified, instagram: att.instagram, organic: att.organic, noAdId: att.noAdId };
}
export interface CategoryBox { category: Category; count: number; spendReal: number; revenue: number }
export function categoryBoxes(cards: AdCard[]): CategoryBox[] {
  return CATEGORY_ORDER.map((category) => {
    const l = cards.filter((c) => c.verdict.category === category);
    return { category, count: l.length, spendReal: r2(l.reduce((s, c) => s + c.money.spendReal, 0)), revenue: r2(l.reduce((s, c) => s + c.money.revenue, 0)) };
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
    if (c.saleLinks.some((s) => afterContact(s.t, c))) row.sold++;
  });
  return rows.map((r) => ({ ...r, rate: div(r.sold, r.conversations) }));
}
// "Conferir com a Meta": compras que a Meta conta × vendas reais do ERP × Purchase enviados pela nossa CAPI
// erpSales = vendas identificadas; estimated = estimadas (modo Estimado); diff = Meta − identificadas
export interface CheckRow { key: string; name: string; metaPurchases: number; erpSales: number; estimated: number; capiPurchases: number; diff: number }
export function metaCheck(cards: AdCard[]): CheckRow[] {
  return cards.filter((c) => c.metaPurchases || c.identifiedSales || c.estimatedSales > 0.05 || c.capiPurchases)
    .map((c) => ({ key: c.key, name: c.name, metaPurchases: c.metaPurchases, erpSales: c.identifiedSales, estimated: c.estimatedSales, capiPurchases: c.capiPurchases, diff: c.metaPurchases - c.identifiedSales }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.erpSales - a.erpSales);
}
// Metas sugeridas pela média dos últimos 30 dias: custo por venda médio
export function suggestGoals(t: Pick<Money, 'sales' | 'cpa'>, cur: Goals): Goals {
  return {
    ...cur,
    cpaTarget: cur.cpaTarget ?? (t.cpa != null ? Math.round(t.cpa) : null),
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
