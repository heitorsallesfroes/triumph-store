// Testes da 2.18.1: node extension/tests/labelexit.test.cjs
// 1. SAIR AO TIRAR A ETIQUETA DO WHATSAPP DE INÍCIO (motor de verdade, createMotor, com API e WhatsApp falsos):
//    - "Avaliação Google" começa na etiqueta do WhatsApp "Cliente": tirar "Cliente" à mão → sai antes do próximo envio
//      (2 leituras seguidas), motivo "saiu da etiqueta" no histórico, nada enviado
//    - troca de id @c.us ↔ @lid (a etiqueta "some" só porque o id mudou) → NÃO sai e o envio segue
//    - sumiu numa leitura e voltou na outra → não sai (e não envia enquanto não confirma)
//    - a própria automação tira a etiqueta → não sai; opção desligada → não sai
//    - Régua de follow-up (começa por etiqueta do CRM) → nada muda (nem lê a lista da etiqueta do WhatsApp)
//    - regras puras: waStartPresence, seqSelfRemovedStart, seqExitLabelOf, checkSequence (guarda a opção), textos
// 2. NOME DA AGENDA → banco: createAgendaSync (só o que mudou, lotes, para sem a tabela), saveContactNames
//    (wa_contact_names), ponte agendaNames (só a memória do WhatsApp Web, sem servidor) e as ligações no painel
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
const T0 = Date.UTC(2026, 10, 10, 15, 0, 0); // ter 12h em SP
const CLIENTE = '1'; // etiqueta do WhatsApp "Cliente"
const ITEM = 'af21afb0-e488-4ab0-9af1-1e69999259e8';
const CRM_FOLLOW = 'f9a864ef-e036-498e-b106-d8f70ad95758';
const AVAL = 'a2222222-2222-4222-8222-222222222222';
const REGUA = 'a1111111-1111-4111-8111-111111111111';
const PHONE = '5521987652818';
const CUS = `${PHONE}@c.us`;
const LID = '80685306003593@lid';

// Avaliação Google: espera 1 dia e manda o pedido de avaliação (como a real, só que mais curta)
const avaliacao = (extra = {}) => ({ start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: CLIENTE, ...extra }, steps: [{ id: 'p1', type: 'pausa', amount: 1, unit: 'dias' }, { id: 'av', type: 'enviar', item_id: ITEM }, { id: 'fz', type: 'fim' }] });
// Régua de follow-up: começa na etiqueta do CRM
const regua = () => ({ start: { type: 'etiqueta', source: 'crm', label_id: CRM_FOLLOW }, steps: [{ id: 'p1', type: 'pausa', amount: 1, unit: 'dias' }, { id: 'av', type: 'enviar', item_id: ITEM }, { id: 'fz', type: 'fim' }] });

