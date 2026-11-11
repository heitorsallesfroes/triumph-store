// Leitura da aba Instagram (FASE 1, SÓ LEITURA): tudo pela edge function "instagram" (o token fica nela). Vai com o
// login do ERP (o JWT da sessão; sem login a função recusa). Nada aqui grava no ERP. Cache de 10 min por período
// (o botão Atualizar ignora o cache).
import { supabase } from './supabase';
import type { IgDailyRow, IgMedia, IgProfile, IgTotals, AudienceRow } from './igInsights';

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
export interface IgDaily { size: 'day' | 'week'; rows: IgDailyRow[]; warnings: string[] }
export interface IgMediaLoad { items: IgMedia[]; truncated: boolean; warnings: string[] }
export interface IgAudience { audience: { city: AudienceRow[]; age: AudienceRow[]; gender: AudienceRow[] }; warnings: string[] }

export const loadTop = (days: number, fresh = false) => cached(`top|${days}`, fresh, () => callIg<IgTop>({ action: 'account', part: 'top', days }));
export const loadDaily = (days: number, fresh = false) => cached(`daily|${days}`, fresh, () => callIg<IgDaily>({ action: 'account', part: 'daily', days }));
export const loadMedia = (days: number, fresh = false) => cached(`media|${days}`, fresh, () => callIg<IgMediaLoad>({ action: 'media', days }));
export const loadAudience = (fresh = false) => cached('audience', fresh, () => callIg<IgAudience>({ action: 'account', part: 'audience', days: 30 }));
export const loadMediaDetail = (id: string, fresh = false) => cached(`detail|${id}`, fresh, () => callIg<{ item: IgMedia; warnings: string[] }>({ action: 'media_detail', id }));
