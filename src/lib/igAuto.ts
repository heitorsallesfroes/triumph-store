// Instagram FASE 3 — Automações e Direct no ERP: regras e contas PURAS (sem React nem Supabase), conferidas em
// scripts/tests/igAutoErp.test.ts. As regras do disparo são as MESMAS do servidor (supabase/functions/_shared/igRules.ts).
export {
  TRIGGERS, CODE_RE, DIRECT_CODE, DM_WINDOW_MS, fillName, firstName, keywordHit, linkOf, parseSettings, validateAutomation, waUrl, publicLinkUrl, cleanUser,
  type Automation, type IgSettings, type TestAccount, type Trigger,
} from '../../supabase/functions/_shared/igRules.ts';
import { DM_WINDOW_MS, TRIGGERS, type Automation, type Trigger } from '../../supabase/functions/_shared/igRules.ts';

export const TRIGGER_LABEL = Object.fromEntries(TRIGGERS) as Record<Trigger, string>;
export interface IgConversation {
  igsid: string; username: string | null; name: string | null; profile_pic: string | null; origin: 'comentario' | 'story' | 'dm';
  first_at: string; last_at: string; last_text: string | null; last_from: 'cliente' | 'loja' | null; last_customer_at: string | null;
  wa_sent_at: string | null; wa_code: string | null;
}
export interface IgMessage { mid: string; igsid: string; from_me: boolean; kind: string; text: string | null; attachment_type: string | null; automation_id: string | null; sent_at: string }
export interface IgRun { automation_id: string | null; source_kind: string; status: string; reason: string | null; public_reply: boolean; dm_sent: boolean; dm_fallback: boolean; test: boolean; created_at: string; igsid: string | null }
export interface WaLead { chat_id: string; code: string; first_message_at: string }
export interface ConvSale { code: string; firstAt: number; sales: number; revenue: number }

export const ORIGIN_LABEL: Record<string, string> = { comentario: 'Comentário', story: 'Story', dm: 'DM' };
export const who = (c: Pick<IgConversation, 'username' | 'name' | 'igsid'>) => (c.username ? `@${c.username}` : c.name || `IG ${c.igsid.slice(-6)}`);

// "Quando…" / "E o comentário possui…" — as frases dos cartões
export function whenText(a: Pick<Automation, 'trigger' | 'media_scope' | 'media_ids'>): string {
  if (a.trigger === 'comentario') return a.media_scope === 'escolhidos' ? `Alguém comenta em ${a.media_ids.length} post${a.media_ids.length === 1 ? '' : 's'} escolhido${a.media_ids.length === 1 ? '' : 's'}` : 'Alguém comenta em qualquer post ou reel';
  if (a.trigger === 'dm_nova') return 'Alguém manda a primeira DM';
  if (a.trigger === 'story') return 'Alguém responde ou menciona você no story';
  return 'Alguém manda DM com a palavra-chave';
}
export function hasText(a: Pick<Automation, 'trigger' | 'keyword_mode' | 'keywords'>): string {
  const ks = (a.keywords || []).filter((k) => k.trim());
  if (a.trigger === 'dm_palavra' || a.keyword_mode === 'palavras') return ks.length ? ks.map((k) => `“${k.trim()}”`).join(', ') : '(escreva as palavras)';
  return 'Qualquer palavra';
}

// código sugerido pelo nome: "Comentários → WhatsApp" → "IG-A-COMENTARIOS"
export function suggestAutoCode(name: string, taken: string[] = []): string {
  const body = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').filter(Boolean);
  let s = 'IG-A';
  for (const p of body) { if (`${s}-${p}`.length > 20) break; s = `${s}-${p}`; }
  if (s === 'IG-A') s = 'IG-A-AUTO';
  let out = s;
  for (let i = 2; taken.includes(out) || out === 'IG-DIRECT'; i++) out = `${s.slice(0, 18 - String(i).length)}-${i}`;
  return out;
}

// ── janela de 24 h do Direct ──
export function windowLeft(c: Pick<IgConversation, 'last_customer_at'>, now: number): number | null {
  const t = c.last_customer_at ? Date.parse(c.last_customer_at) : NaN;
  if (!Number.isFinite(t)) return null;
  const left = t + DM_WINDOW_MS - now;
  return left > 0 ? left : 0;
}

