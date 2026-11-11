// Instagram — HISTÓRICO (subaba Stories e Visão geral de 6/12 meses) no Chrome REAL, sem npm install e sem o build:
//   node scripts/tests/igHistoryChrome.test.ts        (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Mesmo harness da Visão geral (chrome/igHarness.tsx): Supabase falso com o histórico em window.__DB, a edge function
// "instagram" de verdade (ig.ts + collect.ts) e a Graph API SIMULADA (window.__GRAPH). Nada sai do Chrome. Confere:
//   - aba Stories: números do período, "O que funciona" (melhor horário, média por story, stories por dia), ranking,
//     grade por dia (miniatura, views, alcance, respostas, avanços/saídas, "parcial"), link dos stories (cliques →
//     conversas → vendas por dia), período, "Coletar agora" (lê os stories ativos da Meta simulada e guarda);
//   - Visão geral: 6 e 12 meses pelo histórico guardado (cartões = soma dos dias, "dados guardados desde"), conteúdos
//     guardados, e o gráfico "Seguidores ao longo do tempo"; a função nunca é chamada com 180/365 dias;
//   - sem a migration: avisos (nada quebra); celular sem rolagem lateral; só GET na "Meta"; nada gravado pelo ERP;
//     nenhum erro no console.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { windowsOf } from '../../supabase/functions/instagram/ig.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const findChrome = () => [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

