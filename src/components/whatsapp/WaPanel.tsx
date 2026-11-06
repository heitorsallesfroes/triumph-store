// Aba "Painel": resultados do WhatsApp no período (leads, respostas, vendas, follow-ups, mensagens rápidas,
// anúncios, automações e horários), comparando com o período anterior. Contas em src/lib/waPanel.ts.
import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computePanel, delta, periodRanges, AUTO_KIND_LABEL, type AdRow, type FunnelStep, type PeriodPreset, type SendGroupRow, type Summary } from '../../lib/waPanel';
import { loadPanel, type PanelLoad } from '../../lib/waPanelDb';
import { input, ORANGE } from './shared';
import {
  BLUE, EmptyState, eyebrow, fmtInt, fmtMinutes, fmtMoney, fmtPct, GREEN, InfoTip, panel, SectionHeader, Skeleton, SkeletonStyle, SLATE, SortTable, StatCard,
  type Column,
} from './ui';

const PRESETS: [PeriodPreset, string][] = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['custom', 'Personalizado']];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Regras explicadas no (i) de cada número
const INFO = {
  leads: 'Conversas novas: a 1ª mensagem do cliente numa conversa sem nenhuma mensagem antes (gravado pela extensão 2.10.0 na aba que tem a trava; ao abrir o WhatsApp, recupera as das últimas 24 h). De anúncio = a mensagem veio de um anúncio (ctwa). Conversas de anúncio de antes da 2.10.0 entram pelo registro do anúncio.',
  replied: 'Conversas (não mensagens) em que o cliente respondeu a um envio nosso no período: mensagem que você digitou, mensagem rápida, agendada, automação ou disparo. Só a 1ª resposta depois de cada envio conta.',
  sales: 'Venda pelo WhatsApp = venda registrada pelo 💰 da conversa, ou venda do ERP (não cancelada/reembolsada) com o telefone de uma conversa do WhatsApp (lead, anúncio, envio ou resposta registrados). Data: dia da venda.',
  ticket: 'Valor das vendas pelo WhatsApp dividido pela quantidade.',
  conversion: 'Leads novos do período que fizeram uma venda pelo WhatsApp depois da 1ª mensagem, até o fim do período, dividido pelos leads novos.',
  afterFollow: 'Vendas pelo WhatsApp feitas até 7 dias depois do último follow-up que a conversa recebeu antes da venda. Follow-up = mensagem rápida marcada "Esta mensagem é um follow-up" (enviada à mão ou por automação).',
  fromAd: 'Vendas pelo WhatsApp de conversas que vieram de anúncio (registro do anúncio na conversa ou lead de anúncio) ou registradas pelo 💰 com origem anúncio.',
  fb: 'Compras reais enviadas com sucesso ao Facebook (API de Conversões) no período. Testes e falhas não contam.',
  funnel: 'Para cada etapa: conversas que receberam o follow-up no período; responderam = o cliente respondeu a esse envio (tempo mediano até responder); compraram = venda pelo WhatsApp até 7 dias depois do 1º envio da etapa; seguiram sem responder = não responderam e receberam a etapa seguinte depois.',
  quick: 'Envios de cada mensagem rápida no período (pela seta, prévia, agendamento, automação ou disparo). Responderam = o cliente respondeu a esse envio. Vendas = vendas pelo WhatsApp da conversa em até 7 dias depois do envio (cada venda conta uma vez por mensagem).',
  ads: 'Leads novos de anúncio do período, por anúncio. Responderam = o cliente respondeu a um envio nosso depois da 1ª mensagem. Vendas = vendas pelo WhatsApp da conversa depois da 1ª mensagem, até o fim do período.',
  autos: 'Envios das automações (e réguas de follow), dos disparos e das mensagens agendadas no período. Vendas = vendas pelo WhatsApp em até 7 dias depois do envio.',
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

  const loading = !data || data.key !== key;
  const r = data && !loading ? data.result : null;
  const s = r?.summary;
  const p = r?.previous;
  const prevLabel = `${br(ranges.prev.fromDay)} a ${br(ranges.prev.toDay)}`;
  const d = (k: keyof Summary) => (s && p ? delta(Number(s[k]) || 0, Number(p[k]) || 0) : undefined);
  const dt = (k: keyof Summary, fmt: (n: number) => string = fmtInt) => (p ? `Período anterior (${prevLabel}): ${fmt(Number(p[k]) || 0)}` : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SkeletonStyle />
      <SectionHeader
        title="Painel de resultados"
        subtitle={`${br(ranges.cur.fromDay)} a ${br(ranges.cur.toDay)} · comparado com ${prevLabel}`}
        right={<PeriodPicker preset={preset} setPreset={setPreset} start={start} end={end} setStart={setStart} setEnd={setEnd} />}
      />
      {error && <div style={{ ...panel, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {data && data.load.missing.length > 0 && (
        <div style={{ ...panel, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.35)', color: ORANGE, fontSize: 13 }}>
          Ainda sem: {data.load.missing.join(', ')}. Aplique a migration 20261106150000_wa_panel.sql e use a extensão 2.10.0 para ver esses números; o resto já funciona.
        </div>
      )}

      {/* Cartões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {!s ? Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={10} w="55%" /><Skeleton h={28} w="45%" /><Skeleton h={10} w="70%" /></div>
        )) : (<>
          <StatCard accent label="Leads novos" value={fmtInt(s.leads)} delta={d('leads')} deltaTitle={dt('leads')} info={INFO.leads}
            sub={<><b style={{ color: ORANGE }}>{fmtInt(s.leadsAd)}</b> anúncio · <b style={{ color: 'var(--text-secondary)' }}>{fmtInt(s.leadsOrganic)}</b> orgânico</>} />
          <StatCard label="Conversas respondidas" value={fmtInt(s.replied)} delta={d('replied')} deltaTitle={dt('replied')} info={INFO.replied} sub="clientes que responderam a um envio" />
          <StatCard accent label="Vendas pelo WhatsApp" value={fmtMoney(s.revenue)} delta={d('revenue')} deltaTitle={dt('revenue', fmtMoney)} info={INFO.sales}
            sub={`${fmtInt(s.sales)} venda${s.sales === 1 ? '' : 's'}`} />
          <StatCard label="Ticket médio" value={fmtMoney(s.ticket)} delta={s.ticket != null && p && p.ticket != null ? delta(s.ticket, p.ticket) : undefined}
            deltaTitle={p ? `Período anterior: ${fmtMoney(p.ticket)}` : undefined} info={INFO.ticket} />
          <StatCard label="Conversão lead → venda" value={fmtPct(s.conversion, 1)} info={INFO.conversion}
            delta={s.conversion != null && p && p.conversion != null ? delta(s.conversion, p.conversion) : undefined}
            deltaTitle={p ? `Período anterior: ${fmtPct(p.conversion, 1)}` : undefined} sub={`${fmtInt(s.leadsBought)} de ${fmtInt(s.leads)} leads compraram`} />
          <StatCard label="Vendas depois de follow-up" value={fmtInt(s.afterFollow)} delta={d('afterFollow')} deltaTitle={dt('afterFollow')} info={INFO.afterFollow}
            sub={`${fmtMoney(s.afterFollowRevenue)} · ${fmtPct(s.sales ? s.afterFollow / s.sales : null)} das vendas`} />
          <StatCard label="Vendas de anúncio" value={fmtInt(s.fromAd)} delta={d('fromAd')} deltaTitle={dt('fromAd')} info={INFO.fromAd}
            sub={`${fmtMoney(s.fromAdRevenue)} · ${fmtPct(s.sales ? s.fromAd / s.sales : null)} das vendas`} />
          <StatCard label="Compras enviadas ao Facebook" value={fmtInt(s.fbPurchases)} delta={d('fbPurchases')} deltaTitle={dt('fbPurchases')} info={INFO.fb} sub={fmtMoney(s.fbRevenue)} />
        </>)}
      </div>

      {/* Leads por dia */}
      <Card title="Leads por dia" info={INFO.leads} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>barras: leads · linha: vendas</span>}>
        {!r ? <Skeleton h={260} /> : r.daily.every((x) => !x.anuncio && !x.organico && !x.vendas) ? <EmptyState /> : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={r.daily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="v" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(249,115,22,0.08)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
                  formatter={(v, name) => (name === 'Vendas' ? [fmtInt(Number(v)), name] : [fmtInt(Number(v)), name])} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="anuncio" name="Anúncio" stackId="leads" fill={ORANGE} radius={[0, 0, 0, 0]} maxBarSize={36} />
                <Bar yAxisId="l" dataKey="organico" name="Orgânico" stackId="leads" fill={SLATE} radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="v" type="monotone" dataKey="vendas" name="Vendas" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Funil dos follow-ups */}
      <Card title="Funil dos follow-ups" info={INFO.funnel} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>conta conversas, não envios</span>}>
        {!r ? <Skeleton h={150} /> : r.funnel.length === 0
          ? <EmptyState text="Sem follow-ups neste período. Marque as mensagens rápidas como follow-up (etapa 1, 2, 3…) na extensão." />
          : <Funnel steps={r.funnel} />}
      </Card>

      {/* Tabelas */}
      <Card title="Resultado por mensagem rápida" info={INFO.quick}>
        {!r ? <TableSkeleton /> : <SortTable rows={r.quick} columns={sendColumns('Mensagem rápida')} rowKey={(x) => x.id} initialSort="sent" empty="Nenhuma mensagem rápida enviada neste período." />}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20 }}>
        <Card title="Resultado por anúncio" info={INFO.ads}>
          {!r ? <TableSkeleton /> : <SortTable rows={r.ads} columns={adColumns} rowKey={(x) => x.id} initialSort="leads" empty="Nenhum lead de anúncio neste período." />}
        </Card>
        <Card title="Automações e disparos" info={INFO.autos}>
          {!r ? <TableSkeleton /> : <SortTable rows={r.automations} columns={sendColumns('Automação / disparo', true)} rowKey={(x) => `${x.kind}:${x.id}`} initialSort="sent" empty="Nenhuma automação ou disparo enviado neste período." />}
        </Card>
      </div>

      {/* Horários */}
      <Card title="Quando os leads chegam" info={INFO.heat}>
        {!r ? <Skeleton h={200} /> : r.heatmap.every((row) => row.every((v) => !v)) ? <EmptyState /> : <Heatmap grid={r.heatmap} />}
      </Card>
    </div>
  );
}

function Card({ title, info, right, children }: { title: string; info?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={panel}>
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

const TableSkeleton = () => <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={18} />)}</div>;

function PeriodPicker({ preset, setPreset, start, end, setStart, setEnd }: {
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

function Bar100({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-inner)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .3s' }} />
    </div>
  );
}

function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(...steps.map((x) => x.received), 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {steps.map((st, i) => (
        <div key={st.step} style={{ position: 'relative', padding: 14, borderRadius: 14, background: 'var(--bg-inner)', border: '1px solid var(--border-main)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...eyebrow, color: ORANGE }}>Follow {st.step}</span>
            {i < steps.length - 1 && <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</span>}
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtInt(st.received)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>receberam</div>
            <div style={{ marginTop: 6 }}><Bar100 value={st.received / top} color={SLATE} /></div>
          </div>
          <FunnelLine label="responderam" value={`${fmtInt(st.responded)} (${fmtPct(st.respondedPct)}${st.medianMinutes != null ? `, em ${fmtMinutes(st.medianMinutes)}` : ''})`} bar={st.respondedPct} color={ORANGE} />
          <FunnelLine label="compraram depois" value={`${fmtInt(st.bought)} (${fmtPct(st.boughtPct)}, ${fmtMoney(st.revenue)})`} bar={st.boughtPct} color={GREEN} />
          <FunnelLine label="seguiram para a próxima sem responder" value={`${fmtInt(st.advancedNoReply)} (${fmtPct(st.advancedPct)})`} bar={st.advancedPct} color={BLUE} />
        </div>
      ))}
    </div>
  );
}
function FunnelLine({ label, value, bar, color }: { label: string; value: string; bar: number | null; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <b style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</b>
      </div>
      <Bar100 value={bar} color={color} />
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

function sendColumns(nameLabel: string, withKind = false): Column<SendGroupRow>[] {
  return [
    { key: 'name', label: nameLabel, value: (x) => x.name, render: (x) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {withKind && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'rgba(249,115,22,0.12)', color: ORANGE, whiteSpace: 'nowrap' }}>{AUTO_KIND_LABEL[x.kind] || x.kind}</span>}
        <span style={{ fontWeight: 600 }}>{x.name}</span>
      </span>
    ) },
    { key: 'sent', label: 'Enviadas', value: (x) => x.sent, render: (x) => fmtInt(x.sent), align: 'right' },
    { key: 'repliedPct', label: 'Responderam', value: (x) => x.repliedPct, render: (x) => pctCell(x.repliedPct), align: 'right' },
    { key: 'medianMinutes', label: 'Tempo mediano', value: (x) => x.medianMinutes, render: (x) => fmtMinutes(x.medianMinutes), align: 'right' },
    { key: 'sales', label: 'Vendas (7 dias)', value: (x) => x.sales, render: (x) => fmtInt(x.sales), align: 'right' },
    { key: 'revenue', label: 'R$', value: (x) => x.revenue, render: (x) => <b>{fmtMoney(x.revenue)}</b>, align: 'right' },
  ];
}

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
