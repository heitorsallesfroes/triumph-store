import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calculateCardFee, getFeePercentageLabel } from '../lib/cardFees';
import { getYesterdayInBrazil } from '../lib/dateUtils';
import { ShoppingBag, Plus, Trash2 } from 'lucide-react';

interface SmallSale {
  id: string;
  description: string;
  quantity: number;
  sale_price: number;
  cost: number;
  payment_method: string;
  card_brand: string | null;
  installments: number | null;
  created_at: string;
}

type FilterPeriod = 'today' | 'yesterday' | 'week' | 'month';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  debit_card: 'Débito',
  credit_card: 'Crédito',
};

const emptyForm = {
  description: '',
  quantity: '1',
  sale_price: '',
  cost: '',
  payment_method: 'pix',
  card_brand: 'visa_mastercard',
  installments: '1',
};

export default function SmallSales() {
  const [sales, setSales] = useState<SmallSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterPeriod>('today');
  const [form, setForm] = useState(emptyForm);

  const isCredit = form.payment_method === 'credit_card';

  const saleAmount = parseFloat(form.sale_price) * (parseInt(form.quantity) || 1);
  const cardFeePreview = isCredit && saleAmount > 0
    ? calculateCardFee(saleAmount, 'credit_card', form.card_brand, parseInt(form.installments))
    : 0;
  const netPreview = saleAmount - cardFeePreview;

  useEffect(() => {
    loadSales();
  }, [filter]);

  const getDateRange = () => {
    const now = new Date();
    const endOfNow = now.toISOString();
    if (filter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { start, end: endOfNow };
    }
    if (filter === 'yesterday') {
      const y = getYesterdayInBrazil();
      const start = new Date(y + 'T00:00:00').toISOString();
      const end = new Date(y + 'T23:59:59').toISOString();
      return { start, end };
    }
    if (filter === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
      return { start, end: endOfNow };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return { start, end: endOfNow };
  };

  const loadSales = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const { data, error } = await supabase
        .from('small_sales')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      console.error('Erro ao carregar pequenas vendas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.sale_price || !form.cost) {
      alert('Preencha descrição, valor de venda e custo.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        description: form.description.trim(),
        quantity: parseInt(form.quantity) || 1,
        sale_price: parseFloat(form.sale_price),
        cost: parseFloat(form.cost),
        payment_method: form.payment_method,
        card_brand: null,
        installments: null,
      };

      if (isCredit) {
        payload.card_brand = form.card_brand;
        payload.installments = parseInt(form.installments);
      }

      const { error } = await supabase.from('small_sales').insert(payload);
      if (error) {
        console.error('Supabase insert error:', JSON.stringify(error, null, 2));
        throw error;
      }
      setForm(emptyForm);
      loadSales();
    } catch (err: any) {
      const msg = err?.message || err?.details || JSON.stringify(err);
      alert(`Erro ao registrar venda:\n${msg}`);
      console.error('Erro completo:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta venda?')) return;
    await supabase.from('small_sales').delete().eq('id', id);
    loadSales();
  };

  const totalRevenue = sales.reduce((s, v) => s + v.sale_price * v.quantity, 0);
  const totalCost = sales.reduce((s, v) => s + v.cost * v.quantity, 0);
  const totalCardFees = sales.reduce((s, v) => {
    if (v.payment_method === 'credit_card' && v.card_brand && v.installments) {
      return s + calculateCardFee(v.sale_price * v.quantity, 'credit_card', v.card_brand, v.installments);
    }
    return s;
  }, 0);
  const totalProfit = totalRevenue - totalCost - totalCardFees;

  const filterLabels: Record<FilterPeriod, string> = {
    today: 'Hoje',
    yesterday: 'Ontem',
    week: 'Semana',
    month: 'Mês',
  };

  const getPaymentLabel = (sale: SmallSale) => {
    if (sale.payment_method === 'credit_card' && sale.installments) {
      const brand = sale.card_brand === 'elo_amex' ? 'Elo/Amex' : 'Visa/MC';
      return `Crédito ${sale.installments}x (${brand})`;
    }
    return PAYMENT_LABELS[sale.payment_method] || sale.payment_method;
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <ShoppingBag className="text-orange-400" size={28} />
        <h1 className="text-3xl font-bold text-white">Pequenas Vendas</h1>
      </div>

      {/* Formulário */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Plus size={18} className="text-orange-400" /> Registrar Venda
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Descrição*</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Pulseira de couro"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Qtd*</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Valor de venda*</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
                placeholder="0,00"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Custo*</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                placeholder="0,00"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Pagamento*</label>
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              >
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="debit_card">Débito</option>
                <option value="credit_card">Crédito</option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>

          {/* Campos extras para crédito */}
          {isCredit && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bandeira</label>
                <select
                  value={form.card_brand}
                  onChange={e => setForm(f => ({ ...f, card_brand: e.target.value }))}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                >
                  <option value="visa_mastercard">Visa / Mastercard</option>
                  <option value="elo_amex">Elo / Amex</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Parcelas</label>
                <select
                  value={form.installments}
                  onChange={e => setForm(f => ({ ...f, installments: e.target.value }))}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>
                      {n}x — {getFeePercentageLabel('credit_card', form.card_brand, n)}
                    </option>
                  ))}
                </select>
              </div>
              {saleAmount > 0 && (
                <div className="md:col-span-2 flex items-end gap-6 pb-0.5">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Taxa do cartão</p>
                    <p className="text-red-400 font-semibold">- R$ {cardFeePreview.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Valor líquido recebido</p>
                    <p className="text-green-400 font-bold text-lg">R$ {netPreview.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        {(Object.keys(filterLabels) as FilterPeriod[]).map(p => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === p ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {filterLabels[p]}
          </button>
        ))}
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs mb-1">Vendas</p>
          <p className="text-2xl font-bold text-white">{sales.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-blue-500/40">
          <p className="text-gray-400 text-xs mb-1">Faturamento</p>
          <p className="text-2xl font-bold text-blue-400">R$ {totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-red-500/40">
          <p className="text-gray-400 text-xs mb-1">Custo Total</p>
          <p className="text-2xl font-bold text-red-400">R$ {totalCost.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-yellow-500/40">
          <p className="text-gray-400 text-xs mb-1">Taxas de Cartão</p>
          <p className="text-2xl font-bold text-yellow-400">R$ {totalCardFees.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-green-500/40">
          <p className="text-gray-400 text-xs mb-1">Lucro Total</p>
          <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            R$ {totalProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Listagem */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Descrição</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Custo</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Taxa</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Lucro</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Pagamento</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Data</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">Carregando...</td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhuma venda no período.</td>
              </tr>
            ) : (
              sales.map(sale => {
                const revenue = sale.sale_price * sale.quantity;
                const cost = sale.cost * sale.quantity;
                const fee = sale.payment_method === 'credit_card' && sale.card_brand && sale.installments
                  ? calculateCardFee(revenue, 'credit_card', sale.card_brand, sale.installments)
                  : 0;
                const profit = revenue - cost - fee;
                return (
                  <tr key={sale.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-white font-medium">{sale.description}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{sale.quantity}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-medium">
                      R$ {revenue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-400">
                      R$ {cost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-yellow-400 text-sm">
                      {fee > 0 ? `- R$ ${fee.toFixed(2)}` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      R$ {profit.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full whitespace-nowrap">
                        {getPaymentLabel(sale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-sm">
                      {new Date(sale.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-500 hover:text-red-400 transition-colors"
                        title="Excluir venda"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
