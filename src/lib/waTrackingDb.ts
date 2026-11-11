// Leitura da aba Rastreamento: tudo em lotes de 1000 (fetchAllRows), sem o limite do Supabase.
// Tabela/coluna que ainda não existe (migration não aplicada) vira lista vazia + aviso, sem quebrar o resto.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { INVALID_STATUSES } from './crmBridge';
import type { ActivityDayRow, ActivityRow, Range, ReplyRow, SendRow } from './waPanel';
import {
  fbGapWindow, saleDateFilter, trackingWindow, type ChatNameRow, type TrackAttributionRow, type TrackConversionRow, type TrackInput, type TrackLeadRow, type TrackSaleRow,
} from './waTracking';

// settings: horário comercial do motor de envios (wa_settings), ou null
export interface TrackLoad { input: TrackInput; missing: string[]; settings: BusinessSettings | null }
export interface BusinessSettings { business_days?: number[] | null; business_start?: string | null; business_end?: string | null }

const iso = (ms: number) => new Date(ms).toISOString();
// bloco "Anúncio" do 👁: source_app/source_url (desde 2.6.2); miniatura e tipo de mídia (migration 20261112120000 + extensão 2.15.2)
const ATTR_COLS = 'chat_id, phone, contact_name, ad_id, ad_title, source_app, source_url, first_message_at';
const ACTIVITY_LABEL = 'conversas ativas (migration 20261109120000_wa_chat_activity.sql + extensão 2.12.8)';

async function hasColumn(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}
async function orEmpty<T>(label: string, missing: string[], run: () => Promise<T[]>): Promise<T[]> {
  try { return await run(); } catch { missing.push(label); return []; }
}

export async function loadTracking(r: Range): Promise<TrackLoad> {
  const w = trackingWindow(r);
  const missing: string[] = [];
  const [trackCols, saleCols, originCol, eventCol, saleIdCol, thumbCol] = await Promise.all([
    hasColumn('wa_leads', 'last_message_at'), hasColumn('sales', 'wa_chat_id'), hasColumn('wa_send_log', 'origin'),
    hasColumn('wa_conversion_events', 'event_name'), hasColumn('wa_conversion_events', 'sale_id'), hasColumn('wa_ad_attribution', 'thumbnail_url'),
  ]);
  if (!trackCols) missing.push('última mensagem dos leads (migration 20261107120000 + extensão 2.12.2)');
  const leadCols = `chat_id, phone, first_message_at, origin, ad_id, ad_title${trackCols ? ', last_message_at' : ''}`;
  const sendCols = `id, chat_id, created_at, source, source_id, item_id, status${originCol ? ', origin, follow_step' : ''}`;
  const salesCols = `id, sale_date, created_at, total_sale_price, customer_phone, customer_name${saleCols ? ', wa_chat_id, origin' : ''}`;
  const attrCols = `${ATTR_COLS}${thumbCol ? ', thumbnail_url, media_type' : ''}`;
  const convCols = `chat_id, error, value, test, status, created_at, contact_name, ad_title${eventCol ? ', event_name' : ''}${saleIdCol ? ', sale_id, sale_link_set_chat' : ''}`;

  const [leads, attributions, sends, replies, sales, names, conversions, activity, activityDays] = await Promise.all([
    orEmpty<TrackLeadRow>('conversas novas (wa_leads)', missing, () => fetchAllRows<TrackLeadRow>((f, t) => supabase.from('wa_leads')
      .select(leadCols).gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(r.to)).order('id').range(f, t) as any)),
    orEmpty<TrackAttributionRow>('anúncios (wa_ad_attribution)', missing, () => fetchAllRows<TrackAttributionRow>((f, t) => supabase.from('wa_ad_attribution')
      .select(attrCols).gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(r.to))
      .order('id').range(f, t) as any)),
    orEmpty<SendRow>('envios (wa_send_log)', missing, () => fetchAllRows<SendRow>((f, t) => supabase.from('wa_send_log')
      .select(sendCols).eq('status', 'enviado').gte('created_at', iso(w.from)).lte('created_at', iso(w.until)).order('id').range(f, t) as any)),
    orEmpty<ReplyRow>('respostas (wa_replies)', missing, () => fetchAllRows<ReplyRow>((f, t) => supabase.from('wa_replies')
      .select('chat_id, replied_at, send_log_id, minutes').gte('replied_at', iso(w.from)).lte('replied_at', iso(w.until)).order('id').range(f, t) as any)),
    fetchAllRows<TrackSaleRow>((f, t) => supabase.from('sales').select(salesCols)
      .neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1])
      // sale_date tem hora: até o FIM do último dia (antes, "<= dia" cortava as vendas de hoje)
      .gte('sale_date', saleDateFilter(w).gte).lt('sale_date', saleDateFilter(w).lt).order('id').range(f, t) as any),
    orEmpty<ChatNameRow>('nomes (wa_chat_names)', missing, () => fetchAllRows<ChatNameRow>((f, t) => supabase.from('wa_chat_names')
      .select('chat_id, name, source').order('chat_id').range(f, t) as any)),
    orEmpty<TrackConversionRow>('conversões (wa_conversion_events)', missing, () => fetchAllRows<TrackConversionRow>((f, t) => supabase.from('wa_conversion_events')
      .select(convCols).gte('created_at', iso(w.from)).lte('created_at', iso(w.until)).order('event_id').range(f, t) as any)),
    // 2.12.8: todas as conversas com mensagem no período (sem a migration 20261109120000: só os leads, como antes)
    orEmpty<ActivityRow>(ACTIVITY_LABEL, missing, () => fetchAllRows<ActivityRow>((f, t) => supabase.from('wa_chat_activity')
      .select('chat_id, phone, name, first_seen_at, first_message_at, last_message_at, last_from, last_customer_at, is_new_lead').gte('last_message_at', iso(r.from))
      .order('chat_id').range(f, t) as any)),
    orEmpty<ActivityDayRow>(ACTIVITY_LABEL, missing, () => fetchAllRows<ActivityDayRow>((f, t) => supabase.from('wa_chat_activity_days')
      .select('chat_id, day, from_customer, from_store').gte('day', r.fromDay).lte('day', r.toDay)
      .order('chat_id').order('day').range(f, t) as any)),
  ]);
  // ERP 09/11: nomes das mensagens (linha do tempo da conversa); sem a coluna follow_step, só o título
  let items: { id: string; title: string; follow_step?: number | null }[] = [];
  for (const cols of ['id, title, follow_step', 'id, title']) {
    try { items = await fetchAllRows<{ id: string; title: string; follow_step?: number | null }>((f, t) => supabase.from('wa_items').select(cols).order('id').range(f, t) as any); break; } catch { items = []; }
  }
  let settings: BusinessSettings | null = null;
  try {
    const { data } = await supabase.from('wa_settings').select('business_days, business_start, business_end').eq('id', 1).maybeSingle();
    settings = (data as BusinessSettings | null) || null;
  } catch { settings = null; }
  return { input: { leads, attributions, sends, replies, sales, names, conversions, activity, activityDays, items }, missing: [...new Set(missing)], settings };
}

