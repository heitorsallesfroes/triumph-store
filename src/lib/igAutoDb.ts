// Instagram FASE 3 — leitura e gravação das abas Automações e Direct.
// Grava SÓ em ig_automations (criar/editar/ligar/desligar) e nas chaves ig_* do system_config (chave geral, modo
// teste, contas de teste, antispam, DM do Direct). Mandar mensagem, Conectar e a lista de posts passam pela edge
// function "ig-manage" (o token fica nela). Sem a migration 20261115120000: "missing" = true e as telas explicam.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { loadLinkConversations } from './igLinksDb';
import { parseSettings, type Automation, type ConvSale, type IgConversation, type IgMessage, type IgRun, type IgSettings, type WaLead } from './igAuto';
import type { Range } from './waPanel';

export const IG_AUTO_MIGRATION = '20261115120000_ig_automations.sql';
export const IG_CRON_MIGRATION = '20261115130000_ig_token_cron.sql';
const AUTO_COLS = 'id, name, active, trigger, media_scope, media_ids, keyword_mode, keywords, public_replies, dm_texts, button_title, link_mode, wa_phrase, link_id, code, position';
const CONV_COLS = 'igsid, username, name, profile_pic, origin, first_at, last_at, last_text, last_from, last_customer_at, wa_sent_at, wa_code';
const RUN_COLS = 'automation_id, source_kind, status, reason, public_reply, dm_sent, dm_fallback, test, created_at, igsid';
const SETTING_KEYS = ['ig_automations_enabled', 'ig_test_mode', 'ig_test_accounts', 'ig_dm_cooldown_hours', 'ig_direct_dm', 'ig_direct_phrase'];
const iso = (ms: number) => new Date(ms).toISOString();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ── edge function ig-manage (login do ERP) ──
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
export class ManageError extends Error { notPublished: boolean; constructor(m: string, np = false) { super(m); this.notPublished = np; } }
export async function callManage<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  let jwt = '';
  try { const { data } = await supabase.auth.getSession(); jwt = (data && data.session && data.session.access_token) || ''; } catch { /* sem sessão */ }
  if (!jwt) throw new ManageError('Entre com sua conta do sistema');
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL || ''}/functions/v1/ig-manage`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: env.VITE_SUPABASE_ANON_KEY || '', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new ManageError('A função "ig-manage" não respondeu (ela já foi publicada?)', true); }
  let data: Any = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 404 && !(data && data.error)) throw new ManageError('A função "ig-manage" ainda não foi publicada no Supabase', true);
  if (!data) throw new ManageError('A função "ig-manage" não respondeu (ela já foi publicada?)', true);
  if (!data.success) throw new ManageError(data.error || 'Erro na função ig-manage');
  return data as T;
}
export interface ManageStatus {
  secrets: { IG_APP_ID: boolean; IG_APP_SECRET: boolean; IG_WEBHOOK_VERIFY_TOKEN: boolean };
  redirect_uri: string; webhook_url: string; connected: boolean;
  account?: { ig_user_id: string; username: string | null; name: string | null; picture_url: string | null; connected_at: string };
  token_expires_at?: string | null; days_left?: number | null; refresh_error?: string | null; alert?: string | null;
}
export interface IgPost { id: string; caption: string; type: string; thumb: string | null; permalink: string | null; timestamp: string | null }

// ── configurações (system_config ig_*) ──
export async function loadSettings(): Promise<IgSettings> {
  const { data } = await supabase.from('system_config').select('key, value').in('key', SETTING_KEYS);
  return parseSettings((data as { key: string; value: string }[] | null) || []);
}
export async function saveSetting(key: string, value: string): Promise<void> {
  if (!SETTING_KEYS.includes(key)) throw new Error('Configuração inválida');
  const { error } = await supabase.from('system_config').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ── automações ──
export async function loadAutomations(): Promise<{ list: Automation[]; missing: boolean }> {
  const { data, error } = await supabase.from('ig_automations').select(AUTO_COLS).order('position', { ascending: true });
  if (error) return { list: [], missing: true };
  return { list: (data as unknown as Automation[]) || [], missing: false };
}
export async function saveAutomation(a: Omit<Automation, 'id'> & { id?: string | null }): Promise<Automation> {
  const { id, ...rest } = a;
  const row = { ...rest, name: rest.name.trim(), keywords: rest.keywords.map((k) => k.trim()).filter(Boolean), public_replies: rest.public_replies.map((t) => t.trim()).filter(Boolean),
    dm_texts: rest.dm_texts.map((t) => t.trim()).filter(Boolean), wa_phrase: rest.wa_phrase ? rest.wa_phrase.trim() : null, updated_at: new Date().toISOString() };
  const q = id ? supabase.from('ig_automations').update(row).eq('id', id).select(AUTO_COLS) : supabase.from('ig_automations').insert({ ...row, active: false }).select(AUTO_COLS);
  const { data, error } = await q;
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Já existe outra automação com esse código.' : error.message);
  const out = (data as unknown as Automation[] | null) || [];
  if (!out[0]) throw new Error('Não consegui salvar a automação');
  return out[0];
}
export async function setAutomationActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('ig_automations').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── disparos, cliques e conversas do WhatsApp no período ──
export async function loadRuns(r: Range): Promise<IgRun[]> {
  try {
    return await fetchAllRows<IgRun>((f, t) => supabase.from('ig_automation_runs').select(RUN_COLS).gte('created_at', iso(r.from)).lte('created_at', iso(r.to)).order('created_at').range(f, t) as Any);
  } catch { return []; }
}
export async function loadClicksByLink(r: Range): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const rows = await fetchAllRows<{ link_id: string }>((f, t) => supabase.from('ig_link_clicks').select('link_id').gte('created_at', iso(r.from)).lte('created_at', iso(r.to)).order('created_at').range(f, t) as Any);
    rows.forEach((x) => out.set(x.link_id, (out.get(x.link_id) || 0) + 1));
  } catch { /* sem a tabela */ }
  return out;
}
// conversas do WhatsApp que começaram por um link/frase do Instagram, com as vendas (o mesmo Rastreamento)
export async function loadConvSales(r: Range): Promise<{ convs: ConvSale[]; missing: string[] }> {
  try { const x = await loadLinkConversations(r); return { convs: x.convs.map((c) => ({ code: c.code, firstAt: c.firstAt, sales: c.sales, revenue: c.revenue })), missing: x.missing }; } catch { return { convs: [], missing: ['vendas do ERP'] }; }
}
export async function loadLinkCodes(): Promise<{ id: string; slug: string; code: string; active: boolean }[]> {
  const { data } = await supabase.from('ig_links').select('id, slug, code, active').order('created_at', { ascending: true });
  return (data as Any) || [];
}
// comentários e DMs recebidos no período (para o funil)
export async function loadReceived(r: Range): Promise<{ comments: number; dmsIn: number; missing: boolean }> {
  const head = (t: string, col: string) => supabase.from(t).select(col, { count: 'exact', head: true });
  const [c, m] = await Promise.all([
    head('ig_comments', 'comment_id').eq('from_me', false).gte('commented_at', iso(r.from)).lte('commented_at', iso(r.to)),
    head('ig_messages', 'mid').eq('from_me', false).gte('sent_at', iso(r.from)).lte('sent_at', iso(r.to)),
  ]);
  if (c.error || m.error) return { comments: 0, dmsIn: 0, missing: true };
  return { comments: Number(c.count) || 0, dmsIn: Number(m.count) || 0, missing: false };
}

// ── Direct ──
export async function loadConversations(limit = 300): Promise<{ list: IgConversation[]; missing: boolean }> {
  const { data, error } = await supabase.from('ig_conversations').select(CONV_COLS).order('last_at', { ascending: false }).limit(limit);
  if (error) return { list: [], missing: true };
  return { list: (data as unknown as IgConversation[]) || [], missing: false };
}
export async function loadMessages(igsid: string): Promise<IgMessage[]> {
  const { data } = await supabase.from('ig_messages').select('mid, igsid, from_me, kind, text, attachment_type, automation_id, sent_at').eq('igsid', igsid).order('sent_at', { ascending: true }).limit(500);
  return (data as unknown as IgMessage[]) || [];
}
export async function loadPersonComments(igsid: string): Promise<{ comment_id: string; text: string | null; commented_at: string; media_id: string | null }[]> {
  const { data } = await supabase.from('ig_comments').select('comment_id, text, commented_at, media_id').eq('igsid', igsid).order('commented_at', { ascending: true }).limit(100);
  return (data as Any) || [];
}
// conversas do WhatsApp que começaram com um código do Instagram (últimos 90 dias), para o "✅ foi para o WhatsApp"
export async function loadWaLeads(now = Date.now()): Promise<WaLead[]> {
  try {
    return await fetchAllRows<WaLead>((f, t) => supabase.from('ig_link_leads').select('chat_id, code, first_message_at').gte('first_message_at', iso(now - 90 * 86400000)).order('first_message_at').range(f, t) as Any);
  } catch { return []; }
}
export async function loadWebhookLog(limit = 20): Promise<{ created_at: string; level: string; message: string }[]> {
  const { data } = await supabase.from('ig_webhook_log').select('created_at, level, message').order('created_at', { ascending: false }).limit(limit);
  return (data as Any) || [];
}
