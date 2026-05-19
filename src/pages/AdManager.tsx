import { useState, useEffect } from 'react';
import {
  Layers, RefreshCw, AlertCircle, Calendar, ChevronRight,
  Pause, Play, Image,
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';
import {
  getYesterdayInBrazil,
  getWeekRangeInBrazil,
  getMonthRangeInBrazil,
  getLastMonthRangeInBrazil,
} from '../lib/dateUtils';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Types ────────────────────────────────────────────────────────────────────

type Level      = 'campaign' | 'adset' | 'ad';
type TimeFilter = 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

interface AdItem {
  id: string;
  name: string;
  status: string;
  daily_budget:    string | null;
  lifetime_budget: string | null;
  spend:        string;
  impressions:  string;
  reach:        string;
  clicks:       string;
  cpm:          string;
  cpc:          string;
  ctr:          string;
  purchases:         number;
  initiate_checkout: number;
  purchase_value:    string;
  cost_per_purchase: string;
  // ad-only
  thumbnail_url?:  string | null;
  image_url?:      string | null;
  creative_body?:  string | null;
  creative_title?: string | null;
}

interface Crumb { id: string; name: string; level: Level; }

// ── Constants ────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<TimeFilter, string> = {
  yesterday:  'Ontem',
  week:       'Semana',
  month:      'Mês',
  last_month: 'Mês Anterior',
  custom:     'Personalizado',
};

const LEVEL_LABELS: Record<Level, string> = {
  campaign: 'Campanhas',
  adset:    'Conjuntos de Anúncios',
  ad:       'Anúncios',
};

