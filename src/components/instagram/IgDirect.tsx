// Aba Instagram → Direct (FASE 3, simples): as conversas (mais recentes primeiro) com foto, @/nome, última mensagem,
// origem (comentário/story/DM) e se a pessoa FOI para o WhatsApp (a conversa do WhatsApp começou com a frase/código do
// link que mandamos para ela, até 3 h depois). Abrir: histórico + resposta de texto (só dentro da janela de 24 h) e o
// botão "Mandar o WhatsApp" (a DM padrão com o link). Sem etiquetas, quadro ou régua.
// Enviar passa pela edge function ig-manage (o token fica nela). Regras: src/lib/igAuto.ts.
import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import { useErpRefresh } from '../../lib/erpRefresh';
import { ORIGIN_LABEL, matchWhatsapp, who, windowLeft, type IgConversation, type IgMessage, type WaLead } from '../../lib/igAuto';
import { IG_AUTO_MIGRATION, callManage, loadConversations, loadMessages, loadPersonComments, loadWaLeads } from '../../lib/igAutoDb';
import { GREEN, ORANGE, RED, badge, bd, box, btn, chip, field, muted, primary, when } from './igStyles';

interface Loaded { list: IgConversation[]; missing: boolean; leads: WaLead[] }
const leftText = (ms: number) => { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h ? `${h} h ${m} min` : `${m} min`; };

export default function IgDirect() {
  const [data, setData] = useState<Loaded | null>(null);
  const [onlyNot, setOnlyNot] = useState(false);
  const [open, setOpen] = useState<IgConversation | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      const [c, leads] = await Promise.all([loadConversations(), loadWaLeads()]);
      setData({ list: c.list, missing: c.missing, leads });
      setOpen((o) => (o ? c.list.find((x) => x.igsid === o.igsid) || o : o));
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  useErpRefresh(() => load());
  const went = useMemo(() => (data ? matchWhatsapp(data.list, data.leads) : new Map<string, WaLead>()), [data]);
  const notYet = data ? data.list.filter((c) => !went.has(c.igsid)).length : 0;
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = (data?.list || []).filter((c) => (!onlyNot || !went.has(c.igsid)) && (!q.trim() || fold(`${c.username || ''} ${c.name || ''} ${c.last_text || ''}`).includes(fold(q.trim()))));

  return (
    <div className="igd" data-testid="ig-direct">
      <style>{CSS}</style>
      {data && data.missing && <div role="alert" style={{ ...box, borderColor: ORANGE, marginBottom: 16 }}><b>Falta aplicar a migration {IG_AUTO_MIGRATION}.</b> <span style={muted}>Sem ela o Direct fica vazio.</span></div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button type="button" style={chip(!onlyNot)} aria-pressed={!onlyNot} onClick={() => setOnlyNot(false)}>Todas ({data ? data.list.length : 0})</button>
        <button type="button" style={chip(onlyNot)} aria-pressed={onlyNot} onClick={() => setOnlyNot(true)} data-testid="igd-filter-not">⏳ Ainda não foi para o WhatsApp ({notYet})</button>
        <input aria-label="Buscar conversa" placeholder="Buscar @, nome ou mensagem" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...field, maxWidth: 260 }} />
        <button type="button" style={btn} onClick={() => load()} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} style={{ color: ORANGE }} /> Atualizar</button>
      </div>
      <div className={`igd-wrap${open ? ' igd-open' : ''}`}>
        <div className="igd-list" style={{ ...box, padding: 0 }} data-testid="igd-list">
          {!data && <div style={{ ...muted, padding: 16 }}>Carregando…</div>}
          {data && !shown.length && <div style={{ ...muted, padding: 16 }}>{data.list.length ? 'Nenhuma conversa neste filtro.' : 'Nenhuma conversa ainda (chegam pelo webhook quando alguém comenta ou manda DM).'}</div>}
          {shown.map((c) => (
            <button key={c.igsid} type="button" onClick={() => setOpen(c)} className="igd-row" data-testid="igd-row" aria-current={open?.igsid === c.igsid}
              style={{ background: open?.igsid === c.igsid ? 'var(--bg-inner)' : 'transparent', borderBottom: `1px solid ${bd}` }}>
              <Avatar c={c} />
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{who(c)}</b>{c.name && c.username && <span style={muted}>{c.name}</span>}
                  <span style={badge('var(--bg-inner)', 'var(--text-secondary)')}>{ORIGIN_LABEL[c.origin] || c.origin}</span>
                </div>
                <div style={{ ...muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last_from === 'loja' ? 'Você: ' : ''}{c.last_text || '—'}</div>
                <div style={{ marginTop: 2 }}>{went.has(c.igsid) ? <span style={badge('#dcfce7', '#166534')} data-testid="igd-went">✅ foi para o WhatsApp</span> : <span style={badge('#fef3c7', '#92400e')} data-testid="igd-not">⏳ ainda não foi</span>}</div>
              </div>
              <span style={{ ...muted, flexShrink: 0 }}>{when(c.last_at)}</span>
            </button>
          ))}
        </div>
        {open && <Thread c={open} went={went.get(open.igsid) || null} onClose={() => setOpen(null)} onSent={load} />}
      </div>
    </div>
  );
}

