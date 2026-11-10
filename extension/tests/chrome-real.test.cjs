// "O painel abre no Chrome real" (padrão para toda versão, desde a 2.10.2): node extension/tests/chrome-real.test.cjs
//
// Abre o Google Chrome instalado (sem Playwright e sem npm install: só o protocolo DevTools do próprio Chrome),
// carrega a extensão desta pasta (Extensions.loadUnpacked; o Chrome 137+ não aceita mais --load-extension),
// serve uma página https://web.whatsapp.com SIMULADA (Fetch.fulfillRequest) e confere:
//   1. o painel aparece (#tsp-wa-host com o painel dentro do shadow DOM);
//   2. nenhum erro no console da página (inclusive dos content scripts) nem exceção.
// (2.15.3: o Supabase falso também simula o Storage wa-media, para exportar o catálogo.)
// Toda a rede de verdade fica bloqueada (--host-resolver-rules): o teste nunca fala com o Supabase nem com o
// WhatsApp, então não lê nem grava nada, e a aba de teste nunca pega a trava do motor.
//
// Opções (variáveis de ambiente):
//   CHROME_PATH=...        caminho do chrome.exe (padrão: os lugares de sempre no Windows/macOS/Linux)
//   EXT_DIR=...            pasta da extensão (padrão: a pasta acima de tests/)
//   SHOTS_DIR=...          salva prints (padrão, compacto e seções recolhidas) nesta pasta
//   HEADFUL=1              abre a janela (padrão: headless=new)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const EXT_DIR = path.resolve(process.env.EXT_DIR || path.join(__dirname, '..'));
const SHOTS_DIR = process.env.SHOTS_DIR ? path.resolve(process.env.SHOTS_DIR) : null;
const TIMEOUT_MS = 45000;

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || null;
}

