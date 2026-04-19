import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Package, Warehouse, TrendingUp, ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import { getTodayInBrazil, normalizeDateFromDB } from '../lib/dateUtils';

interface DashboardStats {
  dailySales: number;
  dailyRevenue: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  averageTicket: number;
  lastMonthRevenue: number;
  lastMonthProfit: number;
  totalSalesMonth: number;
  dailyAdSpend: number;
  dailyRoas: number;
}

interface ProductSales {
  product_id: string;
  model: string;
  color: string;
  total_quantity: number;
  total_profit: number;
}

interface AccumulatedDay {
  day: number;
  revenue: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    dailySales: 0, dailyRevenue: 0, monthlyRevenue: 0,
    monthlyProfit: 0, averageTicket: 0, lastMonthRevenue: 0,
    lastMonthProfit: 0, totalSalesMonth: 0, dailyAdSpend: 0, dailyRoas: 0,
  });
  const [bestSelling, setBestSelling] = useState<ProductSales[]>([]);
  const [accumulated, setAccumulated] = useState<AccumulatedDay[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      const todayStr = getTodayInBrazil();
      const today = new Date(todayStr + 'T00:00:00');
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

      const firstDayOfLastMonthStr = firstDayOfLastMonth.toISOString().split('T')[0];

      const [{ data: allSales }, { data: adSpendData }, { data: products }] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_sale_price, profit, sale_date')
          .gte('sale_date', `${firstDayOfLastMonthStr}T00:00:00`)
          .order('sale_date', { ascending: true }),
        supabase.from('ad_spend').select('date, amount'),
        supabase.from('products').select('id, model, color, cost, category, current_stock, minimum_stock'),
      ]);

      if (products) {
        setLowStock(products.filter(p => p.current_stock <= p.minimum_stock).length);
      }

      if (allSales) {
        const todaySales = allSales.filter(s => normalizeDateFromDB(s.sale_date) === todayStr);
        const monthSales = allSales.filter(s => new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00') >= firstDayOfMonth);
        const lastMonthSales = allSales.filter(s => {
          const d = new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00');
          return d >= firstDayOfLastMonth && d <= lastDayOfLastMonth;
        });

        const dailyRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const monthlyRevenue = monthSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const monthlyProfit = monthSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const lastMonthRevenue = lastMonthSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const lastMonthProfit = lastMonthSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const todayAd = adSpendData?.find(a => a.date === todayStr);
        const dailyAdSpend = todayAd ? Number(todayAd.amount) : 0;

        setStats({
          dailySales: todaySales.length, dailyRevenue, monthlyRevenue, monthlyProfit,
          averageTicket: monthSales.length > 0 ? monthlyRevenue / monthSales.length : 0,
          lastMonthRevenue, lastMonthProfit, totalSalesMonth: monthSales.length,
          dailyAdSpend, dailyRoas: dailyAdSpend > 0 ? dailyRevenue / dailyAdSpend : 0,
        });

        // Acumulado
        const daysToday = today.getDate();
        let acc = 0;
        const accData: AccumulatedDay[] = [];
        for (let d = 1; d <= daysToday; d++) {
          const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          acc += allSales.filter(s => normalizeDateFromDB(s.sale_date) === ds).reduce((sum, s) => sum + Number(s.total_sale_price), 0);
          accData.push({ day: d, revenue: acc });
        }
        setAccumulated(accData);

        // Top produtos do mês atual — busca sale_items apenas dos IDs do mês
        const monthSaleIds = monthSales.map(s => s.id);
        if (monthSaleIds.length > 0 && products) {
          const { data: saleItems } = await supabase
            .from('sale_items')
            .select('product_id, quantity, unit_price')
            .in('sale_id', monthSaleIds);

          if (saleItems) {
            const map = new Map<string, ProductSales>();
            saleItems.forEach(item => {
              const p = products.find(x => x.id === item.product_id);
              if (p && (p as any).category === 'smartwatch') {
                const cur = map.get(item.product_id) || { product_id: p.id, model: p.model, color: p.color, total_quantity: 0, total_profit: 0 };
                cur.total_quantity += item.quantity;
                cur.total_profit += (item.unit_price - p.cost) * item.quantity;
                map.set(item.product_id, cur);
              }
            });
            setBestSelling([...map.values()].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 5));
          }
        }
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
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#f5c518', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const revenueGrowth = stats.lastMonthRevenue > 0 ? ((stats.monthlyRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100 : 0;
  const profitGrowth = stats.lastMonthProfit > 0 ? ((stats.monthlyProfit - stats.lastMonthProfit) / stats.lastMonthProfit) * 100 : 0;
  const profitMargin = stats.monthlyRevenue > 0 ? (stats.monthlyProfit / stats.monthlyRevenue) * 100 : 0;

  const marginScore = Math.min(profitMargin / 30 * 30, 30);
  const growthScore = Math.min(Math.max(revenueGrowth, 0) / 20 * 25, 25);
  const salesScore = Math.min(stats.totalSalesMonth / 50 * 25, 25);
  const stockScore = lowStock === 0 ? 20 : Math.max(20 - lowStock * 4, 0);
  const healthScore = Math.round(marginScore + growthScore + salesScore + stockScore);
  const healthColor = healthScore >= 70 ? '#22c55e' : healthScore >= 40 ? '#f5c518' : '#ef4444';
  const healthLabel = healthScore >= 70 ? 'Ótimo 🚀' : healthScore >= 40 ? 'Atenção ●' : 'Crítico ●';

  const now = new Date();
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const maxAcc = Math.max(...accumulated.map(d => d.revenue), 1);
  const W = 540; const H = 80;
  const pts = accumulated.map((d, i) => `${accumulated.length > 1 ? (i / (accumulated.length - 1)) * W : 0},${H - (d.revenue / maxAcc) * H}`).join(' ');

  return (
    <div className="p-6 md:p-8" style={{ minHeight: '100%' }}>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Visão Geral</h1>
        <p className="text-xs uppercase tracking-widest mt-0.5" style={{ color: '#3a3a5a' }}>Visão geral do negócio</p>
      </div>

      {/* Cards principais */}
      <p className="text-xs mb-1.5 font-medium" style={{ color: '#3a3a5a' }}>FATURAMENTO E LUCRO — mês atual · vs. mês anterior</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <BigCard label="FATURAMENTO" value={`R$${Math.round(stats.monthlyRevenue).toLocaleString('pt-BR')}`} sub={`${stats.totalSalesMonth} vendas`} growth={revenueGrowth} accent="#f5c518" />
        <BigCard label="LUCRO LÍQUIDO" value={`R$${Math.round(stats.monthlyProfit).toLocaleString('pt-BR')}`} sub={`${profitMargin.toFixed(1)}% de margem`} growth={profitGrowth} accent="#22c55e" />
        <BigCard label="TOTAL GASTOS" value={`R$${Math.round(stats.dailyAdSpend).toLocaleString('pt-BR')}`} sub="Ads hoje" growth={null} accent="#ef4444" />
        <BigCard label="RESULTADO FINAL" value={`R$${Math.round(stats.monthlyProfit).toLocaleString('pt-BR')}`} sub="Após tudo" growth={null} accent="#8b5cf6" />
      </div>

      {/* Cards secundários */}
      <p className="text-xs mb-1.5 font-medium" style={{ color: '#3a3a5a' }}>MÉTRICAS RÁPIDAS — hoje e mês atual</p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <SmallCard label="TICKET MÉDIO" value={`R$${Math.round(stats.averageTicket).toLocaleString('pt-BR')}`} sub="Por venda" />
        <SmallCard label="ROI" value={stats.dailyRoas > 0 ? `${stats.dailyRoas.toFixed(1)}x` : '—'} sub="Mês atual" bar="#f5c518" />
        <SmallCard label="VENDAS HOJE" value={stats.dailySales.toString()} sub={`R$${Math.round(stats.dailyRevenue).toLocaleString('pt-BR')} faturado`} />
      </div>

      {/* Gráfico + Saúde */}
      <p className="text-xs mb-1.5 font-medium" style={{ color: '#3a3a5a' }}>EVOLUÇÃO E SAÚDE — mês atual</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} style={{ color: '#f5c518' }} />
              <span className="text-sm font-semibold text-white capitalize">Faturamento Acumulado — {monthName}</span>
            </div>
            <span className="text-sm font-bold" style={{ color: '#f5c518' }}>R${Math.round(stats.monthlyRevenue).toLocaleString('pt-BR')}</span>
          </div>
          {stats.monthlyRevenue > 0 ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H + 5}`} preserveAspectRatio="none" style={{ height: 80 }}>
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5c518" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f5c518" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline fill="none" stroke="#f5c518" strokeWidth="2" points={pts} />
              <polygon fill="url(#lg)" points={`0,${H} ${pts} ${W},${H}`} />
            </svg>
          ) : (
            <div className="h-20 flex items-center justify-center text-sm" style={{ color: '#3a3a5a' }}>Sem vendas no período</div>
          )}
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: '#3a3a5a' }}>Dia 1</span>
            <span className="text-xs" style={{ color: '#3a3a5a' }}>Dia {now.getDate()}</span>
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} style={{ color: '#f5c518' }} />
            <span className="text-sm font-semibold text-white">Saúde do Negócio</span>
          </div>
          <div className="text-center mb-4">
            <p className="text-5xl font-bold" style={{ color: healthColor }}>{healthScore}</p>
            <p className="text-xs mt-1 font-medium" style={{ color: healthColor }}>{healthLabel}</p>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>Score 0-100</p>
          </div>
          <div className="space-y-2.5">
            <HealthBar label="Margem líquida" value={Math.round(marginScore)} max={30} color="#22c55e" />
            <HealthBar label="Crescimento" value={Math.round(growthScore)} max={25} color="#f5c518" />
            <HealthBar label="Volume de vendas" value={Math.round(salesScore)} max={25} color="#f5c518" />
            <HealthBar label="Controle de estoque" value={Math.round(stockScore)} max={20} color="#3b82f6" />
          </div>
        </div>
      </div>

      {/* Top produtos + Acesso rápido */}
      <p className="text-xs mb-1.5 font-medium" style={{ color: '#3a3a5a' }}>RANKING E ALERTAS</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package size={14} style={{ color: '#f5c518' }} />
              <span className="text-sm font-semibold text-white">Top Produtos Mais Vendidos</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1a1a2a', color: '#5a5a7a' }}>mês atual · só smartwatches</span>
          </div>
          {bestSelling.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: '#3a3a5a' }}>Sem dados ainda</div>
          ) : (
            <div className="space-y-3">
              {bestSelling.map((p, i) => {
                const pct = (p.total_quantity / bestSelling[0].total_quantity) * 100;
                return (
                  <div key={p.product_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white">{p.model} {p.color}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: '#5a5a7a' }}>{p.total_quantity} un.</span>
                        <span className="text-xs font-semibold" style={{ color: '#f5c518' }}>R${Math.round(p.total_profit).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: '#1a1a2a' }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: i === 0 ? '#f5c518' : '#3a3a5a' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
          <p className="text-sm font-semibold text-white mb-3">Acesso Rápido</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <QuickLink label="Nova Venda" icon={<ShoppingCart size={14} />} color="#f5c518" />
            <QuickLink label="Estoque" icon={<Warehouse size={14} />} color="#3b82f6" />
            <QuickLink label="Produtos" icon={<Package size={14} />} color="#22c55e" />
            <QuickLink label="Relatórios" icon={<TrendingUp size={14} />} color="#8b5cf6" />
          </div>
          <p className="text-sm font-semibold text-white mb-3">Alertas</p>
          {lowStock > 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: '#1f1a0a', border: '1px solid #3a2a0a' }}>
              <AlertTriangle size={13} style={{ color: '#f5c518' }} />
              <span className="text-xs" style={{ color: '#f5c518' }}>{lowStock} produto(s) abaixo do mínimo</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: '#0a1f0a', border: '1px solid #0a3a0a' }}>
              <CheckCircle size={13} style={{ color: '#22c55e' }} />
              <span className="text-xs" style={{ color: '#22c55e' }}>Tudo em ordem!</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function BigCard({ label, value, sub, growth, accent }: { label: string; value: string; sub: string; growth: number | null; accent: string }) {
  const pos = growth !== null && growth >= 0;
  return (
    <div className="rounded-xl p-4" style={{ background: '#111118', borderTop: '1px solid #1a1a2a', borderRight: '1px solid #1a1a2a', borderBottom: '1px solid #1a1a2a', borderLeft: `3px solid ${accent}` }}>
      <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: '#3a3a5a' }}>{label}</p>
      <p className="text-xl font-bold mb-1" style={{ color: accent }}>{value}</p>
      <div className="flex items-center gap-1.5">
        {growth !== null && (
          <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: pos ? '#22c55e' : '#ef4444' }}>
            {pos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(growth).toFixed(0)}%
          </span>
        )}
        <span className="text-xs" style={{ color: '#3a3a5a' }}>{sub}</span>
      </div>
    </div>
  );
}

function SmallCard({ label, value, sub, bar }: { label: string; value: string; sub: string; bar?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
      <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: '#3a3a5a' }}>{label}</p>
      <p className="text-xl font-bold text-white mb-1">{value}</p>
      {bar && <div className="h-0.5 w-8 rounded mb-1" style={{ background: bar }} />}
      <p className="text-xs" style={{ color: '#3a3a5a' }}>{sub}</p>
    </div>
  );
}

function HealthBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: '#5a5a7a' }}>{label}</span>
        <span className="text-xs" style={{ color: '#5a5a7a' }}>{value}/{max}</span>
      </div>
      <div className="h-1 rounded-full" style={{ background: '#1a1a2a' }}>
        <div className="h-1 rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function QuickLink({ label, icon, color }: { label: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer" style={{ background: '#0d0d14', border: '1px solid #1a1a2a' }}>
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
      </div>
      <ChevronRight size={11} style={{ color: '#3a3a5a' }} />
    </div>
  );
}
