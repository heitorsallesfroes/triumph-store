import { useEffect, useState } from 'react';
import { supabase, Motoboy, MotoboyStats } from '../lib/supabase';
import { Plus, Pencil, Trash2, X, Bike, TrendingUp, Trophy, DollarSign, Calendar } from 'lucide-react';

type TimePeriod = 'today' | 'week' | 'month' | 'total' | 'custom';

interface CustomStats {
  id: string;
  name: string;
  deliveries: number;
  earnings: number;
}

export default function Motoboys() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [stats, setStats] = useState<MotoboyStats[]>([]);
  const [customStats, setCustomStats] = useState<CustomStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMotoboy, setEditingMotoboy] = useState<Motoboy | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formData, setFormData] = useState({
    name: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPeriod === 'custom' && startDate) {
      loadCustomStats();
    }
  }, [startDate, endDate, selectedPeriod]);

  const loadData = async () => {
    try {
      const { data: motoboysData, error: motoboysError } = await supabase
        .from('motoboys')
        .select('*')
        .order('name', { ascending: true });

      if (motoboysError) throw motoboysError;
      setMotoboys(motoboysData || []);

      const { data: statsData, error: statsError } = await supabase
        .from('motoboy_stats')
        .select('*');

      if (statsError) throw statsError;
      setStats(statsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomStats = async () => {
    if (!startDate) return;

    try {
      const effectiveEndDate = endDate || startDate;

      const { data: salesData, error } = await supabase
        .from('sales')
        .select('motoboy_id, delivery_fee')
        .eq('delivery_type', 'delivery')
        .eq('status', 'finalizado')
        .gte('sale_date', startDate)
        .lte('sale_date', effectiveEndDate + 'T23:59:59');

      if (error) throw error;

      const statsMap = new Map<string, { deliveries: number; earnings: number }>();

      salesData?.forEach((sale) => {
        if (sale.motoboy_id) {
          const current = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0 };
          statsMap.set(sale.motoboy_id, {
            deliveries: current.deliveries + 1,
            earnings: current.earnings + (sale.delivery_fee || 0),
          });
        }
      });

      const customStatsArray = motoboys.map((motoboy) => {
        const motoboyStats = statsMap.get(motoboy.id) || { deliveries: 0, earnings: 0 };
        return {
          id: motoboy.id,
          name: motoboy.name,
          deliveries: motoboyStats.deliveries,
          earnings: motoboyStats.earnings,
        };
      });

      setCustomStats(customStatsArray);
    } catch (error) {
      console.error('Error loading custom stats:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const motoboyData = {
        name: formData.name,
      };

      if (editingMotoboy) {
        const { error } = await supabase
          .from('motoboys')
          .update(motoboyData)
          .eq('id', editingMotoboy.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('motoboys')
          .insert([motoboyData]);

        if (error) throw error;
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving motoboy:', error);
      alert('Erro ao salvar motoboy');
    }
  };

  const handleEdit = (motoboy: Motoboy) => {
    setEditingMotoboy(motoboy);
    setFormData({
      name: motoboy.name,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este motoboy?')) return;

    try {
      const { error } = await supabase
        .from('motoboys')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting motoboy:', error);
      alert('Erro ao excluir motoboy');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
    });
    setEditingMotoboy(null);
    setShowForm(false);
  };

  const handlePeriodChange = (period: TimePeriod) => {
    setSelectedPeriod(period);
    if (period !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setStartDate(value);
      setSelectedPeriod('custom');
    } else {
      setEndDate(value);
      setSelectedPeriod('custom');
    }
  };

  const clearCustomDates = () => {
    setStartDate('');
    setEndDate('');
    setSelectedPeriod('total');
  };

  const getSortedStats = () => {
    if (selectedPeriod === 'custom') {
      return [...customStats].sort((a, b) => b.earnings - a.earnings);
    }

    return [...stats].sort((a, b) => {
      let aValue = 0;
      let bValue = 0;

      switch (selectedPeriod) {
        case 'today':
          aValue = a.earnings_today;
          bValue = b.earnings_today;
          break;
        case 'week':
          aValue = a.earnings_this_week;
          bValue = b.earnings_this_week;
          break;
        case 'month':
          aValue = a.earnings_this_month;
          bValue = b.earnings_this_month;
          break;
        case 'total':
          aValue = a.total_earnings;
          bValue = b.total_earnings;
          break;
      }

      return bValue - aValue;
    });
  };

  const getDeliveriesForPeriod = (stat: MotoboyStats | CustomStats) => {
    if (selectedPeriod === 'custom') {
      return (stat as CustomStats).deliveries;
    }

    const motoboyStats = stat as MotoboyStats;
    switch (selectedPeriod) {
      case 'today':
        return motoboyStats.deliveries_today;
      case 'week':
        return motoboyStats.deliveries_this_week;
      case 'month':
        return motoboyStats.deliveries_this_month;
      case 'total':
        return motoboyStats.total_deliveries;
    }
  };

  const getEarningsForPeriod = (stat: MotoboyStats | CustomStats) => {
    if (selectedPeriod === 'custom') {
      return (stat as CustomStats).earnings;
    }

    const motoboyStats = stat as MotoboyStats;
    switch (selectedPeriod) {
      case 'today':
        return motoboyStats.earnings_today;
      case 'week':
        return motoboyStats.earnings_this_week;
      case 'month':
        return motoboyStats.earnings_this_month;
      case 'total':
        return motoboyStats.total_earnings;
    }
  };

  const getPeriodLabel = () => {
    if (selectedPeriod === 'custom') {
      if (startDate && endDate) {
        return `${formatDate(startDate)} - ${formatDate(endDate)}`;
      } else if (startDate) {
        return formatDate(startDate);
      }
      return 'Período Personalizado';
    }

    switch (selectedPeriod) {
      case 'today':
        return 'Hoje';
      case 'week':
        return 'Esta Semana';
      case 'month':
        return 'Este Mês';
      case 'total':
        return 'Total Geral';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getAvgDeliveryValue = (stat: MotoboyStats | CustomStats) => {
    if (selectedPeriod === 'custom') {
      const customStat = stat as CustomStats;
      return customStat.deliveries > 0 ? customStat.earnings / customStat.deliveries : 0;
    }
    return (stat as MotoboyStats).avg_delivery_value;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  const sortedStats = getSortedStats();

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <Bike size={32} className="text-orange-500" />
          <div>
            <h1 className="text-3xl font-bold text-white">Motoboys</h1>
            <p className="text-gray-400 mt-1">Gerenciar pessoal de entrega</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus size={20} />
          Adicionar Motoboy
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Calendar size={20} className="text-orange-500" />
          <h3 className="text-lg font-semibold text-white">Filtro de Data</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Data Final (opcional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('end', e.target.value)}
              min={startDate}
              disabled={!startDate}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={clearCustomDates}
              disabled={!startDate && !endDate}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Limpar Filtro
            </button>
          </div>
        </div>
        {selectedPeriod === 'custom' && startDate && (
          <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-orange-400 text-sm">
              Mostrando dados de {formatDate(startDate)}
              {endDate && ` até ${formatDate(endDate)}`}
            </p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingMotoboy ? 'Editar Motoboy' : 'Adicionar Novo Motoboy'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {editingMotoboy ? 'Atualizar Motoboy' : 'Adicionar Motoboy'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-900 px-6 py-4">
            <h2 className="text-xl font-bold text-white">Lista de Motoboys</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {motoboys.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-gray-400">
                    Nenhum motoboy ainda. Clique em "Adicionar Motoboy" para começar.
                  </td>
                </tr>
              ) : (
                motoboys.map((motoboy) => (
                  <tr key={motoboy.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-white">{motoboy.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(motoboy)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(motoboy.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-900 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Trophy size={24} className="text-orange-500" />
                Ranking de Desempenho
              </h2>
            </div>
            {selectedPeriod !== 'custom' && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handlePeriodChange('today')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedPeriod === 'today'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => handlePeriodChange('week')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedPeriod === 'week'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => handlePeriodChange('month')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedPeriod === 'month'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Mês
                </button>
                <button
                  onClick={() => handlePeriodChange('total')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedPeriod === 'total'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Total
                </button>
              </div>
            )}
          </div>
          <div className="p-6 max-h-[600px] overflow-y-auto">
            {sortedStats.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                Sem dados de entrega ainda
              </div>
            ) : (
              <div className="space-y-4">
                {sortedStats.map((stat, index) => {
                  const deliveries = getDeliveriesForPeriod(stat);
                  const earnings = getEarningsForPeriod(stat);

                  if (deliveries === 0 && selectedPeriod !== 'total') {
                    return null;
                  }

                  const avgValue = getAvgDeliveryValue(stat);
                  const motoboyStats = stat as MotoboyStats;

                  return (
                    <div
                      key={stat.id}
                      className="bg-gray-900 rounded-lg p-5 border border-gray-700 hover:border-orange-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                              index === 0
                                ? 'bg-yellow-500'
                                : index === 1
                                ? 'bg-gray-400'
                                : index === 2
                                ? 'bg-orange-600'
                                : 'bg-gray-600'
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="text-white font-semibold text-lg">{stat.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-gray-400 text-xs">{getPeriodLabel()}</div>
                          <div className="text-green-400 text-xl font-bold">
                            R$ {earnings.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {selectedPeriod === 'custom' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1">Entregas</div>
                            <div className="text-white text-lg font-semibold">
                              {deliveries}
                            </div>
                          </div>
                          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                            <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                              <DollarSign size={12} />
                              Média por Entrega
                            </div>
                            <div className="text-green-400 text-lg font-bold">
                              R$ {avgValue.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Hoje</div>
                              <div className="text-white text-sm font-semibold">
                                {motoboyStats.deliveries_today} entregas
                              </div>
                              <div className="text-orange-400 text-sm font-medium">
                                R$ {motoboyStats.earnings_today.toFixed(2)}
                              </div>
                            </div>

                            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Semana</div>
                              <div className="text-white text-sm font-semibold">
                                {motoboyStats.deliveries_this_week} entregas
                              </div>
                              <div className="text-orange-400 text-sm font-medium">
                                R$ {motoboyStats.earnings_this_week.toFixed(2)}
                              </div>
                            </div>

                            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1">Mês</div>
                              <div className="text-white text-sm font-semibold">
                                {motoboyStats.deliveries_this_month} entregas
                              </div>
                              <div className="text-orange-400 text-sm font-medium">
                                R$ {motoboyStats.earnings_this_month.toFixed(2)}
                              </div>
                            </div>

                            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                              <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                                <DollarSign size={12} />
                                Média por Entrega
                              </div>
                              <div className="text-green-400 text-lg font-bold">
                                R$ {motoboyStats.avg_delivery_value.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {selectedPeriod === 'total' && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-gray-400 text-xs">
                                  <TrendingUp size={14} />
                                  Total Histórico
                                </div>
                                <div>
                                  <span className="text-white font-semibold">
                                    {motoboyStats.total_deliveries} entregas
                                  </span>
                                  <span className="text-gray-400 mx-2">•</span>
                                  <span className="text-green-400 font-semibold">
                                    R$ {motoboyStats.total_earnings.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
