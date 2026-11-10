// Testes da 2.12.0 (sequência "Respondeu / Não respondeu"). node extension/tests/sequence.test.cjs
// - regra pura (engine.js: seqStep): respondeu no 1º passo, não respondeu até o fim, resposta durante a espera,
//   horário comercial, "Pular espera", validação e o modelo "Follow-up de lead novo"
// - motor de verdade (createMotor) com API falsa: entrada do lead, envios em ordem, "Não enviar", trava de versão
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
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const F2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const F3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const TAG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// modelo "Follow-up de lead novo" com as mensagens e a etiqueta preenchidas; horário corrido para contas simples
function leadFollowup({ business = false } = {}) {
  const def = plain(E.seqTemplate('lead_followup'));
  def.business = business;
  const sends = [];
  const fill = (list) => list.forEach((n) => {
    if (n.type === 'enviar') { n.item_id = [F1, F2, F3][sends.length]; sends.push(n.id); }
    if (n.type === 'etiqueta') n.label_id = TAG;
    if (n.type === 'esperar') { fill(n.yes); fill(n.no); }
  });
  fill(def.steps);
  // 2.16.2: o modelo agora conta desde a entrada; os testes do motor usam a régua SALVA antes (1 e 2 dias depois da
  // etapa anterior), que não muda sozinha
  const w2 = def.steps[0].no[1];
  delete w2.from; w2.amount = 1;
  delete w2.no[1].from; w2.no[1].amount = 2;
  return def;
}
// Simulador: aplica as decisões como o motor faz (envio = grava o próximo passo e a hora do envio)
function runner(def, { business = false } = {}) {
  const run = { node: null, wait_started_at: null, last_sent_at: null, skip_wait: false, branches: [] };
  const log = { sends: [], ops: [], outcome: null, ended: false };
  let chat = { loaded: true, last: null };
  const idx = E.seqIndex(def);
  return {
    run, log,
    mine(t) { chat = { loaded: true, last: { t: t / 1000, fromMe: true } }; },
    theirs(t) { chat = { loaded: true, last: { t: t / 1000, fromMe: false } }; },
    tick(now) {
      for (let g = 0; g < 10 && !log.ended; g++) {
        const r = E.seqStep({ def, run, chat, replies: [], now, settings: SETTINGS });
        log.ops.push(...r.ops);
        run.branches.push(...r.branches);
        if (r.status === 'wait') return r;
        if (r.status === 'end') { log.ended = true; log.outcome = r.outcome; return r; }
        if (r.status === 'progress') { run.node = r.node; run.wait_started_at = r.waitStart; run.skip_wait = false; return r; }
        // run: manda e vai para o próximo
        log.sends.push(r.send.itemId);
        run.last_sent_at = now;
        this.mine(now);
        run.node = r.node;
        const next = r.node && idx.get(r.node);
        run.wait_started_at = next && next.node.type === 'esperar' ? now : null;
        run.skip_wait = false;
        if (!r.node) { log.ended = true; log.outcome = E.seqOutcome(run.branches); return r; }
        return r;
      }
      return null;
    },
  };
}

const T0 = Date.parse('2026-11-02T10:00:00-03:00'); // segunda, 10h

