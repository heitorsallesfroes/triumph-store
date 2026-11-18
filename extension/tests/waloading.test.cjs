// Testes da 2.20.2 (WhatsApp carregando não pausa automação). node extension/tests/waloading.test.cjs
// Bug da 2.20.0: 18/11/2026 08:52, logo depois de reconectar o WhatsApp Web (QR code), o motor pausou 79 percursos com
// "pausado: não deu para confirmar o telefone da conversa": o WhatsApp ainda sincronizava e não dava o telefone dos @lid.
// Agora: sem confirmação → só pula o ciclo e tenta depois (espera crescente); só pausa quando o WhatsApp CONFIRMA que
// o chat é de outra pessoa. Enquanto o WhatsApp não termina de carregar, o motor não roda nada.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(EXT, 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const REGUA = '7da93603-63cb-4b4a-ad84-a8e290f088cd';
const FU1 = 'f9a864ef-e036-498e-b106-d8f70ad95758';
const DEF = { start: { type: 'etiqueta', source: 'crm', label_id: FU1 }, steps: [{ id: 'esp', type: 'esperar', amount: 3, unit: 'horas', yes: [{ id: 'ok', type: 'fim' }], no: [{ id: 'f2', type: 'enviar', item_id: 'item-f2' }] }] };
const at = (hms) => Date.parse(`2026-11-18T${hms}-03:00`);
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60 * 1000;

// 79 percursos da Régua com a espera vencida; chat @lid de cada um é do telefone do próprio contato
const N = 79;
const lid = (i) => `${100000000000000 + i}@lid`;
const phoneOf = (i) => `55219${String(70000000 + i).padStart(8, '0')}`;
const RUNS = Array.from({ length: N }, (_, i) => ({ id: `run-${i}`, chat_id: lid(i), contact_id: `c-${i}`, node: 'esp', wait_started_at: iso(at('02:00:00')), created_at: iso(at('01:59:00')) }));
const CONTACTS = Object.fromEntries(RUNS.map((r, i) => [r.contact_id, { id: r.contact_id, phone: phoneOf(i), chat_id: r.chat_id, name: null }]));

function motorWith({ runs = RUNS, contacts = CONTACTS, now = at('08:52:00') } = {}) {
  const clock = { t: now };
  const wa = { syncing: true, loading: false, phoneCalls: 0, phones: Object.fromEntries(RUNS.map((r, i) => [r.chat_id, phoneOf(i)])) };
  const seq = { id: REGUA, name: 'Régua de follow-up', active: true, kind: 'sequencia', sequence: DEF, activated_at: iso(at('00:00')) };
  const db = { runs: runs.map((r) => ({ version: 0, status: 'ativo', branches: [], automation_id: REGUA, outcome: null, ...r })), sent: [], logs: [], diag: [], calls: [] };
  const api = async (type, p) => {
    db.calls.push(type);
    if (type === 'getEngineSettings') return { available: true, settings: { business_start: '00:00', business_end: '23:59', business_days: [0, 1, 2, 3, 4, 5, 6], max_per_hour: 1000, max_per_day: 1000, min_interval_s: 0, max_interval_s: 0, paused_all: false }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates') return [];
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: contacts[r.contact_id] ? { labelIds: [FU1], ...contacts[r.contact_id] } : null }));
    if (type === 'seqReplies') return {};
    if (type === 'seqCustomerAt') return { chats: {}, phones: {} };
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      Object.assign(r, p.patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') { db.logs.push(p); return { id: `l${db.logs.length}` }; }
    if (type === 'claimLease') return { held: true, lease_until: iso(clock.t + 5 * MIN), settings: null };
    if (type === 'automationSentToday') return { count: 0 };
    if (type === 'engineCounts' || type === 'sendCounts') return { hour: 0, day: 0 };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => clock.t,
    wa: {
      ready: async () => true,
      loading: () => wa.loading,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: { fromMe: true, t: Math.floor((clock.t - 6 * 3600 * 1000) / 1000) }, lastIn: null }])) }),
      // sincronizando: o WhatsApp responde, mas sem o telefone do @lid
      chatPhone: async ({ chatId }) => { wa.phoneCalls++; return { phone: wa.syncing ? null : wa.phones[chatId] || null }; },
      setChatLabels: async () => ({ confirmed: true }),
    },
    sendParts: async ({ chatId }) => { db.sent.push(chatId); return { status: 'ok', sent: 1 }; },
    partsOf: () => [{ type: 'texto', body: 'Follow' }],
    itemById: async (id) => ({ id, title: 'Follow Padrão 2' }),
    onDiag: (ev) => db.diag.push(ev),
  });
  return { motor, db, clock, wa };
}
async function cycle(m) { await m.motor.loadSettings(); await m.motor.refreshActivity(); return m.motor._sequencesOnce(); }
const paused = (m) => m.db.runs.filter((r) => r.outcome === 'pausado_chat').length;

