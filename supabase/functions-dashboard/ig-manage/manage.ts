// Edge Function "ig-manage" — o lado do ERP do Instagram FASE 3 (Automações e Direct). Publicar com "Verify JWT"
// DESLIGADO (a volta do Login do Instagram chega sem login do ERP); cada ação confere o login por conta própria.
//   GET  .../ig-manage/oauth?code&state  volta do "Conectar Instagram": troca o code por token de LONGA duração,
//                                        guarda em ig_account (só do servidor) e volta para o ERP.
//   POST { action } (login do ERP obrigatório):
//     status         conta conectada (@, validade do token, alertas), segredos que faltam e as URLs para a Meta
//     connect_url    endereço do Login do Instagram (com state de 15 min)
//     refresh        renova o token agora
//     media          posts/reels da conta (para a grade de "posts escolhidos")
//     reply          { igsid, text }  resposta do Direct (só dentro da janela de 24 h)
//     send_whatsapp  { igsid }        DM padrão com o botão do WhatsApp (só dentro da janela de 24 h)
//   POST { action: "cron_refresh" } com o cabeçalho x-cron-key (rotina diária do banco, sem login do ERP).
// O token nunca volta para o navegador (nem nas mensagens de erro).
import { authorizeUrl, exchangeCode, igApi, sendLinkDm, type HttpFetch } from './igApi.ts';
import { DIRECT_CODE, DM_WINDOW_MS, IGSID_RE, fillName, waUrl, within } from './igRules.ts';
import { ALERT_BEFORE_MS, maybeRefresh } from './igToken.ts';
import type { SupaStore } from './igStore.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export interface ManageDeps {
  appId: string | null | undefined; appSecret: string | null | undefined; verifyToken: string | null | undefined;
  supabaseUrl: string; erpUrl: string;
  store: SupaStore;
  fetch: HttpFetch;
  now: () => number;
  getUser: (jwt: string) => Promise<{ id: string } | null>;
  randomHex: () => string; // 32+ caracteres hexadecimais
}
export interface ManageOut { status: number; json?: Record<string, unknown>; redirect?: string }
const STATE_MS = 15 * 60 * 1000;
export const redirectUriOf = (supabaseUrl: string) => `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/ig-manage/oauth`;
export const webhookUrlOf = (supabaseUrl: string) => `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/ig-webhook`;
const ok = (json: Record<string, unknown>): ManageOut => ({ status: 200, json: { success: true, ...json } });
const bad = (status: number, error: string): ManageOut => ({ status, json: { success: false, error } });

