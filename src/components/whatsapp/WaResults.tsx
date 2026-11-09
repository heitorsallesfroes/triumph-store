// Aba "Resultados" ("meus follow-ups funcionam?"): funil por caminho (cada automação/régua e sequência), follow-ups
// acumulados fora de uma régua, resultado por mensagem de follow-up, disparos e o rodapé das vendas. Contas em
// src/lib/waResults.ts (mesma leitura do Painel: src/lib/waPanelDb.ts). Só leitura.
import { useEffect, useMemo, useState } from 'react';
import { periodRanges, type PeriodPreset } from '../../lib/waPanel';
import { loadPanel, type PanelLoad } from '../../lib/waPanelDb';
import { useErpRefresh } from '../../lib/erpRefresh';
import { computeResults, type FollowMessageCard, type PathFunnel, type StageStats } from '../../lib/waResults';
import { ORANGE } from './shared';
import { EmptyState, eyebrow, fmtInt, fmtMinutes, fmtMoney, fmtPct, GREEN, InfoTip, panel, SectionHeader, Skeleton, SkeletonStyle, SLATE, BLUE } from './ui';
import { br, Card, PeriodPicker, TableSkeleton, ymd } from './WaPanel';

const INFO = {
  paths: 'Um bloco por automação/régua (construtor visual da extensão 2.13.0) e por sequência. Etapa = o 1º, 2º, 3º… envio da automação para a conversa; contam as conversas que ENTRARAM no período (1º envio no período). Conta conversas, não envios.',
  responded: 'Respondeu = o cliente mandou mensagem depois daquele envio e antes do próximo follow. O tempo é a mediana até a resposta.',
  bought: 'Comprou = venda pelo WhatsApp ligada à conversa até 7 dias depois do último follow recebido (antes do próximo).',
  followed: 'Seguiu = recebeu a etapa seguinte. O tempo é a mediana entre as duas etapas.',
  accumulated: 'Follow-ups enviados fora de uma régua: mensagens rápidas marcadas como follow-up (etapa 1, 2, 3…) mandadas à mão. Agrupados pela etapa marcada, com as mesmas regras.',
  messages: 'Cada mensagem marcada como follow-up ou enviada por uma automação: quantas conversas receberam no período, quantas responderam (antes do próximo follow) e quantas compraram até 7 dias depois.',
  campaigns: 'Por disparo: mensagens enviadas no período, quantas foram respondidas e as vendas pelo WhatsApp da conversa em até 7 dias depois do envio. Com variações da mensagem, o mesmo para cada variação.',
  footer: 'Vendas pelo WhatsApp do período (data da venda). "Depois de um follow": até 7 dias depois do último follow recebido. "Vieram de anúncio": conversa de anúncio ou venda com origem anúncio.',
};

type Loaded = { load: PanelLoad; key: string };

