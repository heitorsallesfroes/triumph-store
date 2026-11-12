// Instagram FASE 3 — o motor das automações: lê o corpo do webhook, grava (sem duplicar) e decide/manda as
// respostas. O banco (Store) e a Meta (IgApi) vêm por parâmetro: no Deno, Supabase + graph.instagram.com
// (igStore.ts / igApi.ts); nos testes, em memória + Meta SIMULADA.
// Regras de segurança:
//   - chave geral DESLIGADA (ig_automations_enabled=false): grava tudo e NÃO manda nada;
//   - modo teste: só as contas da lista recebem; as outras viram "pulado: modo teste";
//   - eco (is_echo) e mensagens/comentários da própria conta: gravados como "de mim", NUNCA disparam;
//   - o mesmo comentário/mensagem nunca dispara 2 vezes (ig_automation_runs.source_id único) e mensagem repetida
//     da Meta (mesmo mid / comment_id) é ignorada;
//   - antispam: no máximo 1 DM automática por pessoa a cada X horas, todas as automações somadas (trava atômica
//     no Postgres: ig_claim_dm);
//   - DM só dentro da janela: comentário até 7 dias; DM/story até 24 h da última mensagem da pessoa.
import { fillName, linkOf, pick, pickAutomation, inTestList, within, DM_WINDOW_MS, PRIVATE_REPLY_MS, IGSID_RE, type Automation, type IgSettings } from './igRules.ts';
import { sendLinkDm, type IgApi } from './igApi.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type MsgKind = 'dm' | 'story_reply' | 'story_mention' | 'postback';
export interface MsgEvent { type: 'message'; mid: string; igsid: string; fromMe: boolean; echo: boolean; kind: MsgKind; text: string | null; attachment: string | null; appId: string | null; at: number }
export interface CommentEvent { type: 'comment'; id: string; mediaId: string | null; igsid: string | null; username: string | null; text: string | null; parentId: string | null; live: boolean; fromMe: boolean; at: number }
export type IgEvent = MsgEvent | CommentEvent;

export interface Conversation { igsid: string; username: string | null; name: string | null; profile_at: string | null; last_customer_at: string | null; origin: string }
export interface Store {
  settings(): Promise<IgSettings>;
  automations(): Promise<Automation[]>; // só as ligadas
  linkOf(id: string): Promise<{ slug: string; code: string } | null>;
  saveMessage(row: { mid: string; igsid: string; from_me: boolean; kind: MsgKind; text: string | null; attachment_type: string | null; app_id: string | null; automation_id: string | null; sent_at: string }): Promise<boolean>; // false = já existia
  saveComment(row: { comment_id: string; media_id: string | null; igsid: string | null; username: string | null; text: string | null; parent_id: string | null; is_live: boolean; from_me: boolean; commented_at: string }): Promise<boolean>;
  hadMessagesBefore(igsid: string, mid: string): Promise<boolean>; // mensagens DA PESSOA (não conta as nossas)
  touchConversation(igsid: string, patch: { at: string; text: string | null; from: 'cliente' | 'loja' | null; origin: 'comentario' | 'story' | 'dm'; customer: boolean; username?: string | null }): Promise<Conversation>;
  setProfile(igsid: string, p: { username: string | null; name: string | null; profile_pic: string | null }): Promise<void>;
  claimRun(row: { automation_id: string; source_id: string; source_kind: 'comentario' | 'dm' | 'story'; igsid: string | null; test: boolean; status?: string; reason?: string | null }): Promise<string | null>; // null = já disparou
  finishRun(id: string, patch: { status: string; reason: string | null; public_reply: boolean; dm_sent: boolean; dm_fallback: boolean }): Promise<void>;
  claimDm(igsid: string, hours: number): Promise<string | null>; // hora da trava ou null (antispam)
  releaseDm(igsid: string, at: string): Promise<void>;
  markWaSent(igsid: string, at: string, code: string): Promise<void>;
  log(level: 'erro' | 'aviso' | 'info', message: string): Promise<void>;
}
export interface EngineDeps { store: Store; api: IgApi | null; accountId: string | null; now: () => number; rnd: () => number }

const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const idOf = (v: unknown) => (v == null ? null : String(v));

