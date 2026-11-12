// Aba Instagram → Automações (FASE 3, substituto do ManyChat). TUDO NASCE DESLIGADO:
//   - Conectar Instagram (Login do Instagram, token de longa duração no servidor, renovação automática) + passo a passo
//     da Meta;
//   - chave geral "Automações do Instagram" (ligadas / desligadas; 12/11: sem modo teste, sempre real) e o antispam
//     (1 DM automática por pessoa a cada X horas, todas as automações somadas);
//   - cartões "Quando… / E o comentário possui… / Responder no comentário / Eles receberão (DM)" com ligar/desligar,
//     editar e as métricas do período (disparos, DMs, cliques, conversas no WhatsApp, vendas, R$, CTR).
// Regras: src/lib/igAuto.ts (as mesmas do servidor) · banco: src/lib/igAutoDb.ts · README: src/pages/Instagram.README.md
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Pencil, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useErpRefresh } from '../../lib/erpRefresh';
import { lastDays } from '../../lib/igLinksDb';
import {
  TRIGGERS, automationMetrics, blankAutomation, hasText, linkOf, suggestAutoCode, validateAutomation, whenText,
  type AutoMetrics, type Automation, type ConvSale, type IgRun, type IgSettings, type Trigger,
} from '../../lib/igAuto';
import {
  IG_AUTO_MIGRATION, IG_CRON_MIGRATION, ManageError, callManage, loadAutomations, loadClicksByLink, loadConvSales, loadLinkCodes, loadRuns, loadSettings, loadWebhookLog, saveAutomation, saveSetting, setAutomationActive,
  type IgPost, type ManageStatus,
} from '../../lib/igAutoDb';
import { GREEN, ORANGE, PINK, RED, badge, bd, box, btn, chip, ddmm, eyebrow, field, label, money, muted, pct, primary, when } from './igStyles';

const PERIODS = [7, 30, 90];
type Link = { id: string; slug: string; code: string; active: boolean };
interface Loaded { list: Automation[]; missing: boolean; settings: IgSettings; runs: IgRun[]; clicks: Map<string, number>; convs: ConvSale[]; links: Link[]; log: { created_at: string; level: string; message: string }[] }

