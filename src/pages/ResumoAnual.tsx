import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Award, AlertCircle, BarChart3, DollarSign,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateCardFee } from '../lib/cardFees';

interface MonthData {
  month: number;
  name: string;
  faturamentoBruto: number;
  lucro: number;
  margem: number;
  totalVendas: number;
  swCount: number;
  adSpend: number;
  roas: number | null;
  custoOperacional: number;
  hasData: boolean;
}

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const ORANGE = '#f97316';
const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toFixed(1)}%`;

export default function ResumoAnual() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);

  const loadYear = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const yStart = `${y}-01-01`;
      const yEnd   = `${y}-12-31`;
      const yStartUTC = new Date(`${y}-01-01T03:00:00Z`).toISOString();
      const yEndUTC   = new Date(`${y + 1}-01-01T03:00:00Z`).toISOString();

      const [
        salesRes, saleItemsRes, adRes,
        costsPayRes, allCostsRes,
        motoExtrasRes, motoFeesRes,
        smallRes, ssMotoRes,
      ] = await Promise.all([
        supabase.from('sales')
          .select('id,sale_date,total_sale_price,net_received,total_cost,delivery_fee,delivery_cost,delivery_type,status')
          .neq('status', 'cancelado')
          .gte('sale_date', yStart)
          .lte('sale_date', `${yEnd}T23:59:59`),
        supabase.from('sale_items')
          .select('sale_id,quantity,products(category)')
          .gte('created_at', `${yStart}T00:00:00`)
          .lte('created_at', `${yEnd}T23:59:59`),
        supabase.from('ad_spend')
          .select('amount,date')
          .gte('date', yStart)
          .lte('date', yEnd),
        supabase.from('operational_cost_payments')
          .select('cost_id,amount_paid,month')
          .gte('month', `${y}-01`)
          .lte('month', `${y}-12`),
        supabase.from('operational_costs').select('id,amount'),
        supabase.from('motoboy_payments')
          .select('amount,date')
          .gte('date', yStart)
          .lte('date', yEnd),
        supabase.from('sales')
          .select('delivery_fee,sale_date')
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('sale_date', yStart)
          .lte('sale_date', `${yEnd}T23:59:59`),
        supabase.from('small_sales')
          .select('*')
          .gte('created_at', `${yStart}T00:00:00-03:00`)
          .lte('created_at', `${yEnd}T23:59:59-03:00`),
        supabase.from('small_sales')
          .select('delivery_fee,created_at')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', yStartUTC)
          .lt('created_at', yEndUTC),
      ]);

      const sales        = salesRes.data       || [];
      const saleItems    = (saleItemsRes.data  || []) as any[];
      const adSpends     = adRes.data           || [];
      const costPayments = costsPayRes.data     || [];
      const allCosts     = allCostsRes.data     || [];
      const motoExtras   = motoExtrasRes.data   || [];
      const motoFees     = motoFeesRes.data     || [];
      const smallSales   = smallRes.data        || [];
      const ssMoto       = ssMotoRes.data       || [];

      const getM = (d: string) => parseInt(d.substring(5, 7), 10);
      const getMTS = (ts: string) => {
        const d = new Date(ts);
        return new Date(d.getTime() - 3 * 60 * 60 * 1000).getUTCMonth() + 1;
      };

      // Operational costs map: cost_id -> fixed monthly amount
      const costAmountMap = new Map<string, number>();
      allCosts.forEach((c: any) => costAmountMap.set(c.id, Number(c.amount)));

      // Build per-month structures
      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        name: MONTH_NAMES[i],
        faturamentoBruto: 0,
        lucro: 0,
        margem: 0,
        totalVendas: 0,
        swCount: 0,
        adSpend: 0,
        roas: null as number | null,
        custoOperacional: 0,
        hasData: false,
      }));

      // SW count per sale (for packaging cost)
      const swCountBySale = new Map<string, number>();
      saleItems.forEach((item: any) => {
        if (item.products?.category === 'smartwatch') {
          swCountBySale.set(item.sale_id, (swCountBySale.get(item.sale_id) || 0) + item.quantity);
        }
      });

      // Sales (smartwatch) per month
      sales.forEach((s: any) => {
        const m = getM(s.sale_date) - 1;
        const row = byMonth[m];
        const revenue   = Number(s.total_sale_price);
        const netRec    = Number(s.net_received);
        const cardFee   = calculateCardFee(revenue, netRec);
        const prodCost  = Number(s.total_cost   || 0);
        const delFee    = Number(s.delivery_fee  || 0);
        const delCost   = Number(s.delivery_cost || 0);
        const swQty     = swCountBySale.get(s.id) || 0;
        const packaging = swQty * 2;

        row.faturamentoBruto += revenue;
        row.totalVendas      += 1;
        row.swCount          += swQty;
        row.hasData           = true;
        // gross profit for SW portion (fixed costs added later)
        row.lucro += revenue - cardFee - prodCost - delFee - delCost - packaging;
      });

      // Ad spend per month
      adSpends.forEach((a: any) => {
        const m = getM(a.date) - 1;
        byMonth[m].adSpend += Number(a.amount);
      });

      // Operational costs per month (from payments table)
      costPayments.forEach((p: any) => {
        const m = parseInt(p.month.substring(5, 7), 10) - 1;
        byMonth[m].custoOperacional += Number(p.amount_paid);
      });

      // Motoboy extras (outgoing payments)
      motoExtras.forEach((mp: any) => {
        const m = getM(mp.date) - 1;
        byMonth[m].lucro -= Number(mp.amount);
      });

      // Motoboy fees received (delivery_fee from motoboy sales)
      motoFees.forEach((mf: any) => {
        const m = getM(mf.sale_date) - 1;
        byMonth[m].lucro += Number(mf.delivery_fee || 0);
      });

      // Small sales per month
      smallSales.forEach((ss: any) => {
        const m = getMTS(ss.created_at) - 1;
        const row = byMonth[m];
        const revenue  = Number(ss.sale_price    || 0);
        const cost     = Number(ss.product_cost  || 0);
        const delFee   = Number(ss.delivery_fee  || 0);
        const delCost  = Number(ss.delivery_cost || 0);
        const cardFee  = Number(ss.payment_method) === 2
          ? revenue * 0.0399 : 0; // approximate; use calculateCardFee if available
        row.faturamentoBruto += revenue;
        row.totalVendas      += 1;
        row.lucro            += revenue - cost - delFee - delCost - cardFee;
        row.hasData           = true;
      });

      // Small sales motoboy fees received
      ssMoto.forEach((sm: any) => {
        const m = getMTS(sm.created_at) - 1;
        byMonth[m].lucro += Number(sm.delivery_fee || 0);
      });

      // Subtract ads + operational costs from lucro
      byMonth.forEach(row => {
        row.lucro -= row.adSpend + row.custoOperacional;
        row.margem = row.faturamentoBruto > 0
          ? (row.lucro / row.faturamentoBruto) * 100 : 0;
        row.roas = row.adSpend > 0
          ? row.faturamentoBruto / row.adSpend : null;
      });

      setRows(byMonth);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadYear(year); }, [year, loadYear]);

  // Derived stats (only months with data)
  const activeRows = rows.filter(r => r.hasData);
  const totalFat   = activeRows.reduce((s, r) => s + r.faturamentoBruto, 0);
  const totalLucro = activeRows.reduce((s, r) => s + r.lucro, 0);
  const avgLucro   = activeRows.length > 0 ? totalLucro / activeRows.length : 0;
  const bestMonth  = activeRows.reduce<MonthData | null>((best, r) =>
    !best || r.lucro > best.lucro ? r : best, null);
  const worstMonth = activeRows.reduce<MonthData | null>((worst, r) =>
    !worst || r.lucro < worst.lucro ? r : worst, null);

  // TOTAL row
  const totalRow = {
    totalVendas:     activeRows.reduce((s, r) => s + r.totalVendas, 0),
    swCount:         activeRows.reduce((s, r) => s + r.swCount, 0),
    adSpend:         activeRows.reduce((s, r) => s + r.adSpend, 0),
    custoOperacional:activeRows.reduce((s, r) => s + r.custoOperacional, 0),
    margem:          totalFat > 0 ? (totalLucro / totalFat) * 100 : 0,
    roas:            activeRows.reduce((s, r) => s + r.adSpend, 0) > 0
      ? totalFat / activeRows.reduce((s, r) => s + r.adSpend, 0) : null,
  };

  // Chart data — all 12 months
  const chartData = rows.map(r => ({
    name: r.name.substring(0, 3),
    Faturamento: r.faturamentoBruto,
    Lucro: r.lucro,
  }));

  const yearOptions = [2024, 2025, 2026, 2027];

  const card = (
    label: string,
    value: string,
    sub: string,
    Icon: React.ElementType,
    color: string,
  ) => (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-main)',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}22`, flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</p>}
      </div>
    </div>
  );

  const lucroColor = (v: number) =>
    v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : 'var(--text-muted)';

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Resumo Anual
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            Visão consolidada do desempenho ao longo do ano
          </p>
        </div>

        {/* Year selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {yearOptions.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                border: y === year ? `2px solid ${ORANGE}` : '1px solid var(--border-main)',
                background: y === year ? `${ORANGE}18` : 'var(--bg-card)',
                color: y === year ? ORANGE : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${ORANGE}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            {card(
              'Total Anual',
              fmt(totalFat),
              `Lucro: ${fmt(totalLucro)}`,
              DollarSign,
              ORANGE,
            )}
            {card(
              'Melhor Mês',
              bestMonth ? bestMonth.name : '—',
              bestMonth ? fmt(bestMonth.lucro) : '—',
              Award,
              '#16a34a',
            )}
            {card(
              'Pior Mês',
              worstMonth ? worstMonth.name : '—',
              worstMonth ? fmt(worstMonth.lucro) : '—',
              AlertCircle,
              '#dc2626',
            )}
            {card(
              'Média Mensal',
              fmt(avgLucro),
              `${activeRows.length} ${activeRows.length === 1 ? 'mês' : 'meses'} com dados`,
              BarChart3,
              '#2563eb',
            )}
          </div>

          {/* Chart */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 12,
            padding: '24px',
            marginBottom: 28,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, margin: '0 0 20px' }}>
              Evolução Mensal — {year}
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [fmt(value), name]}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-main)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 13, color: 'var(--text-secondary)' }} />
                <Bar dataKey="Faturamento" fill={ORANGE} fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                <Line dataKey="Lucro" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4, fill: '#16a34a' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly table */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-main)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Comparativo Mês a Mês
              </h2>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-inner)' }}>
                    {['Mês','Fat. Bruto','Lucro','Margem %','Vendas','SWs','Gasto Ads','ROAS','Custo Op.'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px',
                        textAlign: h === 'Mês' ? 'left' : 'right',
                        fontWeight: 700,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.04em',
                      }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? 'transparent' : 'var(--bg-inner)';
                    return (
                      <tr key={r.month} style={{ background: rowBg, opacity: r.hasData ? 1 : 0.4 }}>
                        <td style={{ padding: '9px 16px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {r.name}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? fmt(r.faturamentoBruto) : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: r.hasData ? lucroColor(r.lucro) : 'var(--text-muted)', fontWeight: r.hasData ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {r.hasData && r.lucro > 0 && <TrendingUp size={12} />}
                            {r.hasData && r.lucro < 0 && <TrendingDown size={12} />}
                            {r.hasData && r.lucro === 0 && <Minus size={12} />}
                            {r.hasData ? fmt(r.lucro) : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: r.hasData ? lucroColor(r.margem) : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? pct(r.margem) : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {r.hasData ? r.totalVendas : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {r.hasData ? r.swCount : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? fmt(r.adSpend) : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? (r.roas !== null ? `${r.roas.toFixed(2)}x` : '∞') : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? fmt(r.custoOperacional) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* TOTAL row */}
                  {activeRows.length > 0 && (
                    <tr style={{
                      background: `${ORANGE}10`,
                      borderTop: `2px solid ${ORANGE}40`,
                    }}>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: ORANGE }}>TOTAL ANUAL</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalFat)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: lucroColor(totalLucro), fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalLucro)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: lucroColor(totalRow.margem), fontVariantNumeric: 'tabular-nums' }}>
                        {pct(totalRow.margem)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {totalRow.totalVendas}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {totalRow.swCount}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalRow.adSpend)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {totalRow.roas !== null ? `${totalRow.roas.toFixed(2)}x` : '∞'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalRow.custoOperacional)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
