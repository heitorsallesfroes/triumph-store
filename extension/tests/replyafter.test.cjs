// Testes da 2.19.1 ("Esperar resposta" não via a resposta): node extension/tests/replyafter.test.cjs
// - caso 1 (run cdf090c8, 24236685025474@lid): espera às 11:56:34, cliente responde às 12:10 e VOCÊ manda um áudio
//   (12:10) e uma mensagem rápida (12:11) depois → tem que ir para "Se responder" (antes: só valia a ÚLTIMA mensagem)
// - caso 2 (run b03e3a24, 135386043003035@lid): espera às 11:54:07, cliente responde às 13:06/13:07 e ninguém mais fala
// - o que NÃO conta: mensagem sua, reação/aviso do cliente, resposta de antes da espera, resposta de OUTRA pessoa
//   (o contato do CRM ligado ao percurso pode ter o telefone de outra conversa: o alias vem do WhatsApp, não do CRM)
// - @lid + @c.us da mesma pessoa e a extensão fechada na hora da resposta (wa_chat_activity ao reabrir)
// - gatilho "O cliente respondeu" (tirar da régua) com mensagem sua depois da resposta
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const TAG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SETTINGS = { business_start: '09:00', business_end: '19:00', business_days: [0, 1, 2, 3, 4, 5, 6] };
const at = (hms) => Date.parse(`2026-11-14T${hms}-03:00`); // horário de Brasília, como no relato
const sec = (hms) => at(hms) / 1000;
const DEF = { start: { type: 'etiqueta', source: 'crm', label_id: TAG }, steps: [{ id: 'w', type: 'esperar', amount: 1, unit: 'dias', yes: [], no: [{ id: 'm', type: 'enviar', item_id: F1 }] }] };
const step = (run, chat, replies = [], now = at('12:16:00')) => E.seqStep({ def: DEF, run: { node: 'w', branches: [], ...run }, chat, replies, now, settings: SETTINGS });
const CASE1 = { wait_started_at: at('11:56:34.697'), last_sent_at: at('11:56:09') };
const CASE2 = { wait_started_at: at('11:54:07.534'), last_sent_at: at('11:53:28') };

// ── regra pura ──
test('caso 1: cliente respondeu 12:10 e depois você mandou áudio e mensagem rápida → ✅ Se responder', () => {
  const chat = { loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('12:10:05') };
  const r = step(CASE1, chat);
  assert.strictEqual(r.status, 'end');
  assert.strictEqual(r.outcome, 'respondeu');
  assert.strictEqual(r.branches[0].result, 'sim');
});
test('caso 2: cliente respondeu 13:06/13:07 e ninguém mais falou → ✅ Se responder', () => {
  const chat = { loaded: true, last: { fromMe: false, t: sec('13:07:12') }, lastIn: sec('13:07:12') };
  const r = step(CASE2, chat, [], at('13:12:00'));
  assert.deepStrictEqual([r.status, r.outcome], ['end', 'respondeu']);
});
test('só mensagem sua depois da espera → continua esperando', () => {
  const chat = { loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('09:02:25') };
  assert.strictEqual(step(CASE1, chat).status, 'wait');
});
test('resposta de ANTES da espera começar, seguida de mensagem sua → continua esperando', () => {
  const chat = { loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('11:56:20') };
  assert.strictEqual(step(CASE1, chat).status, 'wait');
});
test('reação/aviso do cliente como última mensagem (lastIn sem mensagem nova) → não conta', () => {
  const chat = { loaded: true, last: { fromMe: false, t: sec('12:12:00') }, lastIn: null };
  assert.strictEqual(step(CASE1, chat).status, 'wait');
});
test('referência = o maior entre o começo da espera e o último envio da automação', () => {
  const run = { wait_started_at: at('11:56:34'), last_sent_at: at('12:05:00') }; // a automação mandou de novo às 12:05
  assert.strictEqual(step(run, { loaded: true, last: { fromMe: true, t: sec('12:11') }, lastIn: sec('12:01:00') }).status, 'wait');
  assert.strictEqual(step(run, { loaded: true, last: { fromMe: true, t: sec('12:11') }, lastIn: sec('12:06:00') }).outcome, 'respondeu');
});
test('extensão fechada na hora: conversa não carregada, mas a resposta gravada no banco conta ao reabrir', () => {
  assert.strictEqual(step(CASE1, null, [at('12:10:05')]).outcome, 'respondeu');
  assert.strictEqual(step(CASE1, { loaded: false }, [at('12:10:05')]).outcome, 'respondeu');
  assert.strictEqual(step(CASE1, null, [at('11:50:00')]).status, 'wait');
});
test('ponte antiga (sem lastIn): a última mensagem do cliente ainda vale', () => {
  assert.strictEqual(step(CASE2, { loaded: true, last: { fromMe: false, t: sec('13:07:12') } }, [], at('13:12')).outcome, 'respondeu');
});

