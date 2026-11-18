// Testes da 2.20.2 (18/11/2026: depois do QR code nada saía). node extension/tests/sendblock.test.cjs
// Causa: WhatsApp Web 2.3000.1055167106 + WA-JS 4.7.2 → todo envio quebra com "n.UserPrefs.getMeLidUserOrThrow is not
// a function" (WPP.conn.getMyUserLid, dentro de prepareRawMessage). Corrigido na WA-JS 4.8.2 (fallback para
// getMaybeMeLidUser). Aqui: o motor não tenta enviar enquanto o envio não funciona ("Envios desativados: o WhatsApp não
// aceitou o envio") e nada vira "enviado" sem o WhatsApp aceitar (ack >= 1).
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
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const BLOCKED = 'Envios desativados: o WhatsApp não aceitou o envio';
const REGUA = 'r-1';
const FU1 = 'l-1';
const DEF = { start: { type: 'etiqueta', source: 'crm', label_id: FU1 }, steps: [{ id: 'esp', type: 'esperar', amount: 3, unit: 'horas', yes: [{ id: 'ok', type: 'fim' }], no: [{ id: 'f2', type: 'enviar', item_id: 'item-f2' }] }] };
const at = (hms) => Date.parse(`2026-11-18T${hms}-03:00`);
const iso = (ms) => new Date(ms).toISOString();
const phoneOf = (i) => `55219${String(70000000 + i).padStart(8, '0')}`;

function motorWith({ n = 5, sendResult = () => ({ status: 'failed', stage: 'sending', sent: 0, code: 'send_failed' }), sendable = () => true } = {}) {
  const clock = { t: at('09:03:00') };
  const runs = Array.from({ length: n }, (_, i) => ({ id: `run-${i}`, chat_id: `${phoneOf(i)}@c.us`, contact_id: `c-${i}`, node: 'esp', wait_started_at: iso(at('05:00:00')), created_at: iso(at('04:59:00')) }));
  const contacts = Object.fromEntries(runs.map((r, i) => [r.contact_id, { id: r.contact_id, phone: phoneOf(i), chat_id: r.chat_id, name: null }]));
  const seq = { id: REGUA, name: 'Régua', active: true, kind: 'sequencia', sequence: DEF, activated_at: iso(at('00:00')) };
  const db = { runs: runs.map((r) => ({ version: 0, status: 'ativo', branches: [], automation_id: REGUA, outcome: null, ...r })), tries: [], logs: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { business_start: '00:00', business_end: '23:59', business_days: [0, 1, 2, 3, 4, 5, 6], max_per_hour: 1000, max_per_day: 1000, min_interval_s: 0, max_interval_s: 0, paused_all: false }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates') return [];
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: { labelIds: [FU1], ...contacts[r.contact_id] } }));
    if (type === 'seqReplies') return {};
    if (type === 'seqCustomerAt') return { chats: {}, phones: {} };
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      Object.assign(r, p.patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') { db.logs.push({ ...p }); return { id: `l${db.logs.length}` }; }
    if (type === 'logFinish' || type === 'finishSend') { const l = db.logs[Number(String(p.id).slice(1)) - 1]; if (l) Object.assign(l, { status: p.status, reason: p.reason }); return { ok: true }; }
    if (type === 'claimLease') return { held: true, lease_until: iso(clock.t + 5 * 60000), settings: null };
    if (type === 'automationSentToday') return { count: 0 };
    if (type === 'engineCounts' || type === 'sendCounts') return { hour: 0, day: 0 };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => clock.t,
    wa: {
      ready: async () => true,
      sendable,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: { fromMe: true, t: Math.floor((clock.t - 6 * 3600 * 1000) / 1000) }, lastIn: null }])) }),
      chatPhone: async () => ({ phone: null }),
      setChatLabels: async () => ({ confirmed: true }),
    },
    sendParts: async ({ chatId }) => { db.tries.push(chatId); return sendResult(chatId); },
    partsOf: () => [{ type: 'texto', body: 'Follow' }],
    itemById: async (id) => ({ id, title: 'Follow' }),
  });
  return { motor, db, clock };
}
async function ticks(m, k) { await m.motor.loadSettings(); for (let i = 0; i < k; i++) { await m.motor.tick(); m.clock.t += 61 * 1000; } }

test('18/11: o WhatsApp recusa os envios → depois de 2 falhas seguidas o motor para de tentar e mostra "Envios desativados"', async () => {
  const m = motorWith();
  await ticks(m, 8);
  assert.strictEqual(m.db.tries.length, E.SEND_FAILS_TO_BLOCK, `tentou ${m.db.tries.length} vezes`);
  assert.strictEqual(m.motor.state.waiting, BLOCKED);
  assert.ok(!m.db.logs.some((l) => l.status === 'enviado'), 'nada gravado como enviado');
});

