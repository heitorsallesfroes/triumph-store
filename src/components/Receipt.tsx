import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Printer } from 'lucide-react';
import { formatAddressForDisplay } from '../lib/addressValidation';

interface ReceiptProps {
  saleId?: string;
  saleData?: any;
  onClose: () => void;
  hideDeliveryControl?: boolean;
}

interface SaleData {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  city: string;
  neighborhood: string;
  state?: string | null;
  zip_code?: string | null;
  total_sale_price: number;
  sale_date: string;
  payment_method: string;
  card_brand: string | null;
  installments: number;
  delivery_type: string;
  supplier_id: string | null;
  volumes: number;
  manual_items?: Array<{ name: string; price: number; quantity: number }> | null;
  payment_status?: string | null;
}

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product: {
    model: string;
    color: string;
    sku?: string;
  };
}

interface SaleAccessory {
  accessory_id: string | null;
  quantity: number;
  cost: number;
  custom_name: string | null;
  accessory?: {
    name: string;
  } | null;
}

export default function Receipt({ saleId, saleData, onClose, hideDeliveryControl = false }: ReceiptProps) {
  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [accessories, setAccessories] = useState<SaleAccessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Receipt: Component mounted');
    console.log('Receipt: SALE OBJECT:', saleData);
    console.log('Receipt: saleId:', saleId);

    if (saleData) {
      // Use provided sale data instead of fetching
      loadReceiptDataFromObject();
    } else if (saleId) {
      // Fallback to fetching by ID
      loadReceiptData();
    } else {
      console.error('Receipt: No saleId or saleData provided');
      setError('Dados da venda não fornecidos');
      setLoading(false);
    }
  }, [saleId, saleData]);

  const loadReceiptData = async () => {
    try {
      console.log('Receipt: Loading data for sale ID:', saleId);
      console.log('Receipt: Sale ID type:', typeof saleId);
      setError(null);
      setLoading(true);

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();

      if (saleError) {
        console.error('Receipt: Error loading sale data:', saleError);
        console.error('Receipt: Error details:', JSON.stringify(saleError, null, 2));
        throw new Error(`Erro ao carregar venda: ${saleError.message}`);
      }

      if (!saleData) {
        console.error('Receipt: Sale not found with ID:', saleId);
        throw new Error('Venda não encontrada');
      }

      console.log('Receipt: Sale data loaded successfully');
      console.log('Receipt: Customer:', saleData.customer_name);
      console.log('Receipt: Total:', saleData.total_sale_price);

      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity,
          unit_price,
          total_price,
          products (
            model,
            color
          )
        `)
        .eq('sale_id', saleId);

      if (itemsError) {
        console.error('Receipt: Error loading sale items:', itemsError);
        console.error('Receipt: Error details:', JSON.stringify(itemsError, null, 2));
        throw new Error(`Erro ao carregar itens: ${itemsError.message}`);
      }

      console.log('Receipt: Sale items loaded with products:', itemsData);

      if (!itemsData || itemsData.length === 0) {
        console.warn('Receipt: No items found for this sale');
      }

      const itemsWithProducts = (itemsData || []).map((item: any) => ({
        ...item,
        product: item.products || { model: 'Produto não identificado', color: '' }
      }));

      console.log('Receipt: All products loaded, total items:', itemsWithProducts.length);
      console.log('Receipt: Items with products:', itemsWithProducts);

      const { data: accessoriesData, error: accessoriesError } = await supabase
        .from('sale_accessories')
        .select(`
          accessory_id,
          quantity,
          cost,
          custom_name,
          accessories (
            name
          )
        `)
        .eq('sale_id', saleId);

      if (accessoriesError) {
        console.error('Receipt: Error loading sale accessories:', accessoriesError);
      }

      console.log('Receipt: Accessories loaded:', accessoriesData);

      const accessoriesWithDetails = (accessoriesData || []).map((acc: any) => ({
        ...acc,
        accessory: acc.accessories
      }));

      setSale(saleData);
      setItems(itemsWithProducts);
      setAccessories(accessoriesWithDetails);
      console.log('Receipt: ✓ All data loaded successfully');
      console.log('Receipt: Final state - Items:', itemsWithProducts.length, 'Sale:', saleData.customer_name);
      console.log('Receipt: Items details:', JSON.stringify(itemsWithProducts, null, 2));
      console.log('Receipt: Accessories details:', JSON.stringify(accessoriesWithDetails, null, 2));
    } catch (error) {
      console.error('Receipt: ✗ Error loading receipt data:', error);
      console.error('Receipt: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      const errorMessage = error instanceof Error ? error.message : 'Erro ao carregar dados do recibo';
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log('Receipt: Loading complete');
    }
  };

  const loadReceiptDataFromObject = async () => {
    try {
      console.log('Receipt: Loading data from sale object');
      setError(null);
      setLoading(true);

      // Use the sale data passed as prop
      setSale(saleData);
      console.log('Receipt: Sale data set from object');

      // Fetch items and accessories from database using the sale ID
      const saleIdToUse = saleData.id;

      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity,
          unit_price,
          total_price,
          products (
            model,
            color
          )
        `)
        .eq('sale_id', saleIdToUse);

      if (itemsError) {
        console.error('Receipt: Error loading sale items:', itemsError);
        throw new Error(`Erro ao carregar itens: ${itemsError.message}`);
      }

      console.log('Receipt: (From object) Sale items loaded with products:', itemsData);

      const itemsWithProducts = (itemsData || []).map((item: any) => ({
        ...item,
        product: item.products || { model: 'Produto não identificado', color: '' }
      }));

      console.log('Receipt: (From object) Items with products:', itemsWithProducts);

      const { data: accessoriesData, error: accessoriesError } = await supabase
        .from('sale_accessories')
        .select(`
          accessory_id,
          quantity,
          cost,
          custom_name,
          accessories (
            name
          )
        `)
        .eq('sale_id', saleIdToUse);

      if (accessoriesError) {
        console.error('Receipt: Error loading accessories:', accessoriesError);
        throw new Error(`Erro ao carregar acessórios: ${accessoriesError.message}`);
      }

      console.log('Receipt: (From object) Accessories loaded:', accessoriesData);

      const accessoriesWithDetails = (accessoriesData || []).map((acc: any) => ({
        ...acc,
        accessory: acc.accessories
      }));

      setItems(itemsWithProducts);
      setAccessories(accessoriesWithDetails);
      console.log('Receipt: ✓ All data loaded successfully from object');
      console.log('Receipt: Items details:', JSON.stringify(itemsWithProducts, null, 2));
      console.log('Receipt: Accessories details:', JSON.stringify(accessoriesWithDetails, null, 2));
    } catch (error) {
      console.error('Receipt: ✗ Error loading receipt data from object:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao carregar dados do recibo';
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log('Receipt: Loading complete');
    }
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Recibo de Compra - ${sale?.customer_name || 'Cliente'}`;
    window.print();
    document.title = originalTitle;
  };

  const getPaymentMethodText = (method: string, brand: string | null, installments: number) => {
    if (method === 'pix') return 'PIX';
    if (method === 'cash') return 'Dinheiro';
    if (method === 'debit_card') {
      return 'Débito';
    }
    if (method === 'credit_card') {
      return 'Crédito';
    }
    if (method === 'payment_link') {
      return 'Link de Pagamento';
    }
    return method;
  };

  const renderDeliveryLabel = (volumeNumber: number, totalVolumes: number) => {
    return (
      <div key={volumeNumber} className="delivery-label">
        <div className="text-center" style={{ marginBottom: '8px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', marginBottom: '4px' }}>ENTREGA</h2>
          {totalVolumes > 1 && (
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>Volume {volumeNumber} de {totalVolumes}</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>Cliente:</p>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>{sale?.customer_name || 'N/A'}</p>
          </div>

          <div>
            <p style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>Local:</p>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#000' }}>
              {formatAddressForDisplay({
                customer_name: sale?.customer_name || '',
                street: sale?.address_street || undefined,
                number: sale?.address_number || undefined,
                neighborhood: sale?.neighborhood || undefined,
                city: sale?.city || undefined,
                state: sale?.state || undefined,
                zip_code: sale?.zip_code || undefined,
              }, sale?.delivery_type || 'loja_fisica').split('\n').map((line, i) => (
                <span key={i}>{line}{i < 2 ? <br /> : ''}</span>
              ))}
            </p>
          </div>

          <div>
            <p style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>Valor:</p>
            <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#000' }}>R$ {(sale?.total_sale_price || 0).toFixed(2)}</p>
          </div>

          <div>
            <p style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>Pagamento:</p>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>
              {getPaymentMethodText(sale?.payment_method || 'pix', sale?.card_brand || null, sale?.installments || 1)}
            </p>
          </div>

          <div style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '10px', color: '#555', marginBottom: '4px' }}>Status do pagamento:</p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#000', fontFamily: 'monospace' }}>
                {sale?.payment_status === 'pago' ? '[X]' : '[ ]'} Pago
              </span>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#000', fontFamily: 'monospace' }}>
                {sale?.payment_status === 'a_cobrar' ? '[X]' : '[ ]'} A cobrar
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg p-8 border border-gray-700">
          <div className="text-white text-center">Carregando recibo...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg p-8 border border-red-700 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-500 mb-4">Erro ao Carregar Recibo</h2>
          <p className="text-white mb-4">{error}</p>
          <p className="text-gray-400 text-sm mb-6">
            Verifique o console do navegador (F12) para mais detalhes sobre o erro.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                console.log('Receipt: Retrying data load for sale ID:', saleId);
                setError(null);
                loadReceiptData();
              }}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Tentar Novamente
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg p-8 border border-gray-700 max-w-md w-full">
          <h2 className="text-xl font-bold text-white mb-4">Recibo não disponível</h2>
          <p className="text-gray-400 mb-6">Não foi possível carregar os dados do recibo.</p>
          <button
            onClick={onClose}
            className="w-full bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl relative my-8" style={{ height: 'auto', maxHeight: 'none', minHeight: 'auto' }}>
        <div className="print:hidden sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Recibo de Venda</h2>
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors font-semibold"
            >
              <Printer size={18} />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="print-page" style={{ height: 'auto', maxHeight: 'none', overflow: 'visible' }}>
          <div className="receipt-section" style={{ height: 'auto', maxHeight: 'none', overflow: 'visible' }}>
          {/* Header */}
          <div className="flex justify-center items-start gap-4 mb-3 pb-2 border-b-2 border-black">
            <img src="/Logo2p-1.png" alt="Triumph Store" style={{ maxWidth: '190px' }} />
            <div className="text-left">
              <h1 className="text-sm font-bold text-black mb-0.5">Triumph Store Smartwatches</h1>
              <p className="text-xs text-gray-700 leading-tight">
                Rua Quinze de Novembro n°106, Sala 908<br />
                Centro - Niterói - RJ · CEP: 24020-125
              </p>
              <p className="text-xs text-gray-700 mt-0.5">CNPJ: 49.923.481/0001-04</p>
              <p className="text-xs text-gray-700">WhatsApp: (21) 98708-7535</p>
              <p className="text-xs text-gray-700">Instagram: @store_triumph</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-3">
            <h2 className="text-lg font-bold text-black">RECIBO DE VENDA</h2>
          </div>

          {/* Customer Info */}
          <div className="mb-3 pb-2 border-b border-gray-400">
            <div className="text-xs space-y-1">
              <div className="flex">
                <span className="text-gray-700 font-medium w-20">Nome:</span>
                <span className="font-bold text-black">{sale.customer_name || 'N/A'}</span>
              </div>
              <div className="flex">
                <span className="text-gray-700 font-medium w-20">Endereço:</span>
                <span className="font-bold text-black">
                  {formatAddressForDisplay({
                    customer_name: sale.customer_name,
                    street: sale.address_street || undefined,
                    number: sale.address_number || undefined,
                    neighborhood: sale.neighborhood || undefined,
                    city: sale.city || undefined,
                    state: sale.state || undefined,
                    zip_code: sale.zip_code || undefined,
                  }, sale.delivery_type)}
                </span>
              </div>
              <div className="flex">
                <span className="text-gray-700 font-medium w-20">Data:</span>
                <span className="font-bold text-black">
                  {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('pt-BR') : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="mb-3 pb-2 border-b-2 border-black">
            <h3 className="text-sm font-bold text-black mb-2">ITENS DO PEDIDO</h3>
            {console.log('Receipt: Rendering items. Count:', items.length)}
            {console.log('Receipt: Rendering accessories. Count:', accessories.length)}
            {console.log('Receipt: Manual items:', sale?.manual_items)}
            {console.log('Receipt: Items state:', items)}
            <div className="space-y-1">
              {items.length === 0 && accessories.length === 0 && (!sale?.manual_items || sale.manual_items.length === 0) ? (
                <p className="text-sm text-gray-600 text-center py-2">Nenhum item encontrado</p>
              ) : (
                <>
                  {items.map((item, index) => {
                    console.log(`Receipt: Rendering item ${index}:`, item);
                    console.log(`Receipt: Product data for item ${index}:`, item.product);
                    const productName = item.product?.model || 'Produto não identificado';
                    const productColor = item.product?.color || '';
                    console.log(`Receipt: Display name for item ${index}: ${productName} ${productColor}`);
                    return (
                      <div key={index} className="text-xs">
                        <p className="font-medium text-black">
                          {item.quantity}x {productName} {productColor}
                        </p>
                      </div>
                    );
                  })}
                  {accessories.map((acc, index) => {
                    console.log(`Receipt: Rendering accessory ${index}:`, acc);
                    return (
                      <div key={`acc-${index}`} className="text-xs">
                        <p className="font-medium text-black">
                          {acc.quantity}x {acc.custom_name || acc.accessory?.name || 'Acessório'}
                        </p>
                      </div>
                    );
                  })}
                  {sale?.manual_items && sale.manual_items.map((manualItem, index) => {
                    console.log(`Receipt: Rendering manual item ${index}:`, manualItem);
                    return (
                      <div key={`manual-${index}`} className="text-xs">
                        <p className="font-medium text-black">
                          {manualItem.quantity}x {manualItem.name}
                        </p>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="mb-3 pb-2 border-b border-gray-400">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-black">TOTAL:</span>
              <span className="text-xl font-bold text-black">R$ {(sale.total_sale_price || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="mb-3 pb-2 border-b border-gray-400">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-700 font-medium">Forma de pagamento:</span>
              <span className="text-xs font-bold text-black">
                {getPaymentMethodText(sale.payment_method || 'pix', sale.card_brand, sale.installments || 1)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-2">
            <p className="text-sm font-bold text-black mb-1">Obrigado pela preferência!</p>
            <p className="text-xs text-gray-700">Suporte: WhatsApp (21) 98708-7535</p>
          </div>
        </div>

        {/* Delivery Labels - Multiple based on volumes */}
        {!hideDeliveryControl && (
          <div className="delivery-label-container">
            {Array.from({ length: sale.volumes || 1 }, (_, index) =>
              renderDeliveryLabel(index + 1, sale.volumes || 1)
            )}
          </div>
        )}
      </div>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .checkbox {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid #000;
          flex-shrink: 0;
        }

        .print-page {
          width: 100% !important;
          height: auto !important;
          max-height: none !important;
          min-height: auto !important;
          background: white;
          overflow: visible !important;
          flex-shrink: 0 !important;
        }

        .receipt-section {
          background: white;
          padding: 20px;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          flex-shrink: 0 !important;
        }

        .delivery-label-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 20px;
          border-top: 4px dashed #999;
          background: white;
        }

        .delivery-label {
          flex: 1 1 calc(50% - 5px);
          min-width: 280px;
          padding: 8px;
          background: white;
        }

        .receipt-section > * {
          max-height: none !important;
          overflow: visible !important;
        }

        @media print {
          html, body {
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
          }

          body * {
            visibility: hidden;
          }

          .print-page, .print-page * {
            visibility: visible;
          }

          .print-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
            background: white !important;
            display: flex;
            flex-direction: column;
            page-break-after: avoid;
            overflow: hidden;
          }

          .receipt-section {
            height: 148mm;
            padding: 8mm;
            background: white !important;
            color: black !important;
            overflow: hidden;
            flex-shrink: 0;
            font-size: 11px;
            line-height: 1.3;
          }

          .delivery-label-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 8mm;
            background: white !important;
            border-top: 4px dashed #000 !important;
            flex-shrink: 0;
          }

          .delivery-label {
            flex: 1 1 calc(50% - 4px);
            min-width: 0;
            padding: 6px;
            background: white !important;
            page-break-inside: avoid;
          }

          .receipt-section * {
            margin-top: 0 !important;
          }

          .receipt-section h1 {
            font-size: 16px;
            margin-bottom: 2px !important;
          }

          .receipt-section h2 {
            font-size: 14px;
            margin-bottom: 4px !important;
          }

          .receipt-section h3 {
            font-size: 12px;
            margin-bottom: 3px !important;
          }

          .receipt-section p,
          .receipt-section span,
          .receipt-section div {
            font-size: 10px;
            line-height: 1.2;
          }

          .delivery-section h2 {
            font-size: 18px;
          }

          .delivery-section p {
            margin: 2px 0;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }

          * {
            color: black !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .receipt-section *, .delivery-section * {
            border-color: black !important;
          }
        }
      `}</style>
    </div>
  );
}