// ── gatilho "O cliente respondeu" (tirar da régua) ──
test('gatilho "O cliente respondeu": resposta depois de entrar na etiqueta, seguida de mensagem sua → dispara', () => {
  const a = { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', kind: 'simples', active: true, trigger_type: 'respondeu', trigger_label_source: 'crm', trigger_label_id: TAG, action_type: 'etiqueta', include_existing: true };
  const contact = { id: 'k', chat_id: '24236685025474@lid', labelIds: [TAG], links: [{ label_id: TAG, created_at: new Date(at('11:56:00')).toISOString() }] };
  const ev = (chat) => E.evaluateAutomation({ automation: a, contact, chat, settings: SETTINGS, now: at('12:16'), noSendLabelId: null, ranKeys: new Set() });
  const after = ev({ loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('12:10:05') });
  const before = ev({ loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('09:02:00') });
  assert.notStrictEqual(after.reason, 'ainda não respondeu', JSON.stringify(after));
  assert.strictEqual(before.reason, 'ainda não respondeu', JSON.stringify(before));
});

// ── motor de verdade com API e WhatsApp falsos ──
// 2.20.0: o motor só mexe no percurso quando o WhatsApp confirma que o chat é do telefone do contato: por padrão os dois
// @lid dos casos são do 5521996790042 (o telefone do contato)
const SAME = { '24236685025474@lid': '5521996790042', '135386043003035@lid': '5521996790042' };
function motorWith({ run, chats, waPhones = SAME, custAt = { chats: {}, phones: {} }, replies = {}, contactPhone = '5521996790042' }) {
  const now = { t: at('12:16:00') };
  const seq = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Régua de follow-up', active: true, kind: 'sequencia', sequence: DEF, activated_at: new Date(at('08:00')).toISOString() };
  const db = { runs: [{ version: 0, status: 'ativo', branches: [], node: 'w', automation_id: seq.id, ...run }], asked: [], sent: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { ...SETTINGS, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates') return [];
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: { id: 'k', name: 'Cliente', phone: contactPhone, labelIds: [TAG] } }));
    if (type === 'seqReplies') { db.asked.push(...p.chatIds); return replies; }
    if (type === 'seqCustomerAt') return custAt;
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      Object.assign(r, p.patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') return { id: 'l1' };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => now.t,
    wa: {
      ready: async () => true,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.filter((c) => chats[c]).map((c) => [c, chats[c]])) }),
      chatPhone: async ({ chatId }) => ({ phone: waPhones[chatId] || null }),
      setChatLabels: async () => ({ confirmed: true }),
    },
    sendParts: async ({ chatId }) => { db.sent.push(chatId); return { status: 'ok', sent: 1 }; },
    partsOf: () => [{ type: 'texto', body: 'Follow' }],
    itemById: async (id) => ({ id, title: 'Follow' }),
  });
  return { motor, db, now };
}
const iso = (ms) => new Date(ms).toISOString();
const RUN1 = { id: 'cdf090c8-b3d2-4bd0-95a0-95fea86be281', chat_id: '24236685025474@lid', wait_started_at: iso(CASE1.wait_started_at), last_sent_at: iso(CASE1.last_sent_at) };
const RUN2 = { id: 'b03e3a24-fad2-44b7-921a-446da7bd972b', chat_id: '135386043003035@lid', wait_started_at: iso(CASE2.wait_started_at), last_sent_at: iso(CASE2.last_sent_at) };
async function cycle(m) { await m.motor.loadSettings(); await m.motor.refreshActivity(); await m.motor._sequencesOnce(); return m.db.runs[0]; }

