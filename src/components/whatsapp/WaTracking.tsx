// Aba "Rastreamento": conversas ativas e leads novos (anúncio x não rastreada), tempo da 1ª resposta,
// jornada Fez contato → Respondeu → Comprou, vendas por dia e a lista de conversas (como o Tintim: todas as
// conversas ativas, pela última mensagem, ao vivo). Contas em src/lib/waTracking.ts; leitura em
// src/lib/waTrackingDb.ts. Só leitura.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Search } from 'lucide-react';
import { periodRanges, spDay, type PeriodPreset } from '../../lib/waPanel';
import {
  buildConversations, conversationsCsv, conversationsIn, filterStage, journey, originByDay, pageInfo, salesByDay, searchConversations,
  sortConversations, trackSummary, businessHoursLabel, businessHoursOf, saleLinksText, DEFAULT_SORT, STAGE_FILTERS, STAGE_LABEL,
  type Conversation, type OriginFilter, type SalesDateMode, type SortKey, type Stage, type StageFilter,
} from '../../lib/waTracking';
import { loadTracking, type TrackLoad } from '../../lib/waTrackingDb';
import { startVisibleInterval } from '../../lib/visibleInterval';
import { btn, input, ORANGE } from './shared';
import WaConversions from './WaConversions';
import { EmptyState, eyebrow, fmtInt, fmtMinutes, fmtMoney, fmtPct, GREEN, InfoTip, panel, SectionHeader, Skeleton, SkeletonStyle, SLATE, StatCard } from './ui';

const PRESETS: [PeriodPreset, string][] = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['custom', 'Personalizado']];
const ORIGINS: [OriginFilter, string][] = [['todas', 'Todas'], ['anuncio', 'Anúncio'], ['nao_rastreada', 'Não rastreada']];
const PAGE = 25;
// 2.12.8: atualiza sozinha a cada 30 s (com a aba visível e o período incluindo hoje). O teste no Chrome real
// usa um intervalo menor (window.__TSP_LIVE_MS).
const LIVE_MS = Number((globalThis as { __TSP_LIVE_MS?: number }).__TSP_LIVE_MS) || 30 * 1000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const when = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));

const INFO = {
  active: 'Conversas (uma por pessoa) em que o CLIENTE mandou mensagem no período, novas ou antigas — igual ao "Conversas novas ativas" do Tintim. Gravado pela extensão 2.12.8 (aba com a trava) a cada mensagem; ao abrir o WhatsApp Web, ela varre todas as conversas com mensagem nas últimas 72 h (quem chamou com o PC desligado entra quando você abrir). Também contam os leads novos e as respostas a envios nossos do período.',
  leads: 'Conversas que falaram com a loja pela PRIMEIRA vez no período: a 1ª mensagem da conversa é do cliente e não havia nenhuma antes, uma por pessoa (anúncio ou orgânico). Gravado pela extensão (aba com a trava), pelo anúncio ou pela varredura das últimas 72 h ao abrir o WhatsApp Web.',
  ad: 'Conversas que vieram de um anúncio do Meta (Facebook/Instagram, clique para o WhatsApp).',
  untracked: 'Conversas sem anúncio: o cliente chamou direto, pelo link, indicação etc.',
  reply: 'Média do tempo entre a 1ª mensagem do cliente e o 1º envio nosso registrado na conversa (o que você digitou, mensagem rápida, automação…). "Só horário comercial" (ligado por padrão) conta só os minutos dentro do horário do motor de envios da extensão (Automações → horário). Conversas sem resposta e as com início não registrado não entram na média.',
  sales: 'Vendas das conversas do período: registradas pelo 💰 na conversa, ligadas pelo 📈 (a Compra enviada ao Facebook ligada à venda do ERP) ou vendas do ERP com o telefone da conversa. Conversa nova: as vendas depois da 1ª mensagem; conversa que já existia: as vendas do período. Canceladas/reembolsadas não contam. Como cada venda foi ligada: (i) na etapa da tabela.',
  conversion: 'Conversas do período que compraram, divididas pelas conversas do período.',
  origin: 'Leads novos por dia (dia do 1º contato), separados pela origem (anúncio ou não rastreada). O número em cada pedaço é a quantidade.',
  journey: 'Fez contato = conversas do período. Respondeu = o cliente respondeu a uma mensagem nossa depois do 1º contato. Comprou = teve venda pelo WhatsApp depois do 1º contato (quem comprou conta também em Respondeu).',
  salesDay: '"Data do primeiro contato": as vendas das conversas novas do período, no dia em que a conversa começou. "Data da venda": as vendas pelo WhatsApp feitas no período, no dia da venda (de conversas de qualquer data).',
  table: 'Uma linha por conversa do período: todas as conversas ativas (o cliente mandou mensagem no período), os leads novos e as que tiveram venda no período. Ordem padrão: última mensagem, mais recente primeiro (clique no título da coluna para trocar). Atualiza sozinha a cada 30 s ("Ao vivo") quando o período inclui hoje, sem sair da página em que você está. Etapa: Fez contato / Respondeu (o cliente respondeu a uma mensagem nossa) / Comprou + valor. Contato: nome aprendido/salvo → nome do WhatsApp → telefone. "início não registrado" = a 1ª mensagem da conversa não é conhecida.',
};

