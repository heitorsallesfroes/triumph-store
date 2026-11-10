// Testes da 2.16.0 (réguas por "dia desde o primeiro contato" + entrar no meio da régua). node extension/tests/entrystep.test.cjs
// - ⏳/❓ "até X depois que a pessoa ENTROU": contagem desde a entrada (atraso de uma etapa não empurra as próximas),
//   já passou → segue na hora, respondeu → sai pelo ✅
// - Simular: "dia X" e data/hora; horário fora da janela espera o próximo horário permitido
// - entrada manual no Follow 4 ("como se tivesse entrado há 5 dias"), "enviar agora" e (2.16.6) "esperar o tempo da régua"
// - motor: o lead entra com a hora da 1ª mensagem; servidor: created_at = entrada, "Tirar das outras réguas"
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 10, 9, 10, 0).getTime(); // segunda 10:00
const ITEMS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((x, i) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i + 1}`);
const DAYS = [1, 3, 5, 7, 10]; // Follow 2..6 em "dia X desde a entrada"
const OPEN = { week: [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: '00:00', end: '23:59' }]) }; // todo dia, o dia todo

// régua de 6 follows: Follow 1 na entrada; cada ❓ "até X dias depois de entrar" (✅ = FIM; ❌ = próximo Follow)
function regua({ from = 'entrada', schedule = { mode: 'personalizado', ...OPEN } } = {}) {
  let id = 0;
  const nid = (p) => `${p}${++id}`;
  const build = (k) => {
    const send = { id: `s${k + 1}`, type: 'enviar', item_id: ITEMS[k] };
    if (k === 5) return [send, { id: nid('fim'), type: 'fim' }];
    return [send, { id: `w${k + 1}`, type: 'esperar', amount: DAYS[k], unit: 'dias', ...(from ? { from } : {}), yes: [{ id: nid('fim'), type: 'fim' }], no: build(k + 1) }];
  };
  return { start: { type: 'manual' }, business: false, schedule, steps: build(0) };
}
const chat = (lastT, fromMe = true) => ({ loaded: true, last: { t: lastT / 1000, fromMe } });

test('frase da caixa: "dia 3 desde a entrada" (horas viram "h desde a entrada")', () => {
  const w = { id: 'w', type: 'esperar', amount: 3, unit: 'dias', from: 'entrada' };
  assert.strictEqual(E.sinceEntryText(w), 'dia 3 desde a entrada');
  assert.strictEqual(E.sinceEntryText({ ...w, amount: 48, unit: 'horas' }), 'dia 2 desde a entrada');
  assert.strictEqual(E.sinceEntryText({ ...w, amount: 5, unit: 'horas' }), '5 h desde a entrada');
  assert.strictEqual(E.seqNodeLabel({ steps: [w] }, 'w'), 'Esperando resposta (até 3 dias depois de entrar)');
  assert.strictEqual(E.seqNodeLabel({ steps: [{ id: 'p', type: 'pausa', amount: 3, unit: 'dias', from: 'entrada' }] }, 'p'), 'Esperando até 3 dias depois de entrar');
  assert.strictEqual(E.seqFromEntry({ type: 'pausa', mode: 'ate', from: 'entrada' }), false); // "até o próximo dia às" não conta da entrada
});

test('contagem desde a entrada: Follow 2 no dia 1 e Follow 3 no dia 3, mesmo que o Follow 2 tenha saído atrasado', () => {
  const def = regua();
  // Follow 1 saiu na entrada; esperando ❓ w1 (até 1 dia depois de entrar)
  const run1 = { node: 'w1', wait_started_at: T0 + MIN, last_sent_at: T0, entered_at: T0, branches: [] };
  const a = E.seqStep({ def, run: run1, chat: chat(T0), replies: [], now: T0 + 20 * HOUR });
  assert.deepStrictEqual([a.status, a.dueAt], ['wait', T0 + DAY]);
  const b = E.seqStep({ def, run: run1, chat: chat(T0), replies: [], now: T0 + DAY + MIN });
  assert.deepStrictEqual([b.status, b.sendNode], ['run', 's2']);
  // Follow 2 saiu atrasado (dia 2); ❓ w2 = até 3 dias depois de ENTRAR → vence no dia 3, não no dia 5
  const run2 = { node: 'w2', wait_started_at: T0 + 2 * DAY, last_sent_at: T0 + 2 * DAY, entered_at: T0, branches: [{ node: 'w1', result: 'nao' }] };
  const c = E.seqStep({ def, run: run2, chat: chat(T0 + 2 * DAY), replies: [], now: T0 + 2 * DAY + HOUR });
  assert.deepStrictEqual([c.status, c.dueAt], ['wait', T0 + 3 * DAY]);
  const d = E.seqStep({ def, run: run2, chat: chat(T0 + 2 * DAY), replies: [], now: T0 + 3 * DAY + MIN });
  assert.deepStrictEqual([d.status, d.sendNode], ['run', 's3']);
  // o jeito de sempre ("depois da etapa anterior") continua igual: 3 dias depois do começo da espera
  const old = E.seqStep({ def: regua({ from: null }), run: run2, chat: chat(T0 + 2 * DAY), replies: [], now: T0 + 3 * DAY + MIN });
  assert.deepStrictEqual([old.status, old.dueAt], ['wait', T0 + 5 * DAY]);
});

test('respondeu → sai: resposta durante a ❓ "desde a entrada" vai pelo ✅ e termina (respondeu)', () => {
  const def = regua();
  const run = { node: 'w2', wait_started_at: T0 + DAY, last_sent_at: T0 + DAY, entered_at: T0, branches: [{ node: 'w1', result: 'nao' }] };
  const r = E.seqStep({ def, run, chat: chat(T0 + DAY + HOUR, false), replies: [T0 + DAY + HOUR], now: T0 + DAY + 2 * HOUR });
  assert.deepStrictEqual([r.status, r.outcome, r.branches[0].result], ['end', 'respondeu', 'sim']);
  // mesmo depois do prazo, quem respondeu antes do ciclo vai pelo ✅
  const late = E.seqStep({ def, run, chat: chat(T0 + DAY + HOUR, false), replies: [T0 + DAY + HOUR], now: T0 + 4 * DAY });
  assert.deepStrictEqual([late.status, late.outcome], ['end', 'respondeu']);
});

test('⏳ "até X depois de entrar" que já passou segue na hora; se ainda não chegou, espera até entrada + X', () => {
  const def = { start: { type: 'manual' }, steps: [{ id: 'p', type: 'pausa', amount: 3, unit: 'dias', from: 'entrada' }, { id: 's', type: 'enviar', item_id: ITEMS[0] }, { id: 'f', type: 'fim' }] };
  const now = T0 + 10 * DAY;
  const past = E.seqStep({ def, run: { node: 'p', entered_at: now - 4 * DAY, branches: [] }, chat: null, replies: [], now });
  assert.deepStrictEqual([past.status, past.sendNode], ['run', 's']);
  const fresh = E.seqStep({ def, run: { node: 'p', entered_at: now - DAY, branches: [] }, chat: null, replies: [], now });
  assert.strictEqual(fresh.status, 'progress');
  const later = E.seqStep({ def, run: { node: 'p', wait_started_at: now, entered_at: now - DAY, branches: [] }, chat: null, replies: [], now: now + HOUR });
  assert.deepStrictEqual([later.status, later.dueAt], ['wait', now + 2 * DAY]);
});

test('Simular: cada etapa com "dia X" e data/hora prevista (dia 0, 1, 3, 5, 7, 10)', () => {
  const evs = E.seqSimulate(regua(), 'nunca', { startAt: T0, settings: {} });
  const sends = evs.filter((e) => e.kind === 'enviar');
  assert.deepStrictEqual(plain(sends.map((e) => e.day)), [0, 1, 3, 5, 7, 10]);
  assert.deepStrictEqual(plain(sends.map((e) => e.when)), [0, 1, 3, 5, 7, 10].map((d) => T0 + d * DAY));
  assert.ok(evs.some((e) => e.text === '❌ Não respondeu até 3 dias depois de entrar'), JSON.stringify(evs.map((e) => e.text)));
  const rel = E.seqSimulate(regua(), 'nunca'); // sem datas: só os dias
  assert.deepStrictEqual(plain(rel.filter((e) => e.kind === 'enviar').map((e) => e.day)), [0, 1, 3, 5, 7, 10]);
});

test('horário fora da janela: entrou sexta 17:30 (seg–sex 09:00–18:00) → Follow 2 espera segunda 09:00; Follow 3 segue no dia 3 (não atrasa)', () => {
  const week = [[], ...[1, 2, 3, 4, 5].map(() => [{ start: '09:00', end: '18:00' }]), []];
  const def = regua({ schedule: { mode: 'personalizado', week } });
  const fri = new Date(2026, 10, 13, 17, 30).getTime(); // sexta
  const sends = E.seqSimulate(def, 'nunca', { startAt: fri, settings: {} }).filter((e) => e.kind === 'enviar');
  const mon9 = new Date(2026, 10, 16, 9, 0).getTime();
  assert.deepStrictEqual(plain(sends.slice(0, 3).map((e) => [e.when, e.day])), [[fri, 0], [mon9, 2], [fri + 3 * DAY, 3]]);
  // no motor: o envio que vence no sábado espera o próximo horário permitido
  assert.strictEqual(E.nextSendTime(fri + DAY, def, null, {}), mon9);
});

test('Follow N: as caixas ✉ ENVIAR em ordem, com o dia desde a entrada e os ❌ até elas', () => {
  const steps = E.seqSendSteps(regua());
  assert.deepStrictEqual(plain(steps.map((s) => [s.n, s.node, s.day, s.branches.length, s.prevWait])),
    [[1, 's1', 0, 0, null], [2, 's2', 1, 1, 'w1'], [3, 's3', 3, 2, 'w2'], [4, 's4', 5, 3, 'w3'], [5, 's5', 7, 4, 'w4'], [6, 's6', 10, 5, 'w5']]);
});

test('entrada manual no Follow 4 ("enviar agora"): entra como se fosse há 5 dias, manda o Follow 4 e o Follow 5 sai 2 dias depois (dia 7)', () => {
  const def = regua();
  const now = T0 + 30 * DAY;
  const plan = E.seqManualPlan(def, 's4', { now, mode: 'agora' });
  assert.deepStrictEqual(plain([plan.node, plan.entered_at, plan.skip_wait, plan.branches.map((b) => b.node)]), ['s4', now - 5 * DAY, false, ['w1', 'w2', 'w3']]);
  const run = { ...plan, branches: plan.branches };
  const r = E.seqStep({ def, run, chat: chat(now - 40 * DAY), replies: [], now });
  assert.deepStrictEqual([r.status, r.sendNode, r.node], ['run', 's4', 'w4']);
  // depois do envio (motor grava a espera w4 começando agora): até 7 dias depois de ENTRAR = agora + 2 dias
  const after = { node: 'w4', wait_started_at: now + MIN, last_sent_at: now + MIN, entered_at: plan.entered_at, branches: plan.branches };
  const w = E.seqStep({ def, run: after, chat: chat(now + MIN), replies: [], now: now + DAY });
  assert.deepStrictEqual([w.status, w.dueAt], ['wait', now + 2 * DAY]);
  const go = E.seqStep({ def, run: after, chat: chat(now + MIN), replies: [], now: now + 2 * DAY + MIN });
  assert.deepStrictEqual([go.status, go.sendNode], ['run', 's5']);
  // "começo": entra agora, no 1º passo
  assert.deepStrictEqual(plain(E.seqManualPlan(def, null, { now })), { node: 's1', entered_at: now, wait_started_at: null, skip_wait: false, branches: [] });
});

test('2.16.6 Follow 4 "Esperar o tempo da régua": entra como se tivesse acabado de receber o Follow 3 (dia 3) → Follow 4 sai 2 dias depois, na faixa da espera', () => {
  const def = regua();
  E.seqIndex(def).get('w3').node.send_window = { start: '14:00', end: '18:00' };
  const now = new Date(2026, 11, 9, 10, 0).getTime(); // quarta 10:00
  const plan = E.seqManualPlan(def, 's4', { now, mode: 'marcado' });
  assert.deepStrictEqual(plain([plan.node, plan.skip_wait, plan.wait_started_at, plan.entered_at, plan.branches.map((b) => b.node)]), ['w3', false, now, now - 3 * DAY, ['w1', 'w2']]);
  const r = E.seqStep({ def, run: plan, chat: chat(now - DAY), replies: [], now: now + DAY });
  assert.deepStrictEqual([r.status, r.dueAt], ['wait', now + 2 * DAY]);
  const go = E.seqStep({ def, run: plan, chat: chat(now - DAY), replies: [], now: now + 2 * DAY });
  assert.deepStrictEqual(plain([go.status, go.sendNode, go.window]), ['run', 's4', { start: '14:00', end: '18:00' }]);
  assert.strictEqual(E.seqManualForecast(def, plan, 's4', { now, settings: {} }), new Date(2026, 11, 11, 14, 0).getTime());
  // ⏳ sem caminhos antes da etapa: o tempo dela inteiro a partir de agora
  const def2 = { start: { type: 'manual' }, steps: [{ id: 's1', type: 'enviar', item_id: ITEMS[0] }, { id: 'p', type: 'pausa', amount: 2, unit: 'dias' }, { id: 's2', type: 'enviar', item_id: ITEMS[1] }, { id: 'f', type: 'fim' }] };
  const p2 = E.seqManualPlan(def2, 's2', { now, mode: 'marcado' });
  assert.deepStrictEqual([p2.node, p2.wait_started_at, p2.entered_at], ['p', now, now]);
  assert.strictEqual(E.seqStep({ def: def2, run: p2, chat: null, replies: [], now: now + DAY }).status, 'wait');
  assert.strictEqual(E.seqManualForecast(def2, p2, 's2', { now, settings: {} }), now + 2 * DAY);
});

// régua do pedido: ⏳ 3 h desde a entrada → Follow 1 → ❓ até dia 1 desde a entrada → Follow 2; seg–sex 09:00–18:00
const WEEK = [[], ...[1, 2, 3, 4, 5].map(() => [{ start: '09:00', end: '18:00' }]), []];
const regua3h = () => ({ start: { type: 'manual' }, business: false, schedule: { mode: 'personalizado', week: WEEK }, steps: [
  { id: 'p1', type: 'pausa', amount: 3, unit: 'horas', from: 'entrada' },
  { id: 's1', type: 'enviar', item_id: ITEMS[0] },
  { id: 'w1', type: 'esperar', amount: 1, unit: 'dias', from: 'entrada', yes: [{ id: 'fy', type: 'fim' }], no: [{ id: 's2', type: 'enviar', item_id: ITEMS[1] }, { id: 'fn', type: 'fim' }] },
] });
const TUE = new Date(2026, 10, 10, 10, 24).getTime(); // terça 10:24

test('2.16.6 Follow 2 "Esperar o tempo da régua" terça 10:24 → entrada recuada 3 h, vence quarta 07:24 e sai quarta 09:00 (horário)', () => {
  const def = regua3h();
  const plan = E.seqManualPlan(def, 's2', { now: TUE, mode: 'marcado' });
  assert.deepStrictEqual(plain([plan.node, plan.entered_at, plan.wait_started_at, plan.skip_wait, plan.branches]), ['w1', TUE - 3 * HOUR, TUE, false, []]);
  const r = E.seqStep({ def, run: plan, chat: chat(TUE - DAY), replies: [], now: TUE + MIN });
  assert.deepStrictEqual([r.status, r.dueAt], ['wait', new Date(2026, 10, 11, 7, 24).getTime()]);
  assert.strictEqual(E.seqManualForecast(def, plan, 's2', { now: TUE, settings: {} }), new Date(2026, 10, 11, 9, 0).getTime());
});

test('2.16.6 "Enviar esta etapa agora" continua saindo na hora (terça 10:24 está no horário)', () => {
  const def = regua3h();
  const plan = E.seqManualPlan(def, 's2', { now: TUE, mode: 'agora' });
  assert.strictEqual(plan.entered_at, TUE - DAY);
  const r = E.seqStep({ def, run: plan, chat: chat(TUE - DAY), replies: [], now: TUE });
  assert.deepStrictEqual([r.status, r.sendNode], ['run', 's2']);
  assert.strictEqual(E.seqManualForecast(def, plan, 's2', { now: TUE, settings: {} }), TUE);
});

test('2.16.6 durante a espera da régua, se a pessoa responder → ✅ (sai da régua)', () => {
  const def = regua3h();
  const plan = E.seqManualPlan(def, 's2', { now: TUE, mode: 'marcado' });
  // uma mensagem dela de ANTES de entrar não conta
  const old = E.seqStep({ def, run: plan, chat: chat(TUE - HOUR, false), replies: [TUE - HOUR], now: TUE + HOUR });
  assert.strictEqual(old.status, 'wait');
  const r = E.seqStep({ def, run: plan, chat: chat(TUE + HOUR, false), replies: [TUE + HOUR], now: TUE + 2 * HOUR });
  assert.deepStrictEqual([r.status, r.outcome], ['end', 'respondeu']);
});

test('2.16.6 Follow 1 "Esperar o tempo da régua": começa do começo, agora (a 1ª espera inteira: 3 h → 13:24)', () => {
  const def = regua3h();
  const plan = E.seqManualPlan(def, 's1', { now: TUE, mode: 'marcado' });
  assert.deepStrictEqual(plain([plan.node, plan.entered_at, plan.wait_started_at, plan.branches]), ['p1', TUE, null, []]);
  assert.strictEqual(E.seqManualForecast(def, plan, 's1', { now: TUE, settings: {} }), TUE + 3 * HOUR);
  // "começo" não muda
  assert.deepStrictEqual(plain(E.seqManualPlan(def, null, { now: TUE, mode: 'marcado' })), { node: 'p1', entered_at: TUE, wait_started_at: null, skip_wait: false, branches: [] });
});

// ── motor: o lead entra com a hora da 1ª mensagem ──
test('motor: "lead novo" entra com a hora da 1ª mensagem (⏳ 2 h desde a entrada sai 2 h depois da mensagem, não da criação)', async () => {
  const def = { start: { type: 'lead', origin: 'todos' }, business: false, schedule: { mode: 'personalizado', ...OPEN }, steps: [{ id: 'p', type: 'pausa', amount: 2, unit: 'horas', from: 'entrada' }, { id: 's', type: 'enviar', item_id: ITEMS[0] }, { id: 'f', type: 'fim' }] };
  const seq = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Lead', active: true, kind: 'sequencia', sequence: def, activated_at: new Date(T0 - HOUR).toISOString() };
  const now = { t: T0 + 40 * MIN };
  const db = { runs: [], sent: [], created: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false, business_start: '00:00', business_end: '23:59', business_days: [0, 1, 2, 3, 4, 5, 6] }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'seqLeads') return [{ chat_id: '5511900000001@c.us', phone: null, first_message_at: new Date(T0).toISOString(), origin: 'organico' }];
    // como o servidor: entered_at vira created_at
    if (type === 'seqCreateRuns') { p.items.forEach((it) => { db.created.push(it); if (!db.runs.length) db.runs.push({ id: 'r1', version: 0, status: 'ativo', branches: [], automation_id: it.automation_id, chat_id: it.chat_id, node: it.node, created_at: new Date(it.entered_at || now.t).toISOString() }); }); return { created: p.items.length }; }
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: { id: 'k', name: 'Ana', labelIds: [] } }));
    if (type === 'seqReplies') return {};
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      const patch = { ...p.patch };
      ['wait_started_at', 'due_at', 'last_sent_at'].forEach((k) => { if (k in patch) patch[k] = patch[k] == null ? null : new Date(patch[k]).toISOString(); });
      Object.assign(r, patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') return { id: 'l1' };
    if (type === 'automationSentToday') return { count: 0 };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => now.t,
    wa: { ready: async () => true, chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: null }])) }), setChatLabels: async () => ({ confirmed: true }) },
    sendParts: async ({ parts, chatId }) => { db.sent.push({ chatId, body: parts[0].body }); return { status: 'ok', sent: 1 }; },
    partsOf: (item) => [{ type: 'texto', body: item.title }],
    itemById: async (id) => ({ id, title: 'Follow 1' }),
  });
  await motor.loadSettings();
  await motor.refreshActivity();
  await motor._sequencesOnce(); // cria o percurso (entrada = 1ª mensagem, T0)
  assert.strictEqual(db.created[0].entered_at, T0);
  await motor._sequencesOnce(); // chega na espera
  now.t = T0 + 2 * HOUR + MIN; // 2 h depois da 1ª mensagem (contando da criação ainda faltariam 40 min)
  await motor._sequencesOnce();
  assert.deepStrictEqual(db.sent.map((x) => x.body), ['Follow 1']);
});

// ── servidor ──
function server() {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'GET' && p.startsWith('wa_automations?select=id,kind')) return res(200, [{ id: A, kind: 'sequencia' }]);
    if (method === 'GET' && p.startsWith('wa_sequence_runs?select=id,automation_id,version')) return res(200, [{ id: '11111111-1111-4111-8111-111111111111', automation_id: A, version: 2 }, { id: '22222222-2222-4222-8222-222222222222', automation_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 0 }]);
    if (method === 'PATCH' && p.startsWith('wa_sequence_runs')) return res(200, [{ id: 'x', version: 9 }]);
    if (method === 'POST' && p.startsWith('wa_sequence_runs')) return res(201, [{ id: '33333333-3333-4333-8333-333333333333', ...(init.body ? JSON.parse(init.body) : {}) }]);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls, A };
}
test('servidor: percurso novo grava created_at = hora da entrada (sem hora ou no futuro: agora)', async () => {
  const { a, calls, A } = server();
  await a.seqCreateRuns({ items: [{ automation_id: A, chat_id: '5511900000001@c.us', entry_key: 'lead', node: 's1', entered_at: T0 }, { automation_id: A, chat_id: '5511900000002@c.us', entry_key: 'lead', node: 's1', entered_at: Date.now() + DAY }] });
  const rows = calls.find((x) => x.method === 'POST').body;
  assert.deepStrictEqual([rows[0].created_at, 'created_at' in rows[1]], [new Date(T0).toISOString(), false]);
});
test('servidor: entrar no Follow 4 cria o percurso na etapa, com a entrada "de há 5 dias"; "Tirar das outras réguas" tira as outras (e a mesma régua recomeça)', async () => {
  const { a, calls, A } = server();
  const now = Date.now();
  const plan = E.seqManualPlan(regua(), 's4', { now, mode: 'agora' });
  const r = await a.seqManualEnter({ automationId: A, chatId: '5511900000001@c.us', plan: plain(plan), leaveOthers: true });
  const patches = calls.filter((x) => x.method === 'PATCH');
  assert.deepStrictEqual(patches.map((x) => [x.path.split('&')[0], x.body.status, x.body.outcome]), [['wa_sequence_runs?id=eq.11111111-1111-4111-8111-111111111111', 'saiu', 'reentrou'], ['wa_sequence_runs?id=eq.22222222-2222-4222-8222-222222222222', 'saiu', 'outra_regua']]);
  const post = calls.find((x) => x.method === 'POST' && x.path === 'wa_sequence_runs').body;
  assert.deepStrictEqual([post.node, post.created_at, post.skip_wait, post.branches.length, /^manual@\d+$/.test(post.entry_key)], ['s4', new Date(now - 5 * DAY).toISOString(), false, 3, true]);
  assert.strictEqual(r.left, 1);
  // sem "Tirar das outras réguas": só a mesma régua recomeça
  const s2 = server();
  await s2.a.seqManualEnter({ automationId: s2.A, chatId: '5511900000001@c.us', plan: plain(plan), leaveOthers: false });
  assert.deepStrictEqual(s2.calls.filter((x) => x.method === 'PATCH').map((x) => x.body.outcome), ['reentrou']);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
