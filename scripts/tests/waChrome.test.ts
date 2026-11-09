// Aba WhatsApp do ERP (Painel e Rastreamento) no Chrome REAL, sem npm install e sem o build do app:
//   node scripts/tests/waChrome.test.ts
// Empacota só a página WhatsApp com o esbuild que já vem com o Vite (node_modules/esbuild), trocando
// src/lib/supabase.ts pelo Supabase falso (scripts/tests/chrome/fakeSupabase.ts, dados em window.__DB), abre no
// Google Chrome instalado (headless, protocolo DevTools por pipe, sem rede) e confere (2.12.8):
//   - Painel: "Conversas ativas" e "Leads novos" separados, com (i);
//   - Rastreamento: os dois cartões; tabela com TODAS as conversas ativas, ordem pela última mensagem (mais recente
//     primeiro), "Página X de Y · N conversas", Próxima/Anterior funcionando (25 por página), filtro de etapa,
//     atualização "Ao vivo" sem voltar para a página 1, sem "Possíveis vendas não marcadas";
//   - Eventos enviados ao Facebook: Próxima vai para a 2ª página e o filtro Todos / Compras / Contatos.
// Opções: CHROME_PATH=..., HEADFUL=1, ROOT=<outra cópia do projeto> (para comparar com uma versão antiga).
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const ROOT = path.resolve(process.env.ROOT || PROJECT); // de onde vem o src (o node_modules é sempre o deste projeto)
const require = createRequire(path.join(PROJECT, 'package.json'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ── dados de teste (horas relativas a agora) ──
const MIN = 60000;
const iso = (ms: number) => new Date(ms).toISOString();
const spDay = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
function fixtures(now: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const chat = (n: number) => `55119000000${pad(n)}@c.us`;
  const activity: Record<string, unknown>[] = [];
  const days: Record<string, unknown>[] = [];
  const leads: Record<string, unknown>[] = [];
  // 60 conversas com mensagem do cliente hoje: a 01 é a mais recente (1 min atrás), a 60 a mais antiga (8 h 20)
  // 01–10: leads novos (começaram hoje); 11–60: conversas antigas
  for (let n = 1; n <= 60; n++) {
    const last = now - (n * 8 + 1) * MIN;
    const lead = n <= 10;
    activity.push({
      chat_id: chat(n), phone: `55119000000${pad(n)}`, name: `Cliente ${pad(n)}`, first_seen_at: iso(now - 90 * 24 * 60 * MIN),
      first_message_at: lead ? iso(last - 5 * MIN) : iso(now - 60 * 24 * 60 * MIN), last_message_at: iso(last),
      last_from: n % 2 ? 'cliente' : 'loja', last_customer_at: iso(last - (n % 2 ? 0 : MIN)), is_new_lead: lead ? true : false,
    });
    days.push({ chat_id: chat(n), day: spDay(last), from_customer: true, from_store: n % 2 === 0 });
    if (lead) leads.push({ id: `l${n}`, chat_id: chat(n), phone: `55119000000${pad(n)}`, first_message_at: iso(last - 5 * MIN), origin: n % 2 ? 'anuncio' : 'organico', ad_id: null, ad_title: n % 2 ? 'Promo' : null, last_message_at: iso(last) });
  }
  // conversa que NÃO falou no período (só a loja, ontem): não entra
  activity.push({ chat_id: chat(99), phone: '5511900000099', name: 'Só a loja', first_seen_at: iso(now - 30 * 24 * 60 * MIN), first_message_at: null, last_message_at: iso(now - 30 * 24 * 60 * MIN), last_from: 'loja', last_customer_at: null, is_new_lead: null });
  // vendas: 03 (lead), 15 e 40 (antigas)
  const sales = [3, 15, 40].map((n) => ({ id: `5a1e00${pad(n)}-0000-4000-8000-000000000000`, sale_date: spDay(now), created_at: iso(now - n * MIN), total_sale_price: 100 * n, customer_phone: `55119000000${pad(n)}`, customer_name: `Cliente ${pad(n)}`, wa_chat_id: chat(n), origin: null, status: 'em_separacao' }));
  // respostas a envios nossos: 20–30
  const sends: Record<string, unknown>[] = [];
  const replies: Record<string, unknown>[] = [];
  for (let n = 20; n <= 30; n++) {
    const sid = `5e4d00${pad(n)}-0000-4000-8000-000000000000`;
    sends.push({ id: sid, chat_id: chat(n), created_at: iso(now - (n * 8 + 30) * MIN), source: 'manual', source_id: null, item_id: null, status: 'enviado', origin: 'manual' });
    replies.push({ id: `r${n}`, chat_id: chat(n), replied_at: iso(now - (n * 8 + 2) * MIN), send_log_id: sid, minutes: 28 });
  }
  // 120 eventos ao Facebook no período: pares = Compra, ímpares = Contato
  const events = Array.from({ length: 120 }, (_, i) => ({
    event_id: `ev${String(i).padStart(3, '0')}`, chat_id: chat((i % 60) + 1), contact_name: `Cliente ${pad((i % 60) + 1)}`, value: i % 2 ? null : 100 + i,
    ad_id: null, ad_title: null, test: false, status: 'enviado', error: null, created_at: iso(now - (i + 1) * 5 * MIN), event_name: i % 2 ? 'Contact' : 'Purchase', sale_id: null, sale_link_set_chat: null,
  }));
  // régua da extensão (automação AUTO): Follow 1 para os leads 01–05 e Follow 2 para 01–03 (logo depois da 1ª mensagem)
  const AUTO = 'a0000000-0000-4000-8000-0000000000aa';
  const IT1 = 'b0000000-0000-4000-8000-0000000000b1';
  const IT2 = 'b0000000-0000-4000-8000-0000000000b2';
  for (let n = 1; n <= 5; n++) {
    const last = now - (n * 8 + 1) * MIN;
    sends.push({ id: `5e4d10${pad(n)}-0000-4000-8000-000000000000`, chat_id: chat(n), created_at: iso(last - 3 * MIN), source: 'follow', source_id: AUTO, item_id: IT1, status: 'enviado', origin: 'automacao', follow_step: null });
    if (n <= 3) sends.push({ id: `5e4d20${pad(n)}-0000-4000-8000-000000000000`, chat_id: chat(n), created_at: iso(last - 2 * MIN), source: 'follow', source_id: AUTO, item_id: IT2, status: 'enviado', origin: 'automacao', follow_step: null });
  }
  return {
    wa_chat_activity: activity, wa_chat_activity_days: days, wa_leads: leads, sales, wa_send_log: sends, wa_replies: replies, wa_conversion_events: events,
    wa_ad_attribution: [], wa_chat_names: [], wa_settings: [], wa_flows: [], wa_campaigns: [],
    wa_items: [{ id: IT1, title: 'Follow 1', follow_step: null }, { id: IT2, title: 'Follow 2', follow_step: null }],
    wa_automations: [{ id: AUTO, name: 'Régua teste' }],
  };
}

// ── pacote da página ──
async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  const fake = path.join(HERE, 'chrome', 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'harness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'fake-supabase', setup(b: any) {
      b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: fake }));
      b.onResolve({ filter: /src\/pages\/WhatsApp$/ }, () => ({ path: path.join(ROOT, 'src', 'pages', 'WhatsApp.tsx') }));
    } }],
  });
}