type Loaded = { load: TrackLoad; key: string; at: number };

export default function WaTracking() {
  const today = new Date();
  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)));
  const [end, setEnd] = useState(ymd(today));
  const [origin, setOrigin] = useState<OriginFilter>('todas');
  const [businessOnly, setBusinessOnly] = useState(true); // como o motor de envios (pode desligar)
  const [salesMode, setSalesMode] = useState<SalesDateMode>('contato');
  const ranges = useMemo(() => periodRanges(preset, Date.now(), { start, end }), [preset, start, end]);
  const r = ranges.cur;
  const key = `${r.fromDay}|${r.toDay}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    loadTracking(r)
      .then((load) => { if (alive) setData({ load, key, at: Date.now() }); })
      .catch((e) => { if (alive) setError((e && e.message) || 'Erro ao carregar'); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2.12.8: "Ao vivo" — com o período incluindo hoje, recarrega a cada 30 s (aba visível), sem esqueleto e sem
  // mexer na página/filtros da tabela. Uma atualização por vez; se o período mudar no meio, a resposta é descartada.
  const live = r.toDay >= spDay(Date.now());
  const busy = useRef(false);
  useEffect(() => {
    if (!live) return undefined;
    let alive = true;
    const stop = startVisibleInterval(() => {
      if (busy.current) return;
      busy.current = true;
      loadTracking(r)
        .then((load) => { if (alive) setData((cur) => (cur && cur.key === key ? { load, key, at: Date.now() } : cur)); })
        .catch(() => { /* tenta de novo na próxima */ })
        .finally(() => { busy.current = false; });
    }, LIVE_MS);
    return () => { alive = false; stop(); };
  }, [key, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !data || data.key !== key;
  const bh = useMemo(() => businessHoursOf(data ? data.load.settings : null), [data]);
  const model = useMemo(() => (data && !loading ? buildConversations(data.load.input, bh) : null), [data, loading, bh]);
  const list = useMemo(() => (model && data ? conversationsIn(model, r, origin, data.load.input.replies) : null), [model, data, r, origin]);
  const s = useMemo(() => (list ? trackSummary(list, businessOnly) : null), [list, businessOnly]);
  const daily = useMemo(() => (list ? originByDay(list, r) : null), [list, r]);
  const steps = useMemo(() => (list ? journey(list) : null), [list]);
  const salesDaily = useMemo(() => (model ? salesByDay(model, r, origin, salesMode) : null), [model, r, origin, salesMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SkeletonStyle />
      <SectionHeader
        title="Rastreamento das conversas"
        subtitle={`${br(r.fromDay)} a ${br(r.toDay)} · conversas ativas, leads novos e quantas viram venda`}
        right={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', maxWidth: '100%' }}>
            <Segmented label="Período" options={PRESETS} value={preset} onChange={setPreset} />
            {preset === 'custom' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="date" aria-label="Data inicial" value={start} onChange={(e) => setStart(e.target.value)} style={input} />
                <input type="date" aria-label="Data final" value={end} onChange={(e) => setEnd(e.target.value)} style={input} />
              </div>
            )}
            <Segmented label="Origem" options={ORIGINS} value={origin} onChange={setOrigin} small />
          </div>
        )}
      />
      {error && <div style={{ ...panel, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {data && data.load.missing.length > 0 && (
        <div style={{ ...panel, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.35)', color: ORANGE, fontSize: 13 }}>
          Ainda sem: {data.load.missing.join(', ')}. O resto já funciona.
        </div>
      )}

      {/* Visão geral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }} data-testid="track-cards">
        {!s ? Array.from({ length: 7 }, (_, i) => (
          <div key={i} style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={10} w="55%" /><Skeleton h={28} w="45%" /><Skeleton h={10} w="70%" /></div>
        )) : (<>
          <StatCard accent label="Conversas ativas" value={fmtInt(s.active)} info={INFO.active}
            sub={s.total > s.active ? `o cliente mandou mensagem · + ${fmtInt(s.total - s.active)} só com venda no período` : 'o cliente mandou mensagem no período'} />
          <StatCard accent label="Leads novos" value={fmtInt(s.leads)} info={INFO.leads}
            sub={<><b style={{ color: ORANGE }}>{fmtInt(s.leadsAd)}</b> anúncio · <b style={{ color: 'var(--text-secondary)' }}>{fmtInt(s.leads - s.leadsAd)}</b> orgânico</>} />
          <StatCard label="Rastreadas (anúncio)" value={fmtInt(s.ad)} info={INFO.ad} sub={<><b style={{ color: ORANGE }}>{fmtPct(s.adPct, 1)}</b> das conversas</>} />
          <StatCard label="Não rastreadas" value={fmtInt(s.untracked)} info={INFO.untracked} sub={<><b style={{ color: 'var(--text-secondary)' }}>{fmtPct(s.untrackedPct, 1)}</b> das conversas</>} />
          <StatCard label="Tempo médio da 1ª resposta" value={fmtMinutes(s.avgReplyMinutes)} info={INFO.reply} sub={(
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>{fmtInt(s.answered)} de {fmtInt(s.total)} conversas respondidas</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={businessOnly} onChange={(e) => setBusinessOnly(e.target.checked)} /> só horário comercial ({businessHoursLabel(bh)})
              </label>
            </span>
          )} />
          <StatCard accent label="Vendas das conversas" value={fmtMoney(s.revenue)} info={INFO.sales} sub={`${fmtInt(s.sales)} venda${s.sales === 1 ? '' : 's'} · ${fmtInt(s.bought)} conversa${s.bought === 1 ? '' : 's'}`} />
          <StatCard label="Fez contato → Comprou" value={fmtPct(s.conversion, 1)} info={INFO.conversion} sub={`${fmtInt(s.bought)} de ${fmtInt(s.total)} compraram`} />
        </>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20 }}>
        {/* Origem por dia */}
        <Card title="Origem dos leads novos por dia" info={INFO.origin}>
          {!daily ? <Skeleton h={260} /> : daily.every((x) => !x.anuncio && !x.nao_rastreada) ? <EmptyState /> : (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={daily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(249,115,22,0.08)' }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }} formatter={(v, name) => [fmtInt(Number(v)), name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(origin !== 'nao_rastreada') && (
                    <Bar dataKey="anuncio" name="Anúncio" stackId="o" fill={ORANGE} maxBarSize={40}>
                      <LabelList dataKey="anuncio" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={hideZero} />
                    </Bar>
                  )}
                  {(origin !== 'anuncio') && (
                    <Bar dataKey="nao_rastreada" name="Não rastreada" stackId="o" fill={SLATE} radius={[6, 6, 0, 0]} maxBarSize={40}>
                      <LabelList dataKey="nao_rastreada" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={hideZero} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Jornada */}
        <Card title="Jornada" info={INFO.journey} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>conta conversas</span>}>
          {!steps ? <Skeleton h={220} /> : <Journey steps={steps} />}
        </Card>
      </div>

      {/* Vendas por dia */}
      <Card title="Vendas por dia" info={INFO.salesDay} right={(
        <Segmented label="Data usada no gráfico de vendas" small value={salesMode} onChange={setSalesMode}
          options={[['contato', 'Data do primeiro contato'], ['venda', 'Data da venda']]} />
      )}>
        {!salesDaily ? <Skeleton h={260} /> : salesDaily.every((x) => !x.vendas) ? <EmptyState text="Nenhuma venda neste período." /> : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={salesDaily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                <YAxis yAxisId="r" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)} mil` : String(v))} />
                <YAxis yAxisId="q" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(34,197,94,0.08)' }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
                  formatter={(v, name) => (name === 'Faturamento' ? [fmtMoney(Number(v)), name] : [fmtInt(Number(v)), name])} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="r" dataKey="receita" name="Faturamento" fill={GREEN} radius={[6, 6, 0, 0]} maxBarSize={40}>
                  <LabelList dataKey="vendas" position="top" fill="var(--text-muted)" fontSize={11} fontWeight={700} formatter={hideZero} />
                </Bar>
                <Line yAxisId="q" type="monotone" dataKey="vendas" name="Vendas" stroke={ORANGE} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Conversas */}
      <Card title="Conversas" info={INFO.table} right={live && data && !loading ? <LiveBadge at={data.at} /> : undefined}>
        {!list ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={18} />)}</div>
          : <ConversationsTable list={list} fileTag={`${r.fromDay}_a_${r.toDay}`} resetKey={`${key}|${origin}`} />}
      </Card>

      {/* Eventos enviados ao Facebook (a antiga sub-aba "Conversões (Facebook)") */}
      <section style={panel}>
        <WaConversions title="Eventos enviados ao Facebook" startDay={r.fromDay} endDay={r.toDay} />
      </section>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 10, fontSize: 12 };
