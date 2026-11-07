// Testes da 2.12.5 ("só daqui pra frente" à prova de falhas para etiquetas do WhatsApp). node extension/tests/labelsafety.test.cjs
// - wa-bridge.js com uma WA-JS falsa: labelAllChats (TODAS as conversas da etiqueta, inclusive não carregadas e
//   arquivadas), seenWithout nos eventos (só vale entrada se a conversa já tinha sido vista sem a etiqueta) e a
//   etiqueta posta pela extensão (own)
// - supabase-api.js com banco falso: varredura/eventos/registro ao ligar → "já estava" (2000-01-01), entrada confirmada
//   → agora, volta depois de uma saída vista → logo depois da saída; "ignorados por já estarem na etiqueta"
// - engine.js: do começo ao fim — contato antigo não carregado NÃO dispara; contato que recebe a etiqueta depois dispara
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ectx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math, Promise });
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;

const LBL = '7'; // etiqueta do WhatsApp "Cliente"
const OLD = '5511900000001@c.us'; // contato antigo, NÃO carregado no WhatsApp Web (só na associação da etiqueta)
const ARCH = '5511900000002@c.us'; // arquivado com a etiqueta (carregado, mas fora da lista da etiqueta)
const VIS = '5511900000003@c.us'; // carregado e com a etiqueta
const NEW = '5511900000004@c.us'; // carregado, SEM a etiqueta; recebe a etiqueta depois de ligar

// ── WA-JS falsa ──
function bridge() {
  const handlers = {};
  const replies = [];
  const chats = new Map(); // carregadas
  const chat = (id, labels, extra = {}) => { const c = { id: { _serialized: id }, labels: [...labels], name: `Nome ${id.slice(-1)}`, msgs: { getModelsArray: () => [] }, ...extra }; chats.set(id, c); return c; };
  chat(ARCH, [LBL], { archive: true });
  chat(VIS, [LBL]);
  chat(NEW, []);
  const assoc = [OLD, ARCH, VIS].map((id) => ({ parentType: 'Chat', parentId: { _serialized: id } }));
  const wpp = {
    isReady: true,
    on: (ev, fn) => { handlers[ev] = fn; },
    chat: {
      get: (id) => chats.get(id) || null,
      list: async (o = {}) => [...chats.values()].filter((c) => !o.withLabels || (!c.archive && c.labels.some((l) => o.withLabels.includes(l)))),
    },
    labels: {
      getAllLabels: async () => [{ id: LBL, name: 'Cliente', hexColor: '#22c55e', count: 2 }, { id: '9', name: 'Não enviar', hexColor: '#ef4444', count: 0 }],
      addOrRemoveLabels: async (chatId, ops) => { const c = chats.get(chatId); ops.forEach((o) => { if (o.type === 'add') c.labels.push(o.labelId); else c.labels = c.labels.filter((l) => l !== o.labelId); }); },
    },
    whatsapp: { LabelStore: { get: (id) => (id === LBL ? { labelItemCollection: { _models: assoc } } : null) } },
    contact: { getPnLidEntry: async () => null },
    conn: { isMultiDevice: () => true },
  };
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' },
    addEventListener: (t, fn) => { if (t === 'message') win.__listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('wa-bridge.js'), ctx);
  const me = vm.runInContext('window', ctx);
  let n = 0;
  const request = (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    win.__listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false }); else setTimeout(wait, 5); };
    wait();
  });
  // o WhatsApp avisa uma troca de etiqueta (o modelo já mudou)
  const labelEvent = (id, type, ids) => { const c = chats.get(id); if (type === 'add') ids.forEach((l) => { if (!c.labels.includes(l)) c.labels.push(l); }); else c.labels = c.labels.filter((l) => !ids.includes(l)); handlers['chat.update_label']({ chat: c, type, ids }); };
  const load = (id, labels) => chat(id, labels); // conversa que só carregou agora
  return { request, labelEvent, load, chats };
}

