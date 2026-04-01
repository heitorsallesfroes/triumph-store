
import { useEffect, useState } from 'react';
import { supabase, MotoboyStats } from '../lib/supabase';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, Package, MapPin, Bike, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import BarChart from '../components/BarChart';
import { getTodayInBrazil, normalizeDateFromDB } from '../lib/dateUtils';

interface DashboardStats {
  dailySales: number;
  dailyRevenue: number;
  dailyProfit: number;
  dailyAdSpend: number;
  dailyRoas: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  averageTicket: number;
  lastMonthRevenue: number;
  lastMonthProfit: number;
}

interface SalesChartData {
  date: string;
  sales: number;
  revenue: number;
}

interface PaymentMethodData {
  method: string;
  count: number;
}

interface ProductSales {
  product_id: string;
  model: string;
  color: string;
  total_quantity: number;
  total_profit: number;
}

interface CityData {
  city: string;
  purchases: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    dailySales: 0,
    dailyRevenue: 0,
    dailyProfit: 0,
    dailyAdSpend: 0,
    dailyRoas: 0,
    monthlyRevenue: 0,
    monthlyProfit: 0,
    averageTicket: 0,
    lastMonthRevenue: 0,
    lastMonthProfit: 0,
  });
  const [salesChart, setSalesChart] = useState<SalesChartData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [bestSelling, setBestSelling] = useState<ProductSales[]>([]);
  const [mostProfitable, setMostProfitable] = useState<ProductSales[]>([]);
  const [topCities, setTopCities] = useState<CityData[]>([]);
  const [topMotoboys, setTopMotoboys] = useState<MotoboyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const todayStr = getTodayInBrazil();
      const today = new Date(todayStr + 'T00:00:00');
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

      const { data: allSales } = await supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: true });

      const { data: adSpendData } = await supabase.from('ad_spend').select('*');

      if (allSales) {
        const todaySales = allSales.filter(s => normalizeDateFromDB(s.sale_date) === todayStr);
        const monthSales = allSales.filter(s => {
          const d = new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00');
          return d >= firstDayOfMonth;
        });
        const lastMonthSales = allSales.filter(s => {
          const d = new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00');
          return d >= firstDayOfLastMonth && d <= lastDayOfLastMonth;
        });

        const dailyRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const dailyProfit = todaySales.reduce((sum, s) => sum + Number(s.profit), 0);
        const monthlyRevenue = monthSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const monthlyProfit = monthSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const lastMonthRevenue = lastMonthSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const lastMonthProfit = lastMonthSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const averageTicket = monthSales.length > 0 ? monthlyRevenue / monthSales.length : 0;
        const todayAdSpend = adSpendData?.find(ad => ad.date === todayStr);
        const dailyAdSpend = todayAdSpend ? Number(todayAdSpend.amount) : 0;
        const dailyRoas = dailyAdSpend > 0 ? dailyRevenue / dailyAdSpend : 0;

        setStats({
          dailySales: todaySales.length,
          dailyRevenue,
          dailyProfit,
          dailyAdSpend,
          dailyRoas,
          monthlyRevenue,
          monthlyProfit,
          averageTicket,
          lastMonthRevenue,
          lastMonthProfit,
        });

        const last7Days = new Date(todayStr + 'T00:00:00');
        last7Days.setDate(last7Days.getDate() - 6);
        const chartData: { [key: string]: { sales: number; revenue: number } } = {};
        for (let i = 0; i < 7; i++) {
          const date = new Date(last7Days);
          date.setDate(date.getDate() + i);
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          chartData[dateStr] = { sales: 0, revenue: 0 };
        }
        allSales.forEach(sale => {
          const saleDate = new Date(normalizeDateFromDB(sale.sale_date) + 'T00:00:00');
          if (saleDate >= last7Days) {
            const dateStr = saleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (chartData[dateStr]) {
              chartData[dateStr].sales++;
              chartData[dateStr].revenue += Number(sale.total_sale_price);
            }
          }
        });
        setSalesChart(Object.entries(chartData).map(([date, data]) => ({ date, sales: data.sales, revenue: data.revenue })));

        const paymentMethodCount: { [key: string]: number } = {};
        monthSales.forEach(sale => {
          paymentMethodCount[sale.payment_method] = (paymentMethodCount[sale.payment_method] || 0) + 1;
        });
        setPaymentMethods(Object.entries(paymentMethodCount).map(([method, count]) => ({ method, count })));
      }

      const { data: saleItems } = await supabase.from('sale_items').select('product_id, quantity, unit_price, sale_id');
      const { data: products } = await supabase.from('products').select('id, model, color, cost');

      if (saleItems && products) {
        const productMap = new Map<string, ProductSales>();
        saleItems.forEach(item => {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            const current = productMap.get(item.product_id) || { product_id: product.id, model: product.model, color: product.color, total_quantity: 0, total_profit: 0 };
            current.total_quantity += item.quantity;
            current.total_profit += (item.unit_price - product.cost) * item.quantity;
            productMap.set(item.product_id, current);
          }
        });
        const productSales = Array.from(productMap.values());
        setBestSelling([...productSales].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 5));
        setMostProfitable([...productSales].sort((a, b) => b.total_profit - a.total_profit).slice(0, 5));
      }

      if (allSales) {
        const cityMap = new Map<string, number>();
        allSales.forEach(sale => cityMap.set(sale.city, (cityMap.get(sale.city) || 0) + 1));
        setTopCities(Array.from(cityMap.entries()).map(([city, purchases]) => ({ city, purchases })).sort((a, b) => b.purchases - a.purchases).slice(0, 5));
      }

      const { data: motoboyStats } = await supabase.from('motoboy_stats').select('*').gt('total_deliveries', 0).order('total_deliveries', { ascending: false }).limit(5);
      if (motoboyStats) setTopMotoboys(motoboyStats);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const revenueGrowth = stats.lastMonthRevenue > 0 ? ((stats.monthlyRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100 : 0;
  const profitGrowth = stats.lastMonthProfit > 0 ? ((stats.monthlyProfit - stats.lastMonthProfit) / stats.lastMonthProfit) * 100 : 0;
  const profitMargin = stats.monthlyRevenue > 0 ? (stats.monthlyProfit / stats.monthlyRevenue) * 100 : 0;

  const now = new Date();
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const monthNameCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ background: '#0a0a0f' }}>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{monthNameCapitalized} · Dados em tempo real</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', color: '#a0a0c0' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Ao vivo
        </div>
      </div>

      {/* Cards principais — métricas do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <MetricCard
          label="Faturamento"
          value={`R$${Math.round(stats.monthlyRevenue).toLocaleString('pt-BR')}`}
          growth={revenueGrowth}
          sub="vs mês anterior"
          accent="#f97316"
          icon={<DollarSign size={16} />}
        />

        <MetricCard
          label="Lucro Líquido"
          value={`R$${Math.round(stats.monthlyProfit).toLocaleString('pt-BR')}`}
          growth={profitGrowth}
          sub={`${profitMargin.toFixed(0)}% de margem`}
          accent="#22c55e"
          icon={<TrendingUp size={16} />}
        />

        <MetricCard
          label="Ticket Médio"
          value={`R$${Math.round(stats.averageTicket).toLocaleString('pt-BR')}`}
          growth={null}
          sub="por venda no mês"
          accent="#8b5cf6"
          icon={<Wallet size={16} />}
        />

        <MetricCard
          label="Vendas Hoje"
          value={stats.dailySales.toString()}
          growth={null}
          sub={`R$${Math.round(stats.dailyRevenue).toLocaleString('pt-BR')} faturado`}
          accent="#06b6d4"
          icon={<ShoppingBag size={16} />}
        />
      </div>

      {/* Resumo do dia */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#111118', border: '1px solid #1e1e2e' }}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-white">Resumo do Dia</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <DayCard label="Vendas" value={stats.dailySales.toString()} color="#ffffff" />
          <DayCard label="Faturamento" value={`R$${Math.round(stats.dailyRevenue).toLocaleString('pt-BR')}`} color="#22c55e" />
          <DayCard label="Lucro" value={`R$${Math.round(stats.dailyProfit).toLocaleString('pt-BR')}`} color="#3b82f6" />
          <DayCard label="Gasto Ads" value={`R$${Math.round(stats.dailyAdSpend).toLocaleString('pt-BR')}`} color="#ef4444" />
          <DayCard label="ROAS" value={stats.dailyRoas > 0 ? `${stats.dailyRoas.toFixed(1)}x` : '—'} color="#f97316" />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Top 5 Produtos Mais Vendidos" icon={<Package size={15} className="text-orange-400" />}>
          {bestSelling.length === 0 ? (
            <EmptyState />
          ) : (
            <BarChart
              data={bestSelling.map(p => ({
                label: `${p.model.split(' ')[0]} ${p.color.substring(0, 3)}`,
                value: p.total_quantity,
                color: 'bg-orange-500',
              }))}
              height="h-56"
            />
          )}
        </ChartCard>

        <ChartCard title="Top 5 Produtos Mais Lucrativos" icon={<DollarSign size={15} className="text-green-400" />}>
          {mostProfitable.length === 0 ? (
            <EmptyState />
          ) : (
            <BarChart
              data={mostProfitable.map(p => ({
                label: `${p.model.split(' ')[0]} ${p.color.substring(0, 3)}`,
                value: Math.round(p.total_profit),
                color: 'bg-green-500',
              }))}
              height="h-56"
            />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 5 Cidades" icon={<MapPin size={15} className="text-blue-400" />}>
          {topCities.length === 0 ? (
            <EmptyState />
          ) : (
            <BarChart
              data={topCities.map(c => ({
                label: c.city.split(' ')[0].substring(0, 10),
                value: c.purchases,
                color: 'bg-blue-500',
              }))}
              height="h-56"
            />
          )}
        </ChartCard>

        <ChartCard title="Top 5 Motoboys" icon={<Bike size={15} className="text-orange-400" />}>
          {topMotoboys.length === 0 ? (
            <EmptyState />
          ) : (
            <BarChart
              data={topMotoboys.map(m => ({
                label: m.name.split(' ')[0].substring(0, 10),
                value: m.total_deliveries,
                color: 'bg-orange-500',
              }))}
              height="h-56"
            />
          )}
        </ChartCard>
      </div>

    </div>
  );
}

/* ── Componentes internos ── */

function MetricCard({ label, value, growth, sub, accent, icon }: {
  label: string;
  value: string;
  growth: number | null;
  sub: string;
  accent: string;
  icon: React.ReactNode;
}) {
  const isPositive = growth !== null && growth >= 0;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: '#111118', border: '1px solid #1e1e2e' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none mb-1">{value}</p>
        <div className="flex items-center gap-1.5">
          {growth !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(growth).toFixed(0)}%
            </span>
          )}
          <span className="text-xs text-gray-600">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function DayCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#0d0d15' }}>
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <p className="text-base font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid #1e1e2e' }}>
      <div className="flex items-center gap-2 mb-5">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Sem dados ainda</div>;
}

