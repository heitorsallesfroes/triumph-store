// Leitura do Painel de resultados do WhatsApp: tudo em lotes de 1000 (fetchAllRows), sem o limite do Supabase.
// Tabela/coluna que ainda não existe (migration não aplicada) vira lista vazia + aviso, sem quebrar o resto.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { INVALID_STATUSES } from './crmBridge';
import { conversionTotals, type ConversionRow } from './waConversions';
import {
  loadWindow, type AttributionRow, type ItemInfo, type LeadRow, type PanelInput, type PeriodRanges, type ReplyRow, type SaleRowP, type SendRow,
} from './waPanel';

export interface PanelLoad { input: PanelInput; missing: string[] }

const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms - 3 * 3600000).slice(0, 10);

async function hasColumn(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}
async function orEmpty<T>(label: string, missing: string[], run: () => Promise<T[]>): Promise<T[]> {
  try { return await run(); } catch { missing.push(label); return []; }
}

export async function loadPanel(ranges: PeriodRanges): Promise<PanelLoad> {
  const w = loadWindow(ranges);
  const missing: string[] = [];
  const [originCol, saleCols, stepCol] = await Promise.all([
    hasColumn('wa_send_log', 'origin'), hasColumn('sales', 'wa_chat_id'), hasColumn('wa_items', 'follow_step'),
  ]);
  if (!originCol) missing.push('origem dos envios');
  const sendCols = `id, chat_id, created_at, source, source_id, item_id, status${originCol ? ', origin, follow_step' : ''}`;
  const salesCols = `id, sale_date, created_at, total_sale_price, customer_phone${saleCols ? ', wa_chat_id, origin' : ''}`;

  const [leads, replies, sends, sales, attributions, items, conv] = await Promise.all([
    orEmpty<LeadRow>('leads (wa_leads)', missing, () => fetchAllRows<LeadRow>((f, t) => supabase.from('wa_leads')
      .select('chat_id, phone, first_message_at, origin, ad_id, ad_title').gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(ranges.cur.to))
      .order('id').range(f, t) as any)),
    orEmpty<ReplyRow>('respostas (wa_replies)', missing, () => fetchAllRows<ReplyRow>((f, t) => supabase.from('wa_replies')
      .select('chat_id, replied_at, send_log_id, minutes').gte('replied_at', iso(w.sendsFrom)).lte('replied_at', iso(w.until))
      .order('id').range(f, t) as any)),
    orEmpty<SendRow>('envios (wa_send_log)', missing, () => fetchAllRows<SendRow>((f, t) => supabase.from('wa_send_log')
      .select(sendCols).eq('status', 'enviado').gte('created_at', iso(w.sendsFrom)).lte('created_at', iso(w.until))
      .order('id').range(f, t) as any)),
    fetchAllRows<SaleRowP>((f, t) => supabase.from('sales').select(salesCols)
      .neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1])
      .gte('sale_date', day(w.sendsFrom)).lte('sale_date', day(w.until)).order('id').range(f, t) as any),
    orEmpty<AttributionRow>('anúncios (wa_ad_attribution)', missing, () => fetchAllRows<AttributionRow>((f, t) => supabase.from('wa_ad_attribution')
      .select('chat_id, phone, ad_id, ad_title, first_message_at').gte('first_message_at', iso(w.knownFrom)).lte('first_message_at', iso(ranges.cur.to))
      .order('id').range(f, t) as any)),
    orEmpty<ItemInfo>('mensagens rápidas', missing, () => fetchAllRows<ItemInfo>((f, t) => supabase.from('wa_items')
      .select(stepCol ? 'id, title, follow_step' : 'id, title').order('id').range(f, t) as any)),
    orEmpty<ConversionRow & { created_at: string }>('conversões', missing, () => fetchAllRows<ConversionRow>((f, t) => supabase.from('wa_conversion_events')
      .select('event_id, event_name, error, value, test, status, created_at').gte('created_at', iso(ranges.prev.from)).lte('created_at', iso(ranges.cur.to))
      .order('event_id').range(f, t) as any)),
  ]);

  // nomes das automações, réguas de follow e disparos (as tabelas que existirem)
  const names: Record<string, string> = {};
  await Promise.all(['wa_automations', 'wa_flows', 'wa_campaigns'].map(async (table) => {
    try {
      const rows = await fetchAllRows<{ id: string; name: string }>((f, t) => supabase.from(table).select('id, name').order('id').range(f, t) as any);
      rows.forEach((r) => { names[r.id] = r.name; });
    } catch { /* sem a tabela */ }
  }));

  const inCur = (r: { created_at: string }) => Date.parse(r.created_at) >= ranges.cur.from;
  const fbOf = (rows: ConversionRow[]) => { const t = conversionTotals(rows); return { count: t.purchases, total: t.purchaseSum }; };
  return {
    input: {
      leads, replies, sends, sales, attributions, items, names,
      fb: { cur: fbOf(conv.filter(inCur)), prev: fbOf(conv.filter((r) => !inCur(r))) },
    },
    missing: [...new Set(missing)],
  };
}
