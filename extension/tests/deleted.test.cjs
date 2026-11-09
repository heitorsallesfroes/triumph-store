// Testes da 2.15.0 (ver mensagens apagadas e editadas): node extension/tests/deleted.test.cjs
// deleted-store.js roda de verdade (armazenamento em memória no lugar do IndexedDB); a ponte roda num vm com uma
// WA-JS falsa que dispara chat.new_message, chat.msg_revoke e chat.msg_edited. O painel está no Chrome real (seção 20).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const plain = (x) => JSON.parse(JSON.stringify(x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadStore() {
  const win = {};
  win.window = win;
  vm.runInContext(src('deleted-store.js'), vm.createContext({ window: win, console, Date, Math, Promise, setTimeout }), { filename: 'deleted-store.js' });
  return win.TspDeleted;
}
const D = loadStore();
const wid = (s) => ({ _serialized: s, toString: () => s });
const CH = '5521911112222@c.us';
const msg = (o = {}) => ({ id: { fromMe: false, _serialized: `false_${CH}_${o.key || 'A1'}`, remote: wid(o.chat || CH), id: o.key || 'A1' }, from: wid(o.chat || CH), type: 'chat', body: 'oi, quero o tênis 42', t: 1762700000, ...o });

test('só guarda mensagem RECEBIDA de conversa individual (nunca as minhas, nunca grupo/status, nunca aviso do sistema)', () => {
  assert.ok(D.recordOf(msg()));
  assert.strictEqual(D.recordOf(msg({ id: { fromMe: true, _serialized: `true_${CH}_X`, remote: wid(CH) } })), null);
  assert.strictEqual(D.recordOf(msg({ chat: '120363000000000000@g.us' })), null);
  assert.strictEqual(D.recordOf(msg({ chat: 'status@broadcast' })), null);
  assert.strictEqual(D.recordOf(msg({ type: 'protocol' })), null);
  assert.strictEqual(D.recordOf(msg({ type: 'e2e_notification' })), null);
  assert.ok(D.recordOf(msg({ chat: '123456789@lid', id: { fromMe: false, _serialized: 'false_123456789@lid_B', remote: wid('123456789@lid') } })));
});
test('mídia: miniatura sempre; o arquivo só até 5 MB', () => {
  const img = D.recordOf(msg({ type: 'image', body: '/9j/4AAQSkZJRgABAQ', caption: 'olha esse', size: 300000, mimetype: 'image/jpeg' }));
  assert.strictEqual(img.thumb, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ');
  assert.strictEqual(img.caption, 'olha esse');
  assert.strictEqual(img.body, ''); // a miniatura não vira "texto"
  assert.strictEqual(D.wantsMedia(img), true);
  assert.strictEqual(D.wantsMedia(D.recordOf(msg({ type: 'video', size: 5 * 1024 * 1024 + 1 }))), false);
  assert.strictEqual(D.wantsMedia(D.recordOf(msg({ type: 'ptt', size: 20000, mimetype: 'audio/ogg; codecs=opus' }))), true);
  assert.strictEqual(D.wantsMedia(D.recordOf(msg())), false);
});
test('apagada: marca a cópia e lista só as apagadas/editadas da conversa; o original continua', async () => {
  let now = Date.UTC(2026, 10, 9, 12);
  const s = D.createStore(D.memoryBackend(), { now: () => now });
  await s.save(D.recordOf(msg(), now));
  await s.save(D.recordOf(msg({ key: 'A2', body: 'outra' }), now));
  assert.deepStrictEqual(plain(await s.changedInChat(CH)), []);
  const m = await s.markRevoked(`false_${CH}_A1`);
  assert.ok(m && m.revokedAt);
  assert.strictEqual(await s.markRevoked(`false_${CH}_NAO_EXISTE`), null); // sem cópia: não faz nada
  const list = await s.changedInChat(CH);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].preview, 'oi, quero o tênis 42');
  assert.strictEqual((await s.get(`false_${CH}_A1`)).body, 'oi, quero o tênis 42');
});
test('editada: guarda o texto novo e mantém o ORIGINAL, mesmo se a mensagem chegar de novo já editada', async () => {
  const s = D.createStore(D.memoryBackend());
  await s.save(D.recordOf(msg()));
  const m = await s.markEdited(`false_${CH}_A1`, 'oi, quero o tênis 43');
  assert.strictEqual(m.edits, 1);
  await s.save(D.recordOf(msg({ body: 'oi, quero o tênis 43' })));
  const r = await s.get(`false_${CH}_A1`);
  assert.strictEqual(r.body, 'oi, quero o tênis 42');
  assert.deepStrictEqual(plain(r.edits.map((e) => e.body)), ['oi, quero o tênis 43']);
  assert.strictEqual((await s.markEdited(`false_${CH}_A1`, 'oi, quero o tênis 43')).edits, 1); // repetido não duplica
});
test('limpeza: mais de 7 dias some; acima de 200 MB apaga as mais antigas primeiro; "Apagar tudo agora"', async () => {
  let now = Date.UTC(2026, 10, 1);
  const b = D.memoryBackend();
  const s = D.createStore(b, { now: () => now });
  await s.save(D.recordOf(msg({ key: 'VELHA' }), now));
  now += 8 * 86400000;
  await s.save(D.recordOf(msg({ key: 'NOVA' }), now));
  await s.prune(true);
  assert.deepStrictEqual(plain((await b.all()).map((r) => r.id)), [`false_${CH}_NOVA`]);
  // 200 MB: 3 arquivos "grandes" (o tamanho conta pelo .size)
  const big = (k, t) => ({ ...D.recordOf(msg({ key: k }), t), media: { size: 90 * 1024 * 1024 } });
  await b.put(big('B1', now - 3000));
  await b.put(big('B2', now - 2000));
  await b.put(big('B3', now - 1000));
  const res = await s.prune(true);
  const left = (await b.all()).map((r) => r.id.split('_').pop()).sort();
  assert.deepStrictEqual(plain(left), ['B2', 'B3', 'NOVA']);
  assert.ok(res.bytes <= D.LIMITS.maxBytes);
  await s.clear();
  assert.deepStrictEqual(plain(await b.all()), []);
});
test('arquivo acima de 5 MB nunca é anexado', async () => {
  const s = D.createStore(D.memoryBackend());
  await s.save(D.recordOf(msg({ type: 'video', size: 100 })));
  assert.strictEqual(await s.attachMedia(`false_${CH}_A1`, { size: 6 * 1024 * 1024 }), false);
  assert.strictEqual(await s.attachMedia(`false_${CH}_A1`, { size: 100 }), true);
});

