// Aba Instagram → Stories: o HISTÓRICO PRÓPRIO dos stories (a Meta apaga os insights 24 h depois; a edge function
// "instagram" guarda a última leitura antes de expirar, de hora em hora — tabela ig_stories). SÓ LEITURA na Meta.
//   grade por dia (miniatura, views, alcance, respostas, avanços/saídas quando a Meta devolve), período, ranking dos
//   melhores, "O que funciona" (melhor horário, média de views por story, quantos stories por dia rendem mais) e, se
//   o link rastreável do canal "stories" estiver em uso, cliques → conversas → vendas por dia de story.
// Regras: src/lib/igInsights.ts (storiesByDay, bestStories, storyWhatWorks, storyLinkByDay) · README: src/pages/Instagram.README.md
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useErpRefresh } from '../../lib/erpRefresh';
import { bestStories, exitRate, fmtN, fmtPct, storiesByDay, storyDay, storyFinal, storyLinkByDay, storyWhatWorks, type IgStory } from '../../lib/igInsights';
import { IG_HISTORY_CRON, IG_HISTORY_MIGRATION, collectNow, loadCollectLog, loadStories } from '../../lib/igDb';
import { lastDays, loadClicks, loadLinkConversations, loadLinks } from '../../lib/igLinksDb';
import { ORANGE, PINK, RED, badge, box, btn, chip, eyebrow, money, muted, when } from './igStyles';

