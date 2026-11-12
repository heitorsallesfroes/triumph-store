// Instagram FASE 3 — regras PURAS das automações (sem rede e sem banco). Usadas pelo webhook (ig-webhook), pela função
// do ERP (ig-manage) e pela tela do ERP (src/lib/igAuto.ts importa daqui). Testes: scripts/tests/igAuto.test.ts.

export const STORE_WA = '5521980921808';
export const SITE_URL = 'https://triumph-store.vercel.app';
export const CODE_RE = /^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$/;
export const IGSID_RE = /^[0-9]{5,30}$/;
export const DAY_MS = 24 * 3600 * 1000;
export const DM_WINDOW_MS = DAY_MS; // DM: só até 24 h depois da última mensagem da pessoa
export const PRIVATE_REPLY_MS = 7 * DAY_MS; // resposta privada a comentário: até 7 dias
export const DIRECT_CODE = 'IG-DIRECT'; // botão "Mandar o WhatsApp" do Direct

export type Trigger = 'comentario' | 'dm_nova' | 'story' | 'dm_palavra';
export const TRIGGERS: [Trigger, string][] = [
  ['comentario', 'Comentário em post ou reel'], ['dm_nova', 'DM nova (primeira mensagem)'], ['story', 'Resposta ou menção no story'], ['dm_palavra', 'Palavra-chave na DM'],
];
export interface Automation {
  id: string; name: string; active: boolean; trigger: Trigger;
  media_scope: 'todos' | 'escolhidos'; media_ids: string[];
  keyword_mode: 'qualquer' | 'palavras'; keywords: string[];
  public_replies: string[]; dm_texts: string[]; button_title: string;
  link_mode: 'frase' | 'link'; wa_phrase: string | null; link_id: string | null;
  code: string; position: number;
}
export interface IgSettings { enabled: boolean; testMode: boolean; testAccounts: TestAccount[]; cooldownHours: number; directDm: string; directPhrase: string }
export interface TestAccount { igsid?: string | null; username?: string | null }

// "Ação!" "ação" "acao" → "acao"
export const fold = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// configurações (system_config, texto). Sem a chave ou valor estranho: o mais seguro (desligado, modo teste).
export function parseSettings(rows: { key: string; value: string }[]): IgSettings {
  const m = new Map((rows || []).map((r) => [r.key, String(r.value ?? '')]));
  let testAccounts: TestAccount[] = [];
  try {
    const v = JSON.parse(m.get('ig_test_accounts') || '[]');
    if (Array.isArray(v)) testAccounts = v.filter((x) => x && typeof x === 'object').map((x) => ({ igsid: IGSID_RE.test(String(x.igsid || '')) ? String(x.igsid) : null, username: cleanUser(x.username) })).filter((x) => x.igsid || x.username);
  } catch { testAccounts = []; }
  const h = Number(m.get('ig_dm_cooldown_hours'));
  return {
    enabled: m.get('ig_automations_enabled') === 'true',
    testMode: m.get('ig_test_mode') !== 'false',
    testAccounts,
    cooldownHours: Number.isFinite(h) && h >= 1 && h <= 720 ? Math.round(h) : 24,
    directDm: (m.get('ig_direct_dm') || '').trim() || 'Olá, {nome}! Vou te deixar aqui abaixo o nosso WhatsApp 😊',
    directPhrase: (m.get('ig_direct_phrase') || '').trim() || 'Olá! Vim pelo Direct do Instagram 😊',
  };
}
// "@Store_Triumph " → "store_triumph"
export function cleanUser(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}
// no modo teste só as contas da lista recebem (pelo IGSID ou pelo @)
export function inTestList(s: IgSettings, igsid: string | null | undefined, username: string | null | undefined): boolean {
  const u = cleanUser(username);
  return s.testAccounts.some((t) => (t.igsid && igsid && t.igsid === igsid) || (t.username && u && t.username === u));
}

