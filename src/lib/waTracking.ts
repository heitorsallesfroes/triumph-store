// Aba WhatsApp → Rastreamento: de onde vêm as conversas (anúncio ou não rastreada), quanto tempo a loja leva
// para responder, a jornada Fez contato → Respondeu → Comprou, as vendas por dia e a lista de conversas.
// Regras puras (sem React nem Supabase): node scripts/tests/waTracking.test.ts
//
// Fontes: wa_leads (1ª mensagem; 2.12.2: last_message_at), wa_chat_activity (2.12.8: TODAS as conversas, com a
// última mensagem e de quem) + wa_chat_activity_days (dias em que o cliente falou), wa_ad_attribution (anúncio e
// nome do WhatsApp), wa_send_log (nossos envios, inclusive o que você digitou), wa_replies (o cliente
// respondeu a um envio nosso), sales, wa_chat_names (nome aprendido/manual), wa_conversion_events
// (Contato/Compra enviados ao Facebook; sale_id = venda do ERP ligada pelo 📈) e wa_settings (horário comercial).
// Datas no horário de São Paulo (UTC−3).
//
// 2.12.8 (como o Tintim): as conversas do período são as ATIVAS (o cliente mandou mensagem no período, novas ou
// antigas) + os leads novos do período + as que tiveram venda no período. "Possíveis vendas não marcadas" saiu.
//
// Venda de uma conversa (ERP, 07/11): registrada pelo 💰 (sales.wa_chat_id), ligada pelo 📈 (wa_conversion_events.sale_id)
// ou venda do ERP com o telefone de uma conversa conhecida. A conversa pode ter começado antes do rastreamento (sem
// wa_leads): ela entra pelo próprio chat da venda, marcada como "início não registrado", com as vendas do período.
import { addDays, normalizePhone, spDay, spStartOfDay, DAY_MS, type ActivityDayRow, type ActivityRow, type AttributionRow, type LeadRow, type Range, type ReplyRow, type SaleRowP, type SendRow, saleTime } from './waPanel.ts';
import { eventKind } from './waConversions.ts';

// ── Linhas ────────────────────────────────────────────────────────────────
export interface TrackLeadRow extends LeadRow { last_message_at?: string | null }
export interface TrackAttributionRow extends AttributionRow { contact_name?: string | null }
export interface TrackSaleRow extends SaleRowP { customer_name?: string | null }
export interface TrackConversionRow {
  chat_id: string | null; event_name?: string | null; error: string | null; value: number | string | null;
  test: boolean; status: string; created_at: string; contact_name?: string | null; sale_id?: string | null;
  sale_link_set_chat?: boolean | null; ad_title?: string | null;
}
export interface ChatNameRow { chat_id: string; name: string; source?: string | null }
export interface TrackInput {
  leads: TrackLeadRow[]; attributions: TrackAttributionRow[]; sends: SendRow[]; replies: ReplyRow[];
  sales: TrackSaleRow[]; names: ChatNameRow[]; conversions: TrackConversionRow[];
  activity?: ActivityRow[]; activityDays?: ActivityDayRow[]; // 2.12.8
}

export type OriginFilter = 'todas' | 'anuncio' | 'nao_rastreada';
export type Stage = 'contato' | 'respondeu' | 'comprou';
export const STAGE_LABEL: Record<Stage, string> = { contato: 'Fez contato', respondeu: 'Respondeu', comprou: 'Comprou' };
// 2.12.8: filtro de etapa da tabela
export type StageFilter = 'todas' | 'comprou' | 'respondeu' | 'contato';
export const STAGE_FILTERS: [StageFilter, string][] = [['todas', 'Todas'], ['comprou', 'Comprou'], ['respondeu', 'Respondeu'], ['contato', 'Só fez contato']];
export const filterStage = <T extends { stage: Stage }>(list: T[], f: StageFilter): T[] => (f === 'todas' ? list : list.filter((c) => c.stage === f));

const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const money2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (t: number, r: Pick<Range, 'from' | 'to'>) => t >= r.from && t <= r.to;

