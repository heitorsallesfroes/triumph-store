// Aba "Painel" ("como estou?"): resumo executivo do período, comparado com o período anterior (▲▼ %).
// Cartões, "Leads × vendas por dia", horários dos leads e o resultado por anúncio. Sem tabela de conversas, origem por
// dia nem funil (ficam no Rastreamento e em Resultados). Contas em src/lib/waPanel.ts.
import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computePanel, delta, periodRanges, AWAITING_DAYS, type AdRow, type PeriodPreset, type Summary } from '../../lib/waPanel';
import { loadPanel, type PanelLoad } from '../../lib/waPanelDb';
import { useErpRefresh } from '../../lib/erpRefresh';
import { input, ORANGE } from './shared';
import {
  EmptyState, fmtInt, fmtMoney, fmtPct, GREEN, InfoTip, panel, SectionHeader, Skeleton, SkeletonStyle, SLATE, SortTable, StatCard,
  type Column,
} from './ui';

const PRESETS: [PeriodPreset, string][] = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['custom', 'Personalizado']];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Regras explicadas no (i) de cada número
const INFO = {
  active: 'Conversas (uma por pessoa) em que o CLIENTE mandou mensagem no período, novas ou antigas — igual ao "Conversas novas ativas" do Tintim. Gravado pela extensão 2.12.8 (aba com a trava) a cada mensagem; ao abrir o WhatsApp Web, ela varre todas as conversas com mensagem nas últimas 72 h. Também contam os leads novos e as respostas a envios nossos do período.',
  leads: 'Conversas que falaram com a loja pela PRIMEIRA vez no período: a 1ª mensagem da conversa é do cliente e não havia nenhuma antes (anúncio ou orgânico). De anúncio = a mensagem veio de um anúncio (ctwa).',
  sales: 'Venda pelo WhatsApp = venda registrada pelo 💰 da conversa, ou venda do ERP (não cancelada/reembolsada) com o telefone de uma conversa do WhatsApp (lead, anúncio, envio ou resposta registrados). Data: dia da venda.',
  ticket: 'Valor das vendas pelo WhatsApp dividido pela quantidade.',
  conversion: 'Leads novos do período que fizeram uma venda pelo WhatsApp depois da 1ª mensagem, até o fim do período, dividido pelos leads novos.',
  fromAd: 'Vendas pelo WhatsApp de conversas que vieram de anúncio (registro do anúncio na conversa ou lead de anúncio) ou registradas pelo 💰 com origem anúncio. % = parte do faturamento.',
  afterFollow: 'Vendas pelo WhatsApp feitas até 7 dias depois do último follow-up que a conversa recebeu antes da venda (mensagem marcada como follow-up ou enviada por automação). % = parte do faturamento. O detalhe por régua está em Resultados.',
  awaiting: `Leads novos dos últimos ${AWAITING_DAYS} dias em que a loja ainda não respondeu (nenhuma mensagem nossa depois da 1ª mensagem do cliente). Se o período já passou, conta até o fim dele. A lista está no Rastreamento ("Conversas aguardando primeira resposta").`,
  daily: 'Barras: leads novos por dia (anúncio e orgânico). Linha: vendas pelo WhatsApp por dia.',
  ads: 'Leads novos de anúncio do período, por anúncio. Responderam = o cliente respondeu a um envio nosso depois da 1ª mensagem. Vendas = vendas pelo WhatsApp da conversa depois da 1ª mensagem, até o fim do período.',
  heat: 'Quantos leads novos chegaram em cada dia da semana e hora (horário de São Paulo), no período.',
};

type Loaded = { load: PanelLoad; result: ReturnType<typeof computePanel>; key: string };

