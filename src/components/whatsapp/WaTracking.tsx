// Aba "Rastreamento" (como o Tintim): conversas aguardando 1ª resposta e tempo de jornada no topo; filtros (período,
// origem, relatório); visão geral (ativas, rastreadas × não rastreadas, 1ª resposta, meia-lua); origem por dia;
// funil Fez contato → Comprou; vendas; a tabela de conversas (ao vivo, 25 por página, detalhes da conversa numa
// lateral) e os eventos enviados ao Facebook. Azul = Meta Ads, laranja = Não rastreada.
// Contas em src/lib/waTracking.ts; leitura em src/lib/waTrackingDb.ts. Só leitura.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, Eye, MessageCircle, Search, X } from 'lucide-react';
import { periodRanges, spDay, type PeriodPreset } from '../../lib/waPanel';
import {
  adBadgeTitle, buildConversations, buyFunnel, conversationAd, conversationsCsv, conversationsIn, conversationTimeline, filterStage, originByDay, originMatches, pageInfo, salesByDay, salesCsv,
  searchConversations, sortConversations, trackSummary, businessHoursLabel, businessHoursOf, saleLinksText, DEFAULT_SORT, STAGE_FILTERS, STAGE_LABEL,
  type Conversation, type ConversationAd, type OriginFilter, type SalesDateMode, type SortKey, type Stage, type StageFilter, type TrackInput,
} from '../../lib/waTracking';
import { loadAdAttributions, loadTracking, type TrackLoad } from '../../lib/waTrackingDb';
import { startVisibleInterval } from '../../lib/visibleInterval';
import { useErpRefresh } from '../../lib/erpRefresh';
import { btn, input, ORANGE } from './shared';
import WaConversions from './WaConversions';
import { EmptyState, eyebrow, fmtInt, fmtMinutes, fmtMoney, fmtPct, GREEN, InfoTip, panel, Skeleton, SkeletonStyle, SLATE } from './ui';

// cores do Tintim
const META = '#2563eb';
const UNTR = '#f97316';
const PRESETS: [PeriodPreset, string][] = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['custom', 'Personalizado']];
const ORIGINS: [OriginFilter, string][] = [['todas', 'Todas as origens'], ['anuncio', 'Meta Ads'], ['nao_rastreada', 'Não rastreada']];
const PAGE = 25;
// 2.12.8: atualiza sozinha a cada 30 s (aba visível, período incluindo hoje). O teste usa window.__TSP_LIVE_MS.
const LIVE_MS = Number((globalThis as { __TSP_LIVE_MS?: number }).__TSP_LIVE_MS) || 30 * 1000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const when = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }));
const fmtDays = (d: number | null) => (d == null ? '—' : `${(Math.round(d * 10) / 10).toLocaleString('pt-BR')} dia${Math.round(d * 10) / 10 === 1 ? '' : 's'}`);

const INFO = {
  awaiting: 'Conversas do período que começaram com o cliente (1º contato registrado) e em que a loja ainda não respondeu: nenhuma mensagem nossa registrada depois da 1ª mensagem e a última mensagem não é da loja.',
  journey: 'Média de dias entre o 1º contato registrado e a 1ª venda, das conversas do período que compraram.',
  active: 'Total de conversas novas ativas (como no Tintim): conversas, uma por pessoa, em que o CLIENTE mandou mensagem no período, novas ou antigas. Gravado pela extensão 2.12.8; ao abrir o WhatsApp Web ela varre as conversas com mensagem nas últimas 72 h.',
  ad: 'Conversas ativas que vieram de um anúncio do Meta (Facebook/Instagram, clique para o WhatsApp).',
  untracked: 'Conversas ativas sem anúncio: o cliente chamou direto, pelo link, indicação etc.',
  reply: 'Média do tempo entre a 1ª mensagem do cliente e a 1ª mensagem nossa registrada. "Calcular a partir da 2ª mensagem": ignora a 1ª mensagem nossa (automática / saudação) e mede até a 2ª. "Só horário comercial": conta só os minutos dentro do horário do motor de envios. Conversas sem resposta e as com início não registrado não entram.',
  origin: 'Conversas ativas por dia (o 1º dia delas no período), separadas pela origem. O número dentro de cada pedaço é a quantidade.',
  funnel: 'Fez contato = conversas ativas do período (100%). Comprou = as que tiveram venda pelo WhatsApp (💰, 📈 ou o telefone da venda) depois do 1º contato. Canceladas/reembolsadas não contam.',
  sales: '"Data do primeiro contato": as vendas das conversas do período, no dia em que a conversa começou. "Data da venda": as vendas pelo WhatsApp feitas no período, no dia da venda (de conversas de qualquer data).',
  table: 'Todas as conversas do período: as ativas, os leads novos e as que tiveram venda no período. Ordem padrão: última mensagem, mais recente primeiro. Atualiza sozinha a cada 30 s ("Ao vivo") quando o período inclui hoje, sem sair da página em que você está. 👁 abre a linha do tempo da conversa; 💬 abre no WhatsApp.',
};

