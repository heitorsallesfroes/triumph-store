import { useState, useEffect, useRef } from 'react';
import {
  Layers, RefreshCw, AlertCircle, Calendar, ChevronRight,
  Pause, Play, Image, Pencil, Check, X, TrendingDown,
  DollarSign, ShoppingCart, TrendingUp, Target, BarChart2,
  CheckSquare, Square,
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';
import {
  getTodayInBrazil,
  getYesterdayInBrazil,
  getWeekRangeInBrazil,
  getMonthRangeInBrazil,
  getLastMonthRangeInBrazil,
} from '../lib/dateUtils';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

type Level      = 'campaign' | 'adset' | 'ad';
type TimeFilter = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

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

interface ConfirmModal { title: string; body: string; onConfirm: () => void; }

// ── Config ───────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<TimeFilter, string> = {
  today:      'Hoje',
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
  ACTIVE:          { label: 'Ativo',        dot: '#22c55e', text: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)'   },
  PAUSED:          { label: 'Pausado',       dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
  CAMPAIGN_PAUSED: { label: 'Camp. Pausada', dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.18)' },
  ADSET_PAUSED:    { label: 'Conj. Pausado', dot: '#6b7280', text: '#9ca3af', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.18)' },
  PENDING_REVIEW:  { label: 'Em revisão',    dot: '#eab308', text: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.25)'   },
  IN_PROCESS:      { label: 'Processando',   dot: '#eab308', text: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.25)'   },
  WITH_ISSUES:     { label: 'Com problemas', dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  DISAPPROVED:     { label: 'Reprovado',     dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  ARCHIVED:        { label: 'Arquivado',     dot: '#374151', text: '#6b7280', bg: 'rgba(55,65,81,0.08)',    border: 'rgba(55,65,81,0.25)'    },
  DELETED:         { label: 'Excluído',      dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
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

function BigMetric({ label, value, color = 'var(--text-primary)' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function SmallMetric({ label, value, color = 'var(--text-secondary)' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

function SummaryCard({
  label, value, sub, color = 'var(--text-primary)', icon: Icon,
}: {
  label: string; value: string; sub?: string; color?: string;
  icon?: React.ElementType;
}) {
  return (
    <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
        {Icon && <Icon size={15} color="var(--text-muted)" />}
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>{sub}</p>}
    </div>
  );
}

function ItemCard({
  item, level, onDrillDown, onToggle, toggling,
  editingBudget, onEditBudget, onSaveBudget, onCancelBudget, savingBudget,
  selected, onSelect,
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
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const cfg        = getStatusCfg(item.status);
  const canToggle  = item.status === 'ACTIVE' || item.status === 'PAUSED';
  const isPaused   = item.status === 'PAUSED';
  const isToggling = toggling === item.id;
  const isDrillable = level !== 'ad';
  const isActive   = item.status === 'ACTIVE';

  const hasBudget     = item.daily_budget !== null || item.lifetime_budget !== null;
  const budgetVal     = item.daily_budget ?? item.lifetime_budget;
  const budgetType    = item.daily_budget !== null ? '/dia' : ' vitalício';
  const canEditBudget = level === 'adset' || (level === 'campaign' && hasBudget);

  const isEditingThis = editingBudget?.id === item.id;
  const isSavingThis  = savingBudget === item.id;
  const showCheckbox  = level === 'campaign';

  const thumbnail = item.thumbnail_url || item.image_url;
  const spend    = parseFloat(item.spend);
  const pValue   = parseFloat(item.purchase_value);
  const ctr      = parseFloat(item.ctr);
  const cpc      = parseFloat(item.cpc);
  const cpm      = parseFloat(item.cpm);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isEditingThis) inputRef.current?.select(); }, [isEditingThis]);

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: `1px solid ${selected ? '#f97316' : isActive ? 'rgba(249,115,22,0.35)' : 'var(--border-main)'}`,
    borderRadius: 16,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex' }}>
        {/* Checkbox strip (campaign level only) */}
        {showCheckbox && (
          <button
            onClick={() => onSelect?.(item.id)}
            style={{
              width: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: selected ? 'rgba(249,115,22,0.08)' : 'transparent',
              borderRight: '1px solid var(--border-main)',
              cursor: 'pointer', border: 'none', borderRight: '1px solid var(--border-main)',
            }}
          >
            {selected
              ? <CheckSquare size={16} color="#f97316" />
              : <Square size={16} color="var(--text-muted)" />}
          </button>
        )}

        {level === 'ad' && (
          <div style={{ width: 120, flexShrink: 0, background: 'var(--bg-inner)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
            {thumbnail ? (
              <img src={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Image size={22} color="var(--text-muted)" />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sem preview</span>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px 10px', borderBottom: '1px solid var(--border-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={item.status} />
              {!isEditingThis && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {hasBudget && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {budgetVal ? fmtR(budgetVal) : '—'}{budgetType}
                    </span>
                  )}
                  {canEditBudget && (
                    <button onClick={() => onEditBudget(item)} title={hasBudget ? 'Editar orçamento' : 'Definir orçamento diário'}
                      style={{ padding: '2px 4px', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              )}
              {isEditingThis && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>R$</span>
                  <input ref={inputRef} type="number" step="0.01" min="1"
                    defaultValue={editingBudget?.value ?? ''}
                    onChange={e => { if (editingBudget) editingBudget.value = e.target.value; }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onSaveBudget(item.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') onCancelBudget();
                    }}
                    style={{ width: 80, padding: '3px 8px', borderRadius: 8, fontSize: 12, background: 'var(--bg-inner)', border: '1px solid #f97316', color: 'var(--text-primary)', outline: 'none' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/dia</span>
                  <button onClick={() => onSaveBudget(item.id, inputRef.current?.value ?? '')} disabled={isSavingThis}
                    style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer', lineHeight: 1 }}>
                    {isSavingThis ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                  </button>
                  <button onClick={onCancelBudget}
                    style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', lineHeight: 1 }}>
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>
            {canToggle && (
              <button onClick={() => onToggle(item)} disabled={isToggling}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: isToggling ? 'not-allowed' : 'pointer', opacity: isToggling ? 0.5 : 1,
                  background: isPaused ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                  border: isPaused ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(107,114,128,0.25)',
                  color: isPaused ? '#22c55e' : '#9ca3af', transition: 'all 0.15s', flexShrink: 0,
                }}>
                {isToggling ? <RefreshCw size={11} className="animate-spin" /> : isPaused ? <Play size={11} /> : <Pause size={11} />}
                {isPaused ? 'Ativar' : 'Pausar'}
              </button>
            )}
          </div>

          {/* Name */}
          <div style={{ padding: '12px 18px 14px' }}>
            {isDrillable ? (
              <button onClick={() => onDrillDown(item)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.name}</span>
                <ChevronRight size={15} color="#f97316" style={{ flexShrink: 0, opacity: 0.6 }} />
              </button>
            ) : (
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.name}</p>
            )}
            {item.creative_title && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.creative_title}</p>}
          </div>

          {/* Metrics */}
          <div style={{ borderTop: '1px solid var(--border-main)', padding: '14px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 16 }}>
              <BigMetric label="Gasto"        value={spend > 0 ? fmtR(item.spend) : '—'} color="#f97316" />
              <BigMetric label="Compras"      value={item.purchases > 0 ? String(item.purchases) : '—'} color={item.purchases > 0 ? '#22c55e' : 'var(--text-muted)'} />
              <BigMetric label="Receita Pixel" value={pValue > 0 ? fmtR(item.purchase_value) : '—'} color={pValue > 0 ? '#22c55e' : 'var(--text-muted)'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 14, paddingTop: 14, borderTop: '1px solid var(--border-main)' }}>
              <SmallMetric label="Impressões" value={fmtN(item.impressions)} />
              <SmallMetric label="Alcance"    value={fmtN(item.reach)} />
              <SmallMetric label="Cliques"    value={fmtN(item.clicks)} />
              <SmallMetric label="CTR"        value={`${ctr.toFixed(2)}%`} color={ctr >= 2 ? '#60a5fa' : 'var(--text-secondary)'} />
              <SmallMetric label="CPM"        value={cpm > 0 ? fmtR(item.cpm) : '—'} />
              <SmallMetric label="CPC"        value={cpc > 0 ? fmtR(item.cpc) : '—'} />
              <SmallMetric label="ROAS"       value={spend > 0 && pValue > 0 ? `${(pValue / spend).toFixed(2)}x` : '—'} color={spend > 0 && pValue > 0 ? (pValue / spend >= 4 ? '#22c55e' : pValue / spend >= 2 ? '#eab308' : '#ef4444') : 'var(--text-secondary)'} />
              <SmallMetric label="CPV"        value={spend > 0 && item.purchases > 0 ? fmtR(spend / item.purchases) : '—'} color={spend > 0 && item.purchases > 0 ? 'var(--text-secondary)' : 'var(--text-secondary)'} />
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
  const [massRunning,   setMassRunning]   = useState(false);
  const [confirmModal,  setConfirmModal]  = useState<ConfirmModal | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetPct, setBudgetPct] = useState('80');
  const [statusFilter, setStatusFilter] = useState<'active_only' | 'active_paused' | 'all'>('active_only');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSelectionBudgetModal, setShowSelectionBudgetModal] = useState(false);
  const [selectionBudgetDelta, setSelectionBudgetDelta] = useState('-20');

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
    setSelectedIds([]);
    load('campaign', null);
  }, [timeFilter, customStart, customEnd]);

  useEffect(() => {
    if (level === 'campaign') load('campaign', null);
  }, [statusFilter]);

  const getDateRange = () => {
    if (timeFilter === 'today')      { const t = getTodayInBrazil();     return { since: t, until: t }; }
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
      const res  = await call({ action: 'list', level: lvl, dateRange, parentId, statusFilter: lvl === 'campaign' ? statusFilter : undefined });
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
    setSelectedIds([]);
    load(nextLevel, item.id);
  };

  const navigateTo = (crumbIndex: number) => {
    setSelectedIds([]);
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

  // ── Mass actions (all) ───────────────────────────────────────────────────────

  const handlePauseAll = () => {
    const targets = items.filter(i => i.status === 'ACTIVE');
    if (!targets.length) return;
    setConfirmModal({
      title: `Pausar ${targets.length} campanha(s) ativa(s)`,
      body: `${targets.slice(0, 6).map(i => `• ${i.name}`).join('\n')}${targets.length > 6 ? `\n... e mais ${targets.length - 6}` : ''}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setMassRunning(true);
        const snapshot = items.map(i => ({ ...i }));
        setItems(prev => prev.map(i => i.status === 'ACTIVE' ? { ...i, status: 'PAUSED' } : i));
        try {
          await Promise.all(targets.map(t => call({ action: 'toggle', objectId: t.id, targetStatus: 'PAUSED' }).then(r => r.json())));
        } catch { setItems(snapshot); alert('Erro ao pausar campanhas.'); }
        finally  { setMassRunning(false); }
      },
    });
  };

  const handleActivateAll = () => {
    const targets = items.filter(i => i.status === 'PAUSED');
    if (!targets.length) return;
    setConfirmModal({
      title: `Ativar ${targets.length} campanha(s) pausada(s)`,
      body: `${targets.slice(0, 6).map(i => `• ${i.name}`).join('\n')}${targets.length > 6 ? `\n... e mais ${targets.length - 6}` : ''}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setMassRunning(true);
        const snapshot = items.map(i => ({ ...i }));
        setItems(prev => prev.map(i => i.status === 'PAUSED' ? { ...i, status: 'ACTIVE' } : i));
        try {
          await Promise.all(targets.map(t => call({ action: 'toggle', objectId: t.id, targetStatus: 'ACTIVE' }).then(r => r.json())));
        } catch { setItems(snapshot); alert('Erro ao ativar campanhas.'); }
        finally  { setMassRunning(false); }
      },
    });
  };

  const handleReduceBudget = () => {
    const pct = parseFloat(budgetPct);
    if (isNaN(pct) || pct <= 0 || pct >= 100) { alert('Informe uma porcentagem entre 1 e 99.'); return; }
    const targets = items.filter(i => i.status === 'ACTIVE' && i.daily_budget !== null);
    if (!targets.length) { alert('Nenhum conjunto ativo com orçamento diário.'); return; }
    const preview = targets.slice(0, 5).map(i => {
      const novo = (parseFloat(i.daily_budget!) * pct / 100).toFixed(2);
      return `• ${i.name.substring(0, 35)}\n  ${fmtR(i.daily_budget!)} → ${fmtR(novo)}`;
    });
    setShowBudgetModal(false);
    setConfirmModal({
      title: `Reduzir orçamento para ${pct}% do valor atual`,
      body: `${targets.length} conjunto(s):\n\n${preview.join('\n')}${targets.length > 5 ? `\n... e mais ${targets.length - 5}` : ''}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setMassRunning(true);
        const snapshot = items.map(i => ({ ...i }));
        setItems(prev => prev.map(i =>
          i.status === 'ACTIVE' && i.daily_budget !== null
            ? { ...i, daily_budget: (parseFloat(i.daily_budget) * pct / 100).toFixed(2) }
            : i
        ));
        try {
          await Promise.all(targets.map(t => call({ action: 'update_budget', objectId: t.id, dailyBudget: parseFloat(t.daily_budget!) * pct / 100 }).then(r => r.json())));
        } catch { setItems(snapshot); alert('Erro ao atualizar orçamentos.'); }
        finally  { setMassRunning(false); }
      },
    });
  };

  // ── Selection actions ────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const selectable = items.filter(i => i.status === 'ACTIVE' || i.status === 'PAUSED').map(i => i.id);
    setSelectedIds(prev => prev.length === selectable.length ? [] : selectable);
  };

  const handleSelectionToggle = (targetStatus: 'ACTIVE' | 'PAUSED') => {
    const label = targetStatus === 'PAUSED' ? 'pausar' : 'ativar';
    const targets = items.filter(i => selectedIds.includes(i.id) &&
      (targetStatus === 'PAUSED' ? i.status === 'ACTIVE' : i.status === 'PAUSED'));
    if (!targets.length) { alert(`Nenhuma campanha selecionada pode ser ${label}da.`); return; }
    setConfirmModal({
      title: `${targetStatus === 'PAUSED' ? 'Pausar' : 'Ativar'} ${targets.length} campanha(s) selecionada(s)`,
      body: targets.slice(0, 6).map(i => `• ${i.name}`).join('\n') + (targets.length > 6 ? `\n... e mais ${targets.length - 6}` : ''),
      onConfirm: async () => {
        setConfirmModal(null);
        setMassRunning(true);
        const snapshot = items.map(i => ({ ...i }));
        setItems(prev => prev.map(i => targets.find(t => t.id === i.id) ? { ...i, status: targetStatus } : i));
        try {
          await Promise.all(targets.map(t => call({ action: 'toggle', objectId: t.id, targetStatus }).then(r => r.json())));
        } catch { setItems(snapshot); alert('Erro ao alterar status.'); }
        finally { setMassRunning(false); }
      },
    });
  };

  const handleSelectionBudgetAdjust = async () => {
    const delta = parseFloat(selectionBudgetDelta);
    if (isNaN(delta) || delta === 0 || Math.abs(delta) >= 100) {
      alert('Informe uma variação entre -99% e +99% (exceto 0).');
      return;
    }
    const multiplier = 1 + delta / 100;
    const dateRange = getDateRange();
    if (!dateRange) return;

    setShowSelectionBudgetModal(false);
    setMassRunning(true);

    // CBO: campanha tem daily_budget próprio → aplica direto na campanha
    // ABO: daily_budget null → busca adsets e aplica neles
    const selectedCampaigns = items.filter(i => selectedIds.includes(i.id));
    const cboCampaigns = selectedCampaigns.filter(c => c.daily_budget !== null && c.status === 'ACTIVE');
    const aboCampaignIds = selectedCampaigns.filter(c => c.daily_budget === null).map(c => c.id);

    const adsetArrays = aboCampaignIds.length > 0
      ? await Promise.all(
          aboCampaignIds.map(id =>
            call({ action: 'list', level: 'adset', dateRange, parentId: id })
              .then(r => r.json())
              .then((d: any) => d.success ? (d.data || []) : [])
              .catch(() => [])
          )
        )
      : [];
    const allAdsets: AdItem[] = (adsetArrays as AdItem[][]).flat();
    const aboTargets = allAdsets.filter(a => a.status === 'ACTIVE' && a.daily_budget !== null);

    type Target = { id: string; name: string; budget: string; kind: 'CBO' | 'ABO' };
    const allTargets: Target[] = [
      ...cboCampaigns.map(c => ({ id: c.id, name: c.name, budget: c.daily_budget!, kind: 'CBO' as const })),
      ...aboTargets.map(a => ({ id: a.id, name: a.name, budget: a.daily_budget!, kind: 'ABO' as const })),
    ];

    if (!allTargets.length) {
      setMassRunning(false);
      alert('Nenhum orçamento encontrado para ajustar nas campanhas selecionadas.');
      return;
    }

    const preview = allTargets.slice(0, 6).map(t => {
      const newVal = (parseFloat(t.budget) * multiplier).toFixed(2);
      return `• [${t.kind}] ${t.name.substring(0, 32)}\n  ${fmtR(t.budget)} → ${fmtR(newVal)}`;
    });

    const summaryLine = [
      cboCampaigns.length > 0 ? `${cboCampaigns.length} campanha(s) CBO` : '',
      aboTargets.length > 0   ? `${aboTargets.length} conjunto(s) ABO`  : '',
    ].filter(Boolean).join(' + ');

    setConfirmModal({
      title: `Ajustar orçamento ${delta > 0 ? '+' : ''}${delta}% — ${allTargets.length} item(ns)`,
      body: `${summaryLine}\n\n${preview.join('\n')}${allTargets.length > 6 ? `\n... e mais ${allTargets.length - 6}` : ''}`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await Promise.all(allTargets.map(t => {
            const newBudget = parseFloat(t.budget) * multiplier;
            return call({ action: 'update_budget', objectId: t.id, dailyBudget: newBudget }).then(r => r.json());
          }));
        } catch { alert('Erro ao ajustar orçamentos.'); }
        finally { setMassRunning(false); }
      },
    });
    setMassRunning(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const canRefresh   = timeFilter !== 'custom' || (!!customStart && !!customEnd);
  const parentId     = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].id : null;
  const activeCount  = items.filter(i => i.status === 'ACTIVE').length;
  const pausedCount  = items.filter(i => i.status === 'PAUSED').length;
  const totalSpend   = items.reduce((s, i) => s + parseFloat(i.spend), 0);
  const totalBuys    = items.reduce((s, i) => s + i.purchases, 0);
  const totalRevenue = items.reduce((s, i) => s + parseFloat(i.purchase_value), 0);
  const roas         = totalSpend > 0 && totalRevenue > 0 ? (totalRevenue / totalSpend) : null;
  const cpv          = totalSpend > 0 && totalBuys > 0 ? (totalSpend / totalBuys) : null;
  const hasMassTargets = level === 'campaign' && items.length > 0;
  const hasBudgetTargets = level === 'adset' && items.some(i => i.status === 'ACTIVE' && i.daily_budget !== null);
  const selectableCount = items.filter(i => i.status === 'ACTIVE' || i.status === 'PAUSED').length;
  const allSelected = selectedIds.length === selectableCount && selectableCount > 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <Layers size={28} color="#f97316" />
            Gerenciador de Anúncios
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Meta Ads · Navegação em cascata</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {hasMassTargets && (
            <>
              <button onClick={handlePauseAll} disabled={massRunning || activeCount === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                  cursor: activeCount === 0 || massRunning ? 'not-allowed' : 'pointer', opacity: activeCount === 0 || massRunning ? 0.4 : 1,
                  background: 'rgba(107,114,128,0.12)', border: '1px solid rgba(107,114,128,0.3)', color: '#9ca3af', transition: 'all 0.15s' }}>
                <Pause size={12} /> Pausar Todas
              </button>
              <button onClick={handleActivateAll} disabled={massRunning || pausedCount === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                  cursor: pausedCount === 0 || massRunning ? 'not-allowed' : 'pointer', opacity: pausedCount === 0 || massRunning ? 0.4 : 1,
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e', transition: 'all 0.15s' }}>
                <Play size={12} /> Ativar Todas
              </button>
            </>
          )}
          {hasBudgetTargets && (
            <button onClick={() => setShowBudgetModal(true)} disabled={massRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                cursor: massRunning ? 'not-allowed' : 'pointer', opacity: massRunning ? 0.4 : 1,
                background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', transition: 'all 0.15s' }}>
              <TrendingDown size={12} /> Reduzir Orçamento
            </button>
          )}
          <button onClick={() => load(level, parentId)} disabled={loading || !canRefresh}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'var(--bg-inner)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)',
              cursor: loading || !canRefresh ? 'not-allowed' : 'pointer', opacity: loading || !canRefresh ? 0.5 : 1, transition: 'all 0.15s' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* ── Date filter ── */}
      <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Calendar size={15} color="var(--text-muted)" />
          {(Object.keys(FILTER_LABELS) as TimeFilter[]).map(f => (
            <button key={f} onClick={() => setTimeFilter(f)}
              style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: timeFilter === f ? '#f97316' : 'var(--bg-hover)',
                border: timeFilter === f ? '1px solid #f97316' : '1px solid var(--border-main)',
                color: timeFilter === f ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s' }}>
              {FILTER_LABELS[f]}
            </button>
          ))}
          {timeFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DatePicker selected={customStart ? new Date(customStart + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomStart(d ? d.toISOString().split('T')[0] : '')}
                selectsStart startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Início"
                className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer" />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>até</span>
              <DatePicker selected={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                onChange={(d: Date | null) => setCustomEnd(d ? d.toISOString().split('T')[0] : '')}
                selectsEnd startDate={customStart ? new Date(customStart + 'T12:00:00') : null}
                endDate={customEnd ? new Date(customEnd + 'T12:00:00') : null}
                minDate={customStart ? new Date(customStart + 'T12:00:00') : undefined}
                maxDate={new Date()} dateFormat="dd/MM/yyyy" locale={ptBR} placeholderText="Fim"
                className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-32 cursor-pointer" />
            </div>
          )}
        </div>
      </div>

      {/* ── Status filter (campaign level only) ── */}
      {level === 'campaign' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Mostrar:</span>
          {([
            { value: 'active_only',   label: 'Apenas ativas'      },
            { value: 'active_paused', label: 'Ativas + Pausadas'  },
            { value: 'all',           label: 'Todas'               },
          ] as const).map(opt => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: statusFilter === opt.value ? '#f97316' : 'var(--bg-hover)',
                border: statusFilter === opt.value ? '1px solid #f97316' : '1px solid var(--border-main)',
                color: statusFilter === opt.value ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Summary bar (campaign level) ── */}
      {!loading && !error && items.length > 0 && level === 'campaign' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Total Gasto"   value={totalSpend > 0 ? fmtR(totalSpend) : '—'}         color="#f97316" icon={DollarSign} />
          <SummaryCard label="Compras"       value={totalBuys > 0 ? String(totalBuys) : '—'}          color="#22c55e" icon={ShoppingCart} />
          <SummaryCard label="Receita Pixel" value={totalRevenue > 0 ? fmtR(totalRevenue) : '—'}      color="#22c55e" icon={TrendingUp} />
          <SummaryCard label="ROAS"
            value={roas !== null ? `${roas.toFixed(2)}x` : '—'}
            color={roas !== null ? (roas >= 4 ? '#22c55e' : roas >= 2 ? '#eab308' : '#ef4444') : 'var(--text-muted)'}
            sub="Receita ÷ Gasto" icon={BarChart2} />
          <SummaryCard label="CPV"
            value={cpv !== null ? fmtR(cpv) : '—'}
            color={cpv !== null ? (cpv < 50 ? '#22c55e' : cpv < 100 ? '#eab308' : '#ef4444') : 'var(--text-muted)'}
            sub="Gasto ÷ Compras" icon={Target} />
          <SummaryCard label="Campanhas"     value={`${activeCount} ativas`}  color="#22c55e"
            sub={pausedCount > 0 ? `${pausedCount} pausada(s)` : undefined} icon={Layers} />
        </div>
      )}

      {/* ── Selection bar ── */}
      {selectedIds.length > 0 && level === 'campaign' && (
        <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f97316', flexShrink: 0 }}>
            {selectedIds.length} {selectedIds.length === 1 ? 'campanha selecionada' : 'campanhas selecionadas'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleSelectionToggle('PAUSED')} disabled={massRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.35)', color: '#9ca3af', cursor: 'pointer' }}>
              <Pause size={11} /> Pausar selecionadas
            </button>
            <button onClick={() => handleSelectionToggle('ACTIVE')} disabled={massRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer' }}>
              <Play size={11} /> Ativar selecionadas
            </button>
            <button onClick={() => setShowSelectionBudgetModal(true)} disabled={massRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', cursor: 'pointer' }}>
              <TrendingDown size={11} /> Ajustar orçamento
            </button>
          </div>
          <button onClick={() => setSelectedIds([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => navigateTo(-1)} disabled={level === 'campaign'}
          style={{ background: 'none', border: 'none', padding: 0, cursor: level === 'campaign' ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 600, color: level === 'campaign' ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 0.15s' }}
          onMouseEnter={e => { if (level !== 'campaign') (e.currentTarget as HTMLElement).style.color = '#f97316'; }}
          onMouseLeave={e => { if (level !== 'campaign') (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
          Campanhas
        </button>
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1 && level !== 'ad';
          return (
            <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={13} color="var(--border-main)" />
              <button onClick={() => !isLast && navigateTo(i)} disabled={isLast || level === 'ad'} title={crumb.name}
                style={{ background: 'none', border: 'none', padding: 0, cursor: isLast || level === 'ad' ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 600, color: isLast || level === 'ad' ? 'var(--text-primary)' : 'var(--text-muted)',
                  maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
                onMouseEnter={e => { if (!isLast && level !== 'ad') (e.currentTarget as HTMLElement).style.color = '#f97316'; }}
                onMouseLeave={e => { if (!isLast && level !== 'ad') (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                {crumb.name}
              </button>
            </span>
          );
        })}
        {level !== 'campaign' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={13} color="var(--border-main)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{LEVEL_LABELS[level]}</span>
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!loading && items.length > 0 && level === 'campaign' && selectableCount > 0 && (
            <button onClick={toggleSelectAll}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
              {allSelected ? <CheckSquare size={14} color="#f97316" /> : <Square size={14} />}
              {allSelected ? 'Desselecionar tudo' : 'Selecionar tudo'}
            </button>
          )}
          {!loading && items.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {items.length} {LEVEL_LABELS[level].toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* ── States ── */}
      {timeFilter === 'custom' && (!customStart || !customEnd) && (
        <div style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 12, padding: '18px 22px', display: 'flex', gap: 12 }}>
          <AlertCircle size={17} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Selecione as datas de início e fim para carregar os dados.</p>
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 14 }}>
          <RefreshCw size={28} color="#f97316" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Carregando {LEVEL_LABELS[level].toLowerCase()}...</p>
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
            <ItemCard key={item.id} item={item} level={level}
              onDrillDown={drillDown} onToggle={handleToggle} toggling={toggling}
              editingBudget={editingBudget} onEditBudget={handleEditBudget}
              onSaveBudget={handleSaveBudget} onCancelBudget={() => setEditingBudget(null)}
              savingBudget={savingBudget}
              selected={selectedIds.includes(item.id)}
              onSelect={toggleSelect} />
          ))}
        </div>
      )}
      {!loading && !error && items.length === 0 && canRefresh && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 16, padding: '60px 20px', textAlign: 'center' }}>
          <Layers size={36} color="var(--border-main)" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nenhum resultado encontrado para o período selecionado.</p>
        </div>
      )}

      {/* ── Reduce budget modal (all adsets) ── */}
      {showBudgetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 18, padding: 28, maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Reduzir Orçamento em Massa</h3>
              <button onClick={() => setShowBudgetModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 18px' }}>
              Aplica a redução em <strong style={{ color: '#f97316' }}>{items.filter(i => i.status === 'ACTIVE' && i.daily_budget !== null).length}</strong> conjunto(s) ativo(s) com orçamento diário.
            </p>
            <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 8 }}>Manter esta % do orçamento atual</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <input type="number" min="1" max="99" step="1" value={budgetPct} onChange={e => setBudgetPct(e.target.value)}
                style={{ width: 80, padding: '8px 12px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>%</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 22px' }}>Ex: 80% mantém 80% (reduz em 20%)</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleReduceBudget} style={{ flex: 1, padding: '11px', background: '#f97316', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Calcular e Confirmar
              </button>
              <button onClick={() => setShowBudgetModal(false)} style={{ flex: 1, padding: '11px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Selection budget adjust modal ── */}
      {showSelectionBudgetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 18, padding: 28, maxWidth: 440, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Ajustar Orçamento das Selecionadas</h3>
              <button onClick={() => setShowSelectionBudgetModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 18px' }}>
              Ajusta o orçamento de todos os conjuntos ativos das <strong style={{ color: '#f97316' }}>{selectedIds.length}</strong> campanha(s) selecionada(s).
            </p>
            <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 8 }}>Variação percentual</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
              <input type="number" min="-99" max="99" step="1" value={selectionBudgetDelta}
                onChange={e => setSelectionBudgetDelta(e.target.value)}
                style={{ width: 90, padding: '8px 12px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>%</span>
              <span style={{ color: parseFloat(selectionBudgetDelta) > 0 ? '#22c55e' : '#ef4444', fontSize: 13, fontWeight: 600 }}>
                {parseFloat(selectionBudgetDelta) > 0 ? `+${selectionBudgetDelta}% (aumentar)` : `${selectionBudgetDelta}% (reduzir)`}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '0 0 22px' }}>Ex: -20 reduz 20% · +10 aumenta 10%</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSelectionBudgetAdjust} disabled={massRunning}
                style={{ flex: 1, padding: '11px', background: '#f97316', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Buscar e Confirmar
              </button>
              <button onClick={() => setShowSelectionBudgetModal(false)}
                style={{ flex: 1, padding: '11px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 101, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 18, padding: 28, maxWidth: 480, width: '100%' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>{confirmModal.title}</h3>
            <pre style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 22px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>
              {confirmModal.body}
            </pre>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmModal.onConfirm}
                style={{ flex: 1, padding: '11px', background: '#f97316', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Confirmar
              </button>
              <button onClick={() => setConfirmModal(null)}
                style={{ flex: 1, padding: '11px', background: 'var(--bg-inner)', border: '1px solid var(--border-main)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
