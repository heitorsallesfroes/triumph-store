// Busca de produtos por pedaços de palavras (Nova Venda / UnifiedSearch). A extensão tem uma CÓPIA em
// extension/product-search.js (o 💰): o trecho entre "início da busca" e "fim da busca" é o mesmo código dos dois
// lados (aqui só tem os tipos a mais). O teste scripts/tests/productSearch.test.ts confere que são iguais e que dão
// o mesmo resultado. Mudou aqui, mude lá.

export interface SearchItem {
  label: string;
  sold?: number | null;
  createdAt?: string | null;
}

export interface SearchHit<T extends SearchItem> {
  item: T;
  notAtStart: number;
  ranges: [number, number][];
}

export interface HighlightPart {
  text: string;
  bold: boolean;
}

// ── início da busca ──
// "pul ros go 38" acha "Pulseira Aço Milanese Rose Gold 38/41mm": cada pedaço (separado por espaço) tem que
// aparecer em alguma parte do texto, em qualquer ordem. Sem maiúsculas e sem acentos (aço = aco); "/", "-" e "."
// não contam (38/41 acha com "38" ou "3841").
const IGNORED = '/-.';
const foldChar = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// texto comparável + de que letra do original veio cada letra dele (para pôr o negrito no lugar certo)
function foldWithMap(text: unknown): { text: string; map: number[] } {
  const src = String(text == null ? '' : text);
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (IGNORED.includes(c)) continue;
    const f = /\s/.test(c) ? ' ' : foldChar(c);
    for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
  }
  return { text: out, map };
}

function normalizeSearch(text: unknown): string {
  return foldWithMap(text).text;
}

function searchTokens(query: unknown): string[] {
  return normalizeSearch(query).split(' ').filter((t) => t.length > 0);
}

const isWordChar = (c: string) => /[a-z0-9]/.test(c);

// null se algum pedaço não aparece; senão quantos pedaços NÃO estão no começo de uma palavra (0 = melhor) e os
// trechos achados no texto original ([início, fim) — para o negrito)
function matchTokens(text: unknown, tokens: string[]): { notAtStart: number; ranges: [number, number][] } | null {
  if (!tokens.length) return null;
  const folded = foldWithMap(text);
  const hay = folded.text;
  let notAtStart = 0;
  const ranges: [number, number][] = [];
  for (const tok of tokens) {
    let first = -1;
    let atStart = -1;
    for (let at = hay.indexOf(tok); at >= 0; at = hay.indexOf(tok, at + 1)) {
      if (first < 0) first = at;
      if (at === 0 || !isWordChar(hay[at - 1])) { atStart = at; break; }
    }
    if (first < 0) return null;
    const pos = atStart >= 0 ? atStart : first;
    if (atStart < 0) notAtStart++;
    ranges.push([folded.map[pos], folded.map[pos + tok.length - 1] + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return { notAtStart, ranges: merged };
}

// itens: { label (o texto buscado e mostrado), sold? (quantos vendeu), createdAt? (ISO) }. Ordem: primeiro os que
// têm os pedaços no começo das palavras; empate pelo mais vendido, depois o mais recente (se houver esses dados),
// senão alfabético.
function searchItems<T extends SearchItem>(items: readonly T[], query: unknown, options?: { limit?: number }): SearchHit<T>[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const hits: SearchHit<T>[] = [];
  for (const item of items || []) {
    const m = matchTokens(item.label, tokens);
    if (m) hits.push({ item, notAtStart: m.notAtStart, ranges: m.ranges });
  }
  hits.sort((a, b) => {
    if (a.notAtStart !== b.notAtStart) return a.notAtStart - b.notAtStart;
    const sa = Number(a.item.sold) || 0;
    const sb = Number(b.item.sold) || 0;
    if (sa !== sb) return sb - sa;
    const ca = String(a.item.createdAt || '');
    const cb = String(b.item.createdAt || '');
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.item.label).localeCompare(String(b.item.label), 'pt-BR', { sensitivity: 'base', numeric: true });
  });
  const limit = options && options.limit ? options.limit : 0;
  return limit > 0 ? hits.slice(0, limit) : hits;
}

// o texto em pedaços, com bold nos trechos achados
function highlightParts(text: unknown, ranges: [number, number][]): HighlightPart[] {
  const src = String(text == null ? '' : text);
  const parts: HighlightPart[] = [];
  let at = 0;
  for (const r of ranges || []) {
    if (r[0] > at) parts.push({ text: src.slice(at, r[0]), bold: false });
    parts.push({ text: src.slice(r[0], r[1]), bold: true });
    at = r[1];
  }
  if (at < src.length) parts.push({ text: src.slice(at), bold: false });
  return parts;
}
// ── fim da busca ──

export { normalizeSearch, searchTokens, matchTokens, searchItems, highlightParts };
