// Testes da 2.14.4 (abrir qualquer conversa com um clique): node extension/tests/openconv.test.cjs
// A ponte (wa-bridge.js) roda de verdade num vm com uma WA-JS falsa; o painel é conferido no código e no Chrome real
// (seção 19 do chrome-real.test.cjs).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const c = src('content.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const body = (s, start) => { const i = s.indexOf(start); assert.ok(i >= 0, start); return s.slice(i, s.indexOf('\n  }\n', i)); };

// Ponte com WA-JS falsa: loaded = conversas carregadas; exists = números com WhatsApp; lidPn = @lid → telefone
function bridge({ loaded = [], exists = {}, lidPn = {}, failOpen = [] } = {}) {
  const opened = [];
  const queried = [];
  const listeners = [];
  const wid = (id) => ({ _serialized: id, toString: () => id });
  const WPP = {
    isReady: true,
    chat: {
      list: async () => loaded.map((id) => ({ id: wid(id) })),
      openChatBottom: async (id) => { if (failOpen.includes(id)) throw new Error('x'); opened.push(id); return true; },
    },
    contact: {
      queryExists: async (id) => { queried.push(id); return exists[id] || null; },
      getPnLidEntry: async (id) => (lidPn[id] ? { phoneNumber: { id: lidPn[id] } } : {}),
    },
    on: () => {},
  };
  const replies = new Map();
  const win = {
    WPP, __tspWaBefore: { wpp: null, config: null }, location: { origin: 'https://web.whatsapp.com' },
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    postMessage: (msg) => { if (msg && msg.source === 'tsp-wajs-bridge') { const r = replies.get(msg.id); if (r) r(msg); } },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, console, setTimeout, clearTimeout, Promise, Blob: class {}, ArrayBuffer, queueMicrotask });
  vm.runInContext(src('wa-bridge.js'), ctx, { filename: 'wa-bridge.js' });
  let seq = 0;
  const ask = (type, payload) => new Promise((resolve) => {
    const id = `t${++seq}`;
    replies.set(id, resolve);
    listeners.forEach((fn) => fn({ source: win, data: { source: 'tsp-wajs-content', id, type, payload } }));
  });
  return { ask, opened, queried };
}

