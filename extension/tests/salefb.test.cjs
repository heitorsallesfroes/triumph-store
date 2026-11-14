// Testes da 2.17.2 (compra para o Facebook logo depois de salvar a venda pelo 💰). node extension/tests/salefb.test.cjs
// - saleConversion: a venda já tem Compra REAL enviada ligada a ela (mesmo sale_id)? Teste e falha não contam; sem a
//   coluna sale_id: available false; só leitura
// - content.js: pergunta depois de "Venda registrada" (Enviar agora / Agora não), mesmo envio do 📈 com o valor da
//   venda e sale_id; não pergunta quando já tem; automático não envia por cima de outra compra recente; Mais → "Ao
//   salvar venda" (perguntar / enviar sempre / não perguntar)
// - 2.19.0: card grande (azul) no topo do painel; "Agora não"/fechar deixa lembrete (selo na aba Vendas, card volta na
//   conversa) até enviar ou "Não enviar esta venda"; enviada = confirmação verde. O envio em si não mudou.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function db(seed, { noSaleId = false } = {}) {
  const T = { sales: [], wa_conversion_events: [], ...seed };
  const writes = [];
  const filterOf = (k, v) => {
    if (v.startsWith('eq.')) { const x = v.slice(3); return (r) => String(r[k]) === x; }
    if (v === 'is.null') return (r) => r[k] == null;
    return () => true;
  };
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(String(url).replace('https://x.supabase.co/rest/v1/', ''));
    const method = String(init.method || 'GET').toUpperCase();
    const [table, qs] = p.split('?');
    const params = (qs || '').split('&').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; });
    const sel = (params.find(([k]) => k === 'select') || [])[1] || '';
    if (noSaleId && table === 'wa_conversion_events' && /sale_id/.test(sel)) return { ok: false, status: 400, headers: { get: () => null }, text: async () => JSON.stringify({ code: '42703', message: 'column wa_conversion_events.sale_id does not exist' }) };
    if (method !== 'GET') writes.push(table);
    const filters = params.filter(([k]) => !['select', 'order', 'limit', 'offset'].includes(k)).map(([k, v]) => filterOf(k, v));
    const lim = Number((params.find(([k]) => k === 'limit') || [])[1]) || Infinity;
    const rows = (T[table] || []).filter((r) => filters.every((f) => f(r))).slice(0, lim);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(rows) };
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, writes };
}
const SALE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ev = (o) => ({ event_id: `e${Math.random()}`, chat_id: '5521900000001@c.us', value: 734, status: 'enviado', test: false, created_at: '2026-11-11T12:00:00Z', sale_id: null, ...o });

test('saleConversion: só a Compra REAL enviada com o mesmo sale_id conta; só leitura', async () => {
  const { api, writes } = db({ wa_conversion_events: [ev({ sale_id: OTHER }), ev({ sale_id: SALE, test: true }), ev({ sale_id: SALE, status: 'falhou' })] });
  assert.deepStrictEqual(plain(await api.saleConversion({ saleId: SALE })), { available: true, exists: false });
  const b = db({ wa_conversion_events: [ev({ sale_id: SALE })] });
  const r = plain(await b.api.saleConversion({ saleId: SALE }));
  assert.deepStrictEqual([r.exists, r.value], [true, 734]);
  await assert.rejects(() => api.saleConversion({ saleId: 'x' }), /Venda inválida/);
  assert.deepStrictEqual(writes, [], 'nada gravado');
});

test('saleConversion sem a coluna sale_id: available false (o painel pergunta normalmente)', async () => {
  const { api } = db({}, { noSaleId: true });
  assert.deepStrictEqual(plain(await api.saleConversion({ saleId: SALE })), { available: false, exists: false });
});

test('painel: pergunta depois da venda, mesmo envio do 📈 ligado à venda, não pergunta quando já tem, configuração em Mais', () => {
  const c = src('content.js');
  assert.ok(c.includes('saleFbStart(f, vs.done, linkP); // 2.17.2'), 'depois de gravar a venda');
  assert.ok(c.includes("'Enviar esta venda para o Facebook?'") && c.includes('`Enviar agora (${money})`') && c.includes("'Agora não'"), 'card 2.19.0');
  assert.ok(c.includes("if (has && has.exists) { done.fb = { state: 'had', value }; saleFbRender(done); return; }"), 'já tem: não pergunta');
  assert.ok(c.includes("call('sendPurchaseEvent', { event: {") && c.includes("call('linkSaleToPurchase', { eventId, saleId: done.id, fillPhone: false })"), 'envio do 📈 + sale_id');
  assert.ok(c.includes('const lock = await phoneLock(f.chatId, phone);'), 'mesma trava do telefone do 📈');
  assert.ok(c.includes("if (mode === 'auto' && !done.fb.recent) { await saleFbSend(f, done); return; }"), 'automático não manda por cima de outra compra recente');
  assert.ok(c.includes("[['ask', 'Perguntar (padrão)'], ['auto', 'Enviar sempre automático'], ['off', 'Não perguntar']]"));
  assert.ok(c.includes("state: r.duplicate ? 'dup' : 'sent'") && c.includes("Não consegui enviar a compra: "), 'enviado / já enviado / erro');
  assert.ok(src('background.js').includes('saleConversion:'));
  assert.ok(/^2\.(1[89]|[2-9]\d)\.\d+$/.test(JSON.parse(src('manifest.json')).version), 'versão 2.18.0 ou depois');
});

