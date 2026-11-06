// Painel de resultados do WhatsApp (aba WhatsApp → Painel). Regras puras, sem React nem Supabase, para poderem
// ser conferidas fora do navegador (node scripts/tests/waPanel.test.ts).
//
// Fontes (gravadas pela extensão 2.10.0; migration 20261106150000):
//   wa_leads (1ª mensagem de cada conversa), wa_replies (1ª resposta depois de cada envio nosso),
//   wa_send_log (envios: manual, rápida, agendada, automação, disparo; etapa do follow-up),
//   wa_ad_attribution (anúncio da conversa), sales (venda do ERP / 💰 da conversa).
// Datas no horário de São Paulo (UTC−3, sem horário de verão desde 2019).

export const DAY_MS = 86400000;
const SP_OFFSET_MS = 3 * 3600000;
export const FOLLOW_WINDOW_DAYS = 7;

// ── Datas ──────────────────────────────────────────────────────────────────
export const spDay = (ms: number) => new Date(ms - SP_OFFSET_MS).toISOString().slice(0, 10);
export const spStartOfDay = (day: string) => Date.parse(`${day}T00:00:00-03:00`);
export const addDays = (day: string, n: number) => spDay(spStartOfDay(day) + n * DAY_MS + 12 * 3600000);
export function spWeekdayHour(ms: number): { weekday: number; hour: number } {
  const d = new Date(ms - SP_OFFSET_MS);
  return { weekday: d.getUTCDay(), hour: d.getUTCHours() };
}

export type PeriodPreset = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'custom';
export interface Range { from: number; to: number; fromDay: string; toDay: string; days: number }
export interface PeriodRanges { cur: Range; prev: Range }

const rangeOf = (fromDay: string, toDay: string): Range => ({
  from: spStartOfDay(fromDay), to: spStartOfDay(toDay) + DAY_MS - 1, fromDay, toDay,
  days: Math.round((spStartOfDay(toDay) - spStartOfDay(fromDay)) / DAY_MS) + 1,
});

// Período escolhido e o anterior de mesmo tamanho (Este mês: o mesmo trecho do mês passado)
export function periodRanges(preset: PeriodPreset, now = Date.now(), custom?: { start: string; end: string }): PeriodRanges {
  const today = spDay(now);
  let fromDay = today;
  let toDay = today;
  if (preset === 'ontem') { fromDay = addDays(today, -1); toDay = fromDay; }
  else if (preset === '7d') fromDay = addDays(today, -6);
  else if (preset === '30d') fromDay = addDays(today, -29);
  else if (preset === 'mes') fromDay = `${today.slice(0, 8)}01`;
  else if (preset === 'custom' && custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.start) && /^\d{4}-\d{2}-\d{2}$/.test(custom.end)) {
    fromDay = custom.start <= custom.end ? custom.start : custom.end;
    toDay = custom.start <= custom.end ? custom.end : custom.start;
  }
  const cur = rangeOf(fromDay, toDay);
  if (preset === 'mes') {
    const [y, m] = fromDay.split('-').map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const pFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
    const lastPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const pTo = `${pFrom.slice(0, 8)}${String(Math.min(lastPrev, Number(toDay.slice(8)))).padStart(2, '0')}`;
    return { cur, prev: rangeOf(pFrom, pTo) };
  }
  const pTo = addDays(fromDay, -1);
  return { cur, prev: rangeOf(addDays(pTo, -(cur.days - 1)), pTo) };
}

// ── Linhas ────────────────────────────────────────────────────────────────
export interface LeadRow { chat_id: string; phone: string | null; first_message_at: string; origin: 'anuncio' | 'organico' | string; ad_id: string | null; ad_title: string | null }
export interface ReplyRow { chat_id: string; replied_at: string; send_log_id: string; minutes: number }
export interface SendRow {
  id: string; chat_id: string | null; created_at: string; source: string; source_id: string | null; item_id: string | null;
  status: string; origin?: string | null; follow_step?: number | null;
}
export interface SaleRowP { id: string; sale_date: string; created_at?: string | null; total_sale_price: number | string | null; customer_phone: string | null; wa_chat_id?: string | null; origin?: string | null }
export interface AttributionRow { chat_id: string; phone: string | null; ad_id: string | null; ad_title: string | null; first_message_at: string | null }
export interface ItemInfo { id: string; title: string; follow_step?: number | null }
export interface PanelInput {
  leads: LeadRow[]; replies: ReplyRow[]; sends: SendRow[]; sales: SaleRowP[]; attributions: AttributionRow[];
  items: ItemInfo[]; names: Record<string, string>;
  fb?: { cur: { count: number; total: number }; prev: { count: number; total: number } };
}

