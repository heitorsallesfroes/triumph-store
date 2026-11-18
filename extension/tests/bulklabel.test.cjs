// Testes da 2.21.0 (Mais › Manutenção › Etiquetar em massa). node extension/tests/bulklabel.test.cjs
// Regra: conversa individual (não a sua nem "Meu Numero Pessoal") cuja 1ª mensagem foi do CLIENTE desde 18/07/2026;
// você respondeu pelo menos uma vez e, depois da sua 1ª resposta, o cliente não mandou mais nada (reação não conta).
// Fora: etiqueta "Cliente" do WhatsApp, quem tem venda no ERP (DDD + 8 últimos) e quem já tem "Enviar Black Friday".
// Histórico que não chega ao começo (nem a antes de 18/07) ou sem telefone para conferir a venda: fica de fora e conta
// como "não deu para confirmar".
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const ectx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const S = (iso) => Math.floor(Date.parse(`${iso}-03:00`) / 1000);
const SINCE = S('2026-07-18T00:00:00');
const CLI = ['11']; // id da etiqueta "Cliente ⌚️"
const BF = ['22']; // id da etiqueta "Enviar Black Friday"
const SALES = new Set(['21988776655'].map(E.bulkPhoneKey)); // 5521988776655 (DDD 21 + 88776655)
const base = (over = {}) => ({
  chatId: '123456789012345@lid', name: 'Ana', complete: true, since: SINCE, labelIds: [], clienteIds: CLI, targetIds: BF,
  phone: '5521977001122', salePhones: SALES,
  msgs: [{ fromMe: false, t: S('2026-08-03T10:00:00') }, { fromMe: true, t: S('2026-08-03T10:05:00') }, { fromMe: true, t: S('2026-08-04T09:00:00') }],
  ...over,
});
const why = (over) => E.bulkDecision(base(over)).reason;

test('entra: o cliente chamou em 03/08, você respondeu (2 vezes) e ele não mandou mais nada', () => {
  const d = plain(E.bulkDecision(base()));
  assert.deepStrictEqual([d.ok, d.reason, d.firstAt, d.firstReplyAt, d.lastMineAt], [true, null, S('2026-08-03T10:00:00'), S('2026-08-03T10:05:00'), S('2026-08-04T09:00:00')]);
});

test('o cliente mandou mais alguma coisa depois da sua 1ª resposta → fora (mesmo que você tenha respondido de novo)', () => {
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: S('2026-08-03T10:00:00') }, { fromMe: true, t: S('2026-08-03T10:05:00') }, { fromMe: false, t: S('2026-08-03T10:06:00') }, { fromMe: true, t: S('2026-08-03T10:07:00') }] }), 'respondeu_depois');
});

test('várias mensagens do cliente ANTES da sua 1ª resposta → entra', () => {
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: S('2026-09-01T08:00:00') }, { fromMe: false, t: S('2026-09-01T08:01:00') }, { fromMe: true, t: S('2026-09-01T09:00:00') }] }), null);
});

test('mesma hora (segundo): vale a ordem do WhatsApp', () => {
  const t = S('2026-09-01T09:00:00');
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: t - 60 }, { fromMe: true, t }, { fromMe: false, t }] }), 'respondeu_depois');
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: t - 60 }, { fromMe: false, t }, { fromMe: true, t }] }), null);
});

test('a conversa começou por você → fora; você nunca respondeu → fora; sem mensagens → fora', () => {
  assert.strictEqual(why({ msgs: [{ fromMe: true, t: S('2026-08-01T10:00:00') }, { fromMe: false, t: S('2026-08-01T11:00:00') }] }), 'comecou_por_mim');
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: S('2026-08-01T10:00:00') }, { fromMe: false, t: S('2026-08-02T10:00:00') }] }), 'nao_respondi');
  assert.strictEqual(why({ msgs: [] }), 'sem_mensagens');
});

test('1º contato antes de 18/07 → fora (mesmo sem o histórico completo: já há mensagem antes)', () => {
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: S('2026-07-17T23:59:00') }, { fromMe: true, t: S('2026-07-18T08:00:00') }] }), 'antes');
  assert.strictEqual(why({ complete: false, msgs: [{ fromMe: false, t: S('2026-06-01T10:00:00') }, { fromMe: true, t: S('2026-08-01T10:00:00') }] }), 'antes');
  assert.strictEqual(why({ msgs: [{ fromMe: false, t: SINCE }, { fromMe: true, t: SINCE + 60 }] }), null, '18/07 00:00 já vale');
});