// WhatsApp Web simulado: o esqueleto que o painel usa (#app, #main, caixa de mensagem) e, desde a 2.10.3, a lista de
// 2.12.1: o cabeçalho da conversa tem a foto, o nome e os ícones do WhatsApp (vídeo, ligar, pesquisar, mais opções).
// conversas (#pane-side, 40 linhas de 72 px) que se comporta como a do WhatsApp: clicar abre a conversa; enviar
// (Enter ou botão Enviar) leva a conversa para o topo e, 120 ms depois, a lista PULA para o topo;
// __fakeIncoming() faz o mesmo para mensagem de cliente. A WA-JS não acha o WhatsApp e fica esperando.
const ROWS = Array.from({ length: 40 }, (_, i) => `<div role="listitem" data-name="Cliente ${i + 1}" style="height:72px;border-bottom:1px solid #eee;display:flex;align-items:center"><div role="gridcell" tabindex="-1" aria-selected="${i === 0}" style="padding:0 16px;width:100%">Cliente ${i + 1}</div></div>`).join('');
const FAKE_WA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>WhatsApp</title>
<style>html,body{margin:0;height:100%;font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#efeae2}
#app{height:100%;display:flex}.side{width:30%;min-width:260px;background:#fff;border-right:1px solid #d1d7db;display:flex;flex-direction:column}
#pane-side{flex:1;overflow-y:auto}[aria-selected="true"]{background:#f0f2f5;font-weight:600}
.chat{flex:1;display:flex;flex-direction:column}.hdr{height:59px;flex:none;background:#f0f2f5;display:flex;align-items:center;padding:0 16px;font-weight:600}
.msgs{flex:1}.foot{height:62px;background:#f0f2f5;display:flex;align-items:center}
.ttl{flex:1;min-width:0}.icons{display:flex;gap:4px}.wb{width:40px;height:40px;border:0;border-radius:50%;background:none;font-size:18px;cursor:pointer}</style></head>
<body><div id="app"><div class="side" id="side"><div class="hdr">Conversas</div><div id="pane-side"><div role="grid">${ROWS}</div></div></div>
<div class="chat" id="main"><header class="hdr"><div style="width:40px;height:40px;border-radius:50%;background:#ccc;margin-right:12px"></div><div class="ttl"><span dir="auto" title="Cliente 1">Cliente 1</span></div><div class="icons"><div><button class="wb" aria-label="Ligar com vídeo"><span data-icon="video-call">🎥</span></button></div><div><button class="wb" aria-label="Ligar"><span data-icon="voice-call">📞</span></button></div><div><button class="wb" aria-label="Pesquisar"><span data-icon="search-alt">🔍</span></button></div><div><button class="wb" aria-label="Mais opções"><span data-icon="menu">⋮</span></button></div></div></header><div class="msgs"></div>
<footer class="foot"><div contenteditable="true" role="textbox" data-tab="10" style="flex:1;margin:12px;height:38px;background:#fff;border-radius:8px"></div><button aria-label="Enviar" style="margin-right:12px;height:38px"><span data-icon="send">➤</span></button></footer></div></div>
<script>
const pane = document.getElementById('pane-side');
const grid = pane.firstElementChild;
const box = document.querySelector('footer [contenteditable]');
function open(row) {
  grid.querySelectorAll('[role=gridcell]').forEach((c) => c.setAttribute('aria-selected', 'false'));
  row.firstElementChild.setAttribute('aria-selected', 'true');
  const s = document.querySelector('#main header span'); s.textContent = row.dataset.name; s.title = row.dataset.name;
}
pane.addEventListener('mousedown', (e) => { const r = e.target.closest('[role=listitem]'); if (r) open(r); });
function jumpTop(row) { grid.prepend(row); setTimeout(() => { pane.scrollTop = 0; }, 120); }
function send() { if (!box.textContent.trim()) return; box.textContent = ''; jumpTop(grid.querySelector('[aria-selected=true]').parentElement); }
box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.querySelector('footer button').addEventListener('click', send);
window.__fakeIncoming = (name) => jumpTop(grid.querySelector('[data-name="' + name + '"]'));
// 2.12.1: clique no cabeçalho (o WhatsApp abriria os dados do contato), recriar o cabeçalho e conversa de grupo
window.__hdrClicks = 0;
document.getElementById('main').addEventListener('click', (e) => { if (e.target.closest('header')) window.__hdrClicks++; });
const ICONS = document.querySelector('#main header .icons').outerHTML;
window.__rebuildHeader = (icons = true) => { const h = document.querySelector('#main header'); const n = document.createElement('header'); n.className = 'hdr'; n.innerHTML = h.innerHTML; n.querySelectorAll('.tsp-hdr, .icons').forEach((x) => x.remove()); if (icons) n.insertAdjacentHTML('beforeend', ICONS); h.replaceWith(n); };
window.__group = (on) => { document.querySelector('#main .msgs').innerHTML = on ? '<div data-id="false_120363000000000000@g.us_ABC">oi</div>' : ''; };
// 2.12.3: ponte da WA-JS simulada (desligada por padrão): responde só os pedidos listados em __fakeBridge, antes da
// ponte de verdade (que, sem o WhatsApp, responderia "não está pronta")
window.__fakeBridge = null;
window.addEventListener('message', (e) => {
  const d = e.data; const fb = window.__fakeBridge;
  if (!fb || e.source !== window || !d || d.source !== 'tsp-wajs-content' || !Object.prototype.hasOwnProperty.call(fb, d.type)) return;
  e.stopImmediatePropagation();
  const v = typeof fb[d.type] === 'function' ? fb[d.type](d.payload) : fb[d.type];
  window.postMessage({ source: 'tsp-wajs-bridge', id: d.id, type: d.type, ok: true, data: v }, location.origin);
});
</script></body></html>`;

// ── CDP por pipe (fd 3 = escrita, fd 4 = leitura; mensagens separadas por \0) ──
function cdp(child) {
  let seq = 0;
  let buf = '';
  const pending = new Map();
  const listeners = [];
  child.stdio[4].on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim()));
        else resolve(msg.result);
      } else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn) => listeners.push(fn) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('Google Chrome não encontrado (use CHROME_PATH=...)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-chrome-'));
  const args = [
    '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--disable-features=Translate,OptimizationHints',
    // nenhuma rede de verdade: o WhatsApp é simulado e o Supabase fica inalcançável
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--window-size=1366,820', '--lang=pt-BR',
    ...(process.env.HEADFUL ? [] : ['--headless=new']),
    'about:blank',
  ];
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));
  const c = cdp(child);
  const errors = [];
  let sessionId = null;
  const done = () => { try { child.kill(); } catch { /* já saiu */ } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* arquivo preso */ } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 240000);
  try {
    // ── Supabase falso no service worker da extensão (2.10.5) ──
    // Desligado (padrão): os pedidos do background seguem e falham como sem rede (nada muda nos outros testes).
    // Ligado: responde só wa_conversion_events e sales, guardando o estado e cada PATCH para conferir.
    const fake = { on: false, events: [], sales: [], patches: [], seen: [] };
    let extId = null;
    let swTarget = null;
    const inVals = (v) => (String(v || '').match(/^in\.\((.*)\)$/) || [null, ''])[1].split(',').map((x) => x.replace(/^"|"$/g, '')).filter(Boolean);
    // 2.11.0: banco em memória (qualquer tabela): GET/HEAD com filtros eq/neq/is/in, POST, PATCH e DELETE
    fake.db = {};
    const tbl = (t) => fake.db[t] || (fake.db[t] = []);
    function genericSupabase(method, url, body) {
      const table = url.pathname.slice('/rest/v1/'.length);
      const q = url.searchParams;
      const filters = [];
      for (const [k, v] of q) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or', 'and'].includes(k)) continue;
        const m = /^(eq|neq|is|in|gte|lte|gt|lt|like|not)\.(.*)$/.exec(v);
        if (m) filters.push([k, m[1], m[2]]);
      }
      const match = (r) => filters.every(([k, op, val]) => {
        const x = r[k];
        if (op === 'eq') return String(x) === val;
        if (op === 'neq') return String(x) !== val;
        if (op === 'is') return val === 'null' ? x == null : true;
        if (op === 'in') return inVals(`in.${val}`).includes(String(x));
        return true;
      });
      if (method === 'HEAD') return [200, null, tbl(table).filter(match).length];
      if (method === 'GET') { let rows = tbl(table).filter(match); const lim = Number(q.get('limit')); if (lim) rows = rows.slice(0, lim); return [200, rows]; }
      if (method === 'POST') {
        const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: require('crypto').randomUUID(), created_at: new Date().toISOString(), ...r }));
        // 2.13.3: upsert (on_conflict=coluna): troca a linha com a mesma chave
        const oc = table === 'wa_chat_names' ? q.get('on_conflict') : null; // só aqui: as outras tabelas seguem como antes
        if (oc) list.forEach((r) => { const old = tbl(table).find((x) => String(x[oc]) === String(r[oc])); if (old) { Object.assign(old, r); r.__dup = true; } });
        tbl(table).push(...list.filter((r) => !r.__dup));
        if (table === 'wa_automations' && fake.onAutomationPost) list.forEach((r) => fake.onAutomationPost(r));
        return [201, list];
      }
      if (method === 'PATCH') { const rows = tbl(table).filter(match); rows.forEach((r) => Object.assign(r, body)); return [200, rows]; }
      if (method === 'DELETE') { fake.db[table] = tbl(table).filter((r) => !match(r)); return [204, null]; }
      return null;
    }
    function fakeSupabase(method, url, body) {
      // 2.12.3: ViaCEP falso (o background busca o endereço do CEP como o ERP)
      if (url.hostname === 'viacep.com.br') { fake.cep = [...(fake.cep || []), url.pathname]; return [200, /\/24220000\//.test(url.pathname) ? { cep: '24220-000', logradouro: 'Rua Gavião Peixoto', bairro: 'Icaraí', localidade: 'Niterói', uf: 'RJ' } : { erro: true }]; }
      if (fake.storage && url.pathname.startsWith('/storage/v1/object/')) {
        fake.storageSeen.push(`${method} ${url.pathname}`);
        const pub = /^\/storage\/v1\/object\/public\/wa-media\/(.+)$/.exec(url.pathname);
        if (pub && method === 'HEAD') return [fake.storage.has(decodeURIComponent(pub[1])) ? 200 : 400, null];
        const up = /^\/storage\/v1\/object\/wa-media\/(.+)$/.exec(url.pathname);
        if (up && method === 'POST') { const k = decodeURIComponent(up[1]); if (fake.storage.has(k)) return [400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }]; fake.storage.set(k, (fake.storage.get(k) || 0) + 1); return [200, { Key: `wa-media/${k}` }]; }
        return null;
      }
      if (!url.pathname.startsWith('/rest/v1/')) return null;
      const table = url.pathname.slice('/rest/v1/'.length);
      if (fake.fail && fake.fail[table] > 0) { fake.fail[table]--; fake.failed = (fake.failed || 0) + 1; return [503, { message: 'Service Unavailable' }]; } // 2.12.1
      // 2.13.1: um erro do banco de verdade, uma vez (ex.: 23514 ao apagar)
      if (fake.failOnce && fake.failOnce.table === table && fake.failOnce.method === method) { const f = fake.failOnce; fake.failOnce = null; return [f.status, f.body]; }
      const q = url.searchParams;
      const sel = q.get('select') || '';
      const eq = (k) => { const v = q.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
      if (table === 'wa_conversion_events') {
        if (method === 'PATCH') { const e = fake.events.find((x) => x.event_id === eq('event_id')); if (e) Object.assign(e, body); fake.patches.push({ table, id: eq('event_id'), body }); return [204, null]; }
        if (sel === 'sale_id' || sel === 'event_name') return [200, []];
        if (q.has('event_id')) return [200, fake.events.filter((x) => x.event_id === eq('event_id'))];
        if (sel.startsWith('sale_id,event_id')) return [200, fake.events.filter((x) => x.sale_id).map((x) => ({ sale_id: x.sale_id, event_id: x.event_id }))];
        if (sel.startsWith('event_id,chat_id,contact_name')) return [200, fake.events];
        return [200, []];
      }
      if (table === 'sales') {
        if (method === 'POST' && fake.failSalePost) { fake.failSalePost = false; return [500, { message: 'erro de teste ao gravar a venda' }]; } // 2.12.4
        if (method === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: require('crypto').randomUUID(), created_at: new Date().toISOString(), ...r })); fake.sales.push(...list); return [201, list]; } // 2.12.3
        if (method === 'DELETE') { fake.sales = fake.sales.filter((x) => x.id !== eq('id')); return [204, null]; }
        if (method === 'PATCH') {
          const s0 = fake.sales.find((x) => x.id === eq('id'));
          const wc = q.get('wa_chat_id'); const cp = q.get('customer_phone'); const or = q.get('or');
          const okRow = s0 && (!wc || (wc === 'is.null' ? !s0.wa_chat_id : s0.wa_chat_id === wc.slice(3)))
            && (!cp || s0.customer_phone === cp.slice(3)) && (!or || !String(s0.customer_phone || '').trim());
          if (okRow) Object.assign(s0, body);
          fake.patches.push({ table, id: eq('id'), body, applied: !!okRow });
          return [204, null];
        }
        if (sel === 'wa_chat_id') return [200, []];
        if (eq('id')) return [200, fake.sales.filter((x) => x.id === eq('id'))];
        if (q.get('id')) { const ids = inVals(q.get('id')); return [200, fake.sales.filter((x) => ids.includes(x.id))]; }
        return [200, fake.sales.filter((x) => !['cancelado', 'reembolsado'].includes(x.status))];
      }
      if (fake.generic) return genericSupabase(method, url, body); // 2.11.0: banco em memória para qualquer tabela
      return null; // o resto (biblioteca etc.) continua "sem rede"
    }
    c.on((msg) => {
      if (msg.method === 'Target.attachedToTarget' && !msg.sessionId) {
        const { sessionId: sid, targetInfo: ti, waitingForDebugger } = msg.params;
        fake.attached = [...(fake.attached || []), `${ti.type}:${ti.url.slice(0, 60)}:${waitingForDebugger}`];
        (async () => {
          if (ti.type === 'service_worker' && extId && ti.url.startsWith(`chrome-extension://${extId}/`)) {
            swTarget = ti.targetId;
            await c.send('Fetch.enable', { patterns: [{ urlPattern: '*supabase.co/*', requestStage: 'Request' }, { urlPattern: '*viacep.com.br/*', requestStage: 'Request' }] }, sid).catch(() => {});
          }
          if (waitingForDebugger) await c.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
        })();
        return;
      }
      if (msg.method === 'Fetch.requestPaused' && msg.sessionId && msg.sessionId !== sessionId) {
        const p = msg.params;
        const sid = msg.sessionId;
        if (fake.on) fake.seen.push(`${p.request.method} ${new URL(p.request.url).pathname}${new URL(p.request.url).search.slice(0, 80)}`);
        if (!fake.on) { c.send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {}); return; }
        let body = null;
        try { body = p.request.postData ? JSON.parse(p.request.postData) : null; } catch { body = null; }
        const out = fakeSupabase(p.request.method, new URL(p.request.url), body);
        if (!out) { c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'NameNotResolved' }, sid).catch(() => {}); return; }
        const [status, data, count] = out;
        const headers = [{ name: 'Content-Type', value: 'application/json' }, ...(count != null ? [{ name: 'Content-Range', value: `*/${count}` }] : [])];
        c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(data == null ? '' : JSON.stringify(data)).toString('base64') }, sid).catch(() => {});
      }
    });
    const ext = await c.send('Extensions.loadUnpacked', { path: EXT_DIR });
    extId = ext && ext.id;
    await c.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true }));
    const s = (m, p) => c.send(m, p, sessionId);
    const contexts = new Map(); // executionContextId → { name, type }
    let lastIso = null;
    c.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params || {};
      if (msg.method === 'Runtime.executionContextCreated') {
        contexts.set(p.context.id, { name: p.context.name, type: p.context.auxData && p.context.auxData.type });
        if (p.context.auxData && p.context.auxData.type === 'isolated') lastIso = p.context.id; // mundo dos content scripts da extensão
      }
      if (msg.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
        errors.push(`console.${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails || {};
        errors.push(`exceção: ${(d.exception && d.exception.description) || d.text} (${d.url || ''}:${d.lineNumber})`);
      }
      if (msg.method === 'Log.entryAdded' && p.entry.level === 'error' && !/net::ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(p.entry.text)) {
        errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
      }
      if (msg.method === 'Fetch.requestPaused') {
        const url = p.request.url;
        if (/^https:\/\/web\.whatsapp\.com\/?(\?.*)?$/.test(url)) {
          s('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(FAKE_WA).toString('base64') }).catch(() => {});
        } else {
          s('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: '' }).catch(() => {});
        }
      }
    });
    await s('Runtime.enable');
    await s('Log.enable');
    await s('Page.enable');
    await s('Fetch.enable', { patterns: [{ urlPattern: 'https://web.whatsapp.com/*', requestStage: 'Request' }] });
    await s('Page.navigate', { url: 'https://web.whatsapp.com/' });

    // 1. o painel aparece
    const evalPage = async (expression) => (await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    const until = Date.now() + TIMEOUT_MS;
    // o botão do painel (raio) aparece; um clique abre o painel, como a pessoa faria
    let state = null;
    while (Date.now() < until) {
      state = await evalPage(`(() => { const h = document.getElementById('tsp-wa-host'); const sh = h && h.shadowRoot;
        const t = sh && sh.querySelector('.toggle'); const p = sh && sh.querySelector('.panel');
        if (t && !sh.querySelector('.root.open')) t.click();
        const box = p && p.getBoundingClientRect();
        return { host: !!h, toggle: !!t, open: !!(sh && sh.querySelector('.root.open')), panelWidth: box ? Math.round(box.width) : 0, inView: !!(box && box.left < innerWidth && box.right > 0) }; })()`).catch(() => null);
      if (state && state.open && state.panelWidth > 200 && state.inView) break;
      await sleep(300);
    }
    await sleep(2500); // dá tempo para erros tardios (carregamentos que falham sem rede)
    const results = [];
    const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
    check('extensão carregada no Chrome real', !!(ext && ext.id), ext && ext.id);
    check('o painel aparece (#tsp-wa-host, botão e painel aberto na tela)', !!(state && state.host && state.toggle && state.open && state.panelWidth > 200 && state.inView), JSON.stringify(state));
    const isoCtx = [...contexts.values()].filter((x) => x.type === 'isolated').map((x) => x.name);
    check('content scripts rodaram no mundo isolado', isoCtx.length > 0, isoCtx.join(', '));
    check('nenhum erro no console', errors.length === 0, errors.slice(0, 8).join(' | '));

    const inPanel = (js) => evalPage(`(async () => { const sh = document.getElementById('tsp-wa-host').shadowRoot; const wait = (ms) => new Promise((r) => setTimeout(r, ms)); ${js} })()`);
    // usa o próprio menu Personalizar, como a pessoa faria
    const czOpen = () => inPanel(`if (!sh.querySelector('.cz:not([hidden])')) sh.querySelector('.cz-open').click(); await wait(200); return true;`);
    const czClose = () => inPanel(`const c = sh.querySelector('.cz-close'); if (c && sh.querySelector('.cz:not([hidden])')) c.click(); await wait(150); return true;`);
    const czClickLabel = async (text) => { await czOpen(); const ok = await inPanel(`const l = [...sh.querySelectorAll('.cz .cz-opt')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!l) return false; l.querySelector('input').click(); await wait(150); return true;`); await czClose(); return ok; };
    const density = async (v) => { await czOpen(); await inPanel(`sh.querySelector('[data-cz-density="${v}"]').click(); await wait(200); return true;`); await czClose(); };
    // arrasto de verdade (mouse do Chrome), no meio de um elemento do painel
    const rectOf = (sel) => inPanel(`const e = sh.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };`);
    const mouse = (type, x, y, extra = {}) => s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    async function drag(sel, dx, dy) {
      const r = await rectOf(sel);
      if (!r) return false;
      await mouse('mouseMoved', r.x, r.y, { buttons: 0, button: 'none' });
      await mouse('mousePressed', r.x, r.y);
      for (let i = 1; i <= 6; i++) await mouse('mouseMoved', r.x + (dx * i) / 6, r.y + (dy * i) / 6);
      await mouse('mouseReleased', r.x + dx, r.y + dy);
      await sleep(200);
      return true;
    }

    // 2. prints (padrão, Personalizar, compacto, seções recolhidas)
    if (SHOTS_DIR) {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      const shot = async (name) => {
        await sleep(500);
        const { data } = await s('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS_DIR, `${name}.png`), Buffer.from(data, 'base64'));
        console.log(`     print: ${path.join(SHOTS_DIR, `${name}.png`)}`);
      };
      await shot('padrao');
      await czOpen();
      await shot('personalizar');
      await czClose();
      await density('compacta');
      await shot('compacto');
      await density('confortavel');
      await inPanel(`sh.querySelectorAll('.cs-toggle[aria-expanded="true"]').forEach((b) => b.click()); return true;`);
      await shot('secoes-recolhidas');
      await inPanel(`sh.querySelectorAll('.cs-toggle[aria-expanded="false"]').forEach((b) => b.click()); return true;`);
    }

    // 3. painel personalizável (2.10.2): cada função, de verdade, e tudo lembrado depois de recarregar
    const q = (js) => inPanel(js);
    // seções recolhíveis: recolhida mostra uma linha com o resumo
    await q(`sh.querySelector('.labels > .cs-toggle').click(); await wait(100); return true;`);
    const lab = await q(`const l = sh.querySelector('.labels'); return { collapsed: l.classList.contains('cs-collapsed'), h: Math.round(l.getBoundingClientRect().height), sum: l.querySelector('.cs-sum').textContent, chips: getComputedStyle(l.querySelector('.chips')).display };`);
    check('seção recolhida vira uma linha com o resumo ("Etiquetas CRM: …")', lab.collapsed && lab.h <= 26 && /^Etiquetas CRM:/.test(lab.sum) && lab.chips === 'none', JSON.stringify(lab));
    // divisória: arrastar para cima diminui o topo (rola por dentro); duplo clique volta ao padrão
    const before = await rectOf('.ptop');
    await drag('.psplit', 0, -120);
    const after = await q(`const p = sh.querySelector('.ptop'); return { h: Math.round(p.getBoundingClientRect().height), limited: sh.querySelector('.panel').classList.contains('top-limited'), scroll: p.scrollHeight > p.clientHeight, overflow: getComputedStyle(p).overflowY };`);
    check('divisória arrastável diminui o topo e o topo rola por dentro', after.limited && after.h <= before.h - 100 && after.scroll && after.overflow === 'auto', `antes ${Math.round(before.h)} px, depois ${JSON.stringify(after)}`);
    const sp = await rectOf('.psplit');
    await mouse('mousePressed', sp.x, sp.y, { clickCount: 1 }); await mouse('mouseReleased', sp.x, sp.y, { clickCount: 1 });
    await mouse('mousePressed', sp.x, sp.y, { clickCount: 2 }); await mouse('mouseReleased', sp.x, sp.y, { clickCount: 2 });
    await sleep(200);
    const reset = await q(`return { limited: sh.querySelector('.panel').classList.contains('top-limited'), h: Math.round(sh.querySelector('.ptop').getBoundingClientRect().height) };`);
    check('duplo clique na divisória volta ao padrão', !reset.limited && Math.abs(reset.h - before.h) <= 30, JSON.stringify(reset));
    await drag('.psplit', 0, -80); // deixa um tamanho guardado para conferir depois de recarregar
    const savedTop = (await rectOf('.ptop')).h;
    // abas: desligar Mídias leva para "Mais"; ligar Agendados traz para a barra
    await czClickLabel('Mídias');
    await czClickLabel('Agendados');
    const tabs = await q(`const nav = sh.querySelector('.pnav'); const menu = sh.querySelector('.pmenu');
      return { midiasInMore: !!menu.querySelector('[data-sec="midias"]'), agendInBar: !!nav.querySelector(':scope > [data-sec="agendados"]'), msgInBar: !!nav.querySelector(':scope > [data-sec="mensagens"]') };`);
    check('abas: desligada vai para "Mais", ligada vem para a barra, Mensagens fica', tabs.midiasInMore && tabs.agendInBar && tabs.msgInBar, JSON.stringify(tabs));
    // filtros: padrão Tudo, Mais usadas, Texto, Áudio, Imagem, Vídeo; o resto em "+ filtros"
    const chips = await q(`const vis = [...sh.querySelectorAll('.filters .chip[data-id]')].filter((c) => !c.hidden).map((c) => c.dataset.id);
      const more = sh.querySelector('.filters .cz-more'); more.click(); await wait(80);
      const opened = [...sh.querySelectorAll('.filters .chip[data-id]')].filter((c) => !c.hidden).map((c) => c.dataset.id); more.click(); await wait(80);
      return { vis, opened, more: more.hidden ? null : more.textContent };`);
    check('filtros: só os escolhidos + chip "+ filtros" com os outros', JSON.stringify(chips.vis) === JSON.stringify(['tudo', 'mais_usadas', 'texto', 'audio', 'imagem', 'video']) && chips.opened.includes('documento') && /\+ filtros/.test(chips.more || ''), JSON.stringify(chips));
    // botões da conversa
    await czClickLabel('💰 Venda');
    const qb = await q(`const v = sh.querySelector('.qbtns .sale-quick:not(.conv-quick)'); const c = sh.querySelector('.qbtns .conv-quick:not(.auto-quick)'); return { venda: getComputedStyle(v).display, compra: getComputedStyle(c).display };`);
    check('botões da conversa: desligado some, os outros continuam', qb.venda === 'none' && qb.compra !== 'none', JSON.stringify(qb));
    // densidade compacta: menor e nenhum texto abaixo de 11 px
    const tall = (await rectOf('.pnav')).h;
    await density('compacta');
    const dense = await q(`const p = sh.querySelector('.panel'); let min = 99, where = '';
      p.querySelectorAll('*').forEach((e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return; const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < min) { min = f; where = e.className || e.tagName; } });
      return { dense: p.classList.contains('dense'), nav: Math.round(sh.querySelector('.pnav').getBoundingClientRect().height), min, where };`);
    check('densidade compacta: menos espaço e texto ≥ 11 px', dense.dense && dense.nav < tall && dense.min >= 11, `barra ${Math.round(tall)} → ${dense.nav} px; menor texto ${dense.min}px (${dense.where})`);
    // largura do painel continua funcionando junto
    const w0 = (await rectOf('.panel')).w;
    await drag('.resizer', -60, 0);
    const w1 = (await rectOf('.panel')).w;
    check('mudar a largura do painel continua funcionando', w1 >= w0 + 50, `${Math.round(w0)} → ${Math.round(w1)} px`);
    // tudo lembrado depois de recarregar (storage local da extensão)
    await sleep(400);
    await s('Page.reload', { ignoreCache: true });
    await sleep(1500);
    state = null;
    for (const stop = Date.now() + TIMEOUT_MS; Date.now() < stop;) {
      state = await evalPage(`(() => { const sh = document.getElementById('tsp-wa-host')?.shadowRoot; const t = sh && sh.querySelector('.toggle'); if (t && !sh.querySelector('.root.open')) t.click(); return !!(sh && sh.querySelector('.root.open')); })()`).catch(() => false);
      if (state) break;
      await sleep(300);
    }
    await sleep(1200);
    const kept = await q(`const p = sh.querySelector('.panel'); return { dense: p.classList.contains('dense'), labels: sh.querySelector('.labels').classList.contains('cs-collapsed'),
      midiasInMore: !!sh.querySelector('.pmenu [data-sec="midias"]'), venda: getComputedStyle(sh.querySelector('.qbtns .sale-quick:not(.conv-quick)')).display,
      topH: Math.round(sh.querySelector('.ptop').getBoundingClientRect().height), width: Math.round(p.getBoundingClientRect().width) };`);
    check('tudo lembrado depois de recarregar (densidade, recolhida, abas, botões, topo, largura)',
      kept.dense && kept.labels && kept.midiasInMore && kept.venda === 'none' && Math.abs(kept.topH - savedTop) <= 30 && Math.abs(kept.width - w1) <= 4, JSON.stringify({ ...kept, topEsperado: Math.round(savedTop), larguraEsperada: Math.round(w1) }));
    // "Voltar ao padrão"
    await czOpen();
    await q(`[...sh.querySelectorAll('.cz-foot .bbtn')].find((b) => /padrão/.test(b.textContent)).click(); await wait(200); return true;`);
    await czClose();
    const def = await q(`const p = sh.querySelector('.panel'); return { dense: p.classList.contains('dense'), labels: sh.querySelector('.labels').classList.contains('cs-collapsed'), midiasInBar: !!sh.querySelector('.pnav > [data-sec="midias"]'), limited: p.classList.contains('top-limited') };`);
    check('"Voltar ao padrão" desfaz tudo', !def.dense && !def.labels && def.midiasInBar && !def.limited, JSON.stringify(def));
    // 4. lista de conversas (2.10.3): depois de enviar, a lista que pulou para o topo volta para onde estava
    const list = () => evalPage(`(() => { const p = document.getElementById('pane-side'); if (!p) return null; const pr = p.getBoundingClientRect();
      const rows = [...p.querySelectorAll('[role=listitem]')]; const top = rows.find((r) => r.getBoundingClientRect().bottom > pr.top + 4);
      const sel = p.querySelector('[aria-selected=true]'); return { st: Math.round(p.scrollTop), top: top && top.dataset.name, sel: sel && sel.parentElement.dataset.name }; })()`);
    const paneXY = async () => evalPage(`(() => { const r = document.getElementById('pane-side').getBoundingClientRect(); return { x: r.left + 120, y: r.top + 160 }; })()`);
    async function wheel(dy) { const p = await paneXY(); await s('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: dy }); }
    async function clickAt(x, y) { await mouse('mouseMoved', x, y, { buttons: 0, button: 'none' }); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
    async function clickRow(name) {
      const r = await evalPage(`(() => { const e = document.querySelector('[data-name="${name}"]').getBoundingClientRect(); return { x: e.left + 60, y: e.top + 30 }; })()`);
      await clickAt(r.x, r.y);
    }
    async function typeAndSend(how = 'enter') {
      const b = await evalPage(`(() => { const r = document.querySelector('footer [contenteditable]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 18 }; })()`);
      await clickAt(b.x, b.y);
      await s('Input.insertText', { text: 'oi, tudo bem?' });
      if (how === 'enter') {
        await s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      } else {
        const r = await evalPage(`(() => { const e = document.querySelector('footer button').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; })()`);
        await clickAt(r.x, r.y);
      }
    }
    const settle = () => sleep(2300); // passa a janela de 2 s entre um cenário e outro
    // a) rolei até o meio, abri uma conversa da tela e enviei com Enter
    await wheel(1100); await sleep(700);
    const l0 = await list();
    await clickRow(`Cliente ${Number(l0.top.split(' ')[1]) + 3}`); await sleep(200);
    const l1 = await list();
    await typeAndSend('enter'); await sleep(800);
    const l2 = await list();
    check('lista: depois de enviar (Enter), volta para onde estava e as mesmas conversas continuam na tela', l0.st > 500 && l2.st > 500 && l2.top === l1.top, `antes ${JSON.stringify(l1)} · depois ${JSON.stringify(l2)}`);
    await settle();
    // b) pelo botão Enviar
    await wheel(-300); await sleep(700);
    const b0 = await list();
    await clickRow(`Cliente ${Number(b0.top.split(' ')[1]) + 2}`); await sleep(200);
    const b1 = await list();
    await typeAndSend('button'); await sleep(800);
    const b2 = await list();
    check('lista: pelo botão Enviar também volta', b2.st > 300 && b2.top === b1.top, `antes ${JSON.stringify(b1)} · depois ${JSON.stringify(b2)}`);
    await settle();
    // c) não briga: se eu rolo logo depois de enviar, a extensão não mexe
    await typeAndSend('enter');
    await wheel(-200);
    await sleep(800);
    const c1 = await list();
    check('lista: se você rola logo depois de enviar, não mexe', c1.st <= 8, JSON.stringify(c1));
    await settle();
    // d) mensagem de cliente e clique na lista não restauram
    await wheel(900); await sleep(700);
    await evalPage(`window.__fakeIncoming('Cliente 30')`); await sleep(600);
    const d1 = await list();
    check('lista: mensagem de cliente que joga a lista para o topo não restaura', d1.st <= 8, JSON.stringify(d1));
    await wheel(900); await sleep(700);
    await typeAndSend('enter');
    const d2r = await list();
    await clickRow(d2r.top); // clicou na lista logo depois de enviar (antes do pulo)
    await sleep(800);
    const d2 = await list();
    check('lista: clicar na lista para abrir outra conversa logo depois de enviar não restaura', d2.st <= 8, JSON.stringify(d2));
    await settle();
    // e) desligado no Personalizar
    await czClickLabel('Manter a posição da lista de conversas ao enviar');
    await wheel(900); await sleep(700);
    await typeAndSend('enter'); await sleep(800);
    const e1 = await list();
    check('lista: com a opção desligada, não mexe', e1.st <= 8, JSON.stringify(e1));
    await czClickLabel('Manter a posição da lista de conversas ao enviar');
    // f) Próxima conversa ▼ abre a de baixo
    await wheel(300); await sleep(700);
    const f0 = await list();
    const below = await evalPage(`(() => { const rows = [...document.querySelectorAll('#pane-side [role=listitem]')]; const i = rows.findIndex((r) => r.querySelector('[aria-selected=true]')); return rows[i + 1] && rows[i + 1].dataset.name; })()`);
    await q(`sh.querySelector('.next-chat').click(); await wait(400); return true;`);
    const f1 = await list();
    const nextVisible = await q(`const b = sh.querySelector('.next-chat'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none';`);
    check('"Próxima ▼" abre a conversa logo abaixo da atual', nextVisible && !!below && f1.sel === below && f1.sel !== f0.sel, `de ${f0.sel} para ${f1.sel} (esperado ${below})`);
    // g) sem a lista na página: nada acontece, sem erro
    await evalPage(`document.getElementById('pane-side').remove()`);
    await typeAndSend('enter'); await sleep(600);
    await q(`sh.querySelector('.next-chat') && sh.querySelector('.next-chat').click(); await wait(300); return true;`);
    check('nenhum erro no console usando tudo isso (inclusive sem a lista na página)', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 5. prévia: tirar partes só deste envio (2.10.4). Mensagem rápida de teste gravada no cache local da extensão
    // (sem rede o painel mostra a última versão guardada): áudio + texto + álbum de 3 fotos
    const ITEM = {
      id: 'i-teste-2104', category_id: 'c-teste', title: 'Follow com áudio', type: 'audio', body: null, file_url: 'https://x.supabase.co/a.ogg', file_name: 'a.ogg', file_size: 1000, usage_count: 0, position: 0, created_at: '2026-11-06T10:00:00Z',
      parts: [
        { id: 'p1', item_id: 'i-teste-2104', position: 0, type: 'audio', body: null, file_url: 'https://x.supabase.co/a.ogg', file_name: 'a.ogg', file_size: 1000, wait_seconds: 2, typing_seconds: 5 },
        { id: 'p2', item_id: 'i-teste-2104', position: 1, type: 'texto', body: 'Oi {nome}, tudo bem?', file_url: null, file_name: null, file_size: null, wait_seconds: 3, typing_seconds: 4 },
        { id: 'p3', item_id: 'i-teste-2104', position: 2, type: 'imagem', body: 'Fotos', file_url: 'https://x.supabase.co/1.jpg', file_name: '1.jpg', file_size: 10, wait_seconds: 1, typing_seconds: 2,
          files: [{ kind: 'imagem', file_url: 'https://x.supabase.co/1.jpg', file_name: '1.jpg', file_size: 10 }, { kind: 'imagem', file_url: 'https://x.supabase.co/2.jpg', file_name: '2.jpg', file_size: 10 }, { kind: 'video', file_url: 'https://x.supabase.co/3.mp4', file_name: '3.mp4', file_size: 10 }] },
      ],
    };
    const inExt = async (expression) => (await s('Runtime.evaluate', { expression, contextId: lastIso, returnByValue: true, awaitPromise: true })).result.value;
    await inExt(`new Promise((r) => chrome.storage.local.set({ library: ${JSON.stringify({ categories: [{ id: 'c-teste', name: 'Testes', position: 0 }], items: [ITEM], savedAt: '2026-11-06T10:00:00Z' })} }, () => r(true)))`);
    await s('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (const stop = Date.now() + TIMEOUT_MS; Date.now() < stop;) {
      const okOpen = await evalPage(`(() => { const sh = document.getElementById('tsp-wa-host')?.shadowRoot; const t = sh && sh.querySelector('.toggle'); if (t && !sh.querySelector('.root.open')) t.click(); return !!(sh && sh.querySelector('.card[data-id="i-teste-2104"]')); })()`).catch(() => false);
      if (okOpen) break;
      await sleep(300);
    }
    const pv = () => q(`const c = sh.querySelector('.card[data-id="i-teste-2104"]'); if (!c) return null; const pts = [...c.querySelectorAll('.pv-pt')];
      const go = c.querySelector('.pv-send');
      return { parts: pts.length, off: pts.map((p) => p.classList.contains('off')), note: (c.querySelector('.pv-offnote') || {}).textContent || '', total: (c.querySelector('.pv-total') || {}).textContent || '',
        go: go ? { text: go.textContent, disabled: go.disabled } : null, cellsOff: [...c.querySelectorAll('.pv-cell')].map((x) => x.classList.contains('off')),
        x: pts.map((p) => !!p.querySelector('.pv-x')) };`);
    await q(`sh.querySelector('.card[data-id="i-teste-2104"] .info .t').click(); await wait(500); return true;`);
    const v0 = await pv();
    check('prévia: cada parte com o seu ✕ e o tempo total no rodapé', v0 && v0.parts === 3 && v0.x.every(Boolean) && /3 de 3 partes · tempo total ~17s/.test(v0.total) && v0.go && !v0.go.disabled, JSON.stringify(v0));
    await q(`sh.querySelector('.card[data-id="i-teste-2104"] .pv-pt[data-part="0"] .pv-x').click(); await wait(150); return true;`);
    const v1 = await pv();
    check('tirar a 1ª parte (áudio): fica apagada com "Não vai ser enviada · desfazer" e o tempo cai', v1.off[0] && !v1.off[1] && /Não vai ser enviada · desfazer/.test(v1.note) && /2 de 3 partes · tempo total ~10s/.test(v1.total), JSON.stringify(v1));
    const stored = await inExt(`new Promise((r) => chrome.storage.local.get(['library'], (x) => r(x.library.items[0].parts.length)))`);
    check('a mensagem rápida salva não muda', stored === 3, `partes guardadas: ${stored}`);
    await q(`sh.querySelector('.card[data-id="i-teste-2104"] .pv-undo').click(); await wait(150); return true;`);
    const v2 = await pv();
    check('desfazer volta a parte', !v2.off[0] && /3 de 3 partes · tempo total ~17s/.test(v2.total), JSON.stringify(v2));
    await q(`sh.querySelectorAll('.card[data-id="i-teste-2104"] .pv-cell .pv-fx')[1].click(); await wait(150); return true;`);
    const v3 = await pv();
    check('álbum: o ✕ da foto tira só aquela foto', JSON.stringify(v3.cellsOff) === JSON.stringify([false, true, false]) && !v3.off[2], JSON.stringify(v3));
    await q(`const c = sh.querySelector('.card[data-id="i-teste-2104"]'); for (const k of [0, 2]) { c.querySelectorAll('.pv-cell .pv-fx')[k].click(); await wait(120); } return true;`);
    const v4 = await pv();
    check('álbum: tirando todas as fotos, a parte inteira sai', v4.off[2] === true, JSON.stringify(v4));
    await q(`const c = sh.querySelector('.card[data-id="i-teste-2104"]'); for (const i of [0, 1]) { c.querySelector(\`.pv-pt[data-part="\${i}"] .pv-x\`).click(); await wait(120); } return true;`);
    const v5 = await pv();
    check('tirando todas as partes, o botão fica desligado ("Nada para enviar")', v5.off.every(Boolean) && v5.go && v5.go.disabled && v5.go.text === 'Nada para enviar' && /Nenhuma parte para enviar/.test(v5.total), JSON.stringify(v5));
    if (SHOTS_DIR) {
      await q(`const c = sh.querySelector('.card[data-id="i-teste-2104"]'); c.querySelectorAll('.pv-undo').forEach((b) => b.click()); await wait(150);
        c.querySelector('.pv-pt[data-part="0"] .pv-x').click(); await wait(120); c.querySelectorAll('.pv-cell .pv-fx')[1].click(); await wait(200);
        sh.querySelectorAll('.cs-toggle[aria-expanded="true"]').forEach((b) => b.click()); await wait(200); c.scrollIntoView({ block: 'start' }); return true;`);
      await sleep(400);
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS_DIR, 'previa-tirar-partes.png'), Buffer.from(data, 'base64'));
      console.log(`     print: ${path.join(SHOTS_DIR, 'previa-tirar-partes.png')}`);
    }
    await q(`sh.querySelector('.card[data-id="i-teste-2104"] .pv-restore').click(); await wait(150); return true;`);
    const v6 = await pv();
    check('"Restaurar" volta todas as partes e fotos', v6.off.every((x) => !x) && v6.cellsOff.every((x) => !x) && /3 de 3/.test(v6.total), JSON.stringify(v6));
    check('nenhum erro no console na prévia', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 6. 📈 → venda do ERP (2.10.5), com o Supabase falso: achar pelo telefone, escolher por valor, nenhuma,
    // mais de uma pelo telefone, desligar. Conferindo cada gravação: só wa_chat_id e telefone vazio na venda.
    const iso = (daysAgo, h = 12) => new Date(Date.now() - daysAgo * 86400000 + (h - 12) * 3600000).toISOString();
    const EV = (n, chat, value) => ({ event_id: `0000000${n}-0000-4000-8000-00000000000${n}`, chat_id: chat, contact_name: `Cliente ${n}`, value, ad_title: null, ad_id: null, method: 'chat', test: false, status: 'enviado', events_received: 1, error: null, created_at: iso(0), event_name: 'Purchase', sale_id: null, sale_link_set_chat: false, sale_link_set_phone: null });
    const SL = (n, extra) => ({ id: `5a1e000${n}-0000-4000-8000-00000000000${n}`, customer_name: `Venda ${n}`, customer_phone: null, sale_date: iso(1), total_sale_price: 100, wa_chat_id: null, status: 'finalizado', ...extra });
    fake.events = [EV(1, '5511911112222@c.us', 100), EV(2, '5511933334444@c.us', 200), EV(3, '5511955556666@c.us', 999), EV(4, '5511977770000@c.us', 150)];
    fake.sales = [
      SL(1, { customer_name: 'Maria', customer_phone: '(11) 91111-2222', total_sale_price: 100, sale_date: iso(2) }), // telefone da conversa 1
      SL(2, { customer_name: 'Sem telefone', total_sale_price: 190, sale_date: iso(1) }), // valor parecido com a 2
      SL(3, { customer_name: 'Longe', total_sale_price: 260, sale_date: iso(1) }), // valor fora dos 10%
      SL(4, { customer_name: 'Ana A', customer_phone: '11977770000', total_sale_price: 150, sale_date: iso(1) }), // duas com o telefone da 4
      SL(5, { customer_name: 'Ana B', customer_phone: '11977770000', total_sale_price: 140, sale_date: iso(3) }),
    ];
    fake.on = true;
    await q(`sh.querySelector('.pnav [data-sec="conversoes"]').click(); await wait(300); return true;`);
    const box = (n) => `.cv-link[data-event="${fake.events[n - 1].event_id}"]`;
    const waitFor = async (js, ms = 12000) => { for (const stop = Date.now() + ms; Date.now() < stop;) { if (await q(js).catch(() => false)) return true; await sleep(250); } return false; };
    const ready = await waitFor(`return sh.querySelectorAll('.cv-link').length >= 4;`);
    check('📈 histórico: cada compra real mostra "Venda do ERP" com "Ligar à venda do ERP"', ready, `caixas: ${await q(`return sh.querySelectorAll('.cv-link').length;`)} · worker: ${swTarget ? 'sim' : 'não'} · pedidos: ${JSON.stringify(fake.seen.slice(0, 12))} · anexos: ${JSON.stringify(fake.attached)} · seção: ${await q(`return sh.querySelector('.panel').className;`)} · tela: ${(await q(`return sh.querySelector('.ctab').textContent.slice(0, 300);`)) }`);
    const boxText = (n) => q(`const b = sh.querySelector('${box(n)}'); return b ? b.textContent : '';`);
    const click = (n, sel, k = 0) => q(`const b = sh.querySelectorAll('${box(n)} ${sel}')[${k}]; if (!b) return false; b.click(); return true;`);
    // a) uma pelo telefone: liga sozinha
    await click(1, '.cv-findsale');
    await waitFor(`return !!sh.querySelector('${box(1)} .cv-linked');`);
    const t1 = await boxText(1);
    const p1 = fake.patches.filter((x) => x.id === fake.sales[0].id || x.id === fake.events[0].event_id);
    check('achar pelo telefone: liga sozinha e mostra "Venda do ERP ligada: #… · cliente · R$"', /Venda do ERP ligada: #5a1e0001 · Maria · R\$\s?100,00/.test(t1) && fake.sales[0].wa_chat_id === '5511911112222@c.us' && fake.events[0].sale_id === fake.sales[0].id,
      `${t1} · ${JSON.stringify(p1)}`);
    // b) nenhuma pelo telefone: escolher por valor (±10%, sem telefone) → preenche o telefone vazio
    await click(2, '.cv-findsale');
    await waitFor(`return !!sh.querySelector('${box(2)} .cv-pick');`);
    const t2 = await boxText(2);
    const picks2 = await q(`return sh.querySelectorAll('${box(2)} .cv-pick').length;`);
    await click(2, '.cv-pick');
    await waitFor(`return !!sh.querySelector('${box(2)} .cv-linked');`);
    check('escolher por valor: lista só a venda parecida (±10%) e "É esta" liga e preenche o telefone vazio',
      picks2 === 1 && /Sem telefone/.test(t2) && !/Longe/.test(t2) && fake.sales[1].wa_chat_id === '5511933334444@c.us' && fake.sales[1].customer_phone === '(11) 93333-4444' && fake.events[1].sale_id === fake.sales[1].id,
      `${t2} · venda: ${JSON.stringify(fake.sales[1])}`);
    // c) nenhuma: "Lançar venda no ERP"
    await click(3, '.cv-findsale');
    await waitFor(`return !!sh.querySelector('${box(3)} .cv-launch');`);
    check('nenhuma venda parecida: botão "Lançar venda no ERP"', /Nenhuma venda parecida/.test(await boxText(3)) && await q(`return !!sh.querySelector('${box(3)} .cv-launch');`));
    // d) mais de uma pelo telefone: escolher
    await click(4, '.cv-findsale');
    await waitFor(`return sh.querySelectorAll('${box(4)} .cv-pick').length >= 2;`);
    const t4 = await boxText(4);
    await click(4, '.cv-pick', 1);
    await waitFor(`return !!sh.querySelector('${box(4)} .cv-linked');`);
    check('mais de uma pelo telefone: mostra as duas para escolher e liga a escolhida', /Achei 2 vendas/.test(t4) && fake.events[3].sale_id === fake.sales[4].id && /Ana B/.test(await boxText(4)), t4);
    // e) desligar: desfaz só o que a ligação preencheu e não liga sozinha de novo
    await click(1, '.cv-unlink');
    await waitFor(`return /Desligada/.test((sh.querySelector('${box(1)}') || {}).textContent || '');`);
    const t5 = await boxText(1);
    check('desligar: tira a ligação, limpa o wa_chat_id que ela preencheu e deixa escolher de novo (sem religar sozinha)',
      fake.events[0].sale_id === null && fake.sales[0].wa_chat_id === null && /É esta/.test(t5) && !/Venda do ERP ligada/.test(t5), `${t5} · venda: ${JSON.stringify(fake.sales[0])}`);
    const salePatches = fake.patches.filter((x) => x.table === 'sales');
    check('a venda só recebe wa_chat_id e o telefone vazio (nunca valores, itens ou estoque)', salePatches.length > 0 && salePatches.every((x) => Object.keys(x.body || {}).every((k) => ['wa_chat_id', 'customer_phone'].includes(k))), JSON.stringify(salePatches.map((x) => x.body)));
    fake.on = false;
    check('nenhum erro no console ligando vendas', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 7. automações (2.11.0) com o banco falso: modelo "Pós-venda" no passo a passo, criando a mensagem DENTRO da
    // automação (o mesmo editor das mensagens rápidas), e a validação do editor avançado (mostra onde está o erro)
    fake.on = true;
    fake.generic = true;
    fake.db.wa_settings = [{ id: 1, paused_all: false, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6], runner_id: null, lease_until: null, updated_at: new Date().toISOString() }];
    // a extensão começa do zero com o banco falso (as seções sem rede deixaram guardado "tabela não existe")
    await c.send('Extensions.loadUnpacked', { path: EXT_DIR });
    await sleep(1200);
    await s('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (const stop = Date.now() + TIMEOUT_MS; Date.now() < stop;) {
      const opened = await evalPage(`(() => { const sh = document.getElementById('tsp-wa-host')?.shadowRoot; const t = sh && sh.querySelector('.toggle'); if (t && !sh.querySelector('.root.open')) t.click(); return !!(sh && sh.querySelector('.root.open')); })()`).catch(() => false);
      if (opened) break;
      await sleep(300);
    }
    await sleep(800);
    await q(`sh.querySelector('[data-sec="follows"]').click(); await wait(300); return true;`);
    const listOk = await waitFor(`return !!sh.querySelector('.fw-new');`, 15000);
    check('automações: a lista abre com "+ Nova automação"', listOk, `${(await q(`return (sh.querySelector('.ftab') || {}).textContent || '';`)).slice(0, 120)}`);
    await q(`sh.querySelector('.fw-new').click(); await wait(200); sh.querySelector('.vb .vb-legacy').click(); await wait(200); return true;`);
    const models = await q(`return [...sh.querySelectorAll('.fw-model')].map((b) => b.dataset.wizard || b.dataset.seq || 'branco');`);
    check('"+ Nova automação": 4 modelos + 2 sequências + "Em branco (avançado)"', JSON.stringify(models) === JSON.stringify(['posvenda', 'followup', 'lead', 'sumido', 'seq_blank', 'lead_followup', 'branco']), JSON.stringify(models));
    await q(`sh.querySelector('.fw-model[data-wizard="posvenda"]').click(); await wait(200); sh.querySelector('.wiz-next').click(); await wait(150); sh.querySelector('.wiz-next').click(); await wait(200); return true;`);
    const step3 = await q(`return !!sh.querySelector('.fw-wizard .fw-newmsg') && /O que mandar/.test(sh.querySelector('.fw-wizard').textContent);`);
    check('passo a passo: Quem → Quando → O quê (com "+ Criar mensagem aqui")', step3);
    // "+ Criar mensagem aqui": o mesmo editor das mensagens rápidas, na categoria "Automações"
    await q(`sh.querySelector('.fw-wizard .fw-newmsg').click(); return true;`);
    const edOpen = await waitFor(`return !!sh.querySelector('.editor .ed-forauto');`, 10000);
    const cat = (fake.db.wa_categories || []).find((x) => x.name === 'Automações');
    const catSel = await q(`const s = sh.querySelector('.editor select.ed-cat'); return s ? s.options[s.selectedIndex].textContent : '';`);
    check('"+ Criar mensagem aqui" abre o editor das mensagens rápidas na categoria "Automações" (criada)', edOpen && !!cat && catSel === 'Automações', `editor: ${edOpen} · categoria: ${catSel}`);
    await q(`const t = sh.querySelector('.editor input.ed-title'); t.value = 'Pedido de avaliação'; t.dispatchEvent(new Event('input', { bubbles: true }));
      const x = sh.querySelector('.editor textarea.ed-text'); x.value = 'Oi {nome}! Pode avaliar a gente? https://g.page/r/teste'; x.dispatchEvent(new Event('input', { bubbles: true }));
      sh.querySelector('.editor .ed-actions .btn.primary').click(); return true;`);
    const back = await waitFor(`const s = sh.querySelector('.fw-wizard select[aria-label="Mensagem"]'); return !!(s && s.value);`, 15000);
    const item = (fake.db.wa_items || []).find((x) => x.title === 'Pedido de avaliação');
    const chosen = await q(`const s = sh.querySelector('.fw-wizard select[aria-label="Mensagem"]'); return s ? s.value : '';`);
    check('ao salvar, volta para a automação com a mensagem nova já escolhida', back && !!item && chosen === item.id && item.category_id === (cat && cat.id), `escolhida: ${chosen} · salva: ${JSON.stringify(item && { id: item.id, category_id: item.category_id })}`);
    await q(`sh.querySelector('.wiz-next').click(); await wait(200); return true;`);
    const sentence = await q(`return (sh.querySelector('.fw-wizard .fw-sentence') || {}).textContent || '';`);
    check('resumo em uma frase', /Quando uma venda for registrada pela conversa, 7 dias depois manda “Pedido de avaliação”\./.test(sentence), sentence);
    const autoBefore = (fake.db.wa_automations || []).length;
    await q(`sh.querySelector('.wiz-off').click(); return true;`);
    await waitFor(`return !sh.querySelector('.fw-wizard') && !!sh.querySelector('.fw-new');`, 15000);
    const auto = (fake.db.wa_automations || [])[autoBefore];
    check('"Salvar desligada" grava a automação certa (venda registrada, 7 dias, a mensagem criada)',
      !!auto && auto.trigger_type === 'venda_registrada' && auto.wait_minutes === 10080 && auto.active === false && auto.actions[0].type === 'enviar' && auto.actions[0].item_id === (item && item.id),
      JSON.stringify(auto && { trigger_type: auto.trigger_type, wait_minutes: auto.wait_minutes, active: auto.active, actions: auto.actions }));
    const card = await waitFor(`return [...sh.querySelectorAll('.fw-card')].some((c) => /Pós-venda/.test(c.textContent) && c.querySelector('.fw-sentence') && c.querySelector('.fw-stats'));`, 15000);
    const cardTxt = await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => /Pós-venda/.test(x.textContent)); return c ? c.textContent : '';`);
    check('lista: frase-resumo, DESLIGADA, na fila e já receberam', card && /DESLIGADA/.test(cardTxt) && /Já receberam: 0/.test(cardTxt), cardTxt.slice(0, 300));
    // editor avançado: "Colocar uma etiqueta" sem etiqueta não salva e mostra onde
    const nAuto = (fake.db.wa_automations || []).length;
    await q(`sh.querySelector('.fw-new').click(); await wait(200); sh.querySelector('.vb .vb-legacy').click(); await wait(200); sh.querySelector('.fw-blank').click(); await wait(300);
      const n = sh.querySelector('.fw-editor input.ed-title'); n.value = 'Teste validação'; n.dispatchEvent(new Event('input', { bubbles: true }));
      const a = sh.querySelector('.fw-editor select[aria-label="Ação 1"]'); a.value = 'adicionar_etiqueta'; a.dispatchEvent(new Event('change', { bubbles: true })); await wait(200);
      [...sh.querySelectorAll('.fw-editor .bbtn.primary')].find((b) => /Salvar/.test(b.textContent)).click(); await wait(400); return true;`);
    const inv = await q(`const bad = [...sh.querySelectorAll('.fw-editor .fw-invalid')]; return { n: bad.length, action: bad.some((b) => /Ação 1: escolha a etiqueta/.test(b.textContent) && b.querySelector('select[aria-label="Ação 1"]')),
      trigger: bad.some((b) => /etiqueta do gatilho/.test(b.textContent)), msg: (sh.querySelector('.fw-editor .ed-msg') || {}).textContent || '', i: sh.querySelectorAll('.fw-editor .fw-i').length };`);
    check('validação: não salva e marca em vermelho onde está cada problema (ação sem etiqueta, etiqueta do gatilho)',
      inv.n >= 2 && inv.action && inv.trigger && /escolha a etiqueta/i.test(inv.msg) && (fake.db.wa_automations || []).length === nAuto, JSON.stringify(inv));
    check('editor avançado com frases e (i) explicando as opções', inv.i >= 3 && await q(`return /Para quem está na etiqueta/.test(sh.querySelector('.fw-editor').textContent) && /tempo corrido/.test(sh.querySelector('.fw-editor').textContent);`), `(i): ${inv.i}`); // 2.14.2: esperas em tempo corrido
    check('nenhum erro no console nas automações', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 8. sequência (2.12.0): modelo "Follow-up de lead novo" no editor visual, validação por passo, salvar e os
    // números da lista (quantos em cada passo e saídas por ✅ / ❌)
    await q(`const b = [...sh.querySelectorAll('.fw-editor .bbtn')].find((x) => x.textContent === 'Cancelar'); if (b) b.click(); await wait(200); sh.querySelector('.fw-new').click(); await wait(200); sh.querySelector('.vb .vb-legacy').click(); await wait(200);
      sh.querySelector('.fw-seq[data-seq="lead_followup"]').click(); await wait(300); return true;`);
    const seqOpen = await q(`const e = sh.querySelector('.sq-editor'); return e ? { nodes: e.querySelectorAll('.sq-node').length, yes: e.querySelectorAll('.sq-branch.sq-yes').length, no: e.querySelectorAll('.sq-branch.sq-no').length,
      start: e.querySelector('.sq-start select').value, sends: e.querySelectorAll('.sq-enviar').length, waits: e.querySelectorAll('.sq-esperar').length } : null;`);
    check('sequência: "Follow-up de lead novo" abre no editor (começo lead, 3 esperas com ✅/❌, 3 mensagens)',
      !!seqOpen && seqOpen.start === 'lead' && seqOpen.waits === 3 && seqOpen.sends === 3 && seqOpen.yes === 3 && seqOpen.no === 3 && seqOpen.nodes === 9, JSON.stringify(seqOpen));
    const nAuto2 = (fake.db.wa_automations || []).length;
    await q(`sh.querySelector('.sq-save').click(); await wait(300); return true;`);
    const seqInv = await q(`return { bad: [...sh.querySelectorAll('.sq-editor .sq-enviar.fw-invalid')].length, msg: (sh.querySelector('.sq-editor .ed-msg') || {}).textContent || '' };`);
    check('sequência: sem as mensagens não salva e marca cada passo de envio', seqInv.bad === 3 && /Escolha ou crie a mensagem/.test(seqInv.msg) && (fake.db.wa_automations || []).length === nAuto2, JSON.stringify(seqInv));
    const itemId = item && item.id;
    for (let k = 0; k < 3; k++) {
      await q(`const s = sh.querySelectorAll('.sq-editor .sq-enviar select')[${k}]; s.value = '${itemId}'; s.dispatchEvent(new Event('change', { bubbles: true })); await wait(150); return true;`);
    }
    let savedSeq = null;
    fake.onAutomationPost = (row) => {
      if (row.kind !== 'sequencia') return;
      savedSeq = row;
      const first = row.sequence.steps[0].id;
      const r = (status, extra) => ({ id: require('crypto').randomUUID(), automation_id: row.id, chat_id: `55119000000${String(Math.random()).slice(2, 4)}@c.us`, entry_key: 'lead', node: first, status, branches: [], version: 0, ...extra });
      fake.db.wa_sequence_runs = [...(fake.db.wa_sequence_runs || []), r('ativo'), r('ativo'), r('fim', { node: null, outcome: 'respondeu' }), r('fim', { node: null, outcome: 'nao_respondeu' }), r('fim', { node: null, outcome: 'nao_respondeu' })];
    };
    await q(`sh.querySelector('.sq-save').click(); return true;`);
    await waitFor(`return !sh.querySelector('.sq-editor') && !!sh.querySelector('.fw-new');`, 15000);
    const lbl = (fake.db.wa_labels || []).find((l) => l.name === 'Em atendimento');
    const flat = [];
    const walk = (list) => (list || []).forEach((n) => { flat.push(n); if (n.type === 'esperar') { walk(n.yes); walk(n.no); } });
    if (savedSeq) walk(savedSeq.sequence.steps);
    check('sequência salva: kind "sequencia", começo lead, 3 envios com a mensagem e "Em atendimento" criada nos ✅',
      !!savedSeq && savedSeq.trigger_type === 'sequencia' && savedSeq.sequence.start.type === 'lead' && savedSeq.sequence.business === false /* 2.14.2: tempo corrido */
      && flat.filter((n) => n.type === 'enviar' && n.item_id === itemId).length === 3 && !!lbl && flat.filter((n) => n.type === 'etiqueta' && n.label_id === lbl.id).length === 3
      && savedSeq.sequence.steps[0].after_mine === true && savedSeq.sequence.steps[0].amount === 2,
      JSON.stringify(savedSeq && { trigger_type: savedSeq.trigger_type, start: savedSeq.sequence.start, nodes: flat.map((n) => n.type) }));
    const statsOk = await waitFor(`return [...sh.querySelectorAll('.fw-card')].some((c) => /Follow-up de lead novo/.test(c.textContent) && /Saíram por ✅: 1/.test(c.textContent));`, 15000);
    const seqCard = await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => /Follow-up de lead novo/.test(x.textContent)); return c ? c.textContent : '';`);
    check('lista: sequência com quantos em cada passo agora e saídas por ✅ e ❌', statsOk && /Agora: 2/.test(seqCard) && /Esperando resposta \(2 h\): 2/.test(seqCard) && /por ❌: 2/.test(seqCard) && /Sequência: começa quando um lead novo chama/.test(seqCard), seqCard.slice(0, 400));
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console nas sequências', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 9. atalhos no cabeçalho da conversa (2.12.1): 💰 📈 ⏰ 🏷️ à esquerda do vídeo/ligação, no tamanho dos ícones do
    // WhatsApp; abrem o painel na tela certa; 🏷️ com a lista suspensa; reinserir; grupo; Personalizar; e as etiquetas
    // CRM com 3 tentativas, o motivo real e "Tentar de novo"
    fake.on = true;
    fake.generic = true;
    const uuid = () => require('crypto').randomUUID();
    const VIP = uuid();
    fake.db.wa_labels = [...(fake.db.wa_labels || []), { id: VIP, name: 'VIP', color: '#e11d48', position: 90, hidden: false, created_at: new Date().toISOString() }];
    const contacts = {};
    ['Cliente 3', 'Cliente 4', 'Cliente 5'].forEach((n) => { contacts[n] = uuid(); fake.db.wa_contacts = [...(fake.db.wa_contacts || []), { id: contacts[n], key: `nome:${n.toLowerCase()}`, phone: null, name: n }]; });
    fake.db.wa_contact_labels = [...(fake.db.wa_contact_labels || []), ...Object.values(contacts).map((id) => ({ contact_id: id, label_id: VIP }))];
    const openChat = (name) => evalPage(`(async () => { const r = document.querySelector('[data-name="${name}"]'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise((x) => setTimeout(x, 300)); return true; })()`);
    const pg = (js) => evalPage(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); ${js} })()`);
    const pgWait = async (js, ms = 8000) => { for (const stop = Date.now() + ms; Date.now() < stop;) { if (await pg(js).catch(() => false)) return true; await sleep(200); } return false; };
    await openChat('Cliente 3');
    // painel fechado
    await q(`if (sh.querySelector('.root.open')) sh.querySelector('.toggle').click(); await wait(300); return true;`);
    const inserted = await pgWait(`const h = document.querySelector('#main header'); const b = h.querySelector('.tsp-hdr'); return !!b && b.nextElementSibling && !!b.nextElementSibling.querySelector('[data-icon="video-call"]');`);
    const hd = await pg(`const b = [...document.querySelectorAll('#main header .tsp-hdr-b')]; const wa = document.querySelector('#main header .wb').getBoundingClientRect();
      return { keys: b.map((x) => x.dataset.hdr), tips: b.map((x) => x.title), icons: b.map((x) => x.textContent), w: b.map((x) => Math.round(x.getBoundingClientRect().width)), h: b.map((x) => Math.round(x.getBoundingClientRect().height)), waW: Math.round(wa.width), waH: Math.round(wa.height),
        top: Math.round(b[0].getBoundingClientRect().top - wa.top) };`);
    check('cabeçalho: 💰 📈 ⏰ 🏷️ entram logo à esquerda do vídeo/ligação, do tamanho dos ícones do WhatsApp, com dica',
      inserted && JSON.stringify(hd.keys) === '["venda","compra","agendar","etiqueta"]' && hd.icons.join('') === '💰📈⏰🏷️' && hd.tips.every(Boolean)
      && hd.w.every((x) => x === hd.waW) && hd.h.every((x) => x === hd.waH) && hd.top === 0, JSON.stringify(hd));
    await pg(`window.__hdrClicks = 0; document.querySelector('#main header [data-hdr="venda"]').click(); await wait(500); return true;`);
    const afterVenda = await q(`return { open: !!sh.querySelector('.root.open'), vendas: sh.querySelector('.panel').classList.contains('sec-vendas') };`);
    const hdrClicks = await pg('return window.__hdrClicks;');
    check('💰 com o painel fechado: abre o painel na tela de Vendas (e o clique não abre os dados do contato)', afterVenda.open && afterVenda.vendas && hdrClicks === 0, JSON.stringify({ ...afterVenda, hdrClicks }));
    await pg(`document.querySelector('#main header [data-hdr="compra"]').click(); await wait(400); return true;`);
    const afterCompra = await q(`return sh.querySelector('.panel').classList.contains('sec-conversoes');`);
    await pg(`document.querySelector('#main header [data-hdr="agendar"]').click(); await wait(400); return true;`);
    const afterAgendar = await q(`return sh.querySelector('.panel').classList.contains('sec-sched');`);
    check('📈 abre o 📈 (Conversões) e ⏰ abre o agendar desta conversa', afterCompra && afterAgendar, JSON.stringify({ afterCompra, afterAgendar }));
    await q(`const b = [...sh.querySelectorAll('.tab, [data-section]')].find((x) => x.dataset && x.dataset.section === 'mensagens'); if (b) b.click(); await wait(200); return true;`);
    // 🏷️: lista suspensa
    await pg(`document.querySelector('#main header [data-hdr="etiqueta"]').click(); await wait(300); return true;`);
    const popOk = await pgWait(`const p = document.getElementById('tsp-hdr-pop'); return !!p && !!p.shadowRoot.querySelector('.opt[data-label-id]');`);
    await pg(`const sh2 = document.getElementById('tsp-hdr-pop').shadowRoot; const i = sh2.querySelector('input'); i.value = 'Atacado'; i.dispatchEvent(new Event('input')); await wait(150); return true;`);
    const newBtn = await pg(`return document.getElementById('tsp-hdr-pop').shadowRoot.querySelector('.new').textContent;`);
    await pg(`document.getElementById('tsp-hdr-pop').shadowRoot.querySelector('.new').click(); return true;`);
    const createdOk = await pgWait(`const sh2 = document.getElementById('tsp-hdr-pop').shadowRoot; const o = [...sh2.querySelectorAll('.opt[data-label-id]')];
      const g = (n) => o.find((x) => x.querySelector('.nm').textContent === n); return !!g('Atacado') && g('Atacado').getAttribute('aria-checked') === 'true' && !!g('VIP') && g('VIP').getAttribute('aria-checked') === 'true';`, 10000);
    const atacado = (fake.db.wa_labels || []).find((l) => l.name === 'Atacado');
    check('🏷️: lista suspensa ali mesmo; "+ Nova etiqueta" cria e já marca; a que a conversa tem aparece ✓',
      popOk && /Nova etiqueta “Atacado”/.test(newBtn) && createdOk && !!atacado, JSON.stringify({ popOk, newBtn, createdOk, atacado: !!atacado }));
    await pg(`const sh2 = document.getElementById('tsp-hdr-pop').shadowRoot; [...sh2.querySelectorAll('.opt[data-label-id]')].find((x) => x.querySelector('.nm').textContent === 'VIP').click(); return true;`);
    await sleep(1200);
    const vipGone = !(fake.db.wa_contact_labels || []).some((r) => r.contact_id === contacts['Cliente 3'] && r.label_id === VIP);
    const vipUnchecked = await pg(`const o = [...document.getElementById('tsp-hdr-pop').shadowRoot.querySelectorAll('.opt[data-label-id]')].find((x) => x.querySelector('.nm').textContent === 'VIP'); return o && o.getAttribute('aria-checked');`);
    await pg(`const sh2 = document.getElementById('tsp-hdr-pop').shadowRoot; const i = sh2.querySelector('input'); i.value = 'atac'; i.dispatchEvent(new Event('input')); await wait(100); return true;`);
    const filtered = await pg(`return [...document.getElementById('tsp-hdr-pop').shadowRoot.querySelectorAll('.opt[data-label-id] .nm')].map((x) => x.textContent);`);
    await pg(`document.getElementById('tsp-hdr-pop').shadowRoot.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150); return true;`);
    const popClosed = await pg(`return !document.getElementById('tsp-hdr-pop');`);
    check('🏷️: desmarcar em 1 clique grava no banco; a busca filtra; Esc fecha', vipGone && vipUnchecked === 'false' && JSON.stringify(filtered) === '["Atacado"]' && popClosed, JSON.stringify({ vipGone, vipUnchecked, filtered, popClosed }));
    // o WhatsApp recria o cabeçalho / troca de conversa
    await pg(`window.__rebuildHeader(true); return true;`);
    const hdrBack = await pgWait(`return !!document.querySelector('#main header .tsp-hdr');`, 5000);
    await openChat('Cliente 6');
    const afterSwitch = await pgWait(`return document.querySelectorAll('#main header .tsp-hdr').length === 1 && !document.querySelector('#main header .tsp-hdr').hidden;`, 5000);
    check('reinsere quando o WhatsApp recria o cabeçalho e ao trocar de conversa (um só grupo de ícones)', hdrBack && afterSwitch, JSON.stringify({ hdrBack, afterSwitch }));
    await pg(`window.__group(true); return true;`);
    const grpHidden = await pgWait(`const b = document.querySelector('#main header .tsp-hdr'); return !b || b.hidden;`, 5000);
    await pg(`window.__group(false); return true;`);
    const grpBack = await pgWait(`const b = document.querySelector('#main header .tsp-hdr'); return !!b && !b.hidden;`, 5000);
    check('em grupo os atalhos somem (só conversa individual); voltam na conversa individual', grpHidden && grpBack, JSON.stringify({ grpHidden, grpBack }));
    // Personalizar
    await czOpen();
    const czHdr = await q(`return [...sh.querySelectorAll('.cz [data-cz-hdr]')].map((x) => x.dataset.czHdr + ':' + x.querySelector('input').checked);`);
    await q(`sh.querySelector('.cz [data-cz-hdr="etiqueta"] input').click(); await wait(200); sh.querySelector('.cz [data-cz-hdr="hide"] input').click(); await wait(200); return true;`);
    await czClose();
    const czApplied = await pg(`const b = document.querySelector('#main header [data-hdr="etiqueta"]'); return !!b && b.hidden;`);
    const panelBtns = await q(`return [...sh.querySelectorAll('.qbtns .sale-quick')].map((b) => getComputedStyle(b).display);`);
    await czOpen();
    await q(`sh.querySelector('.cz [data-cz-hdr="on"] input').click(); await wait(200); return true;`);
    await czClose();
    const allOff = await pgWait(`return !document.querySelector('#main header .tsp-hdr');`, 4000);
    const panelBtnsBack = await q(`return sh.querySelector('.panel').classList.contains('cz-hdr-hide');`);
    check('Personalizar: "Atalhos no cabeçalho" (ligado) e os 4; esconder 🏷️; esconder do painel Venda/Compra/Automação; desligar tudo',
      JSON.stringify(czHdr) === '["on:true","venda:true","compra:true","agendar:true","etiqueta:true","hide:false"]' && czApplied && panelBtns.every((d) => d === 'none') && allOff && panelBtnsBack === false,
      JSON.stringify({ czHdr, czApplied, panelBtns, allOff, panelBtnsBack }));
    await czClickLabel('Atalhos no cabeçalho da conversa');
    await czClickLabel('🏷️ Etiqueta CRM');
    // WhatsApp mudou (sem os ícones de vídeo/ligação): não faz nada
    await pg(`window.__rebuildHeader(false); return true;`);
    await sleep(2800);
    const noIcons = await pg(`return !document.querySelector('#main header .tsp-hdr');`);
    await pg(`window.__rebuildHeader(true); return true;`);
    const iconsAgain = await pgWait(`return !!document.querySelector('#main header [data-hdr="etiqueta"]:not([hidden])');`, 5000);
    check('cabeçalho sem os ícones do WhatsApp: não insere nada (e volta quando eles voltam)', noIcons && iconsAgain, JSON.stringify({ noIcons, iconsAgain }));
    // etiquetas CRM: 3 tentativas sozinho, depois o motivo e "Tentar de novo"
    fake.fail = { wa_contact_labels: 2 };
    fake.failed = 0;
    await openChat('Cliente 4');
    const retried = await waitFor(`return [...sh.querySelectorAll('.labels .chips .lchip')].some((c) => c.textContent === 'VIP');`, 12000);
    check('etiquetas CRM: falhou 2 vezes e carregou sozinho na 3ª tentativa', retried && fake.failed === 2, JSON.stringify({ retried, failed: fake.failed }));
    fake.fail = { wa_contact_labels: 99 };
    fake.failed = 0;
    await openChat('Cliente 5');
    const errShown = await waitFor(`return !!sh.querySelector('.labels .chips .lerr .lerr-retry');`, 15000);
    const errTxt = await q(`const e = sh.querySelector('.labels .chips .lerr'); return e ? { why: e.querySelector('.lerr-why').textContent, raw: e.querySelector('.lerr-raw').textContent, txt: e.querySelector('.none').textContent } : null;`);
    const tries = fake.failed;
    fake.fail = {};
    await q(`sh.querySelector('.labels .chips .lerr-retry').click(); return true;`);
    const fixed = await waitFor(`return [...sh.querySelectorAll('.labels .chips .lchip')].some((c) => c.textContent === 'VIP') && !sh.querySelector('.labels .chips .lerr');`, 12000);
    check('etiquetas CRM: depois de 3 tentativas mostra "Não consegui carregar", o motivo real nos detalhes e "Tentar de novo" (que carrega)',
      errShown && tries === 3 && !!errTxt && errTxt.txt === 'Não consegui carregar' && /Supabase deu erro ou demorou demais \(503\)/.test(errTxt.why) && /Supabase 503/.test(errTxt.raw) && fixed,
      JSON.stringify({ errShown, tries, errTxt, fixed }));
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console nos atalhos do cabeçalho', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 10. 💰 venda pelo WhatsApp igual à "Nova Venda" do ERP (2.12.3), com a ponte da WA-JS simulada (conversa aberta,
    // telefone conferido) e o banco falso: 2 produtos com o custo editado, 2 formas de pagamento, Correios, "Colar
    // formulário" com CEP, seções na ordem do ERP, recolher, resumo financeiro e a gravação de ponta a ponta
    fake.on = true;
    fake.generic = true;
    fake.sales = [];
    fake.cep = [];
    const CH = '5521987654321@c.us';
    const PA = uuid(); const PB = uuid(); const PC = uuid(); const AC = uuid(); const SUPP = uuid();
    Object.assign(fake.db, {
      products: [
        { id: PA, model: 'Smartwatch Ultra', color: 'Preto', category: 'smartwatch', price: 499.9, cost: 210, current_stock: 4, tiny_id: null },
        { id: PB, model: 'Pulseira Milanese', color: 'Prata', category: 'pulseira', price: 59.9, cost: 12.5, current_stock: 9, tiny_id: null },
        { id: PC, model: 'Pulseira Aço Milanese', color: 'Rose Gold 38/41mm', category: 'pulseira', price: 69.9, cost: 14, current_stock: 5, tiny_id: null }, // 2.12.7
      ],
      accessories: [{ id: AC, name: 'Caixa presente', cost: 3.2 }], motoboys: [{ id: uuid(), name: 'João Moto' }], suppliers: [{ id: SUPP, name: 'Fornecedor SP' }],
      cities: [{ id: uuid(), name: 'Niterói' }], neighborhoods: [], system_config: [{ key: 'fee_ea_credit_6', value: '0.0726' }],
      sale_items: [], sale_accessories: [],
      wa_ad_attribution: [{ id: uuid(), chat_id: CH, phone: '5521987654321', contact_name: 'Maria WhatsApp', ad_id: 'AD1', ad_title: 'Relógio Promo', source_app: 'Instagram', source_url: 'https://fb.me/ad1', first_message_at: new Date().toISOString() }],
      wa_chat_names: [{ chat_id: CH, name: 'Maria', source: 'aprendido', updated_at: new Date().toISOString() }],
    });
    // 2.12.4: etiquetas do WhatsApp Business simuladas (a conversa está em CLIENTE, EMBALAR e "Não enviar") e duas
    // sequências com esta conversa: uma de lead (sai ao registrar) e uma que começa pela venda (continua)
    const SEQ_LEAD = uuid(); const SEQ_VENDA = uuid();
    fake.db.wa_automations = [...(fake.db.wa_automations || []),
      { id: SEQ_LEAD, name: 'Seq lead', kind: 'sequencia', active: false, position: 98, sequence: { start: { type: 'lead', origin: 'todos' }, business: true, steps: [] }, test_chat_id: null },
      { id: SEQ_VENDA, name: 'Seq pós-venda', kind: 'sequencia', active: false, position: 99, sequence: { start: { type: 'venda' }, business: true, steps: [] }, test_chat_id: null }];
    fake.db.wa_sequence_runs = [
      { id: uuid(), automation_id: SEQ_LEAD, chat_id: CH, entry_key: 'lead@1', node: null, status: 'ativo', version: 0, branches: [], skip_wait: false, created_at: new Date().toISOString() },
      { id: uuid(), automation_id: SEQ_VENDA, chat_id: CH, entry_key: 'venda@1', node: null, status: 'ativo', version: 0, branches: [], skip_wait: false, created_at: new Date().toISOString() },
    ];
    await pg(`window.__waSets = []; window.__fakeBridge = { activeChat: { kind: 'individual', chatId: ${JSON.stringify(CH)} }, chatPhone: { phone: '5521987654321', name: 'Maria WhatsApp', via: 'numero' },
      verifyChatPhone: { active: true, match: true }, chatSaleInfo: { location: null, addressText: null, ad: null }, recentChats: [],
      labels: [{ id: '1', name: 'CLIENTE', hexColor: '#22c55e', count: 3 }, { id: '2', name: 'EMBALAR', hexColor: '#3b82f6', count: 1 }, { id: '3', name: 'Não enviar', hexColor: '#ef4444', count: 1 }],
      chatLabels: { labelIds: ['1', '2', '3'] },
      setChatLabels: (p) => { window.__waSets.push(p); return { labelIds: [], confirmed: true }; } }; return true;`);
    await openChat('Cliente 6');
    await q(`if (!sh.querySelector('.root.open')) sh.querySelector('.toggle').click(); await wait(200); sh.querySelector('.pnav [data-sec="vendas"]').click(); await wait(300);
      const b = [...sh.querySelectorAll('.vtab button')].find((x) => x.textContent.includes('Nova venda desta conversa')); if (b) b.click(); return !!b;`);
    const formReady = await waitFor(`return !!sh.querySelector('.vd-form') && /Maria/.test((sh.querySelector('.vd-form input[aria-label="Nome do cliente"]') || {}).value || '') && /anúncio/.test(sh.querySelector('.vd-form').textContent);`, 15000);
    const layout = await q(`const f = sh.querySelector('.vd-form'); const t = f.textContent;
      return { titles: [...f.querySelectorAll('.vd-sec-title')].map((x) => x.textContent), date: (f.querySelector('input[aria-label="Data da venda"]') || {}).value,
        name: f.querySelector('input[aria-label="Nome do cliente"]').value, phone: f.querySelector('input[aria-label="Telefone do cliente"]').value,
        removed: ['Horário de entrega', 'Garantia', 'Veio de anúncio'].filter((x) => t.includes(x)), originRadio: !!f.querySelector('input[name="vd-origin"]'),
        origin: (f.querySelector('.vd-origin') || {}).textContent || '', fields: ['CPF do cliente', 'CEP', 'Estado (UF)', 'Rua', 'Número', 'Complemento', 'Cidade', 'Bairro', 'Fornecedor'].filter((a) => !f.querySelector('[aria-label="' + a + '"]')) };`);
    check('💰 formulário: Data da venda (hoje) e as seções do ERP na ordem; sem Horário, Garantia e Origem; nome aprendido e telefone desta conversa; origem automática do anúncio',
      formReady && JSON.stringify(layout.titles) === '["Produtos","Cliente","Pagamento","Entrega","Resumo financeiro","Conversa"]' && /^\d{4}-\d{2}-\d{2}$/.test(layout.date)
      && layout.name === 'Maria' && layout.phone === '5521987654321' && !layout.removed.length && !layout.originRadio && /anúncio · Relógio Promo/.test(layout.origin) && !layout.fields.length, JSON.stringify(layout));
    // produtos: buscar e adicionar 2, editar o custo do 1º e a quantidade do 2º
    const setVal = (sel, v, ev = 'input') => q(`const i = sh.querySelector('.vd-form ' + ${JSON.stringify(sel)}); if (!i) return false; i.value = ${JSON.stringify(String(v))}; i.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true })); await wait(120); return true;`);
    const pick = async (term, text) => { await setVal('.vd-search', term); return q(`const b = [...sh.querySelectorAll('.vd-form .vd-results button')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); await wait(200); return true;`); };
    const added = [await pick('ultra', 'Smartwatch Ultra - Preto'), await pick('milanese', 'Pulseira Milanese - Prata')];
    // 2.12.7: busca por pedaços ("pul ros go 38") com o achado em negrito; ↑↓ escolhem; Enter adiciona o marcado,
    // limpa a busca e o cursor volta para ela
    await setVal('.vd-search', 'pul ros go 38');
    const srch = await q(`const bs = [...sh.querySelectorAll('.vd-form .vd-results button')];
      return { texts: bs.map((b) => b.textContent), bold: [...(bs[0] ? bs[0].querySelectorAll('.vd-hit') : [])].map((x) => x.textContent), sel: bs.map((b) => b.classList.contains('vd-sel')) };`);
    await setVal('.vd-search', 'milanese');
    const order = await q(`return [...sh.querySelectorAll('.vd-form .vd-results button')].map((b) => b.textContent.split(' · ')[0]);`);
    const key = (k) => q(`sh.querySelector('.vd-form .vd-search').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); await wait(150);
      return [...sh.querySelectorAll('.vd-form .vd-results button')].findIndex((b) => b.classList.contains('vd-sel'));`);
    const arrows = [await key('ArrowDown'), await key('ArrowDown'), await key('ArrowUp'), await key('ArrowUp')];
    await key('Enter');
    const afterEnter = await q(`const i = sh.querySelector('.vd-form .vd-search');
      return { value: i.value, focused: sh.activeElement === i, results: sh.querySelectorAll('.vd-form .vd-results button').length, items: [...sh.querySelectorAll('.vd-form .vd-item .sc-who')].map((x) => x.textContent) };`);
    check('💰 busca por pedaços: "pul ros go 38" acha a Milanese Rose Gold 38/41 com o achado em negrito; ↑↓ escolhem; Enter adiciona o marcado, limpa a busca e o cursor volta para ela',
      srch.texts.length === 1 && srch.texts[0].startsWith('Pulseira Aço Milanese - Rose Gold 38/41mm · estoque 5') && JSON.stringify(srch.bold) === '["Pul","Ros","Go","38"]' && srch.sel[0] === true
      && JSON.stringify(order) === '["Pulseira Aço Milanese - Rose Gold 38/41mm","Pulseira Milanese - Prata"]' && JSON.stringify(arrows) === '[1,0,1,0]'
      && afterEnter.value === '' && afterEnter.focused && afterEnter.results === 0 && afterEnter.items.length === 3 && afterEnter.items[2] === order[0],
      JSON.stringify({ srch, order, arrows, afterEnter }));
    // tira o item extra para o resto do teste seguir igual
    await q(`const r = sh.querySelector('.vd-form .vd-item[data-vd-item="2"]'); if (!r) return false; [...r.querySelectorAll('button')].find((b) => b.textContent === '✕').click(); await wait(200); return true;`);
    const costPre = await q(`return sh.querySelector('.vd-form input[aria-label="Custo do produto 1"]').value;`);
    await setVal('input[aria-label="Custo do produto 1"]', '199.5');
    await setVal('input[aria-label="Qtd do produto 2"]', '2');
    // pagamento: PIX R$ 300 + crédito Elo/Amex 6x R$ 319,70
    await setVal('select[aria-label="Forma de pagamento 1"]', 'pix', 'change');
    await setVal('input[aria-label="Valor da forma 1 (R$)"]', '300');
    await q(`sh.querySelector('.vd-form .vd-add-pay').click(); await wait(200); return true;`);
    await setVal('select[aria-label="Forma de pagamento 2"]', 'credit_card', 'change');
    await setVal('select[aria-label="Bandeira da forma 2"]', 'elo_amex', 'change');
    const inst = await q(`return [...sh.querySelector('.vd-form select[aria-label="Parcelas da forma 2"]').options].map((o) => o.textContent);`);
    await setVal('select[aria-label="Parcelas da forma 2"]', '6', 'change');
    await setVal('input[aria-label="Valor da forma 2 (R$)"]', '319.7');
    const pay = await q(`const f = sh.querySelector('.vd-form'); return { alloc: f.querySelector('.vd-alloc').textContent, ok: !!f.querySelector('.vd-alloc-c.ok'), fee: f.querySelectorAll('.vd-fee')[1].textContent };`);
    check('💰 produtos com Qtd · Custo (preenchido com o do produto, editável) · Preço; 2 formas de pagamento com bandeira, parcelas com a taxa e "Total · Alocado · Falta alocar"',
      added.every(Boolean) && costPre === '210' && inst.includes('6x (7.26%)') && /Total da vendaR\$ 619\.70AlocadoR\$ 619\.70Falta alocarR\$ 0\.00/.test(pay.alloc) && pay.ok && pay.fee === 'Taxa: R$ 23.21 (7.26%)',
      JSON.stringify({ added, costPre, inst: inst.slice(0, 7), pay }));
    // entrega: Correios (o ERP põe R$ 13,11) → R$ 15
    await setVal('select[aria-label="Tipo de entrega"]', 'correios', 'change');
    const correios = await q(`return sh.querySelector('.vd-form input[aria-label="Custo Correios (R$)"]').value;`);
    await setVal('input[aria-label="Custo Correios (R$)"]', '15');
    await setVal('input[aria-label="Observações da entrega"]', 'Deixar na portaria');
    // cliente: "Colar formulário" (com CEP → ViaCEP) e o fornecedor
    await q(`sh.querySelector('.vd-form .vd-paste-btn').click(); await wait(200); return true;`);
    await q(`const ta = sh.querySelector('.vd-form .vd-paste'); const dt = new DataTransfer(); dt.setData('text/plain', 'Nome: Maria Souza\\nRua: Rua das Flores\\nNúmero: 120\\nComplemento: Ap 302\\nBairro: Centro\\nCidade: Niterói\\nCEP: 24220-000\\nCPF: 529.982.247-25');
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
    const cepDone = await waitFor(`return (sh.querySelector('.vd-form input[aria-label="Rua"]') || {}).value === 'Rua Gavião Peixoto';`, 8000);
    await setVal('input[aria-label="Fornecedor"]', 'Fornecedor SP');
    const client = await q(`const f = sh.querySelector('.vd-form'); const v = (a) => (f.querySelector('[aria-label="' + a + '"]') || {}).value;
      return { name: v('Nome do cliente'), cpf: v('CPF do cliente'), cep: v('CEP'), uf: v('Estado (UF)'), rua: v('Rua'), num: v('Número'), comp: v('Complemento'), city: v('Cidade'), bairro: v('Bairro') };`);
    check('💰 "Colar formulário" preenche como o ERP e o CEP completa rua, UF, cidade e bairro (ViaCEP pelo background); Correios começa em R$ 13,11',
      cepDone && correios === '13.11' && JSON.stringify(client) === JSON.stringify({ name: 'Maria Souza', cpf: '529.982.247-25', cep: '24220000', uf: 'RJ', rua: 'Rua Gavião Peixoto', num: '120', comp: 'Ap 302', city: 'Niterói', bairro: 'Icaraí' })
      && fake.cep.length === 1 && fake.cep[0] === '/ws/24220000/json/', JSON.stringify({ cepDone, correios, client, cep: fake.cep }));
    const fin = await q(`const f = sh.querySelector('.vd-form'); return { vals: [...f.querySelectorAll('.vd-fin-v')].map((x) => x.textContent), det: f.querySelector('.vd-fin-det').textContent };`);
    check('💰 Resumo financeiro igual ao do ERP (total, taxa, recebido, lucro e os custos)',
      JSON.stringify(fin.vals) === JSON.stringify(['R$ 619.70', '- R$ 23.21', 'R$ 596.49', 'R$ 356.99']) && /Custo produtosR\$ 224\.50/.test(fin.det) && /Custo CorreiosR\$ 15\.00/.test(fin.det), JSON.stringify(fin));
    if (SHOTS_DIR) { // prints do formulário (topo, pagamento e resumo)
      for (const [name, sec] of [['venda-produtos', 'produtos'], ['venda-pagamento', 'pagamento'], ['venda-resumo', 'resumo']]) {
        await q(`sh.querySelector('.vd-form [data-vd-sec="${sec}"]').scrollIntoView({ block: 'start' }); return true;`);
        await sleep(300);
        const { data } = await s('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS_DIR, `${name}.png`), Buffer.from(data, 'base64'));
        console.log(`     print: ${path.join(SHOTS_DIR, `${name}.png`)}`);
      }
    }
    // seções recolhíveis e lado a lado no painel largo
    await q(`[...sh.querySelectorAll('.vd-form .vd-sec-head')].find((x) => x.textContent.includes('Cliente')).click(); await wait(150); return true;`);
    const closed = await q(`const s = sh.querySelector('.vd-form [data-vd-sec="cliente"]'); return { body: !!s.querySelector('.vd-sec-body'), exp: s.querySelector('.vd-sec-head').getAttribute('aria-expanded'), sum: s.querySelector('.vd-sec-sum').textContent };`);
    await q(`sh.querySelector('.vd-form [data-vd-sec="cliente"] .vd-sec-head').click(); await wait(150); return true;`);
    const wide = await q(`const p = sh.querySelector('.panel'); const g = sh.querySelector('.vd-form .vd-grid2'); return { wide: p.classList.contains('w-wide'), cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, kept: sh.querySelector('.vd-form input[aria-label="Rua"]').value };`);
    check('💰 seções recolhem e abrem (o que foi digitado fica); campos lado a lado quando o painel está largo',
      !closed.body && closed.exp === 'false' && /Maria Souza · Niterói/.test(closed.sum) && wide.kept === 'Rua Gavião Peixoto' && wide.cols === (wide.wide ? 2 : 1), JSON.stringify({ closed, wide }));
    // mensagem do entregador sem horário
    await q(`sh.querySelector('.vd-form .vd-courier').click(); await wait(300); return true;`);
    const courier = await q(`return (sh.querySelector('.vtab textarea[aria-label="Mensagem do entregador"]') || {}).value || '';`);
    await q(`const b = [...sh.querySelectorAll('.vtab button')].find((x) => x.textContent === 'Voltar'); if (b) b.click(); await wait(250); return true;`);
    check('💰 "Gerar mensagem do entregador" sem a linha de horário', /\*ENTREGA\*/.test(courier) && !/Horário/.test(courier) && /Rua Gavião Peixoto, 120/.test(courier) && /2x Pulseira Milanese/.test(courier), courier);
    // painel largo de verdade: a classe w-wide põe os campos lado a lado
    const wide2 = await q(`const p = sh.querySelector('.panel'); const had = p.classList.contains('w-wide'); p.classList.add('w-wide'); await wait(50);
      const cols = getComputedStyle(sh.querySelector('.vd-form .vd-grid2')).gridTemplateColumns.split(' ').length; if (!had) p.classList.remove('w-wide'); return cols;`);
    check('💰 painel largo: Nome/Telefone, CEP/UF, Rua/Número e Cidade/Bairro lado a lado', wide2 === 2, String(wide2));
    // 2.12.4: "Ao registrar a venda": padrões, e as escolhas deste teste (tirar todas as etiquetas do WhatsApp menos a
    // que vai colocar; etiqueta CRM VIP)
    const afterUi = await q(`const f = sh.querySelector('.vd-form'); const v = (a) => { const e = f.querySelector('[aria-label="' + a + '"]'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : null; };
      const remOpts = [...f.querySelector('select[aria-label="Tirar das etiquetas do WhatsApp"]').options].filter((o) => !o.classList.contains('lc-opt')).map((o) => o.textContent); // (2.13.4: sem o "+ Nova etiqueta…")
      return { leave: v('Tirar de todas as automações e sequências'), waAdd: v('Etiqueta do WhatsApp ao registrar'), waRemove: v('Tirar das etiquetas do WhatsApp'), crm: v('Etiqueta CRM ao registrar'), remOpts, old: f.textContent.includes('Tirar das automações e pôr na etiqueta CRM') };`);
    check('💰 "Ao registrar a venda": tirar de todas as automações e sequências (marcado), etiqueta do WhatsApp CLIENTE, tirar nenhuma, CRM "não mexe"; "Não enviar" não aparece para tirar',
      afterUi.leave === true && afterUi.waAdd === '1' && afterUi.waRemove === '' && afterUi.crm === '' && !afterUi.old
      && JSON.stringify(afterUi.remOpts) === JSON.stringify(['Nenhuma', 'Todas (menos a que vai colocar)', 'CLIENTE', 'EMBALAR']), JSON.stringify(afterUi));
    await setVal('select[aria-label="Tirar das etiquetas do WhatsApp"]', '__todas__', 'change');
    await setVal('select[aria-label="Etiqueta CRM ao registrar"]', VIP, 'change');
    // a venda falha ao gravar: nada de etiqueta nem de automação
    fake.failSalePost = true;
    await q(`sh.querySelector('.vd-form .vd-register').click(); return true;`);
    await waitFor(`return /Nenhuma etiqueta ou automação foi mexida/.test((sh.querySelector('.vd-msg') || {}).textContent || '');`, 12000);
    const failMsg = await q(`return (sh.querySelector('.vd-msg') || {}).textContent || '';`);
    const setsAfterFail = await pg('return window.__waSets.length;');
    check('💰 venda que falha ao gravar: avisa e não mexe em etiqueta nem em automação',
      /Não consegui registrar a venda: .*erro de teste ao gravar a venda.*Nenhuma etiqueta ou automação foi mexida/.test(failMsg) && setsAfterFail === 0 && fake.sales.length === 0
      && fake.db.wa_sequence_runs.every((x) => x.status === 'ativo') && !(fake.db.wa_contact_labels || []).some((l) => l.label_id === VIP && !Object.values(contacts).includes(l.contact_id)),
      JSON.stringify({ failMsg, setsAfterFail, runs: fake.db.wa_sequence_runs.map((x) => x.status) }));
    // registrar
    await q(`sh.querySelector('.vd-form .vd-register').click(); return true;`);
    const saved = await waitFor(`return /VENDA REGISTRADA/.test(sh.querySelector('.vtab').textContent);`, 15000);
    const row = fake.sales[0] || {};
    const items = (fake.db.sale_items || []).map((x) => [x.product_id === PA ? 'A' : 'B', x.quantity, x.unit_price, x.unit_cost, x.total_price]);
    const openErp = await q(`const a = sh.querySelector('.vtab a.vd-open'); return a ? a.href : null;`);
    check('💰 registrar grava como o ERP: total, 2 formas, taxa pela data, Correios, CPF, endereço do CEP, fornecedor, custo editado nos itens, status, conversa e origem automática',
      saved && fake.sales.length === 1 && Math.abs(row.total_sale_price - 619.7) < 1e-9 && row.payment_methods.length === 2 && row.payment_method === 'pix' && row.card_brand === 'elo_amex' && row.installments === 6
      && Math.abs(row.card_fee - 319.7 * 0.0726) < 1e-9 && row.delivery_type === 'correios' && row.delivery_cost === 15 && row.delivery_fee === 0 && row.customer_cpf === '52998224725'
      && row.address_street === 'Rua Gavião Peixoto' && row.neighborhood === 'Icaraí' && row.state === 'RJ' && row.zip_code === '24220000' && row.supplier_id === SUPP && row.status === 'em_separacao'
      && row.payment_status === 'a_cobrar' && row.delivery_notes === 'Deixar na portaria' && row.wa_chat_id === CH && row.origin === 'anuncio' && row.ad_title === 'Relógio Promo' && !('wa_warranty_months' in row)
      && JSON.stringify(items) === JSON.stringify([['A', 1, 499.9, 199.5, 499.9], ['B', 2, 59.9, 12.5, 119.8]]) && /pagina=historico/.test(openErp || ''),
      JSON.stringify({ saved, row, items, openErp, msg: await q(`return (sh.querySelector('.vd-msg') || {}).textContent || '';`) }));
    // 2.13.3: o nome da conversa vira o primeiro nome do cliente da venda ("Maria Souza" → "Maria"), origem "da venda"
    const cnRows = (fake.db.wa_chat_names || []).filter((x) => x.chat_id === CH);
    const cnPanel = await waitFor(`return (sh.querySelector('.cname .cname-src') || {}).textContent === 'da venda';`, 6000);
    check('💰 depois de registrar, o nome da conversa vira o primeiro nome do cliente da venda (no lugar do aprendido) e o painel mostra "da venda"',
      cnRows.length === 1 && cnRows[0].name === 'Maria' && cnRows[0].source === 'venda' && cnPanel && (await q(`return sh.querySelector('.cname .cname-v').textContent;`)) === 'Maria',
      JSON.stringify({ cnRows, cnPanel }));
    const prods = fake.db.products.filter((p) => p.id !== PC).map((p) => [p.current_stock, p.cost]);
    check('💰 estoque baixado e o custo editado gravado no produto (como o ERP)', JSON.stringify(prods) === JSON.stringify([[3, 199.5], [7, 12.5]]), JSON.stringify(prods));
    // 2.12.4: depois da venda gravada, parte por parte
    await waitFor(`return sh.querySelectorAll('.vtab .vd-after-line').length >= 3;`, 15000);
    const afterLines = await q(`return [...sh.querySelectorAll('.vtab .vd-after-line')].map((x) => x.textContent);`);
    const waSets = await pg('return window.__waSets;');
    const runs = fake.db.wa_sequence_runs.map((x) => [x.automation_id === SEQ_LEAD ? 'lead' : 'venda', x.status]);
    const crmContact = (fake.db.wa_contacts || []).find((x) => x.chat_id === CH);
    const crmVip = !!crmContact && (fake.db.wa_contact_labels || []).some((l) => l.contact_id === crmContact.id && l.label_id === VIP);
    check('💰 depois de gravar: etiqueta CRM escolhida, sai da sequência de lead (a de pós-venda continua), tira EMBALAR e põe CLIENTE no WhatsApp; "Não enviar" fica',
      afterLines.length === 3 && afterLines.every((x) => x.startsWith('✓')) && /Etiqueta CRM "VIP"/.test(afterLines[0]) && /Tirar de todas as automações e sequências: tirada de/.test(afterLines[1])
      && afterLines[2] === '✓ Etiquetas do WhatsApp: tirou "EMBALAR", colocou "CLIENTE"' && crmVip
      && JSON.stringify(runs) === JSON.stringify([['lead', 'saiu'], ['venda', 'ativo']])
      && JSON.stringify(waSets.map((x) => [x.add, x.remove])) === JSON.stringify([[[], ['2']], [['1'], []]]) && !waSets.some((x) => (x.remove || []).includes('3')),
      JSON.stringify({ afterLines, runs, waSets, crmVip }));
    // a escolha fica lembrada no próximo formulário
    await q(`const b = [...sh.querySelectorAll('.vtab button')].find((x) => x.textContent === 'Voltar'); if (b) b.click(); await wait(300);
      const n = [...sh.querySelectorAll('.vtab button')].find((x) => x.textContent.includes('Nova venda desta conversa')); if (n) n.click(); return !!n;`);
    await waitFor(`return !!sh.querySelector('.vd-form select[aria-label="Etiqueta CRM ao registrar"]');`, 10000);
    const remembered = await q(`const f = sh.querySelector('.vd-form'); const v = (a) => { const e = f.querySelector('[aria-label="' + a + '"]'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : null; };
      return [v('Tirar de todas as automações e sequências'), v('Etiqueta do WhatsApp ao registrar'), v('Tirar das etiquetas do WhatsApp'), v('Etiqueta CRM ao registrar')];`);
    check('💰 lembra a última escolha de "Ao registrar a venda"', JSON.stringify(remembered) === JSON.stringify([true, '1', '__todas__', VIP]), JSON.stringify(remembered));
    await q(`const b = [...sh.querySelectorAll('.vtab button')].find((x) => x.textContent === 'Cancelar'); if (b) b.click(); await wait(200); return true;`);
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console na venda pelo WhatsApp', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 11. "só daqui pra frente" à prova de falhas para etiquetas do WhatsApp (2.12.5): ao ligar, TODAS as conversas da
    // etiqueta (23, inclusive as que não estão carregadas na lista) ficam registradas como "já estavam", a tela diz
    // quantas ficaram de fora e a lista mostra "Ignorados por já estarem na etiqueta"
    fake.on = true;
    fake.generic = true;
    const CHATS23 = Array.from({ length: 23 }, (_, i) => `5511900${String(i).padStart(6, '0')}@c.us`);
    const baseAuto = (fake.db.wa_automations || []).find((x) => x.kind !== 'sequencia' && x.trigger_type) || {};
    const AW = uuid();
    fake.db.wa_automations.push({ ...baseAuto, id: AW, name: 'Etiqueta do WhatsApp', active: false, activated_at: null, include_existing: false, test_chat_id: null,
      trigger_type: 'entrou_etiqueta', trigger_label_source: 'whatsapp', trigger_wa_label_id: '1', trigger_label_id: null, position: 97,
      conditions: [{ type: 'parada_max_dias', days: 30 }] }); // 2.13.0: com condição não dá para desenhar: fica no editor antigo (o que esta parte testa)
    fake.db.wa_native_label_seen = [{ chat_id: CHATS23[0], wa_label_id: '1', first_seen_at: '2026-11-01T10:00:00.000Z', last_seen_at: '2026-11-01T10:00:00.000Z', removed_at: null }];
    await pg(`window.__fakeBridge = { labels: [{ id: '1', name: 'Cliente', hexColor: '#22c55e', count: 5 }],
      labelAllChats: { count: 5, source: 'associacoes', chats: ${JSON.stringify(CHATS23.map((id) => ({ id, name: null })))} }, labelEvents: { events: [] } }; return true;`);
    await q(`sh.querySelector('[data-sec="vendas"]').click(); await wait(200); sh.querySelector('[data-sec="follows"]').click(); await wait(300); return true;`);
    const waCard = `[...sh.querySelectorAll('.fw-card')].find((c) => (c.querySelector('.fw-name') || {}).textContent === 'Etiqueta do WhatsApp')`;
    const cardOk = await waitFor(`return !!${waCard};`, 15000);
    // 2.12.6: o interruptor da lista abre a confirmação
    await q(`const c = ${waCard}; c.querySelector('.fw-switch').click(); await wait(200); return true;`);
    await waitFor(`const c = ${waCard}; return !!(c && c.querySelector('.act-box') && !c.querySelector('.act-box .loading'));`, 15000);
    const actTxt = await q(`const c = ${waCard}; return c.querySelector('.act-text').textContent;`);
    await q(`const c = ${waCard}; c.querySelector('.act-go').click(); return true;`);
    await waitFor(`return /ficaram de fora/.test((sh.querySelector('.ftab') || {}).textContent || '');`, 15000);
    const flashTxt = await q(`return [...sh.querySelectorAll('.ftab .ed-msg')].map((x) => x.textContent).join(' | ');`);
    const rows = fake.db.wa_native_label_seen.filter((r) => r.wa_label_id === '1' && !r.removed_at);
    const baseRows = rows.filter((r) => r.first_seen_at === '2000-01-01T00:00:00.000Z').length;
    const autoRow = fake.db.wa_automations.find((x) => x.id === AW);
    check('ligar com etiqueta do WhatsApp: conta TODAS as 23 conversas da etiqueta (não só as carregadas), registra como "já estavam" e diz quantas ficaram de fora',
      cardOk && /^Ligar 'Etiqueta do WhatsApp'\? Vale só para quem entrar na etiqueta \S+ a partir de agora\. 23 contatos que já estão nela não vão receber\.$/.test(actTxt) && /23 contatos com a etiqueta cliente ficaram de fora/i.test(flashTxt)
      && rows.length === 23 && baseRows === 22 && rows.find((r) => r.chat_id === CHATS23[0]).first_seen_at === '2026-11-01T10:00:00.000Z' && autoRow.active === true && !!autoRow.activated_at,
      JSON.stringify({ cardOk, actTxt, flashTxt, rows: rows.length, baseRows, active: autoRow.active }));
    const ignoredOk = await waitFor(`const c = ${waCard}; return /Ignorados por já estarem na etiqueta: 23/.test((c && c.textContent) || '');`, 15000);
    check('lista da automação: "Ignorados por já estarem na etiqueta: 23"', ignoredOk, await q(`const c = ${waCard}; return c ? c.textContent.slice(0, 300) : '';`));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console ao ligar com etiqueta do WhatsApp', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 12. ligar/desligar mais simples (2.12.6): editor sem a caixa "Ativa" e sem o quadro Segurança; "Salvar desligada" /
    // "Salvar e ligar" (com a confirmação e as opções avançadas escondidas); ligada: "Salvar" / "Salvar e desligar";
    // "Testar comigo" (EM TESTE) e "Ligar para todos"; interruptor da lista
    fake.on = true;
    fake.generic = true;
    const TEST_CH = '5521911112222@c.us';
    await pg(`window.__fakeBridge = { labels: [{ id: '1', name: 'Cliente', hexColor: '#22c55e', count: 5 }], activeChat: { kind: 'individual', chatId: '${TEST_CH}' }, recentChats: [{ id: '${TEST_CH}', name: 'Cliente Teste' }],
      labelAllChats: { count: 5, source: 'associacoes', chats: ${JSON.stringify(CHATS23.map((id) => ({ id, name: null })))} }, labelEvents: { events: [] } }; return true;`);
    const row12 = () => fake.db.wa_automations.find((x) => x.id === AW);
    const editBtns = () => q(`const e = sh.querySelector('.fw-editor'); return e ? [...e.querySelectorAll('.fw-save-row button')].map((b) => b.textContent) : null;`);
    const openEdit = async () => { await q(`const c = ${waCard}; [...c.querySelectorAll('button')].find((x) => x.textContent === 'Editar').click(); await wait(300); return true;`); await waitFor(`return !!sh.querySelector('.fw-editor .fw-footer');`, 10000); };
    const clickEd = (text) => q(`const b = [...sh.querySelectorAll('.fw-editor button')].find((x) => x.textContent === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true;`);
    const backList = () => waitFor(`return !sh.querySelector('.fw-editor') && !!(${waCard});`, 15000);
    // a) ligada: "Salvar" e "Salvar e desligar"; sem "Ativa" e sem o quadro Segurança; a linha de segurança perto dos botões
    await openEdit();
    const edOn = await q(`const e = sh.querySelector('.fw-editor'); return { ativa: [...e.querySelectorAll('label')].some((l) => l.textContent.trim() === 'Ativa'), seg: /SEGURANÇA/.test(e.textContent),
      line: (e.querySelector('.fw-safety-line') || {}).textContent || '', state: (e.querySelector('.fw-state') || {}).textContent || '' };`);
    const btnsOn = await editBtns();
    check('editor de automação ligada: sem a caixa "Ativa" e sem o quadro Segurança; botões "Salvar" e "Salvar e desligar"; a linha de segurança',
      !edOn.ativa && !edOn.seg && edOn.line === 'Só vale para quem entrar depois de ligar. Nunca envia para "Não enviar".' && /LIGADA/.test(edOn.state)
      && JSON.stringify(btnsOn) === JSON.stringify(['Salvar', 'Salvar e desligar', 'Cancelar']), JSON.stringify({ edOn, btnsOn }));
    await clickEd('Salvar e desligar');
    await backList();
    check('"Salvar e desligar" desliga', row12().active === false, JSON.stringify({ active: row12().active }));
    // b) desligada: "Salvar desligada" (cinza), "Salvar e ligar" (laranja), "Testar comigo"; a confirmação
    await openEdit();
    const btnsOff = await editBtns();
    const cls = await q(`const e = sh.querySelector('.fw-editor'); return { off: e.querySelector('.fw-save-off').className, on: e.querySelector('.fw-save-on').className };`);
    await clickEd('Salvar e ligar');
    await waitFor(`const b = sh.querySelector('.fw-editor .act-box'); return !!b && !b.querySelector('.loading');`, 15000);
    const conf = await q(`const b = sh.querySelector('.fw-editor .act-box'); const d = b.querySelector('details.act-adv'); return { text: b.querySelector('.act-text').textContent, advOpen: d ? d.open : null,
      inc: d ? d.querySelector('input').checked : null, go: b.querySelector('.act-go').textContent, rowHidden: !sh.querySelector('.fw-editor .fw-save-row') };`);
    if (SHOTS_DIR) { await q(`sh.querySelector('.fw-editor .act-box').scrollIntoView({ block: 'center' }); return true;`); await sleep(300); const { data } = await s('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS_DIR, 'ligar-confirmacao.png'), Buffer.from(data, 'base64')); }
    await q(`const d = sh.querySelector('.fw-editor details.act-adv'); d.open = true; const i = d.querySelector('input'); i.click(); await wait(200); return true;`);
    const inc = await q(`const b = sh.querySelector('.fw-editor .act-box'); return { go: b.querySelector('.act-go').textContent, list: b.querySelectorAll('.act-list li').length, open: b.querySelector('details.act-adv').open };`);
    await q(`const i = sh.querySelector('.fw-editor details.act-adv input'); i.click(); await wait(200); return true;`);
    const actBefore = row12().activated_at;
    await q(`sh.querySelector('.fw-editor .act-go').click(); return true;`);
    await backList();
    check('desligada: "Salvar desligada" (cinza), "Salvar e ligar" (laranja), "Testar comigo"; confirmação com o nome, a etiqueta e quantos ficam de fora; opções avançadas escondidas e desmarcadas; "Ligar e incluir 23"',
      JSON.stringify(btnsOff) === JSON.stringify(['Salvar desligada', 'Salvar e ligar', 'Testar comigo', 'Cancelar']) && !/primary/.test(cls.off) && /primary/.test(cls.on)
      && /^Ligar 'Etiqueta do WhatsApp'\? Vale só para quem entrar na etiqueta \S+ a partir de agora\. 23 contatos que já estão nela não vão receber\.$/.test(conf.text)
      && conf.advOpen === false && conf.inc === false && conf.go === 'Ligar' && conf.rowHidden && inc.go === 'Ligar e incluir 23' && inc.list === 23 && inc.open === true
      && row12().active === true && row12().include_existing === false && !row12().test_chat_id && row12().activated_at !== actBefore,
      JSON.stringify({ btnsOff, cls, conf, inc, row: { active: row12().active, include: row12().include_existing } }));
    // c) interruptor da lista: desligar é na hora
    await q(`const c = ${waCard}; c.querySelector('.fw-switch').click(); return true;`);
    await waitFor(`const c = ${waCard}; return !!c && c.querySelector('.fw-switch').getAttribute('aria-checked') === 'false';`, 10000);
    check('interruptor da lista: desligar na hora (sem confirmação)', row12().active === false, JSON.stringify({ active: row12().active }));
    // d) "Testar comigo": a conversa aberta já vem escolhida; liga só para ela (EM TESTE)
    await openEdit();
    await clickEd('Testar comigo');
    await waitFor(`const s = sh.querySelector('.fw-editor .fw-testpick select'); return !!s && s.value === '${TEST_CH}';`, 10000);
    await q(`sh.querySelector('.fw-editor .fw-test-go').click(); return true;`);
    await backList();
    const testCard = await q(`const c = ${waCard}; return { badge: [...c.querySelectorAll('.fw-badge')].map((x) => x.textContent), on: c.querySelector('.fw-switch').getAttribute('aria-checked') };`);
    check('"Testar comigo": liga só para a conversa escolhida e a lista mostra EM TESTE',
      row12().active === true && row12().test_chat_id === TEST_CH && testCard.badge.includes('EM TESTE') && testCard.on === 'true', JSON.stringify({ test: row12().test_chat_id, testCard }));
    // e) em teste: "Ligar para todos" abre a mesma confirmação e o "daqui pra frente" recomeça
    await openEdit();
    const btnsTest = await editBtns();
    const testAt = row12().activated_at;
    await sleep(20);
    await clickEd('Ligar para todos');
    await waitFor(`const b = sh.querySelector('.fw-editor .act-box'); return !!b && !b.querySelector('.loading');`, 15000);
    const confAll = await q(`return sh.querySelector('.fw-editor .act-text').textContent;`);
    await q(`sh.querySelector('.fw-editor .act-go').click(); return true;`);
    await backList();
    check('em teste: "Salvar", "Salvar e desligar", "Ligar para todos" → a mesma confirmação → ligada para todos (sem teste, daqui pra frente recomeça)',
      JSON.stringify(btnsTest) === JSON.stringify(['Salvar', 'Salvar e desligar', 'Ligar para todos', 'Cancelar']) && /23 contatos que já estão nela não vão receber/.test(confAll)
      && row12().active === true && !row12().test_chat_id && Date.parse(row12().activated_at) > Date.parse(testAt), JSON.stringify({ btnsTest, confAll, row: { test: row12().test_chat_id, at: row12().activated_at, testAt } }));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console no ligar/desligar das automações', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 13. atividade de todas as conversas (2.12.8): ao abrir, a varredura de 72 h (ponte simulada) grava a atividade
    // (wa_chat_activity + dias) e o lead novo que chegou com o PC desligado (wa_leads); a aba com a trava faz isso
    // sozinha, pelo motor. Nada de sinal de compra.
    fake.on = true;
    fake.generic = true;
    const OFF_CH = '5521933334444@c.us';
    const OLD_CH = '5521955556666@c.us';
    const nowS = Math.floor(Date.now() / 1000);
    const dayS = (t) => new Date((t - 3 * 3600) * 1000).toISOString().slice(0, 10);
    fake.db.wa_chat_activity = [];
    fake.db.wa_chat_activity_days = [];
    fake.db.wa_leads = (fake.db.wa_leads || []).filter((l) => l.chat_id !== OFF_CH);
    let scans = 0;
    // o motor só faz o trabalho da aba com a trava com o WhatsApp "pronto": a ponte simulada diz que está pronto e
    // as automações ficam desligadas (nada é enviado); a trava fica livre para esta aba pegar
    (fake.db.wa_automations || []).forEach((a) => { a.active = false; });
    (fake.db.wa_settings || []).forEach((w) => { w.paused_all = false; w.runner_id = null; w.lease_until = null; });
    await pg(`window.__actScan = 0; window.__fakeBridge = {
      status: { ready: true, version: 'teste' },
      activityScan: () => { window.__actScan++; return { scanned: true, loadedOld: 1, items: [
        { chatId: '${OFF_CH}', phone: '5521933334444', name: 'Bia', lastAt: ${nowS - 9 * 3600}, lastFrom: 'cliente', lastCustomerAt: ${nowS - 9 * 3600}, firstMessageAt: ${nowS - 10 * 3600}, isNewLead: true, days: [{ day: '${dayS(nowS - 10 * 3600)}', customer: true, store: false }] },
        { chatId: '${OLD_CH}', phone: '5521955556666', name: 'Rui', lastAt: ${nowS - 3600}, lastFrom: 'loja', lastCustomerAt: ${nowS - 7200}, firstMessageAt: null, isNewLead: null, days: [{ day: '${dayS(nowS - 3600)}', customer: true, store: true }] },
      ], leads: [{ chatId: '${OFF_CH}', fromMe: false, t: ${nowS - 10 * 3600}, first: true, ad: null, scan: true, phone: '5521933334444' }] }; },
      convEvents: { events: [], scanned: false },
    }; return true;`);
    const actOk = await waitFor(`return true;`, 10).then(async () => {
      for (const stop = Date.now() + 90000; Date.now() < stop;) {
        if ((fake.db.wa_chat_activity || []).some((r) => r.chat_id === OFF_CH) && (fake.db.wa_leads || []).some((l) => l.chat_id === OFF_CH)) return true;
        await sleep(500);
      }
      return false;
    });
    scans = await pg('return window.__actScan;');
    const offRow = (fake.db.wa_chat_activity || []).find((r) => r.chat_id === OFF_CH) || {};
    const oldRow = (fake.db.wa_chat_activity || []).find((r) => r.chat_id === OLD_CH) || {};
    const offLead = (fake.db.wa_leads || []).find((l) => l.chat_id === OFF_CH) || {};
    const actDays = (fake.db.wa_chat_activity_days || []).map((d) => [d.chat_id, d.from_customer, d.from_store]);
    check('2.12.8: ao abrir, a varredura de 72 h grava a atividade de todas as conversas e o lead que chegou com o PC desligado (1 varredura por abertura)',
      actOk && scans === 1 && offRow.is_new_lead === true && offRow.last_from === 'cliente' && offRow.name === 'Bia' && Date.parse(offRow.first_message_at) === (nowS - 10 * 3600) * 1000
      && oldRow.last_from === 'loja' && oldRow.is_new_lead === null && offLead.origin === 'organico' && Date.parse(offLead.first_message_at) === (nowS - 10 * 3600) * 1000
      && JSON.stringify(actDays) === JSON.stringify([[OFF_CH, true, false], [OLD_CH, true, true]]) && !JSON.stringify(fake.db.wa_chat_activity).includes('buy'),
      JSON.stringify({ actOk, scans, offRow, oldRow, offLead, actDays }));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console na atividade das conversas', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 14. construtor visual (2.13.0): "+ Nova automação" abre a tela ampla; modelo "Régua de follow-up (3 etapas)" já
    // desenhado (as mensagens com o mesmo título já vêm escolhidas); trocar uma mensagem; caixa incompleta em vermelho
    // não deixa ligar; Simular; Testar comigo (EM TESTE); Ligar para todos (confirmação)
    fake.on = true;
    fake.generic = true;
    const TCH = '5521977776666@c.us';
    const autoCat = (fake.db.wa_categories || []).find((c) => c.name === 'Automações') || { id: uuid() };
    if (!(fake.db.wa_categories || []).some((c) => c.id === autoCat.id)) fake.db.wa_categories = [...(fake.db.wa_categories || []), { id: autoCat.id, name: 'Automações', position: 50, created_at: new Date().toISOString() }];
    const mkItem = (title, body) => ({ id: uuid(), category_id: autoCat.id, title, type: 'texto', body, position: 90, use_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    fake.db.wa_items = [...(fake.db.wa_items || []), mkItem('Follow 1', 'Oi {nome}! Conseguiu ver o relógio?'), mkItem('Follow 2', 'Ainda tem interesse?'), mkItem('Follow 3', 'Última chamada!'), mkItem('Oferta especial', '{saudacao}, {nome}! Hoje com 10% de desconto no Pix.')];
    (fake.db.wa_automations || []).forEach((a) => { a.active = false; });
    const nAutos = (fake.db.wa_automations || []).length;
    await pg(`window.__fakeBridge = { activeChat: { kind: 'individual', chatId: '${TCH}', name: 'Teste Comigo' }, recentChats: [{ id: '${TCH}', name: 'Teste Comigo' }], labels: [], labelEvents: { events: [] } }; return true;`);
    // recarrega para a biblioteca ler as mensagens novas do banco falso
    await s('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (const stop = Date.now() + TIMEOUT_MS; Date.now() < stop;) {
      const opened = await evalPage(`(() => { const sh = document.getElementById('tsp-wa-host')?.shadowRoot; const t = sh && sh.querySelector('.toggle'); if (t && !sh.querySelector('.root.open')) t.click(); return !!(sh && sh.querySelector('.root.open')); })()`);
      if (opened) break;
      await sleep(300);
    }
    await pg(`window.__fakeBridge = { activeChat: { kind: 'individual', chatId: '${TCH}', name: 'Teste Comigo' }, recentChats: [{ id: '${TCH}', name: 'Teste Comigo' }], labels: [], labelEvents: { events: [] } }; return true;`);
    await sleep(800);
    await q(`sh.querySelector('[data-sec="follows"]').click(); await wait(300); return true;`);
    await waitFor(`return !!sh.querySelector('.fw-new');`, 15000);
    const shot = async (name) => { if (!SHOTS_DIR) return; await sleep(250); const { data } = await s('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(SHOTS_DIR, name), Buffer.from(data, 'base64')); };
    await q(`sh.querySelector('.fw-new').click(); await wait(300); return true;`);
    const tpls = await q(`const v = sh.querySelector('.vb'); if (!v) return null; const r = v.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, bg: getComputedStyle(v).backgroundColor,
      tpls: [...v.querySelectorAll('.vb-tpl')].map((b) => b.dataset.tpl), close: !!v.querySelector('.vb-close'), legacy: !!v.querySelector('.vb-legacy') };`);
    check('construtor: "+ Nova automação" abre a tela ampla (por cima do WhatsApp, fundo claro) com os 4 modelos, "Fechar" e o editor antigo à parte',
      !!tpls && tpls.w === tpls.vw && tpls.h > 500 && /rgb\(24[0-9], 24[0-9], 2[45][0-9]\)|rgb\(255, 255, 255\)/.test(tpls.bg) && JSON.stringify(tpls.tpls) === '["followup3","posvenda","lead_sumiu","vazio"]' && tpls.close && tpls.legacy, JSON.stringify(tpls));
    await q(`sh.querySelector('.vb [data-tpl="followup3"]').click(); await wait(300); return true;`);
    const drawn = await q(`const v = sh.querySelector('.vb'); const t = (sel) => [...v.querySelectorAll(sel)].map((b) => b.querySelector('.vb-btxt').textContent);
      return { name: v.querySelector('.vb-name').value, start: t('.vb-box.vb-start')[0], sends: t('.vb-box.vb-enviar'), waits: t('.vb-box.vb-esperar'), tags: t('.vb-box.vb-etiqueta'),
        fims: v.querySelectorAll('.vb-box.vb-fim').length, yes: v.querySelectorAll('.vb-lane.vb-yes').length, no: v.querySelectorAll('.vb-lane.vb-no').length, plus: v.querySelectorAll('.vb-plus').length,
        btns: [...v.querySelectorAll('.vb-tr button:not(.more-item)')].map((b) => b.textContent), side: v.querySelector('.vb-side .vb-sh').textContent };`);
    check('modelo "Régua de follow-up (3 etapas)" desenhado em cascata: COMEÇA (Follow Up 1) → Follow 1/2/3 já escolhidas → 3 esperas de resposta com ✅ / ❌ → Em atendimento / Frio, todo caminho em FIM; "+" entre as caixas; botões no topo',
      drawn.name === 'Régua de follow-up' && /etiqueta “Follow Up 1”/.test(drawn.start) && JSON.stringify(drawn.sends) === '["Envia “Follow 1”","Envia “Follow 2”","Envia “Follow 3”"]'
      && JSON.stringify(drawn.waits) === '["Espera resposta por até 1 dia","Espera resposta por até 2 dias","Espera resposta por até 3 dias"]'
      && drawn.tags.filter((x) => /Em atendimento/.test(x)).length === 3 && drawn.tags.filter((x) => /Frio/.test(x)).length === 1 && drawn.fims === 4 && drawn.yes === 3 && drawn.no === 3 && drawn.plus >= 10
      && JSON.stringify(drawn.btns) === '["Salvar desligada","Salvar e ligar","Fechar","⋯"]' && drawn.side === '▶ COMEÇA', JSON.stringify(drawn));
    await shot('regua-3-etapas.png');
    // trocar a mensagem do Follow 2 pela "Oferta especial" (busca + prévia)
    await q(`sh.querySelectorAll('.vb .vb-box.vb-enviar')[1].click(); await wait(200); const i = sh.querySelector('.vb-side .vb-search'); i.value = 'oferta'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait(150);
      [...sh.querySelectorAll('.vb-side .vb-mitem')].find((b) => b.textContent.includes('Oferta especial')).click(); await wait(200); return true;`);
    const swapped = await q(`const v = sh.querySelector('.vb'); return { sends: [...v.querySelectorAll('.vb-box.vb-enviar .vb-btxt')].map((x) => x.textContent), prev: (v.querySelector('.vb-side .vb-prev') || {}).textContent || '',
      newmsg: !!v.querySelector('.vb-side .vb-newmsg') };`);
    check('trocar a mensagem: busca na mensagem pronta, a caixa muda ("Envia “Oferta especial”") e a prévia mostra o texto com {nome}; "+ Criar mensagem aqui" no quadro',
      JSON.stringify(swapped.sends) === '["Envia “Follow 1”","Envia “Oferta especial”","Envia “Follow 3”"]' && /Hoje com 10% de desconto no Pix/.test(swapped.prev) && /Maria/.test(swapped.prev) && swapped.newmsg, JSON.stringify(swapped));
    // caixa nova sem mensagem: "Salvar e ligar" não liga, a caixa fica vermelha com o que falta
    await q(`sh.querySelector('.vb .vb-plus').click(); await wait(150); sh.querySelector('.vb .vb-menu .vb-mi-enviar').click(); await wait(200); sh.querySelector('.vb .vb-save-on').click(); await wait(300); return true;`);
    const red = await q(`const v = sh.querySelector('.vb'); const b = v.querySelector('.vb-box.vb-bad'); return { bad: v.querySelectorAll('.vb-box.vb-bad').length, txt: b ? b.querySelector('.vb-berr').textContent : '', border: b ? getComputedStyle(b).borderTopColor : '',
      msg: (v.querySelector('.vb-msg.err') || {}).textContent || '', modal: !!v.querySelector('.vb-modal') };`);
    check('caixa incompleta: borda vermelha e "Escolha ou crie a mensagem."; não abre a confirmação de ligar',
      red.bad === 1 && red.txt === 'Escolha ou crie a mensagem.' && /rgb\(220, 38, 38\)/.test(red.border) && /Escolha ou crie a mensagem/.test(red.msg) && !red.modal && (fake.db.wa_automations || []).length === nAutos, JSON.stringify(red));
    await shot('caixa-incompleta.png');
    await q(`sh.querySelector('.vb .vb-side .vb-del').click(); await wait(200); return true;`);
    // 2.14.1: no topo só Salvar desligada · Salvar e ligar · Fechar (+ "⋯"); Simular e Testar comigo no "⋯"
    const top141 = await q(`const t = sh.querySelector('.vb .vb-tr'); const vis = [...t.children].filter((x) => x.matches('button')).map((x) => x.textContent);
      const menu = t.querySelector('.more-menu'); const closed = menu.hidden; t.querySelector('.more-btn').click(); await wait(150);
      const open = !menu.hidden && getComputedStyle(menu).display !== 'none'; const items = [...menu.querySelectorAll('.more-item')].map((x) => x.textContent);
      return { vis, closed, open, items, more: t.querySelector('.more-btn').getAttribute('aria-label') };`);
    check('construtor: no topo só "Salvar desligada", "Salvar e ligar" e "Fechar" + "⋯" (Mais opções), que abre com "Simular" e "Testar comigo"',
      JSON.stringify(top141.vis) === JSON.stringify(['Salvar desligada', 'Salvar e ligar', 'Fechar']) && top141.closed && top141.open && JSON.stringify(top141.items) === JSON.stringify(['Simular', 'Testar comigo']) && top141.more === 'Mais opções da automação',
      JSON.stringify(top141));
    await shot('mais-opcoes.png');
    // Simular (pelo "⋯")
    await q(`sh.querySelector('.vb .vb-tr .more-menu .vb-sim').click(); await wait(300); return true;`);
    const sim = await q(`const m = sh.querySelector('.vb .vb-modal'); const col = (c) => [...m.querySelectorAll('.' + c + ' .vb-ev')].map((r) => r.textContent);
      return { never: col('vb-sim-nunca'), first: col('vb-sim-primeiro') };`);
    // (2.13.2: cada linha mostra a data e a hora previstas — "seg, 09/11, 13:46" — em vez de "+1 dia"; 2.16.0: com
    // "dia X · " na frente, o dia desde a entrada)
    const DATE_RE = /^dia \d+ · [a-zçáé]{3},? \d{2}\/\d{2},? \d{2}:\d{2}/;
    const textsOf = (l) => l.map((x) => x.replace(DATE_RE, ''));
    check('Simular: linha do tempo (com data e hora) de quem nunca responde (Follow 1 → Oferta especial → Follow 3 → Frio) e de quem responde no 1º passo (Em atendimento)',
      sim.never.every((x) => DATE_RE.test(x)) && JSON.stringify(textsOf(sim.never)) === JSON.stringify(['Entra na automação', 'Recebe “Follow 1”', '❌ Não respondeu em 1 dia', 'Recebe “Oferta especial”', '❌ Não respondeu em 2 dias', 'Recebe “Follow 3”', '❌ Não respondeu em 3 dias', 'Entra na etiqueta “Frio”', 'Fim: sai da automação'])
      && sim.first.some((x) => /✅ Respondeu/.test(x)) && sim.first.some((x) => /Entra na etiqueta “Em atendimento”/.test(x)) && !sim.first.some((x) => /Oferta/.test(x)),
      JSON.stringify(sim));
    await shot('simulacao.png');
    await q(`sh.querySelector('.vb .vb-simclose').click(); await wait(200); return true;`);
    // Testar comigo (pelo "⋯")
    await q(`sh.querySelector('.vb .vb-tr .more-btn').click(); await wait(150); sh.querySelector('.vb .vb-tr .more-menu .vb-test').click(); return true;`);
    await waitFor(`const s0 = sh.querySelector('.vb .vb-testchat'); return !!s0 && s0.value === '${TCH}';`, 8000);
    await q(`sh.querySelector('.vb .vb-test-go').click(); return true;`);
    const testSaved = await waitFor(`return !sh.querySelector('.vb') && !!sh.querySelector('.fw-new');`, 15000);
    const row14 = () => (fake.db.wa_automations || []).find((a) => a.name === 'Régua de follow-up');
    const r14 = row14() || {};
    const flat14 = [];
    const walk14 = (list) => (list || []).forEach((n) => { flat14.push(n); if (n.type === 'esperar') { walk14(n.yes); walk14(n.no); } });
    walk14((r14.sequence || {}).steps);
    const frio = (fake.db.wa_labels || []).find((l) => l.name === 'Frio');
    const testCard14 = await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => (x.querySelector('.fw-name') || {}).textContent === 'Régua de follow-up'); return c ? c.textContent : '';`);
    check('"Testar comigo": salva a régua (sequência, todo caminho em FIM, etiquetas criadas) ligada EM TESTE só para a conversa escolhida',
      testSaved && r14.kind === 'sequencia' && r14.active === true && r14.test_chat_id === TCH && flat14.filter((n) => n.type === 'enviar').length === 3 && flat14.filter((n) => n.type === 'fim').length === 4
      && !!frio && flat14.some((n) => n.type === 'etiqueta' && n.label_id === frio.id) && !JSON.stringify(r14.sequence).includes('new:') && !JSON.stringify(r14.sequence).includes('hint') && /EM TESTE/.test(testCard14),
      JSON.stringify({ testSaved, kind: r14.kind, active: r14.active, test: r14.test_chat_id, types: flat14.map((n) => n.type), card: testCard14.slice(0, 200) }));
    // Editar: abre no construtor (EM TESTE) → "Ligar para todos" → confirmação → ligada para todos
    await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => (x.querySelector('.fw-name') || {}).textContent === 'Régua de follow-up'); c.querySelector('.fw-edit').click(); await wait(300); return true;`);
    const edit14 = await q(`const v = sh.querySelector('.vb'); return v ? { btns: [...v.querySelectorAll('.vb-tr button:not(.more-item)')].map((b) => b.textContent), badge: (v.querySelector('.vb-tl .fw-badge') || {}).textContent || '', sends: [...v.querySelectorAll('.vb-box.vb-enviar .vb-btxt')].map((x) => x.textContent) } : null;`);
    await q(`sh.querySelector('.vb .vb-all').click(); return true;`);
    await waitFor(`const g = sh.querySelector('.vb .vb-on-go'); return !!g && !g.disabled;`, 15000);
    const conf14 = await q(`const m = sh.querySelector('.vb .vb-modal'); return { title: m.querySelector('.vb-sh').textContent, text: (m.querySelector('.act-text') || {}).textContent || '', go: m.querySelector('.vb-on-go').textContent };`);
    const actBefore14 = r14.activated_at;
    await q(`sh.querySelector('.vb .vb-on-go').click(); return true;`);
    const allOk = await waitFor(`return !sh.querySelector('.vb') && !!sh.querySelector('.fw-new');`, 15000);
    const r14b = row14() || {};
    check('Editar abre a régua no construtor (EM TESTE: Salvar / Salvar e desligar / Ligar para todos); "Ligar para todos" confirma ("Vale para quem se encaixar daqui pra frente.") e liga para todos',
      !!edit14 && edit14.badge === 'EM TESTE' && JSON.stringify(edit14.btns) === '["Salvar","Salvar e desligar","Ligar para todos","Fechar","⋯"]' && edit14.sends[1] === 'Envia “Oferta especial”'
      && conf14.title === 'Ligar “Régua de follow-up”?' && /^Vale para quem se encaixar daqui pra frente\./.test(conf14.text) && conf14.go === 'Ligar'
      && allOk && r14b.active === true && !r14b.test_chat_id && r14b.activated_at && r14b.activated_at !== actBefore14, JSON.stringify({ edit14, conf14, active: r14b.active, test: r14b.test_chat_id, at: [actBefore14, r14b.activated_at] }));
    const listCard = await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => (x.querySelector('.fw-name') || {}).textContent === 'Régua de follow-up'); return c ? { on: c.querySelector('.fw-switch').getAttribute('aria-checked'), txt: c.textContent } : null;`);
    check('lista: interruptor ligado, frase-resumo e os números da régua', !!listCard && listCard.on === 'true' && /Sequência: começa quando entra na etiqueta “Follow Up 1”; 3 mensagens e 3 esperas de resposta/.test(listCard.txt) && /Ninguém entrou ainda|Saíram por ✅/.test(listCard.txt),
      JSON.stringify(listCard && listCard.txt.slice(0, 300)));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console no construtor visual', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 15. excluir mensagem rápida (2.13.1): em uso num agendamento pendente e numa régua → mostra onde e não exclui;
    // erro do banco (23514) → frase clara e o técnico em "Detalhes"; livre → exclui
    fake.on = true;
    fake.generic = true;
    const OFERTA = (fake.db.wa_items || []).find((i) => i.title === 'Oferta especial');
    const VELHA = { ...mkItem('Mensagem velha', 'Oi, tudo bem?'), id: uuid() };
    fake.db.wa_items.push(VELHA);
    const SCH = uuid();
    fake.db.wa_schedules = [...(fake.db.wa_schedules || []),
      { id: SCH, chat_id: '5521988887777@c.us', chat_name: 'Joana', item_id: OFERTA.id, body: null, send_at: '2026-12-01T13:00:00.000Z', status: 'pendente', created_at: new Date().toISOString() },
      { id: uuid(), chat_id: '5521988886666@c.us', chat_name: 'Pedro', item_id: VELHA.id, body: null, send_at: '2026-11-01T13:00:00.000Z', status: 'enviada', created_at: new Date().toISOString() }];
    await s('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (const stop = Date.now() + TIMEOUT_MS; Date.now() < stop;) {
      const opened = await evalPage(`(() => { const sh = document.getElementById('tsp-wa-host')?.shadowRoot; const t = sh && sh.querySelector('.toggle'); if (t && !sh.querySelector('.root.open')) t.click(); return !!(sh && sh.querySelector('.root.open')); })()`);
      if (opened) break;
      await sleep(300);
    }
    await q(`sh.querySelector('[data-sec="mensagens"]').click(); await wait(300); return true;`);
    const cardOf = (id) => `sh.querySelector('.card[data-id="${id}"]')`;
    await waitFor(`return !!${cardOf(OFERTA.id)} && !!${cardOf(VELHA.id)};`, 15000);
    // (a lista é redesenhada ao abrir o menu: procura o cartão de novo antes de clicar em "Excluir")
    const openDelete = (id) => q(`${cardOf(id)}.querySelector('.iopts').click(); await wait(250); [...${cardOf(id)}.querySelectorAll('.imenu button')].find((b) => b.textContent === 'Excluir').click(); return true;`);
    await openDelete(OFERTA.id);
    await waitFor(`const c = ${cardOf(OFERTA.id)}; return !!(c && c.querySelector('.imenu .del-inuse'));`, 10000);
    const inUse = await q(`const m = ${cardOf(OFERTA.id)}.querySelector('.imenu'); return { txt: m.textContent, del: [...m.querySelectorAll('button')].map((b) => b.textContent) };`);
    const stillThere = (fake.db.wa_items || []).some((i) => i.id === OFERTA.id);
    check('excluir mensagem em uso: "Esta mensagem está em 1 agendamento pendente" (conversa e data) e na régua; "Cancele ou troque antes de excluir."; não exclui',
      /Esta mensagem está em 1 agendamento pendente:/.test(inUse.txt) && /Joana · 01\/12/.test(inUse.txt) && /automaç(ão|ões)\/régua:.*Régua de follow-up \(ligada\)/.test(inUse.txt)
      && /Cancele ou troque antes de excluir\./.test(inUse.txt) && JSON.stringify(inUse.del) === '["Fechar"]' && stillThere, JSON.stringify({ inUse, stillThere }));
    await q(`[...${cardOf(OFERTA.id)}.querySelectorAll('.imenu button')].find((b) => b.textContent === 'Fechar').click(); await wait(200); return true;`);
    // livre (o agendamento dela já foi enviado): o banco recusa uma vez com 23514 → frase clara + "Detalhes"
    fake.failOnce = { table: 'wa_items', method: 'DELETE', status: 400, body: { code: '23514', message: 'new row for relation "wa_schedules" violates check constraint "wa_schedules_check"', details: 'Failing row contains (…)' } };
    await openDelete(VELHA.id);
    await waitFor(`const c = ${cardOf(VELHA.id)}; return !!(c && c.querySelector('.imenu') && !c.querySelector('.imenu .del-check') && [...c.querySelectorAll('.imenu button')].some((b) => b.textContent === 'Excluir'));`, 10000);
    const ask = await q(`return ${cardOf(VELHA.id)}.querySelector('.imenu .q').textContent;`);
    await q(`[...${cardOf(VELHA.id)}.querySelectorAll('.imenu button')].find((b) => b.textContent === 'Excluir').click(); return true;`);
    await waitFor(`const c = ${cardOf(VELHA.id)}; return !!(c && c.querySelector('.imenu .del-err'));`, 10000);
    const err = await q(`const e = ${cardOf(VELHA.id)}.querySelector('.imenu .del-err'); return { text: e.firstElementChild.textContent, summary: e.querySelector('details summary').textContent, raw: e.querySelector('.del-raw').textContent, open: e.querySelector('details').open };`);
    check('erro do banco ao excluir: frase clara (sem o texto técnico) e o técnico em "Detalhes" (fechado)',
      /^Excluir "Mensagem velha"\?/.test(ask) && /^O banco recusou excluir: um agendamento antigo ainda aponta para esta mensagem/.test(err.text) && !/23514/.test(err.text)
      && err.summary === 'Detalhes' && /23514/.test(err.raw) && err.open === false, JSON.stringify({ ask, err }));
    await q(`[...${cardOf(VELHA.id)}.querySelectorAll('.imenu button')].find((b) => b.textContent === 'Excluir').click(); return true;`);
    const gone = await waitFor(`return !${cardOf(VELHA.id)};`, 10000);
    check('mensagem livre (o agendamento dela já foi enviado): exclui', gone && !(fake.db.wa_items || []).some((i) => i.id === VELHA.id), JSON.stringify({ gone }));
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console ao excluir mensagens', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 16. horários por automação e por etapa (2.13.2): COMEÇA → Personalizado (faixa fora de 08–21 = aviso amarelo,
    // limite por dia); ❓ "o envio seguinte só entre 14:00 e 18:00"; ⏳ "até o próximo dia às 10:00"; Simular com
    // data e hora; salvar guarda no jsonb; a tela geral virou "Horário geral e limites de segurança"
    fake.on = true;
    fake.generic = true;
    await q(`sh.querySelector('[data-sec="follows"]').click(); await wait(400); return true;`);
    await waitFor(`return !!sh.querySelector('.fw-new');`, 15000);
    // 2.14.1: a lista de automações não tem mais a seção "Ferramentas": tudo no "⋯" do título
    const list141 = await q(`const t = sh.querySelector('.ftab'); const head = t.querySelector('.fw-listhead');
      return { ferr: /FERRAMENTAS/.test(t.textContent), items: head ? [...head.querySelectorAll('.more-item')].map((x) => x.textContent) : [], hidden: head ? head.querySelector('.more-menu').hidden : null,
        loose: [...t.querySelectorAll('button')].filter((b) => !b.closest('.more-menu') && /^(Simular|Testar com a conversa aberta|Histórico)$/.test(b.textContent)).length };`);
    check('lista de automações: sem a seção "Ferramentas"; Simular, Testar com a conversa aberta, Histórico e Adicionar a conversa ficam no "⋯"',
      !list141.ferr && list141.hidden === true && list141.loose === 0 && JSON.stringify(list141.items) === JSON.stringify(['Simular', 'Testar com a conversa aberta', 'Histórico', '🔁 Adicionar a conversa aberta a uma automação']), JSON.stringify(list141));
    await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => (x.querySelector('.fw-name') || {}).textContent === 'Régua de follow-up'); c.querySelector('.fw-edit').click(); await wait(400); return true;`);
    await waitFor(`return !!sh.querySelector('.vb .vb-box.vb-start');`, 10000);
    await q(`sh.querySelector('.vb .vb-box.vb-start').click(); await wait(200); sh.querySelector('.vb .vb-sched input[value="personalizado"]').click(); await wait(250); return true;`);
    const setIn = (sel, v) => q(`const i = sh.querySelector(${JSON.stringify(sel)}); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); return true;`);
    // 2.14.3: tabela por dia (vem do horário geral: Seg–Sáb 09:00–19:00, Dom fechado). Segunda 07:00–12:00 + "+ faixa"
    // 14:00–18:00, "Copiar para os dias úteis", sábado 10:00–14:00, domingo fechado
    const row0 = await q(`const t = sh.querySelector('.vb .vb-sched .wk'); return [...t.querySelectorAll('.wk-row')].map((r) => r.querySelector('.wk-day').textContent.trim() + ':' + (r.querySelector('.wk-closed') ? 'fechado' : [...r.querySelectorAll('.wk-win input')].map((i) => i.value).join('-')));`);
    await setIn('.vb .vb-sched input[aria-label="Automação, Seg, faixa 1: início"]', '07:00');
    await setIn('.vb .vb-sched input[aria-label="Automação, Seg, faixa 1: fim"]', '12:00');
    await q(`sh.querySelector('.vb .vb-sched .wk-row[data-day="1"] .wk-add').click(); await wait(200); return true;`);
    await setIn('.vb .vb-sched input[aria-label="Automação, Seg, faixa 2: início"]', '14:00');
    await setIn('.vb .vb-sched input[aria-label="Automação, Seg, faixa 2: fim"]', '18:00');
    await q(`sh.querySelector('.vb .vb-sched .wk-copy').click(); await wait(200); return true;`);
    await setIn('.vb .vb-sched input[aria-label="Automação, Sáb, faixa 1: início"]', '10:00');
    await setIn('.vb .vb-sched input[aria-label="Automação, Sáb, faixa 1: fim"]', '14:00');
    await setIn('.vb .vb-sched input[aria-label="Limite desta automação por dia"]', '25');
    const sched = await q(`const v = sh.querySelector('.vb'); const t = v.querySelector('.vb-sched .wk');
      return { rows: [...t.querySelectorAll('.wk-row')].map((r) => r.querySelector('.wk-day').textContent.trim() + ':' + (r.querySelector('.wk-closed') ? 'fechado' : [...r.querySelectorAll('.wk-win input')].map((i) => i.value).join('-'))),
        warns: [...t.querySelectorAll('.wk-row')].filter((r) => r.querySelector('.wk-warn')).map((r) => r.dataset.day), start: v.querySelector('.vb-box.vb-start').textContent };`);
    check('COMEÇA → "Horário de envio" personalizado em tabela por dia (vem do geral; Dom fechado); duas faixas na segunda, "Copiar para os dias úteis", sábado diferente; aviso amarelo só nas linhas fora de 08:00–21:00; a caixa mostra o resumo curto',
      JSON.stringify(row0) === JSON.stringify(['Seg:09:00-19:00', 'Ter:09:00-19:00', 'Qua:09:00-19:00', 'Qui:09:00-19:00', 'Sex:09:00-19:00', 'Sáb:09:00-19:00', 'Dom:fechado'])
      && JSON.stringify(sched.rows) === JSON.stringify(['Seg:07:00-12:00-14:00-18:00', 'Ter:07:00-12:00-14:00-18:00', 'Qua:07:00-12:00-14:00-18:00', 'Qui:07:00-12:00-14:00-18:00', 'Sex:07:00-12:00-14:00-18:00', 'Sáb:10:00-14:00', 'Dom:fechado'])
      && JSON.stringify(sched.warns) === '["1","2","3","4","5"]' && /Seg–Sex 07:00–12:00 e 14:00–18:00 · Sáb 10:00–14:00; no máximo 25 por dia/.test(sched.start), JSON.stringify({ row0, sched }));
    // ❓ 1ª espera de resposta: o envio seguinte só entre 14:00 e 18:00
    await q(`sh.querySelector('.vb .vb-box.vb-esperar').click(); await wait(200); sh.querySelector('.vb .vb-side .vb-win-on').click(); await wait(200); return true;`);
    await setIn('.vb .vb-side input[aria-label="Enviar a partir de"]', '14:00');
    await setIn('.vb .vb-side input[aria-label="Enviar até"]', '18:00');
    // ⏳ nova logo depois do COMEÇA: "até o próximo dia às 10:00"
    await q(`sh.querySelector('.vb .vb-plus').click(); await wait(150); sh.querySelector('.vb .vb-menu .vb-mi-pausa').click(); await wait(200);
      sh.querySelector('.vb .vb-side .vb-pmode input[value="ate"]').click(); await wait(200); return true;`);
    const boxes = await q(`const v = sh.querySelector('.vb'); return { pausa: v.querySelector('.vb-box.vb-pausa .vb-btxt').textContent, esperar: v.querySelector('.vb-box.vb-esperar .vb-btxt').textContent };`);
    check('⏳ "Esperar até o próximo dia às 10:00" e ❓ "o envio seguinte só entre 14:00 e 18:00" aparecem na frase das caixas',
      boxes.pausa === 'Espera até o próximo dia às 10:00' && /envia só entre 14:00 e 18:00$/.test(boxes.esperar), JSON.stringify(boxes));
    await q(`sh.querySelector('.vb .vb-sim').click(); await wait(300); return true;`);
    const simT = await q(`const m = sh.querySelector('.vb .vb-modal'); return [...m.querySelectorAll('.vb-sim-nunca .vb-ev')].map((r) => r.querySelector('.vb-evt').textContent + ' | ' + r.querySelector('.vb-evx').textContent);`);
    const sendsT = simT.filter((x) => /Recebe/.test(x));
    check('Simular mostra a data e a hora previstas de cada envio (dia da semana, dia/mês e hora), dentro do horário da automação',
      sendsT.length === 3 && sendsT.every((x) => /^dia \d+ · [a-zçáé]{3},? \d{2}\/\d{2},? (0[7-9]|1[0-7]):\d{2} \| Recebe/.test(x)) && simT.some((x) => /Esperou até o próximo dia às 10:00/.test(x)), JSON.stringify(simT));
    await q(`sh.querySelector('.vb .vb-simclose').click(); await wait(150); sh.querySelector('.vb .vb-save').click(); return true;`);
    const saved16 = await waitFor(`return !sh.querySelector('.vb') && !!sh.querySelector('.fw-new');`, 15000);
    const r16 = (fake.db.wa_automations || []).find((a) => a.name === 'Régua de follow-up') || {};
    const st16 = (r16.sequence || {}).steps || [];
    check('salvar guarda o horário no jsonb da automação (sem migration): personalizado, faixas, limite, ⏳ até e a faixa da etapa',
      saved16 && JSON.stringify(r16.sequence.schedule) === JSON.stringify({ mode: 'personalizado', week: [[], ...[1, 2, 3, 4, 5].map(() => [{ start: '07:00', end: '12:00' }, { start: '14:00', end: '18:00' }]), [{ start: '10:00', end: '14:00' }]], daily_limit: 25 })
      && st16[0].type === 'pausa' && st16[0].mode === 'ate' && st16[0].until_time === '10:00' && JSON.stringify(st16[2].send_window) === '{"start":"14:00","end":"18:00"}',
      JSON.stringify({ saved16, schedule: r16.sequence && r16.sequence.schedule, s0: st16[0], s2: st16[2] && st16[2].send_window }));
    await q(`sh.querySelector('.fw-settings').click(); await wait(300); return true;`);
    const setTxt = await q(`return sh.querySelector('.ftab').textContent;`);
    check('a tela geral virou "Horário geral e limites de segurança" (padrão das automações; os limites valem sempre)',
      /HORÁRIO GERAL E LIMITES DE SEGURANÇA/.test(setTxt) && /padrão das automações/.test(setTxt) && /valem SEMPRE/.test(setTxt), setTxt.slice(0, 200));
    // 2.14.3: horário geral por dia: sábado 10:00–14:00, domingo continua fechado
    const setG = (sel, v) => setIn('.ftab ' + sel, v);
    await setG('input[aria-label="Geral, Sáb, faixa 1: início"]', '10:00');
    await setG('input[aria-label="Geral, Sáb, faixa 1: fim"]', '14:00');
    const gSum = await q(`return sh.querySelector('.ftab .wk-sum').textContent;`);
    await q(`const b = [...sh.querySelectorAll('.ftab .bbtn')].find((x) => x.textContent === 'Salvar'); b.click(); await wait(800); return true;`);
    const cfgWeek = ((fake.db.system_config || []).find((r) => r.key === 'wa_business_week') || {}).value;
    const ws16 = (fake.db.wa_settings || [])[0] || {};
    check('tela geral por dia: Seg–Sex 09:00–19:00 · Sáb 10:00–14:00 (Dom fechado) grava a semana e o resumo nos campos antigos',
      gSum === 'Seg–Sex 09:00–19:00 · Sáb 10:00–14:00' && cfgWeek === JSON.stringify([[], ...[1, 2, 3, 4, 5].map(() => [{ start: '09:00', end: '19:00' }]), [{ start: '10:00', end: '14:00' }]])
      && JSON.stringify(ws16.business_days) === '[1,2,3,4,5,6]' && ws16.business_start === '09:00' && ws16.business_end === '19:00', JSON.stringify({ gSum, cfgWeek, days: ws16.business_days, st: ws16.business_start, en: ws16.business_end }));
    // volta o geral (os outros testes contam com Seg–Sáb 09–19)
    fake.db.system_config = (fake.db.system_config || []).filter((r) => r.key !== 'wa_business_week');
    const b16 = await q(`const b = [...sh.querySelectorAll('.ftab .bbtn')].find((x) => x.textContent === 'Cancelar'); if (b) b.click(); await wait(200); return true;`);
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console nos horários', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 17. "+ Nova etiqueta…" em qualquer lista (2.13.4): na caixa 🏷 do construtor, criar CRM ali mesmo (fica
    // escolhida, o que estava sendo editado continua), nome repetido escolhe a existente, e criar do WhatsApp
    // (ponte simulada: labels.addNewLabel); salvar grava a etiqueta escolhida
    fake.on = true;
    fake.generic = true;
    await pg(`window.__waCreates = []; const L = [{ id: '1', name: 'CLIENTE', hexColor: '#22c55e', count: 3 }, { id: '3', name: 'Não enviar', hexColor: '#ef4444', count: 1 }];
      window.__fakeBridge = { labels: () => L.slice(), labelColors: { available: true, reason: null, colors: ['#ff9dff', '#d3a91d', '#6d7cce'] },
        labelCreate: (p) => { window.__waCreates.push(p); const l = { id: String(10 + window.__waCreates.length), name: p.name, hexColor: p.color || '#ff9dff', count: 0 }; L.push(l); return { label: l, labels: L.slice() }; } }; return true;`);
    await q(`sh.querySelector('[data-sec="follows"]').click(); await wait(400); return true;`);
    await waitFor(`return !!sh.querySelector('.fw-new');`, 15000);
    await q(`const c = [...sh.querySelectorAll('.fw-card')].find((x) => (x.querySelector('.fw-name') || {}).textContent === 'Régua de follow-up'); c.querySelector('.fw-edit').click(); await wait(400); return true;`);
    await waitFor(`return !!sh.querySelector('.vb .vb-box.vb-etiqueta');`, 10000);
    await q(`sh.querySelector('.vb .vb-box.vb-etiqueta').click(); await wait(250); return true;`);
    const pickNew = (aria, kind) => q(`const s = sh.querySelector('.vb .vb-side select[aria-label="${aria}"]'); s.value = '__nova_etiqueta__${kind}'; s.dispatchEvent(new Event('change', { bubbles: true })); await wait(200);
      return { first: s.options[0].textContent, value: s.value, form: !!sh.querySelector('.vb .vb-side .lc-form') };`);
    const crmOpen = await pickNew('Etiqueta', 'crm');
    await q(`const f = sh.querySelector('.vb .vb-side .lc-form'); f.querySelector('.lc-name').value = 'Atacado VIP'; f.querySelectorAll('.lc-color')[3].click(); f.querySelector('.lc-create').click(); return true;`);
    const crmDone = await waitFor(`const s = sh.querySelector('.vb .vb-side select[aria-label="Etiqueta"]'); return !!s && !sh.querySelector('.vb .vb-side .lc-form') && /Atacado VIP/.test(s.selectedOptions[0].textContent);`, 10000);
    const newCrm = (fake.db.wa_labels || []).find((l) => l.name === 'Atacado VIP');
    const crmBox = await q(`return sh.querySelector('.vb .vb-box.vb-etiqueta .vb-btxt').textContent;`);
    check('"+ Nova etiqueta…" é a 1ª opção; escolhendo abre nome + cor ali mesmo (a lista não muda); "Criar" grava a CRM com a cor e ela já fica escolhida na caixa',
      crmOpen.first === '+ Nova etiqueta…' && crmOpen.form && !crmOpen.value.startsWith('__nova') && crmDone && !!newCrm && newCrm.color === '#22c55e' && /Atacado VIP/.test(crmBox),
      JSON.stringify({ crmOpen, crmDone, newCrm, crmBox }));
    await pickNew('Etiqueta', 'crm');
    await q(`const f = sh.querySelector('.vb .vb-side .lc-form'); f.querySelector('.lc-name').value = 'atacado vip'; f.querySelector('.lc-create').click(); await wait(400); return true;`);
    const dup = await q(`const s = sh.querySelector('.vb .vb-side select[aria-label="Etiqueta"]'); return { sel: s.selectedOptions[0].textContent, toast: (sh.querySelector('.toast') || {}).textContent || '' };`);
    check('nome repetido ("atacado vip"): avisa "Já existe" e escolhe a existente (não cria outra)',
      /Atacado VIP/.test(dup.sel) && /Já existe/.test(dup.toast) && (fake.db.wa_labels || []).filter((l) => /atacado vip/i.test(l.name)).length === 1, JSON.stringify(dup));
    // WhatsApp
    await q(`const s = sh.querySelector('.vb .vb-side select[aria-label="Etiqueta: tipo"]'); s.value = 'whatsapp'; s.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); return true;`);
    const waReady = await waitFor(`const s = sh.querySelector('.vb .vb-side select[aria-label="Etiqueta"]'); if (s && s.options[0] && s.options[0].classList.contains('lc-opt')) return true;
      const b = sh.querySelector('.vb .vb-box.vb-etiqueta'); if (b) b.click(); return false;`, 20000);
    const waOpen = await pickNew('Etiqueta', 'wa');
    await new Promise((r) => setTimeout(r, 500));
    await q(`const f = sh.querySelector('.vb .vb-side .lc-form'); f.querySelector('.lc-name').value = 'Promo Natal'; f.querySelectorAll('.lc-color')[1].click(); f.querySelector('.lc-create').click(); return true;`);
    const waDone = await waitFor(`const s = sh.querySelector('.vb .vb-side select[aria-label="Etiqueta"]'); return !!s && !sh.querySelector('.vb .vb-side .lc-form') && s.selectedOptions[0].textContent === 'Promo Natal';`, 10000);
    const waCreates = await pg('return window.__waCreates;');
    check('lista do WhatsApp: "+ Nova etiqueta…" cria no WhatsApp Business (cor da paleta do WhatsApp) e já escolhe',
      waReady && waOpen.form && waDone && JSON.stringify(waCreates) === JSON.stringify([{ name: 'Promo Natal', color: '#d3a91d' }]), JSON.stringify({ waReady, waOpen, waDone, waCreates }));
    await q(`sh.querySelector('.vb .vb-save').click(); return true;`);
    const saved17 = await waitFor(`return !sh.querySelector('.vb') && !!sh.querySelector('.fw-new');`, 15000);
    const vbMsg17 = saved17 ? '' : await q(`return [...sh.querySelectorAll('.vb .ed-msg, .vb .vb-msg, .vb .vb-err, .vb .vb-problems')].map((x) => x.textContent).join(' | ');`);
    const r17 = (fake.db.wa_automations || []).find((a) => a.name === 'Régua de follow-up') || {};
    const et17 = [];
    (function walk(l) { (l || []).forEach((n) => { if (n.type === 'etiqueta') et17.push(n); walk(n.yes); walk(n.no); }); })((r17.sequence || {}).steps);
    check('salvar grava a etiqueta criada ali mesmo (o resto da régua continua igual)',
      saved17 && et17.some((n) => n.source === 'whatsapp' && n.wa_label_id === '11') && JSON.stringify(r17.sequence.schedule || {}).includes('personalizado'), JSON.stringify({ saved17, vbMsg17, et17 }));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console ao criar etiquetas', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 18. disparos (2.14.0): público por etiqueta do WhatsApp (TODAS as conversas, inclusive uma NÃO carregada e
    // @lid com telefone; "Não enviar" do WhatsApp fora), "+ Variação" alternando, {Oi|Olá}, velocidade
    // personalizada (aviso amarelo, dias e horário próprios), previsão, confirmação, e o motor de verdade enviando
    // com a etiqueta do WhatsApp depois de enviar e a variação no log
    fake.on = true;
    fake.generic = true;
    (fake.db.wa_automations || []).forEach((a) => { a.active = false; });
    fake.db.wa_schedules = [];
    fake.db.wa_campaigns = [];
    fake.db.wa_campaign_targets = [];
    (fake.db.wa_settings || []).forEach((w) => Object.assign(w, { paused_all: false, runner_id: null, lease_until: null, min_interval_s: 1, max_interval_s: 2, max_per_hour: 30, max_per_day: 150 }));
    const DA = '5521944440001@c.us'; const DB_LID = '777000111222333@lid'; const DB = '5521944440002@c.us'; const DC = '5521944440003@c.us';
    fake.db.wa_chat_names = [...(fake.db.wa_chat_names || []), { chat_id: DA, name: 'Ana', source: 'manual', updated_at: new Date().toISOString() }]; // {nome}: o nome para mensagens da conversa (Beto não tem: fica sem)
    await pg(`window.__dpSent = []; window.__dpNew = []; window.__waSets = []; window.__fakeBridge = {
      status: { ready: true, version: 'teste' },
      labels: [{ id: '7', name: 'PROMO', hexColor: '#22c55e', count: 3 }, { id: '5', name: 'COMPROU', hexColor: '#3b82f6', count: 0 }, { id: '3', name: 'Não enviar', hexColor: '#ef4444', count: 1 }],
      labelColors: { available: true, reason: null, colors: ['#ff9dff'] },
      labelAllChats: (p) => p.labelId === '7' ? { count: 3, source: 'associacoes', chats: [{ id: '${DA}', name: 'Ana Teste' }, { id: '${DB_LID}', name: 'Beto', phone: '5521944440002' }, { id: '${DC}', name: 'Caio' }] }
        : p.labelId === '3' ? { count: 1, source: 'associacoes', chats: [{ id: '${DC}', name: 'Caio' }] } : { count: 0, chats: [] },
      chatsInfo: (p) => ({ chats: Object.fromEntries((p.chatIds || []).filter((c) => c === '${DA}').map((c) => [c, { loaded: true, last: null, lastIn: null, labels: ['7'] }])) }),
      sendText: (p) => { window.__dpSent.push(p); return { sent: true }; },
      campaignSend: (p) => { window.__dpNew.push(p); return { sent: true }; },
      chatLabels: { labelIds: ['7'] },
      setChatLabels: (p) => { window.__waSets.push(p); return { labelIds: [], confirmed: true }; },
      labelEvents: { events: [] }, convEvents: { events: [], scanned: false }, activityScan: { scanned: false, items: [], leads: [] },
    }; return true;`);
    await q(`sh.querySelector('[data-sec="disparos"]').click(); await wait(500); return true;`);
    await waitFor(`return !!sh.querySelector('.dtab .fw-new');`, 15000);
    await q(`sh.querySelector('.dtab .fw-new').click(); await wait(300); return true;`);
    const dpSet = (sel, v, ev = 'input') => q(`const i = sh.querySelector('.dtab ' + ${JSON.stringify(sel)}); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true })); await wait(250); return true;`);
    await dpSet('input.ed-title', 'Promo do WhatsApp');
    await dpSet('select[aria-label="Público: tipo de etiqueta"]', 'whatsapp', 'change');
    await waitFor(`const s = sh.querySelector('.dtab select[aria-label="Etiqueta do WhatsApp do disparo"]'); return !!s && [...s.options].some((o) => o.value === '7');`, 15000);
    await dpSet('select[aria-label="Etiqueta do WhatsApp do disparo"]', '7', 'change');
    const waCnt = await waitFor(`return /^3 contatos nesta etiqueta/.test((sh.querySelector('.dtab .dp-wacount') || {}).textContent || '');`, 10000);
    await dpSet('textarea[aria-label="Texto da parte 1"]', '{Oi|Olá} {nome}! Promo de hoje');
    await q(`sh.querySelector('.dtab .dp-var-add').click(); await wait(250); return true;`);
    await dpSet('textarea[aria-label="Texto da variação 2"]', 'Variação B para {nome}');
    // prévia: "Ver outra variação"
    const pv1 = await q(`return sh.querySelector('.dtab .dp-preview').textContent;`);
    await q(`sh.querySelector('.dtab .dp-pv-next').click(); await wait(200); return true;`);
    const pv2 = await q(`return sh.querySelector('.dtab .dp-preview').textContent;`);
    check('disparo: público por etiqueta do WhatsApp mostra "3 contatos nesta etiqueta" (todas, inclusive não carregadas); "+ Variação" e "Ver outra variação" na prévia ({Oi|Olá} sorteado)',
      waCnt && /variação 1 de 2/.test(pv1) && /(Oi|Olá) Maria! Promo de hoje/.test(pv1) && !/\{Oi/.test(pv1) && /variação 2 de 2/.test(pv2) && /Variação B para Maria/.test(pv2), JSON.stringify({ waCnt, pv1, pv2, cntTxt: await q(`return (sh.querySelector('.dtab .dp-wacount') || {}).textContent || 'sem';`) }));
    // depois de enviar: colocar etiqueta do WhatsApp COMPROU
    await q(`[...sh.querySelectorAll('.dtab button')].find((b) => b.textContent === '+ Ação depois de enviar').click(); await wait(200); return true;`);
    await dpSet('select[aria-label="Depois de enviar 1"]', 'adicionar_etiqueta_wa', 'change');
    await dpSet('select[aria-label="Etiqueta depois de enviar 1"]', '5', 'change');
    // velocidade: personalizado 20–21 s, todos os dias 00:00–23:59 (roda a qualquer hora do teste)
    await q(`sh.querySelector('.dtab .dp-presets input[value="personalizado"]').click(); await wait(200); return true;`);
    await dpSet('input[aria-label="Intervalo mínimo (s)"]', '20', 'change');
    await dpSet('input[aria-label="Intervalo máximo (s)"]', '21', 'change');
    await q(`sh.querySelector('.dtab input[name="dp-sched"][value="personalizado"]').click(); await wait(200);
      for (const c of sh.querySelectorAll('.dtab .vb-day input')) if (!c.checked) { c.click(); await wait(80); } return true;`);
    await dpSet('input[aria-label="Disparo, faixa 1: início"]', '00:00', 'change');
    await dpSet('input[aria-label="Disparo, faixa 1: fim"]', '23:59', 'change');
    const speedUi = await q(`return { risk: !!sh.querySelector('.dtab .dp-risk'), text: sh.querySelector('.dtab .dp-speed-text').textContent, fc: (sh.querySelector('.dtab .dp-forecast') || {}).textContent || '', adv: !!sh.querySelector('.dtab details.dp-adv:not([open])'), recent: sh.querySelector('.dtab .dp-recent-on').checked };`);
    check('Velocidade e segurança: personalizado mais rápido que o Normal = aviso amarelo; previsão "3 contatos · termina em cerca de…"; "Excluir quem recebeu…" desligado e em Opções avançadas',
      speedUi.risk && /Personalizado: 20–21 s entre envios/.test(speedUi.text) && /^3 contatos · termina em cerca de .+ \((hoje|amanhã) às \d\d:\d\d\)$/.test(speedUi.fc) && speedUi.adv && speedUi.recent === false, JSON.stringify(speedUi));
    // 2.14.1: o formulário mostra só "Salvar" e "Cancelar" + "⋯" (Simular)
    const dpBtns = await q(`const a = [...sh.querySelectorAll('.dtab .ed-add')].pop(); return { vis: [...a.children].filter((x) => x.matches('button')).map((x) => x.textContent), items: [...a.querySelectorAll('.more-menu .more-item')].map((x) => x.textContent), hidden: a.querySelector('.more-menu').hidden };`);
    check('disparo (formulário): à vista só "Salvar" e "Cancelar"; "Simular" no "⋯"', JSON.stringify(dpBtns) === JSON.stringify({ vis: ['Salvar', 'Cancelar'], items: ['Simular'], hidden: true }), JSON.stringify(dpBtns));
    await q(`sh.querySelector('.dtab .dp-save').click(); return true;`);
    const dpConf = await waitFor(`return /CONFIRMAR/.test((sh.querySelector('.dtab .wt-head') || {}).textContent || '') && !/Calculando/.test(sh.querySelector('.dtab').textContent);`, 20000);
    const dpConfTxt = await q(`return sh.querySelector('.dtab .fw-test').textContent;`);
    const saved18 = (fake.db.wa_campaigns || [])[0] || {};
    check('Salvar e revisar: grava público do WhatsApp, velocidade e variações no disparo; a confirmação mostra 3 na etiqueta, 2 vão receber (1 não carregada), 1 "Não enviar", variações e a previsão',
      dpConf && JSON.stringify(saved18.audience) === '{"source":"whatsapp","wa_label_id":"7"}' && saved18.speed && saved18.speed.preset === 'personalizado' && saved18.speed.min_s === 20 && saved18.speed.schedule.days.length === 7
      && JSON.stringify(saved18.variants) === '{"mode":"alternada","list":[{"text":"Variação B para {nome}"}]}' && saved18.skip_recent_days === 0
      && /Na etiqueta do WhatsApp PROMO: 3 contatos/.test(dpConfTxt) && /Vão receber: 2 \(1 em conversa que não está carregada agora\)/.test(dpConfTxt) && /Pulados: 1 \(Não enviar: 1\)/.test(dpConfTxt)
      && /Variações: 2 \(alternadas\)/.test(dpConfTxt) && /Previsão: 2 contatos · termina em cerca de/.test(dpConfTxt),
      JSON.stringify({ dpConf, dpConfTxt, saved18, msg: await q(`return (sh.querySelector('.dtab .dp-msg') || {}).textContent || '';`) }));
    const cfBtns = await q(`const a = [...sh.querySelectorAll('.dtab .ed-add')].pop(); return { vis: [...a.children].filter((x) => x.matches('button')).map((x) => x.textContent), items: [...a.querySelectorAll('.more-menu .more-item')].map((x) => x.textContent),
      fc: ((a.nextElementSibling && a.nextElementSibling.matches('.dp-forecast-start')) ? a.nextElementSibling.textContent : '') };`);
    check('disparo (confirmação): à vista "Iniciar disparo" e "Voltar"; "Simular" no "⋯"; a previsão aparece sozinha logo abaixo do botão de iniciar',
      JSON.stringify(cfBtns.vis) === JSON.stringify(['Iniciar disparo', 'Voltar']) && JSON.stringify(cfBtns.items) === JSON.stringify(['Simular']) && /^2 contatos · termina em cerca de .+ \((hoje|amanhã) às \d\d:\d\d\)$/.test(cfBtns.fc), JSON.stringify(cfBtns));
    await q(`sh.querySelector('.dtab .dp-start').click(); return true;`);
    const started = await waitFor(`return /Disparo iniciado/.test(sh.querySelector('.dtab').textContent);`, 20000);
    const tg = (fake.db.wa_campaign_targets || []).map((t) => [t.name, t.chat_id, ['pendente', 'enviando', 'enviado'].includes(t.status) ? 'pendente' : t.status, t.reason || null]); // (o motor pode já ter começado a enviar)
    check('Iniciar: a foto tem Ana (carregada), Beto (@lid NÃO carregado, pelo telefone) e Caio pulado ("Não enviar" do WhatsApp)',
      started && JSON.stringify(tg) === JSON.stringify([['Ana Teste', DA, 'pendente', null], ['Beto', DB, 'pendente', null], ['Caio', DC, 'pulado', 'Não enviar']]), JSON.stringify({ started, tg }));
    // o motor envia (um por vez, com o intervalo do disparo)
    const sentAll = await waitFor(`return true;`, 10).then(async () => {
      for (const stop = Date.now() + 150000; Date.now() < stop;) {
        if ((fake.db.wa_campaign_targets || []).filter((t) => t.status === 'enviado').length === 2) return true;
        await sleep(1000);
      }
      return false;
    });
    const sent = await pg('return { a: window.__dpSent, n: window.__dpNew, l: window.__waSets };');
    const logs = (fake.db.wa_send_log || []).filter((x) => x.source === 'disparo' && x.status === 'enviado').map((x) => [x.chat_id, x.variant]);
    const tA = (fake.db.wa_campaign_targets || []).find((t) => t.chat_id === DA) || {};
    const tB = (fake.db.wa_campaign_targets || []).find((t) => t.chat_id === DB) || {};
    const gapS = tA.sent_at && tB.sent_at ? (Date.parse(tB.sent_at) - Date.parse(tA.sent_at)) / 1000 : null;
    check('motor: envia para a carregada (variação 1, {Oi|Olá} sorteado) e para a NÃO carregada da etiqueta (variação 2), com ≥ 20 s entre os dois; a variação vai para o log',
      sentAll && sent.a.length === 1 && sent.a[0].chatId === DA && /^(Oi|Olá) Ana! Promo de hoje$/.test(sent.a[0].text) && sent.n.length === 1 && sent.n[0].chatId === DB && sent.n[0].text === 'Variação B para'
      && gapS >= 20 && JSON.stringify(logs) === JSON.stringify([[DA, 0], [DB, 1]]), JSON.stringify({ sentAll, sent, logs, gapS }));
    check('depois de enviar: etiqueta do WhatsApp COMPROU colocada nos dois que receberam (e em mais ninguém)',
      JSON.stringify(sent.l.filter((x) => (x.add || []).includes('5')).map((x) => x.chatId).sort()) === JSON.stringify([DA, DB].sort()) && !sent.l.some((x) => x.chatId === DC), JSON.stringify(sent.l));
    await pg('window.__fakeBridge = null; return true;');
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console nos disparos', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 19. abrir qualquer conversa com um clique (2.14.4): nome clicável (mão + "Abrir conversa") nos Agendados; abre pela
    // função única (openChat com id e telefone); se a ponte não abrir, o aviso traz o número e "Copiar número"
    fake.on = true;
    fake.generic = true;
    const OC = '5521944445555@c.us';
    fake.db.wa_schedules = [{ id: uuid(), chat_id: OC, chat_name: 'Zeca Agendado', item_id: null, body: 'Oi Zeca, lembrete', send_at: new Date(Date.now() + 10 * 86400000).toISOString(), status: 'pendente', error_code: null, sent_at: null, created_at: new Date().toISOString() }];
    await pg(`window.__opens = []; window.__fakeBridge = { openChat: (p) => { window.__opens.push(p); return { opened: true, via: 'telefone' }; } }; return true;`);
    await q(`sh.querySelector('[data-sec="vendas"]').click(); await wait(200); sh.querySelector('[data-sec="agendados"]').click(); await wait(300); return true;`);
    const zeca = `[...sh.querySelectorAll('.sc-who.conv-link')].find((x) => x.textContent === 'Zeca Agendado')`;
    const ocList = await waitFor(`return !!${zeca};`, 15000);
    const ocUi = await q(`const z = ${zeca}; return z ? { title: z.title, cursor: getComputedStyle(z).cursor, role: z.getAttribute('role') } : null;`);
    await q(`${zeca}.click(); await wait(400); return true;`);
    const opens = await pg('return window.__opens;');
    check('Agendados: o nome é clicável (mão + "Abrir conversa") e abre pela função única (openChat com id e telefone)',
      ocList && ocUi && ocUi.title === 'Abrir conversa' && ocUi.cursor === 'pointer' && JSON.stringify(opens) === JSON.stringify([{ chatId: OC, phone: '5521944445555' }]), JSON.stringify({ ocList, ocUi, opens }));
    // sem openChat na ponte simulada: a ponte de verdade responde (sem WhatsApp, não abre) → aviso com o número
    await pg(`window.__fakeBridge = {}; return true;`);
    await c.send('Browser.grantPermissions', { origin: 'https://web.whatsapp.com', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await q(`${zeca}.click(); return true;`);
    const warnOk = await waitFor(`return /Não consegui abrir a conversa de Zeca Agendado/.test(sh.querySelector('.toast').textContent);`, 30000);
    const warn = await q(`const t = sh.querySelector('.toast'); return { text: t.textContent, btn: [...t.querySelectorAll('button')].map((b) => b.textContent) };`);
    await q(`[...sh.querySelectorAll('.toast button')].find((b) => b.textContent === 'Copiar número').click(); await wait(400); return true;`);
    const copied = await q(`return sh.querySelector('.toast').textContent;`);
    const clip = await pg(`try { return await navigator.clipboard.readText(); } catch (e) { return 'erro: ' + e.message; }`);
    check('se tudo falhar: aviso com o número e o botão "Copiar número" (que copia o número)',
      warnOk && /Número: \+55 \(21\) 94444-5555/.test(warn.text) && JSON.stringify(warn.btn) === JSON.stringify(['Copiar número']) && copied === 'Número copiado: 5521944445555' && clip === '5521944445555', JSON.stringify({ warnOk, warn, copied, clip }));
    await pg('window.__fakeBridge = null; return true;');
    fake.db.wa_schedules = [];
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console ao abrir conversa', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 20. ver mensagens apagadas e editadas (2.15.0): a ponte simulada tem 1 áudio apagado e 1 texto editado na conversa;
    // selos junto das mensagens, janela com o original (áudio tocável; original + editada), lista no painel da conversa,
    // "Guardar mensagens apagadas" e "Apagar tudo agora" no Personalizar
    const DCH = '5521966667777@c.us';
    const DID = `false_${DCH}_3EB0APAGADA1`;
    const EID = `false_${DCH}_3EB0EDITADA1`;
    const delNowS = Math.floor(Date.now() / 1000);
    const DITEMS = [
      { id: DID, chatId: DCH, type: 'ptt', kind: 'audio', t: delNowS - 60, revokedAt: Date.now(), editedAt: null, preview: '', hasMedia: true, hasThumb: false, edits: 0 },
      { id: EID, chatId: DCH, type: 'chat', kind: 'texto', t: delNowS - 120, revokedAt: null, editedAt: Date.now(), preview: 'oi, quero o tênis 42', hasMedia: false, hasThumb: false, edits: 1 },
    ];
    await pg(`window.__delCfg = []; window.__delCleared = 0; const IT = ${JSON.stringify(DITEMS)};
      window.__fakeBridge = { activeChat: { kind: 'individual', chatId: ${JSON.stringify(DCH)} }, chatPhone: { phone: '5521966667777', name: 'Dora Apaga', via: 'numero' }, recentChats: [], labels: [], chatLabels: { labelIds: [] },
        deletedConfig: (p) => { window.__delCfg.push(p.on); return { on: p.on, available: true }; },
        deletedChanges: [],
        deletedList: (p) => ({ available: true, items: p.chatId === ${JSON.stringify(DCH)} ? IT : [] }),
        deletedGet: (p) => p.id === ${JSON.stringify(DID)}
          ? { ...IT[0], body: '', caption: '', mimetype: 'audio/ogg; codecs=opus', filename: '', duration: 3, thumb: null, edits: [], media: new Uint8Array([79, 103, 103, 83, 0, 2]).buffer, mime: 'audio/ogg' }
          : { ...IT[1], body: 'oi, quero o tênis 42', caption: '', mimetype: '', filename: '', duration: 0, thumb: null, edits: [{ body: 'oi, quero o tênis 43', at: Date.now() }], media: null, mime: '' },
        deletedClear: () => { window.__delCleared++; return { cleared: true }; } };
      return true;`);
    await openChat('Cliente 7');
    await pg(`document.querySelector('#main .msgs').innerHTML = '<div data-id="${DID}"><span>🚫 Esta mensagem foi apagada</span></div><div data-id="${EID}"><span>oi, quero o tênis 43</span> <span>Editada</span></div>'; return true;`);
    await q(`if (!sh.querySelector('.root.open')) sh.querySelector('.toggle').click(); await wait(200); sh.querySelector('[data-sec="mensagens"]').click(); await wait(300); return true;`);
    const dBadgesOk = await (async () => { for (const stop = Date.now() + 20000; Date.now() < stop;) { if (await pg(`return document.querySelectorAll('#main .tsp-del-badge').length === 2;`)) return true; await sleep(300); } return false; })();
    const dBadges = await pg(`return [...document.querySelectorAll('#main .tsp-del-badge')].map((b) => [b.closest('[data-id]').dataset.id.slice(-12), b.textContent]);`);
    check('na conversa: selo "👁 Ver mensagem apagada" junto da apagada e "✏️ Ver original" junto da editada',
      dBadgesOk && JSON.stringify(dBadges) === JSON.stringify([['3EB0APAGADA1', '👁 Ver mensagem apagada'], ['3EB0EDITADA1', '✏️ Ver original']]), JSON.stringify({ dBadgesOk, dBadges }));
    const dCdel = await q(`const b = sh.querySelector('.cdel'); return { hidden: b.hidden, vis: getComputedStyle(b).display, t: (b.querySelector('.cdel-t') || {}).textContent, rows: [...b.querySelectorAll('.cdel-row')].map((r) => r.textContent) };`);
    check('painel da conversa: lista "Mensagens apagadas/editadas nesta conversa (últimos 7 dias)" com as duas',
      !dCdel.hidden && dCdel.vis !== 'none' && dCdel.t === 'Mensagens apagadas/editadas nesta conversa (últimos 7 dias)' && dCdel.rows.length === 2 && /^👁 apagada/.test(dCdel.rows[0]) && /🎤 áudio$/.test(dCdel.rows[0]) && /^✏️ editada/.test(dCdel.rows[1]) && /oi, quero o tênis 42$/.test(dCdel.rows[1]), JSON.stringify(dCdel));
    const dView = (js) => pg(`const h = document.getElementById('tsp-del-view'); const v = h && h.shadowRoot; ${js}`);
    await pg(`document.querySelector('#main .tsp-del-badge').click(); await wait(500); return true;`);
    const dv1 = await dView(`if (!v) return null; const a = v.querySelector('audio'); return { head: v.querySelector('.h span').textContent, audio: !!a && a.controls && /^blob:/.test(a.src), note: [...v.querySelectorAll('.note')].map((n) => n.textContent) };`);
    await dView(`v.querySelector('.x').click(); await wait(150); return true;`);
    const dClosed = await pg(`return !document.getElementById('tsp-del-view');`);
    check('"👁 Ver mensagem apagada" abre a janela com o original: áudio tocável (controles, arquivo local) e fecha no ✕',
      dv1 && /^👁 Mensagem apagada pelo cliente/.test(dv1.head) && dv1.audio && dv1.note.includes('Cópia guardada só neste computador por 7 dias.') && dClosed, JSON.stringify({ dv1, dClosed }));
    await q(`[...sh.querySelectorAll('.cdel-row')][1].click(); await wait(500); return true;`);
    const dv2 = await dView(`if (!v) return null; return { head: v.querySelector('.h span').textContent, lbl: [...v.querySelectorAll('.lbl')].map((x) => x.textContent), txt: [...v.querySelectorAll('.txt')].map((x) => x.textContent), ed: [...v.querySelectorAll('.ed')].map((x) => x.textContent.split('  · ')[0]) };`);
    await pg(`document.getElementById('tsp-del-view').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150); return true;`);
    check('"✏️ Ver original" (pela lista do painel): mostra o original e o texto editado; Esc fecha',
      dv2 && /^✏️ Mensagem editada pelo cliente/.test(dv2.head) && JSON.stringify(dv2.lbl) === JSON.stringify(['Original', 'Editada para']) && JSON.stringify(dv2.txt) === JSON.stringify(['oi, quero o tênis 42'])
      && JSON.stringify(dv2.ed) === JSON.stringify(['oi, quero o tênis 43']) && await pg(`return !document.getElementById('tsp-del-view');`), JSON.stringify(dv2));
    // Personalizar: desligar/ligar manda a configuração para a ponte; "Apagar tudo agora" apaga e tira os selos
    await czOpen();
    const dCz = await q(`const l = [...sh.querySelectorAll('.cz-opt')].find((x) => x.textContent === 'Guardar mensagens apagadas'); return { found: !!l, checked: !!(l && l.querySelector('input').checked), btn: !!sh.querySelector('.cz .cz-delclear') };`);
    await czClickLabel('Guardar mensagens apagadas');
    await sleep(400);
    const dCfgOff = await pg('return window.__delCfg.slice();');
    await czClickLabel('Guardar mensagens apagadas');
    await sleep(400);
    await czOpen();
    await q(`sh.querySelector('.cz .cz-delclear').click(); await wait(500); return true;`);
    const dAfter = await pg(`return { cfg: window.__delCfg.slice(), cleared: window.__delCleared, dBadges: document.querySelectorAll('#main .tsp-del-badge').length };`);
    const cdelGone = await q(`return sh.querySelector('.cdel').hidden;`);
    await czClose();
    check('Personalizar: "Guardar mensagens apagadas" ligado por padrão (desligar/ligar avisa a ponte) e "Apagar tudo agora" apaga e tira selos e lista',
      dCz.found && dCz.checked && dCz.btn && dCfgOff[dCfgOff.length - 1] === false && dAfter.cfg[dAfter.cfg.length - 1] === true && dAfter.cleared === 1 && dAfter.dBadges === 0 && cdelGone,
      JSON.stringify({ dCz, dCfgOff, dAfter, cdelGone }));
    await pg(`window.__fakeBridge = null; document.querySelector('#main .msgs').innerHTML = ''; return true;`);
    check('nenhum erro no console nas mensagens apagadas', errors.length === 0, errors.slice(0, 8).join(' | '));

    // 21. exportar o catálogo do WhatsApp Business (2.15.3): ponte simulada com 3 produtos visíveis (um com uma foto
    // que não baixa), Supabase falso (wa-media + system_config). Aba Mídias → "Exportar catálogo do WhatsApp" →
    // "3 produtos e 4 fotos exportados" + o que falhou; fotos em catalog/<id>/<sha256>.png; retrato em
    // system_config (wa_catalog_snapshot); exportar de novo não sobe nenhuma foto; nada é enviado.
    fake.on = true;
    fake.generic = true;
    fake.storage = new Map(); // caminho no bucket → nº de uploads
    fake.storageSeen = [];
    fake.db.system_config = (fake.db.system_config || []).filter((r) => r.key !== 'wa_catalog_snapshot');
    const CAT_ME = '5521988887777';
    const CAT_IMG = (n) => `https://media.fsdu1-1.fna.whatsapp.net/v/t45/${n}.jpg`;
    const CAT_PRODUCTS = [
      { id: '7001', name: 'Relógio Ouro', description: 'Pulseira de aço\nResistente à água', price: 459.9, salePrice: 399.9, currency: 'BRL', link: `https://wa.me/p/7001/${CAT_ME}`, url: null, retailerId: 'SKU-1', collections: ['Relógios'], images: [CAT_IMG('a1'), CAT_IMG('a2')] },
      { id: '7002', name: 'Smartwatch Preto', description: 'Tela AMOLED', price: 199, salePrice: null, currency: 'BRL', link: `https://wa.me/p/7002/${CAT_ME}`, url: null, retailerId: null, collections: [], images: [CAT_IMG('b1'), CAT_IMG('quebrada')] },
      { id: '7003', name: 'Pulseira Extra', description: '', price: 49.9, salePrice: null, currency: 'BRL', link: `https://wa.me/p/7003/${CAT_ME}`, url: null, retailerId: null, collections: ['Acessórios'], images: [CAT_IMG('c1')] },
    ];
    await pg(`window.__catTypes = [];
      const P = ${JSON.stringify(CAT_PRODUCTS)};
      const bytes = (n) => { const b = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...[...n].map((c) => c.charCodeAt(0))]); return b.buffer; };
      // Proxy: registra TODO pedido que chega à ponte (inclusive os que ela não responde)
      const fb = { recentChats: [], labels: [], chatLabels: { labelIds: [] },
        catalogExport: { ok: true, reason: null, me: ${JSON.stringify(CAT_ME)}, products: P, warnings: [] },
        catalogImage: (p) => (/quebrada/.test(p.url) ? { data: null, mime: 'image/png' } : { data: bytes(p.url.split('/').pop()), mime: 'image/png' }) };
      window.__fakeBridge = new Proxy(fb, { getOwnPropertyDescriptor: (t, k) => { window.__catTypes.push(k); return Reflect.getOwnPropertyDescriptor(t, k); } });
      return true;`);
    await q(`if (!sh.querySelector('.root.open')) sh.querySelector('.toggle').click(); await wait(200); sh.querySelector('[data-sec="midias"]').click(); await wait(400); return true;`);
    const catBtnOk = await (async () => { for (const stop = Date.now() + 15000; Date.now() < stop;) { if (await q(`return !!sh.querySelector('.md-catx-btn');`)) return true; await sleep(300); } return false; })();
    const catBtn = await q(`const b = sh.querySelector('.md-catx-btn'); return b ? { t: b.textContent, head: b.closest('.md-catx').querySelector('.wt-head').textContent, inMedia: !!b.closest('.mtab') } : null;`);
    check('aba Mídias: bloco "CATÁLOGO DO WHATSAPP" com o botão "Exportar catálogo do WhatsApp"',
      catBtnOk && catBtn && catBtn.t === 'Exportar catálogo do WhatsApp' && catBtn.head === 'CATÁLOGO DO WHATSAPP' && catBtn.inMedia, JSON.stringify(catBtn));
    const catRun = async () => {
      await q(`sh.querySelector('.md-catx-btn').click(); return true;`);
      for (const stop = Date.now() + 30000; Date.now() < stop;) {
        const r = await q(`const d = sh.querySelector('.md-catx-done'); return d ? { done: d.textContent, fail: [...sh.querySelectorAll('.md-catx-fail li')].map((x) => x.textContent), btn: sh.querySelector('.md-catx-btn').textContent, disabled: sh.querySelector('.md-catx-btn').disabled } : (sh.querySelector('.md-catx-err') || {}).textContent || null;`);
        if (r && typeof r === 'object') return r;
        if (typeof r === 'string') return { error: r };
        await sleep(300);
      }
      return null;
    };
    const cat1 = await catRun();
    const uploads1 = [...fake.storage.entries()];
    const snapRow = (fake.db.system_config || []).filter((r) => r.key === 'wa_catalog_snapshot').pop();
    let snap = null;
    try { snap = snapRow ? JSON.parse(snapRow.value) : null; } catch { snap = null; }
    const pathRe = /^catalog\/(7001|7002|7003)\/[0-9a-f]{64}\.png$/;
    check('exportar: "3 produtos e 4 fotos exportados em <data>" e a lista do que falhou (a foto que não baixou)',
      cat1 && /^3 produtos e 4 fotos exportados em \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}\.$/.test(cat1.done) && cat1.fail.length === 1 && /^Smartwatch Preto: 1 de 2 fotos não exportada: /.test(cat1.fail[0]) && cat1.btn === 'Exportar catálogo do WhatsApp' && !cat1.disabled,
      JSON.stringify(cat1));
    check('fotos no wa-media em catalog/<id do produto>/<sha256>.png (uma vez cada)',
      uploads1.length === 4 && uploads1.every(([p, n]) => pathRe.test(p) && n === 1) && uploads1.filter(([p]) => p.startsWith('catalog/7001/')).length === 2, JSON.stringify(uploads1));
    check('retrato em system_config (wa_catalog_snapshot): data, número da loja, produtos com descrição/preços/link/coleção e os links das fotos no bucket',
      snap && Date.parse(snap.exported_at) && snap.phone === CAT_ME && snap.product_count === 3 && snap.image_count === 4
      && JSON.stringify(snap.products.map((p) => [p.id, p.images.length])) === JSON.stringify([['7001', 2], ['7002', 1], ['7003', 1]])
      && snap.products[0].description === 'Pulseira de aço\nResistente à água' && snap.products[0].price === 459.9 && snap.products[0].salePrice === 399.9 && snap.products[0].currency === 'BRL'
      && snap.products[0].link === `https://wa.me/p/7001/${CAT_ME}` && JSON.stringify(snap.products[2].collections) === '["Acessórios"]'
      && snap.products.every((p) => p.images.every((im) => /\/storage\/v1\/object\/public\/wa-media\/catalog\//.test(im.url) && pathRe.test(im.url.split('/wa-media/')[1]) && /^https:\/\/media\./.test(im.source)))
      && snap.failed.length === 1 && snap.failed[0].id === '7002', JSON.stringify(snap && { ...snap, products: snap.products.map((p) => ({ id: p.id, n: p.images.length })) }));
    const posts1 = fake.storageSeen.filter((x) => x.startsWith('POST')).length;
    const cat2 = await catRun();
    const posts2 = fake.storageSeen.filter((x) => x.startsWith('POST')).length;
    check('exportar de novo: as mesmas fotos (mesmo sha256) não sobem de novo — reaproveita',
      cat2 && /^3 produtos e 4 fotos exportados em .*\(4 já estavam no wa-media, não subiram de novo\)\.$/.test(cat2.done) && posts2 === posts1 && [...fake.storage.values()].every((n) => n === 1), JSON.stringify({ cat2, posts1, posts2 }));
    const catTypes = await pg(`return [...new Set(window.__catTypes)];`);
    check('não envia nada: a ponte só recebeu leitura do catálogo e das fotos (nenhum envio)',
      catTypes.includes('catalogExport') && catTypes.includes('catalogImage') && !catTypes.some((t) => /^send|campaignSend|setChatLabels/.test(t)), JSON.stringify(catTypes));
    await pg(`window.__fakeBridge = null; return true;`);
    fake.on = false;
    fake.generic = false;
    fake.storage = null;
    check('nenhum erro no console na exportação do catálogo', errors.length === 0, errors.slice(0, 8).join(' | '));
    // 22. réguas por "dia desde a entrada" + entrar no meio (2.16.0): régua de 6 follows (❓ "até 1/3/5/7/10 dias
    // depois de entrar"). No construtor: a caixa diz "dia 3 desde a entrada", o lado tem "Contar o tempo" e o Simular
    // mostra "dia X · data". Na conversa (🔁): "Começar no: Follow 4", enviar agora, "Tirar das outras réguas?"
    // marcado → o percurso nasce no Follow 4 com a entrada de 5 dias atrás e a outra régua sai. Nada é enviado.
    fake.on = true;
    fake.generic = true;
    const CH22 = '5521966665555@c.us';
    const REG = uuid(); const OUT22 = uuid();
    const mk22 = (k) => {
      const send = { id: `s${k + 1}`, type: 'enviar', item_id: itemId };
      if (k === 5) return [send, { id: `fim${k}`, type: 'fim' }];
      return [send, { id: `w${k + 1}`, type: 'esperar', amount: [1, 3, 5, 7, 10][k], unit: 'dias', from: 'entrada', yes: [{ id: `ok${k}`, type: 'fim' }], no: mk22(k + 1) }];
    };
    fake.db.wa_automations = [...(fake.db.wa_automations || []),
      { id: REG, name: 'Régua 6 follows', kind: 'sequencia', trigger_type: 'sequencia', active: false, position: 1, sequence: { start: { type: 'lead', origin: 'todos' }, business: false, schedule: { mode: 'personalizado', week: [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: '00:00', end: '23:59' }]) }, steps: mk22(0) }, test_chat_id: null, conditions: [], actions: [] },
      { id: OUT22, name: 'Outra régua', kind: 'sequencia', trigger_type: 'sequencia', active: false, position: 2, sequence: { start: { type: 'manual' }, business: false, steps: [{ id: 'x1', type: 'enviar', item_id: itemId }, { id: 'xf', type: 'fim' }] }, test_chat_id: null, conditions: [], actions: [] }];
    fake.db.wa_sequence_runs = [...(fake.db.wa_sequence_runs || []), { id: uuid(), automation_id: OUT22, chat_id: CH22, entry_key: 'insc@1', node: 'x1', status: 'ativo', version: 0, branches: [], skip_wait: false, created_at: new Date().toISOString() }];
    await pg(`window.__fakeBridge = { activeChat: { kind: 'individual', chatId: ${JSON.stringify(CH22)} }, chatPhone: { phone: '5521966665555', name: 'Joana', via: 'numero' },
      verifyChatPhone: { active: true, match: true }, recentChats: [], labels: [], chatLabels: { labelIds: [] } }; return true;`);
    await openChat('Cliente 8');
    await q(`if (!sh.querySelector('.root.open')) sh.querySelector('.toggle').click(); await wait(200); sh.querySelector('[data-sec="vendas"]').click(); await wait(200); sh.querySelector('[data-sec="follows"]').click(); await wait(300); return true;`);
    const regCard = `[...sh.querySelectorAll('.fw-card')].find((c) => (c.querySelector('.fw-name') || {}).textContent === 'Régua 6 follows')`;
    const regOk = await waitFor(`return !!${regCard};`, 15000);
    await q(`const c = ${regCard}; c.querySelector('.fw-edit').click(); await wait(400); return true;`);
    const box22 = await q(`const v = sh.querySelector('.vb'); if (!v) return null; const w = [...v.querySelectorAll('.vb-box.vb-esperar')]; const t = w.map((b) => b.querySelector('.vb-btxt').textContent);
      w[1].click(); await wait(250); const side = v.querySelector('.vb-side');
      return { waits: t, from: [...side.querySelectorAll('.vb-from input')].map((r) => [r.value, r.checked]), help: (side.querySelector('.vb-from-help') || {}).textContent || '', mine: /MINHA última mensagem/.test(side.textContent) };`);
    check('construtor: ❓ "até X dias depois de entrar" com "dia X desde a entrada" na caixa; lado com "Contar o tempo" (desde a entrada marcado) e sem "da minha mensagem"',
      regOk && !!box22 && JSON.stringify(box22.waits.slice(0, 2)) === JSON.stringify(['Espera resposta até 1 dia depois de entrar · dia 1 desde a entrada', 'Espera resposta até 3 dias depois de entrar · dia 3 desde a entrada'])
      && JSON.stringify(box22.from) === '[["anterior",false],["entrada",true]]' && /dia 3 desde a entrada/.test(box22.help) && /segue na hora/.test(box22.help) && !box22.mine, JSON.stringify(box22));
    // trocar para "a partir desta etapa" e voltar: a frase muda (e volta)
    const flip22 = await q(`const v = sh.querySelector('.vb'); const pick = async (val) => { v.querySelector('.vb-side .vb-from input[value="' + val + '"]').click(); await wait(200); return v.querySelectorAll('.vb-box.vb-esperar')[1].querySelector('.vb-btxt').textContent; };
      const a = await pick('anterior'); const b = await pick('entrada'); return [a, b];`);
    check('construtor: "a partir desta etapa" volta à frase de sempre; "depois que a pessoa ENTROU" volta ao "dia 3"',
      flip22[0] === 'Espera resposta por até 3 dias' && flip22[1] === 'Espera resposta até 3 dias depois de entrar · dia 3 desde a entrada', JSON.stringify(flip22));
    await shot('regua-dia-desde-entrada.png');
    await q(`const t = sh.querySelector('.vb .vb-tr'); t.querySelector('.more-btn').click(); await wait(150); t.querySelector('.more-menu .vb-sim').click(); await wait(300); return true;`);
    const sim22 = await q(`const m = sh.querySelector('.vb .vb-modal'); return [...m.querySelectorAll('.vb-sim-nunca .vb-ev')].filter((r) => r.classList.contains('vb-ev-enviar')).map((r) => r.querySelector('.vb-evt').textContent);`);
    check('Simular: cada envio com "dia X · data/hora prevista" (dia 0, 1, 3, 5, 7, 10)',
      sim22.length === 6 && JSON.stringify(sim22.map((x) => Number((/^dia (\d+) · /.exec(x) || [])[1]))) === '[0,1,3,5,7,10]' && sim22.every((x) => DATE_RE.test(x)), JSON.stringify(sim22));
    await shot('simular-dia-x.png');
    await q(`sh.querySelector('.vb .vb-simclose').click(); await wait(200); sh.querySelector('.vb .vb-close').click(); await wait(300); const d = sh.querySelector('.vb .vb-discard'); if (d) d.click(); await wait(300); return true;`);
    // 🔁 na conversa: escolher a régua e "Começar no: Follow 4"
    await q(`sh.querySelector('.auto-quick').click(); return true;`);
    await waitFor(`return !!sh.querySelector('.ftab select[aria-label="Automação"]') && !sh.querySelector('.ftab .loading');`, 15000);
    await q(`const s = sh.querySelector('.ftab select[aria-label="Automação"]'); s.value = '${REG}'; s.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); return true;`);
    const steps22 = await q(`const s = sh.querySelector('.ftab .fl-add-step'); return s ? [...s.options].map((o) => o.textContent) : null;`);
    check('Adicionar à automação: "Começar no:" com o começo e Follow 1…6 (ordem das caixas ✉, com o dia)',
      !!steps22 && steps22.length === 7 && steps22[0] === 'o começo (entra agora)' && /^Follow 1 · “.+” \(dia 0\)$/.test(steps22[1]) && /^Follow 4 · “.+” \(dia 5\)$/.test(steps22[4]) && /^Follow 6 · “.+” \(dia 10\)$/.test(steps22[6]), JSON.stringify(steps22));
    await q(`const s = sh.querySelector('.ftab .fl-add-step'); s.value = 's4'; s.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); return true;`);
    const opts22 = await q(`const f = sh.querySelector('.ftab'); const lv = f.querySelector('.fl-add-leave'); return { modes: [...f.querySelectorAll('.fl-add-mode input')].map((r) => [r.value, r.checked, r.parentElement.textContent.trim()]),
      leave: lv ? lv.checked : null, leaveTxt: lv ? lv.parentElement.textContent : '', intro: [...f.querySelectorAll('.crm-intro')].map((x) => x.textContent).join(' | ') };`);
    check('Follow 4: "como se tivesse entrado há 5 dias", "Enviar esta etapa agora" (padrão) / "No horário marcado" e "Tirar das outras réguas?" marcado',
      JSON.stringify(opts22.modes) === JSON.stringify([['agora', true, 'Enviar esta etapa agora'], ['marcado', false, 'No horário marcado']]) && opts22.leave === true && /Tirar das outras réguas\?/.test(opts22.leaveTxt) && /como se tivesse entrado há 5 dias/.test(opts22.intro), JSON.stringify(opts22));
    await shot('adicionar-follow-4.png');
    const t22 = Date.now();
    await q(`sh.querySelector('.ftab .fl-add-go').click(); return true;`);
    await waitFor(`return /Conversa adicionada a "Régua 6 follows" no Follow 4/.test((sh.querySelector('.ftab .ed-msg') || {}).textContent || '');`, 15000);
    const msg22 = await q(`return (sh.querySelector('.ftab .ed-msg') || {}).textContent || '';`);
    const run22 = (fake.db.wa_sequence_runs || []).find((r) => r.automation_id === REG && r.chat_id === CH22);
    const other22 = (fake.db.wa_sequence_runs || []).find((r) => r.automation_id === OUT22 && r.chat_id === CH22);
    const ago22 = run22 ? (t22 - Date.parse(run22.created_at)) / 86400000 : null;
    check('entrou no Follow 4: percurso na caixa do Follow 4, entrada "de há 5 dias", 3 ❌ já tomados; a outra régua saiu; a mensagem diz o que aconteceu',
      !!run22 && run22.node === 's4' && run22.status === 'ativo' && Math.abs(ago22 - 5) < 0.01 && JSON.stringify((run22.branches || []).map((b) => b.node)) === '["w1","w2","w3"]' && /^manual@\d+$/.test(run22.entry_key)
      && !!other22 && other22.status === 'saiu' && other22.outcome === 'outra_regua' && /Saiu de 1 outra régua/.test(msg22), JSON.stringify({ run22, other22: other22 && [other22.status, other22.outcome], msg22 }));
    await pg(`window.__fakeBridge = null; return true;`);
    fake.on = false;
    fake.generic = false;
    check('nenhum erro no console nas réguas por dia desde a entrada', errors.length === 0, errors.slice(0, 8).join(' | '));
    if (results.some((x) => !x)) process.exitCode = 1;
    console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram (Chrome: ${chrome})`);
  } catch (e) {
    console.log(`FAIL ${e.message}`);
    if (stderr.length) console.log(stderr.join('').split('\n').slice(-5).join('\n'));
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    done();
  }
}
main();
