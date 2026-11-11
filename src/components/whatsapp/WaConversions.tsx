// Aba "Conversões (Facebook)": eventos enviados pela extensão (wa_conversion_events). Só leitura, paginado,
// com filtro por período e totais do período inteiro (sem o limite de 1000 linhas do Supabase).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/resumoAnualCalc';
import { pageInfo } from '../../lib/waTracking';
import { useErpRefresh } from '../../lib/erpRefresh';
import {
  conversionContact, conversionTotals, eventKind, hasAd, linkedSaleLabel, periodBounds, type ContactSources, type ConversionRow, type ConversionTotals, type LinkedSale,
} from '../../lib/waConversions';
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

// 2.12.2: de onde vêm Cliente e Telefone das linhas da página (cada tabela que não existir fica vazia)
type SaleInfo = LinkedSale & { customer_phone?: string | null };
async function contactSources(chatIds: string[], sales: Record<string, SaleInfo>): Promise<ContactSources> {
  const src: ContactSources = { leadPhone: {}, attribution: {}, chatName: {}, sales };
  if (!chatIds.length) return src;
  const read = async <T,>(table: string, cols: string, put: (r: T) => void) => {
    try {
      const { data, error } = await supabase.from(table).select(cols).in('chat_id', chatIds);
      if (!error) ((data || []) as unknown as T[]).forEach(put);
    } catch { /* sem a tabela */ }
  };
  await Promise.all([
    read<{ chat_id: string; phone: string | null }>('wa_leads', 'chat_id, phone', (r) => { src.leadPhone[r.chat_id] = r.phone; }),
    read<{ chat_id: string; phone: string | null; contact_name: string | null }>('wa_ad_attribution', 'chat_id, phone, contact_name', (r) => { src.attribution[r.chat_id] = r; }),
    read<{ chat_id: string; name: string }>('wa_chat_names', 'chat_id, name', (r) => { src.chatName[r.chat_id] = r.name; }),
    read<{ chat_id: string; agenda_name: string | null }>('wa_contact_names', 'chat_id, agenda_name', (r) => { (src.agenda = src.agenda || {})[r.chat_id] = r.agenda_name; }), // 2.18.1
  ]);
  return src;
}

// Seção "Eventos enviados ao Facebook" do Rastreamento: começa no período da aba (startDay/endDay) e segue o
// período quando ele muda; os filtros De/Até continuam editáveis aqui.
// 2.12.8: carrega TODOS os eventos do período (em lotes de 1000, os mesmos dos totais) e faz o filtro
// Todos / Compras / Contatos e a paginação aqui (antes a página dependia da contagem do Supabase e não ia para a 2ª).
// Cliente, telefone e venda do ERP são buscados só para as linhas da página aberta.
export type KindFilter = 'todos' | 'compras' | 'contatos';
const KINDS: [KindFilter, string][] = [['todos', 'Todos'], ['compras', 'Compras'], ['contatos', 'Contatos']];
export const filterKind = <T extends Pick<ConversionRow, 'event_name' | 'error' | 'value'>>(rows: T[], k: KindFilter): T[] =>
  (k === 'todos' ? rows : rows.filter((r) => eventKind(r) === (k === 'compras' ? 'Compra' : 'Contato')));

