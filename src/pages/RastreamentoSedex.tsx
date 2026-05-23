import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { supabase } from '../lib/supabase';
import {
  PackageSearch, RefreshCw, Package, Truck, MapPin,
  CheckCircle, Clock, ExternalLink, AlertCircle,
} from 'lucide-react';

type TrackingStatus = 'sem_info' | 'postado' | 'em_transito' | 'saiu_entrega' | 'entregue';

interface TrackingEvent {
  description: string;
  detail: string;
  date: string;
  location: string;
  destination: string;
}

interface Sale {
  id: string;
  customer_name: string;
  address_street: string;
  address_number: string;
  address_complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  tracking_code: string | null;
  shipping_label_url: string | null;
  shipping_status: string | null;
  delivered_at: string | null;
  sale_date: string;
  productLabel: string;
  status: TrackingStatus;
  lastEvent?: TrackingEvent;
  tracking_loading: boolean;
  tracking_error?: string;
}

interface StatusCfg {
  label: string;
  emoji: string;
  color: string;
  borderLeft: string;
  leftColor: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

const STATUS_CONFIG: Record<TrackingStatus, StatusCfg> = {
  sem_info:     { label: 'Sem informação',  emoji: '❓', color: 'text-gray-400',   borderLeft: 'border-l-gray-600',   leftColor: '#4b5563', icon: Clock       },
  postado:      { label: 'Postado',         emoji: '📦', color: 'text-blue-400',   borderLeft: 'border-l-blue-500',   leftColor: '#3b82f6', icon: Package     },
  em_transito:  { label: 'Em trânsito',     emoji: '🚚', color: 'text-amber-400',  borderLeft: 'border-l-amber-500',  leftColor: '#f59e0b', icon: Truck       },
  saiu_entrega: { label: 'Saiu p/ entrega', emoji: '🛵', color: 'text-orange-400', borderLeft: 'border-l-orange-500', leftColor: '#f97316', icon: MapPin      },
  entregue:     { label: 'Entregue',        emoji: '✅', color: 'text-green-400',  borderLeft: 'border-l-green-600',  leftColor: '#16a34a', icon: CheckCircle },
};

const REFRESH_SEC = 600; // 10 minutos
const DELIVERED_HIDE_DAYS = 5;

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function inferStatus(description: string): TrackingStatus {
  if (!description) return 'sem_info';
  const desc = normalizeStr(description);
  if (
    desc.includes('entregue ao destinatario') ||
    desc.includes('objeto entregue') ||
    desc.includes('entregue')
  ) return 'entregue';
  if (
    desc.includes('saiu para entrega') ||
    desc.includes('saiu p/ entrega') ||
    desc.includes('em rota de entrega') ||
    desc.includes('tentativa de entrega') ||
    desc.includes('aguardando retirada')
  ) return 'saiu_entrega';
  if (
    desc.includes('objeto postado') ||
    desc.includes('postado') ||
    desc.includes('coletado')
  ) return 'postado';
  return 'em_transito';
}

function buildProductLabel(items: Array<{ quantity: number; products: { model: string; color: string } | null }>): string {
  if (!items || items.length === 0) return '';
  const sorted = [...items].sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
  const first = sorted[0];
  const name = [first.products?.model, first.products?.color].filter(Boolean).join(' ');
  if (!name) return '';
  const extra = items.length - 1;
  return extra > 0 ? `${name} + ${extra} ${extra === 1 ? 'item' : 'itens'}` : name;
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function fetchTracking(
  code: string,
): Promise<{ event: TrackingEvent | null; status: TrackingStatus; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/track-package`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tracking_code: code }),
      signal: AbortSignal.timeout(25000),
    });

    const data = await res.json();

    if (!data.success || data.status === 'not_found') {
      return { event: null, status: 'sem_info', error: data.error };
    }

    let description: string;
    let detail: string;
    let date: string;
    let location: string;
    let destination: string;

    if (typeof data.description === 'string') {
      description = data.description;
      detail = data.detail || '';
      date = data.date || '';
      location = data.location || '';
      destination = data.destination || '';
    } else if (Array.isArray(data.events) && data.events.length > 0) {
      const e = data.events[0];
      description = e.description || '';
      detail = '';
      date = e.date || '';
      location = e.location || '';
      destination = '';
    } else {
      return { event: null, status: 'sem_info', error: 'Nenhum evento retornado' };
    }

    const event: TrackingEvent = { description, detail, date, location, destination };
    return { event, status: inferStatus(description) };
  } catch (err: any) {
    return {
      event: null,
      status: 'sem_info',
      error: err?.name === 'TimeoutError' ? 'Tempo esgotado' : (err?.message || 'Erro ao rastrear'),
    };
  }
}

// Tenta extrair o order_id de um JWT na URL (formato etiqueta.superfrete.com/_etiqueta/pdf/eyJ...)
function decodeJwtOrderId(url: string): string | null {
  try {
    const token = url.split('/').pop()?.split('?')[0] ?? '';
    if (!token.startsWith('eyJ')) return null;
    // JWT: header.payload.signature — decodifica o payload (2º segmento)
    const parts = token.split('.');
    const segment = parts.length >= 2 ? parts[1] : parts[0];
    const padded = segment + '='.repeat((4 - segment.length % 4) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    // Procura campos comuns que contenham o order_id
    const id = decoded.id
      ?? decoded.order_id
      ?? decoded.orderId
      ?? (Array.isArray(decoded.order_ids) ? decoded.order_ids[0] : null)
      ?? (Array.isArray(decoded.orders) ? decoded.orders[0] : null);
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

// Extrai order_id da URL da etiqueta — suporta dois formatos:
//   Novo:  ...?orders[]=12345   (ou orders%5B%5D=)
//   Antigo: etiqueta.superfrete.com/_etiqueta/pdf/eyJ... (JWT com order_id no payload)
function extractOrderId(url: string | null): string | null {
  if (!url) return null;
  // Formato 1: query param orders[]=
  const normalized = url.replace(/orders%5B%5D=/gi, 'orders[]=');
  const match = normalized.split('orders[]=')[1];
  if (match) return match.split('&')[0].trim() || null;
  // Formato 2: JWT no path
  return decodeJwtOrderId(url);
}

function formatSaleDate(sale_date: string) {
  if (!sale_date) return 'Data não disponível';
  const d = new Date(sale_date.includes('T') ? sale_date : sale_date + 'T00:00:00');
  return isNaN(d.getTime()) ? 'Data não disponível' : `Venda em ${d.toLocaleDateString('pt-BR')}`;
}

function formatEventDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

export default function RastreamentoSedex() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchingCodeIds, setFetchingCodeIds] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(REFRESH_SEC);

  // Refs para evitar closure stale no intervalo
  const salesRef = useRef<Sale[]>([]);
  salesRef.current = sales;
  const isUpdatingRef = useRef(false);
  const isInitialLoad = useRef(true);

  useEffect(() => { loadSales(); }, []);

  // Auto-track assim que os pedidos carregam pela primeira vez
  useEffect(() => {
    if (!loading && isInitialLoad.current) {
      isInitialLoad.current = false;
      const ids = salesRef.current
        .filter(s => s.status !== 'entregue' && !!s.tracking_code?.trim())
        .map(s => s.id);
      if (ids.length > 0) updateAll(ids);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reseta o contador após cada atualização
  useEffect(() => {
    if (lastUpdated) setCountdown(REFRESH_SEC);
  }, [lastUpdated]);

  // Contador regressivo + auto-atualização dos "Em andamento"
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setTimeout(() => {
            const ids = salesRef.current
              .filter(s => s.status !== 'entregue' && !!s.tracking_code?.trim())
              .map(s => s.id);
            if (ids.length > 0) updateAll(ids);
          }, 0);
          return REFRESH_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSales = async () => {
    setLoading(true);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - DELIVERED_HIDE_DAYS);

    const fields = 'id, customer_name, address_street, address_number, address_complement, neighborhood, city, state, tracking_code, shipping_label_url, shipping_status, delivered_at, sale_date, sale_items(quantity, products(model, color))';

    const [activeRes, deliveredRes] = await Promise.all([
      supabase.from('sales').select(fields)
        .eq('delivery_type', 'correios')
        .eq('shipping_status', 'Etiqueta gerada')
        .order('sale_date', { ascending: false }),
      supabase.from('sales').select(fields)
        .eq('delivery_type', 'correios')
        .eq('shipping_status', 'Entregue')
        .not('delivered_at', 'is', null)
        .gte('delivered_at', fiveDaysAgo.toISOString())
        .order('sale_date', { ascending: false }),
    ]);

    const combined = [...(activeRes.data || []), ...(deliveredRes.data || [])]
      .sort((a: any, b: any) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());

    setSales(
      combined.map((s: any) => ({
        ...s,
        productLabel: buildProductLabel(s.sale_items || []),
        // Pacotes já marcados como Entregue no banco iniciam com status correto
        status: s.shipping_status === 'Entregue' ? 'entregue' as TrackingStatus : 'sem_info' as TrackingStatus,
        tracking_loading: false,
      }))
    );
    setLoading(false);
  };

  const fetchCode = async (sale: Sale) => {
    const orderId = extractOrderId(sale.shipping_label_url);
    if (!orderId) {
      alert('Não foi possível extrair o ID do pedido da URL da etiqueta.');
      return;
    }
    setFetchingCodeIds(prev => [...prev, sale.id]);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-order-tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (data.success && data.tracking_code) {
        await supabase.from('sales').update({ tracking_code: data.tracking_code }).eq('id', sale.id);
        setSales(prev => prev.map(s => s.id === sale.id ? { ...s, tracking_code: data.tracking_code } : s));
      } else {
        alert(data.tracking_code === null
          ? 'O código de rastreio ainda não foi atribuído pelo SuperFrete. Tente novamente em alguns minutos.'
          : (data.error || 'Código não disponível'));
      }
    } catch {
      alert('Erro ao conectar com a Edge Function.');
    } finally {
      setFetchingCodeIds(prev => prev.filter(id => id !== sale.id));
    }
  };

  const updateAll = async (onlyIds?: string[]) => {
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    setUpdating(true);

    try {
      const ids = onlyIds ?? salesRef.current.map(s => s.id);

      // Captura os tracking codes antes das operações async para evitar closure stale
      const toTrack = ids
        .map(id => ({ id, tracking_code: salesRef.current.find(s => s.id === id)?.tracking_code }))
        .filter((t): t is { id: string; tracking_code: string } => !!t.tracking_code?.trim());

      // Marca todos como carregando simultaneamente
      setSales(prev => prev.map(s =>
        toTrack.find(t => t.id === s.id) ? { ...s, tracking_loading: true } : s
      ));

      // Dispara todas as requisições em paralelo
      await Promise.all(toTrack.map(async ({ id, tracking_code }) => {
        const result = await fetchTracking(tracking_code);

        setSales(prev => prev.map(s => s.id === id ? {
          ...s,
          tracking_loading: false,
          status: result.status,
          lastEvent: result.event ?? undefined,
          tracking_error: result.error,
        } : s));

        // Persiste entrega no banco para o filtro de 5 dias funcionar entre sessões
        if (result.status === 'entregue') {
          await supabase.from('sales').update({
            shipping_status: 'Entregue',
            delivered_at: new Date().toISOString(),
          }).eq('id', id);
        }
      }));

      setLastUpdated(new Date());
    } finally {
      setUpdating(false);
      isUpdatingRef.current = false;
    }
  };

  const emAndamento = sales.filter(s => s.status !== 'entregue');
  const entregues = sales.filter(s => s.status === 'entregue');

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-t-transparent border-orange-500 rounded-full animate-spin" />
    </div>
  );

  const renderCard = (sale: Sale, compact: boolean) => {
    const cfg = STATUS_CONFIG[sale.status];
    const StatusIcon = cfg.icon;
    const isEntregue = sale.status === 'entregue';
    const isFetching = fetchingCodeIds.includes(sale.id);
    const hasCode = !!(sale.tracking_code && sale.tracking_code.trim() !== '');

    const address = [
      sale.address_street,
      sale.address_number,
      sale.address_complement,
      sale.neighborhood,
      `${sale.city}/${sale.state}`,
    ].filter(Boolean).join(', ');

    return (
      <div
        key={sale.id}
        className={`rounded-xl transition-all ${compact ? 'p-3.5' : 'p-5'}`}
        style={{
          background: isEntregue ? 'rgba(22,101,52,0.08)' : 'var(--bg-card)',
          border: `1px solid ${isEntregue ? 'rgba(22,101,52,0.28)' : 'var(--border-main)'}`,
          borderLeft: `4px solid ${cfg.leftColor}`,
        }}
      >
        {/* Cliente + status chip */}
        <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
          <div className="min-w-0">
            <p className={`font-semibold truncate ${compact ? 'text-sm' : 'text-base'}`} style={{ color: 'var(--text-primary)' }}>
              {sale.customer_name}
            </p>
            <p className={`text-xs mt-0.5 truncate ${compact ? 'text-gray-600' : 'text-gray-500'}`}>
              {address}
            </p>
            {sale.productLabel && (
              <p className={`text-xs mt-1 truncate font-medium ${compact ? 'text-gray-600' : 'text-gray-400'}`}>
                📦 {sale.productLabel}
              </p>
            )}
          </div>
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${cfg.color}`}
            style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
            <span>{cfg.emoji}</span>
            <span>{cfg.label}</span>
          </span>
        </div>

        {/* Código de rastreio */}
        <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${compact ? 'mb-2' : 'mb-3'}`}
          style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 mb-0.5">Rastreio</p>
            {hasCode ? (
              <p className="text-sm font-mono font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>{sale.tracking_code}</p>
            ) : (
              <p className="text-sm text-gray-600 italic">Código não disponível</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {/* Mostra botão sempre que não tem código mas tem etiqueta gerada */}
            {!hasCode && sale.shipping_label_url && (
              <button
                onClick={() => fetchCode(sale)}
                disabled={isFetching}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-blue-600/30"
              >
                {isFetching
                  ? <span className="w-3 h-3 border border-t-transparent border-blue-400 rounded-full animate-spin inline-block" />
                  : '🔄'}
                <span>{isFetching ? 'Buscando...' : 'Buscar Código'}</span>
              </button>
            )}
            {hasCode ? (
              <a
                href={`https://seurastreio.com.br/objetos/${sale.tracking_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded text-gray-500 hover:text-orange-400 hover:bg-white/10 transition-colors"
                title="Abrir no Seu Rastreio"
              >
                <ExternalLink size={14} />
              </a>
            ) : sale.shipping_label_url ? (
              <a
                href={sale.shipping_label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-white/10 transition-colors"
                title="Abrir etiqueta no SuperFrete"
              >
                <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        </div>

        {/* Evento de rastreamento */}
        {sale.tracking_loading ? (
          <div className="flex items-center gap-2 py-1.5">
            <div className="w-3.5 h-3.5 border-2 border-t-transparent border-orange-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Buscando rastreamento...</span>
          </div>
        ) : sale.tracking_error ? (
          <div className="flex items-center gap-1.5 text-red-400 text-xs py-1">
            <AlertCircle size={13} />
            <span>Falha ao buscar{sale.tracking_error !== 'Erro ao rastrear' ? ` (${sale.tracking_error})` : ''} — clique em Atualizar para tentar novamente</span>
          </div>
        ) : sale.lastEvent ? (
          <div className="rounded-lg p-3" style={{
              background: isEntregue ? 'rgba(22,101,52,0.08)' : 'var(--bg-inner)',
              border: `1px solid ${isEntregue ? 'rgba(22,101,52,0.25)' : 'var(--border-main)'}`,
            }}>
            {/* Descrição */}
            <div className="flex items-start gap-1.5 mb-1.5">
              <StatusIcon size={12} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
              <p className={`text-xs font-semibold leading-snug ${cfg.color}`}>{sale.lastEvent.description}</p>
            </div>
            {/* Detalhe adicional */}
            {sale.lastEvent.detail && !sale.lastEvent.detail.includes('<') && (
              <p className="text-xs text-gray-400 mb-2 pl-[18px] leading-snug">{sale.lastEvent.detail}</p>
            )}
            {/* Local → Destino */}
            {(sale.lastEvent.location || sale.lastEvent.destination) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5 pl-[18px]">
                {sale.lastEvent.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={10} className="flex-shrink-0" />
                    <span>{sale.lastEvent.location}</span>
                  </span>
                )}
                {sale.lastEvent.location && sale.lastEvent.destination && (
                  <span className="text-gray-700">→</span>
                )}
                {sale.lastEvent.destination && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <MapPin size={10} className="flex-shrink-0" />
                    <span>{sale.lastEvent.destination}</span>
                  </span>
                )}
              </div>
            )}
            {/* Data e hora */}
            <p className="text-xs text-gray-600 pl-[18px]">{formatEventDate(sale.lastEvent.date)}</p>
          </div>
        ) : !compact ? (
          <p className="text-xs text-gray-600 py-1 italic">
            {hasCode
              ? 'Clique em "Atualizar Rastreamentos" para buscar o status'
              : 'Código de rastreio ainda não disponível'}
          </p>
        ) : null}

        {/* Rodapé */}
        <p className={`text-xs text-gray-700 ${compact ? 'mt-2' : 'mt-3'}`}>
          {formatSaleDate(sale.sale_date)}
        </p>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-orange-400 flex-shrink-0" size={28} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Rastreamento SEDEX</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {sales.length} {sales.length === 1 ? 'envio' : 'envios'} pelos Correios
              {lastUpdated && (
                <span> · Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <button
            onClick={() => updateAll()}
            disabled={updating || sales.length === 0}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <RefreshCw size={15} className={updating ? 'animate-spin' : ''} />
            {updating ? 'Atualizando...' : 'Atualizar Rastreamentos'}
          </button>
          {!updating && lastUpdated && emAndamento.some(s => s.tracking_code?.trim()) && (
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <Clock size={10} />
              Próxima em {formatCountdown(countdown)}
            </p>
          )}
        </div>
      </div>

      {/* Empty state */}
      {sales.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <PackageSearch size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium mb-1">Nenhum envio pelos Correios encontrado</p>
          <p className="text-sm">Vendas com delivery_type = 'correios' e etiqueta gerada aparecerão aqui</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">

          {/* Seção Em andamento */}
          {emAndamento.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>🚚 Em andamento</h2>
                <span className="bg-orange-500/15 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full border border-orange-500/25">
                  {emAndamento.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {emAndamento.map(sale => renderCard(sale, false))}
              </div>
            </div>
          )}

          {/* Separador */}
          {emAndamento.length > 0 && entregues.length > 0 && (
            <hr style={{ borderColor: 'var(--border-main)' }} />
          )}

          {/* Seção Entregues */}
          {entregues.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>✅ Entregues</h2>
                <span className="bg-green-500/15 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/25">
                  {entregues.length}
                </span>
                <span className="text-xs text-gray-600">últimos {DELIVERED_HIDE_DAYS} dias</span>
              </div>
              <div className="flex flex-col gap-3">
                {entregues.map(sale => renderCard(sale, true))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