export type Origin = 'manual' | 'rapida' | 'agendada' | 'automacao' | 'disparo';
const LEGACY_ORIGIN: Record<string, Origin> = { follow: 'automacao', disparo: 'disparo', agendado: 'agendada', manual: 'manual', rapida: 'rapida' };
export const originOf = (s: Pick<SendRow, 'origin' | 'source'>): Origin | string => (s.origin || LEGACY_ORIGIN[s.source] || s.source);

// Mesmo critério do ERP: 10/11 dígitos ganham o 55; 12/13 começando com 55 ficam
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}
const phoneOfChatId = (chatId: string | null | undefined) => {
  const m = /^(\d{8,15})@c\.us$/.exec(String(chatId || ''));
  return m ? normalizePhone(m[1]) : null;
};
const money2 = (n: number) => Math.round(n * 100) / 100;
export function median(list: number[]): number | null {
  const v = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
export const pct = (part: number, total: number) => (total ? part / total : null);
// variação do período anterior (null = sem base para comparar)
export const delta = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? null : 0);

// Hora da venda: created_at quando é do mesmo dia de sale_date (registro na hora), senão meio-dia de sale_date
export function saleTime(s: Pick<SaleRowP, 'sale_date' | 'created_at'>): number {
  const day = String(s.sale_date || '').slice(0, 10);
  const c = s.created_at ? Date.parse(s.created_at) : NaN;
  if (Number.isFinite(c) && (!day || spDay(c) === day)) return c;
  const t = Date.parse(`${day}T12:00:00-03:00`);
  return Number.isFinite(t) ? t : (Number.isFinite(c) ? c : NaN);
}

// ── Identidade da conversa ────────────────────────────────────────────────
// A mesma pessoa pode aparecer como @c.us (número), @lid (sem número) ou só pelo telefone da venda.
// Chave = "tel:<55…>" quando o número é conhecido, senão "chat:<id>".
export interface Index {
  keyOfChat: (chatId: string | null | undefined) => string | null;
  knownPhones: Set<string>;
  waSales: WaSale[];
  salesByKey: Map<string, WaSale[]>;
  adKeys: Set<string>;
}
export interface WaSale { id: string; t: number; total: number; keys: string[]; viaChat: boolean; ad: boolean }

export function buildIndex(input: PanelInput): Index {
  const lidPhone = new Map<string, string>();
  const addLid = (chat: string | null | undefined, phone: string | null | undefined) => {
    const p = normalizePhone(phone);
    if (chat && p && /@lid$/.test(chat)) lidPhone.set(chat, p);
  };
  input.leads.forEach((l) => addLid(l.chat_id, l.phone));
  input.attributions.forEach((a) => addLid(a.chat_id, a.phone));
  const keyOfChat = (chatId: string | null | undefined) => {
    if (!chatId) return null;
    const p = phoneOfChatId(chatId) || lidPhone.get(chatId);
    return p ? `tel:${p}` : `chat:${chatId}`;
  };
  // telefones de conversas que existem no WhatsApp (lead, anúncio, envio ou resposta)
  const knownPhones = new Set<string>();
  const addKnown = (chat: string | null | undefined, phone?: string | null) => {
    const p = normalizePhone(phone) || phoneOfChatId(chat) || (chat ? lidPhone.get(chat) : undefined);
    if (p) knownPhones.add(p);
  };
  input.leads.forEach((l) => addKnown(l.chat_id, l.phone));
  input.attributions.forEach((a) => addKnown(a.chat_id, a.phone));
  input.sends.forEach((s) => addKnown(s.chat_id));
  input.replies.forEach((r) => addKnown(r.chat_id));
  const adKeys = new Set<string>();
  input.leads.forEach((l) => { if (l.origin === 'anuncio') { const k = keyOfChat(l.chat_id); if (k) adKeys.add(k); } });
  input.attributions.forEach((a) => { const k = keyOfChat(a.chat_id); if (k) adKeys.add(k); });
  // venda pelo WhatsApp: registrada pelo 💰 da conversa, ou venda do ERP com o telefone de uma conversa
  const waSales: WaSale[] = [];
  const salesByKey = new Map<string, WaSale[]>();
  input.sales.forEach((s) => {
    const t = saleTime(s);
    if (!Number.isFinite(t)) return;
    const phone = normalizePhone(s.customer_phone);
    const keys = new Set<string>();
    const chatKey = keyOfChat(s.wa_chat_id || null);
    if (chatKey) keys.add(chatKey);
    if (phone && (s.wa_chat_id || knownPhones.has(phone))) keys.add(`tel:${phone}`);
    if (!keys.size) return;
    const ks = [...keys];
    const sale: WaSale = { id: s.id, t, total: Number(s.total_sale_price) || 0, keys: ks, viaChat: !!s.wa_chat_id, ad: s.origin === 'anuncio' || ks.some((k) => adKeys.has(k)) };
    waSales.push(sale);
    ks.forEach((k) => { const arr = salesByKey.get(k) || []; arr.push(sale); salesByKey.set(k, arr); });
  });
  return { keyOfChat, knownPhones, waSales, salesByKey, adKeys };
}

