// Gerenciador de Anúncios novo (FASE 1, só leitura) no Chrome REAL, sem npm install e sem o build do app:
//   node scripts/tests/adChrome.test.ts            (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Empacota só a página (scripts/tests/chrome/adHarness.tsx) com o esbuild do Vite, Supabase falso (dados em window.__DB)
// e a Meta falsa (window.__META, respondida no lugar da edge function ad-manager). Confere:
//   - topo "Como estou?" (6 números com ▲▼), 4 cartões de decisão (clicar filtra), "Para onde foi o seu dinheiro";
//   - cartão por criativo: miniatura, ROAS real com a faixa (ótimo/bom/ok/ruim), funil, desgaste, diagnóstico,
//     recomendação, "Por quê?", "Modelos vendidos", "Ver anúncio" (outra aba);
//   - Simples × Completo (Conferir com a Meta, Mapa de horários, Tempo até a venda), Metas gravando SÓ
//     system_config "ads_goals", Atualizar com "Atualizado às HH:MM", cache de 5 min, celular sem rolagem lateral,
//     "Versão antiga" e volta; nenhuma outra gravação e nenhum erro no console.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// ── dados de teste (dias relativos a hoje, horário de SP) ──
const DAY = 86400000;
const spDay = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
const at = (dayOffset: number, hour: number, now: number) => new Date(Date.parse(`${spDay(now - dayOffset * DAY)}T${String(hour).padStart(2, '0')}:00:00-03:00`)).toISOString();
const SVG = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/></svg>`)}`;

function fixtures(now: number) {
  const leads: any[] = []; const sales: any[] = []; const items: any[] = []; const sends: any[] = []; const replies: any[] = [];
  let n = 0;
  const conv = (ad: string, title: string, phone: string, d: number, h: number, reply: boolean) => {
    const chat = `${phone}@c.us`; const t = at(d, h, now);
    leads.push({ id: ++n, chat_id: chat, phone, first_message_at: t, origin: 'anuncio', ad_id: ad, ad_title: title });
    sends.push({ id: `s${n}`, chat_id: chat, created_at: new Date(Date.parse(t) + 4 * 60000).toISOString(), source: 'manual', source_id: null, item_id: null, status: 'enviado', origin: 'manual' });
    if (reply) replies.push({ id: n, chat_id: chat, replied_at: new Date(Date.parse(t) + 3600000).toISOString(), send_log_id: `s${n}`, minutes: 5 });
    return chat;
  };
  const sale = (id: string, total: number, cost: number, chat: string, phone: string, d: number, model: string) => {
    sales.push({ id, sale_date: spDay(now - d * DAY), created_at: at(d, 18, now), total_sale_price: total, customer_phone: phone, customer_name: 'Cliente', wa_chat_id: chat, origin: 'anuncio', status: 'finalizado', total_cost: cost, delivery_fee: 0, delivery_cost: 0 });
    items.push({ sale_id: id, quantity: 1, products: { model, color: 'Preto', category: 'smartwatch' } });
  };
  for (let i = 0; i < 10; i++) { const ph = `55219100010${String(i).padStart(2, '0')}`; const c = conv('120210000000111', 'Relógio A', ph, 5 - (i % 4), 10 + i, i < 6); if (i < 3) sale(`va${i}`, 1000, 400, c, ph, 1, 'W10'); }
  for (let i = 0; i < 8; i++) { const ph = `55219100020${String(i).padStart(2, '0')}`; const c = conv('120210000000222', 'Relógio B', ph, 4, 9 + i, i < 2); if (!i) sale('vb0', 1500, 700, c, ph, 1, 'Ultra 9'); }
  conv('120210000000333', 'Relógio C', '5521910003000', 1, 10, false);
  for (let i = 0; i < 6; i++) { const ph = `55219100040${String(i).padStart(2, '0')}`; const c = conv('120210000000444', 'Relógio D', ph, 3, 9 + i, i < 3); if (!i) sale('vd0', 1100, 500, c, ph, 2, 'W10'); }
  const daily: any[] = [];
  const spread = (ad: string, name: string, spend: number, imp: number, clk: number, purchases = 0) => {
    for (let d = 0; d < 7; d++) daily.push({ ad_id: ad, ad_name: name, adset_id: 's1', adset_name: 'Conjunto Brasil', campaign_id: 'c1', campaign_name: 'Mensagens WhatsApp', date: spDay(now - d * DAY), spend: spend / 7, impressions: imp / 7, clicks: clk / 7, reach: imp / 10, frequency: 1.4 + d * 0.01, conversations: 1, purchases: d === 0 ? purchases : 0 });
  };
  spread('120210000000111', 'Relógio A', 300, 30000, 600, 4); spread('120210000000222', 'Relógio B', 500, 50000, 1000); spread('120210000000333', 'Relógio C', 20, 2000, 30); spread('120210000000444', 'Relógio D', 200, 20000, 400);
  const creatives = [
    { id: '120210000000111', name: 'Relógio A', status: 'ACTIVE', thumbnail_url: SVG('#f97316'), image_url: null, is_video: false, video_url: null, preview_url: 'https://fb.me/adspreview/111' },
    { id: '120210000000222', name: 'Relógio B', status: 'ACTIVE', thumbnail_url: SVG('#ef4444'), image_url: null, is_video: true, video_url: null, preview_url: 'https://fb.me/adspreview/222' },
    { id: '120210000000333', name: 'Relógio C', status: 'PAUSED', thumbnail_url: SVG('#3b82f6'), image_url: null, is_video: false, video_url: null, preview_url: null },
    { id: '120210000000444', name: 'Relógio D', status: 'ACTIVE', thumbnail_url: SVG('#eab308'), image_url: null, is_video: false, video_url: null, preview_url: null },
  ];
  return {
    db: { wa_leads: leads, wa_ad_attribution: [], wa_send_log: sends, wa_replies: replies, sales, sale_items: items, wa_chat_names: [], wa_conversion_events: [], wa_chat_activity: [], wa_chat_activity_days: [], wa_items: [], wa_settings: [], system_config: [{ key: 'ad_tax_rate', value: '0.1' }] },
    meta: { daily, period: [{ ad_id: '120210000000111', reach: 20000, frequency: 1.5, impressions: 30000 }], creatives },
  };
}

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  const fake = path.join(HERE, 'chrome', 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'adHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: fake })); } }],
  });
}

