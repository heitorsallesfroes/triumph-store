import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Printer } from 'lucide-react';
import { formatAddressForDisplay } from '../lib/addressValidation';

interface ReceiptProps {
  saleId?: string;
  saleData?: any;
  onClose: () => void;
  hideDeliveryControl?: boolean;
  giftMode?: boolean;
}

interface SaleData {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_cpf?: string | null;
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
  delivery_notes?: string | null;
}

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product: { model: string; color: string; sku?: string };
}

interface SaleAccessory {
  accessory_id: string | null;
  quantity: number;
  cost: number;
  custom_name: string | null;
  accessory?: { name: string } | null;
}

export default function Receipt({ saleId, saleData, onClose, hideDeliveryControl = false, giftMode = false }: ReceiptProps) {
  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [accessories, setAccessories] = useState<SaleAccessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saleData) loadReceiptDataFromObject();
    else if (saleId) loadReceiptData();
    else { setError('Dados da venda não fornecidos'); setLoading(false); }
  }, [saleId, saleData]);

  const loadReceiptData = async () => {
    try {
      setError(null);
      setLoading(true);
      const { data: sd, error: se } = await supabase.from('sales').select('*').eq('id', saleId).maybeSingle();
      if (se) throw new Error(`Erro ao carregar venda: ${se.message}`);
      if (!sd) throw new Error('Venda não encontrada');
      const { data: itemsData, error: ie } = await supabase
        .from('sale_items').select('product_id, quantity, unit_price, total_price, products (model, color)').eq('sale_id', saleId);
      if (ie) throw new Error(`Erro ao carregar itens: ${ie.message}`);
      const { data: accsData } = await supabase
        .from('sale_accessories').select('accessory_id, quantity, cost, custom_name, accessories (name)').eq('sale_id', saleId);
      setSale(sd);
      setItems((itemsData || []).map((i: any) => ({ ...i, product: i.products || { model: 'Produto', color: '' } })));
      setAccessories((accsData || []).map((a: any) => ({ ...a, accessory: a.accessories })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recibo');
    } finally { setLoading(false); }
  };

  const loadReceiptDataFromObject = async () => {
    try {
      setError(null);
      setLoading(true);
      setSale(saleData);
      const { data: itemsData, error: ie } = await supabase
        .from('sale_items').select('product_id, quantity, unit_price, total_price, products (model, color)').eq('sale_id', saleData.id);
      if (ie) throw new Error(`Erro ao carregar itens: ${ie.message}`);
      const { data: accsData, error: ae } = await supabase
        .from('sale_accessories').select('accessory_id, quantity, cost, custom_name, accessories (name)').eq('sale_id', saleData.id);
      if (ae) throw new Error(`Erro ao carregar acessórios: ${ae.message}`);
      setItems((itemsData || []).map((i: any) => ({ ...i, product: i.products || { model: 'Produto', color: '' } })));
      setAccessories((accsData || []).map((a: any) => ({ ...a, accessory: a.accessories })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recibo');
    } finally { setLoading(false); }
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = giftMode
      ? `Comprovante de Entrega - ${sale?.customer_name || 'Cliente'}`
      : `Recibo de Compra - ${sale?.customer_name || 'Cliente'}`;
    window.print();
    document.title = originalTitle;
  };

  const getPaymentMethodText = (method: string, brand: string | null, installments: number) => {
    if (method === 'pix') return 'PIX';
    if (method === 'cash') return 'Dinheiro';
    if (method === 'debit_card') return 'Débito';
    if (method === 'credit_card') return installments > 1 ? `Crédito ${installments}x` : 'Crédito';
    if (method === 'payment_link') return installments > 1 ? `Link de Pagamento ${installments}x` : 'Link de Pagamento';
    return method;
  };

  const abreviarCidade = (cidade: string | undefined): string => {
    if (!cidade) return '';
    const map: Record<string, string> = { 'São Gonçalo': 'SG', 'Rio de Janeiro': 'RJ', 'Belo Horizonte': 'BH', 'São Paulo': 'SP' };
    return map[cidade] ?? cidade;
  };

  const renderDeliveryLabel = (volumeNumber: number, totalVolumes: number) => {
    const isPago = sale?.payment_status === 'pago';
    return (
      <div key={volumeNumber} className="delivery-label">
        <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1px solid #ccc', paddingBottom: '6px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 'bold', color: '#000', letterSpacing: '1px' }}>
            {giftMode ? 'CONTROLE DE ENTREGA' : 'ENTREGA'}
          </h2>
          {totalVolumes > 1 && (
            <p style={{ fontSize: '11px', color: '#555' }}>Volume {volumeNumber} de {totalVolumes}</p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            <p style={{ fontSize: '9px', color: '#666', marginBottom: '1px' }}>CLIENTE</p>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>{sale?.customer_name || 'N/A'}</p>
          </div>
          <div>
            <p style={{ fontSize: '9px', color: '#666', marginBottom: '1px' }}>LOCAL</p>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#000' }}>
              {formatAddressForDisplay({
                customer_name: sale?.customer_name || '',
                street: sale?.address_street || undefined,
                number: sale?.address_number || undefined,
                neighborhood: sale?.neighborhood || undefined,
                city: abreviarCidade(sale?.city) || undefined,
                state: sale?.state || undefined,
                zip_code: sale?.zip_code || undefined,
              }, sale?.delivery_type || 'loja_fisica').split('\n').map((line, i) => (
                <span key={i}>{line}{i < 2 ? <br /> : ''}</span>
              ))}
            </p>
          </div>
          {!isPago && (
            <div>
              <p style={{ fontSize: '9px', color: '#666', marginBottom: '1px' }}>VALOR</p>
              <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#000' }}>R$ {(sale?.total_sale_price || 0).toFixed(2)}</p>
            </div>
          )}
          {!isPago && (
            <div>
              <p style={{ fontSize: '9px', color: '#666', marginBottom: '1px' }}>PAGAMENTO</p>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000' }}>
                {getPaymentMethodText(sale?.payment_method || 'pix', sale?.card_brand || null, sale?.installments || 1)}
              </p>
            </div>
          )}
          <div style={{ marginTop: '4px' }}>
            <p style={{ fontSize: '9px', color: '#666', marginBottom: '4px' }}>STATUS DO PAGAMENTO</p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#000', fontFamily: 'monospace' }}>
                {sale?.payment_status === 'pago' ? '[X]' : '[ ]'} Pago
              </span>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#000', fontFamily: 'monospace' }}>
                {sale?.payment_status === 'a_cobrar' ? '[X]' : '[ ]'} A cobrar
              </span>
            </div>
          </div>
          {sale?.delivery_notes && (
            <div style={{ marginTop: '4px', padding: '5px 8px', background: '#fffbe6', border: '1px solid #e6b800', borderRadius: '3px' }}>
              <p style={{ fontSize: '10px', fontWeight: 'bold', color: '#7a5a00' }}>📝 {sale.delivery_notes}</p>
            </div>
          )}
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
          <p className="text-white mb-6">{error}</p>
          <div className="flex gap-3">
            <button onClick={() => { setError(null); loadReceiptData(); }}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
              Tentar Novamente
            </button>
            <button onClick={onClose}
              className="flex-1 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-semibold">
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
          <button onClick={onClose}
            className="w-full bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors font-semibold">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const hasAddress = !!(sale.address_street || sale.customer_cpf);
  const addressLine = [sale.address_street, sale.address_number, sale.address_complement].filter(Boolean).join(', ');
  const cityLine = [sale.city, sale.neighborhood, sale.state].filter(Boolean).join(' · ');

  // inline style helpers
  const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '5px 8px', ...extra,
  });
  const label: React.CSSProperties = { fontSize: '8px', color: '#777', marginBottom: '1px', textTransform: 'uppercase' as const, letterSpacing: '0.3px' };
  const value: React.CSSProperties = { fontSize: '10px', color: '#000' };
  const valueBold: React.CSSProperties = { fontSize: '11px', fontWeight: 'bold', color: '#000' };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl relative my-8">

        {/* ── Toolbar (não imprime) ── */}
        <div className="print:hidden sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">
            {giftMode ? 'Comprovante de Entrega' : 'Recibo de Venda'}
          </h2>
          <div className="flex gap-3">
            <button onClick={handlePrint}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors font-semibold">
              <Printer size={18} /> Imprimir
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* ── Área imprimível ── */}
        <div className="print-page">
          <div className="receipt-section">

            {/* ════════ CABEÇALHO ════════ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '6px', marginBottom: '6px', borderBottom: '2px solid #000' }}>
              {/* Esquerda: logo + empresa */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <img src="/Logo2p-1.png" alt="Triumph Store" style={{ maxWidth: '115px' }} />
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', marginBottom: '2px' }}>Triumph Store Smartwatches</p>
                  <p style={{ fontSize: '8.5px', color: '#444', lineHeight: '1.55' }}>
                    Rua Quinze de Novembro n°106, Sala 908<br />
                    Centro - Niterói - RJ · CEP: 24020-125<br />
                    CNPJ: 49.923.481/0001-04<br />
                    WhatsApp: (21) 98708-7535 · @store_triumph
                  </p>
                </div>
              </div>
              {/* Direita: título + número */}
              <div style={{ textAlign: 'right', paddingLeft: '14px', borderLeft: '2px solid #000', minWidth: '160px' }}>
                <p style={{ fontSize: '15px', fontWeight: '900', letterSpacing: '1px', color: '#000', lineHeight: '1.25' }}>
                  {giftMode ? 'COMPROVANTE DE ENTREGA' : 'RECIBO DE VENDA'}
                </p>
                <p style={{ fontSize: '9px', color: '#555', marginTop: '5px' }}>
                  Nº {sale.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            {/* ════════ DADOS DO CLIENTE ════════ */}
            <div style={{ border: '1px solid #000', marginBottom: '8px' }}>
              <div style={{ background: '#f0f0f0', borderBottom: '1px solid #000', padding: '3px 8px' }}>
                <p style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px', color: '#000' }}>DADOS DO CLIENTE</p>
              </div>
              {/* Nome | Data */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: hasAddress ? '1px solid #ddd' : undefined }}>
                <div style={{ ...cell({ borderRight: '1px solid #ddd' }) }}>
                  <p style={label}>Nome</p>
                  <p style={valueBold}>{sale.customer_name || '—'}</p>
                </div>
                <div style={cell()}>
                  <p style={label}>Data</p>
                  <p style={valueBold}>
                    {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
              </div>
              {/* Endereço | CPF */}
              {hasAddress && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #ddd' }}>
                  <div style={{ ...cell({ borderRight: '1px solid #ddd' }) }}>
                    <p style={label}>Endereço</p>
                    <p style={value}>{addressLine || '—'}</p>
                  </div>
                  <div style={cell()}>
                    <p style={label}>CPF</p>
                    <p style={value}>{sale.customer_cpf || '—'}</p>
                  </div>
                </div>
              )}
              {/* Cidade/UF | Telefone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ ...cell({ borderRight: '1px solid #ddd' }) }}>
                  <p style={label}>Cidade · Bairro · UF</p>
                  <p style={value}>{cityLine || '—'}</p>
                </div>
                <div style={cell()}>
                  <p style={label}>Telefone</p>
                  <p style={value}>{sale.customer_phone || '—'}</p>
                </div>
              </div>
            </div>

            {/* ════════ TABELA DE PRODUTOS ════════ */}
            <div style={{ border: '1px solid #000', marginBottom: '8px' }}>
              <div style={{ background: '#f0f0f0', borderBottom: '1px solid #000', padding: '3px 8px' }}>
                <p style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px', color: '#000' }}>ITENS DO PEDIDO</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #bbb', background: '#fafafa' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '8px', fontWeight: 'bold', letterSpacing: '0.4px', color: '#000' }}>DESCRIÇÃO</th>
                    <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: '8px', fontWeight: 'bold', width: '36px', color: '#000' }}>QTD</th>
                    {!giftMode && <th style={{ textAlign: 'right', padding: '4px 8px', fontSize: '8px', fontWeight: 'bold', width: '80px', color: '#000' }}>VLR. UNIT.</th>}
                    {!giftMode && <th style={{ textAlign: 'right', padding: '4px 8px', fontSize: '8px', fontWeight: 'bold', width: '80px', color: '#000' }}>TOTAL</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const name = `${item.product?.model || ''} ${item.product?.color || ''}`.trim() || 'Produto';
                    const rowTotal = (item.unit_price || 0) * item.quantity;
                    return (
                      <tr key={`p${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '4px 8px', fontSize: '10px', color: '#000' }}>{name}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px', fontSize: '10px', color: '#000' }}>{item.quantity}</td>
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                      </tr>
                    );
                  })}
                  {accessories.map((acc, idx) => {
                    const name = acc.custom_name || acc.accessory?.name || 'Acessório';
                    const rowTotal = (acc.cost || 0) * acc.quantity;
                    return (
                      <tr key={`a${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '4px 8px', fontSize: '10px', color: '#000' }}>{name}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px', fontSize: '10px', color: '#000' }}>{acc.quantity}</td>
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {(acc.cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                      </tr>
                    );
                  })}
                  {(sale?.manual_items || []).map((mi, idx) => {
                    const rowTotal = (mi.price || 0) * (mi.quantity || 0);
                    return (
                      <tr key={`m${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '4px 8px', fontSize: '10px', color: '#000' }}>{mi.name}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px', fontSize: '10px', color: '#000' }}>{mi.quantity}</td>
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {(mi.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                        {!giftMode && <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '10px', color: '#000' }}>
                          R$ {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
                {!giftMode && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #000', background: '#f0f0f0' }}>
                      <td colSpan={2} style={{ padding: '5px 8px' }} />
                      <td style={{ textAlign: 'right', padding: '5px 8px', fontSize: '9px', fontWeight: 'bold', color: '#000', letterSpacing: '0.5px' }}>
                        TOTAL
                      </td>
                      <td style={{ textAlign: 'right', padding: '5px 8px', fontSize: '13px', fontWeight: 'bold', color: '#000' }}>
                        R$ {(sale.total_sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ════════ PAGAMENTO ════════ */}
            {!giftMode && (
              <div style={{ border: '1px solid #000', padding: '6px 10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '8.5px', color: '#666', letterSpacing: '0.3px' }}>FORMA DE PAGAMENTO: </span>
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#000' }}>
                  {getPaymentMethodText(sale.payment_method || 'pix', sale.card_brand, sale.installments || 1)}
                </span>
              </div>
            )}

            {/* ════════ OBSERVAÇÕES ════════ */}
            {sale?.delivery_notes && (
              <div style={{ border: '2px solid #e6b800', background: '#fffbe6', padding: '6px 10px', marginBottom: '8px' }}>
                <p style={{ fontSize: '10px', fontWeight: 'bold', color: '#7a5a00' }}>📝 Obs: {sale.delivery_notes}</p>
              </div>
            )}

            {/* ════════ RODAPÉ ════════ */}
            <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: '1px solid #bbb' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#000', marginBottom: '3px' }}>Obrigado pela preferência!</p>
              <p style={{ fontSize: '8.5px', color: '#666' }}>Suporte: WhatsApp (21) 98708-7535 · Instagram: @store_triumph</p>
            </div>

          </div>

          {/* ════════ ETIQUETA DE ENTREGA ════════ */}
          {!hideDeliveryControl && (
            <div className="delivery-label-container">
              {Array.from({ length: sale.volumes || 1 }, (_, i) =>
                renderDeliveryLabel(i + 1, sale.volumes || 1)
              )}
            </div>
          )}
        </div>

        <style>{`
          * { box-sizing: border-box; }

          .print-page {
            width: 100%;
            background: white;
            overflow: visible;
          }

          .receipt-section {
            background: white;
            padding: 12px 16px;
          }

          .delivery-label-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            padding: 12px 16px;
            border-top: 1px solid #ccc;
            margin-top: 4px;
            background: white;
          }

          .delivery-label {
            flex: 1 1 calc(50% - 5px);
            min-width: 280px;
            padding: 10px;
            background: white;
          }

          @media print {
            html, body { margin: 0; padding: 0; }

            body * { visibility: hidden; }

            .print-page, .print-page * { visibility: visible; }

            .print-page {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 0;
              background: white !important;
            }

            .receipt-section {
              padding: 4mm 8mm;
              background: white !important;
            }

            .delivery-label-container {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              padding: 3mm 8mm;
              margin-top: 0;
              background: white !important;
              border-top: 1px solid #000 !important;
            }

            .delivery-label {
              flex: 1 1 calc(50% - 4px);
              min-width: 0;
              padding: 6px;
              background: white !important;
              page-break-inside: avoid;
            }

            * {
              color: black !important;
              background: white !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            @page {
              size: A4 portrait;
              margin: 5mm 8mm;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
