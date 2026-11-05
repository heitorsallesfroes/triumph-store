// Endereços que abrem o ERP numa tela específica (usados pela extensão do WhatsApp):
//   ?pagina=historico&venda=<id>                → Histórico de Vendas com essa venda aberta e realçada
//   ?pagina=nova-venda&nome=...&telefone=...    → Nova Venda com cliente e telefone preenchidos
// Lido uma vez só, depois do login (o App só monta dentro do AuthGate), e os parâmetros saem do
// endereço (history.replaceState) para o F5 não repetir. Sem esses parâmetros, nada muda.

export interface ErpLink {
  page: 'history' | 'sales';
  saleId?: string;
  prefill?: { name: string; phone: string };
}

const LINK_PARAMS = ['pagina', 'venda', 'nome', 'telefone'];
const PAGES: Record<string, ErpLink['page']> = { historico: 'history', 'nova-venda': 'sales' };

const clean = (v: string | null, max: number) => (v || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseErpLink(search: string): ErpLink | null {
  const q = new URLSearchParams(search);
  const page = PAGES[(q.get('pagina') || '').trim().toLowerCase()];
  if (!page) return null;
  if (page === 'history') {
    const saleId = clean(q.get('venda'), 64);
    return saleId ? { page, saleId } : { page };
  }
  return { page, prefill: { name: clean(q.get('nome'), 120), phone: clean(q.get('telefone'), 30) } };
}

// Endereço sem os parâmetros do link (os outros parâmetros e o #hash ficam)
export function stripErpLink(href: string): string {
  const url = new URL(href);
  LINK_PARAMS.forEach((p) => url.searchParams.delete(p));
  return url.pathname + url.search + url.hash;
}

let taken: ErpLink | null | undefined;

// Lê o link do endereço atual uma vez só (o StrictMode chama os inicializadores duas vezes)
export function takeErpLink(): ErpLink | null {
  if (taken !== undefined) return taken;
  taken = null;
  try {
    const q = new URLSearchParams(window.location.search);
    if (!LINK_PARAMS.some((p) => q.has(p))) return taken;
    taken = parseErpLink(window.location.search);
    window.history.replaceState(window.history.state, '', stripErpLink(window.location.href));
  } catch {
    taken = null;
  }
  return taken;
}
