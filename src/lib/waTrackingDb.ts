// Leitura da aba Rastreamento: tudo em lotes de 1000 (fetchAllRows), sem o limite do Supabase.
// Tabela/coluna que ainda não existe (migration não aplicada) vira lista vazia + aviso, sem quebrar o resto.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { INVALID_STATUSES } from './crmBridge';
import type { Range, ReplyRow, SendRow } from './waPanel';
import {
  trackingWindow, type ChatNameRow, type TrackAttributionRow, type TrackConversionRow, type TrackInput, type TrackLeadRow, type TrackSaleRow,
} from './waTracking';

export interface TrackLoad { input: TrackInput; missing: string[] }

const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms - 3 * 3600000).slice(0, 10);

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
  const [trackCols, saleCols, originCol, eventCol, saleIdCol] = await Promise.all([
    hasColumn('wa_leads', 'last_message_at'), hasColumn('sales', 'wa_chat_id'), hasColumn('wa_send_log', 'origin'),
    hasColumn('wa_conversion_events', 'event_name'), hasColumn('wa_conversion_events', 'sale_id'),
  ]);
  if (!trackCols) missing.push('última mensagem e sinais de compra (migration 20261107120000 + extensão 2.12.2)');
  const leadCols = `chat_id, phone, first_message_at, origin, ad_id, ad_title${trackCols ? ', last_message_at, buy_signal_at' : ''}`;
  const sendCols = `id, chat_id, created_at, source, source_id, item_id, status${originCol ? ', origin' : ''}`;
  const salesCols = `id, sale_date, created_at, total_sale_price, customer_phone, customer_name${saleCols ? ', wa_chat_id, origin' : ''}`;
  const convCols = `chat_id, error, value, test, status, created_at, contact_name${eventCol ? ', event_name' : ''}${saleIdCol ? ', sale_id' : ''}`;

  const [leads, attributions, sends, replies, sales, names, conversions] = await Promise.all([
    orEmpty<TrackLeadRow>('conversas novas (wa_leads)', missing, () => fetchAllRows<TrackLeadRow>((f, t) => supabase.from('wa_leads')
      .select(leadCols).gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(r.to)).order('id').range(f, t) as any)),
    orEmpty<TrackAttributionRow>('anúncios (wa_ad_attribution)', missing, () => fetchAllRows<TrackAttributionRow>((f, t) => supabase.from('wa_ad_attribution')
      .select('chat_id, phone, contact_name, ad_id, ad_title, first_message_at').gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(r.to))
      .order('id').range(f, t) as any)),
    orEmpty<SendRow>('envios (wa_send_log)', missing, () => fetchAllRows<SendRow>((f, t) => supabase.from('wa_send_log')
      .select(sendCols).eq('status', 'enviado').gte('created_at', iso(w.from)).lte('created_at', iso(w.until)).order('id').range(f, t) as any)),
    orEmpty<ReplyRow>('respostas (wa_replies)', missing, () => fetchAllRows<ReplyRow>((f, t) => supabase.from('wa_replies')
      .select('chat_id, replied_at, send_log_id, minutes').gte('replied_at', iso(w.from)).lte('replied_at', iso(w.until)).order('id').range(f, t) as any)),
    fetchAllRows<TrackSaleRow>((f, t) => supabase.from('sales').select(salesCols)
      .neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1])
      .gte('sale_date', day(w.from)).lte('sale_date', day(w.until)).order('id').range(f, t) as any),
    orEmpty<ChatNameRow>('nomes (wa_chat_names)', missing, () => fetchAllRows<ChatNameRow>((f, t) => supabase.from('wa_chat_names')
      .select('chat_id, name, source').order('chat_id').range(f, t) as any)),
    orEmpty<TrackConversionRow>('conversões (wa_conversion_events)', missing, () => fetchAllRows<TrackConversionRow>((f, t) => supabase.from('wa_conversion_events')
      .select(convCols).gte('created_at', iso(w.from)).lte('created_at', iso(w.until)).order('event_id').range(f, t) as any)),
  ]);
  return { input: { leads, attributions, sends, replies, sales, names, conversions }, missing: [...new Set(missing)] };
}