test('histórico não carregou até o começo → fora e "não deu para confirmar"', () => {
  assert.strictEqual(why({ complete: false }), 'sem_historico');
  assert.ok(E.BULK_UNCONFIRMED.includes('sem_historico'));
});

test('saudação automática do WhatsApp Business (no mesmo segundo, antes ou depois) não é sua resposta nem o começo', () => {
  const t = S('2026-11-18T09:00:00');
  // 18/11 real: a saudação veio no MESMO segundo, ANTES da mensagem do cliente
  assert.strictEqual(why({ msgs: [{ fromMe: true, t, auto: true }, { fromMe: false, t }] }), 'nao_respondi');
  assert.strictEqual(why({ msgs: [{ fromMe: true, t, auto: true }, { fromMe: false, t }, { fromMe: true, t: t + 600 }] }), null);
  // só a saudação respondeu e o cliente mandou mais: continua "você não respondeu"
  assert.strictEqual(why({ msgs: [{ fromMe: false, t }, { fromMe: true, t, auto: true }, { fromMe: false, t: t + 60 }] }), 'nao_respondi');
});

test('parte do histórico ficou só no celular (endOfHistoryTransferType 0/2) → fora e "não deu para confirmar"', () => {
  assert.strictEqual(why({ moreOnPhone: true, complete: false }), 'historico_no_celular');
  assert.ok(E.BULK_UNCONFIRMED.includes('historico_no_celular'));
  // mas se já há mensagem antes de 18/07, está fora de qualquer jeito
  assert.strictEqual(why({ moreOnPhone: true, complete: false, msgs: [{ fromMe: false, t: SINCE - 10 }] }), 'antes');
});

test('etiqueta "Cliente", já tem "Enviar Black Friday", venda no ERP → fora', () => {
  assert.strictEqual(why({ labelIds: ['11'] }), 'cliente');
  assert.strictEqual(why({ labelIds: ['22', '11'] }), 'ja_tem');
  assert.strictEqual(why({ phone: '5521988776655' }), 'venda', 'venda com 21 98877-6655');
  assert.strictEqual(why({ phone: '552188776655' }), 'venda', 'sem o 9 também');
});

test('sem telefone para conferir a venda → fora e "não deu para confirmar"', () => {
  assert.strictEqual(why({ phone: null }), 'sem_telefone');
  assert.ok(E.BULK_UNCONFIRMED.includes('sem_telefone'));
});

test('só conversa individual; nem a sua nem "Meu Numero Pessoal"', () => {
  assert.strictEqual(why({ chatId: '120363000000000000@g.us' }), 'nao_individual');
  assert.strictEqual(why({ chatId: 'status@broadcast' }), 'nao_individual');
  assert.strictEqual(why({ chatId: '120363000000000000@newsletter' }), 'nao_individual');
  assert.strictEqual(why({ isMe: true }), 'minha_conversa');
  assert.strictEqual(why({ name: 'Meu Número Pessoal' }), 'minha_conversa');
});

test('telefone: DDD + 8 últimos (com/sem 55, com/sem 9, com máscara); curto demais → nada', () => {
  assert.deepStrictEqual(['5521988776655', '552188776655', '(21) 98877-6655', '21988776655', '2188776655'].map(E.bulkPhoneKey), Array(5).fill('2188776655'));
  assert.strictEqual(E.bulkPhoneKey('98877-6655'), null);
  assert.strictEqual(E.bulkPhoneKey(''), null);
});

test('nome da etiqueta: sem acento, emoji e maiúsculas ("Cliente ⌚️" é a "Cliente"; "Clientes VIP" não)', () => {
  const labels = [{ id: 1, name: 'Cliente ⌚️' }, { id: 2, name: 'Clientes VIP' }, { id: 3, name: 'enviar black friday' }, { id: 4, name: 'Embalar 🎁' }];
  assert.deepStrictEqual(plain(E.bulkLabelIds(labels, 'Cliente')), ['1']);
  assert.deepStrictEqual(plain(E.bulkLabelIds(labels, 'Enviar Black Friday')), ['3']);
});

