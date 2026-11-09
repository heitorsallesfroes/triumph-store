// Aviso de versão nova do ERP: a cada 2 minutos (e quando a aba volta a ficar visível) busca o index.html publicado
// (sem cache) e compara os arquivos /assets/… que ele carrega com os que esta aba carregou. Mudou = versão nova.
// Nunca recarrega sozinho (pode estar no meio de uma venda): só mostra a faixa; quem decide é a pessoa.
// Em desenvolvimento (sem /assets/ na página) não confere nada.

export const VERSION_CHECK_MS = 2 * 60 * 1000;

// arquivos de /assets/ (js e css) que um index.html carrega, em ordem e sem repetir
export function assetsOf(html: string): string[] {
  const out: string[] = [];
  const re = /(?:src|href)\s*=\s*["']([^"']*\/assets\/[^"']+\.(?:js|css))["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html || '')))) {
    const path = m[1].replace(/^https?:\/\/[^/]+/, '').replace(/^\.?\//, '/');
    if (!out.includes(path)) out.push(path);
  }
  return out;
}
// versão nova = o index.html publicado aponta para arquivos que esta aba não carregou (ou deixou de apontar para os dela)
export function isNewVersion(loaded: string[], publishedHtml: string): boolean {
  const pub = assetsOf(publishedHtml);
  if (!loaded.length || !pub.length) return false; // sem como comparar (dev, erro de rede, página de erro)
  const a = [...new Set(loaded)].sort().join('|');
  const b = [...new Set(pub)].sort().join('|');
  return a !== b;
}

// arquivos de /assets/ que esta aba carregou (os <script>/<link> do documento)
export function loadedAssets(doc: Document = document): string[] {
  const html = [...doc.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]')]
    .map((e) => `${e.tagName === 'SCRIPT' ? 'src' : 'href'}="${e.getAttribute('src') || e.getAttribute('href')}"`).join(' ');
  return assetsOf(html);
}

// confere agora (true = versão nova). Erro de rede = false (tenta de novo depois).
export async function checkNewVersion(loaded: string[] = loadedAssets(), url = '/index.html'): Promise<boolean> {
  if (!loaded.length) return false;
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    return isNewVersion(loaded, await res.text());
  } catch { return false; }
}

// a cada 2 min e ao voltar para a aba; chama onNew uma vez quando achar versão nova. Devolve a função que desliga.
export function watchNewVersion(onNew: () => void, { every = VERSION_CHECK_MS, check = () => checkNewVersion() } = {}): () => void {
  let done = false;
  let busy = false;
  const run = async () => {
    if (done || busy) return;
    busy = true;
    try { if (await check()) { done = true; onNew(); } } finally { busy = false; }
  };
  const iv = setInterval(run, every);
  const onVis = () => { if (document.visibilityState === 'visible') run(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { done = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
}
