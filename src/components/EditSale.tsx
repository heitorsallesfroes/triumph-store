import { useEffect, useRef, useState } from 'react';
import { supabase, Supplier, Motoboy } from '../lib/supabase';
import { X, Save, Trash2, Plus, Package } from 'lucide-react';
import { calculateCardFee, getFeePercentageLabel } from '../lib/cardFees';

interface EditSaleProps {
  saleId: string;
  onClose: () => void;
  onSaved?: (saleId: string, updates: Record<string, any>) => void;
}

interface PaymentEntry {
  method: string;
  card_brand: string;
  installments: number;
  amount: number;
}

interface SaleData {
  id: string;
  customer_name: string;
  total_sale_price: number;
  total_cost: number;
  payment_method: string;
  card_brand: string | null;
  installments: number;
  delivery_fee: number;
  delivery_cost: number;
  delivery_type: string;
  motoboy_id: string | null;
  supplier_id: string | null;
  volumes: number;
  payment_methods?: PaymentEntry[] | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

// ── Product types ────────────────────────────────────────────────────────────

interface EditableSaleItem {
  product_id:    string;
  quantity:      number;
  unit_price:    number;
  product_model: string;
  product_color: string;
  product_cost:  number;
}

interface ProductOption {
  id:            string;
  model:         string;
  color:         string;
  cost:          number;
  current_stock: number;
  price:         number;
}

interface SaleAccessory {
  accessory_id: string | null;
  quantity: number;
  cost: number;
  custom_name?: string;
  accessory?: { cost: number };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditSale({ saleId, onClose, onSaved }: EditSaleProps) {
  const [sale, setSale]               = useState<SaleData | null>(null);
  const [items, setItems]             = useState<EditableSaleItem[]>([]);
  const [accessories, setAccessories] = useState<SaleAccessory[]>([]);
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [motoboys, setMotoboys]       = useState<Motoboy[]>([]);
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);

  // Snapshot of items as they were when the modal opened — used for stock diff
  const originalItemsRef = useRef<{ product_id: string; quantity: number }[]>([]);
  // Guard so the auto-total useEffect skips the initial render
  const itemsModified = useRef(false);

  // Add-product form
  const [addProductId,    setAddProductId]    = useState('');
  const [addProductQty,   setAddProductQty]   = useState(1);
  const [addProductPrice, setAddProductPrice] = useState(0);