export default function WaConversions({ title = 'Conversões enviadas ao Facebook', startDay, endDay }: { title?: string; startDay?: string; endDay?: string } = {}) {
  const today = new Date();
  const [start, setStart] = useState(startDay || ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)));
  const [end, setEnd] = useState(endDay || ymd(today));
  useEffect(() => { if (startDay) setStart(startDay); if (endDay) setEnd(endDay); }, [startDay, endDay]);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<KindFilter>('todos');
  const [all, setAll] = useState<ConversionRow[] | null>(null);
  const [sales, setSales] = useState<Record<string, LinkedSale>>({});
  const [contacts, setContacts] = useState<ContactSources>({ leadPhone: {}, attribution: {}, chatName: {}, sales: {} });
  const [error, setError] = useState('');

  // todos os eventos do período (mais novos primeiro)
  const fetchPeriod = async () => {
    const { from, to } = periodBounds(start, end);
    const cols = await selectCols();
    const rows = await fetchAllRows((f, t) => supabase.from('wa_conversion_events').select(cols)
      .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).order('event_id').range(f, t));
    return rows as unknown as ConversionRow[];
  };
  const errText = (e: unknown) => { const m = String((e as Error)?.message || ''); return /wa_conversion_events/.test(m) ? 'Atualize o banco para usar este recurso.' : m || 'Erro ao carregar'; };
  // período: carrega e volta para a página 1
  useEffect(() => {
    let alive = true;
    setAll(null);
    setPage(0);
    setError('');
    fetchPeriod().then((rows) => { if (alive) setAll(rows); }).catch((e) => { if (alive) setError(errText(e)); });
    return () => { alive = false; };
  }, [start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Atualizar" do topo: recarrega sem voltar para a página 1 (a página só é ajustada se a lista diminuir)
  useErpRefresh(() => fetchPeriod().then((rows) => { setAll(rows); setError(''); }).catch((e) => setError(errText(e))));

  const totals: ConversionTotals | null = useMemo(() => (all ? conversionTotals(all) : null), [all]);
  const filtered = useMemo(() => (all ? filterKind(all, kind) : null), [all, kind]);
  const pi = pageInfo(filtered ? filtered.length : 0, page, PAGE, ['evento', 'eventos']);
  const rows = useMemo(() => (filtered ? filtered.slice(pi.from, pi.to) : null), [filtered, pi.from, pi.to]);

  // 2.10.5 / 2.12.2: vendas do ERP ligadas e de onde vêm Cliente e Telefone — só das linhas desta página
  useEffect(() => {
    if (!rows || !rows.length) return undefined;
    let alive = true;
    (async () => {
      const saleIds = [...new Set(rows.map((r) => r.sale_id).filter(Boolean))] as string[];
      const found: Record<string, SaleInfo> = {};
      if (saleIds.length) {
        const { data: rowsSales } = await supabase.from('sales').select('id, customer_name, customer_phone, total_sale_price').in('id', saleIds);
        ((rowsSales || []) as SaleInfo[]).forEach((x) => { found[x.id] = x; });
      }
      const chatIds = [...new Set(rows.map((r) => r.chat_id).filter(Boolean))] as string[];
      const src = await contactSources(chatIds, found);
      if (!alive) return;
      setSales(found);
      setContacts(src);
    })().catch(() => { /* sem os nomes: mostra o que veio no evento */ });
    return () => { alive = false; };
  }, [rows]);
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-main)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-main)' };
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title={title} subtitle="Compras e contatos que a extensão enviou à API de Conversões" right={(
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div data-testid="conv-kind" role="group" aria-label="Tipo de evento" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
            {KINDS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={kind === id} onClick={() => { setKind(id); setPage(0); }}
                style={{ padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: kind === id ? ORANGE : 'transparent', color: kind === id ? '#fff' : 'var(--text-muted)' }}>{label}</button>
            ))}
          </div>
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
            {rows && rows.length === 0 && <tr><td style={td} colSpan={9}><span style={muted}>{kind === 'todos' ? 'Nenhuma conversão no período.' : kind === 'compras' ? 'Nenhuma compra no período.' : 'Nenhum contato no período.'}</span></td></tr>}
            {(rows || []).map((r) => {
              const kind = eventKind(r);
              const who = conversionContact(r, contacts);
              return (
                <tr key={r.event_id} data-testid="conv-row">
                  <td style={td}>{fmt(r.created_at)}</td>
                  <td style={td}>{who.name}</td>
                  <td style={td}>{who.phone}</td>
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
      <div data-testid="conv-pager" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" style={{ ...btn, color: pi.hasPrev ? 'var(--text-primary)' : 'var(--text-muted)' }} disabled={!pi.hasPrev} onClick={() => setPage(pi.page - 1)}>Anterior</button>
        <span style={muted}>{pi.label}</span>
        <button type="button" style={{ ...btn, color: pi.hasNext ? ORANGE : 'var(--text-muted)' }} disabled={!pi.hasNext} onClick={() => setPage(pi.page + 1)}>Próxima</button>
      </div>
    </div>
  );
}
