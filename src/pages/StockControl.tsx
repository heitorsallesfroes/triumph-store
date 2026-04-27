import { useEffect, useState } from 'react';
import { supabase, Product } from '../lib/supabase';
import { AlertTriangle, CheckCircle, Plus, Minus, History, Search, Package, ShoppingCart, RefreshCw } from 'lucide-react';

const MODEL_ORDER = [
  'GT5 Mini', 'Ultra 3 Mini', 'W11 Mini', 'S11 Pro', 'Ultra 4 Pro',
  'MA27 Ultra', 'M-Rex 4', 'HT 43 GPS', 'Zeblaze BTalk 3 GPS', 'HK-08 GPS', 'X5 Raptor GPS',
];
const COLOR_ORDER = ['Preto', 'Prata', 'Rose Gold'];

const modelRank = (model: string) => {
  const i = MODEL_ORDER.findIndex(m => model.includes(m));
  return i === -1 ? MODEL_ORDER.length : i;
};
const colorRank = (color: string) => {
  const i = COLOR_ORDER.findIndex(c => color.startsWith(c));
  return i === -1 ? COLOR_ORDER.length : i;
};
const sortProducts = (list: any[]) =>
  [...list].sort((a, b) => {
    const md = modelRank(a.model) - modelRank(b.model);
    if (md !== 0) return md;
    const cd = colorRank(a.color) - colorRank(b.color);
    if (cd !== 0) return cd;
    return (a.color || '').localeCompare(b.color || '');
  });

