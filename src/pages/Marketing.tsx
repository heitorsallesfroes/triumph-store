import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, DollarSign, Target, ShoppingCart, Plus, Trash2,
  CreditCard as Edit2, X, Calendar, RefreshCw,
  BarChart2, Activity, AlertCircle, CheckCircle
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';
import BarChart from '../components/BarChart';
import DualBarChart from '../components/DualBarChart';
import {
  getTodayInBrazil, getYesterdayInBrazil, formatDateDisplay, getWeekRangeInBrazil,
  getMonthRangeInBrazil, isDateInRange, normalizeDateFromDB
} from '../lib/dateUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface AdSpend { id: string; date: string; amount: number; }
interface Sale { id: string; sale_date: string; total_sale_price: number; profit: number; status: string; }
interface DailyMetrics { date: string; adSpend: number; revenue: number; profit: number; sales: number; roas: number; roi: number; cpv: number; }
interface PeriodSummary { totalAdSpend: number; totalRevenue: number; totalProfit: number; totalSales: number; avgRoas: number; avgRoi: number; avgCpv: number; }
interface FBMetrics { spend: string; impressions: string; clicks: string; reach: string; cpm: string; cpc: string; ctr: string; purchases: string; purchase_value: string; profit: string; roas: string; cpv: string; }

type TimeFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export default function Marketing() {
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [adSpendRecords, setAdSpendRecords] = useState<AdSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ date: '', amount: '' });
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [fbMetrics, setFbMetrics] = useState<FBMetrics | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbSyncedCount, setFbSyncedCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'facebook' | 'detail'>('overview');

  useEffect(() => {
    loadData();
    setFormData({ date: getTodayInBrazil(), amount: '' });
  }, []);

  useEffect(() => { loadData(); }, [timeFilter, customStartDate, customEndDate]);

  const getDateRange = () => {
    if (timeFilter === 'today') { const t = getTodayInBrazil(); return { start: t, end: t }; }
    if (timeFilter === 'yesterday') { const y = getYesterdayInBrazil(); return { start: y, end: y }; }
    if (timeFilter === 'week') return getWeekRangeInBrazil();
    if (timeFilter === 'month') return getMonthRangeInBrazil();
    if (timeFilter === 'custom' && customStartDate && customEndDate) return { start: customStartDate, end: customEndDate };
    return null;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      const [adSpendResult, salesResult] = await Promise.all([
        supabase.from('ad_spend').select('*').order('date', { ascending: false }),
        supabase.from('sales').select('id, sale_date, total_sale_price, profit, status').neq('status', 'cancelado')
      ]);
      const allAd = adSpendResult.data || [];
      const allSales = salesResult.data || [];
      let adSpendData = allAd;
      let salesData = allSales;
      if (dateRange) {
        adSpendData = allAd.filter(ad => isDateInRange(ad.date, dateRange.start, dateRange.end));
        salesData = allSales.filter(sale => isDateInRange(normalizeDateFromDB(sale.sale_date), dateRange.start, dateRange.end));
      }
      setAdSpendRecords(adSpendData);
      const allDates = new Set<string>();
      adSpendData.forEach(ad => allDates.add(ad.date));
      salesData.forEach(sale => allDates.add(normalizeDateFromDB(sale.sale_date)));
      const metrics: DailyMetrics[] = Array.from(allDates).map(dateStr => {
        const adSpend = adSpendData.find(ad => ad.date === dateStr)?.amount || 0;
        const daySales = salesData.filter(s => normalizeDateFromDB(s.sale_date) === dateStr);
        const revenue = daySales.reduce((s, x) => s + Number(x.total_sale_price), 0);
        const profit = daySales.reduce((s, x) => s + Number(x.profit), 0);
        const salesCount = daySales.length;
        return { date: dateStr, adSpend: Number(adSpend), revenue, profit, sales: salesCount, roas: adSpend > 0 ? revenue / Number(adSpend) : 0, roi: adSpend > 0 ? ((profit - Number(adSpend)) / Number(adSpend)) * 100 : 0, cpv: salesCount > 0 ? Number(adSpend) / salesCount : 0 };
      });
      metrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDailyMetrics(metrics);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const getFBPeriodPayload = () => {
    if (timeFilter === 'today') return { period: 'today' };
    if (timeFilter === 'yesterday') { const y = getYesterdayInBrazil(); return { period: 'custom', dateStart: y, dateEnd: y }; }
    if (timeFilter === 'week') return { period: 'week' };
    if (timeFilter === 'custom' && customStartDate && customEndDate) {
      return { period: 'custom', dateStart: customStartDate, dateEnd: customEndDate };
    }
    return { period: 'month' };
  };

  const loadFacebookData = useCallback(async () => {
    if (timeFilter === 'today') return;
    if (timeFilter === 'custom' && (!customStartDate || !customEndDate)) return;
    setFbLoading(true);
    setFbError(null);
    setFbSyncedCount(null);
    try {
      const payload = getFBPeriodPayload();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/facebook-ads`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setFbMetrics(data.metrics);
        if (data.dailySpend && data.dailySpend.length > 0) {
          const rows = data.dailySpend.map((d: { date: string; spend: number }) => ({
            date: d.date,
            amount: d.spend,
          }));
          const { error: upsertError } = await supabase
            .from('ad_spend')
            .upsert(rows, { onConflict: 'date' });
          if (upsertError) console.error('Erro ao salvar ad_spend:', upsertError.message);
          else {
            setFbSyncedCount(rows.length);
            loadData();
          }
        }
      } else {
        setFbError(data.error || 'Erro ao carregar dados do Facebook');
      }
    } catch { setFbError('Erro de conexão com Facebook Ads'); } finally { setFbLoading(false); }
  }, [timeFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (activeTab !== 'facebook') return;
    setFbMetrics(null);
    setFbSyncedCount(null);
    loadFacebookData();
  }, [activeTab, timeFilter, customStartDate, customEndDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await supabase.from('ad_spend').update({ amount: Number(formData.amount) }).eq('id', editingId);
      } else {
        await supabase.from('ad_spend').insert([{ date: formData.date, amount: Number(formData.amount) }]);
      }
      setFormData({ date: getTodayInBrazil(), amount: '' });
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (error) { alert('Erro ao salvar: ' + (error as Error).message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro?')) return;
    await supabase.from('ad_spend').delete().eq('id', id);
    await loadData();
  };

  const summary: PeriodSummary = (() => {
    if (!dailyMetrics.length) return { totalAdSpend: 0, totalRevenue: 0, totalProfit: 0, totalSales: 0, avgRoas: 0, avgRoi: 0, avgCpv: 0 };
    const totalAdSpend = dailyMetrics.reduce((s, d) => s + d.adSpend, 0);
    const totalRevenue = dailyMetrics.reduce((s, d) => s + d.revenue, 0);
    const totalProfit = dailyMetrics.reduce((s, d) => s + d.profit, 0);
    const totalSales = dailyMetrics.reduce((s, d) => s + d.sales, 0);
    return { totalAdSpend, totalRevenue, totalProfit, totalSales, avgRoas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0, avgRoi: totalAdSpend > 0 ? ((totalProfit - totalAdSpend) / totalAdSpend) * 100 : 0, avgCpv: totalSales > 0 ? totalAdSpend / totalSales : 0 };
  })();

  if (loading) return <div className="p-8 flex items-center justify-center h-64"><div className="text-white flex items-center gap-3"><RefreshCw size={20} className="animate-spin" /> Carregando...</div></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <TrendingUp size={32} className="text-orange-500" />
            Marketing / Tráfego Pago
          </h1>
          <p className="text-gray-400 text-sm mt-1">Métricas de performance e retorno sobre investimento</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ date: getTodayInBrazil(), amount: '' }); }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
          {showForm ? <X size={20} /> : <Plus size={20} />}
          {showForm ? 'Cancelar' : 'Adicionar Gasto'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">{editingId ? 'Editar Gasto' : 'Novo Gasto com Anúncios'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Data</label>
              <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500" required disabled={!!editingId} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Valor (R$)</label>
              <input type="number" step="0.01" min="0" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500" required />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors">
                {editingId ? 'Atualizar' : 'Adicionar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros de período */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <Calendar size={18} className="text-gray-400" />
          {(['today', 'yesterday', 'week', 'month', 'custom'] as TimeFilter[]).map(f => (
            <button key={f} onClick={() => { setTimeFilter(f); setFbMetrics(null); }}
              className={`px-4 py-2 rounded-lg transition-colors text-sm ${timeFilter === f ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {f === 'today' ? 'Hoje' : f === 'yesterday' ? 'Ontem' : f === 'week' ? 'Semana' : f === 'month' ? 'Mês' : 'Personalizado'}
            </button>
          ))}
          {timeFilter === 'custom' && (
            <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0">
              <DatePicker
                selected={customStartDate ? new Date(customStartDate + 'T12:00:00') : null}
                onChange={(date: Date | null) => setCustomStartDate(date ? date.toISOString().split('T')[0] : '')}
                selectsStart
                startDate={customStartDate ? new Date(customStartDate + 'T12:00:00') : null}
                endDate={customEndDate ? new Date(customEndDate + 'T12:00:00') : null}
                maxDate={new Date()}
                dateFormat="dd/MM/yyyy"
                locale={ptBR}
                placeholderText="Data início"
                className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-36 cursor-pointer"
              />
              <span className="text-gray-400 text-sm">até</span>
              <DatePicker
                selected={customEndDate ? new Date(customEndDate + 'T12:00:00') : null}
                onChange={(date: Date | null) => setCustomEndDate(date ? date.toISOString().split('T')[0] : '')}
                selectsEnd
                startDate={customStartDate ? new Date(customStartDate + 'T12:00:00') : null}
                endDate={customEndDate ? new Date(customEndDate + 'T12:00:00') : null}
                minDate={customStartDate ? new Date(customStartDate + 'T12:00:00') : undefined}
                maxDate={new Date()}
                dateFormat="dd/MM/yyyy"
                locale={ptBR}
                placeholderText="Data fim"
                className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-36 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-xl p-1 border border-gray-700 w-fit">
        {[
          { id: 'overview', label: 'Visão Geral', icon: BarChart2 },
          { id: 'facebook', label: 'Facebook Ads', icon: Activity },
          { id: 'detail', label: 'Detalhamento', icon: Target },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${activeTab === tab.id ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Gasto Total" value={`R$ ${summary.totalAdSpend.toFixed(2)}`} subtitle={`${summary.totalSales} vendas`} icon={DollarSign} color="red" />
            <StatCard title="Faturamento" value={`R$ ${summary.totalRevenue.toFixed(2)}`} subtitle="Receita bruta" icon={ShoppingCart} color="green" />
            <StatCard title="Lucro Total" value={`R$ ${summary.totalProfit.toFixed(2)}`} subtitle="Margem líquida" icon={TrendingUp} color="blue" />
            <StatCard title="ROAS Médio" value={`${summary.avgRoas.toFixed(2)}x`} subtitle={`ROI: ${summary.avgRoi.toFixed(0)}%`} icon={Target} color="orange" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(() => {
              const cpvCfg  = getCpvConfig(summary.avgCpv);
              const roiCfg  = getRoiConfig(summary.avgRoi);
              const roasCfg = getRoasConfig(summary.avgRoas);
              const hasData = summary.totalAdSpend > 0;
              return (<>
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">CPV Médio</p>
                  <p className={`text-2xl font-bold ${hasData ? cpvCfg.color : 'text-white'}`}>R$ {summary.avgCpv.toFixed(2)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-gray-500 text-xs">Custo por venda</p>
                    {hasData && cpvCfg.label && <span className={`text-xs font-semibold ${cpvCfg.color}`}>{cpvCfg.label}</span>}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">ROI</p>
                  <p className={`text-2xl font-bold ${hasData ? roiCfg.color : 'text-white'}`}>{summary.avgRoi.toFixed(0)}%</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-gray-500 text-xs">Retorno sobre investimento</p>
                    {hasData && <span className={`text-xs font-semibold ${roiCfg.color}`}>{roiCfg.label}</span>}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">ROAS</p>
                  <p className={`text-2xl font-bold ${hasData ? roasCfg.color : 'text-white'}`}>{summary.avgRoas.toFixed(2)}x</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-gray-500 text-xs">Retorno sobre gasto em ads</p>
                    {hasData && <span className={`text-xs font-semibold ${roasCfg.color}`}>{roasCfg.label}</span>}
                  </div>
                </div>
              </>);
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { title: 'Faturamento vs Gasto', data: dailyMetrics.slice(0, 10).reverse().map(d => ({ label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value1: d.revenue, value2: d.adSpend, color1: 'bg-green-500', color2: 'bg-red-500' })), label1: 'Faturamento', label2: 'Gasto', type: 'dual' },
              { title: 'Lucro vs Gasto', data: dailyMetrics.slice(0, 10).reverse().map(d => ({ label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value1: d.profit, value2: d.adSpend, color1: 'bg-blue-500', color2: 'bg-red-500' })), label1: 'Lucro', label2: 'Gasto', type: 'dual' },
            ].map((chart, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-base font-semibold text-white mb-4">{chart.title}</h3>
                {dailyMetrics.length === 0 ? <div className="text-gray-400 text-center py-8">Sem dados para o período</div> :
                  timeFilter === 'today' ? <div className="text-gray-500 text-sm text-center py-8">Sem dados suficientes para o gráfico — selecione Semana ou Mês para ver a evolução</div> :
                  <DualBarChart data={chart.data as Parameters<typeof DualBarChart>[0]['data']} height="h-56" label1={chart.label1} label2={chart.label2} />}
              </div>
            ))}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-base font-semibold text-white mb-4">ROAS ao Longo do Tempo</h3>
              {dailyMetrics.length === 0 ? <div className="text-gray-400 text-center py-8">Sem dados</div> :
                timeFilter === 'today' ? <div className="text-gray-500 text-sm text-center py-8">Sem dados suficientes para o gráfico — selecione Semana ou Mês para ver a evolução</div> :
                <BarChart data={dailyMetrics.slice(0, 10).reverse().map(d => ({ label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: d.roas, color: 'bg-orange-500' }))} height="h-56" />}
            </div>
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-base font-semibold text-white mb-4">Volume de Vendas</h3>
              {dailyMetrics.length === 0 ? <div className="text-gray-400 text-center py-8">Sem dados</div> :
                timeFilter === 'today' ? <div className="text-gray-500 text-sm text-center py-8">Sem dados suficientes para o gráfico — selecione Semana ou Mês para ver a evolução</div> :
                <BarChart data={dailyMetrics.slice(0, 10).reverse().map(d => ({ label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: d.sales, color: 'bg-green-500' }))} height="h-56" />}
            </div>
          </div>
        </>
      )}

      {/* TAB: FACEBOOK ADS */}
      {activeTab === 'facebook' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">f</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Facebook Ads — Dados em Tempo Real</h2>
                <p className="text-gray-400 text-xs">Sincronizado direto da sua conta de anúncios</p>
              </div>
            </div>
            {timeFilter !== 'today' && !(timeFilter === 'custom' && (!customStartDate || !customEndDate)) && (
              <button onClick={loadFacebookData} disabled={fbLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm disabled:opacity-50">
                <RefreshCw size={16} className={fbLoading ? 'animate-spin' : ''} />
                {fbLoading ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
          </div>

          {timeFilter === 'today' && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-5 flex items-start gap-3">
              <AlertCircle size={20} className="text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-yellow-300 font-medium text-sm">Dados do dia atual indisponíveis</p>
                <p className="text-yellow-400/70 text-xs mt-1">A API do Facebook atualiza os dados com algumas horas de delay. Selecione <strong>Semana</strong>, <strong>Mês</strong> ou <strong>Personalizado</strong> para ver os dados.</p>
              </div>
            </div>
          )}

          {timeFilter === 'custom' && (!customStartDate || !customEndDate) && (
            <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-5 flex items-start gap-3">
              <AlertCircle size={20} className="text-gray-400 mt-0.5 shrink-0" />
              <p className="text-gray-400 text-sm">Selecione a data de início e fim no filtro acima para carregar os dados.</p>
            </div>
          )}

          {fbLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={32} className="animate-spin text-blue-500" />
                <p className="text-gray-400">Buscando dados do Facebook Ads...</p>
              </div>
            </div>
          )}

          {fbSyncedCount !== null && !fbLoading && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-2" style={{ background: '#0a1a0a', border: '1px solid #0a2a0a' }}>
              <CheckCircle size={14} className="text-green-400" />
              <span className="text-sm text-green-400">{fbSyncedCount} dia{fbSyncedCount !== 1 ? 's' : ''} de gastos sincronizado{fbSyncedCount !== 1 ? 's' : ''} com o Supabase</span>
            </div>
          )}

          {fbError && !fbLoading && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-center">
              <p className="text-red-400 font-medium">{fbError}</p>
              <button onClick={loadFacebookData} className="mt-3 text-sm text-blue-400 hover:text-blue-300">Tentar novamente</button>
            </div>
          )}

          {fbMetrics && !fbLoading && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <FBCard title="Investimento" value={`R$ ${parseFloat(fbMetrics.spend).toFixed(2)}`} icon={DollarSign} color="red" subtitle="Gasto em anúncios" />
                <FBCard title="Faturamento" value={`R$ ${parseFloat(fbMetrics.purchase_value).toFixed(2)}`} icon={ShoppingCart} color="green" subtitle="Vendas no período" />
                <FBCard title="Lucro" value={`R$ ${parseFloat(fbMetrics.profit || '0').toFixed(2)}`} icon={TrendingUp} color="blue" subtitle="Receita - custos" />
                <FBCard title="Vendas" value={`${fbMetrics.purchases}`} icon={Target} color="orange" subtitle="Total de pedidos" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const roasCfg = getRoasConfig(parseFloat(fbMetrics.roas));
                  return (
                    <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 rounded-xl p-6 border border-orange-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Target size={24} className="text-orange-400" />
                          <h3 className="text-white font-semibold">ROAS</h3>
                        </div>
                        <span className={`text-sm font-bold ${roasCfg.color}`}>{roasCfg.label}</span>
                      </div>
                      <p className={`text-5xl font-bold ${roasCfg.color}`}>{parseFloat(fbMetrics.roas).toFixed(2)}x</p>
                      <p className="text-gray-400 text-sm mt-2">Para cada R$ 1 investido, você retornou R$ {parseFloat(fbMetrics.roas).toFixed(2)}</p>
                      <div className="mt-4 bg-gray-800/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Investimento total</p>
                        <p className="text-lg font-bold text-white">R$ {parseFloat(fbMetrics.spend).toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const cpvCfg = getCpvConfig(parseFloat(fbMetrics.cpv));
                  return (
                    <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 rounded-xl p-6 border border-blue-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <ShoppingCart size={24} className="text-blue-400" />
                          <h3 className="text-white font-semibold">Custo por Venda (CPV)</h3>
                        </div>
                        {cpvCfg.label && <span className={`text-sm font-bold ${cpvCfg.color}`}>{cpvCfg.label}</span>}
                      </div>
                      <p className={`text-5xl font-bold ${cpvCfg.color}`}>R$ {parseFloat(fbMetrics.cpv).toFixed(2)}</p>
                      <p className="text-gray-400 text-sm mt-2">Custo médio para gerar cada venda</p>
                      <div className="mt-4 bg-gray-800/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Total de vendas no período</p>
                        <p className="text-lg font-bold text-white">{fbMetrics.purchases} vendas</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

        </div>
      )}

      {/* TAB: DETALHAMENTO */}
      {activeTab === 'detail' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h3 className="text-base font-semibold text-white">Detalhamento Diário</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  {['Data', 'Gasto', 'Vendas', 'Faturamento', 'Lucro', 'ROAS', 'ROI', 'CPV', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {dailyMetrics.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-400">Nenhum registro encontrado</td></tr>
                ) : dailyMetrics.map(metric => {
                  const record = adSpendRecords.find(r => r.date === metric.date);
                  return (
                    <tr key={metric.date} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{formatDateDisplay(metric.date)}</td>
                      <td className="px-4 py-3 text-sm text-red-400 whitespace-nowrap">R$ {metric.adSpend.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{metric.sales}</td>
                      <td className="px-4 py-3 text-sm text-green-400 font-medium whitespace-nowrap">R$ {metric.revenue.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-blue-400 font-medium whitespace-nowrap">R$ {metric.profit.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${metric.roas > 0 ? getRoasConfig(metric.roas).color : 'text-gray-500'}`}>
                        {metric.roas > 0 ? `${metric.roas.toFixed(2)}x` : '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${metric.adSpend > 0 ? getRoiConfig(metric.roi).color : 'text-gray-500'}`}>
                        {metric.adSpend > 0 ? `${metric.roi.toFixed(0)}%` : '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${metric.cpv > 0 ? getCpvConfig(metric.cpv).color : 'text-gray-500'}`}>
                        {metric.cpv > 0 ? `R$ ${metric.cpv.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <div className="flex gap-2">
                          {record && <>
                            <button onClick={() => { setEditingId(record.id); setFormData({ date: record.date, amount: record.amount.toString() }); setShowForm(true); setActiveTab('overview'); }} className="text-blue-400 hover:text-blue-300"><Edit2 size={15} /></button>
                            <button onClick={() => handleDelete(record.id)} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getRoasConfig(roas: number): { color: string; label: string } {
  if (roas > 7)  return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (roas >= 6) return { color: 'text-green-400',   label: 'Ótimo ✅' };
  if (roas >= 5) return { color: 'text-green-300',   label: 'Bom' };
  if (roas >= 4) return { color: 'text-yellow-400',  label: 'OK' };
  return                { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

function getCpvConfig(cpv: number): { color: string; label: string } {
  if (cpv === 0)  return { color: 'text-gray-400',   label: '' };
  if (cpv < 40)   return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (cpv < 65)   return { color: 'text-green-400',   label: 'Bom ✅' };
  if (cpv < 75)   return { color: 'text-yellow-400',  label: 'OK' };
  return                 { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

function getRoiConfig(roi: number): { color: string; label: string } {
  if (roi > 200)  return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (roi >= 100) return { color: 'text-green-400',   label: 'Ótimo ✅' };
  if (roi >= 50)  return { color: 'text-yellow-400',  label: 'OK' };
  return                 { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

function StatCard({ title, value, subtitle, icon: Icon, color }: { title: string; value: string; subtitle: string; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = { orange: 'text-orange-500 bg-orange-500/10', green: 'text-green-500 bg-green-500/10', blue: 'text-blue-500 bg-blue-500/10', red: 'text-red-500 bg-red-500/10' };
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-lg ${colors[color]}`}><Icon size={18} /></div>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-gray-400">{subtitle}</p>
    </div>
  );
}

function FBCard({ title, value, icon: Icon, color, subtitle }: { title: string; value: string; icon: React.ElementType; color: string; subtitle?: string }) {
  const colors: Record<string, string> = { red: 'text-red-400 bg-red-500/10', blue: 'text-blue-400 bg-blue-500/10', green: 'text-green-400 bg-green-500/10', purple: 'text-purple-400 bg-purple-500/10', orange: 'text-orange-400 bg-orange-500/10', yellow: 'text-yellow-400 bg-yellow-500/10', cyan: 'text-cyan-400 bg-cyan-500/10' };
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[color]}`}><Icon size={14} /></div>
        <p className="text-gray-400 text-xs font-medium">{title}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}