function cdp(child: ChildProcess) {
  let seq = 0; let buf = '';
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners: ((m: any) => void)[] = [];
  (child.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let msg: any; try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id)!; pending.delete(msg.id); if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim())); else p.resolve(msg.result); }
      else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    (child.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn: (m: any) => void) => listeners.push(fn) };
}

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ads-'));
  await bundle(dir);
  const fx = fixtures(Date.now());
  fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(fx.db)}; window.__META = ${JSON.stringify(fx.meta)};`);
  const css = fs.existsSync(path.join(dir, 'app.css')) ? '<link rel="stylesheet" href="app.css">' : '';
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gerenciador de Anúncios</title>${css}
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f3f4f6;--bg-hover:#e5e7eb;--border-main:#e5e7eb}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ads-chrome-'));
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
    const page = targetInfos.find((t: any) => t.type === 'page');
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    c.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    });
    await s('Runtime.enable'); await s('Page.enable');
    await s('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
    const shot = async (name: string, width = 1366) => {
      if (!process.env.SHOTS_DIR) return;
      await sleep(400);
      const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height);
      const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 7000), scale: 1 } });
      fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64'));
    };
    const H = `const $ = (q, r = document) => r.querySelector(q); const $$ = (q, r = document) => [...r.querySelectorAll(q)];
      const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''); const tid = (t) => $('[data-testid="' + t + '"]');`;

    // ── topo ──
    const topOk = await waitFor(`${H} return $$('[data-testid^="ads-kpi-"]').length === 6 && !!tid('ads-cards');`, 20000);
    const top = await ev(`${H} const v = (k) => txt($('[data-testid="ads-kpi-' + k + '"] .adx-big'));
      return { gasto: v('gasto'), fat: v('faturamento'), lucro: v('lucro'), roas: v('roas'), cpv: v('cpv'), cpc: v('cpc'), deltas: $$('[data-testid^="ads-kpi-"]').map((e) => /▲|▼|—|= 0%/.test(txt(e))).every(Boolean),
        roasColor: getComputedStyle($('[data-testid="ads-kpi-roas"] .adx-big')).color, updated: txt(tid('ads-updated')) };`);
    // gasto 1.020 + 10% = 1.122; faturamento 3.000 + 1.500 + 1.100 = 5.600; produtos 1.200 + 700 + 500 = 2.400; lucro 2.078; ROAS 4,99
    check('topo "Como estou?": gasto com imposto, faturamento, lucro real, ROAS real, custo por venda e por conversa, todos com ▲▼',
      topOk && top.gasto === 'R$ 1.122' && top.fat === 'R$ 5.600' && top.lucro === 'R$ 2.078' && top.roas === '5,0×' && top.cpv === 'R$ 224,40' && top.cpc === 'R$ 44,88' && top.deltas, JSON.stringify(top));
    check('ROAS real do topo na cor da faixa "ok" (4 a 6: amarelo)', top.roasColor === 'rgb(234, 179, 8)', top.roasColor);
    check('"Atualizado às HH:MM"', /^Atualizado às \d{2}:\d{2}$/.test(top.updated), top.updated);

    // ── decisões + dinheiro ──
    const dec = await ev(`${H} return { cards: ['resolver','ajustar','escalar','acompanhar'].map((k) => txt(tid('ads-dec-' + k))), bar: txt(tid('ads-moneybar')) };`);
    check('4 cartões de decisão com quantidade e R$', dec.cards[0].startsWith('Resolver agora1 anúncio') && dec.cards[1].startsWith('Ajustar1 anúncio') && dec.cards[2].startsWith('Pode render mais1 anúncio') && dec.cards[3].startsWith('Acompanhar1 anúncio') && dec.cards[0].includes('R$ 550,00 gastos'), JSON.stringify(dec.cards));
    check('"Para onde foi o seu dinheiro": Dando resultado / Atenção / Poucos dados / Prejuízo com % e R$', ['Dando resultado', 'Atenção', 'Poucos dados', 'Prejuízo'].every((l) => dec.bar.includes(l)) && dec.bar.includes('Prejuízo 49%'), dec.bar);

    // ── cartões ──
    await waitFor(`${H} const i = $('[data-testid="ads-card"] [data-testid="ads-thumb"]'); return !!i && i.complete && i.naturalWidth > 0;`, 5000);
    const cardsInfo = await ev(`${H} return $$('[data-testid="ads-card"]').map((c) => ({ ad: c.dataset.ad, cat: c.dataset.category, tier: c.dataset.tier, name: txt($('[data-testid="ads-card-name"]', c)), roas: txt($('[data-testid="ads-card-roas"]', c)),
      roasColor: getComputedStyle($('[data-testid="ads-card-roas"]', c)).color, border: getComputedStyle(c).borderTopColor, action: txt($('[data-testid="ads-action"]', c)), reasons: $$('[data-testid="ads-reasons"] li', c).length,
      thumb: !!$('[data-testid="ads-thumb"]', c) && /^data:image/.test($('[data-testid="ads-thumb"]', c).src), loaded: !!$('[data-testid="ads-thumb"]', c) && $('[data-testid="ads-thumb"]', c).complete && $('[data-testid="ads-thumb"]', c).naturalWidth > 0, view: ($('[data-testid="ads-view"]', c) || {}).href || null, target: ($('[data-testid="ads-view"]', c) || {}).target || null,
      models: txt($('[data-testid="ads-models"]', c)), funnel: $$('[data-testid="ads-funnel"] > div', c).length, worst: !!$('[data-testid="ads-funnel"] [data-worst]', c), text: txt(c) }));`);
    const by = Object.fromEntries((cardsInfo as any[]).map((x) => [x.ad, x]));
    check('cartões agrupados: Resolver (B), Ajustar (D), Pode render mais (A), Acompanhar (C)', (cardsInfo as any[]).map((x) => x.ad).join() === '120210000000222,120210000000444,120210000000111,120210000000333' && by['120210000000111'].cat === 'escalar' && by['120210000000222'].cat === 'resolver' && by['120210000000444'].cat === 'ajustar' && by['120210000000333'].cat === 'acompanhar', JSON.stringify((cardsInfo as any[]).map((x) => [x.ad, x.cat])));
    check('faixas de ROAS nos cartões: A ótimo (verde forte), D ok (amarelo), B ruim (vermelho)',
      by['120210000000111'].tier === 'otimo' && by['120210000000111'].roasColor === 'rgb(21, 128, 61)' && by['120210000000444'].tier === 'ok' && by['120210000000444'].roasColor === 'rgb(234, 179, 8)' && by['120210000000222'].tier === 'ruim' && by['120210000000222'].roasColor === 'rgb(239, 68, 68)' && by['120210000000222'].border === 'rgb(239, 68, 68)',
      JSON.stringify(Object.values(by).map((x: any) => [x.ad, x.tier, x.roasColor, x.border])));
    check('cartão: miniatura, nome, campanha › conjunto, status, 6 números, funil de 5 etapas com a maior perda, desgaste',
      by['120210000000111'].thumb && by['120210000000222'].loaded && by['120210000000111'].text.includes('Mensagens WhatsApp › Conjunto Brasil') && by['120210000000111'].text.includes('Ativo') && by['120210000000333'].text.includes('Pausado') && !by['120210000000333'].text.includes('ROAS ruim') && by['120210000000333'].tier === '' && by['120210000000111'].funnel === 5 && by['120210000000222'].worst && by['120210000000111'].text.includes('Frequência'), JSON.stringify({ a: by['120210000000111'].thumb, bLoaded: by['120210000000222'].loaded, bWorst: by['120210000000222'].worst, c: by['120210000000333'].text.slice(0, 120) }));
    check('recomendação e diagnóstico (1 a 3 frases)', by['120210000000111'].action === '→ Pode subir orçamento 20%' && by['120210000000333'].action === '→ Esperar mais dados' && [by['120210000000222'].action, by['120210000000444'].action].every((a: string) => a === '→ Preparar criativo novo' || a === '→ Revisar oferta/atendimento') && Object.values(by).every((x: any) => x.reasons >= 1 && x.reasons <= 3), JSON.stringify(Object.values(by).map((x: any) => [x.ad, x.action, x.reasons])));
    check('"Modelos vendidos" e "Ver anúncio" em outra aba', by['120210000000111'].models.includes('W10 - Preto (3)') && by['120210000000111'].view === 'https://fb.me/adspreview/111' && by['120210000000111'].target === '_blank' && /adsmanager|facebook/.test(by['120210000000444'].view || ''), JSON.stringify([by['120210000000111'].models, by['120210000000111'].view, by['120210000000444'].view]));
    await ev(`${H} $('[data-ad="120210000000222"] [data-testid="ads-why"]').click(); return true;`);
    await sleep(200);
    const why = await ev(`${H} return txt($('[data-ad="120210000000222"] [data-testid="ads-why-box"]'));`);
    check('"Por quê?" mostra a regra e os números', why.includes('Regra: ROAS real abaixo de 4,0') && why.includes('ROAS real') && why.includes('Lucro real') && why.includes('Custo por venda'), why.slice(0, 200));
    await shot('anuncios-simples.png');

    // ── filtro pelas decisões ──
    await ev(`${H} tid('ads-dec-resolver').click(); return true;`);
    await sleep(200);
    const f1 = await ev(`${H} return { cards: $$('[data-testid="ads-card"]').map((c) => c.dataset.category), pressed: tid('ads-dec-resolver').getAttribute('aria-pressed') };`);
    await ev(`${H} tid('ads-filter-clear').click(); return true;`);
    await sleep(200);
    const f2 = await ev(`${H} return $$('[data-testid="ads-card"]').length;`);
    check('clicar num cartão de decisão filtra a lista; "Mostrar todas" volta', f1.cards.join() === 'resolver' && f1.pressed === 'true' && f2 === 4, JSON.stringify({ f1, f2 }));

    // ── Simples × Completo ──
    const simple = await ev(`${H} return ['ads-check', 'ads-hours', 'ads-time'].map((t) => !!tid(t));`);
    await ev(`${H} tid('ads-mode-completo').click(); return true;`);
    await waitFor(`${H} return !!tid('ads-check');`);
    const full = await ev(`${H} const chk = txt(tid('ads-check')); return { has: ['ads-check', 'ads-hours', 'ads-time'].map((t) => !!tid(t)), chk, cells: $$('[data-testid="ads-hours"] span[title]').length, time: txt(tid('ads-time')) };`);
    check('Simples: só topo + cartões; Completo: Conferir com a Meta, Mapa de horários e Tempo até a venda', simple.every((x: boolean) => !x) && full.has.every(Boolean) && full.cells === 168 && full.chk.includes('Meta +1') && full.time.includes('Até 5 min'), JSON.stringify({ simple, full: { ...full, chk: full.chk.slice(0, 160), time: full.time.slice(0, 160) } }));
    await shot('anuncios-completo.png');

    // ── Metas: só system_config "ads_goals" ──
    await ev(`${H} tid('ads-goals-btn').click(); return true;`);
    await waitFor(`${H} return !!tid('ads-goals');`);
    const g0 = await ev(`${H} return { cpa: tid('ads-goal-cpaTarget').value, profit: tid('ads-goal-profitMin').value, great: tid('ads-goal-roasGreat').value, good: tid('ads-goal-roasGood').value, ok: tid('ads-goal-roasOk').value };`);
    check('Metas: faixas padrão 7 / 6 / 4 e custo/lucro sugeridos pela média de 30 dias', g0.great === '7' && g0.good === '6' && g0.ok === '4' && g0.cpa !== '' && g0.profit !== '', JSON.stringify(g0));
    await ev(`${H} const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(tid('ads-goal-roasOk'), '5,5'); return true;`);
    await sleep(100);
    await ev(`${H} tid('ads-goals-save').click(); return true;`);
    await waitFor(`${H} return !tid('ads-goals');`);
    await sleep(300);
    const g1 = await ev(`${H} return { writes: window.__WRITES, d: $('[data-ad="120210000000444"]').dataset.tier, row: (window.__DB.system_config || []).find((r) => r.key === 'ads_goals') };`);
    const saved = g1.row ? JSON.parse(g1.row.value) : null;
    check('Salvar metas grava SÓ system_config "ads_goals" (nenhuma outra gravação) e a nova faixa já vale nos cartões',
      g1.writes.length === 1 && g1.writes[0].table === 'system_config' && g1.writes[0].op === 'upsert' && g1.writes[0].data.key === 'ads_goals' && saved && saved.roasOk === 5.5 && saved.roasGreat === 7 && g1.d === 'ruim',
      JSON.stringify({ writes: g1.writes, d: g1.d }));

    // ── Atualizar e cache ──
    const calls0 = await ev(`return window.__META_CALLS.filter((b) => b.part === 'metrics').length;`);
    await ev(`${H} tid('ads-period-30').click(); return true;`);
    await waitFor(`${H} return tid('ads-period-30').getAttribute('aria-pressed') === 'true' && $$('[data-testid="ads-card"]').length > 0;`);
    await ev(`${H} tid('ads-period-7').click(); return true;`);
    await waitFor(`${H} return $$('[data-testid="ads-card"]').length === 4;`);
    const calls1 = await ev(`return window.__META_CALLS.filter((b) => b.part === 'metrics').length;`);
    await ev(`${H} tid('ads-refresh').click(); return true;`);
    await waitFor(`return window.__META_CALLS.filter((b) => b.part === 'metrics').length > ${calls1};`, 8000);
    const calls2 = await ev(`return window.__META_CALLS.filter((b) => b.part === 'metrics').length;`);
    check('cache de 5 min por período (voltar para 7 dias não busca de novo; 30 dias já veio da sugestão de metas) e Atualizar busca de novo', calls1 === calls0 && calls2 === calls1 + 1, JSON.stringify({ calls0, calls1, calls2 }));
    const onlyRead = await ev(`return window.__META_CALLS.every((b) => b.action === 'dashboard');`);
    check('a página nova só chama a leitura "dashboard" da edge function (nada de toggle/update_budget)', onlyRead === true);

    // ── celular ──
    await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    const mob = await ev(`${H} return { sw: document.documentElement.scrollWidth, cols: getComputedStyle($('.adx-cards')).gridTemplateColumns.split(' ').length, top: getComputedStyle($('.adx-top')).gridTemplateColumns.split(' ').length };`);
    check('celular (390 px): sem rolagem lateral, 1 cartão por linha, topo em 2 colunas', mob.sw <= 391 && mob.cols === 1 && mob.top === 2, JSON.stringify(mob));
    await shot('anuncios-celular.png', 390);
    await s('Emulation.clearDeviceMetricsOverride');
    await sleep(300);

    // ── Meta fora do ar: o ERP continua ──
    await ev(`window.__META_FAIL = true; return true;`);
    await ev(`${H} tid('ads-refresh').click(); return true;`);
    await waitFor(`${H} return /Não consegui ler a Meta/.test(document.body.textContent);`, 8000);
    const fail = await ev(`${H} return { msg: /ad-manager precisa ser publicada/.test(document.body.textContent), fat: txt($('[data-testid="ads-kpi-faturamento"] .adx-big')) };`);
    check('Meta fora do ar / função sem a leitura nova: aviso de publicar a função e o faturamento do ERP continua', fail.msg && fail.fat === 'R$ 5.600', JSON.stringify(fail));
    await ev(`window.__META_FAIL = false; return true;`);

    // ── Versão antiga ──
    await ev(`${H} tid('ads-old-link').click(); return true;`);
    await waitFor(`${H} return !!tid('ads-new-link');`);
    const old = await ev(`${H} return { back: !!tid('ads-new-link'), url: location.search, newGone: !tid('ads-top') };`);
    await ev(`${H} tid('ads-new-link').click(); return true;`);
    const back = await waitFor(`${H} return !!tid('ads-top');`);
    check('"Versão antiga" abre a página antiga (com volta para a nova)', old.back && old.newGone && back, JSON.stringify(old));

    const writesEnd = await ev(`return window.__WRITES.length;`);
    check('nenhuma gravação além da meta salva', writesEnd === 1, String(writesEnd));
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
