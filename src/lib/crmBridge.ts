// Ponte vendas do ERP → CRM do WhatsApp (aba WhatsApp do ERP).
// Arquivo puro (sem imports): normalização de telefone, filtros e agrupamento de clientes.
// A identidade do contato é a MESMA da extensão (wa_contacts.key = "tel:<dígitos>").

// Só dígitos; 10 ou 11 dígitos ganham o 55; 12 ou 13 começando com 55 ficam; o resto é inválido.
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export const contactKey = (digits: string) => `tel:${digits}`;
export const chatIdOf = (digits: string) => `${digits}@c.us`;

// Mesmo critério de "venda válida" dos relatórios (Relatório Mensal / Resumo Anual)
export const INVALID_STATUSES = ['cancelado', 'reembolsado'];
export const FINALIZED_STATUSES = ['finalizado', 'concluido'];

export interface SaleRow {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  sale_date: string;
  total_sale_price: number | null;
  status: string;
  city: string | null;
  neighborhood: string | null;
  delivery_type: string | null;
}

export interface SaleItemRow {
  sale_id: string;
  product_id: string;
  quantity: number;
  products?: { model: string | null; color: string | null } | null;
}

export interface Client {
  phone: string;
  name: string;
  purchases: number;
  total: number;
  lastDate: string;
  lastProduct: string;
}

export const productLabel = (p?: { model: string | null; color: string | null } | null) =>
  p ? [p.model, p.color].filter((x) => x && String(x).trim()).join(' ') : '';

// Agrupa as vendas por telefone normalizado. Vendas sem telefone válido ficam em "invalid".
// O nome e o último produto vêm da compra mais recente.
export function groupClients(sales: SaleRow[], items: SaleItemRow[]): { clients: Client[]; invalidSales: number; invalidPhones: number } {
  const itemsBySale = new Map<string, SaleItemRow[]>();
  items.forEach((i) => {
    const arr = itemsBySale.get(i.sale_id) || [];
    arr.push(i);
    itemsBySale.set(i.sale_id, arr);
  });
  const map = new Map<string, Client>();
  let invalidSales = 0;
  const invalidRaw = new Set<string>();
  [...sales].sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date))).forEach((s) => {
    const phone = normalizePhone(s.customer_phone);
    if (!phone) {
      invalidSales++;
      invalidRaw.add(String(s.customer_phone ?? '').replace(/\D/g, '') || `vazio:${s.id}`);
      return;
    }
    const its = [...(itemsBySale.get(s.id) || [])].sort((a, b) => b.quantity - a.quantity);
    const c = map.get(phone) || { phone, name: '', purchases: 0, total: 0, lastDate: '', lastProduct: '' };
    c.purchases += 1;
    c.total += Number(s.total_sale_price) || 0;
    if (String(s.sale_date) >= c.lastDate) {
      c.lastDate = String(s.sale_date);
      if (s.customer_name && s.customer_name.trim()) c.name = s.customer_name.trim();
      c.lastProduct = its.length ? productLabel(its[0].products) : c.lastProduct;
    }
    if (!c.name && s.customer_name) c.name = s.customer_name.trim();
    map.set(phone, c);
  });
  const clients = [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  return { clients, invalidSales, invalidPhones: invalidRaw.size };
}

export type PeriodMode = 'last_days' | 'between' | 'older_than' | 'all';

export interface ClientFilters {
  period: PeriodMode;
  days: number;
  start: string;
  end: string;
  productIds: string[];
  city: string;
  neighborhood: string;
  deliveryType: string;
  minTotal: string;
  maxTotal: string;
  minPurchases: number; // 1 = todos, 2 = 2+, 3 = 3+
  onlyFinalized: boolean;
}

