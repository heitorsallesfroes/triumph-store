// Testes da 2.10.0 (registros para o Painel de resultados do ERP). Sem dependências: node extension/tests/panel.test.cjs
// - convTracker (engine.js): leads, "você digitou" uma vez por vez de falar, 1ª resposta depois de cada envio
// - supabase-api.js com fetch falso: saveLeads, logManualSends, recordReplies, logSend com origem/etapa, filtros dos automáticos
// - wa-bridge.js com uma WA-JS falsa: convEvents (lead novo, conversa antiga) e a varredura da abertura (2.12.8: 72 h)
// - 2.12.2 (aba Rastreamento do ERP): última mensagem por conversa (touchLeads), sem o texto
// - 2.12.8: atividade de todas as conversas (wa_chat_activity), 1 gravação por conversa a cada 30 s, sem sinal de compra
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

function engine() {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math, Promise });
  vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
  return ctx.TspEngine;
}
const E = engine();

// ── convTracker ──
const A = '5511900000001@c.us';
const B = '5511900000002@c.us';
test('tracker: lead novo é a 1ª mensagem do cliente sem nada antes (com anúncio)', () => {
  const t = E.convTracker();
  const out = t.ingest([{ chatId: A, fromMe: false, t: 100, first: true, ad: { id: 'AD1', title: 'Promo' }, phone: '5511900000001' }]);
  assert.deepStrictEqual(plain(out.leads), [{ chatId: A, phone: '5511900000001', t: 100, ad: { id: 'AD1', title: 'Promo' } }]);
});
test('tracker: "você digitou" conta uma vez por vez de falar; envio da extensão não conta', () => {
  const t = E.convTracker();
  const out = t.ingest([
    { chatId: A, fromMe: true, t: 100 }, // 1ª vez que vemos a conversa: conta
    { chatId: A, fromMe: true, t: 110 }, // mesma vez de falar: não
    { chatId: A, fromMe: false, t: 200 },
    { chatId: A, fromMe: true, t: 300 }, // o cliente falou: nova vez
    { chatId: A, fromMe: true, t: 300 + 31 * 60 }, // 31 min sem a loja falar: nova vez
    { chatId: B, fromMe: true, t: 500 }, // enviado pela extensão
  ], (chat, ts) => chat === B && ts === 500);
  assert.deepStrictEqual(plain(out.manual).map((m) => m.t), [100, 300, 300 + 31 * 60]);
});
test('tracker: só a 1ª resposta depois de cada mensagem nossa', () => {
  const t = E.convTracker();
  const out = t.ingest([
    { chatId: A, fromMe: true, t: 100 },
    { chatId: A, fromMe: false, t: 200, phone: 'p' }, // resposta
    { chatId: A, fromMe: false, t: 210 }, // mesma resposta continuando: não
    { chatId: A, fromMe: true, t: 300 },
    { chatId: A, fromMe: false, t: 400 }, // resposta ao novo envio
  ]);
  assert.deepStrictEqual(plain(out.replies).map((r) => r.t), [200, 400]);
  // em outra leva, a conversa continua lembrada
  assert.strictEqual(t.ingest([{ chatId: A, fromMe: false, t: 500 }]).replies.length, 0);
  assert.strictEqual(t.ingest([{ chatId: A, fromMe: true, t: 600 }, { chatId: A, fromMe: false, t: 700 }]).replies.length, 1);
});
test('tracker: fora de ordem é ordenado; varredura da abertura só gera lead', () => {
  const t = E.convTracker();
  const out = t.ingest([
    { chatId: A, fromMe: false, t: 200 },
    { chatId: A, fromMe: true, t: 100 },
    { chatId: B, fromMe: false, t: 50, first: true, scan: true },
  ]);
  assert.strictEqual(out.replies.length, 1);
  assert.strictEqual(out.replies[0].t, 200);
  assert.strictEqual(out.leads.length, 1);
  assert.strictEqual(out.manual.length, 1);
});