// ── palavras-chave: a palavra (ou frase) inteira dentro do texto, sem acento e sem maiúscula ──
export function keywordHit(text: string | null | undefined, keywords: string[]): boolean {
  const t = ` ${fold(text || '').replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return (keywords || []).map((k) => fold(k).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(Boolean).some((k) => t.includes(` ${k} `));
}

// ── qual automação vale para o evento (a primeira, pela ordem; só as ligadas) ──
export interface MatchEvent { kind: 'comentario' | 'dm' | 'story'; text: string | null; mediaId?: string | null; firstMessage?: boolean }
export function matches(a: Automation, ev: MatchEvent): boolean {
  if (!a || !a.active) return false;
  const words = a.keyword_mode === 'palavras' ? (a.keywords || []).filter((k) => fold(k)) : [];
  if (a.keyword_mode === 'palavras' && !words.length) return false;
  const wordsOk = a.keyword_mode !== 'palavras' || keywordHit(ev.text, words);
  if (ev.kind === 'comentario') {
    if (a.trigger !== 'comentario') return false;
    if (a.media_scope === 'escolhidos' && !(ev.mediaId && (a.media_ids || []).includes(ev.mediaId))) return false;
    return wordsOk;
  }
  if (ev.kind === 'story') return a.trigger === 'story' && wordsOk;
  if (a.trigger === 'dm_nova') return !!ev.firstMessage && wordsOk;
  if (a.trigger === 'dm_palavra') return words.length > 0 && keywordHit(ev.text, words);
  return false;
}
export function pickAutomation(list: Automation[], ev: MatchEvent): Automation | null {
  return [...(list || [])].sort((x, y) => (x.position - y.position) || String(x.id).localeCompare(String(y.id))).find((a) => matches(a, ev)) || null;
}

// ── textos ──
export const pick = <T,>(list: T[], rnd: () => number): T | null => (list && list.length ? list[Math.min(list.length - 1, Math.floor(rnd() * list.length))] : null);
// 1º nome: do nome (se for nome de verdade); senão vazio (o @ não vira nome)
export function firstName(name: string | null | undefined): string {
  const w = String(name ?? '').trim().split(/\s+/)[0] || '';
  if (!/^\p{L}[\p{L}'-]{1,39}$/u.test(w)) return '';
  return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
}
// {nome} → 1º nome; sem nome some junto com a vírgula/espaço ("Olá, {nome}!" → "Olá!")
export function fillName(text: string, name: string | null | undefined): string {
  const n = firstName(name);
  const s = String(text ?? '');
  if (n) return s.replace(/\{nome\}/gi, n);
  return s.replace(/,?\s*\{nome\}/gi, '').replace(/\s+([!?.,])/g, '$1').replace(/ {2,}/g, ' ').trim();
}
export const waUrl = (text: string, phone = STORE_WA) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
export const publicLinkUrl = (slug: string) => `${SITE_URL}/l/${slug}`;
// link do botão: a FRASE da automação no WhatsApp (o ERP liga a conversa pela frase) ou o link rastreável /l/...
export function linkOf(a: Pick<Automation, 'link_mode' | 'wa_phrase' | 'code'>, link: { slug: string; code: string } | null): { url: string; code: string } {
  if (a.link_mode === 'link' && link) return { url: publicLinkUrl(link.slug), code: link.code };
  return { url: waUrl((a.wa_phrase || '').trim() || 'Olá! Vim pelo Instagram 😊'), code: a.code };
}

// ── janelas da Meta ──
export const within = (at: number | null | undefined, now: number, ms: number) => Number.isFinite(at as number) && (at as number) <= now + 60000 && now - (at as number) <= ms;

// ── validação (tela do ERP) ──
export function validateAutomation(a: Partial<Automation>, others: Pick<Automation, 'id' | 'code'>[] = []): string[] {
  const e: string[] = [];
  if (!String(a.name || '').trim()) e.push('Dê um nome para a automação.');
  if (!TRIGGERS.some(([t]) => t === a.trigger)) e.push('Escolha o "Quando…".');
  if (a.trigger === 'comentario' && a.media_scope === 'escolhidos' && !(a.media_ids || []).length) e.push('Escolha pelo menos um post (ou "Qualquer post ou reel").');
  if ((a.keyword_mode === 'palavras' || a.trigger === 'dm_palavra') && !(a.keywords || []).some((k) => fold(k))) e.push('Escreva pelo menos uma palavra-chave.');
  if (a.trigger !== 'comentario' && (a.public_replies || []).some((x) => x.trim())) e.push('Resposta pública só existe para comentários.');
  if (!(a.dm_texts || []).some((x) => x.trim()) && !(a.public_replies || []).some((x) => x.trim())) e.push('Escreva a DM ou uma resposta pública.');
  if ((a.dm_texts || []).some((x) => x.length > 600)) e.push('DM: no máximo 600 caracteres em cada variação.');
  if ((a.public_replies || []).some((x) => x.length > 300)) e.push('Resposta pública: no máximo 300 caracteres em cada variação.');
  if (!String(a.button_title || '').trim() || String(a.button_title).length > 20) e.push('Texto do botão: de 1 a 20 caracteres.');
  if (a.link_mode === 'link' && !a.link_id) e.push('Escolha o link rastreável (ou use a frase).');
  if (a.link_mode !== 'link' && !String(a.wa_phrase || '').trim()) e.push('Escreva a frase que a pessoa manda no WhatsApp.');
  if (!CODE_RE.test(String(a.code || ''))) e.push('Código: "IG-" + de 2 a 20 letras maiúsculas, números ou "-".');
  else if (a.code === DIRECT_CODE || others.some((o) => o.id !== a.id && o.code === a.code)) e.push(`Já existe outra automação com o código ${a.code}.`);
  return e;
}
