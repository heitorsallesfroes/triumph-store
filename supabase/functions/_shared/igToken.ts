// Instagram FASE 3 — renovação do token de longa duração (60 dias). Renova quando faltam menos de 20 dias; tenta no
// máximo a cada 12 h (a não ser que force). Falhou: grava o erro (a tela mostra o alerta) e o token antigo segue.
import { refreshToken, type HttpFetch } from './igApi.ts';
import type { Account } from './igStore.ts';

export const REFRESH_BEFORE_MS = 20 * 24 * 3600 * 1000;
export const ALERT_BEFORE_MS = 7 * 24 * 3600 * 1000;
const RETRY_MS = 12 * 3600 * 1000;

export interface TokenStore { account(): Promise<Account | null>; patchAccount(p: Partial<Account>): Promise<void> }
export type RefreshOut = { refreshed: boolean; skipped: string | null; error: string | null; expiresAt: string | null };

export async function maybeRefresh(store: TokenStore, fetch: HttpFetch, now: number, force = false): Promise<RefreshOut> {
  const acc = await store.account();
  if (!acc) return { refreshed: false, skipped: 'não conectado', error: null, expiresAt: null };
  const exp = acc.token_expires_at ? Date.parse(acc.token_expires_at) : NaN;
  const left = Number.isFinite(exp) ? exp - now : -1;
  if (!force && left > REFRESH_BEFORE_MS) return { refreshed: false, skipped: 'ainda falta muito', error: null, expiresAt: acc.token_expires_at };
  const tried = acc.refresh_tried_at ? Date.parse(acc.refresh_tried_at) : NaN;
  if (!force && Number.isFinite(tried) && now - tried < RETRY_MS) return { refreshed: false, skipped: 'tentou há pouco', error: acc.refresh_error, expiresAt: acc.token_expires_at };
  const r = await refreshToken(fetch, acc.access_token, now);
  const at = new Date(now).toISOString();
  if (!r.ok || !r.token) {
    await store.patchAccount({ refresh_tried_at: at, refresh_error: (r.error || 'A Meta recusou a renovação').slice(0, 500) });
    return { refreshed: false, skipped: null, error: r.error || 'A Meta recusou a renovação', expiresAt: acc.token_expires_at };
  }
  const expiresAt = r.expiresAt ? new Date(r.expiresAt).toISOString() : new Date(now + 60 * 24 * 3600 * 1000).toISOString();
  await store.patchAccount({ access_token: r.token, token_expires_at: expiresAt, refreshed_at: at, refresh_tried_at: at, refresh_error: null });
  return { refreshed: true, skipped: null, error: null, expiresAt };
}
