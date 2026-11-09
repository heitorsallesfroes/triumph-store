// Testes da 2.13.0 (construtor visual de automações, em cascata). node extension/tests/builder.test.cjs
// - modelos (régua de follow-up de 3 etapas, pós-venda, lead que sumiu, em branco)
// - motor (seqStep e createMotor com API falsa): respondeu no 1º passo, não respondeu até o fim, resposta durante a
//   espera, incluir quem já está na etiqueta, ⏳ ESPERAR simples, "Nunca para quem tem a etiqueta" (CRM e WhatsApp)
// - desenho: FIM automático no fim de cada caminho, inserir caixa ("+"), excluir, simulação, conversão das antigas
// - servidor: ⏳, exclusões e até 5 níveis de "esperar resposta"
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
const SETTINGS = { business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5] };
const F = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'];
const ATEND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const FRIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const FU1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const T0 = Date.parse('2026-11-02T10:00:00-03:00'); // segunda, 10h

// régua de 3 etapas com as mensagens trocadas e as etiquetas criadas; horário corrido para contas simples
function regua({ business = false } = {}) {
  const def = plain(E.seqTemplate('followup3'));
  def.business = business;
  def.start.label_id = FU1;
  let k = 0;
  E.seqIndex(def).forEach(({ node: n }) => {
    if (n.type === 'enviar') { n.item_id = F[k++]; delete n.hint; }
    if (n.type === 'etiqueta') n.label_id = n.label_id === 'new:Frio' ? FRIO : ATEND;
  });
  return def;
}
// aplica as decisões como o motor faz
function runner(def) {
  const run = { node: null, wait_started_at: null, last_sent_at: null, skip_wait: false, branches: [] };
  const log = { sends: [], ops: [], outcome: null, ended: false, sentAt: [] };
  let chat = { loaded: true, last: null };
  const idx = E.seqIndex(def);
  return {
    run, log,
    theirs(t) { chat = { loaded: true, last: { t: t / 1000, fromMe: false } }; },
    tick(now) {
      for (let g = 0; g < 10 && !log.ended; g++) {
        const r = E.seqStep({ def, run, chat, replies: [], now, settings: SETTINGS });
        log.ops.push(...r.ops);
        run.branches.push(...r.branches);
        if (r.status === 'wait') return r;
        if (r.status === 'end') { log.ended = true; log.outcome = r.outcome; return r; }
        if (r.status === 'progress') { run.node = r.node; run.wait_started_at = r.waitStart; return r; }
        log.sends.push(r.send.itemId);
        log.sentAt.push(now);
        run.last_sent_at = now;
        chat = { loaded: true, last: { t: now / 1000, fromMe: true } };
        run.node = r.node;
        const next = r.node && idx.get(r.node);
        run.wait_started_at = next && ['esperar', 'pausa'].includes(next.node.type) ? now : null;
        if (!r.node) { log.ended = true; log.outcome = E.seqOutcome(run.branches); return r; }
        return r;
      }
      return null;
    },
  };
}
const labelsOf = (ops) => ops.map((o) => `${o.op}:${o.label_id === ATEND ? 'Em atendimento' : o.label_id === FRIO ? 'Frio' : o.label_id}`);