test('2.19.0: card grande no topo, selo na aba Vendas, card volta na conversa, confirmação verde; envio igual', () => {
  const c = src('content.js');
  assert.ok(c.includes('if (fbBox) vtabEl.prepend(fbBox);') && c.includes('if (pendBox) vtabEl.prepend(pendBox);'), 'no topo (venda registrada e conversa reaberta)');
  assert.ok(/\.vd-fbc \{[^}]*background: #1877f2/.test(c) && /\.vd-fbc-v \{[^}]*font-size: 30px/.test(c), 'azul do Facebook, valor grande');
  assert.ok(c.includes("const SALE_FB_PEND_KEY = 'saleFbPending';") && c.includes('storageSet({ [SALE_FB_PEND_KEY]: saleFbPend })'), 'guardado neste computador');
  assert.ok(c.includes("'Agora não', () => saleFbLater(done)") && c.includes("'Não enviar esta venda', () => saleFbDismiss(done)"));
  assert.ok(c.includes("s = el('span', 'fb-pend')") && c.includes("não enviada${n === 1 ? '' : 's'}"), 'selo "1 compra não enviada"');
  assert.ok(c.includes('const p = chatId ? saleFbPendList().find((x) => x.chatId === chatId) : null;') && c.includes("call('saleConversion', { saleId: p.saleId })"), 'card volta na conversa (confere se já foi)');
  assert.ok(c.includes("'Compra enviada ao Facebook ✓'") && /\.vd-fb\.vd-fb-ok \{[^}]*#e8f7ee/.test(c), 'confirmação verde');
  assert.strictEqual(c.split("call('sendPurchaseEvent', { event: {").length - 1, 2, 'envio: o 📈 e o mesmo saleFbSend de antes (nenhum envio novo)');
});

// Fluxo do lembrete com o código do content.js (sem WhatsApp)
test('2.19.0: lembrete — perguntando guarda, "Agora não" mantém, enviado tira, falhou guarda, "Não enviar esta venda" tira', () => {
  const c = src('content.js');
  const start = c.indexOf("  const SALE_FB_PEND_KEY = 'saleFbPending';");
  const end = c.indexOf('  // Conversa aberta com compra não enviada');
  assert.ok(start > 0 && end > start);
  const stored = {};
  const ctx = vm.createContext({
    vs: { open: false, view: 'done', done: null, fbPend: null }, renders: 0,
    chrome: { storage: { local: { get: () => {} }, onChanged: { addListener: () => {} } } },
    storageSet: (o) => Object.assign(stored, JSON.parse(JSON.stringify(o))),
    shadow: { querySelector: () => null }, pmenuEl: { contains: () => false }, el: () => ({}),
    renderVendas: () => { ctx.renders++; },
  });
  vm.runInContext(`${c.slice(start, end)}\nthis.api = { saleFbRender, saleFbLater, saleFbDismiss };`, ctx);
  const { api } = ctx;
  const done = { id: SALE, f: { chatId: '5521900000001@c.us', customer_name: 'Maria', customer_phone: '21900000001' }, fb: { state: 'ask', value: 734 } };
  ctx.vs.done = done;
  api.saleFbRender(done);
  assert.deepStrictEqual(Object.keys(stored.saleFbPending), [SALE], 'perguntando = lembrete');
  assert.deepStrictEqual([stored.saleFbPending[SALE].value, stored.saleFbPending[SALE].chatId], [734, '5521900000001@c.us']);
  api.saleFbLater(done);
  assert.ok(done.fb.later && stored.saleFbPending[SALE], 'Agora não: continua');
  done.fb = { ...done.fb, state: 'sent', n: 1 };
  api.saleFbRender(done);
  assert.deepStrictEqual(Object.keys(stored.saleFbPending), [], 'enviado: some');
  const d2 = { id: OTHER, f: done.f, fb: { state: 'error', value: 100, msg: 'x' } };
  api.saleFbRender(d2);
  assert.deepStrictEqual(Object.keys(stored.saleFbPending), [OTHER], 'falhou: lembrete');
  api.saleFbDismiss(d2);
  assert.deepStrictEqual([Object.keys(stored.saleFbPending), d2.fb], [[], null], 'Não enviar esta venda: some');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.message ? e.message : e}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
