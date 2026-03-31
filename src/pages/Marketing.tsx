import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, Target, ShoppingCart, Plus, Trash2, CreditCard as Edit2, X, Calendar } from 'lucide-react';
import BarChart from '../components/BarChart';
import DualBarChart from '../components/DualBarChart';
import { getTodayInBrazil, formatDateDisplay, getWeekRangeInBrazil, getMonthRangeInBrazil, isDateInRange, normalizeDateFromDB } from '../lib/dateUtils';

interface AdSpend {
  id: string;
  date: string;
  amount: number;
}

interface Sale {
  id: string;
  sale_date: string;
  total_sale_price: number;
  profit: number;
  status: string;
}

interface DailyMetrics {
  date: string;
  adSpend: number;
  revenue: number;
  profit: number;
  sales: number;
  roas: number;
  roi: number;
  cpv: number;
}

interface PeriodSummary {
  totalAdSpend: number;
  totalRevenue: number;
  totalProfit: number;
  totalSales: number;
  avgRoas: number;
  avgRoi: number;
  avgCpv: number;
}

type TimeFilter = 'today' | 'week' | 'month' | 'custom';

export default function Marketing() {
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [adSpendRecords, setAdSpendRecords] = useState<AdSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ date: '', amount: '' });

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    loadData();
    setFormData({ date: getTodayInBrazil(), amount: '' });
  }, []);

  useEffect(() => {
    loadData();
  }, [timeFilter, customStartDate, customEndDate]);

  const getDateRange = (): { start: string; end: string } | null => {
    if (timeFilter === 'today') {
      const today = getTodayInBrazil();
      return { start: today, end: today };
    } else if (timeFilter === 'week') {
      return getWeekRangeInBrazil();
    } else if (timeFilter === 'month') {
      return getMonthRangeInBrazil();
    } else if (timeFilter === 'custom' && customStartDate && customEndDate) {
      return { start: customStartDate, end: customEndDate };
    }
    return null;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      console.log('=== Load Data Debug ===');
      console.log('Time Filter:', timeFilter);
      console.log('Date Range:', dateRange);

      const [adSpendResult, salesResult] = await Promise.all([
        supabase.from('ad_spend').select('*').order('date', { ascending: false }),
        supabase
          .from('sales')
          .select('id, sale_date, total_sale_price, profit, status')
          .eq('status', 'finalizado')
      ]);

      const allAdSpendData = adSpendResult.data || [];
      const allSalesData = salesResult.data || [];

      console.log('=== Fetched Data (Before Filtering) ===');
      console.log(`Total Ad Spend Records in DB: ${allAdSpendData.length}`);
      console.log(`Total Sales Records in DB: ${allSalesData.length}`);

      let adSpendData = allAdSpendData;
      let salesData = allSalesData;

      if (dateRange) {
        console.log(`Filtering by date range: ${dateRange.start} to ${dateRange.end}`);

        adSpendData = allAdSpendData.filter(ad =>
          isDateInRange(ad.date, dateRange.start, dateRange.end)
        );

        salesData = allSalesData.filter(sale => {
          const saleDate = normalizeDateFromDB(sale.sale_date);
          return isDateInRange(saleDate, dateRange.start, dateRange.end);
        });

        console.log(`After filtering: ${adSpendData.length} ad spend records, ${salesData.length} sales`);
      }

      console.log('=== Filtered Data ===');
      console.log('Ad Spend Data:', adSpendData);
      console.log('Sales Data (first 5):', salesData.slice(0, 5));

      setAdSpendRecords(adSpendData);

      const allDates = new Set<string>();
      adSpendData.forEach(ad => {
        console.log(`Adding ad spend date: ${ad.date}, amount: ${ad.amount}`);
        allDates.add(ad.date);
      });
      salesData.forEach(sale => {
        const saleDate = normalizeDateFromDB(sale.sale_date);
        console.log(`Sale date from DB: ${sale.sale_date} -> Normalized: ${saleDate}`);
        allDates.add(saleDate);
      });

      console.log('=== Date Analysis ===');
      console.log(`Unique Dates Found: ${allDates.size}`);
      console.log('All Dates:', Array.from(allDates).sort());

      const metrics: DailyMetrics[] = Array.from(allDates).map(dateStr => {
        const adSpendRecord = adSpendData.find(ad => ad.date === dateStr);
        const adSpend = adSpendRecord ? Number(adSpendRecord.amount) : 0;

        const daySales = salesData.filter(s => {
          const saleDate = normalizeDateFromDB(s.sale_date);
          return saleDate === dateStr;
        });

        const revenue = daySales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const profit = daySales.reduce((sum, s) => sum + Number(s.profit), 0);
        const salesCount = daySales.length;

        const roas = adSpend > 0 ? revenue / adSpend : 0;
        const roi = adSpend > 0 ? ((profit - adSpend) / adSpend) * 100 : 0;
        const cpv = salesCount > 0 ? adSpend / salesCount : 0;

        if (adSpend > 0 || salesCount > 0) {
          console.log(`Date ${dateStr}:`, {
            adSpend: `R$ ${adSpend.toFixed(2)}`,
            revenue: `R$ ${revenue.toFixed(2)}`,
            profit: `R$ ${profit.toFixed(2)}`,
            sales: salesCount,
            roas: roas > 0 ? `${roas.toFixed(2)}x` : '-',
            roi: adSpend > 0 ? `${roi.toFixed(0)}%` : '-',
            cpv: cpv > 0 ? `R$ ${cpv.toFixed(2)}` : '-'
          });
        }

        return {
          date: dateStr,
          adSpend,
          revenue,
          profit,
          sales: salesCount,
          roas,
          roi,
          cpv,
        };
      });

      metrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalAdSpendInMetrics = metrics.reduce((sum, m) => sum + m.adSpend, 0);
      const totalRevenueInMetrics = metrics.reduce((sum, m) => sum + m.revenue, 0);
      const totalProfitInMetrics = metrics.reduce((sum, m) => sum + m.profit, 0);
      const totalSalesInMetrics = metrics.reduce((sum, m) => sum + m.sales, 0);

      console.log('=== Final Metrics Summary ===');
      console.log(`Total Days: ${metrics.length}`);
      console.log(`Total Ad Spend: R$ ${totalAdSpendInMetrics.toFixed(2)}`);
      console.log(`Total Revenue: R$ ${totalRevenueInMetrics.toFixed(2)}`);
      console.log(`Total Profit: R$ ${totalProfitInMetrics.toFixed(2)}`);
      console.log(`Total Sales: ${totalSalesInMetrics}`);

      if (totalAdSpendInMetrics === 0) {
        console.warn('⚠️ WARNING: No ad spend records found! Add ad spend data to see ROAS, ROI, and CPV metrics.');
      }

      setDailyMetrics(metrics);
    } catch (error) {
      console.error('Error loading marketing data:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== Saving Ad Spend ===');
    console.log('Form Data:', formData);
    console.log('Editing ID:', editingId);

    try {
      if (editingId) {
        console.log(`Updating ad spend record ${editingId}...`);
        const { data, error } = await supabase
          .from('ad_spend')
          .update({ amount: Number(formData.amount) })
          .eq('id', editingId)
          .select();

        if (error) {
          console.error('❌ Error updating ad spend:', error);
          alert('Erro ao atualizar gasto: ' + error.message);
          return;
        }

        console.log('✅ Ad spend updated successfully:', data);
      } else {
        console.log('Inserting new ad spend record...');
        const insertData = {
          date: formData.date,
          amount: Number(formData.amount)
        };
        console.log('Insert payload:', insertData);

        const { data, error } = await supabase
          .from('ad_spend')
          .insert([insertData])
          .select();

        if (error) {
          console.error('❌ Error inserting ad spend:', error);
          alert('Erro ao salvar gasto: ' + error.message);
          return;
        }

        console.log('✅ Ad spend saved successfully:', data);
      }

      console.log('Fetching all ad_spend records...');
      const { data: allRecords, error: fetchError } = await supabase
        .from('ad_spend')
        .select('*')
        .order('date', { ascending: false });

      if (fetchError) {
        console.error('❌ Error fetching ad spend records:', fetchError);
      } else {
        console.log(`✅ Total ad_spend records in database: ${allRecords?.length || 0}`);
        console.log('All ad spend records:', allRecords);
      }

      setFormData({ date: getTodayInBrazil(), amount: '' });
      setShowForm(false);
      setEditingId(null);

      console.log('Reloading marketing data...');
      await loadData();
      console.log('✅ Marketing data reloaded');
    } catch (error) {
      console.error('❌ Unexpected error saving ad spend:', error);
      alert('Erro inesperado ao salvar gasto: ' + (error as Error).message);
    }
  };

  const handleEdit = (record: AdSpend) => {
    setEditingId(record.id);
    setFormData({ date: record.date, amount: record.amount.toString() });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    console.log(`=== Deleting Ad Spend ${id} ===`);

    try {
      const { error } = await supabase
        .from('ad_spend')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error deleting ad spend:', error);
        alert('Erro ao excluir gasto: ' + error.message);
        return;
      }

      console.log('✅ Ad spend deleted successfully');
      await loadData();
      console.log('✅ Marketing data reloaded');
    } catch (error) {
      console.error('❌ Unexpected error deleting ad spend:', error);
      alert('Erro inesperado ao excluir gasto: ' + (error as Error).message);
    }
  };


  const calculateSummary = (): PeriodSummary => {
    console.log('=== Calculate Summary ===');
    console.log(`Processing ${dailyMetrics.length} days of data`);

    if (dailyMetrics.length === 0) {
      console.log('No metrics available');
      return {
        totalAdSpend: 0,
        totalRevenue: 0,
        totalProfit: 0,
        totalSales: 0,
        avgRoas: 0,
        avgRoi: 0,
        avgCpv: 0,
      };
    }

    let totalAdSpend = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalSales = 0;

    dailyMetrics.forEach(d => {
      const adSpendValue = Number(d.adSpend) || 0;
      const revenueValue = Number(d.revenue) || 0;
      const profitValue = Number(d.profit) || 0;
      const salesValue = Number(d.sales) || 0;

      totalAdSpend += adSpendValue;
      totalRevenue += revenueValue;
      totalProfit += profitValue;
      totalSales += salesValue;

      if (adSpendValue > 0) {
        console.log(`  ${d.date}: Gasto R$ ${adSpendValue.toFixed(2)}`);
      }
    });

    console.log('=== Totals ===');
    console.log(`Total Ad Spend: R$ ${totalAdSpend.toFixed(2)}`);
    console.log(`Total Revenue: R$ ${totalRevenue.toFixed(2)}`);
    console.log(`Total Profit: R$ ${totalProfit.toFixed(2)}`);
    console.log(`Total Sales: ${totalSales}`);

    const avgRoas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
    const avgRoi = totalAdSpend > 0 ? ((totalProfit - totalAdSpend) / totalAdSpend) * 100 : 0;
    const avgCpv = totalSales > 0 ? totalAdSpend / totalSales : 0;

    console.log('=== Calculated Metrics ===');
    console.log(`ROAS: ${avgRoas > 0 ? avgRoas.toFixed(2) + 'x' : 'N/A (no ad spend)'}`);
    console.log(`ROI: ${totalAdSpend > 0 ? avgRoi.toFixed(0) + '%' : 'N/A (no ad spend)'}`);
    console.log(`CPV: ${avgCpv > 0 ? 'R$ ' + avgCpv.toFixed(2) : 'N/A'}`);

    return {
      totalAdSpend,
      totalRevenue,
      totalProfit,
      totalSales,
      avgRoas,
      avgRoi,
      avgCpv,
    };
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  const summary = calculateSummary();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <TrendingUp size={32} />
          Marketing / Tráfego Pago
        </h1>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setFormData({ date: getTodayInBrazil(), amount: '' });
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          {showForm ? <X size={20} /> : <Plus size={20} />}
          {showForm ? 'Cancelar' : 'Adicionar Gasto'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            {editingId ? 'Editar Gasto com Anúncios' : 'Novo Gasto com Anúncios'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data do Gasto
                {!editingId && <span className="text-gray-500 text-xs ml-2">(Padrão: Hoje)</span>}
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                required
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Valor Gasto (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                required
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {editingId ? 'Atualizar' : 'Adicionar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Time Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <Calendar size={20} className="text-gray-400" />
          <button
            onClick={() => setTimeFilter('today')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              timeFilter === 'today'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setTimeFilter('week')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              timeFilter === 'week'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setTimeFilter('month')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              timeFilter === 'month'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Mês
          </button>
          <button
            onClick={() => setTimeFilter('custom')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              timeFilter === 'custom'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Personalizado
          </button>

          {timeFilter === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="Data inicial"
              />
              <span className="text-gray-400">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="Data final"
              />
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Gasto Total"
          value={`R$ ${summary.totalAdSpend.toFixed(2)}`}
          subtitle={`${summary.totalSales} vendas`}
          icon={DollarSign}
          color="red"
        />
        <StatCard
          title="Faturamento Total"
          value={`R$ ${summary.totalRevenue.toFixed(2)}`}
          subtitle={`Receita bruta`}
          icon={ShoppingCart}
          color="green"
        />
        <StatCard
          title="Lucro Total"
          value={`R$ ${summary.totalProfit.toFixed(2)}`}
          subtitle={`Margem líquida`}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="ROAS Médio"
          value={`${summary.avgRoas.toFixed(2)}x`}
          subtitle={`ROI: ${summary.avgRoi.toFixed(0)}%`}
          icon={Target}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="CPV Médio"
          value={`R$ ${summary.avgCpv.toFixed(2)}`}
          subtitle="Custo por venda"
        />
        <MetricCard
          title="ROI"
          value={`${summary.avgRoi.toFixed(0)}%`}
          subtitle="Retorno sobre investimento"
        />
        <MetricCard
          title="ROAS"
          value={`${summary.avgRoas.toFixed(2)}x`}
          subtitle="Retorno sobre gasto com anúncios"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-6">Faturamento vs Gasto</h3>
          {dailyMetrics.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados para o período selecionado</div>
          ) : (
            <DualBarChart
              data={dailyMetrics.slice(0, 10).reverse().map(d => ({
                label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                value1: d.revenue,
                value2: d.adSpend,
                color1: 'bg-green-500',
                color2: 'bg-red-500',
              }))}
              height="h-64"
              label1="Faturamento"
              label2="Gasto"
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-6">Lucro vs Gasto</h3>
          {dailyMetrics.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados para o período selecionado</div>
          ) : (
            <DualBarChart
              data={dailyMetrics.slice(0, 10).reverse().map(d => ({
                label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                value1: d.profit,
                value2: d.adSpend,
                color1: 'bg-blue-500',
                color2: 'bg-red-500',
              }))}
              height="h-64"
              label1="Lucro"
              label2="Gasto"
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-6">ROAS ao Longo do Tempo</h3>
          {dailyMetrics.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados para o período selecionado</div>
          ) : (
            <BarChart
              data={dailyMetrics.slice(0, 10).reverse().map(d => ({
                label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                value: d.roas,
                color: 'bg-orange-500',
              }))}
              height="h-64"
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-6">Volume de Vendas</h3>
          {dailyMetrics.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Sem dados para o período selecionado</div>
          ) : (
            <BarChart
              data={dailyMetrics.slice(0, 10).reverse().map(d => ({
                label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                value: d.sales,
                color: 'bg-green-500',
              }))}
              height="h-64"
            />
          )}
        </div>
      </div>

      {/* Daily Metrics Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Detalhamento Diário</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Gasto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Vendas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Faturamento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Lucro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  ROAS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  ROI
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  CPV
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {dailyMetrics.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-400">
                    Nenhum registro encontrado para o período selecionado
                  </td>
                </tr>
              ) : (
                dailyMetrics.map((metric) => {
                  const record = adSpendRecords.find(r => r.date === metric.date);
                  return (
                    <tr key={metric.date} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {formatDateDisplay(metric.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        R$ {metric.adSpend.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {metric.sales}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400 font-medium">
                        R$ {metric.revenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-400 font-medium">
                        R$ {metric.profit.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {metric.roas > 0 ? `${metric.roas.toFixed(2)}x` : '-'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        metric.roi > 0 ? 'text-green-400' : metric.roi < 0 ? 'text-red-400' : 'text-white'
                      }`}>
                        {metric.adSpend > 0 ? `${metric.roi.toFixed(0)}%` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {metric.cpv > 0 ? `R$ ${metric.cpv.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          {record && (
                            <>
                              <button
                                onClick={() => handleEdit(record)}
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                                title="Editar"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(record.id)}
                                className="text-red-400 hover:text-red-300 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          {!record && metric.adSpend === 0 && (
                            <span className="text-gray-500 text-xs">Sem gasto</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, subtitle, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    orange: 'text-orange-500 bg-orange-500/10',
    green: 'text-green-500 bg-green-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    red: 'text-red-500 bg-red-500/10',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-gray-400">{subtitle}</p>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
}

function MetricCard({ title, value, subtitle }: MetricCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">{title}</h4>
      <p className="text-xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}
