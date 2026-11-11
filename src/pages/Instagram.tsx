// Página Instagram com abas internas (FASE 2), como a página WhatsApp (?pagina=instagram&aba=rastreio):
//   - Visão geral (FASE 1): métricas profissionais da conta, SÓ LEITURA (nada é publicado, respondido ou alterado e
//     nada grava no ERP). Dados: edge function "instagram" (src/lib/igDb.ts); regras de "O que funciona":
//     src/lib/igInsights.ts.
//   - Rastreio (FASE 2): links rastreáveis /l/<apelido> → WhatsApp → venda (src/components/instagram/IgTracking.tsx).
//   - Direct e Automações: "em breve" (desabilitadas).
// README: src/pages/Instagram.README.md
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Instagram as InstagramIcon, RefreshCw, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useErpRefresh } from '../lib/erpRefresh';
import { initialTab, writeTab } from '../lib/erpRoute';
import IgTracking from '../components/instagram/IgTracking';
import {
  IG_PERIODS, KIND_COLOR, KIND_LABEL, SORT_LABEL, GENDER_LABEL,
  audienceShare, bestFormat, bestTimes, bioTaps, deltaOf, deltaText, engagementOf, fmtDuration, fmtN, fmtPct, fmtWhen, frequencyVsReach, sortAges, sortMedia, sortValue, topBy,
  type IgMedia, type IgPeriod, type IgTotals, type SortKey,
} from '../lib/igInsights';
import { IgError, loadAudience, loadDaily, loadMedia, loadMediaDetail, loadTop, type IgAudience, type IgDaily, type IgMediaLoad, type IgTop } from '../lib/igDb';

const ORANGE = '#f97316';
const bd = 'var(--border-main)';
const box: React.CSSProperties = { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: bd, borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chip = (on: boolean): React.CSSProperties => ({ ...btn, padding: '6px 12px', borderRadius: 999, ...(on ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : {}) });
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };
const errText = (e: unknown) => (e instanceof IgError && e.notPublished ? 'A edge function "instagram" precisa ser publicada no Supabase.' : e instanceof Error ? e.message : String(e));

type Mode = 'simples' | 'completo';
type Load<T> = { data: T | null; error: string | null; loading: boolean };
const empty = <T,>(): Load<T> => ({ data: null, error: null, loading: true });

const KPIS: { id: string; label: string; get: (t: IgTotals) => number | null; hint: string }[] = [
  { id: 'seguidores', label: 'Seguidores ganhos', get: (t) => t.net_followers, hint: 'Líquido: novos seguidores − deixaram de seguir' },
  { id: 'alcance', label: 'Alcance', get: (t) => t.reach, hint: 'Contas diferentes que viram seus conteúdos' },
  { id: 'visualizacoes', label: 'Visualizações', get: (t) => t.views, hint: 'Vezes que seus conteúdos foram vistos (substitui "impressões")' },
  { id: 'engajadas', label: 'Contas com engajamento', get: (t) => t.accounts_engaged, hint: 'Contas que curtiram, comentaram, salvaram, compartilharam ou responderam' },
  { id: 'interacoes', label: 'Interações totais', get: (t) => t.total_interactions, hint: 'Curtidas + comentários + salvamentos + compartilhamentos + respostas' },
  { id: 'visitas', label: 'Visitas ao perfil', get: (t) => t.profile_views, hint: 'Vezes que o perfil foi aberto' },
  { id: 'bio', label: 'Toques no link da bio', get: (t) => bioTaps(t), hint: 'Toques no link do perfil' },
];
const SORTS: SortKey[] = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'follows', 'engagement'];
const fmtSort = (m: IgMedia, k: SortKey) => (k === 'engagement' ? fmtPct(sortValue(m, k)) : fmtN(sortValue(m, k)));

