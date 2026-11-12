// Instagram FASE 3 — o banco das edge functions (Supabase com a service role). Implementa o Store do motor
// (igEngine.ts) e a conta conectada (ig_account, só do servidor: o token nunca sai daqui).
import { parseSettings, type Automation } from './igRules.ts';
import type { Conversation, Store } from './igEngine.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export const SETTING_KEYS = ['ig_automations_enabled', 'ig_test_mode', 'ig_test_accounts', 'ig_dm_cooldown_hours', 'ig_direct_dm', 'ig_direct_phrase'];
const AUTO_COLS = 'id, name, active, trigger, media_scope, media_ids, keyword_mode, keywords, public_replies, dm_texts, button_title, link_mode, wa_phrase, link_id, code, position';
const CONV_COLS = 'igsid, username, name, profile_at, last_customer_at, origin';
const fail = (e: Any) => { if (e) throw new Error(String(e.message || e).slice(0, 300)); };

export interface Account { ig_user_id: string; username: string | null; name: string | null; picture_url: string | null; access_token: string; token_expires_at: string | null; refreshed_at: string | null; refresh_tried_at: string | null; refresh_error: string | null; scopes: string | null; connected_at: string }

export function supaStore(db: Any): Store & {
  account(): Promise<Account | null>;
  saveAccount(row: Partial<Account> & { ig_user_id: string; access_token: string }): Promise<void>;
  patchAccount(patch: Partial<Account>): Promise<void>;
  conversation(igsid: string): Promise<(Conversation & { last_at: string | null }) | null>;
  newState(state: string): Promise<void>;
  useState(state: string, maxAgeMs: number, now: number): Promise<boolean>;
  kv(k: string): Promise<string | null>;
} {
  return {
    async settings() {
      const { data, error } = await db.from('system_config').select('key, value').in('key', SETTING_KEYS);
      fail(error);
      return parseSettings(data || []);
    },
    async automations() {
      const { data, error } = await db.from('ig_automations').select(AUTO_COLS).eq('active', true).order('position', { ascending: true });
      fail(error);
      return (data || []) as Automation[];
    },
    async linkOf(id) {
      const { data } = await db.from('ig_links').select('slug, code, active').eq('id', id).maybeSingle();
      return data && data.active !== false ? { slug: data.slug, code: data.code } : null;
    },
    async saveMessage(row) {
      const { data, error } = await db.from('ig_messages').upsert(row, { onConflict: 'mid', ignoreDuplicates: true }).select('mid');
      fail(error);
      return Array.isArray(data) && data.length > 0;
    },
    async saveComment(row) {
      const { data, error } = await db.from('ig_comments').upsert(row, { onConflict: 'comment_id', ignoreDuplicates: true }).select('comment_id');
      fail(error);
      return Array.isArray(data) && data.length > 0;
    },
    async hadMessagesBefore(igsid, mid) {
      const { count, error } = await db.from('ig_messages').select('mid', { count: 'exact', head: true }).eq('igsid', igsid).eq('from_me', false).neq('mid', mid);
      fail(error);
      return Number(count) > 0;
    },
    async touchConversation(igsid, p) {
      const { data: cur } = await db.from('ig_conversations').select(`${CONV_COLS}, last_at`).eq('igsid', igsid).maybeSingle();
      if (!cur) {
        const row = { igsid, origin: p.origin, first_at: p.at, last_at: p.at, last_text: p.text, last_from: p.from, last_customer_at: p.customer ? p.at : null, username: p.username || null };
        const { error } = await db.from('ig_conversations').upsert(row, { onConflict: 'igsid', ignoreDuplicates: true });
        fail(error);
        return { igsid, username: p.username || null, name: null, profile_at: null, last_customer_at: row.last_customer_at, origin: p.origin };
      }
      const patch: Record<string, unknown> = {};
      // datas comparadas como data (o Postgres devolve '+00:00', nós mandamos 'Z')
      const ms = (v: unknown) => (v ? Date.parse(String(v)) : NaN);
      const at = ms(p.at);
      if (!(ms(cur.last_at) > at)) Object.assign(patch, { last_at: p.at, last_text: p.text, last_from: p.from });
      if (p.customer && !(ms(cur.last_customer_at) >= at)) patch.last_customer_at = p.at;
      if (p.username && !cur.username) patch.username = p.username;
      if (Object.keys(patch).length) { const { error } = await db.from('ig_conversations').update(patch).eq('igsid', igsid); fail(error); }
      return { ...cur, ...patch } as Conversation;
    },
    async setProfile(igsid, p) {
      const patch: Record<string, unknown> = { profile_at: new Date().toISOString() };
      if (p.username) patch.username = p.username;
      if (p.name) patch.name = p.name;
      if (p.profile_pic) patch.profile_pic = p.profile_pic;
      await db.from('ig_conversations').update(patch).eq('igsid', igsid);
    },
    async claimRun(row) {
      const { data, error } = await db.from('ig_automation_runs').upsert({ status: 'processando', reason: null, ...row, ...(row.status && row.status !== 'processando' ? { finished_at: new Date().toISOString() } : {}) }, { onConflict: 'source_id', ignoreDuplicates: true }).select('id');
      fail(error);
      return Array.isArray(data) && data[0] ? data[0].id : null;
    },
    async finishRun(id, patch) {
      const { error } = await db.from('ig_automation_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
      fail(error);
    },
    async claimDm(igsid, hours) {
      const { data, error } = await db.rpc('ig_claim_dm', { p_igsid: igsid, p_hours: hours });
      fail(error);
      return typeof data === 'string' && data ? data : Array.isArray(data) && data[0] ? String(Object.values(data[0])[0] || '') || null : null;
    },
    async releaseDm(igsid, at) { await db.rpc('ig_release_dm', { p_igsid: igsid, p_at: at }); },
    async markWaSent(igsid, at, code) { await db.from('ig_conversations').update({ wa_sent_at: at, wa_code: code }).eq('igsid', igsid); },
    async log(level, message) { await db.from('ig_webhook_log').insert({ level, message: String(message).slice(0, 1000) }); },

    async account() {
      const { data, error } = await db.from('ig_account').select('*').eq('id', 1).maybeSingle();
      fail(error);
      return (data as Account) || null;
    },
    async saveAccount(row) {
      const { error } = await db.from('ig_account').upsert({ id: 1, ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      fail(error);
    },
    async patchAccount(patch) {
      const { error } = await db.from('ig_account').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
      fail(error);
    },
    async conversation(igsid) {
      const { data } = await db.from('ig_conversations').select(`${CONV_COLS}, last_at`).eq('igsid', igsid).maybeSingle();
      return data || null;
    },
    async newState(state) {
      await db.from('ig_oauth_states').delete().lt('created_at', new Date(Date.now() - 3600 * 1000).toISOString());
      const { error } = await db.from('ig_oauth_states').insert({ state });
      fail(error);
    },
    async useState(state, maxAgeMs, now) {
      const { data } = await db.from('ig_oauth_states').delete().eq('state', state).select('created_at');
      const row = Array.isArray(data) ? data[0] : null;
      return !!row && now - Date.parse(row.created_at) <= maxAgeMs;
    },
    async kv(k) {
      const { data } = await db.from('ig_server_kv').select('v').eq('k', k).maybeSingle();
      return data ? String(data.v) : null;
    },
  };
}
export type SupaStore = ReturnType<typeof supaStore>;