// ── CDP por pipe (fd 3 = escrita, fd 4 = leitura; mensagens separadas por \0) ──
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

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-erp-'));
  await bundle(dir);
  const now = Date.now();
  fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(fixtures(now))}; window.__TSP_LIVE_MS = 1500;`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>ERP WhatsApp</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f5f5f5;--bg-hover:#eee;--border-main:#ddd}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#fafafa}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-erp-chrome-'));
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
    await s('Runtime.enable');
    await s('Page.enable');
    await s('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
    // SHOTS_DIR=…: print da página inteira (para conferir o visual)
    const shot = async (name: string) => { if (!process.env.SHOTS_DIR) return; await sleep(500); const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height); const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1366, height: Math.min(h, 6000), scale: 1 } }); fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64')); };
    const H = `const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : '');
      const btn = (t, root = document) => [...root.querySelectorAll('button')].find((b) => txt(b) === t);
      const eyebrowOf = (label) => [...document.querySelectorAll('div')].find((d) => d.firstElementChild && d.firstElementChild.tagName === 'SPAN' && txt(d.firstElementChild) === label && txt(d) === label);
      const card = (label) => { const e = eyebrowOf(label); return e ? { eb: e, children: [e, e.nextElementSibling && (e.nextElementSibling.firstElementChild || e.nextElementSibling)], querySelector: (q) => e.querySelector(q) } : null; };
      const section = (title) => [...document.querySelectorAll('section')].find((x) => { const h = x.querySelector('h2,h3'); return h && txt(h).startsWith(title); });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // paginador: o marcado (data-testid) ou, numa versão antiga, o bloco com "Página X de Y" e o botão Próxima
      const pg = (root) => (root ? root.querySelector('[data-testid$="-pager"]') || [...root.querySelectorAll('div')].find((d) => [...d.children].some((ch) => ch.tagName === 'SPAN' && /^Página \\d/.test(txt(ch))) && btn('Próxima', d)) || null : null);`;

    // ── Painel ──
    const panelOk = await waitFor(`${H} return !!card('Conversas ativas') && !!card('Leads novos');`, 15000);
    const panel = await ev(`${H} const v = (l) => { const c = card(l); return c ? txt(c.children[1]).split(' ')[0] : null; };
      return { active: v('Conversas ativas'), leads: v('Leads novos'), infoActive: !!(card('Conversas ativas') || {}).querySelector?.('button[aria-label*="Conversas ativas"]'), infoLeads: !!(card('Leads novos') || {}).querySelector?.('button[aria-label*="Leads novos"]') };`).catch((e) => ({ err: String(e) }));
    check('Painel: "Conversas ativas" (60) e "Leads novos" (10) separados, cada um com (i)', panelOk && panel.active === '60' && panel.leads === '10' && panel.infoActive && panel.infoLeads, JSON.stringify(panel));
    const p2 = await ev(`${H} const t = txt(document.body); return { cards: document.querySelectorAll('[data-testid="panel-cards"] > div').length, awaiting: !!card('Aguardando 1ª resposta agora'),
      daily: t.includes('Leads × vendas por dia'), heat: t.includes('Quando os leads chegam'), repeated: ['Funil dos follow-ups', 'Resultado por mensagem rápida', 'Automações e disparos', 'Origem das conversas', 'Primeira mensagem'].filter((x) => t.includes(x)) };`);
    check('Painel ("como estou?"): 8 cartões (com "Aguardando 1ª resposta agora"), "Leads × vendas por dia" e o mapa de horários; sem funil, tabela de conversas nem origem por dia',
      p2.cards === 8 && p2.awaiting && p2.daily && p2.heat && p2.repeated.length === 0, JSON.stringify(p2));

    await shot('painel.png');
    // ── Rastreamento ──
    await ev(`${H} btn('Rastreamento').click(); return true;`);
    const trackOk = await waitFor(`${H} return !!document.querySelector('[data-testid="track-table"] tbody tr');`, 15000);
    const rows = `[...document.querySelectorAll('[data-testid="track-table"] tbody tr')].map((tr) => txt(tr.cells[0]).split(' (')[0])`;
    const pager = `txt((pg(section('Conversas')) || document.createElement('i')).querySelector('span'))`;
    const t1 = await ev(`${H} const t = txt(document.body); const tv = (id) => txt(document.querySelector('[data-testid="' + id + '-value"]'));
      return { active: tv('track-active'), ad: tv('track-ad'), un: tv('track-untracked'), awaiting: tv('track-awaiting'), journey: tv('track-journey-days'), rows: ${rows}, pager: ${pager},
        unmarked: t.includes('Possíveis vendas não marcadas'), live: !!document.querySelector('[data-testid="track-live"]'),
        sections: ['track-filters', 'track-overview', 'track-gauge', 'track-origin', 'track-funnel', 'track-sales', 'track-conversations'].filter((id) => !document.querySelector('[data-testid="' + id + '"]')),
        funnel: [...document.querySelectorAll('[data-testid="track-funnel-step"]')].map((x) => txt(x)), report: !!document.querySelector('[data-testid="track-report"]'),
        salesN: tv('track-sales-n'), totals: txt(document.querySelector('[data-testid="track-totals"]')) };`).catch((e) => ({ err: String(e) }));
    check('Rastreamento (Tintim): aguardando 1ª resposta (2) e tempo de jornada no topo; filtros e "Baixar relatório"; visão geral 60 ativas = 5 Meta Ads + 55 não rastreadas, meia-lua, origem, funil Fez contato → Comprou, vendas',
      trackOk && t1.active === '60' && t1.ad === '5' && t1.un === '55' && t1.awaiting === '2' && /dia/.test(t1.journey) && t1.sections.length === 0 && t1.report
      && JSON.stringify(t1.funnel) === '["Fez contato60 (100,0%)","Comprou3 (5,0%)"]' && t1.salesN === '1' && /60 Total5 Meta Ads55 Não rastreada/.test(t1.totals),
      JSON.stringify({ active: t1.active, ad: t1.ad, un: t1.un, awaiting: t1.awaiting, journey: t1.journey, sections: t1.sections, funnel: t1.funnel, salesN: t1.salesN, totals: t1.totals }));
    check('Rastreamento: sem "Possíveis vendas não marcadas"', trackOk && t1.unmarked === false);
    await shot('rastreamento.png');
    check('Conversas: todas as ativas (não só leads), ordem pela última mensagem (mais recente primeiro), 25 por página',
      trackOk && Array.isArray(t1.rows) && t1.rows.length === 25 && t1.rows[0].startsWith('Cliente 01') && t1.rows[1].startsWith('Cliente 02') && t1.rows[24].startsWith('Cliente 25') && t1.pager === 'Página 1 de 3 · 60 conversas',
      JSON.stringify({ first: (t1.rows || []).slice(0, 3), n: (t1.rows || []).length, pager: t1.pager }));
    // cada bloco segue mesmo se o anterior quebrar (para ver tudo o que falha de uma vez)
    const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { check(name, false, String((e as Error).message || e).split('\n')[0]); } };
    await step('Conversas: paginação, ao vivo e filtro de etapa', async () => {
    await ev(`${H} btn('Próxima', pg(section('Conversas'))).click(); return true;`);
    await sleep(300);
    const t2 = await ev(`${H} return { rows: ${rows}, pager: ${pager} };`);
    await ev(`${H} btn('Próxima', pg(section('Conversas'))).click(); return true;`);
    await sleep(300);
    const t3 = await ev(`${H} return { rows: ${rows}, pager: ${pager}, next: btn('Próxima', pg(section('Conversas'))).disabled };`);
    await ev(`${H} btn('Anterior', pg(section('Conversas'))).click(); return true;`);
    await sleep(300);
    const t4 = await ev(`${H} return { rows: ${rows}, pager: ${pager} };`);
    check('Conversas: "Próxima" vai para a página 2 (Cliente 26…) e a 3 (10 linhas, Próxima desligada); "Anterior" volta para a 2',
      t2.pager === 'Página 2 de 3 · 60 conversas' && t2.rows[0].startsWith('Cliente 26') && t3.pager === 'Página 3 de 3 · 60 conversas' && t3.rows.length === 10 && t3.next === true
      && t4.pager === 'Página 2 de 3 · 60 conversas' && t4.rows[0].startsWith('Cliente 26'), JSON.stringify({ t2: [t2.pager, t2.rows[0]], t3: [t3.pager, t3.rows.length, t3.next], t4: [t4.pager, t4.rows[0]] }));

    // atualização ao vivo (no teste a cada 1,5 s): chega uma conversa nova; continua na página 2; ela aparece no topo da 1
    await ev(`window.__DB.wa_chat_activity.push({ chat_id: '5511900000077@c.us', phone: '5511900000077', name: 'Cliente Nova', first_seen_at: new Date().toISOString(), first_message_at: new Date().toISOString(), last_message_at: new Date().toISOString(), last_from: 'cliente', last_customer_at: new Date().toISOString(), is_new_lead: true });
      window.__DB.wa_chat_activity_days.push({ chat_id: '5511900000077@c.us', day: new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10), from_customer: true, from_store: false }); return true;`);
    const liveOk = await waitFor(`${H} return ${pager} === 'Página 2 de 3 · 61 conversas';`, 8000);
    const t5 = await ev(`${H} return { pager: ${pager}, first: ${rows}[0], live: txt(document.querySelector('[data-testid="track-live"]')) };`);
    await ev(`${H} btn('Anterior', pg(section('Conversas'))).click(); return true;`);
    await sleep(300);
    const t6 = await ev(`${H} return { rows: ${rows}, active: txt(document.querySelector('[data-testid="track-active-value"]')) };`);
    check('Ao vivo: atualiza sozinha (selo "Ao vivo"), sem voltar para a página 1 (a 2 agora começa pela Cliente 25); a conversa nova aparece no topo e conta nos cartões',
      liveOk && /Ao vivo/.test(t5.live) && t5.first.startsWith('Cliente 25') && t6.rows[0].startsWith('Cliente Nova') && t6.active === '61', JSON.stringify({ t5, t6: { first: t6.rows[0], active: t6.active } }));

    // filtro de etapa
    const stage = async (label: string) => { await ev(`${H} btn(${JSON.stringify(label)}, document.querySelector('[data-testid="track-stage"]')).click(); return true;`); await sleep(250); return ev(`${H} return { rows: ${rows}, pager: ${pager}, stages: [...document.querySelectorAll('[data-testid="track-table"] tbody tr')].map((tr) => txt(tr.cells[2])) };`); };
    await ev(`${H} btn('Próxima', pg(section('Conversas'))).click(); return true;`);
    const sBought = await stage('Comprou');
    const sReplied = await stage('Respondeu');
    const sContact = await stage('Só fez contato');
    const sAll = await stage('Todas');
    check('Filtro de etapa: Comprou (3, com valor) / Respondeu (11) / Só fez contato (47) / Todas (61), voltando para a página 1',
      sBought.pager === 'Página 1 de 1 · 3 conversas' && sBought.stages.every((x: string) => /^Comprou\s*R\$/.test(x)) && sReplied.pager === 'Página 1 de 1 · 11 conversas' && sReplied.stages.every((x: string) => x.startsWith('Respondeu'))
      && sContact.pager === 'Página 1 de 2 · 47 conversas' && sContact.stages.every((x: string) => x.startsWith('Fez contato')) && sAll.pager === 'Página 1 de 3 · 61 conversas',
      JSON.stringify({ b: [sBought.pager, sBought.stages], r: sReplied.pager, c: sContact.pager, a: sAll.pager }));
    });

    // "Ver conversas" (aguardando 1ª resposta) filtra a tabela; 👁 abre a linha do tempo na lateral
    await step('Vendas: data do primeiro contato × data da venda', async () => {
      await ev(`${H} btn('Data da venda', document.querySelector('[data-testid="track-sales"]')).click(); return true;`);
      const vOk = await waitFor(`${H} return txt(document.querySelector('[data-testid="track-sales-n-value"]')) === '3';`, 3000);
      const v = await ev(`${H} return { n: txt(document.querySelector('[data-testid="track-sales-n-value"]')), v: txt(document.querySelector('[data-testid="track-sales-v-value"]')), rep: !!document.querySelector('[data-testid="track-sales-report"]') };`);
      await ev(`${H} btn('Data do primeiro contato', document.querySelector('[data-testid="track-sales"]')).click(); return true;`);
      check('Vendas: "Data da venda" mostra as 3 vendas do período (R$ 5.800; "Data do primeiro contato" só a do lead novo) e "Baixar relatório de vendas"',
        vOk && /R\$\s5\.800/.test(v.v) && v.rep, JSON.stringify(v));
    });
    await step('Conversas: aguardando 1ª resposta e detalhes', async () => {
      await ev(`${H} document.querySelector('[data-testid="track-see-awaiting"]').click(); return true;`);
      const awOk = await waitFor(`${H} return ${pager} === 'Página 1 de 1 · 3 conversas';`, 5000);
      const aw = await ev(`${H} return { rows: ${rows}, on: document.querySelector('[data-testid="track-awaiting-filter"]').getAttribute('aria-pressed') };`);
      await ev(`${H} document.querySelector('[data-testid="track-awaiting-filter"]').click(); return true;`);
      const offOk = await waitFor(`${H} return ${pager} === 'Página 1 de 3 · 61 conversas';`, 5000);
      check('"Ver conversas": a tabela mostra só as 3 aguardando a 1ª resposta (a nova, a 07 e a 09); o botão desliga o filtro',
        awOk && aw.on === 'true' && JSON.stringify(aw.rows.map((x: string) => x.slice(0, 12)).sort()) === JSON.stringify(['Cliente 07(1', 'Cliente 09(1', 'Cliente Nova'].sort()) && offOk, JSON.stringify(aw));
      await ev(`${H} [...document.querySelectorAll('[data-testid="track-table"] tbody tr')].find((tr) => txt(tr.cells[0]).startsWith('Cliente 03')).querySelector('[data-testid="track-details"]').click(); return true;`);
      const drOk = await waitFor(`${H} return !!document.querySelector('[data-testid="track-drawer"]');`, 5000);
      const dr = await ev(`${H} const d = document.querySelector('[data-testid="track-drawer"]'); return { name: txt(d.querySelector('div div')), items: [...d.querySelectorAll('[data-testid="track-timeline"] li')].map((li) => txt(li)) };`);
      await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
      const closed = await waitFor(`${H} return !document.querySelector('[data-testid="track-drawer"]');`, 3000);
      check('👁 detalhes da conversa: lateral com a linha do tempo (1º contato, anúncio, follow-ups da régua, venda, eventos do Facebook); Esc fecha',
        drOk && /Cliente 03/.test(dr.name) && dr.items.some((x: string) => /1º contato/.test(x)) && dr.items.some((x: string) => /anúncio/.test(x)) && dr.items.filter((x: string) => /follow-up da automação “Follow \d”/.test(x)).length === 2
        && dr.items.some((x: string) => /Comprou R\$/.test(x)) && dr.items.some((x: string) => /Facebook/.test(x)) && closed, JSON.stringify(dr));
    });

    // ── Eventos enviados ao Facebook ──
    await step('Eventos ao Facebook: paginação e filtro', async () => {
    const fbSec = `section('Eventos enviados ao Facebook')`;
    const fbRows = `[...${fbSec}.querySelectorAll('[data-testid="conv-row"]')].map((tr) => tr.cells[3].textContent + '|' + tr.cells[1].textContent)`;
    const fbPager = `txt((pg(${fbSec}) || document.createElement('i')).querySelector('span'))`;
    await waitFor(`${H} return ${fbSec}.querySelectorAll('[data-testid="conv-row"]').length > 0;`, 10000);
    const f1 = await ev(`${H} return { rows: ${fbRows}, pager: ${fbPager} };`);
    await ev(`${H} btn('Próxima', pg(${fbSec})).click(); return true;`);
    const f2ok = await waitFor(`${H} return ${fbPager} === 'Página 2 de 3 · 120 eventos';`, 5000);
    const f2 = await ev(`${H} return { rows: ${fbRows}, pager: ${fbPager} };`);
    check('Eventos ao Facebook: "Próxima" vai para a 2ª página (outros eventos) — "Página 2 de 3 · 120 eventos"',
      f1.pager === 'Página 1 de 3 · 120 eventos' && f1.rows.length === 50 && f2ok && f2.rows.length === 50 && f2.rows[0] !== f1.rows[0], JSON.stringify({ f1: [f1.pager, f1.rows[0]], f2: [f2.pager, f2.rows[0]] }));
    const fb = async (label: string) => { await ev(`${H} btn(${JSON.stringify(label)}, ${fbSec}.querySelector('[data-testid="conv-kind"]')).click(); return true;`); await sleep(400); return ev(`${H} return { rows: ${fbRows}, pager: ${fbPager} };`); };
    const fBuy = await fb('Compras');
    const fCon = await fb('Contatos');
    const fAll = await fb('Todos');
    check('Eventos ao Facebook: filtro Todos / Compras (60) / Contatos (60), voltando para a página 1',
      fBuy.pager === 'Página 1 de 2 · 60 eventos' && fBuy.rows.every((x: string) => x.startsWith('Compra|')) && fCon.pager === 'Página 1 de 2 · 60 eventos' && fCon.rows.every((x: string) => x.startsWith('Contato|')) && fAll.pager === 'Página 1 de 3 · 120 eventos',
      JSON.stringify({ b: fBuy.pager, c: fCon.pager, a: fAll.pager }));
    });

    // ── Resultados ──
    await step('Resultados: funil por caminho', async () => {
      await ev(`${H} btn('Resultados').click(); return true;`);
      const resOk = await waitFor(`${H} return !!document.querySelector('[data-testid="res-path"]');`, 15000);
      await sleep(400); await shot('resultados.png');
      const res = await ev(`${H} const p = document.querySelector('[data-testid="res-path"]'); const t = txt(document.body);
        return { title: txt(p.querySelector('[data-testid="res-path-title"]')), head: txt(p.querySelector('[data-testid="res-path-head"]')),
          reached: [...p.querySelectorAll('[data-testid="res-reached"]')].map((x) => txt(x)), follow: [...p.querySelectorAll('[data-testid="res-follow"]')].map((x) => txt(x)),
          resp: txt(p.querySelector('[data-testid="res-resp"]')), buy: [...p.querySelectorAll('[data-testid="res-buy"]')].map((x) => txt(x)),
          msgs: document.querySelectorAll('[data-testid="res-msg"]').length, footer: txt(document.querySelector('[data-testid="res-footer"]')),
          sections: ['res-acc', 'res-camps'].filter((id) => !document.querySelector('[data-testid="' + id + '"]')),
          repeated: ['Leads × vendas por dia', 'Origem das conversas', 'Visão geral das conversas'].filter((x) => t.includes(x)) };`);
      check('Resultados ("meus follow-ups funcionam?"): bloco da régua "FOLLOW 1 → FOLLOW 2" com "5 entraram · 1 compraram", etapas 5 → 3 conversas com respostas, compras e "seguiram"; mensagens, acumulados, disparos e rodapé; nada repetido das outras abas',
        resOk && res.title === 'Follow 1 → Follow 2' && /^5 entraram · 1 compraram \(20%\) · R\$/.test(res.head) && JSON.stringify(res.reached) === '["5 conversas","3 conversas"]'
        && /^↓ 60% seguiram/.test(res.follow[0]) && /responderam/.test(res.resp) && /^💰 1 compraram/.test(res.buy[1]) && res.msgs === 2 && /^Vendas pelo WhatsApp: 3/.test(res.footer) && res.sections.length === 0 && res.repeated.length === 0,
        JSON.stringify(res));
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
