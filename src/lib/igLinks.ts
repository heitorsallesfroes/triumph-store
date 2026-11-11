// Instagram FASE 2 — links rastreáveis (https://triumph-store.vercel.app/l/<apelido>). Regras puras (sem React nem
// Supabase), conferidas em scripts/tests/igLinks.test.ts:
//   apelido e código válidos, texto pré-preenchido com o código, link do WhatsApp, código achado na mensagem (a
//   mesma regra da extensão 2.18.0) e os resultados por link e por canal (cliques → conversas → vendas → R$).
// Tabelas: ig_links, ig_link_clicks, ig_link_leads (migration 20261113120000_ig_links.sql).

export const SITE_URL = 'https://triumph-store.vercel.app';
export const STORE_WA = '5521980921808';
export const DEFAULT_MESSAGE = 'Olá! Vim pelo Instagram 😊';

export type IgChannel = 'bio' | 'comentarios' | 'stories' | 'post' | 'destaques' | 'outro';
export const CHANNELS: [IgChannel, string][] = [
  ['bio', 'Bio'], ['comentarios', 'Comentários/ManyChat'], ['stories', 'Stories'], ['post', 'Reel/post específico'], ['destaques', 'Destaques'], ['outro', 'Outro'],
];
export const CHANNEL_LABEL = Object.fromEntries(CHANNELS) as Record<IgChannel, string>;
export const isChannel = (v: unknown): v is IgChannel => typeof v === 'string' && v in CHANNEL_LABEL;

export interface IgLink {
  id: string; slug: string; channel: IgChannel; code: string; message: string;
  media_id: string | null; media_permalink: string | null; media_caption: string | null; note: string | null;
  active: boolean; created_at: string; updated_at?: string;
}
export interface IgClick { link_id: string; created_at: string; device: string | null; browser: string | null }
export interface IgLeadRow { chat_id: string; phone: string | null; first_message_at: string; code: string; link_id: string | null }