// ── abas da página (mesmo visual das abas da página WhatsApp) ──
type PageTab = 'visao-geral' | 'rastreio';
const PAGE_TABS: { id: string; label: string; ready: boolean }[] = [
  { id: 'visao-geral', label: 'Visão geral', ready: true }, { id: 'rastreio', label: 'Rastreio', ready: true },
  { id: 'direct', label: 'Direct', ready: false }, { id: 'automacoes', label: 'Automações', ready: false },
];
export default function Instagram() {
  const [tab, setTab] = useState<PageTab>(() => initialTab('instagram', ['visao-geral', 'rastreio'] as const, 'visao-geral'));
  useEffect(() => { writeTab('instagram', tab); }, [tab]);
  return (
    <div className="igs" data-testid="ig-shell">
      <style>{'.igs .igs-head{padding:24px 24px 0}@media (max-width:760px){.igs .igs-head{padding:16px 16px 0}}'}</style>
      <div className="igs-head">
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
          <InstagramIcon size={28} color={ORANGE} /> Instagram
        </h1>
        <div role="tablist" aria-label="Abas do Instagram" style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
          {PAGE_TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} disabled={!t.ready} aria-disabled={!t.ready} data-testid={`ig-tab-${t.id}`}
                onClick={() => { if (t.ready) setTab(t.id as PageTab); }} title={t.ready ? undefined : 'Em breve'}
                style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: t.ready ? 'pointer' : 'not-allowed', background: 'transparent', border: 'none', marginBottom: -1,
                  borderBottom: on ? `2px solid ${ORANGE}` : '2px solid transparent', color: on ? ORANGE : 'var(--text-muted)', opacity: t.ready ? 1 : 0.55 }}>
                {t.label}{!t.ready && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>em breve</span>}
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'visao-geral' && <IgOverview />}
      {tab === 'rastreio' && <div style={{ padding: 24, color: 'var(--text-primary)' }} className="igs-body"><IgTracking /></div>}
    </div>
  );
}

