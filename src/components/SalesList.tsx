import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SALE_STATUSES, getStatusConfig, SaleStatus } from '../lib/salesStatus';
import { ChevronDown, Package, FileText, CreditCard as Edit } from 'lucide-react';
import Receipt from './Receipt';
import EditSale from './EditSale';

interface Sale {
  id: string;
  customer_name: string;
  city: string;
  neighborhood: string;
  total_sale_price: number;
  profit: number;
  status: SaleStatus;
  sale_date: string;
  payment_method: string;
  main_product?: string;
  additional_items?: number;
}

export default function SalesList() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: false });

      if (error) throw error;

      const salesWithProducts = await Promise.all(
        (data || []).map(async (sale) => {
          const { data: items } = await supabase
            .from('sale_items')
            .select('product_id, quantity')
            .eq('sale_id', sale.id)
            .order('quantity', { ascending: false });

          let main_product = '';
          let additional_items = 0;

          if (items && items.length > 0) {
            const { data: product } = await supabase
              .from('products')
              .select('model, color')
              .eq('id', items[0].product_id)
              .maybeSingle();

            if (product) {
              main_product = `${product.model} ${product.color}`;
            }

            additional_items = items.length - 1;
          }

          return {
            ...sale,
            main_product,
            additional_items,
          };
        })
      );

      setSales(salesWithProducts);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSaleStatus = async (saleId: string, newStatus: SaleStatus) => {
    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: newStatus })
        .eq('id', saleId);

      if (error) throw error;

      setSales(sales.map(sale =>
        sale.id === saleId ? { ...sale, status: newStatus } : sale
      ));
    } catch (error) {
      console.error('Error updating sale status:', error);
      alert('Erro ao atualizar status da venda');
    }
  };

  const filteredSales = statusFilter === 'all'
    ? sales
    : sales.filter(sale => sale.status === statusFilter);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando vendas...</div>
      </div>
    );
  }

  return (
    <>
      {selectedSale && (
        <Receipt saleData={selectedSale} onClose={() => setSelectedSale(null)} />
      )}

      {editingSaleId && (
        <EditSale
          saleId={editingSaleId}
          onClose={() => setEditingSaleId(null)}
          onSaved={loadSales}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="text-orange-500" size={28} />
            <h2 className="text-2xl font-bold text-white">Vendas Recentes</h2>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SaleStatus | 'all')}
            className="bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            {SALE_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

      <div className="space-y-3">
        {filteredSales.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400 border border-gray-700">
            {statusFilter === 'all'
              ? 'Nenhuma venda registrada ainda.'
              : `Nenhuma venda com status "${getStatusConfig(statusFilter as SaleStatus).label}".`
            }
          </div>
        ) : (
          filteredSales.map((sale) => {
            const statusConfig = getStatusConfig(sale.status);
            return (
              <div
                key={sale.id}
                className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-3">
                    <div className="text-white font-semibold">{sale.customer_name}</div>
                    {sale.main_product && (
                      <div className="text-orange-400 font-medium text-sm mt-0.5">
                        {sale.main_product}
                        {sale.additional_items !== undefined && sale.additional_items > 0 && (
                          <span className="text-gray-500 text-xs ml-1">+{sale.additional_items} {sale.additional_items === 1 ? 'item' : 'itens'}</span>
                        )}
                      </div>
                    )}
                    <div className="text-gray-400 text-sm mt-0.5">
                      {sale.city} - {sale.neighborhood}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {new Date(sale.sale_date).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <div className="text-gray-400 text-xs mb-1">Valor</div>
                    <div className="text-white font-bold">
                      R$ {sale.total_sale_price.toFixed(2)}
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <div className="text-gray-400 text-xs mb-1">Lucro</div>
                    <div className={`font-bold ${sale.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      R$ {sale.profit.toFixed(2)}
                    </div>
                  </div>

                  <div className="col-span-1 text-center">
                    <div className="text-gray-400 text-xs mb-1">Pagamento</div>
                    <div className="text-gray-300 text-sm">
                      {sale.payment_method === 'pix' && 'PIX'}
                      {sale.payment_method === 'cash' && 'Dinheiro'}
                      {sale.payment_method === 'credit_card' && 'Crédito'}
                      {sale.payment_method === 'debit_card' && 'Débito'}
                    </div>
                  </div>

                  <div className="col-span-1 flex flex-col gap-2">
                    <button
                      onClick={() => setEditingSaleId(sale.id)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                      title="Editar Venda"
                    >
                      <Edit size={16} />
                      <span className="text-xs font-semibold">Editar</span>
                    </button>
                    <button
                      onClick={() => {
                        console.log('SalesList: Opening receipt for sale');
                        console.log('SalesList: SALE OBJECT:', sale);
                        setSelectedSale(sale);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                      title="Gerar Recibo"
                    >
                      <FileText size={16} />
                      <span className="text-xs font-semibold">Recibo</span>
                    </button>
                  </div>

                  <div className="col-span-3">
                    <div className="relative">
                      <select
                        value={sale.status}
                        onChange={(e) => updateSaleStatus(sale.id, e.target.value as SaleStatus)}
                        className={`w-full appearance-none rounded-lg px-4 py-2.5 pr-10 border-2 font-semibold cursor-pointer transition-all ${statusConfig.color} ${statusConfig.bgColor} ${statusConfig.borderColor} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-orange-500`}
                      >
                        {SALE_STATUSES.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${statusConfig.color}`}
                        size={18}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
}
