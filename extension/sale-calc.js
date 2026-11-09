// Venda pela conversa (2.3.0; 2.12.3 igual à tela "Nova Venda"): os MESMOS cálculos e a MESMA gravação da
// tela "Nova Venda" do ERP, para a venda criada pela extensão ficar igual à criada pelo ERP. Copiado de:
//   src/lib/cardFees.ts          → getCardFeeRate / calculateCardFee / getFeePercentageLabel (taxas em system_config,
//                                  link de pagamento pela DATA DA VENDA)
//   src/lib/systemConfig.ts      → valores padrão das taxas (quando a chave não existe no banco)
//   src/pages/Sales.tsx          → calculatePaymentFee, calculateTotals (com itens manuais), calculateVolumes,
//                                  updatePaymentMethod, troca do tipo de entrega, parsearFormulario ("Colar
//                                  formulário"), validações e o insert do handleSubmit (sales / sale_items com
//                                  fornecedor por smartwatch / sale_accessories, status 'em_separacao')
//   src/lib/cpfValidation.ts     → formatCpf / cleanCpf / validateCpf
//   src/lib/addressValidation.ts → validateAddressForDeliveryType
//   src/lib/dateUtils.ts         → getTodayInBrazil
// O teste scripts/tests/saleParity.test.ts roda o código do Sales.tsx e o daqui com a mesma venda e compara o
// objeto gravado. Se o ERP mudar a conta, mude aqui também. Usado pelo background (importScripts) e pelo painel
// (content script). Sem rede, sem DOM.
(function (root) {
  const FEE_DEFAULTS = {
    fee_vm_debit: '0.0099', fee_vm_credit_1: '0.0320', fee_vm_credit_2: '0.0406', fee_vm_credit_3: '0.0466', fee_vm_credit_4: '0.0526',
    fee_vm_credit_5: '0.0586', fee_vm_credit_6: '0.0646', fee_vm_credit_7: '0.0753', fee_vm_credit_8: '0.0813', fee_vm_credit_9: '0.0873',
    fee_vm_credit_10: '0.0933', fee_vm_credit_11: '0.0993', fee_vm_credit_12: '0.1053',
    fee_ea_debit: '0.0179', fee_ea_credit_1: '0.0400', fee_ea_credit_2: '0.0486', fee_ea_credit_3: '0.0546', fee_ea_credit_4: '0.0606',
    fee_ea_credit_5: '0.0666', fee_ea_credit_6: '0.0726', fee_ea_credit_7: '0.0833', fee_ea_credit_8: '0.0893', fee_ea_credit_9: '0.0953',
    fee_ea_credit_10: '0.1013', fee_ea_credit_11: '0.1073', fee_ea_credit_12: '0.1133',
    // 2.6.1: link de pagamento (Rede) = crédito da maquininha + 1 ponto percentual
    // 2.6.2: só para vendas a partir de fee_link_start_date (AAAA-MM-DD); antes, a taxa do crédito
    fee_link_start_date: '2099-01-01',
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
  const CORREIOS_DEFAULT_COST = 13.11; // custo que o ERP põe ao escolher Correios
  const INITIAL_STATUS = 'em_separacao';
  const CARD_METHODS = ['credit_card', 'debit_card', 'payment_link'];
  const INSTALLMENT_METHODS = ['credit_card', 'payment_link'];
  // Estado inicial do pagamento do ERP: crédito, Visa/Master, 10x, valor 0 (= o total da venda)
  const initialPayment = () => ({ method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, amount: 0 });
  const newPaymentEntry = () => ({ method: 'pix', card_brand: '', installments: 0, amount: 0 }); // "+ Adicionar forma de pagamento"

  // getConfigNumber: valor do banco; sem a chave, o padrão do systemConfig.ts
  function configNumber(cfg, key) {
    const v = cfg && Object.prototype.hasOwnProperty.call(cfg, key) ? cfg[key] : FEE_DEFAULTS[key];
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  const configString = (cfg, key) => String((cfg && Object.prototype.hasOwnProperty.call(cfg, key) ? cfg[key] : FEE_DEFAULTS[key]) ?? '');

  // getCardFeeRate do ERP. saleDate: AAAA-MM-DD (a data da venda escolhida; sem ela, hoje em São Paulo)
  function cardFeeRate(cfg, method, brand, installments, saleDate = todayInBrazil()) {
    const prefix = brand === 'elo_amex' ? 'fee_ea' : 'fee_vm';
    if (method === 'debit_card') return configNumber(cfg, `${prefix}_debit`);
    if (method === 'payment_link' && installments > 0) {
      const n = Math.min(Math.max(installments, 1), 12);
      const start = configString(cfg, 'fee_link_start_date');
      const day = /^\d{4}-\d{2}-\d{2}/.test(String(saleDate || '')) ? String(saleDate).slice(0, 10) : null;
      if (day && /^\d{4}-\d{2}-\d{2}$/.test(start) && day >= start) return configNumber(cfg, `${prefix.replace('fee_', 'fee_link_')}_credit_${n}`);
      return configNumber(cfg, `${prefix}_credit_${n}`);
    }
    if (method === 'credit_card' && installments > 0) {
      const n = Math.min(Math.max(installments, 1), 12);
      return configNumber(cfg, `${prefix}_credit_${n}`);
    }
    return 0;
  }
  // getFeePercentageLabel do ERP ("3.20%")
  const feeLabel = (cfg, method, brand, installments, saleDate) => `${(cardFeeRate(cfg, method, brand, installments, saleDate) * 100).toFixed(2)}%`;

  // calculatePaymentFee do ERP
  function paymentFee(cfg, pm, amount, saleDate) {
    if (pm.method === 'outros') return Math.max(0, (pm.amount || 0) - (pm.net_amount || 0));
    return amount * cardFeeRate(cfg, pm.method, pm.card_brand || '', pm.installments || 0, saleDate);
  }

  // calculateTotals do ERP (produtos, acessórios, itens manuais, pagamentos, entrega)
  function computeTotals({ items = [], accessories = [], manualItems = [], payments = [], delivery_type, delivery_fee = 0, delivery_cost = 0, cfg, saleDate }) {
    const totalSalePrice = items.reduce((s, sp) => s + (sp.unit_price || 0) * (sp.quantity || 0), 0);
    const totalManualPrice = manualItems.reduce((s, mi) => s + (mi.price || 0) * (mi.quantity || 0), 0);
    const totalProductCost = items.reduce((s, sp) => s + (sp.unit_cost || 0) * (sp.quantity || 0), 0);
    const totalAccessoryCost = accessories.reduce((s, sa) => s + (sa.cost || 0) * (sa.quantity || 0), 0);
    const totalManualCost = manualItems.reduce((s, mi) => s + (mi.cost || 0) * (mi.quantity || 0), 0);
    const totalWithManual = totalSalePrice + totalManualPrice;
    const allAmountsZero = payments.every((pm) => pm.amount === 0);
    const cardFee = allAmountsZero
      ? paymentFee(cfg, payments[0] || { method: 'pix', card_brand: '', installments: 0, amount: 0 }, totalWithManual, saleDate)
      : payments.reduce((s, pm) => s + paymentFee(cfg, pm, pm.amount, saleDate), 0);
    const deliveryFee = delivery_type === 'motoboy' ? (delivery_fee || 0) : 0;
    const deliveryCost = delivery_type === 'correios' ? (delivery_cost || 0) : 0;
    const totalCost = totalProductCost + totalAccessoryCost + totalManualCost + deliveryFee + deliveryCost;
    const netReceived = totalWithManual - cardFee;
    return { totalSalePrice: totalWithManual, totalProductCost, totalAccessoryCost, totalManualCost, cardFee, deliveryFee, deliveryCost, totalCost, netReceived, profit: netReceived - totalCost };
  }

  // "Total da venda · Alocado · Falta alocar" do ERP
  function allocation(payments, total) {
    const allocated = payments.reduce((s, pm) => s + (pm.amount || 0), 0);
    const remaining = total - allocated;
    return { allocated, remaining, balanced: Math.abs(remaining) < 0.01, hasAmounts: allocated > 0 };
  }

  // updatePaymentMethod do ERP: fora de cartão, sem bandeira e sem parcelas; débito sem parcelas
  function updatePayment(pm, field, value) {
    const out = { ...pm, [field]: value };
    if (field === 'method' && !CARD_METHODS.includes(value)) { out.card_brand = ''; out.installments = 0; }
    if (field === 'method' && !INSTALLMENT_METHODS.includes(value)) out.installments = 0;
    return out;
  }

  // Troca do tipo de entrega no ERP: motoboy volta sem motoboy e taxa 0; Correios com o custo padrão
  const deliveryChange = (value) => ({ delivery_type: value, motoboy_id: '', delivery_fee: 0, delivery_cost: value === 'correios' ? CORREIOS_DEFAULT_COST : 0 });

  // calculateVolumes do ERP: 1 volume por smartwatch (mínimo 1)
  function volumesOf(items) {
    const n = items.reduce((s, sp) => s + ((sp.category === 'smartwatch') ? sp.quantity : 0), 0);
    return Math.max(1, n);
  }
  // Fornecedor por smartwatch: o ERP pede um por produto quando há 2 ou mais smartwatches diferentes
  const smartwatchItems = (items) => items.filter((sp) => sp.category === 'smartwatch');
  const isMultiSupplier = (items) => smartwatchItems(items).length >= 2;

  // getTodayInBrazil do ERP
  function todayInBrazil(now = Date.now()) {
    const d = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // sale_date do ERP: a data escolhida (padrão hoje no Brasil) + a hora UTC de agora (igual ao handleSubmit)
  const saleDateOf = (day, now = Date.now()) => `${/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : todayInBrazil(now)}T${new Date(now).toISOString().split('T')[1]}`;

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

  // cpfValidation.ts do ERP
  const cleanCpf = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  function formatCpf(value) {
    const n = cleanCpf(value);
    if (n.length <= 3) return n;
    if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
    if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9, 11)}`;
  }
  function validateCpf(cpf) {
    const n = cleanCpf(cpf);
    if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(n.charAt(i), 10) * (10 - i);
    let d = 11 - (sum % 11);
    if (d >= 10) d = 0;
    if (d !== parseInt(n.charAt(9), 10)) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(n.charAt(i), 10) * (11 - i);
    d = 11 - (sum % 11);
    if (d >= 10) d = 0;
    return d === parseInt(n.charAt(10), 10);
  }

  // parsearFormulario do ERP ("📋 Colar formulário"): o que achar no texto vira campo. Devolve só o que achou;
  // cep = só dígitos (o ERP busca o endereço do CEP depois).
  function parseForm(texto) {
    const t = String(texto || '');
    const extrair = (...labels) => {
      for (const label of labels) {
        const m = t.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:?\\s*(.+)`, 'im'));
        if (m) return m[1].trim();
      }
      return '';
    };
    const nome = extrair('Nome');
    const rua = extrair('Rua', 'Endere[çc]o', 'Logradouro', 'End');
    const numero = extrair('N[uú]mero', 'Nº', 'N°', 'Num');
    const complemento = extrair('Complemento', 'Comp');
    const bairro = extrair('Bairro');
    const cepRaw = extrair('CEP', 'Cep');
    const cpfRaw = extrair('CPF', 'Cpf');
    const cidade = extrair('Cidade');
    const estadoRaw = extrair('Estado', 'UF');
    const out = {};
    if (nome) out.customer_name = nome;
    if (rua) out.address_street = rua;
    if (numero) out.address_number = numero;
    if (complemento) out.address_complement = complemento.slice(0, 18);
    if (estadoRaw) out.state = estadoRaw.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
    const cep = cepRaw.replace(/[\s\-.]/g, '');
    if (cep) out.zip_code = cep;
    if (cpfRaw) out.customer_cpf = cleanCpf(cpfRaw);
    if (bairro) out.neighborhood = bairro;
    if (cidade) out.city = cidade;
    return out;
  }
  // handleCepChange do ERP: o que o ViaCEP devolve entra por cima (rua só se vier)
  function applyCep(form, addr) {
    if (!addr) return form;
    const out = { ...form, address_street: addr.logradouro || form.address_street, state: addr.uf || form.state };
    if (addr.localidade) out.city = addr.localidade;
    if (addr.bairro) out.neighborhood = addr.bairro;
    return out;
  }

  // Validações do handleSubmit do ERP (e os "required" do formulário: nome; cidade e bairro no motoboy/Correios;
  // quantidade e preço). Devolve a mensagem do ERP ou null.
  function validateSale({ form, items = [], manualItems = [], payments = [] }) {
    if (!items.length && !manualItems.length) return 'Por favor, adicione pelo menos um produto ou item';
    if (!String(form.customer_name || '').trim()) return 'Preencha o nome do cliente';
    for (const mi of manualItems) {
      if (!(mi.price >= 0)) return `Por favor, insira o preço para o item "${mi.name}"`;
      if (!(mi.quantity >= 1)) return `Quantidade inválida no item "${mi.name}"`;
    }
    if (form.customer_cpf && !validateCpf(form.customer_cpf)) return 'CPF inválido';
    const v = validateAddress(form.delivery_type, form);
    if (!v.isValid) return v.message;
    if (form.delivery_type === 'correios') {
      const miss = [!String(form.city || '').trim() && 'Cidade', !String(form.neighborhood || '').trim() && 'Bairro'].filter(Boolean);
      if (miss.length) return `Preencha os campos obrigatórios para Correios: ${miss.join(', ')}`;
    }
    for (const sp of items) {
      if (!(sp.unit_price >= 0)) return 'Por favor, insira o preço de venda para todos os produtos';
      if (!(sp.quantity >= 1)) return 'Quantidade inválida';
    }
    if (!payments.length) return 'Escolha a forma de pagamento';
    const allZero = payments.every((pm) => pm.amount === 0);
    if (!allZero) {
      const expected = items.reduce((s, sp) => s + sp.unit_price * sp.quantity, 0) + manualItems.reduce((s, mi) => s + mi.price * mi.quantity, 0);
      const allocated = payments.reduce((s, pm) => s + pm.amount, 0);
      if (Math.abs(allocated - expected) > 0.01) return `Total alocado (R$ ${allocated.toFixed(2)}) não bate com o valor da venda (R$ ${expected.toFixed(2)})`;
    }
    return null;
  }

  // Linhas exatamente como o insert do handleSubmit (mesmas colunas). items: { product_id, quantity, unit_price,
  // unit_cost, category }; accessories: { accessory_id, quantity, cost, custom_name? }; manualItems: { name, price,
  // cost, quantity }; payments: as formas como ficaram na tela; supplierId: fornecedor já resolvido (o ERP cria
  // pelo nome antes); itemSuppliers: { product_id: supplier_id } (2+ smartwatches); form.sale_date: AAAA-MM-DD.
  function buildSale({ form, items, accessories = [], manualItems = [], payments, cfg, supplierId = null, itemSuppliers = {}, now = Date.now() }) {
    const saleDay = /^\d{4}-\d{2}-\d{2}$/.test(String(form.sale_date || '')) ? form.sale_date : todayInBrazil(now);
    const totals = computeTotals({ items, accessories, manualItems, payments, delivery_type: form.delivery_type, delivery_fee: form.delivery_fee, delivery_cost: form.delivery_cost, cfg, saleDate: saleDay });
    const multi = isMultiSupplier(items);
    const supplier = multi ? (itemSuppliers[smartwatchItems(items)[0].product_id] || '') : supplierId;
    const row = {
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      customer_cpf: form.customer_cpf ? cleanCpf(form.customer_cpf) : null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      city: String(form.city || '').trim(),
      neighborhood: String(form.neighborhood || '').trim(),
      state: form.state || null,
      zip_code: form.zip_code || null,
      payment_method: (payments[0] && payments[0].method) || 'pix',
      card_brand: (payments.find((pm) => CARD_METHODS.includes(pm.method)) || {}).card_brand || null,
      installments: (payments.find((pm) => INSTALLMENT_METHODS.includes(pm.method)) || {}).installments || 1,
      payment_methods: payments,
      delivery_type: form.delivery_type,
      motoboy_id: form.delivery_type === 'motoboy' ? (form.motoboy_id || null) : null,
      supplier_id: supplier || null,
      delivery_fee: totals.deliveryFee,
      delivery_cost: totals.deliveryCost,
      card_fee: totals.cardFee,
      total_cost: totals.totalCost,
      total_sale_price: totals.totalSalePrice,
      net_received: totals.netReceived,
      profit: totals.profit,
      volumes: Number.isInteger(form.volumes) && form.volumes >= 1 ? form.volumes : volumesOf(items),
      manual_items: manualItems.length > 0 ? manualItems : null,
      delivery_notes: String(form.delivery_notes || '').trim() || null,
      payment_status: form.payment_status === 'pago' ? 'pago' : 'a_cobrar',
      status: INITIAL_STATUS,
      sale_date: saleDateOf(saleDay, now),
    };
    const saleItems = items.map((sp) => ({
      product_id: sp.product_id, quantity: sp.quantity, unit_price: sp.unit_price, total_price: sp.unit_price * sp.quantity, unit_cost: sp.unit_cost || 0,
      ...(multi ? { supplier_id: itemSuppliers[sp.product_id] || null } : {}),
    }));
    const saleAccessories = accessories.map((sa) => ({ accessory_id: sa.accessory_id, custom_name: sa.custom_name || null, quantity: sa.quantity, cost: sa.cost }));
    return { row, saleItems, saleAccessories, totals };
  }

  const money = (n) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;
  const label = (list, v) => { const x = list.find(([k]) => k === v); return x ? x[1] : v; };

  // Mensagem do entregador (só texto; não envia sozinha). 2.12.3: sem a linha de horário.
  function courierMessage({ customer_name, customer_phone, address_street, address_number, address_complement, neighborhood, city, items, total, payment_method, payment_status, map_url, notes }) {
    const lines = ['*ENTREGA*', `Cliente: ${customer_name || '-'}`, `Telefone: ${customer_phone || '-'}`];
    lines.push(`Rua: ${[address_street, address_number].filter(Boolean).join(', ') || '-'}`);
    if (address_complement) lines.push(`Complemento: ${address_complement}`);
    lines.push(`Bairro: ${[neighborhood, city].filter(Boolean).join(' - ') || '-'}`);
    lines.push(`Produto(s): ${items.map((i) => `${i.quantity}x ${i.name}`).join('; ') || '-'}`);
    lines.push(payment_status === 'pago' ? `Valor: ${money(total)} (já pago)` : `Valor a cobrar: ${money(total)} (${label(PAYMENT_METHODS, payment_method).replace(/ \(Sem taxa\)$/, '')})`);
    if (notes) lines.push(`Obs.: ${notes}`);
    if (map_url) lines.push(`Mapa: ${map_url}`);
    return lines.join('\n');
  }

  // 2.15.1: nome completo do cliente no 💰. Ordem: (a) nome da última venda do ERP com o mesmo telefone;
  // (b) nome salvo na agenda do WhatsApp ou o do perfil (pushname), limpo, com 2+ palavras e a 1ª palavra igual
  // ao nome aprendido (ou sem nome aprendido); (c) o nome aprendido/definido da conversa (só o primeiro nome).
  const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del']);
  const NAME_JUNK = new Set(['cliente', 'cli', 'clt', 'sr', 'sra', 'dr', 'dra', 'watch', 'smartwatch', 'smart', 'relogio', 'relogios',
    'apple', 'iwo', 'series', 'serie', 'ultra', 'pro', 'max', 'mini', 'plus', 'lite', 'galaxy', 'amazfit', 'xiaomi', 'samsung', 'huawei',
    'band', 'miband', 'gtr', 'gts', 'loja', 'store', 'vendas', 'oficial', 'iphone', 'ipad', 'airpods']);
  const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // "ANA MARIA DA SILVA" → "Ana Maria da Silva" (da/de/do/dos/das/e minúsculos, menos no começo)
  function titleCaseName(s) {
    const words = String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words.map((w, i) => {
      const low = w.toLocaleLowerCase('pt-BR');
      if (i > 0 && NAME_PARTICLES.has(low)) return low;
      return low.replace(/(^|[-'])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
    }).join(' ').slice(0, 100);
  }
  // nome do perfil/agenda limpo: sem "~", emojis, números, "Cliente", modelos de relógio; corta em "/", "|", " - "…
  function cleanProfileName(raw) {
    const parts = String(raw == null ? '' : raw).normalize('NFC').replace(/^[\s~]+/, '').split(/\s*(?:[/|•·,;:()[\]{}]|\s[-–—]\s|[–—])\s*/);
    for (const part of parts) {
      const words = part.split(/\s+/).filter((t) => t && !/\d/.test(t))
        .map((t) => t.replace(/[^\p{L}'-]+/gu, '').replace(/^[-']+|[-']+$/g, ''))
        .filter((w) => w && !NAME_JUNK.has(nameKey(w)) && (w.length > 1 || nameKey(w) === 'e'));
      while (words.length && NAME_PARTICLES.has(nameKey(words[0]))) words.shift();
      while (words.length && NAME_PARTICLES.has(nameKey(words[words.length - 1]))) words.pop();
      if (words.length) return titleCaseName(words.slice(0, 6).join(' '));
    }
    return '';
  }
  const realWords = (s) => String(s || '').split(' ').filter((w) => w && !NAME_PARTICLES.has(nameKey(w)));
  // { saleName, contactName, pushname, learned, fallback } → { value, options: [{ name, source }] }
  function customerNameChoice({ saleName, contactName, pushname, learned, fallback } = {}) {
    const learnedName = titleCaseName(String(learned || '').trim().split(/\s+/)[0] || '');
    const sale = titleCaseName(saleName);
    let profile = '';
    for (const [raw, source] of [[contactName, 'agenda'], [pushname, 'perfil']]) {
      const c = cleanProfileName(raw);
      const w = realWords(c);
      if (w.length < 2) continue;
      if (learnedName && nameKey(w[0]) !== nameKey(learnedName)) continue;
      profile = { name: c, source };
      break;
    }
    const opts = [];
    const add = (name, source) => { if (name && !opts.some((o) => nameKey(o.name) === nameKey(name))) opts.push({ name, source }); };
    add(learnedName, 'conversa');
    if (profile) add(profile.name, profile.source);
    add(sale, 'venda');
    const value = sale || (profile && profile.name) || learnedName || cleanProfileName(fallback) || '';
    if (value) add(value, 'whatsapp');
    return { value, options: opts.length > 1 ? opts : [] };
  }

  const mapUrl = (lat, lng) => (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}` : null);

  root.TspSale = {
    FEE_DEFAULTS, PAYMENT_METHODS, CARD_BRANDS, DELIVERY_TYPES, DEFAULT_DELIVERY_FEE, CORREIOS_DEFAULT_COST, INITIAL_STATUS, CARD_METHODS, INSTALLMENT_METHODS,
    initialPayment, newPaymentEntry, configNumber, cardFeeRate, feeLabel, paymentFee, computeTotals, allocation, updatePayment, deliveryChange,
    volumesOf, smartwatchItems, isMultiSupplier, todayInBrazil, saleDateOf, validateAddress, cleanCpf, formatCpf, validateCpf, parseForm, applyCep,
    validateSale, buildSale, courierMessage, mapUrl, money, titleCaseName, cleanProfileName, customerNameChoice,
  };
})(globalThis);