test('modelo "Follow-up de lead novo" (2.16.2): espera 2h depois da SUA mensagem → F1 → até o dia 1 desde a entrada → F2 → até o dia 3 → F3; ✅ = "Em atendimento"', () => {
  const def = plain(E.seqTemplate('lead_followup'));
  assert.deepStrictEqual(def.start, { type: 'lead', origin: 'todos' });
  const w = def.steps[0];
  assert.deepStrictEqual([w.type, w.amount, w.unit, w.after_mine, w.yes[0].type, w.yes[0].label_id], ['esperar', 2, 'horas', true, 'etiqueta', 'new:Em atendimento']);
  assert.deepStrictEqual(w.no.map((n) => n.type), ['enviar', 'esperar']);
  assert.deepStrictEqual([w.from, w.no[1].amount, w.no[1].unit, w.no[1].from, w.no[1].no[1].amount, w.no[1].no[1].unit, w.no[1].no[1].from], [undefined, 1, 'dias', 'entrada', 3, 'dias', 'entrada']);
  assert.deepStrictEqual(plain(E.seqEntryOrderWarnings(def)), []);
  assert.deepStrictEqual(plain(E.seqValidate(leadFollowup())), []);
});
test('respondeu no 1º passo: lead chamou, você respondeu, o cliente respondeu → coloca "Em atendimento" e Fim (nada enviado)', () => {
  const s = runner(leadFollowup());
  s.tick(T0); // entra na espera
  assert.strictEqual(s.tick(T0 + 1 * MIN).reason, 'esperando a sua mensagem'); // ainda não respondeu ao lead
  s.mine(T0 + 5 * MIN);
  assert.strictEqual(s.tick(T0 + 10 * MIN).status, 'wait');
  s.theirs(T0 + 30 * MIN);
  s.tick(T0 + 31 * MIN);
  assert.deepStrictEqual([s.log.sends.length, s.log.ended, s.log.outcome], [0, true, 'respondeu']);
  assert.deepStrictEqual(plain(s.log.ops), [{ op: 'colocar', source: 'crm', label_id: TAG, wa_label_id: null, remove_others: false }]);
});
test('não respondeu até o fim: F1 (2h depois da sua mensagem) → F2 (1 dia) → F3 (2 dias) → Fim por ❌', () => {
  const s = runner(leadFollowup());
  s.tick(T0);
  s.mine(T0 + 5 * MIN);
  assert.strictEqual(s.tick(T0 + 2 * HOUR).status, 'wait'); // conta da SUA mensagem: faltam 5 min
  s.tick(T0 + 2 * HOUR + 6 * MIN); // F1
  assert.deepStrictEqual(s.log.sends, [F1]);
  const t1 = T0 + 2 * HOUR + 6 * MIN;
  s.tick(t1 + DAY - MIN);
  assert.deepStrictEqual(s.log.sends, [F1]);
  s.tick(t1 + DAY + MIN); // F2
  const t2 = t1 + DAY + MIN;
  s.tick(t2 + 2 * DAY + MIN); // F3 e fim
  assert.deepStrictEqual([s.log.sends, s.log.ended, s.log.outcome], [[F1, F2, F3], true, 'nao_respondeu']);
  assert.deepStrictEqual(plain(s.run.branches.map((b) => b.result)), ['nao', 'nao', 'nao']);
});
test('resposta durante a espera: depois do F1, o cliente responde no meio do dia → ✅ "Em atendimento" e Fim', () => {
  const s = runner(leadFollowup());
  s.tick(T0);
  s.mine(T0 + MIN);
  s.tick(T0 + 2 * HOUR + 2 * MIN); // F1
  s.theirs(T0 + 5 * HOUR);
  s.tick(T0 + 5 * HOUR + MIN);
  assert.deepStrictEqual([s.log.sends, s.log.outcome], [[F1], 'respondeu']);
  assert.strictEqual(s.log.ops.length, 1);
});
test('respostas gravadas (wa_replies) também contam, mesmo se você falou depois', () => {
  const def = leadFollowup();
  const r = E.seqStep({ def, run: { node: def.steps[0].no[1].id, wait_started_at: T0, last_sent_at: T0, branches: [] },
    chat: { loaded: true, last: { t: (T0 + 3 * HOUR) / 1000, fromMe: true } }, replies: [T0 + 2 * HOUR], now: T0 + 4 * HOUR, settings: SETTINGS });
  assert.deepStrictEqual([r.status, r.outcome, r.ops.length], ['end', 'respondeu', 1]); // foi pelo ✅: etiqueta e fim
  const r2 = E.seqStep({ def, run: { node: def.steps[0].no[1].id, wait_started_at: T0, last_sent_at: T0, branches: [] },
    chat: { loaded: true, last: { t: (T0 + 3 * HOUR) / 1000, fromMe: true } }, replies: [T0 + 2 * HOUR], now: T0 + 4 * HOUR + 1, settings: SETTINGS });
  assert.ok(['progress', 'end'].includes(r2.status));
  assert.strictEqual(plain(r.branches)[0].result, 'sim');
});
test('2.14.2: esperas sempre em tempo corrido: 2h a partir de sexta 18h30 vencem sexta 20h30 (antes, "só no horário comercial", segunda 10h30)', () => {
  const fri = Date.parse('2026-11-06T18:30:00-03:00');
  const def = { start: { type: 'lead' }, business: true, steps: [{ id: 'w', type: 'esperar', amount: 2, unit: 'horas', yes: [], no: [] }] };
  const run = { node: 'w', wait_started_at: fri, last_sent_at: fri, branches: [] };
  const chat = { loaded: true, last: { t: fri / 1000, fromMe: true } };
  const r = E.seqStep({ def, run, chat, replies: [], now: fri + HOUR, settings: SETTINGS });
  assert.strictEqual(r.status, 'wait');
  assert.strictEqual(r.dueAt, fri + 2 * HOUR); // a régua salva com a opção ligada também vira corrido
  // 5 dias = 5 dias de calendário (inclusive o domingo)
  const d5 = E.seqStep({ def: { ...def, steps: [{ id: 'w', type: 'esperar', amount: 5, unit: 'dias', yes: [], no: [] }] }, run, chat, replies: [], now: fri + HOUR, settings: SETTINGS });
  assert.strictEqual(d5.dueAt, fri + 5 * 24 * HOUR);
  const sim = plain(E.seqSimulate(E.seqNormalize(def), 'nunca', { startAt: fri, settings: SETTINGS }));
  assert.strictEqual(sim.find((x) => x.kind === 'nao').when, fri + 2 * HOUR);
  const r2 = E.seqStep({ def: { ...def, business: false }, run, chat, replies: [], now: fri + HOUR, settings: SETTINGS });
  assert.strictEqual(r2.dueAt, fri + 2 * HOUR);
  const r3 = E.seqStep({ def: { ...def, business: false }, run, chat, replies: [], now: fri + 2 * HOUR + 1, settings: SETTINGS });
  assert.deepStrictEqual([r3.status, r3.outcome], ['end', 'nao_respondeu']);
});
test('"Pular espera": vai pelo ❌ na hora', () => {
  const def = leadFollowup();
  const r = E.seqStep({ def, run: { node: def.steps[0].id, wait_started_at: T0, skip_wait: true, branches: [] }, chat: { loaded: true, last: null }, replies: [], now: T0 + MIN, settings: SETTINGS });
  assert.deepStrictEqual([r.status, r.send.itemId], ['run', F1]);
});
test('"Continuar para…": volta para outro ponto; sem espera no meio, a validação acusa o laço', () => {
  const def = { start: { type: 'lead' }, business: false, steps: [
    { id: 'a', type: 'enviar', item_id: F1 },
    { id: 'w', type: 'esperar', amount: 1, unit: 'horas', yes: [{ id: 'f', type: 'fim' }], no: [{ id: 'b', type: 'enviar', item_id: F2 }, { id: 'go', type: 'ir', to: 'w' }] }] };
  assert.deepStrictEqual(plain(E.seqValidate(def)), []);
  const r = E.seqStep({ def, run: { node: 'go', branches: [] }, chat: { loaded: true, last: null }, replies: [], now: T0, settings: SETTINGS });
  assert.deepStrictEqual([r.status, r.node], ['progress', 'w']);
  const bad = { ...def, steps: [{ id: 'a', type: 'enviar', item_id: F1 }, { id: 'go', type: 'ir', to: 'a' }] };
  assert.deepStrictEqual(plain(E.seqValidate(bad)).map((x) => x.node), ['go']);
});
test('validação: mensagem, etiqueta, tempo, profundidade (até 10 esperas, 2.16.4) e quem entra — cada um no seu passo', () => {
  const deep = (d) => (d === 0 ? [] : [{ id: `w${d}`, type: 'esperar', amount: 1, unit: 'horas', yes: [], no: deep(d - 1) }]);
  const def = { start: { type: 'etiqueta', source: 'crm' }, steps: [{ id: 'm', type: 'enviar', item_id: '' }, { id: 't', type: 'etiqueta', op: 'colocar', source: 'crm' }, ...deep(11)] };
  const w = plain(E.seqValidate(def)).map((x) => x.node);
  assert.ok(w.includes('start') && w.includes('m') && w.includes('t') && w.includes('w1') && !w.includes('w2'), JSON.stringify(w));
});
test('quem entra: lead de anúncio / orgânico / todos', () => {
  assert.strictEqual(E.seqStartMatches({ origin: 'anuncio' }, { origin: 'anuncio' }), true);
  assert.strictEqual(E.seqStartMatches({ origin: 'anuncio' }, { origin: 'organico' }), false);
  assert.strictEqual(E.seqStartMatches({ origin: 'organico' }, { origin: 'organico' }), true);
  assert.strictEqual(E.seqStartMatches({ origin: 'todos' }, { origin: 'anuncio' }), true);
});

