// Testes da 2.20.0 (automações confiáveis; casos reais de 16/11/2026). node extension/tests/health.test.cjs
// Causa raiz de 1, 2, 3, A e B: a etiqueta "Ao enviar" da mensagem rápida usava a identificação da conversa ABERTA quando
// o envio TERMINAVA. O usuário já estava na próxima conversa → o telefone de uma pessoa foi ligado ao chat de outra.
// 1) painel com 2 blocos "Na automação Régua de follow-up" (5521997727867 e 5521979867552): um bloco por run.id e só os
//    percursos da pessoa da conversa (pelo telefone do WhatsApp)
// 2) Fernanda (5521964664586, 124708737568994@lid) sem etiqueta: a etiqueta vai para o chat que RECEBEU, com o telefone
//    do WhatsApp para esse chat; não aplicou → novas tentativas e o motivo no log (Diagnóstico / Saúde)
// 3) run 0b1f9a87 no chat 258243599323328@lid (Patrick, 553175439079) com o contato 5521989199126: o motor confere o
//    telefone do chat no WhatsApp antes de enviar; não confere → pausa, registra, não envia
// A) 5521964749181 (Di, chat real 139680943194352@lid) e o run f4cb3169 no chat 253514756444275@lid (Maitê,
//    5521979867552): as respostas da Di NÃO movem o percurso da Maitê (pausa); a Saúde passa o percurso para o contato
//    da Maitê. As respostas são gravadas (wa_replies tem 12:40:17 e 12:58:41 da Di): o listener funciona
// B) 5521998393730 (contato com chat 47021939531867@lid) e o run f26d7825 no chat 184498994077774@lid (gabriel,
//    5521997727867): a resposta é procurada pela PESSOA, mas só de quem o WhatsApp confirma ser a mesma pessoa
// Noite/+1 dia) os envios da régua de 16/11 09:27 vieram do WhatsApp com t = 17/11 01:16 (15h49 à frente): hora no
//    futuro vira a de agora (log, leads, atividade, motor); relógio/fuso do computador errado → o motor não envia
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const REGUA = '7da93603-63cb-4b4a-ad84-a8e290f088cd';
const FU1 = 'f9a864ef-e036-498e-b106-d8f70ad95758'; // etiqueta CRM "Follow Up 1"
const ITEM = 'dbb0bb5f-8a06-4078-a6ae-e5b87808aa0e'; // "Áúdio Padrão - Black November"
const F2 = '21119a80-55a6-4099-a797-23d325e5df6f'; // "Follow Padrão 2"
const at = (hms) => Date.parse(`2026-11-16T${hms}-03:00`);
const iso = (ms) => new Date(ms).toISOString();
// a régua: espera resposta 3 h → Se responder: fim / Se não: Follow Padrão 2
const DEF = { start: { type: 'etiqueta', source: 'crm', label_id: FU1 }, steps: [{ id: 'nmw9zkl491o', type: 'esperar', amount: 3, unit: 'horas', yes: [{ id: 'ok', type: 'fim' }], no: [{ id: 'f2', type: 'enviar', item_id: F2 }] }] };
// quem é quem (telefone que o WhatsApp dá para cada chat — wa_contact_names de 16/11)
const WA = {
  '124708737568994@lid': '5521964664586', // Fernanda
  '119043826655364@lid': '5521970833264', // 💚🩷 (a conversa aberta quando o envio da Fernanda terminou)
  '258243599323328@lid': '553175439079', // Patrick
  '193522720342183@lid': '5521996496262', // Camila
  '251075349229769@lid': '5521989199126', // Tania
  '253514756444275@lid': '5521979867552', // Maitê
  '139680943194352@lid': '5521964749181', // Di
  '184498994077774@lid': '5521997727867', // gabriel
  '152626058498150@lid': '5521964211266', // Paulinho
  '47021939531867@lid': '5521998393730', // Charlie
  '259657197166684@lid': null, // o WhatsApp não sabe o telefone deste @lid
};

