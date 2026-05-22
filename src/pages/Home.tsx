import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getTodayInBrazil } from '../lib/dateUtils';
import {
  ShoppingCart, TrendingUp, Watch, DollarSign,
  AlertTriangle, Truck, Target, Clock,
  ArrowRight, RefreshCw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface DashData {
  day: {
    salesCount: number;
    revenue: number;
    profit: number;
    smallSalesCount: number;
    smallSalesRevenue: number;
  };
  month: { revenue: number; profit: number; salesCount: number };
  logistics: { em_separacao: number; embalado: number; em_rota: number; embalar_amanha: number };
  adsSpend: number;
  smartwatchesToday: number;
  outOfStock: Array<{ id: string; model: string; color: string }>;
  pendingPix: number;
}

const EMPTY: DashData = {
  day: { salesCount: 0, revenue: 0, profit: 0, smallSalesCount: 0, smallSalesRevenue: 0 },
  month: { revenue: 0, profit: 0, salesCount: 0 },
  logistics: { em_separacao: 0, embalado: 0, em_rota: 0, embalar_amanha: 0 },
  adsSpend: 0,
  smartwatchesToday: 0,
  outOfStock: [],
  pendingPix: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function greeting(): string {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DayCard({
  icon: Icon, iconColor, iconBg, title, mainValue, mainLabel,
  children, onClick,
}: {
  icon: any; iconColor: string; iconBg: string;
  title: string; mainValue: string; mainLabel?: string;
  children?: ReactNode; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
        borderRadius: 16,
        padding: '20px 22px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = '#f97316';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        {onClick && <ArrowRight size={13} style={{ color: 'var(--text-muted)', marginTop: 2 }} />}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {title}
      </p>
      <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15 }}>
        {mainValue}
      </p>
      {mainLabel && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{mainLabel}</p>
      )}
      {children && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border-main)', paddingTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}

function LogisticRow({ emoji, label, count, color }: { emoji: string; label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12 }}>{emoji}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
    </div>
  );
}

