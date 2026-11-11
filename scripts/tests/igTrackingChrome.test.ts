// Instagram FASE 2 no Chrome REAL (sem npm install e sem o build do app):
//   node scripts/tests/igTrackingChrome.test.ts        (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Um servidor local faz o papel da Vercel (aplica as rewrites do vercel.json: /l/<apelido> → public/l/index.html) e
// serve a página do ERP empacotada (chrome/igTrackingHarness.tsx, Supabase falso). A edge function ig-link de
// verdade (supabase/functions/ig-link/link.ts) responde aqui no Node, pelo CDP (Fetch), no lugar do Supabase; o
// WhatsApp (wa.me) também é SIMULADO. Nada sai do computador. Confere:
//   - abas Visão geral / Stories / Rastreio / Direct / Automações, ?aba= no endereço (F5 volta);
//   - Rastreio: cliques → conversas → vendas → R$ por link e por canal, taxas, melhores links, últimos cliques;
//     criar link (apelido → código sugerido, post ligado, erros), editar, copiar, QR code (lido de volta);
//     grava SÓ ig_links;
//   - /l/<apelido> no celular dentro do Instagram: registra o clique e abre o WhatsApp com "[IG-BIO]"; link que não
//     existe ou função fora do ar: abre o WhatsApp mesmo assim;
//   - WhatsApp → Rastreamento: "Instagram (orgânico)" separado de Meta Ads e Não rastreada;
//   - celular sem rolagem lateral; nenhum erro no console.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open as openLink } from '../../supabase/functions/ig-link/link.ts';
import { decodeQr, modulesFromSvg } from './qrDecode.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const PUBLIC = path.join(PROJECT, 'public');
const require = createRequire(path.join(PROJECT, 'package.json'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

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

// ── dados (hoje, horário de SP) ──
const DAY = 86400000;
const spDay = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
const at = (dayOffset: number, hour: number, now: number) => new Date(Date.parse(`${spDay(now - dayOffset * DAY)}T${String(hour).padStart(2, '0')}:00:00-03:00`)).toISOString();
const SVG = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/></svg>`)}`;
const L1 = '11111111-1111-4111-8111-000000000001'; const L2 = '11111111-1111-4111-8111-000000000002'; const L3 = '11111111-1111-4111-8111-000000000003';
function fixtures(now: number) {
  const link = (id: string, slug: string, channel: string, code: string) => ({ id, slug, channel, code, message: 'Olá! Vim pelo Instagram 😊', media_id: null, media_permalink: null, media_caption: null, note: null, active: true, created_at: at(40, 10, now), updated_at: at(40, 10, now) });
  const links = [link(L1, 'bio', 'bio', 'IG-BIO'), link(L2, 'manychat-comentarios', 'comentarios', 'IG-COMENT'), link(L3, 'stories', 'stories', 'IG-STORIES')];
  const click = (id: string, d: number, h: number, device = 'iPhone/iPad') => ({ link_id: id, created_at: at(d, h, now), device, browser: 'Instagram', ip_hash: null });
  const clicks = [...[9, 10, 11, 12, 13].map((h) => click(L1, 0, h)), click(L3, 0, 10, 'Android'), click(L3, 0, 11, 'Android'), click(L2, 1, 15)];
  const A = '5521911110001@c.us'; const B = '5521911110002@c.us'; const C = '5521911110003@c.us'; const D = '5521911110004@c.us'; const E = '5521911110005@c.us';
  const lead = (chat: string, h: number, origin = 'organico', ad: string | null = null) => ({ chat_id: chat, phone: chat.slice(0, 13), first_message_at: at(0, h, now), origin, ad_id: ad ? '120210000000111' : null, ad_title: ad, last_message_at: at(0, h, now) });
  return {
    db: {
      ig_links: links, ig_link_clicks: clicks,
      ig_link_leads: [
        { chat_id: A, phone: A.slice(0, 13), first_message_at: at(0, 10, now), code: 'IG-BIO', link_id: L1 },
        { chat_id: B, phone: B.slice(0, 13), first_message_at: at(0, 11, now), code: 'IG-STORIES', link_id: null },
        { chat_id: C, phone: C.slice(0, 13), first_message_at: at(0, 12, now), code: 'IG-COMENT', link_id: L2 }, // veio de anúncio: vale Meta Ads
        { chat_id: E, phone: E.slice(0, 13), first_message_at: at(0, 14, now), code: 'IG-NOVO', link_id: null }, // código sem link
      ],
      wa_leads: [lead(A, 10), lead(C, 12, 'anuncio', 'Relógio A'), lead(D, 13)],
      sales: [{ id: 'v-ig-1', sale_date: spDay(now), created_at: at(0, 15, now), total_sale_price: 1500, customer_phone: '21911110001', customer_name: 'Ana', wa_chat_id: A, origin: null, status: 'finalizado', total_cost: 600, delivery_fee: 0, delivery_cost: 0 }],
      wa_ad_attribution: [], wa_send_log: [], wa_replies: [], wa_chat_names: [], wa_conversion_events: [], wa_chat_activity: [], wa_chat_activity_days: [], wa_items: [], wa_settings: [], system_config: [],
    },
    posts: [
      { id: '180000000000001', kind: 'REEL', caption: 'Ultra 9 na mão #relogio', permalink: 'https://www.instagram.com/reel/1/', timestamp: at(2, 19, now), thumb: SVG('#c026d3'), metrics: {} },
      { id: '180000000000002', kind: 'CAROUSEL', caption: 'Lançamentos', permalink: 'https://www.instagram.com/p/2/', timestamp: at(5, 12, now), thumb: SVG('#2563eb'), metrics: {} },
    ],
    links,
  };
}

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  const fake = path.join(HERE, 'chrome', 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'igTrackingHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: Any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: fake })); } }],
  });
}