test('ponte: labelAllChats traz TODAS as conversas da etiqueta (não carregada e arquivada também), sem duplicar', async () => {
  const b = bridge();
  const r = await b.request('labelAllChats', { labelId: LBL });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(plain(r.data.chats.map((c) => c.id)).sort(), [OLD, ARCH, VIS].sort());
  assert.strictEqual(r.data.source, 'associacoes');
  const old = await b.request('labelChatIds', { labelId: LBL }); // a lista antiga: só as carregadas e não arquivadas
  assert.deepStrictEqual(plain(old.data.chats.map((c) => c.id)), [VIS]);
});
test('ponte: "add" só confirma quem já foi visto SEM a etiqueta; quem aparece pela 1ª vez já com ela não', async () => {
  const b = bridge();
  await sleep(20); // a 1ª observação (conversas carregadas) roda logo que o WhatsApp está pronto
  b.labelEvent(NEW, 'add', [LBL]); // NEW estava carregada sem a etiqueta
  b.load(OLD, []); // contato antigo carregou agora; a sincronização avisa a etiqueta que ele já tinha
  b.labelEvent(OLD, 'add', [LBL]);
  const r = await b.request('labelEvents', {});
  const ev = plain(r.data.events);
  assert.deepStrictEqual(ev.map((e) => [e.chatId, e.type, e.seenWithout]), [[NEW, 'add', [LBL]], [OLD, 'add', []]]);
});
test('ponte: tirar e pôr de novo é entrada vista; etiqueta posta pela extensão vale (own)', async () => {
  const b = bridge();
  await sleep(20);
  b.labelEvent(VIS, 'remove', [LBL]);
  b.labelEvent(VIS, 'add', [LBL]);
  const set = await b.request('setChatLabels', { chatId: NEW, add: [LBL] });
  assert.ok(set.ok && set.data.confirmed, JSON.stringify(set));
  const ev = plain((await b.request('labelEvents', {})).data.events);
  assert.deepStrictEqual(ev.map((e) => [e.chatId, e.type, e.seenWithout, !!e.own]), [[VIS, 'remove', [], false], [VIS, 'add', [LBL], false], [NEW, 'add', [LBL], true]]);
});

// ── supabase-api.js com banco falso ──
function api() {
  const db = { wa_native_label_seen: [], wa_contacts: [], wa_automations: [] };
  const calls = [];
  const res = (status, body, headers = {}) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null } });
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: decodeURIComponent(url), body });
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const rows = db[table] || (db[table] = []);
    const f = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k));
    const match = (r) => f.every(([k, v]) => {
      const [op, ...rest] = v.split('.'); const val = rest.join('.');
      if (op === 'eq') return String(r[k]) === val;
      if (op === 'in') return val.slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(r[k]));
      if (op === 'is') return val === 'null' ? r[k] == null : true;
      if (op === 'lt') return String(r[k]) < val;
      if (op === 'not') return r[k] != null;
      return true;
    });
    if (method === 'HEAD') return res(200, null, { 'content-range': `*/${rows.filter(match).length}` });
    if (method === 'GET') return res(200, rows.filter(match).map((r) => ({ ...r })));
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const conflict = u.searchParams.get('on_conflict');
      list.forEach((r) => {
        if (conflict) {
          const keys = conflict.split(',');
          const ex = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (ex) { if (/merge-duplicates/.test(init.headers.Prefer)) Object.assign(ex, r); return; }
        }
        rows.push({ id: `${table}-${rows.length + 1}`, ...r });
      });
      return res(201, null);
    }
    if (method === 'PATCH') { rows.filter(match).forEach((r) => Object.assign(r, body)); return res(204, null); }
    return res(400, null);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, Date, Math, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('supabase-api.js'), ctx);
  return { api: ctx.WaApi, db, calls };
}
const BASE = '2000-01-01T00:00:00.000Z';
const seenAt = (db, chat) => (db.wa_native_label_seen.find((r) => r.chat_id === chat && r.wa_label_id === LBL) || {}).first_seen_at;