type Loaded = { load: TrackLoad; key: string; at: number };

export default function WaTracking() {
  const today = new Date();
  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)));
  const [end, setEnd] = useState(ymd(today));
  const [origin, setOrigin] = useState<OriginFilter>('todas');
  const [businessOnly, setBusinessOnly] = useState(true);
  const [fromSecond, setFromSecond] = useState(false);
  const [salesMode, setSalesMode] = useState<SalesDateMode>('contato');
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
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

  // "Ao vivo": recarrega a cada 30 s sem esqueleto e sem mexer na página/filtros da tabela
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

  // "Atualizar" do topo: como o "Ao vivo" (período, origem, página e filtros da tabela continuam)
  useErpRefresh(() => loadTracking(r).then((load) => setData((cur) => (cur && cur.key === key ? { load, key, at: Date.now() } : { load, key, at: Date.now() }))));

  const loading = !data || data.key !== key;
  const bh = useMemo(() => businessHoursOf(data ? data.load.settings : null), [data]);
  const model = useMemo(() => (data && !loading ? buildConversations(data.load.input, bh) : null), [data, loading, bh]);
  const list = useMemo(() => (model && data ? conversationsIn(model, r, origin, data.load.input.replies) : null), [model, data, r, origin]);
  const s = useMemo(() => (list ? trackSummary(list, businessOnly, fromSecond) : null), [list, businessOnly, fromSecond]);
  const daily = useMemo(() => (list ? originByDay(list, r) : null), [list, r]);
  const funnel = useMemo(() => (list ? buyFunnel(list) : null), [list]);
  const salesDaily = useMemo(() => (model ? salesByDay(model, r, origin, salesMode) : null), [model, r, origin, salesMode]);
  const salesTot = useMemo(() => (salesDaily ? salesDaily.reduce((a, x) => ({ n: a.n + x.vendas, v: a.v + x.receita }), { n: 0, v: 0 }) : null), [salesDaily]);
  const originTot = useMemo(() => (daily ? daily.reduce((a, x) => ({ ad: a.ad + x.anuncio, un: a.un + x.nao_rastreada }), { ad: 0, un: 0 }) : null), [daily]);
  const tag = `${r.fromDay}_a_${r.toDay}`;
  const download = (text: string, name: string) => {
    const blob = new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const seeAwaiting = () => { setAwaitingOnly(true); setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} data-testid="wa-tracking">
      <SkeletonStyle />
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Rastreamento</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{br(r.fromDay)} a {br(r.toDay)} · de onde vêm as conversas e quantas viram venda</p>
      </div>

      {/* Topo: dois cartões grandes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        <BigCard label="Conversas aguardando primeira resposta" info={INFO.awaiting} value={s ? fmtInt(s.awaiting) : null} testId="track-awaiting"
          action={<button type="button" style={{ ...btn, color: META, border: '1px solid rgba(37,99,235,0.45)' }} onClick={seeAwaiting} disabled={!s || !s.awaiting} data-testid="track-see-awaiting">Ver conversas</button>} />
        <BigCard label="Tempo médio de jornada" info={INFO.journey} value={s ? fmtDays(s.journeyDays) : null} testId="track-journey-days"
          sub={s ? (s.journeyCount ? `do 1º contato até a venda · ${fmtInt(s.journeyCount)} compra${s.journeyCount === 1 ? '' : 's'}` : 'ninguém comprou ainda neste período') : ''} />
      </div>

      {/* Filtros */}
      <div style={{ ...panel, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-testid="track-filters">
        <Segmented label="Período" options={PRESETS} value={preset} onChange={setPreset} small />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          De <input type="date" aria-label="Data inicial" value={preset === 'custom' ? start : r.fromDay} onChange={(e) => { setStart(e.target.value); if (preset !== 'custom') setEnd(r.toDay); setPreset('custom'); }} style={input} />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          Até <input type="date" aria-label="Data final" value={preset === 'custom' ? end : r.toDay} onChange={(e) => { setEnd(e.target.value); if (preset !== 'custom') setStart(r.fromDay); setPreset('custom'); }} style={input} />
        </label>
        <Segmented label="Origem" options={ORIGINS} value={origin} onChange={setOrigin} small colors={{ anuncio: META, nao_rastreada: UNTR }} />
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} disabled={!list || !list.length} onClick={() => list && download(conversationsCsv(sortConversations(list, DEFAULT_SORT.key, DEFAULT_SORT.desc)), `conversas_whatsapp_${tag}.csv`)} data-testid="track-report">
          <Download size={14} /> Baixar relatório
        </button>
      </div>
      {error && <div style={{ ...panel, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {data && data.load.missing.length > 0 && (
        <div style={{ ...panel, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.35)', color: ORANGE, fontSize: 13 }}>
          Ainda sem: {data.load.missing.join(', ')}. O resto já funciona.
        </div>
      )}

      {/* Visão geral das conversas */}
      <Card title="Visão geral das conversas" testId="track-overview">
        {!s ? <Skeleton h={160} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16, alignItems: 'center' }}>
            <Metric testId="track-active" label="Total de conversas novas ativas" info={INFO.active} value={fmtInt(s.active)} sub={`${fmtInt(s.leads)} leads novos no período`} />
            <Metric testId="track-ad" label="Conversas rastreadas" info={INFO.ad} value={fmtInt(s.activeAd)} color={META} sub={`${fmtPct(s.activeAdPct, 1)} das conversas`} />
            <Metric testId="track-untracked" label="Não rastreadas" info={INFO.untracked} value={fmtInt(s.activeUntracked)} color={UNTR} sub={`${fmtPct(s.activeUntrackedPct, 1)} das conversas`} />
            <Metric testId="track-reply" label="Tempo médio de 1ª resposta" info={INFO.reply} value={fmtMinutes(s.avgReplyMinutes)} sub={(
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{fmtInt(s.answered)} conversas respondidas</span>
                <Toggle on={fromSecond} onChange={setFromSecond} label="Calcular a partir da 2ª mensagem" testId="track-from-second" />
                <Toggle on={businessOnly} onChange={setBusinessOnly} label={`Só horário comercial (${businessHoursLabel(bh)})`} />
              </span>
            )} />
            <Gauge ad={s.activeAd} untracked={s.activeUntracked} />
          </div>
        )}
      </Card>

      {/* Origem das conversas */}
      <Card title="Origem das conversas" info={INFO.origin} testId="track-origin" right={originTot && (
        <span style={{ display: 'flex', gap: 14, fontSize: 13 }}>
          <span><b style={{ color: META, fontSize: 18 }}>{fmtInt(originTot.ad)}</b> Meta Ads</span>
          <span><b style={{ color: UNTR, fontSize: 18 }}>{fmtInt(originTot.un)}</b> Não rastreada</span>
        </span>
      )}>
        {!daily ? <Skeleton h={260} /> : daily.every((x) => !x.anuncio && !x.nao_rastreada) ? <EmptyState /> : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={daily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(37,99,235,0.06)' }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }} formatter={(v, name) => [fmtInt(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {origin !== 'nao_rastreada' && (
                  <Bar dataKey="anuncio" name="Meta Ads" stackId="o" fill={META} maxBarSize={40}>
                    <LabelList dataKey="anuncio" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={hideZero} />
                  </Bar>
                )}
                {origin !== 'anuncio' && (
                  <Bar dataKey="nao_rastreada" name="Não rastreada" stackId="o" fill={UNTR} radius={[6, 6, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="nao_rastreada" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={hideZero} />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
        {/* Funil */}
        <Card title="Funil da jornada de compra" info={INFO.funnel} testId="track-funnel">
          {!funnel ? <Skeleton h={160} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FunnelBlock label="Fez contato" count={funnel.contact} pct={funnel.contact ? 1 : null} width={1} />
              <FunnelBlock label="Comprou" count={funnel.bought} pct={funnel.boughtPct} width={funnel.contact ? Math.max(0.08, funnel.bought / funnel.contact) : 0.08} />
            </div>
          )}
        </Card>

        {/* Vendas */}
        <Card title="Vendas" info={INFO.sales} testId="track-sales" right={(
          <Segmented label="Data usada nas vendas" small value={salesMode} onChange={setSalesMode} options={[['contato', 'Data do primeiro contato'], ['venda', 'Data da venda']]} />
        )}>
          {!salesDaily || !salesTot ? <Skeleton h={220} /> : (<>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
              <Metric label="Total de vendas" value={fmtInt(salesTot.n)} testId="track-sales-n" />
              <Metric label="Faturamento total" value={fmtMoney(salesTot.v)} color={GREEN} testId="track-sales-v" />
            </div>
            {salesDaily.every((x) => !x.vendas) ? <EmptyState text="Nenhuma venda neste período." /> : (
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={salesDaily.map((x) => ({ ...x, dia: br(x.day) }))} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-main)' }} minTickGap={8} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)} mil` : String(v))} />
                    <Tooltip cursor={{ fill: 'rgba(34,197,94,0.08)' }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
                      formatter={(v, name, item) => (name === 'Faturamento' ? [`${fmtMoney(Number(v))} (${fmtInt(Number((item && (item as { payload?: { vendas?: number } }).payload?.vendas) || 0))} vendas)`, name] : [fmtInt(Number(v)), name])} />
                    <Bar dataKey="receita" name="Faturamento" fill={GREEN} radius={[6, 6, 0, 0]} maxBarSize={40}>
                      <LabelList dataKey="vendas" position="top" fill="var(--text-muted)" fontSize={11} fontWeight={700} formatter={hideZero} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button type="button" style={btn} disabled={!model || !salesTot.n} onClick={() => model && download(salesCsv(model, r, origin, salesMode), `vendas_whatsapp_${tag}.csv`)} data-testid="track-sales-report">
                <Download size={14} /> Baixar relatório de vendas
              </button>
            </div>
          </>)}
        </Card>
      </div>

      {/* Conversas */}
      <div ref={tableRef}>
        <Card title="Conversas" info={INFO.table} testId="track-conversations" right={live && data && !loading ? <LiveBadge at={data.at} /> : undefined}>
          {!list || !data ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={18} />)}</div>
            : <ConversationsTable list={list} input={data.load.input} fileTag={tag} resetKey={`${key}|${origin}`} awaitingOnly={awaitingOnly} setAwaitingOnly={setAwaitingOnly} />}
        </Card>
      </div>

      {/* Eventos enviados ao Facebook */}
      <section style={panel}>
        <WaConversions title="Eventos enviados ao Facebook" startDay={r.fromDay} endDay={r.toDay} />
      </section>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 10, fontSize: 12 };
const hideZero = (v: unknown) => (Number(v) ? String(v) : '');

function Card({ title, info, right, children, testId }: { title: string; info?: string; right?: React.ReactNode; children: React.ReactNode; testId?: string }) {
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
function BigCard({ label, info, value, sub, action, testId }: { label: string; info: string; value: string | null; sub?: string; action?: React.ReactNode; testId?: string }) {
  return (
    <section style={{ ...panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }} data-testid={testId}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 6 }}>{label}<InfoTip text={info} label={`Como "${label}" é calculado`} /></span>
        {value == null ? <Skeleton h={32} w={80} /> : <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }} data-testid={testId ? `${testId}-value` : undefined}>{value}</span>}
        {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
      {action}
    </section>
  );
}
function Metric({ label, info, value, sub, color, testId }: { label: string; info?: string; value: string; sub?: React.ReactNode; color?: string; testId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }} data-testid={testId}>
      <span style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 6 }}>{label}{info && <InfoTip text={info} label={`Como "${label}" é calculado`} />}</span>
      <span style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.1 }} data-testid={testId ? `${testId}-value` : undefined}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}
