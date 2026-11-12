// Edge Function "ig-webhook" (PÚBLICA: quem chama é a Meta, sem login). A lógica fica aqui (testável no Node com a
// Meta SIMULADA); index.ts só liga o Deno.
//   GET  : verificação da Meta (hub.mode=subscribe, hub.verify_token = IG_WEBHOOK_VERIFY_TOKEN → devolve hub.challenge).
//   POST : confere x-hub-signature-256 (HMAC-SHA256 do CORPO BRUTO com IG_APP_SECRET). Inválida → 401. Válida →
//          responde 200 NA HORA (mesmo com erro interno, que vai para ig_webhook_log) e grava/dispara em segundo
//          plano (background). Campos: messages (inclui respostas e menções a story), messaging_postbacks, comments,
//          live_comments.
import { validSignature, igApi, type HttpFetch } from './igApi.ts';
import { parseWebhook, processEvents, type EventResult } from './igEngine.ts';
import { maybeRefresh } from './igToken.ts';
import type { SupaStore } from './igStore.ts';

export interface HookDeps {
  verifyToken: string | null | undefined;
  appSecret: string | null | undefined;
  store: () => SupaStore | Pick<SupaStore, keyof SupaStore>;
  fetch: HttpFetch;
  now: () => number;
  rnd: () => number;
  background: (p: Promise<unknown>) => void; // EdgeRuntime.waitUntil no Deno; nos testes, guarda a promessa
}
export interface HookOut { status: number; body: string; contentType: string }

export async function handleHook(method: string, url: string, headers: { get: (k: string) => string | null }, raw: Uint8Array, deps: HookDeps): Promise<HookOut> {
  const text = (status: number, body: string): HookOut => ({ status, body, contentType: 'text/plain; charset=utf-8' });
  if (method === 'GET') {
    const q = new URL(url).searchParams;
    if (!deps.verifyToken) return text(403, 'IG_WEBHOOK_VERIFY_TOKEN não cadastrado');
    if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === deps.verifyToken && q.get('hub.challenge')) return text(200, String(q.get('hub.challenge')));
    return text(403, 'verificação recusada');
  }
  if (method !== 'POST') return text(405, 'use GET ou POST');
  if (!(await validSignature(deps.appSecret, raw, headers.get('x-hub-signature-256')))) return text(401, 'assinatura inválida');
  let body: unknown = null;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
  const store = deps.store() as SupaStore;
  if (!body) { deps.background(store.log('aviso', 'webhook: corpo que não é JSON').catch(() => {})); return text(200, 'EVENT_RECEIVED'); }
  deps.background(processBody(body, store, deps).catch((e) => store.log('erro', `webhook: ${String((e as Error)?.message || e).slice(0, 300)}`).catch(() => {})));
  return text(200, 'EVENT_RECEIVED');
}

// o trabalho de verdade (em segundo plano): conta conectada → API → grava e dispara
export async function processBody(body: unknown, store: SupaStore, deps: Pick<HookDeps, 'fetch' | 'now' | 'rnd'>): Promise<EventResult[]> {
  const events = parseWebhook(body);
  if (!events.length) return [];
  let acc = null;
  try { acc = await store.account(); } catch { acc = null; }
  if (acc) { try { await maybeRefresh(store, deps.fetch, deps.now()); acc = (await store.account()) || acc; } catch { /* segue com o token atual */ } }
  const api = acc ? igApi(acc.access_token, deps.fetch) : null;
  return processEvents(events, { store, api, accountId: acc ? acc.ig_user_id : null, now: deps.now, rnd: deps.rnd });
}