// ── Telefone ──────────────────────────────────────────────────────────────
// "5511987654321" → "(11) 98765-4321"; fora do Brasil → "+<dígitos>"
export function formatPhone(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  const n = normalizePhone(d);
  if (n) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    return rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return d ? `+${d}` : '';
}
// telefone para o link wa.me (só dígitos, com o 55), ou null
export const waLinkOf = (phone: string | null | undefined) => {
  const n = normalizePhone(phone);
  if (n) return `https://wa.me/${n}`;
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? `https://wa.me/${d}` : null;
};

// ── Horário comercial (para o tempo da 1ª resposta) ────────────────────────
// O mesmo do motor de envios da extensão (wa_settings: business_days 0 = domingo, business_start/end "HH:MM"),
// no horário de São Paulo. Sem wa_settings: o padrão do motor (seg–sáb, 9h às 19h).
export interface BusinessHours { days: number[]; startMin: number; endMin: number }
export const DEFAULT_BUSINESS_HOURS: BusinessHours = { days: [1, 2, 3, 4, 5, 6], startMin: 9 * 60, endMin: 19 * 60 };
const parseHM = (v: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
};
export function businessHoursOf(settings: { business_days?: unknown; business_start?: unknown; business_end?: unknown } | null | undefined): BusinessHours {
  if (!settings) return DEFAULT_BUSINESS_HOURS;
  const days = Array.isArray(settings.business_days) ? settings.business_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : DEFAULT_BUSINESS_HOURS.days;
  return { days, startMin: parseHM(settings.business_start) ?? DEFAULT_BUSINESS_HOURS.startMin, endMin: parseHM(settings.business_end) ?? DEFAULT_BUSINESS_HOURS.endMin };
}
const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const hm = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
export const businessHoursLabel = (bh: BusinessHours) => `${bh.days.length ? [...bh.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ') : 'nenhum dia'}, ${hm(bh.startMin)} às ${hm(bh.endMin)}`;
export function businessMinutesBetween(a: number, b: number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  if (!(b > a) || bh.endMin <= bh.startMin) return 0;
  let total = 0;
  let day = spDay(a);
  for (let i = 0; i < 400; i++) {
    const start = spStartOfDay(day);
    if (start > b) break;
    const weekday = new Date(start + 12 * 3600000).getUTCDay(); // meio-dia em SP ainda é o mesmo dia em UTC
    if (bh.days.includes(weekday)) {
      const from = Math.max(a, start + bh.startMin * 60000);
      const to = Math.min(b, start + bh.endMin * 60000);
      if (to > from) total += to - from;
    }
    day = addDays(day, 1);
  }
  return total / 60000;
}

// ── Vendas ligadas às conversas ───────────────────────────────────────────
export type SaleHow = 'zap' | 'compra' | 'telefone';
export const SALE_HOW_LABEL: Record<SaleHow, string> = {
  zap: 'registrada pelo 💰 nesta conversa',
  compra: 'ligada pelo 📈 (Compra enviada ao Facebook)',
  telefone: 'venda do ERP com o telefone desta conversa',
};
export interface SaleLink { id: string; t: number; total: number; customer: string | null; how: SaleHow[]; convKey: string }

// ── Conversas ─────────────────────────────────────────────────────────────
export interface Conversation {
  key: string; chatId: string; chatIds: string[];
  // tracked = 1º contato registrado (wa_leads / wa_ad_attribution); false = começou antes do rastreamento e
  // entrou pela venda (o início é a 1ª atividade conhecida)
  tracked: boolean;
  name: string; nameSource: 'aprendido' | 'whatsapp' | 'telefone' | 'nenhum';
  phone: string | null; phoneLabel: string; waLink: string | null;
  ad: boolean; adId: string | null; adTitle: string | null;
  firstAt: number; lastAt: number;
  firstReplyAt: number | null; replyMinutes: number | null; replyBusinessMinutes: number | null;
  replied: boolean; stage: Stage;
  sales: number; revenue: number; saleIds: string[]; saleLinks: SaleLink[]; firstSaleAt: number | null;
  fbContact: boolean; fbPurchase: boolean;
  // 2.12.8: de quem foi a última mensagem (wa_chat_activity) e os dias (SP) em que o cliente mandou mensagem
  lastFrom: 'cliente' | 'loja' | null;
  customerDays: string[];
  // no período pedido (conversationsIn): lead novo do período / o cliente mandou mensagem no período
  periodLead: boolean; periodActive: boolean;
}
export interface TrackModel { conversations: Conversation[]; sales: SaleLink[] }