export default function WaResults() {
  const today = new Date();
  const [preset, setPreset] = useState<PeriodPreset>('30d');
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)));
  const [end, setEnd] = useState(ymd(today));
  const ranges = useMemo(() => periodRanges(preset, Date.now(), { start, end }), [preset, start, end]);
  const r = ranges.cur;
  const key = `${r.fromDay}|${r.toDay}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setError('');
    loadPanel(ranges).then((load) => { if (alive) setData({ load, key }); }).catch((e) => { if (alive) setError((e && e.message) || 'Erro ao carregar'); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useErpRefresh(() => loadPanel(ranges).then((load) => setData({ load, key }))); // "Atualizar" do topo
  const loading = !data || data.key !== key;
  const res = useMemo(() => (data && !loading ? computeResults(data.load.input, r) : null), [data, loading, r]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} data-testid="wa-results">
      <SkeletonStyle />
      <SectionHeader title="Resultados" subtitle={`Meus follow-ups funcionam? ${br(r.fromDay)} a ${br(r.toDay)}`}
        right={<PeriodPicker preset={preset} setPreset={setPreset} start={start} end={end} setStart={setStart} setEnd={setEnd} />} />
      {error && <div style={{ ...panel, color: '#ef4444', fontSize: 13 }}>{error}</div>}

      <Card title="Funil por caminho" info={INFO.paths} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>conta conversas, não envios</span>} testId="res-paths">
        {!res ? <Skeleton h={180} /> : !res.paths.length ? <EmptyState text="Nenhuma automação ou régua enviou follow-up para conversas que entraram neste período." /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{res.paths.map((p) => <PathBlock key={p.id} p={p} />)}</div>
        )}
      </Card>

      <Card title="Acumulados" info={INFO.accumulated} right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>follow-ups fora de uma régua, por etapa</span>} testId="res-acc">
        {!res ? <Skeleton h={140} /> : !res.accumulated.length ? <EmptyState text="Nenhum follow-up fora de régua neste período. Marque as mensagens rápidas como follow-up (etapa 1, 2, 3…) na extensão." /> : (
          <Stages stages={res.accumulated} label={(s) => `Etapa ${s.step}`} />
        )}
      </Card>

      <Card title="Resultado por mensagem de follow-up" info={INFO.messages} testId="res-msgs">
        {!res ? <TableSkeleton /> : !res.messages.length ? <EmptyState text="Nenhuma mensagem de follow-up enviada neste período." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>{res.messages.map((m) => <MessageCard key={m.id} m={m} />)}</div>
        )}
      </Card>

      <Card title="Disparos" info={INFO.campaigns} testId="res-camps">
        {!res ? <TableSkeleton /> : !res.campaigns.length ? <EmptyState text="Nenhum disparo enviado neste período." /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {res.campaigns.map((c) => (
              <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)', fontSize: 13 }}>
                <b style={{ flex: '1 1 200px', color: 'var(--text-primary)' }}>{c.name}</b>
                <span>{fmtInt(c.sent)} enviadas</span>
                <span>💬 {fmtPct(c.repliedPct)} responderam</span>
                <span>💰 {fmtInt(c.sales)} venda{c.sales === 1 ? '' : 's'} · <b style={{ color: GREEN }}>{fmtMoney(c.revenue)}</b></span>
                {c.variants.length > 0 && (
                  <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, color: 'var(--text-secondary)' }} data-testid="res-camp-variants">
                    {c.variants.map((v) => (
                      <span key={v.id}>{v.name}: {fmtInt(v.sent)} enviadas · 💬 {fmtPct(v.repliedPct)} responderam · 💰 {fmtInt(v.sales)} venda{v.sales === 1 ? '' : 's'} · {fmtMoney(v.revenue)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <section style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 13 }} data-testid="res-footer">
        {!res ? <Skeleton h={16} w="60%" /> : (<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-primary)' }}>Vendas pelo WhatsApp: {fmtInt(res.footer.sales)} ({fmtMoney(res.footer.revenue)}) <InfoTip text={INFO.footer} /></span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>{fmtInt(res.footer.afterFollow)} depois de um follow ({fmtMoney(res.footer.afterFollowRevenue)})</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>{fmtInt(res.footer.fromAd)} vieram de anúncio ({fmtMoney(res.footer.fromAdRevenue)})</span>
        </>)}
      </section>
    </div>
  );
}

function PathBlock({ p }: { p: PathFunnel }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border-main)', background: 'var(--bg-inner)', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="res-path">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, color: ORANGE }}>{p.name}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', overflowWrap: 'anywhere' }} data-testid="res-path-title">{p.titles.join(' → ')}</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }} data-testid="res-path-head">
          <b style={{ color: 'var(--text-primary)' }}>{fmtInt(p.entered)}</b> entraram · <b style={{ color: 'var(--text-primary)' }}>{fmtInt(p.bought)}</b> compraram ({fmtPct(p.boughtPct)}) · <b style={{ color: GREEN }}>{fmtMoney(p.revenue)}</b>
        </div>
      </div>
      <Stages stages={p.stages} label={(s) => s.title} />
    </div>
  );
}

function Stages({ stages, label }: { stages: StageStats[]; label: (s: StageStats) => string }) {
  const top = Math.max(1, ...stages.map((s) => s.reached));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stages.map((s, i) => (
        <div key={s.step} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'start' }} data-testid="res-stage">
          <span style={{ width: 28, height: 28, borderRadius: 999, background: ORANGE, color: '#fff', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{s.step}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ position: 'relative', height: 30, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-main)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.max(2, (s.reached / top) * 100)}%`, background: 'rgba(249,115,22,0.22)', transition: 'width .3s' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%', padding: '0 10px', fontSize: 13, gap: 8 }}>
                <b style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(s)}</b>
                <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }} data-testid="res-reached">{fmtInt(s.reached)} conversa{s.reached === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span data-testid="res-resp" title={INFO.responded}>💬 {fmtPct(s.respondedPct)} responderam ({fmtInt(s.responded)}{s.medianMinutes != null ? ` · em ${fmtMinutes(s.medianMinutes)}` : ''})</span>
              <span data-testid="res-buy" title={INFO.bought}>💰 {fmtInt(s.bought)} compraram · <b style={{ color: GREEN }}>{fmtMoney(s.revenue)}</b></span>
              {i < stages.length - 1 || s.followed ? (
                <span data-testid="res-follow" title={INFO.followed} style={{ color: BLUE }}>↓ {fmtPct(s.followedPct)} seguiram{s.followDays != null ? ` · ${fmtDays(s.followDays)} depois` : ''}</span>
              ) : <span style={{ color: SLATE }}>fim do caminho</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
const fmtDays = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : `${Math.round(d * 10) / 10}d`.replace('.', ','));

function MessageCard({ m }: { m: FollowMessageCard }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border-main)', background: 'var(--bg-inner)', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="res-msg">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <b style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{m.title}</b>
        {m.step != null && <span style={{ ...eyebrow, color: ORANGE, whiteSpace: 'nowrap' }}>Follow {m.step}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtInt(m.received)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>receberam</span></div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>💬 {fmtPct(m.respondedPct)} responderam{m.medianMinutes != null ? ` · em ${fmtMinutes(m.medianMinutes)}` : ''}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>💰 {fmtPct(m.boughtPct)} compraram · <b style={{ color: GREEN }}>{fmtMoney(m.revenue)}</b></div>
    </div>
  );
}
