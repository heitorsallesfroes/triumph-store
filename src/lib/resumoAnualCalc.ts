// Cálculo mensal usado pelo Resumo Anual.
// Espelha EXATAMENTE as regras do Relatório Mensal (src/pages/ResumoMensal.tsx):
// mesmos filtros, mesmas datas e mesmas fórmulas. Se mudar uma regra lá, mude aqui também.
// Arquivo puro (sem imports) para poder ser conferido fora do navegador.

const PAGE_SIZE = 1000;

// Busca todas as linhas de uma consulta em páginas de 1000 (limite do Supabase),
// para nunca cortar resultados. A consulta precisa ter uma ordenação estável.
export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Mês (1-12) de um campo date/timestamp como o Postgres compara no filtro do Relatório Mensal
// (sale_date e colunas date: o próprio texto YYYY-MM).
export const monthOfText = (d: string) => parseInt(String(d).substring(5, 7), 10);

// Mês (1-12) no horário de Brasília (UTC-3) — usado para created_at das pequenas vendas
// e finalized_at, que o Relatório Mensal filtra de 03:00Z a 03:00Z.
export const monthOfBRT = (ts: string) =>
  new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000).getUTCMonth() + 1;
export const yearOfBRT = (ts: string) =>
  new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000).getUTCFullYear();

export type CardFeeFn = (amount: number, method: string, brand: string | null, installments: number, saleDate?: string | null) => number;

export interface MonthInput {
  monthStr: string;          // 'YYYY-MM'
  currentMonthStr: string;   // mês atual 'YYYY-MM'
  sales: any[];              // vendas (smartwatch) do mês, já sem cancelado/reembolsado
  saleItems: any[];          // itens dessas vendas, com products(category)
  adSpendRows: any[];        // ad_spend do mês
  costPayments: any[];       // operational_cost_payments do mês
  allCosts: any[];           // operational_costs (todos)
  avulsos: any[];            // operational_costs_avulsos do mês
  motoboyExtras: any[];      // motoboy_payments do mês
  motoboyFeesSales: any[];   // sales motoboy finalizadas no mês (finalized_at)
  motoboyFeesSmall: any[];   // small_sales motoboy do mês
  smallSales: any[];         // small_sales do mês
  calculateCardFee: CardFeeFn;
  packagingCost: number;     // R$/un (system_config.packaging_cost)
}

export interface MonthResult {
  swVendas: number;
  swBruto: number;
  swCount: number;
  lucroSmartwatch: number;
  smallVendas: number;
  smallBruto: number;
  smallProfit: number;
  adSpend: number;
  operationalCosts: number;
  consolidadoBruto: number;
  consolidadoLucro: number;
  hasData: boolean;
}

const CARD_METHODS = ['credit_card', 'debit_card', 'payment_link'];