// 2.12.8: dias em SP (UTC−3): 1762398000 = 06/11/2026 00:00 em SP
const D0 = Date.parse('2026-11-06T00:00:00-03:00') / 1000;
test('tracker 2.12.8: activity = última mensagem e de quem, última do cliente, lead novo e os dias; sem sinal de compra; varredura não entra', () => {
  const t = E.convTracker();
  const out = t.ingest([
    { chatId: A, fromMe: false, t: D0 - 600, first: true, phone: '5511900000001' }, // 05/11 23:50
    { chatId: A, fromMe: true, t: D0 + 300 }, // 06/11
    { chatId: A, fromMe: false, t: D0 + 200, buy: true }, // "buy" antigo é ignorado
    { chatId: B, fromMe: true, t: D0 + 50 },
    { chatId: '5511900000003@c.us', fromMe: false, t: D0 + 70, first: true, scan: true },
  ]);
  assert.deepStrictEqual(plain(out.activity), [
    { chatId: A, phone: '5511900000001', name: null, lastAt: D0 + 300, lastFrom: 'loja', lastCustomerAt: D0 + 200, isNewLead: true, firstMessageAt: D0 - 600,
      days: [{ day: '2026-11-05', customer: true, store: false }, { day: '2026-11-06', customer: true, store: true }] },
    { chatId: B, phone: null, name: null, lastAt: D0 + 50, lastFrom: 'loja', lastCustomerAt: null, isNewLead: null, firstMessageAt: null, days: [{ day: '2026-11-06', customer: false, store: true }] },
  ]);
  assert.ok(!JSON.stringify(out).includes('buy'));
});
test('2.12.8: no máximo 1 gravação por conversa a cada 30 s (o que chega no meio espera e é juntado)', () => {
  const buf = E.activityBuffer(30000);
  const act = (chatId, t, fromMe = false) => E.activityOfEvent({ chatId, fromMe, t });
  buf.add([act(A, D0 + 1), act(B, D0 + 2)]);
  assert.deepStrictEqual(plain(buf.take(1000)).map((x) => x.chatId), [A, B]); // 1ª vez: grava na hora
  buf.add([act(A, D0 + 10), act(A, D0 + 20, true)]);
  assert.deepStrictEqual(plain(buf.take(20000)), []); // 19 s depois: espera
  buf.add([act(A, D0 + 25)]);
  const w = plain(buf.take(31000)); // 30 s depois da última gravação: uma só, com tudo junto
  assert.deepStrictEqual(w.map((x) => [x.chatId, x.lastAt, x.lastFrom, x.lastCustomerAt]), [[A, D0 + 25, 'cliente', D0 + 25]]);
  assert.strictEqual(buf.size(), 0);
  // falhou ao gravar: volta para a fila e respeita os 30 s de novo
  buf.add([act(B, D0 + 40)]);
  const b = buf.take(40000);
  buf.putBack(b);
  assert.deepStrictEqual(plain(buf.take(50000)), []);
  assert.deepStrictEqual(plain(buf.take(70001)).map((x) => x.chatId), [B]);
});
test('2.12.8: juntar atividades só avança (última mensagem mais nova, 1ª mais antiga, lead já sabido fica)', () => {
  const m = E.mergeActivity(
    { chatId: A, phone: null, name: 'Ana', lastAt: 500, lastFrom: 'cliente', lastCustomerAt: 500, isNewLead: true, firstMessageAt: 100, days: [{ day: '2026-11-06', customer: true, store: false }] },
    { chatId: A, phone: '55119', name: null, lastAt: 300, lastFrom: 'loja', lastCustomerAt: 200, isNewLead: false, firstMessageAt: 50, days: [{ day: '2026-11-06', customer: false, store: true }] },
  );
  assert.deepStrictEqual(plain(m), { chatId: A, phone: '55119', name: 'Ana', lastAt: 500, lastFrom: 'cliente', lastCustomerAt: 500, isNewLead: true, firstMessageAt: 50, days: [{ day: '2026-11-06', customer: true, store: true }] });
});

