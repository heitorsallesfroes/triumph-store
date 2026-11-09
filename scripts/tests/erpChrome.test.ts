// ERP inteiro no Chrome REAL (F5 sem voltar ao Início, botão "Atualizar", aviso de versão nova), sem npm install e
// sem o build do app: node scripts/tests/erpChrome.test.ts
// Empacota o App com o esbuild que já vem com o Vite (src/lib/supabase.ts trocado pelo Supabase falso,
// scripts/tests/chrome/fakeSupabase.ts) e serve em http://erp.test/ pelo próprio Chrome (Fetch.requestPaused; nenhuma
// rede de verdade). O arquivo do app se chama /assets/index-v1.js, como no build da Vercel; o teste troca o
// index.html servido para /assets/index-v2.js para ver o aviso de versão nova.
// Confere: página e sub-aba no endereço e de volta depois do F5; voltar/avançar do navegador; "Atualizar" (e a tecla R)
// recarrega sem perder período/origem e mostra "Atualizado às"; pergunta antes com algo digitado (Nova Venda); a faixa
// "Nova versão do sistema disponível" aparece sem recarregar sozinho e o "Atualizar" dela volta para a mesma página.
// Opções: CHROME_PATH=..., HEADFUL=1
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BASE = 'http://erp.test';

function findChrome(): string | null {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];
  return c.find((p) => fs.existsSync(p)) || null;
}
function cdp(child: ChildProcess) {
  let seq = 0;
  let buf = '';
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners: ((m: any) => void)[] = [];
  (child.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let msg: any;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim())); else p.resolve(msg.result);
      } else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    (child.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn: (m: any) => void) => listeners.push(fn) };
}