// ── a ponte de verdade, com WA-JS falsa e eventos ──
function bridge({ noEvents = false, failDownload = false } = {}) {
  const handlers = {};
  const WPP = {
    isReady: true,
    chat: { list: async () => [], get: () => null, getActiveChat: () => null,
      downloadMedia: async () => { if (failDownload) throw new Error('x'); return new FakeBlob(1234, 'audio/ogg'); } },
    contact: {},
    on: noEvents ? undefined : (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
  };
  class FakeBlob { constructor(size, type) { this.size = size; this.type = type; } async arrayBuffer() { return new ArrayBuffer(this.size); } }
  const listeners = [];
  const replies = new Map();
  const win = {
    WPP, __tspWaBefore: { wpp: null, config: null }, location: { origin: 'https://web.whatsapp.com' },
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    postMessage: (m) => { if (m && m.source === 'tsp-wajs-bridge') { const r = replies.get(m.id); if (r) r(m); } },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, console, setTimeout, clearTimeout, Promise, Blob: FakeBlob, ArrayBuffer, queueMicrotask, Date, Math });
  vm.runInContext(src('deleted-store.js'), ctx, { filename: 'deleted-store.js' });
  win.TspDeleted = win.TspDeleted && { ...win.TspDeleted, idbBackend: () => win.TspDeleted.memoryBackend() }; // sem IndexedDB no Node
  vm.runInContext(src('wa-bridge.js'), ctx, { filename: 'wa-bridge.js' });
  let seq = 0;
  const ask = (type, payload) => new Promise((resolve) => {
    const id = `d${++seq}`;
    replies.set(id, resolve);
    listeners.forEach((fn) => fn({ source: win, data: { source: 'tsp-wajs-content', id, type, payload } }));
  });
  const emit = (ev, data) => (handlers[ev] || []).forEach((fn) => fn(data));
  return { ask, emit };
}