const inRange = (t: number, r: Range) => t >= r.from && t <= r.to;
const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const salesOfKeyBetween = (idx: Index, key: string | null, a: number, b: number) =>
  (key ? idx.salesByKey.get(key) || [] : []).filter((s) => s.t > a && s.t <= b);
const sumSales = (list: WaSale[]) => money2(list.reduce((x, s) => x + s.total, 0));
const uniqSales = (list: WaSale[]) => [...new Map(list.map((s) => [s.id, s])).values()];

// etapa do follow-up do envio: a gravada no envio; envios antigos (sem a coluna) usam a da mensagem rápida
export function stepOfSend(s: SendRow, itemSteps: Map<string, number>): number | null {
  if (Number.isInteger(s.follow_step) && (s.follow_step as number) >= 1) return s.follow_step as number;
  if (s.origin === 'manual' || s.source === 'manual') return null;
  return s.item_id ? itemSteps.get(s.item_id) ?? null : null;
}

// ── Resumo (cartões) ──────────────────────────────────────────────────────
export interface Summary {
  leads: number; leadsAd: number; leadsOrganic: number; replied: number;
  sales: number; revenue: number; ticket: number | null; conversion: number | null; leadsBought: number;
  afterFollow: number; afterFollowRevenue: number; fromAd: number; fromAdRevenue: number;
  fbPurchases: number; fbRevenue: number;
}

export function summaryFor(input: PanelInput, idx: Index, r: Range, itemSteps: Map<string, number>, fb?: { count: number; total: number }): Summary {
  const leads = dedupeLeads(input, idx).filter((l) => inRange(l.t, r));
  const leadsAd = leads.filter((l) => l.ad).length;
  const replied = new Set(input.replies.filter((x) => inRange(ts(x.replied_at), r)).map((x) => idx.keyOfChat(x.chat_id)).filter(Boolean)).size;
  const sales = idx.waSales.filter((s) => inRange(s.t, r));
  const revenue = sumSales(sales);
  // lead → venda: o lead do período comprou (venda pelo WhatsApp) depois da 1ª mensagem, até o fim do período
  const leadsBought = leads.filter((l) => salesOfKeyBetween(idx, l.key, l.t - 1, r.to).length > 0).length;
  // venda depois de follow-up: até 7 dias depois do último follow-up que a conversa recebeu antes da venda
  const follows = new Map<string, number[]>();
  input.sends.forEach((s) => {
    if (s.status !== 'enviado' || stepOfSend(s, itemSteps) == null) return;
    const k = idx.keyOfChat(s.chat_id);
    const t = ts(s.created_at);
    if (!k || !Number.isFinite(t)) return;
    const arr = follows.get(k) || [];
    arr.push(t);
    follows.set(k, arr);
  });
  const afterFollow = sales.filter((s) => s.keys.some((k) => {
    const before = (follows.get(k) || []).filter((t) => t < s.t);
    if (!before.length) return false;
    return s.t - Math.max(...before) <= FOLLOW_WINDOW_DAYS * DAY_MS;
  }));
  const fromAd = sales.filter((s) => s.ad);
  return {
    leads: leads.length, leadsAd, leadsOrganic: leads.length - leadsAd, replied,
    sales: sales.length, revenue, ticket: sales.length ? money2(revenue / sales.length) : null,
    conversion: pct(leadsBought, leads.length), leadsBought,
    afterFollow: afterFollow.length, afterFollowRevenue: sumSales(afterFollow), fromAd: fromAd.length, fromAdRevenue: sumSales(fromAd),
    fbPurchases: fb ? fb.count : 0, fbRevenue: fb ? money2(fb.total) : 0,
  };
}

