// Testes do F5 sem voltar ao Início (src/lib/erpRoute.ts), do botão "Atualizar" (src/lib/erpRefresh.ts) e do aviso de
// versão nova (src/lib/erpVersion.ts). Sem dependências: node scripts/tests/erpRoute.test.ts
import assert from 'node:assert/strict';

// navegador mínimo (window.location/history, localStorage, document) para as partes que mexem no endereço
const mem = new Map<string, string>();
let href = 'https://erp.exemplo.com/?utm=x#topo';
const pushes: string[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = { getItem: (k: string) => (mem.has(k) ? mem.get(k) : null), setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
g.window = {
  get location() { return { href, search: new URL(href).search }; },
  history: { state: null, pushState: (_s: unknown, _t: string, u: string) => { href = new URL(u, href).href; pushes.push(u); }, replaceState: (_s: unknown, _t: string, u: string) => { href = new URL(u, href).href; } },
};
const listeners: Record<string, (() => void)[]> = {};
g.document = { visibilityState: 'visible', addEventListener: (t: string, f: () => void) => { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener: () => {} };

const route = await import('../../src/lib/erpRoute.ts');
const refresh = await import('../../src/lib/erpRefresh.ts');
const version = await import('../../src/lib/erpVersion.ts');
const { parseErpLink } = await import('../../src/lib/erpLink.ts');

const tests: [string, () => unknown][] = [];
const test = (name: string, fn: () => unknown) => tests.push([name, fn]);

// ── página e sub-aba no endereço ──
test('endereço → página e sub-aba (?pagina=whatsapp&aba=rastreamento); página desconhecida = nada', () => {
  assert.deepEqual(route.parseRoute('?pagina=whatsapp&aba=rastreamento'), { page: 'whatsapp', tab: 'rastreamento' });
  assert.deepEqual(route.parseRoute('?pagina=ESTOQUE'), { page: 'stock', tab: null });
  assert.deepEqual(route.parseRoute('?pagina=relatorio-mensal&aba=<script>'), { page: 'resumo', tab: null });
  assert.equal(route.parseRoute('?pagina=nada'), null);
  assert.equal(route.parseRoute(''), null);
  // todas as páginas do menu têm um nome no endereço, sem repetir
  const slugs = Object.values(route.PAGE_SLUGS);
  assert.equal(new Set(slugs).size, slugs.length);
  Object.keys(route.PAGE_SLUGS).forEach((p) => assert.equal(route.parseRoute(`?pagina=${route.PAGE_SLUGS[p]}`)!.page, p));
});
test('página e sub-aba → endereço, mantendo os outros parâmetros e o #hash', () => {
  assert.equal(route.routeHref('https://x.com/?utm=1#a', { page: 'whatsapp', tab: 'resultados' }), '/?utm=1&pagina=whatsapp&aba=resultados#a');
  assert.equal(route.routeHref('https://x.com/?pagina=whatsapp&aba=painel', { page: 'sales', tab: null }), '/?pagina=nova-venda');
});
test('ao abrir: link da extensão > endereço > o que ficou guardado no navegador > Início', () => {
  const url = { page: 'whatsapp', tab: 'rastreamento' };
  const stored = { page: 'stock', tab: 'encomendas' };
  assert.deepEqual(route.initialRoute('history', url, stored), { page: 'history', tab: null });
  assert.deepEqual(route.initialRoute(null, url, stored), url);
  assert.deepEqual(route.initialRoute(null, null, stored), stored);
  assert.deepEqual(route.initialRoute(null, null, null), { page: 'home', tab: null });
  assert.deepEqual(route.parseStored('{"page":"marketing","tab":"facebook"}'), { page: 'marketing', tab: 'facebook' });
  assert.equal(route.parseStored('{"page":"xx"}'), null);
  assert.equal(route.parseStored('lixo'), null);
});
test('os links do "Abrir no ERP" continuam valendo (a página deles ganha do resto)', () => {
  assert.deepEqual(parseErpLink('?pagina=historico&venda=abc'), { page: 'history', saleId: 'abc' });
  assert.equal(parseErpLink('?pagina=whatsapp&aba=painel'), null); // rota comum: não é link da extensão
});
test('trocar de página entra no histórico (voltar/avançar); trocar de sub-aba substitui; tudo fica guardado', () => {
  route._resetRoute();
  route.writeRoute({ page: 'home', tab: null });
  route.writeRoute({ page: 'whatsapp', tab: null }, { push: true });
  route.writeTab('whatsapp', 'rastreamento');
  route.writeTab('stock', 'encomendas'); // outra página: ignora
  assert.equal(pushes.length, 1);
  assert.equal(new URL(href).search, '?utm=x&pagina=whatsapp&aba=rastreamento');
  assert.equal(new URL(href).hash, '#topo');
  assert.deepEqual(route.readStored(), { page: 'whatsapp', tab: 'rastreamento' });
  // a página abre na sub-aba do endereço (se for válida)
  assert.equal(route.initialTab('whatsapp', ['painel', 'rastreamento', 'resultados'], 'painel'), 'rastreamento');
  assert.equal(route.initialTab('whatsapp', ['painel', 'resultados'], 'painel'), 'painel');
  assert.equal(route.initialTab('stock', ['produtos', 'encomendas'], 'produtos'), 'produtos');
  route.writeRoute({ page: 'whatsapp', tab: 'rastreamento' }, { push: true }); // a mesma: não duplica no histórico
  assert.equal(pushes.length, 1);
});

// ── botão "Atualizar" ──
test('"Atualizar": chama a função de recarregar de cada parte da página aberta e espera todas (erro em uma não para as outras)', async () => {
  refresh._clear();
  const calls: string[] = [];
  refresh._register(async () => { await new Promise((r) => setTimeout(r, 20)); calls.push('painel'); });
  refresh._register(() => { calls.push('eventos'); });
  const off = refresh._register(() => { throw new Error('falhou'); });
  assert.equal(refresh.hasRefreshHandlers(), true);
  const r = await refresh.runRefresh();
  assert.deepEqual([r.ran, r.failed, calls.sort()], [3, 1, ['eventos', 'painel']]);
  off();
  refresh._clear();
  assert.equal(refresh.hasRefreshHandlers(), false); // sem nenhuma: o App remonta a página
});
test('"Atualizar" com algo digitado (Nova Venda, Configurações): pergunta antes', () => {
  refresh._clear();
  assert.equal(refresh.isPageDirty(), false);
  const k = refresh._setDirty(true);
  assert.equal(refresh.isPageDirty(), true);
  refresh._setDirty(false, k);
  assert.equal(refresh.isPageDirty(), false);
});
test('tecla R atualiza, menos digitando num campo ou com Ctrl/⌘/Alt (Ctrl+R continua sendo o do navegador)', () => {
  const k = (key: string, tagName = 'DIV', extra = {}) => refresh.isRefreshKey({ key, target: { tagName }, ...extra });
  assert.deepEqual([k('r'), k('R'), k('t')], [true, true, false]);
  assert.deepEqual([k('r', 'INPUT'), k('r', 'textarea'), k('r', 'SELECT'), refresh.isRefreshKey({ key: 'r', target: { tagName: 'DIV', isContentEditable: true } })], [false, false, false, false]);
  assert.deepEqual([k('r', 'DIV', { ctrlKey: true }), k('r', 'DIV', { metaKey: true }), k('r', 'DIV', { altKey: true })], [false, false, false]);
});

// ── aviso de versão nova ──
const HTML = (js: string, css = 'index-aa11.css') => `<!doctype html><html><head><script type="module" crossorigin src="/assets/${js}"></script><link rel="stylesheet" crossorigin href="/assets/${css}"></head><body><div id="root"></div></body></html>`;
test('versão nova = o index.html publicado aponta para outros arquivos /assets/', () => {
  assert.deepEqual(version.assetsOf(HTML('index-B1.js')), ['/assets/index-B1.js', '/assets/index-aa11.css']);
  const loaded = version.assetsOf(HTML('index-B1.js'));
  assert.equal(version.isNewVersion(loaded, HTML('index-B1.js')), false);
  assert.equal(version.isNewVersion(loaded, HTML('index-C2.js')), true);
  assert.equal(version.isNewVersion(loaded, HTML('index-B1.js', 'index-bb22.css')), true);
  assert.equal(version.isNewVersion(loaded, '<html>Erro 502</html>'), false); // página de erro: não avisa
  assert.equal(version.isNewVersion([], HTML('index-C2.js')), false); // desenvolvimento (sem /assets/): não confere
  assert.deepEqual(version.assetsOf('<script src="https://erp.x.com/assets/a.js"></script><script src="./assets/b.js"></script>'), ['/assets/a.js', '/assets/b.js']);
});
test('confere a cada 2 minutos e ao voltar para a aba; avisa uma vez só e nunca recarrega sozinho', async () => {
  assert.equal(version.VERSION_CHECK_MS, 120000);
  let answer = false;
  let checks = 0;
  let warned = 0;
  const stop = version.watchNewVersion(() => { warned++; }, { every: 10, check: async () => { checks++; return answer; } });
  await new Promise((r) => setTimeout(r, 35));
  assert.ok(checks >= 2 && warned === 0);
  answer = true;
  (listeners.visibilitychange || []).forEach((f) => f()); // voltou para a aba
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(warned, 1);
  const after = checks;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(checks, after); // achou: para de conferir
  stop();
});

let ok = 0;
for (const [name, fn] of tests) {
  try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