const lidPhoneOf = (chat: string | null | undefined, phone: string | null | undefined, into: Map<string, string>) => {
  const p = normalizePhone(phone);
  if (chat && p && /@lid$/.test(chat) && !into.has(chat)) into.set(chat, p);
};
const phoneOfCus = (chat: string | null | undefined) => {
  const m = /^(\d{8,15})@c\.us$/.exec(String(chat || ''));
  return m ? normalizePhone(m[1]) : null;
};

// Todas as conversas carregadas (sem filtro de período), uma por pessoa
export function buildConversations(input: TrackInput, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): TrackModel {
  // @lid → telefone: lead, anúncio e a venda registrada na conversa (o 💰 confere o telefone da conversa)
  const lidPhone = new Map<string, string>();
  const activity = input.activity || [];
  const activityDays = input.activityDays || [];
  input.leads.forEach((l) => lidPhoneOf(l.chat_id, l.phone, lidPhone));
  input.attributions.forEach((a) => lidPhoneOf(a.chat_id, a.phone, lidPhone));
  activity.forEach((a) => lidPhoneOf(a.chat_id, a.phone, lidPhone));
  input.sales.forEach((s) => lidPhoneOf(s.wa_chat_id, s.customer_phone, lidPhone));
  const keyOf = (chat: string | null | undefined): string | null => {
    if (!chat) return null;
    const p = phoneOfCus(chat) || lidPhone.get(chat);
    return p ? `tel:${p}` : `chat:${chat}`;
  };
  const realConv = input.conversions.filter((c) => !c.test && c.status === 'enviado');

  // 1. conversas com o 1º contato registrado (a mais antiga de cada pessoa)
  interface Seed { key: string; chatId: string; t: number; ad: boolean; adId: string | null; adTitle: string | null; tracked: boolean }
  const seeds = new Map<string, Seed>();
  const put = (s: Seed) => {
    const cur = seeds.get(s.key);
    if (!cur) { seeds.set(s.key, s); return; }
    const first = s.t < cur.t ? s : cur;
    seeds.set(s.key, { ...first, ad: s.ad || cur.ad, adId: first.adId || cur.adId || s.adId, adTitle: first.adTitle || cur.adTitle || s.adTitle });
  };
  input.leads.forEach((l) => { const k = keyOf(l.chat_id); const t = ts(l.first_message_at); if (k && Number.isFinite(t)) put({ key: k, chatId: l.chat_id, t, ad: l.origin === 'anuncio', adId: l.ad_id, adTitle: l.ad_title, tracked: true }); });
  input.attributions.forEach((a) => { const k = keyOf(a.chat_id); const t = ts(a.first_message_at); if (k && Number.isFinite(t)) put({ key: k, chatId: a.chat_id, t, ad: true, adId: a.ad_id, adTitle: a.ad_title, tracked: true }); });
  // 2.12.8: lead novo achado pela atividade (a conversa começou com o cliente) que não está em wa_leads
  activity.forEach((a) => {
    const k = keyOf(a.chat_id); const t = ts(a.first_message_at);
    if (a.is_new_lead === true && k && Number.isFinite(t) && !seeds.has(k)) put({ key: k, chatId: a.chat_id, t, ad: false, adId: null, adTitle: null, tracked: true });
  });

  // conversas que existem no WhatsApp (para a venda do ERP pelo telefone): registros + atividade + envios + respostas + eventos
  const known = new Set<string>(seeds.keys());
  [...activity.map((a) => a.chat_id), ...input.sends.map((s) => s.chat_id), ...input.replies.map((r) => r.chat_id), ...realConv.map((c) => c.chat_id), ...input.sales.map((s) => s.wa_chat_id)]
    .forEach((c) => { const k = keyOf(c); if (k) known.add(k); });

  // 2. vendas: por qual conversa e como foram ligadas
  const alias = new Map<string, string>(); // chave → chave da conversa
  const convOfKey = (k: string) => alias.get(k) || (seeds.has(k) ? k : null);
  const sales: SaleLink[] = [];
  input.sales.forEach((s) => {
    const t = saleTime(s);
    if (!Number.isFinite(t)) return;
    const links = realConv.filter((c) => c.sale_id && c.sale_id === s.id);
    const setByLink = links.some((c) => c.sale_link_set_chat === true);
    const how = new Set<SaleHow>();
    const chatKeys: string[] = [];
    if (s.wa_chat_id) { const k = keyOf(s.wa_chat_id); if (k) chatKeys.push(k); if (!setByLink) how.add('zap'); }
    links.forEach((c) => { const k = keyOf(c.chat_id); if (k) chatKeys.push(k); how.add('compra'); });
    const phone = normalizePhone(s.customer_phone);
    const phoneKey = phone && known.has(`tel:${phone}`) ? `tel:${phone}` : null;
    if (phoneKey && !chatKeys.includes(phoneKey)) how.add('telefone');
    const keys = [...new Set([...chatKeys, ...(phoneKey ? [phoneKey] : [])])];
    if (!keys.length) return;
    // a conversa: a que já existe por uma das chaves (chat da venda antes do telefone); senão, nova pelo 1º chat
    const conv = keys.map(convOfKey).find(Boolean) || keys[0];
    keys.forEach((k) => { if (!alias.has(k) && !seeds.has(k)) alias.set(k, conv); });
    if (!seeds.has(conv) && !alias.has(conv)) alias.set(conv, conv);
    sales.push({ id: s.id, t, total: Number(s.total_sale_price) || 0, customer: s.customer_name || null, how: [...how], convKey: conv });
  });

  // 3. agrupar tudo pela conversa
  const convKeyOf = (chat: string | null | undefined) => { const k = keyOf(chat); return k ? convOfKey(k) : null; };
  const group = <T>(rows: T[], chat: (r: T) => string | null | undefined) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => { const k = convKeyOf(chat(r)); if (k) m.set(k, [...(m.get(k) || []), r]); });
    return m;
  };
  const leadsByKey = group(input.leads, (l) => l.chat_id);
  const attrByKey = group(input.attributions, (a) => a.chat_id);
  // 2.12.8: conversas com atividade (todas, não só leads): cada uma vira conversa pela própria chave
  activity.forEach((a) => { const k = keyOf(a.chat_id); if (k && !convOfKey(k)) alias.set(k, k); });
  const actByKey = group(activity, (a) => a.chat_id);
  const daysByKey = new Map<string, Set<string>>();
  activityDays.forEach((d) => {
    if (!d.from_customer) return;
    const k = convKeyOf(d.chat_id);
    if (!k) return;
    const set = daysByKey.get(k) || new Set<string>();
    set.add(String(d.day).slice(0, 10));
    daysByKey.set(k, set);
  });
  const namesByKey = group(input.names, (n) => n.chat_id);
  const convByKey = group(realConv, (c) => c.chat_id);
  const timesOf = (rows: { chat: string | null; t: number }[]) => {
    const m = new Map<string, number[]>();
    rows.forEach((r) => { const k = convKeyOf(r.chat); if (k && Number.isFinite(r.t)) m.set(k, [...(m.get(k) || []), r.t]); });
    return m;
  };
  const sendTimes = timesOf(input.sends.filter((s) => s.status === 'enviado').map((s) => ({ chat: s.chat_id, t: ts(s.created_at) })));
  const replyTimes = timesOf(input.replies.map((r) => ({ chat: r.chat_id, t: ts(r.replied_at) })));
  const saleRows = new Map(input.sales.map((s) => [s.id, s]));
  const salesByConv = new Map<string, SaleLink[]>();
  sales.forEach((s) => salesByConv.set(s.convKey, [...(salesByConv.get(s.convKey) || []), s]));
  const convKeys = new Set<string>([...seeds.keys(), ...salesByConv.keys(), ...actByKey.keys()]);

  const conversations = [...convKeys].map((key): Conversation => {
    const seed = seeds.get(key) || null;
    const leads = leadsByKey.get(key) || [];
    const attrs = attrByKey.get(key) || [];
    const conv = convByKey.get(key) || [];
    const sends = sendTimes.get(key) || [];
    const replies = replyTimes.get(key) || [];
    const allSales = (salesByConv.get(key) || []).sort((a, b) => a.t - b.t);
    const acts = actByKey.get(key) || [];
    const customerDays = [...(daysByKey.get(key) || [])].sort();
    // conversa sem registro do início: começa na 1ª mensagem conhecida (atividade) ou na 1ª atividade conhecida
    // (dia com mensagem do cliente, envio, resposta, evento ou venda)
    const actFirst = acts.map((a) => ts(a.first_message_at)).filter(Number.isFinite);
    const firstAt = seed ? seed.t : actFirst.length ? Math.min(...actFirst) : Math.min(...[
      ...customerDays.map((d) => spStartOfDay(d)), ...acts.map((a) => ts(a.first_seen_at)), ...acts.map((a) => ts(a.last_message_at)),
      ...sends, ...replies, ...conv.map((c) => ts(c.created_at)), ...allSales.map((s) => s.t),
    ].filter(Number.isFinite));
    const own = seed ? allSales.filter((s) => s.t >= firstAt) : allSales;
    const saleChat = allSales.map((s) => saleRows.get(s.id)?.wa_chat_id).find(Boolean) || conv.map((c) => c.chat_id).find(Boolean) || null;
    const chatId = seed ? seed.chatId : acts.map((a) => a.chat_id).find(Boolean) || saleChat || key.replace(/^(tel|chat):/, '');
    const phone = [...leads.map((x) => x.phone), ...attrs.map((x) => x.phone), ...acts.map((x) => x.phone)].map((p) => normalizePhone(p)).find(Boolean)
      || (key.startsWith('tel:') ? key.slice(4) : null)
      || own.map((s) => normalizePhone(saleRows.get(s.id)?.customer_phone)).find(Boolean) || null;
    // nome: aprendido/manual (wa_chat_names) → nome do WhatsApp (anúncio / evento enviado) → cliente da venda → telefone
    const learned = (namesByKey.get(key) || []).map((n) => (n.name || '').trim()).find(Boolean);
    const waName = [...attrs.map((a) => a.contact_name), ...acts.map((a) => a.name), ...conv.map((c) => c.contact_name)].map((n) => (n || '').trim()).find(Boolean);
    const saleName = own.map((s) => (s.customer || '').trim()).find(Boolean);
    const phoneLabel = formatPhone(phone);
    const name = learned || waName || saleName || phoneLabel || '(sem nome)';
    const nameSource = learned ? 'aprendido' : waName || saleName ? 'whatsapp' : phoneLabel ? 'telefone' : 'nenhum';
    // 1ª resposta nossa: o 1º envio registrado depois da 1ª mensagem (só quando o início foi registrado)
    const firstReplyAt = seed ? sends.filter((t) => t >= firstAt).reduce<number | null>((a, t) => (a == null || t < a ? t : a), null) : null;
    const replied = replies.some((t) => t >= firstAt);
    const actLast = acts.map((a) => ({ t: ts(a.last_message_at), from: a.last_from })).filter((x) => Number.isFinite(x.t)).sort((a, b) => b.t - a.t)[0] || null;
    const lastAt = Math.max(firstAt, ...[...leads.map((x) => ts(x.last_message_at)), ...acts.map((a) => ts(a.last_customer_at)), actLast ? actLast.t : NaN, ...sends, ...replies]
      .filter((t) => Number.isFinite(t) && t >= firstAt));
    // de quem foi a última: a da atividade, se ela for a mais nova que se conhece
    const lastFrom = actLast && actLast.t >= lastAt && (actLast.from === 'cliente' || actLast.from === 'loja') ? actLast.from : null;
    const saleAd = own.some((s) => saleRows.get(s.id)?.origin === 'anuncio');
    const convAd = conv.map((c) => c.ad_title).find(Boolean) || null;
    const ad = seed ? seed.ad : saleAd || !!convAd;
    return {
      key, chatId, chatIds: [...new Set([chatId, ...leads.map((x) => x.chat_id), ...attrs.map((x) => x.chat_id), ...acts.map((x) => x.chat_id)].filter(Boolean))], tracked: !!seed,
      name, nameSource, phone, phoneLabel, waLink: waLinkOf(phone),
      ad, adId: seed ? seed.adId : null, adTitle: seed ? seed.adTitle : convAd,
      firstAt, lastAt,
      firstReplyAt, replyMinutes: firstReplyAt == null ? null : (firstReplyAt - firstAt) / 60000,
      replyBusinessMinutes: firstReplyAt == null ? null : businessMinutesBetween(firstAt, firstReplyAt, bh),
      replied, stage: 'contato', sales: 0, revenue: 0, saleIds: [], saleLinks: own, firstSaleAt: null,
      fbContact: conv.some((c) => eventKind(c) === 'Contato'), fbPurchase: conv.some((c) => eventKind(c) === 'Compra'),
      lastFrom, customerDays, periodLead: false, periodActive: false,
    };
  }).map((c) => withSales(c));
  return { conversations, sales };
}

