import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SALE_STATUSES, getStatusConfig, SaleStatus } from '../lib/salesStatus';
import { ChevronDown, Package, FileText, CreditCard as Edit, Search, Calendar, Truck } from 'lucide-react';
import Receipt from '../components/Receipt';
import EditSale from '../components/EditSale';
import { generateShippingLabel } from '../lib/superfrete';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface Sale {
  id: string;
  customer_name: string;
  customer_cpf?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  city: string;
  neighborhood: string;
  total_sale_price: number;
  profit: number;
  status: SaleStatus;
  sale_date: string;
  payment_method: string;
  main_product?: string;
  additional_items?: number;
  delivery_type?: string;
  tracking_code?: string;
  shipping_label_url?: string;
  shipping_status?: string;
  state?: string;
  zip_code?: string;
  manual_items?: any;
  nfe_url?: string;
  nfe_chave?: string;
  nfe_status?: string;
}

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [debouncedProductFilter, setDebouncedProductFilter] = useState('');
  const [generatingLabel, setGeneratingLabel] = useState<string | null>(null);
  const [generatingNFe, setGeneratingNFe] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  useEffect(() => { loadSales(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedProductFilter(productFilter); }, 300);
    return () => clearTimeout(timer);
  }, [productFilter]);

  useEffect(() => { filterSales(); }, [statusFilter, searchTerm, debouncedProductFilter, dateFilter]);

  const loadSales = async () => {
    try {
      const { data, error } = await supabase.from('sales').select('*').order('sale_date', { ascending: false });
      if (error) throw error;

      const salesWithProducts = await Promise.all(
        (data || []).map(async (sale) => {
          const { data: items } = await supabase.from('sale_items').select('product_id, quantity').eq('sale_id', sale.id).order('quantity', { ascending: false });
          let main_product = '';
          let additional_items = 0;
          if (items && items.length > 0) {
            const { data: product } = await supabase.from('products').select('model, color').eq('id', items[0].product_id).maybeSingle();
            if (product) main_product = `${product.model} ${product.color}`;
            additional_items = items.length - 1;
          }
          return { ...sale, main_product, additional_items };
        })
      );
      setSales(salesWithProducts);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterSales = async () => {
    setFilterLoading(true);
    try {
      let query = supabase.from('sales').select('*').order('sale_date', { ascending: false }).limit(50);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (searchTerm) query = query.ilike('customer_name', `%${searchTerm}%`);
      if (dateFilter.start) query = query.gte('sale_date', dateFilter.start);
      if (dateFilter.end) {
        const endDate = new Date(dateFilter.end);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('sale_date', endDate.toISOString());
      }

      const { data: salesData, error } = await query;
      if (error) throw error;

      let filtered = salesData || [];

      if (debouncedProductFilter) {
        const productSearchTerm = debouncedProductFilter.toLowerCase();
        const matchingSaleIds = new Set<string>();
        const { data: saleItems } = await supabase.from('sale_items').select('sale_id, product_id').in('sale_id', filtered.map(s => s.id));
        if (saleItems) {
          const productIds = [...new Set(saleItems.map(si => si.product_id))];
          const { data: products } = await supabase.from('products').select('id, model, color').in('id', productIds);
          if (products) {
            const productMap = new Map(products.map(p => [p.id, `${p.model} ${p.color}`.toLowerCase()]));
            for (const item of saleItems) {
              const productName = productMap.get(item.product_id);
              if (productName && productName.includes(productSearchTerm)) matchingSaleIds.add(item.sale_id);
            }
          }
        }
        filtered = filtered.filter(sale => matchingSaleIds.has(sale.id));
      }

      const salesWithProducts = await Promise.all(
        filtered.map(async (sale) => {
          const { data: items } = await supabase.from('sale_items').select('product_id, quantity').eq('sale_id', sale.id).order('quantity', { ascending: false }).limit(1);
          let main_product = '';
          let additional_items = 0;
          if (items && items.length > 0) {
            const { data: product } = await supabase.from('products').select('model, color').eq('id', items[0].product_id).maybeSingle();
            if (product) main_product = `${product.model} ${product.color}`;
            const { count } = await supabase.from('sale_items').select('*', { count: 'exact', head: true }).eq('sale_id', sale.id);
            additional_items = (count || 1) - 1;
          }
          return { ...sale, main_product, additional_items };
        })
      );
      setFilteredSales(salesWithProducts);
    } catch (error) {
      console.error('Error filtering sales:', error);
      setFilteredSales([]);
    } finally {
      setFilterLoading(false);
    }
  };

  const handleGenerateNFe = async (sale: Sale) => {
    if (!sale.customer_cpf) {
      alert('CPF/CNPJ do cliente é obrigatório para gerar nota fiscal');
      return;
    }

    setGeneratingNFe(sale.id);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/gerar-nfe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sale_id: sale.id }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Erro ao gerar nota fiscal: ${data.error}`);
        return;
      }

      setFilteredSales(filteredSales.map(s =>
        s.id === sale.id
          ? { ...s, nfe_url: data.nfe_url, nfe_status: 'emitida' }
          : s
      ));

      alert('Nota fiscal gerada com sucesso!');

      if (data.nfe_url) {
        window.open(data.nfe_url, '_blank');
      }
    } catch (error) {
      alert('Erro ao gerar nota fiscal');
    } finally {
      setGeneratingNFe(null);
    }
  };

  const handleGenerateShippingLabel = async (sale: Sale) => {
    if (!sale.address_street || !sale.address_number || !sale.neighborhood || !sale.city || !sale.state || !sale.zip_code || !sale.customer_cpf) {
      alert('Preencha os dados completos para envio');
      return;
    }

    setGeneratingLabel(sale.id);
    try {
      const { data: saleItems } = await supabase.from('sale_items').select('quantity, unit_price, product_id').eq('sale_id', sale.id);
      const items = await Promise.all(
        (saleItems || []).map(async (item) => {
          const { data: product } = await supabase.from('products').select('model, color').eq('id', item.product_id).maybeSingle();
          return { name: product ? `${product.model} ${product.color}` : 'Produto', quantity: item.quantity, price: item.unit_price };
        })
      );

      const { data: accessories } = await supabase.from('sale_accessories').select('quantity, cost, accessory_id, custom_name').eq('sale_id', sale.id);
      if (accessories && accessories.length > 0) {
        for (const acc of accessories) {
          let accName = 'Acessório';
          if (acc.custom_name) accName = acc.custom_name;
          else if (acc.accessory_id) {
            const { data: accessory } = await supabase.from('accessories').select('name').eq('id', acc.accessory_id).maybeSingle();
            if (accessory) accName = accessory.name;
          }
          items.push({ name: accName, quantity: acc.quantity, price: acc.cost });
        }
      }

      if (sale.manual_items) {
        const manualItems = Array.isArray(sale.manual_items) ? sale.manual_items : [];
        for (const mi of manualItems) items.push({ name: mi.name || 'Item', quantity: mi.quantity || 1, price: mi.price || 0 });
      }

      if (items.length === 0) items.push({ name: 'Smartwatch', quantity: 1, price: 100 });

      const result = await generateShippingLabel({
        customer_name: sale.customer_name,
        customer_cpf: sale.customer_cpf,
        street: sale.address_street,
        number: sale.address_number,
        neighborhood: sale.neighborhood,
        city: sale.city,
        state: sale.state,
        zip_code: sale.zip_code,
        items,
      });

      if (!result.success) { alert(result.error || 'Erro ao gerar etiqueta'); return; }

      const { error } = await supabase.from('sales').update({ tracking_code: result.tracking_code, shipping_label_url: result.label_url, shipping_status: 'Etiqueta gerada' }).eq('id', sale.id);
      if (error) throw error;

      setFilteredSales(filteredSales.map(s => s.id === sale.id ? { ...s, tracking_code: result.tracking_code, shipping_label_url: result.label_url, shipping_status: 'Etiqueta gerada' } : s));
      alert('Etiqueta gerada com sucesso!');
    } catch (error) {
      alert('Erro ao gerar etiqueta');
    } finally {
      setGeneratingLabel(null);
    }
  };

  const updateSaleStatus = async (saleId: string, newStatus: SaleStatus) => {
    try {
      const { error } = await supabase.from('sales').update({ status: newStatus }).eq('id', saleId);
      if (error) throw error;
      setSales(sales.map(sale => sale.id === saleId ? { ...sale, status: newStatus } : sale));
    } catch (error) {
      alert('Erro ao atualizar status da venda');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (loading) {
    return <div className="p-8"><div className="text-white text-center">Carregando histórico de vendas...</div></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Histórico de Vendas</h1>
        <p className="text-gray-400">Visualize e gerencie todas as vendas realizadas</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Cliente</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome" className="w-full bg-gray-700 text-white rounded-lg px-10 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Produto</label>
            <div className="relative">
              {filterLoading && debouncedProductFilter ? (
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div></div>
              ) : (
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              )}
              <input type="text" value={productFilter} onChange={(e) => setProductFilter(e.target.value)} placeholder="Buscar por produto" className="w-full bg-gray-700 text-white rounded-lg px-10 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SaleStatus | 'all')} className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="all">Todos os Status</option>
              {SALE_STATUSES.map((status) => (<option key={status.value} value={status.value}>{status.label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Data Inicial</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Data Final</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })} className="w-full bg-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
        </div>
        {(searchTerm || productFilter || statusFilter !== 'all' || dateFilter.start || dateFilter.end) && (
          <button onClick={() => { setSearchTerm(''); setProductFilter(''); setStatusFilter('all'); setDateFilter({ start: '', end: '' }); }} className="text-orange-500 hover:text-orange-400 text-sm font-medium">
            Limpar Filtros
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-gray-400">
          {filterLoading ? (
            <span className="flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>Buscando vendas...</span>
          ) : (
            <>Mostrando <span className="text-white font-semibold">{filteredSales.length}</span> vendas{(statusFilter !== 'all' || searchTerm || debouncedProductFilter || dateFilter.start || dateFilter.end) && ' (filtrado)'}</>
          )}
        </p>
      </div>

      <div className="space-y-4">
        {filterLoading ? (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Carregando vendas...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
            <Package size={48} className="mx-auto text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Nenhuma venda encontrada</h3>
            <p className="text-gray-400">{searchTerm || statusFilter !== 'all' || dateFilter.start || dateFilter.end ? 'Tente ajustar os filtros para ver mais resultados' : 'As vendas realizadas aparecerão aqui'}</p>
          </div>
        ) : (
          filteredSales.map((sale) => {
            const statusConfig = getStatusConfig(sale.status);
            return (
              <div key={sale.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all">
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-12 lg:col-span-4">
                    <div className="flex items-start gap-3">
                      <Package size={24} className="text-orange-500 mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">{sale.customer_name}</h3>
                        {sale.main_product && (
                          <p className="text-gray-300 text-sm mb-1">
                            {sale.main_product}
                            {sale.additional_items > 0 && <span className="text-gray-500"> +{sale.additional_items} {sale.additional_items === 1 ? 'item' : 'itens'}</span>}
                          </p>
                        )}
                        <p className="text-gray-400 text-sm">{sale.neighborhood} - {sale.city}</p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Data da Venda</p>
                        <p className="text-white font-medium">{formatDate(sale.sale_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Valor Total</p>
                        <p className="text-xl font-bold text-green-500">{formatCurrency(sale.total_sale_price)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-2 flex gap-2">
                    <button onClick={() => setEditingSaleId(sale.id)} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 flex-1">
                      <Edit size={16} />
                      <span className="text-xs font-semibold">Editar</span>
                    </button>
                    <button onClick={() => setSelectedSale(sale)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 flex-1">
                      <FileText size={16} />
                      <span className="text-xs font-semibold">Recibo</span>
                    </button>
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <div className="relative">
                      <select value={sale.status} onChange={(e) => updateSaleStatus(sale.id, e.target.value as SaleStatus)} className={`w-full appearance-none rounded-lg px-4 py-2.5 pr-10 border-2 font-semibold cursor-pointer transition-all ${statusConfig.color} ${statusConfig.bgColor} ${statusConfig.borderColor} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-orange-500`}>
                        {SALE_STATUSES.map((status) => (<option key={status.value} value={status.value}>{status.label}</option>))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" size={20} />
                    </div>
                  </div>
                </div>

                {/* Nota Fiscal */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText size={20} className="text-yellow-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">Nota Fiscal</p>
                        {sale.nfe_status === 'emitida' && (
                          <p className="text-xs text-green-500">✅ NF-e emitida</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!sale.nfe_status ? (
                        <button
                          onClick={() => handleGenerateNFe(sale)}
                          disabled={generatingNFe === sale.id}
                          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                          {generatingNFe === sale.id ? (
                            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Gerando...</>
                          ) : (
                            <><FileText size={16} />Gerar NF-e</>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => sale.nfe_url && window.open(sale.nfe_url, '_blank')}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                          <FileText size={16} />
                          Ver NF-e
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Correios */}
                {sale.delivery_type === 'correios' && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Truck size={20} className="text-blue-500" />
                        <div>
                          <p className="text-sm font-semibold text-white">Envio por Correios</p>
                          {sale.tracking_code && <p className="text-xs text-gray-400">Rastreio: {sale.tracking_code}</p>}
                          {sale.shipping_status && <p className="text-xs text-green-500">{sale.shipping_status}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!sale.shipping_label_url ? (
                          <button onClick={() => handleGenerateShippingLabel(sale)} disabled={generatingLabel === sale.id} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold">
                            {generatingLabel === sale.id ? (
                              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Gerando...</>
                            ) : (
                              <><Truck size={16} />Gerar Etiqueta</>
                            )}
                          </button>
                        ) : (
                          <button onClick={() => window.open(sale.shipping_label_url, '_blank')} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold">
                            <FileText size={16} />Ver Etiqueta
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedSale && <Receipt saleData={selectedSale} onClose={() => setSelectedSale(null)} />}
      {editingSaleId && <EditSale saleId={editingSaleId} onClose={() => { setEditingSaleId(null); loadSales(); }} />}
    </div>
  );
}