// ── 1) painel: um bloco por percurso, só os da pessoa ──
test('1) 5521997727867 (gabriel, 184498994077774@lid): o painel mostrava 2 blocos (run do contato no chat do Paulinho + run do chat) → 1', () => {
  const runs = [
    { id: 'f26d7825-df8d-475b-839a-8ef0a41a0a0d', chat_id: '184498994077774@lid', contact_id: '1200939e-df7c-44b7-8418-ebcdbdb7c626' },
    { id: 'bc93ed33-d62c-44b7-b3ed-402e1d0984f5', chat_id: '152626058498150@lid', contact_id: '0d14290a-cfa1-4363-8dd1-d7a475bbea84' },
  ];
  const own = E.ownRuns({ runs, chatId: '184498994077774@lid', phone: '5521997727867', phones: WA });
  assert.deepStrictEqual(own.map((r) => r.id), ['f26d7825-df8d-475b-839a-8ef0a41a0a0d']);
});
test('1) 5521979867552 (Maitê, 253514756444275@lid): run do contato e8a43d26 no chat 259657197166684@lid (telefone desconhecido) + run do chat → um bloco por run.id', () => {
  const r1 = { id: 'f4cb3169-f777-4e00-b590-f736bebdabef', chat_id: '253514756444275@lid' };
  const r2 = { id: '44e096eb-4661-482c-b846-bfbaa735ed31', chat_id: '259657197166684@lid' };
  const own = E.ownRuns({ runs: [r1, r2, { ...r1 }, { ...r2 }], chatId: '253514756444275@lid', phone: '5521979867552', phones: WA });
  assert.deepStrictEqual(own.map((r) => r.id), [r1.id, r2.id], 'o mesmo run.id nunca aparece duas vezes');
  assert.deepStrictEqual(E.uniqueRuns([r1, r1, r2]).length, 2);
});
test('1) o painel da conversa usa ownRuns (agrupado por run.id) e mostra o pausado', () => {
  const c = src('content.js');
  assert.ok(/ov\.runs = await cseqOwnRuns\(globalThis\.TspEngine\.uniqueRuns\(ov\.runs/.test(c));
  assert.ok(/TspEngine\.ownRuns\(\{ runs, chatId, phone, phones \}\)/.test(c));
  assert.ok(/E\.seqIsPaused\(r\) \? '⏸ pausado/.test(c));
});

// ── 2/3) a etiqueta vai para o chat que recebeu (telefone do WhatsApp para ELE) ──
test('2) Fernanda: envio para 124708737568994@lid terminou com 💚🩷 aberta → etiqueta para o telefone da Fernanda, não da 💚🩷', () => {
  const snap = { identity: { key: 'tel:5521970833264', phone: '5521970833264', name: null }, chatId: '119043826655364@lid' }; // a tela no fim
  const t = E.sendTargetOf({ chatId: '124708737568994@lid', wa: { phone: WA['124708737568994@lid'], name: 'Fernanda' }, snap });
  assert.deepStrictEqual(plain(t), { chatId: '124708737568994@lid', phone: '5521964664586', name: 'Fernanda' });
});
test('3) Patrick (258243599323328@lid) com a Tania aberta: o telefone da Tania nunca vai junto', () => {
  const snap = { identity: { key: 'tel:5521989199126', phone: '5521989199126', name: 'Tania' }, chatId: '258243599323328@lid' }; // tela e WhatsApp discordam
  const t = E.sendTargetOf({ chatId: '258243599323328@lid', wa: { phone: '553175439079', name: 'Patrick' }, snap });
  assert.deepStrictEqual([t.chatId, t.phone, t.name], ['258243599323328@lid', '553175439079', 'Patrick']);
});
test('2) sem telefone no WhatsApp: a tela só vale se era do MESMO chat (tirada antes do envio)', () => {
  const snap = { identity: { key: 'nome:ana', phone: null, name: 'Ana' }, chatId: '999@lid' };
  assert.deepStrictEqual(plain(E.sendTargetOf({ chatId: '999@lid', wa: null, snap })), { identity: { key: 'nome:ana', phone: null, name: 'Ana', chatId: '999@lid' } });
  assert.deepStrictEqual(plain(E.sendTargetOf({ chatId: '888@lid', wa: null, snap })), { chatId: '888@lid', name: null });
});
test('2) content.js: o alvo é guardado ANTES do envio e não usa mais a conversa aberta no fim; 3 tentativas e log do motivo', () => {
  const c = src('content.js');
  assert.ok(!/applyItemLabels\(item, targetForOpenChat/.test(c), 'targetForOpenChat saiu');
  assert.strictEqual((c.match(/const snap = sendSnap\(\);[^\n]*\r?\n\s+const res = await runSequence/g) || []).length, 2, 'seta e prévia');
  assert.ok(/LABEL_RETRY_MS = \[0, 3000, 10000\]/.test(c));
  assert.ok(/call\('logLabelFailure', \{ chat_id: chatId, item_id: item\.id, reason: why \}\)/.test(c));
  assert.ok(/diagLog\(\{ kind: 'etiqueta'/.test(c) && /\.\.\.autoDiagRows\(\)/.test(c), 'Diagnóstico');
});

// ── supabase-api.js de verdade sobre um banco em memória ──
function fakeDb(seed = {}) {
  const db = JSON.parse(JSON.stringify(seed));
  const tbl = (t) => db[t] || (db[t] = []);
  const unq = (v) => v.replace(/^"|"$/g, '');
  const inVals = (v) => { const m = /^\((.*)\)$/.exec(v); return m ? (m[1].match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || []).map(unq) : []; };
  const PK = { wa_contacts: ['key'], wa_contact_labels: ['contact_id', 'label_id'] };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: (h) => (/date/i.test(h) ? new Date().toUTCString() : null) } });
  const one = (x, op, val) => (op === 'eq' ? String(x) === val : op === 'is' ? (val === 'null' ? x == null : String(x) === val) : op === 'in' ? inVals(val).includes(String(x)) : op === 'gte' ? String(x) >= val : op === 'lte' ? String(x) <= val : op === 'lt' ? String(x) < val : op === 'neq' ? String(x) !== val : true);
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const method = (init.method || 'GET').toUpperCase();
    const prefer = (init.headers && init.headers.Prefer) || '';
    const filters = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      const m = /^(eq|neq|is|in|lt|gte|lte)\.(.*)$/.exec(v);
      if (m) filters.push([k, m[1], m[2]]);
    }
    const match = (r) => filters.every(([k, op, val]) => one(r[k], op, val));
    const body = init.body ? JSON.parse(init.body) : null;
    if (method === 'HEAD') return res(200, null);
    if (method === 'GET') { const lim = Number(u.searchParams.get('limit')); const rows = tbl(table).filter(match); return res(200, lim ? rows.slice(0, lim) : rows); }
    if (method === 'POST') {
      const pk = PK[table] || ['id'];
      const out = [];
      (Array.isArray(body) ? body : [body]).forEach((r) => {
        const old = tbl(table).find((x) => pk.every((k) => x[k] === r[k]) && r[pk[0]] !== undefined);
        if (old) { if (/merge-duplicates/.test(prefer)) Object.assign(old, r); out.push(old); return; }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
        tbl(table).push(row);
        out.push(row);
      });
      return res(201, /return=representation/.test(prefer) ? out : null);
    }
    if (method === 'PATCH') { const rows = tbl(table).filter(match); rows.forEach((r) => Object.assign(r, body)); return res(200, /return=representation/.test(prefer) ? rows : null); }
    if (method === 'DELETE') { db[table] = tbl(table).filter((r) => !match(r)); return res(204, null); }
    return res(400, null);
  }
  return { db, fetch };
}
function apiOn(fake) {
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, Date, fetch: fake.fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return c.WaApi;
}
const BASE_DB = () => ({
  wa_contacts: [
    // o contato errado criado às 09:33:47 (telefone da 💚🩷 com o chat do Iran)
    { id: '3ff70347-2eca-47d1-a879-0159cd67103a', key: 'tel:5521970833264', name: null, phone: '5521970833264', chat_id: '210792951615492@lid', created_at: '2026-11-16T12:33:47Z' },
  ],
  wa_contact_labels: [], wa_send_log: [], wa_labels: [{ id: FU1, name: 'Follow Up 1' }],
});

test('2) applySendLabels com o chat da Fernanda + telefone do WhatsApp → cria o contato dela (chat certo) e aplica Follow Up 1; o contato da 💚🩷 não é tocado', async () => {
  const fake = fakeDb(BASE_DB());
  const A = apiOn(fake);
  const r = await A.applySendLabels({ addLabelId: FU1, chatId: '124708737568994@lid', phone: '5521964664586', name: 'Fernanda' });
  assert.strictEqual(r.applied, true, JSON.stringify(r));
  const fe = fake.db.wa_contacts.find((c) => c.phone === '5521964664586');
  assert.ok(fe, 'linha em wa_contacts para a Fernanda');
  assert.strictEqual(fe.chat_id, '124708737568994@lid');
  assert.deepStrictEqual(fake.db.wa_contact_labels.filter((l) => l.contact_id === fe.id).map((l) => l.label_id), [FU1]);
  assert.strictEqual(fake.db.wa_contact_labels.filter((l) => l.contact_id === '3ff70347-2eca-47d1-a879-0159cd67103a').length, 0);
});
test('2) não aplicou (conversa @lid sem telefone e sem contato) → applied:false com o motivo; o motivo vai para o log ("pulado", origem rápida)', async () => {
  const fake = fakeDb(BASE_DB());
  const A = apiOn(fake);
  const r = await A.applySendLabels({ addLabelId: FU1, chatId: '259657197166684@lid' });
  assert.deepStrictEqual([r.applied, r.reason], [false, 'conversa sem telefone e sem contato no CRM']);
  await A.logLabelFailure({ chat_id: '259657197166684@lid', item_id: ITEM, reason: r.reason });
  const row = fake.db.wa_send_log[0];
  assert.deepStrictEqual([row.source, row.status, row.reason], ['rapida', 'pulado', 'etiqueta não aplicada: conversa sem telefone e sem contato no CRM']);
});
test('+1 dia) envio com t de 17/11 01:16 (relógio do WhatsApp 15h49 à frente) é gravado com a hora de agora, nunca amanhã', async () => {
  const fake = fakeDb({ ...BASE_DB(), wa_replies: [], wa_leads: [] });
  const A = apiOn(fake);
  const t0 = Date.now();
  const future = (t0 + (15 * 60 + 49) * 60 * 1000) / 1000;
  await A.logManualSends({ items: [{ chatId: '139680943194352@lid', t: future }] });
  const row = fake.db.wa_send_log.find((x) => x.source === 'manual');
  assert.ok(row, 'gravou');
  assert.ok(Date.parse(row.created_at) <= Date.now() + 1000 && Date.parse(row.created_at) >= t0 - 1000, row.created_at);
});

// ── motor de verdade com API e WhatsApp falsos ──
function motorWith({ runs, contacts, waPhones = WA, waBroken = false, custAt = { chats: {}, phones: {} }, replies = {}, now = at('12:45:00'), serverNow = null, settings = {} }) {
  const clock = { t: now };
  const seq = { id: REGUA, name: 'Régua de follow-up', active: true, kind: 'sequencia', sequence: DEF, activated_at: iso(at('08:00')) };
  const db = { runs: runs.map((r) => ({ version: 0, status: 'ativo', branches: [], automation_id: REGUA, outcome: null, ...r })), sent: [], logs: [], diag: [], askedReplies: [] };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { business_start: '00:00', business_end: '23:59', business_days: [0, 1, 2, 3, 4, 5, 6], max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false, ...settings }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates') return [];
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact: contacts[r.contact_id] ? { labelIds: [FU1], ...contacts[r.contact_id] } : null }));
    if (type === 'seqReplies') { db.askedReplies.push(...p.chatIds); return replies; }
    if (type === 'seqCustomerAt') return custAt;
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      Object.assign(r, p.patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') { db.logs.push(p); return { id: `l${db.logs.length}` }; }
    if (type === 'claimLease') return { held: true, lease_until: iso(clock.t + 5 * 60000), settings: null };
    if (type === 'automationSentToday') return { count: 0 };
    if (type === 'engineCounts' || type === 'sendCounts') return { hour: 0, day: 0 };
    return null;
  };
  const motor = E.createMotor({
    api, now: () => clock.t,
    wa: {
      ready: async () => true,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: { fromMe: true, t: Math.floor((clock.t - 6 * 3600 * 1000) / 1000) }, lastIn: null }])) }),
      chatPhone: async ({ chatId }) => { if (waBroken) throw new Error('sem ponte'); return { phone: Object.prototype.hasOwnProperty.call(waPhones, chatId) ? waPhones[chatId] : null }; },
      setChatLabels: async () => ({ confirmed: true }),
    },
    sendParts: async ({ chatId }) => { db.sent.push(chatId); return { status: 'ok', sent: 1 }; },
    partsOf: () => [{ type: 'texto', body: 'Follow' }],
    itemById: async (id) => ({ id, title: 'Follow Padrão 2' }),
    onDiag: (ev) => db.diag.push(ev),
    ...(serverNow ? { serverNow: async () => serverNow } : {}),
  });
  return { motor, db, clock };
}
async function cycle(m) { await m.motor.loadSettings(); await m.motor.refreshActivity(); return m.motor._sequencesOnce(); }
const RUN_PATRICK = { id: '0b1f9a87-221a-4be2-bd3f-1caa9ec3a7cf', chat_id: '258243599323328@lid', contact_id: '057e8645-2e38-4747-92e4-8176a6aeb8f5', node: 'nmw9zkl491o', wait_started_at: iso(at('09:34:50')), created_at: iso(at('09:34:48')) };
const C_TANIA = { '057e8645-2e38-4747-92e4-8176a6aeb8f5': { id: '057e8645-2e38-4747-92e4-8176a6aeb8f5', phone: '5521989199126', chat_id: '193522720342183@lid', name: null } };

