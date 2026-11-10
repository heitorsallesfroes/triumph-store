// Testes da 2.16.5 (troca de id do WhatsApp na etiqueta nativa). Sem dependências: node extension/tests/idswap.test.cjs
// - supabase-api.js de verdade sobre um banco em memória (PostgREST simplificado): a mesma pessoa @c.us ↔ @lid
//   (pelo @lid que o WA-JS mapeia ou pelo telefone do contato) NÃO é entrada nova; a linha fica no id canônico
// - proteção: mais de 20 entradas "confirmadas" de uma vez na mesma etiqueta viram "já estava" (+ aviso no log)
// - motor de verdade (createMotor) ligado a essa API: 500 conversas trocando de id → 0 percursos; 1 entrada real → 1
// - percurso duplicado (c.us + lid do mesmo número na mesma régua): fica só o mais antigo
// - números do painel (seqStats) direto do banco, mesmo com a checagem "tem sequências?" falhando
// - wa-bridge.js com WA-JS falsa: o @lid de um @c.us vem só do cache (lidPnCache), sem consultar o servidor
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const LABEL = '1'; // etiqueta do WhatsApp "Cliente"
const SEQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BASE = '2000-01-01T00:00:00.000Z';
const N = 500;
const phoneOf = (i) => `55219${String(70000000 + i)}`; // 13 dígitos
const lidOf = (i) => `${String(900000000000 + i)}@lid`;
const cusOf = (i) => `${phoneOf(i)}@c.us`;

// ── banco em memória: GET/HEAD/POST(upsert)/PATCH/DELETE com eq, neq, in, is, not.is, lt, gte ──
function fakeDb(seed = {}) {
  const db = JSON.parse(JSON.stringify(seed));
  const tbl = (t) => db[t] || (db[t] = []);
  const fail = {};
  const unq = (v) => v.replace(/^"|"$/g, '').replace(/\\"/g, '"');
  const inVals = (v) => { const m = /^\((.*)\)$/.exec(v); return m ? (m[1].match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || []).map(unq) : []; };
  const PK = { wa_native_label_seen: ['chat_id', 'wa_label_id'], wa_sequence_runs: ['automation_id', 'chat_id', 'entry_key'], wa_contacts: ['key'] };
  const res = (status, body, count) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: (h) => (/content-range/i.test(h) ? `0-0/${count == null ? 0 : count}` : null) } });
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const method = (init.method || 'GET').toUpperCase();
    const prefer = (init.headers && (init.headers.Prefer || init.headers.prefer)) || '';
    const key = `${method} ${table}${u.search.includes('select=kind') ? ' kind' : ''}`;
    if (fail[key] > 0) { fail[key]--; return res(503, { message: 'Service Unavailable' }); }
    const filters = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      const m = /^(not\.)?(eq|neq|is|in|lt|gte|gt|lte)\.(.*)$/.exec(v);
      if (m) filters.push([k, !!m[1], m[2], m[3]]);
    }
    const one = (x, op, val) => {
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'is') return val === 'null' ? x == null : String(x) === val;
      if (op === 'in') return inVals(val).includes(String(x));
      if (op === 'lt') return String(x) < val;
      if (op === 'gte') return String(x) >= val;
      return true;
    };
    const match = (r) => filters.every(([k, neg, op, val]) => one(r[k], op, val) !== neg);
    const body = init.body ? JSON.parse(init.body) : null;
    if (method === 'HEAD') return res(200, null, tbl(table).filter(match).length);
    if (method === 'GET') {
      let rows = tbl(table).filter(match);
      const off = Number(u.searchParams.get('offset')) || 0;
      const lim = Number(u.searchParams.get('limit'));
      rows = rows.slice(off, lim ? off + lim : undefined);
      return res(200, rows);
    }
    if (method === 'POST') {
      const pk = PK[table] || ['id'];
      const out = [];
      (Array.isArray(body) ? body : [body]).forEach((r) => {
        const old = tbl(table).find((x) => pk.every((k) => x[k] === r[k]) && r[pk[0]] !== undefined);
        if (old) { if (/merge-duplicates/.test(prefer)) { Object.assign(old, r); out.push(old); } return; }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), status: table === 'wa_sequence_runs' ? 'ativo' : undefined, version: table === 'wa_sequence_runs' ? 0 : undefined, ...r };
        tbl(table).push(row);
        out.push(row);
      });
      return res(201, /return=representation/.test(prefer) ? out : null);
    }
    if (method === 'PATCH') { const rows = tbl(table).filter(match); rows.forEach((r) => Object.assign(r, body)); return res(200, /return=representation/.test(prefer) ? rows : null); }
    if (method === 'DELETE') { db[table] = tbl(table).filter((r) => !match(r)); return res(204, null); }
    return res(400, { message: 'método' });
  }
  return { db, fetch, fail };
}

