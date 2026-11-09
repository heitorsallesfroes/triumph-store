// Busca de produtos por pedaços de palavras (2.12.7). CÓPIA de src/lib/productSearch.ts (ERP, tela "Nova Venda"):
// o trecho entre "início da busca" e "fim da busca" é o mesmo código dos dois lados (o ERP só tem os tipos a mais).
// O teste scripts/tests/productSearch.test.ts confere que são iguais e que dão o mesmo resultado. Mudou lá, mude aqui.
// Usado pelo 💰 (content script). Sem rede, sem DOM.
(function (root) {
  // ── início da busca ──
  // "pul ros go 38" acha "Pulseira Aço Milanese Rose Gold 38/41mm": cada pedaço (separado por espaço) tem que
  // aparecer em alguma parte do texto, em qualquer ordem. Sem maiúsculas e sem acentos (aço = aco); "/", "-" e "."
  // não contam (38/41 acha com "38" ou "3841").
  const IGNORED = '/-.';
  const foldChar = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // texto comparável + de que letra do original veio cada letra dele (para pôr o negrito no lugar certo)
  function foldWithMap(text) {
    const src = String(text == null ? '' : text);
    let out = '';
    const map = [];
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (IGNORED.includes(c)) continue;
      const f = /\s/.test(c) ? ' ' : foldChar(c);
      for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
    }
    return { text: out, map };
  }

  function normalizeSearch(text) {
    return foldWithMap(text).text;
  }

  function searchTokens(query) {
    return normalizeSearch(query).split(' ').filter((t) => t.length > 0);
  }

  const isWordChar = (c) => /[a-z0-9]/.test(c);

  // null se algum pedaço não aparece; senão quantos pedaços NÃO estão no começo de uma palavra (0 = melhor) e os
  // trechos achados no texto original ([início, fim) — para o negrito)
  function matchTokens(text, tokens) {
    if (!tokens.length) return null;
    const folded = foldWithMap(text);
    const hay = folded.text;
    let notAtStart = 0;
    const ranges = [];
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
    const merged = [];
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
  function searchItems(items, query, options) {
    const tokens = searchTokens(query);
    if (!tokens.length) return [];
    const hits = [];
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
  function highlightParts(text, ranges) {
    const src = String(text == null ? '' : text);
    const parts = [];
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

  root.TspSearch = { normalizeSearch, searchTokens, matchTokens, searchItems, highlightParts };
})(typeof globalThis !== 'undefined' ? globalThis : this);
