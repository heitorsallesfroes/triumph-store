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
import { getAdSpendBreakdown, toAdSpendReal } from '../lib/adTax';
import { getConfigNumber } from '../lib/systemConfig';
import { loadYearMonths } from '../lib/resumoAnualCalc';

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
      // Mesmas regras do Relatório Mensal, mês a mês (ver src/lib/resumoAnualCalc.ts),
      // com busca paginada para não cortar em 1000 linhas.
      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const months = await loadYearMonths(supabase, y, {
        currentMonthStr,
        calculateCardFee,
        packagingCost: getConfigNumber('packaging_cost'),
      });

      const byMonth: MonthData[] = months.map((m, i) => ({
        month: i + 1,
        name: MONTH_NAMES[i],
        faturamentoBruto: m.consolidadoBruto,
        lucro: m.consolidadoLucro,
        margem: m.consolidadoBruto > 0 ? (m.consolidadoLucro / m.consolidadoBruto) * 100 : 0,
        totalVendas: m.swVendas + m.smallVendas,
        swCount: m.swCount,
        adSpend: m.adSpend,
        // ROAS como no Relatório Mensal: faturamento dos smartwatches ÷ ads real
        roas: m.adSpend > 0 ? m.swBruto / toAdSpendReal(m.adSpend) : null,
        custoOperacional: m.operationalCosts,
        hasData: m.hasData,
      }));

      setRows(byMonth);
    } catch (e) {
      console.error(e);
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
      ? totalFat / toAdSpendReal(activeRows.reduce((s, r) => s + r.adSpend, 0)) : null,
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
                    {['Mês','Fat. Bruto','Lucro','Margem %','Vendas','SWs','Gasto Ads (bruto)','Imposto (13,83%)','Gasto Ads (real)','ROAS','Custo Op.'].map(h => (
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
                          {r.hasData ? fmt(getAdSpendBreakdown(r.adSpend).imposto) : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {r.hasData ? fmt(getAdSpendBreakdown(r.adSpend).total) : '—'}
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
                        {fmt(getAdSpendBreakdown(totalRow.adSpend).imposto)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(getAdSpendBreakdown(totalRow.adSpend).total)}
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