export async function handleManage(method: string, url: string, headers: { get: (k: string) => string | null }, body: Any, deps: ManageDeps): Promise<ManageOut> {
  const u = new URL(url);
  if (method === 'GET' && /\/oauth\/?$/.test(u.pathname)) return oauthBack(u, deps);
  if (method !== 'POST') return bad(405, 'Use POST');
  const b = body && typeof body === 'object' ? body : {};
  const action = String(b.action || '');
  if (action === 'cron_refresh') {
    const key = await deps.store.kv('cron_key').catch(() => null);
    if (!key || headers.get('x-cron-key') !== key) return bad(401, 'chave da rotina inválida');
    const r = await maybeRefresh(deps.store, deps.fetch, deps.now());
    return ok({ refresh: r });
  }
  const jwt = String(headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = jwt ? await deps.getUser(jwt).catch(() => null) : null;
  if (!user) return bad(401, 'Entre com sua conta do sistema');
  try {
    if (action === 'status') return ok(await status(deps));
    if (action === 'connect_url') {
      if (!deps.appId || !deps.appSecret) return bad(400, 'Cadastre os segredos IG_APP_ID e IG_APP_SECRET no Supabase antes de conectar.');
      const state = deps.randomHex();
      await deps.store.newState(state);
      return ok({ url: authorizeUrl(deps.appId, redirectUriOf(deps.supabaseUrl), state) });
    }
    if (action === 'refresh') {
      const r = await maybeRefresh(deps.store, deps.fetch, deps.now(), true);
      return r.error ? bad(502, `Não consegui renovar: ${r.error}`) : ok({ refresh: r, ...(await status(deps)) });
    }
    const acc = await deps.store.account();
    if (!acc) return bad(400, 'Conecte o Instagram primeiro (aba Automações → Conectar Instagram).');
    const api = igApi(acc.access_token, deps.fetch);
    if (action === 'media') {
      const r = await api.media();
      if (!r.ok) return bad(502, `A Meta não devolveu os posts: ${r.error}`);
      const items = ((r.data && r.data.data) || []).map((m: Any) => ({ id: String(m.id), caption: m.caption ? String(m.caption).slice(0, 200) : '', type: m.media_product_type === 'REELS' ? 'reel' : String(m.media_type || '').toLowerCase(), thumb: m.thumbnail_url || m.media_url || null, permalink: m.permalink || null, timestamp: m.timestamp || null }));
      return ok({ items });
    }
    if (action === 'reply' || action === 'send_whatsapp') {
      const igsid = String(b.igsid || '');
      if (!IGSID_RE.test(igsid)) return bad(400, 'Conversa inválida');
      const conv = await deps.store.conversation(igsid);
      if (!conv) return bad(404, 'Conversa não encontrada');
      const last = conv.last_customer_at ? Date.parse(conv.last_customer_at) : NaN;
      if (!within(last, deps.now(), DM_WINDOW_MS)) return bad(409, 'Fora da janela de 24 h: o Instagram só deixa responder até 24 h depois da última mensagem da pessoa.');
      const at = new Date(deps.now()).toISOString();
      if (action === 'reply') {
        const text = String(b.text || '').trim();
        if (!text || text.length > 1000) return bad(400, 'Escreva a resposta (até 1000 caracteres).');
        const r = await api.send({ id: igsid }, { text });
        if (!r.ok) return bad(502, `O Instagram recusou: ${r.error}`);
        const mid = (r.data && r.data.message_id) || `manual-${deps.randomHex().slice(0, 16)}`;
        await deps.store.saveMessage({ mid, igsid, from_me: true, kind: 'dm', text, attachment_type: null, app_id: null, automation_id: null, sent_at: at });
        await deps.store.touchConversation(igsid, { at, text: text.slice(0, 300), from: 'loja', origin: 'dm', customer: false });
        return ok({ mid });
      }
      const s = await deps.store.settings();
      const text = fillName(s.directDm, conv.name);
      const link = waUrl(s.directPhrase);
      const r = await sendLinkDm(api, { id: igsid }, text, link, 'WhatsApp Loja');
      if (!r.ok) return bad(502, `O Instagram recusou: ${r.error}`);
      const mid = r.mid || `manual-${deps.randomHex().slice(0, 16)}`;
      await deps.store.saveMessage({ mid, igsid, from_me: true, kind: 'dm', text: `${text}\n${r.fallback ? '' : '[WhatsApp Loja] '}${link}`, attachment_type: r.fallback ? null : 'template', app_id: null, automation_id: null, sent_at: at });
      await deps.store.touchConversation(igsid, { at, text: text.slice(0, 300), from: 'loja', origin: 'dm', customer: false });
      await deps.store.markWaSent(igsid, at, DIRECT_CODE);
      return ok({ mid, fallback: r.fallback });
    }
    return bad(400, 'Ação inválida');
  } catch (e) {
    return bad(500, String((e as Error)?.message || e).slice(0, 200));
  }
}

async function status(deps: ManageDeps): Promise<Record<string, unknown>> {
  const secrets = { IG_APP_ID: !!deps.appId, IG_APP_SECRET: !!deps.appSecret, IG_WEBHOOK_VERIFY_TOKEN: !!deps.verifyToken };
  const urls = { redirect_uri: redirectUriOf(deps.supabaseUrl), webhook_url: webhookUrlOf(deps.supabaseUrl) };
  let acc = await deps.store.account();
  let refreshError: string | null = null;
  if (acc) {
    const r = await maybeRefresh(deps.store, deps.fetch, deps.now()).catch((e) => ({ error: String((e as Error)?.message || e) }) as { error: string });
    refreshError = (r && (r as { error: string | null }).error) || null;
    acc = (await deps.store.account()) || acc;
  }
  if (!acc) return { secrets, ...urls, connected: false };
  const exp = acc.token_expires_at ? Date.parse(acc.token_expires_at) : NaN;
  const left = Number.isFinite(exp) ? exp - deps.now() : null;
  const alert = left == null ? 'Validade do token desconhecida: clique em "Renovar agora".'
    : left <= 0 ? 'O token VENCEU: conecte o Instagram de novo.'
    : acc.refresh_error || refreshError ? `A renovação automática falhou: ${acc.refresh_error || refreshError}`
    : left < ALERT_BEFORE_MS ? `O token vence em ${Math.max(0, Math.ceil(left / 86400000))} dia(s).` : null;
  return {
    secrets, ...urls, connected: true,
    account: { ig_user_id: acc.ig_user_id, username: acc.username, name: acc.name, picture_url: acc.picture_url, connected_at: acc.connected_at },
    token_expires_at: acc.token_expires_at, days_left: left == null ? null : Math.floor(left / 86400000), refreshed_at: acc.refreshed_at,
    refresh_error: acc.refresh_error || refreshError, alert,
  };
}

async function oauthBack(u: URL, deps: ManageDeps): Promise<ManageOut> {
  const back = (q: Record<string, string>) => ({ status: 302, redirect: `${deps.erpUrl.replace(/\/+$/, '')}/?${new URLSearchParams({ pagina: 'instagram', aba: 'automacoes', ...q }).toString()}` });
  const fail = (m: string) => back({ ig: 'erro', motivo: m.slice(0, 160) });
  if (u.searchParams.get('error')) return fail(u.searchParams.get('error_description') || u.searchParams.get('error_reason') || 'Login do Instagram cancelado');
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state') || '';
  if (!code || !/^[0-9a-f]{32,64}$/.test(state)) return fail('Resposta do Instagram incompleta');
  if (!deps.appId || !deps.appSecret) return fail('Faltam os segredos IG_APP_ID / IG_APP_SECRET');
  if (!(await deps.store.useState(state, STATE_MS, deps.now()).catch(() => false))) return fail('O pedido de conexão expirou: clique em Conectar de novo');
  const now = deps.now();
  const t = await exchangeCode(deps.fetch, { appId: deps.appId, appSecret: deps.appSecret, redirectUri: redirectUriOf(deps.supabaseUrl), code, now });
  if (!t.ok || !t.token) return fail(`A Meta recusou: ${t.error || 'sem token'}`);
  const api = igApi(t.token, deps.fetch);
  const me = await api.me();
  const d = (me.ok && me.data) || {};
  const userId = String(d.user_id || t.userId || d.id || '');
  if (!IGSID_RE.test(userId)) return fail('Não consegui ler a conta do Instagram');
  await deps.store.saveAccount({
    ig_user_id: userId, username: d.username || null, name: d.name || null, picture_url: d.profile_picture_url || null,
    access_token: t.token, token_expires_at: t.expiresAt ? new Date(t.expiresAt).toISOString() : null, refreshed_at: new Date(now).toISOString(),
    refresh_tried_at: null, refresh_error: null, scopes: t.scopes, connected_at: new Date(now).toISOString(),
  });
  const sub = await api.subscribe();
  if (!sub.ok) await deps.store.log('aviso', `não consegui assinar os campos do webhook (${sub.error}); assine no painel da Meta`).catch(() => {});
  return back({ ig: 'conectado' });
}