test('logo antes de aplicar: o cliente respondeu depois da simulação, ou ganhou "Cliente"/a etiqueta → pula', () => {
  const firstReplyAt = S('2026-08-03T10:05:00');
  const msgs = [{ fromMe: true, t: firstReplyAt }];
  assert.strictEqual(E.bulkRecheck({ msgs, firstReplyAt, labelIds: [], clienteIds: CLI, targetIds: BF }), null);
  assert.strictEqual(E.bulkRecheck({ msgs: [...msgs, { fromMe: false, t: S('2026-11-18T11:00:00') }], firstReplyAt, clienteIds: CLI, targetIds: BF }), 'respondeu_depois');
  assert.strictEqual(E.bulkRecheck({ msgs, firstReplyAt, labelIds: ['11'], clienteIds: CLI, targetIds: BF }), 'cliente');
  assert.strictEqual(E.bulkRecheck({ msgs, firstReplyAt, labelIds: ['22'], clienteIds: CLI, targetIds: BF }), 'ja_tem');
});

test('total por mês do 1º contato (horário de São Paulo) e resumo dos motivos', () => {
  const rows = [{ firstAt: S('2026-07-31T23:30:00') }, { firstAt: S('2026-08-01T00:10:00') }, { firstAt: S('2026-08-20T10:00:00') }, { firstAt: S('2026-11-02T10:00:00') }];
  assert.deepStrictEqual(plain(E.bulkByMonth(rows)), [{ month: '2026-07', n: 1 }, { month: '2026-08', n: 2 }, { month: '2026-11', n: 1 }]);
  const sum = plain(E.bulkSkipSummary([{ reason: 'cliente' }, { reason: 'sem_historico' }, { reason: 'cliente' }]));
  assert.deepStrictEqual(sum.map((s) => [s.reason, s.n, s.unconfirmed]), [['cliente', 2, false], ['sem_historico', 1, true]]);
});

// ── a ponte de verdade com WA-JS falsa ──
function bridge({ chats, history = {}, pages = {}, failLoad = false }) {
  const calls = [];
  const mk = (chat) => ({
    id: { _serialized: chat.id, server: chat.id.split('@')[1] }, t: chat.t, endOfHistoryTransferType: chat.eoh, isGroup: /@g\.us$/.test(chat.id), labels: chat.labels || [],
    formattedTitle: chat.name, contact: {},
    msgs: { getModelsArray: () => (history[chat.id] || []).slice(-(chat.loaded || 99)), msgLoadState: { noEarlierMsgs: !!chat.complete } },
  });
  const models = chats.map(mk);
  const WPP = {
    isReady: true,
    conn: { getMyUserId: () => ({ _serialized: '5521900000000@c.us', user: '5521900000000' }), getMyUserLid: () => ({ _serialized: '999@lid' }) },
    chat: {
      list: async () => models, get: (id) => models.find((m) => m.id._serialized === id) || null, getActiveChat: () => null,
      getMessages: async (id, opts) => { calls.push([id, opts]); if (failLoad) throw new Error('não carregou'); const p = pages[id] || []; return p.shift() || []; },
    },
    contact: { getPnLidEntry: async (id) => ({ phoneNumber: { id: id === '1@lid' ? '5521977001122' : '' } }) },
    labels: {},
    on: () => {},
  };
  const listeners = [];
  const replies = new Map();
  const win = {
    WPP, __tspWaBefore: { wpp: null, config: null }, location: { origin: 'https://web.whatsapp.com' },
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    postMessage: (m) => { if (m && m.source === 'tsp-wajs-bridge') { const r = replies.get(m.id); if (r) r(m); } },
  };
  win.window = win;
  class FakeBlob { constructor(size, type) { this.size = size; this.type = type; } }
  const ctx = vm.createContext({ window: win, console, setTimeout, clearTimeout, Promise, Blob: FakeBlob, ArrayBuffer, queueMicrotask, Date, Math, TypeError });
  vm.runInContext(src('wa-bridge.js'), ctx, { filename: 'wa-bridge.js' });
  let n = 0;
  const ask = (type, payload) => new Promise((resolve) => {
    const id = `b${++n}`;
    replies.set(id, resolve);
    listeners.forEach((fn) => fn({ source: win, data: { source: 'tsp-wajs-content', id, type, payload } }));
  });
  return { ask, calls };
}
const m = (key, fromMe, t, type = 'chat') => ({ id: { _serialized: `${fromMe}_${key}`, fromMe, id: key }, t, type, body: 'texto que nunca sai da ponte' });

