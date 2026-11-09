// Testes da 2.13.2 (horário por automação e por etapa): node extension/tests/schedule.test.cjs
// - regras puras: horário personalizado (dias + faixas), "esperar até o próximo [dia] às HH:MM", "enviar só entre",
//   frases, aviso fora de 08:00–21:00, validação e a simulação com data e hora
// - motor de verdade (createMotor, ciclo completo tick) com API falsa: janela personalizada (inclusive fora do horário
//   geral), fora da janela espera a próxima, limite próprio por dia e os limites GERAIS continuam valendo
// - servidor: guarda o horário dentro do jsonb da sequência (sem migration)
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
const at = (s) => new Date(s).getTime(); // horário local (o motor usa o relógio do computador)
const GERAL = { business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6], max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false };
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const F2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
// seg–sex, 09:00–12:00 e 14:00–18:00
const CUSTOM = { mode: 'personalizado', days: [1, 2, 3, 4, 5], windows: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] };
const MON = '2026-11-09'; // segunda

test('horário personalizado: dentro da faixa envia; no intervalo do almoço espera as 14:00; depois das 18:00 o dia seguinte; sexta à noite a segunda', () => {
  const def = { schedule: CUSTOM, steps: [] };
  assert.strictEqual(E.nextSendTime(at(`${MON}T10:00`), def, null, GERAL), at(`${MON}T10:00`));
  assert.strictEqual(E.nextSendTime(at(`${MON}T12:30`), def, null, GERAL), at(`${MON}T14:00`));
  assert.strictEqual(E.nextSendTime(at(`${MON}T18:30`), def, null, GERAL), at('2026-11-10T09:00'));
  assert.strictEqual(E.nextSendTime(at('2026-11-13T19:00'), def, null, GERAL), at('2026-11-16T09:00')); // sex → seg
  // horário geral (sem personalizado): seg–sáb 09–19
  assert.strictEqual(E.nextSendTime(at('2026-11-14T18:00'), { steps: [] }, null, GERAL), at('2026-11-14T18:00')); // sábado
  assert.strictEqual(E.nextSendTime(at('2026-11-15T10:00'), { steps: [] }, null, GERAL), at('2026-11-16T09:00')); // domingo → seg
});
test('"esperar até o próximo dia às 10:00": começou segunda 15:00 → terça 10:00; começou 08:00 → hoje 10:00; "próxima sexta"', () => {
  assert.strictEqual(E.pausaUntil(at(`${MON}T15:00`), { until_day: 'qualquer', until_time: '10:00' }), at('2026-11-10T10:00'));
  assert.strictEqual(E.pausaUntil(at(`${MON}T08:00`), { until_day: 'qualquer', until_time: '10:00' }), at(`${MON}T10:00`));
  assert.strictEqual(E.pausaUntil(at(`${MON}T15:00`), { until_day: 5, until_time: '10:00' }), at('2026-11-13T10:00'));
  assert.strictEqual(E.pausaUntil(at('2026-11-13T11:00'), { until_day: 5, until_time: '10:00' }), at('2026-11-20T10:00')); // já passou: a outra sexta
});
test('motor (regra): ⏳ "até amanhã 10:00" espera e depois manda; com "enviar só entre 14:00 e 18:00" o envio fica para as 14:00', () => {
  const def = { start: { type: 'venda' }, business: false, steps: [{ id: 'p', type: 'pausa', mode: 'ate', until_day: 'qualquer', until_time: '10:00', send_window: { start: '14:00', end: '18:00' } }, { id: 'm', type: 'enviar', item_id: F1 }] };
  const run = { node: 'p', wait_started_at: at(`${MON}T15:00`), branches: [] };
  const w = E.seqStep({ def, run, chat: null, replies: [], now: at('2026-11-10T09:00'), settings: GERAL });
  assert.deepStrictEqual([w.status, w.dueAt], ['wait', at('2026-11-10T10:00')]);
  const r = E.seqStep({ def, run, chat: null, replies: [], now: at('2026-11-10T10:00'), settings: GERAL });
  assert.deepStrictEqual([r.status, r.send.itemId, plain(r.window)], ['run', F1, { start: '14:00', end: '18:00' }]);
  assert.strictEqual(E.nextSendTime(at('2026-11-10T10:00'), def, r.window, GERAL), at('2026-11-10T14:00')); // fora da faixa: a próxima
  assert.strictEqual(E.seqDescribe(def, { status: 'ativo', node: 'p', due_at: null }, at(`${MON}T15:00`)), 'esperando até o próximo dia às 10:00');
});
test('❓ esperar resposta com "enviar só entre": o prazo conta normal; o envio seguinte (✅ ou ❌) leva a faixa', () => {
  const def = { start: { type: 'lead' }, business: false, steps: [{ id: 'w', type: 'esperar', amount: 1, unit: 'horas', send_window: { start: '14:00', end: '18:00' }, yes: [{ id: 'y', type: 'enviar', item_id: F1 }], no: [{ id: 'n', type: 'enviar', item_id: F2 }] }] };
  const run = { node: 'w', wait_started_at: at(`${MON}T09:00`), last_sent_at: at(`${MON}T09:00`), branches: [] };
  const no = E.seqStep({ def, run, chat: { loaded: true, last: { t: at(`${MON}T09:00`) / 1000, fromMe: true } }, replies: [], now: at(`${MON}T10:01`), settings: GERAL });
  assert.deepStrictEqual([no.status, no.send.itemId, plain(no.window)], ['run', F2, { start: '14:00', end: '18:00' }]);
  const yes = E.seqStep({ def, run, chat: { loaded: true, last: { t: at(`${MON}T09:30`) / 1000, fromMe: false } }, replies: [], now: at(`${MON}T09:31`), settings: GERAL });
  assert.deepStrictEqual([yes.send.itemId, plain(yes.window)], [F1, { start: '14:00', end: '18:00' }]);
});
test('frases, aviso fora de 08:00–21:00 e validação', () => {
  assert.strictEqual(E.scheduleSentence({ schedule: CUSTOM }, GERAL), 'Seg–Sex 09:00–12:00 e 14:00–18:00');
  assert.strictEqual(E.scheduleSentence({ schedule: { mode: 'personalizado', days: [1, 3, 5], windows: [{ start: '14:00', end: '18:00' }], daily_limit: 20 } }, GERAL), 'Seg 14:00–18:00 · Qua 14:00–18:00 · Sex 14:00–18:00; no máximo 20 por dia');
  assert.match(E.scheduleSentence({}, GERAL), /^Envia no horário geral \(/);
  assert.strictEqual(E.scheduleOutsideCommon({ schedule: CUSTOM, steps: [] }), false);
  assert.strictEqual(E.scheduleOutsideCommon({ schedule: { mode: 'personalizado', days: [1], windows: [{ start: '20:00', end: '22:00' }] }, steps: [] }), true);
  assert.strictEqual(E.scheduleOutsideCommon({ steps: [{ id: 'p', type: 'pausa', amount: 1, unit: 'dias', send_window: { start: '06:30', end: '09:00' } }] }), true);
  const bad = plain(E.seqValidate({ start: { type: 'lead' }, schedule: { mode: 'personalizado', days: [], windows: [{ start: '18:00', end: '14:00' }] },
    steps: [{ id: 'p', type: 'pausa', mode: 'ate', until_time: '' }, { id: 'm', type: 'enviar', item_id: F1, }, { id: 'w', type: 'esperar', amount: 1, unit: 'dias', send_window: { start: '15:00', end: '15:00' }, yes: [], no: [] }] }));
  const msgs = bad.map((x) => `${x.node}: ${x.msg}`);
  assert.ok(msgs.includes('start: Horário personalizado: escolha pelo menos um dia.') && msgs.includes('start: Horário personalizado: cada faixa precisa de início antes do fim.')
    && msgs.includes('p: Escolha a hora (HH:MM).') && msgs.includes('w: "Enviar só entre": o início precisa ser antes do fim.'), JSON.stringify(msgs));
});
test('régua salva com ⏳ "até o próximo dia às 10:00" (sem amount, como o servidor guarda) reabre e salva de novo sem erro', () => {
  const def = { start: { type: 'lead' }, steps: [{ id: 'p', type: 'pausa', mode: 'ate', until_day: 'qualquer', until_time: '10:00' }, { id: 'm', type: 'enviar', item_id: F1 }] };
  assert.deepStrictEqual(plain(E.seqValidate(def)), []);
});
test('Simular com data e hora: cada envio cai no horário da automação e na faixa da etapa', () => {
  const def = E.seqNormalize({ start: { type: 'venda' }, business: false, schedule: CUSTOM, steps: [
    { id: 'm1', type: 'enviar', item_id: F1 },
    { id: 'p', type: 'pausa', mode: 'ate', until_day: 'qualquer', until_time: '10:00', send_window: { start: '14:00', end: '18:00' } },
    { id: 'm2', type: 'enviar', item_id: F2 },
  ] });
  const ev = plain(E.seqSimulate(def, 'nunca', { startAt: at('2026-11-13T19:30'), settings: GERAL, itemTitle: (id) => (id === F1 ? 'Oi' : 'Oferta') })); // sexta 19:30
  const sends = ev.filter((e) => e.kind === 'enviar').map((e) => [e.text, new Date(e.when).toString().slice(0, 21)]);
  // sexta 19:30 → "Oi" na segunda 09:00 (horário da automação); espera até 10:00 (o mesmo dia); a faixa 14–18 → 14:00
  assert.deepStrictEqual(sends, [['Recebe “Oi”', 'Mon Nov 16 2026 09:00'], ['Recebe “Oferta”', 'Mon Nov 16 2026 14:00']]);
  // sem startAt: como antes (tempo relativo)
  assert.ok(plain(E.seqSimulate(def, 'nunca', {})).every((e) => e.when === undefined));
});

// ── 2.14.3: horário por dia da semana ──
const W = (a, b) => ({ start: a, end: b });
// Seg–Sex 09:00–12:00 e 14:00–18:00 (duas faixas), Sáb 10:00–14:00 (diferente), Dom fechado
const WEEK = [[], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('10:00', '14:00')]];
const SAT = '2026-11-14';
test('horário por dia: sábado com horário diferente, domingo fechado, duas faixas no mesmo dia (automação personalizada)', () => {
  const def = { schedule: { mode: 'personalizado', week: WEEK }, steps: [] };
  assert.strictEqual(E.nextSendTime(at(`${SAT}T11:00`), def, null, GERAL), at(`${SAT}T11:00`)); // sábado 10–14
  assert.strictEqual(E.nextSendTime(at(`${SAT}T15:00`), def, null, GERAL), at('2026-11-16T09:00')); // passou o sábado; domingo fechado → segunda
  assert.strictEqual(E.nextSendTime(at('2026-11-15T10:00'), def, null, GERAL), at('2026-11-16T09:00')); // domingo fechado
  assert.strictEqual(E.nextSendTime(at(`${MON}T12:30`), def, null, GERAL), at(`${MON}T14:00`)); // entre as duas faixas
  assert.strictEqual(E.nextSendTime(at(`${MON}T18:30`), def, null, GERAL), at('2026-11-10T09:00'));
  assert.strictEqual(E.scheduleSentence(def, GERAL), 'Seg–Sex 09:00–12:00 e 14:00–18:00 · Sáb 10:00–14:00');
  assert.deepStrictEqual(plain(E.scheduleProblems({ schedule: { mode: 'personalizado', week: [[], [], [], [], [], [], []] }, steps: [] })).map((x) => x.msg), ['Horário personalizado: deixe pelo menos um dia aberto.']);
  assert.deepStrictEqual(plain(E.scheduleProblems({ schedule: { mode: 'personalizado', week: [[], [W('18:00', '14:00')], [], [], [], [], []] }, steps: [] })).map((x) => x.msg), ['Horário personalizado: cada faixa precisa de início antes do fim.']);
});
test('horário GERAL por dia (business_week): o motor, "está no horário?", a previsão do disparo e o resumo usam a linha de cada dia', () => {
  const G = { ...GERAL, business_week: WEEK };
  assert.strictEqual(E.isBusinessTime(at(`${SAT}T13:00`), G), true);
  assert.strictEqual(E.isBusinessTime(at(`${SAT}T15:00`), G), false); // antes (geral antigo: até 19:00) seria true
  assert.strictEqual(E.isBusinessTime(at(`${MON}T13:00`), G), false); // intervalo entre as faixas
  assert.strictEqual(E.isBusinessTime(at('2026-11-15T10:00'), G), false);
  assert.strictEqual(E.scheduleText(G), 'Seg–Sex 09:00–12:00 e 14:00–18:00 · Sáb 10:00–14:00');
  assert.strictEqual(E.scheduleText(GERAL), 'Seg–Sáb 09:00–19:00'); // sem a semana: o formato antigo, igual
  // disparo sem horário próprio usa o geral por dia: sábado 15:00 → espera segunda 09:00
  const g = plain(E.campaignGate({ speed: { preset: 'normal' }, now: at(`${SAT}T15:00`), settings: G }));
  assert.deepStrictEqual([g.ok, g.until], [false, at('2026-11-16T09:00')]);
  const fc = E.campaignForecast(5, { preset: 'normal' }, G, at(`${SAT}T13:55`));
  assert.ok(fc.endAt >= at('2026-11-16T09:00'), new Date(fc.endAt).toString()); // sábado fecha às 14:00
});
test('conversão: horário salvo no formato antigo (dias marcados + faixas) vira a semana com o MESMO resultado', () => {
  const old = { mode: 'personalizado', days: [1, 2, 3, 4, 5], windows: [W('14:00', '18:00'), W('09:00', '12:00')], daily_limit: 7 };
  const conv = plain(E.scheduleWeekJson(old));
  assert.deepStrictEqual(conv, { mode: 'personalizado', week: [[], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], [W('09:00', '12:00'), W('14:00', '18:00')], []], daily_limit: 7 });
  for (let h = 0; h < 24 * 8; h += 1) {
    const t = at(`${MON}T00:30`) + h * 3600000;
    assert.strictEqual(E.nextSendTime(t, { schedule: conv }, null, GERAL), E.nextSendTime(t, { schedule: old }, null, GERAL), new Date(t).toString());
  }
  assert.strictEqual(E.scheduleSentence({ schedule: old }, GERAL), E.scheduleSentence({ schedule: conv }, GERAL));
  // "Copiar para os dias úteis": segunda → terça a sexta; aviso amarelo por linha
  const cp = plain(E.copyToWeekdays([[], [W('19:00', '22:00')], [], [W('08:00', '09:00')], [], [], [W('10:00', '14:00')]]));
  assert.deepStrictEqual(cp.map((x) => x.map((w) => `${w.start}-${w.end}`).join()), ['', '19:00-22:00', '19:00-22:00', '19:00-22:00', '19:00-22:00', '19:00-22:00', '10:00-14:00']);
  assert.strictEqual(E.weekSummary(E.weekFromJson(cp)), 'Seg–Sex 19:00–22:00 · Sáb 10:00–14:00');
  assert.deepStrictEqual(cp.map((x) => E.rowOutsideCommon(x)), [false, true, true, true, true, true, false]);
});

