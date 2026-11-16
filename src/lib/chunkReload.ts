// 🔄 Versão nova do ERP com a página aberta: os arquivos antigos de /assets/ somem do servidor e os botões que
// carregam código sob demanda (ex.: "Baixar DANFE" → danfe-xxxx.js, jspdf, jszip) dão "Failed to fetch dynamically
// imported module". Aqui: ao falhar um import dinâmico, recarrega a página UMA vez sozinho (o endereço guarda a
// página, a sub-aba e o modal aberto, ex.: ?pagina=historico&nfe=<venda>); se falhar de novo logo depois, ou se a
// tela tiver algo digitado, mostra a faixa "O sistema foi atualizado — clique para recarregar".
// Regras puras testadas em scripts/tests/chunkReload.test.ts.

export const RELOAD_KEY = 'erp:recarga-chunk';
export const JANELA_MS = 5 * 60 * 1000; // recarregou sozinho há menos que isso e falhou de novo = não recarrega outra vez
export const AVISO = 'O sistema foi atualizado — clique para recarregar';

// mensagens dos navegadores quando o arquivo do import dinâmico (ou do preload do Vite) não existe mais
const PADROES = [
  /failed to fetch dynamically imported module/i,          // Chrome / Edge
  /error loading dynamically imported module/i,            // Firefox
  /importing a module script failed/i,                     // Safari
  /unable to preload css/i,                                // Vite (CSS do pedaço)
  /failed to load module script/i,
  /loading (?:css )?chunk [\w-]+ failed/i,
];
export function ehErroDeChunk(e: unknown): boolean {
  if (!e) return false;
  const msg = typeof e === 'string' ? e : (e as { message?: unknown }).message;
  return PADROES.some((re) => re.test(String(msg ?? '')));
}

// pode recarregar sozinho? (nunca recarregou, ou faz tempo; sem como lembrar = não, para não entrar em laço)
export function podeRecarregar(ultima: number | null, agora: number, lembra = true): boolean {
  if (!lembra) return false;
  return ultima === null || !Number.isFinite(ultima) || agora - ultima > JANELA_MS || agora < ultima;
}
export type Decisao = 'recarregar' | 'avisar';
export const decidir = (o: { ultima: number | null; agora: number; lembra: boolean; digitando: boolean }): Decisao =>
  !o.digitando && podeRecarregar(o.ultima, o.agora, o.lembra) ? 'recarregar' : 'avisar';

// parâmetro no endereço (modal aberto): troca ou tira, mantendo o resto
export function comParam(href: string, chave: string, valor: string | null): string {
  const url = new URL(href);
  if (valor) url.searchParams.set(chave, valor); else url.searchParams.delete(chave);
  return url.pathname + url.search + url.hash;
}

// parâmetro do endereço atual (ex.: ?nfe=<venda> = modal da nota aberto)
export function lerParam(chave: string): string | null {
  try { return new URLSearchParams(window.location.search).get(chave); } catch { return null; }
}
export function marcarParam(chave: string, valor: string | null) {
  try {
    const href = comParam(window.location.href, chave, valor);
    if (href !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', href);
  } catch { /* sem history */ }
}

// ── no navegador ──────────────────────────────────────────────────────────
let digitando: () => boolean = () => false;
let instalado = false;

function lerUltima(): { ultima: number | null; lembra: boolean } {
  try {
    const v = sessionStorage.getItem(RELOAD_KEY);
    return { ultima: v === null ? null : Number(v), lembra: true };
  } catch { return { ultima: null, lembra: false }; }
}

export function mostrarAviso() {
  if (typeof document === 'undefined' || document.getElementById('erp-aviso-atualizado')) return;
  const b = document.createElement('button');
  b.id = 'erp-aviso-atualizado';
  b.type = 'button';
  b.setAttribute('role', 'alert');
  b.textContent = `🔄 ${AVISO}`;
  // cores fixas (contraste alto nos dois temas): branco sobre laranja escuro
  b.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);'
    + 'background:#c2410c;color:#fff;border:none;border-radius:12px;padding:12px 18px;font:600 14px/1.3 system-ui,sans-serif;'
    + 'box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer;text-align:center';
  b.onclick = () => { try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ok */ } window.location.reload(); };
  document.body.appendChild(b);
}

// trata o erro: true = era erro de arquivo antigo (recarregou ou mostrou o aviso)
export function tratarErroDeChunk(e: unknown): boolean {
  if (!ehErroDeChunk(e)) return false;
  const { ultima, lembra } = lerUltima();
  const d = decidir({ ultima, agora: Date.now(), lembra, digitando: digitando() });
  if (d === 'recarregar') {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* lerUltima já disse que dá */ }
    window.location.reload();
  } else {
    mostrarAviso();
  }
  return true;
}

// import dinâmico com recarga: falhou por versão nova → recarrega (ou avisa) e devolve um erro legível
export async function importar<T>(carregar: () => Promise<T>): Promise<T> {
  try {
    return await carregar();
  } catch (e) {
    if (tratarErroDeChunk(e)) throw new Error(AVISO);
    throw e;
  }
}

// uma vez, no main.tsx: pega também os imports que não passam por importar() (preload do Vite e promessas soltas)
export function instalarRecargaDeChunk(opts: { digitando?: () => boolean } = {}) {
  if (opts.digitando) digitando = opts.digitando;
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('vite:preloadError', (ev) => {
    const e = ev as Event & { payload?: unknown };
    if (tratarErroDeChunk(e.payload ?? 'Failed to fetch dynamically imported module')) ev.preventDefault();
  });
  window.addEventListener('unhandledrejection', (ev) => { if (tratarErroDeChunk(ev.reason)) ev.preventDefault(); });
  window.addEventListener('error', (ev) => { tratarErroDeChunk(ev.error ?? ev.message); });
}
