import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, X, DollarSign, CheckCircle, Clock, Calendar, CreditCard, Pencil } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';

interface Cost {
  id: string;
  name: string;
  amount: number;
  is_fixed: boolean;
  due_day: number | null;
  created_at: string;
}

interface CostPayment {
  id: string;
  cost_id: string;
  month: string;
  paid: boolean;
  paid_date: string | null;
  payment_method: string | null;
  amount_paid: number | null;
  notes: string | null;
}

const PAYMENT_METHODS = ['Nubank PJ', 'Itaú PJ', 'Nubank PF'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  return `${MONTHS[parseInt(month) - 1]} ${year}`;
};

export default function OperationalCosts() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [payments, setPayments] = useState<CostPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [showCostForm, setShowCostForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<Cost | null>(null);
  const [costForm, setCostForm] = useState({ name: '', amount: '', is_fixed: true, due_day: '' });
  const [paymentForm, setPaymentForm] = useState({ paid_date: new Date(), payment_method: 'Nubank PJ', amount_paid: '', notes: '' });

  useEffect(() => { loadData(); }, [selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [costsRes, paymentsRes] = await Promise.all([
        supabase.from('operational_costs').select('*').order('is_fixed', { ascending: false }).order('name'),
        supabase.from('operational_cost_payments').select('*').eq('month', selectedMonth),
      ]);
      setCosts(costsRes.data || []);
      setPayments(paymentsRes.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supabase.from('operational_costs').insert([{
        name: costForm.name,
        amount: Number(costForm.amount),
        is_fixed: costForm.is_fixed,
        due_day: costForm.due_day ? Number(costForm.due_day) : null,
      }]);
      setCostForm({ name: '', amount: '', is_fixed: true, due_day: '' });
      setShowCostForm(false);
      loadData();
    } catch { alert('Erro ao salvar custo'); }
  };

  const handleDeleteCost = async (id: string) => {
    if (!confirm('Excluir este custo? Os registros de pagamento também serão removidos.')) return;
    await supabase.from('operational_costs').delete().eq('id', id);
    loadData();
  };

  // Abre o modal de pagamento — se já existe um registro para o mês, preenche com os valores existentes
  const openPaymentModal = (cost: Cost) => {
    const existing = payments.find(p => p.cost_id === cost.id);
    setShowPaymentModal(cost);
    setPaymentForm({
      paid_date: existing?.paid_date ? new Date(existing.paid_date + 'T12:00:00') : new Date(),
      payment_method: existing?.payment_method || 'Nubank PJ',
      amount_paid: existing?.amount_paid != null ? String(existing.amount_paid) : String(cost.amount),
      notes: existing?.notes || '',
    });
  };

  const handleSavePayment = async (e: React.FormEvent, markAsPaid: boolean) => {
    e.preventDefault();
    if (!showPaymentModal) return;
    try {
      const existing = payments.find(p => p.cost_id === showPaymentModal.id);
      const payload = {
        cost_id: showPaymentModal.id,
        month: selectedMonth,
        paid: markAsPaid,
        paid_date: markAsPaid ? paymentForm.paid_date.toISOString().split('T')[0] : null,
        payment_method: markAsPaid ? paymentForm.payment_method : null,
        amount_paid: Number(paymentForm.amount_paid) || showPaymentModal.amount,
        notes: paymentForm.notes || null,
      };
      if (existing) {
        await supabase.from('operational_cost_payments').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('operational_cost_payments').insert([payload]);
      }
      setShowPaymentModal(null);
      setPaymentForm({ paid_date: new Date(), payment_method: 'Nubank PJ', amount_paid: '', notes: '' });
      loadData();
    } catch { alert('Erro ao registrar pagamento'); }
  };

  const handleMarkUnpaid = async (costId: string) => {
    if (!confirm('Desmarcar como pago?')) return;
    const existing = payments.find(p => p.cost_id === costId);
    if (existing) {
      await supabase.from('operational_cost_payments').update({
        paid: false, paid_date: null, payment_method: null
      }).eq('id', existing.id);
      loadData();
    }
  };

  const getPayment = (costId: string) => payments.find(p => p.cost_id === costId);

  // Retorna o valor efetivo do custo neste mês (do registro mensal ou do padrão)
  const getEffectiveAmount = (cost: Cost) => {
    const payment = getPayment(cost.id);
    if (payment?.amount_paid != null) return Number(payment.amount_paid);
    return cost.amount;
  };

  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      options.push(val);
    }
    return options;
  };

  const fixedCosts = costs.filter(c => c.is_fixed);
  const variableCosts = costs.filter(c => !c.is_fixed);
  const totalFixed = fixedCosts.reduce((sum, c) => sum + getEffectiveAmount(c), 0);
  const totalVariable = variableCosts.reduce((sum, c) => sum + getEffectiveAmount(c), 0);
  const totalPaid = payments.filter(p => p.paid).reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
  const totalPending = costs.filter(c => !getPayment(c.id)?.paid).reduce((sum, c) => sum + getEffectiveAmount(c), 0);

  if (loading) return <div className="p-8 text-white">Carregando...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <DollarSign size={32} className="text-orange-500" />
            Custos Operacionais
          </h1>
          <p className="text-gray-400 text-sm mt-1">Controle de custos fixos e variáveis da loja</p>
        </div>
        <button onClick={() => setShowCostForm(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
          <Plus size={20} /> Adicionar Custo
        </button>
      </div>

      {/* Seletor de Mês */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={18} className="text-orange-500" />
          <span className="text-gray-400 text-sm">Mês de referência:</span>
          {getMonthOptions().map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedMonth === m ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {formatMonthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Custos Fixos', value: totalFixed, color: 'text-red-400' },
          { label: 'Custos Variáveis', value: totalVariable, color: 'text-yellow-400' },
          { label: 'Total Pago', value: totalPaid, color: 'text-green-400' },
          { label: 'A Pagar', value: totalPending, color: 'text-orange-400' },
        ].map(card => (
          <div key={card.label} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <p className="text-gray-400 text-xs mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>R$ {card.value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Modal Adicionar Custo */}
      {showCostForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Novo Custo</h2>
              <button onClick={() => setShowCostForm(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddCost} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nome</label>
                <input type="text" value={costForm.name} onChange={e => setCostForm({ ...costForm, name: e.target.value })}
                  placeholder="Ex: Aluguel, Internet, Energia..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Valor padrão (R$)</label>
                <input type="number" step="0.01" min="0" value={costForm.amount} onChange={e => setCostForm({ ...costForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tipo</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setCostForm({ ...costForm, is_fixed: true })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${costForm.is_fixed ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    Fixo
                  </button>
                  <button type="button" onClick={() => setCostForm({ ...costForm, is_fixed: false })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!costForm.is_fixed ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    Variável
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  {costForm.is_fixed ? 'Valor padrão usado todo mês, mas pode ser ajustado mês a mês.' : 'Valor padrão zerado — você define o valor de cada mês na hora de pagar.'}
                </p>
              </div>
              {costForm.is_fixed && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Dia de vencimento (opcional)</label>
                  <input type="number" min="1" max="31" value={costForm.due_day} onChange={e => setCostForm({ ...costForm, due_day: e.target.value })}
                    placeholder="Ex: 10"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">Salvar</button>
                <button type="button" onClick={() => setShowCostForm(false)} className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar/Editar Pagamento */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-bold text-white">
                {getPayment(showPaymentModal.id)?.paid ? 'Editar Pagamento' : 'Registrar Pagamento'}
              </h2>
              <button onClick={() => setShowPaymentModal(null)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <p className="text-gray-400 text-sm mb-1">{showPaymentModal.name}</p>
            <p className="text-gray-500 text-xs mb-6">Valor padrão: R$ {showPaymentModal.amount.toFixed(2)} — você pode alterar o valor deste mês abaixo.</p>
            <form onSubmit={(e) => handleSavePayment(e, true)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Valor deste mês (R$) <span className="text-orange-400">*</span>
                </label>
                <input type="number" step="0.01" min="0" value={paymentForm.amount_paid}
                  onChange={e => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                  placeholder={`R$ ${showPaymentModal.amount.toFixed(2)}`}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-orange-500/50 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data do pagamento</label>
                <DatePicker
                  selected={paymentForm.paid_date}
                  onChange={(date: Date | null) => setPaymentForm({ ...paymentForm, paid_date: date || new Date() })}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  locale={ptBR}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Forma de pagamento</label>
                <div className="flex flex-col gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setPaymentForm({ ...paymentForm, payment_method: m })}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left ${paymentForm.payment_method === m ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                      <CreditCard size={15} /> {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Observação (opcional)</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Ex: Pago com desconto"
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                  ✓ Confirmar Pagamento
                </button>
                <button type="button" onClick={() => setShowPaymentModal(null)} className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
                  Cancelar
                </button>
              </div>
              {/* Botão só para salvar o valor sem marcar como pago */}
              <button type="button" onClick={(e) => handleSavePayment(e as any, false)}
                className="w-full bg-gray-700 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm">
                Salvar valor sem marcar como pago
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Custos Fixos */}
      <CostSection
        title="Custos Fixos"
        costs={fixedCosts}
        getPayment={getPayment}
        getEffectiveAmount={getEffectiveAmount}
        onOpenModal={openPaymentModal}
        onMarkUnpaid={handleMarkUnpaid}
        onDelete={handleDeleteCost}
      />

      {/* Lista de Custos Variáveis */}
      <CostSection
        title="Custos Variáveis"
        costs={variableCosts}
        getPayment={getPayment}
        getEffectiveAmount={getEffectiveAmount}
        onOpenModal={openPaymentModal}
        onMarkUnpaid={handleMarkUnpaid}
        onDelete={handleDeleteCost}
      />
    </div>
  );
}

function CostSection({ title, costs, getPayment, getEffectiveAmount, onOpenModal, onMarkUnpaid, onDelete }: {
  title: string;
  costs: Cost[];
  getPayment: (id: string) => CostPayment | undefined;
  getEffectiveAmount: (cost: Cost) => number;
  onOpenModal: (cost: Cost) => void;
  onMarkUnpaid: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (costs.length === 0) return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-4">
      <h2 className="text-lg font-bold text-white mb-3">{title}</h2>
      <p className="text-gray-400 text-sm">Nenhum custo {title === 'Custos Fixos' ? 'fixo' : 'variável'} cadastrado.</p>
    </div>
  );

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
      <div className="px-6 py-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white">{title}</h2>
      </div>
      <div className="divide-y divide-gray-700">
        {costs.map(cost => {
          const payment = getPayment(cost.id);
          const isPaid = payment?.paid;
          const effectiveAmount = getEffectiveAmount(cost);
          const hasCustomAmount = payment?.amount_paid != null && Number(payment.amount_paid) !== cost.amount;

          return (
            <div key={cost.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPaid ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  {isPaid ? <CheckCircle size={20} className="text-green-400" /> : <Clock size={20} className="text-red-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">{cost.name}</p>
                    {hasCustomAmount && (
                      <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">valor ajustado</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {cost.due_day && <span className="text-gray-500 text-xs">Vence dia {cost.due_day}</span>}
                    {isPaid && payment && (
                      <>
                        <span className="text-gray-600 text-xs">•</span>
                        <span className="text-green-400 text-xs">Pago em {new Date(payment.paid_date! + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        <span className="text-gray-600 text-xs">•</span>
                        <span className="text-blue-400 text-xs">{payment.payment_method}</span>
                        {payment.notes && <><span className="text-gray-600 text-xs">•</span><span className="text-gray-400 text-xs">{payment.notes}</span></>}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className={`text-lg font-bold ${isPaid ? 'text-green-400' : 'text-white'}`}>
                    R$ {effectiveAmount.toFixed(2)}
                  </span>
                  {hasCustomAmount && (
                    <p className="text-gray-500 text-xs">padrão: R$ {cost.amount.toFixed(2)}</p>
                  )}
                </div>
                <button onClick={() => onOpenModal(cost)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${isPaid ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                  {isPaid ? <><Pencil size={13} /> Editar</> : <><CheckCircle size={13} /> Marcar pago</>}
                </button>
                {isPaid && (
                  <button onClick={() => onMarkUnpaid(cost.id)}
                    className="text-xs bg-red-900/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-900/60 transition-colors">
                    Desmarcar
                  </button>
                )}
                <button onClick={() => onDelete(cost.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}