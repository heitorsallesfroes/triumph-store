import { useState, useEffect, useRef } from 'react';
import {
  Layers, RefreshCw, AlertCircle, Calendar, ChevronRight,
  Pause, Play, Image, Pencil, Check, X,
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

// ── Types ─────────────────────────────────────────────────────────────────────

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
  thumbnail_url?:  string | null;
  image_url?:      string | null;
  creative_body?:  string | null;
  creative_title?: string | null;
}

interface Crumb { id: string; name: string; level: Level; }

// ── Config ───────────────────────────────────────────────────────────────────

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

type StatusCfg = { label: string; dot: string; text: string; bg: string; border: string };
const STATUS_MAP: Record<string, StatusCfg> = {
  ACTIVE:          { label: 'Ativo',          dot: '#22c55e', text: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)'   },
  PAUSED:          { label: 'Pausado',         dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
  CAMPAIGN_PAUSED: { label: 'Camp. Pausada',   dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.18)' },
  ADSET_PAUSED:    { label: 'Conj. Pausado',   dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.18)' },
  PENDING_REVIEW:  { label: 'Em revisão',      dot: '#eab308', text: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.25)'   },
  IN_PROCESS:      { label: 'Processando',     dot: '#eab308', text: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.25)'   },
  WITH_ISSUES:     { label: 'Com problemas',   dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  DISAPPROVED:     { label: 'Reprovado',       dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  ARCHIVED:        { label: 'Arquivado',       dot: '#374151', text: '#6b7280', bg: 'rgba(55,65,81,0.08)',    border: 'rgba(55,65,81,0.25)'    },
  DELETED:         { label: 'Excluído',        dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
};
const getStatusCfg = (s: string): StatusCfg =>
  STATUS_MAP[s] ?? { label: s, dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' };

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtR = (v: string | number) =>
  `R$ ${parseFloat(String(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (v: string | number) => {
  const n = parseInt(String(v));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('pt-BR');
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusCfg(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 99,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.text, fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function BigMetric({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function SmallMetric({ label, value, color = '#aaa' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function ItemCard({
  item, level, onDrillDown, onToggle, toggling,
  editingBudget, onEditBudget, onSaveBudget, onCancelBudget, savingBudget,
}: {
  item: AdItem; level: Level;
  onDrillDown: (item: AdItem) => void;
  onToggle:    (item: AdItem) => void;
  toggling:    string | null;
  editingBudget: { id: string; value: string } | null;
  onEditBudget:  (item: AdItem) => void;
  onSaveBudget:  (itemId: string, value: string) => void;
  onCancelBudget: () => void;
  savingBudget:  string | null;
}) {
  const cfg        = getStatusCfg(item.status);
  const canToggle  = item.status === 'ACTIVE' || item.status === 'PAUSED';
  const isPaused   = item.status === 'PAUSED';
  const isToggling = toggling === item.id;
  const isDrillable = level !== 'ad';
  const isActive   = item.status === 'ACTIVE';

  const hasBudget  = item.daily_budget !== null || item.lifetime_budget !== null;
  const budgetVal  = item.daily_budget ?? item.lifetime_budget;
  const budgetType = item.daily_budget !== null ? '/dia' : ' vitalício';
  const canEditBudget = level === 'adset';

  const isEditingThis = editingBudget?.id === item.id;
  const isSavingThis  = savingBudget === item.id;

  const thumbnail = item.thumbnail_url || item.image_url;
  const spend    = parseFloat(item.spend);
  const pValue   = parseFloat(item.purchase_value);
  const ctr      = parseFloat(item.ctr);
  const cpc      = parseFloat(item.cpc);
  const cpm      = parseFloat(item.cpm);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isEditingThis) inputRef.current?.select(); }, [isEditingThis]);

  const cardStyle: React.CSSProperties = {
    background: '#0f0f0f',
    border: `1px solid ${isActive ? 'rgba(249,115,22,0.2)' : '#1e1e1e'}`,
    borderRadius: 16,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex' }}>
        {/* Thumbnail (ads) */}
        {level === 'ad' && (
          <div style={{ width: 120, flexShrink: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
            {thumbnail ? (
              <img src={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Image size={22} color="#333" />
                <span style={{ fontSize: 10, color: '#333' }}>Sem preview</span>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Card header bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px 10px', borderBottom: '1px solid #161616' }}>
            {/* Left: status + budget */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={item.status} />

              {hasBudget && !isEditingThis && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>
                    {budgetVal ? fmtR(budgetVal) : '—'}{budgetType}
                  </span>
                  {canEditBudget && (
                    <button
                      onClick={() => onEditBudget(item)}
                      title="Editar orçamento"
                      style={{ padding: '2px 4px', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#444', lineHeight: 1 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#444')}
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              )}

              {isEditingThis && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#555' }}>R$</span>
                  <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    min="1"
                    defaultValue={editingBudget?.value ?? ''}
                    onChange={e => { if (editingBudget) editingBudget.value = e.target.value; }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onSaveBudget(item.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') onCancelBudget();
                    }}
                    style={{
                      width: 80, padding: '3px 8px', borderRadius: 8, fontSize: 12,
                      background: '#1a1a1a', border: '1px solid #f97316', color: '#fff', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#555' }}>/dia</span>
                  <button
                    onClick={() => onSaveBudget(item.id, inputRef.current?.value ?? '')}
                    disabled={isSavingThis}
                    style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer', lineHeight: 1 }}
                  >
                    {isSavingThis ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                  </button>
                  <button
                    onClick={onCancelBudget}
                    style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', lineHeight: 1 }}
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Right: toggle */}
            {canToggle && (
              <button
                onClick={() => onToggle(item)}
                disabled={isToggling}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: isToggling ? 'not-allowed' : 'pointer', opacity: isToggling ? 0.5 : 1,
                  background: isPaused ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                  border: isPaused ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(107,114,128,0.25)',
                  color: isPaused ? '#22c55e' : '#9ca3af',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {isToggling
                  ? <RefreshCw size={11} className="animate-spin" />
                  : isPaused ? <Play size={11} /> : <Pause size={11} />}
                {isPaused ? 'Ativar' : 'Pausar'}
              </button>
            )}
          </div>

          {/* Name */}
          <div style={{ padding: '12px 18px 14px' }}>
            {isDrillable ? (
              <button
                onClick={() => onDrillDown(item)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', lineHeight: 1.3 }}>{item.name}</span>
                <ChevronRight size={15} color="#f97316" style={{ flexShrink: 0, opacity: 0.6 }} />
              </button>
            ) : (
              <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', lineHeight: 1.3 }}>{item.name}</p>
            )}
            {item.creative_title && (
              <p style={{ fontSize: 12, color: '#444', marginTop: 4 }}>{item.creative_title}</p>
            )}
          </div>

          {/* Metrics */}
          <div style={{ borderTop: '1px solid #141414', padding: '14px 18px' }}>
            {/* Big 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 16 }}>
              <BigMetric label="Gasto" value={spend > 0 ? fmtR(item.spend) : '—'} color="#f97316" />
              <BigMetric label="Compras" value={item.purchases > 0 ? String(item.purchases) : '—'} color={item.purchases > 0 ? '#22c55e' : '#333'} />
              <BigMetric label="Receita Pixel" value={pValue > 0 ? fmtR(item.purchase_value) : '—'} color={pValue > 0 ? '#22c55e' : '#333'} />
            </div>
            {/* Small 6 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, paddingTop: 14, borderTop: '1px solid #161616' }}>
              <SmallMetric label="Impressões" value={fmtN(item.impressions)} />
              <SmallMetric label="Alcance"    value={fmtN(item.reach)} />
              <SmallMetric label="Cliques"    value={fmtN(item.clicks)} />
              <SmallMetric label="CTR"        value={`${ctr.toFixed(2)}%`} color={ctr >= 2 ? '#60a5fa' : '#aaa'} />
              <SmallMetric label="CPM"        value={cpm > 0 ? fmtR(item.cpm) : '—'} />
              <SmallMetric label="CPC"        value={cpc > 0 ? fmtR(item.cpc) : '—'} />
            </div>
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
  const [editingBudget, setEditingBudget] = useState<{ id: string; value: string } | null>(null);
  const [savingBudget,  setSavingBudget]  = useState<string | null>(null);

  const [level,       setLevel]       = useState<Level>('campaign');
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);

  const [timeFilter,  setTimeFilter]  = useState<TimeFilter>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  useEffect(() => {
    if (timeFilter === 'custom' && (!customStart || !customEnd)) return;
    setLevel('campaign');
    setBreadcrumbs([]);
    setEditingBudget(null);
    load('campaign', null);
  }, [timeFilter, customStart, customEnd]);

  const getDateRange = () => {
    if (timeFilter === 'yesterday')  { const y = getYesterdayInBrazil(); return { since: y, until: y }; }
    if (timeFilter === 'week')       { const { start, end } = getWeekRangeInBrazil();      return { since: start, until: end }; }
    if (timeFilter === 'month')      { const { start, end } = getMonthRangeInBrazil();     return { since: start, until: end }; }
    if (timeFilter === 'last_month') { const { start, end } = getLastMonthRangeInBrazil(); return { since: start, until: end }; }
    if (timeFilter === 'custom' && customStart && customEnd) return { since: customStart, until: customEnd };
    return null;
  };

  const call = (body: object) =>
    fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const load = async (lvl: Level, parentId: string | null) => {
    const dateRange = getDateRange();
    if (!dateRange) return;
    setLoading(true);
    setError(null);
    setItems([]);
    setEditingBudget(null);
    try {
      const res  = await call({ action: 'list', level: lvl, dateRange, parentId });
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
      const res  = await call({ action: 'toggle', objectId: item.id, targetStatus });
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

  const handleEditBudget = (item: AdItem) => {
    setEditingBudget({ id: item.id, value: item.daily_budget ?? '' });
  };

  const handleSaveBudget = async (itemId: string, rawValue: string) => {
    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { alert('Valor de orçamento inválido.'); return; }
    const original = items.find(i => i.id === itemId)?.daily_budget;
    setEditingBudget(null);
    setSavingBudget(itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, daily_budget: parsed.toFixed(2) } : i));
    try {
      const res  = await call({ action: 'update_budget', objectId: itemId, dailyBudget: parsed });
      const data = await res.json();
      if (!data.success) {
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, daily_budget: original ?? null } : i));
        alert('Erro ao atualizar orçamento: ' + (data.error || 'Erro desconhecido'));
      }
    } catch {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, daily_budget: original ?? null } : i));
      alert('Erro de conexão');
    } finally {
      setSavingBudget(null);
    }
  };

  const canRefresh = timeFilter !== 'custom' || (!!customStart && !!customEnd);
  const parentId   = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].id : null;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <Layers size={28} color="#f97316" />
            Gerenciador de Anúncios
          </h1>
          <p style={{ color: '#555', fontSize: 13, marginTop: 6 }}>Meta Ads · Navegação em cascata</p>
        </div>
        <button
          onClick={() => load(level, parentId)}
          disabled={loading || !canRefresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#bbb',
            cursor: loading || !canRefresh ? 'not-allowed' : 'pointer',
            opacity: loading || !canRefresh ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Sincronizar
        </button>
      </div>

      {/* ── Date filter ── */}
      <div style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Calendar size={15} color="#444" />
          {(Object.keys(FILTER_LABELS) as TimeFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: timeFilter === f ? '#f97316' : '#161616',
                border: timeFilter === f ? '1px solid #f97316' : '1px solid #222',
                color: timeFilter === f ? '#fff' : '#888',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          {timeFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DatePicker
                selected={customStart ? new Date(customStart + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomStart(d ? d.toISOString().split('T')[0] : '')}
                selectsStart startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Início"
                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer"
              />
              <span style={{ color: '#444', fontSize: 12 }}>até</span>
              <DatePicker
                selected={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomEnd(d ? d.toISOString().split('T')[0] : '')}
                selectsEnd startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                minDate={customStart ? new Date(customStart + 'T12:00:00') : undefined}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Fim"
                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigateTo(-1)}
          disabled={level === 'campaign'}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: level === 'campaign' ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 600, color: level === 'campaign' ? '#fff' : '#666',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (level !== 'campaign') (e.currentTarget as HTMLElement).style.color = '#f97316'; }}
          onMouseLeave={e => { if (level !== 'campaign') (e.currentTarget as HTMLElement).style.color = '#666'; }}
        >
          Campanhas
        </button>

        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1 && level !== 'ad';
          return (
            <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={13} color="#333" />
              <button
                onClick={() => !isLast && navigateTo(i)}
                disabled={isLast || level === 'ad'}
                title={crumb.name}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: isLast || level === 'ad' ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: isLast || level === 'ad' ? '#fff' : '#666',
                  maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!isLast && level !== 'ad') (e.currentTarget as HTMLElement).style.color = '#f97316'; }}
                onMouseLeave={e => { if (!isLast && level !== 'ad') (e.currentTarget as HTMLElement).style.color = '#666'; }}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}

        {level !== 'campaign' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={13} color="#333" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{LEVEL_LABELS[level]}</span>
          </span>
        )}

        {!loading && items.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#444' }}>
            {items.length} {LEVEL_LABELS[level].toLowerCase()}
          </span>
        )}
      </div>

      {/* ── States ── */}
      {timeFilter === 'custom' && (!customStart || !customEnd) && (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '18px 22px', display: 'flex', gap: 12 }}>
          <AlertCircle size={17} color="#555" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: '#666', fontSize: 13, margin: 0 }}>Selecione as datas de início e fim para carregar os dados.</p>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 14 }}>
          <RefreshCw size={28} color="#f97316" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#555', fontSize: 13, margin: 0 }}>Carregando {LEVEL_LABELS[level].toLowerCase()}...</p>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <AlertCircle size={24} color="#ef4444" style={{ margin: '0 auto 10px' }} />
          <p style={{ color: '#ef4444', fontSize: 14, margin: '0 0 10px' }}>{error}</p>
          <button onClick={() => load(level, parentId)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Items ── */}
      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              level={level}
              onDrillDown={drillDown}
              onToggle={handleToggle}
              toggling={toggling}
              editingBudget={editingBudget}
              onEditBudget={handleEditBudget}
              onSaveBudget={handleSaveBudget}
              onCancelBudget={() => setEditingBudget(null)}
              savingBudget={savingBudget}
            />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && canRefresh && (
        <div style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 16, padding: '60px 20px', textAlign: 'center' }}>
          <Layers size={36} color="#2a2a2a" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: '#444', fontSize: 13, margin: 0 }}>Nenhum resultado encontrado para o período selecionado.</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
