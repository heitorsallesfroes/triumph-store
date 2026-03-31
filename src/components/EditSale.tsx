import { useEffect, useState } from 'react';
import { supabase, Supplier, Motoboy } from '../lib/supabase';
import { X, Save } from 'lucide-react';
import { calculateCardFee, getFeePercentageLabel, getCardBrandLabel } from '../lib/cardFees';

interface EditSaleProps {
  saleId: string;
  onClose: () => void;
  onSaved: () => void;
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
    card_brand: '',
    installments: 0,
    delivery_fee: 0,
    delivery_cost: 0,
    delivery_type: 'loja_fisica',
    motoboy_id: '',
    supplier_id: '',
    volumes: 1,
  });

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
        card_brand: saleResponse.data.card_brand || '',
        installments: saleResponse.data.installments,
        delivery_fee: saleResponse.data.delivery_fee || 0,
        delivery_cost: saleResponse.data.delivery_cost || 0,
        delivery_type: saleResponse.data.delivery_type || 'loja_fisica',
        motoboy_id: saleResponse.data.motoboy_id || '',
        supplier_id: saleResponse.data.supplier_id || '',
        volumes: saleResponse.data.volumes || 1,
      });
    } catch (error) {
      console.error('Error loading sale data:', error);
      alert('Erro ao carregar dados da venda');
    } finally {
      setLoading(false);
    }
  };

  const calculateUpdatedValues = () => {
    if (!sale) return null;

    const totalProductCost = items.reduce((sum, item) => {
      return sum + (item.product?.cost || 0) * item.quantity;
    }, 0);

    const totalAccessoryCost = accessories.reduce((sum, acc) => {
      return sum + (acc.cost || acc.accessory?.cost || 0) * acc.quantity;
    }, 0);

    const cardFee = calculateCardFee(
      sale.total_sale_price,
      sale.payment_method,
      editData.card_brand || sale.card_brand,
      editData.installments
    );

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

    const updated = calculateUpdatedValues();
    if (!updated) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          card_brand: editData.card_brand || null,
          installments: editData.installments,
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
            <div className="text-white font-semibold mb-2">{sale.customer_name}</div>
            <div className="text-gray-400 text-sm">
              Valor Total: R$ {sale.total_sale_price.toFixed(2)}
            </div>
            <div className="text-gray-400 text-sm">
              Pagamento: {sale.payment_method === 'pix' && 'PIX'}
              {sale.payment_method === 'cash' && 'Dinheiro'}
              {sale.payment_method === 'credit_card' && 'Crédito'}
              {sale.payment_method === 'debit_card' && 'Débito'}
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

          {(sale.payment_method === 'credit_card' || sale.payment_method === 'debit_card') && (
            <div className="space-y-2">
              <label className="block text-white font-semibold">Bandeira do Cartão</label>
              <select
                value={editData.card_brand}
                onChange={(e) => setEditData({ ...editData, card_brand: e.target.value })}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
              >
                <option value="">Definir depois</option>
                <option value="visa_mastercard">Visa / Mastercard</option>
                <option value="elo_amex">Elo / Amex</option>
              </select>
            </div>
          )}

          {sale.payment_method === 'credit_card' && (
            <div className="space-y-2">
              <label className="block text-white font-semibold">Parcelas</label>
              <select
                value={editData.installments}
                onChange={(e) => setEditData({ ...editData, installments: parseInt(e.target.value) })}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none"
              >
                <option value="0">Definir depois</option>
                {editData.card_brand && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}x (Taxa {getFeePercentageLabel('credit_card', editData.card_brand, n)})
                  </option>
                ))}
              </select>
            </div>
          )}

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
