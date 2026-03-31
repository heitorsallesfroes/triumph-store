import { useEffect, useState } from 'react';
import { supabase, MotoboyStats } from '../lib/supabase';
import { DollarSign, TrendingUp, ShoppingBag, Wallet, Package, MapPin, Bike } from 'lucide-react';
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

      const { data: allSales } = await supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: true });

      const { data: adSpendData } = await supabase
        .from('ad_spend')
        .select('*');

      if (allSales) {
        const todaySales = allSales.filter(s => {
          const saleDate = normalizeDateFromDB(s.sale_date);
          return saleDate === todayStr;
        });

        const monthSales = allSales.filter(s => {
          const saleDate = new Date(normalizeDateFromDB(s.sale_date) + 'T00:00:00');
          return saleDate >= firstDayOfMonth;
        });

        const dailySales = todaySales.length;
        const dailyRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const dailyProfit = todaySales.reduce((sum, s) => sum + Number(s.profit), 0);
        const monthlyRevenue = monthSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const monthlyProfit = monthSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const averageTicket = monthSales.length > 0 ? monthlyRevenue / monthSales.length : 0;

        const todayAdSpend = adSpendData?.find(ad => ad.date === todayStr);
        const dailyAdSpend = todayAdSpend ? Number(todayAdSpend.amount) : 0;
        const dailyRoas = dailyAdSpend > 0 ? dailyRevenue / dailyAdSpend : 0;

        setStats({
          dailySales,
          dailyRevenue,
          dailyProfit,
          dailyAdSpend,
          dailyRoas,
          monthlyRevenue,
          monthlyProfit,
          averageTicket,
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

        setSalesChart(
          Object.entries(chartData).map(([date, data]) => ({
            date,
            sales: data.sales,
            revenue: data.revenue,
          }))
        );

        const paymentMethodCount: { [key: string]: number } = {};
        monthSales.forEach(sale => {
          paymentMethodCount[sale.payment_method] = (paymentMethodCount[sale.payment_method] || 0) + 1;
        });

        setPaymentMethods(
          Object.entries(paymentMethodCount).map(([method, count]) => ({
            method,
            count,
          }))
        );
      }

      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity, unit_price, sale_id');

      const { data: products } = await supabase
        .from('products')
        .select('id, model, color, cost');

      if (saleItems && products) {
        const productMap = new Map<string, ProductSales>();

        saleItems.forEach(item => {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            const key = item.product_id;
            const current = productMap.get(key) || {
              product_id: product.id,
              model: product.model,
              color: product.color,
              total_quantity: 0,
              total_profit: 0,
            };

            current.total_quantity += item.quantity;
            current.total_profit += (item.unit_price - product.cost) * item.quantity;

            productMap.set(key, current);
          }
        });

        const productSales = Array.from(productMap.values());
        setBestSelling([...productSales].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 5));
        setMostProfitable([...productSales].sort((a, b) => b.total_profit - a.total_profit).slice(0, 5));
      }

      if (allSales) {
        const cityMap = new Map<string, number>();
        allSales.forEach(sale => {
          cityMap.set(sale.city, (cityMap.get(sale.city) || 0) + 1);
        });

        const cities = Array.from(cityMap.entries())
          .map(([city, purchases]) => ({ city, purchases }))
          .sort((a, b) => b.purchases - a.purchases)
          .slice(0, 5);

        setTopCities(cities);
      }

      const { data: motoboyStats } = await supabase
        .from('motoboy_stats')
        .select('*')
        .gt('total_deliveries', 0)
        .order('total_deliveries', { ascending: false })
        .limit(5);

      if (motoboyStats) {
        setTopMotoboys(motoboyStats);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  const maxRevenue = Math.max(...salesChart.map(d => d.revenue), 1);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Painel</h1>

      <div className="bg-gradient-to-r from-orange-600/20 to-orange-500/20 border border-orange-500/30 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Resumo do Dia</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Vendas</p>
            <p className="text-2xl font-bold text-white">{stats.dailySales}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Faturamento</p>
            <p className="text-2xl font-bold text-green-500">R$ {stats.dailyRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Lucro</p>
            <p className="text-2xl font-bold text-blue-500">R$ {stats.dailyProfit.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Gasto Ads</p>
            <p className="text-2xl font-bold text-red-500">R$ {stats.dailyAdSpend.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">ROAS</p>
            <p className="text-2xl font-bold text-orange-500">{stats.dailyRoas > 0 ? `${stats.dailyRoas.toFixed(2)}x` : '-'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Vendas do Dia"
          value={stats.dailySales.toString()}
          icon={ShoppingBag}
          color="orange"
        />
        <StatCard
          title="Faturamento do Dia"
          value={`R$ ${stats.dailyRevenue.toFixed(2)}`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Faturamento do Mês"
          value={`R$ ${stats.monthlyRevenue.toFixed(2)}`}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Lucro do Mês"
          value={`R$ ${stats.monthlyProfit.toFixed(2)}`}
          icon={Wallet}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Ticket Médio</h3>
          <p className="text-3xl font-bold text-orange-500">
            R$ {stats.averageTicket.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-6">
            <Package className="text-orange-500" size={20} />
            <h3 className="text-lg font-semibold text-white">Top 5 Produtos Mais Vendidos</h3>
          </div>
          {bestSelling.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados ainda</div>
          ) : (
            <BarChart
              data={bestSelling.map(p => ({
                label: `${p.model.split(' ')[0]} ${p.color.substring(0, 3)}`,
                value: p.total_quantity,
                color: 'bg-orange-500',
              }))}
              height="h-64"
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="text-green-500" size={20} />
            <h3 className="text-lg font-semibold text-white">Top 5 Produtos Mais Lucrativos</h3>
          </div>
          {mostProfitable.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados ainda</div>
          ) : (
            <BarChart
              data={mostProfitable.map(p => ({
                label: `${p.model.split(' ')[0]} ${p.color.substring(0, 3)}`,
                value: Math.round(p.total_profit),
                color: 'bg-green-500',
              }))}
              height="h-64"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="text-blue-500" size={20} />
            <h3 className="text-lg font-semibold text-white">Top 5 Cidades</h3>
          </div>
          {topCities.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados ainda</div>
          ) : (
            <BarChart
              data={topCities.map(c => ({
                label: c.city.split(' ')[0].substring(0, 8),
                value: c.purchases,
                color: 'bg-blue-500',
              }))}
              height="h-64"
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-6">
            <Bike className="text-orange-500" size={20} />
            <h3 className="text-lg font-semibold text-white">Top 5 Motoboys</h3>
          </div>
          {topMotoboys.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados ainda</div>
          ) : (
            <BarChart
              data={topMotoboys.map(m => ({
                label: m.name.split(' ')[0].substring(0, 8),
                value: m.total_deliveries,
                color: 'bg-orange-500',
              }))}
              height="h-64"
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    orange: 'text-orange-500 bg-orange-500/10',
    green: 'text-green-500 bg-green-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