// ── modelos ──
test('modelo "Régua de follow-up (3 etapas)": Follow Up 1 → Follow 1 → resposta 1 dia → ✅ Em atendimento / ❌ Follow 2 → 2 dias → ❌ Follow 3 → 3 dias → ❌ Frio', () => {
  const def = plain(E.seqTemplate('followup3'));
  assert.deepStrictEqual(def.start, { type: 'etiqueta', source: 'crm', label_id: 'new:Follow Up 1' });
  const [s1, w1] = def.steps;
  assert.deepStrictEqual([s1.type, s1.hint, w1.type, w1.amount, w1.unit], ['enviar', 'Follow 1', 'esperar', 1, 'dias']);
  assert.deepStrictEqual(w1.yes.map((n) => n.type), ['etiqueta', 'fim']);
  assert.strictEqual(w1.yes[0].label_id, 'new:Em atendimento');
  const w2 = w1.no[1];
  const w3 = w2.no[1];
  assert.deepStrictEqual([w1.no[0].hint, w2.amount, w2.no[0].hint, w3.amount], ['Follow 2', 2, 'Follow 3', 3]);
  assert.deepStrictEqual(w3.no.map((n) => [n.type, n.label_id || null]), [['etiqueta', 'new:Frio'], ['fim', null]]);
  assert.deepStrictEqual(plain(E.seqValidate(regua())), []);
  // só falta trocar as mensagens: sem elas, as 3 caixas de envio ficam vermelhas
  const empty = plain(E.seqValidate(def)).filter((x) => x.msg === 'Escolha ou crie a mensagem.');
  assert.strictEqual(empty.length, 3);
});
test('modelos "Pós-venda" (venda → ⏳ 7 dias → avaliação → fim), "Lead novo que sumiu" e "Em branco"', () => {
  const p = plain(E.seqTemplate('posvenda'));
  assert.deepStrictEqual([p.start.type, p.steps.map((n) => n.type), p.steps[0].amount, p.steps[0].unit], ['venda', ['pausa', 'enviar', 'fim'], 7, 'dias']);
  const l = plain(E.seqTemplate('lead_sumiu'));
  assert.deepStrictEqual([l.start.type, l.start.origin, l.steps[0].type, l.steps[0].after_mine], ['lead', 'todos', 'esperar', true]);
  const v = plain(E.seqTemplate('vazio'));
  assert.deepStrictEqual([v.start.type, v.steps.map((n) => n.type)], ['etiqueta', ['fim']]);
  assert.ok(plain(E.seqValidate(v)).some((x) => x.node === 'start'), 'em branco: falta escolher a etiqueta e uma caixa que faça algo');
});

// ── motor: os 4 casos pedidos ──
test('respondeu no 1º passo: recebe Follow 1, responde no mesmo dia → ✅ Em atendimento e FIM (sem Follow 2)', () => {
  const s = runner(regua());
  s.tick(T0); // Follow 1
  s.tick(T0 + MIN); // entra na espera (já gravada no envio)
  s.theirs(T0 + 3 * HOUR);
  s.tick(T0 + 3 * HOUR + MIN);
  assert.deepStrictEqual([s.log.sends, s.log.ended, s.log.outcome, labelsOf(s.log.ops)], [[F[0]], true, 'respondeu', ['colocar:Em atendimento']]);
});
test('não respondeu até o fim: Follow 1 → 1 dia → Follow 2 → 2 dias → Follow 3 → 3 dias → Frio e FIM', () => {
  const s = runner(regua());
  s.tick(T0);
  assert.strictEqual(s.tick(T0 + DAY - MIN).status, 'wait');
  s.tick(T0 + DAY + MIN); // Follow 2
  const t2 = T0 + DAY + MIN;
  assert.strictEqual(s.tick(t2 + 2 * DAY - MIN).status, 'wait');
  s.tick(t2 + 2 * DAY + MIN); // Follow 3
  const t3 = t2 + 2 * DAY + MIN;
  assert.strictEqual(s.tick(t3 + 3 * DAY - MIN).status, 'wait');
  s.tick(t3 + 3 * DAY + MIN);
  assert.deepStrictEqual([s.log.sends, s.log.outcome, labelsOf(s.log.ops)], [[F[0], F[1], F[2]], 'nao_respondeu', ['colocar:Frio']]);
  assert.deepStrictEqual(plain(s.run.branches.map((b) => b.result)), ['nao', 'nao', 'nao']);
});
test('resposta durante a espera: depois do Follow 2, responde no meio dos 2 dias → ✅ Em atendimento (sem Follow 3)', () => {
  const s = runner(regua());
  s.tick(T0);
  s.tick(T0 + DAY + MIN); // Follow 2
  s.theirs(T0 + 2 * DAY);
  s.tick(T0 + 2 * DAY + MIN);
  assert.deepStrictEqual([s.log.sends, s.log.outcome, labelsOf(s.log.ops)], [[F[0], F[1]], 'respondeu', ['colocar:Em atendimento']]);
  assert.deepStrictEqual(plain(s.run.branches.map((b) => b.result)), ['nao', 'sim']);
});

