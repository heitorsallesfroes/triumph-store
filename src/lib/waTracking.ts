// Aba WhatsApp → Rastreamento: de onde vêm as conversas novas (anúncio ou não rastreada), quanto tempo
// a loja leva para responder, a jornada Fez contato → Respondeu → Comprou, as vendas por dia e a lista de
// conversas. Regras puras (sem React nem Supabase): node scripts/tests/waTracking.test.ts
//
// Fontes: wa_leads (1ª mensagem; 2.12.2: last_message_at e buy_signal_at), wa_ad_attribution (anúncio e
// nome do WhatsApp), wa_send_log (nossos envios, inclusive o que você digitou), wa_replies (o cliente
// respondeu a um envio nosso), sales (venda pelo WhatsApp, mesmo critério do Painel), wa_chat_names
// (nome aprendido/manual) e wa_conversion_events (Contato/Compra enviados ao Facebook).
// Datas no horário de São Paulo (UTC−3).
import {
  addDays, buildIndex, dedupeLeads, normalizePhone, spDay, spStartOfDay, DAY_MS,
  type AttributionRow, type LeadRow, type PanelInput, type Range, type ReplyRow, type SaleRowP, type SendRow, type WaSale,
} from './waPanel.ts';
import { eventKind } from './waConversions.ts';

// ── Linhas ────────────────────────────────────────────────────────────────
export interface TrackLeadRow extends LeadRow { last_message_at?: string | null; buy_signal_at?: string | null }
export interface TrackAttributionRow extends AttributionRow { contact_name?: string | null }
export interface TrackSaleRow extends SaleRowP { customer_name?: string | null }
export interface TrackConversionRow {
  chat_id: string | null; event_name?: string | null; error: string | null; value: number | string | null;
  test: boolean; status: string; created_at: string; contact_name?: string | null; sale_id?: string | null;
}
export interface ChatNameRow { chat_id: string; name: string; source?: string | null }
export interface TrackInput {
  leads: TrackLeadRow[]; attributions: TrackAttributionRow[]; sends: SendRow[]; replies: ReplyRow[];
  sales: TrackSaleRow[]; names: ChatNameRow[]; conversions: TrackConversionRow[];
}

export type OriginFilter = 'todas' | 'anuncio' | 'nao_rastreada';
export type Stage = 'contato' | 'respondeu' | 'comprou';
export const STAGE_LABEL: Record<Stage, string> = { contato: 'Fez contato', respondeu: 'Respondeu', comprou: 'Comprou' };

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
// Padrão: segunda a sábado, 8h às 18h (São Paulo). Conta só os minutos dentro desse horário.
export interface BusinessHours { days: number[]; startHour: number; endHour: number }
export const DEFAULT_BUSINESS_HOURS: BusinessHours = { days: [1, 2, 3, 4, 5, 6], startHour: 8, endHour: 18 };
export function businessMinutesBetween(a: number, b: number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  if (!(b > a)) return 0;
  let total = 0;
  let day = spDay(a);
  for (let i = 0; i < 400; i++) {
    const start = spStartOfDay(day);
    if (start > b) break;
    const weekday = new Date(start + 12 * 3600000).getUTCDay(); // meio-dia em SP ainda é o mesmo dia em UTC
    if (bh.days.includes(weekday)) {
      const open = start + bh.startHour * 3600000;
      const close = start + bh.endHour * 3600000;
      const from = Math.max(a, open);
      const to = Math.min(b, close);
      if (to > from) total += to - from;
    }
    day = addDays(day, 1);
  }
  return total / 60000;
}

// ── Conversas ─────────────────────────────────────────────────────────────
export interface Conversation {
  key: string; chatId: string; chatIds: string[];
  name: string; nameSource: 'aprendido' | 'whatsapp' | 'telefone' | 'nenhum';
  phone: string | null; phoneLabel: string; waLink: string | null;
  ad: boolean; adId: string | null; adTitle: string | null;
  firstAt: number; lastAt: number;
  firstReplyAt: number | null; replyMinutes: number | null; replyBusinessMinutes: number | null;
  replied: boolean; stage: Stage;
  sales: number; revenue: number; saleIds: string[]; firstSaleAt: number | null;
  fbContact: boolean; fbPurchase: boolean;
  buySignalAt: number | null;
}

export interface TrackModel { idx: ReturnType<typeof buildIndex>; conversations: Conversation[] }

function panelInputOf(input: TrackInput): PanelInput {
  return { leads: input.leads, replies: input.replies, sends: input.sends, sales: input.sales, attributions: input.attributions, items: [], names: {} };
}