test('ponte bulkChats: só individuais com atividade desde 18/07; marca a sua própria conversa', async () => {
  const b = bridge({ chats: [
    { id: '1@lid', t: S('2026-11-10T10:00:00'), name: 'Ana' },
    { id: '2@lid', t: S('2026-06-01T10:00:00'), name: 'Velha' },
    { id: '120363@g.us', t: S('2026-11-10T10:00:00'), name: 'Grupo' },
    { id: 'status@broadcast', t: S('2026-11-10T10:00:00'), name: 'Status' },
    { id: '5521900000000@c.us', t: S('2026-11-10T10:00:00'), name: 'Eu' },
  ] });
  const r = await b.ask('bulkChats', { since: SINCE });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.deepStrictEqual(plain(r.data.chats).map((c) => [c.chatId, c.isMe]), [['1@lid', false], ['5521900000000@c.us', true]]);
});

test('ponte bulkChat: carrega as antigas devagar até o começo; só quem e quando (sem texto, sem reação)', async () => {
  const id = '1@lid';
  const all = [m('a', false, S('2026-08-03T10:00:00')), m('b', true, S('2026-08-03T10:05:00')), m('r', false, S('2026-08-03T10:06:00'), 'reaction'), m('c', true, S('2026-08-04T09:00:00'))];
  const b = bridge({ chats: [{ id, t: S('2026-08-04T09:00:00'), name: 'Ana', loaded: 1 }], history: { [id]: all }, pages: { [id]: [all.slice(0, 3)] } });
  const r = await b.ask('bulkChat', { chatId: id, since: SINCE, pauseMs: 0 });
  assert.ok(r.ok, JSON.stringify(r.error));
  // 1ª carga trouxe 3 (com 53/56 para 50 o tamanho não serve); a 2ª não trouxe nada novo = começo
  assert.deepStrictEqual([r.data.complete, r.data.pages, r.data.phone], [true, 2, '5521977001122']);
  assert.deepStrictEqual(plain(r.data.msgs).map((x) => [x.fromMe, x.t]), [[true, S('2026-08-04T09:00:00')], [false, S('2026-08-03T10:00:00')], [true, S('2026-08-03T10:05:00')]]);
  assert.ok(!JSON.stringify(r.data).includes('texto'), 'o texto não sai da ponte');
  assert.strictEqual(E.bulkDecision({ ...r.data, since: SINCE, clienteIds: CLI, targetIds: BF, salePhones: SALES }).reason, null);
  assert.deepStrictEqual(b.calls[0][1].direction, 'before');
});

test('ponte bulkChat: o WhatsApp não entrega as antigas → complete=false (fica de fora como "não deu para confirmar"); maxPages 0 só lê a memória', async () => {
  const id = '1@lid';
  const all = [m('c', true, S('2026-08-04T09:00:00'))];
  const b = bridge({ chats: [{ id, t: S('2026-08-04T09:00:00'), name: 'Ana' }], history: { [id]: all }, failLoad: true });
  const r = await b.ask('bulkChat', { chatId: id, since: SINCE, pauseMs: 0 });
  assert.deepStrictEqual([r.data.complete, E.bulkDecision({ ...r.data, since: SINCE }).reason], [false, 'sem_historico']);
  const q = await b.ask('bulkChat', { chatId: id, since: SINCE, maxPages: 0 });
  assert.strictEqual(q.data.pages, 0);
});

test('ponte bulkChat: histórico só no celular (endOfHistoryTransferType 0) → moreOnPhone; saudação automática vem marcada', async () => {
  const id = '1@lid';
  const all = [m('g', true, S('2026-08-03T10:00:00'), 'automated_greeting_message'), m('a', false, S('2026-08-03T10:00:00')), m('b', true, S('2026-08-03T11:00:00'))];
  const b = bridge({ chats: [{ id, t: S('2026-08-03T11:00:00'), name: 'Ana', eoh: 0 }], history: { [id]: all } });
  const r = await b.ask('bulkChat', { chatId: id, since: SINCE, pauseMs: 0 });
  assert.deepStrictEqual([r.data.complete, r.data.moreOnPhone, plain(r.data.msgs).filter((x) => x.auto).length], [false, true, 1]);
  assert.strictEqual(E.bulkDecision({ ...r.data, since: SINCE, salePhones: SALES }).reason, 'historico_no_celular');
  const b1 = bridge({ chats: [{ id, t: S('2026-08-03T11:00:00'), name: 'Ana', eoh: 1 }], history: { [id]: all } });
  const r1 = await b1.ask('bulkChat', { chatId: id, since: SINCE, pauseMs: 0 });
  assert.strictEqual(E.bulkDecision({ ...r1.data, since: SINCE, salePhones: SALES }).reason, null, 'histórico inteiro: entra');
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e.stack || e).split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