test('ponte: conversa carregada (inclusive arquivada) abre direto pelo id, sem consultar o número', async () => {
  const b = bridge({ loaded: ['5521911112222@c.us'] });
  const r = await b.ask('openChat', { chatId: '5521911112222@c.us' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.data)), { opened: true, via: 'carregada' });
  assert.deepStrictEqual(b.opened, ['5521911112222@c.us']);
  assert.deepStrictEqual(b.queried, []);
});
test('ponte: NÃO carregada abre pelo telefone, só depois de contact.queryExists confirmar que tem WhatsApp', async () => {
  const b = bridge({ exists: { '5521933334444@c.us': { wid: { _serialized: '5521933334444@c.us' } } } });
  const r = await b.ask('openChat', { chatId: '5521933334444@c.us' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.via, 'telefone');
  assert.deepStrictEqual(b.queried, ['5521933334444@c.us']);
  assert.deepStrictEqual(b.opened, ['5521933334444@c.us']);
  const r2 = await bridge({ exists: { '5521933334444@c.us': { wid: '5521933334444@c.us' } } }).ask('openChat', { phone: '5521933334444' });
  assert.strictEqual(r2.ok, true);
});
test('ponte: número sem WhatsApp nunca abre conversa vazia (open_failed, openChatBottom não é chamado)', async () => {
  const b = bridge();
  const r = await b.ask('openChat', { phone: '5521900000000' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, 'open_failed');
  assert.deepStrictEqual(b.opened, []);
});
test('ponte: @lid não carregado abre pelo id; se o id falhar, pelo telefone do @lid (getPnLidEntry)', async () => {
  const b = bridge();
  const r = await b.ask('openChat', { chatId: '123456789012345@lid' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.via, 'id');
  assert.deepStrictEqual(b.opened, ['123456789012345@lid']);
  const b2 = bridge({ failOpen: ['123456789012345@lid'], lidPn: { '123456789012345@lid': '5521955556666' }, exists: { '5521955556666@c.us': { wid: '5521955556666@c.us' } } });
  const r2 = await b2.ask('openChat', { chatId: '123456789012345@lid' });
  assert.strictEqual(r2.ok, true);
  assert.deepStrictEqual(b2.opened, ['5521955556666@c.us']);
});
test('ponte: telefone cuja conversa carregada é @lid abre essa conversa (não cria outra)', async () => {
  const b = bridge({ loaded: ['999@lid'], exists: { '5521977778888@c.us': { wid: '5521977778888@c.us', lid: { _serialized: '999@lid' } } } });
  const r = await b.ask('openChat', { phone: '5521977778888' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(b.opened, ['999@lid']);
});
test('ponte: grupo ou id inválido = invalid_chat (nunca abre grupo)', async () => {
  const b = bridge({ loaded: ['1203630@g.us'] });
  const r = await b.ask('openChat', { chatId: '1203630@g.us' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, 'invalid_chat');
  assert.deepStrictEqual(b.opened, []);
});

test('painel: uma função só (openConversation) pede openChat; aviso com número e "Copiar número" só se tudo falhar', () => {
  assert.strictEqual((c.match(/function openConversation\(/g) || []).length, 1);
  assert.strictEqual((c.match(/waRequest\('openChat'/g) || []).length, 1);
  const f = body(c, '  async function openConversation(');
  assert.match(f, /waRequest\('openChat', \{ chatId, phone \}/);
  assert.match(f, /label: 'Copiar número'/);
  assert.match(f, /copyToClipboard\(phone\)/);
  assert.ok(!c.includes('Conversa não carregada no WhatsApp Web. Procure pelo nome'));
  assert.ok(!c.includes('Essa conversa não está carregada no WhatsApp Web.'));
});
test('painel: nome/número clicável (mão + "Abrir conversa") no Quadro, Agendados, Disparos, automações, Resultados e vendas', () => {
  const l = body(c, '  function convLink(');
  assert.match(l, /classList\.add\('conv-link'\)/);
  assert.match(l, /node\.title = 'Abrir conversa'/);
  assert.match(l, /e\.stopPropagation\(\)/); // não dispara o clique do cartão
  assert.match(c, /\.conv-link \{ cursor: pointer; \}/);
  const card = body(c, '  function boardCard(');
  assert.strictEqual((card.match(/convLink\(/g) || []).length, 3); // nome (CRM e WhatsApp) e número (CRM)
  assert.match(card, /toggleMoveMenu\(card, c\.id, label\.id\)/); // "Mover para…" continua só movendo
  assert.match(body(c, '  async function openBoardChat('), /openConversation\(/);
  assert.match(body(c, '  async function openCrmCard('), /openConversation\(/);
  assert.match(body(c, '  function renderClients('), /openConversation\(\{ phone: c\.phone/);
  assert.match(c, /convLink\(el\('div', 'sc-who', row\.chat_name \|\| 'Conversa'\), \{ chatId: row\.chat_id/); // Agendados
  assert.match(c, /convLink\(el\('div', 'sc-who', r\.name \|\| 'Contato'\), \{ chatId: r\.chat_id, phone: r\.phone, name: r\.name \}\), el\('div', 'sc-prev', r\.send/); // prévia do disparo
  assert.match(c, /convLink\(el\('div', 'sc-who', t\.name \|\| 'Contato'\), \{ chatId: t\.chat_id/); // alvos do disparo
  assert.match(c, /convLink\(el\('div', 'sc-who', `\$\{r\.contact\.name/); // Simular automações
  assert.match(c, /convLink\(el\('div', 'sc-who', r\.name \|\| 'Contato'\), \{ chatId: r\.chat_id, phone: r\.phone, name: r\.name \}\), el\('div', 'sc-prev', `\$\{SOURCE_LABEL/); // histórico
  assert.match(c, /convLink\(el\('div', 'sc-who', `\$\{h\.contact_name/); // Resultados (📈)
  assert.match(c, /fbtn\('sc-item vd-sale conv-link', '', \(\) => openConversation\(/); // vendas
  const api = src('supabase-api.js');
  assert.match(api, /wa_campaign_targets\?select=id,chat_id,name,status,reason,sent_at/);
  assert.match(body(api, '  async function fetchSendLog('), /chat_id: r\.chat_id \|\| null, phone:/);
});
test('a WA-JS empacotada (4.7.2) tem as funções usadas (sem mexer no arquivo)', () => {
  const v = src('vendor/wppconnect-wa.js');
  assert.ok(v.includes('t.openChatBottom=async function'));
  assert.ok(v.includes('findOrCreateLatestChat'));
  assert.ok(v.includes('t.getPnLidEntry=async function'));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