const hideZero = (v: unknown) => (Number(v) ? String(v) : '');

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

function Segmented<T extends string>({ label, options, value, onChange, small = false }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
      {options.map(([id, text]) => {
        const on = value === id;
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onChange(id)}
            style={{ padding: small ? '4px 10px' : '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: on ? ORANGE : 'transparent', color: on ? '#fff' : 'var(--text-muted)' }}>{text}</button>
        );
      })}
    </div>
  );
}

const STAGE_COLOR: Record<Stage, string> = { contato: SLATE, respondeu: ORANGE, comprou: GREEN };

function Journey({ steps }: { steps: ReturnType<typeof journey> }) {
  const top = Math.max(1, steps[0].count);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="track-journey">
      {steps.map((st, i) => (
        <div key={st.stage} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...eyebrow, color: STAGE_COLOR[st.stage] }}>{i + 1}. {STAGE_LABEL[st.stage]}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <b style={{ fontSize: 20, color: 'var(--text-primary)', marginRight: 6 }}>{fmtInt(st.count)}</b>{fmtPct(st.pct, 1)}
            </span>
          </div>
          <div style={{ height: 28, borderRadius: 8, background: 'var(--bg-inner)', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: `${Math.max(st.count ? 2 : 0, (st.count / top) * 100)}%`, height: '100%', background: STAGE_COLOR[st.stage], borderRadius: 8, transition: 'width .3s' }} />
          </div>
          {i > 0 && steps[i - 1].count > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtPct(st.count / steps[i - 1].count, 1)} da etapa anterior</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OriginBadge({ c }: { c: Conversation }) {
  if (!c.ad) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Não rastreada</span>;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'rgba(249,115,22,0.12)', color: ORANGE, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>Meta Ads</span>
      {c.adTitle && <span title={c.adTitle} style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.adTitle}</span>}
    </span>
  );
}

