import { useEffect, useState } from 'react';
import { supabase, MotoboyStats } from '../lib/supabase';
import { TrendingUp, DollarSign, MapPin, CreditCard, Bike, Download, Calendar, Trophy } from 'lucide-react';

interface ProductSales {
  product_id: string;
  model: string;
  color: string;
  total_quantity: number;
  total_revenue: number;
  total_profit: number;
}

interface CityData {
  city: string;
  purchases: number;
  total_revenue: number;
}

interface PaymentMethodData {
  method: string;
  count: number;
  total: number;
}

export default function Reports() {
  const [bestSelling, setBestSelling] = useState<ProductSales[]>([]);
  const [mostProfitable, setMostProfitable] = useState<ProductSales[]>([]);
  const [cities, setCities] = useState<CityData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [motoboyRanking, setMotoboyRanking] = useState<MotoboyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadReports();
  }, [deliveryTypeFilter]);

  const loadReports = async () => {
    try {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity, unit_price, sale_id');

      const { data: products } = await supabase
        .from('products')
        .select('id, model, color, cost');

      let salesQuery = supabase
        .from('sales')
        .select('id, city, payment_method, total_sale_price, motoboy_id, delivery_fee, profit, delivery_type');

      if (deliveryTypeFilter !== 'all') {
        salesQuery = salesQuery.eq('delivery_type', deliveryTypeFilter);
      }

      const { data: sales } = await salesQuery;

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
              total_revenue: 0,
              total_profit: 0,
            };

            current.total_quantity += item.quantity;
            current.total_revenue += item.unit_price * item.quantity;
            current.total_profit += (item.unit_price - product.cost) * item.quantity;

            productMap.set(key, current);
          }
        });

        const productSales = Array.from(productMap.values());
        setBestSelling([...productSales].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 10));
        setMostProfitable([...productSales].sort((a, b) => b.total_profit - a.total_profit).slice(0, 10));
      }

      if (sales) {
        const cityMap = new Map<string, CityData>();
        sales.forEach(sale => {
          const current = cityMap.get(sale.city) || {
            city: sale.city,
            purchases: 0,
            total_revenue: 0,
          };
          current.purchases++;
          current.total_revenue += Number(sale.total_sale_price);
          cityMap.set(sale.city, current);
        });

        setCities(Array.from(cityMap.values()).sort((a, b) => b.purchases - a.purchases));

        const paymentMap = new Map<string, PaymentMethodData>();
        sales.forEach(sale => {
          const current = paymentMap.get(sale.payment_method) || {
            method: sale.payment_method,
            count: 0,
            total: 0,
          };
          current.count++;
          current.total += Number(sale.total_sale_price);
          paymentMap.set(sale.payment_method, current);
        });

        setPaymentMethods(Array.from(paymentMap.values()).sort((a, b) => b.count - a.count));
      }

      const { data: motoboyStats } = await supabase
        .from('motoboy_stats')
        .select('*')
        .gt('total_deliveries', 0)
        .order('total_deliveries', { ascending: false });

      if (motoboyStats) {
        setMotoboyRanking(motoboyStats);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    try {
      const { data: sales } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items (
            *,
            products (*)
          ),
          sale_accessories (
            *,
            accessories (*)
          ),
          motoboys (*),
          suppliers (*)
        `)
        .order('sale_date', { ascending: false });

      const dataStr = JSON.stringify(sales, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `triumph-store-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('Backup exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Erro ao exportar dados');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Relatórios</h1>
        <button
          onClick={exportData}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Download size={20} />
          Exportar Backup
        </button>
      </div>

      {/* Delivery Type Filter */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-8">
        <div className="flex items-center gap-4">
          <label className="text-white font-medium">Tipo de Entrega:</label>
          <select
            value={deliveryTypeFilter}
            onChange={(e) => setDeliveryTypeFilter(e.target.value)}
            className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="loja_fisica">Loja Física</option>
            <option value="motoboy">Motoboy</option>
            <option value="correios">Correios (SEDEX)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="text-orange-500" size={24} />
            <h2 className="text-xl font-bold text-white">Produtos Mais Vendidos</h2>
          </div>

          <div className="space-y-3">
            {bestSelling.length === 0 ? (
              <div className="text-gray-400 text-center py-8">Sem dados de vendas ainda</div>
            ) : (
              bestSelling.map((product, index) => (
                <div
                  key={product.product_id}
                  className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {product.model} - {product.color}
                      </div>
                      <div className="text-gray-400 text-sm">
                        R$ {product.total_revenue.toFixed(2)} de receita
                      </div>
                    </div>
                  </div>
                  <div className="text-orange-500 font-bold text-lg">
                    {product.total_quantity} vendidos
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="text-green-500" size={24} />
            <h2 className="text-xl font-bold text-white">Produtos Mais Lucrativos</h2>
          </div>

          <div className="space-y-3">
            {mostProfitable.length === 0 ? (
              <div className="text-gray-400 text-center py-8">Sem dados de vendas ainda</div>
            ) : (
              mostProfitable.map((product, index) => (
                <div
                  key={product.product_id}
                  className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {product.model} - {product.color}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {product.total_quantity} vendidos
                      </div>
                    </div>
                  </div>
                  <div className="text-green-500 font-bold text-lg">
                    R$ {product.total_profit.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <MapPin className="text-blue-500" size={24} />
            <h2 className="text-xl font-bold text-white">Cidades com Mais Compras</h2>
          </div>

          <div className="space-y-3">
            {cities.length === 0 ? (
              <div className="text-gray-400 text-center py-8">Sem dados de vendas ainda</div>
            ) : (
              cities.map((city, index) => (
                <div
                  key={city.city}
                  className="flex items-center justify-between bg-gray-900 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-white font-medium">{city.city}</div>
                      <div className="text-gray-400 text-sm">
                        R$ {city.total_revenue.toFixed(2)} de receita
                      </div>
                    </div>
                  </div>
                  <div className="text-blue-500 font-bold text-lg">
                    {city.purchases} pedidos
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <CreditCard className="text-purple-500" size={24} />
            <h2 className="text-xl font-bold text-white">Formas de Pagamento</h2>
          </div>

          <div className="space-y-3">
            {paymentMethods.length === 0 ? (
              <div className="text-gray-400 text-center py-8">Sem dados de vendas ainda</div>
            ) : (
              paymentMethods.map((method) => {
                const total = paymentMethods.reduce((sum, m) => sum + m.count, 0);
                const percentage = (method.count / total) * 100;

                return (
                  <div key={method.method} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-white font-medium capitalize">
                        {method.method.replace('_', ' ')}
                      </div>
                      <div className="text-gray-400">
                        {method.count} ({percentage.toFixed(0)}%)
                      </div>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-gray-400 text-sm mt-2">
                      Total: R$ {method.total.toFixed(2)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <Trophy className="text-yellow-500" size={28} />
            <h2 className="text-2xl font-bold text-white">Ranking de Motoboys</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {motoboyRanking.length === 0 ? (
              <div className="text-gray-400 text-center py-8 col-span-full">
                Sem dados de entrega ainda
              </div>
            ) : (
              motoboyRanking.map((motoboy, index) => (
                <div
                  key={motoboy.id}
                  className={`bg-gray-900 rounded-lg p-5 border-2 transition-all hover:scale-105 ${
                    index === 0
                      ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                      : index === 1
                      ? 'border-gray-400 shadow-lg shadow-gray-400/20'
                      : index === 2
                      ? 'border-orange-600 shadow-lg shadow-orange-600/20'
                      : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                      index === 0
                        ? 'bg-yellow-500'
                        : index === 1
                        ? 'bg-gray-400'
                        : index === 2
                        ? 'bg-orange-600'
                        : 'bg-gray-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="text-white font-semibold text-lg">{motoboy.name}</div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={14} className="text-gray-400" />
                        <div className="text-gray-400 text-xs">Total Geral</div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-white font-bold text-xl">
                          {motoboy.total_deliveries}
                        </div>
                        <div className="text-green-400 font-semibold text-sm">
                          R$ {motoboy.total_earnings.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={14} className="text-orange-400" />
                        <div className="text-gray-400 text-xs">Este Mês</div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-white font-bold text-xl">
                          {motoboy.deliveries_this_month}
                        </div>
                        <div className="text-orange-400 font-semibold text-sm">
                          R$ {motoboy.earnings_this_month.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