function motorWith({ includeExisting = false, contacts = [], waLabels = [], chatLabels = {}, exclude = null }) {
  const now = { t: T0 + 10 * MIN };
  const def = regua();
  if (exclude) def.start.exclude = exclude;
  const seq = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Régua', active: true, kind: 'sequencia', sequence: def, activated_at: new Date(T0).toISOString(), include_existing: includeExisting, test_chat_id: null };
  const db = { runs: [], sent: [], created: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { ...SETTINGS, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false, business_days: [0, 1, 2, 3, 4, 5, 6] }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates') return contacts;
    if (type === 'seqCreateRuns') { p.items.forEach((it) => { if (!db.runs.some((r) => r.chat_id === it.chat_id)) db.runs.push({ id: `r${db.runs.length + 1}`, version: 0, status: 'ativo', branches: [], ...it }); }); db.created.push(...p.items); return { created: p.items.length }; }
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => { const c = contacts.find((x) => x.chat_id === r.chat_id) || {}; return { ...r, contact: { id: c.id || 'k', name: c.name || 'Ana', labelIds: c.labelIds || [] } }; });
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
    if (type === 'saleContactLabels') return { contactId: 'k', labelIds: [p.addLabelId].filter(Boolean) };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => now.t,
    wa: {
      ready: async () => true, labels: async () => waLabels,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: db.chat || null, labels: chatLabels[c] || [] }])) }),
      setChatLabels: async () => ({ confirmed: true }),
    },
    sendParts: async ({ parts, chatId }) => { db.sent.push({ chatId, body: parts[0].body }); db.chat = { t: now.t / 1000, fromMe: true }; return { status: 'ok', sent: 1 }; },
    partsOf: (item) => [{ type: 'texto', body: item.title }],
    itemById: async (id) => ({ id, title: { [F[0]]: 'Follow 1', [F[1]]: 'Follow 2', [F[2]]: 'Follow 3' }[id] }),
  });
  return { motor, db, now };
}
const person = (n, enteredAt) => ({ id: `k${n}`, name: `Pessoa ${n}`, chat_id: `551190000000${n}@c.us`, labelIds: [FU1], links: [{ label_id: FU1, created_at: new Date(enteredAt).toISOString() }] });
test('incluir quem já está: só daqui pra frente (padrão) ignora quem entrou na etiqueta antes de ligar; "também quem já está" inclui', async () => {
  const contacts = [person(1, T0 - 3 * DAY), person(2, T0 + 5 * MIN)]; // 1 já estava; 2 entrou depois de ligar
  const a = motorWith({ contacts });
  await a.motor.loadSettings();
  await a.motor.refreshActivity();
  await a.motor._sequencesOnce();
  assert.deepStrictEqual(a.db.runs.map((r) => r.chat_id), ['5511900000002@c.us']);
  assert.deepStrictEqual(a.db.sent.map((x) => x.body), ['Follow 1']);
  const b = motorWith({ contacts, includeExisting: true });
  await b.motor.loadSettings();
  await b.motor.refreshActivity();
  await b.motor._sequencesOnce();
  assert.deepStrictEqual(b.db.runs.map((r) => r.chat_id).sort(), ['5511900000001@c.us', '5511900000002@c.us']);
});
test('"Nunca para quem tem a etiqueta": CRM e WhatsApp tiram da automação sem enviar; o "Não enviar" do WhatsApp também', async () => {
  const VIP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const contacts = [{ ...person(3, T0 + MIN), labelIds: [FU1, VIP] }, person(4, T0 + MIN), person(5, T0 + MIN)];
  const m = motorWith({ contacts, exclude: [{ source: 'crm', label_id: VIP }, { source: 'whatsapp', wa_label_id: '7' }], waLabels: [{ id: '9', name: 'Não enviar' }],
    chatLabels: { '5511900000004@c.us': ['7'], '5511900000005@c.us': ['9'] } });
  await m.motor.loadSettings();
  await m.motor.refreshActivity();
  await m.motor._sequencesOnce(); // cria os percursos
  await m.motor._sequencesOnce();
  assert.deepStrictEqual(m.db.sent.length, 0);
  assert.deepStrictEqual(m.db.runs.map((r) => [r.chat_id.slice(-6, -5), r.status, r.outcome]).sort(), [['3', 'saiu', 'etiqueta_excluida'], ['4', 'saiu', 'etiqueta_excluida'], ['5', 'saiu', 'nao_enviar']]);
  assert.strictEqual(E.seqExcluded({ exclude: [{ source: 'crm', label_id: VIP }] }, [VIP], []), true);
  assert.strictEqual(E.seqExcluded({}, [VIP], ['7']), false);
});
test('⏳ ESPERAR (só o tempo): espera e segue, responda ou não; com horário comercial, conta só o expediente', () => {
  const def = { start: { type: 'venda' }, business: false, steps: [{ id: 'p', type: 'pausa', amount: 7, unit: 'dias' }, { id: 'm', type: 'enviar', item_id: F[0] }, { id: 'f', type: 'fim' }] };
  const run = { node: null, branches: [] };
  const r1 = E.seqStep({ def, run, chat: null, replies: [], now: T0, settings: SETTINGS });
  assert.deepStrictEqual([r1.status, r1.node, r1.waitStart], ['progress', 'p', T0]);
  const r2 = E.seqStep({ def, run: { node: 'p', wait_started_at: T0, branches: [] }, chat: { loaded: true, last: { t: (T0 + DAY) / 1000, fromMe: false } }, replies: [], now: T0 + 6 * DAY, settings: SETTINGS });
  assert.deepStrictEqual([r2.status, r2.dueAt], ['wait', T0 + 7 * DAY]); // a resposta não muda nada
  const r3 = E.seqStep({ def, run: { node: 'p', wait_started_at: T0, branches: [] }, chat: null, replies: [], now: T0 + 7 * DAY + 1, settings: SETTINGS });
  assert.deepStrictEqual([r3.status, r3.send.itemId], ['run', F[0]]);
  const biz = { ...def, business: true, steps: [{ id: 'p', type: 'pausa', amount: 2, unit: 'horas' }, def.steps[1]] };
  const fri = Date.parse('2026-11-06T18:30:00-03:00');
  const r4 = E.seqStep({ def: biz, run: { node: 'p', wait_started_at: fri, branches: [] }, chat: null, replies: [], now: fri + 3 * HOUR, settings: SETTINGS });
  assert.deepStrictEqual([r4.status, r4.dueAt], ['wait', Date.parse('2026-11-09T10:30:00-03:00')]);
  assert.strictEqual(E.seqDescribe(def, { status: 'ativo', node: 'p', due_at: T0 + 3 * HOUR }, T0), 'esperando (faltam 3h00)');
  assert.ok(plain(E.seqValidate({ ...def, steps: [{ id: 'p', type: 'pausa', amount: 0, unit: 'dias' }, def.steps[1]] })).some((x) => x.node === 'p'));
});

