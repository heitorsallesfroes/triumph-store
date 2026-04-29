import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SALE_STATUSES, getStatusConfig, SaleStatus } from '../lib/salesStatus';
import { ChevronDown, Package, FileText, CreditCard as Edit, Search, Calendar, Truck, Bike, ShoppingCart, TrendingUp, DollarSign, MessageCircle, X, Copy, Check, Trash2, Zap, Banknote, Layers, Link } from 'lucide-react';
import Receipt from '../components/Receipt';
import EditSale from '../components/EditSale';
import { generateShippingLabel } from '../lib/superfrete';
import { getTodayInBrazil, getYesterdayInBrazil } from '../lib/dateUtils';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Semana',
  month: 'Mês',
  custom: 'Personalizado',
};

const DELIVERY_LABELS: Record<string, string> = {
  all: 'Todos',
  motoboy: 'Motoboy',
  correios: 'Correios',
  loja_fisica: 'Loja Física',
};

const PAYMENT_FILTER_LABELS: Record<string, string> = {
  all: 'Todos',
  pix: 'PIX',
  cash: 'Dinheiro',
  debit_card: 'Débito',
  credit_card: 'Crédito',
  payment_link: 'Link de Pagamento',
};

const DELIVERY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  motoboy:    { label: 'Motoboy',    icon: Bike,         color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  correios:   { label: 'Correios',   icon: Truck,        color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30'     },
  loja_fisica:{ label: 'Loja Física',icon: ShoppingCart, color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30'   },
};

const PAYMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pix:         { label: 'PIX',      icon: Zap,     color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30'   },
  cash:        { label: 'Dinheiro', icon: Banknote, color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30'   },
  credit_card:  { label: 'Crédito',       icon: Edit,   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30'     },
  debit_card:   { label: 'Débito',        icon: Edit,   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  payment_link: { label: 'Link de Pag',   icon: Link,   color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  mixed:        { label: 'Misto',         icon: Layers, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
};

const EMPTY_PERIOD_LABELS: Record<Period, string> = {
  today: 'para hoje',
  week: 'para esta semana',
  month: 'para este mês',
  custom: 'para o período selecionado',
};

const PAGE_SIZE = 20;

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
  installments?: number;
  motoboy_id?: string | null;
  motoboy_name?: string;
  main_product?: string;
  additional_items?: number;
  delivery_type?: string;
  tracking_code?: string;
  shipping_label_url?: string;
  shipping_status?: string;
  state?: string;
  zip_code?: string;
  manual_items?: any;
  payment_methods?: { method: string; card_brand: string; installments: number; amount: number }[] | null;
  nfe_url?: string;
  nfe_chave?: string;
  nfe_status?: string;
  delivery_notes?: string | null;
}

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [filteredSmartwatch, setFilteredSmartwatch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('today');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState('all');
  const [motoboyFilter, setMotoboyFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [motoboys, setMotoboys] = useState<{ id: string; name: string }[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [debouncedProductFilter, setDebouncedProductFilter] = useState('');
  const [generatingLabel, setGeneratingLabel] = useState<string | null>(null);
  const [generatingNFe, setGeneratingNFe] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [whatsappSale, setWhatsappSale] = useState<Sale | null>(null);
  const [receiptChoiceSale, setReceiptChoiceSale] = useState<Sale | null>(null);
  const [receiptHideDelivery, setReceiptHideDelivery] = useState(false);
  const [giftSale, setGiftSale] = useState<Sale | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<SaleStatus>('finalizado');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  useEffect(() => { loadSales(); }, []);
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedIds(new Set()); }, [filteredSales]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedProductFilter(productFilter); }, 300);
    return () => clearTimeout(timer);
  }, [productFilter]);

  useEffect(() => { filterSales(); }, [statusFilter, deliveryTypeFilter, motoboyFilter, paymentFilter, searchTerm, debouncedProductFilter, period, dateFilter]);

  const loadSales = async () => {
    try {
      const [{ data: salesData, error: salesError }, { data: motoboysData }] = await Promise.all([
        supabase.from('sales').select('*').order('sale_date', { ascending: false }),
        supabase.from('motoboys').select('id, name'),
      ]);
      if (salesError) throw salesError;

      const rawSales: any[] = salesData || [];
      const motoboysMap = new Map((motoboysData || []).map((m: any) => [m.id, m.name]));
      setMotoboys((motoboysData || []).map((m: any) => ({ id: m.id, name: m.name })));
      const salesWithProducts = await enrichWithProducts(rawSales, motoboysMap);
      setSales(salesWithProducts);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const enrichWithProducts = async (rawSales: any[], motoboysMap: Map<string, string> = new Map()): Promise<Sale[]> => {
    if (rawSales.length === 0) return [];
    const saleIds = rawSales.map((s: any) => s.id);

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('sale_id, product_id, quantity')
      .in('sale_id', saleIds);

    const productIds = [...new Set((itemsData || []).map((i: any) => i.product_id).filter(Boolean))];
    const { data: productsData } = productIds.length > 0
      ? await supabase.from('products').select('id, model, color').in('id', productIds)
      : { data: [] };

    const productMap = new Map((productsData || []).map((p: any) => [p.id, p]));
    const itemsBySale = new Map<string, any[]>();
    for (const item of (itemsData || [])) {
      const arr = itemsBySale.get(item.sale_id) || [];
      arr.push(item);
      itemsBySale.set(item.sale_id, arr);
    }

    return rawSales.map((sale: any) => {
      const items = [...(itemsBySale.get(sale.id) || [])].sort((a: any, b: any) => b.quantity - a.quantity);
      let main_product = '';
      let additional_items = 0;
      if (items.length > 0) {
        const p = productMap.get(items[0].product_id);
        if (p) main_product = `${p.model} ${p.color}`;
        additional_items = items.length - 1;
      }
      return {
        ...sale,
        main_product,
        additional_items,
        motoboy_name: sale.motoboy_id ? (motoboysMap.get(sale.motoboy_id) || undefined) : undefined,
      } as Sale;
    });
  };

  const filterSales = async () => {
    setFilterLoading(true);
    try {
      const today = getTodayInBrazil();
      const now = new Date(today + 'T00:00:00');

      let startDate = '';
      let endDate = '';
      if (period === 'today') {
        startDate = today; endDate = today;
      } else if (period === 'yesterday') {
        const yesterday = getYesterdayInBrazil();
        startDate = yesterday; endDate = yesterday;
      } else if (period === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 6);
        startDate = d.toISOString().split('T')[0]; endDate = today;
      } else if (period === 'month') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = today;
      } else {
        startDate = dateFilter.start; endDate = dateFilter.end;
      }

      let query = supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (deliveryTypeFilter !== 'all') query = query.eq('delivery_type', deliveryTypeFilter);
      if (deliveryTypeFilter === 'motoboy' && motoboyFilter !== 'all') query = query.eq('motoboy_id', motoboyFilter);
      if (paymentFilter !== 'all') query = query.eq('payment_method', paymentFilter);
      if (searchTerm) query = query.or(`customer_name.ilike.%${searchTerm}%,neighborhood.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%`);
      if (startDate) query = query.gte('sale_date', `${startDate}T00:00:00`);
      if (endDate) query = query.lte('sale_date', `${endDate}T23:59:59`);

      const { data: salesData, error } = await query;
      if (error) throw error;

      let rawSales: any[] = salesData || [];
      const saleIds = rawSales.map((s: any) => s.id);

      let itemsData: any[] = [];
      let productsData: any[] = [];
      let motoboysMap = new Map<string, string>();

      const { data: motoboysData } = await supabase.from('motoboys').select('id, name');
      motoboysMap = new Map((motoboysData || []).map((m: any) => [m.id, m.name]));

      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('sale_id, product_id, quantity')
          .in('sale_id', saleIds);
        itemsData = items || [];

        const productIds = [...new Set(itemsData.map((i: any) => i.product_id).filter(Boolean))];
        if (productIds.length > 0) {
          const { data: prods } = await supabase.from('products').select('id, model, color, category').in('id', productIds);
          productsData = prods || [];
        }
      }

      const productMap = new Map(productsData.map((p: any) => [p.id, p]));
      const itemsBySale = new Map<string, any[]>();
      for (const item of itemsData) {
        const arr = itemsBySale.get(item.sale_id) || [];
        arr.push(item);
        itemsBySale.set(item.sale_id, arr);
      }

      if (debouncedProductFilter) {
        const term = debouncedProductFilter.toLowerCase();
        rawSales = rawSales.filter((sale: any) =>
          (itemsBySale.get(sale.id) || []).some((item: any) => {
            const p = productMap.get(item.product_id);
            return p && `${p.model} ${p.color}`.toLowerCase().includes(term);
          })
        );
      }

      const salesWithProducts: Sale[] = rawSales.map((sale: any) => {
        const items = [...(itemsBySale.get(sale.id) || [])].sort((a: any, b: any) => b.quantity - a.quantity);
        let main_product = '';
        let additional_items = 0;
        if (items.length > 0) {
          const p = productMap.get(items[0].product_id);
          if (p) main_product = `${p.model} ${p.color}`;
          additional_items = items.length - 1;
        }
        return {
          ...sale,
          main_product,
          additional_items,
          motoboy_name: sale.motoboy_id ? (motoboysMap.get(sale.motoboy_id) || undefined) : undefined,
        } as Sale;
      });
      if (period === 'today' || period === 'yesterday') {
        const norm = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const todayPriority = (s: Sale): number => {
          if (s.delivery_type === 'loja_fisica') return 0;
          if (s.delivery_type === 'correios') return 1;
          if (s.delivery_type === 'motoboy') {
            const city = norm(s.city || '');
            if (city.includes('rio de janeiro')) return 2;
            if (city.includes('niteroi')) return 3;
            return 4;
          }
          return 5;
        };
        salesWithProducts.sort((a, b) => {
          const pd = todayPriority(a) - todayPriority(b);
          if (pd !== 0) return pd;
          return new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime();
        });
      }

      const swCount = itemsData
        .filter((i: any) => (productMap.get(i.product_id) as any)?.category === 'smartwatch')
        .reduce((s: number, i: any) => s + i.quantity, 0);
      setFilteredSmartwatch(swCount);
      setFilteredSales(salesWithProducts);
    } catch (error) {
      console.error('Error filtering sales:', error);
      setFilteredSales([]);
    } finally {
      setFilterLoading(false);
    }
  };

  const updateNFeInState = (saleId: string, nfe_url: string, nfe_status: string, nfe_chave?: string) => {
    const patch = (s: Sale) => s.id === saleId ? { ...s, nfe_url, nfe_status, ...(nfe_chave ? { nfe_chave } : {}) } : s;
    setFilteredSales(prev => prev.map(patch));
    setSales(prev => prev.map(patch));
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

      const nfeUrl = data.nfe_url || '';
      updateNFeInState(sale.id, nfeUrl, 'emitida', data.nfe_chave || undefined);

      // Abre antes do alert para não ser bloqueado como popup
      if (nfeUrl) window.open(nfeUrl, '_blank');
      alert('Nota fiscal gerada com sucesso!');
    } catch (error) {
      alert('Erro ao gerar nota fiscal');
    } finally {
      setGeneratingNFe(null);
    }
  };

  const handleViewNFe = async (sale: Sale) => {
    // Sempre busca do Supabase em tempo real para garantir dados frescos
    const { data } = await supabase
      .from('sales')
      .select('nfe_url, nfe_chave')
      .eq('id', sale.id)
      .single();

    const resolvedUrl =
      data?.nfe_url ||
      (data?.nfe_chave ? `https://erp.olist.com/notas_fiscais#edit/${data.nfe_chave}` : null);

    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank');
      updateNFeInState(sale.id, resolvedUrl, 'emitida');
    } else {
      alert('URL da nota não disponível. Acesse diretamente no Tiny ERP.');
    }
  };

  const handleGenerateShippingLabel = async (sale: Sale) => {
    if (!sale.address_street || !sale.address_number || !sale.neighborhood || !sale.city || !sale.state || !sale.zip_code || !sale.customer_cpf) {
      alert('Preencha os dados completos para envio');
      return;
    }

    setGeneratingLabel(sale.id);
    try {
      const [{ data: saleItems }, { data: accessories }] = await Promise.all([
        supabase.from('sale_items').select('quantity, unit_price, products(model, color)').eq('sale_id', sale.id),
        supabase.from('sale_accessories').select('quantity, cost, accessory_id, custom_name, accessories(name)').eq('sale_id', sale.id),
      ]);

      const items: { name: string; quantity: number; price: number }[] = (saleItems || []).map((item: any) => ({
        name: item.products ? `${item.products.model} ${item.products.color}` : 'Produto',
        quantity: item.quantity,
        price: item.unit_price,
      }));

      if (accessories && accessories.length > 0) {
        for (const acc of accessories as any[]) {
          let accName = 'Acessório';
          if (acc.custom_name) accName = acc.custom_name;
          else if (acc.accessories?.name) accName = acc.accessories.name;
          items.push({ name: accName, quantity: acc.quantity, price: acc.cost });
        }
      }

      if (sale.manual_items) {
        const manualItems = Array.isArray(sale.manual_items) ? sale.manual_items : [];
        for (const mi of manualItems) items.push({ name: mi.name || 'Item', quantity: mi.quantity || 1, price: mi.price || 0 });
      }

      if (items.length === 0) items.push({ name: 'Smartwatch', quantity: 1, price: 100 });

      // DEBUG: comparar nfe_chave no estado React vs no banco
      const { data: freshSale } = await supabase
        .from('sales')
        .select('nfe_chave')
        .eq('id', sale.id)
        .single();
      console.log('[Etiqueta] nfe_chave no ESTADO React:', sale.nfe_chave ?? '(vazio)');
      console.log('[Etiqueta] nfe_chave no BANCO (Supabase):', freshSale?.nfe_chave ?? '(vazio)');
      const resolvedInvoiceKey = sale.nfe_chave || freshSale?.nfe_chave || undefined;
      console.log('[Etiqueta] invoice_key que será enviado ao SuperFrete:', resolvedInvoiceKey ?? '(nenhum — vai gerar Declaração de Conteúdo)');

      const result = await generateShippingLabel({
        customer_name: sale.customer_name,
        customer_cpf: sale.customer_cpf,
        street: sale.address_street,
        number: sale.address_number,
        complement: sale.address_complement,
        neighborhood: sale.neighborhood,
        city: sale.city,
        state: sale.state,
        zip_code: sale.zip_code,
        items,
        invoice_key: resolvedInvoiceKey,
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
      setFilteredSales(prev => prev.map(s => s.id === saleId ? { ...s, status: newStatus } : s));
      setSales(prev => prev.map(s => s.id === saleId ? { ...s, status: newStatus } : s));
    } catch (error) {
      alert('Erro ao atualizar status da venda');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filteredSales.slice(0, visibleCount).map(s => s.id);
    const allSelected = visible.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); visible.forEach(id => next.delete(id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); visible.forEach(id => next.add(id)); return next; });
    }
  };

  const updateBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    try {
      const ids = [...selectedIds];
      const { error } = await supabase.from('sales').update({ status: bulkStatus }).in('id', ids);
      if (error) throw error;
      setFilteredSales(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, status: bulkStatus } : s));
      setSales(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, status: bulkStatus } : s));
      setSelectedIds(new Set());
    } catch {
      alert('Erro ao atualizar status das vendas');
    } finally {
      setBulkUpdating(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteSale = async (sale: Sale) => {
    if (!confirm(`Excluir a venda de ${sale.customer_name}?\n\nO estoque dos produtos será restaurado. Esta ação não pode ser desfeita.`)) return;
    setDeletingId(sale.id);
    try {
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', sale.id);

      if (items && items.length > 0) {
        await Promise.all(
          items.map(async (item) => {
            const { data: product } = await supabase
              .from('products')
              .select('current_stock')
              .eq('id', item.product_id)
              .maybeSingle();
            if (product) {
              await supabase
                .from('products')
                .update({ current_stock: product.current_stock + item.quantity })
                .eq('id', item.product_id);
            }
          })
        );
        await supabase.from('sale_items').delete().eq('sale_id', sale.id);
      }

      await supabase.from('sale_accessories').delete().eq('sale_id', sale.id);
      const { error } = await supabase.from('sales').delete().eq('id', sale.id);
      if (error) throw error;

      setFilteredSales(prev => prev.filter(s => s.id !== sale.id));
      setSales(prev => prev.filter(s => s.id !== sale.id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(sale.id); return next; });
    } catch {
      alert('Erro ao excluir venda.');
    } finally {
      setDeletingId(null);
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

      {/* Filtros */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 space-y-4">

        {/* Período */}
        <div className="flex flex-wrap gap-2">
          {(['today', 'yesterday', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Date pickers apenas no modo Personalizado */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Calendar size={15} className="text-gray-400" />
            <input type="date" value={dateFilter.start}
              onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
            <span className="text-gray-500 text-sm">até</span>
            <input type="date" value={dateFilter.end}
              onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
          </div>
        )}

        {/* Filtros secundários */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-gray-700">
          {/* Cliente */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cliente, bairro ou cidade" className="w-full bg-gray-700 text-white rounded-lg pl-9 pr-3 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>

          {/* Produto */}
          <div className="relative">
            {filterLoading && debouncedProductFilter
              ? <div className="absolute left-3 top-1/2 -translate-y-1/2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" /></div>
              : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            }
            <input type="text" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}
              placeholder="Buscar produto" className="w-full bg-gray-700 text-white rounded-lg pl-9 pr-3 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>

          {/* Status */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SaleStatus | 'all')}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm">
            <option value="all">Todos os Status</option>
            {SALE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {/* Tipo de entrega */}
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(DELIVERY_LABELS).map(([val, label]) => (
              <button key={val}
                onClick={() => { setDeliveryTypeFilter(val); if (val !== 'motoboy') setMotoboyFilter('all'); }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-1 min-w-fit ${deliveryTypeFilter === val ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Sub-filtro de motoboys — aparece só quando Motoboy está selecionado */}
          {deliveryTypeFilter === 'motoboy' && motoboys.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pl-2 border-l-2 border-orange-500/40">
              <button
                onClick={() => setMotoboyFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${motoboyFilter === 'all' ? 'bg-orange-500/80 text-white' : 'bg-gray-700/70 text-gray-400 hover:bg-gray-600'}`}>
                Todos os Motoboys
              </button>
              {motoboys.map(m => (
                <button key={m.id}
                  onClick={() => setMotoboyFilter(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${motoboyFilter === m.id ? 'bg-orange-500/80 text-white' : 'bg-gray-700/70 text-gray-400 hover:bg-gray-600'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {/* Forma de pagamento */}
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(PAYMENT_FILTER_LABELS).map(([val, label]) => (
              <button key={val} onClick={() => setPaymentFilter(val)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-1 min-w-fit ${paymentFilter === val ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Limpar */}
        {(searchTerm || productFilter || statusFilter !== 'all' || deliveryTypeFilter !== 'all' || motoboyFilter !== 'all' || paymentFilter !== 'all' || period !== 'month' || dateFilter.start || dateFilter.end) && (
          <button onClick={() => {
            setSearchTerm(''); setProductFilter(''); setStatusFilter('all');
            setDeliveryTypeFilter('all'); setMotoboyFilter('all'); setPaymentFilter('all'); setPeriod('month'); setDateFilter({ start: '', end: '' });
          }} className="text-orange-500 hover:text-orange-400 text-sm font-medium">
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Totalizador */}
      {!filterLoading && filteredSales.length > 0 && (() => {
        const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.total_sale_price), 0);
        const totalProfit  = filteredSales.reduce((sum, s) => sum + Number(s.profit), 0);
        const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 flex items-center gap-3">
              <Package size={16} className="text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Total de Vendas</p>
                <p className="text-lg font-bold text-white">{filteredSales.length}</p>
                {filteredSmartwatch > 0 && (
                  <p className="text-xs text-blue-400 mt-0.5">{filteredSmartwatch} smartwatches</p>
                )}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 flex items-center gap-3">
              <TrendingUp size={16} className="text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Faturamento Total</p>
                <p className="text-lg font-bold text-orange-400">{fmt(totalRevenue)}</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 flex items-center gap-3">
              <DollarSign size={16} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Lucro Total</p>
                <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(totalProfit)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {filterLoading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />
          Buscando vendas...
        </div>
      )}

      {/* Barra de seleção em massa */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ background: '#1a1400', border: '2px solid #f5c518' }}>
          <span className="text-sm font-bold" style={{ color: '#f5c518' }}>
            {selectedIds.size} venda{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value as SaleStatus)}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none text-sm"
            >
              {SALE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              onClick={updateBulkStatus}
              disabled={bulkUpdating}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity disabled:opacity-50"
              style={{ background: '#f5c518', color: '#000' }}
            >
              {bulkUpdating ? 'Atualizando...' : `Atualizar ${selectedIds.size} venda${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Limpar seleção
          </button>
        </div>
      )}

      <div className="space-y-4">
        {filterLoading ? (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Carregando vendas...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
            <Package size={48} className="mx-auto text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Nenhuma venda encontrada {EMPTY_PERIOD_LABELS[period]}
            </h3>
            <p className="text-gray-400">
              {searchTerm || productFilter || statusFilter !== 'all' || deliveryTypeFilter !== 'all' || paymentFilter !== 'all'
                ? 'Tente ajustar os filtros para ver mais resultados'
                : 'As vendas realizadas aparecerão aqui'}
            </p>
          </div>
        ) : (
          <>
            {/* Selecionar todos visíveis */}
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="select-all"
                checked={filteredSales.slice(0, visibleCount).every(s => selectedIds.has(s.id))}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-orange-500 cursor-pointer"
              />
              <label htmlFor="select-all" className="text-xs text-gray-400 cursor-pointer select-none">
                Selecionar todos visíveis ({Math.min(visibleCount, filteredSales.length)})
              </label>
            </div>

          {filteredSales.slice(0, visibleCount).map((sale) => {
            const statusConfig = getStatusConfig(sale.status);
            const isSelected = selectedIds.has(sale.id);
            return (
              <div
                key={sale.id}
                className="relative bg-gray-800 rounded-lg p-6 border transition-all"
                style={{ borderColor: isSelected ? '#f5c518' : undefined }}
                onClick={e => {
                  const tag = (e.target as HTMLElement).tagName;
                  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'OPTION') return;
                  if ((e.target as HTMLElement).closest('button, select, a')) return;
                }}
              >
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-12 lg:col-span-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(sale.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 mt-1.5 flex-shrink-0 accent-orange-500 cursor-pointer"
                      />
                      <Package size={24} className="text-orange-500 mt-1 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-lg font-semibold text-white">{sale.customer_name}</h3>
                          {sale.delivery_type && DELIVERY_CONFIG[sale.delivery_type] && (() => {
                            const cfg = DELIVERY_CONFIG[sale.delivery_type!];
                            const Icon = cfg.icon;
                            const deliveryLabel = sale.delivery_type === 'motoboy' && sale.motoboy_name
                              ? sale.motoboy_name
                              : cfg.label;
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                                <Icon size={11} />{deliveryLabel}
                              </span>
                            );
                          })()}
                          {(() => {
                            const paymentKey = (sale.payment_methods && sale.payment_methods.length > 1) ? 'mixed' : sale.payment_method;
                            const cfg = PAYMENT_CONFIG[paymentKey];
                            if (!cfg) return null;
                            const Icon = cfg.icon;
                            const showInstallments = (sale.installments ?? 0) > 1
                              && (sale.payment_method === 'credit_card' || sale.payment_method === 'payment_link');
                            const badgeLabel = showInstallments ? `${cfg.label} ${sale.installments}x` : cfg.label;
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                                <Icon size={11} />{badgeLabel}
                              </span>
                            );
                          })()}
                        </div>
                        {sale.main_product && (
                          <p className="text-gray-300 text-sm mb-1">
                            {sale.main_product}
                            {sale.additional_items > 0 && <span className="text-gray-500"> +{sale.additional_items} {sale.additional_items === 1 ? 'item' : 'itens'}</span>}
                          </p>
                        )}
                        <p className="text-gray-400 text-sm">{sale.neighborhood} - {sale.city}</p>
                        {sale.delivery_notes && (
                          <p className="text-amber-400 text-xs mt-1">📝 {sale.delivery_notes}</p>
                        )}
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
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-xl font-bold text-green-500">{formatCurrency(sale.total_sale_price)}</p>
                          <p className={`text-sm font-semibold ${Number(sale.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            lucro {formatCurrency(Number(sale.profit))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-2 flex flex-wrap gap-2">
                    <button onClick={() => setEditingSaleId(sale.id)} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-0">
                      <Edit size={14} />
                      <span className="text-xs font-semibold">Editar</span>
                    </button>
                    <button onClick={() => setReceiptChoiceSale(sale)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-0">
                      <FileText size={14} />
                      <span className="text-xs font-semibold">Recibo</span>
                    </button>
                    <button onClick={() => setGiftSale(sale)} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold">🎁 Presente</span>
                    </button>
                    <button onClick={() => setWhatsappSale(sale)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 w-full">
                      <MessageCircle size={14} />
                      <span className="text-xs font-semibold">Resumo WhatsApp</span>
                    </button>
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <div className="relative">
                      <select value={sale.status} onChange={(e) => updateSaleStatus(sale.id, e.target.value as SaleStatus)} className={`w-full appearance-none rounded-lg px-4 py-2.5 pr-10 border-2 font-semibold cursor-pointer transition-all ${statusConfig.color} ${statusConfig.bgColor} ${statusConfig.borderColor} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-orange-500`}>
                        {SALE_STATUSES.map((status) => (<option key={status.value} value={status.value}>{status.label}</option>))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" size={20} />
                    </div>
                    <button
                      onClick={() => deleteSale(sale)}
                      disabled={deletingId === sale.id}
                      className="mt-2 flex items-center gap-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors text-xs"
                      title="Excluir venda"
                    >
                      <Trash2 size={14} />
                      <span>{deletingId === sale.id ? 'Excluindo...' : 'Excluir venda'}</span>
                    </button>
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
                          onClick={() => handleViewNFe(sale)}
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
          })}
          </>
        )}
      </div>

      {!filterLoading && visibleCount < filteredSales.length && (
        <div className="flex flex-col items-center gap-1 pt-2">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-all"
          >
            Carregar mais ({filteredSales.length - visibleCount} restantes)
          </button>
          <p className="text-xs text-gray-500">Exibindo {Math.min(visibleCount, filteredSales.length)} de {filteredSales.length} vendas</p>
        </div>
      )}

      {selectedSale && <Receipt saleData={selectedSale} hideDeliveryControl={receiptHideDelivery} onClose={() => setSelectedSale(null)} />}
      {giftSale && <Receipt saleData={giftSale} giftMode={true} onClose={() => setGiftSale(null)} />}
      {receiptChoiceSale && (
        <ReceiptChoiceModal
          onClose={() => setReceiptChoiceSale(null)}
          onSelect={(hide) => {
            setReceiptHideDelivery(hide);
            setSelectedSale(receiptChoiceSale);
            setReceiptChoiceSale(null);
          }}
        />
      )}
      {editingSaleId && <EditSale saleId={editingSaleId} onClose={() => { setEditingSaleId(null); loadSales(); }} />}
      {whatsappSale && <WhatsAppModal sale={whatsappSale} onClose={() => setWhatsappSale(null)} />}
    </div>
  );
}

function ReceiptChoiceModal({ onClose, onSelect }: { onClose: () => void; onSelect: (hideDelivery: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Abrir Recibo</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-700 transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSelect(false)}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            style={{ background: '#1e3a5f', border: '1px solid #2563eb' }}
          >
            🖨️ Imprimir completo
          </button>
          <button
            onClick={() => onSelect(true)}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            style={{ background: '#14532d', border: '1px solid #16a34a' }}
          >
            📱 Versão WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function translatePayment(method: string): string {
  const map: Record<string, string> = {
    pix: 'PIX',
    cash: 'Dinheiro',
    dinheiro: 'Dinheiro',
    debit_card: 'Débito',
    credit_card: 'Crédito até 10x sem juros',
    payment_link: 'Link de Pagamento',
    debito: 'Débito',
    credito: 'Crédito até 10x sem juros',
  };
  return map[method?.toLowerCase()] ?? method;
}

interface SaleItem { name: string; quantity: number; isMain: boolean; }

function WhatsAppModal({ sale, onClose }: { sale: any; onClose: () => void }) {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      const result: SaleItem[] = [];

      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', sale.id)
        .order('quantity', { ascending: false });

      if (saleItems && saleItems.length > 0) {
        const productIds = saleItems.map((i: any) => i.product_id);
        const { data: products } = await supabase
          .from('products')
          .select('id, model, color, category')
          .in('id', productIds);

        saleItems.forEach((item: any, idx: number) => {
          const p = products?.find((x: any) => x.id === item.product_id);
          if (p) {
            const name = item.quantity > 1 ? `${p.model} ${p.color} (x${item.quantity})` : `${p.model} ${p.color}`;
            result.push({ name, quantity: item.quantity, isMain: idx === 0 && p.category === 'smartwatch' });
          }
        });
      }

      const { data: accessories } = await supabase
        .from('sale_accessories')
        .select('quantity, accessory_id, custom_name')
        .eq('sale_id', sale.id);

      if (accessories && accessories.length > 0) {
        for (const acc of accessories as any[]) {
          let accName = acc.custom_name || '';
          if (!accName && acc.accessory_id) {
            const { data: accessory } = await supabase.from('accessories').select('name').eq('id', acc.accessory_id).maybeSingle();
            if (accessory) accName = (accessory as any).name;
          }
          if (accName) {
            const name = acc.quantity > 1 ? `${accName} (x${acc.quantity})` : accName;
            result.push({ name, quantity: acc.quantity, isMain: false });
          }
        }
      }

      if (sale.manual_items) {
        const manualItems = Array.isArray(sale.manual_items) ? sale.manual_items : [];
        for (const mi of manualItems) {
          const name = mi.quantity > 1 ? `${mi.name || 'Item'} (x${mi.quantity})` : (mi.name || 'Item');
          result.push({ name, quantity: mi.quantity || 1, isMain: false });
        }
      }

      setItems(result);
      setLoadingItems(false);
    };

    fetchItems();
  }, [sale.id]);

  const formatCurrencyBR = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const buildMessage = () => {
    const itemLines = items.map(i => `- ${i.name}`).join('\n');
    return (
      `✅ *PEDIDO CONFIRMADO*\n\n` +
      `👤 *Cliente:* ${sale.customer_name}\n` +
      `📍 *Entrega:* ${sale.neighborhood} - ${sale.city}\n` +
      `💳 *Pagamento:* ${translatePayment(sale.payment_method)}\n` +
      `💰 *Total:* ${formatCurrencyBR(sale.total_sale_price)}\n\n` +
      `📦 *Itens:*\n${itemLines}\n\n` +
      `✅ Pedido confirmado e em separação!`
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#111118', border: '1px solid #1a1a2a' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} style={{ color: '#22c55e' }} />
            <span className="text-base font-semibold text-white">Resumo WhatsApp</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {loadingItems ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#22c55e', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed rounded-xl p-4 mb-4 font-sans select-all" style={{ background: '#0d0d14', border: '1px solid #1a1a2a', color: '#d1d5db' }}>
              {buildMessage()}
            </pre>
            <button
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: copied ? '#166534' : '#16a34a', color: '#fff' }}
            >
              {copied ? <><Check size={16} />Copiado! ✓</> : <><Copy size={16} />Copiar</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}