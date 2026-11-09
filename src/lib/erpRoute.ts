// Página e sub-aba do ERP no endereço (?pagina=whatsapp&aba=rastreamento) e no navegador (localStorage), para o F5
// voltar para a mesma tela (depois do login) e os botões voltar/avançar do navegador navegarem entre as páginas.
// Os outros parâmetros e o #hash ficam (inclusive os do "Abrir no ERP" da extensão, lidos antes em erpLink.ts).
// Trocar de página = nova entrada no histórico (pushState); trocar de sub-aba = substitui a atual (replaceState).
// Regras puras testadas em scripts/tests/erpRoute.test.ts.

// id interno da página (App.tsx) ↔ nome no endereço
export const PAGE_SLUGS: Record<string, string> = {
  home: 'inicio', sales: 'nova-venda', 'small-sales': 'pequenas-vendas', history: 'historico', logistics: 'logistica',
  'rastreamento-sedex': 'correios', products: 'produtos', stock: 'estoque', motoboys: 'motoboys', marketing: 'marketing',
  'ad-manager': 'anuncios', costs: 'custos', whatsapp: 'whatsapp', 'resumo-vendas': 'resumo-vendas', resumo: 'relatorio-mensal',
  'resumo-anual': 'resumo-anual', settings: 'configuracoes',
};
const PAGE_OF_SLUG: Record<string, string> = Object.fromEntries(Object.entries(PAGE_SLUGS).map(([id, slug]) => [slug, id]));
export const STORAGE_KEY = 'erp:rota';
const TAB_RE = /^[a-z0-9-]{1,30}$/;

export interface ErpRoute { page: string; tab: string | null }

export const pageOfSlug = (slug: string | null | undefined): string | null => {
  const s = String(slug || '').trim().toLowerCase();
  return PAGE_OF_SLUG[s] || (PAGE_SLUGS[s] ? s : null);
};

// rota do endereço (null se não tiver uma página conhecida)
export function parseRoute(search: string): ErpRoute | null {
  const q = new URLSearchParams(search);
  const page = pageOfSlug(q.get('pagina'));
  if (!page) return null;
  const tab = (q.get('aba') || '').trim().toLowerCase();
  return { page, tab: TAB_RE.test(tab) ? tab : null };
}

// endereço com a rota (os outros parâmetros e o #hash ficam); Início sem sub-aba = sem parâmetros de rota
export function routeHref(href: string, r: ErpRoute): string {
  const url = new URL(href);
  url.searchParams.set('pagina', PAGE_SLUGS[r.page] || PAGE_SLUGS.home);
  if (r.tab && TAB_RE.test(r.tab)) url.searchParams.set('aba', r.tab); else url.searchParams.delete('aba');
  return url.pathname + url.search + url.hash;
}

// rota guardada no navegador (ou null)
export function parseStored(raw: string | null): ErpRoute | null {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o.page !== 'string' || !PAGE_SLUGS[o.page]) return null;
    return { page: o.page, tab: typeof o.tab === 'string' && TAB_RE.test(o.tab) ? o.tab : null };
  } catch { return null; }
}

// Ao abrir: o link da extensão ("Abrir no ERP") vale primeiro; depois o endereço; depois o navegador; senão Início
export function initialRoute(linkPage: string | null, fromUrl: ErpRoute | null, stored: ErpRoute | null): ErpRoute {
  if (linkPage) return { page: linkPage, tab: null };
  return fromUrl || stored || { page: 'home', tab: null };
}

// ── no navegador ──────────────────────────────────────────────────────────
let current: ErpRoute = { page: 'home', tab: null };
const store = (r: ErpRoute) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch { /* sem armazenamento */ } };
export const currentRoute = (): ErpRoute => current;
export function readStored(): ErpRoute | null {
  try { return parseStored(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
// grava a rota: push = nova entrada no histórico (trocou de página)
export function writeRoute(r: ErpRoute, { push = false } = {}) {
  const same = current.page === r.page && current.tab === r.tab;
  current = { page: r.page, tab: r.tab };
  store(current);
  try {
    const href = routeHref(window.location.href, current);
    if (push && !same) window.history.pushState({ erp: current }, '', href);
    else window.history.replaceState({ ...(window.history.state || {}), erp: current }, '', href);
  } catch { /* sem history */ }
}
// sub-aba da página atual (substitui a entrada do histórico)
export function writeTab(page: string, tab: string | null) {
  if (current.page !== page) return;
  writeRoute({ page, tab });
}
// sub-aba inicial de uma página: a do endereço, se for desta página e válida
export function initialTab<T extends string>(page: string, valid: readonly T[], def: T): T {
  return current.page === page && current.tab && (valid as readonly string[]).includes(current.tab) ? (current.tab as T) : def;
}
// (testes) começa de novo
export function _resetRoute(r: ErpRoute = { page: 'home', tab: null }) { current = r; }