// ── apelido e código ──
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
export const CODE_RE = /^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$/;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// "Promo Black Friday!" → "promo-black-friday"
export function slugify(v: string): string {
  return fold(String(v || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}
// código sugerido pelo apelido: "manychat-comentarios" → "IG-MANYCHAT"; "stories" → "IG-STORIES"
export function suggestCode(slug: string): string {
  const parts = slugify(slug).toUpperCase().split('-').filter(Boolean);
  let body = '';
  for (const p of parts) { const next = body ? `${body}-${p}` : p; if (next.length > 17) break; body = next; }
  if (!body) body = (parts[0] || 'LINK').slice(0, 17);
  return `IG-${body}`;
}
// "ig-bio" / "[IG-BIO]" / "bio" → "IG-BIO" (ou null)
export function normalizeCode(v: string): string | null {
  let s = fold(String(v || '')).toUpperCase().trim().replace(/^\[|\]$/g, '').replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  s = s.replace(/^IG(-|$)/, '');
  if (!s) return null;
  s = `IG-${s}`;
  return CODE_RE.test(s) ? s : null;
}

// ── texto e links ──
// "Olá! Vim pelo Instagram 😊 [IG-BIO]" (o código sempre no fim, entre colchetes)
export function prefilledText(message: string, code: string): string {
  const m = String(message || '').trim() || DEFAULT_MESSAGE;
  return `${m} [${code}]`;
}
export const waUrl = (text: string, phone = STORE_WA) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
export const publicUrl = (slug: string) => `${SITE_URL}/l/${slug}`;

// Código [IG-...] dentro da 1ª mensagem do cliente (a MESMA regra da extensão: wa-bridge.js igCodeOf). O texto
// pode vir com outras coisas antes/depois; vale o primeiro código.
export const CODE_IN_TEXT_RE = /\[\s*(IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9])\s*\]/i;
export function codeInText(text: string | null | undefined): string | null {
  const m = CODE_IN_TEXT_RE.exec(String(text ?? ''));
  return m ? m[1].toUpperCase() : null;
}

// ── validação do formulário ──
export interface LinkDraft { slug: string; channel: IgChannel; code: string; message: string; media_id: string | null; media_permalink: string | null; media_caption: string | null; note: string | null; active: boolean }
export function validateDraft(d: LinkDraft, others: Pick<IgLink, 'id' | 'slug' | 'code'>[], selfId: string | null = null): string[] {
  const errs: string[] = [];
  const rest = others.filter((o) => o.id !== selfId);
  if (!SLUG_RE.test(d.slug)) errs.push('Apelido: de 2 a 40 letras minúsculas, números ou "-" (sem acento nem espaço).');
  else if (rest.some((o) => o.slug === d.slug)) errs.push(`Já existe um link com o apelido "${d.slug}".`);
  if (!CODE_RE.test(d.code)) errs.push('Código: "IG-" + de 2 a 20 letras maiúsculas, números ou "-" (ex.: IG-BIO).');
  else if (rest.some((o) => o.code === d.code)) errs.push(`Já existe um link com o código ${d.code}.`);
  if (!isChannel(d.channel)) errs.push('Escolha o canal.');
  if (!d.message.trim()) errs.push('Escreva a mensagem pré-preenchida.');
  else if (d.message.length > 500) errs.push('Mensagem: no máximo 500 caracteres.');
  if (d.channel === 'post' && !d.media_id) errs.push('Para "Reel/post específico", escolha o post.');
  return errs;
}

// ── resultados por link e por canal ──
// Conversas: as que começaram com o código do link no período (ig_link_leads). Vendas: as vendas do ERP ligadas à
// conversa (o mesmo Rastreamento da página WhatsApp) feitas depois do 1º contato. Taxas: conversas ÷ cliques e
// conversas com venda ÷ conversas.
export interface LinkConversation { linkId: string | null; code: string; firstAt: number; sales: number; revenue: number }
export interface LinkResult {
  key: string; label: string; channel: IgChannel | null; link: IgLink | null;
  clicks: number; conversations: number; buyers: number; sales: number; revenue: number;
  clickToConv: number | null; convToSale: number | null; revenuePerClick: number | null;
}
const money2 = (n: number) => Math.round(n * 100) / 100;
function finish(r: Omit<LinkResult, 'clickToConv' | 'convToSale' | 'revenuePerClick'>): LinkResult {
  return { ...r, revenue: money2(r.revenue), clickToConv: r.clicks ? r.conversations / r.clicks : null, convToSale: r.conversations ? r.buyers / r.conversations : null, revenuePerClick: r.clicks ? r.revenue / r.clicks : null };
}
export function linkResults(links: IgLink[], clicks: IgClick[], convs: LinkConversation[], w: { from: number; to: number }): { links: LinkResult[]; channels: LinkResult[]; total: LinkResult } {
  const inW = (t: number) => t >= w.from && t <= w.to;
  const byCode = new Map(links.map((l) => [l.code, l]));
  const byId = new Map(links.map((l) => [l.id, l]));
  const rows = new Map<string, Omit<LinkResult, 'clickToConv' | 'convToSale' | 'revenuePerClick'>>();
  const row = (l: IgLink) => {
    if (!rows.has(l.id)) rows.set(l.id, { key: l.id, label: l.slug, channel: l.channel, link: l, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0 });
    return rows.get(l.id)!;
  };
  links.forEach(row);
  clicks.forEach((c) => { const l = byId.get(c.link_id); const t = Date.parse(c.created_at); if (l && inW(t)) row(l).clicks++; });
  convs.forEach((c) => {
    if (!inW(c.firstAt)) return;
    const l = (c.linkId && byId.get(c.linkId)) || byCode.get(c.code);
    if (!l) return;
    const r = row(l);
    r.conversations++; r.sales += c.sales; r.revenue += c.revenue; if (c.sales > 0) r.buyers++;
  });
  const list = [...rows.values()].map(finish);
  const chMap = new Map<IgChannel, Omit<LinkResult, 'clickToConv' | 'convToSale' | 'revenuePerClick'>>();
  list.forEach((r) => {
    const ch = r.channel as IgChannel;
    const cur = chMap.get(ch) || { key: ch, label: CHANNEL_LABEL[ch], channel: ch, link: null, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0 };
    chMap.set(ch, { ...cur, clicks: cur.clicks + r.clicks, conversations: cur.conversations + r.conversations, buyers: cur.buyers + r.buyers, sales: cur.sales + r.sales, revenue: cur.revenue + r.revenue });
  });
  const channels = CHANNELS.map(([c]) => chMap.get(c)).filter((x): x is NonNullable<typeof x> => !!x).map(finish);
  const total = finish(list.reduce((a, r) => ({ ...a, clicks: a.clicks + r.clicks, conversations: a.conversations + r.conversations, buyers: a.buyers + r.buyers, sales: a.sales + r.sales, revenue: a.revenue + r.revenue }),
    { key: 'total', label: 'Total', channel: null, link: null, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0 }));
  return { links: list, channels, total };
}
// "Melhores links": mais faturamento; empate → mais conversas → mais cliques. Só links com alguma conversa.
export function bestLinks(list: LinkResult[], n = 3): LinkResult[] {
  return list.filter((r) => r.conversations > 0).sort((a, b) => b.revenue - a.revenue || b.conversations - a.conversations || b.clicks - a.clicks || a.label.localeCompare(b.label)).slice(0, n);
}

// Aparelho e navegador resumidos (o mesmo resumo da edge function ig-link), para mostrar nos cliques
export function summarizeUa(ua: string | null | undefined): { device: string; browser: string } {
  const s = String(ua || '');
  const device = /iPhone|iPad|iPod/i.test(s) ? 'iPhone/iPad' : /Android/i.test(s) ? 'Android' : /Windows|Macintosh|Linux|CrOS/i.test(s) ? 'Computador' : 'Outro';
  const browser = /Instagram/i.test(s) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(s) ? 'Facebook' : /WhatsApp/i.test(s) ? 'WhatsApp'
    : /Edg\//i.test(s) ? 'Edge' : /SamsungBrowser/i.test(s) ? 'Samsung' : /CriOS|Chrome\//i.test(s) ? 'Chrome' : /Firefox|FxiOS/i.test(s) ? 'Firefox' : /Safari/i.test(s) ? 'Safari' : 'Outro';
  return { device, browser };
}
