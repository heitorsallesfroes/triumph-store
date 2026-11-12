// Eventos de COMPRA (Purchase) e CONTATO (Contact) para o Conjunto de dados (Pixel) do Facebook, pela
// API de Conversões. Arquivo puro (sem imports): validação, montagem do evento e o fluxo completo com
// dependências injetadas (Supabase Auth, tabela, fetch, secrets) — por isso dá para testar fora do Deno.
// O token do Facebook só existe nos secrets da função (META_ACCESS_TOKEN); nunca volta na resposta.

// Versão da Graph API (troque aqui quando a Meta descontinuar esta)
export const GRAPH_API_VERSION = 'v24.0';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
const MAX_PAST_S = 7 * 24 * 3600;

export type EventName = 'Purchase' | 'Contact';

export interface PurchaseInput {
  event_name: EventName;
  chat_id: string;
  phone: string | null; // Purchase: obrigatório; Contact: telefone OU ctwa_clid
  contact_name: string | null;
  value: number | null; // Contact: sem valor
  currency: 'BRL';
  event_time: number; // segundos (unix)
  ad: { title: string | null; source_id: string | null; source_app: string | null; conversion_source: string | null; ctwa_clid: string | null };
  description: string | null;
  test: boolean;
  event_id: string; // Contact: gerado aqui a partir da conversa (ver contactEventId)
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);

