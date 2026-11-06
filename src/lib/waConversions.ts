// Conversões enviadas ao Facebook pela extensão do WhatsApp (tabela wa_conversion_events, gravada pela Edge
// Function meta-purchase-event). Regras puras (sem React nem Supabase) para poderem ser conferidas fora do navegador.

export interface ConversionRow {
  event_id: string;
  chat_id: string | null;
  contact_name: string | null;
  value: number | string | null;
  ad_id: string | null;
  ad_title: string | null;
  test: boolean;
  status: 'enviado' | 'falhou' | string;
  error: string | null;
  created_at: string;
  event_name?: string | null;
  sale_id?: string | null; // 2.10.5: venda do ERP ligada pelo 📈
}

// 2.10.5: venda do ERP ligada à compra ("#abcd1234 · cliente · R$"), ou "—"
export interface LinkedSale { id: string; customer_name: string | null; total_sale_price: number | string | null }
export function linkedSaleLabel(saleId: string | null | undefined, sale: LinkedSale | undefined, money: (n: number) => string): string {
  if (!saleId) return '—';
  const short = `#${String(saleId).slice(0, 8)}`;
  if (!sale) return `${short} (venda apagada ou sem acesso)`;
  return `${short} · ${sale.customer_name || 'cliente sem nome'} · ${money(Number(sale.total_sale_price) || 0)}`;
}

// "Compra" ou "Contato": a coluna event_name (2.6.0) ou, sem ela, o Contato marcado no erro / sem valor
export function eventKind(r: Pick<ConversionRow, 'event_name' | 'error' | 'value'>): 'Compra' | 'Contato' {
  if (r.event_name === 'Contact') return 'Contato';
  if (r.event_name === 'Purchase') return 'Compra';
  if (typeof r.error === 'string' && /^evento: Contact/.test(r.error)) return 'Contato';
  return r.value == null ? 'Contato' : 'Compra';
}

// Telefone mascarado a partir da conversa (o telefone nunca é guardado na tabela): só @c.us tem o número
export function maskPhone(chatId: string | null | undefined): string {
  const m = /^(\d{8,15})@c\.us$/.exec(String(chatId || ''));
  if (!m) return '—';
  const d = m[1];
  const last4 = d.slice(-4);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return rest.length === 9 ? `(${ddd}) ${rest[0]}****-${last4}` : `(${ddd}) ****-${last4}`;
  }
  return `***${last4}`;
}

export const hasAd = (r: Pick<ConversionRow, 'ad_id' | 'ad_title'>) => !!(r.ad_id || r.ad_title);

export interface ConversionTotals { purchases: number; purchaseSum: number; contacts: number }

// Totais do período: compras REAIS enviadas (quantidade e soma) e Contatos reais enviados
export function conversionTotals(rows: Pick<ConversionRow, 'event_name' | 'error' | 'value' | 'test' | 'status'>[]): ConversionTotals {
  const out: ConversionTotals = { purchases: 0, purchaseSum: 0, contacts: 0 };
  rows.forEach((r) => {
    if (r.test || r.status !== 'enviado') return;
    if (eventKind(r) === 'Compra') {
      out.purchases += 1;
      out.purchaseSum += Number(r.value) || 0;
    } else out.contacts += 1;
  });
  out.purchaseSum = Math.round(out.purchaseSum * 100) / 100;
  return out;
}

// Período (datas AAAA-MM-DD, inclusive) → limites ISO para o filtro de created_at
export function periodBounds(start: string, end: string): { from: string; to: string } {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}