// ── motor de verdade (tick) ──
function motorWith({ schedule = null, counts = { hour: 0, day: 0 }, sentToday = 0, nowAt }) {
  const now = { t: nowAt };
  const def = { start: { type: 'manual' }, business: false, ...(schedule ? { schedule } : {}), steps: [{ id: 'm', type: 'enviar', item_id: F1 }, { id: 'f', type: 'fim' }] };
  const seq = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Régua', active: true, kind: 'sequencia', sequence: def, activated_at: new Date(nowAt - DAY).toISOString(), test_chat_id: null };
  const db = { runs: [{ id: 'r1', automation_id: seq.id, chat_id: '5511900000001@c.us', entry_key: 'insc@1', node: 'm', status: 'ativo', version: 0, branches: [] }], sent: [], patches: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: GERAL, automations: true, sequences: true, automationsV25: false };
    if (type === 'claimLease') return { held: true, lease_until: new Date(now.t + 5 * MIN).toISOString(), settings: GERAL };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'sendCounts') return counts;
    if (type === 'automationSentToday') return { count: sentToday };
    if (type === 'activeEnrollments') return [];
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: { id: 'k', name: 'Ana', labelIds: [] } }));
    if (type === 'seqReplies') return {};
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      db.patches.push(p.patch);
      Object.assign(r, p.patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') return { id: 'l1' };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => now.t, setWake: () => 0, clearWake: () => {},
    wa: { ready: async () => true, chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: null, labels: [] }])) }), setChatLabels: async () => ({ confirmed: true }) },
    sendParts: async ({ chatId }) => { db.sent.push({ chatId, at: now.t }); return { status: 'ok', sent: 1 }; },
    partsOf: () => [{ type: 'texto', body: 'oi' }],
    itemById: async (id) => ({ id, title: 'Oi' }),
  });
  return { motor, db, now };
}
const ticks = async (m, n = 4) => { for (let i = 0; i < n; i++) { m.motor.state.workAt = 0; m.motor.state.seqEvalAt = 0; await m.motor.tick(); } };
test('motor: horário personalizado manda dentro da faixa, inclusive FORA do horário geral (domingo, que o geral não tem)', async () => {
  const m = motorWith({ schedule: { mode: 'personalizado', days: [0], windows: [{ start: '10:00', end: '12:00' }] }, nowAt: at('2026-11-15T10:30') }); // domingo
  await ticks(m);
  assert.strictEqual(m.db.sent.length, 1);
  // a mesma régua no horário geral, no domingo: não manda
  const g = motorWith({ nowAt: at('2026-11-15T10:30') });
  await ticks(g);
  assert.strictEqual(g.db.sent.length, 0);
});
test('motor: fora da janela personalizada espera a próxima (o painel mostra quando) e não manda', async () => {
  const m = motorWith({ schedule: CUSTOM, nowAt: at(`${MON}T12:30`) });
  await ticks(m);
  assert.strictEqual(m.db.sent.length, 0);
  assert.ok(m.db.patches.some((p) => p.due_at === at(`${MON}T14:00`)), JSON.stringify(m.db.patches));
  m.now.t = at(`${MON}T14:01`);
  await ticks(m);
  assert.strictEqual(m.db.sent.length, 1);
});
test('motor: os limites GERAIS por hora/dia continuam valendo dentro da janela personalizada; e o limite próprio por dia também', async () => {
  const full = motorWith({ schedule: CUSTOM, counts: { hour: 30, day: 40 }, nowAt: at(`${MON}T10:00`) });
  await ticks(full);
  assert.strictEqual(full.db.sent.length, 0);
  const own = motorWith({ schedule: { ...CUSTOM, daily_limit: 5 }, sentToday: 5, nowAt: at(`${MON}T10:00`) });
  await ticks(own);
  assert.strictEqual(own.db.sent.length, 0);
  const ok = motorWith({ schedule: { ...CUSTOM, daily_limit: 5 }, sentToday: 4, nowAt: at(`${MON}T10:00`) });
  await ticks(ok);
  assert.strictEqual(ok.db.sent.length, 1);
});

