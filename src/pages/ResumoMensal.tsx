import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calculateCardFee } from '../lib/cardFees';
import {
  TrendingUp, DollarSign, ShoppingCart, Package, Truck,
  Bike, BarChart3, MapPin, Star, ArrowUp, ArrowDown, Minus, ShoppingBag
} from 'lucide-react';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const getCurrentMonth = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = -5; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return options.reverse();
};

interface SaleData {
  id: string;
  sale_date: string;
  total_sale_price: number;
  net_received: number;
  total_cost: number;
  delivery_fee: number;
  delivery_cost: number;
  delivery_type: string;
  status: string;
  city: string;
  payment_method: string;
}

interface SaleItem {
  sale_id: string;
  product_id: string;
  quantity: number;
  products: { model: string; color: string; category: string } | null;
}

export default function ResumoMensal() {
  const [selected, setSelected] = useState(getCurrentMonth());
  const [sales, setSales] = useState<SaleData[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [operationalCosts, setOperationalCosts] = useState(0);
  const [motoboyExtras, setMotoboyExtras] = useState(0);
  const [smallSales, setSmallSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [selected]);

  const monthStr = `${selected.year}-${String(selected.month).padStart(2, '0')}`;
  const startDate = `${monthStr}-01`;
  const endDate = new Date(selected.year, selected.month, 0).toISOString().split('T')[0];

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesRes, itemsRes, adRes, costsRes, paymentsRes, motoboyExtrasRes] = await Promise.all([
        supabase.from('sales').select('id,sale_date,total_sale_price,net_received,total_cost,delivery_fee,delivery_cost,delivery_type,status,city,payment_method')
          .eq('status', 'finalizado')
          .gte('sale_date', startDate)
          .lte('sale_date', endDate + 'T23:59:59'),
        supabase.from('sale_items').select('sale_id,product_id,quantity,products(model,color)')
          .in('sale_id', []),
        supabase.from('ad_spend').select('amount').gte('date', startDate).lte('date', endDate),
        supabase.from('operational_cost_payments').select('amount_paid').eq('month', monthStr).eq('paid', true),
        supabase.from('operational_cost_payments').select('amount_paid').eq('month', monthStr).eq('paid', true),
        supabase.from('motoboy_payments').select('amount').gte('date', startDate).lte('date', endDate),
      ]);

      const salesData = salesRes.data || [];
      setSales(salesData);

      // Buscar itens das vendas finalizadas
      if (salesData.length > 0) {
        const saleIds = salesData.map(s => s.id);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id,product_id,quantity,products(model,color,category)')
          .in('sale_id', saleIds);
        setSaleItems((itemsData || []) as SaleItem[]);
      } else {
        setSaleItems([]);
      }

      setAdSpend((adRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0));
      setOperationalCosts((costsRes.data || []).reduce((sum, r) => sum + Number(r.amount_paid), 0));
      setMotoboyExtras((motoboyExtrasRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0));

      const { data: ssData } = await supabase
        .from('small_sales')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');
      setSmallSales(ssData || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // Métricas financeiras
  const totalBruto = sales.reduce((s, v) => s + Number(v.total_sale_price), 0);
  const totalLiquido = sales.reduce((s, v) => s + Number(v.net_received), 0);
  const totalCustoProdutos = sales.reduce((s, v) => s + Number(v.total_cost), 0);
  const totalEntregas = sales.reduce((s, v) => s + Number(v.delivery_cost || 0), 0);
  const totalMotoboyExtras = motoboyExtras;
  const totalCustoEntregas = totalEntregas + totalMotoboyExtras;
  const totalCustos = totalCustoProdutos + adSpend + operationalCosts + totalCustoEntregas;

  // Pequenas vendas
  const smallSalesRevenue = smallSales.reduce((s, v) => s + Number(v.sale_price) * Number(v.quantity), 0);
  const smallSalesCost = smallSales.reduce((s, v) => s + Number(v.cost) * Number(v.quantity), 0);
  const smallSalesCardFees = smallSales.reduce((s, v) => {
    if (v.payment_method === 'credit_card' && v.card_brand && v.installments) {
      return s + calculateCardFee(Number(v.sale_price) * Number(v.quantity), 'credit_card', v.card_brand, v.installments);
    }
    return s;
  }, 0);
  const smallSalesNet = smallSalesRevenue - smallSalesCardFees;
  const smallSalesProfit = smallSalesNet - smallSalesCost;

  const lucroReal = totalLiquido - totalCustos + smallSalesProfit;
  const totalReceita = totalLiquido + smallSalesNet;
  const margemLucro = totalReceita > 0 ? (lucroReal / totalReceita) * 100 : 0;

  // Canais de venda
  const canais = [
    { label: 'Motoboy', key: 'motoboy', icon: Bike, color: 'text-orange-400' },
    { label: 'Correios', key: 'correios', icon: Truck, color: 'text-blue-400' },
    { label: 'Loja Física', key: 'pickup', icon: ShoppingCart, color: 'text-green-400' },
  ].map(c => ({
    ...c,
    count: sales.filter(s => s.delivery_type === c.key).length,
    value: sales.filter(s => s.delivery_type === c.key).reduce((sum, s) => sum + Number(s.total_sale_price), 0),
  }));

  // Cidades
  const cidadesMap = new Map<string, { count: number; value: number }>();
  sales.forEach(s => {
    const city = s.city || 'Não informado';
    const cur = cidadesMap.get(city) || { count: 0, value: 0 };
    cidadesMap.set(city, { count: cur.count + 1, value: cur.value + Number(s.total_sale_price) });
  });
  const cidades = Array.from(cidadesMap.entries())
    .map(([city, data]) => ({ city, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Produtos mais vendidos (apenas smartwatches)
  const modelMap = new Map<string, number>();
  const colorMap = new Map<string, number>();
  saleItems.forEach(item => {
    if (item.products && item.products.category === 'smartwatch') {
      const model = item.products.model;
      const color = item.products.color;
      modelMap.set(model, (modelMap.get(model) || 0) + item.quantity);
      colorMap.set(color, (colorMap.get(color) || 0) + item.quantity);
    }
  });
  const topModels = Array.from(modelMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Métodos de pagamento
  const paymentMap = new Map<string, number>();
  sales.forEach(s => {
    const pm = s.payment_method || 'Não informado';
    paymentMap.set(pm, (paymentMap.get(pm) || 0) + 1);
  });
  const paymentMethods = Array.from(paymentMap.entries()).sort((a, b) => b[1] - a[1]);

  if (loading) return <div className="p-8 text-white flex items-center gap-2"><BarChart3 className="animate-pulse" /> Carregando...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 size={32} className="text-orange-500" />
            Resumo Mensal
          </h1>
          <p className="text-gray-400 text-sm mt-1">Panorama completo da empresa</p>
        </div>
      </div>

      {/* Seletor de mês */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-gray-400 text-sm">Mês:</span>
          {getMonthOptions().map(opt => {
            const isActive = opt.year === selected.year && opt.month === selected.month;
            return (
              <button key={`${opt.year}-${opt.month}`} onClick={() => setSelected(opt)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {MONTHS[opt.month - 1]} {opt.year}
              </button>
            );
          })}
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-16 text-center">
          <BarChart3 size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Nenhuma venda finalizada em {MONTHS[selected.month - 1]} {selected.year}</p>
        </div>
      ) : (
        <>
          {/* SEÇÃO 1 — P&L */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign size={20} className="text-orange-500" /> Resultado Financeiro
              </h2>
            </div>
            <div className="p-6">
              {/* Receitas */}
              <div className="mb-6">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Receitas</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard label="Faturamento Bruto" value={totalBruto} color="green" icon={TrendingUp} />
                  <MetricCard label="Valor Líquido Recebido" value={totalLiquido} color="green" icon={DollarSign}
                    subtitle={`Desconto taxas: R$ ${(totalBruto - totalLiquido).toFixed(2)}`} />
                  <MetricCard label="Pequenas Vendas" value={smallSalesRevenue} color="green" icon={ShoppingBag}
                    subtitle={`Líquido: R$ ${smallSalesNet.toFixed(2)} | Taxas: R$ ${smallSalesCardFees.toFixed(2)}`} />
                  <MetricCard label="Total de Vendas" value={sales.length} color="blue" icon={ShoppingCart} isCount
                    subtitle={`${saleItems.filter(i => (i.products as any)?.category === 'smartwatch').reduce((s, i) => s + i.quantity, 0)} smartwatches`} />
                </div>
              </div>

              {/* Custos */}
              <div className="mb-6">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Custos</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <MetricCard label="Custo dos Produtos" value={totalCustoProdutos} color="red" icon={Package} negative />
                  <MetricCard label="Custo Peq. Vendas" value={smallSalesCost} color="red" icon={ShoppingBag} negative
                    subtitle={smallSalesCardFees > 0 ? `+ Taxas: R$ ${smallSalesCardFees.toFixed(2)}` : undefined} />
                  <MetricCard label="Investimento em Ads" value={adSpend} color="red" icon={TrendingUp} negative />
                  <MetricCard label="Custos Operacionais" value={operationalCosts} color="red" icon={BarChart3} negative />
                  <MetricCard label="Custo de Entregas" value={totalCustoEntregas} color="red" icon={Truck} negative
                    subtitle={`Sedex/Motoboy: R$ ${totalEntregas.toFixed(2)} | Avulsos: R$ ${totalMotoboyExtras.toFixed(2)}`} />
                </div>
              </div>

              {/* Resultado */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Lucro Real do Mês</p>
                    <p className={`text-4xl font-bold ${lucroReal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      R$ {lucroReal.toFixed(2)}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Margem: <span className={lucroReal >= 0 ? 'text-green-400' : 'text-red-400'}>{margemLucro.toFixed(1)}%</span>
                    </p>
                  </div>
                  <div className="text-right space-y-1 text-sm">
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Líquido recebido</span>
                      <span className="text-green-400 font-medium">+ R$ {totalLiquido.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Peq. vendas (líquido)</span>
                      <span className="text-green-400 font-medium">+ R$ {smallSalesNet.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Custo produtos</span>
                      <span className="text-red-400 font-medium">- R$ {totalCustoProdutos.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Custo peq. vendas</span>
                      <span className="text-red-400 font-medium">- R$ {smallSalesCost.toFixed(2)}</span>
                    </div>
                    {smallSalesCardFees > 0 && (
                      <div className="flex justify-between gap-8">
                        <span className="text-gray-400">Taxas peq. vendas</span>
                        <span className="text-red-400 font-medium">- R$ {smallSalesCardFees.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Ads</span>
                      <span className="text-red-400 font-medium">- R$ {adSpend.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Operacional</span>
                      <span className="text-red-400 font-medium">- R$ {operationalCosts.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-400">Entregas</span>
                      <span className="text-red-400 font-medium">- R$ {totalCustoEntregas.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-gray-700 pt-1 flex justify-between gap-8">
                      <span className="text-white font-semibold">Total custos</span>
                      <span className="text-red-400 font-bold">- R$ {(totalCustos + smallSalesCost + smallSalesCardFees).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2 — Canais e Cidades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Canais de Venda */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Truck size={18} className="text-orange-500" /> Canais de Venda
                </h2>
              </div>
              <div className="p-6 space-y-4">
                {canais.map(canal => {
                  const pct = sales.length > 0 ? (canal.count / sales.length) * 100 : 0;
                  const Icon = canal.icon;
                  return (
                    <div key={canal.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={canal.color} />
                          <span className="text-white text-sm font-medium">{canal.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white text-sm font-bold">{canal.count} vendas</span>
                          <span className="text-gray-400 text-xs ml-2">R$ {canal.value.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-gray-500 text-xs mt-1">{pct.toFixed(1)}% das vendas</p>
                    </div>
                  );
                })}

                {/* Métodos de pagamento */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Formas de Pagamento</p>
                  <div className="space-y-2">
                    {paymentMethods.map(([method, count]) => (
                      <div key={method} className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">{method}</span>
                        <span className="text-white text-sm font-semibold">{count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cidades */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MapPin size={18} className="text-orange-500" /> Top Cidades
                </h2>
              </div>
              <div className="p-6 space-y-3">
                {cidades.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhuma cidade registrada</p>
                ) : cidades.map((c, i) => {
                  const pct = sales.length > 0 ? (c.count / sales.length) * 100 : 0;
                  return (
                    <div key={c.city}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                            #{i + 1}
                          </span>
                          <span className="text-white text-sm">{c.city}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white text-sm font-bold">{c.count}x</span>
                          <span className="text-gray-400 text-xs ml-2">R$ {c.value.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SEÇÃO 3 — Produtos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Modelos mais vendidos */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Star size={18} className="text-orange-500" /> Modelos Mais Vendidos
                </h2>
              </div>
              <div className="p-6 space-y-3">
                {topModels.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhum dado de produto disponível</p>
                ) : topModels.map(([model, qty], i) => {
                  const total = topModels.reduce((s, [, q]) => s + q, 0);
                  const pct = total > 0 ? (qty / total) * 100 : 0;
                  return (
                    <div key={model}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                            #{i + 1}
                          </span>
                          <span className="text-white text-sm">{model}</span>
                        </div>
                        <span className="text-orange-400 text-sm font-bold">{qty} un.</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cores mais vendidas */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package size={18} className="text-orange-500" /> Cores Mais Vendidas
                </h2>
              </div>
              <div className="p-6 space-y-3">
                {topColors.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhum dado de produto disponível</p>
                ) : topColors.map(([color, qty], i) => {
                  const total = topColors.reduce((s, [, q]) => s + q, 0);
                  const pct = total > 0 ? (qty / total) * 100 : 0;
                  return (
                    <div key={color}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                            #{i + 1}
                          </span>
                          <span className="text-white text-sm">{color}</span>
                        </div>
                        <span className="text-blue-400 text-sm font-bold">{qty} un.</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, icon: Icon, negative, subtitle, isCount }: {
  label: string; value: number; color: string; icon: React.ElementType;
  negative?: boolean; subtitle?: string; isCount?: boolean;
}) {
  const colors: Record<string, string> = {
    green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400'
  };
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={colors[color]} />
        <p className="text-gray-400 text-xs">{label}</p>
      </div>
      <p className={`text-xl font-bold ${colors[color]}`}>
        {negative && '- '}
        {isCount ? value : `R$ ${value.toFixed(2)}`}
      </p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}