// Busca o ano inteiro (paginado) e calcula cada mês com computeMonth.
// Os filtros de cada tabela são os mesmos do Relatório Mensal, só que com o intervalo do ano;
// depois as linhas são separadas por mês usando a mesma data que o Relatório Mensal filtra.
export async function loadYearMonths(
  supabase: any,
  year: number,
  opts: { currentMonthStr: string; calculateCardFee: CardFeeFn; packagingCost: number },
): Promise<MonthResult[]> {
  const y = year;
  const yStart = `${y}-01-01`;
  const yEnd   = `${y}-12-31`;
  const yStartUTC = `${y}-01-01T03:00:00.000Z`;
  const yEndUTC   = `${y + 1}-01-01T03:00:00.000Z`;

  const [
    sales, adSpendRows, costPayments, allCosts, motoboyExtras,
    motoboyFeesSales, motoboyFeesSmall, avulsos, smallSales,
  ] = await Promise.all([
    fetchAllRows((f, t) => supabase.from('sales')
      .select('id,sale_date,total_sale_price,net_received,total_cost,delivery_fee,delivery_cost,delivery_type,status')
      .neq('status', 'cancelado')
      .neq('status', 'reembolsado')
      .gte('sale_date', yStart)
      .lte('sale_date', `${yEnd}T23:59:59`)
      .order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('ad_spend').select('id,amount,date')
      .gte('date', yStart).lte('date', yEnd).order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('operational_cost_payments').select('id,cost_id,amount_paid,month')
      .gte('month', `${y}-01`).lte('month', `${y}-12`).order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('operational_costs').select('id,amount,is_active,created_at')
      .order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('motoboy_payments').select('id,amount,date')
      .gte('date', yStart).lte('date', yEnd).order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('sales').select('id,delivery_fee,finalized_at')
      .eq('delivery_type', 'motoboy')
      .in('status', ['finalizado', 'concluido'])
      .gte('finalized_at', yStartUTC)
      .lt('finalized_at', yEndUTC)
      .order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('small_sales').select('id,delivery_fee,created_at')
      .eq('delivery_type', 'motoboy')
      .not('motoboy_id', 'is', null)
      .gte('created_at', yStartUTC)
      .lt('created_at', yEndUTC)
      .order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('operational_costs_avulsos').select('id,amount,date')
      .gte('date', yStart).lte('date', yEnd).order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('small_sales').select('*')
      .gte('created_at', `${yStart}T00:00:00-03:00`)
      .lte('created_at', `${yEnd}T23:59:59-03:00`)
      .order('id').range(f, t)),
  ]);

  // Itens das vendas (igual ao Relatório Mensal: pelos ids das vendas), em lotes.
  const saleItems: any[] = [];
  for (const ids of chunk(sales.map((s: any) => s.id), 150)) {
    saleItems.push(...await fetchAllRows((f, t) => supabase.from('sale_items')
      .select('id,sale_id,quantity,products(category)')
      .in('sale_id', ids)
      .order('id').range(f, t)));
  }
  const monthBySale = new Map<string, number>();
  sales.forEach((s: any) => monthBySale.set(s.id, monthOfText(s.sale_date)));

  const by = <T>(rows: T[], getMonth: (r: T) => number) => {
    const buckets: T[][] = Array.from({ length: 12 }, () => []);
    rows.forEach(r => {
      const m = getMonth(r);
      if (m >= 1 && m <= 12) buckets[m - 1].push(r);
    });
    return buckets;
  };
  const brt = (field: string) => (r: any) => (yearOfBRT(r[field]) === y ? monthOfBRT(r[field]) : 0);

  const salesM   = by(sales, (s: any) => monthOfText(s.sale_date));
  const itemsM   = by(saleItems, (it: any) => monthBySale.get(it.sale_id) || 0);
  const adM      = by(adSpendRows, (r: any) => monthOfText(r.date));
  const payM     = by(costPayments, (r: any) => monthOfText(`${r.month}-01`));
  const extrasM  = by(motoboyExtras, (r: any) => monthOfText(r.date));
  const feesSM   = by(motoboyFeesSales, brt('finalized_at'));
  const feesSmM  = by(motoboyFeesSmall, brt('created_at'));
  const avulsosM = by(avulsos, (r: any) => monthOfText(r.date));
  const smallM   = by(smallSales, brt('created_at'));

  return Array.from({ length: 12 }, (_, idx) => computeMonth({
    monthStr: `${y}-${String(idx + 1).padStart(2, '0')}`,
    currentMonthStr: opts.currentMonthStr,
    sales: salesM[idx],
    saleItems: itemsM[idx],
    adSpendRows: adM[idx],
    costPayments: payM[idx],
    allCosts,
    avulsos: avulsosM[idx],
    motoboyExtras: extrasM[idx],
    motoboyFeesSales: feesSM[idx],
    motoboyFeesSmall: feesSmM[idx],
    smallSales: smallM[idx],
    calculateCardFee: opts.calculateCardFee,
    packagingCost: opts.packagingCost,
  }));
}