// ── "✅ foi para o WhatsApp": a conversa do WhatsApp começou com o código/frase do link que mandamos para esta pessoa,
// até 3 h depois do envio (o mais recente antes da conversa ganha). Cada conversa do WhatsApp liga só uma pessoa.
export const MATCH_WINDOW_MS = 3 * 3600 * 1000;
export function matchWhatsapp(convs: Pick<IgConversation, 'igsid' | 'wa_code' | 'wa_sent_at'>[], leads: WaLead[], windowMs = MATCH_WINDOW_MS): Map<string, WaLead> {
  const out = new Map<string, WaLead>();
  const sent = convs.filter((c) => c.wa_code && c.wa_sent_at).map((c) => ({ igsid: c.igsid, code: c.wa_code as string, at: Date.parse(c.wa_sent_at as string) })).filter((c) => Number.isFinite(c.at));
  [...leads].sort((a, b) => a.first_message_at.localeCompare(b.first_message_at)).forEach((l) => {
    const t = Date.parse(l.first_message_at);
    const best = sent.filter((c) => !out.has(c.igsid) && c.code === l.code && c.at <= t + 60000 && t - c.at <= windowMs).sort((a, b) => b.at - a.at)[0];
    if (best) out.set(best.igsid, l);
  });
  return out;
}

// ── métricas de cada automação no período ──
export interface AutoMetrics { id: string; triggers: number; dms: number; publics: number; skipped: number; failed: number; tests: number; clicks: number | null; conversations: number; sales: number; revenue: number; ctr: number | null; convRate: number | null }
export function automationMetrics(a: Pick<Automation, 'id' | 'code' | 'link_mode' | 'link_id'>, runs: IgRun[], clicksByLink: Map<string, number>, convs: ConvSale[], linkCode: string | null): AutoMetrics {
  const mine = runs.filter((r) => r.automation_id === a.id);
  const sent = mine.filter((r) => r.status === 'enviado' || r.status === 'parcial');
  const dms = mine.filter((r) => r.dm_sent).length;
  const code = a.link_mode === 'link' && linkCode ? linkCode : a.code;
  const cv = convs.filter((c) => c.code === code);
  const clicks = a.link_mode === 'link' && a.link_id ? clicksByLink.get(a.link_id) || 0 : null;
  return {
    id: a.id, triggers: sent.length, dms, publics: mine.filter((r) => r.public_reply).length, skipped: mine.filter((r) => r.status === 'pulado').length,
    failed: mine.filter((r) => r.status === 'falhou').length, tests: mine.filter((r) => r.test).length,
    clicks, conversations: cv.length, sales: cv.reduce((n, c) => n + c.sales, 0), revenue: Math.round(cv.reduce((n, c) => n + c.revenue, 0) * 100) / 100,
    ctr: clicks != null && dms ? clicks / dms : null, convRate: dms ? cv.length / dms : null,
  };
}

// ── funil Instagram → WhatsApp → venda (Visão geral) ──
export interface Funnel { received: number; comments: number; dmsIn: number; autoDms: number; clicks: number; conversations: number; buyers: number; sales: number; revenue: number }
export function funnelOf({ comments, dmsIn, runs, clicks, convs }: { comments: number; dmsIn: number; runs: IgRun[]; clicks: number; convs: ConvSale[] }): Funnel {
  return {
    received: comments + dmsIn, comments, dmsIn, autoDms: runs.filter((r) => r.dm_sent).length, clicks, conversations: convs.length,
    buyers: convs.filter((c) => c.sales > 0).length, sales: convs.reduce((n, c) => n + c.sales, 0), revenue: Math.round(convs.reduce((n, c) => n + c.revenue, 0) * 100) / 100,
  };
}

// rascunho de uma automação nova (sempre desligada)
export function blankAutomation(position: number, taken: string[]): Omit<Automation, 'id'> {
  return {
    name: 'Nova automação', active: false, trigger: 'comentario', media_scope: 'todos', media_ids: [], keyword_mode: 'qualquer', keywords: [],
    public_replies: ['Te enviei os detalhes no direct 🔥'], dm_texts: ['Olá, {nome}! Vou te deixar aqui abaixo o nosso WhatsApp 😊'], button_title: 'WhatsApp Loja',
    link_mode: 'frase', wa_phrase: 'Olá! Vim pelo Instagram e quero atendimento 😊', link_id: null, code: suggestAutoCode('Nova', taken), position,
  };
}
