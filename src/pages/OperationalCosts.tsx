import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, X, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
  is_active: boolean;
  deactivated_at: string | null;
}

interface AvulsoExpense {
  id: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  return `${MONTHS[parseInt(month) - 1]} ${year}`;
};

// Um custo só aparece a partir do mês em que foi criado. Se estiver inativo (excluído),
// só continua aparecendo nos meses anteriores ao mês em que foi excluído — some a partir
// do mês da exclusão em diante (mesmo que seja o mês em que foi criado).
const isCostVisibleInMonth = (cost: Cost, month: string, currentMonth: string) => {
  const createdMonth = cost.created_at.slice(0, 7);
  if (createdMonth > month) return false;
  if (cost.is_active) return true;
  const deactivatedMonth = cost.deactivated_at ? cost.deactivated_at.slice(0, 7) : currentMonth;
  return month < deactivatedMonth;
};

export default function OperationalCosts() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [avulsos, setAvulsos] = useState<AvulsoExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [showCostForm, setShowCostForm] = useState(false);
  const [showAvulsoModal, setShowAvulsoModal] = useState(false);
  const [costForm, setCostForm] = useState({ name: '', amount: '', is_fixed: true, due_day: '' });
  const [avulsoForm, setAvulsoForm] = useState({ description: '', amount: '', date: new Date() });

  useEffect(() => { loadData(); }, [selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const lastDayStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const [costsRes, avulsosRes] = await Promise.all([
        supabase.from('operational_costs').select('*').order('is_fixed', { ascending: false }).order('name'),
        supabase.from('operational_costs_avulsos').select('*')
          .gte('date', `${selectedMonth}-01`)
          .lte('date', lastDayStr)
          .order('date', { ascending: false }),
      ]);
      setCosts(costsRes.data || []);
      setAvulsos(avulsosRes.data || []);
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
    if (!confirm('Excluir este custo? Ele deixará de aparecer a partir deste mês, mas os meses anteriores continuam mostrando o valor.')) return;
    await supabase.from('operational_costs').update({ is_active: false, deactivated_at: new Date().toISOString() }).eq('id', id);
    loadData();
  };

  const handleAddAvulso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supabase.from('operational_costs_avulsos').insert([{
        description: avulsoForm.description,
        amount: Number(avulsoForm.amount),
        date: avulsoForm.date.toISOString().split('T')[0],
      }]);
      setAvulsoForm({ description: '', amount: '', date: new Date() });
      setShowAvulsoModal(false);
      loadData();
    } catch { alert('Erro ao salvar gasto avulso'); }
  };

  const handleDeleteAvulso = async (id: string) => {
    if (!confirm('Excluir este gasto avulso?')) return;
    await supabase.from('operational_costs_avulsos').delete().eq('id', id);
    loadData();
  };

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
  const prevMonthStr = (() => { const d = new Date(selYear, selMonthNum - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const nextMonthStr = (() => { const d = new Date(selYear, selMonthNum, 1);     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const currentMonth = getCurrentMonth();
  const visibleCosts = costs.filter(c => isCostVisibleInMonth(c, selectedMonth, currentMonth));
  const fixedCosts = visibleCosts.filter(c => c.is_fixed);
  const variableCosts = visibleCosts.filter(c => !c.is_fixed);
  const totalFixed = fixedCosts.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalVariable = variableCosts.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalAvulsos = avulsos.reduce((sum, a) => sum + Number(a.amount), 0);
  const totalGeral = totalFixed + totalVariable + totalAvulsos;

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

      {/* Navegação de Mês */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => navigateMonth(-1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={17} />
            {formatMonthLabel(prevMonthStr)}
          </button>
          <span className="text-gray-600 px-1 select-none">|</span>
          <div className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500/20 border border-orange-500/50">
            <Calendar size={15} className="text-orange-400 flex-shrink-0" />
            <span className="text-orange-300 font-bold text-sm">{formatMonthLabel(selectedMonth)}</span>
          </div>
          <span className="text-gray-600 px-1 select-none">|</span>
          <button
            onClick={() => navigateMonth(1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:text-white hover:bg-gray-700"
          >
            {formatMonthLabel(nextMonthStr)}
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Custos Fixos', value: totalFixed, color: 'text-red-400' },
          { label: 'Custos Variáveis', value: totalVariable, color: 'text-yellow-400' },
          { label: 'Gastos Avulsos', value: totalAvulsos, color: 'text-purple-400' },
          { label: 'Total', value: totalGeral, color: 'text-orange-400' },
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
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
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
                <label className="block text-sm font-medium text-gray-300 mb-2">Valor (R$)</label>
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
                  O custo passa a valer a partir deste mês — meses anteriores não são afetados.
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

      {/* Modal Adicionar Gasto Avulso */}
      {showAvulsoModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Novo Gasto Avulso</h2>
              <button onClick={() => setShowAvulsoModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddAvulso} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Descrição</label>
                <input
                  type="text"
                  value={avulsoForm.description}
                  onChange={e => setAvulsoForm({ ...avulsoForm, description: e.target.value })}
                  placeholder="Ex: Conserto de impressora, Material de limpeza..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={avulsoForm.amount}
                  onChange={e => setAvulsoForm({ ...avulsoForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data</label>
                <DatePicker
                  selected={avulsoForm.date}
                  onChange={(date: Date | null) => setAvulsoForm({ ...avulsoForm, date: date || new Date() })}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  locale={ptBR}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">Salvar</button>
                <button type="button" onClick={() => setShowAvulsoModal(false)} className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Custos Fixos */}
      <CostSection title="Custos Fixos" costs={fixedCosts} onDelete={handleDeleteCost} />

      {/* Lista de Custos Variáveis */}
      <CostSection title="Custos Variáveis" costs={variableCosts} onDelete={handleDeleteCost} />

      {/* Lista de Gastos Avulsos */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Gastos Avulsos</h2>
            <p className="text-gray-500 text-xs mt-0.5">Despesas não recorrentes do mês</p>
          </div>
          <button
            onClick={() => setShowAvulsoModal(true)}
            className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            <Plus size={16} /> Adicionar Gasto Avulso
          </button>
        </div>
        {avulsos.length === 0 ? (
          <div className="p-6">
            <p className="text-gray-400 text-sm">Nenhum gasto avulso registrado neste mês.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {avulsos.map(avulso => (
              <div key={avulso.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <DollarSign size={18} className="text-purple-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{avulso.description}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {new Date(avulso.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white">R$ {Number(avulso.amount).toFixed(2)}</span>
                  <button onClick={() => handleDeleteAvulso(avulso.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CostSection({ title, costs, onDelete }: {
  title: string;
  costs: Cost[];
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
        {costs.map(cost => (
          <div key={cost.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <DollarSign size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-white font-medium">{cost.name}</p>
                {cost.due_day && <span className="text-gray-500 text-xs">Vence dia {cost.due_day}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-white">R$ {Number(cost.amount).toFixed(2)}</span>
              <button onClick={() => onDelete(cost.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