export default function StockControl() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'smartwatch' | 'acessorio'>('all');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementType, setMovementType] = useState<'entrada' | 'saida'>('entrada');
  const [movementQty, setMovementQty] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [savingMovement, setSavingMovement] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showBuyReport, setShowBuyReport] = useState(false);
  const [editingIdealStock, setEditingIdealStock] = useState<string | null>(null);
  const [idealStockValue, setIdealStockValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [showSyncErrors, setShowSyncErrors] = useState(false);
  const [showStockSummary, setShowStockSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [stockOrders, setStockOrders] = useState<any[]>([]);
  const [allStockOrders, setAllStockOrders] = useState<any[]>([]);
  const [allOrdersLoading, setAllOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'produtos' | 'encomendas'>('produtos');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'received'>('all');
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderQty, setOrderQty] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'venda' | 'entrada' | 'encomenda_recebida' | 'saida'>('all');
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState<'7' | '30' | '90' | 'all'>('all');
  const [allHistoryEvents, setAllHistoryEvents] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [salesVelocity, setSalesVelocity] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    loadProducts();
    loadStockOrders();
  }, []);

  useEffect(() => {
    if (activeTab === 'encomendas') loadAllStockOrders();
  }, [activeTab]);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('model', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
      loadSalesVelocity(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesVelocity = async (productList: any[]) => {
    const smartwatchIds = productList
      .filter((p: any) => p.category === 'smartwatch')
      .map((p: any) => p.id);
    if (smartwatchIds.length === 0) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { data: salesData } = await supabase
      .from('sales')
      .select('id')
      .gte('sale_date', cutoff.toISOString());

    const saleIds = (salesData || []).map((s: any) => s.id);
    if (saleIds.length === 0) { setSalesVelocity(new Map()); return; }

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('product_id, quantity')
      .in('sale_id', saleIds)
      .in('product_id', smartwatchIds);

    const totals = new Map<string, number>();
    for (const item of (itemsData || [])) {
      totals.set(item.product_id, (totals.get(item.product_id) || 0) + item.quantity);
    }

    const velocity = new Map<string, number>();
    for (const [id, total] of totals) {
      velocity.set(id, total / 30);
    }
    setSalesVelocity(velocity);
  };

  const getForecast = (product: any): { label: string; className: string } | null => {
    if ((product.category as string) !== 'smartwatch') return null;
    const rate = salesVelocity.get(product.id);
    if (!rate) return { label: '⚫ Sem dados', className: 'text-gray-500 bg-gray-500/10 border-gray-600/30' };
    const days = Math.floor(product.current_stock / rate);
    if (days < 10)  return { label: `🔴 ~${days}d`, className: 'text-red-400 bg-red-500/10 border-red-500/30' };
    if (days < 30)  return { label: `🟡 ~${days}d`, className: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' };
    return              { label: `🟢 ~${days}d`, className: 'text-green-400 bg-green-500/10 border-green-500/30' };
  };

  const loadStockOrders = async () => {
    const { data } = await supabase
      .from('stock_orders')
      .select('*')
      .eq('status', 'pending');
    setStockOrders(data || []);
  };

  const loadAllStockOrders = async () => {
    setAllOrdersLoading(true);
    const { data } = await supabase
      .from('stock_orders')
      .select('*')
      .order('created_at', { ascending: false });
    setAllStockOrders(data || []);
    setAllOrdersLoading(false);
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Cancelar esta encomenda pendente?')) return;
    await supabase.from('stock_orders').delete().eq('id', orderId);
    loadStockOrders();
    loadAllStockOrders();
  };

  const getPendingQty = (productId: string) =>
    stockOrders
      .filter(o => o.product_id === productId)
      .reduce((sum, o) => sum + (o.quantity || 0), 0);

  const handleAddOrder = async () => {
    if (!selectedProduct || !orderQty || parseInt(orderQty) <= 0) {
      alert('Informe uma quantidade válida');
      return;
    }
    setSavingOrder(true);
    try {
      const { error } = await supabase.from('stock_orders').insert([{
        product_id: selectedProduct.id,
        quantity: parseInt(orderQty),
        notes: orderNotes.trim() || null,
        status: 'pending',
      }]);
      if (error) throw error;
      alert('Encomenda registrada!');
      setShowOrderForm(false);
      setOrderQty('');
      setOrderNotes('');
      setSelectedProduct(null);
      loadStockOrders();
    } catch (err: any) {
      console.error('Erro ao registrar encomenda:', err);
      alert(`Erro ao registrar encomenda: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setSavingOrder(false);
    }
  };

  const loadHistory = async (product: any) => {
    setHistoryLoading(true);
    setAllHistoryEvents([]);
    setHistoryTypeFilter('all');
    setHistoryPeriodFilter('all');
    setHistoryPage(1);
    setSelectedProduct(product);
    setShowHistory(true);
    try {
      const [saleItemsRes, movementsRes] = await Promise.all([
        supabase
          .from('sale_items')
          .select('id, quantity, unit_price, sale_id, sales(id, customer_name, sale_date, status)')
          .eq('product_id', product.id),
        supabase
          .from('stock_movements')
          .select('*')
          .eq('product_id', product.id),
      ]);

      const events: any[] = [];

      (saleItemsRes.data || []).forEach((item: any) => {
        if (!item.sales?.sale_date) return;
        events.push({
          id: `sale-${item.id}`,
          type: 'venda',
          date: item.sales.sale_date,
          qty: item.quantity,
          delta: -item.quantity,
          customer: item.sales.customer_name,
          saleId: (item.sales.id || '').slice(0, 8).toUpperCase(),
          price: item.unit_price || 0,
        });
      });

      (movementsRes.data || []).forEach((m: any) => {
        events.push({
          id: `mov-${m.id}`,
          type: m.type,
          date: m.created_at,
          qty: m.quantity,
          delta: (m.type === 'entrada' || m.type === 'encomenda_recebida') ? m.quantity : -m.quantity,
          notes: m.notes,
        });
      });

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      let balance = product.current_stock;
      for (const event of events) {
        event.saldo = balance;
        balance -= event.delta;
      }

      setAllHistoryEvents(events);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleMovement = async () => {
    if (!selectedProduct || !movementQty || parseInt(movementQty) <= 0) {
      alert('Informe uma quantidade válida');
      return;
    }
    const qty = parseInt(movementQty);
    if (movementType === 'saida' && qty > selectedProduct.current_stock) {
      alert('Quantidade maior que o estoque disponível');
      return;
    }
    setSavingMovement(true);
    try {
      const novoEstoque = movementType === 'entrada'
        ? selectedProduct.current_stock + qty
        : selectedProduct.current_stock - qty;

      const { error } = await supabase
        .from('products')
        .update({ current_stock: novoEstoque })
        .eq('id', selectedProduct.id);
      if (error) throw error;

      const pendingForProduct = movementType === 'entrada'
        ? stockOrders.filter((o: any) => o.product_id === selectedProduct.id)
        : [];
      const isReceivingOrder = pendingForProduct.length > 0;
      const autoNotes = isReceivingOrder
        ? pendingForProduct.map((o: any) => o.notes).filter(Boolean).join(', ') || null
        : null;
      await supabase.from('stock_movements').insert([{
        product_id: selectedProduct.id,
        type: isReceivingOrder ? 'encomenda_recebida' : movementType,
        quantity: qty,
        notes: movementReason.trim() || autoNotes,
      }]);

      if (selectedProduct.tiny_id) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-tiny-stock`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tiny_id: selectedProduct.tiny_id, quantidade: novoEstoque }),
        });
      }

      // Abate received qty from pending orders (oldest first)
      if (movementType === 'entrada') {
        const pendingOrders = [...stockOrders]
          .filter(o => o.product_id === selectedProduct.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        let remaining = qty;
        for (const order of pendingOrders) {
          if (remaining <= 0) break;
          const apply = Math.min(remaining, order.quantity);
          remaining -= apply;
          const newQty = order.quantity - apply;
          if (newQty <= 0) {
            await supabase.from('stock_orders').update({ status: 'received', quantity: 0 }).eq('id', order.id);
          } else {
            await supabase.from('stock_orders').update({ quantity: newQty }).eq('id', order.id);
          }
        }
        loadStockOrders();
      }

      setShowMovementForm(false);
      setMovementQty('');
      setMovementReason('');
      setSelectedProduct(null);
      loadProducts();
      alert(`Estoque ${movementType === 'entrada' ? 'adicionado' : 'removido'} com sucesso!`);
    } catch (error) {
      alert('Erro ao atualizar estoque');
    } finally {
      setSavingMovement(false);
    }
  };

  const handleSaveIdealStock = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ ideal_stock: parseInt(idealStockValue) || 0 })
        .eq('id', productId);
      if (error) throw error;
      setEditingIdealStock(null);
      loadProducts();
    } catch (error) {
      alert('Erro ao salvar estoque ideal');
    }
  };

  const handleSyncTiny = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncErrors([]);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-tiny-stock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      console.log('sync-tiny-stock response:', data);
      if (data.success) {
        const msg = `✅ ${data.updated} atualizado(s), ${data.unchanged} sem alteração, ${data.total} total` +
          (data.errors?.length > 0 ? ` — ${data.errors.length} erro(s)` : '');
        setSyncResult(msg);
        if (data.errors?.length > 0) setSyncErrors(data.errors);
        if (data.updated > 0) loadProducts();
      } else {
        setSyncResult(`❌ Erro: ${data.error}`);
      }
    } catch (e: any) {
      setSyncResult(`❌ Erro ao conectar com a Edge Function: ${e?.message || ''}`);
    } finally {
      setSyncing(false);
    }
  };

  const filteredProducts = sortProducts(
    products.filter((p: any) => {
      const matchSearch = searchTerm === '' ||
        `${p.model} ${p.color}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchSearch && matchCategory;
    })
  );

  const aToBuyNet = (p: any) =>
    Math.max(0, (p.ideal_stock || 0) - p.current_stock - getPendingQty(p.id));

  const needsToBuy = products.filter((p: any) => aToBuyNet(p) > 0);
  const totalToBuy = needsToBuy.reduce((sum: number, p: any) => sum + aToBuyNet(p), 0);

  const getCanonicalModel = (model: string): string => {
    const match = MODEL_ORDER.find(m => model.includes(m));
    if (match) return match;
    return model.replace(/^Smartwatch\s+/i, '').trim();
  };

  const getVariant = (model: string, color: string): string => {
    const canonical = getCanonicalModel(model);
    const suffix = model.replace(/^Smartwatch\s+/i, '').replace(canonical, '').trim();
    const raw = suffix ? `${suffix} ${color}`.trim() : color;
    return raw.replace(/^\/\s*/, '').trim();
  };

  const buildWhatsAppSummary = (): string => {
    const MIN_STOCK = 5;
    const smartwatches = sortProducts(products.filter((p: any) => p.category === 'smartwatch'));

    const grouped = new Map<string, any[]>();
    for (const p of smartwatches) {
      const key = getCanonicalModel(p.model);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const today = new Date().toLocaleDateString('pt-BR');
    let text = `📦 *ESTOQUE SMARTWATCHES*\n📅 ${today}\n`;
    let totalStock = 0;
    let totalComprar = 0;

    for (const [modelKey, items] of grouped) {
      text += `\n*${modelKey}*\n`;
      for (const p of items) {
        const stock = p.current_stock ?? 0;
        const ideal = p.ideal_stock || MIN_STOCK;
        const pending = getPendingQty(p.id);
        const comprar = Math.max(0, ideal - stock - pending);
        const variant = getVariant(p.model, p.color);
        const emoji = stock <= 0 ? '🔴' : stock < ideal ? '🟡' : '🟢';
        const compraPart = comprar > 0 ? ` +${comprar}` : '';
        const pendingPart = pending > 0 ? ` (+${pending} a chegar)` : '';
        text += `▸ ${variant}: ${stock}${pendingPart} / ${ideal} ${emoji}${compraPart}\n`;
        totalStock += stock;
        totalComprar += comprar;
      }
    }

    text += `\n📊 *Total em estoque: ${totalStock} un*`;
    if (totalComprar > 0) text += `\n🛒 *Total a comprar: ${totalComprar} un*`;
    return text;
  };

  const handleCopyWhatsApp = () => {
    const grouped = products
      .filter((p: any) => p.category === 'smartwatch' && p.current_stock < (p.ideal_stock || 0))
      .reduce((acc: any, p: any) => {
        if (!acc[p.model]) acc[p.model] = [];
        acc[p.model].push(p);
        return acc;
      }, {});

    let totalUnits = 0;
    let text = '🛒 *LISTA DE COMPRAS*';

    Object.entries(grouped).forEach(([model, items]: [string, any]) => {
      text += `\n\n📦 *${model}*\n`;
      items.forEach((p: any) => {
        const qty = Math.max(0, (p.ideal_stock || 0) - p.current_stock);
        text += `- ${p.color} → ${qty} un\n`;
        totalUnits += qty;
      });
    });

    text += `\nTotal: ${totalUnits} unidades`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buyReportData = products
    .filter((p: any) => p.category === 'smartwatch' && p.current_stock < (p.ideal_stock || 0))
    .reduce((acc: any, p: any) => {
      if (!acc[p.model]) acc[p.model] = [];
      acc[p.model].push(p);
      return acc;
    }, {});

  const filteredHistoryEvents = allHistoryEvents.filter(event => {
    if (historyTypeFilter !== 'all' && event.type !== historyTypeFilter) return false;
    if (historyPeriodFilter !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(historyPeriodFilter));
      if (new Date(event.date) < cutoff) return false;
    }
    return true;
  });
  const HISTORY_PAGE_SIZE = 20;
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryEvents.length / HISTORY_PAGE_SIZE));
  const historyPageSafe = Math.min(historyPage, historyTotalPages);
  const paginatedHistoryEvents = filteredHistoryEvents.slice(
    (historyPageSafe - 1) * HISTORY_PAGE_SIZE,
    historyPageSafe * HISTORY_PAGE_SIZE
  );

  if (loading) {
    return <div className="p-8"><div className="text-white">Carregando...</div></div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Controle de Estoque</h1>
        <div className="flex items-center gap-3">
          {syncResult && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">{syncResult}</span>
              {syncErrors.length > 0 && (
                <button
                  onClick={() => setShowSyncErrors(true)}
                  className="text-xs text-red-400 hover:text-red-300 underline whitespace-nowrap"
                >
                  Ver erros
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => setShowStockSummary(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            📋 Resumo para WhatsApp
          </button>
          <button
            onClick={handleSyncTiny}
            disabled={syncing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar com Tiny'}
          </button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Total de Produtos</h3>
          <p className="text-3xl font-bold text-white">{products.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-red-500/50">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Abaixo do Ideal</h3>
          <p className="text-3xl font-bold text-red-500">{needsToBuy.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-green-500/50">
          <h3 className="text-gray-400 text-sm font-medium mb-2">No Ideal ou Acima</h3>
          <p className="text-3xl font-bold text-green-500">{products.length - needsToBuy.length}</p>
        </div>
        <button
          onClick={() => setShowBuyReport(true)}
          className="bg-gray-800 rounded-lg p-6 border border-orange-500/50 hover:border-orange-500 transition-colors text-left"
        >
          <h3 className="text-gray-400 text-sm font-medium mb-2">Total a Comprar</h3>
          <p className="text-3xl font-bold text-orange-500">{totalToBuy} unidades</p>
          <p className="text-orange-400 text-xs mt-2">Clique para ver relatório →</p>
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab('produtos')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'produtos' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          📦 Produtos
        </button>
        <button
          onClick={() => setActiveTab('encomendas')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'encomendas' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          📋 Histórico de Encomendas
          {stockOrders.length > 0 && (
            <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
              {stockOrders.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'encomendas' && (() => {
        const productMap = new Map(products.map((p: any) => [p.id, p]));
        const filtered = allStockOrders.filter(o =>
          orderStatusFilter === 'all' ? true : o.status === orderStatusFilter
        );
        const totalPending = allStockOrders
          .filter(o => o.status === 'pending')
          .reduce((sum, o) => sum + (o.quantity || 0), 0);

        return (
          <div>
            {/* Destaque de pendentes */}
            {totalPending > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-5 py-4 mb-5 flex items-center gap-4">
                <span className="text-3xl font-bold text-blue-400">{totalPending}</span>
                <div>
                  <p className="text-blue-300 font-semibold text-sm">unidades pendentes a caminho</p>
                  <p className="text-gray-500 text-xs">Total acumulado de todas as encomendas ainda não recebidas</p>
                </div>
              </div>
            )}

            {/* Filtro de status */}
            <div className="flex gap-2 mb-4">
              {(['all', 'pending', 'received'] as const).map(f => {
                const labels = { all: 'Todas', pending: '🟡 Pendentes', received: '✅ Recebidas' };
                return (
                  <button
                    key={f}
                    onClick={() => setOrderStatusFilter(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${orderStatusFilter === f ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>

            {/* Tabela */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {allOrdersLoading ? (
                <div className="py-16 text-center text-gray-400">Carregando encomendas...</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Package size={40} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-400">Nenhuma encomenda encontrada</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">Produto</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-gray-400 uppercase">Qtd</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">Observação</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">Data</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-gray-400 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filtered.map((order: any) => {
                      const p = productMap.get(order.product_id);
                      const isPending = order.status === 'pending';
                      return (
                        <tr key={order.id} className="hover:bg-gray-700/40">
                          <td className="px-5 py-3.5">
                            {p ? (
                              <>
                                <p className="text-white font-medium text-sm">{p.model}</p>
                                <p className="text-gray-400 text-xs">{p.color}</p>
                              </>
                            ) : (
                              <p className="text-gray-500 text-sm italic">Produto removido</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-lg font-bold text-white">{order.quantity}</span>
                            <span className="text-gray-500 text-xs ml-1">un</span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-300 text-sm">
                            {order.notes || <span className="text-gray-600 italic">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-gray-400 text-sm whitespace-nowrap">
                            {new Date(order.created_at).toLocaleDateString('pt-BR')}
                            <span className="text-gray-600 text-xs ml-1">
                              {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                                🟡 Pendente
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
                                ✅ Recebida
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {isPending && (
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                className="text-xs text-red-400 hover:text-red-300 hover:underline transition-colors"
                              >
                                Cancelar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-gray-600 text-xs mt-3 text-right">{filtered.length} encomenda{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        );
      })()}

      {activeTab === 'produtos' && <>

      {/* Filtros */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-lg pl-10 pr-4 py-2.5 border border-gray-700 focus:border-orange-500 focus:outline-none"
          />
        </div>
        {(['all', 'smartwatch', 'acessorio'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              categoryFilter === cat ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {cat === 'all' ? 'Todos' : cat === 'smartwatch' ? 'Smartwatches' : 'Acessórios'}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Produto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">SKU</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">Em Loja</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">A Chegar</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">Ideal</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">A Comprar</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">Previsão</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">Nenhum produto encontrado.</td>
              </tr>
            ) : (
              filteredProducts.map((product: any) => {
                const pending = getPendingQty(product.id);
                const aToBuy = aToBuyNet(product);
                const isLow = aToBuy > 0;
                return (
                  <tr key={product.id} className={`hover:bg-gray-700/50 ${isLow ? 'bg-red-500/5' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">{product.model}</div>
                      <div className="text-gray-400 text-sm">{product.color}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{product.sku || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-2xl font-bold ${isLow ? 'text-red-400' : 'text-white'}`}>
                        {product.current_stock}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {pending > 0 ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-blue-500/20 text-blue-400 border border-blue-500/50">
                          {pending}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {editingIdealStock === product.id ? (
                        <div className="flex items-center gap-2 justify-center">
                          <input
                            type="number"
                            min="0"
                            value={idealStockValue}
                            onChange={(e) => setIdealStockValue(e.target.value)}
                            className="w-20 bg-gray-700 text-white rounded px-2 py-1 border border-orange-500 text-center"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveIdealStock(product.id);
                              if (e.key === 'Escape') setEditingIdealStock(null);
                            }}
                          />
                          <button onClick={() => handleSaveIdealStock(product.id)} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                          <button onClick={() => setEditingIdealStock(null)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingIdealStock(product.id); setIdealStockValue(product.ideal_stock?.toString() || '0'); }}
                          className="text-xl font-bold text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {product.ideal_stock || 0}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {aToBuy > 0 ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-orange-500/20 text-orange-400 border border-orange-500/50">
                          <ShoppingCart size={14} /> {aToBuy}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                          <CheckCircle size={14} /> OK
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(() => {
                        const fc = getForecast(product);
                        if (!fc) return <span className="text-gray-600 text-sm">—</span>;
                        return (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${fc.className}`}>
                            {fc.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const pendingTotal = getPendingQty(product.id);
                            setSelectedProduct(product);
                            setMovementType('entrada');
                            setMovementQty(pendingTotal > 0 ? String(pendingTotal) : '');
                            setShowMovementForm(true);
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Plus size={14} /> Entrada
                        </button>
                        <button
                          onClick={() => { setSelectedProduct(product); setMovementType('saida'); setShowMovementForm(true); }}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Minus size={14} /> Saída
                        </button>
                        <button
                          onClick={() => { setSelectedProduct(product); setShowOrderForm(true); }}
                          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Package size={14} /> Encomenda
                        </button>
                        <button
                          onClick={() => loadHistory(product)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <History size={14} /> Histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      </> /* fim aba produtos */}

      {/* Modal lançamento */}
      {showMovementForm && selectedProduct && (() => {
        const pendingOrders = stockOrders
          .filter(o => o.product_id === selectedProduct.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const hasPending = movementType === 'entrada' && pendingOrders.length > 0;
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-2">
              {movementType === 'entrada' ? '➕ Entrada de Estoque' : '➖ Saída de Estoque'}
            </h2>
            <p className="text-gray-400 mb-1">{selectedProduct.model} {selectedProduct.color}</p>
            <p className="text-gray-300 mb-4">Estoque atual: <span className="text-white font-bold">{selectedProduct.current_stock}</span></p>

            {hasPending && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                <p className="text-blue-400 text-sm font-semibold mb-2">📦 Encomendas a caminho</p>
                <div className="space-y-1">
                  {pendingOrders.map(o => (
                    <div key={o.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">{o.notes || 'Sem observação'}</span>
                      <span className="text-blue-400 font-bold">{o.quantity} un</span>
                    </div>
                  ))}
                  <div className="border-t border-blue-500/30 mt-2 pt-2 flex justify-between text-sm font-semibold">
                    <span className="text-gray-300">Total a caminho:</span>
                    <span className="text-blue-400">{pendingOrders.reduce((s, o) => s + o.quantity, 0)} un</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {hasPending ? 'Quantidade recebida agora*' : 'Quantidade*'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="Ex: 10"
                  autoFocus={!hasPending}
                />
                {hasPending && (
                  <p className="text-gray-500 text-xs mt-1">
                    Entrada parcial permitida — o saldo restante da encomenda será mantido como pendente.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Motivo (opcional)</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="Ex: Compra de mercadoria"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleMovement}
                disabled={savingMovement}
                className={`flex-1 text-white px-4 py-2 rounded-lg font-medium transition-colors ${
                  movementType === 'entrada' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {savingMovement ? 'Salvando...' : 'Confirmar'}
              </button>
              <button
                onClick={() => { setShowMovementForm(false); setMovementQty(''); setMovementReason(''); }}
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal encomenda */}
      {showOrderForm && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-1">📦 Registrar Encomenda</h2>
            <p className="text-gray-400 mb-4">{selectedProduct.model} {selectedProduct.color}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Quantidade*</label>
                <input
                  type="number"
                  min="1"
                  value={orderQty}
                  onChange={e => setOrderQty(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="Ex: 10"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Observação (opcional)</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="Ex: Pedido fornecedor 24/04"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddOrder}
                disabled={savingOrder}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium"
              >
                {savingOrder ? 'Salvando...' : 'Registrar'}
              </button>
              <button
                onClick={() => { setShowOrderForm(false); setOrderQty(''); setOrderNotes(''); }}
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal histórico */}
      {showHistory && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-3xl border border-gray-700 max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-start p-6 border-b border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedProduct.model} {selectedProduct.color}</h2>
                <p className="text-gray-400 text-sm mt-0.5">Histórico de movimentações</p>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Estoque atual</p>
                  <p className="text-2xl font-bold text-white">
                    {selectedProduct.current_stock}
                    <span className="text-sm font-normal text-gray-400 ml-1">un</span>
                  </p>
                </div>
                <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-700 flex-shrink-0">
              <div className="flex gap-0.5 bg-gray-900 rounded-lg p-1">
                {(['all', 'venda', 'entrada', 'encomenda_recebida', 'saida'] as const).map(v => {
                  const labels: Record<string, string> = {
                    all: 'Todos',
                    venda: '🛒 Vendas',
                    entrada: '📦 Entradas',
                    encomenda_recebida: '🏭 Encomendas',
                    saida: '➖ Saídas',
                  };
                  return (
                    <button
                      key={v}
                      onClick={() => { setHistoryTypeFilter(v); setHistoryPage(1); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        historyTypeFilter === v ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {labels[v]}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-0.5 bg-gray-900 rounded-lg p-1 ml-auto">
                {(['7', '30', '90', 'all'] as const).map(v => {
                  const labels: Record<string, string> = { '7': '7 dias', '30': '30 dias', '90': '90 dias', all: 'Tudo' };
                  return (
                    <button
                      key={v}
                      onClick={() => { setHistoryPeriodFilter(v); setHistoryPage(1); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        historyPeriodFilter === v ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {labels[v]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de eventos */}
            <div className="overflow-y-auto flex-1 p-6 space-y-2">
              {historyLoading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
              ) : filteredHistoryEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Package size={48} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-400">Nenhuma movimentação encontrada</p>
                  {allHistoryEvents.length > 0 && (
                    <p className="text-gray-600 text-xs mt-1">Tente remover os filtros</p>
                  )}
                </div>
              ) : (
                paginatedHistoryEvents.map(event => {
                  const cfgMap: Record<string, { emoji: string; label: string; bar: string; qty: string; bg: string }> = {
                    venda:             { emoji: '🛒', label: 'VENDA',              bar: 'bg-red-500',    qty: 'text-red-400',    bg: 'bg-red-500/5' },
                    entrada:           { emoji: '📦', label: 'ENTRADA',            bar: 'bg-green-500',  qty: 'text-green-400',  bg: 'bg-green-500/5' },
                    encomenda_recebida:{ emoji: '🏭', label: 'ENCOMENDA RECEBIDA', bar: 'bg-blue-500',   qty: 'text-blue-400',   bg: 'bg-blue-500/5' },
                    saida:             { emoji: '➖', label: 'SAÍDA MANUAL',       bar: 'bg-yellow-500', qty: 'text-yellow-400', bg: 'bg-yellow-500/5' },
                  };
                  const c = cfgMap[event.type] || cfgMap.saida;
                  const d = new Date(event.date);
                  const dateStr = d.toLocaleDateString('pt-BR');
                  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  const isPositive = event.type === 'entrada' || event.type === 'encomenda_recebida';

                  return (
                    <div key={event.id} className={`flex rounded-lg border border-gray-700 ${c.bg} overflow-hidden`}>
                      <div className={`w-1 ${c.bar} flex-shrink-0`} />
                      <div className="flex-1 flex items-start justify-between gap-4 p-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs font-bold tracking-wide text-gray-200">
                              {c.emoji} {c.label}
                            </span>
                            <span className="text-gray-600 text-xs">•</span>
                            <span className="text-xs text-gray-500">{dateStr} às {timeStr}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xl font-bold ${c.qty}`}>
                              {isPositive ? '+' : '-'}{event.qty} un
                            </span>
                            {event.type === 'venda' && (
                              <>
                                <span className="text-gray-600">•</span>
                                <span className="text-gray-400 text-sm">Pedido #{event.saleId}</span>
                                {event.customer && (
                                  <>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-white text-sm font-medium">{event.customer}</span>
                                  </>
                                )}
                                {event.price > 0 && (
                                  <>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-green-400 text-sm font-medium">
                                      R$ {(event.price * event.qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                            {event.type !== 'venda' && event.notes && (
                              <>
                                <span className="text-gray-600">•</span>
                                <span className="text-gray-300 text-sm">{event.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 pl-2">
                          <p className="text-xs text-gray-500 mb-0.5">Saldo</p>
                          <span className={`text-xl font-bold ${event.saldo < 0 ? 'text-red-400' : 'text-white'}`}>
                            {event.saldo}
                          </span>
                          <span className="text-xs text-gray-500 ml-1">un</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé com totais */}
            {!historyLoading && allHistoryEvents.length > 0 && (
              <div className="px-6 py-3 border-t border-gray-700 flex items-center justify-between gap-4 flex-shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {filteredHistoryEvents.length} movimentaç{filteredHistoryEvents.length !== 1 ? 'ões' : 'ão'}
                  {filteredHistoryEvents.length !== allHistoryEvents.length && (
                    <span className="ml-1 text-gray-600">(de {allHistoryEvents.length})</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={historyPageSafe === 1}
                    className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    Página {historyPageSafe} de {historyTotalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPageSafe === historyTotalPages}
                    className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Próximo →
                  </button>
                </div>
                <div className="flex gap-3 text-xs whitespace-nowrap">
                  <span className="text-green-400">
                    +{allHistoryEvents
                      .filter(e => e.type === 'entrada' || e.type === 'encomenda_recebida')
                      .reduce((s: number, e: any) => s + e.qty, 0)
                    } un
                  </span>
                  <span className="text-red-400">
                    -{allHistoryEvents
                      .filter(e => e.type === 'venda' || e.type === 'saida')
                      .reduce((s: number, e: any) => s + e.qty, 0)
                    } un
                  </span>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Modal relatório de compras */}
      {showBuyReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl border border-gray-700 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">📋 Relatório de Compras</h2>
                <p className="text-gray-400 text-sm">Smartwatches abaixo do estoque ideal</p>
              </div>
              <button onClick={() => setShowBuyReport(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <button
              onClick={handleCopyWhatsApp}
              className="w-full mb-6 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              {copied ? 'Copiado! ✓' : '📋 Copiar Lista WhatsApp'}
            </button>

            {Object.keys(buyReportData).length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
                <p className="text-gray-400">Todos os smartwatches estão no estoque ideal!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(buyReportData).map(([modelo, items]: [string, any]) => (
                  <div key={modelo}>
                    <h3 className="text-orange-400 font-bold text-lg mb-3 border-b border-gray-700 pb-2">{modelo}</h3>
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left text-xs text-gray-400 uppercase pb-2">Cor</th>
                          <th className="text-center text-xs text-gray-400 uppercase pb-2">Em Loja</th>
                          <th className="text-center text-xs text-gray-400 uppercase pb-2">Ideal</th>
                          <th className="text-center text-xs text-orange-400 uppercase pb-2">A Comprar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {items.map((p: any) => (
                          <tr key={p.id}>
                            <td className="py-2 text-white">{p.color}</td>
                            <td className="py-2 text-center text-red-400 font-bold">{p.current_stock}</td>
                            <td className="py-2 text-center text-gray-300">{p.ideal_stock}</td>
                            <td className="py-2 text-center">
                              <span className="bg-orange-500/20 text-orange-400 border border-orange-500/50 px-3 py-1 rounded-full font-bold">
                                {Math.max(0, (p.ideal_stock || 0) - p.current_stock)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                <div className="border-t border-gray-700 pt-4 flex justify-between items-center">
                  <span className="text-gray-400 font-medium">Total geral a comprar:</span>
                  <span className="text-orange-400 font-bold text-2xl">
                    {Object.values(buyReportData).flat().reduce((sum: number, p: any) =>
                      sum + Math.max(0, (p.ideal_stock || 0) - p.current_stock), 0
                    )} unidades
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal resumo WhatsApp */}
      {showStockSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg border border-gray-700 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">📋 Resumo de Estoque</h2>
              <button onClick={() => setShowStockSummary(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <pre className="flex-1 overflow-y-auto bg-gray-900 rounded-lg p-4 text-sm text-gray-200 font-mono whitespace-pre-wrap mb-4 select-all">
              {buildWhatsAppSummary()}
            </pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(buildWhatsAppSummary());
                setCopiedSummary(true);
                setTimeout(() => setCopiedSummary(false), 2000);
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-semibold transition-colors"
            >
              {copiedSummary ? '✅ Copiado!' : '📋 Copiar para WhatsApp'}
            </button>
          </div>
        </div>
      )}

      {/* Modal erros de sincronização */}
      {showSyncErrors && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-xl border border-gray-700 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">⚠️ Erros na Sincronização</h2>
                <p className="text-gray-400 text-sm">{syncErrors.length} produto(s) com problema</p>
              </div>
              <button onClick={() => setShowSyncErrors(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {syncErrors.map((err, i) => (
                <div key={i} className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-sm text-red-300 font-mono">
                  {err}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}