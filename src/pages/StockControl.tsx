import { useEffect, useState } from 'react';
import { supabase, Product } from '../lib/supabase';
import { AlertTriangle, CheckCircle, Plus, Minus, History, Search, Package, ShoppingCart } from 'lucide-react';

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
  const [editingIdealStock, setEditingIdealStock] = useState<string | null>(null);
  const [idealStockValue, setIdealStockValue] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('model', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (product: any) => {
    try {
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('*, sales(customer_name, sale_date, status)')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setMovements(saleItems || []);
      setSelectedProduct(product);
      setShowHistory(true);
    } catch (error) {
      console.error('Error loading history:', error);
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

      alert(`Estoque ${movementType === 'entrada' ? 'adicionado' : 'removido'} com sucesso!`);
      setShowMovementForm(false);
      setMovementQty('');
      setMovementReason('');
      setSelectedProduct(null);
      loadProducts();
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

  const filteredProducts = products.filter((p: any) => {
    const matchSearch = searchTerm === '' ||
      `${p.model} ${p.color}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const needsToBuy = filteredProducts.filter((p: any) => p.current_stock < (p.ideal_stock || 0));
  const totalToBuy = needsToBuy.reduce((sum: number, p: any) => sum + Math.max(0, (p.ideal_stock || 0) - p.current_stock), 0);

  if (loading) {
    return <div className="p-8"><div className="text-white">Carregando...</div></div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Controle de Estoque</h1>

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
        <div className="bg-gray-800 rounded-lg p-6 border border-orange-500/50">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Total a Comprar</h3>
          <p className="text-3xl font-bold text-orange-500">{totalToBuy} unidades</p>
        </div>
      </div>

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
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">Estoque em Loja</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">Estoque Ideal</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase">A Comprar</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product: any) => {
                const aToBuy = Math.max(0, (product.ideal_stock || 0) - product.current_stock);
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
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setSelectedProduct(product); setMovementType('entrada'); setShowMovementForm(true); }}
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

      {/* Modal lançamento */}
      {showMovementForm && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-2">
              {movementType === 'entrada' ? '➕ Entrada de Estoque' : '➖ Saída de Estoque'}
            </h2>
            <p className="text-gray-400 mb-1">{selectedProduct.model} {selectedProduct.color}</p>
            <p className="text-gray-300 mb-4">Estoque atual: <span className="text-white font-bold">{selectedProduct.current_stock}</span></p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Quantidade*</label>
                <input
                  type="number"
                  min="1"
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="Ex: 10"
                  autoFocus
                />
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
      )}

      {/* Modal histórico */}
      {showHistory && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl border border-gray-700 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedProduct.model} {selectedProduct.color}</h2>
                <p className="text-gray-400 text-sm">Histórico de vendas</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            {movements.length === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto text-gray-600 mb-3" />
                <p className="text-gray-400">Nenhuma venda encontrada para este produto</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Qtd</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Valor Unit.</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {new Date(m.sales?.sale_date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-white">{m.sales?.customer_name}</td>
                      <td className="px-4 py-3 text-red-400 font-bold">-{m.quantity}</td>
                      <td className="px-4 py-3 text-green-400">R$ {m.unit_price?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{m.sales?.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}