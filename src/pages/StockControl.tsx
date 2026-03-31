import { useEffect, useState } from 'react';
import { supabase, Product } from '../lib/supabase';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function StockControl() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('current_stock', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  const lowStockProducts = products.filter(p => p.current_stock <= p.minimum_stock);
  const okStockProducts = products.filter(p => p.current_stock > p.minimum_stock);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Controle de Estoque</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Total de Produtos</h3>
          <p className="text-3xl font-bold text-white">{products.length}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-red-500/50">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Estoque Baixo</h3>
          <p className="text-3xl font-bold text-red-500">{lowStockProducts.length}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-green-500/50">
          <h3 className="text-gray-400 text-sm font-medium mb-2">Estoque Adequado</h3>
          <p className="text-3xl font-bold text-green-500">{okStockProducts.length}</p>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2">
            <AlertTriangle size={24} />
            Alerta de Estoque Baixo
          </h2>
          <div className="bg-gray-800 rounded-lg border border-red-500/50 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Produto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Estoque Atual
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Estoque Mínimo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {lowStockProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">{product.model}</div>
                      <div className="text-gray-400 text-sm">{product.color}</div>
                    </td>
                    <td className="px-6 py-4 text-white font-bold">{product.current_stock}</td>
                    <td className="px-6 py-4 text-gray-300">{product.minimum_stock}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/50">
                        <AlertTriangle size={16} />
                        Estoque Baixo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <CheckCircle size={24} className="text-green-500" />
          Todos os Produtos
        </h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Produto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Estoque Atual
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Estoque Mínimo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    Nenhum produto ainda. Adicione produtos para controlar o estoque.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const isLowStock = product.current_stock <= product.minimum_stock;

                  return (
                    <tr key={product.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="text-white font-medium">{product.model}</div>
                        <div className="text-gray-400 text-sm">{product.color}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                          {product.current_stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">{product.minimum_stock}</td>
                      <td className="px-6 py-4">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/50">
                            <AlertTriangle size={16} />
                            Estoque Baixo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                            <CheckCircle size={16} />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
