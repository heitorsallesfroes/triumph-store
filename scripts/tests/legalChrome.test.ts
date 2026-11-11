// Páginas públicas exigidas pela Meta (/privacidade e /exclusao-de-dados) no Chrome REAL, sem npm install e sem build:
//   node scripts/tests/legalChrome.test.ts        (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Um servidor local serve a pasta public/ como a Vercel (/privacidade → privacidade/index.html) e a tela de login do
// ERP (AuthGate com o Supabase falso, sem sessão). Confere: as páginas abrem SEM login e sem JavaScript do ERP, com a
// empresa, a data de atualização, os assuntos pedidos pela Meta/LGPD e os contatos; no celular sem rolagem lateral;
// e os links discretos no rodapé do login levam às duas páginas. O Chrome roda sem acesso à internet.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const PUBLIC = path.join(PROJECT, 'public');
const require = createRequire(path.join(PROJECT, 'package.json'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findChrome(): string | null {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];
  return c.find((p) => fs.existsSync(p)) || null;
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
// como a Vercel: arquivo de public/ ou pasta/index.html; /login-test/ é a tela de login empacotada
function serve(loginDir: string) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const base = url.pathname.startsWith('/login-test/') ? loginDir : PUBLIC;
    const rel = decodeURIComponent(url.pathname.replace(/^\/login-test\//, '/'));
    const cands = [path.join(base, rel), path.join(base, rel, 'index.html')];
    const file = cands.find((f) => f.startsWith(base) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

async function bundleLogin(outDir: string) {
  const esbuild = require('esbuild');
  const entry = path.join(outDir, 'entry.tsx');
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client';\nimport AuthGate from ${JSON.stringify(path.join(PROJECT, 'src', 'components', 'AuthGate').replace(/\\/g, '/'))};\ncreateRoot(document.getElementById('root')!).render(<AuthGate><div data-testid="erp">ERP</div></AuthGate>);\n`);
  const fake = path.join(HERE, 'chrome', 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife', jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' },
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: fake })); } }], // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Login</title>
<style>:root{--bg-base:#0a0a0f;--bg-sidebar:#0a0a0a;--bg-inner:#111118;--border-main:#1c1c1c;--text-primary:#fff;--text-secondary:#ccc;--text-muted:#777}body{margin:0;background:var(--bg-base);font-family:Segoe UI,Arial,sans-serif}.min-h-screen{min-height:100vh}.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.w-full{width:100%}.max-w-sm{max-width:24rem}.mt-5{margin-top:1.25rem}.gap-3{gap:.75rem}.text-xs{font-size:.75rem}.p-8{padding:2rem}.px-4{padding-left:1rem;padding-right:1rem}.block{display:block}</style>
</head><body><div id="root"></div><script src="app.js"></script></body></html>`);
}

function cdp(child: ChildProcess) {
  let seq = 0; let buf = '';
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const listeners: ((m: any) => void)[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  (child.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let msg: any; try { msg = JSON.parse(raw); } catch { continue; } // eslint-disable-line @typescript-eslint/no-explicit-any
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id)!; pending.delete(msg.id); if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim())); else p.resolve(msg.result); }
      else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = ++seq; pending.set(id, { resolve, reject });
    (child.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn: (m: any) => void) => listeners.push(fn) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-legal-'));
  await bundleLogin(dir);
  const server = serve(dir);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-legal-chrome-'));
  const child = spawn(chrome, [
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--window-size=1366,900', '--lang=pt-BR',
    ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  const done = () => { try { child.kill(); } catch { /* já saiu */ } server.close(); setTimeout(() => { for (const d of [profile, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* preso */ } } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 120000);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const page = targetInfos.find((t: any) => t.type === 'page'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    c.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    await s('Runtime.enable'); await s('Page.enable');
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(80); } return false; };
    const go = async (p: string) => { await s('Page.navigate', { url: ORIGIN + p }); await waitFor(`return location.origin === ${JSON.stringify(ORIGIN)} && location.pathname === ${JSON.stringify(p)} && document.readyState === 'complete';`); await sleep(150); };
    const shot = async (name: string, width = 1366) => {
      if (!process.env.SHOTS_DIR) return;
      await sleep(300);
      const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height);
      const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 9000), scale: 1 } });
      fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64'));
    };
    const info = `const t = document.body.innerText; return { title: document.title, h1: (document.querySelector('h1') || {}).textContent, text: t, lang: document.documentElement.lang,
      updated: (document.querySelector('[data-testid="legal-updated"]') || {}).textContent, wa: (document.querySelector('[data-testid="legal-whatsapp"]') || {}).href, mail: (document.querySelector('[data-testid="legal-email"]') || {}).href,
      login: !!document.querySelector('input[type="password"]'), scripts: [...document.scripts].filter((x) => x.src).length, css: getComputedStyle(document.querySelector('.card')).borderRadius, sw: document.documentElement.scrollWidth };`;

    // ── Política de Privacidade ──
    await go('/privacidade');
    const p = await ev(info);
    const has = (t: string, list: (string | RegExp)[]) => list.filter((x) => !(typeof x === 'string' ? t.includes(x) : x.test(t)));
    const missP = has(p.text, ['LOJA TRIUMPH LTDA', '49.923.481/0001-04', 'Rua Quinze de Novembro, 106, Sala 908, Centro, Niterói/RJ, CEP 24020-125', 'store.triumph1@gmail.com', '(21) 98092-1808',
      'nome de perfil', 'ID do Instagram', 'mensagens', 'comentários', 'anúncios', 'Compras', 'Atendimento', 'Vendas e entrega', 'Mensuração de anúncios', 'LGPD', /Base legal/i, 'Legítimo interesse', 'Cumprimento de obrigação legal',
      'Meta Platforms', 'Provedores de hospedagem', 'Por quanto tempo guardamos', '5 anos', 'acessar', 'corrigir', 'exclusão', 'Como exercer seus direitos', '15 dias', 'ANPD']);
    check('/privacidade abre SEM login (nenhum formulário, nenhum JavaScript do ERP), em português, com a identidade do ERP',
      p.title === 'Política de Privacidade — Triumph Store' && p.h1 === 'Política de Privacidade' && p.lang === 'pt-BR' && !p.login && p.scripts === 0 && p.css === '16px', JSON.stringify({ ...p, text: undefined }));
    check('Política: empresa, endereço, contatos, dados (Instagram/WhatsApp/anúncios/compra), finalidades, base legal, compartilhamento, prazos e direitos', missP.length === 0, JSON.stringify(missP));
    check('data de atualização no topo e contatos clicáveis (WhatsApp e e-mail)', /^Atualizada em \d{1,2} de [a-zç]+ de \d{4}$/.test(p.updated) && p.wa === 'https://wa.me/5521980921808' && p.mail === 'mailto:store.triumph1@gmail.com', JSON.stringify([p.updated, p.wa, p.mail]));
    await shot('privacidade.png');
    await go('/privacidade/');
    check('/privacidade/ (com barra) também abre', (await ev(info)).h1 === 'Política de Privacidade');

    // ── Exclusão de Dados ──
    await go('/exclusao-de-dados');
    const e = await ev(info);
    const missE = has(e.text, ['LOJA TRIUMPH LTDA', 'Como pedir', '(21) 98092-1808', 'store.triumph1@gmail.com', '@ do Instagram', 'telefone', 'até 15 dias', 'O que é excluído', 'notas fiscais', 'Política de Privacidade']);
    check('/exclusao-de-dados abre SEM login, com instruções (WhatsApp/e-mail) e o prazo de até 15 dias em destaque',
      e.h1 === 'Exclusão de Dados' && !e.login && e.scripts === 0 && missE.length === 0 && /15 dias/.test(await ev(`return document.querySelector('[data-testid="legal-deadline"]').textContent;`)) && /^https:\/\/wa\.me\/5521980921808\?text=/.test(e.wa) && /^mailto:store\.triumph1@gmail\.com\?subject=/.test(e.mail), JSON.stringify({ missE, wa: e.wa, mail: e.mail }));
    await shot('exclusao.png');
    const cross = await ev(`return [...document.querySelectorAll('a[href="/privacidade"]')].length > 0;`);
    await ev(`document.querySelector('article a[href="/privacidade"]').click(); return true;`);
    const crossOk = await waitFor(`return location.pathname === '/privacidade' && document.querySelector('h1').textContent === 'Política de Privacidade';`);
    check('as duas páginas se ligam (link para a Política)', cross && crossOk);

    // ── tema claro do ERP (mesmo navegador) ──
    await ev(`localStorage.setItem('theme', 'light'); return true;`);
    await go('/exclusao-de-dados');
    const light = await ev(`return { cls: document.documentElement.className, bg: getComputedStyle(document.body).backgroundColor };`);
    await ev(`localStorage.removeItem('theme'); return true;`);
    check('segue o tema claro/escuro escolhido no ERP', light.cls === 'light' && light.bg === 'rgb(245, 245, 245)', JSON.stringify(light));

    // ── celular ──
    await s('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
    for (const pg of ['/privacidade', '/exclusao-de-dados']) {
      await go(pg);
      const m = await ev(`return { sw: document.documentElement.scrollWidth, fs: parseFloat(getComputedStyle(document.querySelector('p')).fontSize), cols: getComputedStyle(document.querySelector('.contacts')).gridTemplateColumns.split(' ').length };`);
      check(`celular (360 px) ${pg}: sem rolagem lateral, texto legível, contatos um embaixo do outro`, m.sw <= 361 && m.fs >= 15 && m.cols === 1, JSON.stringify(m));
      await shot(`${pg.slice(1)}-celular.png`, 360);
    }
    await s('Emulation.clearDeviceMetricsOverride');

    // ── rodapé da tela de login ──
    await go('/login-test/');
    await waitFor(`return !!document.querySelector('[data-testid="login-legal"]');`);
    const lg = await ev(`const n = document.querySelector('[data-testid="login-legal"]'); const f = document.querySelector('form'); const a = [...n.querySelectorAll('a')];
      return { links: a.map((x) => [x.textContent, x.getAttribute('href'), x.target]), below: n.getBoundingClientRect().top >= f.getBoundingClientRect().bottom, fs: parseFloat(getComputedStyle(n).fontSize), erp: !!document.querySelector('[data-testid="erp"]') };`);
    check('login: links discretos (texto pequeno) para as duas páginas, abaixo do formulário, abrindo em outra aba',
      JSON.stringify(lg.links) === JSON.stringify([['Política de Privacidade', '/privacidade', '_blank'], ['Exclusão de Dados', '/exclusao-de-dados', '_blank']]) && lg.below && lg.fs <= 12 && !lg.erp, JSON.stringify(lg));
    await shot('login.png');
    const st = await Promise.all(['/privacidade', '/exclusao-de-dados', '/legal.css'].map((u) => new Promise<number>((r) => http.get(ORIGIN + u, (res) => { res.resume(); r(res.statusCode || 0); }))));
    check('os links do login respondem 200 (e o CSS das páginas também)', st.every((x) => x === 200), JSON.stringify(st));

    check('nenhum erro no console', errors.length === 0, errors.slice(0, 6).join(' | '));
  } catch (err) {
    check('teste rodou até o fim', false, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
    done();
  }
  const okN = results.filter(Boolean).length;
  console.log(`${okN}/${results.length} verificações passaram`);
  if (okN !== results.length) process.exitCode = 1;
}
main();