function apiOn(fake) {
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch: fake.fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return c.WaApi;
}
function engine() {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math, Promise });
  vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
  return ctx.TspEngine;
}
const E = engine();

// a etiqueta "Cliente" com 500 clientes que já estavam (@lid, "já estava") e os contatos do CRM deles
function seeded() {
  const seen = [];
  const contacts = [];
  for (let i = 0; i < N; i++) {
    seen.push({ chat_id: lidOf(i), wa_label_id: LABEL, first_seen_at: BASE, last_seen_at: BASE, removed_at: null });
    contacts.push({ id: crypto.randomUUID(), key: `tel:${phoneOf(i)}`, name: `Cliente ${i}`, phone: phoneOf(i), chat_id: lidOf(i) });
  }
  return { wa_native_label_seen: seen, wa_contacts: contacts, wa_automations: [{ id: SEQ }], wa_sequence_runs: [] };
}
// metade dos @c.us chega com o @lid do WA-JS (cache); a outra metade só pelo telefone (contato do CRM)
const swapChat = (i) => ({ chatId: cusOf(i), id: cusOf(i), name: `Cliente ${i}`, ...(i % 2 ? { lid: lidOf(i) } : {}) });

function seqDef() {
  return { start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: LABEL }, business: false, steps: [{ id: 'm1', type: 'enviar', item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { id: 'w1', type: 'esperar', amount: 3, unit: 'dias', yes: [{ id: 'f1', type: 'fim' }], no: [{ id: 'f2', type: 'fim' }] }] };
}
// motor de verdade: a API é a supabase-api.js de verdade (como o background.js), menos configurações/atividade
function motorOn(A, { wa }) {
  const seq = { id: SEQ, name: 'Avaliação Google', active: true, kind: 'sequencia', sequence: seqDef(), activated_at: new Date(Date.now() - 3600 * 1000).toISOString(), include_existing: false, test_chat_id: null };
  const logs = [];
  const api = async (type, p) => {
    if (type === 'getEngineSettings') return { available: true, settings: { ...E.DEFAULT_SETTINGS, paused_all: false, business_days: [0, 1, 2, 3, 4, 5, 6] }, automations: true, sequences: true, automationsV25: true };
    if (type === 'engineActivity') return { automations: [seq], enrollments: [], schedules: false, campaigns: false };
    if (type === 'logSend') { logs.push(p); return { id: `l${logs.length}` }; }
    if (typeof A[type] !== 'function') return null;
    return A[type](p);
  };
  const motor = E.createMotor({ api, wa, sendParts: async () => ({ status: 'ok', sent: 1 }), partsOf: () => [], itemById: async () => null });
  return { motor, logs, seq };
}
const ev = (c, type = 'add', confirmed = true) => ({ chatId: c.chatId, name: c.name, labelIds: [LABEL], type, seenWithout: confirmed ? [LABEL] : [], t: Date.now(), ...(c.lid ? { lid: c.lid } : {}), ...(c.phone ? { phone: c.phone } : {}) });

test('API: 500 conversas trocando c.us → lid (já na etiqueta) = 0 entradas; as linhas continuam no @lid, "já estava"', async () => {
  const fake = fakeDb(seeded());
  const A = apiOn(fake);
  let added = 0;
  for (let i = 0; i < N; i += 200) {
    const events = [];
    for (let k = i; k < Math.min(N, i + 200); k++) events.push({ ...swapChat(k), labelId: LABEL, type: 'add', confirmed: true });
    const r = await A.nativeLabelEvents({ events });
    added += r.added;
  }
  assert.strictEqual(added, 0);
  const rows = fake.db.wa_native_label_seen;
  assert.strictEqual(rows.length, N, 'nenhuma linha nova');
  assert.ok(rows.every((r) => /@lid$/.test(r.chat_id) && r.first_seen_at === BASE && r.removed_at == null), 'tudo no @lid, já estava');
  // varredura com a lista em @c.us (completa) e depois de volta em @lid: ninguém sai, ninguém entra
  const s1 = await A.nativeLabelSweep({ labelId: LABEL, chats: Array.from({ length: N }, (_, i) => swapChat(i)), complete: true });
  const s2 = await A.nativeLabelSweep({ labelId: LABEL, chats: Array.from({ length: N }, (_, i) => ({ id: lidOf(i), phone: phoneOf(i) })), complete: true });
  assert.deepStrictEqual([s1.added, s1.removed, s2.added, s2.removed], [0, 0, 0, 0]);
  assert.ok(fake.db.wa_native_label_seen.every((r) => /@lid$/.test(r.chat_id) && r.first_seen_at === BASE && r.removed_at == null));
});