// vendas da conversa (as de saleLinks) → contagem, valor, etapa
function withSales(c: Conversation, links = c.saleLinks): Conversation {
  const own = [...links].sort((a, b) => a.t - b.t);
  return {
    ...c, saleLinks: own, sales: own.length, revenue: money2(own.reduce((x, s) => x + s.total, 0)), saleIds: own.map((s) => s.id),
    firstSaleAt: own.length ? own[0].t : null, stage: own.length ? 'comprou' : c.replied ? 'respondeu' : 'contato',
  };
}

export const originMatches = (ad: boolean, f: OriginFilter) => f === 'todas' || (f === 'anuncio' ? ad : !ad);
// Conversas do período (2.12.8, como o Tintim):
//   - lead novo do período (1º contato no período): com as vendas depois do 1º contato;
//   - ATIVA no período (o cliente mandou mensagem no período: dia com mensagem do cliente ou resposta a um envio
//     nosso), nova ou antiga: com as vendas do período;
//   - que teve venda no período (mesmo sem mensagem registrada): com as vendas do período.
// periodLead / periodActive dizem por que a conversa entrou (para os cartões "Leads novos" e "Conversas ativas").
export function conversationsIn(model: TrackModel, r: Pick<Range, 'from' | 'to'>, f: OriginFilter, replies?: Pick<ReplyRow, 'chat_id' | 'replied_at'>[]): Conversation[] {
  const fromDay = spDay(r.from);
  const toDay = spDay(r.to);
  // respostas do cliente no período, pelas chaves de conversa (chatIds de cada conversa)
  const repliedChats = new Set((replies || []).filter((x) => inRange(ts(x.replied_at), r)).map((x) => x.chat_id));
  const out: Conversation[] = [];
  model.conversations.forEach((c) => {
    if (!originMatches(c.ad, f)) return;
    const periodLead = c.tracked && inRange(c.firstAt, r);
    const periodActive = periodLead || c.customerDays.some((d) => d >= fromDay && d <= toDay) || c.chatIds.some((id) => repliedChats.has(id));
    if (periodLead) { out.push({ ...c, periodLead, periodActive }); return; }
    const inPeriod = c.saleLinks.filter((s) => inRange(s.t, r));
    if (periodActive || inPeriod.length) out.push({ ...withSales(c, inPeriod), periodLead, periodActive });
  });
  return out;
}