// como a Vercel: rewrites do vercel.json, depois arquivo do app (pasta do teste) ou de public/
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function serve(appDir: string) {
  const rewrites: { source: string; destination: string }[] = JSON.parse(fs.readFileSync(path.join(PROJECT, 'vercel.json'), 'utf8')).rewrites || [];
  const rx = rewrites.map((r) => ({ re: new RegExp(`^${r.source.replace(/:[a-z]+/gi, '[^/]+')}/?$`), dest: r.destination }));
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    let p = decodeURIComponent(url.pathname);
    const hit = rx.find((r) => r.re.test(p));
    if (hit) p = hit.dest;
    if (p === '/') p = '/index.html';
    const file = [path.join(appDir, p), path.join(PUBLIC, p)].find((f) => (f.startsWith(appDir) || f.startsWith(PUBLIC)) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

function cdp(child: ChildProcess) {
  let seq = 0; let buf = '';
  const pending = new Map<number, { resolve: (v: Any) => void; reject: (e: Error) => void }>();
  const listeners: ((m: Any) => void)[] = [];
  (child.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let msg: Any; try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id)!; pending.delete(msg.id); if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim())); else p.resolve(msg.result); }
      else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<Any>((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    (child.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn: (m: Any) => void) => listeners.push(fn) };
}

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const TMP = process.env.TSP_TMP_DIR || os.tmpdir();
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'tsp-igr-'));
  await bundle(dir);
  const fx = fixtures(Date.now());
  fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(fx.db)}; window.__POSTS = ${JSON.stringify(fx.posts)}; window.__TSP_LIVE_MS = 3600000;`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f3f4f6;--bg-hover:#e5e7eb;--border-main:#e5e7eb}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc}</style>
</head><body><div id="root"></div><script src="/db.js"></script><script src="/app.js"></script></body></html>`);
  const server = serve(dir);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // edge function ig-link de verdade, com o "banco" aqui no Node
  const nodeClicks: Any[] = [];
  let fnDown = false;
  const linkDeps = {
    findLink: async (slug: string) => fx.links.find((l) => l.slug === slug) || null,
    recentClick: async () => false,
    insertClick: async (row: Any) => { nodeClicks.push(row); },
    hmac: async (t: string) => Buffer.from(t).toString('hex').padEnd(64, '0').slice(0, 64),
    now: () => Date.now(),
  };
  const waOpened: string[] = [];

  const profile = fs.mkdtempSync(path.join(TMP, 'tsp-igr-chrome-'));
  const child = spawn(chrome, [
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--window-size=1366,900', '--lang=pt-BR',
    ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  // os temporários (pacote e perfil do Chrome) ficam na pasta TSP_TMP_DIR (ou a temporária do sistema); nada é apagado
  const done = () => { try { child.kill(); } catch { /* já saiu */ } server.close(); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 240000);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const page = targetInfos.find((t: Any) => t.type === 'page');
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, apikey' }, { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' }];
    c.on(async (m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: Any) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      if (m.method === 'Fetch.requestPaused') {
        const rq = m.params.request; const rid = m.params.requestId;
        try {
          if (rq.url.startsWith('https://wa.me/')) {
            waOpened.push(rq.url);
            await s('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from('<!doctype html><title>WhatsApp (simulado)</title><h1>WhatsApp simulado</h1>').toString('base64') });
          } else if (rq.url.includes('/functions/v1/ig-link')) {
            if (rq.method === 'OPTIONS') { await s('Fetch.fulfillRequest', { requestId: rid, responseCode: 204, responseHeaders: cors }); return; }
            if (fnDown) { await s('Fetch.failRequest', { requestId: rid, errorReason: 'ConnectionRefused' }); return; }
            const hdr = new Map(Object.entries(rq.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
            const out = await openLink(JSON.parse(rq.postData || '{}'), { get: (k: string) => hdr.get(k.toLowerCase()) ?? null }, linkDeps);
            await s('Fetch.fulfillRequest', { requestId: rid, responseCode: out.status, responseHeaders: [...cors, { name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(out.json)).toString('base64') });
          } else await s('Fetch.continueRequest', { requestId: rid });
        } catch { /* a página saiu */ }
      }
    });
    await s('Runtime.enable'); await s('Page.enable');
    await s('Fetch.enable', { patterns: [{ urlPattern: 'https://wa.me/*' }, { urlPattern: '*functions/v1/ig-link*' }] });
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(80); } return false; };
    const go = async (p: string, ready = `return document.readyState === 'complete' && !!document.getElementById('root');`) => {
      await s('Page.navigate', { url: ORIGIN + p });
      await waitFor(`return location.origin === ${JSON.stringify(ORIGIN)} && ${JSON.stringify(p.split('?')[0])} === location.pathname && document.readyState === 'complete';`);
      await waitFor(ready);
    };
    const shot = async (name: string, width = 1366) => {
      if (!process.env.SHOTS_DIR) return;
      await sleep(400);
      const mm = await s('Page.getLayoutMetrics'); const h = Math.ceil(mm.cssContentSize.height);
      const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 7000), scale: 1 } });
      fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64'));
    };
    const H = `const $ = (q, r = document) => r.querySelector(q); const $$ = (q, r = document) => [...r.querySelectorAll(q)];
      const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''); const tid = (t) => $('[data-testid="' + t + '"]');
      const setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };`;

    // ── abas ──
    await go('/?pagina=instagram', `return !!document.querySelector('[data-testid="ig-shell"]');`);
    const tabs = await ev(`${H} return $$('[role="tab"]').map((b) => ({ id: b.dataset.testid, t: txt(b), dis: b.disabled, sel: b.getAttribute('aria-selected') })).concat([{ page: !!tid('ig-page') }]);`);
    check('abas: Visão geral (aberta), Stories (histórico), Rastreio, Direct e Automações (FASE 3: liberadas)',
      tabs.length === 6 && tabs[0].t === 'Visão geral' && tabs[0].sel === 'true' && tabs[1].t === 'Stories' && !tabs[1].dis && tabs[2].t === 'Rastreio' && !tabs[2].dis && tabs[3].t === 'Direct' && !tabs[3].dis && tabs[4].t === 'Automações' && !tabs[4].dis && tabs[5].page, JSON.stringify(tabs));
    await ev(`${H} tid('ig-tab-direct').click(); return true;`);
    await sleep(100);
    check('aba Direct abre (FASE 3)', await waitFor(`${H} return tid('ig-tab-direct').getAttribute('aria-selected') === 'true' && !!tid('ig-direct');`));
    await ev(`${H} tid('ig-tab-rastreio').click(); return true;`);
    const opened = await waitFor(`${H} return $$('[data-testid="igr-link"]').length === 3 && !/…/.test(txt(tid('igr-kpis')));`, 15000);
    check('Rastreio abre com ?aba=rastreio no endereço', opened && await ev(`return new URLSearchParams(location.search).get('aba') === 'rastreio';`), await ev(`return location.search;`));

    // ── resultados ──
    const k = await ev(`${H} const v = (id) => txt($('[data-testid="igr-kpi-' + id + '"] .igr-big')); return ['cliques', 'conversas', 'vendas', 'faturamento', 'clique-conversa', 'conversa-venda'].map(v);`);
    check('números do período: 8 cliques → 2 conversas → 1 venda → R$ 1.500,00; clique→conversa 25%, conversa→venda 50%',
      JSON.stringify(k) === JSON.stringify(['8', '2', '1', 'R$ 1.500,00', '25,0%', '50,0%']), JSON.stringify(k));
    const rows = await ev(`${H} return $$('[data-testid="igr-link"]').map((r) => [r.dataset.slug, txt($('[data-testid="igr-clicks"]', r)), txt($('[data-testid="igr-convs"]', r)), txt($('[data-testid="igr-revenue"]', r)), txt($('[data-testid="igr-url"]', r))]);`);
    check('por link: bio 5 cliques/1 conversa/R$ 1.500 · manychat 1/0 (a conversa veio de anúncio) · stories 2/1 (achado pelo código)',
      JSON.stringify(rows.map((r: string[]) => r.slice(0, 4))) === JSON.stringify([['bio', '5', '1', 'R$ 1.500,00'], ['manychat-comentarios', '1', '0', 'R$ 0,00'], ['stories', '2', '1', 'R$ 0,00']]) && rows[0][4] === 'https://triumph-store.vercel.app/l/bio', JSON.stringify(rows));
    const extra = await ev(`${H} return { best: $$('[data-testid="igr-best-item"]').map(txt), ch: $$('[data-testid="igr-channel"]').map((r) => r.dataset.channel + ':' + $$('td', r).map(txt).join('|')), recent: $$('[data-testid="igr-recent"] tbody tr').length };`);
    check('melhores links (bio, stories), tabela por canal e últimos cliques',
      extra.best.length === 2 && /^1º bio/.test(extra.best[0]) && /^2º stories/.test(extra.best[1]) && extra.ch.length === 3 && /^bio:Bio\|5\|1\|1\|R\$\s1\.500,00\|100,0%$/.test(extra.ch[0]) && extra.recent === 8, JSON.stringify(extra));
    await shot('instagram-rastreio.png');

    // ── copiar e QR ──
    await c.send('Browser.grantPermissions', { origin: ORIGIN, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await s('Page.bringToFront');
    await ev(`${H} $('[data-slug="bio"] [data-testid="igr-copy"]').click(); return true;`);
    const copiedOk = await waitFor(`${H} return /Link copiado/.test(txt($('[data-slug="bio"]')));`, 4000);
    const clip = await ev(`try { return await navigator.clipboard.readText(); } catch (e) { return 'erro: ' + e.message; }`);
    check('copiar link: "Link copiado!" e o link certo na área de transferência', copiedOk && clip === 'https://triumph-store.vercel.app/l/bio', String(clip));
    await ev(`${H} $('[data-slug="bio"] [data-testid="igr-qr"]').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-qr-svg');`);
    const svg = await ev(`${H} return tid('igr-qr-svg').innerHTML;`);
    let qrText = '';
    try { qrText = decodeQr(modulesFromSvg(svg)); } catch (e) { qrText = `erro: ${(e as Error).message}`; }
    check('QR code na tela, lido de volta = o link (Reed-Solomon conferido)', qrText === 'https://triumph-store.vercel.app/l/bio', qrText);
    await shot('instagram-qr.png');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
    await waitFor(`${H} return !tid('igr-qr-modal');`);

    // ── criar link ──
    await ev(`${H} tid('igr-new').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-editor') && $$('[data-testid="igr-f-postitem"]').length === 2;`, 8000);
    await ev(`${H} setVal(tid('igr-f-slug'), 'Reel Ultra 9'); return true;`);
    await sleep(80);
    await ev(`${H} setVal(tid('igr-f-channel'), 'post'); return true;`);
    await sleep(80);
    const f1 = await ev(`${H} return { slug: tid('igr-f-slug').value, code: tid('igr-f-code').value, prev: txt(tid('igr-f-preview')) };`);
    await ev(`${H} tid('igr-f-save').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-f-errors');`);
    const e1 = await ev(`${H} return txt(tid('igr-f-errors'));`);
    await ev(`${H} $$('[data-testid="igr-f-postitem"]')[0].click(); return true;`);
    await sleep(80);
    await ev(`${H} tid('igr-f-save').click(); return true;`);
    const created = await waitFor(`${H} return !tid('igr-editor') && $$('[data-testid="igr-link"]').length === 4;`, 8000);
    const row = await ev(`return (window.__DB.ig_links || []).find((r) => r.slug === 'reel-ultra-9') || null;`);
    check('novo link: apelido vira "reel-ultra-9", código sugerido IG-REEL-ULTRA-9, prévia "… [IG-REEL-ULTRA-9]"; "Reel/post" exige o post; salva com o post ligado',
      f1.slug === 'reel-ultra-9' && f1.code === 'IG-REEL-ULTRA-9' && /Olá! Vim pelo Instagram 😊 \[IG-REEL-ULTRA-9\]/.test(f1.prev) && /escolha o post/.test(e1) && created && !!row && row.media_id === '180000000000001' && row.channel === 'post' && /Ultra 9/.test(row.media_caption || ''),
      JSON.stringify({ f1, e1, row }));
    await ev(`${H} tid('igr-new').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-editor');`);
    await ev(`${H} setVal(tid('igr-f-slug'), 'bio'); return true;`);
    await sleep(80);
    await ev(`${H} tid('igr-f-save').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-f-errors');`);
    const dupe = await ev(`${H} return txt(tid('igr-f-errors'));`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
    await waitFor(`${H} return !tid('igr-editor');`);
    check('apelido/código repetido não salva ("Já existe um link com o apelido…")', /Já existe um link com o apelido "bio"/.test(dupe), dupe);

    // ── editar ──
    await ev(`${H} $('[data-slug="stories"] [data-testid="igr-edit"]').click(); return true;`);
    await waitFor(`${H} return !!tid('igr-editor') && tid('igr-f-slug').value === 'stories';`);
    await ev(`${H} setVal(tid('igr-f-message'), 'Oi! Vi seu stories 😍'); return true;`);
    await sleep(80);
    await ev(`${H} tid('igr-f-save').click(); return true;`);
    await waitFor(`${H} return !tid('igr-editor');`, 8000);
    const st = await ev(`return window.__DB.ig_links.find((r) => r.slug === 'stories');`);
    const writes = await ev(`return window.__WRITES.map((w) => w.table + ':' + w.op);`);
    check('editar salva a mensagem; a tela grava SÓ em ig_links (1 novo + 1 edição; nada apagado)',
      st.message === 'Oi! Vi seu stories 😍' && st.code === 'IG-STORIES' && JSON.stringify(writes) === JSON.stringify(['ig_links:insert', 'ig_links:update']), JSON.stringify({ msg: st.message, writes }));

    // ── F5 na aba ──
    await go('/?pagina=instagram&aba=rastreio', `return !!document.querySelector('[data-testid="ig-tracking"]');`);
    check('F5 com ?aba=rastreio volta direto no Rastreio', await ev(`${H} return tid('ig-tab-rastreio').getAttribute('aria-selected') === 'true';`));

    // ── celular ──
    await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await waitFor(`${H} return $$('[data-testid="igr-link"]').length >= 3;`);
    await sleep(500);
    const mob = await ev(`${H} return { sw: document.documentElement.scrollWidth, kpis: getComputedStyle($('.igr-kpis')).gridTemplateColumns.split(' ').length };`);
    check('celular (390 px): Rastreio sem rolagem lateral, números em 2 colunas', mob.sw <= 391 && mob.kpis === 2, JSON.stringify(mob));
    await shot('instagram-rastreio-celular.png', 390);

    // ── /l/<apelido> dentro do Instagram ──
    await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0' });
    await s('Page.navigate', { url: `${ORIGIN}/l/bio` });
    const toWa = await waitFor(`return location.href.startsWith('https://wa.me/');`, 8000);
    const final = await ev(`return location.href;`);
    const text = decodeURIComponent((/[?&]text=([^&]*)/.exec(final) || [])[1] || '');
    check('/l/bio no celular (Instagram): registra o clique (iPhone/iPad · Instagram, sem IP) e abre o WhatsApp da loja com "[IG-BIO]"',
      toWa && final.startsWith('https://wa.me/5521980921808?text=') && text === 'Olá! Vim pelo Instagram 😊 [IG-BIO]' && nodeClicks.length === 1 && nodeClicks[0].link_id === L1 && nodeClicks[0].device === 'iPhone/iPad' && nodeClicks[0].browser === 'Instagram' && !('ip' in nodeClicks[0]),
      JSON.stringify({ final, text, nodeClicks }));
    await s('Page.navigate', { url: `${ORIGIN}/l/nao-existe` });
    await waitFor(`return location.href.startsWith('https://wa.me/');`, 8000);
    const nf = decodeURIComponent((/[?&]text=([^&]*)/.exec(await ev(`return location.href;`)) || [])[1] || '');
    fnDown = true;
    const t0 = Date.now();
    await s('Page.navigate', { url: `${ORIGIN}/l/stories` });
    await waitFor(`return location.href.startsWith('https://wa.me/');`, 8000);
    const down = decodeURIComponent((/[?&]text=([^&]*)/.exec(await ev(`return location.href;`)) || [])[1] || '');
    fnDown = false;
    check('link que não existe / função fora do ar: abre o WhatsApp mesmo assim (sem código), em até 3 s, sem contar clique',
      nf === 'Olá! Vim pelo Instagram 😊' && down === 'Olá! Vim pelo Instagram 😊' && Date.now() - t0 < 6000 && nodeClicks.length === 1, JSON.stringify({ nf, down }));
    const lpage = await new Promise<string>((r) => http.get(`${ORIGIN}/l/bio`, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => r(b)); }));
    check('a página /l/ é pequena, sem o app do ERP, noindex e com o botão "Abrir o WhatsApp"', lpage.length < 8000 && /noindex/.test(lpage) && /Abrir o WhatsApp/.test(lpage) && !/app\.js/.test(lpage), String(lpage.length));
    await s('Emulation.setUserAgentOverride', { userAgent: '' });
    await s('Emulation.clearDeviceMetricsOverride');

    // ── WhatsApp → Rastreamento ──
    await go('/?view=wa', `return !!document.querySelector('[data-testid="track-ig"]') && !/…/.test(document.querySelector('[data-testid="track-totals"]')?.textContent || '…');`);
    await waitFor(`${H} return /Total/.test(txt(tid('track-totals')));`, 10000);
    const wa = await ev(`${H} const v = (t) => txt($('[data-testid="' + t + '"]'));
      return { ig: v('track-ig'), ad: v('track-ad'), un: v('track-untracked'), totals: v('track-totals'), originIg: v('track-origin-ig'), badges: $$('[data-testid="track-ig-badge"]').map((b) => txt(b.parentElement)), filters: $$('[data-testid="track-filters"] [role="group"][aria-label="Origem"] button').map(txt) };`);
    check('WhatsApp → Rastreamento: "Instagram (orgânico)" separado de Meta Ads e Não rastreada (3 · 1 · 1); anúncio vale primeiro',
      /^Instagram \(orgânico\).*3/.test(wa.ig) && /1/.test(wa.ad) && /1/.test(wa.un) && /5 Total1 Meta Ads3 Instagram1 Não rastreada/.test(wa.totals) && /^3 Instagram/.test(wa.originIg)
      && wa.badges.some((b: string) => b === 'InstagramBio · bio') && wa.badges.some((b: string) => b === 'InstagramStories · stories') && wa.filters.join('|') === 'Todas as origens|Meta Ads|Instagram (orgânico)|Não rastreada', JSON.stringify(wa));
    await ev(`${H} $$('[data-testid="track-table-origin"] button').find((b) => txt(b) === 'Instagram (orgânico)').click(); return true;`);
    await sleep(200);
    const only = await ev(`${H} return txt(tid('track-totals'));`);
    check('filtro "Instagram (orgânico)" na tabela: só as 3 conversas do Instagram', /^3 Total0 Meta Ads3 Instagram0 Não rastreada/.test(only), only);
    await shot('whatsapp-rastreamento-instagram.png');

    check('nenhum erro no console', errors.length === 0, errors.slice(0, 6).join(' | '));
  } catch (e) {
    check('teste rodou até o fim', false, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    done();
  }
  const okN = results.filter(Boolean).length;
  console.log(`${okN}/${results.length} verificações passaram`);
  if (okN !== results.length) process.exitCode = 1;
}
main();