test('18/11 08:52: WhatsApp sincronizando depois do QR code → nenhum dos 79 percursos é pausado, nada sai, nada no log', async () => {
  const m = motorWith();
  await cycle(m);
  assert.deepStrictEqual([paused(m), m.db.sent.length, m.db.logs.length, m.db.diag.length], [0, 0, 0, 0]);
  assert.ok(m.db.runs.every((r) => r.status === 'ativo' && r.outcome === null && r.version === 0), 'nenhum percurso mudou');
});

test('sem confirmação: espera crescente (1, 2, 4… min, até 30) antes de perguntar de novo ao WhatsApp', async () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 50].map((n) => E.unconfirmedDelayMs(n) / MIN), [1, 2, 4, 8, 16, 30, 30, 30]);
  const m = motorWith({ runs: RUNS.slice(0, 1) });
  const asked = async () => { const before = m.wa.phoneCalls; await cycle(m); return m.wa.phoneCalls > before; };
  const checks = []; // em cada ciclo: o motor conferiu o chat no WhatsApp?
  // 1ª tentativa em t0; depois espera 1 min, 2 min, 4 min
  checks.push(await asked()); // t0: confere (sem telefone) → espera 1 min
  m.clock.t += 30 * 1000; checks.push((await cycle(m), m.db.sent.length)); // dentro da espera: o run nem entra
  m.clock.t += 31 * 1000; checks.push(await asked()); // t0+61 s: confere de novo → espera 2 min
  m.clock.t += 1 * MIN; checks.push((await cycle(m), m.db.sent.length)); // ainda dentro dos 2 min
  assert.deepStrictEqual(checks, [true, 0, true, 0]);
  assert.deepStrictEqual([paused(m), m.db.sent.length], [0, 0]);
});

test('o WhatsApp terminou de sincronizar → os percursos seguem e enviam normalmente (sem nenhum ter sido pausado)', async () => {
  const m = motorWith();
  await cycle(m); // sincronizando: pula
  m.wa.syncing = false;
  m.clock.t += 2 * MIN; // passou a 1ª espera (1 min)
  await cycle(m);
  assert.deepStrictEqual([paused(m), m.db.sent.length], [0, N]);
});

test('só pausa quando o WhatsApp CONFIRMA que o chat é de outra pessoa', async () => {
  const m = motorWith({ runs: RUNS.slice(0, 2) });
  m.wa.syncing = false;
  m.wa.phones[lid(1)] = '553175439079'; // o chat do run-1 é de outra pessoa
  await cycle(m);
  assert.deepStrictEqual(m.db.runs.map((r) => r.outcome), ['nao_respondeu', 'pausado_chat']); // run-0 enviou e terminou
  assert.deepStrictEqual([m.db.sent, m.db.logs.map((l) => l.reason)], [[lid(0)], ['pausado: a conversa não é do telefone do contato', undefined]]);
  assert.deepStrictEqual(['mismatch', 'unconfirmed', 'unknown', 'ok'].map((c) => E.seqShouldPause(c)), [true, false, false, false]);
});

test('Saúde: "sem telefone para conferir" não oferece pausar (nem no "Reparar tudo")', () => {
  const v = E.healthOfRun({ run: { ...RUNS[0], status: 'ativo', outcome: null, contact: CONTACTS[RUNS[0].contact_id] }, wa: { phone: null, answered: true } });
  assert.deepStrictEqual([v.status, v.fix], ['unconfirmed', null]);
});

test('WhatsApp ainda carregando (sincronização inicial): o motor não roda nada e o painel mostra "Aguardando o WhatsApp terminar de carregar"', async () => {
  const m = motorWith();
  m.wa.loading = true;
  await m.motor.loadSettings();
  await m.motor.tick();
  assert.strictEqual(m.motor.state.waiting, 'Aguardando o WhatsApp terminar de carregar');
  assert.strictEqual(m.motor.state.waLoading, true);
  assert.deepStrictEqual([m.db.calls.filter((c) => c === 'seqRuns' || c === 'engineActivity').length, m.wa.phoneCalls, m.db.sent.length, paused(m)], [0, 0, 0, 0]);
  // terminou de carregar: volta a rodar
  m.wa.loading = false;
  m.wa.syncing = false;
  await m.motor.tick();
  assert.notStrictEqual(m.motor.state.waiting, 'Aguardando o WhatsApp terminar de carregar');
  assert.strictEqual(m.motor.state.waLoading, false);
  assert.ok(m.db.calls.includes('engineActivity'), 'voltou a procurar trabalho');
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e.stack || e).split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
