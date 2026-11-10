// Aba "⚡ Automações" (SÓ LEITURA): cada automação do WhatsApp, cada etapa e quem está em cada etapa.
// Lista → detalhe (Etapas · Pessoas · Histórico · Envios) → linha do tempo da pessoa (painel lateral). Busca global por
// pessoa no topo. Nada aqui grava no banco: as leituras ficam em src/lib/waAutomationsDb.ts (só SELECT, páginas de
// 500) e as contas/textos em src/lib/waAutomations.ts (a mesma lógica da extensão, portada e testada).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpRefresh } from '../../lib/erpRefresh';
import { startVisibleInterval } from '../../lib/visibleInterval';
import { makeAutomationsDb, type AutoStats, type Overview, type Person } from '../../lib/waAutomationsDb';
import {
  BOX_STYLE, boxKind, boxText, conversionBySend, endedAt, fmtAgo, fmtDateTime, fmtTime, fmtWhen, funnel, mainPath, maskPhone, matchesPerson, msOf,
  nextStep, OUTCOME_KEYS, outcomeGroup, outcomeText, parkingNode, personTimeline, phoneOfChat, previewLines, scheduleSummary, seqDescribe, seqIndex,
  seqNodeLabel, seqSendSteps, SKIPPED_WAIT_TEXT, skippedWait, startText, statusOf, stopText, waLink, yesSummary,
  type AutomationRow, type ItemRow, type Names, type RunRow, type SendLogRow, type SeqDef, type SeqNode, type TimelineEvent,
} from '../../lib/waAutomations';
import { btn, input, muted, ORANGE } from './shared';
import { EmptyState, eyebrow, GREEN, panel, RED, Skeleton, SkeletonStyle, SLATE } from './ui';

const db = makeAutomationsDb(supabase);
const PURPLE = '#8b5cf6';
// extensão 2.16.8: "Pular espera" já clicado (o próximo envio está na fila)
const SKY = '#0284c7';
function SkippedBadge({ run }: { run: RunRow }) {
  if (!skippedWait(run)) return null;
  return <span data-testid="wa-auto-skipped" style={{ fontSize: 11, fontWeight: 700, color: SKY, background: 'rgba(2,132,199,0.12)', border: '1px solid rgba(2,132,199,0.3)', borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{SKIPPED_WAIT_TEXT}</span>;
}
const AMBER = '#eab308';
const REFRESH_MS = 60 * 1000;

// ── pequenas peças ──
function useNarrow(px = 720) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}
const STATUS_STYLE = { ligada: { text: 'LIGADA', color: GREEN }, desligada: { text: 'DESLIGADA', color: SLATE }, rascunho: { text: 'RASCUNHO', color: AMBER } } as const;
function Badge({ a }: { a: AutomationRow }) {
  const s = STATUS_STYLE[statusOf(a)];
  return <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: s.color, background: `${s.color}22`, border: `1px solid ${s.color}55`, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{s.text}</span>;
}
function Warn({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <div role="alert" style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: RED, fontSize: 12 }}>⚠ {text}. O resto da tela continua funcionando.</div>;
}
const tdS: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-main)', verticalAlign: 'top' };
const thS: React.CSSProperties = { ...eyebrow, padding: '9px 10px', borderBottom: '1px solid var(--border-main)', textAlign: 'left', whiteSpace: 'nowrap' };
const linkBtn: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: ORANGE, fontWeight: 600, cursor: 'pointer', font: 'inherit', textAlign: 'left' };
function Big({ label, value, color }: { label: string; value: number | null | undefined; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: color || 'var(--text-primary)' }}>{value == null ? '—' : value.toLocaleString('pt-BR')}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function FourNumbers({ st }: { st: AutoStats | null | undefined }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
      <Big label="Em andamento agora" value={st?.active} color={ORANGE} />
      <Big label="Responderam ✅" value={st?.responded} color={GREEN} />
      <Big label="Chegaram ao fim sem responder" value={st?.finished} />
      <Big label="Saíram por outro motivo" value={st?.other} color={SLATE} />
    </div>
  );
}
const personName = (p: Person | undefined, chatId: string) => (p && p.name) || maskPhone((p && p.phone) || phoneOfChat(chatId)) || 'Sem nome';
const personPhone = (p: Person | undefined, chatId: string) => (p && p.phone) || phoneOfChat(chatId);
function namesOf(ov: Overview | null): { names: Names; items: Map<string, ItemRow> } {
  const labels = new Map((ov?.labels.data || []).map((l) => [l.id, l.name]));
  const items = new Map((ov?.items.data || []).map((i) => [i.id, i]));
  return {
    items,
    names: {
      item: (id) => (id ? items.get(id)?.title || '(mensagem apagada)' : '(sem mensagem)'),
      // as etiquetas do WhatsApp têm nome só no WhatsApp (o banco guarda o número)
      label: (id, s) => (s === 'whatsapp' ? `nº ${id || '?'}` : (id && labels.get(id)) || '(etiqueta apagada)'),
    },
  };
}

