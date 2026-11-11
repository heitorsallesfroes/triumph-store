// Leitura da aba Instagram (FASE 1, SÓ LEITURA; + o histórico guardado no fim do arquivo): tudo pela edge function "instagram" (o token fica nela). Vai com o
// login do ERP (o JWT da sessão; sem login a função recusa). Nada aqui grava no ERP. Cache de 10 min por período
// (o botão Atualizar ignora o cache).
import { supabase } from './supabase';
import type { IgDailyRow, IgMedia, IgProfile, IgTotals, AudienceRow, IgStory, IgDayAccount } from './igInsights';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const IG_CACHE_MS = 10 * 60 * 1000;

export class IgError extends Error { notPublished: boolean; constructor(msg: string, notPublished = false) { super(msg); this.notPublished = notPublished; } }

async function callIg<T>(body: Record<string, unknown>): Promise<T> {
  let jwt = '';
  try { const { data } = await supabase.auth.getSession(); jwt = (data && data.session && data.session.access_token) || ''; } catch { /* sem sessão */ }
  if (!jwt) throw new IgError('Entre com sua conta do sistema para ver o Instagram');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/instagram`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new IgError('A função "instagram" não respondeu (ela já foi publicada?)', true); }
  let data: { success?: boolean; error?: string } & Record<string, unknown>;
  try { data = await res.json(); } catch { throw new IgError('A função "instagram" não respondeu (ela já foi publicada?)', res.status === 404); }
  if (res.status === 404) throw new IgError('A função "instagram" ainda não foi publicada no Supabase', true);
  if (!data || !data.success) throw new IgError((data && data.error) || 'Erro ao ler o Instagram');
  return data as unknown as T;
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fresh: boolean, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < IG_CACHE_MS) return hit.value as T;
  const value = await run();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export interface Win { since: number; until: number; fromDay: string; toDay: string }
export interface IgTop { profile: IgProfile; period: { days: number; cur: Win; prev: Win }; cur: IgTotals; prev: IgTotals; warnings: string[]; at: number }
// reach_source: 'serie' = alcance da série diária da Meta; 'dia' = total de cada dia. check: soma das visualizações dos dias × total do período
export interface IgDailyCheck { metric: string; daily_sum: number | null; period_total: number | null; diff_pct: number | null; ok: boolean | null }
export interface IgDaily { size: 'day' | 'week'; rows: IgDailyRow[]; warnings: string[]; reach_source?: 'serie' | 'dia'; check?: IgDailyCheck }
export interface IgMediaLoad { items: IgMedia[]; truncated: boolean; warnings: string[] }
export interface IgAudience { audience: { city: AudienceRow[]; age: AudienceRow[]; gender: AudienceRow[] }; warnings: string[] }

export const loadTop = (days: number, fresh = false) => cached(`top|${days}`, fresh, () => callIg<IgTop>({ action: 'account', part: 'top', days }));
export const loadDaily = (days: number, fresh = false) => cached(`daily|${days}`, fresh, () => callIg<IgDaily>({ action: 'account', part: 'daily', days }));
export const loadMedia = (days: number, fresh = false) => cached(`media|${days}`, fresh, () => callIg<IgMediaLoad>({ action: 'media', days }));
export const loadAudience = (fresh = false) => cached('audience', fresh, () => callIg<IgAudience>({ action: 'account', part: 'audience', days: 30 }));
export const loadMediaDetail = (id: string, fresh = false) => cached(`detail|${id}`, fresh, () => callIg<{ item: IgMedia; warnings: string[] }>({ action: 'media_detail', id }));

// ── HISTÓRICO PRÓPRIO (migration 20261116120000_ig_history.sql): leitura direta das tabelas (só SELECT) ──
// Sem a migration: missing = true e as telas explicam.
export const IG_HISTORY_MIGRATION = '20261116120000_ig_history.sql';
export const IG_HISTORY_CRON = '20261116130000_ig_history_cron.sql';
const STORY_COLS = 'id, media_type, thumb, permalink, posted_at, expires_at, last_read_at, views, reach, replies, shares, total_interactions, follows, profile_visits, navigation, taps_forward, taps_back, exits, swipe_forward';
const DAY_COLS = 'day, followers, reach, views, accounts_engaged, total_interactions, profile_views, profile_links_taps, gained, lost';
const PAGE = 1000;
async function pages<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 20000): Promise<{ rows: T[]; error: boolean }> {
  const rows: T[] = [];
  for (let f = 0; f < cap; f += PAGE) {
    const { data, error } = await make(f, f + PAGE - 1);
    if (error) return { rows, error: true };
    const list = (data as T[]) || [];
    rows.push(...list);
    if (list.length < PAGE) break;
  }
  return { rows, error: false };
}
export async function loadStories(fromMs: number, toMs: number): Promise<{ list: IgStory[]; missing: boolean }> {
  const r = await pages<IgStory>((f, t) => supabase.from('ig_stories').select(STORY_COLS).gte('posted_at', new Date(fromMs).toISOString()).lte('posted_at', new Date(toMs).toISOString()).order('posted_at', { ascending: true }).range(f, t));
  return { list: r.rows, missing: r.error };
}
export async function loadDayAccount(fromDay: string, toDay: string): Promise<{ rows: IgDayAccount[]; missing: boolean; since: string | null }> {
  const [r, first] = await Promise.all([
    pages<IgDayAccount>((f, t) => supabase.from('ig_daily_account').select(DAY_COLS).gte('day', fromDay).lte('day', toDay).order('day', { ascending: true }).range(f, t)),
    supabase.from('ig_daily_account').select('day').order('day', { ascending: true }).limit(1),
  ]);
  const since = !first.error && Array.isArray(first.data) && first.data[0] ? String((first.data[0] as { day: string }).day) : null;
  return { rows: r.rows.map((x) => ({ ...x, day: String(x.day).slice(0, 10) })), missing: r.error, since };
}
// posts guardados: a foto mais nova de cada post publicado no período (no formato da lista de conteúdos)
export async function loadDayMedia(fromMs: number, toMs: number): Promise<IgMedia[]> {
  const r = await pages<{ day: string; media_id: string; kind: string | null; posted_at: string | null; caption: string | null; thumb: string | null; permalink: string | null; views: number | null; reach: number | null; likes: number | null; comments: number | null; saved: number | null; shares: number | null; total_interactions: number | null }>(
    (f, t) => supabase.from('ig_daily_media').select('day, media_id, kind, posted_at, caption, thumb, permalink, views, reach, likes, comments, saved, shares, total_interactions').gte('posted_at', new Date(fromMs).toISOString()).lte('posted_at', new Date(toMs).toISOString()).order('day', { ascending: true }).range(f, t));
  const last = new Map<string, (typeof r.rows)[number]>();
  r.rows.forEach((x) => { const cur = last.get(x.media_id); if (!cur || String(x.day) >= String(cur.day)) last.set(x.media_id, x); });
  return [...last.values()].map((x) => ({
    id: x.media_id, kind: (['REEL', 'CAROUSEL', 'IMAGE', 'VIDEO'].includes(String(x.kind)) ? x.kind : 'IMAGE') as IgMedia['kind'], caption: x.caption || '', permalink: x.permalink, timestamp: x.posted_at, thumb: x.thumb,
    metrics: { reach: x.reach, views: x.views, likes: x.likes, comments: x.comments, saved: x.saved, shares: x.shares, total_interactions: x.total_interactions, follows: null, profile_visits: null, avg_watch_ms: null, total_watch_ms: null },
  })).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}
export async function loadCollectLog(limit = 10): Promise<{ created_at: string; kind: string; ok: boolean; message: string | null; warnings: string[] }[]> {
  const { data, error } = await supabase.from('ig_collect_log').select('created_at, kind, ok, message, warnings').order('created_at', { ascending: false }).limit(limit);
  return error ? [] : ((data as never) || []);
}
// "Coletar agora" (usuário logado): a mesma coleta da rotina do banco, SÓ LEITURA na Meta
export const collectNow = (action: 'collect_stories' | 'collect_daily') => callIg<{ stories?: number; days?: number; media?: number; warnings: string[] }>({ action });