// wa: { [chatId]: { labels } } = conversas carregadas no WhatsApp Web; holders(labelId) = lista da etiqueta
function motorWith({ def, automationId = AVAL, chatId = CUS, contact = { id: 'k1', name: 'Motoboy', phone: PHONE, labelIds: [] } }) {
  const now = { t: T0 + 2 * DAY };
  const seq = { id: automationId, name: 'Avaliação Google', active: true, kind: 'sequencia', sequence: def, activated_at: new Date(T0 - DAY).toISOString() };
  const db = {
    runs: [{ id: 'r1', automation_id: automationId, chat_id: chatId, contact_id: contact ? contact.id : null, entry_key: 'lbl:x', node: 'p1', status: 'ativo', version: 0, branches: [],
      wait_started_at: new Date(T0).toISOString(), created_at: new Date(T0).toISOString() }],
    sent: [], logs: [], waOps: [], holderCalls: 0,
    wa: { [chatId]: { labels: [CLIENTE] } },
    holders: null, // null = calcula de db.wa
  };
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { business_start: '00:00', business_end: '23:59', business_days: [0, 1, 2, 3, 4, 5, 6], max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'flowCandidates' || type === 'nativeLabelCandidates') return [];
    if (type === 'seqCreateRuns') return { created: 0 };
    if (type === 'seqRuns') return db.runs.filter((r) => r.status === 'ativo').map((r) => ({ ...r, contact }));
    if (type === 'seqReplies') return {};
    if (type === 'automationSentToday') return { count: 0 };
    if (type === 'seqUpdateRun') {
      const r = db.runs.find((x) => x.id === p.id);
      if (!r || r.version !== p.version) return { ok: false };
      const patch = { ...p.patch };
      ['wait_started_at', 'due_at', 'last_sent_at'].forEach((k) => { if (k in patch) patch[k] = patch[k] == null ? null : new Date(patch[k]).toISOString(); });
      Object.assign(r, patch, { version: r.version + 1 });
      return { ok: true, run: { ...r } };
    }
    if (type === 'logSend') { db.logs.push(p); return { id: `l${db.logs.length}` }; }
    if (type === 'saleContactLabels') return { contactId: 'k1', labelIds: [] };
    return null;
  };
  const holdersOf = (labelId) => {
    if (db.holders) return db.holders;
    const chats = Object.entries(db.wa).filter(([, c]) => (c.labels || []).includes(labelId)).map(([id, c]) => ({ id, ...(c.phone ? { phone: c.phone } : {}), ...(c.lid ? { lid: c.lid } : {}) }));
    return { count: chats.length, chats };
  };
  const motor = E.createMotor({
    api, now: () => now.t,
    wa: {
      ready: async () => true,
      chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.filter((c) => db.wa[c]).map((c) => [c, { loaded: true, last: { t: T0 / 1000, fromMe: true }, labels: db.wa[c].labels }])) }),
      labelChatIds: async ({ labelId }) => { db.holderCalls++; return holdersOf(labelId); },
      chatPhone: async ({ chatId }) => ({ phone: chatId === LID ? PHONE : null }),
      labels: async () => [{ id: CLIENTE, name: 'Cliente' }],
      chatLabels: async ({ chatId }) => ({ labelIds: (db.wa[chatId] || {}).labels || [] }),
      setChatLabels: async ({ chatId, add = [], remove = [] }) => {
        const c = db.wa[chatId] || (db.wa[chatId] = { labels: [] });
        db.waOps.push({ chatId, add, remove });
        c.labels = [...new Set([...c.labels, ...add.map(String)])].filter((l) => !remove.map(String).includes(l));
        return { confirmed: true };
      },
    },
    sendParts: async ({ chatId }) => { db.sent.push(chatId); return { status: 'ok', sent: 1 }; },
    partsOf: () => [{ type: 'texto', body: 'Avalia a gente no Google?' }],
    itemById: async (id) => ({ id, title: 'Pedido de avaliação' }),
  });
  return { motor, db, now };
}
async function cycle(motor) { await motor._sequencesOnce(); }
async function boot(m) { await m.motor.loadSettings(); await m.motor.refreshActivity(); }

