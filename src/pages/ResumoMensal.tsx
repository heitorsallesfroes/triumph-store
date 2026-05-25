import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '../lib/supabase';
import { calculateCardFee } from '../lib/cardFees';
import {
  TrendingUp, DollarSign, ShoppingCart, Package, Truck,
  Bike, BarChart3, MapPin, Star, ShoppingBag, Target, Zap, FileDown,
} from 'lucide-react';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const getCurrentMonth = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = -5; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return options.reverse();
};

interface SaleData {
  id: string;
  sale_date: string;
  total_sale_price: number;
  net_received: number;
  total_cost: number;
  delivery_fee: number;
  delivery_cost: number;
  delivery_type: string;
  status: string;
  city: string;
  neighborhood?: string;
  payment_method: string;
}

interface SaleItem {
  sale_id: string;
  product_id: string;
  quantity: number;
  products: { model: string; color: string; category: string } | null;
}

function getRoasConfig(roas: number) {
  if (roas > 7)  return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (roas >= 6) return { color: 'text-green-400',   label: 'Ótimo ✅' };
  if (roas >= 5) return { color: 'text-green-300',   label: 'Bom' };
  if (roas >= 4) return { color: 'text-yellow-400',  label: 'OK' };
  return               { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

function getRoiConfig(roi: number) {
  if (roi > 200)  return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (roi >= 100) return { color: 'text-green-400',   label: 'Ótimo ✅' };
  if (roi >= 50)  return { color: 'text-yellow-400',  label: 'OK' };
  return                 { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

function getCpvConfig(cpv: number) {
  if (cpv < 40)  return { color: 'text-emerald-400', label: 'Excelente 🚀' };
  if (cpv < 65)  return { color: 'text-green-400',   label: 'Bom ✅' };
  if (cpv < 75)  return { color: 'text-yellow-400',  label: 'OK' };
  return                { color: 'text-red-400',     label: 'Ruim ⚠️' };
}

export default function ResumoMensal() {
  const [selected, setSelected] = useState(getCurrentMonth());
  const [sales, setSales] = useState<SaleData[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [operationalCosts, setOperationalCosts] = useState(0);
  const [motoboyExtras, setMotoboyExtras] = useState(0);
  const [motoboyDeliveryFees, setMotoboyDeliveryFees] = useState(0);
  const [smallSales, setSmallSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCity, setExpandedCity] = useState<{ type: string; city: string } | null>(null);

  useEffect(() => { loadData(); }, [selected]);

  const monthStr = `${selected.year}-${String(selected.month).padStart(2, '0')}`;
  const startDate = `${monthStr}-01`;
  const endDate = new Date(selected.year, selected.month, 0).toISOString().split('T')[0];

  const loadData = async () => {
    setLoading(true);
    try {
      const startUTC = startDate + 'T03:00:00.000Z';
      const [ey, em, ed] = endDate.split('-').map(Number);
      const endUTC = new Date(Date.UTC(ey, em - 1, ed + 1)).toISOString().split('T')[0] + 'T03:00:00.000Z';

      const [salesRes, adRes, costsPayRes, allCostsRes, motoboyExtrasRes, motoboyFeesRes, motoboySmallFeesRes] = await Promise.all([
        supabase.from('sales')
          .select('id,sale_date,total_sale_price,net_received,total_cost,delivery_fee,delivery_cost,delivery_type,status,city,neighborhood,payment_method')
          .neq('status', 'cancelado')
          .gte('sale_date', startDate)
          .lte('sale_date', endDate + 'T23:59:59'),
        supabase.from('ad_spend').select('amount').gte('date', startDate).lte('date', endDate),
        supabase.from('operational_cost_payments').select('cost_id, amount_paid').eq('month', monthStr),
        supabase.from('operational_costs').select('id, amount'),
        supabase.from('motoboy_payments').select('amount').gte('date', startDate).lte('date', endDate),
        supabase.from('sales').select('delivery_fee')
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC)
          .lt('finalized_at', endUTC),
        supabase.from('small_sales').select('delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC)
          .lt('created_at', endUTC),
      ]);

      const salesData = salesRes.data || [];
      setSales(salesData);

      if (salesData.length > 0) {
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id,product_id,quantity,products(model,color,category)')
          .in('sale_id', salesData.map(s => s.id));
        setSaleItems((itemsData || []) as SaleItem[]);
      } else {
        setSaleItems([]);
      }

      setAdSpend((adRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0));
      const paymentsMap = new Map((costsPayRes.data || []).map(r => [r.cost_id, Number(r.amount_paid ?? 0)]));
      const totalOpCosts = (allCostsRes.data || []).reduce((sum, c) => sum + (paymentsMap.has(c.id) ? paymentsMap.get(c.id)! : Number(c.amount)), 0);
      setOperationalCosts(totalOpCosts);
      setMotoboyExtras((motoboyExtrasRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0));
      const salesFees = (motoboyFeesRes.data || []).reduce((sum, r) => sum + Number(r.delivery_fee || 0), 0);
      const smallFees = (motoboySmallFeesRes.data || []).reduce((sum, r) => sum + Number(r.delivery_fee || 0), 0);
      setMotoboyDeliveryFees(salesFees + smallFees);

      const { data: ssData } = await supabase
        .from('small_sales')
        .select('*')
        .gte('created_at', startDate + 'T00:00:00-03:00')
        .lte('created_at', endDate + 'T23:59:59-03:00');
      setSmallSales(ssData || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // ── BLOCO 1: Smartwatches ────────────────────────────────────────────────
  const totalBruto    = sales.reduce((s, v) => s + Number(v.total_sale_price), 0);
  const totalLiquido  = sales.reduce((s, v) => s + Number(v.net_received), 0);
  const totalTaxaCartao = totalBruto - totalLiquido;

  const totalCustoProdutos = sales.reduce((s, v) => {
    const deliv = Number(v.delivery_fee || 0) + Number(v.delivery_cost || 0);
    return s + Number(v.total_cost || 0) - deliv;
  }, 0);

  const salesFinalizadas = sales.filter(v => v.status === 'finalizado');
  const totalMotoboyDeliveries  = motoboyDeliveryFees;
  const totalCorreiosDeliveries = salesFinalizadas.filter(v => v.delivery_type === 'correios').reduce((s, v) => s + Number(v.delivery_cost || 0), 0);
  const totalCustoEntregas = totalMotoboyDeliveries + totalCorreiosDeliveries + motoboyExtras;

  const swCount         = saleItems.filter(i => (i.products as any)?.category === 'smartwatch').reduce((s, i) => s + i.quantity, 0);
  const custoEmbalagens = swCount * 2;
  const lucroSmartwatch = totalLiquido - totalCustoProdutos - totalCustoEntregas - adSpend - operationalCosts - custoEmbalagens;
  const margemSmartwatch = totalBruto > 0 ? (lucroSmartwatch / totalBruto) * 100 : 0;

  const roas = adSpend > 0 ? totalBruto / adSpend : null;
  const roi  = adSpend > 0 ? (lucroSmartwatch / adSpend) * 100 : null;
  const cpv  = adSpend > 0 && sales.length > 0 ? adSpend / sales.length : null;

  // ── BLOCO 2: Pequenas Vendas ─────────────────────────────────────────────
  const CARD_METHODS = ['credit_card', 'debit_card', 'payment_link'];
  const smallSalesRevenue      = smallSales.reduce((s, v) => s + Number(v.sale_price) * Number(v.quantity), 0);
  const smallSalesCost         = smallSales.reduce((s, v) => s + Number(v.cost) * Number(v.quantity), 0);
  const smallSalesDeliveryCost = smallSales.reduce((s, v) => s + Number(v.delivery_fee || 0), 0);
  const smallSalesCardFees     = smallSales.reduce((s, v) => {
    type PM = { method: string; card_brand: string; installments: number; amount: number };
    const pms = v.payment_methods as PM[] | null;
    if (pms && Array.isArray(pms) && pms.length > 1) {
      return s + pms
        .filter(pm => CARD_METHODS.includes(pm.method))
        .reduce((sum, pm) => sum + calculateCardFee(Number(pm.amount), pm.method, pm.card_brand || '', pm.installments || 0), 0);
    }
    if (CARD_METHODS.includes(v.payment_method)) {
      return s + calculateCardFee(Number(v.sale_price) * Number(v.quantity), v.payment_method, v.card_brand || '', v.installments || 0);
    }
    return s;
  }, 0);
  const smallSalesNet    = smallSalesRevenue - smallSalesCardFees;
  const smallSalesProfit = smallSalesNet - smallSalesCost - smallSalesDeliveryCost;
  const margemPV         = smallSalesRevenue > 0 ? (smallSalesProfit / smallSalesRevenue) * 100 : 0;

  // ── BLOCO 3: Consolidado ─────────────────────────────────────────────────
  const consolidadoBruto = totalBruto + smallSalesRevenue;
  const consolidadoLucro = lucroSmartwatch + smallSalesProfit;
  const consolidadoCusto = consolidadoBruto - consolidadoLucro;
  const margemConsolidada = consolidadoBruto > 0 ? (consolidadoLucro / consolidadoBruto) * 100 : 0;

  // ── Seções analíticas ────────────────────────────────────────────────────
  const canais = [
    { label: 'Motoboy',    key: 'motoboy',     icon: Bike,         color: 'text-orange-400' },
    { label: 'Correios',   key: 'correios',    icon: Truck,        color: 'text-blue-400'   },
    { label: 'Loja Física',key: 'loja_fisica', icon: ShoppingCart, color: 'text-green-400'  },
  ].map(c => ({
    ...c,
    count: sales.filter(s => s.delivery_type === c.key).length,
    value: sales.filter(s => s.delivery_type === c.key).reduce((sum, s) => sum + Number(s.total_sale_price), 0),
  }));

  // Cidades — Motoboy
  const cidadesMotoboyMap = new Map<string, { count: number; value: number }>();
  sales.filter(s => s.delivery_type === 'motoboy').forEach(s => {
    const city = s.city || 'Não informado';
    const cur = cidadesMotoboyMap.get(city) || { count: 0, value: 0 };
    cidadesMotoboyMap.set(city, { count: cur.count + 1, value: cur.value + Number(s.total_sale_price) });
  });
  const cidadesMotoboy = Array.from(cidadesMotoboyMap.entries())
    .map(([city, data]) => ({ city, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Cidades — Correios
  const cidadesCorreiosMap = new Map<string, { count: number; value: number }>();
  sales.filter(s => s.delivery_type === 'correios').forEach(s => {
    const city = s.city || 'Não informado';
    const cur = cidadesCorreiosMap.get(city) || { count: 0, value: 0 };
    cidadesCorreiosMap.set(city, { count: cur.count + 1, value: cur.value + Number(s.total_sale_price) });
  });
  const cidadesCorreios = Array.from(cidadesCorreiosMap.entries())
    .map(([city, data]) => ({ city, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Cidades — Loja Física
  const cidadesLojaMap = new Map<string, { count: number; value: number }>();
  sales.filter(s => s.delivery_type === 'loja_fisica').forEach(s => {
    const city = s.city || 'Não informado';
    const cur = cidadesLojaMap.get(city) || { count: 0, value: 0 };
    cidadesLojaMap.set(city, { count: cur.count + 1, value: cur.value + Number(s.total_sale_price) });
  });
  const cidadesLoja = Array.from(cidadesLojaMap.entries())
    .map(([city, data]) => ({ city, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const totalMotoboy    = cidadesMotoboy.reduce((s, x) => s + x.count, 0);
  const totalCorreios   = cidadesCorreios.reduce((s, x) => s + x.count, 0);
  const totalLojaFisica = cidadesLoja.reduce((s, x) => s + x.count, 0);

  const modelColorMap = new Map<string, number>();
  saleItems.forEach(item => {
    if (item.products?.category === 'smartwatch') {
      const key = `${item.products.model} - ${item.products.color}`;
      modelColorMap.set(key, (modelColorMap.get(key) || 0) + item.quantity);
    }
  });
  const topModels = Array.from(modelColorMap.entries()).sort((a, b) => b[1] - a[1]);

  const saleDataMap = new Map<string, SaleData>();
  sales.forEach(s => saleDataMap.set(s.id, s));

  const saleTotalSwQtyMap = new Map<string, number>();
  saleItems.filter(i => i.products?.category === 'smartwatch').forEach(item => {
    saleTotalSwQtyMap.set(item.sale_id, (saleTotalSwQtyMap.get(item.sale_id) || 0) + item.quantity);
  });

  const modelFinancialMap = new Map<string, { qty: number; lucroBruto: number }>();
  saleItems.filter(i => i.products?.category === 'smartwatch').forEach(item => {
    const key = `${item.products!.model} - ${item.products!.color}`;
    const sale = saleDataMap.get(item.sale_id);
    if (!sale) return;
    const totalSwInSale = saleTotalSwQtyMap.get(item.sale_id) || 1;
    const ratio = item.quantity / totalSwInSale;
    const revenue = Number(sale.total_sale_price) * ratio;
    const cardFee = (Number(sale.total_sale_price) - Number(sale.net_received)) * ratio;
    const productCost = (Number(sale.total_cost || 0) - Number(sale.delivery_fee || 0) - Number(sale.delivery_cost || 0)) * ratio;
    const deliveryCost = (Number(sale.delivery_fee || 0) + Number(sale.delivery_cost || 0)) * ratio;
    const grossProfit = revenue - cardFee - productCost - deliveryCost;
    const cur = modelFinancialMap.get(key) || { qty: 0, lucroBruto: 0 };
    modelFinancialMap.set(key, { qty: cur.qty + item.quantity, lucroBruto: cur.lucroBruto + grossProfit });
  });

  const fixedCostPerUnit = swCount > 0 ? (adSpend + operationalCosts + custoEmbalagens) / swCount : 0;

  const paymentMap = new Map<string, number>();
  sales.forEach(s => {
    const pm = s.payment_method || 'Não informado';
    paymentMap.set(pm, (paymentMap.get(pm) || 0) + 1);
  });
  const paymentMethods = Array.from(paymentMap.entries()).sort((a, b) => b[1] - a[1]);

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
  const cpvSw = adSpend > 0 && swCount > 0 ? adSpend / swCount : null;

  const exportToExcel = () => {
    const monthName = MONTHS[selected.month - 1];
    const fileName = `Relatorio_Triumph_Store_${monthName}_${selected.year}.xlsx`;
    const wb = XLSX.utils.book_new();

    // ── Primitivos de estilo ─────────────────────────────────────────────────
    const T   = { style: 'thin' as const, color: { rgb: 'E5E7EB' } };
    const bd  = { top: T, bottom: T, left: T, right: T };
    const MON = '"R$ "#,##0.00';
    const period = `${monthName} ${selected.year}`;

    // Fábrica de célula
    const mk = (v: any, s: object, t?: string): any =>
      ({ v, t: t ?? (typeof v === 'number' ? 'n' : 's'), s });
    const mt = (): any => mk('', {});

    // ── Estilos reutilizáveis ────────────────────────────────────────────────
    const sTitleCell = (txt: string) => mk(txt, {
      font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F97316' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    const sTitleBg = () => mk('', { fill: { patternType: 'solid', fgColor: { rgb: 'F97316' } } });

    const sSecCell = (txt: string) => mk(txt, {
      font: { bold: true, sz: 10, color: { rgb: '111827' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'E5E7EB' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    const sSecBg = () => mk('', { fill: { patternType: 'solid', fgColor: { rgb: 'E5E7EB' } } });

    const sColHead = (txt: string) => mk(txt, {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '4B5563' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: bd,
    });

    const sLbl = (txt: string, alt = false) => mk(txt, {
      ...(alt ? { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } } } : {}),
      alignment: { horizontal: 'left', vertical: 'center' },
      border: bd,
    });

    const sMon = (v: number, alt = false) => mk(v, {
      font: { color: { rgb: v < 0 ? 'DC2626' : v > 0 ? '15803D' : '6B7280' } },
      ...(alt ? { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } } } : {}),
      numFmt: MON,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: bd,
    });

    const sPct = (v: number, alt = false) => mk(v / 100, {
      font: { color: { rgb: v < 0 ? 'DC2626' : v > 0 ? '15803D' : '6B7280' } },
      ...(alt ? { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } } } : {}),
      numFmt: '0.00%',
      alignment: { horizontal: 'right', vertical: 'center' },
      border: bd,
    });

    const sNum = (v: number, alt = false) => mk(v, {
      ...(alt ? { fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } } } : {}),
      alignment: { horizontal: 'center', vertical: 'center' },
      border: bd,
    });

    const sResultMon = (v: number) => mk(v, {
      font: { bold: true, sz: 11, color: { rgb: v < 0 ? 'DC2626' : v > 0 ? '15803D' : '6B7280' } },
      fill: { patternType: 'solid', fgColor: { rgb: v < 0 ? 'FEF2F2' : 'F0FDF4' } },
      numFmt: MON,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: bd,
    });

    // Linha de subtotal com fundo cinza e valor na col B
    const sSecRow = (label: string, v: number): any[] => [
      mk(label, {
        font: { bold: true, color: { rgb: '111827' } },
        fill: { patternType: 'solid', fgColor: { rgb: 'E5E7EB' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: bd,
      }),
      mk(v, {
        font: { bold: true, color: { rgb: v < 0 ? 'DC2626' : v > 0 ? '15803D' : '6B7280' } },
        fill: { patternType: 'solid', fgColor: { rgb: 'E5E7EB' } },
        numFmt: MON,
        alignment: { horizontal: 'right', vertical: 'center' },
        border: bd,
      }),
    ];

    // Linha de EBIT destacada com fundo verde/vermelho
    const sEbitRow = (v: number): any[] => [
      mk('= Lucro Operacional (EBIT)', {
        font: { bold: true, sz: 11, color: { rgb: '111827' } },
        fill: { patternType: 'solid', fgColor: { rgb: v >= 0 ? 'D1FAE5' : 'FEE2E2' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: bd,
      }),
      mk(v, {
        font: { bold: true, sz: 11, color: { rgb: v >= 0 ? '15803D' : 'DC2626' } },
        fill: { patternType: 'solid', fgColor: { rgb: v >= 0 ? 'D1FAE5' : 'FEE2E2' } },
        numFmt: MON,
        alignment: { horizontal: 'right', vertical: 'center' },
        border: bd,
      }),
    ];

    // Cria worksheet: aplica colunas, altura do título e merges
    const mkWs = (rows: any[][], colW: number[], merges?: any[]): any => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = colW.map(wch => ({ wch }));
      ws['!rows'] = [{ hpt: 26 }];
      if (merges) ws['!merges'] = merges;
      return ws;
    };

    // ── Valores derivados do DRE ─────────────────────────────────────────────
    const dreCardFees   = totalTaxaCartao + smallSalesCardFees;
    const dreRecLiq     = consolidadoBruto - dreCardFees;
    const dreCustoProd  = totalCustoProdutos + smallSalesCost;
    const dreLucroBruto = dreRecLiq - dreCustoProd - custoEmbalagens;
    const dreCustoEntr  = totalCustoEntregas + smallSalesDeliveryCost;
    const dreMargemEbit = consolidadoBruto > 0 ? (consolidadoLucro / consolidadoBruto) * 100 : 0;

    // ── Aba 1: Smartwatches ──────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, mkWs([
      [sTitleCell(`Triumph Store — Smartwatches — ${period}`), sTitleBg()],
      [mt(), mt()],
      [sSecCell('RECEITAS'), sSecBg()],
      [sLbl('Faturamento Bruto'),     sMon(totalBruto)],
      [sLbl('Líquido Recebido'),      sMon(totalLiquido)],
      [sLbl('Taxa de Cartão'),        sMon(totalTaxaCartao)],
      [sLbl('Total de Vendas'),       sNum(sales.length)],
      [sLbl('Qtd Smartwatches'),      sNum(swCount)],
      [sLbl('Ticket Médio'),          sMon(sales.length > 0 ? totalBruto / sales.length : 0)],
      [mt(), mt()],
      [sSecCell('CUSTOS'), sSecBg()],
      [sLbl('Custo dos Produtos'),         sMon(totalCustoProdutos)],
      [sLbl('Embalagens'),                 sMon(custoEmbalagens)],
      [sLbl('Custo Entregas (Total)'),      sMon(totalCustoEntregas)],
      [sLbl('  ↳ Motoboy', true),          sMon(totalMotoboyDeliveries, true)],
      [sLbl('  ↳ Correios', true),         sMon(totalCorreiosDeliveries, true)],
      [sLbl('  ↳ Avulsos', true),          sMon(motoboyExtras, true)],
      [sLbl('Investimento em Ads'),        sMon(adSpend)],
      [sLbl('Custos Operacionais'),        sMon(operationalCosts)],
      [mt(), mt()],
      [sSecCell('MÉTRICAS DE MARKETING'), sSecBg()],
      [sLbl('ROAS'), roas !== null
        ? mk(roas, { numFmt: '0.00"x"', alignment: { horizontal: 'right' }, border: bd })
        : sLbl('—')],
      [sLbl('ROI'),  roi  !== null ? sPct(roi)  : sLbl('—')],
      [sLbl('CPV / Venda'),      cpv   !== null ? sMon(cpv)   : sLbl('—')],
      [sLbl('CPV / Smartwatch'), cpvSw !== null ? sMon(cpvSw) : sLbl('—')],
      [mt(), mt()],
      [sSecCell('RESULTADO'), sSecBg()],
      [sLbl('Lucro Smartwatches'), sResultMon(lucroSmartwatch)],
      [sLbl('Margem'),             sPct(margemSmartwatch)],
    ], [38, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]), 'Smartwatches');

    // ── Aba 2: Pequenas Vendas ───────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, mkWs([
      [sTitleCell(`Triumph Store — Pequenas Vendas — ${period}`), sTitleBg()],
      [mt(), mt()],
      [sSecCell('MÉTRICAS'), sSecBg()],
      [sLbl('Nº de Vendas'),       sNum(smallSales.length)],
      [sLbl('Faturamento Bruto'),  sMon(smallSalesRevenue)],
      [sLbl('Taxas de Cartão'),    sMon(smallSalesCardFees)],
      [sLbl('Líquido Recebido'),   sMon(smallSalesNet)],
      [sLbl('Custo dos Produtos'), sMon(smallSalesCost)],
      [sLbl('Custo de Entregas'),  sMon(smallSalesDeliveryCost)],
      [mt(), mt()],
      [sSecCell('RESULTADO'), sSecBg()],
      [sLbl('Lucro Pequenas Vendas'), sResultMon(smallSalesProfit)],
      [sLbl('Margem'),                sPct(margemPV)],
    ], [38, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]), 'Pequenas Vendas');

    // ── Aba 3: Resultado Consolidado ─────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, mkWs([
      [sTitleCell(`Triumph Store — Resultado Consolidado — ${period}`), sTitleBg()],
      [mt(), mt()],
      [sSecCell('FATURAMENTO'), sSecBg()],
      [sLbl('Faturamento Total (Bruto)'),  sMon(consolidadoBruto)],
      [sLbl('  ↳ Smartwatches', true),     sMon(totalBruto, true)],
      [sLbl('  ↳ Pequenas Vendas', true),  sMon(smallSalesRevenue, true)],
      [mt(), mt()],
      [sSecCell('DEDUÇÕES'), sSecBg()],
      [sLbl('Total Deduzido'),                  sMon(consolidadoCusto)],
      [sLbl('  ↳ Taxas de Cartão', true),       sMon(dreCardFees, true)],
      [sLbl('  ↳ Custo Produtos', true),        sMon(dreCustoProd, true)],
      [sLbl('  ↳ Custo Entregas', true),        sMon(dreCustoEntr, true)],
      [sLbl('  ↳ Ads + Operacional', true),     sMon(adSpend + operationalCosts, true)],
      [mt(), mt()],
      [sSecCell('RESULTADO'), sSecBg()],
      [sLbl('Lucro Total da Empresa'),           sResultMon(consolidadoLucro)],
      [sLbl('Margem Consolidada'),               sPct(margemConsolidada)],
      [sLbl('  ↳ Lucro Smartwatches', true),    sMon(lucroSmartwatch, true)],
      [sLbl('  ↳ Lucro Pequenas Vendas', true), sMon(smallSalesProfit, true)],
    ], [40, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]), 'Resultado Consolidado');

    // ── Aba 4: DRE ───────────────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, mkWs([
      [sTitleCell(`Triumph Store — DRE — ${period}`), sTitleBg()],
      [mt(), mt()],
      [sLbl('Receita Bruta'),                                           sMon(consolidadoBruto)],
      [sLbl(`  ↳ Smartwatches (${sales.length}v)`, true),              sMon(totalBruto, true)],
      [sLbl(`  ↳ Pequenas Vendas (${smallSales.length}v)`, true),      sMon(smallSalesRevenue, true)],
      [sLbl('(−) Taxas de Cartão'),                                     sMon(-dreCardFees)],
      sSecRow('= Receita Líquida', dreRecLiq),
      [mt(), mt()],
      [sLbl('(−) Custo dos Produtos'),                                  sMon(-dreCustoProd)],
      [sLbl(`(−) Embalagens (${swCount}un × R$2,00)`),                 sMon(-custoEmbalagens)],
      sSecRow('= Lucro Bruto', dreLucroBruto),
      [mt(), mt()],
      [sLbl('(−) Custo de Entregas'),                                   sMon(-dreCustoEntr)],
      [sLbl('(−) Investimento em Ads'),                                sMon(-adSpend)],
      [sLbl('(−) Custos Operacionais'),                                sMon(-operationalCosts)],
      [mt(), mt()],
      sEbitRow(consolidadoLucro),
      [sLbl('Margem sobre Receita Bruta'),                              sPct(dreMargemEbit)],
    ], [42, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]), 'DRE');

    // ── Aba 5: Modelos ───────────────────────────────────────────────────────
    const modelDataRows = topModels.map(([model, qty], i) => {
      const fin = modelFinancialMap.get(model);
      const lb  = fin && fin.qty > 0 ? fin.lucroBruto / fin.qty : 0;
      const ll  = lb - fixedCostPerUnit;
      const alt = i % 2 === 1;
      return [sNum(i + 1, alt), sLbl(model, alt), sNum(qty, alt), sMon(lb, alt), sMon(ll, alt)];
    });
    XLSX.utils.book_append_sheet(wb, mkWs([
      [sTitleCell(`Triumph Store — Modelos Mais Vendidos — ${period}`), sTitleBg(), sTitleBg(), sTitleBg(), sTitleBg()],
      [mt(), mt(), mt(), mt(), mt()],
      [sColHead('#'), sColHead('Modelo'), sColHead('Qtd'), sColHead('Lucro Bruto/un'), sColHead('Lucro Líquido/un')],
      ...modelDataRows,
      [mt(), mt(), mt(), mt(), mt()],
      [
        mt(),
        mk('Custo fixo/un (Ads + Op + Emb ÷ SW)', { font: { bold: true, color: { rgb: '6B7280' } }, border: bd }),
        mt(),
        sMon(fixedCostPerUnit),
        mt(),
      ],
    ], [5, 45, 8, 18, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]), 'Modelos');

    XLSX.writeFile(wb, fileName);
  };

  if (loading) return <div className="p-8 text-white flex items-center gap-2"><BarChart3 className="animate-pulse" /> Carregando...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 size={32} className="text-orange-500" /> Resumo Mensal
          </h1>
          <p className="text-gray-400 text-sm mt-1">Panorama completo da empresa</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-400 text-sm">Mês:</span>
            {getMonthOptions().map(opt => {
              const isActive = opt.year === selected.year && opt.month === selected.month;
              return (
                <button key={`${opt.year}-${opt.month}`} onClick={() => setSelected(opt)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {MONTHS[opt.month - 1]} {opt.year}
                </button>
              );
            })}
          </div>
          <button
            onClick={exportToExcel}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <FileDown size={16} />
            Exportar Excel
          </button>
        </div>
      </div>

      {sales.length === 0 && smallSales.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-16 text-center">
          <BarChart3 size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Nenhuma venda em {MONTHS[selected.month - 1]} {selected.year}</p>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════
              BLOCO 1 — SMARTWATCHES
          ══════════════════════════════════════════════════════════════ */}
          <div className="bg-gray-800 rounded-xl border border-orange-500/40 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-700 bg-orange-500/5">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-orange-400" />
                <h2 className="text-lg font-bold text-white">Smartwatches</h2>
                <span className="ml-2 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">
                  {sales.length} venda{sales.length !== 1 ? 's' : ''} · {swCount} un.
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">Vendas normais — inclui faturamento, custos, ads e métricas de marketing</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Receitas */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Receitas</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard label="Faturamento Bruto"     value={totalBruto}   color="green"  icon={TrendingUp} />
                  <MetricCard label="Líquido Recebido"      value={totalLiquido} color="green"  icon={DollarSign}
                    subtitle={`Taxa cartão: ${fmt(totalTaxaCartao)}`} />
                  <MetricCard label="Total de Vendas"       value={sales.length} color="blue"   icon={ShoppingCart} isCount
                    subtitle={swCount > 0 ? `${swCount} smartwatches` : undefined} />
                  <MetricCard label="Ticket Médio"
                    value={sales.length > 0 ? totalBruto / sales.length : 0}
                    color="orange" icon={TrendingUp} subtitle="Faturamento ÷ vendas" />
                </div>
              </div>

              {/* Custos */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Custos</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <MetricCard label="Custo dos Produtos"   value={totalCustoProdutos}  color="red" icon={Package}   negative />
                  <MetricCard label="Embalagens"           value={custoEmbalagens}     color="red" icon={Package}   negative
                    subtitle={`${swCount} un. × R$2,00`} />
                  <MetricCard label="Custo de Entregas"    value={totalCustoEntregas}  color="red" icon={Truck}     negative
                    subtitle={`Motoboy: ${fmt(totalMotoboyDeliveries)} | Correios: ${fmt(totalCorreiosDeliveries)} | Avulsos: ${fmt(motoboyExtras)}`} />
                  <MetricCard label="Investimento em Ads"  value={adSpend}             color="red" icon={BarChart3} negative />
                  <MetricCard label="Custos Operacionais"  value={operationalCosts}    color="red" icon={DollarSign} negative />
                </div>
              </div>

              {/* Métricas de marketing */}
              {adSpend > 0 && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Métricas de Marketing</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <RatingCard label="ROAS" value={roas !== null ? `${roas.toFixed(2)}x` : '—'}
                      subtitle="Faturamento ÷ ads" config={roas !== null ? getRoasConfig(roas) : null} icon={Target} />
                    <RatingCard label="ROI"  value={roi !== null ? `${roi.toFixed(0)}%` : '—'}
                      subtitle="Lucro ÷ ads"        config={roi !== null ? getRoiConfig(roi) : null}   icon={TrendingUp} />
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <ShoppingCart size={15} className="text-orange-400" />
                        <p className="text-gray-400 text-xs">CPV</p>
                      </div>
                      <div className="mb-3">
                        <p className="text-gray-500 text-xs mb-0.5">CPV / Venda</p>
                        {(() => { const cfg = cpv !== null ? getCpvConfig(cpv) : null; return (<><p className={`text-lg font-bold ${cfg?.color ?? 'text-gray-500'}`}>{cpv !== null ? fmt(cpv) : '—'}</p>{cfg?.label && <p className={`text-xs mt-0.5 font-medium ${cfg.color}`}>{cfg.label}</p>}</>); })()}
                        <p className="text-gray-500 text-xs mt-1">Ads ÷ vendas</p>
                      </div>
                      <div className="border-t border-gray-700 pt-2">
                        <p className="text-gray-500 text-xs mb-0.5">CPV / Smartwatch</p>
                        {(() => { const cfg = cpvSw !== null ? getCpvConfig(cpvSw) : null; return (<><p className={`text-lg font-bold ${cfg?.color ?? 'text-gray-500'}`}>{cpvSw !== null ? fmt(cpvSw) : '—'}</p>{cfg?.label && <p className={`text-xs mt-0.5 font-medium ${cfg.color}`}>{cfg.label}</p>}</>); })()}
                        <p className="text-gray-500 text-xs mt-1">Ads ÷ smartwatches</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Resultado smartwatches */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Lucro Smartwatches</p>
                    <p className={`text-4xl font-bold ${lucroSmartwatch >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(lucroSmartwatch)}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Margem: <span className={lucroSmartwatch >= 0 ? 'text-green-400' : 'text-red-400'}>{margemSmartwatch.toFixed(1)}%</span>
                    </p>
                  </div>
                  <div className="text-right space-y-1 text-sm min-w-56">
                    <PLRow label="Líquido recebido"  value={`+ ${fmt(totalLiquido)}`}        color="text-green-400" />
                    <PLRow label="Custo produtos"    value={`− ${fmt(totalCustoProdutos)}`}   color="text-red-400" />
                    <PLRow label="Embalagens"        value={`− ${fmt(custoEmbalagens)}`}      color="text-red-400" />
                    <PLRow label="Custo entregas"    value={`− ${fmt(totalCustoEntregas)}`}   color="text-red-400" />
                    <PLRow label="Ads"               value={`− ${fmt(adSpend)}`}              color="text-red-400" />
                    <PLRow label="Operacional"       value={`− ${fmt(operationalCosts)}`}     color="text-red-400" />
                    <div className="border-t border-gray-700 pt-1">
                      <PLRow label="Lucro" value={fmt(lucroSmartwatch)}
                        color={lucroSmartwatch >= 0 ? 'text-green-400' : 'text-red-400'} bold />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              BLOCO 2 — PEQUENAS VENDAS
          ══════════════════════════════════════════════════════════════ */}
          <div className="bg-gray-800 rounded-xl border border-purple-500/40 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-700 bg-purple-500/5">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} className="text-purple-400" />
                <h2 className="text-lg font-bold text-white">Pequenas Vendas</h2>
                <span className="ml-2 text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                  {smallSales.length} venda{smallSales.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">Acessórios e vendas avulsas — sem métricas de ads ou ROI</p>
            </div>

            <div className="p-6">
              {smallSales.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma pequena venda neste mês.</p>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard label="Faturamento Bruto"  value={smallSalesRevenue}      color="green"  icon={TrendingUp} />
                    <MetricCard label="Líquido Recebido"   value={smallSalesNet}           color="green"  icon={DollarSign}
                      subtitle={smallSalesCardFees > 0 ? `Taxas: ${fmt(smallSalesCardFees)}` : 'Sem taxas de cartão'} />
                    <MetricCard label="Custo Produtos"     value={smallSalesCost}          color="red"    icon={Package}   negative />
                    <MetricCard label="Custo Entregas"     value={smallSalesDeliveryCost}  color="red"    icon={Truck}     negative />
                    <MetricCard label="Nº de Vendas"       value={smallSales.length}       color="blue"   icon={ShoppingCart} isCount />
                  </div>

                  <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div>
                        <p className="text-gray-400 text-sm mb-1">Lucro Pequenas Vendas</p>
                        <p className={`text-3xl font-bold ${smallSalesProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmt(smallSalesProfit)}
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                          Margem: <span className={smallSalesProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{margemPV.toFixed(1)}%</span>
                        </p>
                      </div>
                      <div className="text-right space-y-1 text-sm min-w-56">
                        <PLRow label="Líquido recebido" value={`+ ${fmt(smallSalesNet)}`}           color="text-green-400" />
                        <PLRow label="Custo produtos"   value={`− ${fmt(smallSalesCost)}`}          color="text-red-400" />
                        {smallSalesDeliveryCost > 0 && (
                          <PLRow label="Custo entregas" value={`− ${fmt(smallSalesDeliveryCost)}`}  color="text-red-400" />
                        )}
                        <div className="border-t border-gray-700 pt-1">
                          <PLRow label="Lucro" value={fmt(smallSalesProfit)}
                            color={smallSalesProfit >= 0 ? 'text-green-400' : 'text-red-400'} bold />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              BLOCO 3 — RESULTADO CONSOLIDADO
          ══════════════════════════════════════════════════════════════ */}
          <div className="bg-gray-800 rounded-xl border border-orange-500/60 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-700 bg-orange-500/10">
              <div className="flex items-center gap-2">
                <Zap size={20} className="text-orange-400" />
                <h2 className="text-lg font-bold text-white">Resultado Consolidado</h2>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">
                Smartwatches + Pequenas Vendas — {MONTHS[selected.month - 1]} {selected.year}
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-2">Faturamento Total (Bruto)</p>
                  <p className="text-3xl font-bold text-white">{fmt(consolidadoBruto)}</p>
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>Smartwatches</span><span className="text-gray-400">{fmt(totalBruto)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Peq. Vendas</span><span className="text-gray-400">{fmt(smallSalesRevenue)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-2">Total Deduzido</p>
                  <p className="text-3xl font-bold text-red-400">{fmt(consolidadoCusto)}</p>
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>Taxas cartão</span>
                      <span>{fmt(totalTaxaCartao + smallSalesCardFees)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Produtos</span>
                      <span>{fmt(totalCustoProdutos + smallSalesCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Entregas</span>
                      <span>{fmt(totalCustoEntregas + smallSalesDeliveryCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ads + Operacional</span>
                      <span>{fmt(adSpend + operationalCosts)}</span>
                    </div>
                  </div>
                </div>

                <div className={`rounded-xl p-5 border-2 ${consolidadoLucro >= 0 ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
                  <p className="text-gray-400 text-xs mb-2">Lucro Total da Empresa</p>
                  <p className={`text-3xl font-bold ${consolidadoLucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(consolidadoLucro)}
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    Margem: <span className={consolidadoLucro >= 0 ? 'text-green-400' : 'text-red-400'}>{margemConsolidada.toFixed(1)}%</span>
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>Smartwatches</span>
                      <span className={lucroSmartwatch >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(lucroSmartwatch)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Peq. Vendas</span>
                      <span className={smallSalesProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(smallSalesProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              BLOCO 4 — DRE
          ══════════════════════════════════════════════════════════════ */}
          {(() => {
            const totalCardFees    = totalTaxaCartao + smallSalesCardFees;
            const receitaLiquida   = consolidadoBruto - totalCardFees;
            const custoProdutos    = totalCustoProdutos + smallSalesCost;
            const lucroBruto       = receitaLiquida - custoProdutos - custoEmbalagens;
            const custoEntregas    = totalCustoEntregas + smallSalesDeliveryCost;
            const lucroOperacional = consolidadoLucro;
            const margemEbit       = consolidadoBruto > 0 ? (lucroOperacional / consolidadoBruto) * 100 : 0;
            const R = (n: number) =>
              `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            const rowBase = 'flex items-baseline justify-between py-2 px-3';
            const rowEven = `${rowBase} bg-gray-900/25 rounded`;

            return (
              <div className="bg-gray-800 rounded-xl border border-blue-500/40 overflow-hidden mb-6">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-700 bg-blue-500/5">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-400" />
                    <h2 className="text-lg font-bold text-white">DRE — Demonstrativo de Resultado</h2>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Cascata financeira consolidada · {MONTHS[selected.month - 1]} {selected.year}
                  </p>
                </div>

                <div className="p-6">
                  <div style={{ maxWidth: 680 }}>

                    {/* ── Receita Bruta ──────────────────────────────── */}
                    <div className={rowBase}>
                      <span className="text-gray-100 font-semibold text-sm">Receita Bruta</span>
                      <span className="text-gray-100 font-semibold text-sm font-mono">{R(consolidadoBruto)}</span>
                    </div>
                    <div className={`${rowEven} pl-9`}>
                      <span className="text-gray-400 text-xs">└ Smartwatches ({sales.length} venda{sales.length !== 1 ? 's' : ''})</span>
                      <span className="text-gray-400 text-xs font-mono">{R(totalBruto)}</span>
                    </div>
                    {smallSalesRevenue > 0 && (
                      <div className={`${rowBase} pl-9`}>
                        <span className="text-gray-400 text-xs">└ Pequenas Vendas ({smallSales.length} venda{smallSales.length !== 1 ? 's' : ''})</span>
                        <span className="text-gray-400 text-xs font-mono">{R(smallSalesRevenue)}</span>
                      </div>
                    )}

                    {/* (-) Taxas de Cartão */}
                    <div className={`${rowEven} mt-1`}>
                      <span className="text-red-400 text-sm">(−) Taxas de Cartão</span>
                      <span className="text-red-400 text-sm font-mono">({R(totalCardFees)})</span>
                    </div>

                    {/* = Receita Líquida */}
                    <div className="border-t border-gray-600 my-2" />
                    <div className={`${rowBase} bg-gray-900/50 rounded`}>
                      <span className="text-green-400 font-semibold text-sm">= Receita Líquida</span>
                      <span className="text-green-400 font-semibold text-sm font-mono">{R(receitaLiquida)}</span>
                    </div>

                    {/* (-) Custo dos Produtos */}
                    <div className={`${rowEven} mt-1`}>
                      <span className="text-red-400 text-sm">(−) Custo dos Produtos</span>
                      <span className="text-red-400 text-sm font-mono">({R(custoProdutos)})</span>
                    </div>
                    {/* (-) Embalagens */}
                    <div className={rowBase}>
                      <span className="text-red-400 text-sm">(−) Embalagens <span className="text-xs text-gray-500 ml-1">{swCount} un. × R$2,00</span></span>
                      <span className="text-red-400 text-sm font-mono">({R(custoEmbalagens)})</span>
                    </div>

                    {/* = Lucro Bruto */}
                    <div className="border-t border-gray-600 my-2" />
                    <div className={rowBase}>
                      <span className={`text-sm font-semibold ${lucroBruto >= 0 ? 'text-green-400' : 'text-red-400'}`}>= Lucro Bruto</span>
                      <span className={`text-sm font-semibold font-mono ${lucroBruto >= 0 ? 'text-green-400' : 'text-red-400'}`}>{R(lucroBruto)}</span>
                    </div>

                    {/* Deduções operacionais */}
                    <div className={`${rowEven} mt-1`}>
                      <span className="text-red-400 text-sm">(−) Custo de Entregas</span>
                      <span className="text-red-400 text-sm font-mono">({R(custoEntregas)})</span>
                    </div>
                    <div className={rowBase}>
                      <span className="text-red-400 text-sm">(−) Investimento em Ads</span>
                      <span className="text-red-400 text-sm font-mono">({R(adSpend)})</span>
                    </div>
                    <div className={rowEven}>
                      <span className="text-red-400 text-sm">(−) Custos Operacionais</span>
                      <span className="text-red-400 text-sm font-mono">({R(operationalCosts)})</span>
                    </div>

                    {/* Linha dupla antes do resultado final */}
                    <div style={{ borderTop: '3px double #4b5563', margin: '14px 0 10px' }} />

                    {/* = Lucro Operacional (EBIT) */}
                    <div className={`rounded-xl p-5 border-2 ${lucroOperacional >= 0 ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <span className="text-white font-bold text-sm">= Lucro Operacional (EBIT)</span>
                        <span className={`font-bold text-3xl font-mono ${lucroOperacional >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {R(lucroOperacional)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/60">
                        <span className="text-gray-400 text-xs">Margem sobre Receita Bruta</span>
                        <span className={`text-base font-bold ${margemEbit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {margemEbit.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Canais e Cidades ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Truck size={18} className="text-orange-500" /> Canais de Venda
                </h2>
                <p className="text-gray-500 text-xs mt-0.5">Apenas smartwatches</p>
              </div>
              <div className="p-6 space-y-4">
                {canais.map(canal => {
                  const pct = sales.length > 0 ? (canal.count / sales.length) * 100 : 0;
                  const Icon = canal.icon;
                  return (
                    <div key={canal.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={canal.color} />
                          <span className="text-white text-sm font-medium">{canal.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white text-sm font-bold">{canal.count} vendas</span>
                          <span className="text-gray-400 text-xs ml-2">{fmt(canal.value)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-gray-500 text-xs mt-1">{pct.toFixed(1)}% das vendas</p>
                    </div>
                  );
                })}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Formas de Pagamento</p>
                  <div className="space-y-2">
                    {paymentMethods.map(([method, count]) => (
                      <div key={method} className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">{method}</span>
                        <span className="text-white text-sm font-semibold">{count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cidades */}
            <div className="space-y-6">
              {/* Motoboy */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MapPin size={18} className="text-orange-500" /> Top Cidades — Motoboy
                  </h2>
                  <p className="text-gray-500 text-xs mt-0.5">Apenas smartwatches</p>
                </div>
                <div className="p-6 space-y-3">
                  {cidadesMotoboy.length === 0 ? (
                    <p className="text-gray-400 text-sm">Nenhuma entrega no período</p>
                  ) : cidadesMotoboy.map((c, i) => {
                    const pct = totalMotoboy > 0 ? (c.count / totalMotoboy) * 100 : 0;
                    const isExpanded = expandedCity?.type === 'motoboy' && expandedCity?.city === c.city;
                    const neighborhoods = isExpanded ? (() => {
                      const nbMap = new Map<string, number>();
                      sales.filter(s => s.delivery_type === 'motoboy' && (s.city || 'Não informado') === c.city)
                        .forEach(s => { const nb = s.neighborhood || 'Não informado'; nbMap.set(nb, (nbMap.get(nb) || 0) + 1); });
                      return Array.from(nbMap.entries()).map(([neighborhood, count]) => ({ neighborhood, count })).sort((a, b) => b.count - a.count);
                    })() : [];
                    return (
                      <div key={c.city}>
                        <button onClick={() => setExpandedCity(isExpanded ? null : { type: 'motoboy', city: c.city })} className="w-full text-left">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                                #{i + 1}
                              </span>
                              <span className="text-white text-sm">{c.city}</span>
                              <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-white text-sm font-bold">{c.count}x</span>
                              <span className="text-gray-400 text-xs ml-2">{fmt(c.value)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                        {isExpanded && neighborhoods.length > 0 && (
                          <div className="mt-2 ml-7 space-y-1">
                            {neighborhoods.map(nb => (
                              <div key={nb.neighborhood} className="flex justify-between items-center text-xs py-0.5">
                                <span className="text-gray-400">{nb.neighborhood}</span>
                                <span className="text-gray-300 font-medium">{nb.count}x</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Correios */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MapPin size={18} className="text-orange-500" /> Top Cidades — Correios
                  </h2>
                  <p className="text-gray-500 text-xs mt-0.5">Apenas smartwatches</p>
                </div>
                <div className="p-6 space-y-3">
                  {cidadesCorreios.length === 0 ? (
                    <p className="text-gray-400 text-sm">Nenhuma entrega no período</p>
                  ) : cidadesCorreios.map((c, i) => {
                    const pct = totalCorreios > 0 ? (c.count / totalCorreios) * 100 : 0;
                    const isExpanded = expandedCity?.type === 'correios' && expandedCity?.city === c.city;
                    const neighborhoods = isExpanded ? (() => {
                      const nbMap = new Map<string, number>();
                      sales.filter(s => s.delivery_type === 'correios' && (s.city || 'Não informado') === c.city)
                        .forEach(s => { const nb = s.neighborhood || 'Não informado'; nbMap.set(nb, (nbMap.get(nb) || 0) + 1); });
                      return Array.from(nbMap.entries()).map(([neighborhood, count]) => ({ neighborhood, count })).sort((a, b) => b.count - a.count);
                    })() : [];
                    return (
                      <div key={c.city}>
                        <button onClick={() => setExpandedCity(isExpanded ? null : { type: 'correios', city: c.city })} className="w-full text-left">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                                #{i + 1}
                              </span>
                              <span className="text-white text-sm">{c.city}</span>
                              <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-white text-sm font-bold">{c.count}x</span>
                              <span className="text-gray-400 text-xs ml-2">{fmt(c.value)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                        {isExpanded && neighborhoods.length > 0 && (
                          <div className="mt-2 ml-7 space-y-1">
                            {neighborhoods.map(nb => (
                              <div key={nb.neighborhood} className="flex justify-between items-center text-xs py-0.5">
                                <span className="text-gray-400">{nb.neighborhood}</span>
                                <span className="text-gray-300 font-medium">{nb.count}x</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Loja Física */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MapPin size={18} className="text-orange-500" /> Top Cidades — Loja Física
                  </h2>
                  <p className="text-gray-500 text-xs mt-0.5">Apenas smartwatches</p>
                </div>
                <div className="p-6 space-y-3">
                  {cidadesLoja.length === 0 ? (
                    <p className="text-gray-400 text-sm">Nenhuma venda na loja no período</p>
                  ) : cidadesLoja.map((c, i) => {
                    const pct = totalLojaFisica > 0 ? (c.count / totalLojaFisica) * 100 : 0;
                    const isExpanded = expandedCity?.type === 'loja_fisica' && expandedCity?.city === c.city;
                    const neighborhoods = isExpanded ? (() => {
                      const nbMap = new Map<string, number>();
                      sales.filter(s => s.delivery_type === 'loja_fisica' && (s.city || 'Não informado') === c.city)
                        .forEach(s => { const nb = s.neighborhood || 'Não informado'; nbMap.set(nb, (nbMap.get(nb) || 0) + 1); });
                      return Array.from(nbMap.entries()).map(([neighborhood, count]) => ({ neighborhood, count })).sort((a, b) => b.count - a.count);
                    })() : [];
                    return (
                      <div key={c.city}>
                        <button onClick={() => setExpandedCity(isExpanded ? null : { type: 'loja_fisica', city: c.city })} className="w-full text-left">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                                #{i + 1}
                              </span>
                              <span className="text-white text-sm">{c.city}</span>
                              <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-white text-sm font-bold">{c.count}x</span>
                              <span className="text-gray-400 text-xs ml-2">{fmt(c.value)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                        {isExpanded && neighborhoods.length > 0 && (
                          <div className="mt-2 ml-7 space-y-1">
                            {neighborhoods.map(nb => (
                              <div key={nb.neighborhood} className="flex justify-between items-center text-xs py-0.5">
                                <span className="text-gray-400">{nb.neighborhood}</span>
                                <span className="text-gray-300 font-medium">{nb.count}x</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Produtos mais vendidos ───────────────────────────────────── */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Star size={18} className="text-orange-500" /> Modelos Mais Vendidos
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">Apenas smartwatches</p>
            </div>
            <div className="p-6 space-y-3">
              {topModels.length === 0 ? (
                <p className="text-gray-400 text-sm">Nenhum dado de produto disponível</p>
              ) : (() => {
                const total = topModels.reduce((s, [, q]) => s + q, 0);
                return (
                  <>
                    <div className="flex items-center justify-between mb-1 pl-7 text-xs text-gray-500">
                      <span className="flex-1">Modelo</span>
                      <div className="flex gap-4 text-right">
                        <span className="w-14">Qtd</span>
                        <span className="w-24">Lucro Bruto/un</span>
                        <span className="w-24">Lucro Líquido/un</span>
                      </div>
                    </div>
                    {topModels.map(([model, qty], i) => {
                      const pct = total > 0 ? (qty / total) * 100 : 0;
                      const fin = modelFinancialMap.get(model);
                      const lucroBrutoPerUn = fin && fin.qty > 0 ? fin.lucroBruto / fin.qty : 0;
                      const lucroLiquidoPerUn = lucroBrutoPerUn - fixedCostPerUnit;
                      return (
                        <div key={model}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                                #{i + 1}
                              </span>
                              <span className="text-white text-sm truncate">{model}</span>
                            </div>
                            <div className="flex items-center gap-4 text-right flex-shrink-0">
                              <span className="text-orange-400 text-sm font-bold w-14 text-right">{qty} un.</span>
                              <span className={`text-sm font-bold w-24 text-right font-mono ${lucroBrutoPerUn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmt(lucroBrutoPerUn)}
                              </span>
                              <span className={`text-sm font-bold w-24 text-right font-mono ${lucroLiquidoPerUn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmt(lucroLiquidoPerUn)}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function MetricCard({ label, value, color, icon: Icon, negative, subtitle, isCount }: {
  label: string; value: number; color: string; icon: React.ElementType;
  negative?: boolean; subtitle?: string; isCount?: boolean;
}) {
  const colors: Record<string, string> = {
    green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400',
  };
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={colors[color]} />
        <p className="text-gray-400 text-xs">{label}</p>
      </div>
      <p className={`text-xl font-bold ${colors[color]}`}>
        {negative && '− '}
        {isCount ? value : `R$ ${value.toFixed(2)}`}
      </p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}

function RatingCard({ label, value, subtitle, config, icon: Icon }: {
  label: string; value: string; subtitle: string;
  config: { color: string; label: string } | null;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-orange-400" />
        <p className="text-gray-400 text-xs">{label}</p>
      </div>
      <p className={`text-xl font-bold ${config?.color ?? 'text-gray-500'}`}>{value}</p>
      {config?.label && <p className={`text-xs mt-0.5 font-medium ${config.color}`}>{config.label}</p>}
      <p className="text-gray-500 text-xs mt-1">{subtitle}</p>
    </div>
  );
}

function PLRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${bold ? 'text-white' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}