// ── Cartões ───────────────────────────────────────────────────────────────
export interface TrackSummary {
  total: number; fresh: number; older: number; ad: number; adPct: number | null; untracked: number; untrackedPct: number | null;
  answered: number; avgReplyMinutes: number | null;
  bought: number; sales: number; revenue: number; conversion: number | null;
  // 2.12.8: conversas ativas (o cliente mandou mensagem no período) e leads novos (1º contato no período)
  active: number; leads: number; leadsAd: number;
}
export function trackSummary(list: Conversation[], businessOnly = false): TrackSummary {
  const total = list.length;
  const fresh = list.filter((c) => c.periodLead).length;
  const ad = list.filter((c) => c.ad).length;
  const mins = list.map((c) => (businessOnly ? c.replyBusinessMinutes : c.replyMinutes)).filter((m): m is number => m != null);
  const bought = list.filter((c) => c.sales > 0).length;
  const sales = list.reduce((x, c) => x + c.sales, 0);
  return {
    total, fresh, older: total - fresh, ad, adPct: total ? ad / total : null, untracked: total - ad, untrackedPct: total ? (total - ad) / total : null,
    answered: mins.length, avgReplyMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    bought, sales, revenue: money2(list.reduce((x, c) => x + c.revenue, 0)), conversion: total ? bought / total : null,
    active: list.filter((c) => c.periodActive).length, leads: fresh, leadsAd: list.filter((c) => c.periodLead && c.ad).length,
  };
}

