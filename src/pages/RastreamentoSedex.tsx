import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { supabase } from '../lib/supabase';
import {
  PackageSearch, RefreshCw, Package, Truck, MapPin,
  CheckCircle, Clock, ExternalLink, AlertCircle,
} from 'lucide-react';

type Filter = 'todos' | 'em_andamento' | 'entregues';
type TrackingStatus = 'sem_info' | 'postado' | 'em_transito' | 'saiu_entrega' | 'entregue';

interface TrackingEvent {
  date: string;
  description: string;
  location: string;
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
  sale_date: string;
  status: TrackingStatus;
  lastEvent?: TrackingEvent;
  tracking_loading: boolean;
  tracking_error?: string;
}

interface StatusCfg {
  label: string;
  emoji: string;
  color: string;
  bg: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

const STATUS_CONFIG: Record<TrackingStatus, StatusCfg> = {
  sem_info:     { label: 'Sem informação',  emoji: '❓', color: 'text-gray-400',   bg: 'bg-gray-900',        icon: Clock        },
  postado:      { label: 'Postado',         emoji: '📦', color: 'text-blue-400',   bg: 'bg-blue-900/10',     icon: Package      },
  em_transito:  { label: 'Em trânsito',     emoji: '🚚', color: 'text-amber-400',  bg: 'bg-amber-900/10',    icon: Truck        },
  saiu_entrega: { label: 'Saiu p/ entrega', emoji: '🛵', color: 'text-orange-400', bg: 'bg-orange-900/10',   icon: MapPin       },
  entregue:     { label: 'Entregue',        emoji: '✅', color: 'text-green-400',  bg: 'bg-green-900/10',    icon: CheckCircle  },
};

function inferStatus(events: TrackingEvent[]): TrackingStatus {
  if (!events.length) return 'sem_info';
  const desc = events[0].description.toLowerCase();
  if (desc.includes('entregue ao destinatário') || desc.includes('entregue')) return 'entregue';
  if (
    desc.includes('saiu para entrega') ||
    desc.includes('em rota de entrega') ||
    desc.includes('tentativa de entrega')
  ) return 'saiu_entrega';
  if (desc.includes('postado') && events.length === 1) return 'postado';
  return 'em_transito';
}

async function fetchTracking(
  code: string,
): Promise<{ events: TrackingEvent[]; status: TrackingStatus; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://api.linkcorreios.com.br/?id=${code}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    // API may return array or object with various keys
    const list: any[] = Array.isArray(raw)
      ? raw
      : (raw?.events || raw?.eventos || raw?.data || []);

    const events: TrackingEvent[] = list
      .map((e: any) => ({
        date: [e.date || e.data, e.hour || e.hora].filter(Boolean).join(' '),
        description: e.description || e.descricao || e.status || '',
        location: e.city
          ? `${e.city}${e.state ? `/${e.state}` : ''}`
          : (e.local || e.localidade || ''),
      }))
      .filter(e => e.description);

    return { events, status: inferStatus(events) };
  } catch (err: any) {
    return { events: [], status: 'sem_info', error: err?.name === 'AbortError' ? 'Tempo esgotado' : (err?.message || 'Erro ao rastrear') };
  }
}

