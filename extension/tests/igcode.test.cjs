// Testes da 2.18.0 (links rastreáveis do Instagram): node extension/tests/igcode.test.cjs
// - ponte (WA-JS falsa): a 1ª mensagem de um lead novo com "[IG-BIO]" sai com ig = 'IG-BIO' (evento e varredura da
//   abertura); mensagem sem código, mensagem que não é a 1ª e mensagem nossa não levam código; o texto NUNCA sai
// - motor (convTracker.ingest): o código vai junto do lead
// - supabase-api (PostgREST falso): saveLeads grava wa_leads como antes e ig_link_leads (código + link achado pelo
//   código, sem texto); sem a tabela ig_link_leads, grava só wa_leads; a mesma conversa não duplica
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const S = Math.floor(Date.parse('2026-11-11T15:00:00-03:00') / 1000);
const TEXT = 'Olá! Vim pelo Instagram 😊 [IG-BIO]';

// ── ponte com WA-JS falsa ──
function bridge(chats) {
  const handlers = {};
  const W = {
    WidFactory: { createWid: (id) => ({ _serialized: id, toString: () => id }) },
    lidPnCache: { getCurrentLid: () => null, getPhoneNumber: () => null },
    ApiContact: { getCurrentLid: () => null },
    ContactStore: { get: () => null },
  };
  const wpp = {
    isReady: true, isFullReady: true, webpack: { isReady: true, isFullReady: true }, whatsapp: W,
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    conn: { getMyUserId: () => ({ user: '5521987654321', _serialized: '5521987654321@c.us' }) },
    chat: { list: async () => chats, get: (id) => chats.find((c) => c.id._serialized === id) || null },
    labels: { getAllLabels: async () => [] },
    contact: { getPnLidEntry: async () => null, queryExists: async () => null },
  };
  let listener = null;
  const replies = [];
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' }, addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
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
  const emit = (ev, m) => (handlers[ev] || []).forEach((fn) => fn(m));
  return { request, emit };
}
const msg = (chat, fromMe, t, body, type = 'chat') => ({ id: { fromMe, id: `${chat}_${t}_${fromMe}`, _serialized: `${fromMe}_${chat}_${t}`, remote: { _serialized: chat } }, t, type, body: type === 'chat' ? body : undefined, caption: type === 'chat' ? undefined : body });
const chatOf = (id, msgs, o = {}) => ({ id: { _serialized: id }, t: msgs.length ? msgs[msgs.length - 1].t : S, labels: [], formattedTitle: null, contact: null, msgs: { getModelsArray: () => msgs, msgLoadState: { noEarlierMsgs: true } }, ...o });

test('ponte (evento): 1ª mensagem do lead com [IG-BIO] → ig "IG-BIO", sem o texto; outras mensagens sem código', async () => {
  const A = '5521911110001@c.us'; const B = '5521911110002@c.us'; const C = '5521911110003@c.us'; const D = '5521911110004@c.us';
  const a1 = msg(A, false, S - 60, TEXT);
  const b1 = msg(B, false, S - 50, 'Oi, quanto custa?');
  const c0 = msg(C, false, S - 3600, 'Oi');
  const c1 = msg(C, false, S - 40, 'Vim de novo [IG-STORIES]'); // não é a 1ª mensagem da conversa
  const d1 = msg(D, false, S - 30, 'foto [ig-coment]', 'image'); // legenda de foto, minúsculas
  const chats = [chatOf(A, [a1]), chatOf(B, [b1]), chatOf(C, [c0, c1]), chatOf(D, [d1])];
  const b = bridge(chats);
  [a1, b1, c1, d1].forEach((m) => b.emit('chat.new_message', m));
  b.emit('chat.new_message', msg(A, true, S - 20, 'Olá! [IG-BIO] tudo bem?')); // nossa: não é lead
  const r = await b.request('convEvents', {});
  assert.ok(r.ok, JSON.stringify(r));
  const ev = plain(r.data.events);
  const firsts = ev.filter((e) => e.first);
  assert.deepStrictEqual(firsts.map((e) => [e.chatId, e.ig]), [[A, 'IG-BIO'], [B, null], [D, 'IG-COMENT']]);
  assert.ok(!JSON.stringify(ev).includes('Vim pelo Instagram'), 'o texto não sai da ponte');
  assert.ok(!JSON.stringify(ev).includes('quanto custa'), 'o texto não sai da ponte');
  assert.ok(ev.filter((e) => e.chatId === C).every((e) => !e.ig), 'mensagem que não é a 1ª não leva código');
});

test('ponte (varredura da abertura): lead novo das últimas 72 h com o código', async () => {
  const A = '5521922220001@c.us'; const B = '80685306003593@lid';
  const chats = [chatOf(A, [msg(A, false, S - 7200, TEXT), msg(A, true, S - 7000, 'Oi! Tudo bem?')]), chatOf(B, [msg(B, true, S - 7200, '[IG-BIO]'), msg(B, false, S - 7000, 'oi')])];
  const b = bridge(chats);
  const r = await b.request('activityScan', { now: S });
  assert.ok(r.ok, JSON.stringify(r));
  const leads = plain(r.data.leads);
  assert.deepStrictEqual(leads.map((l) => [l.chatId, l.ig]), [[A, 'IG-BIO']], 'a conversa que começou com a loja não é lead');
  assert.ok(!JSON.stringify(plain(r.data)).includes('Vim pelo Instagram'));
});

