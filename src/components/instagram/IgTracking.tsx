// Aba Instagram → Rastreio (FASE 2): cada link é, por padrão, o link DIRETO do WhatsApp da loja
// (https://wa.me/<número>?text=<frase>, sem intermediário), com a FRASE própria do link (sem emoji, diferente das dos
// outros links e das automações), mais o QR Code desse endereço. A conversa é ligada ao link pela frase. O link
// /l/<apelido> (conta cliques) fica como opção avançada recolhida; cliques e clique→conversa só aparecem se ele foi usado.
// Resultados por link e por canal no período: conversas (frase / horário / código) → vendas do ERP → faturamento.
// Regras: src/lib/igLinks.ts · leitura/gravação: src/lib/igLinksDb.ts (grava SÓ ig_links) · QR: src/lib/qr.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, Pencil, Plus, QrCode, RefreshCw, X } from 'lucide-react';
import { useErpRefresh } from '../../lib/erpRefresh';
import {
  CHANNELS, CHANNEL_LABEL, MATCH_LABEL, bestLinks, directUrl, hasEmoji, linkResults, phraseClash, prefilledText, publicUrl, slugify, suggestCode, validateDraft,
  type AutoPhrase, type IgChannel, type LinkMatch, type IgClick, type IgLink, type LinkConversation, type LinkDraft, type LinkResult,
} from '../../lib/igLinks';
import { IG_MIGRATION, lastDays, loadAutoPhrases, loadClicks, loadLinkConversations, loadLinks, saveLink } from '../../lib/igLinksDb';
import { loadMedia } from '../../lib/igDb';
import { fmtN, fmtPct, fmtWhen, KIND_LABEL, type IgMedia } from '../../lib/igInsights';
import { qrEncode, qrSvg } from '../../lib/qr';

const ORANGE = '#f97316';
const PINK = '#c026d3';
const bd = 'var(--border-main)';
const box: React.CSSProperties = { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: bd, borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chip = (on: boolean): React.CSSProperties => ({ ...btn, padding: '6px 12px', borderRadius: 999, ...(on ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : {}) });
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: 'var(--bg-inner)', color: 'var(--text-primary)', fontSize: 14 };
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const PERIODS = [7, 14, 30, 90];

async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* cai no plano B */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

interface Loaded { links: IgLink[]; missing: boolean; clicks: IgClick[]; convs: LinkConversation[]; erpMissing: string[]; autos: AutoPhrase[]; at: number }
const NO_CLICKS = 'link direto não conta cliques';
// cliques/taxa só quando o link /l/ (conta cliques) foi usado no período; senão "—" com a dica
function ClickCell({ n, show, testid }: { n: string; show: boolean; testid?: string }) {
  return show ? <td className="n" data-testid={testid}>{n}</td>
    : <td className="n" data-testid={testid} title={NO_CLICKS}>—<div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} data-testid="igr-noclicks">{NO_CLICKS}</div></td>;
}

