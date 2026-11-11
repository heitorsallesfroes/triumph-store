// Instagram FASE 3 (Automações e Direct) no Chrome REAL, sem npm install e sem o build do app:
//   node scripts/tests/igAutoChrome.test.ts        (SHOTS_DIR=… salva prints; HEADFUL=1 mostra o Chrome)
// Empacota a página Instagram (chrome/igAutoHarness.tsx: Supabase falso + a edge function ig-manage DE VERDADE rodando
// no navegador com a Meta SIMULADA). Nada sai do computador. Confere:
//   - abas Direct e Automações liberadas (?aba= no endereço);
//   - Conectar: "Conectado como @store_triumph · token válido até DD/MM", alerta (< 7 dias), segredos que faltam
//     (botão desligado), passo a passo da Meta com as URLs, volta do login (?ig=conectado) e o botão levando ao
//     Login do Instagram com os escopos certos;
//   - chave geral "Automações do Instagram: desligadas" → ligadas em MODO TESTE (com confirmação), contas de teste,
//     antispam; a automação "Comentários → WhatsApp (cópia do ManyChat)" DESLIGADA com os textos do ManyChat;
//     ligar/desligar; métricas (disparos, DMs, cliques, conversas, vendas, R$, CTR);
//   - Nova automação: posts escolhidos (grade da Meta simulada), palavras-chave, erros, salva DESLIGADA;
//   - Direct: lista, "✅ foi para o WhatsApp" / "⏳ ainda não foi", filtro com contador, responder (24 h), "Mandar o
//     WhatsApp" (botão e fallback em texto), fora da janela desligado;
//   - Visão geral: cartão "Funil Instagram → WhatsApp → venda";
//   - celular sem rolagem lateral; grava SÓ system_config (ig_*) e ig_automations; nenhum erro no console.
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
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const findChrome = () => [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

// ── dados ──
const H = 3600000;
const SVG = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/></svg>`)}`;
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const L1 = '11111111-1111-4111-8111-000000000003';
const ANA = '6600000000000001'; const BIA = '6600000000000002'; const CAIO = '6600000000000003';
const MANYCHAT_DM = 'Olá, é um prazer ter você aqui no nosso perfil! Vi que comentou na nossa publicação e a boa notícia é que estamos com uma promoção top rolando nesse momento 🔥 Vou te deixar aqui abaixo o nosso WhatsApp, por lá temos o atendimento totalmente humanizado e personalizado, onde vamos te ajudar a escolher o seu novo smartwatch!';
function fixtures(now: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const auto = (id: string, o: Any) => ({ id, name: '', active: false, trigger: 'comentario', media_scope: 'todos', media_ids: [], keyword_mode: 'qualquer', keywords: [], public_replies: [], dm_texts: [], button_title: 'WhatsApp Loja', link_mode: 'frase', wa_phrase: null, link_id: null, code: '', position: 0, ...o });
  const run = (a: string, src: string, o: Any = {}) => ({ id: `r-${src}`, automation_id: a, source_id: src, source_kind: 'comentario', igsid: ANA, status: 'enviado', reason: null, public_reply: true, dm_sent: true, dm_fallback: false, test: false, created_at: iso(now - 2 * H), ...o });
  const W_ANA = '5521911110001@c.us';
  return {
    system_config: [
      { key: 'ig_automations_enabled', value: 'false' }, { key: 'ig_test_mode', value: 'true' }, { key: 'ig_test_accounts', value: '[]' }, { key: 'ig_dm_cooldown_hours', value: '24' },
      { key: 'ig_direct_dm', value: 'Olá, {nome}! Vou te deixar aqui abaixo o nosso WhatsApp 😊' }, { key: 'ig_direct_phrase', value: 'Olá! Vim pelo Direct do Instagram 😊' },
    ],
    ig_automations: [
      auto(A1, { name: 'Comentários → WhatsApp (cópia do ManyChat)', public_replies: ['Te enviei todos os detalhes no direct 🔥', 'Dá uma olhada no seu direct 👀', 'Oiii, iniciamos seu atendimento pelo direct'], dm_texts: [MANYCHAT_DM], wa_phrase: 'Olá! Vi o comentário no Instagram e quero saber da promoção 🔥', code: 'IG-A-COMENT' }),
      auto(A2, { name: 'Story → WhatsApp', trigger: 'story', dm_texts: ['Oi {nome}! Vem pro WhatsApp 😊'], link_mode: 'link', link_id: L1, code: 'IG-A-STORY', position: 1 }),
    ],
    ig_links: [{ id: L1, slug: 'stories', channel: 'stories', code: 'IG-STORIES', message: 'Olá! Vim pelo Instagram 😊', active: true, created_at: iso(now - 40 * 24 * H) }],
    ig_link_clicks: [{ link_id: L1, created_at: iso(now - 3 * H), device: 'Android', browser: 'Instagram', ip_hash: null }, { link_id: L1, created_at: iso(now - 2 * H), device: 'Android', browser: 'Instagram', ip_hash: null }],
    ig_automation_runs: [run(A1, 'c1'), run(A1, 'c2', { igsid: BIA, status: 'pulado', dm_sent: false, public_reply: false, reason: 'antispam' }), run(A2, 'm1', { source_kind: 'story', public_reply: false, igsid: CAIO })],
    ig_link_leads: [{ chat_id: W_ANA, phone: '5521911110001', first_message_at: iso(now - 2 * H + 10 * 60000), code: 'IG-A-COMENT', link_id: null }],
    wa_leads: [{ chat_id: W_ANA, phone: '5521911110001', first_message_at: iso(now - 2 * H + 10 * 60000), origin: 'organico', ad_id: null, ad_title: null, last_message_at: iso(now - H) }],
    sales: [{ id: '5a1e0001-0000-4000-8000-000000000001', sale_date: iso(now - H), created_at: iso(now - H), total_sale_price: 499.9, customer_phone: '5521911110001', customer_name: 'Ana', wa_chat_id: W_ANA, origin: 'organico', status: 'pago' }],
    ig_conversations: [
      { igsid: ANA, username: 'ana.souza', name: 'Ana Souza', profile_pic: SVG('#f97316'), origin: 'comentario', first_at: iso(now - 3 * H), last_at: iso(now - 2 * H), last_text: 'Olá, Ana! Vem pro WhatsApp', last_from: 'loja', last_customer_at: iso(now - 3 * H), wa_sent_at: iso(now - 2 * H), wa_code: 'IG-A-COMENT' },
      { igsid: BIA, username: 'bia', name: null, profile_pic: null, origin: 'dm', first_at: iso(now - 5 * H), last_at: iso(now - H), last_text: 'Quanto custa o relógio?', last_from: 'cliente', last_customer_at: iso(now - H), wa_sent_at: null, wa_code: null },
      { igsid: CAIO, username: 'caio', name: 'Caio', profile_pic: null, origin: 'story', first_at: iso(now - 40 * H), last_at: iso(now - 30 * H), last_text: 'lindo!', last_from: 'cliente', last_customer_at: iso(now - 30 * H), wa_sent_at: null, wa_code: null },
    ],
    ig_messages: [
      { mid: 'm.bia.1', igsid: BIA, from_me: false, kind: 'dm', text: 'Oi! Quanto custa o relógio?', attachment_type: null, automation_id: null, sent_at: iso(now - H) },
      { mid: 'm.ana.1', igsid: ANA, from_me: true, kind: 'dm', text: 'Olá, Ana! Vem pro WhatsApp\n[WhatsApp Loja] https://wa.me/…', attachment_type: 'template', automation_id: A1, sent_at: iso(now - 2 * H) },
    ],
    ig_comments: [{ comment_id: 'c1', media_id: '1801', igsid: ANA, username: 'ana.souza', text: 'quero!', parent_id: null, is_live: false, from_me: false, commented_at: iso(now - 3 * H) }],
    ig_webhook_log: [],
  };
}
const POSTS = [{ id: '1801', caption: 'Promo Black', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: SVG('#c026d3'), permalink: 'https://instagram.com/p/1', timestamp: '2026-11-10T10:00:00+0000' },
  { id: '1802', caption: 'Lançamento', media_type: 'IMAGE', media_product_type: 'FEED', media_url: SVG('#2563eb'), permalink: 'https://instagram.com/p/2', timestamp: '2026-11-09T10:00:00+0000' }];

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'igAutoHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'supabase', setup(b: Any) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: path.join(HERE, 'chrome', 'fakeSupabase.ts') })); } }],
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-auto-'));
  await bundle(dir);
  const now = Date.now();
  const acc = (days: number) => ({ ig_user_id: '17841442995645189', username: 'store_triumph', name: 'Triumph Store', picture_url: SVG('#111'), access_token: 'IGAA-token-secreto', token_expires_at: new Date(now + days * 24 * H).toISOString(), refreshed_at: null, refresh_tried_at: new Date(now).toISOString(), refresh_error: null, scopes: null, connected_at: new Date(now - 24 * H).toISOString() });
  fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(fixtures(now))}; window.__POSTS = ${JSON.stringify(POSTS)}; window.__ACCOUNT = ${JSON.stringify(acc(45))};`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ERP Instagram</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f5f5f5;--bg-hover:#eee;--border-main:#ddd}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#fafafa}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-ig-auto-chrome-'));
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
      const tid = (id) => $('[data-testid="' + id + '"]');
      const btn = (t, r = document) => $$('button', r).find((b) => txt(b) === t || txt(b).startsWith(t));
      const setVal = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));`;
    const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { check(name, false, String((e as Error).message || e).split('\n')[0]); } };

    // ── Automações ──
    await go('?pagina=instagram&aba=automacoes');
    await step('abas e conexão', async () => {
      const ok = await waitFor(`${Hs} return !!tid('iga-connected') && document.querySelectorAll('[data-testid="iga-card"]').length === 2;`, 20000);
      const tabs = await ev(`${Hs} return ['visao-geral','rastreio','direct','automacoes'].map((t) => { const b = tid('ig-tab-' + t); return [t, !b.disabled, b.getAttribute('aria-selected')]; });`);
      check('abas: Direct e Automações liberadas; ?aba=automacoes abre Automações', ok && JSON.stringify(tabs) === JSON.stringify([['visao-geral', true, 'false'], ['rastreio', true, 'false'], ['direct', true, 'false'], ['automacoes', true, 'true']]), JSON.stringify(tabs));
      const conn = await ev(`${Hs} return { t: txt(tid('iga-connected')), alert: !!tid('iga-token-alert'), secrets: !!tid('iga-secrets'), html: document.body.innerHTML.includes('IGAA') };`);
      const dd = new Date(now + 45 * 24 * H).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
      check(`conectado: "Conectado como @store_triumph · token válido até ${dd}", sem alerta, e o token nunca aparece na página`, conn.t.includes(`Conectado como @store_triumph · token válido até ${dd}`) && !conn.alert && !conn.secrets && !conn.html, JSON.stringify(conn));
      await ev(`${Hs} tid('iga-steps').open = true; return true;`);
      const steps = await ev(`${Hs} return txt(tid('iga-steps'));`);
      check('passo a passo da Meta: URL de redirecionamento, URL do webhook, campos e segredos', steps.includes('https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-manage/oauth') && steps.includes('https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-webhook')
        && ['messages', 'messaging_postbacks', 'comments', 'live_comments', 'IG_APP_ID', 'IG_APP_SECRET', 'IG_WEBHOOK_VERIFY_TOKEN', 'Verify JWT desligado'].every((w) => steps.includes(w)), steps.slice(0, 300));
      await shot('automacoes.png');
    });
    await step('chave geral e cartões', async () => {
      const st0 = await ev(`${Hs} return { main: txt(tid('iga-main-state')), test: tid('iga-test-mode').checked, cards: $$('[data-testid="iga-card"]').map((c) => txt(c)) };`);
      const mc = st0.cards[0];
      check('tudo nasce desligado: "Automações do Instagram: desligadas", modo teste marcado; a cópia do ManyChat DESLIGADA',
        st0.main === 'Automações do Instagram: desligadas' && st0.test && /Comentários → WhatsApp \(cópia do ManyChat\)\s*DESLIGADA/.test(mc), JSON.stringify(st0).slice(0, 400));
      check('cartão do ManyChat: Quando… qualquer post/reel · qualquer palavra · as 3 respostas públicas · a DM · botão "WhatsApp Loja" com a frase',
        /Quando…\s*Alguém comenta em qualquer post ou reel/.test(mc) && /E o comentário possui…\s*Qualquer palavra/.test(mc) && mc.includes('Te enviei todos os detalhes no direct 🔥') && mc.includes('Dá uma olhada no seu direct 👀') && mc.includes('Oiii, iniciamos seu atendimento pelo direct')
        && mc.includes('estamos com uma promoção top rolando nesse momento 🔥') && /WhatsApp Loja/.test(mc) && mc.includes('WhatsApp com a frase: “Olá! Vi o comentário no Instagram e quero saber da promoção 🔥”'), mc);
      const link = await ev(`${Hs} return $$('[data-testid="iga-card"]')[0].querySelector('a').href;`);
      check('botão do cartão: wa.me da loja com a frase', link === `https://wa.me/5521980921808?text=${encodeURIComponent('Olá! Vi o comentário no Instagram e quero saber da promoção 🔥')}`, link);
      const met = await ev(`${Hs} return $$('[data-testid="iga-metrics"]').map(txt);`);
      check('métricas: ManyChat 1 disparo · 1 DM · cliques — · 1 conversa · 1 venda · R$ 499,90 · DM → conversa 100%; Story: 1 · 1 · 2 cliques · CTR 200%',
        /1\s*Disparos\s*1\s*DMs enviadas\s*—\s*Cliques\s*1\s*Conversas no WhatsApp\s*1\s*Vendas\s*R\$\s*499,90\s*Faturamento\s*100%\s*DM → conversa/.test(met[0]) && /1\s*Disparos\s*1\s*DMs enviadas\s*2\s*Cliques\s*0\s*Conversas no WhatsApp/.test(met[1]) && /200%\s*CTR/.test(met[1]), JSON.stringify(met));
      // ligar a chave geral (confirmação) → MODO TESTE; adicionar conta de teste; antispam
      await ev(`${Hs} tid('iga-main-switch').click(); return true;`);
      await waitFor(`${Hs} return /MODO TESTE/.test(txt(tid('iga-main-state')));`);
      await ev(`${Hs} setVal($('input[aria-label="Conta de teste (@ ou IGSID)"]'), '@MinhaConta'); await wait(50); tid('iga-test-add').click(); return true;`);
      await waitFor(`${Hs} return /@minhaconta/.test(txt(tid('iga-test-list')));`);
      await ev(`${Hs} setVal($('input[aria-label="Horas entre DMs automáticas"]'), '12'); await wait(50); tid('iga-cooldown-save').click(); return true;`);
      await sleep(500);
      const cfg = await ev(`return Object.fromEntries(window.__DB.system_config.map((r) => [r.key, r.value]));`);
      const confirms = await ev(`return window.__CONFIRMS;`);
      check('chave geral: confirma antes de ligar → "ligadas em MODO TESTE"; conta de teste @minhaconta; antispam 12 h (system_config)',
        cfg.ig_automations_enabled === 'true' && cfg.ig_test_mode === 'true' && cfg.ig_test_accounts === JSON.stringify([{ username: 'minhaconta' }]) && cfg.ig_dm_cooldown_hours === '12' && confirms.length === 1 && /modo teste/.test(confirms[0]), JSON.stringify({ cfg, confirms }));
      await ev(`${Hs} $$('[data-testid="iga-card"]')[0].querySelector('[data-testid="iga-card-toggle"]').click(); return true;`);
      await waitFor(`${Hs} return /LIGADA · MODO TESTE/.test(txt($$('[data-testid="iga-card"]')[0]));`);
      const act = await ev(`return window.__DB.ig_automations.map((a) => a.active);`);
      check('ligar a automação: só ela liga (no cartão: "LIGADA · MODO TESTE")', JSON.stringify(act) === '[true,false]', JSON.stringify(act));
      await shot('automacoes-ligadas.png');
    });
    await step('nova automação', async () => {
      await ev(`${Hs} tid('iga-new').click(); return true;`);
      await waitFor(`${Hs} return !!tid('iga-editor');`);
      await ev(`${Hs} const d = tid('iga-editor'); d.querySelectorAll('textarea').forEach((t) => setVal(t, '')); await wait(50); tid('iga-save').click(); return true;`);
      await sleep(200);
      const errs = await ev(`${Hs} return txt(tid('iga-editor-errors'));`);
      check('editor: sem texto → avisa "Escreva a DM ou uma resposta pública." e não salva', /Escreva a DM ou uma resposta pública/.test(errs) && (await ev(`return window.__DB.ig_automations.length;`)) === 2, errs);
      await ev(`${Hs} const d = tid('iga-editor'); setVal($('input[aria-label="Nome"]', d), 'Reels da Black'); const ts = d.querySelectorAll('textarea'); setVal(ts[ts.length - 1], 'Oi {nome}! Te mandei o link 😊'); await wait(50);
        tid('iga-scope-chosen').click(); return true;`);
      await waitFor(`${Hs} return $$('[data-testid="iga-post"]').length === 2;`);
      await ev(`${Hs} $$('[data-testid="iga-post"]')[0].click(); await wait(50); tid('iga-kw-mode').click(); await wait(50); setVal($('input[aria-label="Palavras-chave"]'), 'quero, preço'); await wait(50); tid('iga-save').click(); return true;`);
      await waitFor(`${Hs} return !tid('iga-editor') && $$('[data-testid="iga-card"]').length === 3;`);
      const nw = await ev(`return window.__DB.ig_automations[2];`);
      const card = await ev(`${Hs} return txt($$('[data-testid="iga-card"]')[2]);`);
      check('nova automação: posts escolhidos (grade da Meta simulada), palavras-chave, código sugerido — salva DESLIGADA',
        nw && nw.active === false && nw.name === 'Reels da Black' && JSON.stringify(nw.media_ids) === '["1801"]' && nw.keyword_mode === 'palavras' && JSON.stringify(nw.keywords) === '["quero","preço"]' && nw.code === 'IG-A-REELS-DA-BLACK'
        && /Alguém comenta em 1 post escolhido/.test(card) && /“quero”, “preço”/.test(card) && /DESLIGADA/.test(card), JSON.stringify(nw));
    });

    // ── Direct ──
    await ev(`${Hs} tid('ig-tab-direct').click(); return true;`);
    await step('Direct', async () => {
      await waitFor(`${Hs} return $$('[data-testid="igd-row"]').length === 3;`);
      const rows = await ev(`${Hs} return $$('[data-testid="igd-row"]').map(txt);`);
      check('lista: mais recentes primeiro, @, origem, última mensagem; Ana "✅ foi para o WhatsApp" (frase + horário), Bia e Caio "⏳ ainda não foi"',
        rows.length === 3 && /@bia/.test(rows[0]) && /DM/.test(rows[0]) && /Quanto custa/.test(rows[0]) && /⏳ ainda não foi/.test(rows[0]) && /@ana\.souza/.test(rows[1]) && /Comentário/.test(rows[1]) && /✅ foi para o WhatsApp/.test(rows[1]) && /@caio/.test(rows[2]) && /Story/.test(rows[2]), JSON.stringify(rows));
      await ev(`${Hs} tid('igd-filter-not').click(); return true;`);
      await sleep(150);
      const f = await ev(`${Hs} return { n: $$('[data-testid="igd-row"]').length, label: txt(tid('igd-filter-not')) };`);
      check('filtro "⏳ Ainda não foi para o WhatsApp (2)"', f.n === 2 && f.label === '⏳ Ainda não foi para o WhatsApp (2)', JSON.stringify(f));
      await ev(`${Hs} $$('[data-testid="igd-row"]').find((r) => /@bia/.test(txt(r))).click(); return true;`);
      await waitFor(`${Hs} return /Quanto custa/.test(txt(tid('igd-msgs')));`);
      const win = await ev(`${Hs} return { w: txt(tid('igd-window')), dis: tid('igd-send-wa').disabled };`);
      check('conversa da Bia: histórico e "Pode responder por mais 22 h …" (janela de 24 h)', /Pode responder por mais 2[23] h/.test(win.w) && !win.dis, JSON.stringify(win));
      await ev(`${Hs} setVal($('textarea[aria-label="Responder"]'), 'Oi Bia! Custa R$ 499,90 😊'); await wait(50); tid('igd-send').click(); return true;`);
      await waitFor(`${Hs} return /Resposta enviada/.test(txt(tid('igd-msg'))) && /Custa R\\$ 499,90/.test(txt(tid('igd-msgs')));`);
      await ev(`${Hs} tid('igd-send-wa').click(); return true;`);
      await waitFor(`${Hs} return /WhatsApp enviado/.test(txt(tid('igd-msg')));`);
      const meta = await ev(`return window.__META.filter((m) => /\\/me\\/messages$/.test(m.url)).map((m) => m.body);`);
      check('responder (texto) e "Mandar o WhatsApp" (botão com a frase do Direct) pela ig-manage de verdade, para a Bia',
        meta.length === 2 && JSON.stringify(meta[0]) === JSON.stringify({ recipient: { id: BIA }, message: { text: 'Oi Bia! Custa R$ 499,90 😊' } })
        && meta[1].message.attachment.payload.buttons[0].url === `https://wa.me/5521980921808?text=${encodeURIComponent('Olá! Vim pelo Direct do Instagram 😊')}` && meta[1].message.attachment.payload.text === 'Olá! Vou te deixar aqui abaixo o nosso WhatsApp 😊', JSON.stringify(meta));
      const conv = await ev(`return window.__DB.ig_conversations.find((c) => c.igsid === '${BIA}');`);
      check('"Mandar o WhatsApp" marca o envio do link (IG-DIRECT) para ligar a conversa depois', conv.wa_code === 'IG-DIRECT' && !!conv.wa_sent_at, JSON.stringify(conv));
      await ev(`window.__REJECT_BUTTON = true; return true;`);
      await ev(`${Hs} tid('igd-send-wa').click(); return true;`);
      await waitFor(`${Hs} return /como texto/.test(txt(tid('igd-msg')));`);
      const last = await ev(`return window.__META.filter((m) => /\\/me\\/messages$/.test(m.url)).slice(-1)[0].body.message;`);
      check('fallback: o Instagram recusou o botão → manda o texto com o link (e avisa)', typeof last.text === 'string' && last.text.includes('https://wa.me/5521980921808'), JSON.stringify(last));
      await ev(`window.__REJECT_BUTTON = false; return true;`);
      await shot('direct.png');
      await ev(`${Hs} tid('igd-filter-not').click(); await wait(100); $$('[data-testid="igd-row"]').find((r) => /@caio/.test(txt(r))).click(); return true;`);
      await waitFor(`${Hs} return !!tid('igd-closed');`);
      const closed = await ev(`${Hs} return { t: txt(tid('igd-closed')), wa: tid('igd-send-wa').disabled, send: tid('igd-send').disabled, ta: $('textarea[aria-label="Responder"]').disabled };`);
      check('fora da janela de 24 h (Caio): avisa e desliga a resposta e o "Mandar o WhatsApp"', /Fora da janela de 24 h/.test(closed.t) && closed.wa && closed.send && closed.ta, JSON.stringify(closed));
    });

    // ── celular ──
    await step('celular', async () => {
      await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(400);
      const d = await ev(`return document.documentElement.scrollWidth;`);
      await ev(`${Hs} tid('ig-tab-automacoes').click(); return true;`);
      await waitFor(`${Hs} return $$('[data-testid="iga-card"]').length === 3;`);
      await sleep(300);
      const a = await ev(`return document.documentElement.scrollWidth;`);
      await shot('celular-automacoes.png', 390);
      check('celular: Direct e Automações sem rolagem lateral', d <= 390 && a <= 390, JSON.stringify({ d, a }));
      await s('Emulation.clearDeviceMetricsOverride');
    });

    // ── Visão geral: funil ──
    await ev(`${Hs} tid('ig-tab-visao-geral').click(); return true;`);
    await step('funil', async () => {
      await waitFor(`${Hs} return $$('[data-testid="ig-funnel-step"]').length === 6;`);
      const f = await ev(`${Hs} return $$('[data-testid="ig-funnel-step"]').map(txt);`);
      check('Visão geral: "Funil Instagram → WhatsApp → venda" (1 comentário + 1 DM recebidos → 2 DMs automáticas → 2 cliques → 1 conversa → 1 venda → R$ 499,90)',
        /^2\s*Comentários e DMs recebidos\s*1 comentários · 1 DMs/.test(f[0]) && /^2\s*DMs automáticas/.test(f[1]) && /^2\s*Cliques/.test(f[2]) && /^1\s*Conversas no WhatsApp\s*50% das DMs/.test(f[3]) && /^1\s*Vendas/.test(f[4]) && /R\$\s*499,90\s*Faturamento/.test(f[5]), JSON.stringify(f));
    });

    // ── só grava o permitido ──
    const writes = await ev(`return window.__WRITES.map((w) => ({ t: w.table, op: w.op, key: w.data && w.data.key }));`);
    check('grava SÓ system_config (chaves ig_*) e ig_automations; mensagens só pela ig-manage', writes.length > 0 && writes.every((w: Any) => (w.t === 'system_config' && /^ig_/.test(w.key)) || w.t === 'ig_automations'), JSON.stringify(writes));
    check('nenhum erro no console', errors.length === 0, errors.slice(0, 5).join(' | '));

    // ── sem segredos / desconectado / volta do login / Conectar leva ao Login do Instagram ──
    await go('?pagina=instagram&aba=automacoes&cfg=semsegredos');
    await step('sem segredos', async () => {
      await waitFor(`${Hs} return !!tid('iga-secrets');`);
      const x = await ev(`${Hs} return { s: txt(tid('iga-secrets')), nc: !!tid('iga-not-connected'), dis: tid('iga-connect-btn').disabled };`);
      check('sem os segredos: "Faltam os segredos no Supabase: IG_APP_ID, IG_APP_SECRET, IG_WEBHOOK_VERIFY_TOKEN", "não conectado" e o Conectar desligado (nada quebra)',
        x.s.includes('IG_APP_ID, IG_APP_SECRET, IG_WEBHOOK_VERIFY_TOKEN') && x.nc && x.dis, JSON.stringify(x));
    });
    await go('?pagina=instagram&aba=automacoes&ig=erro&motivo=Login%20cancelado');
    await step('volta com erro', async () => {
      check('volta do login com erro: mostra o motivo', await waitFor(`${Hs} return /Não conectou: Login cancelado/.test(txt(tid('iga-back-err')));`));
    });
    await go('?pagina=instagram&aba=automacoes&ig=conectado');
    await step('volta ok', async () => {
      await waitFor(`${Hs} return !!tid('iga-back-ok') && !!tid('iga-connected');`);
      check('volta do login: "✅ Instagram conectado."', await ev(`${Hs} return txt(tid('iga-back-ok')) === '✅ Instagram conectado.';`));
    });
    await go('?pagina=instagram&aba=automacoes&cfg=vencendo');
    await step('alerta do token', async () => {
      await waitFor(`${Hs} return !!tid('iga-token-alert');`);
      const al0 = await ev(`${Hs} return txt(tid('iga-token-alert'));`);
      check('token vencendo com a renovação automática falhando: alerta vermelho com o motivo', /A renovação automática falhou: A Meta recusou a renovação/.test(al0), al0);
      await ev(`${Hs} tid('iga-refresh-token').click(); return true;`);
      await waitFor(`${Hs} return !tid('iga-token-alert');`, 5000);
      const al = await ev(`${Hs} const a = tid('iga-token-alert'); return a ? txt(a) : '';`);
      check('"Renovar agora" renova (Meta simulada): o alerta some e o token novo fica só no servidor', al === '' && (await ev(`return window.__ACCOUNT.access_token;`)) === 'IGAA-renovado' && !(await ev(`return document.body.innerHTML.includes('IGAA');`)), al);
    });
    await step('Conectar', async () => {
      await ev(`${Hs} tid('iga-connect-btn').click(); return true;`);
      await sleep(1500);
      const h = await s('Page.getNavigationHistory');
      const url = new URL(h.entries[h.currentIndex].url);
      check('"Conectar de novo" leva ao Login do Instagram com os 3 escopos, o redirecionamento da ig-manage e o state',
        url.origin + url.pathname === 'https://www.instagram.com/oauth/authorize' && url.searchParams.get('scope') === 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments'
        && url.searchParams.get('redirect_uri') === 'https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-manage/oauth' && url.searchParams.get('state') === 'ab'.repeat(16), url.href);
    });
  } catch (e) {
    check('teste rodou até o fim', false, String((e as Error).message || e));
  } finally { clearTimeout(timer); done(); }
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verificações passaram (Chrome: ${chrome})`);
  if (ok !== results.length) process.exitCode = 1;
}
main();