// ── servidor ──
function api() {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    calls.push({ method: init.method || 'GET', path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if ((init.method || 'GET') === 'POST' && p === 'wa_automations') return res(201, [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls };
}
test('servidor: horário personalizado, limite por dia, "até o próximo dia às" e "enviar só entre" ficam no jsonb (sem migration); errado é recusado', async () => {
  const { a, calls } = api();
  const seq = { start: { type: 'lead' }, schedule: { ...CUSTOM, daily_limit: 20 }, steps: [
    { id: 'p', type: 'pausa', mode: 'ate', until_day: 'qualquer', until_time: '10:00', send_window: { start: '14:00', end: '18:00' } },
    { id: 'm', type: 'enviar', item_id: F1 },
    { id: 'w', type: 'esperar', amount: 1, unit: 'dias', send_window: { start: '09:00', end: '12:00' }, yes: [], no: [] }] };
  await a.saveAutomation({ automation: { kind: 'sequencia', name: 'Horários', sequence: seq } });
  const post = calls.find((x) => x.method === 'POST' && x.path === 'wa_automations').body.sequence;
  // 2.14.3: o formato antigo (dias + faixas) é gravado como a semana, com o mesmo resultado
  const W = [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }];
  assert.deepStrictEqual(plain(post.schedule), { mode: 'personalizado', week: [[], W, W, W, W, W, []], daily_limit: 20 });
  assert.deepStrictEqual(post.steps[0], { id: 'p', type: 'pausa', mode: 'ate', until_day: 'qualquer', until_time: '10:00', send_window: { start: '14:00', end: '18:00' } });
  assert.deepStrictEqual(post.steps[2].send_window, { start: '09:00', end: '12:00' });
  await assert.rejects(a.saveAutomation({ automation: { kind: 'sequencia', name: 'x', sequence: { ...seq, schedule: { mode: 'personalizado', days: [1], windows: [{ start: '18:00', end: '14:00' }] } } } }), /início precisa ser antes do fim/);
  await assert.rejects(a.saveAutomation({ automation: { kind: 'sequencia', name: 'x', sequence: { ...seq, schedule: { mode: 'personalizado', days: [], windows: [{ start: '09:00', end: '12:00' }] } } } }), /pelo menos um dia/);
  // sem horário personalizado: nada novo no jsonb (igual a antes)
  await a.saveAutomation({ automation: { kind: 'sequencia', name: 'Geral', sequence: { start: { type: 'lead' }, schedule: { mode: 'geral' }, steps: [{ id: 'm', type: 'enviar', item_id: F1 }] } } });
  assert.strictEqual('schedule' in calls.filter((x) => x.method === 'POST' && x.path === 'wa_automations').pop().body.sequence, false);
});
test('servidor: horário GERAL por dia vai para o system_config (sem migration), com o resumo nos campos antigos; e volta junto das configurações', async () => {
  const stored = {};
  const settingsRow = { id: 1, paused_all: false, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6] };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (table === 'wa_settings') { if (init.method === 'PATCH') Object.assign(settingsRow, body); return res(200, [{ ...settingsRow }]); }
    if (table === 'system_config') { if (init.method === 'POST') { stored[body.key] = body.value; return res(201, null); } const k = (u.searchParams.get('key') || '').replace('eq.', ''); return res(200, stored[k] ? [{ key: k, value: stored[k] }] : []); }
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  const r = await c.WaApi.updateEngineSettings({ business_week: WEEK, max_per_hour: 30 });
  assert.strictEqual(stored.wa_business_week, JSON.stringify(WEEK));
  assert.deepStrictEqual([plain(settingsRow.business_days), settingsRow.business_start, settingsRow.business_end], [[1, 2, 3, 4, 5, 6], '09:00', '18:00']);
  assert.deepStrictEqual(plain(r.settings.business_week), WEEK);
  assert.strictEqual(E.scheduleText(r.settings), 'Seg–Sex 09:00–12:00 e 14:00–18:00 · Sáb 10:00–14:00');
  await assert.rejects(c.WaApi.updateEngineSettings({ business_week: [[], [], [], [], [], [], []] }), /deixe pelo menos um dia aberto/);
  await assert.rejects(c.WaApi.updateEngineSettings({ business_week: [[], [W('18:00', '09:00')], [], [], [], [], []] }), /início precisa ser antes do fim/);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