test('3) motor: prazo vencido do run 0b1f9a87 (chat do Patrick, contato da Tania) → NÃO envia, pausa, registra no log e no Diagnóstico', async () => {
  const m = motorWith({ runs: [RUN_PATRICK], contacts: C_TANIA, now: at('13:00:00') });
  await cycle(m);
  const r = m.db.runs[0];
  assert.deepStrictEqual([r.status, r.outcome, m.db.sent.length], ['ativo', 'pausado_chat', 0]);
  assert.deepStrictEqual([m.db.logs[0].status, m.db.logs[0].chat_id, m.db.logs[0].reason], ['pulado', '258243599323328@lid', 'pausado: a conversa não é do telefone do contato']);
  assert.deepStrictEqual([m.db.diag[0].kind, m.db.diag[0].waPhone, m.db.diag[0].contactPhone], ['run_pausado', '553175439079', '5521989199126']);
  // pausado: o próximo ciclo nem olha (nada sai, nada muda)
  await cycle(m);
  assert.deepStrictEqual([m.db.sent.length, m.db.logs.length, m.db.runs[0].version], [0, 1, 1]);
});
test('3) motor: o WhatsApp não sabe o telefone do @lid → não envia e NÃO pausa (2.20.2: tenta depois); a ponte não respondeu → só espera o próximo ciclo', async () => {
  const run = { ...RUN_PATRICK, chat_id: '259657197166684@lid' };
  const m = motorWith({ runs: [run], contacts: C_TANIA, now: at('13:00:00') });
  await cycle(m);
  assert.deepStrictEqual([m.db.runs[0].outcome, m.db.sent.length, m.db.logs.length], [null, 0, 0]);
  const broken = motorWith({ runs: [RUN_PATRICK], contacts: C_TANIA, now: at('13:00:00'), waBroken: true }); // ponte não respondeu
  await cycle(broken);
  assert.deepStrictEqual([broken.db.runs[0].outcome, broken.db.sent.length], [null, 0]);
});
test('3) motor: chat e contato da MESMA pessoa → envia o Follow Padrão 2 normalmente (com e sem o 9)', async () => {
  const run = { ...RUN_PATRICK, chat_id: '251075349229769@lid' }; // o chat da Tania
  const m = motorWith({ runs: [run], contacts: { [run.contact_id]: { id: run.contact_id, phone: '552189199126', chat_id: null } }, now: at('13:00:00') });
  await cycle(m);
  assert.deepStrictEqual(m.db.sent, ['251075349229769@lid']);
});