test('bloqueado: um envio que saiu de verdade (ex.: mensagem rápida do painel) libera o motor', async () => {
  let works = false;
  const m = motorWith({ sendResult: () => (works ? { status: 'ok', sent: 1 } : { status: 'failed', stage: 'sending', sent: 0, code: 'send_failed' }) });
  await ticks(m, 4);
  assert.strictEqual(m.motor.state.waiting, BLOCKED);
  const before = m.db.tries.length;
  m.motor.noteSend({ status: 'failed', stage: 'sending', sent: 0 }); // mensagem rápida falhou: continua bloqueado
  await ticks(m, 2);
  assert.strictEqual(m.db.tries.length, before);
  works = true;
  m.motor.noteSend({ status: 'ok', sent: 1 }); // mensagem rápida saiu
  await ticks(m, 2);
  assert.ok(m.db.tries.length > before, 'voltou a enviar');
  assert.notStrictEqual(m.motor.state.waiting, BLOCKED);
});

test('teste sem envio (getMyUserLid quebra) → o motor nem tenta enviar', async () => {
  const m = motorWith({ sendable: () => false });
  await ticks(m, 4);
  assert.deepStrictEqual([m.db.tries.length, m.motor.state.waiting], [0, BLOCKED]);
});

test('erro de Pix/tipo especial não bloqueia o motor (é da mensagem, não do WhatsApp)', () => {
  const m = motorWith();
  m.motor.noteSend({ status: 'failed', stage: 'sending', code: 'pix_failed' });
  m.motor.noteSend({ status: 'failed', stage: 'sending', code: 'rich_failed' });
  m.motor.noteSend({ status: 'failed', stage: 'before-send', code: 'invalid_chat' });
  assert.ok(!m.motor.state.sendBlocked);
});

// ── a ponte de verdade com WA-JS falsa ──
function bridge({ lidThrows = true } = {}) {
  const handlers = {};
  const msgs = [];
  const WPP = {
    isReady: true,
    conn: {
      isMainReady: () => true,
      isMainLoaded: () => undefined, // WhatsApp Web 2.3000.1055167106: undefined
      getMyUserLid: () => { if (lidThrows) throw new TypeError('n.UserPrefs.getMeLidUserOrThrow is not a function'); return { _serialized: '1@lid' }; },
    },
    chat: {
      list: async () => [], getActiveChat: () => null,
      get: () => ({ id: { _serialized: '5521970000001@c.us' }, isGroup: false, msgs: { getModelsArray: () => msgs, msgLoadState: { noEarlierMsgs: true } } }),
      sendTextMessage: async () => { WPP.conn.getMyUserLid(); return { id: 'x', ack: 0 }; },
    },
    contact: {},
    labels: {},
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
  };
  const listeners = [];
  const replies = new Map();
  const win = {
    WPP, __tspWaBefore: { wpp: null, config: null }, location: { origin: 'https://web.whatsapp.com' },
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    postMessage: (msg) => { if (msg && msg.source === 'tsp-wajs-bridge') { const r = replies.get(msg.id); if (r) r(msg); } },
  };
  win.window = win;
  class FakeBlob { constructor(size, type) { this.size = size; this.type = type; } }
  const ctx = vm.createContext({ window: win, console, setTimeout, clearTimeout, Promise, Blob: FakeBlob, ArrayBuffer, queueMicrotask, Date, Math, TypeError });
  vm.runInContext(src('wa-bridge.js'), ctx, { filename: 'wa-bridge.js' });
  let seq = 0;
  const ask = (type, payload) => new Promise((resolve) => {
    const id = `s${++seq}`;
    replies.set(id, resolve);
    listeners.forEach((fn) => fn({ source: win, data: { source: 'tsp-wajs-content', id, type, payload } }));
  });
  const emit = (ev, data) => (handlers[ev] || []).forEach((fn) => fn(data));
  return { ask, emit, WPP };
}
const myMsg = (id, ack) => ({ id: { fromMe: true, id, remote: { _serialized: '5521970000001@c.us' } }, type: 'chat', t: Math.floor(Date.now() / 1000), ack, body: 'oi' });

test('ponte: sua mensagem só vira "você digitou" (wa_send_log enviado) depois que o WhatsApp aceita (ack >= 1); erro nunca', async () => {
  const b = bridge();
  const pending = myMsg('A', 0);
  const failed = myMsg('B', 0);
  b.emit('chat.new_message', pending);
  b.emit('chat.new_message', failed);
  let r = await b.ask('convEvents', {});
  assert.deepStrictEqual(r.data.events.length, 0, 'no relógio: ainda não');
  pending.ack = 1; // saiu
  failed.ack = -1; // erro
  r = await b.ask('convEvents', {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.data.events.map((e) => [e.fromMe, e.chatId]))), [[true, '5521970000001@c.us']]);
  r = await b.ask('convEvents', {});
  assert.strictEqual(r.data.events.length, 0, 'a com erro foi descartada');
  // já aceita quando chega (ex.: enviada pelo celular): vai direto
  b.emit('chat.new_message', myMsg('C', 2));
  r = await b.ask('convEvents', {});
  assert.strictEqual(r.data.events.length, 1);
});

test('ponte: status mostra sendProbe=false com a WA-JS 4.7.2 nesta versão do WhatsApp, e isMainLoaded()=undefined não trava o motor', async () => {
  const bad = await bridge().ask('status', {});
  assert.deepStrictEqual([bad.ok, bad.data.ready, bad.data.synced, bad.data.sendProbe], [true, true, true, false]);
  const good = await bridge({ lidThrows: false }).ask('status', {});
  assert.strictEqual(good.data.sendProbe, true);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e.stack || e).split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