// ── motor de verdade com API falsa ──
function motorWith({ runs, leads = [], noSend = false, testChat = null }) {
  const now = { t: T0 + 10 * MIN };
  const def = leadFollowup();
  const seq = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Lead', active: true, kind: 'sequencia', sequence: def, activated_at: new Date(T0 - HOUR).toISOString(), test_chat_id: testChat };
  const db = { runs, sent: [], logs: [], labels: [], created: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { ...SETTINGS, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false, business_days: [0, 1, 2, 3, 4, 5, 6] }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'seqLeads') return leads;
    if (type === 'seqCreateRuns') { p.items.forEach((it) => { if (!db.runs.some((r) => r.chat_id === it.chat_id)) db.runs.push({ id: `r${db.runs.length + 1}`, version: 0, status: 'ativo', branches: [], ...it }); }); db.created.push(...p.items); return { created: p.items.length }; }
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: { id: 'k', name: 'Ana', labelIds: noSend ? ['NS'] : [] } }));
    if (type === 'seqReplies') return {};
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (r && db.raceOnce && p.patch && 'last_sent_at' in p.patch) { db.raceOnce = false; r.version += 5; } // outra aba mexeu antes da trava do envio
      if (!r || r.version !== p.version) return { ok: false };
      const patch = { ...p.patch };
      ['wait_started_at', 'due_at', 'last_sent_at'].forEach((k) => { if (k in patch) patch[k] = patch[k] == null ? null : new Date(patch[k]).toISOString(); });
      Object.assign(r, patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') { db.logs.push(p); return { id: `l${db.logs.length}` }; }
    if (type === 'saleContactLabels') { db.labels.push(p); return { contactId: 'k', labelIds: [p.addLabelId].filter(Boolean) }; }
    return null;
  };
  const motor = E.createMotor({
    api, now: () => now.t,
    wa: { ready: async () => true, chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: db.chat || null }])) }), setChatLabels: async () => ({ confirmed: true }) },
    sendParts: async ({ parts, chatId }) => { db.sent.push({ chatId, body: parts[0].body }); db.chat = { t: now.t / 1000, fromMe: true }; return { status: 'ok', sent: 1 }; },
    partsOf: (item) => [{ type: 'texto', body: item.title }],
    itemById: async (id) => ({ id, title: { [F1]: 'Follow 1', [F2]: 'Follow 2', [F3]: 'Follow 3' }[id] }),
  });
  return { motor, db, now, seq };
}
const lead = (chat) => ({ chat_id: chat, phone: null, first_message_at: new Date(T0).toISOString(), origin: 'organico' });
test('motor: lead novo entra (só uma vez), espera a sua mensagem e manda F1 2h depois dela; tudo logado como automação', async () => {
  const { motor, db, now } = motorWith({ runs: [], leads: [lead('5511900000001@c.us')] });
  await motor.loadSettings();
  await motor.refreshActivity();
  motor.state.noSendLabelId = 'NS';
  await motor._sequencesOnce(); // cria o percurso
  await motor._sequencesOnce(); // entra na espera
  assert.strictEqual(db.runs.length, 1);
  assert.strictEqual(db.runs[0].node, db.runs[0].node); // no 1º passo (espera)
  db.chat = { t: (T0 + 15 * MIN) / 1000, fromMe: true }; // você respondeu
  now.t = T0 + 2 * HOUR + 20 * MIN;
  await motor._sequencesOnce();
  assert.deepStrictEqual(db.sent.map((x) => x.body), ['Follow 1']);
  assert.deepStrictEqual([db.logs[0].source, db.logs[0].source_id, db.logs[0].status], ['follow', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'enviando']);
  await motor._sequencesOnce(); // de novo no mesmo instante: nada duplicado
  assert.strictEqual(db.sent.length, 1);
  assert.strictEqual(db.created.length, 1); // a mesma entrada não é mandada de novo
});
test('motor: "Não enviar" tira a conversa da sequência e nada sai', async () => {
  const { motor, db, now } = motorWith({ runs: [], leads: [lead('5511900000002@c.us')], noSend: true });
  await motor.loadSettings();
  await motor.refreshActivity();
  motor.state.noSendLabelId = 'NS';
  await motor._sequencesOnce();
  now.t = T0 + 3 * DAY;
  await motor._sequencesOnce();
  assert.deepStrictEqual([db.sent.length, db.runs[0].status, db.runs[0].outcome], [0, 'saiu', 'nao_enviar']);
});
test('motor: modo teste só cria/roda a conversa escolhida; só leads depois da ativação', async () => {
  const old = { ...lead('5511900000004@c.us'), first_message_at: new Date(T0 - 2 * HOUR).toISOString() };
  const { motor, db } = motorWith({ runs: [], leads: [lead('5511900000003@c.us'), lead('5511900000009@c.us'), old], testChat: '5511900000009@c.us' });
  await motor.loadSettings();
  await motor.refreshActivity();
  await motor._sequencesOnce();
  assert.deepStrictEqual(db.runs.map((r) => r.chat_id), ['5511900000009@c.us']);
});
test('motor: trava de versão — se outra aba já avançou, não manda', async () => {
  const { motor, db, now } = motorWith({ runs: [], leads: [lead('5511900000005@c.us')] });
  await motor.loadSettings();
  await motor.refreshActivity();
  await motor._sequencesOnce();
  await motor._sequencesOnce();
  db.chat = { t: (T0 + 15 * MIN) / 1000, fromMe: true };
  now.t = T0 + 3 * HOUR;
  db.raceOnce = true; // outra aba avança o percurso entre a leitura e a trava
  await motor._sequencesOnce();
  assert.strictEqual(db.sent.length, 0);
});

