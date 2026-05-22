import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Truck, CheckCircle, CheckSquare, Calendar, Bike, CreditCard, X } from 'lucide-react';
import { getTodayInBrazil, formatDateDisplay } from '../lib/dateUtils';

interface Sale {
  id: string;
  customer_name: string;
  neighborhood: string;
  city: string;
  total_sale_price: number;
  payment_method: string;
  status: string;
  sale_date: string;
  updated_at?: string;
  finalized_at?: string;
  motoboy_id: string | null;
  motoboy?: { name: string };
  products: Array<{ model: string; color: string }>;
}

type LogisticsColumn = 'para_embalar' | 'embalado' | 'saiu_entrega' | 'concluido';

export default function Logistics() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedSale, setDraggedSale] = useState<Sale | null>(null);
  const [currentDate, setCurrentDate] = useState(getTodayInBrazil());
  const [activeMotoboy, setActiveMotoboy] = useState<string>('all');

  useEffect(() => {
    if (activeMotoboy !== 'all') {
      const stillActive = sales.some(s => s.motoboy_id === activeMotoboy && s.status !== 'finalizado');
      if (!stillActive) setActiveMotoboy('all');
    }
  }, [sales, activeMotoboy]);

  useEffect(() => {
    loadSales();

    const checkDateChange = setInterval(() => {
      const newDate = getTodayInBrazil();
      if (newDate !== currentDate) {
        setCurrentDate(newDate);
        loadSales();
      }
    }, 60000);

    return () => clearInterval(checkDateChange);
  }, [currentDate]);

  const loadSales = async () => {
    try {
      const today = getTodayInBrazil();
      const todayStartUTC = `${today}T03:00:00.000Z`;
      const [y, m, d] = today.split('-').map(Number);
      const tomorrowStartUTC = `${new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0]}T03:00:00.000Z`;
      const fields = '*, sale_items(quantity, product_id, products(model, color, category)), motoboys(name)';

      const [pendingRes, finalizadoRes] = await Promise.all([
        // Pendentes: todos os não-finalizados, qualquer data
        supabase.from('sales').select(fields)
          .in('status', ['em_separacao', 'embalado', 'em_rota'])
          .eq('delivery_type', 'motoboy')
          .order('sale_date', { ascending: false }),
        // Finalizados: só do dia de hoje — filtra por finalized_at (imutável, não carimbado por updates posteriores)
        supabase.from('sales').select(fields)
          .eq('status', 'finalizado')
          .eq('delivery_type', 'motoboy')
          .gte('finalized_at', todayStartUTC)
          .lt('finalized_at', tomorrowStartUTC)
          .order('finalized_at', { ascending: false }),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (finalizadoRes.error) throw finalizadoRes.error;

      const combined = [...(pendingRes.data || []), ...(finalizadoRes.data || [])]
        .sort((a: any, b: any) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());

      const salesWithDetails = combined.map((sale: any) => ({
        id: sale.id,
        customer_name: sale.customer_name,
        neighborhood: sale.neighborhood,
        city: sale.city || '',
        total_sale_price: sale.total_sale_price,
        payment_method: sale.payment_method,
        status: sale.status,
        sale_date: sale.sale_date,
        updated_at: sale.updated_at,
        finalized_at: sale.finalized_at,
        motoboy_id: sale.motoboy_id,
        products: (sale.sale_items || [])
          .filter((item: any) => item.products?.category === 'smartwatch')
          .map((item: any) => ({ model: item.products.model, color: item.products.color })),
        motoboy: sale.motoboys ? { name: sale.motoboys.name } : undefined,
      }));

      setSales(salesWithDetails);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLogisticsColumn = (status: string): LogisticsColumn => {
    if (status === 'em_separacao') return 'para_embalar';
    if (status === 'embalado') return 'embalado';
    if (status === 'em_rota') return 'saiu_entrega';
    if (status === 'finalizado') return 'concluido';
    return 'para_embalar';
  };

  const getSalesStatus = (column: LogisticsColumn): string => {
    if (column === 'para_embalar') return 'em_separacao';
    if (column === 'embalado') return 'embalado';
    if (column === 'saiu_entrega') return 'em_rota';
    if (column === 'concluido') return 'finalizado';
    return 'em_separacao';
  };

  const updateSaleStatus = async (saleId: string, newColumn: LogisticsColumn) => {
    const newStatus = getSalesStatus(newColumn);

    // Optimistic update: move o card imediatamente sem esperar o banco
    setSales(prevSales =>
      prevSales.map(sale =>
        sale.id === saleId ? { ...sale, status: newStatus } : sale
      )
    );

    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: newStatus })
        .eq('id', saleId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating sale status:', error);
      alert('Erro ao atualizar status do pedido');
      loadSales(); // restaura estado correto em caso de erro
    }
  };

  const handleFinalize = async (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    const isConcluindo = sale?.status === 'finalizado';
    const msg = isConcluindo ? 'Remover da logística?' : 'Marcar como finalizado?';
    if (!confirm(msg)) return;

    setSales(prev => prev.filter(s => s.id !== saleId));
    const newStatus = isConcluindo ? 'concluido' : 'finalizado';
    try {
      const { error } = await supabase.from('sales').update({ status: newStatus }).eq('id', saleId);
      if (error) throw error;
    } catch {
      alert('Erro ao atualizar pedido');
      loadSales();
    }
  };

  const handleDragStart = (sale: Sale) => {
    setDraggedSale(sale);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (column: LogisticsColumn) => {
    if (draggedSale) {
      updateSaleStatus(draggedSale.id, column);
      setDraggedSale(null);
    }
  };

  const formatPaymentMethod = (method: string): string => {
    const methods: Record<string, string> = {
      pix: 'PIX',
      cash: 'Dinheiro',
      debit_card: 'Débito',
      credit_card: 'Crédito',
    };
    return methods[method] || method;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="">Carregando...</div>
      </div>
    );
  }

  // Motoboys com entregas ainda não concluídas (derivado do estado compartilhado)
  const motoboyTabs = (() => {
    const seen = new Map<string, string>();
    for (const s of sales) {
      if (s.motoboy_id && s.status !== 'finalizado') {
        seen.set(s.motoboy_id, s.motoboy?.name || s.motoboy_id);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const countActive = (motoboyId: string) =>
    sales.filter(s => s.motoboy_id === motoboyId && s.status !== 'finalizado').length;

  const visibleSales = activeMotoboy === 'all'
    ? sales
    : sales.filter(s => s.motoboy_id === activeMotoboy);

  const paraEmbalar = visibleSales.filter(s => getLogisticsColumn(s.status) === 'para_embalar');
  const embalado    = visibleSales.filter(s => getLogisticsColumn(s.status) === 'embalado');
  const saiuEntrega = visibleSales.filter(s => getLogisticsColumn(s.status) === 'saiu_entrega');
  const concluido   = visibleSales
    .filter(s => getLogisticsColumn(s.status) === 'concluido')
    .sort((a: any, b: any) => new Date(b.finalized_at || b.sale_date).getTime() - new Date(a.finalized_at || a.sale_date).getTime());

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Logística</h1>
        <div className="flex items-center gap-2 text-gray-400">
          <Calendar size={18} />
          <span>Pedidos pendentes — {formatDateDisplay(currentDate)}</span>
        </div>
      </div>

      {/* Filtro por motoboy */}
      <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-xl p-1 mb-6 flex-wrap">
        <button
          onClick={() => setActiveMotoboy('all')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeMotoboy === 'all' ? 'bg-orange-500' : 'text-gray-400'}`}
        >
          Geral
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${activeMotoboy === 'all' ? 'bg-orange-600' : 'bg-gray-700 text-gray-300'}`}>
            {sales.filter(s => s.status !== 'finalizado').length}
          </span>
        </button>
        {motoboyTabs.map(mb => (
          <button
            key={mb.id}
            onClick={() => setActiveMotoboy(mb.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeMotoboy === mb.id ? 'bg-blue-600' : 'text-gray-400'}`}
          >
            <Bike size={13} />
            {mb.name}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${activeMotoboy === mb.id ? 'bg-blue-700' : 'bg-gray-700 text-gray-300'}`}>
              {countActive(mb.id)}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <KanbanColumn
          title="Para Embalar"
          icon={Package}
          color="orange"
          sales={paraEmbalar}
          column="para_embalar"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFinalize={handleFinalize}
          formatPaymentMethod={formatPaymentMethod}
        />
        <KanbanColumn
          title="Embalado"
          icon={CheckSquare}
          color="yellow"
          sales={embalado}
          column="embalado"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFinalize={handleFinalize}
          formatPaymentMethod={formatPaymentMethod}
        />
        <KanbanColumn
          title="Saiu para Entrega"
          icon={Truck}
          color="blue"
          sales={saiuEntrega}
          column="saiu_entrega"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFinalize={handleFinalize}
          formatPaymentMethod={formatPaymentMethod}
        />
        <KanbanColumn
          title="Concluído"
          icon={CheckCircle}
          color="green"
          sales={concluido}
          column="concluido"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFinalize={handleFinalize}
          formatPaymentMethod={formatPaymentMethod}
        />
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  title: string;
  icon: React.ElementType;
  color: string;
  sales: Sale[];
  column: LogisticsColumn;
  onDragStart: (sale: Sale) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (column: LogisticsColumn) => void;
  onFinalize: (saleId: string) => void;
  formatPaymentMethod: (method: string) => string;
}

function KanbanColumn({
  title,
  icon: Icon,
  color,
  sales,
  column,
  onDragStart,
  onDragOver,
  onDrop,
  onFinalize,
  formatPaymentMethod,
}: KanbanColumnProps) {
  const colorClasses = {
    orange: 'bg-orange-500/20 border-orange-500 text-orange-500',
    yellow: 'bg-yellow-500/20 border-yellow-500 text-yellow-500',
    blue: 'bg-blue-500/20 border-blue-500 text-blue-500',
    green: 'bg-green-500/20 border-green-500 text-green-500',
  };

  const bgClasses = {
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
  };

  return (
    <div
      className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
      onDragOver={onDragOver}
      onDrop={() => onDrop(column)}
    >
      <div className={`px-4 py-3 border-b border-gray-700 ${colorClasses[color as keyof typeof colorClasses]}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={20} />
            <h2 className="font-bold">{title}</h2>
          </div>
          <div className={`px-2 py-1 rounded-full text-sm font-bold ${bgClasses[color as keyof typeof bgClasses]}`}>
            {sales.length}
          </div>
        </div>
      </div>

      <div className="p-2.5 space-y-2 min-h-[200px] max-h-[calc(100vh-250px)] overflow-y-auto">
        {sales.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">
            Nenhum pedido nesta etapa
          </div>
        ) : (
          sales.map((sale) => (
            <div
              key={sale.id}
              draggable
              onDragStart={() => onDragStart(sale)}
              className="relative bg-gray-900 rounded-lg p-2.5 border border-gray-700 cursor-move hover:border-orange-500 transition-colors space-y-1.5"
            >
              <button
                onClick={e => { e.stopPropagation(); onFinalize(sale.id); }}
                className="absolute top-1.5 right-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors p-0.5"
                title="Finalizar pedido"
              >
                <X size={13} />
              </button>
              {/* Cliente + localização */}
              <div className="pr-4">
                <h3 className="text-sm font-bold leading-tight">{sale.customer_name}</h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  {sale.neighborhood}{sale.city ? ` · ${sale.city}` : ''}
                </p>
              </div>

              {/* Smartwatch principal */}
              {sale.products.length > 0 && (
                <div className="flex items-center gap-1 text-orange-300 text-xs font-medium">
                  <Package size={11} className="flex-shrink-0" />
                  <span>{sale.products[0].model} {sale.products[0].color}</span>
                </div>
              )}

              {/* Valor + pagamento */}
              <div className="flex items-center justify-between">
                <span className="text-green-400 font-bold text-base">
                  R$ {sale.total_sale_price.toFixed(0)}
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold bg-gray-700 text-gray-200 px-2 py-0.5 rounded-full">
                  <CreditCard size={10} />
                  {formatPaymentMethod(sale.payment_method)}
                </span>
              </div>

              {/* Motoboy */}
              {sale.motoboy ? (
                <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 rounded px-2 py-1">
                  <Bike size={12} className="text-blue-400 flex-shrink-0" />
                  <span className="text-blue-300 text-xs font-semibold">{sale.motoboy.name}</span>
                </div>
              ) : column !== 'para_embalar' ? (
                <div className="flex items-center gap-1.5 bg-gray-700/50 border border-gray-600 rounded px-2 py-1">
                  <Bike size={12} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500 text-xs italic">Sem motoboy atribuído</span>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
