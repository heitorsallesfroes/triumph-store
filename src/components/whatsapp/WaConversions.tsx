// Aba "Conversões (Facebook)": eventos enviados pela extensão (wa_conversion_events). Só leitura, paginado,
// com filtro por período e totais do período inteiro (sem o limite de 1000 linhas do Supabase).
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/resumoAnualCalc';
import { conversionTotals, eventKind, hasAd, linkedSaleLabel, maskPhone, periodBounds, type ConversionRow, type ConversionTotals, type LinkedSale } from '../../lib/waConversions';
import { btn, card, input, money, muted, ORANGE } from './shared';
import { SectionHeader, StatCard, fmtInt } from './ui';

const PAGE = 50;
const BASE_COLS = 'event_id,chat_id,contact_name,value,ad_id,ad_title,test,status,error,created_at';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Com a coluna event_name (2.6.0) e sale_id (2.10.5) se existirem; sem elas, as mesmas colunas de antes
async function selectCols(): Promise<string> {
  const [{ error }, { error: saleErr }] = await Promise.all([
    supabase.from('wa_conversion_events').select('event_name').limit(1),
    supabase.from('wa_conversion_events').select('sale_id').limit(1),
  ]);
  return `${BASE_COLS}${error ? '' : ',event_name'}${saleErr ? '' : ',sale_id'}`;
}

export default function WaConversions() {
  const today = new Date();
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)));
  const [end, setEnd] = useState(ymd(today));
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  const [sales, setSales] = useState<Record<string, LinkedSale>>({});
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<ConversionTotals | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { setPage(0); }, [start, end]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError('');
    (async () => {
      const { from, to } = periodBounds(start, end);
      const cols = await selectCols();
      const { data, error: e, count } = await supabase.from('wa_conversion_events').select(cols, { count: 'exact' })
        .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).order('event_id')
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (e) throw e;
      if (!alive) return;
      const pageRows = (data || []) as unknown as ConversionRow[];
      // 2.10.5: vendas do ERP ligadas às compras desta página
      const saleIds = [...new Set(pageRows.map((r) => r.sale_id).filter(Boolean))] as string[];
      const found: Record<string, LinkedSale> = {};
      if (saleIds.length) {
        const { data: rowsSales } = await supabase.from('sales').select('id, customer_name, total_sale_price').in('id', saleIds);
        ((rowsSales || []) as LinkedSale[]).forEach((x) => { found[x.id] = x; });
      }
      if (!alive) return;
      setSales(found);
      setRows(pageRows);
      setTotal(count || 0);
      // Totais do período inteiro, em páginas de 1000
      const all = await fetchAllRows((f, t) => supabase.from('wa_conversion_events').select(cols)
        .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).order('event_id').range(f, t));
      if (alive) setTotals(conversionTotals(all as unknown as ConversionRow[]));
    })().catch((e) => { if (alive) setError(/wa_conversion_events/.test(String(e && e.message)) ? 'Atualize o banco para usar este recurso.' : (e && e.message) || 'Erro ao carregar'); });
    return () => { alive = false; };
  }, [start, end, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-main)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-main)' };
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title="Conversões enviadas ao Facebook" subtitle="Compras e contatos que a extensão enviou à API de Conversões" right={(
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={muted}>De <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={input} aria-label="Data inicial" /></label>
          <label style={muted}>Até <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={input} aria-label="Data final" /></label>
        </div>
      )} />
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }} data-testid="conv-totals">
          <StatCard accent label="Compras reais" value={fmtInt(totals.purchases)} sub={money(totals.purchaseSum)} />
          <StatCard label="Contatos reais" value={fmtInt(totals.contacts)} sub="eventos Contact enviados" />
        </div>
      )}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Data', 'Cliente', 'Telefone', 'Evento', 'Valor', 'Anúncio', 'Real/Teste', 'Status', 'Venda do ERP'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows === null && !error && <tr><td style={td} colSpan={9}><span style={muted}>Carregando…</span></td></tr>}
            {rows && rows.length === 0 && <tr><td style={td} colSpan={9}><span style={muted}>Nenhuma conversão no período.</span></td></tr>}
            {(rows || []).map((r) => {
              const kind = eventKind(r);
              return (
                <tr key={r.event_id} data-testid="conv-row">
                  <td style={td}>{fmt(r.created_at)}</td>
                  <td style={td}>{r.contact_name || '—'}</td>
                  <td style={td}>{maskPhone(r.chat_id)}</td>
                  <td style={td}>{kind}</td>
                  <td style={td}>{kind === 'Compra' ? money(Number(r.value)) : '—'}</td>
                  <td style={td}>{hasAd(r) ? 'Sim' : 'Não'}</td>
                  <td style={td}>{r.test ? 'Teste' : 'Real'}</td>
                  <td style={{ ...td, color: r.status === 'enviado' ? '#16a34a' : '#ef4444' }} title={r.error || ''}>{r.status}</td>
                  <td style={{ ...td, color: r.sale_id ? 'var(--text-primary)' : 'var(--text-muted)' }} data-testid="conv-sale">{kind === 'Compra' ? linkedSaleLabel(r.sale_id, r.sale_id ? sales[r.sale_id] : undefined, money) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" style={btn} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</button>
        <span style={muted}>Página {page + 1} de {pages} · {total} evento{total === 1 ? '' : 's'}</span>
        <button type="button" style={{ ...btn, color: page + 1 < pages ? ORANGE : 'var(--text-muted)' }} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
      </div>
    </div>
  );
}
