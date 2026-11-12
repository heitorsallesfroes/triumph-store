// Instagram FASE 2 — links rastreáveis (https://triumph-store.vercel.app/l/<apelido>). Regras puras (sem React nem
// Supabase), conferidas em scripts/tests/igLinks.test.ts:
//   apelido e código válidos, texto pré-preenchido, link do WhatsApp, código antigo achado na mensagem (a mesma regra
//   da extensão 2.18.0), a FRASE de cada link (2.18.3: única, reconhecida mesmo com pequenas edições — a MESMA regra
//   de extension/wa-bridge.js, conferida em scripts/tests/igPhrase.test.ts) e os resultados por link e por canal
//   (cliques → conversas → vendas → R$, e como cada conversa foi ligada: frase / horário / código).
// Tabelas: ig_links, ig_link_clicks, ig_link_leads (migrations 20261113120000_ig_links.sql e 20261117120000_ig_link_phrases.sql).

export const SITE_URL = 'https://triumph-store.vercel.app';
export const STORE_WA = '5521980921808';
// 2.18.3: sem emoji (no iPhone o 😊 chegou como "�") e sem código
export const DEFAULT_MESSAGE = 'Olá! Vi o Instagram de vocês e quero saber mais';

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
// 2.18.3: a mensagem pré-preenchida é SÓ a frase do link (o código [IG-...] não vai mais; o antigo ainda é aceito).
// Limpa o que quebra no celular: caractere inválido "�", metade de emoji solta, caracteres de controle.
export function cleanMessage(message: string | null | undefined): string {
  const s = String(message ?? '').normalize('NFC')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[�\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ').trim();
  return s || DEFAULT_MESSAGE;
}
export const prefilledText = (message: string) => cleanMessage(message);
export const waUrl = (text: string, phone = STORE_WA) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
export const publicUrl = (slug: string) => `${SITE_URL}/l/${slug}`;

// Código [IG-...] dentro da 1ª mensagem do cliente (a MESMA regra da extensão: wa-bridge.js igCodeOf). O texto
// pode vir com outras coisas antes/depois; vale o primeiro código.
export const CODE_IN_TEXT_RE = /\[\s*(IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9])\s*\]/i;
export function codeInText(text: string | null | undefined): string | null {
  const m = CODE_IN_TEXT_RE.exec(String(text ?? ''));
  return m ? m[1].toUpperCase() : null;
}

// ── 2.18.3: a FRASE do link (a MESMA regra de extension/wa-bridge.js, bloco "igMatch") ──
// Comparação sem acento, maiúscula, pontuação, emoji nem espaço a mais: "Olá! Vi o story 😊" = "ola vi o story".
// A 1ª mensagem do cliente liga à frase que aparece nela com no máximo ~15% de letras trocadas/faltando/sobrando
// (mín. 2), aceitando texto a mais antes/depois. Duas frases empatadas → não liga nenhuma.
export const PHRASE_MIN = 10; // letras da frase já normalizada
export const normPhrase = (s: string | null | undefined): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const phraseTolerance = (len: number): number => Math.max(2, Math.floor(len * 0.15));
// menor nº de edições para a frase p aparecer dentro de t (texto a mais antes/depois não conta)
export function phraseDistance(p: string, t: string): number {
  const m = p.length; const n = t.length;
  if (!m) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (p.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1));
    prev = cur;
  }
  let best = m;
  for (let j = 0; j <= n; j++) if (prev[j] < best) best = prev[j];
  return best;
}
// índice da frase reconhecida na mensagem, ou -1 (nenhuma ou empate)
export function matchPhrase(text: string | null | undefined, phrases: (string | null | undefined)[]): number {
  const t = normPhrase(text).slice(0, 600);
  if (t.length < PHRASE_MIN) return -1;
  let best = -1; let bestD = Infinity; let tie = false;
  phrases.forEach((raw, i) => {
    const p = normPhrase(raw);
    if (p.length < PHRASE_MIN) return;
    const d = t.includes(p) ? 0 : phraseDistance(p, t);
    if (d > phraseTolerance(p.length)) return;
    if (d < bestD) { best = i; bestD = d; tie = false; } else if (d === bestD && normPhrase(phrases[best]) !== p) tie = true;
  });
  return tie ? -1 : best;
}
// duas frases parecidas demais: a mensagem de uma (igual ou com 1–2 letras trocadas) seria reconhecida como a outra
export const SIMILAR_MARGIN = 2;
export function phrasesTooSimilar(a: string, b: string): boolean {
  const x = normPhrase(a); const y = normPhrase(b);
  if (!x || !y) return false;
  return phraseDistance(x, y) <= phraseTolerance(x.length) + SIMILAR_MARGIN || phraseDistance(y, x) <= phraseTolerance(y.length) + SIMILAR_MARGIN;
}
export const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(String(s || ''));