// ERP 09/11: anúncio de uma conversa pelo 👁 quando o registro não veio na janela da aba (1ª mensagem antiga ou sem data).
// Sem a coluna da miniatura (migration não aplicada): só as colunas que existem. Erro → lista vazia.
export async function loadAdAttributions(chatIds: string[]): Promise<TrackAttributionRow[]> {
  const ids = [...new Set(chatIds.filter(Boolean))].slice(0, 20);
  if (!ids.length) return [];
  for (const cols of [`${ATTR_COLS}, thumbnail_url, media_type`, ATTR_COLS]) {
    const { data, error } = await supabase.from('wa_ad_attribution').select(cols).in('chat_id', ids).limit(20);
    if (!error) return (data as unknown as TrackAttributionRow[]) || [];
  }
  return [];
}

// ERP 11/11: Vendas × Facebook (aba Rastreamento). Só leitura: as vendas do período e de ontem/hoje (para o aviso) e
// as Compras enviadas de 8 dias antes até 8 dias depois (para achar a Compra da mesma conversa).
export interface FbGapLoad { sales: TrackSaleRow[]; conversions: TrackConversionRow[]; missing: string[] }
export async function loadSalesFb(r: Range, now = Date.now()): Promise<FbGapLoad> {
  const w = fbGapWindow(r, now);
  const missing: string[] = [];
  const [chatCol, eventCol, saleIdCol] = await Promise.all([
    hasColumn('sales', 'wa_chat_id'), hasColumn('wa_conversion_events', 'event_name'), hasColumn('wa_conversion_events', 'sale_id'),
  ]);
  const salesCols = `id, sale_date, created_at, total_sale_price, customer_phone, customer_name${chatCol ? ', wa_chat_id' : ''}`;
  const convCols = `chat_id, error, value, test, status, created_at${eventCol ? ', event_name' : ''}${saleIdCol ? ', sale_id' : ''}`;
  const sf = saleDateFilter({ from: w.salesFrom, until: w.salesTo });
  const [sales, conversions] = await Promise.all([
    fetchAllRows<TrackSaleRow>((f, t) => supabase.from('sales').select(salesCols)
      .neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1])
      .gte('sale_date', sf.gte).lt('sale_date', sf.lt).order('id').range(f, t) as any),
    orEmpty<TrackConversionRow>('conversões (wa_conversion_events)', missing, () => fetchAllRows<TrackConversionRow>((f, t) => supabase.from('wa_conversion_events')
      .select(convCols).gte('created_at', iso(w.convFrom)).lte('created_at', iso(w.convTo)).order('event_id').range(f, t) as any)),
  ]);
  return { sales, conversions, missing };
}