export function computeMonth(i: MonthInput): MonthResult {
  const n = (v: any) => Number(v || 0);

  // ── Smartwatches ──
  const totalBruto   = i.sales.reduce((s, v) => s + Number(v.total_sale_price), 0);
  const totalLiquido = i.sales.reduce((s, v) => s + Number(v.net_received), 0);
  const totalCustoProdutos = i.sales.reduce((s, v) => {
    const deliv = n(v.delivery_fee) + n(v.delivery_cost);
    return s + n(v.total_cost) - deliv;
  }, 0);

  const motoboyDeliveryFees =
    i.motoboyFeesSales.reduce((s, r) => s + n(r.delivery_fee), 0) +
    i.motoboyFeesSmall.reduce((s, r) => s + n(r.delivery_fee), 0);
  const motoboyExtras = i.motoboyExtras.reduce((s, r) => s + Number(r.amount), 0);
  const correios = i.sales
    .filter(v => v.status === 'finalizado' && v.delivery_type === 'correios')
    .reduce((s, v) => s + n(v.delivery_cost), 0);
  const totalCustoEntregas = motoboyDeliveryFees + correios + motoboyExtras;

  const swCount = i.saleItems
    .filter(it => it.products?.category === 'smartwatch')
    .reduce((s, it) => s + it.quantity, 0);
  const custoEmbalagens = swCount * i.packagingCost;

  const adSpend = i.adSpendRows.reduce((s, r) => s + Number(r.amount), 0);

  const paymentsMap = new Map(i.costPayments.map(r => [r.cost_id, Number(r.amount_paid ?? 0)]));
  const totalOpCosts = i.allCosts.reduce((sum, c) => {
    if (c.created_at && c.created_at.slice(0, 7) > i.monthStr) return sum;
    if (c.is_active === false && i.monthStr >= i.currentMonthStr) return sum;
    if (paymentsMap.has(c.id)) return sum + paymentsMap.get(c.id)!;
    return sum + Number(c.amount);
  }, 0);
  const avulsosTotal = i.avulsos.reduce((s, r) => s + Number(r.amount), 0);
  const operationalCosts = totalOpCosts + avulsosTotal;

  const lucroSmartwatch = totalLiquido - totalCustoProdutos - totalCustoEntregas - adSpend - operationalCosts - custoEmbalagens;

  // ── Pequenas vendas ──
  const ss = i.smallSales;
  const smallRevenue = ss.reduce((s, v) => s + Number(v.sale_price) * Number(v.quantity), 0);
  const smallCost    = ss.reduce((s, v) => s + Number(v.cost) * Number(v.quantity), 0);
  const smallDeliv   = ss.reduce((s, v) => s + n(v.delivery_fee), 0);
  const smallCardFees = ss.reduce((s, v) => {
    const pms = v.payment_methods as any[] | null;
    if (pms && Array.isArray(pms) && pms.length > 1) {
      return s + pms
        .filter(pm => CARD_METHODS.includes(pm.method))
        .reduce((sum, pm) => sum + i.calculateCardFee(Number(pm.amount), pm.method, pm.card_brand || '', pm.installments || 0, v.created_at), 0);
    }
    if (CARD_METHODS.includes(v.payment_method)) {
      return s + i.calculateCardFee(Number(v.sale_price) * Number(v.quantity), v.payment_method, v.card_brand || '', v.installments || 0, v.created_at);
    }
    return s;
  }, 0);
  const smallProfit = smallRevenue - smallCardFees - smallCost - smallDeliv;

  return {
    swVendas: i.sales.length,
    swBruto: totalBruto,
    swCount,
    lucroSmartwatch,
    smallVendas: ss.length,
    smallBruto: smallRevenue,
    smallProfit,
    adSpend,
    operationalCosts,
    consolidadoBruto: totalBruto + smallRevenue,
    consolidadoLucro: lucroSmartwatch + smallProfit,
    hasData: i.sales.length > 0 || ss.length > 0,
  };
}