function MonthCard({ icon: Icon, iconColor, label, value, sub }: { icon: any; iconColor: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color: iconColor }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<DashData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const today = getTodayInBrazil();
    const brazilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const monthStart = `${brazilNow.getFullYear()}-${String(brazilNow.getMonth() + 1).padStart(2, '0')}-01`;

    const [todaySalesRes, monthSalesRes, logisticsRes, adSpendRes, productsRes, smallSalesRes] = await Promise.all([
      supabase.from('sales').select('id, total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${today}T00:00:00`).lte('sale_date', `${today}T23:59:59`),
      supabase.from('sales').select('total_sale_price, profit').neq('status', 'cancelado').gte('sale_date', `${monthStart}T00:00:00`).lte('sale_date', `${today}T23:59:59`),
      supabase.from('sales').select('status').in('status', ['em_separacao', 'embalado', 'em_rota', 'embalar_amanha']),
      supabase.from('ad_spend').select('amount').eq('date', today),
      supabase.from('products').select('id, model, color, current_stock, category'),
      supabase.from('small_sales').select('sale_price, quantity').gte('created_at', `${today}T00:00:00-03:00`).lte('created_at', `${today}T23:59:59-03:00`),
    ]);

    const todaySaleIds = (todaySalesRes.data || []).map(s => s.id);
    const [saleItemsRes, pendingPixRes] = await Promise.all([
      todaySaleIds.length > 0
        ? supabase.from('sale_items').select('product_id, quantity').in('sale_id', todaySaleIds)
        : Promise.resolve({ data: [] as { product_id: string; quantity: number }[] }),
      supabase.from('sales').select('id', { count: 'exact', head: true }).eq('payment_method', 'pix').in('status', ['em_separacao', 'embalar_amanha']),
    ]);

    const products = productsRes.data || [];
    const swIds = new Set(products.filter(p => p.category === 'smartwatch').map(p => p.id));
    const smartwatchesToday = (saleItemsRes.data || [])
      .filter(i => swIds.has(i.product_id))
      .reduce((s, i) => s + Number(i.quantity), 0);

    const todaySales  = todaySalesRes.data  || [];
    const monthSales  = monthSalesRes.data  || [];
    const logistics   = logisticsRes.data   || [];
    const adSpend     = adSpendRes.data     || [];
    const smallSales  = smallSalesRes.data  || [];

    setData({
      day: {
        salesCount:         todaySales.length,
        revenue:            todaySales.reduce((s, v) => s + Number(v.total_sale_price), 0),
        profit:             todaySales.reduce((s, v) => s + Number(v.profit), 0),
        smallSalesCount:    smallSales.length,
        smallSalesRevenue:  smallSales.reduce((s, v) => s + Number(v.sale_price) * Number(v.quantity), 0),
      },
      month: {
        revenue:    monthSales.reduce((s, v) => s + Number(v.total_sale_price), 0),
        profit:     monthSales.reduce((s, v) => s + Number(v.profit), 0),
        salesCount: monthSales.length,
      },
      logistics: {
        em_separacao:  logistics.filter(l => l.status === 'em_separacao').length,
        embalado:      logistics.filter(l => l.status === 'embalado').length,
        em_rota:       logistics.filter(l => l.status === 'em_rota').length,
        embalar_amanha: logistics.filter(l => l.status === 'embalar_amanha').length,
      },
      adsSpend:         adSpend.reduce((s, a) => s + Number(a.amount), 0),
      smartwatchesToday,
      outOfStock:       products.filter(p => Number(p.current_stock) <= 0),
      pendingPix:       (pendingPixRes as any).count ?? 0,
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

  const brazilNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dateStr       = brazilNow.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const totalDayRev   = data.day.revenue + data.day.smallSalesRevenue;
  const totalDayCount = data.day.salesCount + data.day.smallSalesCount;
  const logTotal      = data.logistics.em_separacao + data.logistics.embalado + data.logistics.em_rota + data.logistics.embalar_amanha;
  const monthMargin   = data.month.revenue > 0 ? (data.month.profit / data.month.revenue) * 100 : 0;
  const roas          = data.adsSpend > 0 && totalDayRev > 0 ? totalDayRev / data.adsSpend : null;
  const hasAlerts     = data.outOfStock.length > 0 || data.pendingPix > 0;

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* ── Boas-vindas ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
        borderRadius: 16,
        padding: '22px 28px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        borderLeft: '4px solid #f97316',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>{greeting()},</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#f97316' }}>Triumph Store</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dateStr}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--bg-inner)', border: '1px solid var(--border-main)',
              color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 99,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            fontSize: 12, fontWeight: 600, color: '#22c55e',
          }}>
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            Ao vivo
          </div>
        </div>
      </div>

      {/* ── Métricas do Dia ───────────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Hoje
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>

        {/* Vendas */}
        <DayCard
          icon={ShoppingCart} iconColor="#f97316" iconBg="rgba(249,115,22,0.12)"
          title="Vendas do Dia"
          mainValue={fmtR(totalDayRev)}
          mainLabel={`${totalDayCount} ${totalDayCount === 1 ? 'venda' : 'vendas'}`}
          onClick={() => onNavigate('history')}
        >
          <StatRow label="Lucro estimado" value={fmtR(data.day.profit)} color="#22c55e" />
          {data.day.smallSalesCount > 0 && (
            <StatRow label="Pequenas vendas" value={`+${data.day.smallSalesCount}`} />
          )}
        </DayCard>

        {/* Logística */}
        <DayCard
          icon={Truck} iconColor="#3b82f6" iconBg="rgba(59,130,246,0.12)"
          title="Em Logística"
          mainValue={String(logTotal)}
          mainLabel={logTotal === 1 ? 'pedido ativo' : 'pedidos ativos'}
          onClick={() => onNavigate('logistics')}
        >
          <LogisticRow emoji="📦" label="Em separação"   count={data.logistics.em_separacao}  color="#f59e0b" />
          <LogisticRow emoji="📫" label="Embalado"        count={data.logistics.embalado}       color="#3b82f6" />
          <LogisticRow emoji="🚚" label="Em rota"         count={data.logistics.em_rota}        color="#a855f7" />
          <LogisticRow emoji="🌙" label="Embalar amanhã" count={data.logistics.embalar_amanha} color="#f97316" />
          {logTotal === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '2px 0' }}>Nenhum pedido ativo</p>
          )}
        </DayCard>

        {/* Ads */}
        <DayCard
          icon={TrendingUp} iconColor="#a855f7" iconBg="rgba(168,85,247,0.12)"
          title="Ads Hoje"
          mainValue={data.adsSpend > 0 ? fmtR(data.adsSpend) : 'Sem dados'}
          mainLabel="gasto em anúncios"
          onClick={() => onNavigate('marketing')}
        >
          <StatRow
            label="ROAS"
            value={roas !== null ? `${roas.toFixed(2)}x` : '—'}
            color={roas === null ? undefined : roas >= 3 ? '#22c55e' : roas >= 1.5 ? '#f59e0b' : '#ef4444'}
          />
          {data.adsSpend > 0 && data.day.salesCount > 0 && (
            <StatRow label="CPV" value={fmtR(data.adsSpend / data.day.salesCount)} />
          )}
        </DayCard>

        {/* Smartwatches */}
        <DayCard
          icon={Watch} iconColor="#22c55e" iconBg="rgba(34,197,94,0.12)"
          title="Smartwatches"
          mainValue={String(data.smartwatchesToday)}
          mainLabel={data.smartwatchesToday === 1 ? 'unidade vendida' : 'unidades vendidas'}
          onClick={() => onNavigate('history')}
        >
          <StatRow
            label="Ticket médio"
            value={data.day.salesCount > 0 ? fmtR(totalDayRev / data.day.salesCount) : '—'}
          />
        </DayCard>
      </div>

      {/* ── Métricas do Mês ───────────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Mês Atual
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <MonthCard icon={DollarSign}   iconColor="#f97316" label="Faturamento"   value={fmtR(data.month.revenue)} sub={`${data.month.salesCount} vendas`} />
        <MonthCard icon={TrendingUp}   iconColor="#22c55e" label="Lucro"         value={fmtR(data.month.profit)}  sub="estimado" />
        <MonthCard icon={ShoppingCart} iconColor="#3b82f6" label="Total Vendas"  value={String(data.month.salesCount)} sub="pedidos registrados" />
        <MonthCard icon={Target}       iconColor="#a855f7" label="Margem"        value={`${monthMargin.toFixed(1)}%`} sub="lucro / faturamento" />
      </div>

      {/* ── Alertas ──────────────────────────────────────────────────── */}
      {hasAlerts && (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Alertas
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: data.outOfStock.length > 0 && data.pendingPix > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>

            {data.outOfStock.length > 0 && (
              <div
                onClick={() => onNavigate('stock')}
                style={{
                  background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', flex: 1 }}>
                    {data.outOfStock.length} {data.outOfStock.length === 1 ? 'produto' : 'produtos'} com estoque zerado
                  </span>
                  <ArrowRight size={13} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.outOfStock.slice(0, 6).map(p => (
                    <span key={p.id} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500,
                    }}>
                      {p.model} {p.color}
                    </span>
                  ))}
                  {data.outOfStock.length > 6 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      +{data.outOfStock.length - 6} mais
                    </span>
                  )}
                </div>
              </div>
            )}

            {data.pendingPix > 0 && (
              <div
                onClick={() => onNavigate('logistics')}
                style={{
                  background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.25)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Clock size={16} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', flex: 1 }}>
                    {data.pendingPix} {data.pendingPix === 1 ? 'pedido PIX' : 'pedidos PIX'} aguardando confirmação
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