function StageBadge({ c }: { c: Conversation }) {
  const color = STAGE_COLOR[c.stage];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ fontWeight: 600 }}>{STAGE_LABEL[c.stage]}</span>
      {c.stage === 'comprou' && <b style={{ color: GREEN }}>{fmtMoney(c.revenue)}</b>}
      {c.saleLinks.length > 0 && <InfoTip text={`Como a venda foi ligada: ${saleLinksText(c, fmtMoney)}`} label={`Como as vendas de ${c.name} foram ligadas`} />}
    </span>
  );
}

const check = (on: boolean, label: string) => (
  <span title={on ? `${label} enviado ao Facebook` : `${label} não enviado`} style={{ fontSize: 12, whiteSpace: 'nowrap', color: on ? GREEN : 'var(--text-muted)', fontWeight: on ? 700 : 400 }}>
    {label} {on ? '✓' : '—'}
  </span>
);

const COLS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Contato' }, { key: 'origin', label: 'Origem' }, { key: 'stage', label: 'Etapa' },
  { key: 'firstAt', label: 'Primeira mensagem' }, { key: 'lastAt', label: 'Última mensagem' }, { key: 'reply', label: '1ª resposta', align: 'right' },
  { key: null, label: 'Facebook' },
];

// 2.12.8: selo "Ao vivo" (com a hora da última atualização)
function LiveBadge({ at }: { at: number }) {
  return (<>
    <style>{'@keyframes waLive{0%,100%{opacity:1}50%{opacity:.35}}@media (prefers-reduced-motion: reduce){.wa-live-dot{animation:none!important}}'}</style>
    <span data-testid="track-live" title={`Atualiza sozinha a cada 30 s · última: ${new Date(at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: GREEN }}>
      <span className="wa-live-dot" style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, animation: 'waLive 1.6s ease-in-out infinite' }} />
      Ao vivo
      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {new Date(at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </span>
  </>);
}

// resetKey: período/origem; ao trocar, volta para a página 1. A atualização ao vivo (nova lista com o mesmo
// resetKey) NÃO volta: a página só é ajustada se a lista diminuir (pageInfo).
function ConversationsTable({ list, fileTag, resetKey }: { list: Conversation[]; fileTag: string; resetKey: string }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>(DEFAULT_SORT);
  const [stage, setStage] = useState<StageFilter>('todas');
  const [page, setPage] = useState(0);
  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) { lastReset.current = resetKey; if (page !== 0) setPage(0); }
  const rows = useMemo(() => sortConversations(filterStage(searchConversations(list, q), stage), sort.key, sort.desc), [list, q, stage, sort]);
  const pi = pageInfo(rows.length, page, PAGE);
  const cur = rows.slice(pi.from, pi.to);
  const go = (p: number) => setPage(pageInfo(rows.length, p, PAGE).page);
  const exportCsv = () => {
    const blob = new Blob([String.fromCharCode(0xfeff) + conversationsCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversas_whatsapp_${fileTag}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const th: React.CSSProperties = { ...eyebrow, padding: '10px 12px', borderBottom: '1px solid var(--border-main)', whiteSpace: 'nowrap', background: 'var(--bg-card)' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-main)', verticalAlign: 'middle' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar por nome ou telefone" aria-label="Buscar conversa por nome ou telefone"
            style={{ ...input, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} />
        </label>
        <div data-testid="track-stage"><Segmented label="Etapa" small options={STAGE_FILTERS} value={stage} onChange={(v) => { setStage(v); setPage(0); }} /></div>
        <button type="button" style={btn} onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Exportar CSV</button>
      </div>
      {!rows.length ? <EmptyState text={q ? 'Nenhuma conversa com essa busca.' : stage !== 'todas' ? 'Nenhuma conversa nesta etapa.' : 'Nenhuma conversa neste período.'} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }} data-testid="track-table">
            <thead>
              <tr>
                {COLS.map((c) => {
                  const active = c.key === sort.key;
                  return (
                    <th key={c.label} style={{ ...th, textAlign: c.align || 'left' }} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                      {c.key ? (
                        <button type="button" onClick={() => { setSort({ key: c.key as SortKey, desc: active ? !sort.desc : c.key !== 'name' }); setPage(0); }}
                          style={{ padding: 0, border: 'none', background: 'transparent', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer', color: active ? ORANGE : 'var(--text-muted)' }}>
                          {c.label}{active ? (sort.desc ? ' ↓' : ' ↑') : ''}
                        </button>
                      ) : c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {cur.map((c) => (
                <tr key={c.key}>
                  <td style={td}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      {c.phoneLabel && c.phoneLabel !== c.name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.phoneLabel}</span>}
                    </span>
                  </td>
                  <td style={td}><OriginBadge c={c} /></td>
                  <td style={td}><StageBadge c={c} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(c.firstAt)}{!c.tracked && <div style={{ fontSize: 11, color: 'var(--text-muted)' }} title="A conversa já existia antes do rastreamento: entrou pela venda; a data é a 1ª atividade conhecida">início não registrado</div>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(c.lastAt)}{c.lastFrom && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.lastFrom === 'cliente' ? 'do cliente' : 'da loja'}</div>}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{c.replyMinutes == null ? <span style={{ color: 'var(--text-muted)' }}>{c.tracked ? 'sem resposta' : '—'}</span> : fmtMinutes(c.replyMinutes)}</td>
                  <td style={td}><span style={{ display: 'flex', gap: 10 }}>{check(c.fbContact, 'Contato')}{check(c.fbPurchase, 'Compra')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <Pager info={pi} onPage={go} testId="track-pager" />}
    </div>
  );
}

// Anterior · "Página X de Y · N conversas" · Próxima (a página vem de pageInfo, nunca passa da última)
export function Pager({ info, onPage, testId }: { info: ReturnType<typeof pageInfo>; onPage: (p: number) => void; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" style={{ ...btn, color: info.hasPrev ? 'var(--text-primary)' : 'var(--text-muted)', cursor: info.hasPrev ? 'pointer' : 'default' }} disabled={!info.hasPrev} onClick={() => onPage(info.page - 1)}>Anterior</button>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{info.label}</span>
      <button type="button" style={{ ...btn, color: info.hasNext ? ORANGE : 'var(--text-muted)', cursor: info.hasNext ? 'pointer' : 'default' }} disabled={!info.hasNext} onClick={() => onPage(info.page + 1)}>Próxima</button>
    </div>
  );
}
