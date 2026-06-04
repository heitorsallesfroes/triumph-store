import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, AlertCircle, Package, MapPin, Clock, X, DollarSign, Plus, Truck } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 30 * 60 * 1000;

interface TrackingEvent {
  description: string;
  location: string;
  destination: string;
  date: string;
}

interface TrackedSale {
  id: string;
  customer_name: string;
  city: string;
  neighborhood: string;
  tracking_code: string | null;
  shipping_label_url: string | null;
  shipping_status: string | null;
  sale_date: string;
  updated_at?: string | null;
  delivered_at?: string | null;
  events?: TrackingEvent[];
  updating?: boolean;
  error?: string;
}

type TrackingCol = 'aguardando' | 'transito' | 'saiu' | 'entregue';

function getCol(status: string | null): TrackingCol {
  if (!status) return 'aguardando';
  const s = status.toLowerCase();
  if (s.includes('entregue')) return 'entregue';
  if (s.includes('saiu para entrega') || s.includes('tentativa') || s.includes('retirada') || s.includes('devolvido')) return 'saiu';
  if (s.includes('trânsito') || s.includes('transito') || s.includes('transferê') || s.includes('transfere')) return 'transito';
  return 'aguardando';
}

function isOldDelivery(s: Pick<TrackedSale, 'shipping_status' | 'delivered_at' | 'updated_at' | 'sale_date'>): boolean {
  if (!(s.shipping_status ?? '').toLowerCase().includes('entregue')) return false;
  const ref = s.delivered_at || s.updated_at;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > FIVE_DAYS_MS;
}

// Extrai order_id da URL da etiqueta (suporta formato orders[]=ID e JWT no path)
function decodeJwtOrderId(url: string): string | null {
  try {
    const token = url.split('/').pop()?.split('?')[0] ?? '';
    if (!token.startsWith('eyJ')) return null;
    const parts = token.split('.');
    const segment = parts.length >= 2 ? parts[1] : parts[0];
    const padded = segment + '='.repeat((4 - segment.length % 4) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    const id = decoded.id ?? decoded.order_id ?? decoded.orderId
      ?? (Array.isArray(decoded.order_ids) ? decoded.order_ids[0] : null)
      ?? (Array.isArray(decoded.orders) ? decoded.orders[0] : null);
    return id != null ? String(id) : null;
  } catch { return null; }
}

function extractOrderId(url: string | null): string | null {
  if (!url) return null;
  const normalized = url.replace(/orders%5B%5D=/gi, 'orders[]=');
  const match = normalized.split('orders[]=')[1];
  if (match) return match.split('&')[0].trim() || null;
  return decodeJwtOrderId(url);
}

function getEventIcon(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('entregue')) return '✅';
  if (d.includes('saiu para entrega') || d.includes('em rota de entrega')) return '🚚';
  if (d.includes('trânsito') || d.includes('transito') || d.includes('transferê') || d.includes('encaminhado')) return '📮';
  if (d.includes('devolvido')) return '↩️';
  if (d.includes('tentativa') || d.includes('ausente')) return '⚠️';
  if (d.includes('aguardando') || d.includes('retirada')) return '📬';
  if (d.includes('postado') || d.includes('coletado')) return '📦';
  return '▪';
}

function formatEventDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d.length > 16 ? d.substring(0, 16) : d;
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700/60 text-gray-400 border border-gray-600">
        🏷️ Sem status
      </span>
    );
  }
  const s = status.toLowerCase();
  const cfg = s.includes('entregue')
    ? { icon: '✅', cls: 'bg-green-500/20 text-green-400 border-green-500/40' }
    : s.includes('saiu para entrega')
    ? { icon: '🚚', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' }
    : s.includes('trânsito') || s.includes('transito') || s.includes('transferê')
    ? { icon: '📮', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' }
    : s.includes('devolvido')
    ? { icon: '↩️', cls: 'bg-red-500/20 text-red-400 border-red-500/40' }
    : s.includes('tentativa')
    ? { icon: '⚠️', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' }
    : s.includes('aguardando') || s.includes('retirada')
    ? { icon: '📬', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/40' }
    : { icon: '🏷️', cls: 'bg-gray-700/60 text-gray-300 border-gray-600' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <span>{cfg.icon}</span>
      <span className="truncate max-w-[160px]" title={status}>{status}</span>
    </span>
  );
}

function TrackingCard({
  sale,
  onUpdate,
  onHide,
  formatDate,
}: {
  sale: TrackedSale;
  onUpdate: () => void;
  onHide: () => void;
  formatDate: (d: string) => string;
}) {
  const lastDate = sale.delivered_at || sale.updated_at || sale.sale_date;
  return (
    <div className="relative bg-gray-900 rounded-lg border border-gray-700 p-3 space-y-2 hover:border-orange-500/40 transition-colors">
      {/* Botão remover do rastreamento */}
      <button
        onClick={onHide}
        title="Remover do rastreamento"
        className="absolute top-2 right-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded p-0.5 transition-colors"
      >
        <X size={12} />
      </button>

      <div className="pr-4">
        <h3 className="text-sm font-bold text-white leading-tight truncate">{sale.customer_name}</h3>
        <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
          <MapPin size={10} className="text-gray-500 flex-shrink-0" />
          <span className="truncate">{[sale.neighborhood, sale.city].filter(Boolean).join(' · ')}</span>
        </p>
      </div>

      <p className="text-gray-500 text-xs font-mono truncate">
        {sale.tracking_code ? `🔍 ${sale.tracking_code}` : '📋 Aguardando código de rastreio...'}
      </p>

      <div>
        {sale.updating ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400 inline-block" />
            Consultando...
          </span>
        ) : sale.error ? (
          <span className="inline-flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={11} />
            <span className="truncate max-w-[160px]" title={sale.error}>{sale.error}</span>
          </span>
        ) : (
          <StatusBadge status={sale.shipping_status} />
        )}
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-gray-600 text-xs flex items-center gap-1">
          <Clock size={10} />
          {formatDate(lastDate)}
        </span>
        <button
          onClick={onUpdate}
          disabled={sale.updating}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={10} className={sale.updating ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Linha do tempo de eventos */}
      {!sale.updating && !sale.error && sale.events && sale.events.length > 0 && (
        <div className="border-t border-gray-700/50 pt-2 space-y-1.5 max-h-40 overflow-y-auto">
          {sale.events.map((ev, i) => {
            const isCurrent = i === 0;
            const place = ev.location && ev.destination
              ? `${ev.location} → ${ev.destination}`
              : ev.location || ev.destination || '';
            const meta = [formatEventDate(ev.date), place].filter(Boolean).join(' • ');
            return (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-xs mt-0.5 flex-shrink-0 w-4 text-center leading-none">
                  {isCurrent ? getEventIcon(ev.description) : '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs leading-snug ${isCurrent ? 'text-white font-semibold' : 'text-gray-500'}`}>
                    {ev.description}
                  </p>
                  {meta && (
                    <p className="text-xs text-gray-600 mt-0.5">{meta}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const COLS: { id: TrackingCol; title: string; headerCls: string; badgeCls: string }[] = [
  { id: 'aguardando', title: 'Aguardando',        headerCls: 'bg-orange-500/10 text-orange-400', badgeCls: 'bg-orange-500 text-white'  },
  { id: 'transito',   title: 'Em Trânsito',        headerCls: 'bg-blue-500/10 text-blue-400',    badgeCls: 'bg-blue-500 text-white'    },
  { id: 'saiu',       title: 'Saiu para Entrega',  headerCls: 'bg-purple-500/10 text-purple-400', badgeCls: 'bg-purple-500 text-white' },
  { id: 'entregue',   title: 'Entregue',            headerCls: 'bg-green-500/10 text-green-400',  badgeCls: 'bg-green-500 text-white'  },
];

function KanbanColumn({
  title, headerCls, badgeCls, sales, onUpdateOne, onHideOne, formatDate,
}: {
  title: string; headerCls: string; badgeCls: string;
  sales: TrackedSale[];
  onUpdateOne: (s: TrackedSale) => void;
  onHideOne: (s: TrackedSale) => void;
  formatDate: (d: string) => string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
      <div className={`px-4 py-3 border-b border-gray-700 ${headerCls}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">{title}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeCls}`}>{sales.length}</span>
        </div>
      </div>
      <div
        className="p-2.5 space-y-2 flex-1 overflow-y-auto"
        style={{ minHeight: 120, maxHeight: 'calc(100vh - 280px)' }}
      >
        {sales.length === 0 ? (
          <p className="text-center text-gray-600 py-8 text-xs">Nenhum pacote</p>
        ) : (
          sales.map(sale => (
            <TrackingCard
              key={sale.id}
              sale={sale}
              onUpdate={() => onUpdateOne(sale)}
              onHide={() => onHideOne(sale)}
              formatDate={formatDate}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function CorreiosTracking() {
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [swCorreios, setSwCorreios] = useState({ count: 0, freight: 0 });
  const [pvCorreios, setPvCorreios] = useState({ count: 0, freight: 0 });
  const [avulsosCorreios, setAvulsosCorreios] = useState(0);
  const [showAvulsoModal, setShowAvulsoModal] = useState(false);
  const [avulsoForm, setAvulsoForm] = useState({ description: '', amount: '', date: new Date() });

  const loadMetrics = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [swRes, pvRes, avRes] = await Promise.all([
      supabase.from('sales')
        .select('delivery_cost')
        .eq('delivery_type', 'correios')
        .neq('status', 'cancelado')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate + 'T23:59:59'),
      supabase.from('small_sales')
        .select('delivery_fee')
        .eq('delivery_type', 'correios')
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59'),
      supabase.from('operational_costs_avulsos')
        .select('amount')
        .like('description', 'Correios:%')
        .gte('date', startDate)
        .lte('date', endDate),
    ]);

    const swData = swRes.data || [];
    const pvData = pvRes.data || [];
    setSwCorreios({
      count: swData.length,
      freight: swData.reduce((s, r) => s + Number(r.delivery_cost || 0), 0),
    });
    setPvCorreios({
      count: pvData.length,
      freight: pvData.reduce((s, r) => s + Number(r.delivery_fee || 0), 0),
    });
    setAvulsosCorreios((avRes.data || []).reduce((s, r) => s + Number(r.amount), 0));
  };

  const handleAddAvulso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supabase.from('operational_costs_avulsos').insert([{
        description: `Correios: ${avulsoForm.description}`,
        amount: Number(avulsoForm.amount),
        date: avulsoForm.date.toISOString().split('T')[0],
      }]);
      setAvulsoForm({ description: '', amount: '', date: new Date() });
      setShowAvulsoModal(false);
      loadMetrics(); // eslint-disable-line @typescript-eslint/no-floating-promises
    } catch { alert('Erro ao salvar custo avulso'); }
  };

  // Busca o tracking_code para pacotes sem código mas com etiqueta gerada.
  // O SuperFrete demora alguns minutos para atribuir o código após o checkout.
  const fetchTrackingCodes = async (withoutCode: TrackedSale[]) => {
    await Promise.all(withoutCode.map(async (sale) => {
      const orderId = extractOrderId(sale.shipping_label_url);
      if (!orderId) return;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-order-tracking`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ order_id: orderId }),
        });
        const data = await resp.json();
        if (data.success && data.tracking_code) {
          await supabase.from('sales').update({ tracking_code: data.tracking_code }).eq('id', sale.id);
          setSales(prev =>
            prev.map(s => s.id === sale.id ? { ...s, tracking_code: data.tracking_code } : s)
          );
        }
      } catch { /* tenta novamente no próximo refresh */ }
    }));
  };

  const fetchAndSaveStatuses = async (targets: TrackedSale[]) => {
    // Só rastreia pacotes que têm código de rastreio
    const trackable = targets.filter(t => t.tracking_code?.trim());
    if (trackable.length === 0) return;

    setSales(prev =>
      prev.map(s => trackable.some(t => t.id === s.id) ? { ...s, updating: true, error: undefined } : s)
    );

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/track-shipment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracking_codes: trackable.map(t => t.tracking_code) }),
      });

      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Erro na edge function');

      const now = new Date().toISOString();

      await Promise.all(
        (data.results as { code: string; status: string; events?: TrackingEvent[]; error?: string }[]).map(async (result) => {
          const sale = trackable.find(t => t.tracking_code === result.code);
          if (!sale) return;

          if (result.error || !result.status) {
            setSales(prev =>
              prev.map(s =>
                s.id === sale.id ? { ...s, updating: false, error: result.error || 'Sem resposta' } : s
              )
            );
            return;
          }

          const isNowDelivered = result.status.toLowerCase().includes('entregue');
          const updatePayload: Record<string, string> = { shipping_status: result.status };
          if (isNowDelivered) updatePayload.delivered_at = now;

          await supabase.from('sales').update(updatePayload).eq('id', sale.id);

          setSales(prev =>
            prev
              .map(s =>
                s.id === sale.id
                  ? {
                      ...s,
                      shipping_status: result.status,
                      events: result.events ?? s.events,
                      updated_at: now,
                      ...(isNowDelivered ? { delivered_at: now } : {}),
                      updating: false,
                      error: undefined,
                    }
                  : s
              )
              .filter(s => !isOldDelivery(s))
          );
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setSales(prev =>
        prev.map(s =>
          trackable.some(t => t.id === s.id) ? { ...s, updating: false, error: message } : s
        )
      );
    }
  };

  const loadAndUpdate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, customer_name, city, neighborhood, tracking_code, shipping_label_url, shipping_status, sale_date, updated_at, delivered_at')
        .eq('delivery_type', 'correios')
        .not('hide_from_tracking', 'is', true)
        .order('sale_date', { ascending: false });

      if (error) throw error;

      const filtered = (data || []).filter((s: any) => !isOldDelivery(s)) as TrackedSale[];
      setSales(filtered);
      setLoading(false);

      // Pacotes sem código: tenta buscar no SuperFrete (pode demorar alguns min após gerar etiqueta)
      const withoutCode = filtered.filter(s => !s.tracking_code?.trim() && s.shipping_label_url);
      if (withoutCode.length > 0) fetchTrackingCodes(withoutCode); // eslint-disable-line @typescript-eslint/no-floating-promises

      // Pacotes com código: consulta status atualizado
      if (filtered.length > 0) fetchAndSaveStatuses(filtered); // eslint-disable-line @typescript-eslint/no-floating-promises
    } catch (err) {
      console.error('Erro ao carregar vendas:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAndUpdate(); // eslint-disable-line @typescript-eslint/no-floating-promises
    loadMetrics(); // eslint-disable-line @typescript-eslint/no-floating-promises
    const interval = setInterval(loadAndUpdate, AUTO_REFRESH_MS); // eslint-disable-line @typescript-eslint/no-floating-promises
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    await fetchAndSaveStatuses(sales.filter(s => !s.updating));
    setUpdatingAll(false);
  };

  const handleHide = async (sale: TrackedSale) => {
    setSales(prev => prev.filter(s => s.id !== sale.id));
    await supabase.from('sales').update({ hide_from_tracking: true }).eq('id', sale.id);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  const grouped: Record<TrackingCol, TrackedSale[]> = {
    aguardando: sales.filter(s => getCol(s.shipping_status) === 'aguardando'),
    transito:   sales.filter(s => getCol(s.shipping_status) === 'transito'),
    saiu:       sales.filter(s => getCol(s.shipping_status) === 'saiu'),
    entregue:   sales.filter(s => getCol(s.shipping_status) === 'entregue'),
  };

  const inProgress = grouped.aguardando.length + grouped.transito.length + grouped.saiu.length;

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500" />
        Carregando rastreamentos...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Correios</h1>
          <p className="text-gray-400">
            {sales.length} pacote{sales.length !== 1 ? 's' : ''} •{' '}
            <span className="text-green-400 font-medium">
              {grouped.entregue.length} entregue{grouped.entregue.length !== 1 ? 's' : ''}
            </span>
            {inProgress > 0 && (
              <span className="text-blue-400 font-medium"> • {inProgress} em andamento</span>
            )}
          </p>
        </div>

        <button
          onClick={handleUpdateAll}
          disabled={updatingAll || sales.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          <RefreshCw size={16} className={updatingAll ? 'animate-spin' : ''} />
          {updatingAll ? 'Atualizando...' : 'Atualizar Tudo'}
        </button>
      </div>

      {/* ── Métricas do mês atual ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-400 text-xs uppercase tracking-wider">
            Métricas — {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => setShowAvulsoModal(true)}
            className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            <Plus size={16} /> Custo Avulso Correios
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck size={15} className="text-blue-400" />
              <p className="text-gray-400 text-xs">Total de Envios</p>
            </div>
            <p className="text-xl font-bold text-blue-400">{swCorreios.count + pvCorreios.count} envios</p>
            <p className="text-gray-500 text-xs mt-1">
              R$ {(swCorreios.freight + pvCorreios.freight).toFixed(2)} em frete
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package size={15} className="text-orange-400" />
              <p className="text-gray-400 text-xs">Smartwatches</p>
            </div>
            <p className="text-xl font-bold text-orange-400">{swCorreios.count} envios</p>
            <p className="text-gray-500 text-xs mt-1">R$ {swCorreios.freight.toFixed(2)} em frete</p>
          </div>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package size={15} className="text-purple-400" />
              <p className="text-gray-400 text-xs">Pequenas Vendas</p>
            </div>
            <p className="text-xl font-bold text-purple-400">{pvCorreios.count} envios</p>
            <p className="text-gray-500 text-xs mt-1">R$ {pvCorreios.freight.toFixed(2)} em frete</p>
          </div>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={15} className="text-yellow-400" />
              <p className="text-gray-400 text-xs">Trocas/Avulsos</p>
            </div>
            <p className="text-xl font-bold text-yellow-400">R$ {avulsosCorreios.toFixed(2)}</p>
            <p className="text-gray-500 text-xs mt-1">Custos avulsos do mês</p>
          </div>
        </div>
      </div>

      {/* Modal Custo Avulso Correios */}
      {showAvulsoModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Custo Avulso Correios</h2>
              <button onClick={() => setShowAvulsoModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddAvulso} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Descrição</label>
                <input
                  type="text"
                  value={avulsoForm.description}
                  onChange={e => setAvulsoForm({ ...avulsoForm, description: e.target.value })}
                  placeholder="Ex: Troca produto, Reenvio..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">Salvo como "Correios: [descrição]"</p>
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

      {sales.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
          <Package size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Nenhum pacote rastreável</h3>
          <p className="text-gray-400">
            Gere etiquetas Correios no Histórico de Vendas para que os rastreamentos apareçam aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {COLS.map(col => (
            <KanbanColumn
              key={col.id}
              title={col.title}
              headerCls={col.headerCls}
              badgeCls={col.badgeCls}
              sales={grouped[col.id]}
              onUpdateOne={sale => fetchAndSaveStatuses([sale])} // eslint-disable-line @typescript-eslint/no-floating-promises
              onHideOne={handleHide}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