const SVG = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="${c}"/></svg>`)}`;
const DAY = 86400000;
const H = 3600000;
const spDay = (ms: number) => new Date(ms - 3 * H).toISOString().slice(0, 10);
const atSp = (day: string, h: number) => new Date(Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00-03:00`)).toISOString();
const L1 = '11111111-1111-4111-8111-000000000003';

function graph(now: number) {
  const w = windowsOf(30, now);
  const iso = (daysAgo: number, h: number) => { const d = new Date(now - daysAgo * DAY); d.setUTCHours(h, 0, 0, 0); return d.toISOString().replace('.000Z', '+0000'); };
  return {
    days: 30, curSince: w.cur.since, reject: [],
    media: [{ raw: { id: '180000000000001', media_type: 'VIDEO', media_product_type: 'REELS', caption: 'Reel recente', permalink: 'https://www.instagram.com/p/1/', timestamp: iso(2, 22), like_count: 10, comments_count: 1, thumbnail_url: SVG('#c026d3') }, ins: { reach: 900, views: 1500, likes: 10, comments: 1, saved: 2, shares: 1, total_interactions: 14 } }],
    stories: [{ raw: { id: '990000000000009', media_type: 'IMAGE', media_url: SVG('#16a34a'), permalink: 'https://www.instagram.com/stories/x/9/', timestamp: new Date(now - 2 * H).toISOString().replace('.000Z', '+0000') }, ins: { views: 77, reach: 70, replies: 2, navigation: 90, taps_forward: 60, exits: 20 } }],
    profile: { id: '17841442995645189', username: 'store_triumph', name: 'Triumph Store', followers_count: 12840, follows_count: 512, media_count: 431, profile_picture_url: SVG('#f97316') },
    totalsCur: { reach: 42000, views: 98000, accounts_engaged: 3100, total_interactions: 5200, website_clicks: 340, profile_links_taps: 360, follows: 420, unfollows: 120 },
    totalsPrev: { reach: 35000, views: 110000, accounts_engaged: 2800, total_interactions: 5200, website_clicks: 300, profile_links_taps: 310, follows: 300, unfollows: 100 },
    audience: { city: [['Rio de Janeiro, Rio de Janeiro', 5200]], age: [['25-34', 5000]], gender: [['M', 8200]] },
  };
}
function db(now: number) {
  const today = spDay(now);
  const dayN = (n: number) => spDay(Date.parse(`${today}T12:00:00-03:00`) - n * DAY);
  // 200 dias de histórico da conta: views 100/dia, alcance 50/dia, +3 −1 seguidores/dia; foto de seguidores nos últimos 10
  const account = Array.from({ length: 200 }, (_, i) => { const d = dayN(i + 1); return { day: d, followers: i < 10 ? 12840 - i * 2 : null, reach: 50, views: 100, accounts_engaged: 10, total_interactions: 20, profile_views: 4, profile_links_taps: 2, gained: 3, lost: 1, collected_at: atSp(d, 3) }; });
  const story = (id: string, n: number, h: number, views: number, o: Any = {}) => ({ id, media_type: 'IMAGE', thumb: SVG(['#f97316', '#2563eb', '#c026d3', '#059669'][Number(id.slice(-1)) % 4]), permalink: `https://www.instagram.com/stories/x/${id}/`, posted_at: atSp(dayN(n), h), expires_at: atSp(dayN(n - 1), h), first_seen_at: atSp(dayN(n), h), last_read_at: new Date(Date.parse(atSp(dayN(n), h)) + 23.5 * H).toISOString(), views, reach: Math.round(views * 0.8), replies: 1, shares: null, total_interactions: 3, follows: null, profile_visits: 2, navigation: null, taps_forward: null, taps_back: null, exits: null, swipe_forward: null, ...o });
  const stories = [
    story('900000000000001', 1, 20, 400, { taps_forward: 300, taps_back: 10, exits: 40 }), story('900000000000002', 1, 21, 380), story('900000000000003', 1, 9, 150),
    story('900000000000004', 2, 20, 420), story('900000000000005', 2, 13, 120), story('900000000000006', 3, 10, 200),
    story('900000000000007', 40, 20, 999), // fora dos 30 dias
    story('900000000000008', 0, Math.max(0, Number(new Date(now - 3 * H).toISOString().slice(11, 13)) - 1), 60, { last_read_at: new Date(now).toISOString() }), // hoje, leitura parcial
  ];
  const W = '5521911110001@c.us';
  return {
    ig_daily_account: account,
    ig_daily_media: [{ day: dayN(1), media_id: '170000000000099', kind: 'CAROUSEL', posted_at: atSp(dayN(120), 12), caption: 'Carrossel antigo guardado', thumb: SVG('#2563eb'), permalink: 'https://www.instagram.com/p/99/', views: 8000, reach: 5000, likes: 400, comments: 20, saved: 90, shares: 10, total_interactions: 520, collected_at: atSp(dayN(1), 3) }],
    ig_stories: stories,
    ig_collect_log: [{ created_at: new Date(now - 40 * 60000).toISOString(), kind: 'stories', ok: true, message: '3 stories lidos', warnings: [] }],
    ig_links: [{ id: L1, slug: 'stories', channel: 'stories', code: 'IG-STORIES', message: 'Olá! Vim pelo Instagram 😊', media_id: null, media_permalink: null, media_caption: null, note: null, active: true, created_at: atSp(dayN(60), 10) }],
    ig_link_clicks: [{ link_id: L1, created_at: atSp(dayN(1), 21), device: 'Android', browser: 'Instagram', ip_hash: null }, { link_id: L1, created_at: atSp(dayN(1), 22), device: 'Android', browser: 'Instagram', ip_hash: null }],
    ig_link_leads: [{ chat_id: W, phone: '5521911110001', first_message_at: atSp(dayN(1), 22), code: 'IG-STORIES', link_id: L1 }],
    wa_leads: [{ chat_id: W, phone: '5521911110001', first_message_at: atSp(dayN(1), 22), origin: 'organico', ad_id: null, ad_title: null, last_message_at: atSp(dayN(1), 23) }],
    sales: [{ id: '5a1e0001-0000-4000-8000-000000000009', sale_date: atSp(dayN(0), 10), created_at: atSp(dayN(0), 10), total_sale_price: 699, customer_phone: '5521911110001', customer_name: 'Ana', wa_chat_id: W, origin: 'organico', status: 'pago' }],
  };
}

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'igHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: Any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: path.join(HERE, 'chrome', 'fakeSupabase.ts') })); } }],
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
      let msg; try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id)!; pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); } else listeners.forEach((fn) => fn(msg));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-hist-'));
  await bundle(dir);
  const now = Date.now();
  const writeDb = (missing: string[] = []) => fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(db(now))}; window.__GRAPH = ${JSON.stringify(graph(now))}; window.__MISSING = ${JSON.stringify(missing)};`);
  writeDb();
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f3f4f6;--bg-hover:#e5e7eb;--border-main:#e5e7eb}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-hist-chrome-'));
  const child = spawn(chrome, ['--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update',
    '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1366,900', '--lang=pt-BR', '--allow-file-access-from-files', ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  const done = () => { try { child.kill(); } catch { /* já saiu */ } setTimeout(() => { for (const d of [profile, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* preso */ } } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 240000);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const page = targetInfos.find((t: Any) => t.type === 'page');
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    c.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: Any) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    });
    await s('Runtime.enable'); await s('Page.enable');
    const base = pathToFileURL(path.join(dir, 'index.html')).href;
    const go = async (q: string) => { await s('Page.navigate', { url: `${base}${q}` }); await sleep(600); };
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
    const shot = async (name: string, width = 1366) => { if (!process.env.SHOTS_DIR) return; await sleep(400); const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height); const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 7000), scale: 1 } }); fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64')); };
    const Hs = `const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : '');
      const $ = (q, r = document) => r.querySelector(q); const $$ = (q, r = document) => [...r.querySelectorAll(q)];
      const tid = (id) => $('[data-testid="' + id + '"]'); const wait = (ms) => new Promise((r) => setTimeout(r, ms));`;
    const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { check(name, false, String((e as Error).message || e).split('\n')[0]); } };

    // ── Stories ──
    await go('?pagina=instagram');
    await waitFor(`${Hs} return !!tid('ig-tab-stories');`);
    await ev(`${Hs} tid('ig-tab-stories').click(); return true;`);
    await step('Stories', async () => {
      const ok = await waitFor(`${Hs} return $$('[data-testid="igst-card"]').length > 0;`, 20000);
      const tabs = await ev(`${Hs} return $$('[role="tab"]').map((b) => [txt(b), b.getAttribute('aria-selected')]);`);
      check('aba Stories (entre Visão geral e Rastreio) abre', ok && JSON.stringify(tabs.map((t: Any) => t[0])) === JSON.stringify(['Visão geral', 'Stories', 'Rastreio', 'Direct', 'Automações']) && tabs[1][1] === 'true', JSON.stringify(tabs));
      const k = await ev(`${Hs} return txt(tid('igst-kpis'));`);
      check('números de 30 dias: 7 stories · 1.730 views (o de 40 dias atrás fica fora)', /Stories\s*7/.test(k) && /Views\s*1\.730/.test(k) && /Média de views por story\s*247/.test(k), k);
      const w = await ev(`${Hs} return { h: txt(tid('igst-best-hour')), d: txt(tid('igst-best-perday')), t: txt(tid('igst-perday')) };`);
      check('o que funciona: melhor horário 20h (2+ stories), stories por dia (tabela) e média por story', /Melhor horário: 20h \(410 views em média, 2 stories\)/.test(w.h) && /Por dia/.test(w.t) && /3 stories|2–3 stories|1 story/.test(w.t), JSON.stringify(w));
      const rank = await ev(`${Hs} return $$('[data-testid="igst-rank-row"]').map(txt);`);
      check('ranking: o de 420 views primeiro, depois 400 e 380', /^1\s*420 views/.test(rank[0]) && /^2\s*400 views/.test(rank[1]) && /^3\s*380 views/.test(rank[2]), JSON.stringify(rank));
      const daysTxt = await ev(`${Hs} return $$('[data-testid="igst-day"]').map(txt);`);
      check('grade por dia: dias do mais novo para o mais antigo, com miniatura, views, alcance, respostas, avanços/saídas e o selo "parcial" na leitura de hoje',
        daysTxt.length === 4 && /parcial/.test(daysTxt[0]) && /avanços 300 · voltas 10 · saídas 40 \(10%\)/.test(daysTxt[1]) && /👁 400 · alcance 320/.test(daysTxt[1]) && (await ev(`return document.querySelectorAll('[data-testid="igst-card"] img').length;`)) === 7, JSON.stringify(daysTxt).slice(0, 400));
      const links = await ev(`${Hs} return $$('[data-testid="igst-link-row"]').map(txt);`);
      check('link dos stories: no dia de ontem 3 stories · 930 views · 2 cliques · 1 conversa · 1 venda · R$ 699', links.some((r: string) => /3\s*930\s*2\s*1\s*1\s*R\$\s*699,00/.test(r)), JSON.stringify(links));
      check('última coleta mostrada', /Última coleta: .* · 3 stories lidos/.test(await ev(`${Hs} return txt(tid('igst-last'));`)));
      await shot('stories.png');
      await ev(`${Hs} tid('igst-collect').click(); return true;`);
      await waitFor(`${Hs} return /1 stories ativos lidos agora/.test(txt(tid('igst-msg')));`);
      const saved = await ev(`return (window.__DB.ig_stories.find((x) => x.id === '990000000000009') || null);`);
      check('"Coletar agora": lê o story ativo da Meta simulada (insights + navegação) e guarda; aparece na grade', !!saved && saved.views === 77 && saved.exits === 20 && saved.taps_forward === 60
        && (await waitFor(`${Hs} return $$('[data-testid="igst-card"]').length === 8;`)), JSON.stringify(saved));
      await ev(`${Hs} tid('igst-period-7').click(); return true;`);
      await waitFor(`${Hs} return /Stories\\s*8/.test(txt(tid('igst-kpis')));`);
      check('período de 7 dias', /Stories\s*8/.test(await ev(`${Hs} return txt(tid('igst-kpis'));`)));
    });
    await step('celular', async () => {
      await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(500);
      const sw = await ev(`return document.documentElement.scrollWidth;`);
      await shot('stories-celular.png', 390);
      check('celular: Stories sem rolagem lateral', sw <= 390, String(sw));
      await s('Emulation.clearDeviceMetricsOverride');
    });

    // ── Visão geral: 6 e 12 meses pelo histórico ──
    await ev(`${Hs} tid('ig-tab-visao-geral').click(); return true;`);
    await step('Visão geral com histórico', async () => {
      await waitFor(`${Hs} return !!tid('ig-period-180');`);
      const chips = await ev(`${Hs} return $$('[aria-label="Período"] button').map(txt);`);
      check('períodos: 7, 14, 30, 90 dias, 6 meses e 12 meses', JSON.stringify(chips) === JSON.stringify(['7 dias', '14 dias', '30 dias', '90 dias', '6 meses', '12 meses']), JSON.stringify(chips));
      await waitFor(`${Hs} return /Dados guardados desde/.test(txt(tid('ig-history-since')));`);
      const since = new Date(Date.parse(`${spDay(now)}T12:00:00-03:00`) - 200 * DAY);
      const sinceTxt = `${String(since.getUTCDate()).padStart(2, '0')}/${String(since.getUTCMonth() + 1).padStart(2, '0')}/${since.getUTCFullYear()}`;
      check(`seguidores ao longo do tempo: gráfico e "Dados guardados desde ${sinceTxt}"`, (await ev(`${Hs} return txt(tid('ig-history-since'));`)) === `Dados guardados desde ${sinceTxt}` && !!(await ev(`${Hs} return !!tid('ig-chart-followers-history');`)));
      await ev(`${Hs} tid('ig-period-180').click(); return true;`);
      await waitFor(`${Hs} return /^18\\.000$|^18 mil$/.test(txt($('.igx-big', tid('ig-kpi-visualizacoes'))));`, 20000);
      const k = await ev(`${Hs} return ['seguidores','alcance','visualizacoes','bio'].map((id) => txt(tid('ig-kpi-' + id)));`);
      check('6 meses: cartões = soma dos dias guardados (views 180×100 = 18 mil, alcance 9 mil, +360 seguidores líquidos, 360 toques na bio) e comparação com os 6 meses antes',
        /18 mil/.test(k[2]) && /9.000/.test(k[1]) && /\+360/.test(k[0]) && /360/.test(k[3]) && /vs\. 180 dias antes/.test(k[2]), JSON.stringify(k));
      await ev(`${Hs} const d = tid('ig-warnings'); if (d) d.open = true; return true;`);
      const warn = await ev(`${Hs} return txt(tid('ig-warnings'));`);
      check('aviso: "6 meses montado com o histórico guardado (dados guardados desde …)"', /6 meses montado com o histórico guardado \(dados guardados desde/.test(warn), warn.slice(0, 300));
      const rk = await ev(`${Hs} return txt(document.querySelector('[data-testid="ig-page"]'));`);
      check('6 meses: conteúdos guardados (o carrossel de 120 dias atrás, da última foto do dia)', /Carrossel antigo guardado|8 mil|8\.000/.test(rk), rk.slice(0, 200));
      await ev(`${Hs} tid('ig-period-365').click(); return true;`);
      await waitFor(`${Hs} return /^20 mil$/.test(txt($('.igx-big', tid('ig-kpi-visualizacoes'))));`, 20000);
      check('12 meses: só os 200 dias guardados contam (views 20 mil) e avisa onde o histórico começa', /20 mil/.test(await ev(`${Hs} return txt(tid('ig-kpi-visualizacoes'));`)));
      const calls = await ev(`return window.__FN_CALLS.map((x) => [x.action, x.days || null]);`);
      check('a função nunca é chamada com 180/365 dias (só o perfil de 30 dias)', calls.every((c: Any) => c[1] !== 180 && c[1] !== 365), JSON.stringify(calls));
      await shot('visao-6-meses.png');
    });
    const gcalls = await ev(`return window.__GRAPH_CALLS.map((c) => c.method);`);
    check('só GET na "Meta"', gcalls.length > 0 && gcalls.every((m: string) => m === 'GET'));
    check('o ERP não grava nada (a coleta grava pela função, com a service role)', (await ev(`return window.__WRITES.length;`)) === 0, JSON.stringify(await ev(`return window.__WRITES;`)));
    check('nenhum erro no console', errors.length === 0, errors.slice(0, 5).join(' | '));

    // ── sem a migration ──
    writeDb(['ig_stories', 'ig_daily_account', 'ig_daily_media', 'ig_collect_log']);
    await go('?pagina=instagram');
    await waitFor(`${Hs} return !!tid('ig-tab-stories');`);
    await ev(`${Hs} tid('ig-tab-stories').click(); return true;`);
    await step('sem a migration', async () => {
      check('sem a migration: Stories avisa qual aplicar (nada quebra)', await waitFor(`${Hs} return /20261116120000_ig_history\\.sql/.test(txt(tid('igst-missing')));`));
      await ev(`${Hs} tid('ig-tab-visao-geral').click(); return true;`);
      check('sem a migration: "Seguidores ao longo do tempo" avisa', await waitFor(`${Hs} return /Aplique a migration 20261116120000_ig_history\\.sql/.test(txt(tid('ig-history-since')));`));
    });
  } catch (e) {
    check('teste rodou até o fim', false, String((e as Error).message || e));
  } finally { clearTimeout(timer); done(); }
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verificações passaram (Chrome: ${chrome})`);
  if (ok !== results.length) process.exitCode = 1;
}
main();