// ── corpo do webhook → eventos ──
export function parseWebhook(body: Any): IgEvent[] {
  const out: IgEvent[] = [];
  if (!body || typeof body !== 'object' || body.object !== 'instagram' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    const account = idOf(entry && entry.id);
    const msgs = [...(Array.isArray(entry.messaging) ? entry.messaging : []), ...(Array.isArray(entry.changes) ? entry.changes.filter((c: Any) => c && c.field === 'messages').map((c: Any) => c.value) : [])];
    for (const m of msgs) {
      if (!m || !m.sender) continue;
      const sender = idOf(m.sender.id);
      const recipient = idOf(m.recipient && m.recipient.id);
      const at = Number(m.timestamp) > 1e12 ? Number(m.timestamp) : Number(m.timestamp) * 1000 || Number(entry.time) * 1000 || Date.now();
      if (m.message && !m.message.is_deleted && m.message.mid) {
        const echo = !!m.message.is_echo;
        const fromMe = echo || (!!account && sender === account);
        const igsid = fromMe ? recipient : sender;
        if (!igsid || !IGSID_RE.test(igsid)) continue;
        const atts = Array.isArray(m.message.attachments) ? m.message.attachments : [];
        const mention = atts.find((a: Any) => a && a.type === 'story_mention');
        const kind: MsgKind = mention ? 'story_mention' : m.message.reply_to && m.message.reply_to.story ? 'story_reply' : 'dm';
        out.push({ type: 'message', mid: String(m.message.mid).slice(0, 300), igsid, fromMe, echo, kind, text: str(m.message.text, 2000), attachment: atts[0] ? str(atts[0].type, 40) : null, appId: idOf(m.message.app_id), at });
      } else if (m.postback && m.postback.mid) {
        const igsid = sender;
        if (!igsid || !IGSID_RE.test(igsid) || (account && sender === account)) continue;
        out.push({ type: 'message', mid: String(m.postback.mid).slice(0, 300), igsid, fromMe: false, echo: false, kind: 'postback', text: str(m.postback.title, 2000), attachment: null, appId: null, at });
      }
    }
    for (const c of Array.isArray(entry.changes) ? entry.changes : []) {
      if (!c || (c.field !== 'comments' && c.field !== 'live_comments') || !c.value || !c.value.id) continue;
      const v = c.value;
      const from = idOf(v.from && v.from.id);
      out.push({
        type: 'comment', id: String(v.id).slice(0, 60), mediaId: idOf(v.media && v.media.id), igsid: from && IGSID_RE.test(from) ? from : null, username: str(v.from && v.from.username, 60),
        text: str(v.text, 2200), parentId: idOf(v.parent_id), live: c.field === 'live_comments', fromMe: !!account && from === account, at: Number(entry.time) > 1e12 ? Number(entry.time) : Number(entry.time) * 1000 || Date.now(),
      });
    }
  }
  return out;
}

export interface EventResult { id: string; stored: boolean; automation: string | null; status: string; reason: string | null }

// grava e roda as automações de um lote de eventos (um por vez). Nunca lança: erro vira log e o próximo segue.
export async function processEvents(events: IgEvent[], deps: EngineDeps): Promise<EventResult[]> {
  const out: EventResult[] = [];
  let settings: IgSettings | null = null;
  let autos: Automation[] | null = null;
  const ctx = {
    settings: async () => (settings = settings || await deps.store.settings()),
    autos: async () => (autos = autos || await deps.store.automations()),
  };
  for (const ev of events) {
    try { out.push(await processOne(ev, deps, ctx)); } catch (e) {
      const id = ev.type === 'message' ? ev.mid : ev.id;
      await deps.store.log('erro', `evento ${id}: ${String((e as Error)?.message || e).slice(0, 300)}`).catch(() => {});
      out.push({ id, stored: false, automation: null, status: 'erro', reason: String((e as Error)?.message || e).slice(0, 200) });
    }
  }
  return out;
}

type Ctx = { settings: () => Promise<IgSettings>; autos: () => Promise<Automation[]> };

