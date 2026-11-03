// Evento de COMPRA (Purchase) para o Conjunto de dados (Pixel) do Facebook, pela API de Conversões.
// Arquivo puro (sem imports): validação, montagem do evento e o fluxo completo com dependências
// injetadas (Supabase Auth, tabela, fetch, secrets) — por isso dá para testar fora do Deno.
// O token do Facebook só existe nos secrets da função (META_ACCESS_TOKEN); nunca volta na resposta.

// Versão da Graph API (troque aqui quando a Meta descontinuar esta)
export const GRAPH_API_VERSION = 'v24.0';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
const MAX_PAST_S = 7 * 24 * 3600;

export interface PurchaseInput {
  chat_id: string;
  phone: string;
  contact_name: string | null;
  value: number;
  currency: 'BRL';
  event_time: number; // segundos (unix)
  ad: { title: string | null; source_id: string | null; source_app: string | null; ctwa_clid: string | null };
  description: string | null;
  test: boolean;
  event_id: string;
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
  if (typeof b.chat_id !== 'string' || !CHAT_RE.test(b.chat_id)) return { ok: false, error: 'Conversa inválida' };
  const phone = normalizePhone(b.phone);
  if (!phone) return { ok: false, error: 'Telefone inválido' };
  const value = Number(b.value);
  if (!Number.isFinite(value) || value <= 0 || value > 100000) return { ok: false, error: 'Valor deve ser maior que 0 e até 100.000' };
  if (b.currency !== undefined && b.currency !== 'BRL') return { ok: false, error: 'Moeda deve ser BRL' };
  const t = Number(b.event_time);
  if (!Number.isInteger(t)) return { ok: false, error: 'Data da compra inválida' };
  if (t > nowS + 60) return { ok: false, error: 'A data da compra não pode ser no futuro' };
  if (t < nowS - MAX_PAST_S) return { ok: false, error: 'A compra precisa ser dos últimos 7 dias' };
  if (typeof b.event_id !== 'string' || !UUID_RE.test(b.event_id)) return { ok: false, error: 'Identificador do evento inválido' };
  const ad = b.ad && typeof b.ad === 'object' ? b.ad : {};
  const clid = str(ad.ctwa_clid, 500);
  return {
    ok: true,
    input: {
      chat_id: b.chat_id, phone, contact_name: str(b.contact_name, 100), value: Math.round(value * 100) / 100, currency: 'BRL', event_time: t,
      ad: { title: str(ad.title, 200), source_id: str(ad.source_id, 100), source_app: str(ad.source_app, 40), ctwa_clid: clid && /^[\w.:=+/-]+$/.test(clid) ? clid : null },
      description: str(b.description, 200), test: b.test === true, event_id: b.event_id,
    },
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Monta o evento. Com ctwa_clid + WABA: "business_messaging" (WhatsApp); senão "chat" com telefone e conversa em hash.
export async function buildEvent(input: PurchaseInput, env: { META_WABA_ID?: string | null }) {
  const ph = await sha256Hex(input.phone);
  const businessMessaging = !!(input.ad.ctwa_clid && env.META_WABA_ID);
  const custom_data: Record<string, unknown> = { value: input.value, currency: 'BRL' };
  if (input.description) custom_data.content_name = input.description;
  if (input.ad.source_id) custom_data.ad_id = input.ad.source_id;
  const event: Record<string, unknown> = {
    event_name: 'Purchase',
    event_time: input.event_time,
    event_id: input.event_id,
    custom_data,
  };
  if (businessMessaging) {
    event.action_source = 'business_messaging';
    event.messaging_channel = 'whatsapp';
    event.user_data = { ctwa_clid: input.ad.ctwa_clid, whatsapp_business_account_id: env.META_WABA_ID, ph: [ph] };
  } else {
    event.action_source = 'chat';
    event.user_data = { ph: [ph], external_id: [await sha256Hex(input.chat_id)] };
  }
  return { event, method: businessMessaging ? 'business_messaging' as const : 'chat' as const };
}

export interface Deps {
  env: { META_ACCESS_TOKEN?: string | null; META_DATASET_ID?: string | null; META_WABA_ID?: string | null; META_TEST_EVENT_CODE?: string | null };
  getUser: (jwt: string) => Promise<{ id: string } | null>; // Supabase Auth: null = sem login
  findEvent: (eventId: string) => Promise<{ status: string; events_received: number | null } | null>;
  insertRow: (row: Record<string, unknown>) => Promise<void>;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  now: () => number; // ms
}

// Mensagem do Facebook resumida, sem token
const fbError = (body: any, status: number) => {
  const e = body && body.error ? body.error : null;
  const msg = e ? [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ') : `Erro ${status}`;
  return String(msg).replace(/access_token=[^&\s]+/gi, 'access_token=***').slice(0, 300);
};

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
  if (input.test && !env.META_TEST_EVENT_CODE) return { status: 400, json: { ok: false, error: 'Modo teste ligado, mas falta o secret META_TEST_EVENT_CODE' } };
  // Mesmo event_id já enviado: não manda de novo
  const prev = await deps.findEvent(input.event_id).catch(() => null);
  if (prev && prev.status === 'enviado') return { status: 200, json: { ok: true, duplicate: true, events_received: prev.events_received ?? 0 } };
  const { event, method: how } = await buildEvent(input, env);
  const payload: Record<string, unknown> = { data: [event] };
  if (input.test) payload.test_event_code = env.META_TEST_EVENT_CODE;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(env.META_DATASET_ID)}/events?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  let res: { ok: boolean; status: number; json: () => Promise<any> };
  let fb: any = null;
  try {
    res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    fb = await res.json().catch(() => null);
  } catch {
    res = { ok: false, status: 0, json: async () => null };
  }
  const okFb = res.ok && fb && Number(fb.events_received) > 0;
  const error = okFb ? null : (res.status === 0 ? 'Não consegui falar com o Facebook' : fbError(fb, res.status));
  const row = {
    event_id: input.event_id, chat_id: input.chat_id, contact_name: input.contact_name, value: input.value, currency: 'BRL',
    ad_id: input.ad.source_id, ad_title: input.ad.title, method: how, test: input.test,
    status: okFb ? 'enviado' : 'falhou', events_received: okFb ? Number(fb.events_received) : 0, error,
  };
  try { await deps.insertRow(row); } catch { /* o envio já aconteceu; o histórico é secundário */ }
  if (!okFb) return { status: 502, json: { ok: false, error } };
  return { status: 200, json: { ok: true, events_received: Number(fb.events_received), fbtrace_id: fb.fbtrace_id || null, method: how, test: input.test } };
}
