// Testes da 2.18.2 (Instagram FASE 3): a FRASE das automações do Instagram na 1ª mensagem do WhatsApp.
//   node extension/tests/igphrase.test.cjs
// - ponte (WA-JS falsa): 1ª mensagem SEM código [IG-...] sai com igh = resumo (hash) da mensagem; o texto nunca sai;
//   mensagem com código continua só com o código; mensagem nossa/que não é a 1ª: nada
// - motor: o resumo vai junto do lead
// - supabase-api (PostgREST falso): resumo igual ao da frase de uma automação (ig_automations.wa_phrase) → grava
//   ig_link_leads com o código da automação (sem texto e sem link); a frase do Direct (ig_direct_phrase) → IG-DIRECT;
//   frase diferente → nada; sem a tabela ig_automations → nada (sem erro)
// - a mesma regra do resumo na ponte e no supabase-api
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
const S = Math.floor(Date.parse('2026-11-12T15:00:00-03:00') / 1000);
const PHRASE = 'Olá! Vi o comentário no Instagram e quero saber da promoção 🔥';

// ── ponte com WA-JS falsa (como igcode.test.cjs) ──
function bridge(chats) {
  const handlers = {};
  const W = { WidFactory: { createWid: (id) => ({ _serialized: id, toString: () => id }) }, lidPnCache: { getCurrentLid: () => null, getPhoneNumber: () => null }, ApiContact: { getCurrentLid: () => null }, ContactStore: { get: () => null } };
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

test('ponte: 1ª mensagem sem código → igh (resumo) e nunca o texto; com código → só o código', async () => {
  const A = '5521911110001@c.us'; const B = '5521911110002@c.us'; const C = '5521911110003@c.us';
  const a1 = msg(A, false, S - 60, PHRASE);
  const b1 = msg(B, false, S - 50, 'Olá! Vim pelo Instagram 😊 [IG-BIO]');
  const c0 = msg(C, false, S - 3600, 'Oi');
  const c1 = msg(C, false, S - 40, PHRASE);
  const b = bridge([chatOf(A, [a1]), chatOf(B, [b1]), chatOf(C, [c0, c1])]);
  [a1, b1, c1].forEach((m) => b.emit('chat.new_message', m));
  b.emit('chat.new_message', msg(A, true, S - 20, PHRASE));
  const r = await b.request('convEvents', {});
  assert.ok(r.ok, JSON.stringify(r));
  const ev = plain(r.data.events);
  const firsts = ev.filter((e) => e.first);
  assert.deepStrictEqual(firsts.map((e) => [e.chatId, e.ig, typeof e.igh === 'string' && /^[0-9a-f]{16}$/.test(e.igh)]), [[A, null, true], [B, 'IG-BIO', false]]);
  assert.ok(!JSON.stringify(ev).includes('promoção') && !JSON.stringify(ev).includes('comentário'), 'o texto não sai da ponte');
  assert.ok(ev.filter((e) => e.chatId === C).every((e) => !e.igh), 'mensagem que não é a 1ª: nada');
  const scan = bridge([chatOf(A, [msg(A, false, S - 7200, PHRASE), msg(A, true, S - 7000, 'Oi!')])]);
  const sr = plain((await scan.request('activityScan', { now: S })).data.leads);
  assert.ok(sr.length === 1 && sr[0].igh === firsts[0].igh, `varredura da abertura: o mesmo resumo ${JSON.stringify(sr)}`);
});
test('motor: o resumo vai junto do lead (sem o código)', () => {
  const ectx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math });
  vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
  const out = plain(ectx.TspEngine.convTracker().ingest([{ chatId: '5521911110001@c.us', fromMe: false, t: S, first: true, ad: null, ig: null, igh: 'abcdef0123456789' }, { chatId: '5521911110002@c.us', fromMe: false, t: S, first: true, ad: null, ig: 'IG-BIO', igh: 'abcdef0123456789' }]));
  assert.deepStrictEqual(out.leads.map((l) => [l.ig || null, l.igh || null]), [[null, 'abcdef0123456789'], ['IG-BIO', null]]);
});