// ── Visão geral (FASE 1, sem mudanças além da conferência do gráfico diário) ──
function IgOverview() {
  const [days, setDays] = useState<IgPeriod>(() => { const v = Number(store.get('ig:dias')); return (IG_PERIODS as number[]).includes(v) ? (v as IgPeriod) : 30; });
  const [mode, setMode] = useState<Mode>(() => (store.get('ig:modo') === 'completo' ? 'completo' : 'simples'));
  const [sort, setSort] = useState<SortKey>('views');
  const [top, setTop] = useState<Load<IgTop>>(empty);
  const [daily, setDaily] = useState<Load<IgDaily>>(empty);
  const [media, setMedia] = useState<Load<IgMediaLoad>>(empty);
  const [aud, setAud] = useState<Load<IgAudience>>(empty);
  const [at, setAt] = useState<number | null>(null);
  const [open, setOpen] = useState<IgMedia | null>(null);
  const [showAll, setShowAll] = useState(false);
  const run = useRef(0);

  const load = async (d: number, fresh: boolean) => {
    const id = ++run.current;
    const ok = () => id === run.current;
    // outro período: limpa a tela (não mostra os números do período anterior); Atualizar: mantém até chegar o novo
    const reset = <T,>(s: Load<T>): Load<T> => (fresh ? { ...s, loading: true, error: null } : empty<T>());
    setTop(reset);
    setDaily(reset);
    setMedia(reset);
    setAud(reset);
    // 1º o topo (perfil + cartões); depois gráfico, conteúdos e público ao mesmo tempo
    try { const t = await loadTop(d, fresh); if (ok()) setTop({ data: t, error: null, loading: false }); } catch (e) { if (ok()) setTop({ data: null, error: errText(e), loading: false }); }
    if (!ok()) return;
    const part = <T,>(p: Promise<T>, set: (l: Load<T>) => void) => p.then((v) => { if (ok()) set({ data: v, error: null, loading: false }); }, (e) => { if (ok()) set({ data: null, error: errText(e), loading: false }); });
    await Promise.all([part(loadDaily(d, fresh), setDaily), part(loadMedia(d, fresh), setMedia), part(loadAudience(fresh), setAud)]);
    if (ok()) setAt(Date.now());
  };
  useEffect(() => { load(days, false); }, [days]);
  useErpRefresh(() => load(days, true));
  const pickDays = (d: IgPeriod) => { store.set('ig:dias', String(d)); setShowAll(false); setDays(d); };
  const pickMode = (m: Mode) => { store.set('ig:modo', m); setMode(m); };
  const busy = top.loading || daily.loading || media.loading || aud.loading;

  const warnings = [...new Set([...(top.data?.warnings || []), ...(daily.data?.warnings || []), ...(media.data?.warnings || []), ...(mode === 'completo' ? aud.data?.warnings || [] : [])])];

  return (
    <div className="igx" style={{ padding: 24, color: 'var(--text-primary)' }} data-testid="ig-page">
      <style>{CSS}</style>
      <div className="igx-head">
        <div>
          <p style={{ ...muted, margin: 0 }}>Métricas da conta profissional · só leitura</p>
        </div>
        <div className="igx-tools">
          <div className="igx-chips" role="group" aria-label="Período">
            {IG_PERIODS.map((d) => <button key={d} type="button" style={chip(d === days)} aria-pressed={d === days} data-testid={`ig-period-${d}`} onClick={() => pickDays(d)}>{d} dias</button>)}
          </div>
          <div className="igx-chips" role="group" aria-label="Modo">
            {(['simples', 'completo'] as Mode[]).map((m) => <button key={m} type="button" style={chip(m === mode)} aria-pressed={m === mode} data-testid={`ig-mode-${m}`} onClick={() => pickMode(m)}>{m === 'simples' ? 'Simples' : 'Completo'}</button>)}
          </div>
          <button type="button" style={btn} onClick={() => load(days, true)} disabled={busy} data-testid="ig-refresh">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: ORANGE }} /> {busy ? 'Atualizando…' : 'Atualizar'}
          </button>
          {at && <span style={muted} data-testid="ig-updated">Atualizado às {hhmm(at)}</span>}
        </div>
      </div>

      {top.error && <div role="alert" style={{ ...box, borderColor: '#ef4444', marginBottom: 16 }} data-testid="ig-error"><b>Não consegui ler o Instagram.</b> <span style={{ color: 'var(--text-secondary)' }}>{top.error}</span></div>}

      <Profile load={top} />
      <div className="igx-kpis" data-testid="ig-kpis">
        {KPIS.map((k) => <Kpi key={k.id} id={k.id} label={k.label} hint={k.hint} top={top} get={k.get} />)}
      </div>

      {warnings.length > 0 && (
        <details style={{ ...box, padding: '10px 16px', marginBottom: 16 }} data-testid="ig-warnings">
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Avisos da Meta ({warnings.length})</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      <Charts load={daily} />

      <Ranking load={media} sort={sort} setSort={setSort} mode={mode} showAll={showAll} setShowAll={setShowAll} onOpen={setOpen} />

      <WhatWorks media={media} daily={daily} top={top} mode={mode} onOpen={setOpen} />

      {mode === 'completo' && <Audience load={aud} />}

      {open && <Detail item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── topo ──
function Profile({ load }: { load: Load<IgTop> }) {
  const p = load.data?.profile;
  if (!p) return <div style={{ ...box, marginBottom: 16, height: 88 }} className={load.loading ? 'igx-skel' : ''} data-testid="ig-profile-loading" />;
  return (
    <div style={{ ...box, marginBottom: 16 }} className="igx-profile" data-testid="ig-profile">
      {p.picture ? <img src={p.picture} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} data-testid="ig-avatar" />
        : <div style={{ width: 64, height: 64, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }} data-testid="ig-username">@{p.username}</div>
        {p.name && <div style={muted}>{p.name}</div>}
      </div>
      <div className="igx-counts">
        {[['seguidores', p.followers], ['seguindo', p.follows], ['posts', p.media_count]].map(([l, v]) => (
          <div key={String(l)} data-testid={`ig-count-${l}`}><div style={{ fontWeight: 800, fontSize: 18 }}>{v == null ? '—' : Number(v).toLocaleString('pt-BR')}</div><div style={muted}>{l}</div></div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ id, label, hint, top, get }: { id: string; label: string; hint: string; top: Load<IgTop>; get: (t: IgTotals) => number | null }) {
  const d = top.data;
  const cur = d ? get(d.cur) : null; const prev = d ? get(d.prev) : null;
  const delta = deltaOf(cur, prev);
  const color = delta.dir === 'up' ? '#16a34a' : delta.dir === 'down' ? '#ef4444' : 'var(--text-muted)';
  return (
    <div style={box} className={!d && top.loading ? 'igx-skel' : ''} data-testid={`ig-kpi-${id}`} title={hint}>
      <div style={eyebrow}>{label}</div>
      <div className="igx-big">{d ? (id === 'seguidores' && cur != null && cur > 0 ? `+${fmtN(cur)}` : fmtN(cur)) : '…'}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color }} data-testid="ig-delta">{d ? `${deltaText(delta)} vs. ${d.period.days} dias antes` : ''}</div>
      {id === 'seguidores' && d && d.cur.follows != null && <div style={muted}>+{fmtN(d.cur.follows)} novos · −{fmtN(d.cur.unfollows || 0)} saíram</div>}
    </div>
  );
}

// ── gráfico ──
function Charts({ load }: { load: Load<IgDaily> }) {
  const d = load.data;
  const rows = (d?.rows || []).map((r) => ({ dia: `${r.day.slice(8, 10)}/${r.day.slice(5, 7)}`, Ganhos: r.gained, Perdidos: r.lost == null ? null : -r.lost, Alcance: r.reach, Visualizações: r.views }));
  const tip = { contentStyle: { background: 'var(--bg-card)', border: `1px solid ${bd}`, borderRadius: 8, fontSize: 12 }, formatter: (v: unknown) => fmtN(Math.abs(Number(v))) };
  const by = d?.size === 'week' ? 'por semana' : 'por dia';
  return (
    <div className="igx-two" style={{ marginBottom: 16 }} data-testid="ig-charts">
      <div style={box}>
        <div style={eyebrow}>Seguidores ganhos × perdidos {by}</div>
        {load.error ? <p style={muted}>{load.error}</p> : !d ? <div className="igx-skel" style={{ height: 220, borderRadius: 12 }} /> : (
          <div style={{ height: 220 }} data-testid="ig-chart-followers">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} stackOffset="sign" margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={12} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <Tooltip {...tip} />
                <ReferenceLine y={0} stroke="var(--text-muted)" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ganhos" stackId="s" fill="#16a34a" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Perdidos" stackId="s" fill="#ef4444" radius={[0, 0, 3, 3]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div style={box}>
        <div style={eyebrow}>Alcance e visualizações {by}</div>
        {load.error ? <p style={muted}>{load.error}</p> : !d ? <div className="igx-skel" style={{ height: 220, borderRadius: 12 }} /> : (
          <div style={{ height: 220 }} data-testid="ig-chart-reach">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={12} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v) => fmtN(Number(v))} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Alcance" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Visualizações" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {d && d.check && d.check.daily_sum != null && d.check.period_total != null && (
          <p style={{ ...muted, margin: '6px 0 0', color: d.check.ok === false ? '#ef4444' : 'var(--text-muted)' }} data-testid="ig-chart-check" data-ok={String(d.check.ok)}
            title="Visualizações somam (o alcance não: a mesma pessoa conta em vários dias). Se a soma dos dias bate com o total do período na Meta, os dias baixos são dado real.">
            {d.check.ok === false ? '⚠ ' : '✓ '}Conferência com a Meta: soma dos dias {fmtN(d.check.daily_sum)} · total do período {fmtN(d.check.period_total)} visualizações
            {d.check.ok === false ? ' — não bate: pode faltar dia na Meta' : ' — os dias batem com o total'}
            {d.reach_source === 'serie' ? ' · alcance pela série diária da Meta' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ranking de conteúdo ──
function Thumb({ m, size }: { m: IgMedia; size?: number }) {
  const [bad, setBad] = useState(false);
  const style: React.CSSProperties = { width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', borderRadius: 10, background: 'var(--bg-inner)', ...(size ? { width: size, height: size } : {}) };
  return m.thumb && !bad ? <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" style={style} onError={() => setBad(true)} data-testid="ig-thumb" />
    : <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', ...muted }}>sem imagem</div>;
}
const Badge = ({ m }: { m: IgMedia }) => <span data-testid="ig-badge" style={{ position: 'absolute', top: 8, left: 8, background: KIND_COLOR[m.kind], color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{KIND_LABEL[m.kind]}</span>;

function Ranking({ load, sort, setSort, mode, showAll, setShowAll, onOpen }: { load: Load<IgMediaLoad>; sort: SortKey; setSort: (k: SortKey) => void; mode: Mode; showAll: boolean; setShowAll: (b: boolean) => void; onOpen: (m: IgMedia) => void }) {
  const list = useMemo(() => sortMedia(load.data?.items || [], sort), [load.data, sort]);
  const limit = mode === 'completo' || showAll ? list.length : 12;
  return (
    <section style={{ ...box, marginBottom: 16 }} data-testid="ig-ranking">
      <div className="igx-row" style={{ marginBottom: 12 }}>
        <div><div style={eyebrow}>Ranking de conteúdo</div><div style={muted}>{load.data ? `${list.length} conteúdo${list.length === 1 ? '' : 's'} publicado${list.length === 1 ? '' : 's'} no período` : ''}</div></div>
        <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6 }}>Ordenar por
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="ig-sort" style={{ ...btn, padding: '6px 8px' }}>
            {SORTS.map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      {load.error ? <p style={muted}>{load.error}</p> : !load.data ? <div className="igx-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="igx-skel" style={{ aspectRatio: '1 / 1', borderRadius: 12 }} />)}</div>
        : !list.length ? <p style={muted}>Nenhum post, reel ou carrossel publicado neste período.</p> : (
          <>
            <div className="igx-grid">
              {list.slice(0, limit).map((m, i) => (
                <button key={m.id} type="button" className="igx-card" onClick={() => onOpen(m)} data-testid="ig-media" data-id={m.id} data-kind={m.kind}>
                  <div style={{ position: 'relative' }}><Thumb m={m} /><Badge m={m} /><span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>#{i + 1}</span></div>
                  <div style={{ padding: '8px 2px 2px', textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }} data-testid="ig-media-value">{fmtSort(m, sort)} <span style={{ ...muted, fontWeight: 500 }}>{SORT_LABEL[sort].toLowerCase()}</span></div>
                    <div style={muted}>{fmtWhen(m.timestamp)}</div>
                    <div style={{ ...muted, marginTop: 4 }}>❤ {fmtN(m.metrics.likes)} · 💬 {fmtN(m.metrics.comments)} · 🔖 {fmtN(m.metrics.saved)} · ↗ {fmtN(m.metrics.shares)}</div>
                  </div>
                </button>
              ))}
            </div>
            {list.length > limit && <div style={{ textAlign: 'center', marginTop: 12 }}><button type="button" style={btn} onClick={() => setShowAll(true)} data-testid="ig-show-all">Ver todos ({list.length})</button></div>}
          </>
        )}
    </section>
  );
}

// ── detalhe ──
function Detail({ item, onClose }: { item: IgMedia; onClose: () => void }) {
  const [m, setM] = useState(item);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadMediaDetail(item.id).then((r) => setM(r.item), (e) => setErr(errText(e))); }, [item.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const x = m.metrics;
  const isReel = m.kind === 'REEL' || m.kind === 'VIDEO';
  const rows: [string, string][] = [
    ['Visualizações', fmtN(x.views)], ['Alcance', fmtN(x.reach)], ['Curtidas', fmtN(x.likes)], ['Comentários', fmtN(x.comments)], ['Salvamentos', fmtN(x.saved)],
    ['Compartilhamentos', fmtN(x.shares)], ['Interações totais', fmtN(x.total_interactions)], ['Seguidores gerados', fmtN(x.follows)], ['Visitas ao perfil', fmtN(x.profile_visits)],
    ['Taxa de engajamento', fmtPct(engagementOf(x))],
    ...(isReel ? [['Tempo médio assistido', fmtDuration(x.avg_watch_ms)], ['Tempo total assistido', fmtDuration(x.total_watch_ms)]] as [string, string][] : []),
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label="Detalhe do conteúdo" className="igx-modal" onClick={onClose} data-testid="ig-detail">
      <div style={{ ...box, maxWidth: 760, width: '100%', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="igx-row" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ background: KIND_COLOR[m.kind], color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{KIND_LABEL[m.kind]}</span><span style={muted} data-testid="ig-detail-when">{fmtWhen(m.timestamp)}</span></div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ ...btn, padding: 6 }} data-testid="ig-detail-close"><X size={16} /></button>
        </div>
        <div className="igx-detail">
          <div><Thumb m={m} />{m.children && m.children.length > 1 && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{m.children.slice(0, 10).map((c, i) => c.thumb ? <img key={i} src={c.thumb} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} /> : null)}</div>}</div>
          <div style={{ minWidth: 0 }}>
            <dl className="igx-dl" data-testid="ig-detail-metrics">{rows.map(([k, v]) => <div key={k}><dt style={muted}>{k}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v}</dd></div>)}</dl>
            {m.permalink && <a href={m.permalink} target="_blank" rel="noopener noreferrer" style={{ ...btn, marginTop: 12, textDecoration: 'none', color: ORANGE }} data-testid="ig-detail-open"><ExternalLink size={14} /> Abrir no Instagram</a>}
            {err && <p style={{ ...muted, marginTop: 8 }}>{err}</p>}
          </div>
        </div>
        <div style={{ marginTop: 12 }}><div style={eyebrow}>Legenda</div><p style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', overflowWrap: 'anywhere' }} data-testid="ig-detail-caption">{m.caption || '(sem legenda)'}</p></div>
      </div>
    </div>
  );
}

// ── O que funciona ──
function WhatWorks({ media, daily, top, mode, onOpen }: { media: Load<IgMediaLoad>; daily: Load<IgDaily>; top: Load<IgTop>; mode: Mode; onOpen: (m: IgMedia) => void }) {
  const items = useMemo(() => media.data?.items || [], [media.data]);
  const fmt = useMemo(() => bestFormat(items), [items]);
  const times = useMemo(() => bestTimes(items), [items]);
  const follows = useMemo(() => topBy(items, 'follows'), [items]);
  const saves = useMemo(() => topBy(items, 'saved'), [items]);
  const period = top.data?.period.cur;
  const freq = useMemo(() => (period ? frequencyVsReach(items, daily.data && daily.data.size === 'day' ? daily.data.rows : null, period) : null), [items, daily.data, period]);
  const full = mode === 'completo';
  const Why = ({ t }: { t: string }) => <p style={{ ...muted, marginTop: 8 }} data-testid="ig-why">Por quê: {t}</p>;
  const Top3 = ({ list, k, label }: { list: IgMedia[]; k: 'follows' | 'saved'; label: string }) => (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{label}</div>
      {!list.length ? <p style={muted}>Nenhum no período{k === 'follows' ? ' (ou a Meta não informou)' : ''}.</p> : list.map((m, i) => (
        <button key={m.id} type="button" onClick={() => onOpen(m)} className="igx-mini" data-testid={`ig-top-${k}`}>
          <Thumb m={m} size={40} /><span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><b>{i + 1}º</b> {KIND_LABEL[m.kind]} · {fmtWhen(m.timestamp).slice(0, 5)}</span><b>{fmtN(m.metrics[k])}</b>
        </button>
      ))}
    </div>
  );
  if (media.error) return null;
  return (
    <section style={{ marginBottom: 16 }} data-testid="ig-works">
      <div style={{ ...eyebrow, margin: '0 0 8px 4px' }}>O que funciona</div>
      {!media.data ? <div className="igx-two"><div className="igx-skel" style={{ ...box, height: 140 }} /><div className="igx-skel" style={{ ...box, height: 140 }} /></div> : (
        <div className="igx-two">
          <div style={box} data-testid="ig-works-format">
            <div style={{ fontWeight: 700 }}>Melhor formato</div>
            <div className="igx-big" style={{ fontSize: 20 }}>{fmt.best ? KIND_LABEL[fmt.best.kind] : '—'}</div>
            {fmt.best && <div style={muted}>{fmtN(fmt.best.reach)} de alcance médio{fmt.bestEngagement ? ` · melhor engajamento: ${KIND_LABEL[fmt.bestEngagement.kind]} (${fmtPct(fmt.bestEngagement.engagement)})` : ''}{fmt.lowData ? ' · poucos dados' : ''}</div>}
            {full && <table className="igx-table"><thead><tr><th>Formato</th><th>Posts</th><th>Alcance</th><th>Visualiz.</th><th>Engaj.</th><th>Salvam.</th></tr></thead>
              <tbody>{fmt.rows.map((r) => <tr key={r.kind}><td>{KIND_LABEL[r.kind]}</td><td>{r.posts}</td><td>{fmtN(r.reach)}</td><td>{fmtN(r.views)}</td><td>{fmtPct(r.engagement)}</td><td>{fmtN(r.saved)}</td></tr>)}</tbody></table>}
            <Why t={fmt.why} />
          </div>
          <div style={box} data-testid="ig-works-times">
            <div style={{ fontWeight: 700 }}>Melhores dias e horários para postar</div>
            <div className="igx-big" style={{ fontSize: 20 }} data-testid="ig-best-time">{times.bestDay || times.bestBand ? [times.bestDay?.label, times.bestBand?.label].filter(Boolean).join(' · ') : '—'}</div>
            <div style={muted}>{times.bestDay || times.bestBand ? 'Maior alcance médio por post' : 'Poucos posts para comparar (precisa de 2+ por faixa)'}</div>
            {full && <div className="igx-two" style={{ marginTop: 8 }}>{[times.days, times.bands].map((rows, j) => (
              <table key={j} className="igx-table"><thead><tr><th>{j ? 'Horário' : 'Dia'}</th><th>Posts</th><th>Alcance</th><th>Engaj.</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id}><td>{r.label}</td><td>{r.posts}</td><td>{fmtN(r.reach)}</td><td>{fmtPct(r.engagement)}</td></tr>)}</tbody></table>
            ))}</div>}
            <Why t={times.why} />
          </div>
          <div style={box} data-testid="ig-works-top">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Top 3 conteúdos</div>
            <div className="igx-two"><Top3 list={follows} k="follows" label="Mais seguidores" /><Top3 list={saves} k="saved" label="Mais salvamentos" /></div>
            <Why t="Os 3 conteúdos do período com mais seguidores gerados e com mais salvamentos (dados de cada post)." />
          </div>
          <div style={box} data-testid="ig-works-freq">
            <div style={{ fontWeight: 700 }}>Frequência de postagem × alcance</div>
            <p style={{ fontSize: 14, margin: '6px 0 0' }} data-testid="ig-freq-text">{freq ? freq.text : '…'}</p>
            {full && freq && freq.mode === 'week' && <table className="igx-table"><thead><tr><th>Semana</th><th>Posts</th><th>Alcance</th></tr></thead>
              <tbody>{freq.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.posts}</td><td>{fmtN(r.reach)}</td></tr>)}</tbody></table>}
            {freq && freq.why && <Why t={freq.why} />}
          </div>
        </div>
      )}
    </section>
  );
}

// ── público ──
function Audience({ load }: { load: Load<IgAudience> }) {
  const a = load.data?.audience;
  const Bars = ({ title, rows, id }: { title: string; rows: { label: string; pct: number }[]; id: string }) => (
    <div style={box} data-testid={`ig-aud-${id}`}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {!rows.length ? <p style={muted}>A Meta não devolveu estes dados.</p> : rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span><b>{fmtPct(r.pct, 0)}</b></div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-inner)' }}><div style={{ width: `${Math.round(r.pct * 100)}%`, height: 6, borderRadius: 3, background: ORANGE }} /></div>
        </div>
      ))}
    </div>
  );
  return (
    <section style={{ marginBottom: 16 }} data-testid="ig-audience">
      <div style={{ ...eyebrow, margin: '0 0 8px 4px' }}>Público (seguidores)</div>
      {load.error ? <p style={muted}>{load.error}</p> : !a ? <div className="igx-skel" style={{ ...box, height: 160 }} /> : (
        <div className="igx-three">
          <Bars id="city" title="Cidades" rows={audienceShare(a.city, 8)} />
          <Bars id="age" title="Faixa etária" rows={audienceShare(sortAges(a.age), 10, true)} />
          <Bars id="gender" title="Gênero" rows={audienceShare(a.gender, 3).map((r) => ({ ...r, label: GENDER_LABEL[r.label] || r.label }))} />
        </div>
      )}
    </section>
  );
}

const CSS = `
.igx .igx-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:16px}
.igx .igx-tools,.igx .igx-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.igx .igx-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.igx .igx-profile{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.igx .igx-counts{display:flex;gap:24px;text-align:center}
.igx .igx-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;margin-bottom:16px}
.igx .igx-big{font-size:24px;font-weight:800;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.igx .igx-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.igx .igx-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.igx .igx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.igx .igx-card{background:var(--bg-inner);border:1px solid var(--border-main);border-radius:14px;padding:8px;cursor:pointer;color:var(--text-primary);min-width:0;transition:border-color .15s}
.igx .igx-card:hover,.igx .igx-card:focus-visible{border-color:${ORANGE}}
.igx .igx-mini{display:flex;align-items:center;gap:8px;width:100%;padding:6px;margin-bottom:4px;border-radius:10px;border:1px solid var(--border-main);background:var(--bg-inner);color:var(--text-primary);font-size:12px;cursor:pointer}
.igx .igx-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
.igx .igx-table th{text-align:left;color:var(--text-muted);font-weight:600;padding:4px;border-bottom:1px solid var(--border-main)}
.igx .igx-table td{padding:4px;border-bottom:1px solid var(--border-main)}
.igx .igx-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60}
.igx .igx-detail{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:16px}
.igx .igx-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:0}
.igx .igx-skel{background:linear-gradient(90deg,var(--bg-inner),var(--bg-hover),var(--bg-inner));background-size:200% 100%;animation:igxs 1.2s infinite}
@keyframes igxs{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){.igx .igx-skel{animation:none}}
@media (max-width:1280px){.igx .igx-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:760px){.igx{padding:16px!important}.igx .igx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.igx .igx-two,.igx .igx-three,.igx .igx-detail{grid-template-columns:1fr}
.igx .igx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.igx .igx-big{font-size:20px}.igx .igx-counts{gap:16px;width:100%;justify-content:space-around}}
`;