// Leads: wa_leads e, para as conversas de anúncio de antes da 2.10.0, wa_ad_attribution (uma vez por pessoa)
export interface LeadP { key: string; chatId: string; t: number; ad: boolean; adId: string | null; adTitle: string | null }
export function dedupeLeads(input: PanelInput, idx: Index): LeadP[] {
  const out = new Map<string, LeadP>();
  const put = (l: LeadP) => { const cur = out.get(l.key); if (!cur || l.t < cur.t) out.set(l.key, cur ? { ...l, ad: l.ad || cur.ad, adId: l.adId || cur.adId, adTitle: l.adTitle || cur.adTitle } : l); };
  input.leads.forEach((l) => {
    const key = idx.keyOfChat(l.chat_id);
    const t = ts(l.first_message_at);
    if (key && Number.isFinite(t)) put({ key, chatId: l.chat_id, t, ad: l.origin === 'anuncio', adId: l.ad_id, adTitle: l.ad_title });
  });
  input.attributions.forEach((a) => {
    const key = idx.keyOfChat(a.chat_id);
    const t = ts(a.first_message_at);
    if (key && Number.isFinite(t) && !out.has(key)) put({ key, chatId: a.chat_id, t, ad: true, adId: a.ad_id, adTitle: a.ad_title });
  });
  return [...out.values()];
}

// ── Leads por dia (barras anúncio x orgânico) + vendas por dia (linha) ─────
export interface DayPoint { day: string; anuncio: number; organico: number; vendas: number; receita: number }
export function dailySeries(input: PanelInput, idx: Index, r: Range): DayPoint[] {
  const map = new Map<string, DayPoint>();
  for (let i = 0; i < r.days; i++) { const day = addDays(r.fromDay, i); map.set(day, { day, anuncio: 0, organico: 0, vendas: 0, receita: 0 }); }
  dedupeLeads(input, idx).filter((l) => inRange(l.t, r)).forEach((l) => { const p = map.get(spDay(l.t)); if (p) p[l.ad ? 'anuncio' : 'organico']++; });
  idx.waSales.filter((s) => inRange(s.t, r)).forEach((s) => { const p = map.get(spDay(s.t)); if (p) { p.vendas++; p.receita = money2(p.receita + s.total); } });
  return [...map.values()];
}