// ══ Tela ══
export default function WaAutomations() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<'todas' | 'ligadas' | 'desligadas'>('todas');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ a: AutomationRow; run: RunRow; person?: Person } | null>(null);
  const running = useRef(false);
  const load = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const o = await db.loadOverview();
      setOv(o);
      setFatal('');
      setAt(Date.now());
      setTick((t) => t + 1);
    } catch (e) { setFatal(String((e as Error)?.message || e)); }
    running.current = false;
    setBusy(false);
  }, []);
  useEffect(() => { load(); return startVisibleInterval(load, REFRESH_MS); }, [load]);
  useErpRefresh(load);
  const { names, items } = useMemo(() => namesOf(ov), [ov]);
  const autos = ov?.automations.data || [];
  const shown = autos.filter((a) => (filter === 'todas' || (filter === 'ligadas' ? a.active : !a.active)) && matchesPerson(q, a.name, null));
  const current = sel ? autos.find((a) => a.id === sel) || null : null;
  const now = at || Date.now();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="wa-automations">
      <SkeletonStyle />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>⚡ Automações do WhatsApp</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Cada automação, cada etapa e quem está em cada etapa agora.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={muted} data-testid="wa-auto-updated">{at ? `Atualizado às ${fmtTime(at)}` : 'Carregando…'}</span>
          <button type="button" style={btn} onClick={load} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>
      {fatal && <Warn text={`Não consegui ler as automações (${fatal})`} />}
      <Warn text={ov?.automations.error} />
      <GlobalSearch autos={autos} names={names} now={now} onOpen={(a, run, person) => setDrawer({ a, run, person })} />
      {current ? (
        <Detail a={current} st={ov?.stats[current.id]} names={names} items={items} tick={tick} now={now} onBack={() => setSel(null)} onPerson={(run, person) => setDrawer({ a: current, run, person })} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['todas', 'ligadas', 'desligadas'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                style={{ ...btn, padding: '6px 12px', ...(filter === f ? { border: `1px solid ${ORANGE}`, color: ORANGE, background: 'rgba(249,115,22,0.1)' } : {}) }}>
                {f === 'todas' ? 'Todas' : f === 'ligadas' ? 'Ligadas' : 'Desligadas'}
              </button>
            ))}
            <input aria-label="Buscar automação pelo nome" placeholder="Buscar automação pelo nome…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, flex: '1 1 200px', maxWidth: 320 }} />
          </div>
          {!ov && !fatal ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>{[0, 1].map((i) => <div key={i} style={panel}><Skeleton h={18} w="60%" /><div style={{ height: 10 }} /><Skeleton h={60} /></div>)}</div>
          ) : !shown.length ? (
            <div style={panel}><EmptyState text={autos.length ? 'Nenhuma automação com esse filtro.' : 'Nenhuma automação criada ainda. Crie pela extensão no WhatsApp Web.'} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
              {shown.map((a) => <AutoCard key={a.id} a={a} ov={ov as Overview} names={names} onOpen={() => setSel(a.id)} />)}
            </div>
          )}
        </>
      )}
      {drawer && <PersonDrawer a={drawer.a} run={drawer.run} person={drawer.person} names={names} now={now} tick={tick} onClose={() => setDrawer(null)} />}
      <div style={{ ...muted, textAlign: 'center', paddingTop: 8 }}>Tela só de consulta. Para editar, use a extensão no WhatsApp Web.</div>
    </div>
  );
}