export default function IgTracking() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<IgLink | 'novo' | null>(null);
  const [qr, setQr] = useState<IgLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const run = useRef(0);
  const r = useMemo(() => lastDays(days), [days]);

  const load = async () => {
    const id = ++run.current;
    setBusy(true); setError('');
    try {
      const [l, clicks, cv, autos] = await Promise.all([loadLinks(), loadClicks(r), loadLinkConversations(r).catch(() => ({ convs: [], missing: ['vendas do ERP'] })), loadAutoPhrases()]);
      if (id === run.current) setData({ links: l.links, missing: l.missing, clicks, convs: cv.convs, erpMissing: cv.missing, autos, at: Date.now() });
    } catch (e) {
      if (id === run.current) setError(e instanceof Error ? e.message : String(e));
    } finally { if (id === run.current) setBusy(false); }
  };
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  useErpRefresh(() => load());

  const res = useMemo(() => (data ? linkResults(data.links, data.clicks, data.convs, r) : null), [data, r]);
  const best = useMemo(() => (res ? bestLinks(res.links) : []), [res]);
  const [copyFail, setCopyFail] = useState<string | null>(null);
  // what: o link direto do WhatsApp (padrão: wa.me com a frase) ou o /l/ (avançado: conta cliques)
  const copy = async (l: IgLink, what: 'wa' | 'pub' = 'wa') => {
    const key = `${l.id}:${what}`;
    const ok = await copyText(what === 'wa' ? directUrl(l) : publicUrl(l.slug));
    setCopied(ok ? key : null); setCopyFail(ok ? null : key);
    setTimeout(() => { setCopied((c) => (c === key ? null : c)); setCopyFail((c) => (c === key ? null : c)); }, 4000);
  };
  const recent = useMemo(() => (data ? [...data.clicks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15) : []), [data]);
  const linkById = useMemo(() => new Map((data?.links || []).map((l) => [l.id, l])), [data]);

  return (
    <div className="igr" data-testid="ig-tracking">
      <style>{CSS}</style>
      <div className="igr-row" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Rastreio de links</div>
          <div style={muted}>Links diretos do WhatsApp: conversas (pela frase de cada link) → vendas do ERP · {r.fromDay.slice(8)}/{r.fromDay.slice(5, 7)} a {r.toDay.slice(8)}/{r.toDay.slice(5, 7)}</div>
        </div>
        <div className="igr-tools">
          {PERIODS.map((d) => <button key={d} type="button" style={chip(d === days)} aria-pressed={d === days} onClick={() => setDays(d)} data-testid={`igr-period-${d}`}>{d} dias</button>)}
          <button type="button" style={btn} onClick={() => load()} disabled={busy} data-testid="igr-refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: ORANGE }} /> {busy ? 'Atualizando…' : 'Atualizar'}</button>
          {data && <span style={muted} data-testid="igr-updated">Atualizado às {hhmm(data.at)}</span>}
          <button type="button" style={{ ...btn, background: ORANGE, borderColor: ORANGE, color: '#fff' }} onClick={() => setEdit('novo')} disabled={!data || data.missing} data-testid="igr-new"><Plus size={14} /> Novo link</button>
        </div>
      </div>

      {error && <div role="alert" style={{ ...box, borderColor: '#ef4444', marginBottom: 16 }}>{error}</div>}
      {data && data.missing && (
        <div role="alert" style={{ ...box, borderColor: ORANGE, marginBottom: 16 }} data-testid="igr-missing">
          <b>Falta aplicar a migration</b> <code>{IG_MIGRATION}</code> no Supabase. Depois disso aparecem os links prontos (bio, manychat-comentarios e stories).
        </div>
      )}

      {/* números do período */}
      <div className="igr-kpis" data-testid="igr-kpis">
        {([
          ['conversas', 'Conversas', res ? fmtN(res.total.conversations) : '…'],
          ['vendas', 'Vendas', res ? fmtN(res.total.sales) : '…'],
          ['faturamento', 'Faturamento', res ? money(res.total.revenue) : '…'],
          ['conversa-venda', 'Conversa → venda', res ? fmtPct(res.total.convToSale) : '…'],
        ] as [string, string, string][]).map(([id, label, v]) => (
          <div key={id} style={box} data-testid={`igr-kpi-${id}`}><div style={eyebrow}>{label}</div><div className="igr-big">{v}</div></div>
        ))}
      </div>

      {/* melhores links */}
      {res && (
        <section style={{ ...box, marginBottom: 16 }} data-testid="igr-best">
          <div style={eyebrow}>Melhores links</div>
          {!best.length ? <p style={muted}>Ainda nenhuma conversa começou por um link neste período.</p> : (
            <div className="igr-three" style={{ marginTop: 8 }}>
              {best.map((b, i) => (
                <div key={b.key} style={{ ...box, boxShadow: 'none', background: 'var(--bg-inner)' }} data-testid="igr-best-item">
                  <div style={{ fontWeight: 800 }}>{i + 1}º {b.label}</div>
                  <div style={muted}>{b.channel ? CHANNEL_LABEL[b.channel] : ''}</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>{money(b.revenue)} · {b.sales} venda{b.sales === 1 ? '' : 's'} · {b.conversations} conversa{b.conversations === 1 ? '' : 's'}{b.clicks > 0 ? ` · ${b.clicks} clique${b.clicks === 1 ? '' : 's'}` : ''}</div>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...muted, marginTop: 8 }}>Por quê: mais faturamento no período; empate → mais conversas.</p>
        </section>
      )}

      {/* links */}
      <section style={{ ...box, marginBottom: 16 }} data-testid="igr-links">
        <div style={{ ...eyebrow, marginBottom: 8 }}>Links</div>
        {!data ? <p style={muted}>Carregando…</p> : !data.links.length ? <p style={muted}>Nenhum link ainda.</p> : (
          <div className="igr-scroll">
            <table className="igr-table">
              <thead><tr><th>Link</th><th>Canal</th><th className="n">Conversas</th><th>Ligadas por</th><th className="n">Vendas</th><th className="n">Faturamento</th><th className="n">Conv.→venda</th><th className="n">Cliques</th><th className="n">Clique→conv.</th><th /></tr></thead>
              <tbody>
                {res && res.links.map((x) => { const l = x.link as IgLink; const used = x.clicks > 0; return (
                  <tr key={l.id} data-testid="igr-link" data-slug={l.slug} style={l.active ? undefined : { opacity: 0.55 }}>
                    <td style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 700 }}>{l.slug} {!l.active && <span style={{ ...muted, fontWeight: 600 }}>(desligado)</span>}</div>
                      <div style={{ fontSize: 12, overflowWrap: 'anywhere' }} data-testid="igr-phrase">“{prefilledText(l.message)}”</div>
                      {l.media_caption && <div style={muted}>{l.media_caption.slice(0, 40)}</div>}
                      <div style={{ ...muted, overflowWrap: 'anywhere' }} data-testid="igr-url">{directUrl(l)}</div>
                      <details style={{ marginTop: 4 }} data-testid="igr-adv">
                        <summary style={{ ...muted, cursor: 'pointer' }}>Avançado: link com contagem de cliques</summary>
                        <div style={{ ...muted, overflowWrap: 'anywhere', marginTop: 4 }} data-testid="igr-pub-url">{publicUrl(l.slug)}</div>
                        <button type="button" style={{ ...btn, padding: '4px 8px', fontSize: 11, marginTop: 4 }} aria-label={`Copiar link com contagem de cliques ${l.slug}`} onClick={() => copy(l, 'pub')} data-testid="igr-copy-pub"><Copy size={12} /> Copiar</button>
                        <div style={{ ...muted, marginTop: 4 }}>Passa por uma página antes do WhatsApp (conta o clique).</div>
                      </details>
                    </td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(192,38,211,0.12)', color: PINK, whiteSpace: 'nowrap' }}>{CHANNEL_LABEL[l.channel]}</span></td>
                    <td className="n" data-testid="igr-convs">{fmtN(x.conversations)}</td>
                    <td style={{ ...muted, whiteSpace: 'nowrap' }} data-testid="igr-bymatch">{(['frase', 'horario', 'codigo'] as LinkMatch[]).map((m) => <div key={m} data-match={m}>{MATCH_LABEL[m]}: <b style={{ color: 'var(--text-primary)' }}>{fmtN(x.byMatch[m])}</b></div>)}</td>
                    <td className="n" data-testid="igr-sales">{fmtN(x.sales)}</td>
                    <td className="n" data-testid="igr-revenue">{money(x.revenue)}</td>
                    <td className="n" data-testid="igr-conv-sale">{fmtPct(x.convToSale)}</td>
                    <ClickCell n={fmtN(x.clicks)} show={used} testid="igr-clicks" />
                    <ClickCell n={fmtPct(x.clickToConv)} show={used} testid="igr-click-conv" />
                    <td className="n" style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" style={{ ...btn, padding: '6px 8px', fontSize: 12 }} title="Copiar o link direto do WhatsApp (wa.me com a frase do link)" aria-label={`Copiar link direto do WhatsApp ${l.slug}`} onClick={() => copy(l)} data-testid="igr-copy"><Copy size={14} /> Copiar</button>{' '}
                      <button type="button" style={{ ...btn, padding: 6 }} title="QR Code do link direto" aria-label={`QR Code do link ${l.slug}`} onClick={() => setQr(l)} data-testid="igr-qr"><QrCode size={14} /></button>{' '}
                      <button type="button" style={{ ...btn, padding: 6 }} title="Editar" aria-label={`Editar link ${l.slug}`} onClick={() => setEdit(l)} data-testid="igr-edit"><Pencil size={14} /></button>
                      {copied?.startsWith(`${l.id}:`) && <div style={{ ...muted, color: '#16a34a', fontWeight: 700 }} role="status" data-testid="igr-copied">{copied.endsWith(':wa') ? 'Link direto do WhatsApp copiado!' : 'Link com contagem de cliques copiado!'}</div>}
                      {copyFail?.startsWith(`${l.id}:`) && <div style={{ ...muted, color: '#ef4444', fontWeight: 700 }} role="status">Não consegui copiar: abra "Editar" e selecione o link</div>}
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* por canal + últimos cliques */}
      <div className="igr-two">
        <section style={box} data-testid="igr-channels">
          <div style={{ ...eyebrow, marginBottom: 8 }}>Por canal</div>
          {!res || !res.channels.length ? <p style={muted}>Sem dados.</p> : (
            <div className="igr-scroll"><table className="igr-table">
              <thead><tr><th>Canal</th><th className="n">Conversas</th><th className="n">Vendas</th><th className="n">Faturamento</th><th className="n">Conv.→venda</th><th className="n">Cliques</th></tr></thead>
              <tbody>{res.channels.map((c: LinkResult) => <tr key={c.key} data-testid="igr-channel" data-channel={c.key}><td>{c.label}</td><td className="n">{fmtN(c.conversations)}</td><td className="n">{fmtN(c.sales)}</td><td className="n">{money(c.revenue)}</td><td className="n">{fmtPct(c.convToSale)}</td><td className="n" title={c.clicks > 0 ? undefined : NO_CLICKS}>{c.clicks > 0 ? fmtN(c.clicks) : '—'}</td></tr>)}</tbody>
            </table></div>
          )}
          <p style={{ ...muted, marginTop: 8 }}>Cliques: só do link com contagem de cliques (o link direto não conta cliques).</p>
        </section>
        <section style={box} data-testid="igr-recent">
          <div style={{ ...eyebrow, marginBottom: 8 }}>Últimos cliques (link com contagem)</div>
          {!recent.length ? <p style={muted}>Nenhum clique no período (o link direto do WhatsApp não conta cliques).</p> : (
            <div className="igr-scroll"><table className="igr-table">
              <thead><tr><th>Quando</th><th>Link</th><th>Aparelho</th><th>Navegador</th></tr></thead>
              <tbody>{recent.map((c, i) => <tr key={i}><td>{fmtWhen(c.created_at)}</td><td>{linkById.get(c.link_id)?.slug || '—'}</td><td>{c.device || '—'}</td><td>{c.browser || '—'}</td></tr>)}</tbody>
            </table></div>
          )}
          <p style={{ ...muted, marginTop: 8 }}>O IP não é guardado (só um código embaralhado para não contar o mesmo clique duas vezes em 30 s).</p>
        </section>
      </div>
      {data && data.erpMissing.length > 0 && <p style={{ ...muted, marginTop: 12 }}>Ainda sem: {data.erpMissing.join(', ')}.</p>}

      {edit && data && <Editor link={edit === 'novo' ? null : edit} all={data.links} autos={data.autos} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {qr && <QrModal link={qr} onClose={() => setQr(null)} />}
    </div>
  );
}

// ── criar / editar ──
function Editor({ link, all, autos, onClose, onSaved }: { link: IgLink | null; all: IgLink[]; autos: AutoPhrase[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<LinkDraft>(() => link
    ? { slug: link.slug, channel: link.channel, code: link.code, message: link.message, media_id: link.media_id, media_permalink: link.media_permalink, media_caption: link.media_caption, note: link.note, active: link.active }
    : { slug: '', channel: 'bio', code: '', message: '', media_id: null, media_permalink: null, media_caption: null, note: null, active: true });
  const [codeTouched, setCodeTouched] = useState(!!link);
  const [errs, setErrs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<IgMedia[] | null>(null);
  const [postsErr, setPostsErr] = useState('');
  const set = (p: Partial<LinkDraft>) => setD((cur) => ({ ...cur, ...p }));
  useEffect(() => { loadMedia(90).then((m) => setPosts(m.items), (e) => { setPosts([]); setPostsErr(e instanceof Error ? e.message : String(e)); }); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const text = d.message.trim() ? prefilledText(d.message) : '';
  const direct = text ? directUrl({ message: text }) : '';
  const clash = d.active && d.message.trim() ? phraseClash(d.message, all, autos, link ? link.id : null) : null;
  const [copiedWa, setCopiedWa] = useState('');
  const [copiedPub, setCopiedPub] = useState('');
  const save = async () => {
    const e = validateDraft(d, all, link ? link.id : null, autos);
    setErrs(e);
    if (e.length) return;
    setSaving(true);
    try { await saveLink(d, link ? link.id : null); onSaved(); } catch (x) { setErrs([x instanceof Error ? x.message : String(x)]); } finally { setSaving(false); }
  };
  const pick = (m: IgMedia | null) => set(m ? { media_id: m.id, media_permalink: m.permalink, media_caption: (m.caption || `${KIND_LABEL[m.kind]} de ${fmtWhen(m.timestamp)}`).replace(/\s+/g, ' ').slice(0, 200) } : { media_id: null, media_permalink: null, media_caption: null });
  return (
    <div role="dialog" aria-modal="true" aria-label={link ? 'Editar link' : 'Novo link'} className="igr-modal" onClick={onClose} data-testid="igr-editor">
      <div style={{ ...box, maxWidth: 640, width: '100%', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="igr-row" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>{link ? `Editar link “${link.slug}”` : 'Novo link'}</b>
          <button type="button" style={{ ...btn, padding: 6 }} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="igr-form">
          <label>Apelido (nome do link)
            <input style={field} value={d.slug} data-testid="igr-f-slug" placeholder="ex.: reel-ultra-9"
              onChange={(e) => { const slug = slugify(e.target.value); set(codeTouched ? { slug } : { slug, code: slug ? suggestCode(slug) : '' }); }} />
          </label>
          <label>Canal
            <select style={field} value={d.channel} onChange={(e) => set({ channel: e.target.value as IgChannel })} data-testid="igr-f-channel">
              {CHANNELS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </label>
          <label>Código interno (não vai na mensagem)
            <input style={field} value={d.code} data-testid="igr-f-code" onChange={(e) => { setCodeTouched(true); set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 23) }); }} />
          </label>
          <label>Ligado
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}><input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} data-testid="igr-f-active" /> link ativo (desligado: a frase deixa de ligar conversas a este link)</span>
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>Frase do link (a mensagem pré-preenchida; própria deste link)
          <textarea style={{ ...field, minHeight: 64, resize: 'vertical' }} value={d.message} maxLength={500} placeholder="ex.: Olá! Vi o reel do relógio de vocês e quero saber mais" onChange={(e) => set({ message: e.target.value })} data-testid="igr-f-message" />
          <span style={muted}>A conversa é ligada ao link por esta frase (mesmo com pequenas edições do cliente). Escreva uma frase natural, sem código e sem emoji, diferente das dos outros links e das automações.</span>
        </label>
        {hasEmoji(d.message) && <div role="status" style={{ ...muted, color: '#ef4444', fontWeight: 700, marginTop: 4 }} data-testid="igr-f-emoji">Tire os emojis: no iPhone o emoji chega quebrado.</div>}
        {clash && <div role="status" style={{ ...muted, color: '#ef4444', fontWeight: 700, marginTop: 4 }} data-testid="igr-f-clash">{clash}</div>}
        <div style={{ ...box, boxShadow: 'none', background: 'var(--bg-inner)', marginTop: 10, padding: 12 }} data-testid="igr-f-preview">
          <div style={eyebrow}>O cliente vai mandar</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>{text || '(escreva a frase)'}</div>
          {direct && <a href={direct} target="_blank" rel="noopener noreferrer" style={{ ...muted, color: ORANGE }}>testar no WhatsApp <ExternalLink size={11} /></a>}
        </div>
        <div style={{ ...box, boxShadow: 'none', background: 'var(--bg-inner)', marginTop: 10, padding: 12 }} data-testid="igr-f-direct">
          <div style={eyebrow}>Link direto do WhatsApp</div>
          <div style={{ fontSize: 12, marginTop: 4, overflowWrap: 'anywhere' }} data-testid="igr-f-direct-url">{direct || '(escreva a frase)'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" style={{ ...btn, padding: '4px 10px' }} disabled={!direct} onClick={async () => setCopiedWa((await copyText(direct)) ? 'Copiado!' : 'Não consegui copiar: selecione o link acima')} data-testid="igr-f-direct-copy"><Copy size={13} /> Copiar</button>
            {copiedWa && <span style={{ ...muted, fontWeight: 700 }} role="status">{copiedWa}</span>}
          </div>
          <div style={{ ...muted, marginTop: 6 }}>Este é o link para usar (bio, stories, ManyChat…): abre o WhatsApp direto, sem intermediário, e rastreia conversa → venda pela frase. O QR Code fica no botão do QR da lista.</div>
        </div>
        <details style={{ marginTop: 10 }} data-testid="igr-f-adv">
          <summary style={{ ...muted, cursor: 'pointer' }}>Avançado: link com contagem de cliques</summary>
          <div style={{ fontSize: 12, marginTop: 4, overflowWrap: 'anywhere' }} data-testid="igr-f-pub-url">{publicUrl(d.slug || 'apelido')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" style={{ ...btn, padding: '4px 10px' }} disabled={!d.slug} onClick={async () => setCopiedPub((await copyText(publicUrl(d.slug))) ? 'Copiado!' : 'Não consegui copiar: selecione o link acima')} data-testid="igr-f-pub-copy"><Copy size={13} /> Copiar</button>
            {copiedPub && <span style={{ ...muted, fontWeight: 700 }} role="status">{copiedPub}</span>}
          </div>
          <div style={{ ...muted, marginTop: 6 }}>Passa por uma página nossa antes do WhatsApp para contar o clique. Só use se quiser medir cliques.</div>
        </details>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Post ligado (opcional{d.channel === 'post' ? '; obrigatório para "Reel/post específico"' : ''})</div>
          {d.media_id && <div style={{ ...muted, marginBottom: 6 }} data-testid="igr-f-post">Escolhido: {d.media_caption || d.media_id} <button type="button" style={{ ...btn, padding: '2px 8px' }} onClick={() => pick(null)}>tirar</button></div>}
          {!posts ? <p style={muted}>Carregando os posts…</p> : !posts.length ? <p style={muted}>{postsErr ? `Lista de posts indisponível (${postsErr}).` : 'Nenhum post nos últimos 90 dias.'}</p> : (
            <div className="igr-posts" data-testid="igr-f-posts">
              {posts.slice(0, 24).map((m) => (
                <button key={m.id} type="button" onClick={() => pick(m)} aria-pressed={d.media_id === m.id} title={m.caption.slice(0, 80)} data-testid="igr-f-postitem"
                  style={{ padding: 0, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderStyle: 'solid', borderColor: d.media_id === m.id ? ORANGE : 'transparent', background: 'var(--bg-inner)', cursor: 'pointer' }}>
                  {m.thumb ? <img src={m.thumb} alt="" referrerPolicy="no-referrer" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '1/1' }} />}
                  <div style={{ fontSize: 10, padding: 2, color: 'var(--text-muted)' }}>{KIND_LABEL[m.kind]} · {fmtWhen(m.timestamp).slice(0, 5)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>Anotação (opcional)
          <input style={field} value={d.note || ''} maxLength={300} onChange={(e) => set({ note: e.target.value })} />
        </label>
        {errs.length > 0 && <ul role="alert" style={{ color: '#ef4444', fontSize: 13, margin: '10px 0 0', paddingLeft: 18 }} data-testid="igr-f-errors">{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" style={btn} onClick={onClose}>Cancelar</button>
          <button type="button" style={{ ...btn, background: ORANGE, borderColor: ORANGE, color: '#fff' }} onClick={save} disabled={saving} data-testid="igr-f-save">{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── QR code ──
function QrModal({ link, onClose }: { link: IgLink; onClose: () => void }) {
  const url = directUrl(link);
  const svg = useMemo(() => { try { return qrSvg(qrEncode(url), 6); } catch { return ''; } }, [url]);
  const [msg, setMsg] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const png = () => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 600; c.height = 600; const g = c.getContext('2d'); if (!g) return; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 600, 600); c.toBlob((b) => { if (b) save(b, `qr-${link.slug}.png`); }); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`QR code do link ${link.slug}`} className="igr-modal" onClick={onClose} data-testid="igr-qr-modal">
      <div style={{ ...box, maxWidth: 380, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="igr-row" style={{ marginBottom: 8 }}><b>QR Code · {link.slug}</b><button type="button" style={{ ...btn, padding: 6 }} onClick={onClose} aria-label="Fechar"><X size={16} /></button></div>
        {svg ? <div style={{ display: 'inline-block', background: '#fff', padding: 8, borderRadius: 12, maxWidth: '100%' }} data-testid="igr-qr-svg" dangerouslySetInnerHTML={{ __html: svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="auto" style="max-width:260px;display:block"') }} />
          : <p role="alert" style={{ ...muted, color: '#ef4444', fontWeight: 700 }} data-testid="igr-qr-long">A frase está longa demais para o QR Code: encurte a frase em "Editar".</p>}
        <div style={{ ...muted, margin: '8px 0', overflowWrap: 'anywhere' }} data-testid="igr-qr-url">{url}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={png} disabled={!svg} data-testid="igr-qr-png"><Download size={14} /> Baixar PNG</button>
          <button type="button" style={btn} disabled={!svg} onClick={() => save(new Blob([svg], { type: 'image/svg+xml' }), `qr-${link.slug}.svg`)}><Download size={14} /> SVG</button>
          <button type="button" style={btn} onClick={async () => setMsg((await copyText(url)) ? 'Link copiado!' : 'Não consegui copiar')}><Copy size={14} /> Copiar link</button>
        </div>
        {msg && <p style={{ ...muted, color: '#16a34a', fontWeight: 700 }} role="status">{msg}</p>}
      </div>
    </div>
  );
}

const CSS = `
.igr .igr-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.igr .igr-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.igr .igr-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.igr .igr-big{font-size:22px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums}
.igr .igr-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.igr .igr-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.igr .igr-scroll{overflow-x:auto}
.igr .igr-table{width:100%;border-collapse:collapse;font-size:13px}
.igr .igr-table th{text-align:left;color:var(--text-muted);font-weight:600;font-size:12px;padding:6px;border-bottom:1px solid var(--border-main);white-space:nowrap}
.igr .igr-table td{padding:8px 6px;border-bottom:1px solid var(--border-main);vertical-align:top}
.igr .igr-table .n{text-align:right;font-variant-numeric:tabular-nums}
.igr .igr-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60}
.igr .igr-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.igr .igr-form label{display:flex;flex-direction:column;gap:4px;font-size:13px}
.igr .igr-posts{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;max-height:220px;overflow:auto}
@media (max-width:760px){.igr .igr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.igr .igr-two,.igr .igr-three,.igr .igr-form{grid-template-columns:1fr}.igr .igr-big{font-size:19px}}
`;