// ── desenho ──
test('todo caminho termina em FIM (posto sozinho), sem mudar o que o motor faz', () => {
  const def = { start: { type: 'lead' }, steps: [{ id: 'm', type: 'enviar', item_id: F[0] }, { id: 'w', type: 'esperar', amount: 1, unit: 'dias', yes: [], no: [{ id: 'm2', type: 'enviar', item_id: F[1] }] }] };
  const n = E.seqNormalize(def);
  assert.deepStrictEqual(plain(n.steps.map((x) => x.type)), ['enviar', 'esperar']); // depois da espera, só os caminhos
  assert.deepStrictEqual(plain([n.steps[1].yes.map((x) => x.type), n.steps[1].no.map((x) => x.type)]), [['fim'], ['enviar', 'fim']]);
  assert.strictEqual(def.steps[1].yes.length, 0, 'não mexe no original');
  const again = E.seqNormalize(n);
  assert.strictEqual(JSON.stringify(again.steps.map((x) => x.type)), JSON.stringify(n.steps.map((x) => x.type))); // não duplica
});
test('"+" entre duas caixas: insere ali; ❓ no meio leva o que vinha embaixo para o ❌; excluir tira a caixa', () => {
  const list = [{ id: 'a', type: 'enviar' }, { id: 'b', type: 'enviar' }, { id: 'f', type: 'fim' }];
  E.seqInsert(list, 1, { id: 'p', type: 'pausa', amount: 1, unit: 'dias' });
  assert.deepStrictEqual(plain(list.map((n) => n.id)), ['a', 'p', 'b', 'f']);
  const w = E.seqInsert(list, 2, { id: 'w', type: 'esperar', amount: 1, unit: 'dias', yes: [], no: [] });
  assert.deepStrictEqual(plain([list.map((n) => n.id), w.no.map((n) => n.id), w.yes.length]), [['a', 'p', 'w'], ['b'], 0]);
  const def = { start: {}, steps: list };
  assert.strictEqual(E.seqRemove(def, 'b'), true);
  assert.deepStrictEqual(w.no.length, 0);
  E.seqRemove(def, 'w');
  assert.deepStrictEqual(plain(def.steps.map((n) => n.id)), ['a', 'p']);
});
test('Simular: quem nunca responde passa por tudo (Frio); quem responde no 1º passo vai para Em atendimento', () => {
  const opt = { itemTitle: (id) => ({ [F[0]]: 'Follow 1', [F[1]]: 'Follow 2', [F[2]]: 'Follow 3' }[id]), labelName: (id) => (id === ATEND ? 'Em atendimento' : id === FRIO ? 'Frio' : id) };
  const never = plain(E.seqSimulate(E.seqNormalize(regua()), 'nunca', opt));
  assert.deepStrictEqual(never.map((e) => [E.simAtText(e.at), e.text]), [
    ['na hora', 'Entra na automação'], ['na hora', 'Recebe “Follow 1”'], ['+1 dia', '❌ Não respondeu em 1 dia'], ['+1 dia', 'Recebe “Follow 2”'],
    ['+3 dias', '❌ Não respondeu em 2 dias'], ['+3 dias', 'Recebe “Follow 3”'], ['+6 dias', '❌ Não respondeu em 3 dias'], ['+6 dias', 'Entra na etiqueta “Frio”'], ['+6 dias', 'Fim: sai da automação'],
  ]);
  const first = plain(E.seqSimulate(E.seqNormalize(regua()), 'primeiro', opt));
  assert.deepStrictEqual(first.map((e) => e.text), ['Entra na automação', 'Recebe “Follow 1”', '✅ Respondeu', 'Entra na etiqueta “Em atendimento”', 'Fim: sai da automação']);
  assert.strictEqual(E.simAtText(1500), '+1 dia 1 h');
});
test('automações antigas abrem no desenho quando dá (entrou na etiqueta, venda, não respondeu); as outras ficam no editor antigo', () => {
  const LBL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const base = { name: 'X', conditions: [], trigger_label_source: 'crm', trigger_label_id: LBL };
  const a1 = E.seqFromAutomation({ ...base, trigger_type: 'entrou_etiqueta', wait_minutes: 2 * 1440, actions: [{ type: 'enviar', item_id: F[0], variants: [] }, { type: 'mover', label_id: ATEND }] });
  assert.deepStrictEqual(plain(a1.def.start), { type: 'etiqueta', source: 'crm', label_id: LBL });
  assert.deepStrictEqual(plain(a1.def.steps).map((n) => [n.type, n.amount || n.item_id || n.op || null, n.label_id || null]),
    [['pausa', 2, null], ['enviar', F[0], null], ['etiqueta', 'tirar', LBL], ['etiqueta', 'colocar', ATEND], ['fim', null, null]]);
  assert.deepStrictEqual(plain(E.seqValidate(a1.def)), []);
  const a2 = E.seqFromAutomation({ ...base, trigger_type: 'venda_registrada', trigger_label_id: null, wait_minutes: null, actions: [{ type: 'enviar', item_id: F[1], variants: [] }] });
  assert.deepStrictEqual(plain([a2.def.start.type, a2.def.steps.map((n) => n.type)]), ['venda', ['enviar', 'fim']]);
  const a3 = E.seqFromAutomation({ ...base, trigger_type: 'sem_resposta', wait_minutes: 180, actions: [{ type: 'enviar', item_id: F[2], variants: [] }] });
  const w = a3.def.steps[0];
  assert.deepStrictEqual(plain([w.type, w.amount, w.unit, w.after_mine, w.yes.map((n) => n.type), w.no.map((n) => n.type)]), ['esperar', 3, 'horas', true, ['fim'], ['enviar', 'fim']]);
  const wa = E.seqFromAutomation({ ...base, trigger_type: 'entrou_etiqueta', trigger_label_source: 'whatsapp', trigger_wa_label_id: '4', trigger_label_id: null, wait_minutes: 30, actions: [{ type: 'adicionar_etiqueta_wa', wa_label_id: '5' }] });
  assert.deepStrictEqual(plain([wa.def.start.source, wa.def.start.wa_label_id, wa.def.steps[0].unit, wa.def.steps[1].source]), ['whatsapp', '4', 'minutos', 'whatsapp']);
  assert.match(E.seqFromAutomation({ ...base, trigger_type: 'respondeu', actions: [] }).reason, /respondeu/);
  assert.match(E.seqFromAutomation({ ...base, trigger_type: 'dia_hora', actions: [] }).reason, /dia e hora/);
  assert.match(E.seqFromAutomation({ ...base, trigger_type: 'entrou_etiqueta', conditions: [{ type: 'parada_max_dias', days: 3 }], actions: [] }).reason, /condições/);
  assert.match(E.seqFromAutomation({ ...base, trigger_type: 'entrou_etiqueta', wait_minutes: 5, actions: [{ type: 'enviar', item_id: F[0], variants: [{ when: 'anuncio', keyword: 'x', item_id: F[1] }] }] }).reason, /variantes/);
  const seq = E.seqFromAutomation({ kind: 'sequencia', sequence: regua() });
  assert.strictEqual(seq.def.steps.length, 2);
});