// Telefone para o Facebook: só dígitos, com 55 (10/11 dígitos ganham 55; 12/13 com 55 ficam)
export function normalizePhone(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export function validate(body: any, nowS: number): { ok: true; input: PurchaseInput } | { ok: false; error: string } {
  const b = body || {};
  const name = b.event_name === undefined || b.event_name === null || b.event_name === 'Purchase' ? 'Purchase' : b.event_name === 'Contact' ? 'Contact' : null;
  if (!name) return { ok: false, error: 'Evento inválido (use Purchase ou Contact)' };
  if (typeof b.chat_id !== 'string' || !CHAT_RE.test(b.chat_id)) return { ok: false, error: 'Conversa inválida' };
  const ad = b.ad && typeof b.ad === 'object' ? b.ad : {};
  const rawClid = str(ad.ctwa_clid, 500);
  const clid = rawClid && /^[\w.:=+/-]+$/.test(rawClid) ? rawClid : null;
  const phone = normalizePhone(b.phone);
  if (name === 'Purchase' && !phone) return { ok: false, error: 'Telefone inválido' };
  if (name === 'Contact' && !phone && !clid) return { ok: false, error: 'Telefone inválido (o Contato precisa do telefone ou do código de clique)' };
  let value: number | null = null;
  if (name === 'Purchase') {
    value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) return { ok: false, error: 'Valor deve ser maior que 0 e até 100.000' };
    value = Math.round(value * 100) / 100;
  }
  if (b.currency !== undefined && b.currency !== 'BRL') return { ok: false, error: 'Moeda deve ser BRL' };
  const t = Number(b.event_time);
  const what = name === 'Purchase' ? 'da compra' : 'do contato';
  if (!Number.isInteger(t)) return { ok: false, error: `Data ${what} inválida` };
  if (t > nowS + 60) return { ok: false, error: `A data ${what} não pode ser no futuro` };
  if (t < nowS - MAX_PAST_S) return { ok: false, error: name === 'Purchase' ? 'A compra precisa ser dos últimos 7 dias' : 'O contato precisa ser dos últimos 7 dias' };
  if (name === 'Purchase' && (typeof b.event_id !== 'string' || !UUID_RE.test(b.event_id))) return { ok: false, error: 'Identificador do evento inválido' };
  return {
    ok: true,
    input: {
      event_name: name, chat_id: b.chat_id, phone, contact_name: str(b.contact_name, 100), value, currency: 'BRL', event_time: t,
      ad: { title: str(ad.title, 200), source_id: str(ad.source_id, 100), source_app: str(ad.source_app, 40), conversion_source: str(ad.conversion_source, 40), ctwa_clid: clid },
      description: name === 'Purchase' ? str(b.description, 200) : null, test: false, // 12/11: sempre real (sem modo teste)
      event_id: name === 'Purchase' ? b.event_id : '',
    },
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// "Contato": um só por conversa (e outro, separado, no modo teste). event_id = hash estável em formato UUID.
export async function contactEventId(chatId: string, test: boolean): Promise<string> {
  const h = await sha256Hex(`contact:${test ? 'test' : 'real'}:${chatId}`);
  const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Monta o evento. Com ctwa_clid: user_data.ctwa_clid SEMPRE. Com ctwa_clid + WABA: "business_messaging"
// (WhatsApp); senão "chat" (ctwa_clid + telefone e conversa em hash). withClid=false: a nova tentativa sem ele.
export async function buildEvent(input: PurchaseInput, env: { META_WABA_ID?: string | null }, { withClid = true }: { withClid?: boolean } = {}) {
  const ph = input.phone ? await sha256Hex(input.phone) : null;
  const clid = withClid ? input.ad.ctwa_clid : null;
  const businessMessaging = !!(clid && env.META_WABA_ID);
  const custom_data: Record<string, unknown> = {};
  if (input.event_name === 'Purchase') { custom_data.value = input.value; custom_data.currency = 'BRL'; }
  if (input.description) custom_data.content_name = input.description;
  if (input.ad.source_id) custom_data.ad_id = input.ad.source_id;
  if (input.ad.conversion_source) custom_data.conversion_source = input.ad.conversion_source;
  if (input.ad.source_app) custom_data.source_app = input.ad.source_app;
  const event: Record<string, unknown> = {
    event_name: input.event_name,
    event_time: input.event_time,
    event_id: input.event_id,
    custom_data,
  };
  if (businessMessaging) {
    event.action_source = 'business_messaging';
    event.messaging_channel = 'whatsapp';
    const user: Record<string, unknown> = { ctwa_clid: clid, whatsapp_business_account_id: env.META_WABA_ID };
    if (ph) user.ph = [ph];
    event.user_data = user;
  } else {
    event.action_source = 'chat';
    const user: Record<string, unknown> = {};
    if (clid) user.ctwa_clid = clid;
    if (ph) user.ph = [ph];
    user.external_id = [await sha256Hex(input.chat_id)];
    event.user_data = user;
  }
  return { event, method: businessMessaging ? 'business_messaging' as const : 'chat' as const };
}

export interface Deps {
  env: { META_ACCESS_TOKEN?: string | null; META_DATASET_ID?: string | null; META_WABA_ID?: string | null; META_TEST_EVENT_CODE?: string | null };
  getUser: (jwt: string) => Promise<{ id: string } | null>; // Supabase Auth: null = sem login
  findEvent: (eventId: string) => Promise<{ status: string; events_received: number | null } | null>;
  insertRow: (row: Record<string, unknown>) => Promise<void>; // erro do banco: lança (para tentar sem event_name)
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  now: () => number; // ms
}

// Mensagem do Facebook resumida, sem token
const fbError = (body: any, status: number) => {
  const e = body && body.error ? body.error : null;
  const msg = e ? [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ') : `Erro ${status}`;
  return String(msg).replace(/access_token=[^&\s]+/gi, 'access_token=***').slice(0, 300);
};

type FbResult = { ok: boolean; status: number; body: any; error: string | null };

async function postToFacebook(deps: Deps, url: string, payload: Record<string, unknown>): Promise<FbResult> {
  let res: { ok: boolean; status: number; json: () => Promise<any> };
  let body: any = null;
  try {
    res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    body = await res.json().catch(() => null);
  } catch {
    res = { ok: false, status: 0, json: async () => null };
  }
  const ok = res.ok && body && Number(body.events_received) > 0;
  return { ok, status: res.status, body, error: ok ? null : (res.status === 0 ? 'Não consegui falar com o Facebook' : fbError(body, res.status)) };
}

// Histórico: grava event_name se a coluna existir; sem ela (sem migration), grava sem e, no Contato,
// deixa "evento: Contact" no campo error.
async function saveRow(deps: Deps, row: Record<string, unknown>, eventName: EventName) {
  try {
    await deps.insertRow({ ...row, event_name: eventName });
    return;
  } catch {
    // coluna event_name não existe (ou outro erro): grava do jeito antigo
  }
  const error = eventName === 'Contact' ? [`evento: Contact`, row.error].filter(Boolean).join(' · ').slice(0, 300) : row.error;
  try { await deps.insertRow({ ...row, error }); } catch { /* o envio já aconteceu; o histórico é secundário */ }
}

export async function handle(method: string, authorization: string | null, body: any, deps: Deps): Promise<{ status: number; json: Record<string, unknown> }> {
  const jwt = (authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = jwt ? await deps.getUser(jwt).catch(() => null) : null;
  if (!user) return { status: 401, json: { ok: false, error: 'Entre com sua conta do sistema (login obrigatório)' } };
  const env = deps.env;
  // Diagnóstico: só diz se os secrets existem (nunca os valores)
  if (body && body.check === true) {
    return { status: 200, json: { ok: true, configured: { token: !!env.META_ACCESS_TOKEN, dataset: !!env.META_DATASET_ID, waba: !!env.META_WABA_ID, test_code: !!env.META_TEST_EVENT_CODE } } };
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, error: 'Use POST' } };
  if (!env.META_ACCESS_TOKEN || !env.META_DATASET_ID) return { status: 500, json: { ok: false, error: 'Faltam os secrets META_ACCESS_TOKEN e META_DATASET_ID na Edge Function' } };
  const v = validate(body, Math.floor(deps.now() / 1000));
  if (!v.ok) return { status: 400, json: { ok: false, error: v.error } };
  const input = v.input;
  if (input.event_name === 'Contact') input.event_id = await contactEventId(input.chat_id, input.test);
  // Mesmo event_id já enviado: não manda de novo (no Contato: a mesma conversa nunca duplica)
  const prev = await deps.findEvent(input.event_id).catch(() => null);
  if (prev && prev.status === 'enviado') return { status: 200, json: { ok: true, duplicate: true, events_received: prev.events_received ?? 0, event_name: input.event_name } };
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(env.META_DATASET_ID)}/events?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  const send = async (withClid: boolean) => {
    const built = await buildEvent(input, env, { withClid });
    const payload: Record<string, unknown> = { data: [built.event] };
    return { how: built.method, fb: await postToFacebook(deps, url, payload) };
  };
  let { how, fb } = await send(true);
  let error = fb.error;
  let retried = false;
  // "chat" com ctwa_clid recusado pelo Facebook: tenta UMA vez sem ele (telefone + conversa em hash)
  if (!fb.ok && fb.status !== 0 && how === 'chat' && input.ad.ctwa_clid && input.phone) {
    const first = fb.error;
    const again = await send(false);
    retried = true;
    how = again.how;
    fb = again.fb;
    error = fb.ok ? `ctwa_clid recusado no modo chat (${first}); enviado sem ele` : `${fb.error} (sem ctwa_clid; com ele: ${first})`;
    error = String(error).slice(0, 300);
  }
  const row = {
    event_id: input.event_id, chat_id: input.chat_id, contact_name: input.contact_name, value: input.value, currency: 'BRL',
    ad_id: input.ad.source_id, ad_title: input.ad.title, method: how, test: input.test,
    status: fb.ok ? 'enviado' : 'falhou', events_received: fb.ok ? Number(fb.body.events_received) : 0, error,
  };
  await saveRow(deps, row, input.event_name);
  if (!fb.ok) return { status: 502, json: { ok: false, error } };
  return {
    status: 200,
    json: { ok: true, events_received: Number(fb.body.events_received), fbtrace_id: fb.body.fbtrace_id || null, method: how, test: input.test, event_name: input.event_name, retried_without_clid: retried },
  };
}