test('API: linha antiga em @c.us + a conversa aparece como @lid → a linha passa para o @lid (mesma data de entrada)', async () => {
  const at = '2026-11-09T10:00:00.000Z';
  const fake = fakeDb({ wa_native_label_seen: [{ chat_id: cusOf(1), wa_label_id: LABEL, first_seen_at: at, removed_at: null }], wa_contacts: [] });
  const A = apiOn(fake);
  const r = await A.nativeLabelEvents({ events: [{ chatId: lidOf(1), phone: phoneOf(1), labelId: LABEL, type: 'add', confirmed: true }] });
  assert.deepStrictEqual([r.added, r.moved], [0, 1]);
  assert.deepStrictEqual(fake.db.wa_native_label_seen.map((x) => [x.chat_id, x.first_seen_at, x.removed_at]), [[lidOf(1), at, null]]);
  // e a saída do @c.us vista logo antes (troca de id) também não vira entrada nova na volta pelo outro id
  const fake2 = fakeDb({ wa_native_label_seen: [{ chat_id: lidOf(2), wa_label_id: LABEL, first_seen_at: BASE, removed_at: new Date(Date.now() - 60000).toISOString() }], wa_contacts: [] });
  const r2 = await apiOn(fake2).nativeLabelEvents({ events: [{ chatId: cusOf(2), lid: lidOf(2), labelId: LABEL, type: 'add', confirmed: true }] });
  assert.deepStrictEqual([r2.added, fake2.db.wa_native_label_seen.length, fake2.db.wa_native_label_seen[0].first_seen_at, fake2.db.wa_native_label_seen[0].removed_at], [0, 1, BASE, null]);
});

test('API: remove do @lid + add do @c.us da mesma pessoa no mesmo lote = troca de id (não sai, não entra)', async () => {
  const fake = fakeDb(seeded());
  const A = apiOn(fake);
  const r = await A.nativeLabelEvents({ events: [{ chatId: lidOf(3), labelId: LABEL, type: 'remove' }, { ...swapChat(3), labelId: LABEL, type: 'add', confirmed: true }] });
  assert.deepStrictEqual([r.added, r.removed], [0, 0]);
  const row = fake.db.wa_native_label_seen.find((x) => x.chat_id === lidOf(3));
  assert.deepStrictEqual([row.first_seen_at, row.removed_at], [BASE, null]);
});

test('API: 1 entrada real (pessoa nova, confirmada) continua contando, com a hora de agora', async () => {
  const fake = fakeDb(seeded());
  const A = apiOn(fake);
  const t0 = Date.now();
  const r = await A.nativeLabelEvents({ events: [{ chatId: '5521988887777@c.us', name: 'Nova', labelId: LABEL, type: 'add', confirmed: true }] });
  assert.deepStrictEqual([r.added, r.baseline], [1, 0]);
  const row = fake.db.wa_native_label_seen.find((x) => x.chat_id === '5521988887777@c.us');
  assert.ok(row && Date.parse(row.first_seen_at) >= t0 - 1000, JSON.stringify(row));
});

test('API: proteção — 21+ entradas "confirmadas" de uma vez na mesma etiqueta viram "já estava"; 20 ainda contam', async () => {
  const many = (n, off) => Array.from({ length: n }, (_, i) => ({ chatId: `55319${String(80000000 + off + i)}@c.us`, labelId: LABEL, type: 'add', confirmed: true }));
  const fake = fakeDb({ wa_native_label_seen: [], wa_contacts: [] });
  const A = apiOn(fake);
  const r = await A.nativeLabelEvents({ events: many(30, 0) });
  assert.deepStrictEqual([r.added, r.baseline, r.guarded.length, r.guarded[0].labelId, r.guarded[0].count], [0, 30, 1, LABEL, 30]);
  assert.ok(fake.db.wa_native_label_seen.every((x) => x.first_seen_at === BASE));
  const r2 = await A.nativeLabelEvents({ events: many(20, 100) });
  assert.deepStrictEqual([r2.added, r2.guarded.length], [20, 0]);
});