async function processOne(ev: IgEvent, deps: EngineDeps, ctx: Ctx): Promise<EventResult> {
  const { store } = deps;
  const iso = new Date(ev.at).toISOString();
  if (ev.type === 'message') {
    const isNew = await store.saveMessage({ mid: ev.mid, igsid: ev.igsid, from_me: ev.fromMe, kind: ev.kind, text: ev.text, attachment_type: ev.attachment, app_id: ev.appId, automation_id: null, sent_at: iso });
    if (!isNew) return { id: ev.mid, stored: false, automation: null, status: 'duplicado', reason: null };
    const first = ev.fromMe ? false : !(await store.hadMessagesBefore(ev.igsid, ev.mid));
    const conv = await store.touchConversation(ev.igsid, { at: iso, text: ev.text || (ev.kind === 'story_mention' ? '📣 mencionou você no story' : ev.attachment ? `[${ev.attachment}]` : null), from: ev.fromMe ? 'loja' : 'cliente', origin: ev.kind === 'story_mention' || ev.kind === 'story_reply' ? 'story' : 'dm', customer: !ev.fromMe });
    if (!ev.fromMe) await fetchProfile(deps, conv);
    if (ev.fromMe || ev.echo || ev.kind === 'postback' || (deps.accountId && ev.igsid === deps.accountId)) return { id: ev.mid, stored: true, automation: null, status: 'gravado', reason: ev.fromMe ? 'de mim (eco)' : null };
    const kind = ev.kind === 'dm' ? 'dm' : 'story';
    return run(deps, ctx, { sourceId: ev.mid, kind, igsid: ev.igsid, text: ev.text, firstMessage: first, at: ev.at, conv });
  }
  const isNew = await store.saveComment({ comment_id: ev.id, media_id: ev.mediaId, igsid: ev.igsid, username: ev.username, text: ev.text, parent_id: ev.parentId, is_live: ev.live, from_me: ev.fromMe, commented_at: iso });
  if (!isNew) return { id: ev.id, stored: false, automation: null, status: 'duplicado', reason: null };
  if (ev.fromMe || !ev.igsid || (deps.accountId && ev.igsid === deps.accountId)) return { id: ev.id, stored: true, automation: null, status: 'gravado', reason: ev.fromMe ? 'de mim' : null };
  const conv = await store.touchConversation(ev.igsid, { at: iso, text: ev.text ? `💬 ${ev.text}`.slice(0, 300) : '💬 comentou', from: null, origin: 'comentario', customer: false, username: ev.username });
  await fetchProfile(deps, conv);
  return run(deps, ctx, { sourceId: ev.id, kind: 'comentario', igsid: ev.igsid, text: ev.text, mediaId: ev.mediaId, at: ev.at, conv, commentId: ev.id, username: ev.username });
}

// nome/@/foto por chamada separada (uma vez por semana no máximo)
async function fetchProfile(deps: EngineDeps, conv: Conversation) {
  if (!deps.api) return;
  const old = conv.profile_at ? Date.parse(conv.profile_at) : NaN;
  if (Number.isFinite(old) && deps.now() - old < 7 * 24 * 3600 * 1000) return;
  const r = await deps.api.profile(conv.igsid);
  if (!r.ok || !r.data) { await deps.store.setProfile(conv.igsid, { username: conv.username, name: conv.name, profile_pic: null }); return; }
  const p = { username: str(r.data.username, 60), name: str(r.data.name, 120), profile_pic: str(r.data.profile_pic, 1000) };
  await deps.store.setProfile(conv.igsid, p);
  conv.username = p.username || conv.username;
  conv.name = p.name || conv.name;
}