// ── Funil dos follow-ups (conta CONVERSAS) ────────────────────────────────
export interface FunnelStep {
  step: number; received: number; responded: number; respondedPct: number | null; medianMinutes: number | null;
  bought: number; boughtPct: number | null; revenue: number; advancedNoReply: number; advancedPct: number | null;
}
export function followFunnel(input: PanelInput, idx: Index, r: Range, itemSteps: Map<string, number>): FunnelStep[] {
  const replyBySend = new Map(input.replies.map((x) => [x.send_log_id, x]));
  // por etapa e conversa: os envios da etapa (o 1º do período é a referência)
  const byStep = new Map<number, Map<string, { first: number; sends: SendRow[] }>>();
  const allStepSends = new Map<number, Map<string, number[]>>(); // qualquer data carregada (para "seguiu para a próxima")
  input.sends.forEach((s) => {
    if (s.status !== 'enviado') return;
    const step = stepOfSend(s, itemSteps);
    const k = idx.keyOfChat(s.chat_id);
    const t = ts(s.created_at);
    if (step == null || !k || !Number.isFinite(t)) return;
    const all = allStepSends.get(step) || new Map<string, number[]>();
    all.set(k, [...(all.get(k) || []), t]);
    allStepSends.set(step, all);
    if (!inRange(t, r)) return;
    const m = byStep.get(step) || new Map();
    const cur = m.get(k) || { first: t, sends: [] };
    cur.first = Math.min(cur.first, t);
    cur.sends.push(s);
    m.set(k, cur);
    byStep.set(step, m);
  });
  const steps = [...byStep.keys()].sort((a, b) => a - b);
  return steps.map((step) => {
    const convs = byStep.get(step)!;
    let responded = 0;
    let bought = 0;
    let advancedNoReply = 0;
    const minutes: number[] = [];
    const sold: WaSale[] = [];
    convs.forEach((c, key) => {
      const reps = c.sends.map((s) => replyBySend.get(s.id)).filter(Boolean) as ReplyRow[];
      if (reps.length) {
        responded++;
        const firstRep = reps.reduce((a, b) => (ts(b.replied_at) < ts(a.replied_at) ? b : a));
        minutes.push(Number(firstRep.minutes) || 0);
      }
      const buys = salesOfKeyBetween(idx, key, c.first, c.first + FOLLOW_WINDOW_DAYS * DAY_MS);
      if (buys.length) { bought++; sold.push(...buys); }
      if (!reps.length && (allStepSends.get(step + 1)?.get(key) || []).some((t) => t > c.first)) advancedNoReply++;
    });
    const received = convs.size;
    return {
      step, received, responded, respondedPct: pct(responded, received), medianMinutes: median(minutes),
      bought, boughtPct: pct(bought, received), revenue: sumSales(uniqSales(sold)),
      advancedNoReply, advancedPct: pct(advancedNoReply, received),
    };
  });
}

// ── Tabelas: por envio (mensagem rápida, automação/disparo) ────────────────
export interface SendGroupRow { id: string; name: string; kind: string; sent: number; replied: number; repliedPct: number | null; medianMinutes: number | null; sales: number; revenue: number }
function groupSends(input: PanelInput, idx: Index, r: Range, keyOf: (s: SendRow) => { id: string; kind: string } | null, nameOf: (id: string, kind: string) => string): SendGroupRow[] {
  const replyBySend = new Map(input.replies.map((x) => [x.send_log_id, x]));
  const groups = new Map<string, { id: string; kind: string; sent: number; replied: number; minutes: number[]; sales: Map<string, WaSale> }>();
  input.sends.forEach((s) => {
    const t = ts(s.created_at);
    if (s.status !== 'enviado' || !Number.isFinite(t) || !inRange(t, r)) return;
    const g = keyOf(s);
    if (!g) return;
    const gk = `${g.kind}:${g.id}`;
    const cur = groups.get(gk) || { ...g, sent: 0, replied: 0, minutes: [] as number[], sales: new Map<string, WaSale>() };
    cur.sent++;
    const rep = replyBySend.get(s.id);
    if (rep) { cur.replied++; cur.minutes.push(Number(rep.minutes) || 0); }
    salesOfKeyBetween(idx, idx.keyOfChat(s.chat_id), t, t + FOLLOW_WINDOW_DAYS * DAY_MS).forEach((x) => cur.sales.set(x.id, x));
    groups.set(gk, cur);
  });
  return [...groups.values()].map((g) => ({
    id: g.id, kind: g.kind, name: nameOf(g.id, g.kind), sent: g.sent, replied: g.replied, repliedPct: pct(g.replied, g.sent),
    medianMinutes: median(g.minutes), sales: g.sales.size, revenue: sumSales([...g.sales.values()]),
  })).sort((a, b) => b.sent - a.sent || b.revenue - a.revenue);
}

export function quickMessageTable(input: PanelInput, idx: Index, r: Range): SendGroupRow[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  return groupSends(input, idx, r, (s) => (s.item_id ? { id: s.item_id, kind: 'item' } : null), (id) => titles.get(id) || '(mensagem apagada)');
}

export const AUTO_KIND_LABEL: Record<string, string> = { automacao: 'Automação', disparo: 'Disparo', agendada: 'Agendada' };
export function automationTable(input: PanelInput, idx: Index, r: Range): SendGroupRow[] {
  return groupSends(input, idx, r, (s) => {
    const o = originOf(s);
    if (!['automacao', 'disparo', 'agendada'].includes(o)) return null;
    // agendados não têm nome próprio: ficam juntos
    return { id: o === 'agendada' ? 'agendados' : s.source_id || '(sem id)', kind: o };
  }, (id, kind) => (kind === 'agendada' ? 'Mensagens agendadas' : input.names[id] || `${AUTO_KIND_LABEL[kind] || kind} apagada`));
}