function Avatar({ c }: { c: IgConversation }) {
  const [bad, setBad] = useState(false);
  if (c.profile_pic && !bad) return <img src={c.profile_pic} alt="" width={40} height={40} onError={() => setBad(true)} style={{ borderRadius: 999, flexShrink: 0, objectFit: 'cover' }} />;
  return <span style={{ width: 40, height: 40, borderRadius: 999, background: ORANGE, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{(c.username || c.name || '?').charAt(0).toUpperCase()}</span>;
}

function Thread({ c, went, onClose, onSent }: { c: IgConversation; went: WaLead | null; onClose: () => void; onSent: () => void }) {
  const [msgs, setMsgs] = useState<IgMessage[] | null>(null);
  const [comments, setComments] = useState<{ comment_id: string; text: string | null; commented_at: string }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = async () => {
    const [m, cm] = await Promise.all([loadMessages(c.igsid), loadPersonComments(c.igsid).catch(() => [])]);
    setMsgs(m); setComments(cm);
  };
  useEffect(() => { setMsgs(null); setMsg(null); setText(''); load(); }, [c.igsid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const left = windowLeft(c, now);
  const open = left != null && left > 0;
  const items = useMemo(() => [
    ...(msgs || []).map((m) => ({ k: m.mid, at: m.sent_at, me: m.from_me, text: m.text || (m.kind === 'story_mention' ? '📣 mencionou você no story' : m.attachment_type ? `[${m.attachment_type}]` : '—'), tag: m.automation_id ? '⚡ automação' : m.kind === 'story_reply' ? 'resposta ao story' : null })),
    ...comments.map((x) => ({ k: x.comment_id, at: x.commented_at, me: false, text: `💬 ${x.text || ''}`, tag: 'comentário' })),
  ].sort((a, b) => a.at.localeCompare(b.at)), [msgs, comments]);
  const send = async (action: 'reply' | 'send_whatsapp') => {
    setBusy(true); setMsg(null);
    try {
      const r = await callManage<{ fallback?: boolean }>(action === 'reply' ? { action, igsid: c.igsid, text } : { action, igsid: c.igsid });
      setMsg({ ok: true, text: action === 'reply' ? 'Resposta enviada.' : r.fallback ? 'WhatsApp enviado (como texto com o link: o Instagram recusou o botão).' : 'WhatsApp enviado.' });
      if (action === 'reply') setText('');
      await load(); onSent();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="igd-thread" style={{ ...box, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="igd-thread">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar c={c} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{who(c)}</b> {c.name && c.username && <span style={muted}>{c.name}</span>}
          <div>{went ? <span style={badge('#dcfce7', '#166534')}>✅ foi para o WhatsApp · {when(went.first_message_at)}</span> : <span style={badge('#fef3c7', '#92400e')}>⏳ ainda não foi para o WhatsApp</span>}</div>
        </div>
        <button type="button" style={btn} onClick={onClose} aria-label="Fechar conversa"><X size={14} /></button>
      </div>
      <div className="igd-msgs" data-testid="igd-msgs">
        {!msgs && <div style={muted}>Carregando…</div>}
        {msgs && !items.length && <div style={muted}>Sem mensagens.</div>}
        {items.map((m) => (
          <div key={m.k} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '82%', background: m.me ? '#ffedd5' : 'var(--bg-inner)', color: m.me ? '#7c2d12' : 'var(--text-primary)', padding: '8px 10px', borderRadius: 12, fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {m.text}
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{when(m.at)}{m.tag ? ` · ${m.tag}` : ''}</div>
          </div>
        ))}
      </div>
      {open ? <div style={{ ...muted, color: GREEN }} data-testid="igd-window">Pode responder por mais {leftText(left as number)} (janela de 24 h do Instagram).</div>
        : <div role="alert" style={{ fontSize: 12, color: RED, fontWeight: 600 }} data-testid="igd-closed">{left == null ? 'Esta pessoa ainda não mandou DM: o Instagram só deixa responder depois que ela mandar.' : 'Fora da janela de 24 h: o Instagram só deixa responder até 24 h depois da última mensagem da pessoa.'}</div>}
      <textarea aria-label="Responder" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={!open || busy} placeholder={open ? 'Escreva a resposta…' : 'Fora da janela de 24 h'} style={{ ...field, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" style={{ ...btn, color: GREEN, borderColor: GREEN }} onClick={() => send('send_whatsapp')} disabled={!open || busy} data-testid="igd-send-wa"><MessageCircle size={14} /> Mandar o WhatsApp</button>
        <button type="button" style={primary} onClick={() => send('reply')} disabled={!open || busy || !text.trim()} data-testid="igd-send"><Send size={14} /> Enviar</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 13, color: msg.ok ? GREEN : RED }} data-testid="igd-msg">{msg.text}</div>}
    </div>
  );
}

const CSS = `
.igd .igd-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.igd .igd-wrap.igd-open{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}
.igd .igd-list{max-height:70vh;overflow-y:auto}
.igd .igd-row{display:flex;gap:10px;align-items:center;width:100%;padding:10px 12px;border:none;cursor:pointer;color:var(--text-primary);box-sizing:border-box}
.igd .igd-msgs{display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;padding:4px}
@media (max-width:760px){.igd .igd-wrap.igd-open{grid-template-columns:minmax(0,1fr)}.igd .igd-wrap.igd-open .igd-list{display:none}}
`;