test('motor: o código vai junto do lead (e só no lead)', () => {
  const ectx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math });
  vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
  const tr = ectx.TspEngine.convTracker();
  const out = plain(tr.ingest([
    { chatId: '5521911110001@c.us', fromMe: false, t: S - 60, first: true, ad: null, ig: 'IG-BIO', phone: '5521911110001' },
    { chatId: '5521911110002@c.us', fromMe: false, t: S - 50, first: true, ad: { id: '1', title: 'Anúncio' } },
  ]));
  assert.deepStrictEqual(out.leads.map((l) => [l.chatId, l.ig || null, !!l.ad]), [['5521911110001@c.us', 'IG-BIO', false], ['5521911110002@c.us', null, true]]);
});

// ── PostgREST falso ──
function db(seed, opts = {}) {
  const T = { wa_leads: [], ig_link_leads: [], ig_links: [], ...seed };
  const writes = [];
  const handle = (method, url, body) => {
    const [table, qs] = url.split('?');
    if ((opts.missing || []).includes(table)) return { status: 404, out: { message: `relation "public.${table}" does not exist` } };
    const rows = T[table] || (T[table] = []);
    const params = (qs || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
    let conflict = null; let limit = Infinity;
    params.forEach(([k, v]) => { if (k === 'on_conflict') conflict = v.split(','); if (k === 'limit') limit = Number(v); });
    if (method === 'GET') return { status: 200, out: rows.slice(0, limit).map((r) => ({ ...r })) };
    writes.push({ method, table, body });
    if (method === 'POST') (Array.isArray(body) ? body : [body]).forEach((b) => { if (!(conflict && rows.find((r) => conflict.every((c) => String(r[c]) === String(b[c]))))) rows.push({ ...b }); });
    return { status: 201, out: [] };
  };
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(String(url).replace('https://x.supabase.co/rest/v1/', ''));
    const { status, out } = handle(String(init.method || 'GET').toUpperCase(), p, init.body ? JSON.parse(init.body) : undefined);
    return { ok: status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(out) };
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  const api = new Proxy(ctx.WaApi, { get: (t, k) => (typeof t[k] !== 'function' ? t[k] : (...a) => { const r = t[k](...a); return r && typeof r.then === 'function' ? r.then(plain) : plain(r); }) });
  return { api, T, writes };
}
const LINK_BIO = '11111111-1111-4111-8111-111111111111';

test('saveLeads: wa_leads como antes + ig_link_leads (código e link pelo código, sem texto); não duplica', async () => {
  const { api, T } = db({ ig_links: [{ id: LINK_BIO, code: 'IG-BIO' }] });
  const items = [
    { chatId: '5521911110001@c.us', phone: '5521911110001', t: S - 60, ad: null, ig: 'IG-BIO' },
    { chatId: '5521911110002@c.us', phone: '5521911110002', t: S - 50, ad: null, ig: null },
    { chatId: '5521911110003@c.us', phone: null, t: S - 40, ad: null, ig: 'IG-NOVO' }, // código sem link (ainda)
    { chatId: '5521911110004@c.us', phone: null, t: S - 30, ad: null, ig: 'lixo <script>' },
  ];
  const r = await api.saveLeads({ items });
  assert.deepStrictEqual([r.saved, r.ig], [4, 2]);
  assert.deepStrictEqual(T.wa_leads.map((l) => [l.chat_id, l.origin]), items.map((i) => [i.chatId, 'organico']), 'wa_leads continua igual (orgânico)');
  assert.deepStrictEqual(T.ig_link_leads.map((l) => [l.chat_id, l.code, l.link_id, l.phone]), [['5521911110001@c.us', 'IG-BIO', LINK_BIO, '5521911110001'], ['5521911110003@c.us', 'IG-NOVO', null, null]]);
  assert.deepStrictEqual(Object.keys(T.ig_link_leads[0]).sort(), ['chat_id', 'code', 'first_message_at', 'link_id', 'phone'], 'nenhum texto gravado');
  await api.saveLeads({ items: items.slice(0, 1) });
  assert.strictEqual(T.ig_link_leads.length, 2, 'a mesma conversa não duplica');
});

test('saveLeads sem a tabela ig_link_leads (migration não aplicada): grava só wa_leads, sem erro', async () => {
  const { api, T, writes } = db({}, { missing: ['ig_link_leads'] });
  const r = await api.saveLeads({ items: [{ chatId: '5521911110001@c.us', phone: null, t: S - 60, ad: null, ig: 'IG-BIO' }] });
  assert.deepStrictEqual([r.saved, r.ig], [1, 0]);
  assert.strictEqual(T.wa_leads.length, 1);
  assert.ok(!writes.some((w) => w.table === 'ig_link_leads'));
});

test('a regra do código é a mesma do ERP (src/lib/igLinks.ts)', () => {
  const erp = fs.readFileSync(path.join(EXT, '..', 'src', 'lib', 'igLinks.ts'), 'utf8').match(/CODE_IN_TEXT_RE = (\/.*\/i?);/)[1];
  const ext = src('wa-bridge.js').match(/IG_CODE_RE = (\/.*\/i?);/)[1];
  assert.strictEqual(ext, erp);
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.message}`); }
  }
  console.log(`\n${tests.length - fail}/${tests.length} testes passaram`);
  if (fail) process.exitCode = 1;
})();