// ── PostgREST falso (como igcode.test.cjs) ──
function db(seed, opts = {}) {
  const T = { wa_leads: [], ig_link_leads: [], ig_links: [], ...seed };
  const writes = [];
  const handle = (method, url, body) => {
    const [table, qs] = url.split('?');
    if ((opts.missing || []).includes(table)) return { status: 404, out: { message: `relation "public.${table}" does not exist` } };
    const rows = T[table] || (T[table] = []);
    const params = (qs || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
    let conflict = null;
    params.forEach(([k, v]) => { if (k === 'on_conflict') conflict = v.split(','); });
    if (method === 'GET') return { status: 200, out: rows.map((r) => ({ ...r })) };
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
async function hashOf(text) {
  const c = '5521900000000@c.us';
  const m = msg(c, false, S, text);
  const b = bridge([chatOf(c, [m])]);
  b.emit('chat.new_message', m);
  return plain((await b.request('convEvents', {})).data.events).find((e) => e.first).igh;
}

test('saveLeads: resumo da frase de uma automação → ig_link_leads com o código dela; frase do Direct → IG-DIRECT; outra frase → nada', async () => {
  const { api, T } = db({ ig_automations: [{ code: 'IG-A-COMENT', wa_phrase: PHRASE }], system_config: [{ key: 'ig_direct_phrase', value: 'Olá! Vim pelo Direct do Instagram 😊' }] });
  const items = [
    { chatId: '5521911110001@c.us', phone: '5521911110001', t: S - 60, ad: null, igh: await hashOf(PHRASE) },
    { chatId: '5521911110002@c.us', phone: null, t: S - 50, ad: null, igh: await hashOf('  olá!   vi o comentário no INSTAGRAM e quero saber da promoção 🔥 ') }, // espaços e maiúsculas: a mesma frase
    { chatId: '5521911110003@c.us', phone: null, t: S - 40, ad: null, igh: await hashOf('Olá! Vim pelo Direct do Instagram 😊') },
    { chatId: '5521911110004@c.us', phone: null, t: S - 30, ad: null, igh: await hashOf('Olá! Vi o comentário no Instagram e quero saber o preço') },
    { chatId: '5521911110005@c.us', phone: null, t: S - 20, ad: null, igh: 'nao-e-hash' },
  ];
  const r = await api.saveLeads({ items });
  assert.deepStrictEqual([r.saved, r.ig], [5, 3]);
  assert.deepStrictEqual(T.ig_link_leads.map((l) => [l.chat_id, l.code, l.link_id]), [['5521911110001@c.us', 'IG-A-COMENT', null], ['5521911110002@c.us', 'IG-A-COMENT', null], ['5521911110003@c.us', 'IG-DIRECT', null]]);
  assert.deepStrictEqual(Object.keys(T.ig_link_leads[0]).sort(), ['chat_id', 'code', 'first_message_at', 'link_id', 'match', 'phone'], 'nenhum texto gravado (2.18.3: + como foi ligada)');
});
test('saveLeads sem a tabela ig_automations: nada de frase, sem erro (o código [IG-...] continua)', async () => {
  const { api, T } = db({ ig_links: [] }, { missing: ['ig_automations', 'system_config'] });
  const r = await api.saveLeads({ items: [{ chatId: '5521911110001@c.us', phone: null, t: S, ad: null, igh: await hashOf(PHRASE) }, { chatId: '5521911110002@c.us', phone: null, t: S, ad: null, ig: 'IG-BIO' }] });
  assert.deepStrictEqual([r.saved, r.ig], [2, 1]);
  assert.deepStrictEqual(T.ig_link_leads.map((l) => l.code), ['IG-BIO']);
});
test('a regra do resumo é a mesma na ponte e no supabase-api; manifesto 2.18.2 ou depois', () => {
  const body = (f) => src(f).match(/function igPhraseHash\(text\) \{([\s\S]*?)\n {2}\}/)[1];
  assert.strictEqual(body('wa-bridge.js'), body('supabase-api.js'));
  const v = JSON.parse(src('manifest.json')).version.split('.').map(Number);
  assert.ok(v[0] > 2 || (v[0] === 2 && (v[1] > 18 || (v[1] === 18 && v[2] >= 2))));
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.message}`); }
  }
  console.log(`\n${tests.length - fail}/${tests.length} testes passaram`);
  if (fail) process.exitCode = 1;
})();
