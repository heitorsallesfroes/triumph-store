import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { getTodayInBrazil, getYesterdayInBrazil } from '../lib/dateUtils';
import {
  ShoppingCart, TrendingUp, TrendingDown, Watch, DollarSign,
  AlertTriangle, Truck, Target, Clock, ArrowRight, RefreshCw,
  Bike, Zap, BarChart2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface DayPoint { day: string; date: string; revenue: number; adSpend: number }

interface DashState {
  day: { revenue: number; profit: number; salesCount: number; smallSalesCount: number; smartwatches: number; avgTicket: number };
  yesterday: { revenue: number; profit: number; salesCount: number };
  week: DayPoint[];
  month: { revenue: number; profit: number; salesCount: number; smartwatches: number; adSpend: number };
  lastMonth: { revenue: number };
  logistics: { em_separacao: number; embalado: number; em_rota: number; embalar_amanha: number };
  adsToday: number;
  motoboys: { name: string; deliveries_today: number; earnings_today: number }[];
  outOfStock: { id: string; model: string; color: string }[];
  pendingPix: number;
  forecast: { historicalAvg: number; dayCount: number; dayName: string };
}

const EMPTY: DashState = {
  day: { revenue: 0, profit: 0, salesCount: 0, smallSalesCount: 0, smartwatches: 0, avgTicket: 0 },
  yesterday: { revenue: 0, profit: 0, salesCount: 0 },
  week: [],
  month: { revenue: 0, profit: 0, salesCount: 0, smartwatches: 0, adSpend: 0 },
  lastMonth: { revenue: 0 },
  logistics: { em_separacao: 0, embalado: 0, em_rota: 0, embalar_amanha: 0 },
  adsToday: 0,
  motoboys: [],
  outOfStock: [],
  pendingPix: 0,
  forecast: { historicalAvg: 0, dayCount: 0, dayName: '' },
};

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function greeting() {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function brazilDateMinus(n: number): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Micro-components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 14 }}>
      {children}
    </p>
  );
}

function Delta({ a, b, suffix = ' vs ontem' }: { a: number; b: number; suffix?: string }) {
  if (b === 0) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>;
  const p = ((a - b) / b) * 100;
  const up = p >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: up ? '#22c55e' : '#ef4444' }}>
      <Icon size={10} />
      {up ? '+' : ''}{p.toFixed(1)}%{suffix}
    </span>
  );
}

function Progress({ value, max, color = '#f97316' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>vs mês anterior</span>
        <span style={{ fontSize: 10, fontWeight: 800, color }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 4, background: 'var(--bg-inner)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

function CardRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color || 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}

function LogRow({ emoji, label, count, color }: { emoji: string; label: string; count: number; color: string }) {
  if (!count) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 13 }}>{emoji}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color }}>{count}</span>
    </div>
  );
}