function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testId} /> {label}
    </label>
  );
}
// meia-lua (gauge) rastreadas × não rastreadas
function Gauge({ ad, untracked }: { ad: number; untracked: number }) {
  const total = ad + untracked;
  const data = total ? [{ name: 'Meta Ads', value: ad }, { name: 'Não rastreada', value: untracked }] : [{ name: 'Sem conversas', value: 1 }];
  return (
    <div style={{ position: 'relative', width: '100%', height: 130 }} data-testid="track-gauge" aria-label={`Rastreadas ${ad}, não rastreadas ${untracked}`}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" startAngle={180} endAngle={0} cx="50%" cy="100%" innerRadius="120%" outerRadius="175%" paddingAngle={total ? 1 : 0} stroke="none" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.name === 'Meta Ads' ? META : d.name === 'Não rastreada' ? UNTR : 'var(--bg-inner)'} />)}
          </Pie>
          {total > 0 && <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${fmtInt(Number(v))} (${fmtPct(Number(v) / total, 1)})`, name]} />}
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        <b style={{ color: META }}>{fmtPct(total ? ad / total : null, 0)}</b> rastreadas
      </div>
    </div>
  );
}
function FunnelBlock({ label, count, pct, width }: { label: string; count: number; pct: number | null; width: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }} data-testid="track-funnel-step">
      <div style={{ width: `${Math.round(Math.max(0.08, Math.min(1, width)) * 100)}%`, minWidth: 180, padding: '14px 16px', borderRadius: 10, background: META, color: '#fff', textAlign: 'center', transition: 'width .3s' }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtInt(count)} <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>({fmtPct(pct, 1)})</span></div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, options, value, onChange, small = false, colors = {} }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void; small?: boolean; colors?: Partial<Record<T, string>> }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
      {options.map(([id, text]) => {
        const on = value === id;
        const c = colors[id] || ORANGE;
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onChange(id)}
            style={{ padding: small ? '4px 10px' : '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: on ? c : 'transparent', color: on ? '#fff' : 'var(--text-muted)' }}>{text}</button>
        );
      })}
    </div>
  );
}

const STAGE_COLOR: Record<Stage, string> = { contato: SLATE, respondeu: META, comprou: GREEN };

function OriginBadge({ c }: { c: Conversation }) {
  if (!c.ad) return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(249,115,22,0.12)', color: UNTR, whiteSpace: 'nowrap' }}>Não rastreada</span>;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span title={adBadgeTitle(c)} data-testid="track-meta-badge" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.12)', color: META, alignSelf: 'flex-start', whiteSpace: 'nowrap', cursor: 'help' }}>Meta Ads</span>
      <span title={c.adTitle || ''} style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.adTitle || 'Via Campanha de Mensagem'}</span>
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

const COLS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Contato' }, { key: 'origin', label: 'Origem' }, { key: 'stage', label: 'Etapa da jornada' },
  { key: 'firstAt', label: 'Primeira mensagem' }, { key: 'lastAt', label: 'Última mensagem' }, { key: null, label: 'Ações', align: 'right' },
];

// resetKey: período/origem; ao trocar, volta para a página 1. A atualização ao vivo (nova lista com o mesmo
// resetKey) NÃO volta: a página só é ajustada se a lista diminuir (pageInfo).
function ConversationsTable({ list, input: data, fileTag, resetKey, awaitingOnly, setAwaitingOnly }: {
  list: Conversation[]; input: TrackInput; fileTag: string; resetKey: string; awaitingOnly: boolean; setAwaitingOnly: (v: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>(DEFAULT_SORT);
  const [stage, setStage] = useState<StageFilter>('todas');
  const [orig, setOrig] = useState<OriginFilter>('todas');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Conversation | null>(null);
  const lastReset = useRef(resetKey);
  const lastAwait = useRef(awaitingOnly);
  if (lastReset.current !== resetKey) { lastReset.current = resetKey; if (page !== 0) setPage(0); }
  if (lastAwait.current !== awaitingOnly) { lastAwait.current = awaitingOnly; if (page !== 0) setPage(0); }
  const base = useMemo(() => searchConversations(list, q).filter((c) => originMatches(c.ad, orig) && (!awaitingOnly || c.awaiting)), [list, q, orig, awaitingOnly]);
  const totals = useMemo(() => ({ all: base.length, ad: base.filter((c) => c.ad).length }), [base]);
  const rows = useMemo(() => sortConversations(filterStage(base, stage), sort.key, sort.desc), [base, stage, sort]);
  const pi = pageInfo(rows.length, page, PAGE);
  const cur = rows.slice(pi.from, pi.to);
  const go = (p: number) => setPage(pageInfo(rows.length, p, PAGE).page);
  // a lateral acompanha a atualização ao vivo (a mesma conversa, com os dados novos)
  const openNow = open ? list.find((c) => c.key === open.key) || open : null;
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
  const iconBtn: React.CSSProperties = { ...btn, padding: '6px 8px' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }} data-testid="track-totals">
        <span><b style={{ fontSize: 18 }}>{fmtInt(totals.all)}</b> Total</span>
        <span><b style={{ fontSize: 18, color: META }}>{fmtInt(totals.ad)}</b> Meta Ads</span>
        <span><b style={{ fontSize: 18, color: UNTR }}>{fmtInt(totals.all - totals.ad)}</b> Não rastreada</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar por telefone ou nome" aria-label="Buscar conversa por telefone ou nome"
            style={{ ...input, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} />
        </label>
        <div data-testid="track-table-origin"><Segmented label="Origem da conversa" small options={ORIGINS} value={orig} onChange={(v) => { setOrig(v); setPage(0); }} colors={{ anuncio: META, nao_rastreada: UNTR }} /></div>
        <button type="button" aria-pressed={awaitingOnly} onClick={() => setAwaitingOnly(!awaitingOnly)} data-testid="track-awaiting-filter"
          style={{ ...btn, ...(awaitingOnly ? { background: META, color: '#fff', border: `1px solid ${META}` } : {}) }}>Conversas aguardando primeira resposta</button>
        <div data-testid="track-stage"><Segmented label="Etapa" small options={STAGE_FILTERS} value={stage} onChange={(v) => { setStage(v); setPage(0); }} /></div>
        <button type="button" style={btn} onClick={exportCsv} disabled={!rows.length}><Download size={14} /> CSV</button>
      </div>
      {!rows.length ? <EmptyState text={q ? 'Nenhuma conversa com essa busca.' : awaitingOnly ? 'Nenhuma conversa aguardando a primeira resposta.' : stage !== 'todas' ? 'Nenhuma conversa nesta etapa.' : 'Nenhuma conversa neste período.'} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }} data-testid="track-table">
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
                      {c.awaiting && <span style={{ fontSize: 10, fontWeight: 700, color: META }}>aguardando 1ª resposta</span>}
                    </span>
                  </td>
                  <td style={td}><OriginBadge c={c} /></td>
                  <td style={td}><StageBadge c={c} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(c.firstAt)}{!c.tracked && <div style={{ fontSize: 11, color: 'var(--text-muted)' }} title="A 1ª mensagem da conversa não é conhecida; a data é a 1ª atividade conhecida">início não registrado</div>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(c.lastAt)}{c.lastFrom && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.lastFrom === 'cliente' ? 'do cliente' : 'da loja'}</div>}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" style={iconBtn} onClick={() => setOpen(c)} aria-label={`Detalhes da conversa com ${c.name}`} title="Detalhes da conversa" data-testid="track-details"><Eye size={15} /></button>
                      {c.waLink ? (
                        <a href={c.waLink} target="_blank" rel="noopener noreferrer" style={{ ...iconBtn, textDecoration: 'none', color: GREEN }} aria-label={`Abrir ${c.name} no WhatsApp`} title="Abrir no WhatsApp"><MessageCircle size={15} /></a>
                      ) : <span style={{ ...iconBtn, opacity: 0.4, cursor: 'not-allowed' }} title="Conversa sem número conhecido (@lid): procure pelo nome no WhatsApp"><MessageCircle size={15} /></span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <Pager info={pi} onPage={go} testId="track-pager" />}
      {openNow && <ConversationDrawer c={openNow} input={data} onClose={() => setOpen(null)} />}
    </div>
  );
}

const KIND_ICON: Record<string, string> = { contato: '👋', anuncio: '📣', loja: '🏪', follow: '🔁', disparo: '📢', resposta: '💬', venda: '💰', facebook: '📈' };
function ConversationDrawer({ c, input: data, onClose }: { c: Conversation; input: TrackInput; onClose: () => void }) {
  const events = useMemo(() => conversationTimeline(c, data, fmtMoney), [c, data]);
  // anúncio: o registro já carregado; se não veio na janela da aba, busca só os chats desta conversa
  const [extraAttr, setExtraAttr] = useState<TrackInput['attributions']>([]);
  const loadedAd = useMemo(() => conversationAd(c, data.attributions), [c, data]);
  const needFetch = !!loadedAd && !data.attributions.some((a) => c.chatIds.includes(a.chat_id));
  const chatKey = c.chatIds.join(','); // a lista atualiza a cada 30 s: busca de novo só se mudar de conversa
  useEffect(() => {
    setExtraAttr([]);
    if (!needFetch) return;
    let alive = true;
    loadAdAttributions(chatKey.split(',')).then((rows) => { if (alive) setExtraAttr(rows); }).catch(() => {});
    return () => { alive = false; };
  }, [chatKey, needFetch]);
  const ad = extraAttr.length ? conversationAd(c, [...data.attributions, ...extraAttr]) : loadedAd;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-label={`Detalhes da conversa com ${c.name}`} data-testid="track-drawer"
        style={{ width: 'min(420px, 100vw)', height: '100%', overflowY: 'auto', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-main)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{c.name}</div>
            {c.phoneLabel && c.phoneLabel !== c.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.phoneLabel}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ ...btn, padding: '6px 8px' }} aria-label="Fechar detalhes"><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}><OriginBadge c={c} /><StageBadge c={c} /></div>
        {c.waLink && <a href={c.waLink} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none', color: GREEN, alignSelf: 'flex-start' }}><MessageCircle size={14} /> Abrir no WhatsApp</a>}
        {ad && <AdBlock key={ad.thumbnailUrl || ''} ad={ad} />}
        <div style={{ ...eyebrow }}>Linha do tempo</div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="track-timeline">
          {events.map((ev, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8 }}>
              <span aria-hidden style={{ fontSize: 15 }}>{KIND_ICON[ev.kind] || '•'}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ev.text}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{when(ev.t)}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

// ERP 09/11: bloco "Anúncio" da lateral: título, origem, miniatura do criativo (se a extensão guardou) e os links
function AdBlock({ ad }: { ad: ConversationAd }) {
  const [thumbOk, setThumbOk] = useState(true);
  const link = { ...btn, textDecoration: 'none', color: META, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 } as const;
  return (
    <section data-testid="track-ad" style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...eyebrow }}>Anúncio</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {ad.thumbnailUrl && thumbOk && (
          <img src={ad.thumbnailUrl} alt="Miniatura do criativo" data-testid="track-ad-thumb" referrerPolicy="no-referrer" loading="lazy" onError={() => setThumbOk(false)}
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: 'var(--bg-inner)' }} />
        )}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span data-testid="track-ad-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{ad.title || 'Via Campanha de Mensagem (sem título)'}</span>
          {ad.platform && <span data-testid="track-ad-platform" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ad.platform}{ad.mediaType ? ` · ${ad.mediaType.toLowerCase()}` : ''}</span>}
        </div>
      </div>
      {(ad.creativeUrl || ad.managerUrl) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ad.creativeUrl && <a href={ad.creativeUrl} target="_blank" rel="noopener noreferrer" style={link} data-testid="track-ad-creative"><ExternalLink size={13} /> Ver criativo</a>}
          {ad.managerUrl && <a href={ad.managerUrl} target="_blank" rel="noopener noreferrer" style={link} data-testid="track-ad-manager"><ExternalLink size={13} /> Abrir no Gerenciador de Anúncios</a>}
        </div>
      )}
    </section>
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