test('ponte: guarda ao receber, marca ao apagar (msg_revoke) e ao editar (msg_edited); o painel lê a lista e o original', async () => {
  const b = bridge();
  b.emit('chat.new_message', msg());
  b.emit('chat.new_message', msg({ key: 'P1', type: 'ptt', size: 20000, mimetype: 'audio/ogg; codecs=opus', body: '' }));
  b.emit('chat.new_message', msg({ key: 'MINHA', id: { fromMe: true, _serialized: `true_${CH}_MINHA`, remote: wid(CH) } }));
  await sleep(1700); // o arquivo do áudio é baixado logo depois
  b.emit('chat.msg_revoke', { from: wid(CH), id: wid(`false_${CH}_REV`), refId: wid(`false_${CH}_P1`), type: 'revoke' });
  b.emit('chat.msg_revoke', { from: wid(CH), id: wid(`false_${CH}_REV2`), refId: wid(`true_${CH}_MINHA`), type: 'revoke' }); // a minha: nada
  b.emit('chat.msg_edited', { chat: wid(CH), id: `false_${CH}_A1`, msg: { body: 'oi, quero o tênis 43', id: wid(`false_${CH}_A1`) } });
  await sleep(100);
  const ch = await b.ask('deletedChanges', {});
  assert.strictEqual(ch.ok, true);
  assert.deepStrictEqual(plain(ch.data.map((x) => [x.id.split('_').pop(), x.change]).sort()), [['A1', 'editada'], ['P1', 'apagada']]);
  const list = await b.ask('deletedList', { chatId: CH });
  assert.deepStrictEqual(plain(list.data.items.map((x) => x.id.split('_').pop()).sort()), ['A1', 'P1']);
  const a = await b.ask('deletedGet', { id: `false_${CH}_P1` });
  assert.strictEqual(a.data.kind, 'audio');
  assert.strictEqual(a.data.media.byteLength, 1234);
  assert.strictEqual(a.data.mime, 'audio/ogg');
  const e = await b.ask('deletedGet', { id: `false_${CH}_A1` });
  assert.strictEqual(e.data.body, 'oi, quero o tênis 42');
  assert.deepStrictEqual(plain(e.data.edits.map((x) => x.body)), ['oi, quero o tênis 43']);
  assert.strictEqual((await b.ask('deletedGet', { id: `true_${CH}_MINHA` })).ok, false);
});
test('ponte: desligado não guarda; "Apagar tudo agora" apaga; grupo nunca', async () => {
  const b = bridge();
  await b.ask('deletedConfig', { on: false });
  b.emit('chat.new_message', msg({ key: 'OFF' }));
  await sleep(50);
  b.emit('chat.msg_revoke', { from: wid(CH), refId: wid(`false_${CH}_OFF`), type: 'revoke' });
  await sleep(50);
  assert.deepStrictEqual(plain((await b.ask('deletedList', { chatId: CH })).data.items), []);
  await b.ask('deletedConfig', { on: true });
  b.emit('chat.new_message', msg({ key: 'G', chat: '120363@g.us', id: { fromMe: false, _serialized: 'false_120363@g.us_G', remote: wid('120363@g.us') } }));
  b.emit('chat.new_message', msg({ key: 'ON' }));
  await sleep(50);
  b.emit('chat.msg_revoke', { from: wid(CH), refId: wid(`false_${CH}_ON`), type: 'revoke' });
  b.emit('chat.msg_revoke', { from: wid('120363@g.us'), refId: wid('false_120363@g.us_G'), type: 'admin_revoke' });
  await sleep(50);
  assert.strictEqual((await b.ask('deletedList', { chatId: CH })).data.items.length, 1);
  assert.strictEqual((await b.ask('deletedClear', {})).ok, true);
  assert.deepStrictEqual(plain((await b.ask('deletedList', { chatId: CH })).data.items), []);
});
test('ponte: sem os eventos (ou com falha), nada quebra e nada é guardado', async () => {
  const b = bridge({ noEvents: true });
  const st = await b.ask('deletedList', { chatId: CH });
  assert.strictEqual(st.ok, true);
  assert.deepStrictEqual(plain(st.data.items), []);
  const b2 = bridge({ failDownload: true });
  b2.emit('chat.new_message', msg({ key: 'V', type: 'video', size: 100 }));
  b2.emit('chat.msg_revoke', null); // evento estranho: ignora
  b2.emit('chat.msg_edited', { id: 123 });
  await sleep(1700);
  b2.emit('chat.msg_revoke', { from: wid(CH), refId: wid(`false_${CH}_V`), type: 'revoke' });
  await sleep(50);
  const g = await b2.ask('deletedGet', { id: `false_${CH}_V` });
  assert.strictEqual(g.ok, true);
  assert.strictEqual(g.data.media, null); // sem arquivo, mas a cópia (tipo, legenda) continua
});
test('nunca no Supabase: nenhuma tabela/chamada nova; manifest carrega deleted-store.js antes da ponte', () => {
  const api = src('supabase-api.js');
  assert.ok(!/TspDeleted|tsp-deleted|msg_revoke|msg_edited|deletedGet|deletedList/.test(api));
  const c = src('content.js');
  assert.ok(!/call\('[a-zA-Z]*[Dd]elet(ed|ad)/.test(c));
  const m = JSON.parse(src('manifest.json'));
  const main = m.content_scripts.find((x) => x.world === 'MAIN' && x.js.includes('wa-bridge.js')).js;
  assert.ok(main.indexOf('deleted-store.js') >= 0 && main.indexOf('deleted-store.js') < main.indexOf('wa-bridge.js'));
  const v = src('vendor/wppconnect-wa.js');
  assert.ok(v.includes('"chat.msg_revoke"') && v.includes('"chat.msg_edited"') && v.includes('t.downloadMedia=async function'));
});
test('Personalizar: "Guardar mensagens apagadas" ligado por padrão e "Apagar tudo agora"', () => {
  const E = (() => { const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout }); vm.runInContext(src('engine.js'), ctx); return ctx.TspEngine || ctx.globalThis?.TspEngine; })();
  const P = E && E.panelPrefs ? E.panelPrefs : E;
  const d = P.defaultPanelPrefs();
  assert.strictEqual(d.keepDeleted, true);
  assert.strictEqual(P.normPanelPrefs({ keepDeleted: false }).keepDeleted, false);
  assert.strictEqual(P.normPanelPrefs({ keepDeleted: 'x' }).keepDeleted, true);
  const c = src('content.js');
  assert.ok(c.includes("czCheck('Guardar mensagens apagadas'"));
  assert.ok(c.includes("'Apagar tudo agora'"));
  assert.ok(c.includes("waRequest('deletedClear'"));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
  process.exit(); // os tempos-limite da ponte (até 60 s) não seguram o teste
})();