// ── supabase-api.js ──
function api({ migration = true, sends = [], tracking = true, activity = true } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, prefer: init.headers && init.headers.Prefer, body: init.body ? JSON.parse(init.body) : undefined });
    if (!migration && (/wa_send_log\?select=origin/.test(p) || /wa_replies|wa_leads/.test(p))) return res(400, { code: '42703', message: 'column wa_send_log.origin does not exist' });
    if (!tracking && p.startsWith('wa_leads?select=last_message_at')) return res(400, { code: '42703', message: 'column wa_leads.last_message_at does not exist' });
    if (!activity && /^wa_chat_activity/.test(p)) return res(404, { code: 'PGRST205', message: "Could not find the table 'public.wa_chat_activity' in the schema cache" });
    if (p.startsWith('wa_items?select=id,follow_step')) return res(200, [{ id: '11111111-1111-1111-1111-111111111111', follow_step: 2 }]);
    if (method === 'GET' && p.startsWith('wa_send_log?select=id,created_at')) return res(200, sends.filter((s) => p.includes(s.chat_id)).slice(0, 1));
    if (method === 'GET' && p.startsWith('wa_send_log?select=id&chat_id=')) return res(200, p.includes('5511900000009') ? [{ id: 'x' }] : []);
    if (method === 'POST' && p === 'wa_send_log') return res(201, [{ id: '22222222-2222-2222-2222-222222222222' }]);
    return res(method === 'POST' ? 201 : 200, method === 'POST' ? null : []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, calls };
}
test('api: saveLeads grava uma vez por conversa (on_conflict, ignora repetidos), origem anúncio/orgânico', async () => {
  const { api: a, calls } = api();
  await a.saveLeads({ items: [
    { chatId: A, phone: '5511900000001', t: 1762430400, ad: { id: 'AD1', title: 'Promo' } },
    { chatId: A, phone: '5511900000001', t: 1762430500, ad: null },
    { chatId: B, phone: null, t: 1762430600, ad: null },
    { chatId: 'grupo@g.us', t: 1762430600 },
  ] });
  const post = calls.find((c) => c.method === 'POST');
  assert.strictEqual(post.path, 'wa_leads?on_conflict=chat_id');
  assert.match(post.prefer, /resolution=ignore-duplicates/);
  assert.deepStrictEqual(post.body.map((r) => [r.chat_id, r.origin, r.ad_id]), [[A, 'anuncio', 'AD1'], [B, 'organico', null]]);
  assert.strictEqual(post.body[0].first_message_at, new Date(1762430400 * 1000).toISOString());
});
test('api: sem a migration → "Atualize o banco" e nada é gravado', async () => {
  const { api: a, calls } = api({ migration: false });
  await assert.rejects(a.saveLeads({ items: [{ chatId: A, t: 1762430400 }] }), /Atualize o banco/);
  await assert.rejects(a.recordReplies({ items: [{ chatId: A, t: 1762430400 }] }), /Atualize o banco/);
  assert.ok(!calls.some((c) => c.method !== 'GET'));
  const q = await a.logQuickSend({ chat_id: A, item_id: null }); // mensagem rápida: segue como antes (não registra)
  assert.strictEqual(q.id, null);
});
test('api: "você digitou" pula quando já há envio registrado 3 min antes/depois', async () => {
  const { api: a, calls } = api();
  const r = await a.logManualSends({ items: [{ chatId: A, t: 1762430400 }, { chatId: '5511900000009@c.us', t: 1762430400 }] });
  assert.strictEqual(r.saved, 1);
  const post = calls.filter((c) => c.method === 'POST' && c.path === 'wa_send_log');
  assert.strictEqual(post.length, 1);
  assert.deepStrictEqual([post[0].body.source, post[0].body.origin, post[0].body.chat_id, post[0].body.created_at], ['manual', 'manual', A, new Date(1762430400000).toISOString()]);
});
test('api: resposta liga ao último envio (também pelo número quando a conversa é @lid) com os minutos', async () => {
  const sendAt = new Date(1762430400000).toISOString();
  const { api: a, calls } = api({ sends: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', chat_id: A, created_at: sendAt }] });
  const r = await a.recordReplies({ items: [{ chatId: '999@lid', phone: '5511900000001', t: 1762430400 + 600 }, { chatId: B, t: 1762430400 }] });
  assert.strictEqual(r.saved, 1);
  const q = calls.find((c) => c.method === 'GET' && c.path.startsWith('wa_send_log?select=id,created_at'));
  assert.ok(q.path.includes('"999@lid"') && q.path.includes(`"${A}"`), q.path);
  assert.ok(q.path.includes('status=eq.enviado') && q.path.includes('order=created_at.desc'));
  const post = calls.find((c) => c.method === 'POST' && c.path.startsWith('wa_replies'));
  assert.strictEqual(post.path, 'wa_replies?on_conflict=send_log_id');
  assert.match(post.prefer, /ignore-duplicates/);
  assert.deepStrictEqual([post.body.send_log_id, post.body.minutes, post.body.chat_id], ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, '999@lid']);
});
test('api: logSend grava a origem (automação) e a etapa da mensagem rápida', async () => {
  const { api: a, calls } = api();
  await a.logSend({ source: 'follow', source_id: null, contact_id: null, chat_id: A, item_id: '11111111-1111-1111-1111-111111111111', status: 'enviando' });
  const post = calls.find((c) => c.method === 'POST' && c.path === 'wa_send_log');
  assert.deepStrictEqual([post.body.origin, post.body.follow_step], ['automacao', 2]);
  const q = await a.logQuickSend({ chat_id: A, item_id: '11111111-1111-1111-1111-111111111111' });
  assert.ok(q.id);
  const quick = calls.filter((c) => c.method === 'POST' && c.path === 'wa_send_log')[1].body;
  assert.deepStrictEqual([quick.source, quick.origin, quick.status, quick.follow_step], ['rapida', 'rapida', 'enviado', 2]);
});
test('api: limite por hora/dia e último envio contam só os automáticos', async () => {
  const { api: a, calls } = api();
  await a.lastSendAt().catch(() => {});
  await a.sendCounts({ hourSince: new Date().toISOString(), daySince: new Date().toISOString() }).catch(() => {});
  const q = calls.filter((c) => c.path.startsWith('wa_send_log?'));
  assert.ok(q.length >= 2);
  q.forEach((c) => assert.ok(c.path.includes('source=in.(follow,disparo,agendado)'), c.path));
});
test('api: etapa do follow-up na mensagem rápida (1 a 20) e sem a coluna → "Atualize o banco"', async () => {
  const { api: a } = api({ migration: false });
  await assert.rejects(a.saveItem({ category_id: '33333333-3333-3333-3333-333333333333', title: 'X', parts: [{ type: 'texto', body: 'oi' }], follow_step: 25 }), /Etapa do follow-up/);
});

test('api 2.12.2/2.12.8: touchLeads só avança a última mensagem (PATCH condicional) e não grava mais o sinal de compra', async () => {
  const { api: a, calls } = api();
  const r = await a.touchLeads({ items: [{ chatId: A, t: 1762430400, buy: 1762430300 }, { chatId: B, t: 1762430500, buy: null }, { chatId: A, t: 1 }, { chatId: 'x@g.us', t: 5 }] });
  assert.strictEqual(r.saved, 2);
  const patches = calls.filter((c) => c.method === 'PATCH');
  const iso = (sec) => new Date(sec * 1000).toISOString();
  assert.deepStrictEqual(patches.map((c) => c.path), [
    `wa_leads?chat_id=eq.${A}&or=(last_message_at.is.null,last_message_at.lt.${iso(1762430400)})`,
    `wa_leads?chat_id=eq.${B}&or=(last_message_at.is.null,last_message_at.lt.${iso(1762430500)})`,
  ]);
  assert.deepStrictEqual(patches.map((c) => c.body), [{ last_message_at: iso(1762430400) }, { last_message_at: iso(1762430500) }]);
  assert.ok(!calls.some((c) => /buy_signal/.test(c.path + JSON.stringify(c.body || ''))));
});
test('api 2.12.8: saveChatActivity = um upsert por tabela (on_conflict, merge-duplicates), dias só com quem falou; nunca texto', async () => {
  const { api: a, calls } = api();
  const iso = (sec) => new Date(sec * 1000).toISOString();
  const r = await a.saveChatActivity({ items: [
    { chatId: A, phone: '5511900000001', name: 'Ana', lastAt: D0 + 300, lastFrom: 'loja', lastCustomerAt: D0 + 200, isNewLead: true, firstMessageAt: D0 - 600,
      days: [{ day: '2026-11-05', customer: true, store: false }, { day: '2026-11-06', customer: true, store: true }, { day: 'x', customer: true }, { day: '2026-11-07', customer: false, store: false }] },
    { chatId: B, lastAt: D0 + 50, lastFrom: 'zzz', isNewLead: 'sim', days: [] },
    { chatId: A, lastAt: D0 }, // repetida: ignora
    { chatId: 'grupo@g.us', lastAt: D0 },
  ] });
  assert.deepStrictEqual(plain(r), { saved: 2, days: 2 });
  const posts = calls.filter((c) => c.method === 'POST');
  assert.deepStrictEqual(posts.map((c) => [c.path, /merge-duplicates/.test(c.prefer)]), [['wa_chat_activity?on_conflict=chat_id', true], ['wa_chat_activity_days?on_conflict=chat_id,day', true]]);
  const [rowA, rowB] = posts[0].body;
  assert.deepStrictEqual([rowA.chat_id, rowA.phone, rowA.name, rowA.last_message_at, rowA.last_from, rowA.last_customer_at, rowA.is_new_lead, rowA.first_message_at],
    [A, '5511900000001', 'Ana', iso(D0 + 300), 'loja', iso(D0 + 200), true, iso(D0 - 600)]);
  assert.deepStrictEqual([rowB.last_from, rowB.is_new_lead, rowB.first_message_at, rowB.phone], [null, null, null, null]);
  assert.deepStrictEqual(Object.keys(rowA).sort(), Object.keys(rowB).sort()); // mesmas colunas em todas as linhas (exigência do upsert em lote)
  assert.deepStrictEqual(posts[1].body, [
    { chat_id: A, day: '2026-11-05', from_customer: true, from_store: false },
    { chat_id: A, day: '2026-11-06', from_customer: true, from_store: true },
  ]);
  await assert.rejects(a.saveChatActivity({ items: 'x' }), /Lista inválida/);
});
test('api 2.12.8: sem a migration 20261109120000 → { missing: true } e nada é gravado', async () => {
  const { api: a, calls } = api({ activity: false });
  const r = await a.saveChatActivity({ items: [{ chatId: A, lastAt: D0 }] });
  assert.deepStrictEqual(plain(r), { saved: 0, missing: true });
  assert.ok(!calls.some((c) => c.method !== 'GET'));
});
test('api 2.12.2: sem a coluna (migration 20261107120000 não aplicada) → não grava nada e não para o painel', async () => {
  const { api: a, calls } = api({ tracking: false });
  const r = await a.touchLeads({ items: [{ chatId: A, t: 1762430400, buy: 1762430400 }] });
  assert.deepStrictEqual(plain(r), { saved: 0, missing: true });
  assert.ok(!calls.some((c) => c.method !== 'GET'));
  await assert.rejects(a.touchLeads({ items: 'x' }), /Lista inválida/);
});

// ── wa-bridge.js ──
// older[chatId] = mensagens que a WA-JS entrega em getMessages (as antigas, ainda não carregadas); chatT = chat.t
function bridge({ msgs = {}, noEarlier = {}, older = {}, chatT = {}, extraChats = [] } = {}) {
  let onMsg = null;
  let listener = null;
  const replies = [];
  const loads = [];
  const chatModel = (id) => ({ id: { _serialized: id }, t: chatT[id], name: `Nome ${id.slice(-6, -5)}`, msgs: { getModelsArray: () => msgs[id] || [], msgLoadState: { noEarlierMsgs: noEarlier[id] } } });
  const wpp = {
    isReady: true,
    on: (ev, fn) => { if (ev === 'chat.new_message') onMsg = fn; },
    chat: {
      get: (id) => chatModel(id), list: async () => [...new Set([...Object.keys(msgs), ...extraChats])].map(chatModel),
      getMessages: async (id, opts) => { loads.push([id, opts.count]); return (older[id] || []).slice(-opts.count); },
    },
    contact: { getPnLidEntry: async () => ({ phoneNumber: { id: '5511977776666' } }) },
  };
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
  return { emit: (m) => onMsg(m), request, loads };
}
const msg = (chat, id, fromMe, t, extra = {}) => ({ id: { remote: { _serialized: chat }, fromMe, id }, t, type: 'chat', ...extra });
test('ponte: 1ª mensagem do cliente numa conversa sem nada antes = lead (com anúncio); conversa antiga não', async () => {
  const now = Math.floor(Date.now() / 1000);
  const first = msg(A, 'm1', false, now, { ctwaContext: { sourceId: 'AD9', title: 'Óculos' } });
  const old = msg(B, 'm3', false, now);
  const b = bridge({ msgs: { [A]: [first], [B]: [msg(B, 'm2', true, now - 3600), old] } });
  b.emit(first);
  b.emit(old);
  b.emit(msg(A, 'm4', true, now + 5));
  b.emit(msg(A, 'e2e', false, now + 6, { type: 'e2e_notification' })); // aviso do WhatsApp: ignorado
  const r = await b.request('convEvents', {});
  assert.ok(r.ok);
  const ev = r.data.events;
  assert.strictEqual(ev.length, 3);
  assert.deepStrictEqual([ev[0].chatId, ev[0].first, ev[0].ad.id, ev[0].ad.title, ev[0].phone], [A, true, 'AD9', 'Óculos', '5511900000001']);
  assert.strictEqual(ev[1].first, undefined);
  assert.strictEqual(ev[2].fromMe, true);
  assert.strictEqual((await b.request('convEvents', {})).data.events.length, 0); // a fila esvazia
});
test('ponte 2.12.8: sem o "sinal de compra" (nem "buy" nem o texto saem da ponte)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const list = [
    msg(A, 'p1', false, now, { body: 'Oi, quero o relógio' }),
    msg(A, 'p2', true, now + 1, { body: 'Segue a chave PIX: 123' }),
    msg(A, 'p3', false, now + 2, { type: 'image', caption: 'Comprovante 😊' }),
    msg(A, 'p6', false, now + 5, { body: 'paguei agora' }),
  ];
  const b = bridge({ msgs: { [A]: list } });
  list.forEach((m) => b.emit(m));
  const r = await b.request('convEvents', {});
  assert.strictEqual(r.data.events.length, 4);
  assert.ok(r.data.events.every((e) => !('buy' in e)));
  assert.ok(!/rel[oó]gio|chave|omprovante|paguei/i.test(JSON.stringify(r.data)), 'o texto não sai da ponte');
  assert.ok(!/BUY_SIGNAL|buySignalOf/.test(src('wa-bridge.js')));
});
test('ponte: o WhatsApp avisa que há mensagens mais antigas não carregadas → não é lead', async () => {
  const now = Math.floor(Date.now() / 1000);
  const m = msg(A, 'm1', false, now);
  const b = bridge({ msgs: { [A]: [m] }, noEarlier: { [A]: false } });
  b.emit(m);
  const r = await b.request('convEvents', {});
  assert.strictEqual(r.data.events[0].first, undefined);
});
test('ponte 2.12.8: ao abrir, varre TODAS as conversas com mensagem nas últimas 72 h (inclusive as que chegaram com o PC desligado)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const L = '123456@lid';
  const C3 = '5511900000003@c.us'; const C4 = '5511900000004@c.us'; const C5 = '5511900000005@c.us'; const C6 = '5511900000006@c.us';
  const b = bridge({
    msgs: {
      [A]: [msg(A, 'a1', false, now - 10 * 3600), msg(A, 'a2', true, now - 9 * 3600)], // chegou há 10 h (PC desligado), completa
      [B]: [msg(B, 'b1', false, now - 80 * 3600)], // mais de 72 h: fica de fora
      [C3]: [msg(C3, 'c1', true, now - 600)], // a loja falou primeiro (completa): não é lead
      [C4]: [msg(C4, 'd0', false, now - 100 * 3600), msg(C4, 'd1', false, now - 3600)], // antiga (tem mensagem antes das 72 h)
      [L]: [msg(L, 'l1', false, now - 600)], // não dá para saber: carrega as antigas → chegou ao começo → lead
      [C5]: [msg(C5, 'e2', false, now - 1200)], // carrega as antigas → chegou ao começo, que é da loja (5 dias atrás) → não é lead
    },
    noEarlier: { [A]: true, [B]: true, [C3]: true },
    older: { [L]: [], [C5]: [msg(C5, 'e1', true, now - 5 * 86400)], [C6]: [msg(C6, 'f1', false, now - 7200), msg(C6, 'f2', true, now - 7000)] },
    chatT: { [C6]: now - 7000 }, // C6: nenhuma mensagem carregada na tela (só a hora da conversa)
    extraChats: [C6, '120363@g.us'],
  });
  const r = await b.request('activityScan', {});
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.strictEqual(r.data.scanned, true);
  const by = Object.fromEntries(r.data.items.map((i) => [i.chatId, i]));
  assert.deepStrictEqual(Object.keys(by).sort(), [A, C3, C4, C5, C6, L].sort()); // B (> 72 h) e o grupo ficam de fora
  assert.deepStrictEqual([by[A].isNewLead, by[A].firstMessageAt, by[A].lastAt, by[A].lastFrom, by[A].lastCustomerAt], [true, now - 10 * 3600, now - 9 * 3600, 'loja', now - 10 * 3600]);
  // C4: tem mensagem antes das 72 h e o WhatsApp não diz se está completa → não sabe (null), e não é lead do período
  assert.deepStrictEqual([by[C3].isNewLead, by[C4].isNewLead, by[C5].isNewLead, by[L].isNewLead, by[C6].isNewLead], [false, null, false, true, true]);
  assert.deepStrictEqual([by[C6].lastAt, by[C6].lastFrom, by[C6].lastCustomerAt], [now - 7000, 'loja', now - 7200]);
  assert.ok(by[A].days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)) && by[A].days.some((d) => d.customer) && by[A].days.some((d) => d.store));
  assert.deepStrictEqual(by[C4].days.length >= 1 && by[C4].days.every((d) => d.customer && !d.store), true); // só a mensagem das últimas 72 h
  assert.strictEqual(by[A].phone, '5511900000001');
  // carregou as antigas só de quem precisava (L, C5 e C6), com limite por conversa
  assert.deepStrictEqual(plain(b.loads.map((x) => x[0])).sort(), [L, C5, C6].sort());
  assert.ok(b.loads.every((x) => x[1] === 50));
  // leads para wa_leads (como os eventos da varredura): A, L e C6
  assert.deepStrictEqual(plain(r.data.leads.map((e) => [e.chatId, e.first, e.scan, e.fromMe])).sort(), [[A, true, true, false], [C6, true, true, false], [L, true, true, false]].sort());
  assert.ok(!/body|caption/.test(JSON.stringify(r.data)));
});
test('ponte 2.12.8: a mensagem nova não espera a varredura (convEvents só esvazia a fila)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const m = msg(A, 'z1', false, now);
  const b = bridge({ msgs: { [A]: [m] }, noEarlier: { [A]: true } });
  b.emit(m);
  const r = await b.request('convEvents', { scan: true });
  assert.deepStrictEqual(plain(r.data.events.map((e) => [e.chatId, e.first, e.scan === true])), [[A, true, false]]);
  assert.strictEqual(r.data.scanned, false);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 14).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