// ── validação do formulário ──
export interface LinkDraft { slug: string; channel: IgChannel; code: string; message: string; media_id: string | null; media_permalink: string | null; media_caption: string | null; note: string | null; active: boolean }
export function validateDraft(d: LinkDraft, others: (Pick<IgLink, 'id' | 'slug' | 'code'> & Partial<Pick<IgLink, 'message' | 'active'>>)[], selfId: string | null = null): string[] {
  const errs: string[] = [];
  const rest = others.filter((o) => o.id !== selfId);
  if (!SLUG_RE.test(d.slug)) errs.push('Apelido: de 2 a 40 letras minúsculas, números ou "-" (sem acento nem espaço).');
  else if (rest.some((o) => o.slug === d.slug)) errs.push(`Já existe um link com o apelido "${d.slug}".`);
  if (!CODE_RE.test(d.code)) errs.push('Código: "IG-" + de 2 a 20 letras maiúsculas, números ou "-" (ex.: IG-BIO).');
  else if (rest.some((o) => o.code === d.code)) errs.push(`Já existe um link com o código ${d.code}.`);
  if (!isChannel(d.channel)) errs.push('Escolha o canal.');
  if (!d.message.trim()) errs.push('Escreva a frase (a mensagem pré-preenchida).');
  else if (d.message.length > 500) errs.push('Frase: no máximo 500 caracteres.');
  else if (normPhrase(d.message).length < PHRASE_MIN) errs.push(`Frase: escreva pelo menos ${PHRASE_MIN} letras (sem contar pontuação e emoji).`);
  else if (d.active) {
    const clash = rest.find((o) => o.active !== false && o.message && phrasesTooSimilar(d.message, o.message));
    if (clash) errs.push(`A frase está igual ou parecida demais com a do link "${clash.slug}". Cada link ativo precisa de uma frase própria.`);
  }
  if (d.channel === 'post' && !d.media_id) errs.push('Para "Reel/post específico", escolha o post.');
  return errs;
}

// ── resultados por link e por canal ──
// Conversas: as que começaram com o código do link no período (ig_link_leads). Vendas: as vendas do ERP ligadas à
// conversa (o mesmo Rastreamento da página WhatsApp) feitas depois do 1º contato. Taxas: conversas ÷ cliques e
// conversas com venda ÷ conversas.
// match (2.18.3): como a conversa foi ligada ao link — 'frase', 'horario' (1ª mensagem até 10 min depois do único clique
// sem conversa) ou 'codigo' ([IG-...] antigo; linhas antigas sem o campo contam como código)
export type LinkMatch = 'frase' | 'horario' | 'codigo';
export const MATCH_LABEL: Record<LinkMatch, string> = { frase: 'frase', horario: 'horário', codigo: 'código' };
export const matchOf = (v: unknown): LinkMatch => (v === 'frase' || v === 'horario' ? v : 'codigo');
export interface LinkConversation { linkId: string | null; code: string; firstAt: number; sales: number; revenue: number; match?: LinkMatch }
export interface LinkResult {
  key: string; label: string; channel: IgChannel | null; link: IgLink | null;
  clicks: number; conversations: number; buyers: number; sales: number; revenue: number; byMatch: Record<LinkMatch, number>;
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
    if (!rows.has(l.id)) rows.set(l.id, { key: l.id, label: l.slug, channel: l.channel, link: l, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0, byMatch: { frase: 0, horario: 0, codigo: 0 } });
    return rows.get(l.id)!;
  };
  links.forEach(row);
  clicks.forEach((c) => { const l = byId.get(c.link_id); const t = Date.parse(c.created_at); if (l && inW(t)) row(l).clicks++; });
  convs.forEach((c) => {
    if (!inW(c.firstAt)) return;
    const l = (c.linkId && byId.get(c.linkId)) || byCode.get(c.code);
    if (!l) return;
    const r = row(l);
    r.conversations++; r.byMatch = { ...r.byMatch, [matchOf(c.match)]: r.byMatch[matchOf(c.match)] + 1 }; r.sales += c.sales; r.revenue += c.revenue; if (c.sales > 0) r.buyers++;
  });
  const list = [...rows.values()].map(finish);
  const chMap = new Map<IgChannel, Omit<LinkResult, 'clickToConv' | 'convToSale' | 'revenuePerClick'>>();
  list.forEach((r) => {
    const ch = r.channel as IgChannel;
    const cur = chMap.get(ch) || { key: ch, label: CHANNEL_LABEL[ch], channel: ch, link: null, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0, byMatch: { frase: 0, horario: 0, codigo: 0 } };
    chMap.set(ch, { ...cur, byMatch: { frase: cur.byMatch.frase + r.byMatch.frase, horario: cur.byMatch.horario + r.byMatch.horario, codigo: cur.byMatch.codigo + r.byMatch.codigo }, clicks: cur.clicks + r.clicks, conversations: cur.conversations + r.conversations, buyers: cur.buyers + r.buyers, sales: cur.sales + r.sales, revenue: cur.revenue + r.revenue });
  });
  const channels = CHANNELS.map(([c]) => chMap.get(c)).filter((x): x is NonNullable<typeof x> => !!x).map(finish);
  const total = finish(list.reduce((a, r) => ({ ...a, byMatch: { frase: a.byMatch.frase + r.byMatch.frase, horario: a.byMatch.horario + r.byMatch.horario, codigo: a.byMatch.codigo + r.byMatch.codigo }, clicks: a.clicks + r.clicks, conversations: a.conversations + r.conversations, buyers: a.buyers + r.buyers, sales: a.sales + r.sales, revenue: a.revenue + r.revenue }),
    { key: 'total', label: 'Total', channel: null, link: null, clicks: 0, conversations: 0, buyers: 0, sales: 0, revenue: 0, byMatch: { frase: 0, horario: 0, codigo: 0 } }));
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
