// Aba Instagram (FASE 1, só leitura) no Chrome REAL, sem npm install e sem o build do app:
//   node scripts/tests/igChrome.test.ts            (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Empacota só a página (scripts/tests/chrome/igHarness.tsx) com o esbuild do Vite, Supabase falso e a edge function
// "instagram" de verdade (ig.ts) com a Graph API SIMULADA (window.__GRAPH; o Chrome roda sem rede). Confere:
//   - topo primeiro (perfil + 7 cartões com ▲▼) antes dos conteúdos; gráfico; ranking com miniaturas, selos e
//     ordenação; detalhe (métricas, legenda, data/hora, "Abrir no Instagram", tempo assistido do Reel);
//   - "O que funciona", Simples × Completo (Público), métrica recusada com aviso, Atualizar com "Atualizado às",
//     período, função não publicada, celular sem rolagem lateral; só GET na "Meta", nada grava, sem erro no console.
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

const SVG = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/></svg>`)}`;
const DAY = 86400000;
function fixtures(now: number) {
  const w = windowsOf(30, now);
  const iso = (daysAgo: number, hourUtc: number) => { const d = new Date(now - daysAgo * DAY); d.setUTCHours(hourUtc, 0, 0, 0); return d.toISOString().replace('.000Z', '+0000'); };
  const mk = (id: string, type: string, product: string, daysAgo: number, h: number, ins: Record<string, number>, color: string) => ({
    raw: { id, media_type: type, media_product_type: product, caption: `Legenda do post ${id} #relogio`, permalink: `https://www.instagram.com/p/${id}/`, timestamp: iso(daysAgo, h), like_count: ins.likes, comments_count: ins.comments,
      ...(type === 'VIDEO' ? { thumbnail_url: SVG(color) } : type === 'CAROUSEL_ALBUM' ? { children: { data: [{ media_type: 'IMAGE', media_url: SVG(color) }, { media_type: 'IMAGE', media_url: SVG('#999') }] } } : { media_url: SVG(color) }) },
    ins: { total_interactions: ins.likes + ins.comments + ins.saved + ins.shares, profile_visits: 20, ...ins },
  });
  const media = [
    mk('180000000000001', 'VIDEO', 'REELS', 2, 22, { reach: 9000, views: 15000, likes: 600, comments: 40, saved: 150, shares: 90, follows: 60, ig_reels_avg_watch_time: 8500, ig_reels_video_view_total_time: 7200000 }, '#c026d3'),
    mk('180000000000002', 'VIDEO', 'REELS', 9, 22, { reach: 6000, views: 10000, likes: 300, comments: 20, saved: 60, shares: 40, follows: 30, ig_reels_avg_watch_time: 6000, ig_reels_video_view_total_time: 3600000 }, '#a21caf'),
    mk('180000000000003', 'CAROUSEL_ALBUM', 'FEED', 4, 13, { reach: 3000, views: 4200, likes: 250, comments: 30, saved: 400, shares: 20, follows: 12 }, '#2563eb'),
    mk('180000000000004', 'CAROUSEL_ALBUM', 'FEED', 16, 13, { reach: 2000, views: 2600, likes: 120, comments: 10, saved: 90, shares: 5, follows: 4 }, '#1d4ed8'),
    mk('180000000000005', 'IMAGE', 'FEED', 6, 15, { reach: 1200, views: 1500, likes: 80, comments: 4, saved: 5, shares: 2, follows: 1 }, '#059669'),
    mk('180000000000006', 'IMAGE', 'FEED', 23, 15, { reach: 900, views: 1100, likes: 50, comments: 2, saved: 3, shares: 1, follows: 0 }, '#047857'),
  ];
  return {
    days: 30, curSince: w.cur.since, media, reject: ['profile_views'], mediaDelay: 600,
    profile: { id: '17841442995645189', username: 'store_triumph', name: 'Triumph Store', followers_count: 12840, follows_count: 512, media_count: 431, profile_picture_url: SVG('#f97316') },
    totalsCur: { reach: 42000, views: 98000, accounts_engaged: 3100, total_interactions: 5200, website_clicks: 340, profile_links_taps: 360, follows: 420, unfollows: 120 },
    totalsPrev: { reach: 35000, views: 110000, accounts_engaged: 2800, total_interactions: 5200, website_clicks: 300, profile_links_taps: 310, follows: 300, unfollows: 100 },
    audience: { city: [['Rio de Janeiro, Rio de Janeiro', 5200], ['Niterói, Rio de Janeiro', 2100], ['São Gonçalo, Rio de Janeiro', 900], ['São Paulo, São Paulo', 700]], age: [['25-34', 5000], ['18-24', 2600], ['35-44', 3100]], gender: [['M', 8200], ['F', 4300], ['U', 340]] },
  };
}

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  const fake = path.join(HERE, 'chrome', 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'igHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: fake })); } }], // eslint-disable-line @typescript-eslint/no-explicit-any
  });
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-'));
  await bundle(dir);
  fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = {}; window.__GRAPH = ${JSON.stringify(fixtures(Date.now()))};`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f3f4f6;--bg-hover:#e5e7eb;--border-main:#e5e7eb}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-chrome-'));
  const child = spawn(chrome, [
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1366,900', '--lang=pt-BR',
    '--allow-file-access-from-files', ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  const done = () => { try { child.kill(); } catch { /* já saiu */ } setTimeout(() => { for (const d of [profile, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* preso */ } } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 180000);
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
    await s('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(80); } return false; };
    const shot = async (name: string, width = 1366) => {
      if (!process.env.SHOTS_DIR) return;
      await sleep(400);
      const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height);
      const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 7000), scale: 1 } });
      fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64'));
    };
    const H = `const $ = (q, r = document) => r.querySelector(q); const $$ = (q, r = document) => [...r.querySelectorAll(q)];
      const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''); const tid = (t) => $('[data-testid="' + t + '"]');`;

    // ── topo primeiro ──
    const topFirst = await waitFor(`${H} return !!tid('ig-profile') && /Alcance/.test(txt(tid('ig-kpi-alcance'))) && !/…/.test(txt(tid('ig-kpi-alcance')));`, 20000);
    const early = await ev(`${H} return { media: $$('[data-testid="ig-media"]').length };`);
    check('carrega o topo primeiro (perfil e cartões aparecem antes dos conteúdos)', topFirst && early.media === 0, JSON.stringify(early));
    const top = await ev(`${H} const k = (id) => txt($('[data-testid="ig-kpi-' + id + '"] .igx-big')); const d = (id) => txt($('[data-testid="ig-kpi-' + id + '"] [data-testid="ig-delta"]'));
      return { user: txt(tid('ig-username')), seg: txt(tid('ig-count-seguidores')), seguindo: txt(tid('ig-count-seguindo')), posts: txt(tid('ig-count-posts')), avatar: !!tid('ig-avatar'),
        n: $$('[data-testid^="ig-kpi-"]').filter((e) => /^ig-kpi-[a-z]+$/.test(e.dataset.testid)).length, ganhos: k('seguidores'), alcance: k('alcance'), views: k('visualizacoes'), engaj: k('engajadas'), inter: k('interacoes'), visitas: k('visitas'), bio: k('bio'),
        dAlc: d('alcance'), dViews: d('visualizacoes'), dInter: d('interacoes'), dSeg: d('seguidores'), segSub: txt(tid('ig-kpi-seguidores')) };`);
    check('topo: foto, @store_triumph, seguidores, seguindo e nº de posts', top.avatar && top.user === '@store_triumph' && top.seg === '12.840seguidores' && top.seguindo === '512seguindo' && top.posts === '431posts', JSON.stringify(top));
    check('7 cartões: seguidores ganhos (líquido), alcance, visualizações, contas com engajamento, interações, visitas ao perfil, toques na bio',
      top.n === 7 && top.ganhos === '+300' && top.alcance === '42,0 mil'.replace(',0', '') && top.views === '98,0 mil'.replace(',0', '') && top.engaj === '3.100' && top.inter === '5.200' && top.bio === '340' && /\+420 novos · −120 saíram/.test(top.segSub), JSON.stringify(top));
    check('comparação com o período anterior ▲▼', /^▲ 20% vs\. 30 dias antes$/.test(top.dAlc) && /^▼ 11%/.test(top.dViews) && /^= 0%/.test(top.dInter) && /^▲ 50%/.test(top.dSeg), JSON.stringify([top.dAlc, top.dViews, top.dInter, top.dSeg]));
    check('métrica recusada pela Meta (visitas ao perfil): cartão "—" e aviso, sem quebrar a página', top.visitas === '—' && await waitFor(`${H} return /métrica "profile_views" não aceita pela Meta/.test(txt(tid('ig-warnings')));`, 5000), top.visitas);

    // ── gráfico + ranking ──
    const loaded = await waitFor(`${H} return $$('[data-testid="ig-media"]').length === 6 && !!$('[data-testid="ig-chart-followers"] svg .recharts-bar-rectangle') && !!$('[data-testid="ig-chart-reach"] svg .recharts-line');`, 15000);
    const chart = await ev(`${H} return { bars: $$('[data-testid="ig-chart-followers"] .recharts-bar-rectangle').length, lines: $$('[data-testid="ig-chart-reach"] .recharts-line').length, legend: txt(tid('ig-charts')) };`);
    check('gráfico diário: seguidores ganhos/perdidos (barras) e alcance/visualizações (linhas)', loaded && chart.bars >= 30 && chart.lines === 2 && /Ganhos/.test(chart.legend) && /Perdidos/.test(chart.legend) && /Visualizações/.test(chart.legend), JSON.stringify(chart));
    const rank = await ev(`${H} return $$('[data-testid="ig-media"]').map((c) => ({ id: c.dataset.id, kind: c.dataset.kind, badge: txt($('[data-testid="ig-badge"]', c)), v: txt($('[data-testid="ig-media-value"]', c)), img: !!$('[data-testid="ig-thumb"]', c) && $('[data-testid="ig-thumb"]', c).complete && $('[data-testid="ig-thumb"]', c).naturalWidth > 0 }));`);
    check('ranking: miniaturas, selos Reel/Carrossel/Foto, ordenado por Visualizações', rank.map((r: any) => r.id.slice(-1)).join('') === '123456' && rank[0].badge === 'Reel' && rank[2].badge === 'Carrossel' && rank[4].badge === 'Foto' && rank.every((r: any) => r.img) && rank[0].v.startsWith('15,0 mil'.replace(',0', '')), JSON.stringify(rank)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const order = async (k: string) => { await ev(`${H} const el = tid('ig-sort'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '${k}'); el.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await sleep(150); return ev(`${H} return $$('[data-testid="ig-media"]').map((c) => c.dataset.id.slice(-1)).join('');`); };
    const bySaved = await order('saved'); const byEng = await order('engagement'); const byFollows = await order('follows');
    check('ordenar por Salvamentos, Taxa de engajamento e Seguidores gerados', bySaved === '314256' && byEng[0] === '3' && byFollows === '123456', JSON.stringify({ bySaved, byEng, byFollows }));
    await order('views');
    await shot('instagram-simples.png');

    // ── detalhe ──
    await ev(`${H} $('[data-testid="ig-media"][data-id="180000000000001"]').click(); return true;`);
    await waitFor(`${H} return !!tid('ig-detail');`);
    await sleep(300);
    const det = await ev(`${H} const d = tid('ig-detail'); const a = tid('ig-detail-open'); return { m: txt(tid('ig-detail-metrics')), cap: txt(tid('ig-detail-caption')), when: txt(tid('ig-detail-when')), href: a && a.href, target: a && a.target };`);
    check('detalhe: todas as métricas, legenda, data/hora, "Abrir no Instagram" (outra aba) e, no Reel, tempo médio e total assistido',
      /Visualizações15,0 mil|Visualizações15 mil/.test(det.m) && /Salvamentos150/.test(det.m) && /Seguidores gerados60/.test(det.m) && /Taxa de engajamento9,8%/.test(det.m) && /Tempo médio assistido9 s/.test(det.m) && /Tempo total assistido2 h/.test(det.m)
      && det.cap === 'Legenda do post 180000000000001 #relogio' && /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/.test(det.when) && det.href === 'https://www.instagram.com/p/180000000000001/' && det.target === '_blank', JSON.stringify(det));
    await shot('instagram-detalhe.png');
    await ev(`${H} tid('ig-detail-close').click(); return true;`);
    const closed = await waitFor(`${H} return !tid('ig-detail');`);
    await ev(`${H} $('[data-testid="ig-media"][data-id="180000000000003"]').click(); return true;`);
    await waitFor(`${H} return !!tid('ig-detail');`);
    const det2 = await ev(`${H} return txt(tid('ig-detail-metrics'));`);
    await ev(`${H} document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
    check('carrossel sem tempo assistido; fecha no X e no Esc', closed && !/Tempo médio/.test(det2) && await waitFor(`${H} return !tid('ig-detail');`), det2);

    // ── O que funciona ──
    const works = await ev(`${H} return { f: txt(tid('ig-works-format')), t: txt(tid('ig-works-times')), top: $$('[data-testid="ig-top-follows"]').map(txt), sv: $$('[data-testid="ig-top-saved"]').map(txt), fr: txt(tid('ig-freq-text')), why: $$('[data-testid="ig-why"]').length, tables: $$('#root .igx-table').length };`);
    check('"O que funciona": melhor formato (Reel), melhores dias/horários, top 3 seguidores e salvamentos, frequência × alcance, com "Por quê"',
      /Melhor formatoReel/.test(works.f) && /7\.500 de alcance médio/.test(works.f) && /Noite \(18h–24h\)/.test(works.t) && works.top.length === 3 && /60$/.test(works.top[0]) && works.sv.length === 3 && /400$/.test(works.sv[0]) && /Semanas com mais de|ritmo parecido/.test(works.fr) && works.why === 4 && works.tables === 0, JSON.stringify(works));

    // ── Completo ──
    await ev(`${H} tid('ig-mode-completo').click(); return true;`);
    const aud = await waitFor(`${H} return !!tid('ig-aud-city') && /Rio de Janeiro/.test(txt(tid('ig-aud-city')));`, 8000);
    const full = await ev(`${H} return { city: txt(tid('ig-aud-city')), age: txt(tid('ig-aud-age')), g: txt(tid('ig-aud-gender')), tables: $$('#root .igx-table').length };`);
    check('Completo: Público (cidades, faixa etária, gênero) e as tabelas de "O que funciona"; Simples não mostra o Público',
      aud && /^CidadesRio de Janeiro, Rio de Janeiro58%/.test(full.city) && /18-24.*25-34.*35-44/.test(full.age) && /Homens64%/.test(full.g) && full.tables >= 4 && works.tables === 0, JSON.stringify(full));
    await shot('instagram-completo.png');
    await ev(`${H} tid('ig-mode-simples').click(); return true;`);
    await sleep(150);
    check('volta para Simples', await ev(`${H} return !tid('ig-audience');`));

    // ── Atualizar e período ──
    const upd = await ev(`${H} return txt(tid('ig-updated'));`);
    const n0 = await ev(`return window.__GRAPH_CALLS.length;`);
    await ev(`${H} tid('ig-period-7').click(); return true;`);
    await waitFor(`${H} return tid('ig-period-7').getAttribute('aria-pressed') === 'true' && /7 dias antes/.test(txt(tid('ig-kpi-alcance'))) && $$('[data-testid="ig-media"]').length === 3;`, 10000);
    const in7 = await ev(`${H} return $$('[data-testid="ig-media"]').map((c) => c.dataset.id.slice(-1)).join('');`);
    await ev(`${H} tid('ig-period-30').click(); return true;`);
    await waitFor(`${H} return /30 dias antes/.test(txt(tid('ig-kpi-alcance'))) && $$('[data-testid="ig-media"]').length === 6;`, 10000);
    const n1 = await ev(`return window.__GRAPH_CALLS.length;`);
    await ev(`return (await new Promise((r) => setTimeout(r, 200)), true);`);
    const n1b = await ev(`return window.__GRAPH_CALLS.length;`);
    await ev(`${H} tid('ig-refresh').click(); return true;`);
    await waitFor(`return window.__GRAPH_CALLS.length > ${n1b};`, 8000);
    await waitFor(`${H} return !/Atualizando/.test(txt(tid('ig-refresh')));`, 15000);
    check('período 7 dias só mostra os posts dele; voltar para 30 usa o cache; Atualizar busca de novo; "Atualizado às HH:MM"',
      /^Atualizado às \d{2}:\d{2}$/.test(upd) && in7 === '135' && n1 > n0 && n1b === n1 && await ev(`return window.__GRAPH_CALLS.length;`) > n1b, JSON.stringify({ upd, in7, n0, n1, n1b }));

    // ── só leitura, token, login ──
    const calls = await ev(`return { all: window.__GRAPH_CALLS.every((c) => c.method === 'GET'), tok: window.__GRAPH_CALLS.every((c) => c.token === 'TOKEN-SECRETO'), imp: window.__GRAPH_CALLS.some((c) => /impressions/.test(c.metric || '')),
      fn: window.__FN_CALLS.every((b) => b.auth === 'Bearer jwt-do-erp' && b.method === 'POST' && ['account', 'media', 'media_detail'].includes(b.action)), writes: window.__WRITES.length, leak: /TOKEN-SECRETO/.test(document.documentElement.outerHTML) };`);
    check('só GET na Graph (simulada), função chamada com o login do ERP, token nunca aparece na página, nada grava no ERP',
      calls.all && calls.tok && !calls.imp && calls.fn && calls.writes === 0 && !calls.leak, JSON.stringify(calls));

    // ── celular ──
    await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(700);
    const mob = await ev(`${H} return { sw: document.documentElement.scrollWidth, kpis: getComputedStyle($('.igx-kpis')).gridTemplateColumns.split(' ').length, grid: getComputedStyle($('.igx-grid')).gridTemplateColumns.split(' ').length };`);
    check('celular (390 px): sem rolagem lateral, cartões em 2 colunas, grade com 2 conteúdos por linha', mob.sw <= 391 && mob.kpis === 2 && mob.grid === 2, JSON.stringify(mob));
    await shot('instagram-celular.png', 390);
    await s('Emulation.clearDeviceMetricsOverride');

    // ── função não publicada ──
    await ev(`window.__IG_404 = true; return true;`);
    await ev(`${H} tid('ig-refresh').click(); return true;`);
    const nf = await waitFor(`${H} return /precisa ser publicada/.test(txt(tid('ig-error')));`, 8000);
    check('função ainda não publicada: aviso claro "precisa ser publicada"', nf);

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
