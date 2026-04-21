import { useEffect, useState } from 'react';
import { supabase, Supplier, Motoboy } from '../lib/supabase';
import { X, Save, Trash2 } from 'lucide-react';
import { calculateCardFee, getFeePercentageLabel } from '../lib/cardFees';

interface EditSaleProps {
  saleId: string;
  onClose: () => void;
  onSaved: () => void;
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
}

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  product: {
    cost: number;
  };
}

interface SaleAccessory {
  accessory_id: string | null;
  quantity: number;
  cost: number;
  custom_name?: string;
  accessory?: {
    cost: number;
  };
}

export default function EditSale({ saleId, onClose, onSaved }: EditSaleProps) {
  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [accessories, setAccessories] = useState<SaleAccessory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editData, setEditData] = useState({
    delivery_fee: 0,
    delivery_cost: 0,
    delivery_type: 'loja_fisica',
    motoboy_id: '',
    supplier_id: '',
    volumes: 1,
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentEntry[]>([
    { method: 'credit_card', card_brand: '', installments: 0, amount: 0 },
  ]);

  useEffect(() => {
    loadSaleData();
  }, [saleId]);

  const loadSaleData = async () => {
    try {
      const [saleResponse, itemsResponse, accessoriesResponse, suppliersResponse, motoboysResponse] = await Promise.all([
        supabase.from('sales').select('*').eq('id', saleId).single(),
        supabase.from('sale_items').select('*, product:products(cost)').eq('sale_id', saleId),
        supabase.from('sale_accessories').select('*, accessory:accessories(cost)').eq('sale_id', saleId),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('motoboys').select('*').order('name'),
      ]);

      if (saleResponse.error) throw saleResponse.error;
      if (itemsResponse.error) throw itemsResponse.error;
      if (accessoriesResponse.error) throw accessoriesResponse.error;

      setSale(saleResponse.data);
      setItems(itemsResponse.data || []);
      setAccessories(accessoriesResponse.data || []);
      setSuppliers(suppliersResponse.data || []);
      setMotoboys(motoboysResponse.data || []);
      setEditData({
        delivery_fee: saleResponse.data.delivery_fee || 0,
        delivery_cost: saleResponse.data.delivery_cost || 0,
        delivery_type: saleResponse.data.delivery_type || 'loja_fisica',
        motoboy_id: saleResponse.data.motoboy_id || '',
        supplier_id: saleResponse.data.supplier_id || '',
        volumes: saleResponse.data.volumes || 1,
      });

      const existing = saleResponse.data.payment_methods;
      if (existing && Array.isArray(existing) && existing.length > 0) {
        setPaymentMethods(existing);
      } else {
        setPaymentMethods([{
          method: saleResponse.data.payment_method || 'pix',
          card_brand: saleResponse.data.card_brand || '',
          installments: saleResponse.data.installments || 0,
          amount: 0,
        }]);
      }
    } catch (error) {
      console.error('Error loading sale data:', error);
      alert('Erro ao carregar dados da venda');
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentMethod = (index: number, field: string, value: string | number) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'method' && value !== 'credit_card' && value !== 'debit_card') {
      updated[index].card_brand = '';
      updated[index].installments = 0;
    }
    if (field === 'method' && value !== 'credit_card') {
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

  const calculateUpdatedValues = () => {
    if (!sale) return null;

    const totalProductCost = items.reduce((sum, item) => {
      return sum + (item.product?.cost || 0) * item.quantity;
    }, 0);

    const totalAccessoryCost = accessories.reduce((sum, acc) => {
      return sum + (acc.cost || acc.accessory?.cost || 0) * acc.quantity;
    }, 0);

    const allAmountsZero = paymentMethods.every((pm) => pm.amount === 0);
    const cardFee = allAmountsZero
      ? calculateCardFee(sale.total_sale_price, paymentMethods[0]?.method || 'pix', paymentMethods[0]?.card_brand || '', paymentMethods[0]?.installments || 0)
      : paymentMethods.reduce((sum, pm) => sum + calculateCardFee(pm.amount, pm.method, pm.card_brand || '', pm.installments || 0), 0);

    const deliveryFee = editData.delivery_type === 'motoboy' ? editData.delivery_fee : 0;
    const deliveryCost = editData.delivery_type === 'correios' ? editData.delivery_cost : 0;
    const totalCost = totalProductCost + totalAccessoryCost + deliveryFee + deliveryCost;
    const netReceived = sale.total_sale_price - cardFee;
    const profit = netReceived - totalCost;

    return {
      cardFee,
      deliveryFee,
      deliveryCost,
      totalCost,
      netReceived,
      profit,
    };
  };

  const handleSave = async () => {
    if (!sale) return;

    const allAmountsZero = paymentMethods.every((pm) => pm.amount === 0);
    if (!allAmountsZero) {
      const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
      if (Math.abs(totalAllocated - sale.total_sale_price) > 0.01) {
        alert(`Total alocado (R$ ${totalAllocated.toFixed(2)}) não bate com o valor da venda (R$ ${sale.total_sale_price.toFixed(2)})`);
        return;
      }
    }

    const updated = calculateUpdatedValues();
    if (!updated) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          payment_method: paymentMethods[0]?.method || 'pix',
          card_brand: paymentMethods.find((pm) => pm.method === 'credit_card' || pm.method === 'debit_card')?.card_brand || null,
          installments: paymentMethods.find((pm) => pm.method === 'credit_card')?.installments || 1,
          payment_methods: paymentMethods,
          delivery_type: editData.delivery_type,
          delivery_fee: updated.deliveryFee,
          delivery_cost: updated.deliveryCost,
          motoboy_id: editData.delivery_type === 'motoboy' ? (editData.motoboy_id || null) : null,
          supplier_id: editData.supplier_id || null,
          card_fee: updated.cardFee,
          total_cost: updated.totalCost,
          net_received: updated.netReceived,
          profit: updated.profit,
          volumes: editData.volumes,
        })
        .eq('id', saleId);

      if (error) throw error;

      alert('Venda atualizada com sucesso!');
      onSaved();
      onClose();
    } catch (error) {
      console.error('Error updating sale:', error);
      alert('Erro ao atualizar venda');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  if (!sale) {
    return null;
  }

  const updated = calculateUpdatedValues();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Editar Venda</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold mb-1">{sale.customer_name}</div>
            <div className="text-gray-400 text-sm">
              Valor Total: R$ {sale.total_sale_price.toFixed(2)}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-white font-semibold">Fornecedor</label>
            <select
              value={editData.supplier_id}
              onChange={(e) => setEditData({ ...editData, supplier_id: e.target.value })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
            >
              <option value="">Selecionar Fornecedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

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
                      onChange={(e) => updatePaymentMethod(index, 'method', e.target.value)}
                      className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                    >
                      <option value="pix">PIX (Sem taxa)</option>
                      <option value="cash">Dinheiro (Sem taxa)</option>
                      <option value="debit_card">Débito</option>
                      <option value="credit_card">Crédito</option>
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor (R$)"
                      value={pm.amount || ''}
                      onChange={(e) => updatePaymentMethod(index, 'amount', parseFloat(e.target.value) || 0)}
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

                  {(pm.method === 'credit_card' || pm.method === 'debit_card') && (
                    <div className="flex gap-3">
                      <select
                        value={pm.card_brand}
                        onChange={(e) => updatePaymentMethod(index, 'card_brand', e.target.value)}
                        className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                      >
                        <option value="">Bandeira (definir depois)</option>
                        <option value="visa_mastercard">Visa / Mastercard</option>
                        <option value="elo_amex">Elo / Amex</option>
                      </select>

                      {pm.method === 'credit_card' && (
                        <select
                          value={pm.installments}
                          onChange={(e) => updatePaymentMethod(index, 'installments', parseInt(e.target.value))}
                          className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                        >
                          <option value="0">Parcelas (definir depois)</option>
                          {pm.card_brand && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                            <option key={n} value={n}>
                              {n}x ({getFeePercentageLabel('credit_card', pm.card_brand, n)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {(pm.method === 'credit_card' || pm.method === 'debit_card') && pm.amount > 0 && pm.card_brand && (
                    <div className="text-xs text-red-400">
                      Taxa: R$ {calculateCardFee(pm.amount, pm.method, pm.card_brand, pm.installments).toFixed(2)} ({getFeePercentageLabel(pm.method, pm.card_brand, pm.installments)})
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(() => {
              const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
              const remaining = sale.total_sale_price - totalAllocated;
              const isBalanced = Math.abs(remaining) < 0.01;
              const hasAmounts = totalAllocated > 0;
              return (
                <div className="mt-2 pt-3 border-t border-gray-600 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Total da Venda</div>
                    <div className="text-white font-bold">R$ {sale.total_sale_price.toFixed(2)}</div>
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

          <div className="space-y-2">
            <label className="block text-white font-semibold">Tipo de Entrega</label>
            <select
              value={editData.delivery_type}
              onChange={(e) => setEditData({ ...editData, delivery_type: e.target.value, motoboy_id: '', delivery_fee: 0, delivery_cost: 0 })}
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
                  onChange={(e) => setEditData({ ...editData, motoboy_id: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">Selecionar Motoboy</option>
                  {motoboys.map((motoboy) => (
                    <option key={motoboy.id} value={motoboy.id}>
                      {motoboy.name}
                    </option>
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
                  onChange={(e) => setEditData({ ...editData, delivery_fee: parseFloat(e.target.value) || 0 })}
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
                onChange={(e) => setEditData({ ...editData, delivery_cost: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-white font-semibold">Quantidade de Volumes</label>
            <input
              type="number"
              min="1"
              value={editData.volumes}
              onChange={(e) => setEditData({ ...editData, volumes: parseInt(e.target.value) || 1 })}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <p className="text-gray-400 text-sm">Número de etiquetas de entrega a serem impressas</p>
          </div>

          {updated && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-2">
              <h3 className="text-white font-semibold mb-3">Valores Atualizados</h3>
              {updated.cardFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Taxa do Cartão:</span>
                  <span className="text-red-400 font-semibold">- R$ {updated.cardFee.toFixed(2)}</span>
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

        <div className="flex gap-3 p-6 border-t border-gray-700">
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