type StatusCfg = { label: string; color: string; bg: string; border: string; dot: string };
const STATUS: Record<string, StatusCfg> = {
  ACTIVE:          { label: 'Ativo',          color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  dot: 'bg-green-400'  },
  PAUSED:          { label: 'Pausado',         color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-400' },
  CAMPAIGN_PAUSED: { label: 'Camp. Pausada',   color: 'text-yellow-500', bg: 'bg-yellow-500/5',  border: 'border-yellow-600/20', dot: 'bg-yellow-500' },
  ADSET_PAUSED:    { label: 'Conj. Pausado',   color: 'text-yellow-500', bg: 'bg-yellow-500/5',  border: 'border-yellow-600/20', dot: 'bg-yellow-500' },
  ARCHIVED:        { label: 'Arquivado',        color: 'text-gray-400',  bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   dot: 'bg-gray-400'   },
  DELETED:         { label: 'Excluído',         color: 'text-red-400',   bg: 'bg-red-500/10',    border: 'border-red-500/30',    dot: 'bg-red-400'    },
  IN_PROCESS:      { label: 'Processando',      color: 'text-blue-400',  bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   dot: 'bg-blue-400'   },
  WITH_ISSUES:     { label: 'Com problemas',    color: 'text-red-400',   bg: 'bg-red-500/10',    border: 'border-red-500/30',    dot: 'bg-red-400'    },
  PENDING_REVIEW:  { label: 'Em revisão',       color: 'text-blue-400',  bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   dot: 'bg-blue-400'   },
  DISAPPROVED:     { label: 'Reprovado',        color: 'text-red-400',   bg: 'bg-red-500/10',    border: 'border-red-500/30',    dot: 'bg-red-400'    },
};
const getStatus = (s: string): StatusCfg =>
  STATUS[s] ?? { label: s, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', dot: 'bg-gray-400' };

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtR = (v: string | number) =>
  `R$ ${parseFloat(String(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (v: string | number) =>
  parseInt(String(v)).toLocaleString('pt-BR');

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Metric({ label, value, color = 'text-white', sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${color} truncate`}>{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function ItemCard({
  item,
  level,
  onDrillDown,
  onToggle,
  toggling,
}: {
  item:        AdItem;
  level:       Level;
  onDrillDown: (item: AdItem) => void;
  onToggle:    (item: AdItem) => void;
  toggling:    string | null;
}) {
  const cfg          = getStatus(item.status);
  const canToggle    = item.status === 'ACTIVE' || item.status === 'PAUSED';
  const isPaused     = item.status === 'PAUSED';
  const isToggling   = toggling === item.id;
  const hasDrillDown = level !== 'ad';
  const budget       = item.daily_budget
    ? `${fmtR(item.daily_budget)}/dia`
    : item.lifetime_budget
    ? `${fmtR(item.lifetime_budget)} vitalício`
    : null;

  const thumbnail = item.thumbnail_url || item.image_url;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors">
      <div className="flex">
        {/* Creative thumbnail (ads only) */}
        {thumbnail && (
          <div className="w-28 flex-shrink-0 bg-gray-900 flex items-center justify-center overflow-hidden" style={{ minHeight: 112 }}>
            <img src={thumbnail} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        {!thumbnail && level === 'ad' && (
          <div className="w-28 flex-shrink-0 bg-gray-900/60 flex flex-col items-center justify-center gap-1" style={{ minHeight: 112 }}>
            <Image size={20} className="text-gray-600" />
            <span className="text-xs text-gray-600">Sem preview</span>
          </div>
        )}

        <div className="flex-1 min-w-0 p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <StatusBadge status={item.status} />
                {budget && (
                  <span className="text-xs text-gray-500 font-medium">{budget}</span>
                )}
              </div>
              {hasDrillDown ? (
                <button
                  onClick={() => onDrillDown(item)}
                  className="text-white font-semibold text-sm hover:text-orange-400 transition-colors text-left leading-snug flex items-center gap-1 group"
                >
                  <span className="truncate max-w-xs">{item.name}</span>
                  <ChevronRight size={14} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-orange-400" />
                </button>
              ) : (
                <p className="text-white font-semibold text-sm leading-snug truncate max-w-xs">{item.name}</p>
              )}
              {item.creative_title && (
                <p className="text-gray-500 text-xs mt-0.5 truncate">{item.creative_title}</p>
              )}
            </div>

            {canToggle && (
              <button
                onClick={() => onToggle(item)}
                disabled={isToggling}
                title={isPaused ? 'Ativar' : 'Pausar'}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  isPaused
                    ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20'
                }`}
              >
                {isToggling
                  ? <RefreshCw size={11} className="animate-spin" />
                  : isPaused ? <Play size={11} /> : <Pause size={11} />}
                {isPaused ? 'Ativar' : 'Pausar'}
              </button>
            )}
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-x-4 gap-y-2 pt-3 border-t border-gray-700/60">
            <Metric label="Gasto"       value={fmtR(item.spend)}       color="text-red-400" />
            <Metric label="Impressões"  value={fmtN(item.impressions)} />
            <Metric label="Alcance"     value={fmtN(item.reach)}       />
            <Metric label="Cliques"     value={fmtN(item.clicks)}      />
            <Metric label="CTR"         value={`${parseFloat(item.ctr).toFixed(2)}%`} color="text-blue-400" />
            <Metric label="CPM"         value={fmtR(item.cpm)}         />
            <Metric label="CPC"         value={fmtR(item.cpc)}         />
            <Metric label="Compras"     value={item.purchases > 0 ? item.purchases : '—'} color={item.purchases > 0 ? 'text-green-400' : 'text-gray-600'} />
            <Metric label="Rec. Pixel"  value={parseFloat(item.purchase_value) > 0 ? fmtR(item.purchase_value) : '—'} color={parseFloat(item.purchase_value) > 0 ? 'text-green-400' : 'text-gray-600'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdManager() {
  const [items,      setItems]      = useState<AdItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [toggling,   setToggling]   = useState<string | null>(null);

  // navigation
  const [level,       setLevel]       = useState<Level>('campaign');
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);

  // date filter
  const [timeFilter,   setTimeFilter]   = useState<TimeFilter>('week');
  const [customStart,  setCustomStart]  = useState('');
  const [customEnd,    setCustomEnd]    = useState('');

  // Load on mount and when date filter changes (at root level only)
  useEffect(() => {
    if (timeFilter === 'custom' && (!customStart || !customEnd)) return;
    // When date filter changes, reset to campaigns root
    setLevel('campaign');
    setBreadcrumbs([]);
    load('campaign', null);
  }, [timeFilter, customStart, customEnd]);

  const getDateRange = (): { since: string; until: string } | null => {
    if (timeFilter === 'yesterday') { const y = getYesterdayInBrazil(); return { since: y, until: y }; }
    if (timeFilter === 'week')      { const { start, end } = getWeekRangeInBrazil();      return { since: start, until: end }; }
    if (timeFilter === 'month')     { const { start, end } = getMonthRangeInBrazil();     return { since: start, until: end }; }
    if (timeFilter === 'last_month'){ const { start, end } = getLastMonthRangeInBrazil(); return { since: start, until: end }; }
    if (timeFilter === 'custom' && customStart && customEnd) return { since: customStart, until: customEnd };
    return null;
  };

  const load = async (lvl: Level, parentId: string | null) => {
    const dateRange = getDateRange();
    if (!dateRange) return;
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'list', level: lvl, dateRange, parentId }),
      });
      const data = await res.json();
      if (data.success) setItems(data.data || []);
      else setError(data.error || 'Erro ao carregar dados');
    } catch {
      setError('Erro de conexão com a API');
    } finally {
      setLoading(false);
    }
  };

  const drillDown = (item: AdItem) => {
    const nextLevel: Level = level === 'campaign' ? 'adset' : 'ad';
    setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name, level }]);
    setLevel(nextLevel);
    load(nextLevel, item.id);
  };

  const navigateTo = (crumbIndex: number) => {
    // crumbIndex = -1 → root (campaigns)
    // crumbIndex = 0  → adsets of breadcrumbs[0]
    if (crumbIndex === -1) {
      setBreadcrumbs([]);
      setLevel('campaign');
      load('campaign', null);
    } else {
      const newCrumbs = breadcrumbs.slice(0, crumbIndex + 1);
      const target    = newCrumbs[crumbIndex];
      const nextLevel: Level = target.level === 'campaign' ? 'adset' : 'ad';
      setBreadcrumbs(newCrumbs);
      setLevel(nextLevel);
      load(nextLevel, target.id);
    }
  };

  const handleToggle = async (item: AdItem) => {
    const targetStatus = item.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    setToggling(item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: targetStatus } : i));
    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'toggle', objectId: item.id, targetStatus }),
      });
      const data = await res.json();
      if (!data.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
        alert('Erro ao alterar status: ' + (data.error || 'Erro desconhecido'));
      }
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
      alert('Erro de conexão');
    } finally {
      setToggling(null);
    }
  };

  const canRefresh = timeFilter !== 'custom' || (!!customStart && !!customEnd);
  const parentId   = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].id : null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Layers size={32} className="text-orange-500" />
            Gerenciador de Anúncios
          </h1>
          <p className="text-gray-400 text-sm mt-1">Meta Ads · Navegação em cascata</p>
        </div>
        <button
          onClick={() => load(level, parentId)}
          disabled={loading || !canRefresh}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Sincronizar
        </button>
      </div>

      {/* ── Date filter ── */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-5">
        <div className="flex flex-wrap gap-2 items-center">
          <Calendar size={16} className="text-gray-500" />
          {(Object.keys(FILTER_LABELS) as TimeFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeFilter === f ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          {timeFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <DatePicker
                selected={customStart ? new Date(customStart + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomStart(d ? d.toISOString().split('T')[0] : '')}
                selectsStart startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Início"
                className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer"
              />
              <span className="text-gray-500 text-sm">até</span>
              <DatePicker
                selected={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomEnd(d ? d.toISOString().split('T')[0] : '')}
                selectsEnd startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                minDate={customStart ? new Date(customStart + 'T12:00:00') : undefined}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Fim"
                className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        <button
          onClick={() => navigateTo(-1)}
          className={`text-sm font-medium transition-colors ${level === 'campaign' ? 'text-white cursor-default' : 'text-gray-400 hover:text-orange-400'}`}
          disabled={level === 'campaign'}
        >
          Campanhas
        </button>
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1 && level !== 'ad';
          return (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight size={14} className="text-gray-600" />
              <button
                onClick={() => !isLast && navigateTo(i)}
                className={`text-sm font-medium transition-colors max-w-[200px] truncate ${
                  isLast || level === 'ad'
                    ? 'text-white cursor-default'
                    : 'text-gray-400 hover:text-orange-400'
                }`}
                title={crumb.name}
                disabled={isLast || level === 'ad'}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}
        {level !== 'campaign' && (
          <span className="flex items-center gap-1.5">
            <ChevronRight size={14} className="text-gray-600" />
            <span className="text-sm font-medium text-white">{LEVEL_LABELS[level]}</span>
          </span>
        )}
        <span className="ml-auto text-xs text-gray-600">
          {!loading && items.length > 0 && `${items.length} ${LEVEL_LABELS[level].toLowerCase()}`}
        </span>
      </div>

      {/* ── States ── */}
      {timeFilter === 'custom' && (!customStart || !customEnd) && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-gray-400 text-sm">Selecione as datas de início e fim para carregar os dados.</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw size={28} className="animate-spin text-orange-500" />
          <p className="text-gray-400 text-sm">Carregando {LEVEL_LABELS[level].toLowerCase()}...</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6 text-center">
          <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-400 font-medium text-sm">{error}</p>
          <button onClick={() => load(level, parentId)} className="mt-3 text-xs text-blue-400 hover:text-blue-300">
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Items ── */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              level={level}
              onDrillDown={drillDown}
              onToggle={handleToggle}
              toggling={toggling}
            />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && canRefresh && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-14 text-center">
          <Layers size={36} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Nenhum resultado encontrado para o período selecionado.</p>
        </div>
      )}
    </div>
  );
}
