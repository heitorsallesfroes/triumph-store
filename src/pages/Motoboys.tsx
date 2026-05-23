import { useEffect, useState } from 'react';
import { supabase, Motoboy, MotoboyStats } from '../lib/supabase';
import { getTodayInBrazil, getYesterdayInBrazil, getLastMonthRangeInBrazil, getWeekRangeInBrazil } from '../lib/dateUtils';
import { Plus, Pencil, Trash2, X, Bike, TrendingUp, Trophy, DollarSign, Calendar, PlusCircle } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ptBR } from 'date-fns/locale';

type TimePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'total' | 'custom';

interface CustomStats {
  id: string;
  name: string;
  deliveries: number;
  earnings: number;
  extraPayments: number;
}

interface ExtraPayment {
  id: string;
  motoboy_id: string;
  date: string;
  amount: number;
  description: string;
}

export default function Motoboys() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [stats, setStats] = useState<MotoboyStats[]>([]);
  const [customStats, setCustomStats] = useState<CustomStats[]>([]);
  const [todayStats, setTodayStats] = useState<CustomStats[]>([]);
  const [yesterdayStats, setYesterdayStats] = useState<CustomStats[]>([]);
  const [weekStats, setWeekStats] = useState<CustomStats[]>([]);
  const [monthStats, setMonthStats] = useState<CustomStats[]>([]);
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [editingMotoboy, setEditingMotoboy] = useState<Motoboy | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('today');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({ name: '' });
  const [paymentData, setPaymentData] = useState({ date: new Date(), amount: '', description: '' });
  const [formularioModal, setFormularioModal] = useState<{ motoboyId: string; motoboyName: string } | null>(null);
  const [formularioDate, setFormularioDate] = useState(getTodayInBrazil());
  const [formularioTexto, setFormularioTexto] = useState('');
  const [formularioLoading, setFormularioLoading] = useState(false);
  const [formularioCopiado, setFormularioCopiado] = useState(false);
  const [lancarModal, setLancarModal] = useState<{ motoboyId: string; motoboyName: string } | null>(null);
  const [lancarDate, setLancarDate] = useState(getTodayInBrazil());
  const [lancarTexto, setLancarTexto] = useState('');
  const [lancarLoading, setLancarLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (selectedPeriod === 'custom' && startDate) loadCustomStats();
  }, [startDate, endDate, selectedPeriod]);

  const toDateStr = (date: Date) => date.toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const [motoboysRes, statsRes, paymentsRes] = await Promise.all([
        supabase.from('motoboys').select('*').order('name', { ascending: true }),
        supabase.from('motoboy_stats').select('*'),
        supabase.from('motoboy_payments').select('*').order('date', { ascending: false }),
      ]);
      const motoboysList = motoboysRes.data || [];
      setMotoboys(motoboysList);
      setStats(statsRes.data || []);
      setExtraPayments(paymentsRes.data || []);
      loadTodayStats(motoboysList);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayStats = async (motoboysList?: Motoboy[]) => {
    const list = motoboysList || motoboys;
    try {
      const today = getTodayInBrazil();
      const { startUTC, endUTC } = getDateUTCRange(today);

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC)
          .lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC)
          .lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*').eq('date', today),
      ]);

      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });

      setTodayStats(list.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  };

  const loadYesterdayStats = async (motoboysList?: Motoboy[]) => {
    const list = motoboysList || motoboys;
    try {
      const yesterday = getYesterdayInBrazil();
      const today = getTodayInBrazil();
      const startUTC = yesterday + 'T03:00:00.000Z';
      const endUTC = today + 'T03:00:00.000Z';

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC)
          .lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC)
          .lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*').eq('date', yesterday),
      ]);

      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });

      setYesterdayStats(list.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) {
      console.error('Error loading yesterday stats:', error);
    }
  };

  const loadCustomStats = async () => {
    if (!startDate) return;
    try {
      const start = toDateStr(startDate);
      const end = endDate ? toDateStr(endDate) : start;
      const startUTC = start + 'T03:00:00.000Z';
      const endNextDay = new Date(end + 'T12:00:00');
      endNextDay.setDate(endNextDay.getDate() + 1);
      const endUTC = endNextDay.toISOString().split('T')[0] + 'T03:00:00.000Z';

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy').in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC).lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC).lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*')
          .gte('date', start).lte('date', end),
      ]);

      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });

      setCustomStats(motoboys.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) { console.error(error); }
  };

  const loadLastMonthStats = async () => {
    try {
      const { start, end } = getLastMonthRangeInBrazil();
      const startUTC = start + 'T03:00:00.000Z';
      const endNextDay = new Date(end + 'T12:00:00');
      endNextDay.setDate(endNextDay.getDate() + 1);
      const endUTC = endNextDay.toISOString().split('T')[0] + 'T03:00:00.000Z';

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy').in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC).lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC).lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*')
          .gte('date', start).lte('date', end),
      ]);
      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });
      setCustomStats(motoboys.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) { console.error(error); }
  };

  const loadWeekStats = async (motoboysList?: Motoboy[]) => {
    const list = motoboysList || motoboys;
    try {
      const { start: weekStart } = getWeekRangeInBrazil();
      const today = getTodayInBrazil();
      const startUTC = weekStart + 'T03:00:00.000Z';
      const { endUTC } = getDateUTCRange(today);

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy').in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC).lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC).lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*')
          .gte('date', weekStart).lte('date', today),
      ]);

      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });

      setWeekStats(list.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) { console.error('Error loading week stats:', error); }
  };

  const loadMonthStats = async (motoboysList?: Motoboy[]) => {
    const list = motoboysList || motoboys;
    try {
      const today = getTodayInBrazil();
      const [year, month] = today.split('-');
      const startStr = `${year}-${month}-01`;
      const startUTC = startStr + 'T03:00:00.000Z';
      const { endUTC } = getDateUTCRange(today);

      const [salesRes, smallSalesRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy').in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC).lt('finalized_at', endUTC),
        supabase.from('small_sales').select('motoboy_id, delivery_fee')
          .eq('delivery_type', 'motoboy')
          .not('motoboy_id', 'is', null)
          .gte('created_at', startUTC).lt('created_at', endUTC),
        supabase.from('motoboy_payments').select('*')
          .gte('date', startStr).lte('date', today),
      ]);

      const statsMap = new Map<string, { deliveries: number; earnings: number; extraPayments: number }>();
      [...(salesRes.data || []), ...(smallSalesRes.data || [])].forEach(sale => {
        if (sale.motoboy_id) {
          const cur = statsMap.get(sale.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
          statsMap.set(sale.motoboy_id, { ...cur, deliveries: cur.deliveries + 1, earnings: cur.earnings + (sale.delivery_fee || 0) });
        }
      });
      paymentsRes.data?.forEach(p => {
        const cur = statsMap.get(p.motoboy_id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        statsMap.set(p.motoboy_id, { ...cur, extraPayments: cur.extraPayments + Number(p.amount) });
      });

      setMonthStats(list.map(m => {
        const s = statsMap.get(m.id) || { deliveries: 0, earnings: 0, extraPayments: 0 };
        return { id: m.id, name: m.name, ...s };
      }));
    } catch (error) { console.error('Error loading month stats:', error); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMotoboy) {
        await supabase.from('motoboys').update({ name: formData.name }).eq('id', editingMotoboy.id);
      } else {
        await supabase.from('motoboys').insert([{ name: formData.name }]);
      }
      resetForm();
      loadData();
    } catch { alert('Erro ao salvar motoboy'); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPaymentForm) return;
    try {
      await supabase.from('motoboy_payments').insert([{
        motoboy_id: showPaymentForm,
        date: toDateStr(paymentData.date),
        amount: Number(paymentData.amount),
        description: paymentData.description,
      }]);
      setShowPaymentForm(null);
      setPaymentData({ date: new Date(), amount: '', description: '' });
      loadData();
      if (selectedPeriod === 'custom' && startDate) loadCustomStats();
    } catch { alert('Erro ao salvar pagamento'); }
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Excluir este pagamento?')) return;
    await supabase.from('motoboy_payments').delete().eq('id', id);
    loadData();
    if (selectedPeriod === 'custom' && startDate) loadCustomStats();
  };

  const handleEdit = (motoboy: Motoboy) => {
    setEditingMotoboy(motoboy);
    setFormData({ name: motoboy.name });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este motoboy?')) return;
    try {
      await supabase.from('motoboys').delete().eq('id', id);
      loadData();
    } catch { alert('Erro ao excluir motoboy'); }
  };

  const resetForm = () => { setFormData({ name: '' }); setEditingMotoboy(null); setShowForm(false); };

  const getDateUTCRange = (dateStr: string) => {
    const startUTC = dateStr + 'T03:00:00.000Z';
    const [year, month, day] = dateStr.split('-').map(Number);
    // Date.UTC é agnóstico de timezone — não depende do fuso do browser
    const nextStr = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().split('T')[0];
    return { startUTC, endUTC: nextStr + 'T03:00:00.000Z' };
  };

  const gerarFormulario = async (motoboyId: string, motoboyName: string, dateStr: string) => {
    setFormularioLoading(true);
    setFormularioTexto('');
    try {
      const { startUTC, endUTC } = getDateUTCRange(dateStr);
      const [salesRes, smallSalesRes] = await Promise.all([
        supabase.from('sales').select('neighborhood, city')
          .eq('motoboy_id', motoboyId)
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC)
          .lt('finalized_at', endUTC)
          .order('finalized_at', { ascending: true }),
        supabase.from('small_sales').select('description, city, neighborhood')
          .eq('motoboy_id', motoboyId)
          .eq('delivery_type', 'motoboy')
          .gte('created_at', startUTC)
          .lt('created_at', endUTC),
      ]);

      const [year, month, day] = dateStr.split('-');

      const byCidade = new Map<string, string[]>();
      for (const s of (salesRes.data || [])) {
        const cidade = s.city || '';
        const bairro = s.neighborhood || '';
        if (!byCidade.has(cidade)) byCidade.set(cidade, []);
        byCidade.get(cidade)!.push(bairro);
      }

      // Small_sales com cidade/bairro entram na seção da cidade correspondente
      const smallSalesWithAddr = (smallSalesRes.data || []).filter(s => s.city && s.neighborhood);
      const smallSalesNoAddr   = (smallSalesRes.data || []).filter(s => !s.city || !s.neighborhood);

      for (const s of smallSalesWithAddr) {
        const cidade = s.city!;
        const bairro = s.neighborhood!;
        if (!byCidade.has(cidade)) byCidade.set(cidade, []);
        byCidade.get(cidade)!.push(bairro);
      }

      const blocos = [...byCidade.entries()].map(([cidade, bairros]) =>
        `📍 ${cidade}\n${bairros.map(b => `- ${b}: `).join('\n')}`
      );

      // Small_sales sem endereço ficam na seção "Pequenas Vendas"
      const blocoSmall = smallSalesNoAddr.length > 0
        ? `📍 Pequenas Vendas\n${smallSalesNoAddr.map(s => `- ${s.description}: `).join('\n')}`
        : null;

      const texto = [
        `🛵 Entregas ${motoboyName}`,
        `📅 ${day}/${month}/${year}`,
        '',
        ...blocos.flatMap(b => [b, '']),
        ...(blocoSmall ? [blocoSmall, ''] : []),
        `💰 Total: R$`,
        `✅ Obrigado!`,
      ].join('\n');

      setFormularioTexto(texto);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar formulário');
    } finally {
      setFormularioLoading(false);
    }
  };

  const lancarValores = async (motoboyId: string, dateStr: string, texto: string) => {
    setLancarLoading(true);
    const SMALL_SALES_CITY = 'Pequenas Vendas';
    try {
      const { startUTC, endUTC } = getDateUTCRange(dateStr);

      const [salesRes, smallSalesRes] = await Promise.all([
        supabase.from('sales')
          .select('id, neighborhood, city, delivery_fee, total_cost, net_received, status')
          .eq('motoboy_id', motoboyId)
          .eq('delivery_type', 'motoboy')
          .in('status', ['finalizado', 'concluido'])
          .gte('finalized_at', startUTC)
          .lt('finalized_at', endUTC)
          .order('finalized_at', { ascending: true }),
        supabase.from('small_sales')
          .select('id, description, delivery_fee, city, neighborhood')
          .eq('motoboy_id', motoboyId)
          .eq('delivery_type', 'motoboy')
          .gte('created_at', startUTC)
          .lt('created_at', endUTC),
      ]);

      const salesList = salesRes.data || [];
      const smallSalesList = smallSalesRes.data || [];

      console.log('=== LANÇAR VALORES DEBUG ===');
      console.log(`motoboy_id: ${motoboyId}`);
      console.log(`Data solicitada: ${dateStr}`);
      console.log(`Intervalo sales (finalized_at): ${startUTC} → ${endUTC}`);
      console.log(`Intervalo small_sales (created_at): ${startUTC} → ${endUTC}`);
      if (salesRes.error) console.error('Erro na query sales:', salesRes.error);
      if (smallSalesRes.error) console.error('Erro na query small_sales:', smallSalesRes.error);
      console.log(`Vendas encontradas (${salesList.length}):`, salesList.map(s => ({
        id: s.id.slice(0, 8),
        city: s.city,
        neighborhood: s.neighborhood,
        delivery_fee: s.delivery_fee,
      })));
      console.log(`Pequenas vendas encontradas (${smallSalesList.length}):`, smallSalesList.map(s => ({
        id: s.id.slice(0, 8),
        description: s.description,
        city: s.city,
        neighborhood: s.neighborhood,
      })));

      // Parse grouped format:
      // city headers: any non-bullet, non-footer line (strips leading emoji)
      // delivery lines: start with "- " or "• " and contain ":"
      const skipPrefixes = ['🛵', '📅', '💰', '✅', '🙏', '☑'];
      const deliveryEntries: { bairro: string; cidade: string; valor: number }[] = [];
      let currentCity = '';

      for (const line of texto.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const bulletMatch = trimmed.match(/^[-•]\s+(.+)$/);
        if (bulletMatch && trimmed.includes(':')) {
          const withoutBullet = bulletMatch[1];
          const colonIdx = withoutBullet.lastIndexOf(':');
          if (colonIdx === -1) continue;
          const bairro = withoutBullet.substring(0, colonIdx).trim();
          const valor = parseFloat(withoutBullet.substring(colonIdx + 1).trim().replace(',', '.'));
          if (bairro && !isNaN(valor) && currentCity) {
            deliveryEntries.push({ bairro, cidade: currentCity, valor });
          }
          continue;
        }

        if (skipPrefixes.some(p => trimmed.startsWith(p))) continue;

        // Strip leading emoji characters to get city name
        const cityName = trimmed.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim();
        if (cityName) currentCity = cityName;
      }

      console.log('Entries parseadas:', deliveryEntries);

      const salesUpdates: { id: string; delivery_fee: number; total_cost: number; profit: number; status: string }[] = [];
      const smallUpdates: { id: string; delivery_fee: number }[] = [];
      const matchedSales = new Set<string>();
      const matchedSmall = new Set<string>();

      for (const { bairro, cidade, valor } of deliveryEntries) {
        if (cidade.toLowerCase() === SMALL_SALES_CITY.toLowerCase()) {
          // Pequenas vendas: match por description (uma entrada do form = uma venda por descrição)
          const ss = smallSalesList.find(s =>
            !matchedSmall.has(s.id) &&
            (s.description || '').toLowerCase() === bairro.toLowerCase()
          );
          console.log(`  [SMALL] desc="${bairro}" → ${ss ? `ENCONTRADO id=${ss.id.slice(0, 8)}` : 'NÃO ENCONTRADO'}`);
          if (ss) {
            matchedSmall.add(ss.id);
            smallUpdates.push({ id: ss.id, delivery_fee: valor });
          }
        } else {
          // Vendas regulares: todas as vendas do mesmo bairro/cidade recebem o mesmo valor
          const matchingSales = salesList.filter(s =>
            !matchedSales.has(s.id) &&
            (s.neighborhood || '').toLowerCase() === bairro.toLowerCase() &&
            (s.city || '').toLowerCase() === cidade.toLowerCase()
          );
          if (matchingSales.length > 0) {
            console.log(`  [SALE] bairro="${bairro}" cidade="${cidade}" → ${matchingSales.length} encontrada(s): ${matchingSales.map(s => s.id.slice(0, 8)).join(', ')}`);
            for (const sale of matchingSales) {
              matchedSales.add(sale.id);
              const newTotalCost = (sale.total_cost || 0) - (sale.delivery_fee || 0) + valor;
              const newProfit = (sale.net_received || 0) - newTotalCost;
              salesUpdates.push({ id: sale.id, delivery_fee: valor, total_cost: newTotalCost, profit: newProfit, status: sale.status });
            }
          } else {
            // Tenta small_sales com cidade/bairro preenchidos
            const matchingSmall = smallSalesList.filter(s =>
              !matchedSmall.has(s.id) &&
              s.city && s.neighborhood &&
              (s.neighborhood || '').toLowerCase() === bairro.toLowerCase() &&
              (s.city || '').toLowerCase() === cidade.toLowerCase()
            );
            console.log(`  [SMALL_ADDR] bairro="${bairro}" cidade="${cidade}" → ${matchingSmall.length > 0 ? `${matchingSmall.length} encontrada(s): ${matchingSmall.map(s => s.id.slice(0, 8)).join(', ')}` : 'NÃO ENCONTRADO'}`);
            for (const ss of matchingSmall) {
              matchedSmall.add(ss.id);
              smallUpdates.push({ id: ss.id, delivery_fee: valor });
            }
          }
        }
      }

      const totalUpdates = salesUpdates.length + smallUpdates.length;
      console.log(`Updates sales: ${salesUpdates.length}, small_sales: ${smallUpdates.length}`);
      console.log('=== FIM DEBUG ===');

      if (totalUpdates === 0) {
        alert('Nenhuma venda correspondente encontrada. Verifique os bairros e cidades.');
        return;
      }

      await Promise.all([
        ...salesUpdates.map(u =>
          supabase.from('sales').update({ delivery_fee: u.delivery_fee, total_cost: u.total_cost, profit: u.profit, status: u.status }).eq('id', u.id)
        ),
        ...smallUpdates.map(u =>
          supabase.from('small_sales').update({ delivery_fee: u.delivery_fee }).eq('id', u.id)
        ),
      ]);

      alert(`✅ ${totalUpdates} venda${totalUpdates !== 1 ? 's' : ''} atualizada${totalUpdates !== 1 ? 's' : ''} com sucesso!`);
      setLancarModal(null);
      setLancarTexto('');
    } catch (err) {
      console.error(err);
      alert('Erro ao lançar valores');
    } finally {
      setLancarLoading(false);
    }
  };

  const handlePeriodChange = (period: TimePeriod) => {
    setSelectedPeriod(period);
    if (period !== 'custom') { setStartDate(null); setEndDate(null); }
    if (period === 'today') loadTodayStats();
    if (period === 'yesterday') loadYesterdayStats();
    if (period === 'week') loadWeekStats();
    if (period === 'month') loadMonthStats();
    if (period === 'last_month') loadLastMonthStats();
  };

  const getSortedStats = () => {
    const byTotal = (a: CustomStats, b: CustomStats) => (b.earnings + b.extraPayments) - (a.earnings + a.extraPayments);
    if (selectedPeriod === 'custom' || selectedPeriod === 'last_month') return [...customStats].sort(byTotal);
    if (selectedPeriod === 'today') return [...todayStats].sort(byTotal);
    if (selectedPeriod === 'yesterday') return [...yesterdayStats].sort(byTotal);
    if (selectedPeriod === 'week') return [...weekStats].sort(byTotal);
    if (selectedPeriod === 'month') return [...monthStats].sort(byTotal);
    return [...stats].sort((a, b) => b.total_earnings - a.total_earnings);
  };

  const getDeliveriesForPeriod = (stat: MotoboyStats | CustomStats) => {
    if (['custom', 'last_month', 'today', 'yesterday', 'week', 'month'].includes(selectedPeriod))
      return (stat as CustomStats).deliveries;
    return (stat as MotoboyStats).total_deliveries;
  };

  const getEarningsForPeriod = (stat: MotoboyStats | CustomStats) => {
    if (['custom', 'last_month', 'today', 'yesterday', 'week', 'month'].includes(selectedPeriod))
      return (stat as CustomStats).earnings;
    return (stat as MotoboyStats).total_earnings;
  };

  const getExtraPaymentsForPeriod = (motoboyId: string) => {
    if (selectedPeriod === 'custom' || selectedPeriod === 'last_month')
      return customStats.find(s => s.id === motoboyId)?.extraPayments || 0;
    if (selectedPeriod === 'today')
      return todayStats.find(s => s.id === motoboyId)?.extraPayments || 0;
    if (selectedPeriod === 'yesterday')
      return yesterdayStats.find(s => s.id === motoboyId)?.extraPayments || 0;
    if (selectedPeriod === 'week')
      return weekStats.find(s => s.id === motoboyId)?.extraPayments || 0;
    if (selectedPeriod === 'month')
      return monthStats.find(s => s.id === motoboyId)?.extraPayments || 0;
    return extraPayments
      .filter(p => p.motoboy_id === motoboyId)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  };

  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const getPeriodLabel = () => {
    if (selectedPeriod === 'custom') {
      if (startDate && endDate) return `${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')}`;
      if (startDate) return startDate.toLocaleDateString('pt-BR');
      return 'Período Personalizado';
    }
    return selectedPeriod === 'today' ? 'Hoje' : selectedPeriod === 'yesterday' ? 'Ontem' : selectedPeriod === 'week' ? 'Esta Semana' : selectedPeriod === 'month' ? 'Este Mês' : selectedPeriod === 'last_month' ? 'Mês Anterior' : 'Total Geral';
  };

  if (loading) return <div className="p-8"><div className="">Carregando...</div></div>;

  const sortedStats = getSortedStats();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Bike size={32} className="text-orange-500" />
          <div>
            <h1 className="text-3xl font-bold">Motoboys</h1>
            <p className="text-gray-400 text-sm mt-1">Gerenciar pessoal de entrega</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
          <Plus size={20} /> Adicionar Motoboy
        </button>
      </div>

      {/* Filtro de Data */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Calendar size={18} className="text-orange-500" />
          <h3 className="text-base font-semibold">Filtro de Período</h3>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {(['today', 'yesterday', 'week', 'month', 'last_month', 'total', 'custom'] as TimePeriod[]).map(p => (
            <button key={p} onClick={() => handlePeriodChange(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedPeriod === p ? 'bg-orange-500' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {p === 'today' ? 'Hoje' : p === 'yesterday' ? 'Ontem' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : p === 'last_month' ? 'Mês Anterior' : p === 'total' ? 'Total' : 'Personalizado'}
            </button>
          ))}
          {selectedPeriod === 'custom' && (
            <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0">
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={new Date()}
                dateFormat="dd/MM/yyyy"
                locale={ptBR}
                placeholderText="Data início"
                className="bg-gray-700 rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-36 cursor-pointer"
              />
              <span className="text-gray-400 text-sm">até</span>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate || undefined}
                maxDate={new Date()}
                dateFormat="dd/MM/yyyy"
                locale={ptBR}
                placeholderText="Data fim"
                className="bg-gray-700 rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 text-sm w-36 cursor-pointer"
              />
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(null); setEndDate(null); }}
                  className="text-gray-400 text-sm underline">
                  Limpar
                </button>
              )}
            </div>
          )}
        </div>
        {selectedPeriod === 'custom' && startDate && (
          <div className="mt-3 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-orange-400 text-sm">Mostrando: {getPeriodLabel()}</p>
          </div>
        )}
      </div>

      {/* Modal Adicionar Motoboy */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{editingMotoboy ? 'Editar Motoboy' : 'Adicionar Motoboy'}</h2>
              <button onClick={resetForm} className="text-gray-400"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nome</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ name: e.target.value })}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-orange-500 px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
                  {editingMotoboy ? 'Atualizar' : 'Adicionar'}
                </button>
                <button type="button" onClick={resetForm} className="flex-1 bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pagamento Avulso */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Adicionar Pagamento Avulso</h2>
              <button onClick={() => setShowPaymentForm(null)} className="text-gray-400"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data</label>
                <DatePicker
                  selected={paymentData.date}
                  onChange={(date: Date | null) => setPaymentData({ ...paymentData, date: date || new Date() })}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  locale={ptBR}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Descrição</label>
                <input type="text" value={paymentData.description}
                  onChange={e => setPaymentData({ ...paymentData, description: e.target.value })}
                  placeholder="Ex: Troca de relógio na casa do cliente"
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={paymentData.amount}
                  onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-orange-500 px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
                  Adicionar
                </button>
                <button type="button" onClick={() => setShowPaymentForm(null)} className="flex-1 bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerar Formulário */}
      {formularioModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold">📋 Gerar Formulário — {formularioModal.motoboyName}</h2>
              <button onClick={() => setFormularioModal(null)} className="text-gray-400"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data</label>
                <input type="date" value={formularioDate}
                  onChange={e => { setFormularioDate(e.target.value); setFormularioTexto(''); }}
                  max={getTodayInBrazil()}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" />
              </div>
              <button
                onClick={() => gerarFormulario(formularioModal.motoboyId, formularioModal.motoboyName, formularioDate)}
                disabled={formularioLoading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors font-semibold">
                {formularioLoading ? 'Gerando...' : 'Gerar'}
              </button>
              {formularioTexto && (
                <>
                  <textarea readOnly value={formularioTexto} rows={8}
                    className="w-full bg-gray-900 rounded-lg px-3 py-2 border border-gray-600 text-sm font-mono resize-none focus:outline-none" />
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(formularioTexto); setFormularioCopiado(true); setTimeout(() => setFormularioCopiado(false), 2000); }}
                    className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors text-sm font-semibold">
                    {formularioCopiado ? '✅ Copiado!' : '📋 Copiar'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Lançar Valores */}
      {lancarModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold">💰 Lançar Valores — {lancarModal.motoboyName}</h2>
              <button onClick={() => { setLancarModal(null); setLancarTexto(''); }} className="text-gray-400"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data das entregas</label>
                <input type="date" value={lancarDate}
                  onChange={e => setLancarDate(e.target.value)}
                  max={getTodayInBrazil()}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Cole o formulário preenchido</label>
                <textarea
                  value={lancarTexto}
                  onChange={e => setLancarTexto(e.target.value)}
                  rows={10}
                  placeholder={'Entregas João - 24/04/2026\n\nCentro - Niterói: 20\nIcaraí - Niterói: 15'}
                  className="w-full bg-gray-900 rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm font-mono resize-none"
                />
              </div>
              <button
                onClick={() => lancarValores(lancarModal.motoboyId, lancarDate, lancarTexto)}
                disabled={lancarLoading || !lancarTexto.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors font-semibold">
                {lancarLoading ? 'Atualizando...' : 'Atualizar Valores'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de Motoboys */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-bold">Lista de Motoboys</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {motoboys.length === 0 ? (
                <tr><td colSpan={2} className="px-6 py-8 text-center text-gray-400">Nenhum motoboy ainda.</td></tr>
              ) : motoboys.map(motoboy => (
                <tr key={motoboy.id} className="hover:bg-gray-700/30">
                  <td className="px-6 py-4">{motoboy.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setShowPaymentForm(motoboy.id); setPaymentData({ date: new Date(), amount: '', description: '' }); }}
                        className="text-green-400 hover:text-green-300 flex items-center gap-1 text-xs">
                        <PlusCircle size={15} /> Pagamento
                      </button>
                      <button onClick={() => { setFormularioModal({ motoboyId: motoboy.id, motoboyName: motoboy.name }); setFormularioDate(getTodayInBrazil()); setFormularioTexto(''); }}
                        className="text-purple-400 hover:text-purple-300 text-xs whitespace-nowrap">
                        📋 Formulário
                      </button>
                      <button onClick={() => { setLancarModal({ motoboyId: motoboy.id, motoboyName: motoboy.name }); setLancarDate(formularioDate); setLancarTexto(''); }}
                        className="text-yellow-400 hover:text-yellow-300 text-xs whitespace-nowrap">
                        💰 Valores
                      </button>
                      <button onClick={() => handleEdit(motoboy)} className="text-blue-400 hover:text-blue-300"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(motoboy.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagamentos avulsos recentes */}
          {extraPayments.length > 0 && (
            <div className="border-t border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Pagamentos Avulsos Recentes</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {extraPayments.slice(0, 10).map(p => {
                  const motoboy = motoboys.find(m => m.id === p.motoboy_id);
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs font-medium">{motoboy?.name}</span>
                        <span className="text-gray-400 text-xs mx-2">•</span>
                        <span className="text-gray-400 text-xs">{p.description}</span>
                        <span className="text-gray-500 text-xs ml-2">({formatDate(p.date)})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-400 text-xs font-bold">R$ {Number(p.amount).toFixed(2)}</span>
                        <button onClick={() => handleDeletePayment(p.id)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ranking */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Trophy size={20} className="text-orange-500" /> Ranking de Desempenho
            </h2>
            {selectedPeriod !== 'custom' && (
              <div className="flex gap-2 mt-3">
                {(['today', 'yesterday', 'week', 'month', 'last_month', 'total'] as TimePeriod[]).map(p => (
                  <button key={p} onClick={() => handlePeriodChange(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPeriod === p ? 'bg-orange-500' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                    {p === 'today' ? 'Hoje' : p === 'yesterday' ? 'Ontem' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : p === 'last_month' ? 'Mês Ant.' : 'Total'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 max-h-[700px] overflow-y-auto space-y-3">
            {sortedStats.length === 0 ? (
              <div className="text-center text-gray-400 py-8">Sem dados de entrega ainda</div>
            ) : sortedStats.map((stat, index) => {
              const deliveries = getDeliveriesForPeriod(stat);
              const earnings = getEarningsForPeriod(stat);
              const extra = getExtraPaymentsForPeriod(stat.id);
              const total = earnings + extra;

              if (deliveries === 0 && extra === 0 && selectedPeriod !== 'total') return null;

              const motoboyStats = stat as MotoboyStats;

              return (
                <div key={stat.id} className="bg-gray-900 rounded-xl p-4 border border-gray-700 hover:border-orange-500/40 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-gray-600'}`}>
                        {index + 1}
                      </div>
                      <span className="font-semibold">{stat.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-xs">{getPeriodLabel()}</div>
                      <div className="text-green-400 text-lg font-bold">R$ {total.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">Entregas</div>
                      <div className="text-sm font-semibold">{deliveries}</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">Taxa entregas</div>
                      <div className="text-orange-400 text-sm font-semibold">R$ {earnings.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">Avulsos</div>
                      <div className="text-blue-400 text-sm font-semibold">R$ {extra.toFixed(2)}</div>
                    </div>
                  </div>

                  {selectedPeriod !== 'custom' && (
                    <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between items-center">
                      <div className="flex items-center gap-1 text-gray-400 text-xs">
                        <DollarSign size={11} /> Média por entrega
                      </div>
                      <span className="text-green-400 text-xs font-semibold">
                        R$ {(deliveries > 0 ? earnings / deliveries : motoboyStats.avg_delivery_value || 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {selectedPeriod === 'total' && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-400 flex items-center gap-1"><TrendingUp size={11} /> Total histórico</span>
                      <span className="font-semibold">{motoboyStats.total_deliveries} entregas • <span className="text-green-400">R$ {motoboyStats.total_earnings.toFixed(2)}</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}