// ── servidor ──
function api() {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'POST' && p === 'wa_automations') return res(201, [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls };
}
test('servidor: salva a régua normalizada, com ⏳, "Nunca para quem tem" e até 5 "esperar resposta" um dentro do outro', async () => {
  const { a, calls } = api();
  const def = E.seqNormalize(regua());
  def.start.exclude = [{ source: 'crm', label_id: FRIO }, { source: 'whatsapp', wa_label_id: '7' }];
  def.steps.unshift({ id: 'pz', type: 'pausa', amount: 2, unit: 'horas' });
  await a.saveAutomation({ automation: { kind: 'sequencia', name: 'Régua', sequence: def } });
  const post = calls.find((x) => x.method === 'POST' && x.path === 'wa_automations').body;
  assert.deepStrictEqual([post.kind, post.sequence.steps[0], post.sequence.start.exclude], ['sequencia', { id: 'pz', type: 'pausa', amount: 2, unit: 'horas' }, [{ source: 'crm', label_id: FRIO }, { source: 'whatsapp', wa_label_id: '7' }]]);
  const deep = (d) => [{ id: `w${d}`, type: 'esperar', amount: 1, unit: 'horas', yes: [{ id: `y${d}`, type: 'etiqueta', op: 'colocar', source: 'crm', label_id: ATEND }], no: d > 1 ? deep(d - 1) : [{ id: 'last', type: 'enviar', item_id: F[0] }] }];
  await a.saveAutomation({ automation: { kind: 'sequencia', name: '5 níveis', sequence: { start: { type: 'lead' }, steps: deep(5) } } }); // o 5º ainda tem caixas nos caminhos
  await assert.rejects(a.saveAutomation({ automation: { kind: 'sequencia', name: '6', sequence: { start: { type: 'lead' }, steps: deep(6) } } }), /no máximo 5/);
  await assert.rejects(a.saveAutomation({ automation: { kind: 'sequencia', name: 'x', sequence: { ...def, start: { ...def.start, exclude: [{ source: 'crm', label_id: '' }] } } } }), /Nunca para quem tem/);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 10).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
