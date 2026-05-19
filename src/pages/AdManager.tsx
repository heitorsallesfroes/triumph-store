import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, Layers, Calendar } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';
import { getYesterdayInBrazil, getLastMonthRangeInBrazil } from '../lib/dateUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface FBCampaign {
  campaign_name: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  cpm: string;
  cpc: string;
  ctr: string;
  purchases: number;
  initiate_checkout: number;
  purchase_value: string;
  cost_per_purchase: string;
}

type TimeFilter = 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

const FILTER_LABELS: Record<TimeFilter, string> = {
  yesterday:  'Ontem',
  week:       'Semana',
  month:      'Mês',
  last_month: 'Mês Anterior',
  custom:     'Personalizado',
};

export default function AdManager() {
  const [campaigns, setCampaigns] = useState<FBCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    if (timeFilter === 'custom' && (!customStartDate || !customEndDate)) return;
    loadCampaigns();
  }, [timeFilter, customStartDate, customEndDate]);

  const getPayload = () => {
    if (timeFilter === 'yesterday') {
      const y = getYesterdayInBrazil();
      return { period: 'custom', dateStart: y, dateEnd: y };
    }
    if (timeFilter === 'week') return { period: 'week' };
    if (timeFilter === 'month') return { period: 'month' };
    if (timeFilter === 'last_month') {
      const { start, end } = getLastMonthRangeInBrazil();
      return { period: 'custom', dateStart: start, dateEnd: end };
    }
    if (timeFilter === 'custom' && customStartDate && customEndDate) {
      return { period: 'custom', dateStart: customStartDate, dateEnd: customEndDate };
    }
    return null;
  };

  const loadCampaigns = async () => {
    const payload = getPayload();
    if (!payload) return;
    setLoading(true);
    setError(null);
    setCampaigns([]);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/facebook-ads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns || []);
      } else {
        setError(data.error || 'Erro ao carregar dados do Facebook Ads');
      }
    } catch {
      setError('Erro de conexão com a API do Facebook Ads');
    } finally {
      setLoading(false);
    }
  };

  const fmt  = (v: string) => `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtN = (v: string) => parseInt(v).toLocaleString('pt-BR');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Layers size={32} className="text-orange-500" />
            Gerenciador de Anúncios
          </h1>
          <p className="text-gray-400 text-sm mt-1">Performance por campanha — Meta Ads</p>
        </div>
        <button
          onClick={loadCampaigns}
          disabled={loading || (timeFilter === 'custom' && (!customStartDate || !customEndDate))}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <Calendar size={18} className="text-gray-400" />
          {(Object.keys(FILTER_LABELS) as TimeFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`px-4 py-2 rounded-lg transition-colors text-sm ${timeFilter === f ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {FILTER_LABELS[f]}
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

      {/* Custom sem datas */}
      {timeFilter === 'custom' && (!customStartDate || !customEndDate) && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle size={20} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-gray-400 text-sm">Selecione a data de início e fim acima para carregar os dados.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="animate-spin text-orange-500" />
            <p className="text-gray-400">Buscando dados de campanhas...</p>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && !loading && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-center mb-6">
          <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-400 font-medium">{error}</p>
          <button onClick={loadCampaigns} className="mt-3 text-sm text-blue-400 hover:text-blue-300">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela */}
      {!loading && !error && campaigns.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center gap-2">
            <Layers size={16} className="text-orange-500" />
            <h3 className="text-base font-semibold text-white">Performance por Campanha</h3>
            <span className="ml-auto text-xs text-gray-500">
              {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''} · ordenado por gasto
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700/50">
                <tr>
                  {['Campanha', 'Gasto', 'Impressões', 'Alcance', 'Cliques', 'CTR', 'CPM', 'CPC', 'Compras', 'Checkouts', 'Receita (Pixel)', 'CPV (Pixel)'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {campaigns.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium max-w-xs">
                      <span className="block truncate" title={c.campaign_name}>{c.campaign_name}</span>
                    </td>
                    <td className="px-4 py-3 text-red-400 font-semibold whitespace-nowrap">{fmt(c.spend)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtN(c.impressions)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtN(c.reach)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtN(c.clicks)}</td>
                    <td className="px-4 py-3 text-blue-400 whitespace-nowrap">{parseFloat(c.ctr).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmt(c.cpm)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmt(c.cpc)}</td>
                    <td className="px-4 py-3 text-green-400 font-semibold whitespace-nowrap">
                      {c.purchases > 0 ? c.purchases : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-orange-400 whitespace-nowrap">
                      {c.initiate_checkout > 0 ? c.initiate_checkout : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-green-400 whitespace-nowrap">
                      {parseFloat(c.purchase_value) > 0 ? fmt(c.purchase_value) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-white whitespace-nowrap">
                      {parseFloat(c.cost_per_purchase) > 0 ? fmt(c.cost_per_purchase) : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-600 bg-gray-700/30">
                <tr>
                  <td className="px-4 py-3 text-gray-400 text-xs font-semibold uppercase">Total</td>
                  <td className="px-4 py-3 text-red-400 font-bold whitespace-nowrap">
                    {`R$ ${campaigns.reduce((s, c) => s + parseFloat(c.spend), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {campaigns.reduce((s, c) => s + parseInt(c.impressions), 0).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {campaigns.reduce((s, c) => s + parseInt(c.reach), 0).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {campaigns.reduce((s, c) => s + parseInt(c.clicks), 0).toLocaleString('pt-BR')}
                  </td>
                  <td colSpan={3} />
                  <td className="px-4 py-3 text-green-400 font-bold whitespace-nowrap">
                    {campaigns.reduce((s, c) => s + c.purchases, 0)}
                  </td>
                  <td className="px-4 py-3 text-orange-400 font-bold whitespace-nowrap">
                    {campaigns.reduce((s, c) => s + c.initiate_checkout, 0)}
                  </td>
                  <td className="px-4 py-3 text-green-400 font-bold whitespace-nowrap">
                    {`R$ ${campaigns.reduce((s, c) => s + parseFloat(c.purchase_value), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sem dados */}
      {!loading && !error && campaigns.length === 0 && !(timeFilter === 'custom' && (!customStartDate || !customEndDate)) && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <Layers size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Nenhuma campanha encontrada para o período</p>
        </div>
      )}
    </div>
  );
}