export default function RastreamentoSedex() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<Filter>('todos');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => { loadSales(); }, []);

  const loadSales = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sales')
      .select('id, customer_name, address_street, address_number, address_complement, neighborhood, city, state, tracking_code, shipping_label_url, sale_date')
      .eq('delivery_type', 'correios')
      .eq('shipping_status', 'Etiqueta gerada')
      .order('sale_date', { ascending: false });

    setSales(
      (data || []).map(s => ({
        ...s,
        status: 'sem_info' as TrackingStatus,
        tracking_loading: false,
      }))
    );
    setLoading(false);
  };

  const updateAll = async () => {
    setUpdating(true);
    const ids = sales.map(s => s.id);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const tracking_code = sales.find(s => s.id === id)?.tracking_code;
      if (!tracking_code || tracking_code.trim() === '') continue; // sem código = pula

      setSales(prev => prev.map(s => s.id === id ? { ...s, tracking_loading: true } : s));
      const result = await fetchTracking(tracking_code);
      setSales(prev => prev.map(s => s.id === id ? {
        ...s,
        tracking_loading: false,
        status: result.status,
        lastEvent: result.events[0],
        tracking_error: result.error,
      } : s));

      if (i < ids.length - 1) await new Promise(r => setTimeout(r, 350));
    }

    setLastUpdated(new Date());
    setUpdating(false);
  };

  const filtered = sales.filter(s => {
    if (filter === 'entregues') return s.status === 'entregue';
    if (filter === 'em_andamento') return s.status !== 'entregue' && s.status !== 'sem_info';
    return true;
  });

  const counts = {
    todos: sales.length,
    em_andamento: sales.filter(s => s.status !== 'entregue' && s.status !== 'sem_info').length,
    entregues: sales.filter(s => s.status === 'entregue').length,
  };

  const FILTER_TABS: { id: Filter; label: string }[] = [
    { id: 'todos',        label: 'Todos'        },
    { id: 'em_andamento', label: 'Em andamento' },
    { id: 'entregues',    label: 'Entregues'    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-t-transparent border-orange-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 md:p-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-orange-400 flex-shrink-0" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">Rastreamento SEDEX</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {sales.length} {sales.length === 1 ? 'envio' : 'envios'} pelos Correios
              {lastUpdated && (
                <span> · Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={updateAll}
          disabled={updating || sales.length === 0}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
        >
          <RefreshCw size={15} className={updating ? 'animate-spin' : ''} />
          {updating ? 'Atualizando...' : 'Atualizar Rastreamentos'}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              filter === tab.id ? 'bg-orange-600' : 'bg-gray-700 text-gray-300'
            }`}>
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {sales.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <PackageSearch size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium mb-1">Nenhum envio pelos Correios encontrado</p>
          <p className="text-sm">Vendas com delivery_type = 'correios' e código de rastreio aparecerão aqui</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <PackageSearch size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum envio neste filtro</p>
        </div>
      ) : (

        /* Grid de cards */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(sale => {
            const cfg = STATUS_CONFIG[sale.status];
            const StatusIcon = cfg.icon;
            const isEntregue = sale.status === 'entregue';

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
                className={`rounded-xl border p-5 transition-all ${cfg.bg} ${
                  isEntregue
                    ? 'border-green-600/50'
                    : 'border-gray-700'
                }`}
              >
                {/* Cliente + status chip */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{sale.customer_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{address}</p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${cfg.color} bg-black/20 border border-white/5`}>
                    <span>{cfg.emoji}</span>
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Código de rastreio */}
                <div className="flex items-center justify-between mb-3 py-2.5 px-3 rounded-lg bg-black/25 border border-white/5">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Rastreio</p>
                    {sale.tracking_code && sale.tracking_code.trim() !== '' ? (
                      <p className="text-sm font-mono font-bold text-white tracking-wide">{sale.tracking_code}</p>
                    ) : (
                      <p className="text-sm text-gray-600 italic">Etiqueta gerada — código não disponível</p>
                    )}
                  </div>
                  {sale.tracking_code && sale.tracking_code.trim() !== '' ? (
                    <a
                      href={`https://rastreamento.correios.com.br/app/index.php?objeto=${sale.tracking_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-gray-500 hover:text-orange-400 hover:bg-white/10 transition-colors"
                      title="Abrir no site dos Correios"
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

                {/* Status do rastreamento */}
                {sale.tracking_loading ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-3.5 h-3.5 border-2 border-t-transparent border-orange-500 rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Buscando rastreamento...</span>
                  </div>
                ) : sale.tracking_error ? (
                  <div className="flex items-center gap-1.5 text-red-400 text-xs py-1">
                    <AlertCircle size={13} />
                    <span>Falha ao buscar — tente atualizar novamente</span>
                  </div>
                ) : sale.lastEvent ? (
                  <div className={`rounded-lg p-3 ${isEntregue ? 'bg-green-900/20 border border-green-800/30' : 'bg-black/20 border border-white/5'}`}>
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <StatusIcon size={12} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                      <p className={`text-xs font-semibold leading-snug ${cfg.color}`}>{sale.lastEvent.description}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>{sale.lastEvent.date}</span>
                      {sale.lastEvent.location && <span className="truncate text-right">{sale.lastEvent.location}</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 py-1 italic">
                    {sale.tracking_code && sale.tracking_code.trim() !== ''
                      ? 'Clique em "Atualizar Rastreamentos" para buscar o status'
                      : 'Código de rastreio ainda não disponível — verifique os logs da Edge Function'}
                  </p>
                )}

                {/* Rodapé */}
                <p className="text-xs text-gray-700 mt-3">
                  {(() => {
                    if (!sale.sale_date) return 'Data não disponível';
                    const d = new Date(sale.sale_date.includes('T') ? sale.sale_date : sale.sale_date + 'T00:00:00');
                    return isNaN(d.getTime()) ? 'Data não disponível' : `Venda em ${d.toLocaleDateString('pt-BR')}`;
                  })()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