const RUN_A = { id: 'f4cb3169-f777-4e00-b590-f736bebdabef', chat_id: '253514756444275@lid', contact_id: '1d4f7423-acd9-4b62-a192-3c30a65d70e1', node: 'nmw9zkl491o', wait_started_at: iso(at('09:41:45')), created_at: iso(at('09:40:26')) };
const C_DI = { '1d4f7423-acd9-4b62-a192-3c30a65d70e1': { id: '1d4f7423-acd9-4b62-a192-3c30a65d70e1', phone: '5521964749181', chat_id: '253514756444275@lid' } };
test('A) run f4cb3169: a Di respondeu 09:53–09:57 no chat DELA; o run está no chat da Maitê → não vai para "Se responder" com a resposta de outra pessoa: pausa, nada sai', async () => {
  const m = motorWith({ runs: [RUN_A], contacts: C_DI, now: at('10:01:00'), custAt: { chats: {}, phones: { 5521964749181: [at('09:57:00')] } }, replies: { '139680943194352@lid': [at('09:53:00')] } });
  await cycle(m);
  const r = m.db.runs[0];
  assert.deepStrictEqual([r.status, r.outcome, (r.branches || []).length, m.db.sent.length], ['ativo', 'pausado_chat', 0, 0]);
});
test('A) Saúde: o chat 253514756444275@lid é da Maitê e ela tem contato → o percurso passa para o contato dela', () => {
  const v = E.healthOfRun({ run: { ...RUN_A, status: 'ativo', contact: C_DI[RUN_A.contact_id] }, wa: { phone: '5521979867552', answered: true }, contactsByPhone: { 5521979867552: [{ id: 'e8a43d26-024a-4547-b550-8cab666a930c', phone: '5521979867552' }] } });
  assert.deepStrictEqual([v.status, v.fix.kind, v.fix.contactId], ['mismatch', 'relink', 'e8a43d26-024a-4547-b550-8cab666a930c']);
  const p = E.healthOfRun({ run: { ...RUN_A, status: 'ativo', contact: C_DI[RUN_A.contact_id] }, wa: { phone: '5521979867552', answered: true }, contactsByPhone: {} });
  assert.deepStrictEqual([p.status, p.fix.kind], ['mismatch', 'pause'], 'sem o dono no CRM: pausa');
});
test('A) depois do conserto (contato da Maitê) e a MAITÊ respondeu depois do começo da espera → "Se responder" sozinho ao abrir', async () => {
  const run = { ...RUN_A, contact_id: 'e8a43d26-024a-4547-b550-8cab666a930c' };
  const m = motorWith({ runs: [run], contacts: { [run.contact_id]: { id: run.contact_id, phone: '5521979867552', chat_id: '259657197166684@lid' } }, now: at('10:01:00'), custAt: { chats: { '253514756444275@lid': [at('09:55:00')] }, phones: {} } });
  await cycle(m);
  const r = m.db.runs[0];
  assert.deepStrictEqual([r.status, r.outcome, m.db.sent.length], ['fim', 'respondeu', 0]);
  assert.ok(!m.db.askedReplies.includes('259657197166684@lid'), 'o chat do CRM sem telefone confirmado não entra como "a mesma pessoa"');
});

