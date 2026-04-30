import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calculateCardFee, getFeePercentageLabel } from '../lib/cardFees';
import { getYesterdayInBrazil } from '../lib/dateUtils';
import { ShoppingBag, Plus, Trash2, Bike, Truck, ShoppingCart } from 'lucide-react';

interface PaymentEntry {
  method: string;
  card_brand: string;
  installments: number;
  amount: number;
}

interface SmallSale {
  id: string;
  description: string;
  quantity: number;
  sale_price: number;
  cost: number;
  payment_method: string;
  payment_methods?: PaymentEntry[] | null;
  card_brand: string | null;
  installments: number | null;
  delivery_type?: string;
  motoboy_id?: string | null;
  delivery_fee?: number;
  created_at: string;
}

interface MotoboyOption {
  id: string;
  name: string;
}


type FilterPeriod = 'today' | 'yesterday' | 'week' | 'month';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  debit_card: 'Débito',
  credit_card: 'Crédito',
  payment_link: 'Link de Pagamento',
};

const DELIVERY_LABELS: Record<string, string> = {
  loja_fisica: 'Loja Física',
  motoboy: 'Motoboy',
  correios: 'Correios',
};

const emptyForm = {
  description: '',
  quantity: '1',
  sale_price: '',
  cost: '',
  delivery_type: 'loja_fisica',
  motoboy_id: '',
  delivery_fee: '',
};

const defaultPaymentEntry = (): PaymentEntry => ({
  method: 'pix',
  card_brand: 'visa_mastercard',
  installments: 1,
  amount: 0,
});