// ── 1. sair ao tirar a etiqueta ──
test('Avaliação Google: tirar "Cliente" à mão (motoboy) → sai antes do envio, com "saiu da etiqueta", nada enviado', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  m.db.wa[CUS].labels = []; // você tirou a etiqueta "Cliente" do motoboy (o envio já estava vencido)
  await cycle(m.motor);
  assert.deepStrictEqual([m.db.runs[0].status, m.db.sent.length], ['ativo', 0], '1ª leitura sem a etiqueta: ainda não sai, mas também não envia');
  await cycle(m.motor);
  assert.deepStrictEqual([m.db.runs[0].status, m.db.runs[0].outcome, m.db.sent.length], ['saiu', 'saiu_etiqueta', 0]);
  const log = m.db.logs.find((l) => l.reason === 'saiu da etiqueta');
  assert.ok(log && log.status === 'pulado' && log.source === 'follow' && log.source_id === AVAL && log.chat_id === CUS, JSON.stringify(m.db.logs));
  await cycle(m.motor);
  assert.strictEqual(m.db.sent.length, 0, 'depois de sair nunca mais envia');
  assert.strictEqual(E.seqDescribe(avaliacao(), m.db.runs[0], m.now.t), 'saiu: saiu da etiqueta');
});
test('Avaliação Google: com a etiqueta, o envio sai normalmente', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  await cycle(m.motor);
  assert.deepStrictEqual(m.db.sent, [CUS]);
  assert.strictEqual(m.db.logs.some((l) => l.reason === 'saiu da etiqueta'), false);
});
test('troca de id @c.us → @lid: a conversa do @c.us some da memória e a etiqueta está no @lid → NÃO sai, envia', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  delete m.db.wa[CUS];
  m.db.wa[LID] = { labels: [CLIENTE], phone: PHONE }; // mesma pessoa, mesmo telefone, agora pelo @lid
  for (let i = 0; i < 4; i++) await cycle(m.motor);
  assert.strictEqual(m.db.runs[0].outcome === 'saiu_etiqueta', false);
  assert.strictEqual(m.db.sent.length, 1, 'o envio seguiu');
});
test('troca de id @c.us → @lid: a conversa velha ainda carregada SEM a etiqueta, mas o @lid (mesmo telefone) tem → NÃO sai', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  m.db.wa[CUS].labels = [];
  m.db.wa[LID] = { labels: [CLIENTE], phone: PHONE };
  for (let i = 0; i < 4; i++) await cycle(m.motor);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta');
  assert.strictEqual(m.db.sent.length, 1);
});
test('troca de id @lid → @c.us: percurso no @lid, etiqueta agora no @c.us (lid mapeado) → NÃO sai', async () => {
  const m = motorWith({ def: avaliacao(), chatId: LID, contact: null });
  await boot(m);
  m.db.wa = { [LID]: { labels: [] }, [CUS]: { labels: [CLIENTE], lid: LID } };
  for (let i = 0; i < 4; i++) await cycle(m.motor);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta');
});
test('sumiu numa leitura e voltou na seguinte → não sai (a 1ª leitura sem a etiqueta segura o envio)', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  m.db.wa[CUS].labels = [];
  await cycle(m.motor);
  assert.strictEqual(m.db.sent.length, 0);
  m.db.wa[CUS].labels = [CLIENTE];
  await cycle(m.motor);
  m.db.wa[CUS].labels = []; // some de novo: a contagem recomeça (precisa de 2 seguidas)
  await cycle(m.motor);
  assert.strictEqual(m.db.runs[0].status, 'ativo');
  assert.deepStrictEqual(m.db.sent, [CUS], 'enviou quando a etiqueta voltou');
});
test('lista da etiqueta falhou / WhatsApp carregando → "não sei": não sai (segue como antes)', async () => {
  const m = motorWith({ def: avaliacao() });
  await boot(m);
  m.db.wa[CUS].labels = [];
  m.db.holders = { count: 7, chats: [] }; // carregando
  for (let i = 0; i < 3; i++) await cycle(m.motor);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta', 'sem a lista completa nunca sai');
});
test('a própria automação tira a etiqueta "Cliente" → não conta como saída', async () => {
  const def = avaliacao();
  def.steps = [{ id: 'tr', type: 'etiqueta', op: 'tirar', source: 'whatsapp', wa_label_id: CLIENTE }, { id: 'p1', type: 'pausa', amount: 1, unit: 'dias' }, { id: 'av', type: 'enviar', item_id: ITEM }, { id: 'fz', type: 'fim' }];
  const m = motorWith({ def });
  m.db.runs[0].node = 'tr';
  m.db.runs[0].wait_started_at = null;
  await boot(m);
  await cycle(m.motor); // tira a etiqueta e começa a espera
  assert.deepStrictEqual(m.db.wa[CUS].labels, []);
  m.now.t += 2 * DAY;
  for (let i = 0; i < 3; i++) await cycle(m.motor);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta');
  assert.deepStrictEqual(m.db.sent, [CUS], 'o pedido de avaliação saiu');
  // depois de recarregar (memória vazia): o caminho já percorrido mostra que foi a automação
  assert.strictEqual(E.seqSelfRemovedStart(def, 'p1', CLIENTE), true);
  assert.strictEqual(E.seqSelfRemovedStart(def, 'tr', CLIENTE), false);
});
test('opção "Se tirarem a etiqueta: sair da automação" desligada → não sai', async () => {
  const m = motorWith({ def: avaliacao({ exit_on_remove: false }) });
  await boot(m);
  m.db.wa[CUS].labels = [];
  for (let i = 0; i < 3; i++) await cycle(m.motor);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta');
  assert.strictEqual(m.db.holderCalls, 0, 'nem lê a lista da etiqueta');
});
test('Régua de follow-up (começa por etiqueta do CRM): nenhuma mudança, nem lê etiqueta do WhatsApp', async () => {
  const m = motorWith({ def: regua(), automationId: REGUA });
  await boot(m);
  m.db.wa[CUS].labels = []; // sem nenhuma etiqueta do WhatsApp
  for (let i = 0; i < 3; i++) await cycle(m.motor);
  assert.strictEqual(m.db.holderCalls, 0);
  assert.notStrictEqual(m.db.runs[0].outcome, 'saiu_etiqueta');
  assert.deepStrictEqual(m.db.sent, [CUS], 'envia como sempre');
  assert.strictEqual(E.seqExitLabelOf(regua()), null);
});

