import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShoppingCart, Package, Warehouse, History,
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle,
  Truck, ChevronRight, Clock,
} from 'lucide-react';
import { getTodayInBrazil, normalizeDateFromDB } from '../lib/dateUtils';

interface Stats {
  todaySales: number;
  todayRevenue: number;
  todayProfit: number;
  monthSales: number;
  monthRevenue: number;
  monthProfit: number;
  lastMonthRevenue: number;
  lastMonthProfit: number;
  lastMonthSales: number;
  ordersInSeparation: number;
  lowStock: number;
}

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    todaySales: 0, todayRevenue: 0, todayProfit: 0,
    monthSales: 0, monthRevenue: 0, monthProfit: 0,
    lastMonthRevenue: 0, lastMonthProfit: 0, lastMonthSales: 0,
    ordersInSeparation: 0, lowStock: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const todayStr = getTodayInBrazil();
      const today = new Date(todayStr + 'T00:00:00');
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const firstDayOfLastMonthStr = firstDayOfLastMonth.toISOString().split('T')[0];

      const [{ data: allSales }, { data: products }, { data: separacao }] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_sale_price, profit, sale_date')
          .gte('sale_date', `${firstDayOfLastMonthStr}T00:00:00`),
        supabase.from('products').select('id, current_stock, minimum_stock'),
        supabase
          .from('sales')
          .select('id', { count: 'exact' })
          .eq('status', 'em_separacao'),
      ]);

      if (products) {
        const low = products.filter(p => p.current_stock <= p.minimum_stock).length;
        setStats(prev => ({ ...prev, lowStock: low }));
      }

      const ordersInSeparation = separacao?.length ?? 0;

      if (allSales) {
        const todaySalesArr = allSales.filter(s => normalizeDateFromDB(s.sale_date) === todayStr);
        const monthSalesArr = allSales.filter(s => new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00') >= firstDayOfMonth);
        const lastMonthSalesArr = allSales.filter(s => {
          const d = new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00');
          return d >= firstDayOfLastMonth && d <= lastDayOfLastMonth;
        });

        setStats({
          todaySales: todaySalesArr.length,
          todayRevenue: todaySalesArr.reduce((s, x) => s + Number(x.total_sale_price), 0),
          todayProfit: todaySalesArr.reduce((s, x) => s + Number(x.profit), 0),
          monthSales: monthSalesArr.length,
          monthRevenue: monthSalesArr.reduce((s, x) => s + Number(x.total_sale_price), 0),
          monthProfit: monthSalesArr.reduce((s, x) => s + Number(x.profit), 0),
          lastMonthRevenue: lastMonthSalesArr.reduce((s, x) => s + Number(x.total_sale_price), 0),
          lastMonthProfit: lastMonthSalesArr.reduce((s, x) => s + Number(x.profit), 0),
          lastMonthSales: lastMonthSalesArr.length,
          ordersInSeparation,
          lowStock: products?.filter(p => p.current_stock <= p.minimum_stock).length ?? 0,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#f5c518', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const revenueGrowth = stats.lastMonthRevenue > 0
    ? ((stats.monthRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100 : null;
  const profitGrowth = stats.lastMonthProfit > 0
    ? ((stats.monthProfit - stats.lastMonthProfit) / stats.lastMonthProfit) * 100 : null;
  const salesGrowth = stats.lastMonthSales > 0
    ? ((stats.monthSales - stats.lastMonthSales) / stats.lastMonthSales) * 100 : null;

  const now = new Date();
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const todayLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-6 md:p-8" style={{ minHeight: '100%' }}>

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white">Visão Geral</h1>
        <p className="text-xs mt-0.5 capitalize" style={{ color: '#5a5a7a' }}>{todayLabel}</p>
      </div>

      {/* ── HOJE ── */}
      <SectionLabel>HOJE</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <TodayCard
          label="VENDAS"
          value={stats.todaySales.toString()}
          sub="pedidos hoje"
          accent="#f5c518"
          icon={<ShoppingCart size={14} />}
        />
        <TodayCard
          label="FATURAMENTO"
          value={`R$${fmt(stats.todayRevenue)}`}
          sub="receita hoje"
          accent="#3b82f6"
          icon={<ArrowUpRight size={14} />}
        />
        <TodayCard
          label="LUCRO"
          value={`R$${fmt(stats.todayProfit)}`}
          sub={stats.todayRevenue > 0 ? `${((stats.todayProfit / stats.todayRevenue) * 100).toFixed(1)}% margem` : 'sem vendas'}
          accent="#22c55e"
          icon={<ArrowUpRight size={14} />}
        />
        <div
          className="rounded-xl p-4 cursor-pointer"
          style={{
            background: stats.ordersInSeparation > 0 ? '#1a1200' : '#111118',
            border: `1px solid ${stats.ordersInSeparation > 0 ? '#f5c518' : '#1a1a2a'}`,
            borderLeft: `3px solid ${stats.ordersInSeparation > 0 ? '#f5c518' : '#2a2a3a'}`,
          }}
          onClick={() => onNavigate('logistics')}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={12} style={{ color: stats.ordersInSeparation > 0 ? '#f5c518' : '#5a5a7a' }} />
            <p className="text-xs font-semibold tracking-widest" style={{ color: stats.ordersInSeparation > 0 ? '#f5c518' : '#5a5a7a' }}>EM SEPARAÇÃO</p>
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: stats.ordersInSeparation > 0 ? '#f5c518' : '#3a3a5a' }}>
            {stats.ordersInSeparation}
          </p>
          <p className="text-xs" style={{ color: '#5a5a7a' }}>
            {stats.ordersInSeparation === 0 ? 'nenhum aguardando' : stats.ordersInSeparation === 1 ? 'pedido aguardando' : 'pedidos aguardando'}
          </p>
        </div>
      </div>

      {/* ── MÊS ATUAL ── */}
      <SectionLabel>MÊS ATUAL — <span className="normal-case font-normal" style={{ color: '#5a5a7a' }}>{monthName}</span></SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <MonthCard
          label="FATURAMENTO"
          value={`R$${fmt(stats.monthRevenue)}`}
          growth={revenueGrowth}
          sub={`vs. mês anterior: R$${fmt(stats.lastMonthRevenue)}`}
          accent="#f5c518"
        />
        <MonthCard
          label="LUCRO LÍQUIDO"
          value={`R$${fmt(stats.monthProfit)}`}
          growth={profitGrowth}
          sub={stats.monthRevenue > 0 ? `${((stats.monthProfit / stats.monthRevenue) * 100).toFixed(1)}% de margem` : 'sem vendas'}
          accent="#22c55e"
        />
        <MonthCard
          label="TOTAL DE VENDAS"
          value={stats.monthSales.toString()}
          growth={salesGrowth}
          sub={`mês anterior: ${stats.lastMonthSales} vendas`}
          accent="#3b82f6"
        />
      </div>

      {/* ── ALERTAS + ACESSO RÁPIDO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Alertas */}
        <div className="rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <SectionLabel inline>ALERTAS</SectionLabel>
          <div className="space-y-2.5 mt-3">
            {/* Estoque */}
            {stats.lowStock > 0 ? (
              <AlertRow
                icon={<AlertTriangle size={13} />}
                text={`${stats.lowStock} produto${stats.lowStock > 1 ? 's' : ''} abaixo do estoque ideal`}
                color="#f59e0b"
                bg="#1f1a0a"
                border="#3a2a0a"
                onClick={() => onNavigate('stock')}
              />
            ) : (
              <AlertRow
                icon={<CheckCircle size={13} />}
                text="Estoque dentro do ideal"
                color="#22c55e"
                bg="#0a1a0a"
                border="#0a2a0a"
              />
            )}
            {/* Separação */}
            {stats.ordersInSeparation > 0 ? (
              <AlertRow
                icon={<Truck size={13} />}
                text={`${stats.ordersInSeparation} pedido${stats.ordersInSeparation > 1 ? 's' : ''} em separação aguardando`}
                color="#f5c518"
                bg="#1a1200"
                border="#2a2000"
                onClick={() => onNavigate('logistics')}
              />
            ) : (
              <AlertRow
                icon={<CheckCircle size={13} />}
                text="Nenhum pedido em separação"
                color="#22c55e"
                bg="#0a1a0a"
                border="#0a2a0a"
              />
            )}
          </div>
        </div>

        {/* Acesso Rápido */}
        <div className="rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <SectionLabel inline>ACESSO RÁPIDO</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <QuickLink
              label="Nova Venda"
              icon={<ShoppingCart size={16} />}
              color="#f5c518"
              bg="#1a1500"
              border="#2a2200"
              onClick={() => onNavigate('sales')}
            />
            <QuickLink
              label="Histórico"
              icon={<History size={16} />}
              color="#3b82f6"
              bg="#0a1020"
              border="#0a1530"
              onClick={() => onNavigate('history')}
            />
            <QuickLink
              label="Logística"
              icon={<Truck size={16} />}
              color="#8b5cf6"
              bg="#130a20"
              border="#1a0a30"
              onClick={() => onNavigate('logistics')}
            />
            <QuickLink
              label="Estoque"
              icon={<Warehouse size={16} />}
              color="#22c55e"
              bg="#0a1a0a"
              border="#0a2a0a"
              onClick={() => onNavigate('stock')}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('pt-BR');
}

function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <p className={`text-xs font-bold tracking-widest ${inline ? '' : 'mb-3'}`} style={{ color: '#3a3a5a' }}>
      {children}
    </p>
  );
}

function TodayCard({ label, value, sub, accent, icon }: {
  label: string; value: string; sub: string; accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#111118', border: '1px solid #1a1a2a', borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: accent }}>{icon}</span>
        <p className="text-xs font-semibold tracking-widest" style={{ color: '#3a3a5a' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color: accent }}>{value}</p>
      <p className="text-xs" style={{ color: '#5a5a7a' }}>{sub}</p>
    </div>
  );
}

function MonthCard({ label, value, growth, sub, accent }: {
  label: string; value: string; growth: number | null; sub: string; accent: string;
}) {
  const pos = growth !== null && growth >= 0;
  return (
    <div className="rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a', borderLeft: `3px solid ${accent}` }}>
      <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#3a3a5a' }}>{label}</p>
      <p className="text-3xl font-bold mb-2" style={{ color: accent }}>{value}</p>
      <div className="flex items-center gap-2">
        {growth !== null && (
          <span
            className="flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ color: pos ? '#22c55e' : '#ef4444', background: pos ? '#0a2a0a' : '#2a0a0a' }}
          >
            {pos ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(growth).toFixed(0)}%
          </span>
        )}
        <span className="text-xs" style={{ color: '#5a5a7a' }}>{sub}</span>
      </div>
    </div>
  );
}

function AlertRow({ icon, text, color, bg, border, onClick }: {
  icon: React.ReactNode; text: string; color: string; bg: string; border: string; onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 p-3 rounded-lg ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: bg, border: `1px solid ${border}` }}
      onClick={onClick}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-medium flex-1" style={{ color }}>{text}</span>
      {onClick && <ChevronRight size={11} style={{ color }} />}
    </div>
  );
}

function QuickLink({ label, icon, color, bg, border, onClick }: {
  label: string; icon: React.ReactNode; color: string; bg: string; border: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl w-full transition-opacity hover:opacity-80"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </button>
  );
}
