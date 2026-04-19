import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTodayInBrazil } from '../lib/dateUtils';
import {
  TrendingUp, DollarSign, CreditCard, Package, ShoppingCart,
  Truck, BarChart3, Zap, Calendar, Bike, MapPin, Watch,
} from 'lucide-react';

type Period = 'today' | 'week' | 'month' | 'custom';

interface Summary {
  totalBruto: number;
  totalLiquido: number;
  totalCardFee: number;
  totalProductCost: number;
  totalDeliveryCost: number;
  totalAdSpend: number;
  lucroFinal: number;
  totalSales: number;
  averageTicket: number;
}

interface RowData { label: string; count: number; total: number; }
interface MotoboyRow { name: string; deliveries: number; earned: number; }
interface SmartWatchRow { product_id: string; model: string; color: string; quantity: number; }

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  week: 'Últimos 7 dias',
  month: 'Mês atual',
  custom: 'Período personalizado',
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  debit_card: 'Débito',
  credit_card: 'Crédito',
};

const CHANNEL_LABELS: Record<string, string> = {
  motoboy: 'Motoboy',
  correios: 'Correios',
  loja_fisica: 'Loja Física',
};

const EMPTY_SUMMARY: Summary = {
  totalBruto: 0, totalLiquido: 0, totalCardFee: 0,
  totalProductCost: 0, totalDeliveryCost: 0, totalAdSpend: 0,
  lucroFinal: 0, totalSales: 0, averageTicket: 0,
};