test('api: ao ligar, TODAS as conversas da etiqueta ficam como "já estavam"; quem já tinha linha não muda', async () => {
  const { api: a, db } = api();
  db.wa_native_label_seen.push({ chat_id: VIS, wa_label_id: LBL, first_seen_at: '2026-11-01T10:00:00.000Z', last_seen_at: '2026-11-01T10:00:00.000Z', removed_at: null });
  const r = await a.nativeLabelBaseline({ labelId: LBL, chats: [{ chatId: OLD }, { chatId: ARCH }, { chatId: VIS }] });
  assert.deepStrictEqual(plain(r), { total: 3, registered: 2 });
  assert.deepStrictEqual([seenAt(db, OLD), seenAt(db, ARCH), seenAt(db, VIS)], [BASE, BASE, '2026-11-01T10:00:00.000Z']);
  assert.strictEqual(db.wa_contacts.length, 2); // contatos criados para as conversas sem contato (como antes)
});
test('api: varredura nunca usa "agora" para quem apareceu sem ser visto entrando; volta depois de saída vista = logo após a saída', async () => {
  const { api: a, db } = api();
  db.wa_native_label_seen.push({ chat_id: NEW, wa_label_id: LBL, first_seen_at: BASE, last_seen_at: BASE, removed_at: '2026-11-07T12:00:00.000Z' });
  const r = await a.nativeLabelSweep({ labelId: LBL, chats: [{ chatId: OLD }, { chatId: NEW }], complete: false });
  assert.deepStrictEqual(plain(r), { added: 1, removed: 0, total: 2, baseline: 1 });
  assert.deepStrictEqual([seenAt(db, OLD), seenAt(db, NEW)], [BASE, '2026-11-07T12:00:01.000Z']);
});
test('api: eventos — confirmado = agora; não confirmado = "já estava"; saída + volta no mesmo lote = confirmado', async () => {
  const { api: a, db } = api();
  const t0 = Date.now();
  const r = await a.nativeLabelEvents({ events: [
    { chatId: NEW, labelId: LBL, type: 'add', confirmed: true },
    { chatId: OLD, labelId: LBL, type: 'add', confirmed: false },
    { chatId: ARCH, labelId: LBL, type: 'remove' }, { chatId: ARCH, labelId: LBL, type: 'add', confirmed: false },
  ] });
  assert.deepStrictEqual(plain(r), { added: 2, removed: 0, baseline: 1 });
  assert.ok(Date.parse(seenAt(db, NEW)) >= t0 && Date.parse(seenAt(db, ARCH)) >= t0);
  assert.strictEqual(seenAt(db, OLD), BASE);
});
test('api: "ignorados por já estarem na etiqueta" = quem está na etiqueta e entrou antes de ligar', async () => {
  const { api: a, db } = api();
  const act = '2026-11-07T15:00:00.000Z';
  db.wa_native_label_seen.push(
    { chat_id: OLD, wa_label_id: LBL, first_seen_at: BASE, removed_at: null }, { chat_id: ARCH, wa_label_id: LBL, first_seen_at: BASE, removed_at: null },
    { chat_id: NEW, wa_label_id: LBL, first_seen_at: '2026-11-07T16:00:00.000Z', removed_at: null }, { chat_id: VIS, wa_label_id: LBL, first_seen_at: BASE, removed_at: '2026-11-07T15:30:00.000Z' },
  );
  const r = await a.nativeLabelIgnored({ items: [{ automationId: '11111111-1111-4111-8111-111111111111', labelId: LBL, activatedAt: act }] });
  assert.deepStrictEqual(plain(r), { '11111111-1111-4111-8111-111111111111': 2 });
});

