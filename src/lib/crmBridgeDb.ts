// Consultas da ponte vendas → CRM (aba WhatsApp do ERP). Sempre com o helper de paginação
// (fetchAllRows, páginas de 1000) e listas de ids em lotes de 150.
import { supabase } from './supabase';
import { fetchAllRows, chunk } from './resumoAnualCalc';
import {
  normalizePhone, contactKey, chatIdOf, INVALID_STATUSES, FINALIZED_STATUSES, periodRange,
  type ClientFilters, type SaleRow, type SaleItemRow, type Client,
} from './crmBridge';

const SALE_COLS = 'id, customer_name, customer_phone, sale_date, total_sale_price, status, city, neighborhood, delivery_type';

export async function hasColumn(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

export async function loadFilterOptions() {
  const [products, cities, neighborhoods] = await Promise.all([
    fetchAllRows<{ id: string; model: string; color: string | null; category: string | null }>((f, t) =>
      supabase.from('products').select('id, model, color, category').order('model').order('id').range(f, t)),
    fetchAllRows<{ id: string; name: string }>((f, t) => supabase.from('cities').select('id, name').order('name').order('id').range(f, t)),
    fetchAllRows<{ id: string; name: string }>((f, t) => supabase.from('neighborhoods').select('id, name').order('name').order('id').range(f, t)),
  ]);
  return { products, cities, neighborhoods };
}

// Vendas válidas com os filtros que o banco resolve; itens dessas vendas (para produto e último produto)
export async function loadClientSales(f: ClientFilters): Promise<{ sales: SaleRow[]; items: SaleItemRow[] }> {
  const range = periodRange(f);
  const sales = await fetchAllRows<SaleRow>((from, to) => {
    let q = supabase.from('sales').select(SALE_COLS);
    if (f.onlyFinalized) q = q.in('status', FINALIZED_STATUSES);
    else q = q.neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1]);
    if (range.gte) q = q.gte('sale_date', range.gte);
    if (range.lte) q = q.lte('sale_date', range.lte);
    if (f.city) q = q.eq('city', f.city);
    if (f.neighborhood) q = q.eq('neighborhood', f.neighborhood);
    if (f.deliveryType) q = q.eq('delivery_type', f.deliveryType);
    if (f.minTotal !== '' && Number.isFinite(Number(f.minTotal))) q = q.gte('total_sale_price', Number(f.minTotal));
    if (f.maxTotal !== '' && Number.isFinite(Number(f.maxTotal))) q = q.lte('total_sale_price', Number(f.maxTotal));
    return q.order('sale_date').order('id').range(from, to);
  });
  const items: SaleItemRow[] = [];
  for (const ids of chunk(sales.map((s) => s.id), 150)) {
    items.push(...await fetchAllRows<any>((from, to) => supabase.from('sale_items')
      .select('sale_id, product_id, quantity, products(model, color)').in('sale_id', ids).order('id').range(from, to)));
  }
  return { sales, items };
}

export interface WaLabelRow { id: string; name: string; color: string; position: number }

export async function loadLabels(): Promise<WaLabelRow[]> {
  return fetchAllRows<WaLabelRow>((f, t) => supabase.from('wa_labels').select('id, name, color, position').order('position').order('id').range(f, t));
}

export async function createLabel(name: string, color: string): Promise<WaLabelRow> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 40) throw new Error('Nome da etiqueta CRM: 1 a 40 caracteres');
  const last = await supabase.from('wa_labels').select('position').order('position', { ascending: false }).limit(1);
  const position = last.data && last.data.length ? (Number(last.data[0].position) || 0) + 1 : 0;
  const { data, error } = await supabase.from('wa_labels').insert({ name: clean, color, position }).select('id, name, color, position').single();
  if (error) throw new Error(error.code === '23505' ? 'Já existe uma etiqueta CRM com esse nome' : error.message);
  return data as WaLabelRow;
}

export interface PushResult { added: number; already: number; skipped: number; created: number }