export default function WaPanel() {
  const today = new Date();
  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)));
  const [end, setEnd] = useState(ymd(today));
  const ranges = useMemo(() => periodRanges(preset, Date.now(), { start, end }), [preset, start, end]);
  const key = `${ranges.cur.fromDay}|${ranges.cur.toDay}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    loadPanel(ranges)
      .then((load) => { if (alive) setData({ load, result: computePanel(load.input, ranges), key }); })
      .catch((e) => { if (alive) setError((e && e.message) || 'Erro ao carregar'); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Atualizar" do topo: recarrega o período escolhido sem esqueleto
  useErpRefresh(() => loadPanel(ranges).then((load) => setData({ load, result: computePanel(load.input, ranges), key })));

  const loading = !data || data.key !== key;
  const r = data && !loading ? data.result : null;
  const s = r?.summary;
  const p = r?.previous;
  const prevLabel = `${br(ranges.prev.fromDay)} a ${br(ranges.prev.toDay)}`;
  const d = (k: keyof Summary) => (s && p ? delta(Number(s[k]) || 0, Number(p[k]) || 0) : undefined);
  const dt = (k: keyof Summary, fmt: (n: number) => string = fmtInt) => (p ? `Período anterior (${prevLabel}): ${fmt(Number(p[k]) || 0)}` : undefined);
  const share = (part: number, total: number) => fmtPct(total ? part / total : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} data-testid="wa-panel">
      <SkeletonStyle />
      <SectionHeader
        title="Painel"
        subtitle={`Como estou? ${br(ranges.cur.fromDay)} a ${br(ranges.cur.toDay)} · comparado com ${prevLabel}`}
        right={<PeriodPicker preset={preset} setPreset={setPreset} start={start} end={end} setStart={setStart} setEnd={setEnd} />}
      />
      {error && <div style={{ ...panel, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {data && data.load.missing.length > 0 && (
        <div style={{ ...panel, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.35)', color: ORANGE, fontSize: 13 }}>
          Ainda sem: {data.load.missing.join(', ')}. Aplique a migration indicada (e use a extensão nessa versão) para ver esses números; o resto já funciona.
        </div>
      )}

      {/* Cartões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }} data-testid="panel-cards">
        {!s || !r ? Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={10} w="55%" /><Skeleton h={28} w="45%" /><Skeleton h={10} w="70%" /></div>
        )) : (<>
          <StatCard accent label="Conversas ativas" value={fmtInt(s.active)} delta={d('active')} deltaTitle={dt('active')} info={INFO.active}
            sub="o cliente mandou mensagem no período" />
          <StatCard accent label="Leads novos" value={fmtInt(s.leads)} delta={d('leads')} deltaTitle={dt('leads')} info={INFO.leads}
            sub={<><b style={{ color: ORANGE }}>{fmtInt(s.leadsAd)}</b> anúncio · <b style={{ color: 'var(--text-secondary)' }}>{fmtInt(s.leadsOrganic)}</b> orgânico</>} />
          <StatCard accent label="Vendas pelo WhatsApp" value={fmtMoney(s.revenue)} delta={d('revenue')} deltaTitle={dt('revenue', fmtMoney)} info={INFO.sales}
            sub={`${fmtInt(s.sales)} venda${s.sales === 1 ? '' : 's'}`} />
          <StatCard label="Ticket médio" value={fmtMoney(s.ticket)} delta={s.ticket != null && p && p.ticket != null ? delta(s.ticket, p.ticket) : undefined}
            deltaTitle={p ? `Período anterior: ${fmtMoney(p.ticket)}` : undefined} info={INFO.ticket} />
          <StatCard label="Conversão lead → venda" value={fmtPct(s.conversion, 1)} info={INFO.conversion}
            delta={s.conversion != null && p && p.conversion != null ? delta(s.conversion, p.conversion) : undefined}
            deltaTitle={p ? `Período anterior: ${fmtPct(p.conversion, 1)}` : undefined} sub={`${fmtInt(s.leadsBought)} de ${fmtInt(s.leads)} leads compraram`} />
          <StatCard label="Vendas de anúncio" value={fmtMoney(s.fromAdRevenue)} delta={d('fromAdRevenue')} deltaTitle={dt('fromAdRevenue', fmtMoney)} info={INFO.fromAd}
            sub={`${fmtInt(s.fromAd)} venda${s.fromAd === 1 ? '' : 's'} · ${share(s.fromAdRevenue, s.revenue)} do faturamento`} />
          <StatCard label="Vendas depois de follow-up" value={fmtMoney(s.afterFollowRevenue)} delta={d('afterFollowRevenue')} deltaTitle={dt('afterFollowRevenue', fmtMoney)} info={INFO.afterFollow}
            sub={`${fmtInt(s.afterFollow)} venda${s.afterFollow === 1 ? '' : 's'} · ${share(s.afterFollowRevenue, s.revenue)} do faturamento`} />
          <StatCard label="Aguardando 1ª resposta agora" value={fmtInt(r.awaiting)} info={INFO.awaiting}
            sub={r.awaiting ? `leads dos últimos ${AWAITING_DAYS} dias sem resposta da loja` : 'nenhum lead esperando'} />
        </>)}
      </div>

      {/* Leads × vendas por dia */}
      <Card title="Leads × vendas por dia" info={INFO.daily} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>barras: leads · linha: vendas</span>}>
        {!r ? <Skeleton h={260} /> : r.daily.every((x) => !x.anuncio && !x.organico && !x.vendas) ? <EmptyState /> : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={r.daily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="v" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(249,115,22,0.08)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }} formatter={(v, name) => [fmtInt(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="anuncio" name="Leads de anúncio" stackId="leads" fill={ORANGE} radius={[0, 0, 0, 0]} maxBarSize={36} />
                <Bar yAxisId="l" dataKey="organico" name="Leads orgânicos" stackId="leads" fill={SLATE} radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="v" type="monotone" dataKey="vendas" name="Vendas" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Horários */}
      <Card title="Quando os leads chegam" info={INFO.heat}>
        {!r ? <Skeleton h={200} /> : r.heatmap.every((row) => row.every((v) => !v)) ? <EmptyState /> : <Heatmap grid={r.heatmap} />}
      </Card>

      <Card title="Resultado por anúncio" info={INFO.ads}>
        {!r ? <TableSkeleton /> : <SortTable rows={r.ads} columns={adColumns} rowKey={(x) => x.id} initialSort="leads" empty="Nenhum lead de anúncio neste período." />}
      </Card>
    </div>
  );
}

export function Card({ title, info, right, children, testId }: { title: string; info?: string; right?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section style={panel} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {title}{info && <InfoTip text={info} label={`Como "${title}" é calculado`} />}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export const TableSkeleton = () => <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={18} />)}</div>;

export function PeriodPicker({ preset, setPreset, start, end, setStart, setEnd }: {
  preset: PeriodPreset; setPreset: (p: PeriodPreset) => void; start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', maxWidth: '100%' }}>
      <div role="group" aria-label="Período" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
        {PRESETS.map(([id, label]) => {
          const on = preset === id;
          return (
            <button key={id} type="button" aria-pressed={on} onClick={() => setPreset(id)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: on ? ORANGE : 'transparent', color: on ? '#fff' : 'var(--text-muted)' }}>{label}</button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="date" aria-label="Data inicial" value={start} onChange={(e) => setStart(e.target.value)} style={input} />
          <input type="date" aria-label="Data final" value={end} onChange={(e) => setEnd(e.target.value)} style={input} />
        </div>
      )}
    </div>
  );
}

const pctCell = (p: number | null) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
    <span style={{ width: 44, height: 6, borderRadius: 999, background: 'var(--bg-inner)', overflow: 'hidden', display: 'inline-block' }}>
      <span style={{ display: 'block', width: `${Math.min(1, p || 0) * 100}%`, height: '100%', background: ORANGE }} />
    </span>
    {fmtPct(p)}
  </span>
);

const adColumns: Column<AdRow>[] = [
  { key: 'title', label: 'Anúncio', value: (x) => x.title, render: (x) => (
    <span style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontWeight: 600 }}>{x.title}</span>
      {x.adId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>id {x.adId}</span>}
    </span>
  ) },
  { key: 'leads', label: 'Leads', value: (x) => x.leads, render: (x) => fmtInt(x.leads), align: 'right' },
  { key: 'repliedPct', label: 'Responderam', value: (x) => x.repliedPct, render: (x) => pctCell(x.repliedPct), align: 'right' },
  { key: 'sales', label: 'Vendas', value: (x) => x.sales, render: (x) => fmtInt(x.sales), align: 'right' },
  { key: 'revenue', label: 'R$', value: (x) => x.revenue, render: (x) => <b>{fmtMoney(x.revenue)}</b>, align: 'right' },
];

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const cell: React.CSSProperties = { height: 24, borderRadius: 5 };
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, minmax(18px, 1fr))', gap: 3, minWidth: 560 }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{h % 3 === 0 ? `${h}h` : ''}</span>)}
        {grid.map((row, wd) => (
          <HeatRow key={wd} label={WEEKDAYS[wd]} row={row} max={max} cell={cell} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--text-muted)', justifyContent: 'flex-end' }}>
        menos {[0.08, 0.3, 0.55, 0.8, 1].map((a) => <span key={a} style={{ width: 14, height: 10, borderRadius: 3, background: `rgba(249,115,22,${a})` }} />)} mais
      </div>
    </div>
  );
}
function HeatRow({ label, row, max, cell }: { label: string; row: number[]; max: number; cell: React.CSSProperties }) {
  return (<>
    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{label}</span>
    {row.map((v, h) => (
      <span key={h} title={`${label} ${h}h: ${v} lead${v === 1 ? '' : 's'}`} aria-label={`${label} ${h}h: ${v} leads`}
        style={{ ...cell, background: v ? `rgba(249,115,22,${0.12 + 0.88 * (v / max)})` : 'var(--bg-inner)' }} />
    ))}
  </>);
}