export default function SmallSales() {
  const [sales, setSales] = useState<SmallSale[]>([]);
  const [motoboys, setMotoboys] = useState<MotoboyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterPeriod>('today');
  const [form, setForm] = useState(emptyForm);
  const [paymentMethods, setPaymentMethods] = useState<PaymentEntry[]>([defaultPaymentEntry()]);

  const saleTotal = (parseFloat(form.sale_price) || 0) * (parseInt(form.quantity) || 1);
  const allAmountsZero = paymentMethods.every(pm => pm.amount === 0);

  const totalCardFeePreview = allAmountsZero
    ? calculateCardFee(saleTotal, paymentMethods[0]?.method || 'pix', paymentMethods[0]?.card_brand || '', paymentMethods[0]?.installments || 0)
    : paymentMethods.reduce((sum, pm) => sum + calculateCardFee(pm.amount, pm.method, pm.card_brand || '', pm.installments || 0), 0);

  const netPreview = saleTotal - totalCardFeePreview;

  useEffect(() => {
    loadSales();
    loadMotoboys();
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
      return { start: new Date(y + 'T00:00:00').toISOString(), end: new Date(y + 'T23:59:59').toISOString() };
    }
    if (filter === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      return { start: new Date(now.getFullYear(), now.getMonth(), diff).toISOString(), end: endOfNow };
    }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: endOfNow };
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

  const loadMotoboys = async () => {
    const { data } = await supabase.from('motoboys').select('id, name').order('name');
    setMotoboys(data || []);
  };

  const updatePaymentEntry = (index: number, field: string, value: string | number) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'method' && value !== 'credit_card' && value !== 'debit_card' && value !== 'payment_link') {
      updated[index].card_brand = '';
      updated[index].installments = 0;
    }
    if (field === 'method' && value !== 'credit_card' && value !== 'payment_link') {
      updated[index].installments = 0;
    }
    setPaymentMethods(updated);
  };

  const getSaleCardFee = (sale: SmallSale): number => {
    const revenue = sale.sale_price * sale.quantity;
    if (sale.payment_methods && Array.isArray(sale.payment_methods) && sale.payment_methods.length > 0) {
      const methods = sale.payment_methods as PaymentEntry[];
      const allZero = methods.every(pm => pm.amount === 0);
      return methods.reduce((sum, pm) => {
        const amt = allZero ? revenue : pm.amount;
        return sum + calculateCardFee(amt, pm.method, pm.card_brand || null, pm.installments || 0);
      }, 0);
    }
    if ((sale.payment_method === 'credit_card' || sale.payment_method === 'payment_link') && sale.card_brand && sale.installments) {
      return calculateCardFee(revenue, sale.payment_method, sale.card_brand, sale.installments);
    }
    return 0;
  };

  const getPaymentLabel = (sale: SmallSale): string => {
    if (sale.payment_methods && Array.isArray(sale.payment_methods) && sale.payment_methods.length > 1) {
      return 'Misto';
    }
    if (sale.payment_method === 'credit_card' && sale.installments) {
      const brand = sale.card_brand === 'elo_amex' ? 'Elo/Amex' : 'Visa/MC';
      return `Crédito ${sale.installments}x (${brand})`;
    }
    if (sale.payment_method === 'payment_link' && sale.installments && sale.installments > 1) {
      return `Link ${sale.installments}x`;
    }
    return PAYMENT_LABELS[sale.payment_method] || sale.payment_method;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.sale_price || !form.cost) {
      alert('Preencha descrição, valor de venda e custo.');
      return;
    }
    if (form.delivery_type === 'motoboy' && !form.motoboy_id) {
      alert('Selecione o motoboy.');
      return;
    }
    setSaving(true);
    try {
      const firstPm = paymentMethods[0];
      const isCard = firstPm.method === 'credit_card' || firstPm.method === 'debit_card' || firstPm.method === 'payment_link';
      const isCredit = firstPm.method === 'credit_card' || firstPm.method === 'payment_link';

      const payload: any = {
        description: form.description.trim(),
        quantity: parseInt(form.quantity) || 1,
        sale_price: parseFloat(form.sale_price),
        cost: parseFloat(form.cost),
        payment_method: firstPm.method,
        card_brand: isCard && firstPm.card_brand ? firstPm.card_brand : null,
        installments: isCredit ? (firstPm.installments || 1) : null,
        payment_methods: paymentMethods.length > 1 ? paymentMethods : null,
        delivery_type: form.delivery_type,
        motoboy_id: form.delivery_type === 'motoboy' ? form.motoboy_id : null,
        delivery_fee: form.delivery_type === 'motoboy' ? (parseFloat(form.delivery_fee) || 0) : 0,
      };

      const { error } = await supabase.from('small_sales').insert(payload);
      if (error) {
        console.error('Supabase insert error:', JSON.stringify(error, null, 2));
        throw error;
      }
      setForm(emptyForm);
      setPaymentMethods([defaultPaymentEntry()]);
      loadSales();
    } catch (err: any) {
      alert(`Erro ao registrar venda:\n${err?.message || err?.details || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta venda?')) return;
    await supabase.from('small_sales').delete().eq('id', id);
    loadSales();
  };

  const totalRevenue    = sales.reduce((s, v) => s + v.sale_price * v.quantity, 0);
  const totalCost       = sales.reduce((s, v) => s + v.cost * v.quantity + (v.delivery_fee || 0), 0);
  const totalCardFees   = sales.reduce((s, v) => s + getSaleCardFee(v), 0);
  const totalProfit     = totalRevenue - totalCost - totalCardFees;

  const filterLabels: Record<FilterPeriod, string> = {
    today: 'Hoje', yesterday: 'Ontem', week: 'Semana', month: 'Mês',
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <ShoppingBag className="text-orange-400" size={28} />
        <h1 className="text-3xl font-bold text-white">Pequenas Vendas</h1>
      </div>

      {/* Formulário */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <Plus size={18} className="text-orange-400" /> Registrar Venda
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Linha 1: Descrição / Qtd / Valor / Custo */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                type="number" min="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Valor de venda*</label>
              <input
                type="number" min="0" step="0.01"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
                placeholder="0,00"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Custo*</label>
              <input
                type="number" min="0" step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                placeholder="0,00"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Pagamentos */}
          <div className="border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Pagamento</p>
              <button
                type="button"
                onClick={() => setPaymentMethods(prev => [...prev, defaultPaymentEntry()])}
                className="text-xs flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
              >
                <Plus size={13} /> Adicionar forma de pagamento
              </button>
            </div>

            {paymentMethods.map((pm, idx) => {
              const isCard   = pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link';
              const isCredit = pm.method === 'credit_card' || pm.method === 'payment_link';
              const pmAmt    = pm.amount > 0 ? pm.amount : (allAmountsZero && paymentMethods.length === 1 ? saleTotal : 0);
              const pmFee    = calculateCardFee(pmAmt, pm.method, pm.card_brand || null, pm.installments || 0);
              return (
                <div key={idx} className="bg-gray-900 rounded-lg p-3 space-y-3">
                  <div className="flex gap-3 items-start flex-wrap">
                    <div className="flex-1 min-w-36">
                      <label className="block text-xs text-gray-400 mb-1">Forma</label>
                      <select
                        value={pm.method}
                        onChange={e => updatePaymentEntry(idx, 'method', e.target.value)}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                      >
                        <option value="pix">PIX</option>
                        <option value="cash">Dinheiro</option>
                        <option value="debit_card">Débito</option>
                        <option value="credit_card">Crédito</option>
                        <option value="payment_link">Link de Pagamento</option>
                      </select>
                    </div>
                    {paymentMethods.length > 1 && (
                      <div className="w-32">
                        <label className="block text-xs text-gray-400 mb-1">Valor (R$)</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={pm.amount || ''}
                          onChange={e => updatePaymentEntry(idx, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder="0,00"
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                        />
                      </div>
                    )}
                    {paymentMethods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethods(prev => prev.filter((_, i) => i !== idx))}
                        className="mt-5 text-red-500 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {isCard && (
                    <div className="flex gap-3 flex-wrap items-end">
                      <div className="flex-1 min-w-32">
                        <label className="block text-xs text-gray-400 mb-1">Bandeira</label>
                        <select
                          value={pm.card_brand}
                          onChange={e => updatePaymentEntry(idx, 'card_brand', e.target.value)}
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                        >
                          <option value="visa_mastercard">Visa / Mastercard</option>
                          <option value="elo_amex">Elo / Amex</option>
                        </select>
                      </div>
                      {isCredit && (
                        <div className="flex-1 min-w-40">
                          <label className="block text-xs text-gray-400 mb-1">Parcelas</label>
                          <select
                            value={pm.installments}
                            onChange={e => updatePaymentEntry(idx, 'installments', parseInt(e.target.value))}
                            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>
                                {n}x — {getFeePercentageLabel(pm.method, pm.card_brand || 'visa_mastercard', n)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {pmAmt > 0 && pmFee > 0 && (
                        <div className="flex items-end gap-4 pb-0.5">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">Taxa</p>
                            <p className="text-red-400 text-sm font-medium">- R$ {pmFee.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">Líquido</p>
                            <p className="text-green-400 text-sm font-semibold">R$ {(pmAmt - pmFee).toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {saleTotal > 0 && (
              <div className="flex flex-wrap items-center justify-between text-sm pt-2 border-t border-gray-700 gap-3">
                <span className="text-gray-400">
                  Total: <span className="text-white font-semibold">R$ {saleTotal.toFixed(2)}</span>
                </span>
                {totalCardFeePreview > 0 && (
                  <>
                    <span className="text-red-400">− Taxa: R$ {totalCardFeePreview.toFixed(2)}</span>
                    <span className="text-green-400 font-bold">Líquido: R$ {netPreview.toFixed(2)}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Entrega */}
          <div className="border border-gray-700 rounded-xl p-4">
            <p className="text-sm font-semibold text-white mb-3">Entrega</p>
            <div className="flex gap-2 mb-3 flex-wrap">
              {(['loja_fisica', 'motoboy', 'correios'] as const).map(dt => {
                const icons = { loja_fisica: ShoppingCart, motoboy: Bike, correios: Truck };
                const Icon = icons[dt];
                return (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, delivery_type: dt, motoboy_id: '', delivery_fee: '' }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      form.delivery_type === dt
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                    }`}
                  >
                    <Icon size={14} /> {DELIVERY_LABELS[dt]}
                  </button>
                );
              })}
            </div>
            {form.delivery_type === 'motoboy' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Motoboy*</label>
                  <select
                    value={form.motoboy_id}
                    onChange={e => setForm(f => ({ ...f, motoboy_id: e.target.value }))}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                  >
                    <option value="">Selecionar...</option>
                    {motoboys.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Valor da entrega (R$)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.delivery_fee}
                    onChange={e => setForm(f => ({ ...f, delivery_fee: e.target.value }))}
                    placeholder="0,00"
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Salvando...' : 'Registrar Venda'}
            </button>
          </div>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-xs mb-1">Vendas</p>
          <p className="text-2xl font-bold text-white">{sales.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-blue-500/40">
          <p className="text-gray-400 text-xs mb-1">Faturamento</p>
          <p className="text-2xl font-bold text-blue-400">R$ {totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-red-500/40">
          <p className="text-gray-400 text-xs mb-1">Custo + Entregas</p>
          <p className="text-2xl font-bold text-red-400">R$ {totalCost.toFixed(2)}</p>
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
              <th className="px-4 py-3 text-left   text-xs font-medium text-gray-400 uppercase">Descrição</th>
              <th className="px-4 py-3 text-center  text-xs font-medium text-gray-400 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right   text-xs font-medium text-gray-400 uppercase">Valor</th>
              <th className="px-4 py-3 text-right   text-xs font-medium text-gray-400 uppercase">Custo</th>
              <th className="px-4 py-3 text-right   text-xs font-medium text-gray-400 uppercase">Taxa</th>
              <th className="px-4 py-3 text-right   text-xs font-medium text-gray-400 uppercase">Lucro</th>
              <th className="px-4 py-3 text-center  text-xs font-medium text-gray-400 uppercase">Pagamento</th>
              <th className="px-4 py-3 text-center  text-xs font-medium text-gray-400 uppercase">Entrega</th>
              <th className="px-4 py-3 text-center  text-xs font-medium text-gray-400 uppercase">Data</th>
              <th className="px-4 py-3 text-center  text-xs font-medium text-gray-400 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Nenhuma venda no período.</td></tr>
            ) : (
              sales.map(sale => {
                const revenue  = sale.sale_price * sale.quantity;
                const costLine = sale.cost * sale.quantity;
                const fee      = getSaleCardFee(sale);
                const profit   = revenue - costLine - fee - (sale.delivery_fee || 0);
                const motoboyName = sale.motoboy_id
                  ? motoboys.find(m => m.id === sale.motoboy_id)?.name
                  : null;
                return (
                  <tr key={sale.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-white font-medium">{sale.description}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{sale.quantity}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-medium">R$ {revenue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-red-400">R$ {costLine.toFixed(2)}</td>
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
                    <td className="px-4 py-3 text-center">
                      {sale.delivery_type && sale.delivery_type !== 'loja_fisica' ? (
                        <div className="space-y-0.5">
                          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full">
                            {DELIVERY_LABELS[sale.delivery_type] || sale.delivery_type}
                          </span>
                          {motoboyName && (
                            <p className="text-xs text-orange-400">{motoboyName}</p>
                          )}
                          {(sale.delivery_fee || 0) > 0 && (
                            <p className="text-xs text-gray-500">R$ {(sale.delivery_fee || 0).toFixed(2)}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">Loja</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-sm">
                      {new Date(sale.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-500 hover:text-red-400 transition-colors"
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