// Cria/atualiza os contatos (mesma identidade da extensão) e marca a etiqueta (sem duplicar).
// chat_id = "<dígitos>@c.us" só se a coluna existir e estiver vazia.
export async function pushPhonesToLabel(
  people: { phone: string | null; name: string }[],
  labelId: string,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<PushResult> {
  const byPhone = new Map<string, string>();
  let skipped = 0;
  people.forEach((p) => {
    const d = normalizePhone(p.phone);
    if (!d) { skipped++; return; }
    if (!byPhone.has(d) || (!byPhone.get(d) && p.name)) byPhone.set(d, p.name || '');
  });
  const phones = [...byPhone.keys()];
  const withChat = await hasColumn('wa_contacts', 'chat_id');
  const res: PushResult = { added: 0, already: 0, skipped, created: 0 };
  let done = 0;
  onProgress(0, phones.length);
  for (const part of chunk(phones, 100)) {
    const keys = part.map(contactKey);
    const cols = withChat ? 'id, key, name, chat_id' : 'id, key, name';
    const existing = await fetchAllRows<any>((f, t) => supabase.from('wa_contacts').select(cols).in('key', keys).order('id').range(f, t));
    const have = new Set(existing.map((c) => c.key));
    const fresh = part.filter((d) => !have.has(contactKey(d))).map((d) => ({
      key: contactKey(d), phone: d, name: byPhone.get(d) || null, updated_at: new Date().toISOString(),
      ...(withChat ? { chat_id: chatIdOf(d) } : {}),
    }));
    if (fresh.length) {
      const { error } = await supabase.from('wa_contacts').upsert(fresh, { onConflict: 'key', ignoreDuplicates: true });
      if (error) throw error;
      res.created += fresh.length;
    }
    const contacts = fresh.length ? await fetchAllRows<any>((f, t) => supabase.from('wa_contacts').select(cols).in('key', keys).order('id').range(f, t)) : existing;
    if (withChat) {
      for (const c of contacts) {
        if (!c.chat_id) await supabase.from('wa_contacts').update({ chat_id: chatIdOf(String(c.key).slice(4)) }).eq('id', c.id).is('chat_id', null);
      }
    }
    const ids = contacts.map((c) => c.id);
    const linked = ids.length ? await fetchAllRows<any>((f, t) => supabase.from('wa_contact_labels').select('contact_id').eq('label_id', labelId).in('contact_id', ids).order('contact_id').range(f, t)) : [];
    const had = new Set(linked.map((l) => l.contact_id));
    const toAdd = ids.filter((id) => !had.has(id)).map((id) => ({ contact_id: id, label_id: labelId }));
    if (toAdd.length) {
      const { error } = await supabase.from('wa_contact_labels').upsert(toAdd, { onConflict: 'contact_id,label_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    res.added += toAdd.length;
    res.already += had.size;
    done += part.length;
    onProgress(done, phones.length);
  }
  return res;
}

export const pushClientsToLabel = (clients: Client[], labelId: string, onProgress?: (d: number, t: number) => void) =>
  pushPhonesToLabel(clients.map((c) => ({ phone: c.phone, name: c.name })), labelId, onProgress);

// ── Pós-venda automático (wa_settings) ──
export interface AutoClientSettings { available: boolean; enabled: boolean; labelId: string | null }

export async function loadAutoClient(): Promise<AutoClientSettings> {
  const { data, error } = await supabase.from('wa_settings').select('auto_client_enabled, auto_client_label_id').eq('id', 1).maybeSingle();
  if (error) return { available: false, enabled: false, labelId: null };
  return { available: true, enabled: !!(data && data.auto_client_enabled), labelId: (data && data.auto_client_label_id) || null };
}

export async function saveAutoClient(enabled: boolean, labelId: string | null) {
  const { error } = await supabase.from('wa_settings').update({ auto_client_enabled: enabled, auto_client_label_id: labelId, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw error;
}

// Vendas finalizadas nos últimos X dias (para "aplicar também às vendas já finalizadas")
export async function finalizedSalesSince(days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return fetchAllRows<{ id: string; customer_name: string | null; customer_phone: string | null }>((f, t) => supabase.from('sales')
    .select('id, customer_name, customer_phone').not('finalized_at', 'is', null).gte('finalized_at', since).order('id').range(f, t));
}

// ── Resultados ──
export async function loadResults(days: number) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const out: {
    logAvailable: boolean; originAvailable: boolean;
    logs: { source: string; status: string; created_at: string; contact_id: string | null; chat_id: string | null }[];
    sales: { id: string; sale_date: string; total_sale_price: number | null; customer_phone: string | null; wa_chat_id?: string | null; origin?: string | null; ad_title?: string | null }[];
    contacts: { id: string; phone: string | null }[];
  } = { logAvailable: true, originAvailable: true, logs: [], sales: [], contacts: [] };
  try {
    out.logs = await fetchAllRows<any>((f, t) => supabase.from('wa_send_log').select('source, status, created_at, contact_id, chat_id').in('source', ['follow', 'disparo', 'agendado']).gte('created_at', sinceIso).order('id').range(f, t));
  } catch { out.logAvailable = false; }
  out.originAvailable = await hasColumn('sales', 'wa_chat_id');
  const cols = out.originAvailable ? 'id, sale_date, total_sale_price, customer_phone, wa_chat_id, origin, ad_title' : 'id, sale_date, total_sale_price, customer_phone';
  out.sales = await fetchAllRows<any>((f, t) => supabase.from('sales').select(cols)
    .neq('status', INVALID_STATUSES[0]).neq('status', INVALID_STATUSES[1]).gte('sale_date', sinceIso.slice(0, 10)).order('id').range(f, t));
  const contactIds = [...new Set(out.logs.map((l) => l.contact_id).filter(Boolean))] as string[];
  for (const ids of chunk(contactIds, 150)) {
    out.contacts.push(...await fetchAllRows<any>((f, t) => supabase.from('wa_contacts').select('id, phone').in('id', ids).order('id').range(f, t)));
  }
  return out;
}
