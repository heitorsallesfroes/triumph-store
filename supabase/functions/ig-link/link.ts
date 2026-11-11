// Edge Function "ig-link": abre um link rastreável do Instagram (https://triumph-store.vercel.app/l/<apelido>).
// PÚBLICA (a página /l/ chama com a chave anon, sem login): procura o link ATIVO pelo apelido, registra o clique e
// devolve o endereço do WhatsApp da loja com a mensagem pré-preenchida + o código ([IG-BIO]).
// O IP NÃO é guardado: só um HMAC-SHA256 (com a chave de serviço do próprio Supabase como segredo), cortado em 32
// caracteres. Aparelho/navegador vão resumidos ("Android" / "Instagram"). O mesmo IP no mesmo link em menos de 30 s
// conta um clique só (o navegador do Instagram às vezes abre duas vezes).
// Só lê ig_links e grava ig_link_clicks. A lógica fica aqui (testável no Node); index.ts só liga o Deno.

export const STORE_WA = '5521980921808';
export const DEFAULT_MESSAGE = 'Olá! Vim pelo Instagram 😊';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const DEDUP_MS = 30 * 1000;

export interface LinkRow { id: string; slug: string; code: string; message: string; active: boolean }
export interface Deps {
  findLink: (slug: string) => Promise<LinkRow | null>;
  recentClick: (linkId: string, ipHash: string, sinceIso: string) => Promise<boolean>;
  insertClick: (row: { link_id: string; device: string; browser: string; ip_hash: string | null }) => Promise<void>;
  hmac: (text: string) => Promise<string>; // hex
  now: () => number;
}

export const prefilledText = (message: string, code: string) => `${String(message || '').trim() || DEFAULT_MESSAGE} [${code}]`;
export const waUrl = (text: string) => `https://wa.me/${STORE_WA}?text=${encodeURIComponent(text)}`;
export function summarizeUa(ua: string | null | undefined): { device: string; browser: string } {
  const s = String(ua || '');
  const device = /iPhone|iPad|iPod/i.test(s) ? 'iPhone/iPad' : /Android/i.test(s) ? 'Android' : /Windows|Macintosh|Linux|CrOS/i.test(s) ? 'Computador' : 'Outro';
  const browser = /Instagram/i.test(s) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(s) ? 'Facebook' : /WhatsApp/i.test(s) ? 'WhatsApp'
    : /Edg\//i.test(s) ? 'Edge' : /SamsungBrowser/i.test(s) ? 'Samsung' : /CriOS|Chrome\//i.test(s) ? 'Chrome' : /Firefox|FxiOS/i.test(s) ? 'Firefox' : /Safari/i.test(s) ? 'Safari' : 'Outro';
  return { device, browser };
}
// 1º IP do x-forwarded-for (o do visitante)
export const ipOf = (headers: { get: (k: string) => string | null }) => String(headers.get('x-forwarded-for') || headers.get('x-real-ip') || '').split(',')[0].trim().slice(0, 100);

export async function open(body: unknown, headers: { get: (k: string) => string | null }, deps: Deps): Promise<{ status: number; json: Record<string, unknown> }> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const slug = String(b.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { status: 400, json: { success: false, error: 'Link inválido', url: waUrl(DEFAULT_MESSAGE) } };
  let link: LinkRow | null = null;
  try { link = await deps.findLink(slug); } catch { link = null; }
  // link que não existe / desligado: ainda leva para o WhatsApp (sem código e sem registrar)
  if (!link || !link.active) return { status: 404, json: { success: false, error: 'Link não encontrado', url: waUrl(DEFAULT_MESSAGE) } };
  const url = waUrl(prefilledText(link.message, link.code));
  const { device, browser } = summarizeUa(headers.get('user-agent'));
  const ip = ipOf(headers);
  let ipHash: string | null = null;
  try { ipHash = ip ? (await deps.hmac(`${ip}|${link.id}`)).slice(0, 32) : null; } catch { ipHash = null; }
  let counted = false;
  try {
    const dup = ipHash ? await deps.recentClick(link.id, ipHash, new Date(deps.now() - DEDUP_MS).toISOString()) : false;
    if (!dup) { await deps.insertClick({ link_id: link.id, device, browser, ip_hash: ipHash }); counted = true; }
  } catch { /* sem registrar: o cliente segue para o WhatsApp mesmo assim */ }
  return { status: 200, json: { success: true, url, code: link.code, counted } };
}