// ── Gráficos ──────────────────────────────────────────────────────────────
const daysOf = (r: Pick<Range, 'fromDay' | 'days'>) => Array.from({ length: r.days }, (_, i) => addDays(r.fromDay, i));

export interface OriginDay { day: string; anuncio: number; nao_rastreada: number }
export function originByDay(list: Conversation[], r: Pick<Range, 'fromDay' | 'days'>): OriginDay[] {
  const m = new Map(daysOf(r).map((day) => [day, { day, anuncio: 0, nao_rastreada: 0 }]));
  // 2.12.8: só os leads novos (a origem é do 1º contato), no dia do 1º contato
  list.forEach((c) => { if (!c.periodLead) return; const p = m.get(spDay(c.firstAt)); if (p) p[c.ad ? 'anuncio' : 'nao_rastreada']++; });
  return [...m.values()];
}

// Jornada (acumulada: quem comprou também passou por "respondeu")
export interface JourneyStep { stage: Stage; count: number; pct: number | null }
export function journey(list: Conversation[]): JourneyStep[] {
  const total = list.length;
  const responded = list.filter((c) => c.stage !== 'contato').length;
  const bought = list.filter((c) => c.stage === 'comprou').length;
  return [
    { stage: 'contato', count: total, pct: total ? 1 : null },
    { stage: 'respondeu', count: responded, pct: total ? responded / total : null },
    { stage: 'comprou', count: bought, pct: total ? bought / total : null },
  ];
}