test('motor: 500 trocas c.us → lid já na etiqueta → 0 percursos; depois 1 entrada real → 1 percurso', async () => {
  const fake = fakeDb(seeded());
  const A = apiOn(fake);
  const queue = [];
  const list = Array.from({ length: N }, (_, i) => ({ id: lidOf(i), phone: phoneOf(i) }));
  const wa = {
    ready: async () => true,
    labelEvents: async () => ({ events: queue.splice(0, queue.length) }),
    labelChatIds: async () => ({ count: list.length, chats: list }),
    chatsInfo: async ({ chatIds }) => ({ chats: Object.fromEntries(chatIds.map((c) => [c, { loaded: true, last: null }])) }),
  };
  const { motor } = motorOn(A, { wa });
  await motor.loadSettings();
  await motor.refreshActivity();
  // a ponte vê os 500 como @c.us "entrando" (confirmados) — a troca de id
  for (let i = 0; i < N; i++) queue.push(ev(swapChat(i)));
  await motor._trackNativeLabelsOnce();
  await motor._sequencesOnce();
  assert.strictEqual(fake.db.wa_sequence_runs.length, 0, 'nenhum percurso');
  assert.strictEqual(fake.db.wa_native_label_seen.length, N);
  // entrada real
  queue.push(ev({ chatId: '5521988887777@c.us', name: 'Nova' }));
  list.push({ id: '5521988887777@c.us', name: 'Nova' });
  await motor._trackNativeLabelsOnce();
  await motor._sequencesOnce();
  assert.deepStrictEqual(fake.db.wa_sequence_runs.map((r) => [r.chat_id, r.status]), [['5521988887777@c.us', 'ativo']]);
});

test('motor: a proteção registra um aviso no log da automação (pulado, sem mandar nada)', async () => {
  const fake = fakeDb({ wa_native_label_seen: [], wa_contacts: [], wa_sequence_runs: [] });
  const A = apiOn(fake);
  const queue = Array.from({ length: 25 }, (_, i) => ev({ chatId: `55319${String(80000000 + i)}@c.us` }));
  const wa = { ready: async () => true, labelEvents: async () => ({ events: queue.splice(0, queue.length) }), labelChatIds: async () => null, chatsInfo: async () => ({ chats: {} }) };
  const { motor, logs } = motorOn(A, { wa });
  await motor.loadSettings();
  await motor.refreshActivity();
  await motor._trackNativeLabelsOnce();
  await motor._sequencesOnce();
  assert.strictEqual(fake.db.wa_sequence_runs.length, 0);
  assert.strictEqual(logs.length, 1);
  assert.deepStrictEqual([logs[0].source, logs[0].source_id, logs[0].status, logs[0].chat_id], ['follow', SEQ, 'pulado', null]);
  assert.ok(/proteção: 25 entradas/.test(logs[0].reason) && logs[0].reason.length <= 60, logs[0].reason);
});

test('percursos: c.us e lid do mesmo número ativos na mesma régua → fica só o mais antigo (o outro sai, id_duplicado)', async () => {
  const seed = seeded();
  const mk = (chat, created) => ({ id: crypto.randomUUID(), automation_id: SEQ, chat_id: chat, entry_key: `lbl:${chat}`, node: 'w1', status: 'ativo', version: 0, branches: [], created_at: created });
  seed.wa_sequence_runs = [mk(lidOf(5), '2026-11-09T17:00:00Z'), mk(cusOf(5), '2026-11-09T16:26:00Z'), mk(lidOf(6), '2026-11-09T17:00:00Z')];
  const fake = fakeDb(seed);
  const runs = JSON.parse(JSON.stringify(await apiOn(fake).seqRuns({ automationIds: [SEQ] })));
  assert.deepStrictEqual(runs.map((r) => r.chat_id).sort(), [cusOf(5), lidOf(6)].sort());
  const dropped = fake.db.wa_sequence_runs.find((r) => r.chat_id === lidOf(5));
  assert.deepStrictEqual([dropped.status, dropped.outcome, !!dropped.ended_at], ['saiu', 'id_duplicado', true]);
  assert.strictEqual(fake.db.wa_sequence_runs.filter((r) => r.status === 'ativo').length, 2);
});