// ── painel da conversa e servidor ──
test('painel: texto do passo ("esperando resposta (faltam 1h20)", "esperando a sua mensagem", "vai mandar …")', () => {
  const def = leadFollowup();
  const w = def.steps[0];
  assert.strictEqual(E.seqDescribe(def, { status: 'ativo', node: w.id, due_at: T0 + 80 * MIN }, T0), 'esperando resposta (faltam 1h20)');
  assert.strictEqual(E.seqDescribe(def, { status: 'ativo', node: w.id, due_at: null }, T0), 'esperando a sua mensagem');
  assert.strictEqual(E.seqDescribe(def, { status: 'ativo', node: w.no[0].id }, T0, { itemTitle: () => 'Follow 1' }), 'vai mandar “Follow 1”');
  assert.strictEqual(E.seqDescribe(def, { status: 'fim', outcome: 'respondeu' }, T0), 'saiu: respondeu');
});
function api() {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'GET' && p.startsWith('wa_sequence_runs?select=id,version')) return res(200, [{ id: '99999999-9999-4999-8999-999999999999', version: 3 }]);
    if (method === 'PATCH' && p.startsWith('wa_sequence_runs')) return res(200, [{ id: '99999999-9999-4999-8999-999999999999', version: 4 }]);
    if (method === 'POST' && p === 'wa_automations') return res(201, [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls };
}
test('painel: "Pular espera" e "Tirar da automação" gravam só com a versão atual (trava)', async () => {
  const { a, calls } = api();
  await a.seqRunAction({ id: '99999999-9999-4999-8999-999999999999', action: 'pular' });
  await a.seqRunAction({ id: '99999999-9999-4999-8999-999999999999', action: 'sair' });
  const p = calls.filter((x) => x.method === 'PATCH');
  assert.deepStrictEqual(p.map((x) => x.path), ['wa_sequence_runs?id=eq.99999999-9999-4999-8999-999999999999&version=eq.3', 'wa_sequence_runs?id=eq.99999999-9999-4999-8999-999999999999&version=eq.3']);
  assert.deepStrictEqual([p[0].body.skip_wait, p[0].body.version], [true, 4]);
  assert.deepStrictEqual([p[1].body.status, p[1].body.outcome, !!p[1].body.ended_at], ['saiu', 'manual', true]);
});
test('servidor: a sequência do modelo salva (kind "sequencia"); passo sem mensagem: desligada vira rascunho, ligada é recusada (2.16.3)', async () => {
  const { a, calls } = api();
  const def = leadFollowup();
  const row = { kind: 'sequencia', name: 'Lead', sequence: def };
  await a.saveAutomation({ automation: row });
  const post = calls.find((x) => x.method === 'POST' && x.path === 'wa_automations').body;
  assert.deepStrictEqual([post.kind, post.trigger_type, post.active, post.sequence.start.type, post.sequence.steps[0].after_mine], ['sequencia', 'sequencia', false, 'lead', true]);
  const bad = JSON.parse(JSON.stringify(def));
  bad.steps[0].no[0].item_id = '';
  await assert.rejects(a.saveAutomation({ automation: { ...row, active: true, sequence: bad } }), /escolha a mensagem/);
  await assert.rejects(a.saveAutomation({ automation: { ...row, test_chat_id: '5511999990000@c.us', sequence: bad } }), /escolha a mensagem/, 'em teste = ligada');
  // 2.16.3: desligada = rascunho: salva com a mensagem vazia (e nome "Rascunho" se vier sem nome)
  const before = calls.length;
  await a.saveAutomation({ automation: { ...row, name: '  ', sequence: bad } });
  const draft = calls.slice(before).find((x) => x.method === 'POST' && x.path === 'wa_automations').body;
  assert.deepStrictEqual([draft.active, draft.name, draft.sequence.steps[0].no[0].item_id], [false, 'Rascunho', '']);
  // o formato continua conferido mesmo no rascunho
  const broken = JSON.parse(JSON.stringify(bad));
  broken.steps[0].no[0].type = 'xpto';
  await assert.rejects(a.saveAutomation({ automation: { ...row, sequence: broken } }), /tipo inválido/);
});
test('servidor (2.16.3): ligar pelo interruptor um rascunho incompleto é recusado; completo liga', async () => {
  const ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const incomplete = JSON.parse(JSON.stringify(leadFollowup()));
  incomplete.steps[0].no[0].item_id = '';
  let stored = incomplete;
  const patches = [];
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetch = async (url, init = {}) => {
    const p = url.replace('https://x.supabase.co/rest/v1/', '');
    const method = init.method || 'GET';
    if (method === 'GET' && p.startsWith(`wa_automations?select=*&id=eq.${ID}`)) return res(200, [{ id: ID, kind: 'sequencia', sequence: stored }]);
    if (method === 'PATCH' && p.startsWith('wa_automations')) { patches.push(JSON.parse(init.body)); return res(200, [{ id: ID, active: true }]); }
    if (method === 'GET' && /select=activated_at|limit=0|select=id,activated_at/.test(p)) return res(200, []);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  await assert.rejects(c.WaApi.setAutomationActive({ id: ID, active: true }), /Complete a automação antes de ligar \(.*escolha a mensagem\)/);
  assert.strictEqual(patches.length, 0, 'não ligou');
  stored = leadFollowup();
  const r = await c.WaApi.setAutomationActive({ id: ID, active: true });
  assert.deepStrictEqual([r.active, patches.length, patches[0].active], [true, 1, true]);
  stored = incomplete;
  await c.WaApi.setAutomationActive({ id: ID, active: false }); // desligar nunca é bloqueado
  assert.strictEqual(patches.length, 2);
});
test('servidor: "desde a entrada" (from) fica guardado ao salvar (⏳ e ❓); sem from continua "depois da anterior"', async () => {
  const { a, calls } = api();
  const def = JSON.parse(JSON.stringify(E.seqTemplate('lead_followup')));
  const fill = (list) => list.forEach((n) => { if (n.type === 'enviar') n.item_id = F1; if (n.type === 'etiqueta') n.label_id = TAG; if (n.type === 'esperar') { fill(n.yes); fill(n.no); } });
  fill(def.steps);
  def.steps[0].no.push({ id: 'pz', type: 'pausa', amount: 5, unit: 'dias', from: 'entrada' }, { id: 'px', type: 'pausa', amount: 1, unit: 'dias' });
  def.steps[0].no[1].after_mine = true; // com from, "da minha mensagem" não vale
  await a.saveAutomation({ automation: { kind: 'sequencia', name: 'Lead', sequence: def } });
  const seq = calls.find((x) => x.method === 'POST' && x.path === 'wa_automations').body.sequence;
  const w1 = seq.steps[0];
  const w2 = w1.no[1];
  assert.deepStrictEqual([w1.from, w1.after_mine, w2.from, w2.after_mine, w2.no[1].from], [undefined, true, 'entrada', undefined, 'entrada']);
  assert.deepStrictEqual(w1.no.slice(2).map((n) => [n.id, n.from || null]), [['pz', 'entrada'], ['px', null]]);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