// ── Por anúncio ────────────────────────────────────────────────────────────
export interface AdRow { id: string; adId: string | null; title: string; leads: number; replied: number; repliedPct: number | null; sales: number; revenue: number }
export function adTable(input: PanelInput, idx: Index, r: Range): AdRow[] {
  const replyKeys = new Map<string, number[]>();
  input.replies.forEach((x) => { const k = idx.keyOfChat(x.chat_id); const t = ts(x.replied_at); if (k && Number.isFinite(t)) replyKeys.set(k, [...(replyKeys.get(k) || []), t]); });
  const groups = new Map<string, { adId: string | null; title: string; leads: number; replied: number; sales: Map<string, WaSale> }>();
  dedupeLeads(input, idx).filter((l) => l.ad && inRange(l.t, r)).forEach((l) => {
    const gk = l.adId || (l.adTitle ? `t:${l.adTitle}` : '(sem identificação)');
    const cur = groups.get(gk) || { adId: l.adId, title: l.adTitle || '(sem título)', leads: 0, replied: 0, sales: new Map() };
    if (!cur.adId && l.adId) cur.adId = l.adId;
    if (cur.title === '(sem título)' && l.adTitle) cur.title = l.adTitle;
    cur.leads++;
    if ((replyKeys.get(l.key) || []).some((t) => t >= l.t && t <= r.to)) cur.replied++;
    salesOfKeyBetween(idx, l.key, l.t - 1, r.to).forEach((x) => cur.sales.set(x.id, x));
    groups.set(gk, cur);
  });
  return [...groups.entries()].map(([id, g]) => ({
    id, adId: g.adId, title: g.title, leads: g.leads, replied: g.replied, repliedPct: pct(g.replied, g.leads), sales: g.sales.size, revenue: sumSales([...g.sales.values()]),
  })).sort((a, b) => b.leads - a.leads || b.revenue - a.revenue);
}

// ── Horários: dia da semana (0 = domingo) × hora, quantidade de leads ──────
export function leadHeatmap(input: PanelInput, idx: Index, r: Range): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  dedupeLeads(input, idx).filter((l) => inRange(l.t, r)).forEach((l) => { const { weekday, hour } = spWeekdayHour(l.t); grid[weekday][hour]++; });
  return grid;
}

// ── Tudo de uma vez ────────────────────────────────────────────────────────
export function computePanel(input: PanelInput, ranges: PeriodRanges) {
  const idx = buildIndex(input);
  const itemSteps = new Map<string, number>();
  input.items.forEach((i) => { if (Number.isInteger(i.follow_step) && (i.follow_step as number) >= 1) itemSteps.set(i.id, i.follow_step as number); });
  return {
    summary: summaryFor(input, idx, ranges.cur, itemSteps, input.fb?.cur),
    previous: summaryFor(input, idx, ranges.prev, itemSteps, input.fb?.prev),
    daily: dailySeries(input, idx, ranges.cur),
    funnel: followFunnel(input, idx, ranges.cur, itemSteps),
    quick: quickMessageTable(input, idx, ranges.cur),
    automations: automationTable(input, idx, ranges.cur),
    ads: adTable(input, idx, ranges.cur),
    heatmap: leadHeatmap(input, idx, ranges.cur),
  };
}
export type PanelResult = ReturnType<typeof computePanel>;

// Janela de dados que o painel precisa carregar para o período (e o anterior) ser calculado
export function loadWindow(ranges: PeriodRanges) {
  return {
    // telefones de conversas antigas (lead/anúncio) para reconhecer a venda do ERP pelo telefone
    knownFrom: ranges.prev.from - 90 * DAY_MS,
    // follow-up até 7 dias antes da venda; resposta/venda até 7 dias depois do envio
    sendsFrom: ranges.prev.from - FOLLOW_WINDOW_DAYS * DAY_MS,
    until: ranges.cur.to + FOLLOW_WINDOW_DAYS * DAY_MS,
  };
}