// Vendas por dia. 'contato': vendas das conversas do período, no dia do 1º contato.
// 'venda': vendas das conversas com a data da venda no período (de conversas de qualquer data), pela origem da conversa.
export type SalesDateMode = 'contato' | 'venda';
export interface SalesDay { day: string; vendas: number; receita: number }
export function salesByDay(model: TrackModel, r: Range, f: OriginFilter, mode: SalesDateMode): SalesDay[] {
  const m = new Map(daysOf(r).map((day) => [day, { day, vendas: 0, receita: 0 }]));
  const add = (t: number, total: number) => { const p = m.get(spDay(t)); if (p) { p.vendas++; p.receita = money2(p.receita + total); } };
  if (mode === 'contato') {
    conversationsIn(model, r, f).forEach((c) => c.saleLinks.forEach((s) => add(c.firstAt, s.total)));
  } else {
    const adOf = new Map(model.conversations.map((c) => [c.key, c.ad]));
    model.sales.filter((s) => inRange(s.t, r) && originMatches(!!adOf.get(s.convKey), f)).forEach((s) => add(s.t, s.total));
  }
  return [...m.values()];
}

// Como cada venda da conversa foi ligada (para o (i) da tabela)
export function saleLinksText(c: Pick<Conversation, 'saleLinks'>, money: (n: number) => string): string {
  return c.saleLinks.map((s) => `#${s.id.slice(0, 8)} ${money(s.total)}: ${s.how.map((h) => SALE_HOW_LABEL[h]).join(' + ')}`).join('; ');
}

// ── Tabela: busca, ordem, CSV ─────────────────────────────────────────────
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function searchConversations(list: Conversation[], q: string): Conversation[] {
  const text = fold(q.trim());
  if (!text) return list;
  const digits = q.replace(/\D/g, '');
  return list.filter((c) => fold(c.name).includes(text) || (c.adTitle ? fold(c.adTitle).includes(text) : false)
    || (digits.length >= 3 && (c.phone || '').includes(digits)));
}