interface RunIn { sourceId: string; kind: 'comentario' | 'dm' | 'story'; igsid: string; text: string | null; mediaId?: string | null; firstMessage?: boolean; at: number; conv: Conversation; commentId?: string; username?: string | null }
async function run(deps: EngineDeps, ctx: Ctx, x: RunIn): Promise<EventResult> {
  const { store } = deps;
  const s = await ctx.settings();
  if (!s.enabled) return { id: x.sourceId, stored: true, automation: null, status: 'desligado', reason: 'chave geral desligada' };
  const a = pickAutomation(await ctx.autos(), { kind: x.kind, text: x.text, mediaId: x.mediaId, firstMessage: x.firstMessage });
  if (!a) return { id: x.sourceId, stored: true, automation: null, status: 'sem automação', reason: null };
  const username = x.username || x.conv.username;
  if (s.testMode && !inTestList(s, x.igsid, username)) {
    await store.claimRun({ automation_id: a.id, source_id: x.sourceId, source_kind: x.kind, igsid: x.igsid, test: true, status: 'pulado', reason: 'modo teste: fora da lista de teste' });
    return { id: x.sourceId, stored: true, automation: a.id, status: 'pulado', reason: 'modo teste' };
  }
  const runId = await store.claimRun({ automation_id: a.id, source_id: x.sourceId, source_kind: x.kind, igsid: x.igsid, test: s.testMode });
  if (!runId) return { id: x.sourceId, stored: true, automation: a.id, status: 'duplicado', reason: 'já disparou' };
  const finish = async (status: string, reason: string | null, extra: { public_reply?: boolean; dm_sent?: boolean; dm_fallback?: boolean } = {}) => {
    await store.finishRun(runId, { status, reason, public_reply: !!extra.public_reply, dm_sent: !!extra.dm_sent, dm_fallback: !!extra.dm_fallback });
    return { id: x.sourceId, stored: true, automation: a.id, status, reason };
  };
  if (!deps.api) return finish('falhou', 'Instagram não conectado');
  const reasons: string[] = [];
  let pub = false;
  let pubTried = false;
  if (x.kind === 'comentario' && x.commentId) {
    const text = pick((a.public_replies || []).filter((t) => t.trim()), deps.rnd);
    if (text) {
      pubTried = true;
      const r = await deps.api.replyComment(x.commentId, fillName(text, x.conv.name));
      pub = r.ok;
      if (!r.ok) reasons.push(`resposta pública: ${r.error}`);
    }
  }
  const dmText = pick((a.dm_texts || []).filter((t) => t.trim()), deps.rnd);
  let dm = false;
  let fallback = false;
  let dmSkipped = false;
  if (dmText) {
    const now = deps.now();
    const windowOk = x.kind === 'comentario' ? within(x.at, now, PRIVATE_REPLY_MS) : within(x.at, now, DM_WINDOW_MS);
    if (!windowOk) { dmSkipped = true; reasons.push(x.kind === 'comentario' ? 'DM: comentário com mais de 7 dias' : 'DM: fora da janela de 24 h'); } else {
      const claim = await store.claimDm(x.igsid, s.cooldownHours);
      if (!claim) { dmSkipped = true; reasons.push(`antispam: já recebeu DM automática nas últimas ${s.cooldownHours} h`); } else {
        const link = linkOf(a, a.link_mode === 'link' && a.link_id ? await store.linkOf(a.link_id) : null);
        const text = fillName(dmText, x.conv.name);
        const recipient = x.kind === 'comentario' && x.commentId ? { comment_id: x.commentId } : { id: x.igsid };
        const r = await sendLinkDm(deps.api, recipient, text, link.url, a.button_title);
        if (r.ok) {
          dm = true; fallback = r.fallback;
          const at = new Date(deps.now()).toISOString();
          await store.saveMessage({ mid: r.mid || `auto-${runId}`, igsid: x.igsid, from_me: true, kind: 'dm', text: fallback ? `${text}\n\n${link.url}` : `${text}\n[${a.button_title}] ${link.url}`, attachment_type: fallback ? null : 'template', app_id: null, automation_id: a.id, sent_at: at });
          await store.touchConversation(x.igsid, { at, text: text.slice(0, 300), from: 'loja', origin: x.kind === 'comentario' ? 'comentario' : x.kind === 'story' ? 'story' : 'dm', customer: false });
          await store.markWaSent(x.igsid, at, link.code);
        } else {
          await store.releaseDm(x.igsid, claim);
          reasons.push(`DM: ${r.error}`);
        }
      }
    }
  }
  // enviado = tudo o que a automação pede saiu; parcial = uma parte saiu; pulado = nada saiu por regra (antispam,
  // janela); falhou = nada saiu por erro da Meta
  const status = dm ? (pubTried && !pub ? 'parcial' : 'enviado')
    : pub ? (dmText ? 'parcial' : 'enviado')
    : (dmSkipped && !(pubTried && !pub)) || (!dmText && !pubTried) ? 'pulado' : 'falhou';
  return finish(status, reasons.join(' · ') || null, { public_reply: pub, dm_sent: dm, dm_fallback: fallback });
}
