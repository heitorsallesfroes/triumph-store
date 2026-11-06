// "O painel abre no Chrome real" (padrão para toda versão, desde a 2.10.2): node extension/tests/chrome-real.test.cjs
//
// Abre o Google Chrome instalado (sem Playwright e sem npm install: só o protocolo DevTools do próprio Chrome),
// carrega a extensão desta pasta (Extensions.loadUnpacked; o Chrome 137+ não aceita mais --load-extension),
// serve uma página https://web.whatsapp.com SIMULADA (Fetch.fulfillRequest) e confere:
//   1. o painel aparece (#tsp-wa-host com o painel dentro do shadow DOM);
//   2. nenhum erro no console da página (inclusive dos content scripts) nem exceção.
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
// conversas (#pane-side, 40 linhas de 72 px) que se comporta como a do WhatsApp: clicar abre a conversa; enviar
// (Enter ou botão Enviar) leva a conversa para o topo e, 120 ms depois, a lista PULA para o topo;
// __fakeIncoming() faz o mesmo para mensagem de cliente. A WA-JS não acha o WhatsApp e fica esperando.
const ROWS = Array.from({ length: 40 }, (_, i) => `<div role="listitem" data-name="Cliente ${i + 1}" style="height:72px;border-bottom:1px solid #eee;display:flex;align-items:center"><div role="gridcell" tabindex="-1" aria-selected="${i === 0}" style="padding:0 16px;width:100%">Cliente ${i + 1}</div></div>`).join('');
const FAKE_WA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>WhatsApp</title>
<style>html,body{margin:0;height:100%;font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#efeae2}
#app{height:100%;display:flex}.side{width:30%;min-width:260px;background:#fff;border-right:1px solid #d1d7db;display:flex;flex-direction:column}
#pane-side{flex:1;overflow-y:auto}[aria-selected="true"]{background:#f0f2f5;font-weight:600}
.chat{flex:1;display:flex;flex-direction:column}.hdr{height:59px;flex:none;background:#f0f2f5;display:flex;align-items:center;padding:0 16px;font-weight:600}
.msgs{flex:1}.foot{height:62px;background:#f0f2f5;display:flex;align-items:center}</style></head>
<body><div id="app"><div class="side" id="side"><div class="hdr">Conversas</div><div id="pane-side"><div role="grid">${ROWS}</div></div></div>
<div class="chat" id="main"><header class="hdr"><span dir="auto" title="Cliente 1">Cliente 1</span></header><div class="msgs"></div>
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
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, TIMEOUT_MS + 30000);
  try {
    const ext = await c.send('Extensions.loadUnpacked', { path: EXT_DIR });
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