export default function IgAutomations() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Automation | 'nova' | null>(null);
  const [busy, setBusy] = useState(false);
  const r = useMemo(() => lastDays(days), [days]);
  const load = async () => {
    setBusy(true);
    try {
      const [a, settings, runs, clicks, cv, links, log] = await Promise.all([loadAutomations(), loadSettings(), loadRuns(r), loadClicksByLink(r), loadConvSales(r), loadLinkCodes(), loadWebhookLog().catch(() => [])]);
      setData({ list: a.list, missing: a.missing, settings, runs, clicks, convs: cv.convs, links, log });
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  useErpRefresh(() => load());
  const metrics = useMemo(() => {
    const m = new Map<string, AutoMetrics>();
    if (!data) return m;
    const codeOf = new Map(data.links.map((l) => [l.id, l.code]));
    data.list.forEach((a) => m.set(a.id, automationMetrics(a, data.runs, data.clicks, data.convs, a.link_id ? codeOf.get(a.link_id) || null : null)));
    return m;
  }, [data]);

  return (
    <div data-testid="ig-automations" className="iga">
      <style>{CSS}</style>
      <ConnectCard />
      {data && data.missing && (
        <div role="alert" style={{ ...box, borderColor: ORANGE, marginBottom: 16 }} data-testid="iga-missing">
          <b>Falta aplicar a migration {IG_AUTO_MIGRATION}.</b> <span style={muted}>Sem ela as automações não aparecem (nada é enviado).</span>
        </div>
      )}
      {error && <div role="alert" style={{ ...box, borderColor: RED, marginBottom: 16 }}>{error}</div>}
      {data && !data.missing && <SafetyCard settings={data.settings} onSaved={load} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
        <div style={eyebrow}>Automações</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div role="group" aria-label="Período das métricas" style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map((d) => <button key={d} type="button" style={chip(d === days)} aria-pressed={d === days} onClick={() => setDays(d)} data-testid={`iga-period-${d}`}>{d} dias</button>)}
          </div>
          <button type="button" style={btn} onClick={() => load()} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: ORANGE }} /> Atualizar</button>
          {data && !data.missing && <button type="button" style={primary} onClick={() => setEdit('nova')} data-testid="iga-new"><Plus size={14} /> Nova automação</button>}
        </div>
      </div>

      {!data && !error && <div style={muted}>Carregando…</div>}
      {data && !data.missing && !data.list.length && <div style={{ ...box, ...muted }}>Nenhuma automação ainda.</div>}
      <div className="iga-cards">
        {data && data.list.map((a) => <AutoCard key={a.id} a={a} m={metrics.get(a.id)!} links={data.links} onEdit={() => setEdit(a)} onToggled={load} />)}
      </div>

      {data && data.log.length > 0 && (
        <details style={{ ...box, marginTop: 16, padding: '10px 16px' }} data-testid="iga-log">
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Avisos do webhook ({data.log.length})</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>{data.log.map((l, i) => <li key={i}>{when(l.created_at)} · {l.level}: {l.message}</li>)}</ul>
        </details>
      )}
      {edit && data && <Editor initial={edit === 'nova' ? null : edit} all={data.list} links={data.links} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

// ── Conectar Instagram + passo a passo ──
function ConnectCard() {
  const [st, setSt] = useState<ManageStatus | null>(null);
  const [err, setErr] = useState<{ msg: string; np: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const back = useMemo(() => { try { const q = new URLSearchParams(window.location.search); return { ig: q.get('ig'), motivo: q.get('motivo') }; } catch { return { ig: null, motivo: null }; } }, []);
  const load = async () => {
    try { setSt(await callManage<ManageStatus>({ action: 'status' })); setErr(null); } catch (e) { setErr({ msg: e instanceof Error ? e.message : String(e), np: e instanceof ManageError && e.notPublished }); }
  };
  useEffect(() => { load(); }, []);
  const connect = async () => {
    setBusy(true); setMsg(null);
    try { const r = await callManage<{ url: string }>({ action: 'connect_url' }); window.location.assign(r.url); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setMsg(null);
    try { setSt(await callManage<ManageStatus>({ action: 'refresh' })); setMsg('Token renovado.'); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const missing = st ? Object.entries(st.secrets).filter(([, v]) => !v).map(([k]) => k) : [];
  return (
    <div style={{ ...box, marginBottom: 16 }} data-testid="iga-connect">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>Conta do Instagram</div>
          {back.ig === 'conectado' && <div style={{ color: GREEN, fontWeight: 700, marginTop: 4 }} data-testid="iga-back-ok">✅ Instagram conectado.</div>}
          {back.ig === 'erro' && <div style={{ color: RED, fontWeight: 700, marginTop: 4 }} data-testid="iga-back-err">Não conectou: {back.motivo || 'erro'}</div>}
          {err && <div style={{ marginTop: 4 }} data-testid="iga-connect-err"><b>{err.np ? 'Publique a edge function "ig-manage" no Supabase.' : 'Não consegui ler a conta.'}</b> <span style={muted}>{err.msg}</span></div>}
          {st && !st.connected && <div style={{ marginTop: 4, fontWeight: 700 }} data-testid="iga-not-connected">Instagram não conectado</div>}
          {st && st.connected && st.account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }} data-testid="iga-connected">
              {st.account.picture_url && <img src={st.account.picture_url} alt="" width={36} height={36} style={{ borderRadius: 999 }} />}
              <div>
                <div style={{ fontWeight: 700 }}>Conectado como @{st.account.username || st.account.ig_user_id} · token válido até {ddmm(st.token_expires_at)}</div>
                <div style={muted}>Renova sozinho quando faltar menos de 20 dias{st.days_left != null ? ` (faltam ${st.days_left} dias)` : ''}.</div>
              </div>
            </div>
          )}
          {st && st.alert && <div role="alert" style={{ marginTop: 8, color: RED, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }} data-testid="iga-token-alert"><ShieldAlert size={16} /> {st.alert}</div>}
          {missing.length > 0 && <div style={{ marginTop: 8, color: ORANGE, fontWeight: 600 }} data-testid="iga-secrets">Faltam os segredos no Supabase: {missing.join(', ')} (veja o passo a passo).</div>}
          {msg && <div style={{ marginTop: 8, ...muted }}>{msg}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {st && <button type="button" style={primary} onClick={connect} disabled={busy || missing.includes('IG_APP_ID') || missing.includes('IG_APP_SECRET')} data-testid="iga-connect-btn">{st.connected ? 'Conectar de novo' : 'Conectar Instagram'}</button>}
          {st && st.connected && <button type="button" style={btn} onClick={refresh} disabled={busy} data-testid="iga-refresh-token"><RefreshCw size={14} /> Renovar agora</button>}
        </div>
      </div>
      <Steps st={st} />
    </div>
  );
}
function Steps({ st }: { st: ManageStatus | null }) {
  const redirect = st?.redirect_uri || 'https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-manage/oauth';
  const hook = st?.webhook_url || 'https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-webhook';
  const code = (t: string) => <code style={{ background: 'var(--bg-inner)', padding: '1px 6px', borderRadius: 6, wordBreak: 'break-all' }}>{t}</code>;
  return (
    <details style={{ marginTop: 12 }} data-testid="iga-steps">
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Passo a passo para configurar na Meta</summary>
      <ol style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <li>Em <b>developers.facebook.com → Meus apps</b>, abra o app (ou crie um do tipo Empresa) e adicione o produto <b>Instagram</b> → <b>API com Login do Instagram</b>.</li>
        <li>Em <b>Instagram → Configuração da API com Login do Instagram</b>, copie o <b>ID do app do Instagram</b> e a <b>Chave secreta do app do Instagram</b> (não são os do app do Facebook).</li>
        <li>No Supabase → <b>Edge Functions → Secrets</b>, cadastre {code('IG_APP_ID')}, {code('IG_APP_SECRET')} e {code('IG_WEBHOOK_VERIFY_TOKEN')} (uma senha que você inventa).</li>
        <li>Publique as edge functions {code('ig-manage')} e {code('ig-webhook')} com <b>Verify JWT desligado</b>.</li>
        <li>Em <b>Configurar o login da empresa do Instagram</b>, URL de redirecionamento: {code(redirect)}</li>
        <li>Em <b>Configurar webhooks</b>: URL de retorno {code(hook)} e Token de verificação = o mesmo {code('IG_WEBHOOK_VERIFY_TOKEN')}. Clique em Verificar e salvar.</li>
        <li>Assine os campos: {code('messages')}, {code('messaging_postbacks')}, {code('comments')} e {code('live_comments')}.</li>
        <li>No celular, no app do Instagram: <b>Configurações → Mensagens e respostas aos stories → Ferramentas conectadas → Permitir acesso às mensagens</b> (ligado).</li>
        <li>Volte aqui e clique em <b>Conectar Instagram</b> (entre como @store_triumph). Aplique também a migration {code(IG_CRON_MIGRATION)} (renovação diária do token).</li>
        <li>Enquanto o app estiver em <b>modo de desenvolvimento</b>, só contas com função no app recebem respostas; para todos, peça as permissões {code('instagram_business_manage_messages')} e {code('instagram_business_manage_comments')} na Análise do app e publique o app.</li>
        <li>Desligue a automação no ManyChat antes de ligar aqui, para não responder em dobro.</li>
      </ol>
    </details>
  );
}

// ── chave geral e antispam (12/11: sem modo teste) ──
function SafetyCard({ settings, onSaved }: { settings: IgSettings; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hours, setHours] = useState(String(settings.cooldownHours));
  useEffect(() => { setHours(String(settings.cooldownHours)); }, [settings.cooldownHours]);
  const save = async (key: string, value: string) => {
    setBusy(true); setErr('');
    try { await saveSetting(key, value); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const toggleMain = () => {
    if (!settings.enabled && !window.confirm('Ligar as automações do Instagram?')) return;
    save('ig_automations_enabled', settings.enabled ? 'false' : 'true');
  };
  const state = !settings.enabled ? { text: 'Automações do Instagram: desligadas', color: 'var(--text-muted)', sub: 'O webhook recebe e grava tudo, mas não envia nada.' }
    : { text: 'Automações do Instagram: ligadas', color: GREEN, sub: 'As automações ligadas respondem a todos.' };
  return (
    <div style={{ ...box, borderColor: settings.enabled ? state.color : bd }} data-testid="iga-safety">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: state.color }} data-testid="iga-main-state">{state.text}</div>
          <div style={muted}>{state.sub}</div>
        </div>
        <button type="button" role="switch" aria-checked={settings.enabled} aria-label="Automações do Instagram" onClick={toggleMain} disabled={busy} data-testid="iga-main-switch"
          style={{ ...btn, ...(settings.enabled ? { background: GREEN, borderColor: GREEN, color: '#fff' } : {}) }}>{settings.enabled ? 'Ligadas · desligar' : 'Desligadas · ligar'}</button>
      </div>
      <div className="iga-safety-grid">
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Antispam</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>No máximo 1 DM automática por pessoa a cada</span>
            <input type="number" min={1} max={720} aria-label="Horas entre DMs automáticas" value={hours} onChange={(e) => setHours(e.target.value)} style={{ ...field, width: 80 }} />
            <span style={{ fontSize: 13 }}>horas</span>
            <button type="button" style={btn} disabled={busy || Number(hours) === settings.cooldownHours || !(Number(hours) >= 1 && Number(hours) <= 720)} onClick={() => save('ig_dm_cooldown_hours', String(Math.round(Number(hours))))} data-testid="iga-cooldown-save">Salvar</button>
          </div>
          <div style={muted}>Somando todas as automações. O mesmo comentário/mensagem nunca dispara 2 vezes.</div>
        </div>
      </div>
      {err && <div role="alert" style={{ color: RED, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── cartão de uma automação ──
function AutoCard({ a, m, links, onEdit, onToggled }: { a: Automation; m: AutoMetrics; links: Link[]; onEdit: () => void; onToggled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    if (!a.active && validateAutomation(a).length) { setErr('Complete a automação antes de ligar (Editar).'); return; }
    setBusy(true); setErr('');
    try { await setAutomationActive(a.id, !a.active); onToggled(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const link = linkOf(a, a.link_mode === 'link' ? links.find((l) => l.id === a.link_id) || null : null);
  const status = !a.active ? { t: 'DESLIGADA', bg: 'var(--bg-inner)', c: 'var(--text-muted)' } : { t: 'LIGADA', bg: '#dcfce7', c: '#166534' };
  const Row = ({ title, children, color }: { title: string; children: React.ReactNode; color: string }) => (
    <div style={{ borderLeft: `3px solid ${color}`, padding: '6px 10px', background: 'var(--bg-inner)', borderRadius: 8, marginTop: 8 }}>
      <div style={{ ...eyebrow, color }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 2, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
  return (
    <div style={box} data-testid="iga-card" data-id={a.id}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{a.name}</div>
          <span style={badge(status.bg, status.c)} data-testid="iga-card-status">{status.t}</span> <span style={muted}>{a.code}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" role="switch" aria-checked={a.active} aria-label={`Ligar ${a.name}`} onClick={toggle} disabled={busy} data-testid="iga-card-toggle" style={{ ...btn, ...(a.active ? { background: GREEN, borderColor: GREEN, color: '#fff' } : {}) }}>{a.active ? 'Ligada' : 'Desligada'}</button>
          <button type="button" style={btn} onClick={onEdit} aria-label={`Editar ${a.name}`} data-testid="iga-card-edit"><Pencil size={14} /></button>
        </div>
      </div>
      <Row title="Quando…" color={PINK}>{whenText(a)}</Row>
      {(a.trigger === 'comentario' || a.trigger === 'dm_palavra' || a.keyword_mode === 'palavras') && <Row title={a.trigger === 'comentario' ? 'E o comentário possui…' : 'E a mensagem possui…'} color={PINK}>{hasText(a)}</Row>}
      {a.trigger === 'comentario' && <Row title="Responder no comentário" color="#2563eb">{a.public_replies.length ? a.public_replies.map((t, i) => <div key={i}>“{t}”</div>) : <span style={muted}>Não responde em público</span>}</Row>}
      <Row title="Eles receberão (DM)" color={ORANGE}>
        {a.dm_texts.length ? <>{a.dm_texts.map((t, i) => <div key={i} style={{ marginBottom: 4 }}>{a.dm_texts.length > 1 ? `${i + 1}. ` : ''}{t}</div>)}
          <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ ...badge(GREEN), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>{a.button_title} <ExternalLink size={11} /></a>
          <div style={{ ...muted, marginTop: 4 }}>{a.link_mode === 'link' ? `Link rastreável ${link.url}` : `WhatsApp com a frase: “${a.wa_phrase || ''}”`}</div></> : <span style={muted}>Sem DM</span>}
      </Row>
      <div className="iga-metrics" data-testid="iga-metrics">
        {[['Disparos', m.triggers], ['DMs enviadas', m.dms], ['Cliques', m.clicks == null ? '—' : m.clicks], ['Conversas no WhatsApp', m.conversations], ['Vendas', m.sales], ['Faturamento', money(m.revenue)], [m.clicks == null ? 'DM → conversa' : 'CTR', pct(m.clicks == null ? m.convRate : m.ctr)]].map(([k, v]) => (
          <div key={String(k)}><div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div><div style={muted}>{k}</div></div>
        ))}
      </div>
      {(m.skipped > 0 || m.failed > 0) && <div style={{ ...muted, marginTop: 6 }}>{m.skipped} pulado(s) (antispam ou janela) · {m.failed} com erro da Meta</div>}
      {err && <div role="alert" style={{ color: RED, marginTop: 6, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

// ── editor ──
function VarList({ title, items, onChange, max, ph }: { title: string; items: string[]; onChange: (v: string[]) => void; max: number; ph: string }) {
  return (
    <div>
      <span style={label}>{title}</span>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <textarea aria-label={`${title} ${i + 1}`} value={t} rows={t.length > 80 ? 4 : 2} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...field, resize: 'vertical' }} />
          <button type="button" style={btn} aria-label={`Tirar variação ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={14} /></button>
        </div>
      ))}
      {items.length < max && <button type="button" style={btn} onClick={() => onChange([...items, ''])} data-testid={`iga-add-${title.startsWith('Resposta') ? 'public' : 'dm'}`}><Plus size={14} /> {ph}</button>}
    </div>
  );
}

function Editor({ initial, all, links, onClose, onSaved }: { initial: Automation | null; all: Automation[]; links: Link[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Omit<Automation, 'id'> & { id?: string }>(() => initial ? { ...initial } : blankAutomation(all.length, all.map((a) => a.code)));
  const [touchedCode, setTouchedCode] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[]>([]);
  const [posts, setPosts] = useState<{ list: IgPost[] | null; error: string | null }>({ list: null, error: null });
  const set = (p: Partial<Automation>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (d.trigger !== 'comentario' || d.media_scope !== 'escolhidos' || posts.list || posts.error) return;
    callManage<{ items: IgPost[] }>({ action: 'media' }).then((r) => setPosts({ list: r.items, error: null }), (e) => setPosts({ list: null, error: e instanceof Error ? e.message : String(e) }));
  }, [d.trigger, d.media_scope, posts]);
  const problems = validateAutomation({ ...d, id: d.id || '' } as Automation, all);
  const save = async () => {
    if (problems.length) { setErr(problems); return; }
    setBusy(true); setErr([]);
    try { await saveAutomation({ ...d, id: initial ? initial.id : null }); onSaved(); } catch (e) { setErr([e instanceof Error ? e.message : String(e)]); setBusy(false); }
  };
  const link = linkOf(d as Automation, d.link_mode === 'link' ? links.find((l) => l.id === d.link_id) || null : null);
  return (
    <div role="dialog" aria-modal="true" aria-label="Editar automação" className="iga-modal" data-testid="iga-editor" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iga-modal-box" style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 16 }}>{initial ? 'Editar automação' : 'Nova automação (nasce desligada)'}</b>
          <button type="button" style={btn} onClick={onClose} aria-label="Fechar"><X size={14} /></button>
        </div>
        <span style={label}>Nome</span>
        <input aria-label="Nome" value={d.name} onChange={(e) => set({ name: e.target.value, ...(touchedCode ? {} : { code: suggestAutoCode(e.target.value, all.map((a) => a.code)) }) })} style={field} />
        <span style={label}>Quando…</span>
        <select aria-label="Quando" value={d.trigger} onChange={(e) => { const t = e.target.value as Trigger; set({ trigger: t, ...(t !== 'comentario' ? { public_replies: [] } : {}), ...(t === 'dm_palavra' ? { keyword_mode: 'palavras' } : {}) }); }} style={field}>
          {TRIGGERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {d.trigger === 'comentario' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }} role="group" aria-label="Em quais posts">
              <button type="button" style={chip(d.media_scope === 'todos')} onClick={() => set({ media_scope: 'todos' })}>Qualquer post ou reel</button>
              <button type="button" style={chip(d.media_scope === 'escolhidos')} onClick={() => set({ media_scope: 'escolhidos' })} data-testid="iga-scope-chosen">Posts escolhidos ({d.media_ids.length})</button>
            </div>
            {d.media_scope === 'escolhidos' && (
              <div className="iga-grid" data-testid="iga-posts">
                {posts.error && <div style={{ ...muted, gridColumn: '1 / -1' }}>Não consegui ler os posts: {posts.error}</div>}
                {!posts.list && !posts.error && <div style={{ ...muted, gridColumn: '1 / -1' }}>Carregando posts…</div>}
                {(posts.list || []).map((p) => {
                  const on = d.media_ids.includes(p.id);
                  return (
                    <button key={p.id} type="button" aria-pressed={on} title={p.caption} data-testid="iga-post" onClick={() => set({ media_ids: on ? d.media_ids.filter((x) => x !== p.id) : [...d.media_ids, p.id] })}
                      style={{ position: 'relative', padding: 0, border: `3px solid ${on ? ORANGE : 'transparent'}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1 / 1', background: 'var(--bg-inner)' }}>
                      {p.thumb ? <img src={p.thumb} alt={p.caption.slice(0, 60)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={muted}>{p.type}</span>}
                      {on && <CheckCircle2 size={18} color="#fff" fill={ORANGE} style={{ position: 'absolute', top: 4, right: 4 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {d.trigger !== 'dm_nova' && d.trigger !== 'story' ? null : (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={d.keyword_mode === 'palavras'} onChange={(e) => set({ keyword_mode: e.target.checked ? 'palavras' : 'qualquer' })} /> Só se a mensagem tiver as palavras abaixo
          </label>
        )}
        {(d.trigger === 'comentario') && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }} role="group" aria-label="E o comentário possui">
            <button type="button" style={chip(d.keyword_mode === 'qualquer')} onClick={() => set({ keyword_mode: 'qualquer' })}>Qualquer palavra</button>
            <button type="button" style={chip(d.keyword_mode === 'palavras')} onClick={() => set({ keyword_mode: 'palavras' })} data-testid="iga-kw-mode">Palavras-chave</button>
          </div>
        )}
        {(d.keyword_mode === 'palavras' || d.trigger === 'dm_palavra') && (
          <>
            <span style={label}>Palavras-chave (separe por vírgula; sem diferença de acento ou maiúscula)</span>
            <input aria-label="Palavras-chave" value={d.keywords.join(', ')} onChange={(e) => set({ keywords: e.target.value.split(',').map((k) => k.trimStart()) })} style={field} placeholder="quero, preço, valor" />
          </>
        )}
        {d.trigger === 'comentario' && <VarList title="Resposta pública no comentário (uma é sorteada; opcional)" items={d.public_replies} onChange={(v) => set({ public_replies: v })} max={20} ph="Variação de resposta" />}
        <VarList title="DM (uma variação é sorteada; use {nome})" items={d.dm_texts} onChange={(v) => set({ dm_texts: v })} max={10} ph="Variação de DM" />
        <span style={label}>Texto do botão</span>
        <input aria-label="Texto do botão" value={d.button_title} maxLength={20} onChange={(e) => set({ button_title: e.target.value })} style={{ ...field, maxWidth: 240 }} />
        <span style={label}>O botão leva para</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="O botão leva para">
          <button type="button" style={chip(d.link_mode === 'frase')} onClick={() => set({ link_mode: 'frase' })}>WhatsApp com a frase (padrão)</button>
          <button type="button" style={chip(d.link_mode === 'link')} onClick={() => set({ link_mode: 'link' })} data-testid="iga-link-mode">Link rastreável /l/…</button>
        </div>
        {d.link_mode === 'frase' ? (
          <>
            <span style={label}>Frase que a pessoa manda no WhatsApp (o ERP liga a conversa por ela)</span>
            <input aria-label="Frase do WhatsApp" value={d.wa_phrase || ''} onChange={(e) => set({ wa_phrase: e.target.value })} style={field} />
          </>
        ) : (
          <select aria-label="Link rastreável" value={d.link_id || ''} onChange={(e) => set({ link_id: e.target.value || null })} style={{ ...field, marginTop: 8 }}>
            <option value="">Escolha o link…</option>
            {links.filter((l) => l.active || l.id === d.link_id).map((l) => <option key={l.id} value={l.id}>/l/{l.slug} ({l.code})</option>)}
          </select>
        )}
        <div style={{ ...muted, marginTop: 6, overflowWrap: 'anywhere' }} data-testid="iga-link-preview">Link do botão: {link.url}</div>
        <span style={label}>Código (para as métricas)</span>
        <input aria-label="Código" value={d.code} onChange={(e) => { setTouchedCode(true); set({ code: e.target.value.toUpperCase() }); }} style={{ ...field, maxWidth: 240 }} />
        {err.length > 0 && <ul role="alert" style={{ color: RED, fontSize: 13, paddingLeft: 18 }} data-testid="iga-editor-errors">{err.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={onClose}>Cancelar</button>
          <button type="button" style={primary} onClick={save} disabled={busy} data-testid="iga-save">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
        {!initial && <div style={{ ...muted, marginTop: 8 }}>A automação nova é salva DESLIGADA. Ligue no cartão quando quiser.</div>}
      </div>
    </div>
  );
}

const CSS = `
.iga .iga-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.iga .iga-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-main)}
.iga .iga-safety-grid{display:grid;grid-template-columns:1fr;gap:20px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border-main)}
.iga-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;z-index:60;overflow-y:auto}
.iga-modal-box{width:min(680px,100%);box-sizing:border-box}
.iga-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;margin-top:8px;max-height:320px;overflow-y:auto}
@media (max-width:760px){.iga .iga-cards{grid-template-columns:1fr}.iga .iga-safety-grid{grid-template-columns:1fr}.iga .iga-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