// ── regras puras ──
test('seqExitLabelOf: só COMEÇA por etiqueta do WhatsApp, padrão ligado', () => {
  assert.strictEqual(E.seqExitLabelOf(avaliacao()), CLIENTE);
  assert.strictEqual(E.seqExitLabelOf(avaliacao({ exit_on_remove: true })), CLIENTE);
  assert.strictEqual(E.seqExitLabelOf(avaliacao({ exit_on_remove: false })), null);
  assert.strictEqual(E.seqExitLabelOf({ start: { type: 'lead' }, steps: [] }), null);
  assert.strictEqual(E.seqExitLabelOf({ start: { type: 'venda', source: 'crm', label_id: CRM_FOLLOW }, steps: [] }), null);
});
test('waStartPresence: present / absent / unknown (troca de id e telefone)', () => {
  const P = (o) => E.waStartPresence({ labelId: CLIENTE, runChatId: CUS, runPhone: PHONE, ...o });
  const loaded = (labels) => ({ loaded: true, labels });
  assert.strictEqual(P({ chat: loaded([CLIENTE]), holders: null }), 'present');
  assert.strictEqual(P({ chat: loaded([]), holders: { count: 0, chats: [] } }), 'absent');
  assert.strictEqual(P({ chat: loaded([]), holders: null }), 'unknown', 'lista falhou');
  assert.strictEqual(P({ chat: null, holders: { count: 0, chats: [] } }), 'unknown', 'conversa não está na memória');
  assert.strictEqual(P({ chat: loaded([]), holders: { count: 3, chats: [] } }), 'unknown', 'carregando');
  assert.strictEqual(P({ chat: loaded([]), holders: { count: 1, chats: [{ id: LID, phone: PHONE }] } }), 'present', '@lid com o mesmo telefone');
  assert.strictEqual(P({ chat: loaded([]), holders: { count: 1, chats: [{ id: LID, phone: '21987652818' }] } }), 'present', 'telefone sem o 55');
  assert.strictEqual(P({ chat: loaded([]), holders: { count: 1, chats: [{ id: '5521911112222@c.us' }] } }), 'absent', 'outra pessoa na etiqueta');
  assert.strictEqual(E.waStartPresence({ labelId: CLIENTE, runChatId: LID, runPhone: null, chat: loaded([]), holders: { count: 1, chats: [{ id: CUS, lid: LID }] } }), 'present', '@c.us com o @lid do percurso');
});
test('seqSelfRemovedStart: "colocar … e tirar as outras" antes do passo atual também conta; dentro dos caminhos ✅/❌', () => {
  const def = { start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: CLIENTE }, steps: [
    { id: 'w', type: 'esperar', amount: 1, unit: 'horas', yes: [{ id: 'y1', type: 'fim' }], no: [{ id: 'c', type: 'etiqueta', op: 'colocar', source: 'whatsapp', wa_label_id: '9', remove_others: true }, { id: 'e2', type: 'enviar', item_id: ITEM }] },
  ] };
  assert.strictEqual(E.seqSelfRemovedStart(def, 'e2', CLIENTE), true);
  assert.strictEqual(E.seqSelfRemovedStart(def, 'w', CLIENTE), false);
  assert.strictEqual(E.seqSelfRemovedStart(def, 'y1', CLIENTE), false);
});
function api(fetchImpl) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const call = { method: init.method || 'GET', path: p, body: init.body ? JSON.parse(init.body) : undefined, prefer: (init.headers || {}).Prefer };
    calls.push(call);
    if (fetchImpl) return fetchImpl(call, res);
    if (call.method === 'POST' && p === 'wa_automations') return res(201, [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls };
}
test('servidor: a opção desligada fica gravada só na etiqueta do WhatsApp (ligada = sem o campo)', () => {
  const s = src('supabase-api.js');
  assert.ok(s.includes("if (start.source === 'whatsapp' && st.exit_on_remove === false) start.exit_on_remove = false;"));
  assert.ok(src('content.js').includes("' Se tirarem a etiqueta: sair da automação'"), 'caixa COMEÇA');
  assert.ok(/st\.type === 'etiqueta' && st\.source === 'whatsapp'\) \{\s*const l = el\('label', 'sc-radio vb-exit-label'\)/.test(src('content.js')), 'só para etiqueta do WhatsApp');
  assert.ok(src('content.js').includes('c.checked = st.exit_on_remove !== false;'), 'padrão ligado');
});