const PERIODS = [7, 14, 30, 90];
const dayLabel = (d: string) => { const t = new Date(`${d}T12:00:00Z`); return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][t.getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`; };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
interface Loaded { list: IgStory[]; missing: boolean; links: { day: string; clicks: number; conversations: number; sales: number; revenue: number; stories: number; views: number }[] | null; log: { created_at: string; kind: string; ok: boolean; message: string | null; warnings: string[] }[] }

export default function IgStories() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const r = useMemo(() => lastDays(days), [days]);
  const load = async () => {
    setBusy(true);
    try {
      const [st, log, links] = await Promise.all([loadStories(r.from, r.to), loadCollectLog().catch(() => []), loadLinks().catch(() => ({ links: [], missing: true }))]);
      const storyLinks = links.links.filter((l) => l.channel === 'stories');
      let cross: Loaded['links'] = null;
      if (storyLinks.length) {
        const ids = new Set(storyLinks.map((l) => l.id));
        const codes = new Set(storyLinks.map((l) => l.code));
        const [clicks, cv] = await Promise.all([loadClicks(r), loadLinkConversations(r).catch(() => ({ convs: [], missing: [] }))]);
        cross = storyLinkByDay(storiesByDay(st.list), clicks.filter((c) => ids.has(c.link_id)), cv.convs.filter((c) => codes.has(c.code)));
      }
      setData({ list: st.list, missing: st.missing, links: cross, log });
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  useErpRefresh(() => load());
  const collect = async () => {
    setBusy(true); setMsg(null);
    try { const o = await collectNow('collect_stories'); setMsg({ ok: true, text: `${o.stories ?? 0} stories ativos lidos agora.${o.warnings.length ? ` Avisos: ${o.warnings.join(' · ')}` : ''}` }); await load(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); setBusy(false); }
  };
  const byDay = useMemo(() => storiesByDay(data?.list || []), [data]);
  const best = useMemo(() => bestStories(data?.list || []), [data]);
  const works = useMemo(() => storyWhatWorks(data?.list || []), [data]);
  const totals = useMemo(() => { const l = data?.list || []; const s = (k: 'views' | 'replies' | 'reach') => l.reduce((n, x) => n + (x[k] || 0), 0); return { n: l.length, views: s('views'), replies: s('replies'), reach: s('reach') }; }, [data]);
  const lastLog = data?.log.find((l) => l.kind === 'stories');

  return (
    <div data-testid="ig-stories" className="igst">
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map((d) => <button key={d} type="button" style={chip(d === days)} aria-pressed={d === days} onClick={() => setDays(d)} data-testid={`igst-period-${d}`}>{d} dias</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastLog && <span style={{ ...muted, color: lastLog.ok ? 'var(--text-muted)' : RED }} data-testid="igst-last">Última coleta: {when(lastLog.created_at)} · {lastLog.ok ? lastLog.message : `erro: ${lastLog.message}`}</span>}
          <button type="button" style={btn} onClick={() => load()} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: ORANGE }} /> Atualizar</button>
          <button type="button" style={btn} onClick={collect} disabled={busy} data-testid="igst-collect">Coletar agora</button>
        </div>
      </div>
      {msg && <div role="status" style={{ ...box, marginBottom: 12, color: msg.ok ? 'var(--text-primary)' : RED }} data-testid="igst-msg">{msg.text}</div>}
      {data && data.missing && <div role="alert" style={{ ...box, borderColor: ORANGE, marginBottom: 12 }} data-testid="igst-missing"><b>Falta aplicar a migration {IG_HISTORY_MIGRATION}</b> (e depois {IG_HISTORY_CRON}, a coleta de hora em hora). <span style={muted}>Sem ela os stories não ficam guardados.</span></div>}
      {data && !data.missing && !data.list.length && <div style={{ ...box, ...muted, marginBottom: 12 }} data-testid="igst-empty">Nenhum story guardado neste período. A coleta roda de hora em hora (só stories que estavam no ar durante a coleta).</div>}

      {data && data.list.length > 0 && (
        <>
          <div className="igst-kpis" data-testid="igst-kpis">
            {[['Stories', fmtN(totals.n)], ['Views', fmtN(totals.views)], ['Média de views por story', fmtN(works.avgViews)], ['Alcance somado', fmtN(totals.reach)], ['Respostas', fmtN(totals.replies)]].map(([k, v]) => (
              <div key={k} style={box}><div style={eyebrow}>{k}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div></div>
            ))}
          </div>

          <div className="igst-two">
            <div style={box} data-testid="igst-works">
              <div style={eyebrow}>O que funciona nos stories</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                <li data-testid="igst-best-hour">{works.bestHour ? <>Melhor horário: <b>{works.bestHour.label}</b> ({fmtN(works.bestHour.avgViews)} views em média, {works.bestHour.stories} stories)</> : 'Melhor horário: poucos dados (precisa de 2+ stories na mesma hora).'}</li>
                <li>Média de views por story: <b>{fmtN(works.avgViews)}</b> ({works.stories} stories)</li>
                <li data-testid="igst-best-perday">{works.bestPerDay ? <>Stories por dia que rendem mais: <b>{works.bestPerDay.label}</b> ({fmtN(works.bestPerDay.avgPerDay)} views por dia, {fmtN(works.bestPerDay.avgPerStory)} por story)</> : 'Stories por dia: poucos dados (precisa de 2+ dias no mesmo grupo).'}</li>
              </ul>
              {works.perDay.length > 0 && (
                <table className="igst-table" data-testid="igst-perday"><thead><tr><th>Por dia</th><th>Dias</th><th>Views/dia</th><th>Views/story</th></tr></thead>
                  <tbody>{works.perDay.map((p) => <tr key={p.id}><td>{p.label}</td><td>{p.days}</td><td>{fmtN(p.avgPerDay)}</td><td>{fmtN(p.avgPerStory)}</td></tr>)}</tbody></table>
              )}
              <details style={{ marginTop: 8 }}><summary style={{ ...muted, cursor: 'pointer' }}>Por quê</summary><p style={muted}>{works.why}</p></details>
            </div>
            <div style={box} data-testid="igst-ranking">
              <div style={eyebrow}>Melhores stories (views)</div>
              {best.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }} data-testid="igst-rank-row">
                  <b style={{ width: 18 }}>{i + 1}</b><Thumb s={s} size={44} />
                  <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}><b>{fmtN(s.views)} views</b> · {fmtN(s.reach)} alcance · {fmtN(s.replies)} respostas<div style={muted}>{dayLabel(storyDay(s))} às {hhmm(s.posted_at)}</div></div>
                </div>
              ))}
            </div>
          </div>

          {data.links && (
            <div style={{ ...box, marginBottom: 16 }} data-testid="igst-links">
              <div style={eyebrow}>Link rastreável dos stories: cliques → conversas → vendas por dia</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="igst-table"><thead><tr><th>Dia</th><th>Stories</th><th>Views</th><th>Cliques</th><th>Conversas</th><th>Vendas</th><th>R$</th></tr></thead>
                  <tbody>{data.links.filter((d) => d.stories || d.clicks || d.conversations).map((d) => <tr key={d.day} data-testid="igst-link-row"><td>{dayLabel(d.day)}</td><td>{d.stories}</td><td>{fmtN(d.views)}</td><td>{d.clicks}</td><td>{d.conversations}</td><td>{d.sales}</td><td>{money(d.revenue)}</td></tr>)}</tbody></table>
              </div>
            </div>
          )}

          <div data-testid="igst-days">
            {byDay.map((d) => (
              <div key={d.day} style={{ ...box, marginBottom: 12 }} data-testid="igst-day">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <b>{dayLabel(d.day)}</b>
                  <span style={muted}>{d.stories.length} stor{d.stories.length === 1 ? 'y' : 'ies'} · {fmtN(d.views)} views · {fmtN(d.replies)} respostas</span>
                </div>
                <div className="igst-grid">
                  {d.stories.map((s) => (
                    <div key={s.id} className="igst-card" data-testid="igst-card">
                      <Thumb s={s} size={0} />
                      <div style={{ fontSize: 12, padding: '6px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}><b>{hhmm(s.posted_at)}</b>{!storyFinal(s) && <span style={badge('#fef3c7', '#92400e')} title="A última leitura foi antes das 23 h do story no ar">parcial</span>}</div>
                        <div>👁 {fmtN(s.views)} · alcance {fmtN(s.reach)}</div>
                        <div>💬 {fmtN(s.replies)} respostas{s.shares != null ? ` · ↗ ${fmtN(s.shares)}` : ''}</div>
                        {(s.taps_forward != null || s.exits != null) && <div style={muted}>avanços {fmtN(s.taps_forward)} · voltas {fmtN(s.taps_back)} · saídas {fmtN(s.exits)}{exitRate(s) != null ? ` (${fmtPct(exitRate(s), 0)})` : ''}</div>}
                        {s.profile_visits != null && <div style={muted}>visitas ao perfil {fmtN(s.profile_visits)}{s.follows ? ` · +${fmtN(s.follows)} seguidores` : ''}</div>}
                        {s.permalink && <a href={s.permalink} target="_blank" rel="noopener noreferrer" style={{ color: PINK, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>abrir <ExternalLink size={10} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ s, size }: { s: IgStory; size: number }) {
  const [bad, setBad] = useState(false);
  const st: React.CSSProperties = size ? { width: size, height: size * 16 / 9 > 80 ? 78 : size * 16 / 9, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--bg-inner)' } : { width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', display: 'block', background: 'var(--bg-inner)' };
  if (!s.thumb || bad) return <div style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{s.media_type === 'VIDEO' ? 'vídeo' : 'story'}</div>;
  return <img src={s.thumb} alt="" style={st} onError={() => setBad(true)} />;
}

const CSS = `
.igst .igst-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}
.igst .igst-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.igst .igst-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px}
.igst .igst-card{border:1px solid var(--border-main);border-radius:12px;overflow:hidden;background:var(--bg-card)}
.igst .igst-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.igst .igst-table th,.igst .igst-table td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--border-main);white-space:nowrap}
@media (max-width:760px){.igst .igst-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.igst .igst-two{grid-template-columns:1fr}}
`;