const RUN_B = { id: 'f26d7825-df8d-475b-839a-8ef0a41a0a0d', chat_id: '184498994077774@lid', contact_id: '1200939e-df7c-44b7-8418-ebcdbdb7c626', node: 'nmw9zkl491o', wait_started_at: iso(at('09:41:00')), created_at: iso(at('09:40:02')) };
test('B) run f26d7825 no chat do gabriel com o contato do Charlie (5521998393730): as respostas do Charlie (09:46, 09:55, 10:00) não contam para o gabriel → pausa, nada sai', async () => {
  const m = motorWith({ runs: [RUN_B], contacts: { [RUN_B.contact_id]: { id: RUN_B.contact_id, phone: '5521998393730', chat_id: '47021939531867@lid' } }, now: at('10:01:00'), replies: { '47021939531867@lid': [at('09:45:22'), at('09:54:57'), at('09:59:30')] } });
  await cycle(m);
  assert.deepStrictEqual([m.db.runs[0].outcome, m.db.sent.length, (m.db.runs[0].branches || []).length], ['pausado_chat', 0, 0]);
});
test('B) a resposta é procurada pela PESSOA: contato com o telefone do chat e outro @lid (confirmado pelo WhatsApp) → a resposta no outro @lid conta', async () => {
  const run = { ...RUN_B, chat_id: '47021939531867@lid' };
  const waPhones = { ...WA, '99999999999999@lid': '5521998393730' }; // o Charlie por outro @lid
  const m = motorWith({ runs: [run], waPhones, contacts: { [run.contact_id]: { id: run.contact_id, phone: '5521998393730', chat_id: '99999999999999@lid' } }, now: at('10:01:00'), replies: { '99999999999999@lid': [at('09:45:22')] } });
  await cycle(m);
  assert.deepStrictEqual([m.db.runs[0].status, m.db.runs[0].outcome, m.db.sent.length], ['fim', 'respondeu', 0]);
  assert.ok(m.db.askedReplies.includes('99999999999999@lid'));
});
test('A/B) seqRepliedPatch: em espera e o cliente respondeu depois → caminho "sim" sem enviar; resposta de antes da espera → nada', () => {
  const run = { node: 'nmw9zkl491o', wait_started_at: at('09:41:45'), last_sent_at: null, branches: [], entered_at: at('09:40:26') };
  const p = E.seqRepliedPatch({ def: DEF, run, replies: [at('09:53:00')], now: at('10:01:00') });
  assert.deepStrictEqual([p.status, p.outcome, p.branches[0].result], ['fim', 'respondeu', 'sim']);
  assert.strictEqual(E.seqRepliedPatch({ def: DEF, run, replies: [at('09:30:00')], now: at('10:01:00') }), null);
  // caminho "sim" que começa por um envio: fica parado nele (o motor manda no ciclo dele, com horário e limites)
  const def2 = { ...DEF, steps: [{ ...DEF.steps[0], yes: [{ id: 'y1', type: 'enviar', item_id: F2 }] }] };
  const p2 = E.seqRepliedPatch({ def: def2, run, replies: [at('09:53:00')], now: at('10:01:00') });
  assert.deepStrictEqual([p2.node, p2.wait_started_at, p2.status], ['y1', null, undefined]);
});