// ══ 1. Card da lista ══
function AutoCard({ a, ov, names, onOpen }: { a: AutomationRow; ov: Overview; names: Names; onOpen: () => void }) {
  const def = a.sequence as SeqDef | null;
  const st = ov.stats[a.id];
  const nodes = ov.nodes[a.id];
  const f = def && nodes ? funnel(def, nodes.data, names) : null;
  const max = f ? Math.max(1, ...f.rows.map((r) => r.count)) : 1;
  return (
    <button type="button" onClick={onOpen} data-testid="wa-auto-card" aria-label={`Abrir ${a.name}`}
      style={{ ...panel, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, font: 'inherit', color: 'inherit', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{a.name}</span>
        <Badge a={a} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>▶ {startText(a, names)}</span>
        <span style={muted}>{a.activated_at ? `Vale desde: ${fmtDateTime(msOf(a.activated_at))}` : 'Ainda não foi ligada'}{def ? ` · ${scheduleSummary(def)}` : ''}</span>
      </div>
      {a.kind === 'sequencia' ? (
        <>
          {st?.error ? <Warn text={st.error} /> : <FourNumbers st={st?.data} />}
          {nodes?.error ? <Warn text={nodes.error} /> : f && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Pessoas em cada etapa">
              {f.rows.filter((r) => r.kind !== 'enviar' || r.count).map((r) => (
                <div key={r.node} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 32px', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>{BOX_STYLE[r.kind].icon} {r.label}</span>
                  <span style={{ height: 6, borderRadius: 999, background: 'var(--bg-inner)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.count / max) * 100}%`, background: BOX_STYLE[r.kind].color }} /></span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: r.count ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.count}</span>
                </div>
              ))}
              {f.other > 0 && <span style={muted}>+ {f.other} em outro caminho</span>}
            </div>
          )}
        </>
      ) : <span style={muted}>Automação simples (sem etapas). Veja os detalhes na extensão.</span>}
    </button>
  );
}

// ══ 2. Detalhe ══
type Tab = 'etapas' | 'pessoas' | 'historico' | 'envios';
interface DetailProps { a: AutomationRow; st: Overview['stats'][string] | undefined; names: Names; items: Map<string, ItemRow>; tick: number; now: number; onBack: () => void; onPerson: (run: RunRow, p?: Person) => void }
function Detail({ a, st, names, items, tick, now, onBack, onPerson }: DetailProps) {
  const [tab, setTab] = useState<Tab>('etapas');
  const def = (a.sequence || { steps: [] }) as SeqDef;
  // em andamento: carregado aqui (Etapas e Pessoas usam a mesma lista), recarrega a cada atualização sem piscar
  const [active, setActive] = useState<{ runs: RunRow[]; people: Record<string, Person>; error: string | null; peopleError: string | null } | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const r = await db.loadActive(a.id);
      const p = await db.peopleOf(r.data);
      if (!off) setActive({ runs: r.data, people: p.byChat, error: r.error, peopleError: p.error });
    })();
    return () => { off = true; };
  }, [a.id, tick]);
  const TABS: [Tab, string][] = [['etapas', 'Etapas'], ['pessoas', 'Pessoas'], ['historico', 'Histórico'], ['envios', 'Envios']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="wa-auto-detail">
      <div><button type="button" style={linkBtn} onClick={onBack}>← Todas as automações</button></div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{a.name}</h3>
          <Badge a={a} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>▶ {startText(a, names)}</span>
          <span>{a.activated_at ? `Vale desde: ${fmtDateTime(msOf(a.activated_at))}` : 'Ainda não foi ligada'}</span>
          <span>🕘 {scheduleSummary(def)}</span>
          {a.test_chat_id && <span style={{ color: AMBER }}>Em teste (só com uma conversa)</span>}
        </div>
        {st?.error ? <Warn text={st.error} /> : <FourNumbers st={st?.data} />}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', marginBottom: -1, borderBottom: tab === id ? `2px solid ${ORANGE}` : '2px solid transparent', color: tab === id ? ORANGE : 'var(--text-muted)' }}>
            {label}{id === 'pessoas' && active ? ` (${active.runs.length})` : ''}
          </button>
        ))}
      </div>
      {a.kind !== 'sequencia' ? <div style={panel}><EmptyState text="Automação simples: não tem etapas para mostrar aqui." /></div>
        : tab === 'etapas' ? <EtapasTab def={def} names={names} items={items} active={active} now={now} onPerson={onPerson} />
        : tab === 'pessoas' ? <PessoasTab def={def} names={names} active={active} now={now} onPerson={onPerson} />
        : tab === 'historico' ? <HistoricoTab a={a} def={def} names={names} tick={tick} onPerson={onPerson} />
        : <EnviosTab a={a} names={names} tick={tick} />}
    </div>
  );
}

