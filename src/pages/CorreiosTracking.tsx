import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Truck, RefreshCw, CheckCircle, AlertCircle, Clock, Package } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface TrackedSale {
  id: string;
  customer_name: string;
  city: string;
  neighborhood: string;
  tracking_code: string;
  shipping_status: string | null;
  sale_date: string;
  updating?: boolean;
  error?: string;
}

function ShippingStatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-gray-500 italic">Sem status</span>;
  }
  const s = status.toLowerCase();
  const isDelivered = s.includes('entregue');
  const isOut       = s.includes('saiu para entrega');
  const isTransit   = s.includes('trânsito') || s.includes('transito') || s.includes('transferência');
  const isReturn    = s.includes('devolvido');
  const isAttempt   = s.includes('tentativa');
  const isWaiting   = s.includes('aguardando');

  const cfg = isDelivered ? { icon: '✅', cls: 'bg-green-500/20 text-green-400 border-green-500/40' }
    : isOut        ? { icon: '🚚', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' }
    : isTransit    ? { icon: '📮', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' }
    : isReturn     ? { icon: '↩️', cls: 'bg-red-500/20 text-red-400 border-red-500/40' }
    : isAttempt    ? { icon: '⚠️', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' }
    : isWaiting    ? { icon: '📬', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/40' }
    : { icon: '🏷️', cls: 'bg-gray-700/60 text-gray-300 border-gray-600' };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <span>{cfg.icon}</span>
      <span>{status}</span>
    </div>
  );
}

export default function CorreiosTracking() {
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [loading, setLoading]   = useState(true);
  const [updatingAll, setUpdatingAll] = useState(false);

  useEffect(() => { loadTrackedSales(); }, []);

  const loadTrackedSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, customer_name, city, neighborhood, tracking_code, shipping_status, sale_date')
        .eq('delivery_type', 'correios')
        .not('tracking_code', 'is', null)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      setSales((data || []) as TrackedSale[]);
    } catch (err) {
      console.error('Erro ao carregar vendas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndSaveStatuses = async (targets: TrackedSale[]) => {
    if (targets.length === 0) return;

    // Marca como "atualizando" visualmente
    setSales(prev =>
      prev.map(s => targets.some(t => t.id === s.id) ? { ...s, updating: true, error: undefined } : s)
    );

    const tracking_codes = targets.map(t => t.tracking_code);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/track-shipment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracking_codes }),
      });

      const data = await resp.json();

      if (!data.success) throw new Error(data.error || 'Erro na edge function');

      // Salva cada resultado no banco e atualiza estado local
      await Promise.all(
        (data.results as { code: string; status: string; error?: string }[]).map(async (result) => {
          const sale = targets.find(t => t.tracking_code === result.code);
          if (!sale) return;

          if (result.error || !result.status) {
            setSales(prev =>
              prev.map(s =>
                s.id === sale.id
                  ? { ...s, updating: false, error: result.error || 'Sem resposta da API' }
                  : s
              )
            );
            return;
          }

          await supabase
            .from('sales')
            .update({ shipping_status: result.status })
            .eq('id', sale.id);

          setSales(prev =>
            prev.map(s =>
              s.id === sale.id
                ? { ...s, shipping_status: result.status, updating: false, error: undefined }
                : s
            )
          );
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setSales(prev =>
        prev.map(s =>
          targets.some(t => t.id === s.id)
            ? { ...s, updating: false, error: message }
            : s
        )
      );
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    const toUpdate = sales.filter(s => !s.updating);
    await fetchAndSaveStatuses(toUpdate);
    setUpdatingAll(false);
  };

  const handleUpdateOne = (sale: TrackedSale) => {
    fetchAndSaveStatuses([sale]);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const delivered  = sales.filter(s => s.shipping_status?.toLowerCase().includes('entregue'));
  const inProgress = sales.filter(s => !s.shipping_status?.toLowerCase().includes('entregue'));

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500" />
          Carregando rastreamentos...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Rastreamento SEDEX</h1>
          <p className="text-gray-400">
            {sales.length} pacote{sales.length !== 1 ? 's' : ''} com código de rastreio •{' '}
            <span className="text-green-400 font-medium">{delivered.length} entregue{delivered.length !== 1 ? 's' : ''}</span>
            {inProgress.length > 0 && (
              <span className="text-blue-400 font-medium"> • {inProgress.length} em andamento</span>
            )}
          </p>
        </div>

        <button
          onClick={handleUpdateAll}
          disabled={updatingAll || sales.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          <RefreshCw size={16} className={updatingAll ? 'animate-spin' : ''} />
          {updatingAll ? 'Atualizando...' : 'Atualizar Rastreamentos'}
        </button>
      </div>

      {sales.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
          <Package size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Nenhum pacote rastreável</h3>
          <p className="text-gray-400">
            Gere etiquetas Correios no Histórico de Vendas para que os rastreamentos apareçam aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map(sale => (
            <div
              key={sale.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-wrap items-center gap-4"
            >
              {/* Ícone + info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Truck size={20} className="text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{sale.customer_name}</p>
                  <p className="text-gray-400 text-xs truncate">
                    {sale.neighborhood} · {sale.city} · {formatDate(sale.sale_date)}
                  </p>
                  <p className="text-gray-500 text-xs font-mono mt-0.5">🔍 {sale.tracking_code}</p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3 flex-wrap">
                {sale.updating ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-400" />
                    Consultando...
                  </div>
                ) : sale.error ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle size={13} />
                    <span className="max-w-[200px] truncate" title={sale.error}>{sale.error}</span>
                  </div>
                ) : (
                  <ShippingStatusPill status={sale.shipping_status} />
                )}

                <button
                  onClick={() => handleUpdateOne(sale)}
                  disabled={sale.updating || updatingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 bg-gray-700 hover:bg-gray-600 text-gray-200"
                >
                  <RefreshCw size={12} className={sale.updating ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legenda de status */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-4">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Como o status é salvo</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs text-gray-400">
          <div className="flex items-center gap-1.5"><span>🏷️</span> Etiqueta gerada</div>
          <div className="flex items-center gap-1.5"><span>📮</span> Em trânsito - Cidade/UF</div>
          <div className="flex items-center gap-1.5"><span>🚚</span> Saiu para entrega</div>
          <div className="flex items-center gap-1.5"><span>✅</span> Entregue - DD/MM</div>
          <div className="flex items-center gap-1.5"><span>⚠️</span> Tentativa de entrega</div>
          <div className="flex items-center gap-1.5"><span>📬</span> Aguardando retirada</div>
          <div className="flex items-center gap-1.5"><span>↩️</span> Devolvido ao remetente</div>
        </div>
      </div>
    </div>
  );
}