export default function ResumoVendas() {
  const [period, setPeriod] = useState<Period>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [payments, setPayments] = useState<RowData[]>([]);
  const [channels, setChannels] = useState<RowData[]>([]);
  const [motoboys, setMotoboys] = useState<MotoboyRow[]>([]);
  const [cities, setCities] = useState<RowData[]>([]);
  const [smartwatches, setSmartwatches] = useState<SmartWatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (period !== 'custom') loadData();
  }, [period]);

  const getDateRange = (): { start: string; end: string } => {
    const today = getTodayInBrazil();
    const now = new Date(today + 'T00:00:00');
    if (period === 'today') return { start: today, end: today };
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { start: d.toISOString().split('T')[0], end: today };
    }
    if (period === 'month') {
      const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { start: first, end: today };
    }
    return { start: customStart, end: customEnd };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [{ data: salesRaw }, { data: adSpend }, { data: motoboysList }, { data: products }] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_sale_price, net_received, card_fee, total_cost, delivery_fee, delivery_cost, payment_method, delivery_type, motoboy_id, city')
          .neq('status', 'cancelado')
          .gte('sale_date', `${start}T00:00:00`)
          .lte('sale_date', `${end}T23:59:59`),
        supabase.from('ad_spend').select('amount').gte('date', start).lte('date', end),
        supabase.from('motoboys').select('id, name'),
        supabase.from('products').select('id, model, color, category').eq('category', 'smartwatch'),
      ]);

      const s = salesRaw || [];

      // ── Métricas financeiras ────────────────────────────────────────────
      const totalBruto        = s.reduce((sum, v) => sum + Number(v.total_sale_price), 0);
      const totalLiquido      = s.reduce((sum, v) => sum + Number(v.net_received), 0);
      const totalCardFee      = s.reduce((sum, v) => sum + Number(v.card_fee || 0), 0);
      const totalDeliveryCost = s.reduce((sum, v) => sum + Number(v.delivery_fee || 0) + Number(v.delivery_cost || 0), 0);
      const totalProductCost  = s.reduce((sum, v) => sum + Number(v.total_cost || 0) - Number(v.delivery_fee || 0) - Number(v.delivery_cost || 0), 0);
      const totalAdSpend      = (adSpend || []).reduce((sum, a) => sum + Number(a.amount), 0);
      const lucroFinal        = totalLiquido - totalProductCost - totalDeliveryCost - totalAdSpend;
      const averageTicket     = s.length > 0 ? totalBruto / s.length : 0;
      setSummary({ totalBruto, totalLiquido, totalCardFee, totalProductCost, totalDeliveryCost, totalAdSpend, lucroFinal, totalSales: s.length, averageTicket });

      // ── Formas de pagamento ────────────────────────────────────────────
      const paymentMap = new Map<string, { count: number; total: number }>();
      s.forEach(v => {
        const key = v.payment_method || 'other';
        const cur = paymentMap.get(key) || { count: 0, total: 0 };
        paymentMap.set(key, { count: cur.count + 1, total: cur.total + Number(v.total_sale_price) });
      });
      setPayments(
        Array.from(paymentMap.entries())
          .map(([key, val]) => ({ label: PAYMENT_LABELS[key] || key, ...val }))
          .sort((a, b) => b.count - a.count)
      );

      // ── Canais de venda ───────────────────────────────────────────────
      const channelMap = new Map<string, { count: number; total: number }>();
      s.forEach(v => {
        const key = v.delivery_type || 'other';
        const cur = channelMap.get(key) || { count: 0, total: 0 };
        channelMap.set(key, { count: cur.count + 1, total: cur.total + Number(v.total_sale_price) });
      });
      setChannels(
        Array.from(channelMap.entries())
          .map(([key, val]) => ({ label: CHANNEL_LABELS[key] || key, ...val }))
          .sort((a, b) => b.count - a.count)
      );

      // ── Ranking de motoboys ───────────────────────────────────────────
      const motoboyMap = new Map<string, { deliveries: number; earned: number }>();
      s.filter(v => v.delivery_type === 'motoboy' && v.motoboy_id).forEach(v => {
        const cur = motoboyMap.get(v.motoboy_id) || { deliveries: 0, earned: 0 };
        motoboyMap.set(v.motoboy_id, { deliveries: cur.deliveries + 1, earned: cur.earned + Number(v.delivery_fee || 0) });
      });
      const motoboyRows: MotoboyRow[] = Array.from(motoboyMap.entries())
        .map(([id, val]) => {
          const mb = (motoboysList || []).find(m => m.id === id);
          return { name: mb?.name || 'Desconhecido', ...val };
        })
        .sort((a, b) => b.deliveries - a.deliveries);
      setMotoboys(motoboyRows);

      // ── Top cidades ───────────────────────────────────────────────────
      const cityMap = new Map<string, { count: number; total: number }>();
      s.forEach(v => {
        const key = v.city || 'Não informado';
        const cur = cityMap.get(key) || { count: 0, total: 0 };
        cityMap.set(key, { count: cur.count + 1, total: cur.total + Number(v.total_sale_price) });
      });
      setCities(
        Array.from(cityMap.entries())
          .map(([key, val]) => ({ label: key, ...val }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
      );

      // ── Top smartwatches ─────────────────────────────────────────────
      const saleIds = s.map(v => v.id);
      if (saleIds.length > 0 && (products || []).length > 0) {
        const { data: saleItems } = await supabase
          .from('sale_items')
          .select('product_id, quantity')
          .in('sale_id', saleIds);

        const swMap = new Map<string, SmartWatchRow>();
        (saleItems || []).forEach(item => {
          const p = (products || []).find(x => x.id === item.product_id);
          if (!p) return;
          const cur = swMap.get(item.product_id) || { product_id: p.id, model: p.model, color: p.color, quantity: 0 };
          cur.quantity += item.quantity;
          swMap.set(item.product_id, cur);
        });
        setSmartwatches([...swMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8));
      } else {
        setSmartwatches([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Resumo de Vendas</h1>
        <p className="text-sm text-gray-400 mt-1">Métricas financeiras por período — vendas canceladas excluídas</p>
      </div>

      {/* Filtros */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-700">
            <Calendar size={16} className="text-gray-400" />
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
            <span className="text-gray-500 text-sm">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
            <button onClick={loadData} disabled={!customStart || !customEnd}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Buscar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-t-transparent border-orange-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
            {summary.totalSales} {summary.totalSales === 1 ? 'venda' : 'vendas'} no período
          </p>

          {/* Cards linha 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <FinCard label="Faturamento Bruto"      value={fmt(summary.totalBruto)}       icon={TrendingUp} accent="orange" sub={`${summary.totalSales} vendas`} />
            <FinCard label="Valor Líquido Recebido" value={fmt(summary.totalLiquido)}     icon={DollarSign} accent="green"  sub="Após taxas de cartão" />
            <FinCard label="Taxas de Cartão"        value={fmt(summary.totalCardFee)}     icon={CreditCard} accent="red"   negative />
            <FinCard label="Custo dos Produtos"     value={fmt(summary.totalProductCost)} icon={Package}    accent="red"   negative sub="Produtos + acessórios" />
          </div>

          {/* Cards linha 2 — contagem e ticket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <FinCard label="Total de Vendas"  value={String(summary.totalSales)}   icon={ShoppingCart} accent="blue" sub="Vendas no período" />
            <FinCard label="Ticket Médio"     value={fmt(summary.averageTicket)}   icon={TrendingUp}   accent="orange" sub="Faturamento ÷ vendas" />
          </div>

          {/* Cards linha 3 — custos e lucro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <FinCard label="Custo de Entregas"   value={fmt(summary.totalDeliveryCost)} icon={Truck}     accent="red" negative sub="Motoboy + Correios" />
            <FinCard label="Investimento em Ads" value={fmt(summary.totalAdSpend)}      icon={BarChart3} accent="red" negative />
            <div className={`rounded-xl p-5 border-2 ${summary.lucroFinal >= 0 ? 'border-green-500 bg-green-500/5' : 'border-red-500 bg-red-500/5'}`}>
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className={summary.lucroFinal >= 0 ? 'text-green-400' : 'text-red-400'} />
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Lucro Final</p>
              </div>
              <p className={`text-3xl font-bold ${summary.lucroFinal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmt(summary.lucroFinal)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Líquido − produtos − entregas − ads</p>
            </div>
          </div>

          {/* Detalhamento P&L */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Detalhamento</h2>
            <div className="space-y-2.5">
              <PLRow label="Faturamento bruto"                 value={fmt(summary.totalBruto)}             color="text-white" />
              <PLRow label="− Taxas de cartão"                 value={`− ${fmt(summary.totalCardFee)}`}    color="text-red-400" />
              <div className="border-t border-gray-700 pt-2.5">
                <PLRow label="= Valor líquido recebido"        value={fmt(summary.totalLiquido)}           color="text-blue-400" bold />
              </div>
              <PLRow label="− Custo dos produtos / acessórios" value={`− ${fmt(summary.totalProductCost)}`} color="text-red-400" />
              <PLRow label="− Custo de entregas"               value={`− ${fmt(summary.totalDeliveryCost)}`} color="text-red-400" />
              <PLRow label="− Investimento em ads"             value={`− ${fmt(summary.totalAdSpend)}`}    color="text-red-400" />
              <div className="border-t border-gray-700 pt-2.5">
                <PLRow label="= Lucro final" value={fmt(summary.lucroFinal)}
                  color={summary.lucroFinal >= 0 ? 'text-green-400' : 'text-red-400'} bold />
              </div>
            </div>
          </div>

          {/* Seções analíticas — grid 2 colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Formas de pagamento */}
            <Section title="Formas de Pagamento" icon={CreditCard}>
              {payments.length === 0 ? <Empty /> : (
                <div className="space-y-4">
                  {payments.map(row => {
                    const pct = summary.totalSales > 0 ? (row.count / summary.totalSales) * 100 : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium">{row.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{row.count} vendas</span>
                            <span className="text-sm font-semibold text-orange-400">{fmt(row.total)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% das vendas</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Canais de venda */}
            <Section title="Canais de Venda" icon={Truck}>
              {channels.length === 0 ? <Empty /> : (
                <div className="space-y-4">
                  {channels.map(row => {
                    const pct = summary.totalSales > 0 ? (row.count / summary.totalSales) * 100 : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium">{row.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{row.count} vendas</span>
                            <span className="text-sm font-semibold text-orange-400">{fmt(row.total)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% das vendas</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Ranking de motoboys */}
            <Section title="Ranking de Motoboys" icon={Bike}>
              {motoboys.length === 0 ? <Empty text="Nenhuma entrega no período" /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b border-gray-700">
                      <th className="text-left pb-2">Motoboy</th>
                      <th className="text-center pb-2">Entregas</th>
                      <th className="text-right pb-2">Ganhou</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {motoboys.map((row, i) => (
                      <tr key={row.name}>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                              #{i + 1}
                            </span>
                            <span className="text-white font-medium">{row.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-center text-gray-300">{row.deliveries}</td>
                        <td className="py-2.5 text-right text-orange-400 font-semibold">{fmt(row.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Top cidades */}
            <Section title="Top Cidades" icon={MapPin}>
              {cities.length === 0 ? <Empty /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b border-gray-700">
                      <th className="text-left pb-2">Cidade</th>
                      <th className="text-center pb-2">Vendas</th>
                      <th className="text-right pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {cities.map((row, i) => (
                      <tr key={row.label}>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                              #{i + 1}
                            </span>
                            <span className="text-white font-medium">{row.label}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-center text-gray-300">{row.count}</td>
                        <td className="py-2.5 text-right text-orange-400 font-semibold">{fmt(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>

          {/* Top smartwatches — largura total */}
          <Section title="Top Smartwatches Mais Vendidos" icon={Watch}>
            {smartwatches.length === 0 ? <Empty text="Nenhum smartwatch vendido no período" /> : (
              <div className="space-y-3">
                {smartwatches.map((sw, i) => {
                  const pct = (sw.quantity / smartwatches[0].quantity) * 100;
                  return (
                    <div key={sw.product_id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                            #{i + 1}
                          </span>
                          <span className="text-sm text-white">{sw.model} {sw.color}</span>
                        </div>
                        <span className="text-sm font-semibold text-orange-400">{sw.quantity} un.</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-700 ml-7">
                        <div className="h-1.5 rounded-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-orange-500" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Empty({ text = 'Sem dados no período' }: { text?: string }) {
  return <p className="text-sm text-gray-500 text-center py-4">{text}</p>;
}

function FinCard({ label, value, icon: Icon, accent, negative, sub }: {
  label: string; value: string; icon: React.ElementType;
  accent: 'orange' | 'green' | 'red' | 'blue'; negative?: boolean; sub?: string;
}) {
  const c = {
    orange: { text: 'text-orange-400', border: 'border-l-orange-500' },
    green:  { text: 'text-green-400',  border: 'border-l-green-500'  },
    red:    { text: 'text-red-400',    border: 'border-l-red-500'    },
    blue:   { text: 'text-blue-400',   border: 'border-l-blue-500'   },
  }[accent];
  return (
    <div className={`bg-gray-800 rounded-xl p-5 border border-gray-700 border-l-4 ${c.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={c.text} />
        <p className="text-xs text-gray-400 font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold ${c.text}`}>
        {negative && <span className="text-sm font-normal mr-0.5">−</span>}
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function PLRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${bold ? 'text-white' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}
