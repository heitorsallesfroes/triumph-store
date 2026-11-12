// Instagram FASE 3 — chamadas à Instagram API com Login do Instagram (graph.instagram.com) e o OAuth. Só no
// servidor (edge functions): o token nunca vai para o navegador e nunca aparece nas mensagens de erro.
// O fetch vem por parâmetro (nos testes a Meta é SIMULADA).

export const IG_API_VERSION = 'v25.0';
export const IG_GRAPH = `https://graph.instagram.com/${IG_API_VERSION}`;
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'];
export const IG_FIELDS = ['messages', 'messaging_postbacks', 'comments', 'live_comments'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<Any> }>;
export interface ApiResult { ok: boolean; status: number; data: Any; error: string | null; code: number | null }

// mensagem de erro da Meta, sem o token
export function metaError(data: Any, status: number, token?: string | null): string {
  const e = data && (data.error || data);
  let m = String((e && (e.error_user_msg || e.message || e.error_message)) || `Erro ${status} da Meta`);
  if (token) m = m.split(token).join('***');
  return m.replace(/access_token=[^&\s]+/g, 'access_token=***').slice(0, 300);
}

export function igApi(token: string, fetch: HttpFetch) {
  async function call(method: string, path: string, body?: Record<string, unknown>): Promise<ApiResult> {
    const url = path.startsWith('http') ? path : `${IG_GRAPH}${path}`;
    let res;
    try {
      res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (e) {
      return { ok: false, status: 0, data: null, error: `Sem resposta da Meta (${String((e as Error)?.message || e).slice(0, 80)})`, code: null };
    }
    let data: Any = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || (data && data.error)) return { ok: false, status: res.status, data, error: metaError(data, res.status, token), code: data && data.error && Number.isFinite(Number(data.error.code)) ? Number(data.error.code) : null };
    return { ok: true, status: res.status, data, error: null, code: null };
  }
  return {
    call,
    me: () => call('GET', '/me?fields=user_id,username,name,profile_picture_url'),
    profile: (igsid: string) => call('GET', `/${encodeURIComponent(igsid)}?fields=name,username,profile_pic`),
    media: () => call('GET', '/me/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp&limit=50'),
    replyComment: (commentId: string, message: string) => call('POST', `/${encodeURIComponent(commentId)}/replies`, { message }),
    send: (recipient: { id: string } | { comment_id: string }, message: Record<string, unknown>) => call('POST', '/me/messages', { recipient, message }),
    subscribe: () => call('POST', `/me/subscribed_apps?subscribed_fields=${IG_FIELDS.join(',')}`),
  };
}
export type IgApi = ReturnType<typeof igApi>;

// DM com botão (template de botão web_url). A Meta recusou o botão → manda o texto com o link (fallback).
export async function sendLinkDm(api: IgApi, recipient: { id: string } | { comment_id: string }, text: string, url: string, title: string): Promise<{ ok: boolean; fallback: boolean; mid: string | null; error: string | null }> {
  const body = String(text || '').slice(0, 640);
  const r = await api.send(recipient, { attachment: { type: 'template', payload: { template_type: 'button', text: body, buttons: [{ type: 'web_url', url, title: String(title || 'WhatsApp').slice(0, 20) }] } } });
  if (r.ok) return { ok: true, fallback: false, mid: (r.data && r.data.message_id) || null, error: null };
  const t = await api.send(recipient, { text: `${String(text || '').slice(0, 900)}\n\n${url}` });
  if (t.ok) return { ok: true, fallback: true, mid: (t.data && t.data.message_id) || null, error: null };
  return { ok: false, fallback: true, mid: null, error: t.error || r.error };
}

// ── OAuth (Login do Instagram) ──
export const authorizeUrl = (appId: string, redirectUri: string, state: string) =>
  `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(IG_SCOPES.join(','))}&state=${state}`;

export interface TokenOut { ok: boolean; token: string | null; userId: string | null; expiresAt: number | null; scopes: string | null; error: string | null }
// code → token curto → token de longa duração (60 dias)
export async function exchangeCode(fetch: HttpFetch, { appId, appSecret, redirectUri, code, now }: { appId: string; appSecret: string; redirectUri: string; code: string; now: number }): Promise<TokenOut> {
  const form = new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code: String(code).replace(/#_$/, '') });
  let short: Any = null;
  try {
    const r = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    short = await r.json().catch(() => null);
    if (!r.ok || !short) return { ok: false, token: null, userId: null, expiresAt: null, scopes: null, error: metaError(short, r.status) };
  } catch { return { ok: false, token: null, userId: null, expiresAt: null, scopes: null, error: 'Sem resposta da Meta ao trocar o código' }; }
  const s = Array.isArray(short.data) ? short.data[0] || {} : short; // a Meta já devolveu dos dois jeitos
  if (!s.access_token) return { ok: false, token: null, userId: null, expiresAt: null, scopes: null, error: metaError(short, 400) };
  const long = await exchangeLong(fetch, appSecret, String(s.access_token), now);
  if (!long.ok) return { ...long, userId: s.user_id ? String(s.user_id) : null };
  return { ...long, userId: s.user_id ? String(s.user_id) : null, scopes: Array.isArray(s.permissions) ? s.permissions.join(',') : typeof s.permissions === 'string' ? s.permissions : null };
}
export async function exchangeLong(fetch: HttpFetch, appSecret: string, shortToken: string, now: number): Promise<TokenOut> {
  const url = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortToken)}`;
  return tokenCall(fetch, url, now, [shortToken, appSecret]);
}
export async function refreshToken(fetch: HttpFetch, token: string, now: number): Promise<TokenOut> {
  return tokenCall(fetch, `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, now, [token]);
}
async function tokenCall(fetch: HttpFetch, url: string, now: number, hide: string[]): Promise<TokenOut> {
  try {
    const r = await fetch(url, { method: 'GET' });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.access_token) {
      let m = metaError(d, r.status);
      hide.forEach((h) => { if (h) m = m.split(h).join('***'); });
      return { ok: false, token: null, userId: null, expiresAt: null, scopes: null, error: m };
    }
    const sec = Number(d.expires_in);
    return { ok: true, token: String(d.access_token), userId: null, expiresAt: Number.isFinite(sec) && sec > 0 ? now + sec * 1000 : null, scopes: null, error: null };
  } catch { return { ok: false, token: null, userId: null, expiresAt: null, scopes: null, error: 'Sem resposta da Meta' }; }
}

// ── assinatura do webhook: x-hub-signature-256 = "sha256=" + HMAC-SHA256(corpo BRUTO, IG_APP_SECRET) ──
export async function hmacHex(secret: string, raw: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function validSignature(secret: string | null | undefined, raw: Uint8Array, header: string | null | undefined): Promise<boolean> {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header).trim());
  if (!m) return false;
  const want = await hmacHex(secret, raw);
  const got = m[1].toLowerCase();
  let diff = 0; // comparação em tempo constante
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