  const [editData, setEditData] = useState({
    delivery_fee: 0,
    delivery_cost: 0,
    delivery_type: 'loja_fisica',
    motoboy_id: '',
    supplier_id: '',
    volumes: 1,
    totalSalePrice: 0,
    address_street: '',
    address_number: '',
    address_complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentEntry[]>([
    { method: 'credit_card', card_brand: '', installments: 0, amount: 0 },
  ]);

  useEffect(() => { loadSaleData(); }, [saleId]);

  // Auto-recalculate total sale price whenever items change (but not on initial load)
  useEffect(() => {
    if (!itemsModified.current) return;
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    setEditData(prev => ({ ...prev, totalSalePrice: parseFloat(total.toFixed(2)) }));
  }, [items]);

  const loadSaleData = async () => {
    try {
      const [saleRes, itemsRes, accessoriesRes, suppliersRes, motoboysRes, productsRes] = await Promise.all([
        supabase.from('sales').select('*').eq('id', saleId).single(),
        supabase.from('sale_items')
          .select('product_id, quantity, unit_price, product:products(id, model, color, cost, current_stock)')
          .eq('sale_id', saleId),
        supabase.from('sale_accessories').select('*, accessory:accessories(cost)').eq('sale_id', saleId),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('motoboys').select('*').order('name'),
        supabase.from('products').select('*').order('model'),
      ]);

      if (saleRes.error)  throw saleRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setSale(saleRes.data);
      setSuppliers(suppliersRes.data || []);
      setMotoboys(motoboysRes.data || []);
      setAllProducts(productsRes.data || []);
      setAccessories(accessoriesRes.data || []);

      const editableItems: EditableSaleItem[] = (itemsRes.data || []).map((item: any) => ({
        product_id:    item.product_id,
        quantity:      item.quantity,
        unit_price:    item.unit_price || 0,
        product_model: item.product?.model || '',
        product_color: item.product?.color || '',
        product_cost:  item.product?.cost  || 0,
      }));
      setItems(editableItems);
      originalItemsRef.current = editableItems.map(i => ({ product_id: i.product_id, quantity: i.quantity }));

      setEditData({
        delivery_fee:      saleRes.data.delivery_fee  || 0,
        delivery_cost:     saleRes.data.delivery_cost || 0,
        delivery_type:     saleRes.data.delivery_type || 'loja_fisica',
        motoboy_id:        saleRes.data.motoboy_id    || '',
        supplier_id:       saleRes.data.supplier_id   || '',
        volumes:           saleRes.data.volumes        || 1,
        totalSalePrice:    saleRes.data.total_sale_price || 0,
        address_street:    saleRes.data.address_street    || '',
        address_number:    saleRes.data.address_number    || '',
        address_complement:saleRes.data.address_complement || '',
        neighborhood:      saleRes.data.neighborhood  || '',
        city:              saleRes.data.city           || '',
        state:             saleRes.data.state          || '',
        zip_code:          saleRes.data.zip_code       || '',
      });

      const existing = saleRes.data.payment_methods;
      if (existing && Array.isArray(existing) && existing.length > 0) {
        setPaymentMethods(existing);
      } else {
        setPaymentMethods([{
          method:       saleRes.data.payment_method || 'pix',
          card_brand:   saleRes.data.card_brand     || '',
          installments: saleRes.data.installments   || 0,
          amount:       0,
        }]);
      }
    } catch (error) {
      console.error('Error loading sale data:', error);
      alert('Erro ao carregar dados da venda');
    } finally {
      setLoading(false);
    }
  };

  // ── Item manipulation ────────────────────────────────────────────────────

  const updateItemQty = (index: number, newQty: number) => {
    itemsModified.current = true;
    setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, newQty) } : item));
  };

  const updateItemPrice = (index: number, newPrice: number) => {
    itemsModified.current = true;
    setItems(prev => prev.map((item, i) => i === index ? { ...item, unit_price: newPrice } : item));
  };

  const removeItem = (index: number) => {
    itemsModified.current = true;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    const product = allProducts.find(p => p.id === addProductId);
    if (!product) return;
    itemsModified.current = true;
    setItems(prev => [...prev, {
      product_id:    product.id,
      quantity:      addProductQty,
      unit_price:    addProductPrice,
      product_model: product.model,
      product_color: product.color,
      product_cost:  product.cost,
    }]);
    setAddProductId('');
    setAddProductQty(1);
    setAddProductPrice(0);
  };

  // ── Payment methods ──────────────────────────────────────────────────────

  const updatePaymentMethod = (index: number, field: string, value: string | number) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'method' && value !== 'credit_card' && value !== 'debit_card' && value !== 'payment_link') {
      updated[index].card_brand = '';
      updated[index].installments = 0;
    }
    if (field === 'method' && value !== 'credit_card' && value !== 'payment_link') {
      updated[index].installments = 0;
    }
    setPaymentMethods(updated);
  };

  const addPaymentEntry = () => {
    setPaymentMethods([...paymentMethods, { method: 'pix', card_brand: '', installments: 0, amount: 0 }]);
  };

  const removePaymentEntry = (index: number) => {
    setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
  };

  // ── Calculations ─────────────────────────────────────────────────────────

  const calculateUpdatedValues = () => {
    if (!sale) return null;

    const totalProductCost = items.reduce((sum, item) => sum + item.product_cost * item.quantity, 0);
    const totalAccessoryCost = accessories.reduce((sum, acc) => sum + (acc.cost || acc.accessory?.cost || 0) * acc.quantity, 0);

    const allAmountsZero = paymentMethods.every(pm => pm.amount === 0);
    const cardFee = allAmountsZero
      ? calculateCardFee(editData.totalSalePrice, paymentMethods[0]?.method || 'pix', paymentMethods[0]?.card_brand || '', paymentMethods[0]?.installments || 0)
      : paymentMethods.reduce((sum, pm) => sum + calculateCardFee(pm.amount, pm.method, pm.card_brand || '', pm.installments || 0), 0);

    const deliveryFee  = editData.delivery_type === 'motoboy'  ? editData.delivery_fee  : 0;
    const deliveryCost = editData.delivery_type === 'correios' ? editData.delivery_cost : 0;
    const totalCost    = totalProductCost + totalAccessoryCost + deliveryFee + deliveryCost;
    const netReceived  = editData.totalSalePrice - cardFee;
    const profit       = netReceived - totalCost;

    return { cardFee, deliveryFee, deliveryCost, totalCost, netReceived, profit };
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!sale) return;

    const allAmountsZero = paymentMethods.every(pm => pm.amount === 0);
    if (!allAmountsZero) {
      const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
      if (Math.abs(totalAllocated - editData.totalSalePrice) > 0.01) {
        alert(`Total alocado (R$ ${totalAllocated.toFixed(2)}) não bate com o valor da venda (R$ ${editData.totalSalePrice.toFixed(2)})`);
        return;
      }
    }

    const updated = calculateUpdatedValues();
    if (!updated) return;

    setSaving(true);
    try {
      // ── 1. Stock adjustments ───────────────────────────────────────────────
      const origMap = new Map(originalItemsRef.current.map(i => [i.product_id, i.quantity]));
      const currMap = new Map(items.map(i => [i.product_id, i.quantity]));

      const stockDeltas: { product_id: string; delta: number }[] = [];

      // Products that existed before: check for qty change or removal
      for (const [pid, origQty] of origMap) {
        const currQty = currMap.get(pid) ?? 0;
        const delta = origQty - currQty; // positive = restore stock, negative = deduct
        if (delta !== 0) stockDeltas.push({ product_id: pid, delta });
      }
      // Products added for the first time
      for (const [pid, currQty] of currMap) {
        if (!origMap.has(pid)) stockDeltas.push({ product_id: pid, delta: -currQty });
      }

      if (stockDeltas.length > 0) {
        await Promise.all(stockDeltas.map(async ({ product_id, delta }) => {
          const { data: product } = await supabase
            .from('products').select('current_stock').eq('id', product_id).maybeSingle();
          if (product) {
            await supabase.from('products')
              .update({ current_stock: product.current_stock + delta })
              .eq('id', product_id);
          }
        }));
      }

      // ── 2. Rebuild sale_items ──────────────────────────────────────────────
      await supabase.from('sale_items').delete().eq('sale_id', saleId);
      if (items.length > 0) {
        const { error: insertError } = await supabase.from('sale_items').insert(
          items.map(item => ({
            sale_id:    saleId,
            product_id: item.product_id,
            quantity:   item.quantity,
            unit_price: item.unit_price,
          }))
        );
        if (insertError) throw insertError;
      }

      // Update snapshot so a second save doesn't double-adjust stock
      originalItemsRef.current = items.map(i => ({ product_id: i.product_id, quantity: i.quantity }));

      // ── 3. Update sales row ────────────────────────────────────────────────
      const { error } = await supabase.from('sales').update({
        payment_method:  paymentMethods[0]?.method || 'pix',
        card_brand:      paymentMethods.find(pm => ['credit_card', 'debit_card', 'payment_link'].includes(pm.method))?.card_brand || null,
        installments:    paymentMethods.find(pm => pm.method === 'credit_card' || pm.method === 'payment_link')?.installments || 1,
        payment_methods: paymentMethods,
        delivery_type:   editData.delivery_type,
        delivery_fee:    updated.deliveryFee,
        delivery_cost:   updated.deliveryCost,
        motoboy_id:      editData.delivery_type === 'motoboy' ? (editData.motoboy_id || null) : null,
        supplier_id:     editData.supplier_id || null,
        total_sale_price:editData.totalSalePrice,
        card_fee:        updated.cardFee,
        total_cost:      updated.totalCost,
        net_received:    updated.netReceived,
        profit:          updated.profit,
        volumes:         editData.volumes,
        address_street:  editData.address_street.trim()      || null,
        address_number:  editData.address_number.trim()      || null,
        address_complement: editData.address_complement.trim() || null,
        neighborhood:    editData.neighborhood.trim()        || '',
        city:            editData.city.trim()                || '',
        state:           editData.state.trim()               || null,
        zip_code:        editData.zip_code.trim()            || null,
      }).eq('id', saleId);

      if (error) throw error;

      onSaved?.(saleId, {
        payment_method:  paymentMethods[0]?.method || 'pix',
        card_brand:      paymentMethods.find(pm => ['credit_card', 'debit_card', 'payment_link'].includes(pm.method))?.card_brand || null,
        installments:    paymentMethods.find(pm => pm.method === 'credit_card' || pm.method === 'payment_link')?.installments || 1,
        payment_methods: paymentMethods,
        delivery_type:   editData.delivery_type,
        delivery_fee:    updated.deliveryFee,
        delivery_cost:   updated.deliveryCost,
        motoboy_id:      editData.delivery_type === 'motoboy' ? (editData.motoboy_id || null) : null,
        total_sale_price:editData.totalSalePrice,
        profit:          updated.profit,
        address_street:  editData.address_street.trim()  || null,
        address_number:  editData.address_number.trim()  || null,
        address_complement: editData.address_complement.trim() || null,
        neighborhood:    editData.neighborhood.trim()    || '',
        city:            editData.city.trim()            || '',
        state:           editData.state.trim()           || null,
        zip_code:        editData.zip_code.trim()        || null,
      });

      alert('Venda atualizada com sucesso!');
      onClose();
    } catch (error: any) {
      console.error('Error updating sale:', error);
      alert('Erro ao atualizar venda');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  if (!sale) return null;

  const updated = calculateUpdatedValues();
  const productTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full border border-gray-700 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-2xl font-bold text-white">Editar Venda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Customer header */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold mb-1">{sale.customer_name}</div>
            <div className="text-gray-400 text-sm">
              Valor Total: R$ {sale.total_sale_price.toFixed(2)}
            </div>
          </div>

          {/* ── PRODUTOS ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-orange-500" />
              <label className="text-white font-semibold">Produtos da Venda</label>
            </div>

            {items.length === 0 && (
              <p className="text-gray-500 text-sm px-1">Nenhum produto. Adicione abaixo.</p>
            )}

            {items.map((item, index) => (
              <div key={item.product_id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium text-sm">
                    {item.product_model} {item.product_color}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-red-400 hover:text-red-300 p-0.5 rounded transition-colors"
                    title="Remover produto (devolve ao estoque)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItemQty(index, parseInt(e.target.value) || 1)}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1.5 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Preço unitário (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_price}
                      onChange={e => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1.5 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Subtotal</label>
                    <div className="bg-gray-700/50 rounded px-2 py-1.5 text-sm font-semibold text-green-400">
                      R$ {(item.quantity * item.unit_price).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add product form */}
            <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700 border-dashed space-y-2">
              <p className="text-gray-400 text-xs font-medium">Adicionar produto</p>
              <select
                value={addProductId}
                onChange={e => {
                  const product = allProducts.find(p => p.id === e.target.value);
                  setAddProductId(e.target.value);
                  if (product) setAddProductPrice(product.price || 0);
                  setAddProductQty(1);
                }}
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
              >
                <option value="">Selecionar produto...</option>
                {allProducts
                  .filter(p => !items.some(i => i.product_id === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.model} {p.color} — estoque: {p.current_stock}
                    </option>
                  ))}
              </select>

              {addProductId && (
                <div className="flex gap-2">
                  <div className="w-20">
                    <label className="text-xs text-gray-500 mb-1 block">Qtd</label>
                    <input
                      type="number"
                      min="1"
                      value={addProductQty}
                      onChange={e => setAddProductQty(parseInt(e.target.value) || 1)}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1.5 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Preço unit. (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addProductPrice}
                      onChange={e => setAddProductPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1.5 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={addItem}
                      className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm font-semibold transition-colors"
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="flex justify-between text-sm px-1">
                <span className="text-gray-400">Total dos produtos:</span>
                <span className="text-white font-bold">R$ {productTotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Fornecedor */}
          <div className="space-y-2">
            <label className="block text-white font-semibold">Fornecedor</label>
            <select
              value={editData.supplier_id}
              onChange={e => setEditData({ ...editData, supplier_id: e.target.value })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
            >
              <option value="">Selecionar Fornecedor</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>

          {/* Valor total */}
          <div className="space-y-2">
            <label className="block text-white font-semibold">Valor Total da Venda (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editData.totalSalePrice}
              onChange={e => setEditData({ ...editData, totalSalePrice: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none font-semibold text-lg"
            />
          </div>

          {/* Formas de pagamento */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-white font-semibold">Formas de Pagamento</label>
              <button
                type="button"
                onClick={addPaymentEntry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors text-sm font-medium"
              >
                + Adicionar
              </button>
            </div>

            <div className="space-y-3">
              {paymentMethods.map((pm, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-3 border border-gray-600 space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={pm.method}
                      onChange={e => updatePaymentMethod(index, 'method', e.target.value)}
                      className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                    >
                      <option value="pix">PIX (Sem taxa)</option>
                      <option value="cash">Dinheiro (Sem taxa)</option>
                      <option value="debit_card">Débito</option>
                      <option value="credit_card">Crédito</option>
                      <option value="payment_link">Link de Pagamento</option>
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor (R$)"
                      value={pm.amount || ''}
                      onChange={e => updatePaymentMethod(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-36 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                    />

                    {paymentMethods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentEntry(index)}
                        className="text-red-400 hover:text-red-300 p-1.5"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {(pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link') && (
                    <div className="flex gap-3">
                      <select
                        value={pm.card_brand}
                        onChange={e => updatePaymentMethod(index, 'card_brand', e.target.value)}
                        className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                      >
                        <option value="">Bandeira (definir depois)</option>
                        <option value="visa_mastercard">Visa / Mastercard</option>
                        <option value="elo_amex">Elo / Amex</option>
                      </select>

                      {(pm.method === 'credit_card' || pm.method === 'payment_link') && (
                        <select
                          value={pm.installments}
                          onChange={e => updatePaymentMethod(index, 'installments', parseInt(e.target.value))}
                          className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                        >
                          <option value="0">Parcelas (definir depois)</option>
                          {pm.card_brand && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                            <option key={n} value={n}>
                              {n}x ({getFeePercentageLabel('credit_card', pm.card_brand, n)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {(pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link') && pm.amount > 0 && pm.card_brand && (
                    <div className="text-xs text-red-400">
                      Taxa: R$ {calculateCardFee(pm.amount, pm.method, pm.card_brand, pm.installments).toFixed(2)} ({getFeePercentageLabel(pm.method, pm.card_brand, pm.installments)})
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(() => {
              const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
              const remaining = editData.totalSalePrice - totalAllocated;
              const isBalanced = Math.abs(remaining) < 0.01;
              const hasAmounts = totalAllocated > 0;
              return (
                <div className="mt-2 pt-3 border-t border-gray-600 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Total da Venda</div>
                    <div className="text-white font-bold">R$ {editData.totalSalePrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Alocado</div>
                    <div className={`font-bold ${!hasAmounts ? 'text-gray-400' : isBalanced ? 'text-green-400' : 'text-yellow-400'}`}>
                      R$ {totalAllocated.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Falta Alocar</div>
                    <div className={`font-bold ${!hasAmounts ? 'text-gray-400' : isBalanced ? 'text-green-400' : remaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      R$ {remaining.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Tipo de entrega */}
          <div className="space-y-2">
            <label className="block text-white font-semibold">Tipo de Entrega</label>
            <select
              value={editData.delivery_type}
              onChange={e => setEditData({ ...editData, delivery_type: e.target.value, motoboy_id: '', delivery_fee: 0, delivery_cost: 0 })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
            >
              <option value="loja_fisica">Loja Física</option>
              <option value="motoboy">Motoboy</option>
              <option value="correios">Correios (SEDEX)</option>
            </select>
          </div>

          {editData.delivery_type === 'motoboy' && (
            <>
              <div className="space-y-2">
                <label className="block text-white font-semibold">Motoboy</label>
                <select
                  value={editData.motoboy_id}
                  onChange={e => setEditData({ ...editData, motoboy_id: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">Selecionar Motoboy</option>
                  {motoboys.map(motoboy => (
                    <option key={motoboy.id} value={motoboy.id}>{motoboy.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-white font-semibold">Taxa de Entrega (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editData.delivery_fee}
                  onChange={e => setEditData({ ...editData, delivery_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {editData.delivery_type === 'correios' && (
            <div className="space-y-2">
              <label className="block text-white font-semibold">Custo Correios (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editData.delivery_cost}
                onChange={e => setEditData({ ...editData, delivery_cost: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
          )}

          {editData.delivery_type !== 'loja_fisica' && (
            <div className="space-y-3">
              <label className="block text-white font-semibold">Endereço de Entrega</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Rua</label>
                  <input type="text" value={editData.address_street}
                    onChange={e => setEditData({ ...editData, address_street: e.target.value })}
                    placeholder="Ex: Rua das Flores"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Número</label>
                  <input type="text" value={editData.address_number}
                    onChange={e => setEditData({ ...editData, address_number: e.target.value })}
                    placeholder="Ex: 123"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Complemento</label>
                  <input type="text" value={editData.address_complement}
                    onChange={e => setEditData({ ...editData, address_complement: e.target.value })}
                    placeholder="Ex: Apto 201"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Bairro</label>
                  <input type="text" value={editData.neighborhood}
                    onChange={e => setEditData({ ...editData, neighborhood: e.target.value })}
                    placeholder="Ex: Centro"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cidade</label>
                  <input type="text" value={editData.city}
                    onChange={e => setEditData({ ...editData, city: e.target.value })}
                    placeholder="Ex: Niterói"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">CEP</label>
                  <input type="text" value={editData.zip_code}
                    onChange={e => setEditData({ ...editData, zip_code: e.target.value })}
                    placeholder="Ex: 24020-125"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Estado (UF)</label>
                  <input type="text" value={editData.state}
                    onChange={e => setEditData({ ...editData, state: e.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="Ex: RJ"
                    maxLength={2}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm uppercase" />
                </div>
              </div>
            </div>
          )}

          {/* Volumes */}
          <div className="space-y-2">
            <label className="block text-white font-semibold">Quantidade de Volumes</label>
            <input
              type="number"
              min="1"
              value={editData.volumes}
              onChange={e => setEditData({ ...editData, volumes: parseInt(e.target.value) || 1 })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <p className="text-gray-400 text-sm">Número de etiquetas de entrega a serem impressas</p>
          </div>

          {/* Valores atualizados */}
          {updated && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-2">
              <h3 className="text-white font-semibold mb-3">Valores Atualizados</h3>
              {updated.cardFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Taxa do Cartão:</span>
                  <span className="text-red-400 font-semibold">− R$ {updated.cardFee.toFixed(2)}</span>
                </div>
              )}
              {updated.deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Taxa Motoboy:</span>
                  <span className="text-red-400 font-semibold">R$ {updated.deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {updated.deliveryCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Custo Correios:</span>
                  <span className="text-red-400 font-semibold">R$ {updated.deliveryCost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Custo Total:</span>
                <span className="text-gray-300 font-semibold">R$ {updated.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Valor Recebido:</span>
                <span className="text-blue-400 font-semibold">R$ {updated.netReceived.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-white font-bold">Lucro Final:</span>
                <span className={`font-bold text-lg ${updated.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  R$ {updated.profit.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