// Todas as conversas novas carregadas (sem filtro de período), uma por pessoa
export function buildConversations(input: TrackInput): TrackModel {
  const pin = panelInputOf(input);
  const idx = buildIndex(pin);
  const keyOf = idx.keyOfChat;
  const group = <T>(rows: T[], chat: (r: T) => string | null | undefined) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => { const k = keyOf(chat(r)); if (k) m.set(k, [...(m.get(k) || []), r]); });
    return m;
  };
  const leadsByKey = group(input.leads, (l) => l.chat_id);
  const attrByKey = group(input.attributions, (a) => a.chat_id);
  const namesByKey = group(input.names, (n) => n.chat_id);
  const convByKey = group(input.conversions.filter((c) => !c.test && c.status === 'enviado'), (c) => c.chat_id);
  const sendTimes = new Map<string, number[]>();
  input.sends.forEach((s) => {
    const k = keyOf(s.chat_id);
    const t = ts(s.created_at);
    if (s.status === 'enviado' && k && Number.isFinite(t)) sendTimes.set(k, [...(sendTimes.get(k) || []), t]);
  });
  const replyTimes = new Map<string, number[]>();
  input.replies.forEach((x) => { const k = keyOf(x.chat_id); const t = ts(x.replied_at); if (k && Number.isFinite(t)) replyTimes.set(k, [...(replyTimes.get(k) || []), t]); });
  const saleNames = new Map(input.sales.map((s) => [s.id, s]));

  const conversations = dedupeLeads(pin, idx).map((l): Conversation => {
    const leads = leadsByKey.get(l.key) || [];
    const attrs = attrByKey.get(l.key) || [];
    const sales = (idx.salesByKey.get(l.key) || []).filter((s) => s.t >= l.t).sort((a, b) => a.t - b.t);
    const uniq = [...new Map(sales.map((s) => [s.id, s])).values()];
    // telefone: lead, anúncio, número da conversa, venda
    const phone = [...leads.map((x) => x.phone), ...attrs.map((x) => x.phone)].map((p) => normalizePhone(p)).find(Boolean)
      || (l.key.startsWith('tel:') ? l.key.slice(4) : null)
      || uniq.map((s) => normalizePhone(saleNames.get(s.id)?.customer_phone)).find(Boolean) || null;
    // nome: aprendido/manual (wa_chat_names) → nome do WhatsApp (anúncio / Contato enviado) → cliente da venda → telefone
    const learned = (namesByKey.get(l.key) || []).map((n) => (n.name || '').trim()).find(Boolean);
    const waName = [...attrs.map((a) => a.contact_name), ...(convByKey.get(l.key) || []).map((c) => c.contact_name)]
      .map((n) => (n || '').trim()).find(Boolean);
    const saleName = uniq.map((s) => (saleNames.get(s.id)?.customer_name || '').trim()).find(Boolean);
    const phoneLabel = formatPhone(phone);
    const name = learned || waName || saleName || phoneLabel || '(sem nome)';
    const nameSource = learned ? 'aprendido' : waName || saleName ? 'whatsapp' : phoneLabel ? 'telefone' : 'nenhum';
    // 1ª resposta nossa: o 1º envio registrado (você digitou, mensagem rápida, automação…) depois da 1ª mensagem
    const firstReplyAt = (sendTimes.get(l.key) || []).filter((t) => t >= l.t).reduce<number | null>((a, t) => (a == null || t < a ? t : a), null);
    const replied = (replyTimes.get(l.key) || []).some((t) => t >= l.t);
    const lastCandidates = [l.t, ...leads.map((x) => ts(x.last_message_at)), ...(sendTimes.get(l.key) || []), ...(replyTimes.get(l.key) || [])].filter((t) => Number.isFinite(t) && t >= l.t);
    const buy = leads.map((x) => ts(x.buy_signal_at)).filter((t) => Number.isFinite(t));
    const conv = convByKey.get(l.key) || [];
    const revenue = money2(uniq.reduce((x, s) => x + s.total, 0));
    return {
      key: l.key, chatId: l.chatId, chatIds: [...new Set([l.chatId, ...leads.map((x) => x.chat_id), ...attrs.map((x) => x.chat_id)])],
      name, nameSource, phone, phoneLabel, waLink: waLinkOf(phone),
      ad: l.ad, adId: l.adId, adTitle: l.adTitle,
      firstAt: l.t, lastAt: Math.max(...lastCandidates),
      firstReplyAt, replyMinutes: firstReplyAt == null ? null : (firstReplyAt - l.t) / 60000,
      replyBusinessMinutes: firstReplyAt == null ? null : businessMinutesBetween(l.t, firstReplyAt),
      replied, stage: uniq.length ? 'comprou' : replied ? 'respondeu' : 'contato',
      sales: uniq.length, revenue, saleIds: uniq.map((s) => s.id), firstSaleAt: uniq.length ? uniq[0].t : null,
      fbContact: conv.some((c) => eventKind(c) === 'Contato'), fbPurchase: conv.some((c) => eventKind(c) === 'Compra'),
      buySignalAt: buy.length ? Math.max(...buy) : null,
    };
  });
  return { idx, conversations };
}

export const originMatches = (ad: boolean, f: OriginFilter) => f === 'todas' || (f === 'anuncio' ? ad : !ad);
export function conversationsIn(model: TrackModel, r: Pick<Range, 'from' | 'to'>, f: OriginFilter): Conversation[] {
  return model.conversations.filter((c) => inRange(c.firstAt, r) && originMatches(c.ad, f));
}