// Data (YYYY-MM-DD) de "hoje menos N dias" no Brasil
export function brazilDateMinus(days: number, now = Date.now()): string {
  const d = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Intervalo de sale_date do filtro de período (mesmo formato dos relatórios: dia inteiro)
export function periodRange(f: Pick<ClientFilters, 'period' | 'days' | 'start' | 'end'>, now = Date.now()): { gte?: string; lte?: string } {
  if (f.period === 'last_days') return { gte: `${brazilDateMinus(Math.max(0, f.days - 1), now)}T00:00:00` };
  if (f.period === 'older_than') return { lte: `${brazilDateMinus(f.days, now)}T23:59:59` };
  if (f.period === 'between') return { ...(f.start ? { gte: `${f.start}T00:00:00` } : {}), ...(f.end ? { lte: `${f.end}T23:59:59` } : {}) };
  return {};
}

// Filtros que dependem dos itens (produto) e do agrupamento (nº de compras)
export function applyItemAndClientFilters(sales: SaleRow[], items: SaleItemRow[], f: Pick<ClientFilters, 'productIds' | 'minPurchases'>) {
  let kept = sales;
  if (f.productIds.length) {
    const wanted = new Set(f.productIds);
    const withProduct = new Set(items.filter((i) => wanted.has(i.product_id)).map((i) => i.sale_id));
    kept = sales.filter((s) => withProduct.has(s.id));
  }
  const g = groupClients(kept, items);
  return { ...g, clients: g.clients.filter((c) => c.purchases >= (f.minPurchases || 1)) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function clientsCsv(clients: Client[]): string {
  const lines = ['nome;telefone;compras;total;última compra'];
  clients.forEach((c) => lines.push([c.name, c.phone, c.purchases, c.total.toFixed(2).replace('.', ','), c.lastDate.slice(0, 10)].map(csvCell).join(';')));
  return lines.join('\n');
}

// ── Resultados ──
export interface ResultsInput {
  logs: { source: string; status: string; created_at: string; contact_id: string | null; chat_id: string | null }[];
  sales: { id: string; sale_date: string; total_sale_price: number | null; customer_phone: string | null; wa_chat_id?: string | null; origin?: string | null; ad_title?: string | null }[];
  contacts: { id: string; phone: string | null }[];
}

const brDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const DAY = 86400000;

export function computeResults({ logs, sales, contacts }: ResultsInput) {
  const bySource: Record<string, Record<string, number>> = {};
  logs.forEach((l) => {
    bySource[l.source] = bySource[l.source] || {};
    bySource[l.source][l.status] = (bySource[l.source][l.status] || 0) + 1;
  });
  const chatSales = sales.filter((s) => s.wa_chat_id);
  const sum = (list: typeof sales) => list.reduce((a, s) => a + (Number(s.total_sale_price) || 0), 0);
  const ad = sales.filter((s) => s.origin === 'anuncio');
  const org = sales.filter((s) => s.origin === 'organico');
  const titles = new Map<string, { count: number; total: number }>();
  ad.forEach((s) => {
    const t = (s.ad_title || '(sem título)').trim();
    const cur = titles.get(t) || { count: 0, total: 0 };
    cur.count++;
    cur.total += Number(s.total_sale_price) || 0;
    titles.set(t, cur);
  });
  const topAds = [...titles.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5);

  // Conversão: contato que recebeu envio automático (enviado) e comprou (mesmo telefone) até 7 dias depois
  const phoneByContact = new Map(contacts.map((c) => [c.id, normalizePhone(c.phone)]));
  const salesByPhone = new Map<string, number[]>();
  sales.forEach((s) => {
    const p = normalizePhone(s.customer_phone);
    if (!p) return;
    const t = Date.parse(s.sale_date);
    if (!Number.isFinite(t)) return;
    const arr = salesByPhone.get(p) || [];
    arr.push(t);
    salesByPhone.set(p, arr);
  });
  const reached = new Set<string>();
  const converted = new Set<string>();
  logs.filter((l) => l.status === 'enviado').forEach((l) => {
    const phone = (l.contact_id && phoneByContact.get(l.contact_id)) || (l.chat_id && /^\d+@c\.us$/.test(l.chat_id) ? normalizePhone(l.chat_id.split('@')[0]) : null);
    if (!phone) return;
    reached.add(phone);
    const sent = Date.parse(l.created_at);
    if ((salesByPhone.get(phone) || []).some((t) => t >= sent && t <= sent + 7 * DAY)) converted.add(phone);
  });

  const daily = new Map<string, { day: string; envios: number; vendas: number }>();
  const bump = (day: string, k: 'envios' | 'vendas') => {
    const cur = daily.get(day) || { day, envios: 0, vendas: 0 };
    cur[k]++;
    daily.set(day, cur);
  };
  logs.filter((l) => l.status !== 'pulado').forEach((l) => bump(brDay(l.created_at), 'envios'));
  sales.forEach((s) => bump(String(s.sale_date).slice(0, 10), 'vendas'));

  return {
    bySource,
    chatSales: { count: chatSales.length, total: sum(chatSales) },
    origin: { anuncio: { count: ad.length, total: sum(ad) }, organico: { count: org.length, total: sum(org) }, semOrigem: sales.length - ad.length - org.length },
    topAds,
    conversion: { reached: reached.size, converted: converted.size },
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// Mesma paleta das etiquetas CRM da extensão
export const LABEL_PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];
