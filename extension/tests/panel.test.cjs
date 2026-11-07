// Testes da 2.10.0 (registros para o Painel de resultados do ERP). Sem dependências: node extension/tests/panel.test.cjs
// - convTracker (engine.js): leads, "você digitou" uma vez por vez de falar, 1ª resposta depois de cada envio
// - supabase-api.js com fetch falso: saveLeads, logManualSends, recordReplies, logSend com origem/etapa, filtros dos automáticos
// - wa-bridge.js com uma WA-JS falsa: convEvents (lead novo, conversa antiga, varredura das últimas 24 h)
// - 2.12.2 (aba Rastreamento do ERP): última mensagem e sinal de compra por conversa (touchLeads), sem o texto
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

test('tracker 2.12.2: activity = última mensagem e último sinal de compra por conversa (varredura não entra)', () => {
  const t = E.convTracker();
  const out = t.ingest([
    { chatId: A, fromMe: false, t: 100, first: true },
    { chatId: A, fromMe: true, t: 300, buy: true },
    { chatId: A, fromMe: false, t: 200, buy: true },
    { chatId: A, fromMe: false, t: 400 },
    { chatId: B, fromMe: true, t: 50 },
    { chatId: '5511900000003@c.us', fromMe: false, t: 70, first: true, scan: true },
  ]);
  assert.deepStrictEqual(plain(out.activity), [{ chatId: B, t: 50, buy: null }, { chatId: A, t: 400, buy: 300 }]);
});

// ── supabase-api.js ──
function api({ migration = true, sends = [], tracking = true } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, prefer: init.headers && init.headers.Prefer, body: init.body ? JSON.parse(init.body) : undefined });
    if (!migration && (/wa_send_log\?select=origin/.test(p) || /wa_replies|wa_leads/.test(p))) return res(400, { code: '42703', message: 'column wa_send_log.origin does not exist' });
    if (!tracking && p.startsWith('wa_leads?select=last_message_at')) return res(400, { code: '42703', message: 'column wa_leads.last_message_at does not exist' });
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

test('api 2.12.2: touchLeads só avança a última mensagem e o sinal de compra (PATCH condicional)', async () => {
  const { api: a, calls } = api();
  const r = await a.touchLeads({ items: [{ chatId: A, t: 1762430400, buy: 1762430300 }, { chatId: B, t: 1762430500, buy: null }, { chatId: A, t: 1 }, { chatId: 'x@g.us', t: 5 }] });
  assert.strictEqual(r.saved, 2);
  const patches = calls.filter((c) => c.method === 'PATCH');
  const iso = (sec) => new Date(sec * 1000).toISOString();
  assert.deepStrictEqual(patches.map((c) => c.path), [
    `wa_leads?chat_id=eq.${A}&or=(last_message_at.is.null,last_message_at.lt.${iso(1762430400)})`,
    `wa_leads?chat_id=eq.${A}&or=(buy_signal_at.is.null,buy_signal_at.lt.${iso(1762430300)})`,
    `wa_leads?chat_id=eq.${B}&or=(last_message_at.is.null,last_message_at.lt.${iso(1762430500)})`,
  ]);
  assert.deepStrictEqual(patches.map((c) => c.body), [{ last_message_at: iso(1762430400) }, { buy_signal_at: iso(1762430300) }, { last_message_at: iso(1762430500) }]);
});
test('api 2.12.2: sem a coluna (migration 20261107120000 não aplicada) → não grava nada e não para o painel', async () => {
  const { api: a, calls } = api({ tracking: false });
  const r = await a.touchLeads({ items: [{ chatId: A, t: 1762430400, buy: 1762430400 }] });
  assert.deepStrictEqual(plain(r), { saved: 0, missing: true });
  assert.ok(!calls.some((c) => c.method !== 'GET'));
  await assert.rejects(a.touchLeads({ items: 'x' }), /Lista inválida/);
});

// ── wa-bridge.js ──
function bridge({ msgs = {}, noEarlier = {} } = {}) {
  let onMsg = null;
  let listener = null;
  const replies = [];
  const chatModel = (id) => ({ id: { _serialized: id }, msgs: { getModelsArray: () => msgs[id] || [], msgLoadState: { noEarlierMsgs: noEarlier[id] } } });
  const wpp = {
    isReady: true,
    on: (ev, fn) => { if (ev === 'chat.new_message') onMsg = fn; },
    chat: { get: (id) => chatModel(id), list: async () => Object.keys(msgs).map(chatModel) },
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
  return { emit: (m) => onMsg(m), request };
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
test('ponte 2.12.2: "buy" só quando a mensagem (nossa ou do cliente, texto ou legenda) tem sinal de compra; sem o texto', async () => {
  const now = Math.floor(Date.now() / 1000);
  const list = [
    msg(A, 'p1', false, now, { body: 'Oi, quero o relógio' }),
    msg(A, 'p2', true, now + 1, { body: 'Segue a chave PIX: 123' }),
    msg(A, 'p3', false, now + 2, { type: 'image', caption: 'Comprovante 😊' }),
    msg(A, 'p4', false, now + 3, { body: 'Qual o endereço de entrega?' }),
    msg(A, 'p5', true, now + 4, { body: 'Pagamento confirmado' }),
    msg(A, 'p6', false, now + 5, { body: 'paguei agora' }),
    msg(A, 'p7', false, now + 6, { body: 'vi no pixel do site' }),
  ];
  const b = bridge({ msgs: { [A]: list } });
  list.forEach((m) => b.emit(m));
  const r = await b.request('convEvents', {});
  assert.deepStrictEqual(plain(r.data.events.map((e) => e.buy === true)), [false, true, true, true, true, true, false]);
  assert.ok(!/rel[oó]gio|chave|omprovante|endere|confirmado/i.test(JSON.stringify(r.data)), 'o texto não sai da ponte');
});
test('ponte: o WhatsApp avisa que há mensagens mais antigas não carregadas → não é lead', async () => {
  const now = Math.floor(Date.now() / 1000);
  const m = msg(A, 'm1', false, now);
  const b = bridge({ msgs: { [A]: [m] }, noEarlier: { [A]: false } });
  b.emit(m);
  const r = await b.request('convEvents', {});
  assert.strictEqual(r.data.events[0].first, undefined);
});
test('ponte: ao abrir, recupera os leads das últimas 24 h (conversa completa, 1ª mensagem do cliente)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const L = '123456@lid';
  const b = bridge({
    msgs: {
      [A]: [msg(A, 'a1', false, now - 3600), msg(A, 'a2', true, now - 3500)], // lead de 1 h atrás
      [B]: [msg(B, 'b1', false, now - 30 * 3600)], // mais de 24 h
      [L]: [msg(L, 'l1', false, now - 600)], // lead @lid (sem saber se está completa)
      '5511900000003@c.us': [msg('5511900000003@c.us', 'c1', true, now - 600)], // a loja falou primeiro
    },
    noEarlier: { [A]: true, [B]: true, '5511900000003@c.us': true },
  });
  const r = await b.request('convEvents', { scan: true });
  assert.strictEqual(r.data.scanned, true);
  assert.deepStrictEqual(plain(r.data.events.map((e) => [e.chatId, e.scan, e.first])), [[A, true, true]]);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