// ── Cartões ───────────────────────────────────────────────────────────────
export interface TrackSummary {
  total: number; ad: number; adPct: number | null; untracked: number; untrackedPct: number | null;
  answered: number; avgReplyMinutes: number | null;
  bought: number; sales: number; revenue: number; conversion: number | null;
}
export function trackSummary(list: Conversation[], businessOnly = false): TrackSummary {
  const total = list.length;
  const ad = list.filter((c) => c.ad).length;
  const mins = list.map((c) => (businessOnly ? c.replyBusinessMinutes : c.replyMinutes)).filter((m): m is number => m != null);
  const bought = list.filter((c) => c.sales > 0).length;
  const sales = list.reduce((x, c) => x + c.sales, 0);
  return {
    total, ad, adPct: total ? ad / total : null, untracked: total - ad, untrackedPct: total ? (total - ad) / total : null,
    answered: mins.length, avgReplyMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    bought, sales, revenue: money2(list.reduce((x, c) => x + c.revenue, 0)), conversion: total ? bought / total : null,
  };
}

// ── Gráficos ──────────────────────────────────────────────────────────────
const daysOf = (r: Pick<Range, 'fromDay' | 'days'>) => Array.from({ length: r.days }, (_, i) => addDays(r.fromDay, i));

export interface OriginDay { day: string; anuncio: number; nao_rastreada: number }
export function originByDay(list: Conversation[], r: Pick<Range, 'fromDay' | 'days'>): OriginDay[] {
  const m = new Map(daysOf(r).map((day) => [day, { day, anuncio: 0, nao_rastreada: 0 }]));
  list.forEach((c) => { const p = m.get(spDay(c.firstAt)); if (p) p[c.ad ? 'anuncio' : 'nao_rastreada']++; });
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

// Vendas por dia. 'contato': vendas das conversas novas do período, no dia do 1º contato.
// 'venda': vendas pelo WhatsApp com a data da venda no período (de qualquer conversa), pela origem da conversa.
export type SalesDateMode = 'contato' | 'venda';
export interface SalesDay { day: string; vendas: number; receita: number }
export function salesByDay(model: TrackModel, r: Range, f: OriginFilter, mode: SalesDateMode): SalesDay[] {
  const m = new Map(daysOf(r).map((day) => [day, { day, vendas: 0, receita: 0 }]));
  const add = (t: number, total: number) => { const p = m.get(spDay(t)); if (p) { p.vendas++; p.receita = money2(p.receita + total); } };
  if (mode === 'contato') {
    const byId = new Map<string, WaSale>(model.idx.waSales.map((s) => [s.id, s]));
    conversationsIn(model, r, f).forEach((c) => {
      c.saleIds.forEach((id) => { const s = byId.get(id); if (s) add(c.firstAt, s.total); });
    });
  } else {
    model.idx.waSales.filter((s) => inRange(s.t, r) && originMatches(s.ad, f)).forEach((s) => add(s.t, s.total));
  }
  return [...m.values()];
}

// ── Possíveis vendas não marcadas ─────────────────────────────────────────
// Conversa do período com sinal de compra (pix, comprovante, paguei, endereço de entrega, pagamento) e sem venda ligada
export function possibleUnmarkedSales(list: Conversation[]): Conversation[] {
  return list.filter((c) => c.buySignalAt != null && c.buySignalAt >= c.firstAt && c.sales === 0)
    .sort((a, b) => (b.buySignalAt as number) - (a.buySignalAt as number));
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

export type SortKey = 'name' | 'origin' | 'stage' | 'firstAt' | 'lastAt' | 'revenue' | 'reply';
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
    return (desc ? -c : c) || b.firstAt - a.firstAt;
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
  const head = ['Contato', 'Telefone', 'Origem', 'Anúncio', 'Etapa', 'Vendas', 'Valor', 'Primeira mensagem', 'Última mensagem', '1ª resposta (min)', 'Contato enviado ao Facebook', 'Compra enviada ao Facebook'];
  const rows = list.map((c) => [
    c.name, c.phoneLabel, c.ad ? 'Meta Ads' : 'Não rastreada', c.adTitle || '', STAGE_LABEL[c.stage], c.sales, c.revenue.toFixed(2).replace('.', ','),
    dt(c.firstAt), dt(c.lastAt), c.replyMinutes == null ? '' : Math.round(c.replyMinutes), c.fbContact ? 'sim' : 'não', c.fbPurchase ? 'sim' : 'não',
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

// Janela de dados que a aba precisa carregar
export function trackingWindow(r: Range, now = Date.now()) {
  return {
    knownFrom: r.from - 90 * DAY_MS, // conversas antigas: para não contar de novo e reconhecer o telefone da venda
    from: r.from,
    until: Math.max(r.to, now), // respostas, envios e vendas depois do período ainda contam para as conversas dele
  };
}