// ── Etapas ──
function ItemPreview({ item }: { item: ItemRow | undefined }) {
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const pv = previewLines(item.body);
  const kind = item.type || 'texto';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 6 }}>
      {kind === 'imagem' && item.file_url ? <img src={item.file_url} alt="" loading="lazy" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flex: 'none', background: 'var(--bg-inner)' }} />
        : kind !== 'texto' ? <span aria-label={kind} style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--bg-inner)', display: 'grid', placeItems: 'center', fontSize: 22, flex: 'none' }}>{kind === 'audio' ? '🎵' : kind === 'video' ? '🎬' : kind === 'documento' ? '📄' : '📎'}</span> : null}
      {item.body ? (
        <div style={{ minWidth: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--bg-inner)', borderRadius: 8, padding: '6px 9px', flex: 1 }}>
          {open ? item.body : pv.text}
          {pv.more && <> {' '}<button type="button" style={{ ...linkBtn, fontSize: 12 }} onClick={() => setOpen(!open)}>{open ? 'ver menos' : 'ver mais'}</button></>}
        </div>
      ) : kind !== 'texto' ? <span style={muted}>{item.file_name || 'arquivo'}</span> : null}
    </div>
  );
}
function PeopleMini({ def, runs, people, now, names, onPerson }: { def: SeqDef; runs: RunRow[]; people: Record<string, Person>; now: number; names: Names; onPerson: (r: RunRow, p?: Person) => void }) {
  if (!runs.length) return <div style={{ ...muted, padding: '6px 0' }}>Ninguém nesta etapa agora.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {runs.slice(0, 100).map((r) => {
        const nx = nextStep(def, r, now, names);
        return (
          <button key={r.id} type="button" onClick={() => onPerson(r, people[r.chat_id])} style={{ ...linkBtn, color: 'var(--text-primary)', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, padding: '5px 8px', borderRadius: 8, background: 'var(--bg-inner)' }}>
            <b>{personName(people[r.chat_id], r.chat_id)}</b>
            <span style={muted}>{maskPhone(personPhone(people[r.chat_id], r.chat_id))}</span>
            <span style={muted}>entrou {fmtAgo(msOf(r.created_at), now)}</span>
            <SkippedBadge run={r} />
            {nx && <span style={{ color: nx.late ? RED : 'var(--text-muted)' }}>→ {nx.text} {fmtWhen(nx.when, now)}</span>}
          </button>
        );
      })}
      {runs.length > 100 && <span style={muted}>… e mais {runs.length - 100} (veja na aba Pessoas)</span>}
    </div>
  );
}
type ActiveData = { runs: RunRow[]; people: Record<string, Person>; error: string | null; peopleError: string | null } | null;
function EtapasTab({ def, names, items, active, now, onPerson }: { def: SeqDef; names: Names; items: Map<string, ItemRow>; active: ActiveData; now: number; onPerson: (r: RunRow, p?: Person) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const path = mainPath(def);
  const byNode = useMemo(() => {
    const m = new Map<string, RunRow[]>();
    (active?.runs || []).forEach((r) => { const k = r.node || ''; m.set(k, [...(m.get(k) || []), r]); });
    return m;
  }, [active]);
  const onPath = new Set(path.map((n) => n.id));
  const elsewhere = (active?.runs || []).filter((r) => !onPath.has(r.node || ''));
  if (!path.length) return <div style={panel}><EmptyState text="Esta automação ainda não tem etapas." /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} data-testid="wa-auto-steps">
      <Warn text={active?.error} />
      {active && !active.runs.length && <div style={{ ...muted, marginBottom: 10 }}>Esta automação ainda não começou para ninguém (ninguém em andamento agora).</div>}
      <div style={{ ...muted, margin: '0 0 8px' }}>▶ Entra na automação · caminho de quem <b>não responde</b> (o ✅ de cada espera fica ao lado)</div>
      {path.map((n, i) => <StepBox key={n.id} def={def} n={n} names={names} items={items} runs={byNode.get(n.id) || []} people={active?.people || {}} now={now} last={i === path.length - 1}
        loading={!active} open={open === n.id} onToggle={() => setOpen(open === n.id ? null : n.id)} onPerson={onPerson} />)}
      {elsewhere.length > 0 && (
        <div style={{ ...panel, marginTop: 12 }}>
          <div style={eyebrow}>Em outro caminho (✅ ou passo removido): {elsewhere.length}</div>
          <PeopleMini def={def} runs={elsewhere} people={active?.people || {}} now={now} names={names} onPerson={onPerson} />
        </div>
      )}
    </div>
  );
}
function StepBox({ def, n, names, items, runs, people, now, last, loading, open, onToggle, onPerson }: {
  def: SeqDef; n: SeqNode; names: Names; items: Map<string, ItemRow>; runs: RunRow[]; people: Record<string, Person>; now: number; last: boolean; loading: boolean; open: boolean; onToggle: () => void; onPerson: (r: RunRow, p?: Person) => void;
}) {
  const k = boxKind(n);
  const s = BOX_STYLE[k];
  const t = boxText(def, n, names);
  const park = parkingNode(n);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10 }} data-testid="wa-auto-step" data-kind={k}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: s.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, flex: 'none' }}>{s.icon}</span>
        {!last && <span style={{ flex: 1, width: 2, background: 'var(--border-main)', minHeight: 14 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 12, minWidth: 0 }}>
        <div style={{ ...panel, padding: 12, borderLeft: `4px solid ${s.color}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: s.color }}>{s.icon} {s.title}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{t.text}</div>
              {t.sub && <div style={muted}>{t.sub}</div>}
              {k === 'enviar' && <ItemPreview item={n.item_id ? items.get(n.item_id) : undefined} />}
            </div>
            {k === 'esperar' && <div style={{ flex: '1 1 200px', fontSize: 12, color: GREEN, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '6px 9px' }}>✅ {yesSummary(def, n, names)}</div>}
          </div>
          {park && (loading ? <Skeleton h={14} w={160} /> : (
            <button type="button" onClick={onToggle} aria-expanded={open} disabled={!runs.length} data-testid="wa-auto-step-count"
              style={{ ...linkBtn, marginTop: 4, fontSize: 15, fontWeight: 800, color: runs.length ? 'var(--text-primary)' : 'var(--text-muted)', cursor: runs.length ? 'pointer' : 'default' }}>
              👥 {runs.length} {runs.length === 1 ? 'pessoa aqui' : 'pessoas aqui'} agora {runs.length ? (open ? '▲' : '▼') : ''}
            </button>
          ))}
          {open && <PeopleMini def={def} runs={runs} people={people} now={now} names={names} onPerson={onPerson} />}
        </div>
      </div>
    </div>
  );
}

// ── Pessoas ──
interface PersonRow { run: RunRow; name: string; phone: string | null; hasName: boolean; step: string; kind: string; entered: number | null; next: ReturnType<typeof nextStep> }
function sortRows<T>(rows: T[], get: (r: T) => string | number | null, desc: boolean) {
  return [...rows].sort((a, b) => {
    const va = get(a); const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return desc ? -c : c;
  });
}
function PessoasTab({ def, names, active, now, onPerson }: { def: SeqDef; names: Names; active: ActiveData; now: number; onPerson: (r: RunRow, p?: Person) => void }) {
  const narrow = useNarrow();
  const [q, setQ] = useState('');
  const [step, setStep] = useState('');
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'next', desc: false });
  const idx = useMemo(() => seqIndex(def), [def]);
  const rows: PersonRow[] = useMemo(() => (active?.runs || []).map((run) => {
    const p = active?.people[run.chat_id];
    const n = run.node ? idx.get(run.node)?.node : null;
    return { run, name: personName(p, run.chat_id), hasName: !!(p && p.name), phone: personPhone(p, run.chat_id), step: seqNodeLabel(def, run.node, names), kind: n ? boxKind(n) : 'outro', entered: msOf(run.created_at), next: nextStep(def, run, now, names) };
  }), [active, def, idx, names, now]);
  if (!active) return <div style={panel}><Skeleton h={16} /><div style={{ height: 8 }} /><Skeleton h={16} /></div>;
  const steps = [...new Set(rows.map((r) => r.run.node || ''))];
  const shown = rows.filter((r) => (!step || (r.run.node || '') === step) && matchesPerson(q, r.hasName ? r.name : '', r.phone));
  const COLS: [string, string, (r: PersonRow) => string | number | null][] = [
    ['nome', 'Nome', (r) => (r.hasName ? r.name : null)], ['tel', 'Telefone', (r) => r.phone], ['etapa', 'Etapa atual', (r) => r.step], ['entrou', 'Entrou em', (r) => r.entered],
    ['next', 'Próximo passo', (r) => (r.next ? r.next.when : null)],
  ];
  const col = COLS.find((c) => c[0] === sort.key) || COLS[4];
  const sorted = sortRows(shown, col[2], sort.desc);
  const when = (r: PersonRow) => r.next && (
    <span style={{ fontWeight: r.next.late || fmtWhen(r.next.when, now).startsWith('hoje') ? 700 : 400, color: r.next.late ? RED : fmtWhen(r.next.when, now).startsWith('hoje') ? ORANGE : 'var(--text-primary)' }}>
      {fmtWhen(r.next.when, now)}{r.next.late ? ' · atrasado' : ''}
    </span>
  );
  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="wa-auto-people">
      <Warn text={active.error} /><Warn text={active.peopleError} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label="Buscar por nome ou telefone" placeholder="Buscar por nome ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, flex: '1 1 200px' }} />
        <select aria-label="Filtrar por etapa" value={step} onChange={(e) => setStep(e.target.value)} style={{ ...input, maxWidth: 320 }}>
          <option value="">Todas as etapas</option>
          {steps.map((s) => <option key={s} value={s}>{seqNodeLabel(def, s, names)}</option>)}
        </select>
        {narrow && <select aria-label="Ordenar por" value={sort.key} onChange={(e) => setSort({ key: e.target.value, desc: false })} style={input}>{COLS.map(([k, l]) => <option key={k} value={k}>Ordenar: {l}</option>)}</select>}
      </div>
      {!rows.length ? <EmptyState text="Ninguém em andamento nesta automação agora." /> : !sorted.length ? <EmptyState text="Ninguém com esse filtro." /> : narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.slice(0, 300).map((r) => (
            <button key={r.run.id} type="button" onClick={() => onPerson(r.run, active.people[r.run.chat_id])} style={{ ...panel, padding: 12, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <b style={{ color: 'var(--text-primary)' }}>{r.name} <span style={{ ...muted, fontWeight: 400 }}>{maskPhone(r.phone)}</span> <SkippedBadge run={r.run} /></b>
              <span style={{ fontSize: 12 }}>{BOX_STYLE[r.kind as keyof typeof BOX_STYLE]?.icon} {r.step}</span>
              <span style={muted}>Entrou {fmtDateTime(r.entered)} ({fmtAgo(r.entered, now)})</span>
              {r.next && <span style={{ fontSize: 12 }}>→ {r.next.text} · {when(r)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>{COLS.map(([k, l]) => (
              <th key={k} style={thS} aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                <button type="button" onClick={() => setSort({ key: k, desc: sort.key === k ? !sort.desc : false })} style={{ ...linkBtn, color: sort.key === k ? ORANGE : 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {l}{sort.key === k ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}</tr></thead>
            <tbody>{sorted.slice(0, 500).map((r) => (
              <tr key={r.run.id} onClick={() => onPerson(r.run, active.people[r.run.chat_id])} style={{ cursor: 'pointer' }} data-testid="wa-auto-person-row">
                <td style={tdS}>{r.hasName ? <b>{r.name}</b> : <span style={muted}>Sem nome</span>}{skippedWait(r.run) && <div style={{ marginTop: 3 }}><SkippedBadge run={r.run} /></div>}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{maskPhone(r.phone)}</td>
                <td style={tdS}>{BOX_STYLE[r.kind as keyof typeof BOX_STYLE]?.icon} {r.step}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDateTime(r.entered)}<div style={muted}>{fmtAgo(r.entered, now)}</div></td>
                <td style={tdS}>{r.next ? <>{r.next.text}<div>{when(r)}</div></> : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {sorted.length > 500 && <div style={muted}>Mostrando 500 de {sorted.length}. Use a busca ou o filtro de etapa.</div>}
        </div>
      )}
    </div>
  );
}

// ── Histórico ──
function HistoricoTab({ a, def, names, tick, onPerson }: { a: AutomationRow; def: SeqDef; names: Names; tick: number; onPerson: (r: RunRow, p?: Person) => void }) {
  const narrow = useNarrow();
  const [days, setDays] = useState(30);
  const [motive, setMotive] = useState('');
  const [data, setData] = useState<{ key: string; runs: RunRow[]; people: Record<string, Person>; sent: Record<string, number>; error: string | null; sentError: string | null } | null>(null);
  const key = `${a.id}|${days}`;
  useEffect(() => {
    let off = false;
    (async () => {
      const [h, s] = await Promise.all([db.loadHistory(a.id, days), db.loadSentByItem(a.id, seqSendSteps(def).map((x) => x.itemId || ''), days)]);
      const p = await db.peopleOf(h.data);
      if (!off) setData({ key, runs: h.data, people: p.byChat, sent: s.data, error: h.error || p.error, sentError: s.error });
    })();
    return () => { off = true; };
  }, [a.id, days, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const conv = useMemo(() => (data ? conversionBySend(def, data.runs, data.sentError ? null : data.sent, names) : []), [data, def, names]);
  const motives = [...new Set((data?.runs || []).map((r) => r.outcome || ''))].sort((x, y) => OUTCOME_KEYS.indexOf(x) - OUTCOME_KEYS.indexOf(y));
  const shown = (data?.runs || []).filter((r) => !motive || (r.outcome || '') === motive);
  const color = (o: string | null | undefined) => (outcomeGroup(o) === 'respondeu' ? GREEN : outcomeGroup(o) === 'fim' ? 'var(--text-primary)' : SLATE);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="wa-auto-history">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} style={{ ...btn, padding: '6px 12px', ...(days === d ? { border: `1px solid ${ORANGE}`, color: ORANGE } : {}) }}>{d} dias</button>)}
        <select aria-label="Filtrar por motivo" value={motive} onChange={(e) => setMotive(e.target.value)} style={input}>
          <option value="">Todos os motivos</option>
          {motives.map((m) => <option key={m} value={m}>{outcomeText(m || null)}</option>)}
        </select>
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={eyebrow}>Responderam depois de cada mensagem ({days} dias)</div>
        {!data ? <Skeleton h={14} /> : <Warn text={data.sentError} />}
        {data && (conv.every((c) => !c.responded && !c.sent) ? <span style={muted}>Ninguém respondeu nem recebeu mensagens desta automação no período.</span> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {conv.map((c) => (
              <span key={c.key} style={{ fontSize: 12, padding: '5px 9px', borderRadius: 8, background: 'var(--bg-inner)' }}>
                {c.label}: <b style={{ color: c.responded ? GREEN : 'var(--text-primary)' }}>{c.responded}</b>
                {c.sent != null && <span style={muted}> de {c.sent} enviados{c.rate != null ? ` (${Math.round(c.rate * 100)}%)` : ''}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={eyebrow}>Últimos {shown.length} percursos encerrados (máx. 200)</div>
        {!data ? <Skeleton h={40} /> : <Warn text={data.error} />}
        {data && (!shown.length ? <EmptyState text="Ninguém saiu desta automação no período." /> : narrow ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map((r) => (
              <button key={r.id} type="button" onClick={() => onPerson(r, data.people[r.chat_id])} style={{ ...linkBtn, color: 'var(--text-primary)', padding: 10, borderRadius: 10, background: 'var(--bg-inner)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b>{personName(data.people[r.chat_id], r.chat_id)}</b>
                <span style={{ fontSize: 12, color: color(r.outcome) }}>{outcomeText(r.outcome)}</span>
                <span style={muted}>{fmtDateTime(msOf(r.created_at))} → {fmtDateTime(endedAt(r))} · parou em {stopText(def, r, names)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>{['Pessoa', 'Entrou em', 'Terminou em', 'Parou em', 'Motivo'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id} onClick={() => onPerson(r, data.people[r.chat_id])} style={{ cursor: 'pointer' }}>
                  <td style={tdS}><b>{personName(data.people[r.chat_id], r.chat_id)}</b><div style={muted}>{maskPhone(personPhone(data.people[r.chat_id], r.chat_id))}</div></td>
                  <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDateTime(msOf(r.created_at))}</td>
                  <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDateTime(endedAt(r))}</td>
                  <td style={tdS}>{stopText(def, r, names)}</td>
                  <td style={{ ...tdS, color: color(r.outcome), fontWeight: 600 }}>{outcomeText(r.outcome)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Envios ──
const SEND_STATUS: Record<string, { text: string; color: string }> = { enviado: { text: 'Enviado', color: GREEN }, pulado: { text: 'Pulado', color: SLATE }, falhou: { text: 'Erro', color: RED }, enviando: { text: 'Enviando…', color: ORANGE } };
function EnviosTab({ a, names, tick }: { a: AutomationRow; names: Names; tick: number }) {
  const narrow = useNarrow();
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState('');
  const [pagesN, setPagesN] = useState(1);
  const [data, setData] = useState<{ rows: SendLogRow[]; more: boolean; people: Record<string, Person>; error: string | null } | null>(null);
  useEffect(() => { setPagesN(1); }, [a.id, days, status]);
  useEffect(() => {
    let off = false;
    (async () => {
      const rows: SendLogRow[] = [];
      let error: string | null = null;
      let more = false;
      for (let p = 0; p < pagesN; p++) {
        const r = await db.loadSends(a.id, { days, status: status || null, page: p });
        if (r.error) { error = r.error; break; }
        rows.push(...r.data);
        more = r.data.length === 500;
        if (!more) break;
      }
      const pp = await db.peopleOf(rows.filter((r) => r.chat_id).map((r) => ({ chat_id: r.chat_id as string, contact_id: r.contact_id })));
      if (!off) setData({ rows, more, people: pp.byChat, error: error || pp.error });
    })();
    return () => { off = true; };
  }, [a.id, days, status, pagesN, tick]);
  const who = (r: SendLogRow) => (r.chat_id ? personName(data?.people[r.chat_id], r.chat_id) : 'Aviso da automação');
  const res = (r: SendLogRow) => { const s = SEND_STATUS[r.status] || { text: r.status, color: SLATE }; return <span style={{ color: s.color, fontWeight: 700 }}>{s.text}{r.reason ? <span style={{ ...muted, fontWeight: 400 }}> · {r.reason}</span> : null}</span>; };
  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="wa-auto-sends">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} style={{ ...btn, padding: '6px 12px', ...(days === d ? { border: `1px solid ${ORANGE}`, color: ORANGE } : {}) }}>{d} dias</button>)}
        <select aria-label="Filtrar por resultado" value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
          <option value="">Todos os resultados</option><option value="enviado">Enviado</option><option value="pulado">Pulado</option><option value="falhou">Erro</option>
        </select>
      </div>
      {!data ? <Skeleton h={40} /> : <Warn text={data.error} />}
      {data && (!data.rows.length ? <EmptyState text="Nenhum envio desta automação no período." /> : narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.rows.map((r) => <div key={r.id} style={{ padding: 10, borderRadius: 10, background: 'var(--bg-inner)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}><b>{who(r)}</b><span>{names.item(r.item_id)}</span><span style={muted}>{fmtDateTime(msOf(r.created_at))}</span>{res(r)}</div>)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>{['Data e hora', 'Pessoa', 'Mensagem', 'Resultado'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}><td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtDateTime(msOf(r.created_at))}</td><td style={tdS}>{who(r)}</td><td style={tdS}>{r.item_id ? names.item(r.item_id) : '—'}</td><td style={tdS}>{res(r)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {data?.more && <button type="button" style={{ ...btn, alignSelf: 'center' }} onClick={() => setPagesN(pagesN + 1)}>Carregar mais 500</button>}
    </div>
  );
}

// ══ Linha do tempo da pessoa (painel lateral) ══
function PersonDrawer({ a, run, person, names, now, tick, onClose }: { a: AutomationRow; run: RunRow; person?: Person; names: Names; now: number; tick: number; onClose: () => void }) {
  const def = useMemo(() => (a.sequence || { steps: [] }) as SeqDef, [a.sequence]);
  const [sends, setSends] = useState<{ rows: SendLogRow[]; error: string | null } | null>(null);
  useEffect(() => {
    let off = false;
    db.loadPersonSends(a.id, run.chat_id).then((r) => { if (!off) setSends({ rows: r.data, error: r.error }); });
    return () => { off = true; };
  }, [a.id, run.chat_id, tick]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const tl: TimelineEvent[] = useMemo(() => personTimeline(def, run, sends?.rows || [], now, names), [def, run, sends, now, names]);
  const phone = personPhone(person, run.chat_id);
  const link = waLink(phone);
  return (
    <div role="dialog" aria-modal="true" aria-label="Linha do tempo da pessoa" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} data-testid="wa-auto-drawer">
      <button type="button" aria-label="Fechar" onClick={onClose} style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(0,0,0,0.45)', cursor: 'pointer' }} />
      <div style={{ position: 'relative', width: 'min(440px, 100vw)', height: '100%', overflowY: 'auto', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-main)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{personName(person, run.chat_id)}</div>
            <div style={muted}>{maskPhone(phone)} · {a.name}</div>
            <div style={{ fontSize: 12, marginTop: 4, color: run.status === 'ativo' ? ORANGE : 'var(--text-muted)' }}>{run.status === 'ativo' ? `Agora: ${seqDescribe(def, run, now, names)}` : `Encerrado: ${outcomeText(run.outcome)}`} <SkippedBadge run={run} /></div>
          </div>
          <button type="button" style={{ ...btn, padding: '4px 10px', alignSelf: 'flex-start' }} onClick={onClose}>✕</button>
        </div>
        {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...btn, justifyContent: 'center', textDecoration: 'none', background: GREEN, border: `1px solid ${GREEN}`, color: '#fff' }}>Abrir no WhatsApp</a>}
        <Warn text={sends?.error} />
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }} data-testid="wa-auto-timeline">
          {tl.map((e, i) => {
            const c = e.done ? (e.kind === 'respondeu' ? GREEN : e.kind === 'erro' ? RED : e.kind === 'nao' ? PURPLE : ORANGE) : e.late ? RED : SLATE;
            return (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 8 }} data-done={e.done ? '1' : '0'}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${c}`, background: e.done ? c : 'transparent', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center', flex: 'none' }}>{e.done ? '✓' : ''}</span>
                  {i < tl.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--border-main)', minHeight: 12 }} />}
                </div>
                <div style={{ paddingBottom: 12, opacity: e.done ? 1 : 0.75 }}>
                  <div style={{ fontSize: 13, color: e.done ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: e.done ? 600 : 400 }}>{e.text}</div>
                  <div style={{ fontSize: 11, color: e.late ? RED : 'var(--text-muted)' }}>{e.when ? (e.done ? fmtDateTime(e.when) : `previsto: ${fmtWhen(e.when, now)}${e.late ? ' · atrasado' : ''}`) : e.done ? '' : 'previsto: depende da sua mensagem'}{e.detail ? ` · ${e.detail}` : ''}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <div style={muted}>Os próximos passos (cinza) supõem que a pessoa não responde. Se ela responder, segue o caminho ✅.</div>
      </div>
    </div>
  );
}

// ══ 3. Busca global por pessoa ══
function GlobalSearch({ autos, names, now, onOpen }: { autos: AutomationRow[]; names: Names; now: number; onOpen: (a: AutomationRow, run: RunRow, p?: Person) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ q: string; groups: { key: string; person: Person; runs: RunRow[] }[]; error: string | null } | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes(null); return; }
    let off = false;
    const h = setTimeout(async () => {
      const r = await db.searchPeople(t);
      if (off) return;
      const groups = r.data.contacts.map((c) => {
        const chats = new Set([c.chat_id, c.phone ? `${c.phone}@c.us` : null].filter(Boolean));
        return { key: c.id, person: { name: c.name, phone: c.phone } as Person, runs: r.data.runs.filter((x) => x.contact_id === c.id || chats.has(x.chat_id)) };
      });
      setRes({ q: t, groups, error: r.error });
    }, 400);
    return () => { off = true; clearTimeout(h); };
  }, [q]);
  const byId = new Map(autos.map((a) => [a.id, a]));
  return (
    <div style={{ ...panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="wa-auto-search">
      <input aria-label="Buscar pessoa" placeholder="🔍 Buscar pessoa por nome ou telefone (em quais automações está ou esteve)" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
      {res && <Warn text={res.error} />}
      {res && !res.error && (!res.groups.length ? <span style={muted}>Ninguém encontrado com “{res.q}”.</span> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {res.groups.map((g) => (
            <div key={g.key} style={{ padding: 10, borderRadius: 10, background: 'var(--bg-inner)' }}>
              <b style={{ fontSize: 13 }}>{g.person.name || 'Sem nome'}</b> <span style={muted}>{maskPhone(g.person.phone)}</span>
              {!g.runs.length ? <div style={muted}>Não está nem esteve em nenhuma automação.</div> : g.runs.map((r) => {
                const a = byId.get(r.automation_id);
                const def = (a?.sequence || { steps: [] }) as SeqDef;
                const nx = r.status === 'ativo' ? nextStep(def, r, now, names) : null;
                return (
                  <div key={r.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, marginTop: 4 }}>
                    <span style={{ fontWeight: 700 }}>{a ? a.name : 'automação apagada'}</span>
                    <span style={{ color: r.status === 'ativo' ? ORANGE : 'var(--text-muted)' }}>{r.status === 'ativo' ? seqNodeLabel(def, r.node, names) : `saiu: ${outcomeText(r.outcome)}`}</span>
                    {nx && <span style={{ color: nx.late ? RED : 'var(--text-muted)' }}>→ {nx.text} {fmtWhen(nx.when, now)}</span>}
                    {a && <button type="button" style={{ ...linkBtn, fontSize: 12 }} onClick={() => onOpen(a, r, g.person)}>Linha do tempo</button>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