// ── do começo ao fim: ponte → motor (confirmed) → banco → avaliação da automação ──
const AUTO = { id: 'a1', name: 'Pós', kind: 'automacao', active: true, trigger_type: 'entrou_etiqueta', trigger_label_source: 'whatsapp', trigger_wa_label_id: LBL,
  conditions: [], actions: [{ type: 'adicionar_etiqueta', label_id: 'x' }], activated_at: null, include_existing: false };
const evaluate = (auto, chatId, db) => E.evaluateAutomation({ automation: auto, contact: { id: `c-${chatId}`, chat_id: chatId, labelIds: [], links: [], waSeen: { [LBL]: seenAt(db, chatId) }, enrolled: {} },
  chat: { loaded: true, last: null }, settings: {}, now: Date.now(), noSendLabelId: null, ranKeys: new Set() });
test('ponta a ponta: contato antigo NÃO carregado não dispara; contato que recebe a etiqueta depois de ligar dispara', async () => {
  const b = bridge();
  const { api: a, db } = api();
  await sleep(20);
  // ligar: registra todas as conversas da etiqueta (inclusive a não carregada)
  const all = await b.request('labelAllChats', { labelId: LBL });
  await a.nativeLabelBaseline({ labelId: LBL, chats: all.data.chats.map((c) => ({ chatId: c.id })) });
  const auto = { ...AUTO, activated_at: new Date(Date.now() - 1000).toISOString() };
  // depois de ligar: o antigo carrega (a sincronização avisa a etiqueta) e NEW recebe a etiqueta
  b.load(OLD, []);
  b.labelEvent(OLD, 'add', [LBL]);
  b.labelEvent(NEW, 'add', [LBL]);
  const got = (await b.request('labelEvents', {})).data.events;
  // o mesmo mapeamento do motor (trackNativeLabels)
  const events = got.flatMap((e) => e.labelIds.map((l) => ({ chatId: e.chatId, labelId: l, type: e.type, confirmed: e.type === 'add' && (e.seenWithout || []).includes(l) })));
  await a.nativeLabelEvents({ events });
  // e uma varredura que só agora vê o arquivado (que nunca foi visto entrando)
  await a.nativeLabelSweep({ labelId: LBL, chats: [{ chatId: OLD }, { chatId: NEW }, { chatId: ARCH }, { chatId: VIS }], complete: true });
  assert.strictEqual(seenAt(db, OLD), BASE);
  assert.strictEqual(seenAt(db, ARCH), BASE);
  const oldEv = plain(evaluate(auto, OLD, db));
  const newEv = plain(evaluate(auto, NEW, db));
  assert.deepStrictEqual([oldEv.action, oldEv.reason], ['skip', 'já estava na etiqueta antes de ativar']);
  assert.notStrictEqual(newEv.action, 'skip', JSON.stringify(newEv));
  // sem o registro ao ligar (falhou): a regra da ponte ainda protege o antigo
  const c2 = api();
  await c2.api.nativeLabelEvents({ events: [{ chatId: OLD, labelId: LBL, type: 'add', confirmed: false }] });
  assert.strictEqual(plain(evaluate(auto, OLD, c2.db)).reason, 'já estava na etiqueta antes de ativar');
  // "incluir quem já estava" continua valendo
  assert.notStrictEqual(plain(evaluate({ ...auto, include_existing: true }, OLD, db)).action, 'skip');
});
test('motor: etiqueta do gatilho (automação) e de início de sequência; CRM não entra', () => {
  assert.strictEqual(E.waTriggerLabelOf(AUTO), LBL);
  assert.strictEqual(E.waTriggerLabelOf({ ...AUTO, trigger_label_source: 'crm' }), null);
  assert.strictEqual(E.waTriggerLabelOf({ kind: 'sequencia', sequence: { start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: 7 } } }), '7');
  assert.strictEqual(E.waTriggerLabelOf({ kind: 'sequencia', sequence: { start: { type: 'etiqueta', source: 'crm', label_id: 'x' } } }), null);
  assert.strictEqual(E.waTriggerLabelOf({ kind: 'sequencia', sequence: { start: { type: 'lead' } } }), null);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 5).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
