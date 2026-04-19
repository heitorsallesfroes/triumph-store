import { useEffect, useState } from 'react';
import { supabase, Product } from '../lib/supabase';
import { Plus, Pencil, Trash2, X, RefreshCw, Watch, ShoppingBag, Search } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [filterCategory, setFilterCategory] = useState<'all' | 'smartwatch' | 'acessorio'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCost, setEditingCost] = useState<string | null>(null);
  const [costValue, setCostValue] = useState('');
  const [formData, setFormData] = useState({
    model: '',
    color: '',
    cost: '',
    price: '',
  });

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

  const handleImportTiny = async (categoria: 'smartwatch' | 'acessorio') => {
    setImporting(true);
    setImportResult(null);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/import-tiny-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ categoria }),
      });
      const data = await response.json();
      if (data.success) {
        setImportResult(`✅ ${data.imported} produtos importados com sucesso!`);
        loadProducts();
      } else {
        setImportResult(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      setImportResult('❌ Erro ao importar produtos');
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const productData = {
        model: formData.model,
        color: formData.color,
        supplier: '',
        cost: parseFloat(formData.cost) || 0,
        price: parseFloat(formData.price) || 0,
        updated_at: new Date().toISOString(),
      };

      if (editingProduct) {
        const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert([productData]);
        if (error) throw error;
      }

      alert('Produto salvo com sucesso!');
      resetForm();
      loadProducts();
    } catch (error: any) {
      alert(`Erro ao salvar produto: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      model: product.model,
      color: product.color,
      cost: product.cost?.toString() || '0',
      price: product.price?.toString() || '0',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      loadProducts();
    } catch (error) {
      alert('Erro ao excluir produto');
    }
  };

  const handleSaveCost = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ cost: parseFloat(costValue) || 0 })
        .eq('id', productId);
      if (error) throw error;
      setEditingCost(null);
      loadProducts();
    } catch (error) {
      alert('Erro ao salvar custo');
    }
  };

  const resetForm = () => {
    setFormData({ model: '', color: '', cost: '', price: '' });
    setEditingProduct(null);
    setShowForm(false);
  };

  const filteredProducts = products
    .filter((p: any) => filterCategory === 'all' || p.category === filterCategory)
    .filter((p: any) => searchTerm === '' || `${p.model} ${p.color}`.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) {
    return <div className="p-8"><div className="text-white">Carregando...</div></div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Produtos</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus size={20} />
          Adicionar Produto
        </button>
      </div>

      {/* Importar do Tiny */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={18} className="text-orange-400" />
          <h2 className="text-white font-medium">Sincronizar com Tiny ERP</h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleImportTiny('smartwatch')}
            disabled={importing}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Watch size={16} />
            {importing ? 'Importando...' : 'Importar Smartwatches'}
          </button>
          <button
            onClick={() => handleImportTiny('acessorio')}
            disabled={importing}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <ShoppingBag size={16} />
            {importing ? 'Importando...' : 'Importar Acessórios'}
          </button>
        </div>
        {importResult && (
          <p className="mt-3 text-sm text-gray-300">{importResult}</p>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 text-white rounded-lg pl-10 pr-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
          />
        </div>
        {(['all', 'smartwatch', 'acessorio'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {cat === 'all' ? 'Todos' : cat === 'smartwatch' ? 'Smartwatches' : 'Acessórios'}
          </button>
        ))}
        <span className="text-gray-400 text-sm self-center">{filteredProducts.length} produtos</span>
      </div>

      {/* Modal editar/adicionar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingProduct ? 'Editar Produto' : 'Adicionar Novo Produto'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                  <input type="text" value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" placeholder="Ex: S11 Pro" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cor</label>
                  <input type="text" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" placeholder="Ex: Preto" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Custo (R$)</label>
                  <input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" placeholder="120.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Preço de Venda (R$)</label>
                  <input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" placeholder="299.00" />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
                  {editingProduct ? 'Atualizar Produto' : 'Adicionar Produto'}
                </button>
                <button type="button" onClick={resetForm} className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Modelo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Cor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">SKU</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Custo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Preço</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Estoque</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400">Nenhum produto encontrado.</td>
              </tr>
            ) : (
              filteredProducts.map((product: any) => (
                <tr key={product.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-white font-medium">{product.model}</td>
                  <td className="px-6 py-4 text-gray-300">{product.color}</td>
                  <td className="px-6 py-4 text-gray-400 text-sm">{product.sku || '-'}</td>
                  <td className="px-6 py-4">
                    {editingCost === product.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={costValue}
                          onChange={(e) => setCostValue(e.target.value)}
                          className="w-24 bg-gray-700 text-white rounded px-2 py-1 border border-orange-500 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCost(product.id);
                            if (e.key === 'Escape') setEditingCost(null);
                          }}
                        />
                        <button onClick={() => handleSaveCost(product.id)} className="text-green-400 text-xs">✓</button>
                        <button onClick={() => setEditingCost(null)} className="text-red-400 text-xs">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingCost(product.id); setCostValue(product.cost?.toString() || '0'); }}
                        className="text-gray-300 hover:text-orange-400 hover:underline"
                      >
                        R$ {(product.cost || 0).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-green-400 font-medium">R$ {(product.price || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 font-medium text-gray-300">{product.current_stock}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(product)} className="text-blue-400 hover:text-blue-300"><Pencil size={18} /></button>
                      <button onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}