// 2.12.8: paginação (a mesma da tabela Conversas e dos Eventos enviados ao Facebook). A página pedida é
// ajustada ao que existe (a lista pode diminuir na atualização automática): nunca passa da última.
export interface PageInfo { page: number; pages: number; from: number; to: number; total: number; label: string; hasPrev: boolean; hasNext: boolean }
export function pageInfo(total: number, page: number, size: number, noun: [string, string] = ['conversa', 'conversas']): PageInfo {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const per = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(n / per));
  const p = Math.min(Math.max(0, Math.floor(Number(page) || 0)), pages - 1);
  const from = p * per;
  return {
    page: p, pages, from, to: Math.min(n, from + per), total: n, hasPrev: p > 0, hasNext: p + 1 < pages,
    label: `Página ${p + 1} de ${pages} · ${n.toLocaleString('pt-BR')} ${n === 1 ? noun[0] : noun[1]}`,
  };
}

export type SortKey = 'name' | 'origin' | 'stage' | 'firstAt' | 'lastAt' | 'revenue' | 'reply';
export const DEFAULT_SORT: { key: SortKey; desc: boolean } = { key: 'lastAt', desc: true }; // 2.12.8: como o Tintim
const STAGE_ORDER: Record<Stage, number> = { contato: 0, respondeu: 1, comprou: 2 };
export function sortConversations(list: Conversation[], key: SortKey, desc: boolean): Conversation[] {
  const val = (c: Conversation): number | string | null => {
    switch (key) {
      case 'name': return fold(c.name);
      case 'origin': return c.ad ? `0${fold(c.adTitle || '')}` : '1';
      case 'stage': return STAGE_ORDER[c.stage] * 1e9 + c.revenue;
      case 'lastAt': return c.lastAt;
      case 'revenue': return c.revenue;
      case 'reply': return c.replyMinutes;
      default: return c.firstAt;
    }
  };
  return [...list].sort((a, b) => {
    const va = val(a); const vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // vazio sempre no fim
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return (desc ? -c : c) || b.lastAt - a.lastAt || b.firstAt - a.firstAt || a.key.localeCompare(b.key);
  });
}

const dt = (ms: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms - 3 * 3600000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
};
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// CSV com ";" (Excel em português) e vírgula decimal
export function conversationsCsv(list: Conversation[]): string {
  const head = ['Contato', 'Telefone', 'Origem', 'Anúncio', 'Etapa', 'Vendas', 'Valor', 'Lead novo no período', 'Primeira mensagem', 'Última mensagem', 'Última mensagem de', '1ª resposta (min)', 'Contato enviado ao Facebook', 'Compra enviada ao Facebook'];
  const rows = list.map((c) => [
    c.name, c.phoneLabel, c.ad ? 'Meta Ads' : 'Não rastreada', c.adTitle || '', STAGE_LABEL[c.stage], c.sales, c.revenue.toFixed(2).replace('.', ','), c.periodLead ? 'sim' : 'não',
    `${dt(c.firstAt)}${c.tracked ? '' : ' (início não registrado)'}`, dt(c.lastAt), c.lastFrom || '', c.replyMinutes == null ? '' : Math.round(c.replyMinutes), c.fbContact ? 'sim' : 'não', c.fbPurchase ? 'sim' : 'não',
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

// Filtro de sales.sale_date (que tem hora) para a janela: do 1º dia (inclusive) até o dia SEGUINTE ao último
// (exclusive). "sale_date <= último dia" cortava as vendas feitas no último dia (hoje).
export function saleDateFilter(w: { from: number; until: number }) {
  const day = (ms: number) => spDay(ms);
  return { gte: day(w.from), lt: day(w.until + DAY_MS) };
}

// Janela de dados que a aba precisa carregar
export function trackingWindow(r: Range, now = Date.now()) {
  return {
    knownFrom: r.from - 90 * DAY_MS, // conversas antigas: para não contar de novo e reconhecer o telefone da venda
    from: r.from,
    until: Math.max(r.to, now), // respostas, envios e vendas depois do período ainda contam para as conversas dele
  };
}