function DayCard({ icon: Icon, iconColor, title, value, sub, delta, children, onClick, accent }: {
  icon: any; iconColor: string; title: string; value: string; sub?: string;
  delta?: { a: number; b: number }; children?: ReactNode;
  onClick?: () => void; accent?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: accent ? `2px solid ${iconColor}50` : '1px solid var(--border-main)',
        borderRadius: 16,
        padding: '20px 22px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        if (onClick) {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = iconColor;
          el.style.transform = 'translateY(-2px)';
          el.style.boxShadow = `0 8px 24px ${iconColor}20`;
        }
      }}
      onMouseLeave={e => {
        if (onClick) {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = accent ? `${iconColor}50` : 'var(--border-main)';
          el.style.transform = 'none';
          el.style.boxShadow = 'none';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: `${iconColor}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        {onClick && <ArrowRight size={13} style={{ color: 'var(--text-muted)', marginTop: 4 }} />}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 3 }}>
        {title}
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: 2 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{sub}</p>}
      {delta && <div style={{ marginBottom: 4 }}><Delta a={delta.a} b={delta.b} /></div>}

      {children && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-main)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MonthCard({ icon: Icon, iconColor, label, value, sub, children }: {
  icon: any; iconColor: string; label: string; value: string; sub?: string; children?: ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} style={{ color: iconColor }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{sub}</p>}
      {children}
    </div>
  );
}

function ForecastCard({ todayRevenue, historicalAvg, dayName, dayCount }: {
  todayRevenue: number; historicalAvg: number; dayName: string; dayCount: number;
}) {
  const pct = historicalAvg > 0 ? Math.min((todayRevenue / historicalAvg) * 100, 100) : 0;
  const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-main)',
      borderRadius: 16,
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: 'rgba(249,115,22,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Target size={20} style={{ color: '#f97316' }} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 2 }}>
        Previsão do Dia
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 12 }}>
        {dayName || '—'}
      </p>

      {historicalAvg > 0 ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Média: <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{fmtR(historicalAvg)}</span>
          </p>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Atingido hoje</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: barColor }}>{pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-inner)', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: barColor, borderRadius: 4,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6 }}>
            {fmtR(todayRevenue)} faturado de {fmtR(historicalAvg)} esperado
          </p>

          <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Baseado nos últimos {dayCount} {dayName.toLowerCase()}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados históricos suficientes</p>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<DashState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('light'));

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains('light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);

    const today     = getTodayInBrazil();
    const yesterday = getYesterdayInBrazil();
    const sixAgo    = brazilDateMinus(6);

    const brazilNow  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const monthStart = `${brazilNow.getFullYear()}-${String(brazilNow.getMonth() + 1).padStart(2, '0')}-01`;

    const lmLastDay  = new Date(brazilNow.getFullYear(), brazilNow.getMonth(), 0);
    const lmFirstDay = new Date(brazilNow.getFullYear(), brazilNow.getMonth() - 1, 1);
    const lmStart    = `${lmFirstDay.getFullYear()}-${String(lmFirstDay.getMonth() + 1).padStart(2, '0')}-01`;
    const lmEnd      = `${lmLastDay.getFullYear()}-${String(lmLastDay.getMonth() + 1).padStart(2, '0')}-${String(lmLastDay.getDate()).padStart(2, '0')}`;

    const ninetyDaysAgo = brazilDateMinus(89);

    const [
      todaySalesRes, ySalesRes, weekSalesRes, mSalesRes,
      lmSalesRes, logRes, todayAdRes, mAdRes,
      prodsRes, motoboyRes, smallTodayRes, pendingPixRes, weekAdRes,
      forecastSalesRes,
    ] = await Promise.all([
      supabase.from('sales').select('id, total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${today}T00:00:00`).lte('sale_date', `${today}T23:59:59`),
      supabase.from('sales').select('total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${yesterday}T00:00:00`).lte('sale_date', `${yesterday}T23:59:59`),
      supabase.from('sales').select('sale_date, total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${sixAgo}T00:00:00`).lte('sale_date', `${today}T23:59:59`),
      supabase.from('sales').select('id, total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${monthStart}T00:00:00`).lte('sale_date', `${today}T23:59:59`),
      supabase.from('sales').select('total_sale_price').neq('status', 'cancelado').gte('sale_date', `${lmStart}T00:00:00`).lte('sale_date', `${lmEnd}T23:59:59`),
      supabase.from('sales').select('status').in('status', ['em_separacao', 'embalado', 'em_rota', 'embalar_amanha']),
      supabase.from('ad_spend').select('amount').eq('date', today),
      supabase.from('ad_spend').select('amount').gte('date', monthStart).lte('date', today),
      supabase.from('products').select('id, model, color, current_stock, category'),
      supabase.from('motoboy_stats').select('name, deliveries_today, earnings_today').gt('deliveries_today', 0).order('deliveries_today', { ascending: false }),
      supabase.from('small_sales').select('sale_price, quantity').gte('created_at', `${today}T00:00:00-03:00`).lte('created_at', `${today}T23:59:59-03:00`),
      supabase.from('sales').select('id', { count: 'exact', head: true }).eq('payment_method', 'pix').in('status', ['em_separacao', 'embalar_amanha']),
      supabase.from('ad_spend').select('date, amount').gte('date', sixAgo).lte('date', today),
      supabase.from('sales').select('sale_date, total_sale_price').neq('status', 'cancelado').gte('sale_date', `${ninetyDaysAgo}T00:00:00`).lte('sale_date', `${yesterday}T23:59:59`),
    ]);

    // Round 2: sale_items (needs IDs from round 1)
    const todayIds = (todaySalesRes.data || []).map(s => s.id);
    const monthIds = (mSalesRes.data || []).map(s => s.id);

    const [todayItemsRes, monthItemsRes] = await Promise.all([
      todayIds.length > 0
        ? supabase.from('sale_items').select('product_id, quantity').in('sale_id', todayIds)
        : Promise.resolve({ data: [] as { product_id: string; quantity: number }[] }),
      monthIds.length > 0 && monthIds.length <= 500
        ? supabase.from('sale_items').select('product_id, quantity').in('sale_id', monthIds)
        : Promise.resolve({ data: [] as { product_id: string; quantity: number }[] }),
    ]);

    const products = prodsRes.data || [];
    const swIds    = new Set(products.filter(p => p.category === 'smartwatch').map(p => p.id));
    const swToday  = (todayItemsRes.data || []).filter(i => swIds.has(i.product_id)).reduce((s, i) => s + Number(i.quantity), 0);
    const swMonth  = (monthItemsRes.data || []).filter(i => swIds.has(i.product_id)).reduce((s, i) => s + Number(i.quantity), 0);

    const todaySales = todaySalesRes.data || [];
    const ySales     = ySalesRes.data     || [];
    const weekSales  = weekSalesRes.data  || [];
    const mSales     = mSalesRes.data     || [];
    const lmSales    = lmSalesRes.data    || [];
    const logistics  = logRes.data        || [];
    const smallToday = smallTodayRes.data || [];

    // Build 7-day chart points
    const weekAdRows = weekAdRes.data || [];
    const week: DayPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d  = new Date(brazilNow);
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayRows  = weekSales.filter(s => (s.sale_date || '').startsWith(ds));
      const adForDay = weekAdRows.filter(a => a.date === ds).reduce((s, a) => s + Number(a.amount), 0);
      week.push({
        date:    ds,
        day:     d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace('-feira', ''),
        revenue: dayRows.reduce((s, v) => s + Number(v.total_sale_price), 0),
        adSpend: adForDay,
      });
    }

    // Forecast: group historical sales by date, then avg for same DOW
    const forecastSales = forecastSalesRes.data || [];
    const revenueByDate: Record<string, number> = {};
    for (const sale of forecastSales) {
      const ds = (sale.sale_date || '').substring(0, 10);
      revenueByDate[ds] = (revenueByDate[ds] || 0) + Number(sale.total_sale_price);
    }
    const todayDow = brazilNow.getDay();
    const matchingRevs: number[] = [];
    for (const [ds, rev] of Object.entries(revenueByDate)) {
      const [y, m, d] = ds.split('-').map(Number);
      if (new Date(y, m - 1, d).getDay() === todayDow) matchingRevs.push(rev);
    }
    const DOW_NAMES: Record<number, string> = {
      0: 'Domingos', 1: 'Segundas', 2: 'Terças', 3: 'Quartas',
      4: 'Quintas', 5: 'Sextas', 6: 'Sábados',
    };
    const historicalAvg = matchingRevs.length > 0
      ? matchingRevs.reduce((s, v) => s + v, 0) / matchingRevs.length
      : 0;

    const todayRev    = todaySales.reduce((s, v) => s + Number(v.total_sale_price), 0);
    const todayProfit = todaySales.reduce((s, v) => s + Number(v.profit), 0);
    const smallRev    = smallToday.reduce((s, v) => s + Number(v.sale_price) * Number(v.quantity), 0);
    const totalDayRev = todayRev + smallRev;
    const totalDayCnt = todaySales.length + smallToday.length;

    setData({
      day: {
        revenue:        totalDayRev,
        profit:         todayProfit,
        salesCount:     todaySales.length,
        smallSalesCount: smallToday.length,
        smartwatches:   swToday,
        avgTicket:      totalDayCnt > 0 ? totalDayRev / totalDayCnt : 0,
      },
      yesterday: {
        revenue:    ySales.reduce((s, v) => s + Number(v.total_sale_price), 0),
        profit:     ySales.reduce((s, v) => s + Number(v.profit), 0),
        salesCount: ySales.length,
      },
      week,
      month: {
        revenue:     mSales.reduce((s, v) => s + Number(v.total_sale_price), 0),
        profit:      mSales.reduce((s, v) => s + Number(v.profit), 0),
        salesCount:  mSales.length,
        smartwatches: swMonth,
        adSpend:     (mAdRes.data || []).reduce((s, a) => s + Number(a.amount), 0),
      },
      lastMonth: { revenue: lmSales.reduce((s, v) => s + Number(v.total_sale_price), 0) },
      logistics: {
        em_separacao:   logistics.filter(l => l.status === 'em_separacao').length,
        embalado:       logistics.filter(l => l.status === 'embalado').length,
        em_rota:        logistics.filter(l => l.status === 'em_rota').length,
        embalar_amanha: logistics.filter(l => l.status === 'embalar_amanha').length,
      },
      adsToday:  (todayAdRes.data || []).reduce((s, a) => s + Number(a.amount), 0),
      motoboys:  (motoboyRes.data || []) as any,
      outOfStock: products.filter(p => Number(p.current_stock) <= 0),
      pendingPix: (pendingPixRes as any).count ?? 0,
      forecast: {
        historicalAvg,
        dayCount: matchingRevs.length,
        dayName: DOW_NAMES[todayDow],
      },
    });

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, color: 'var(--text-muted)' }}>
        <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%' }} />
        Carregando dashboard...
      </div>
    );
  }

  const { day, yesterday, week, month, lastMonth, logistics, adsToday, motoboys, outOfStock, pendingPix, forecast } = data;
  const logTotal    = logistics.em_separacao + logistics.embalado + logistics.em_rota + logistics.embalar_amanha;
  const monthMargin = month.revenue > 0 ? (month.profit / month.revenue) * 100 : 0;
  const dayMargin   = day.revenue > 0 ? (day.profit / day.revenue) * 100 : 0;
  const roas        = adsToday > 0 && day.revenue > 0 ? day.revenue / adsToday : null;
  const monthRoas   = month.adSpend > 0 && month.revenue > 0 ? month.revenue / month.adSpend : null;
  const hasAlerts   = outOfStock.length > 0 || pendingPix > 0;
  const axisColor   = isLight ? '#6b7280' : '#6b7280';
  const gridColor   = isLight ? '#e5e7eb' : '#1e1e2e';
  const tooltipBg   = isLight ? '#ffffff' : '#1a1a2a';
  const tooltipBorder = isLight ? '#e2e8f0' : '#2a2a3a';
  const tooltipText = isLight ? '#111111' : '#eeeeee';
  const brazilNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dateStr     = brazilNow.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-main)',
        borderLeft: '4px solid #f97316', borderRadius: 16,
        padding: '20px 26px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 7, marginBottom: 5 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{greeting()},</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#f97316' }}>Triumph Store</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dateStr}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 8, background: 'var(--bg-inner)', border: '1px solid var(--border-main)',
              color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px',
            borderRadius: 99, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            fontSize: 12, fontWeight: 700, color: '#22c55e',
          }}>
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            Ao vivo
          </div>
        </div>
      </div>

      {/* ── Seção 1 — Hoje (6 cards, 3 colunas) ────────────────────────── */}
      <SectionLabel>Hoje</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>

        {/* Faturamento */}
        <DayCard
          icon={DollarSign} iconColor="#f97316" accent
          title="Faturamento do Dia"
          value={fmtR(day.revenue)}
          sub={`${day.salesCount} ${day.salesCount === 1 ? 'venda' : 'vendas'}`}
          delta={{ a: day.revenue, b: yesterday.revenue }}
          onClick={() => onNavigate('history')}
        />

        {/* Lucro */}
        <DayCard
          icon={TrendingUp} iconColor="#22c55e" accent
          title="Lucro do Dia"
          value={fmtR(day.profit)}
          sub={`Margem ${dayMargin.toFixed(1)}%`}
          delta={{ a: day.profit, b: yesterday.profit }}
          onClick={() => onNavigate('resumo-vendas')}
        />

        {/* Vendas + Smartwatches */}
        <DayCard
          icon={ShoppingCart} iconColor="#3b82f6"
          title="Vendas"
          value={String(day.salesCount)}
          sub={day.salesCount === 1 ? 'pedido registrado' : 'pedidos registrados'}
          delta={{ a: day.salesCount, b: yesterday.salesCount }}
          onClick={() => onNavigate('history')}
        >
          <CardRow label="⌚ Smartwatches" value={`${day.smartwatches} ${day.smartwatches === 1 ? 'unidade' : 'unidades'}`} color="#3b82f6" />
          <CardRow label="Ticket médio" value={day.avgTicket > 0 ? fmtR(day.avgTicket) : '—'} />
        </DayCard>

        {/* Logística */}
        <DayCard
          icon={Truck} iconColor="#a855f7"
          title="Em Logística"
          value={String(logTotal)}
          sub={logTotal === 1 ? 'pedido ativo' : 'pedidos ativos'}
          onClick={() => onNavigate('logistics')}
        >
          <LogRow emoji="📦" label="Em separação"   count={logistics.em_separacao}  color="#f59e0b" />
          <LogRow emoji="📫" label="Embalado"        count={logistics.embalado}       color="#3b82f6" />
          <LogRow emoji="🚚" label="Em rota"         count={logistics.em_rota}        color="#a855f7" />
          <LogRow emoji="🌙" label="Embalar amanhã" count={logistics.embalar_amanha} color="#f97316" />
          {logTotal === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
              Nenhum pedido ativo
            </p>
          )}
        </DayCard>

        {/* Ads */}
        <DayCard
          icon={BarChart2} iconColor="#ec4899"
          title="Ads Hoje"
          value={adsToday > 0 ? fmtR(adsToday) : 'Sem dados'}
          sub="gasto em anúncios"
          onClick={() => onNavigate('marketing')}
        >
          <CardRow
            label="ROAS"
            value={roas !== null ? `${roas.toFixed(2)}x` : '—'}
            color={roas === null ? undefined : roas >= 3 ? '#22c55e' : roas >= 1.5 ? '#f59e0b' : '#ef4444'}
          />
          {adsToday > 0 && day.salesCount > 0 && (
            <CardRow label="CPV" value={fmtR(adsToday / day.salesCount)} />
          )}
          {adsToday > 0 && day.revenue > 0 && (
            <CardRow label="Receita / Gasto" value={`${(day.revenue / adsToday).toFixed(1)}x`} />
          )}
        </DayCard>

        {/* Ticket médio */}
        <DayCard
          icon={Zap} iconColor="#f59e0b"
          title="Ticket Médio"
          value={day.avgTicket > 0 ? fmtR(day.avgTicket) : '—'}
          sub="por pedido hoje"
          onClick={() => onNavigate('resumo-vendas')}
        >
          <CardRow label="Ontem" value={yesterday.salesCount > 0 ? fmtR(yesterday.revenue / yesterday.salesCount) : '—'} />
          <CardRow label="Faturamento total" value={fmtR(day.revenue)} color="#f97316" />
          <CardRow label="Lucro total" value={fmtR(day.profit)} color="#22c55e" />
        </DayCard>

        {/* Previsão do Dia */}
        <ForecastCard
          todayRevenue={day.revenue}
          historicalAvg={forecast.historicalAvg}
          dayName={forecast.dayName}
          dayCount={forecast.dayCount}
        />
      </div>

      {/* ── Seção 2 — Gráfico 7 dias ────────────────────────────────────── */}
      <SectionLabel>Últimos 7 Dias — Faturamento & Lucro</SectionLabel>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-main)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 28,
      }}>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={week} barGap={4} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: axisColor, fontSize: 12, fontWeight: 600 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false} tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tooltipText }}
              labelStyle={{ fontWeight: 700, marginBottom: 4, color: tooltipText }}
              formatter={(value: number, name: string) => [fmtR(value), name]}
              cursor={{ fill: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' }}
            />
            <Legend
              formatter={(v) => (
                <span style={{ fontSize: 12, color: axisColor }}>{v}</span>
              )}
            />
            <Bar dataKey="revenue" name="Faturamento"  fill="#f97316" radius={[5, 5, 0, 0]} maxBarSize={40} />
            <Bar dataKey="adSpend" name="Gasto em Ads" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Seção 3 — Mês Atual (4 cards) ──────────────────────────────── */}
      <SectionLabel>Mês Atual</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>

        <MonthCard icon={DollarSign} iconColor="#f97316" label="Faturamento" value={fmtR(month.revenue)} sub={`${month.salesCount} vendas`}>
          <Progress value={month.revenue} max={lastMonth.revenue} color="#f97316" />
        </MonthCard>

        <MonthCard icon={TrendingUp} iconColor="#22c55e" label="Lucro" value={fmtR(month.profit)} sub={`Margem ${monthMargin.toFixed(1)}%`}>
          <Progress value={month.profit} max={lastMonth.revenue * (monthMargin / 100) || lastMonth.revenue * 0.2} color="#22c55e" />
        </MonthCard>

        <MonthCard icon={ShoppingCart} iconColor="#3b82f6" label="Total Vendas" value={String(month.salesCount)} sub="pedidos registrados">
          <div style={{ marginTop: 10 }}>
            <CardRow label="⌚ Smartwatches" value={`${month.smartwatches} un.`} color="#3b82f6" />
            <CardRow
              label="Ticket médio"
              value={month.salesCount > 0 ? fmtR(month.revenue / month.salesCount) : '—'}
            />
          </div>
        </MonthCard>

        <MonthCard icon={Target} iconColor="#a855f7" label="ROI / Ads" value={monthRoas !== null ? `${monthRoas.toFixed(2)}x` : '—'} sub="ROAS do mês">
          <div style={{ marginTop: 10 }}>
            <CardRow label="Gasto em ads" value={month.adSpend > 0 ? fmtR(month.adSpend) : '—'} />
            {month.adSpend > 0 && (
              <CardRow
                label="ROI"
                value={`${(((month.revenue - month.adSpend) / month.adSpend) * 100).toFixed(0)}%`}
                color={month.revenue > month.adSpend ? '#22c55e' : '#ef4444'}
              />
            )}
          </div>
        </MonthCard>
      </div>

      {/* ── Seção 4 — Ranking Motoboys Hoje ────────────────────────────── */}
      {motoboys.length > 0 && (
        <>
          <SectionLabel>Ranking Motoboys Hoje</SectionLabel>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-main)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 28,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inner)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 40 }}>#</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Motoboy</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entregas</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ganho Hoje</th>
                </tr>
              </thead>
              <tbody>
                {motoboys.map((mb, i) => (
                  <tr
                    key={mb.name}
                    style={{ borderTop: '1px solid var(--border-main)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800,
                        background: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#c2410c' : 'var(--bg-inner)',
                        color: i < 3 ? '#fff' : 'var(--text-muted)',
                      }}>
                        {i + 1}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bike size={15} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{mb.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 32, height: 24, borderRadius: 6,
                        background: 'rgba(249,115,22,0.12)', color: '#f97316',
                        fontSize: 13, fontWeight: 800,
                      }}>
                        {mb.deliveries_today}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{fmtR(mb.earnings_today)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Seção 5 — Alertas ───────────────────────────────────────────── */}
      {hasAlerts && (
        <>
          <SectionLabel>Alertas</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: outOfStock.length > 0 && pendingPix > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>

            {outOfStock.length > 0 && (
              <div
                onClick={() => onNavigate('stock')}
                style={{
                  background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.2)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', flex: 1 }}>
                    {outOfStock.length} {outOfStock.length === 1 ? 'produto' : 'produtos'} com estoque zerado
                  </span>
                  <ArrowRight size={13} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {outOfStock.slice(0, 6).map(p => (
                    <span key={p.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
                      {p.model} {p.color}
                    </span>
                  ))}
                  {outOfStock.length > 6 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      +{outOfStock.length - 6} mais
                    </span>
                  )}
                </div>
              </div>
            )}

            {pendingPix > 0 && (
              <div
                onClick={() => onNavigate('logistics')}
                style={{
                  background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.2)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Clock size={16} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', flex: 1 }}>
                    {pendingPix} {pendingPix === 1 ? 'pedido PIX' : 'pedidos PIX'} aguardando confirmação
                  </span>
                  <ArrowRight size={13} style={{ color: '#f59e0b' }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Pedidos com pagamento PIX em separação ou a embalar
                </p>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