// ── 2. nome da agenda ──
test('createAgendaSync: grava só o que mudou, em lotes, e para sem a tabela', async () => {
  const saved = [];
  let items = [{ chatId: CUS, phone: PHONE, contactName: 'Motoboy João', pushname: 'Jão' }, { chatId: LID, phone: null, contactName: null, pushname: 'Cliente Perfil' }, { chatId: '5521900000000@c.us', phone: null, contactName: null, pushname: null }];
  const reads = [];
  let t = 0;
  const s = E.createAgendaSync({ read: async (p) => { reads.push(plain(p)); return { items: p.chatIds ? items.filter((x) => p.chatIds.includes(x.chatId)) : items }; }, save: async (list) => { saved.push(plain(list)); return { available: true }; }, now: () => t, batch: 1 });
  assert.strictEqual(await s.sweep(), 2, 'sem nome nenhum: não grava');
  assert.strictEqual(saved.length, 2, 'lotes de 1');
  assert.deepStrictEqual(saved[0][0], { chatId: CUS, phone: PHONE, contactName: 'Motoboy João', pushname: 'Jão' });
  assert.strictEqual(await s.sweep(), 0, 'menos de 30 min: não varre de novo');
  t += 31 * MIN;
  assert.strictEqual(await s.sweep(), 0, 'nada mudou: não grava');
  items = [{ ...items[0], contactName: 'João Motoboy' }, items[1]];
  assert.strictEqual(await s.chat(CUS), 1, 'abriu a conversa e o nome mudou');
  assert.deepStrictEqual(reads[reads.length - 1], { chatIds: [CUS] });
  assert.strictEqual(await s.chat('123@g.us'), 0, 'grupo: nada');
  const off = E.createAgendaSync({ read: async () => ({ items }), save: async () => ({ available: false }) });
  await off.sweep();
  assert.strictEqual(off.isOff(), true);
  const notReady = E.createAgendaSync({ read: async () => { throw new Error('not_ready'); }, save: async () => ({ available: true }) });
  assert.strictEqual(await notReady.sweep(), 0);
});
test('saveContactNames: upsert em wa_contact_names (agenda, perfil, telefone só dígitos), número não vira nome; sem a tabela: available false', async () => {
  const { a, calls } = api();
  const r = await a.saveContactNames({ items: [{ chatId: CUS, phone: '+55 21 98765-2818', contactName: '  João   Motoboy ', pushname: 'Jão' }, { chatId: LID, phone: null, contactName: '+55 21 9999-0000', pushname: null }, { chatId: 'x', contactName: 'Nome' }] });
  assert.deepStrictEqual(plain(r), { available: true, saved: 1 });
  const post = calls.find((c) => c.method === 'POST');
  assert.strictEqual(post.path, 'wa_contact_names?on_conflict=chat_id');
  assert.ok(/merge-duplicates/.test(post.prefer));
  assert.deepStrictEqual(post.body.map((x) => [x.chat_id, x.phone, x.agenda_name, x.profile_name]), [[CUS, PHONE, 'João Motoboy', 'Jão']]);
  const miss = api((c, res) => res(404, { message: 'relation "wa_contact_names" does not exist', code: '42P01' }));
  assert.strictEqual((await miss.a.saveContactNames({ items: [{ chatId: CUS, contactName: 'A' }] })).available, false);
  await assert.rejects(() => a.saveContactNames({ items: new Array(201).fill({}) }));
});
// ponte com WA-JS falsa (como boardnames.test.cjs): agendaNames lê SÓ a memória (ContactStore, lidPnCache)
function bridge() {
  let queried = 0;
  const contacts = { [CUS]: { name: 'Motoboy da Agenda', pushname: 'Jão' }, [LID]: { name: undefined, pushname: 'Perfil Lid' }, '5521933334444@c.us': { name: '+55 21 93333-4444', pushname: undefined } };
  const W = {
    WidFactory: { createWid: (id) => ({ _serialized: id, toString: () => id }) },
    lidPnCache: { getCurrentLid: () => null, getPhoneNumber: () => null },
    ApiContact: { getCurrentLid: () => null },
    ContactStore: { get: (w) => contacts[typeof w === 'string' ? w : w && w._serialized] || null },
  };
  const chat = (id) => ({ id: { _serialized: id }, labels: [], formattedTitle: id, t: 100, contact: null });
  const chats = [chat(CUS), chat(LID), chat('5521933334444@c.us'), { id: { _serialized: '123@g.us' }, isGroup: true, labels: [], formattedTitle: 'Grupo', t: 99 }];
  const wpp = {
    isReady: true, isFullReady: true, webpack: { isReady: true, isFullReady: true }, whatsapp: W, on: () => {},
    chat: { list: async () => chats, get: (id) => chats.find((c) => c.id._serialized === id) || null },
    labels: { getAllLabels: async () => [] },
    contact: { getPnLidEntry: async () => { queried++; return null; }, queryExists: async () => { queried++; return null; }, get: async () => { queried++; return null; } },
  };
  let listener = null;
  const replies = [];
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' }, addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const c = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('wa-bridge.js'), c);
  const me = vm.runInContext('window', c);
  let n = 0;
  const request = (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false }); else setTimeout(wait, 5); };
    wait();
  });
  return { request, queried: () => queried };
}
test('ponte agendaNames: agenda e perfil só da memória (lista toda ou só a conversa aberta), sem grupo, sem número como nome, sem servidor', async () => {
  const b = bridge();
  const all = await b.request('agendaNames', {});
  assert.ok(all.ok, JSON.stringify(all));
  assert.deepStrictEqual(plain(all.data.items), [
    { chatId: CUS, phone: PHONE, contactName: 'Motoboy da Agenda', pushname: 'Jão' },
    { chatId: LID, phone: null, contactName: null, pushname: 'Perfil Lid' },
  ]);
  const one = await b.request('agendaNames', { chatIds: [CUS] });
  assert.deepStrictEqual(plain(one.data.items).map((x) => x.chatId), [CUS]);
  assert.strictEqual(b.queried(), 0, 'nunca consulta o servidor do WhatsApp');
});
test('ligações: painel grava ao abrir a conversa e numa varredura leve; background e API; vendor WA-JS intocado', () => {
  const c = src('content.js');
  assert.ok(c.includes("agendaSync.chat(chatId)"), 'ao abrir a conversa');
  assert.ok(c.includes("read: (payload) => waRequest('agendaNames', payload, { timeout: 8000 })") && c.includes("save: (items) => call('saveContactNames', { items })"));
  assert.ok(/agendaSync\.sweep\(\)/.test(c), 'varredura');
  assert.ok(src('background.js').includes("saveContactNames: (m) => WaApi.saveContactNames({ items: m.items })"));
  assert.ok(src('wa-bridge.js').includes('agendaNames: (payload) => agendaNames(payload)'));
  assert.ok(/^2\.(1[89]|[2-9]\d)\.\d+$/.test(JSON.parse(src('manifest.json')).version));
  const mig = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261114120000_wa_contact_names.sql'), 'utf8');
  assert.ok(/create table if not exists wa_contact_names/.test(mig) && /enable row level security/.test(mig) && /rls_backup_20261103/.test(mig), 'migration idempotente com RLS igual às wa_*');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${String((e && e.stack) || e).split('\n').slice(0, 3).join('\n     ')}`); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