test('painel: números da régua direto do banco, mesmo com a checagem "tem sequências?" falhando (motor aqui ou em outro PC)', async () => {
  const mk = (status, node, outcome) => ({ id: crypto.randomUUID(), automation_id: SEQ, chat_id: lidOf(Math.floor(Math.random() * 1e6)), entry_key: crypto.randomUUID(), node, status, outcome, version: 0 });
  const runs = [...Array.from({ length: 7 }, () => mk('ativo', 'w1', null)), ...Array.from({ length: 511 }, () => mk('saiu', null, 'manual')), mk('fim', null, 'respondeu')];
  for (const failProbe of [false, true]) {
    const fake = fakeDb({ wa_sequence_runs: runs });
    if (failProbe) fake.fail['GET wa_automations kind'] = 99; // a checagem antiga ficava "sem sequências" por 30 min
    const st = await apiOn(fake).seqStats({ automationIds: [SEQ] });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(st[SEQ])), { nodes: { w1: 7 }, active: 7, yes: 1, no: 0, other: 511 }, `failProbe=${failProbe}`);
  }
  // erro de verdade na leitura: sobe (o painel mantém os últimos números em vez de "Ninguém entrou ainda")
  const fake = fakeDb({ wa_sequence_runs: runs });
  fake.fail['GET wa_sequence_runs'] = 1;
  await assert.rejects(apiOn(fake).seqStats({ automationIds: [SEQ] }), /Supabase 503/);
  // o painel: "Ninguém entrou ainda" só com resposta do banco; mantém os últimos números se uma leitura falhar
  const c = src('content.js');
  assert.ok(/seq: seq \|\| prev\.seq \|\| null/.test(c) && /fl\.stats && fl\.stats\.seq \? 'Ninguém entrou ainda\.'/.test(c) && /finally \{\s*fl\.statsBusy = false;/.test(c));
});

test('ponte: @lid de um @c.us só pelo cache (lidPnCache), sem consultar o servidor; telefone de um @lid como antes', async () => {
  let queried = 0;
  const W = {
    WidFactory: { createWid: (id) => ({ _serialized: id, user: id.split('@')[0], server: id.split('@')[1] }) },
    lidPnCache: { getCurrentLid: (w) => (w._serialized === cusOf(1) ? { _serialized: lidOf(1) } : null) },
    ApiContact: { getCurrentLid: () => null },
  };
  const handlers = {};
  const chats = [{ id: { _serialized: cusOf(1) }, labels: [LABEL], name: 'A' }, { id: { _serialized: cusOf(2) }, labels: [LABEL], name: 'B' }, { id: { _serialized: lidOf(3) }, labels: [LABEL], name: 'C' }];
  const wpp = {
    isReady: true, isFullReady: true, webpack: { isReady: true, isFullReady: true }, whatsapp: W,
    on: (n, fn) => { handlers[n] = fn; },
    chat: { list: async () => chats, get: (id) => chats.find((c) => c.id._serialized === id) },
    labels: { getAllLabels: async () => [{ id: LABEL, name: 'Cliente', count: 3 }] },
    contact: { getPnLidEntry: async (id) => { queried++; return /@lid$/.test(id) ? { phoneNumber: { id: phoneOf(3) } } : { lid: { _serialized: lidOf(9) } }; }, queryExists: async () => { queried += 100; return null; } },
  };
  let listener = null;
  const replies = [];
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' },
    addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('wa-bridge.js'), ctx);
  const me = vm.runInContext('window', ctx);
  let n = 0;
  const request = (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false }); else setTimeout(wait, 5); };
    wait();
  });
  const B = { labelChatIds: async (p) => { const r = await request('labelChatIds', p); assert.ok(r.ok, JSON.stringify(r)); return r.data; }, labelEvents: async () => { const r = await request('labelEvents', {}); assert.ok(r.ok, JSON.stringify(r)); return r.data; } };
  const r = await B.labelChatIds({ labelId: LABEL });
  const by = Object.fromEntries(r.chats.map((x) => [x.id, x]));
  assert.deepStrictEqual([by[cusOf(1)].lid, by[cusOf(2)].lid, by[lidOf(3)].phone], [lidOf(1), undefined, phoneOf(3)]);
  assert.strictEqual(queried, 1, 'só o @lid → telefone (cache do getPnLidEntry); nada de consulta ao servidor para @c.us');
  // evento: o @c.us ganha o @lid
  handlers['chat.update_label']({ chat: chats[0], type: 'add', ids: [LABEL] });
  const evs = await B.labelEvents();
  assert.deepStrictEqual([evs.events.length, evs.events[0].chatId, evs.events[0].lid], [1, cusOf(1), lidOf(1)]);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message.split('\n').join(' ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