// ── Saúde das automações: a lista de hoje ──
test('Saúde: mensagem rápida → etiqueta? → automação? → chat confere?', () => {
  const none = E.healthOfQuickSend({ contact: null, labelAt: NaN, run: null, runCheck: null, startsRegua: true });
  assert.deepStrictEqual([none.ok, none.fix.kind, none.steps[0].text], [false, 'label', 'etiqueta não aplicada (sem contato no CRM)']);
  const noRun = E.healthOfQuickSend({ contact: { id: 'x' }, labelAt: at('09:32:40'), run: null, runCheck: null, startsRegua: true });
  assert.deepStrictEqual(plain(noRun.steps.map((s) => s.ok)), [true, false]);
  const wrong = E.healthOfQuickSend({ contact: { id: 'x' }, labelAt: at('09:34:48'), run: { id: 'r' }, runCheck: 'mismatch', startsRegua: true });
  assert.deepStrictEqual(plain([wrong.ok, wrong.fix.kind, wrong.steps.map((s) => s.ok)]), [false, 'pause', [true, true, false]]);
  const ok = E.healthOfQuickSend({ contact: { id: 'x' }, labelAt: at('09:35:31'), run: { id: 'r' }, runCheck: 'ok', startsRegua: true });
  assert.strictEqual(ok.ok, true);
});
test('Saúde: dois percursos ativos da mesma pessoa na régua (telefone do WhatsApp, com e sem o 9) → fica o mais antigo', () => {
  const runs = [
    { id: 'b', automation_id: REGUA, chat_id: '1@lid', created_at: '2026-11-16T12:40:00Z' },
    { id: 'a', automation_id: REGUA, chat_id: '2@lid', created_at: '2026-11-16T12:39:00Z' },
    { id: 'c', automation_id: REGUA, chat_id: '3@lid', created_at: '2026-11-16T12:41:00Z' },
  ];
  const ph = { '1@lid': '5521997727867', '2@lid': '552197727867', '3@lid': '5521964211266' };
  const g = E.healthDuplicates(runs, (r) => ph[r.chat_id]);
  assert.deepStrictEqual(plain(g.map((x) => [x.keep.id, x.dups.map((d) => d.id)])), [['a', ['b']]]);
});
test('Saúde: tela em Mais › Manutenção com os 3 consertos (etiqueta, juntar, pausar) e "Reparar tudo"', () => {
  const c = src('content.js');
  assert.ok(/class="phealth"[^>]*>\$\{svg\('check'\)\}<span>Saúde das automações<\/span>/.test(c));
  ['Aplicar etiqueta', 'Juntar (fica o mais antigo)', 'Pausar', 'Passar para o contato certo', 'Mandar para "Se responder"', 'Reparar tudo'].forEach((t) => assert.ok(c.includes(t), t));
  assert.ok(/call\('automationHealth'/.test(c) && /call\('contactsForPhones'/.test(c));
});

// ── noite / +1 dia / relógio ──
test('noite) os envios de 16/11 09:27 (servidor) vieram com t = 17/11 01:16: a hora no futuro vira a de agora', () => {
  const sent = at('09:27:16');
  const t = (sent + (15 * 3600 + 49 * 60 + 3) * 1000) / 1000;
  assert.strictEqual(new Date(t * 1000).toISOString(), '2026-11-17T04:16:19.000Z', 'o log "manual" de 17/11 01:16');
  assert.strictEqual(E.clampSec(t, sent + 500), Math.floor((sent + 500) / 1000));
  assert.strictEqual(E.clampSec(sent / 1000, sent + 60000), sent / 1000, 'hora normal não muda');
  const a = E.clampActivity(E.activityOfEvent({ chatId: '139680943194352@lid', fromMe: true, t }), sent);
  assert.deepStrictEqual([a.lastAt, a.days[0].day], [Math.floor(sent / 1000), '2026-11-16']);
  const ch = E.clampChat({ loaded: true, last: { fromMe: true, t }, lastIn: null }, sent);
  assert.strictEqual(ch.last.t, Math.floor(sent / 1000));
});
test('noite) motor: mensagem "sua" com hora no futuro não segura o percurso ("esperar a sua mensagem" / prazo)', async () => {
  const run = { ...RUN_PATRICK, chat_id: '251075349229769@lid' };
  const m = motorWith({ runs: [run], contacts: { [run.contact_id]: { id: run.contact_id, phone: '5521989199126' } }, now: at('13:00:00') });
  const raw = m.motor; void raw;
  await cycle(m);
  assert.deepStrictEqual(m.db.sent, ['251075349229769@lid']);
});
test('noite) relógio do computador 15h49 adiantado ou fuso diferente do de Brasília → o motor não envia', async () => {
  assert.ok(/adiantado 15h5\d/.test(E.clockProblem({ now: at('09:27:00') + 57000000, serverNow: at('09:27:00'), tzDiffMin: 0 })));
  assert.strictEqual(E.clockProblem({ now: at('09:27:00'), serverNow: at('09:27:30'), tzDiffMin: 0 }), null);
  assert.ok(/fuso/.test(E.clockProblem({ now: 0, serverNow: NaN, tzDiffMin: 180 })));
  const run = { ...RUN_PATRICK, chat_id: '251075349229769@lid' };
  const m = motorWith({ runs: [run], contacts: { [run.contact_id]: { id: run.contact_id, phone: '5521989199126' } }, now: at('13:00:00'), serverNow: at('13:00:00') - 57000000 });
  await m.motor.loadSettings();
  await m.motor.tick();
  assert.deepStrictEqual(m.db.sent, []);
  assert.ok(/relógio do computador/.test(m.motor.state.waiting), m.motor.state.waiting);
  assert.strictEqual(m.db.diag[0].kind, 'relogio');
});
test('noite) horário geral Seg–Sáb 09:00–18:00: às 01:16 nada sai; às 09:27 sai', async () => {
  const run = { ...RUN_PATRICK, chat_id: '251075349229769@lid' };
  const contacts = { [run.contact_id]: { id: run.contact_id, phone: '5521989199126' } };
  const hours = { business_start: '09:00', business_end: '18:00', business_days: [1, 2, 3, 4, 5, 6] };
  // (o computador dos testes pode estar em outro fuso: as horas vêm do relógio local, como no motor)
  const local = (h, mi) => new Date(2026, 10, 16, h, mi).getTime(); // segunda, 16/11
  const night = motorWith({ runs: [run], contacts, now: local(1, 16), settings: hours });
  await night.motor.loadSettings();
  await night.motor.tick();
  assert.deepStrictEqual(night.db.sent, []);
  assert.strictEqual(night.motor.state.waiting, 'fora do horário');
  // a espera de 3 h venceu de madrugada: o Follow sai só quando abre o horário
  const due = { ...run, wait_started_at: iso(new Date(2026, 10, 14, 9, 0).getTime()), created_at: iso(new Date(2026, 10, 14, 8, 59).getTime()) }; // sábado 09:00 (3 h de horário: venceu no sábado)
  const night2 = motorWith({ runs: [due], contacts, now: local(1, 16), settings: hours });
  await night2.motor.loadSettings();
  await night2.motor.tick();
  assert.deepStrictEqual(night2.db.sent, [], 'prazo vencido às 01:16: espera o horário');
  const day = motorWith({ runs: [due], contacts, now: local(9, 27), settings: hours });
  await day.motor.loadSettings();
  await day.motor.tick();
  assert.deepStrictEqual(day.db.sent, ['251075349229769@lid']);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e.stack || e).split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