test('motor, caso 1 exato: resposta 12:10 + áudio 12:10 + rápida 12:11 → sai por "respondeu", nada é enviado', async () => {
  const m = motorWith({ run: RUN1, chats: { '24236685025474@lid': { loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('12:10:05') } } });
  const r = await cycle(m);
  assert.deepStrictEqual([r.status, r.outcome, m.db.sent.length], ['fim', 'respondeu', 0]);
});
test('motor, caso 2 exato: só @lid, resposta 13:06/13:07 sem mensagem sua depois → sai por "respondeu"', async () => {
  const m = motorWith({ run: RUN2, chats: { '135386043003035@lid': { loaded: true, last: { fromMe: false, t: sec('13:07:12') }, lastIn: sec('13:07:12') } } });
  m.now.t = at('13:12:00');
  const r = await cycle(m);
  assert.deepStrictEqual([r.status, r.outcome], ['fim', 'respondeu']);
});
test('motor: a resposta caiu no @c.us da mesma pessoa (telefone dado pelo WhatsApp) → conta', async () => {
  const m = motorWith({
    run: RUN1,
    waPhones: { '24236685025474@lid': '5521996790042' },
    chats: {
      '24236685025474@lid': { loaded: true, last: { fromMe: true, t: sec('11:56:09') }, lastIn: sec('07:30:59') },
      '5521996790042@c.us': { loaded: true, last: { fromMe: true, t: sec('12:11:20') }, lastIn: sec('12:10:05') },
    },
  });
  const r = await cycle(m);
  assert.deepStrictEqual([r.status, r.outcome], ['fim', 'respondeu']);
  assert.ok(m.db.asked.includes('5521996790042@c.us'));
});
test('motor: contato do CRM com telefone de OUTRA pessoa → a resposta dela não conta e o percurso PAUSA (2.20.0)', async () => {
  const m = motorWith({
    run: { ...RUN1, contact_id: 'k' }, // o percurso é do contato 'k'
    contactPhone: '5521979767588', // telefone de 208344820273225@lid, outra conversa
    waPhones: { '24236685025474@lid': '5521996790042' },
    chats: {
      '24236685025474@lid': { loaded: true, last: { fromMe: true, t: sec('11:56:09') }, lastIn: sec('07:30:59') },
      '5521979767588@c.us': { loaded: true, last: { fromMe: false, t: sec('12:13:23') }, lastIn: sec('12:13:23') },
    },
    custAt: { chats: {}, phones: { 5521979767588: [at('12:13:23')] } },
  });
  const r = await cycle(m);
  assert.deepStrictEqual([r.status, r.outcome || null, m.db.sent.length], ['ativo', 'pausado_chat', 0]);
  assert.ok(!m.db.asked.includes('5521979767588@c.us'));
});
test('motor: extensão fechada às 12:10, reabre às 12:16 (conversa ainda não carregada) → wa_chat_activity conta', async () => {
  const m = motorWith({ run: RUN1, waPhones: { '24236685025474@lid': '5521996790042' }, chats: {}, custAt: { chats: { '24236685025474@lid': [at('12:10:05')] }, phones: {} } });
  const r = await cycle(m);
  assert.deepStrictEqual([r.status, r.outcome], ['fim', 'respondeu']);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
