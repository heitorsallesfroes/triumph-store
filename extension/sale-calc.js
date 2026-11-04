// Venda pela conversa (2.3.0): os MESMOS cálculos da tela "Nova Venda" do ERP, para a venda criada
// pela extensão ficar igual à criada pelo ERP. Copiado de:
//   src/lib/cardFees.ts          → getCardFeeRate / calculateCardFee (taxas em system_config)
//   src/lib/systemConfig.ts      → valores padrão das taxas (quando a chave não existe no banco)
//   src/pages/Sales.tsx          → calculatePaymentFee, calculateTotals, calculateVolumes, handleSubmit
//                                  (linhas de sales / sale_items / sale_accessories, status 'em_separacao')
//   src/lib/addressValidation.ts → validateAddressForDeliveryType
//   src/lib/dateUtils.ts         → getTodayInBrazil
// Usado pelo background (importScripts) e pelo painel (content script). Sem rede, sem DOM.
(function (root) {
  const FEE_DEFAULTS = {
    fee_vm_debit: '0.0099', fee_vm_credit_1: '0.0320', fee_vm_credit_2: '0.0406', fee_vm_credit_3: '0.0466', fee_vm_credit_4: '0.0526',
    fee_vm_credit_5: '0.0586', fee_vm_credit_6: '0.0646', fee_vm_credit_7: '0.0753', fee_vm_credit_8: '0.0813', fee_vm_credit_9: '0.0873',
    fee_vm_credit_10: '0.0933', fee_vm_credit_11: '0.0993', fee_vm_credit_12: '0.1053',
    fee_ea_debit: '0.0179', fee_ea_credit_1: '0.0400', fee_ea_credit_2: '0.0486', fee_ea_credit_3: '0.0546', fee_ea_credit_4: '0.0606',
    fee_ea_credit_5: '0.0666', fee_ea_credit_6: '0.0726', fee_ea_credit_7: '0.0833', fee_ea_credit_8: '0.0893', fee_ea_credit_9: '0.0953',
    fee_ea_credit_10: '0.1013', fee_ea_credit_11: '0.1073', fee_ea_credit_12: '0.1133',
    // 2.6.1: link de pagamento (Rede) = crédito da maquininha + 1 ponto percentual
    fee_link_vm_credit_1: '0.0420', fee_link_vm_credit_2: '0.0506', fee_link_vm_credit_3: '0.0566', fee_link_vm_credit_4: '0.0626', fee_link_vm_credit_5: '0.0686',
    fee_link_vm_credit_6: '0.0746', fee_link_vm_credit_7: '0.0853', fee_link_vm_credit_8: '0.0913', fee_link_vm_credit_9: '0.0973', fee_link_vm_credit_10: '0.1033',
    fee_link_vm_credit_11: '0.1093', fee_link_vm_credit_12: '0.1153',
    fee_link_ea_credit_1: '0.0500', fee_link_ea_credit_2: '0.0586', fee_link_ea_credit_3: '0.0646', fee_link_ea_credit_4: '0.0706', fee_link_ea_credit_5: '0.0766',
    fee_link_ea_credit_6: '0.0826', fee_link_ea_credit_7: '0.0933', fee_link_ea_credit_8: '0.0993', fee_link_ea_credit_9: '0.1053', fee_link_ea_credit_10: '0.1113',
    fee_link_ea_credit_11: '0.1173', fee_link_ea_credit_12: '0.1233',
  };
  // Mesmas opções e rótulos da tela do ERP
  const PAYMENT_METHODS = [['pix', 'PIX (Sem taxa)'], ['cash', 'Dinheiro (Sem taxa)'], ['debit_card', 'Débito'], ['credit_card', 'Crédito'], ['payment_link', 'Link de Pagamento'], ['outros', 'Outros']];
  const CARD_BRANDS = [['visa_mastercard', 'Visa / Mastercard'], ['elo_amex', 'Elo / Amex']];
  const DELIVERY_TYPES = [['loja_fisica', 'Loja Física'], ['motoboy', 'Motoboy'], ['correios', 'Correios (SEDEX)']];
  const DEFAULT_DELIVERY_FEE = 20; // formData.delivery_fee inicial do ERP
  const INITIAL_STATUS = 'em_separacao';
  const CARD_METHODS = ['credit_card', 'debit_card', 'payment_link'];

  // getConfigNumber: valor do banco; sem a chave, o padrão do systemConfig.ts
  function configNumber(cfg, key) {
    const v = cfg && Object.prototype.hasOwnProperty.call(cfg, key) ? cfg[key] : FEE_DEFAULTS[key];
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function cardFeeRate(cfg, method, brand, installments) {
    const prefix = brand === 'elo_amex' ? 'fee_ea' : 'fee_vm';
    if (method === 'debit_card') return configNumber(cfg, `${prefix}_debit`);
    // 2.6.1: link de pagamento com taxas próprias (fee_link_vm_credit_N / fee_link_ea_credit_N)
    if (method === 'payment_link' && installments > 0) {
      const n = Math.min(Math.max(installments, 1), 12);
      return configNumber(cfg, `${prefix.replace('fee_', 'fee_link_')}_credit_${n}`);
    }
    if (method === 'credit_card' && installments > 0) {
      const n = Math.min(Math.max(installments, 1), 12);
      return configNumber(cfg, `${prefix}_credit_${n}`);
    }
    return 0;
  }

  // calculatePaymentFee do ERP
  function paymentFee(cfg, pm, amount) {
    if (pm.method === 'outros') return Math.max(0, (pm.amount || 0) - (pm.net_amount || 0));
    return amount * cardFeeRate(cfg, pm.method, pm.card_brand || '', pm.installments || 0);
  }

  // calculateTotals do ERP (sem itens manuais: a extensão não cria itens manuais)
  function computeTotals({ items = [], accessories = [], payments = [], delivery_type, delivery_fee = 0, delivery_cost = 0, cfg }) {
    const totalSalePrice = items.reduce((s, sp) => s + (sp.unit_price || 0) * (sp.quantity || 0), 0);
    const totalProductCost = items.reduce((s, sp) => s + (sp.unit_cost || 0) * (sp.quantity || 0), 0);
    const totalAccessoryCost = accessories.reduce((s, sa) => s + (sa.cost || 0) * (sa.quantity || 0), 0);
    const allAmountsZero = payments.every((pm) => pm.amount === 0);
    const cardFee = allAmountsZero
      ? paymentFee(cfg, payments[0] || { method: 'pix', card_brand: '', installments: 0, amount: 0 }, totalSalePrice)
      : payments.reduce((s, pm) => s + paymentFee(cfg, pm, pm.amount), 0);
    const deliveryFee = delivery_type === 'motoboy' ? (delivery_fee || 0) : 0;
    const deliveryCost = delivery_type === 'correios' ? (delivery_cost || 0) : 0;
    const totalCost = totalProductCost + totalAccessoryCost + deliveryFee + deliveryCost;
    const netReceived = totalSalePrice - cardFee;
    return { totalSalePrice, totalProductCost, totalAccessoryCost, cardFee, deliveryFee, deliveryCost, totalCost, netReceived, profit: netReceived - totalCost };
  }

  // calculateVolumes do ERP: 1 volume por smartwatch (mínimo 1)
  function volumesOf(items) {
    const n = items.reduce((s, sp) => s + ((sp.category === 'smartwatch') ? sp.quantity : 0), 0);
    return Math.max(1, n);
  }

  // getTodayInBrazil do ERP
  function todayInBrazil(now = Date.now()) {
    const d = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // sale_date do ERP: data de hoje no Brasil + hora UTC de agora (igual ao handleSubmit)
  const saleDateOf = (now = Date.now()) => `${todayInBrazil(now)}T${new Date(now).toISOString().split('T')[1]}`;

  // validateAddressForDeliveryType do ERP
  function validateAddress(deliveryType, a) {
    const missing = [];
    if (deliveryType === 'motoboy') {
      if (!String(a.customer_name || '').trim()) missing.push('Nome do cliente');
      if (!String(a.neighborhood || '').trim()) missing.push('Bairro');
      if (!String(a.city || '').trim()) missing.push('Cidade');
    }
    return missing.length ? { isValid: false, message: `Preencha os campos obrigatórios para entrega via motoboy: ${missing.join(', ')}` } : { isValid: true };
  }

  // Linha de sales exatamente como o insert do handleSubmit (mesma ordem de colunas)
  function buildSale({ form, items, accessories, payments, cfg, now = Date.now() }) {
    const totals = computeTotals({ items, accessories, payments, delivery_type: form.delivery_type, delivery_fee: form.delivery_fee, delivery_cost: form.delivery_cost, cfg });
    const row = {
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      customer_cpf: null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      city: form.city,
      neighborhood: form.neighborhood,
      state: form.state || null,
      zip_code: form.zip_code || null,
      payment_method: (payments[0] && payments[0].method) || 'pix',
      card_brand: (payments.find((pm) => CARD_METHODS.includes(pm.method)) || {}).card_brand || null,
      installments: (payments.find((pm) => pm.method === 'credit_card' || pm.method === 'payment_link') || {}).installments || 1,
      payment_methods: payments,
      delivery_type: form.delivery_type,
      motoboy_id: form.delivery_type === 'motoboy' ? (form.motoboy_id || null) : null,
      supplier_id: null,
      delivery_fee: totals.deliveryFee,
      delivery_cost: totals.deliveryCost,
      card_fee: totals.cardFee,
      total_cost: totals.totalCost,
      total_sale_price: totals.totalSalePrice,
      net_received: totals.netReceived,
      profit: totals.profit,
      volumes: volumesOf(items),
      manual_items: null,
      delivery_notes: String(form.delivery_notes || '').trim() || null,
      payment_status: form.payment_status === 'pago' ? 'pago' : 'a_cobrar',
      status: INITIAL_STATUS,
      sale_date: saleDateOf(now),
    };
    const saleItems = items.map((sp) => ({ product_id: sp.product_id, quantity: sp.quantity, unit_price: sp.unit_price, total_price: sp.unit_price * sp.quantity, unit_cost: sp.unit_cost || 0 }));
    const saleAccessories = accessories.map((sa) => ({ accessory_id: sa.accessory_id, custom_name: null, quantity: sa.quantity, cost: sa.cost }));
    return { row, saleItems, saleAccessories, totals };
  }

  const money = (n) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;
  const label = (list, v) => { const x = list.find(([k]) => k === v); return x ? x[1] : v; };

  // Mensagem do entregador (só texto; não envia sozinha)
  function courierMessage({ customer_name, customer_phone, address_street, address_number, neighborhood, city, reference, schedule, items, total, payment_method, payment_status, map_url }) {
    const lines = ['*ENTREGA*', `Cliente: ${customer_name || '-'}`, `Telefone: ${customer_phone || '-'}`];
    lines.push(`Rua: ${[address_street, address_number].filter(Boolean).join(', ') || '-'}`);
    lines.push(`Bairro: ${[neighborhood, city].filter(Boolean).join(' - ') || '-'}`);
    if (reference) lines.push(`Referência: ${reference}`);
    lines.push(`Horário: ${schedule || '-'}`);
    lines.push(`Produto(s): ${items.map((i) => `${i.quantity}x ${i.name}`).join('; ') || '-'}`);
    lines.push(payment_status === 'pago' ? `Valor: ${money(total)} (já pago)` : `Valor a cobrar: ${money(total)} (${label(PAYMENT_METHODS, payment_method).replace(/ \(Sem taxa\)$/, '')})`);
    if (map_url) lines.push(`Mapa: ${map_url}`);
    return lines.join('\n');
  }

  const mapUrl = (lat, lng) => (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}` : null);

  root.TspSale = {
    FEE_DEFAULTS, PAYMENT_METHODS, CARD_BRANDS, DELIVERY_TYPES, DEFAULT_DELIVERY_FEE, INITIAL_STATUS,
    configNumber, cardFeeRate, paymentFee, computeTotals, volumesOf, todayInBrazil, saleDateOf, validateAddress, buildSale,
    courierMessage, mapUrl, money,
  };
})(globalThis);