// dados: algumas conversas do WhatsApp (para o Rastreamento ter o que mostrar e recarregar)
function db(now: number) {
  const MIN = 60000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const spDay = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
  const activity = Array.from({ length: 30 }, (_, i) => {
    const last = now - (i + 1) * 20 * MIN;
    return { chat_id: `55119000001${String(i).padStart(2, '0')}@c.us`, phone: `55119000001${String(i).padStart(2, '0')}`, name: `Pessoa ${i + 1}`, first_seen_at: iso(now - 40 * 86400000),
      first_message_at: iso(now - 40 * 86400000), last_message_at: iso(last), last_from: 'cliente', last_customer_at: iso(last), is_new_lead: false };
  });
  const days = activity.map((a) => ({ chat_id: a.chat_id, day: spDay(Date.parse(a.last_message_at)), from_customer: true, from_store: false }));
  return { wa_chat_activity: activity, wa_chat_activity_days: days, wa_leads: [], sales: [], wa_send_log: [], wa_replies: [], wa_conversion_events: [], wa_ad_attribution: [], wa_chat_names: [], wa_items: [], wa_automations: [] };
}
const indexHtml = (asset: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Triumph ERP</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f5f5f5;--bg-hover:#eee;--border-main:#ddd;--bg-base:#fafafa;--bg-sidebar:#fff;--bg-topbar:#fff;--text-nav:#333;--text-nav-hover:#000}body{margin:0;font-family:Segoe UI,Arial,sans-serif}</style>
<script type="module" crossorigin src="/assets/${asset}"></script></head><body><div id="root"></div></body></html>`;

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'harnessApp.tsx')], bundle: true, write: false, format: 'esm', outfile: 'app.js',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx', '.json': 'json' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake', setup(b: any) {
      b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: path.join(HERE, 'chrome', 'fakeSupabase.ts') }));
      b.onResolve({ filter: /\?raw$/ }, (a: any) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
      b.onLoad({ filter: /.*/, namespace: 'raw' }, (a: any) => ({ contents: `export default ${JSON.stringify(fs.readFileSync(a.path, 'utf8'))};`, loader: 'js' }));
      b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
    } }],
  });
  const appJs = `window.__DB = ${JSON.stringify(db(Date.now()))}; window.__TSP_VERSION_MS = 1500;\n${out.outputFiles[0].text}`;
  let served = indexHtml('index-v1.js'); // o "index.html publicado"
  const served404: string[] = [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-erp-app-'));
  const child = spawn(chrome, [
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1366,900', '--lang=pt-BR',
    ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  const done = () => { try { child.kill(); } catch { /* já saiu */ } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* preso */ } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 180000);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const page = targetInfos.find((t: any) => t.type === 'page');
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    let indexFetches = 0;
    c.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      if (m.method === 'Fetch.requestPaused') {
        const u = new URL(m.params.request.url);
        let body: string | null = null;
        let type = 'text/html; charset=utf-8';
        if (u.pathname === '/' || u.pathname === '/index.html') { body = served; if (u.pathname === '/index.html') indexFetches++; }
        else if (u.pathname === '/assets/index-v1.js') { body = appJs; type = 'text/javascript; charset=utf-8'; }
        if (body == null) served404.push(u.pathname);
        s('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: body == null ? 404 : 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }],
          body: Buffer.from(body == null ? 'não existe' : body, 'utf8').toString('base64') }).catch(() => {});
      }
    });
    await s('Fetch.enable', { patterns: [{ urlPattern: `${BASE}/*` }] });
    await s('Runtime.enable');
    await s('Page.enable');
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
    const H = `const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : '');
      const btn = (t, root = document) => [...root.querySelectorAll('button')].find((b) => txt(b) === t);
      const nav = (t) => [...document.querySelectorAll('aside nav button')].find((b) => txt(b) === t);
      const active = () => { const b = [...document.querySelectorAll('aside nav button')].find((x) => x.style.borderLeft.includes('solid') && !x.style.borderLeft.includes('transparent')); return b ? txt(b) : null; };
      const q = () => new URLSearchParams(location.search);
      const pressed = (root, t) => { const b = btn(t, root); return b ? b.getAttribute('aria-pressed') : null; };
      const actQ = () => (window.__QUERIES || []).filter((x) => x.table === 'wa_chat_activity').length;`;
    const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { check(name, false, String((e as Error).message || e).split('\n')[0]); } };

    await s('Page.navigate', { url: `${BASE}/?utm_source=teste` });
    const booted = await waitFor(`${H} return !!nav('WhatsApp');`, 20000);
    const b0 = await ev(`${H} return { page: q().get('pagina'), utm: q().get('utm_source'), active: active() };`);
    check('abre no Início e o endereço ganha ?pagina=inicio (os outros parâmetros ficam)', booted && b0.page === 'inicio' && b0.utm === 'teste' && b0.active === 'Início', JSON.stringify(b0));

    await step('página e sub-aba no endereço; F5 volta para elas', async () => {
      await ev(`${H} nav('WhatsApp').click(); return true;`);
      await waitFor(`${H} return !!btn('Rastreamento');`, 10000);
      await ev(`${H} btn('Rastreamento').click(); return true;`);
      const tabOk = await waitFor(`${H} return q().get('pagina') === 'whatsapp' && q().get('aba') === 'rastreamento' && !!document.querySelector('[data-testid="wa-tracking"]');`, 10000);
      const len1 = await ev('return history.length;');
      await s('Page.reload', { ignoreCache: true });
      const back = await waitFor(`${H} return !!document.querySelector('[data-testid="wa-tracking"]') && active() === 'WhatsApp';`, 20000);
      const after = await ev(`${H} return { page: q().get('pagina'), aba: q().get('aba'), utm: q().get('utm_source'), active: active(), stored: localStorage.getItem('erp:rota') };`);
      check('F5 volta para a mesma página e sub-aba (WhatsApp → Rastreamento), não para o Início; fica guardado no navegador',
        tabOk && back && after.page === 'whatsapp' && after.aba === 'rastreamento' && after.utm === 'teste' && JSON.parse(after.stored || '{}').tab === 'rastreamento' && len1 >= 2, JSON.stringify({ tabOk, back, after, len1 }));
    });

    await step('voltar e avançar do navegador', async () => {
      await ev('history.back(); return true;');
      const home = await waitFor(`${H} return active() === 'Início' && q().get('pagina') === 'inicio';`, 8000);
      await ev('history.forward(); return true;');
      const wa = await waitFor(`${H} return active() === 'WhatsApp' && q().get('aba') === 'rastreamento' && !!document.querySelector('[data-testid="wa-tracking"]');`, 8000);
      check('voltar do navegador vai para o Início; avançar volta para WhatsApp → Rastreamento', home && wa, JSON.stringify({ home, wa }));
    });

    await step('"Atualizar" mantém período e origem', async () => {
      await waitFor(`${H} return !!document.querySelector('[data-testid="track-table"]');`, 10000);
      const f = `document.querySelector('[data-testid="track-filters"]')`;
      await ev(`${H} btn('30 dias', ${f}).click(); return true;`);
      await sleep(300);
      await ev(`${H} btn('Meta Ads', ${f}).click(); return true;`);
      await sleep(500);
      const before = await ev(`${H} return { n: actQ(), at: !!document.querySelector('[data-testid="erp-refreshed-at"]') };`);
      await ev(`${H} document.querySelector('[data-testid="erp-refresh"]').click(); return true;`);
      const spun = await waitFor(`${H} return txt(document.querySelector('[data-testid="erp-refresh"]')) === 'Atualizando…' || !!document.querySelector('[data-testid="erp-refreshed-at"]');`, 3000);
      const doneOk = await waitFor(`${H} return /^Atualizado às \\d{2}:\\d{2}$/.test(txt(document.querySelector('[data-testid="erp-refreshed-at"]')));`, 8000);
      const after = await ev(`${H} return { n: actQ(), p30: pressed(${f}, '30 dias'), meta: pressed(${f}, 'Meta Ads'), aba: q().get('aba'), skeleton: !document.querySelector('[data-testid="track-table"]') && !txt(document.body).includes('Nenhuma conversa') };`);
      check('"Atualizar" (↻): recarrega os dados da página (novas consultas) sem recarregar o site; período (30 dias), origem (Meta Ads) e sub-aba continuam; "Atualizado às HH:MM"',
        spun && doneOk && !before.at && after.n > before.n && after.p30 === 'true' && after.meta === 'true' && after.aba === 'rastreamento', JSON.stringify({ before, after }));
      const n1 = after.n;
      await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); return true;`);
      const keyOk = await waitFor(`${H} return actQ() > ${n1};`, 5000);
      const n2 = await ev(`${H} return actQ();`);
      await ev(`${H} const i = document.querySelector('[aria-label="Buscar conversa por telefone ou nome"]'); i.focus(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); return true;`);
      await sleep(600);
      const n3 = await ev(`${H} return actQ();`);
      check('tecla R atualiza; digitando num campo, não', keyOk && n3 === n2, JSON.stringify({ n1, n2, n3 }));
    });

    await step('Nova Venda com algo digitado: pergunta antes', async () => {
      await ev(`${H} nav('Nova Venda').click(); return true;`);
      await waitFor(`${H} return !!document.querySelector('input[placeholder="Nome do Cliente"]');`, 10000);
      const clean = await ev(`${H} document.querySelector('[data-testid="erp-refresh"]').click(); await new Promise((r) => setTimeout(r, 400)); return !document.querySelector('[data-testid="erp-refresh-confirm"]');`);
      await ev(`${H} const i = document.querySelector('input[placeholder="Nome do Cliente"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Maria Teste'); i.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
      await sleep(300);
      await ev(`${H} document.querySelector('[data-testid="erp-refresh"]').click(); return true;`);
      const asked = await waitFor(`${H} return !!document.querySelector('[data-testid="erp-refresh-confirm"]');`, 3000);
      await ev(`${H} btn('Atualizar mesmo assim').click(); return true;`);
      const kept = await waitFor(`${H} return !document.querySelector('[data-testid="erp-refresh-confirm"]') && document.querySelector('input[placeholder="Nome do Cliente"]').value === 'Maria Teste' && !!document.querySelector('[data-testid="erp-refreshed-at"]');`, 8000);
      check('Nova Venda: sem nada digitado atualiza direto; com o nome do cliente digitado pergunta antes; "Atualizar mesmo assim" recarrega as listas e o que foi digitado continua',
        clean && asked && kept, JSON.stringify({ clean, asked, kept }));
    });

    await step('aviso de versão nova', async () => {
      await ev(`${H} nav('WhatsApp').click(); return true;`);
      await waitFor(`${H} return !!btn('Rastreamento');`, 8000);
      await ev(`${H} btn('Rastreamento').click(); return true;`);
      await sleep(2500); // a mesma versão: nada aparece (e confere o index.html publicado)
      const none = await ev(`${H} return !document.querySelector('[data-testid="erp-new-version"]');`);
      const fetched = indexFetches;
      served = indexHtml('index-v2.js'); // publicaram uma versão nova
      const shown = await waitFor(`${H} return /Nova versão do sistema disponível/.test(txt(document.querySelector('[data-testid="erp-new-version"]')));`, 8000);
      const stillHere = await ev(`${H} return { tracking: !!document.querySelector('[data-testid="wa-tracking"]'), marker: (window.__marker = 'sem recarregar') };`);
      await sleep(1000);
      const notReloaded = await ev('return window.__marker === "sem recarregar";');
      served = indexHtml('index-v1.js'); // (o arquivo novo não existe no teste: volta o v1 para a página carregar)
      await ev(`${H} document.querySelector('[data-testid="erp-new-version-reload"]').click(); return true;`);
      const reloaded = await waitFor(`${H} return window.__marker === undefined && !!document.querySelector('[data-testid="wa-tracking"]') && q().get('aba') === 'rastreamento';`, 20000);
      check('versão nova: confere o index.html publicado; quando muda, mostra "Nova versão do sistema disponível · Atualizar" sem recarregar sozinho; clicar recarrega e volta para WhatsApp → Rastreamento',
        none && fetched >= 1 && shown && stillHere.tracking && notReloaded && reloaded, JSON.stringify({ none, fetched, shown, notReloaded, reloaded }));
    });

    check('nenhum erro no console nem exceção', errors.length === 0, errors.slice(0, 5).join(' | '));
  } catch (e) {
    check('o teste rodou até o fim', false, `${(e as Error).stack || String(e)}\n     erros da página: ${errors.slice(0, 5).join(' | ') || 'nenhum'}`);
  } finally {
    clearTimeout(timer);
    done();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verificações passaram (Chrome: ${chrome})`);
  if (ok !== results.length) process.exitCode = 1;
}
main();
