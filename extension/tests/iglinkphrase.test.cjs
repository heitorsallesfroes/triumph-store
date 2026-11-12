// Testes da 2.18.3: links rastreáveis do Instagram SEM o código visível — a FRASE do link liga a conversa.
//   node extension/tests/iglinkphrase.test.cjs
// - ponte (WA-JS falsa): com as frases mandadas pelo painel (igPhrases), a 1ª mensagem igual, com pequenas edições,
//   sem acento/pontuação, com o emoji quebrado ("�") ou com texto a mais sai com igh = resumo da FRASE; outra mensagem
//   → resumo da própria mensagem (como na 2.18.2); duas frases empatadas → nenhuma; o texto nunca sai
// - supabase-api (PostgREST falso com filtros): frase de um link → ig_link_leads com o código e o link, match 'frase';
//   [IG-...] antigo → 'codigo'; reserva por horário (1 clique sem conversa até 10 min antes → 'horario'; 2 cliques,
//   clique velho, clique já usado ou lead de anúncio → nada); igPhraseList junta links ativos + automações + Direct;
//   sem a coluna match: grava como antes e não liga por horário
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
const BIO = 'Olá! Vi o perfil de vocês no Instagram e quero saber mais';
const STORIES = 'Oi! Vi o story de vocês e fiquei interessado(a)';
const COMENT = 'Olá! Comentei no post de vocês e quero saber mais';
const AUTO = 'Olá! Vi o comentário no Instagram e quero saber da promoção 🔥';
const PHRASES = [BIO, STORIES, COMENT, AUTO];

// ── ponte com WA-JS falsa (como igphrase.test.cjs) ──
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
const chatOf = (id, msgs) => ({ id: { _serialized: id }, t: msgs.length ? msgs[msgs.length - 1].t : S, labels: [], formattedTitle: null, contact: null, msgs: { getModelsArray: () => msgs, msgLoadState: { noEarlierMsgs: true } } });
// resumo que a ponte manda para uma 1ª mensagem (com ou sem as frases carregadas)
async function ighOf(text, phrases = PHRASES, type = 'chat') {
  const c = '5521900000000@c.us';
  const m = msg(c, false, S, text, type);
  const b = bridge([chatOf(c, [m])]);
  if (phrases) assert.ok((await b.request('igPhrases', { list: phrases })).ok);
  b.emit('chat.new_message', m);
  const ev = plain((await b.request('convEvents', {})).data.events);
  assert.ok(!JSON.stringify(ev).includes(String(text).slice(0, 12)), 'o texto não sai da ponte');
  return ev.find((e) => e.first).igh || null;
}

test('ponte: frase igual, com pequenas edições, sem acento, com o emoji quebrado ou com texto a mais → resumo da FRASE', async () => {
  const bio = await ighOf(BIO);
  assert.match(bio, /^[0-9a-f]{16}$/);
  for (const t of [
    'ola vi o perfil de voces no instagram e quero saber mais', // sem acento e pontuação
    'OLÁ!! Vi o perfil de vocês no Instagram, e quero saber mais.', // maiúsculas e pontuação
    'Olá! Vi o perfil de vcs no Instagram e quero saber mais', // "vcs"
    'Olá! Vi o perfil de vocês no Instagram e quero saber mais 😊', // emoji a mais
    'Olá! Vi o perfil de vocês no Instagram e quero saber mais � ', // o emoji que chegou quebrado
    'Bom dia! Olá! Vi o perfil de vocês no Instagram e quero saber mais sobre o iPhone 15 de 128 GB', // texto a mais
  ]) assert.strictEqual(await ighOf(t), bio, t);
  assert.strictEqual(await ighOf(BIO, PHRASES, 'image'), bio, 'legenda de uma foto também');
  assert.strictEqual(await ighOf('Oi! vi o story de vcs e fiquei interessada'), await ighOf(STORIES));
});
test('ponte: mensagem diferente → resumo da própria mensagem; sem as frases → só a igual (2.18.2); empate → nenhuma', async () => {
  const bio = await ighOf(BIO);
  const other = await ighOf('Olá, quanto custa o iPhone 15?');
  assert.ok(other && other !== bio);
  assert.notStrictEqual(await ighOf('Olá! Vi o Instagram de vocês'), bio, 'pedaço curto da frase não liga');
  assert.strictEqual(await ighOf(BIO, null), await ighOf(BIO), 'sem a lista, a frase igual dá o mesmo resumo');
  assert.notStrictEqual(await ighOf('ola vi o perfil de vcs no instagram e quero saber mais', null), bio, 'sem a lista, com edição não liga');
  const twins = ['Quero saber do iPhone 15 Pro Max', 'Quero saber do iPhone 15 Pro Mac'];
  const t = await ighOf('Quero saber do iPhone 15 Pro Maz', twins);
  assert.ok(t && t !== await ighOf(twins[0], twins) && t !== await ighOf(twins[1], twins), 'empate entre duas frases: nenhuma');
});

// ── PostgREST falso com os filtros usados (eq/gte/lte, select) ──
function db(seed, opts = {}) {
  const T = { wa_leads: [], ig_link_leads: [], ig_links: [], ig_link_clicks: [], ...seed };
  const handle = (method, url, body) => {
    const [table, qs] = url.split('?');
    if ((opts.missing || []).includes(table)) return { status: 404, out: { message: `relation "public.${table}" does not exist` } };
    const rows = T[table] || (T[table] = []);
    const params = (qs || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
    let conflict = null;
    let list = rows;
    for (const [k, v] of params) {
      if (k === 'on_conflict') conflict = v.split(',');
      else if (k === 'select') { if (opts.noMatch && table === 'ig_link_leads' && /\bmatch\b/.test(v)) return { status: 400, out: { message: 'column ig_link_leads.match does not exist' } }; }
      else if (['order', 'limit'].includes(k)) continue;
      else {
        const [op, ...rest] = v.split('.'); const val = rest.join('.');
        list = list.filter((r) => (op === 'eq' ? String(r[k]) === val : op === 'gte' ? String(r[k]) >= val : op === 'lte' ? String(r[k]) <= val : true));
      }
    }
    if (method === 'GET') return { status: 200, out: list.map((r) => ({ ...r })) };
    if (method === 'POST') {
      for (const b of Array.isArray(body) ? body : [body]) {
        if (opts.noMatch && table === 'ig_link_leads' && 'match' in b) return { status: 400, out: { message: 'column ig_link_leads.match does not exist' } };
        if (!(conflict && rows.find((r) => conflict.every((c) => String(r[c]) === String(b[c]))))) rows.push({ ...b });
      }
    }
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
  return { api, T };
}
const L = { bio: 'aaaaaaaa-0000-4000-8000-000000000001', stories: 'aaaaaaaa-0000-4000-8000-000000000002', coment: 'aaaaaaaa-0000-4000-8000-000000000003', off: 'aaaaaaaa-0000-4000-8000-000000000004' };
const LINKS = [
  { id: L.bio, code: 'IG-BIO', message: BIO, active: true }, { id: L.stories, code: 'IG-STORIES', message: STORIES, active: true },
  { id: L.coment, code: 'IG-COMENT', message: COMENT, active: true }, { id: L.off, code: 'IG-VELHO', message: 'Frase de um link desligado aqui', active: false },
];
const iso = (sec) => new Date(sec * 1000).toISOString();
const click = (linkId, sec) => ({ link_id: linkId, created_at: iso(sec), device: 'iPhone/iPad', browser: 'Instagram', ip_hash: null });
const chat = (n) => `55219111100${String(n).padStart(2, '0')}@c.us`;

test('igPhraseList: links ATIVOS + automações (frase) + Direct, sem repetir', async () => {
  const { api } = db({ ig_links: LINKS, ig_automations: [{ code: 'IG-A-COMENT', wa_phrase: AUTO, link_mode: 'frase' }, { code: 'IG-A-X', wa_phrase: BIO, link_mode: 'frase' }], system_config: [{ key: 'ig_direct_phrase', value: 'Olá! Vim pelo Direct do Instagram' }] });
  const r = await api.igPhraseList();
  assert.deepStrictEqual(r.list, [AUTO, BIO, 'Olá! Vim pelo Direct do Instagram', STORIES, COMENT]);
});
test('saveLeads: frase do link → código + link + "frase"; [IG-...] antigo → "codigo"; frase de automação continua', async () => {
  const { api, T } = db({ ig_links: LINKS, ig_automations: [{ code: 'IG-A-COMENT', wa_phrase: AUTO, link_mode: 'frase' }] });
  const items = [
    { chatId: chat(1), phone: null, t: S - 60, ad: null, igh: await ighOf('ola vi o perfil de vcs no instagram e quero saber mais') },
    { chatId: chat(2), phone: null, t: S - 50, ad: null, igh: await ighOf(STORIES) },
    { chatId: chat(3), phone: null, t: S - 40, ad: null, ig: 'IG-BIO' },
    { chatId: chat(4), phone: null, t: S - 30, ad: null, igh: await ighOf(AUTO) },
    { chatId: chat(5), phone: null, t: S - 20, ad: null, igh: await ighOf('Frase de um link desligado aqui') },
  ];
  const r = await api.saveLeads({ items });
  assert.deepStrictEqual([r.saved, r.ig], [5, 4]);
  assert.deepStrictEqual(T.ig_link_leads.map((l) => [l.chat_id, l.code, l.link_id, l.match]), [
    [chat(1), 'IG-BIO', L.bio, 'frase'], [chat(2), 'IG-STORIES', L.stories, 'frase'], [chat(3), 'IG-BIO', L.bio, 'codigo'], [chat(4), 'IG-A-COMENT', null, 'frase'],
  ], 'link desligado: a frase dele não liga');
  assert.ok(T.ig_link_leads.every((l) => !Object.values(l).some((v) => typeof v === 'string' && /vi o|perfil|story/i.test(v))), 'nenhum texto gravado');
});
test('reserva por horário: exatamente 1 clique sem conversa até 10 min antes → "horario"; senão nada', async () => {
  // caso 1: 1 clique 5 min antes → liga
  let x = db({ ig_links: LINKS, ig_link_clicks: [click(L.stories, S - 300)] });
  await x.api.saveLeads({ items: [{ chatId: chat(10), phone: null, t: S, ad: null, igh: await ighOf('Oi, tudo bem? Quero ver os modelos') }] });
  assert.deepStrictEqual(x.T.ig_link_leads.map((l) => [l.code, l.link_id, l.match]), [['IG-STORIES', L.stories, 'horario']]);
  // caso 2: 2 cliques sem conversa → não dá para saber
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.stories, S - 300), click(L.bio, S - 200)] });
  await x.api.saveLeads({ items: [{ chatId: chat(11), phone: null, t: S, ad: null, igh: null }] });
  assert.strictEqual(x.T.ig_link_leads.length, 0);
  // caso 3: clique de 11 min antes → fora
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.bio, S - 660)] });
  await x.api.saveLeads({ items: [{ chatId: chat(12), phone: null, t: S, ad: null }] });
  assert.strictEqual(x.T.ig_link_leads.length, 0);
  // caso 4: lead de anúncio → nunca pelo horário
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.bio, S - 100)] });
  await x.api.saveLeads({ items: [{ chatId: chat(13), phone: null, t: S, ad: { id: '1', title: 'Anúncio' } }] });
  assert.strictEqual(x.T.ig_link_leads.length, 0);
  // caso 5: 2 cliques, mas um já virou conversa (pela frase, no mesmo lote) → o outro liga pelo horário
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.bio, S - 400), click(L.stories, S - 300)] });
  await x.api.saveLeads({ items: [{ chatId: chat(14), phone: null, t: S - 350, ad: null, igh: await ighOf(BIO) }, { chatId: chat(15), phone: null, t: S, ad: null }] });
  assert.deepStrictEqual(x.T.ig_link_leads.map((l) => [l.chat_id, l.code, l.match]).sort(), [[chat(14), 'IG-BIO', 'frase'], [chat(15), 'IG-STORIES', 'horario']]);
  // caso 6: o clique já tem conversa gravada antes (ig_link_leads) → nada sobra
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.bio, S - 300)], ig_link_leads: [{ chat_id: chat(16), code: 'IG-BIO', link_id: L.bio, first_message_at: iso(S - 250), match: 'frase' }] });
  await x.api.saveLeads({ items: [{ chatId: chat(17), phone: null, t: S, ad: null }] });
  assert.deepStrictEqual(x.T.ig_link_leads.map((l) => l.chat_id), [chat(16)]);
  // caso 7: dois leads sem frase para 1 clique → só o 1º liga
  x = db({ ig_links: LINKS, ig_link_clicks: [click(L.coment, S - 300)] });
  await x.api.saveLeads({ items: [{ chatId: chat(19), phone: null, t: S - 100, ad: null }, { chatId: chat(18), phone: null, t: S - 200, ad: null }] });
  assert.deepStrictEqual(x.T.ig_link_leads.map((l) => [l.chat_id, l.match]), [[chat(18), 'horario']]);
});
test('sem a coluna match (migration 20261117120000 não aplicada): frase/código gravam como antes; horário não', async () => {
  const { api, T } = db({ ig_links: LINKS, ig_link_clicks: [click(L.bio, S - 100)] }, { noMatch: true });
  const r = await api.saveLeads({ items: [{ chatId: chat(20), phone: null, t: S - 200, ad: null, igh: await ighOf(STORIES) }, { chatId: chat(21), phone: null, t: S, ad: null }] });
  assert.strictEqual(r.ig, 1);
  assert.deepStrictEqual(T.ig_link_leads.map((l) => [l.chat_id, l.code, 'match' in l]), [[chat(20), 'IG-STORIES', false]]);
});
test('a regra de comparação da ponte é a mesma do ERP (src/lib/igLinks.ts); painel manda as frases; manifesto 2.18.3', () => {
  const bridgeSrc = src('wa-bridge.js');
  assert.ok(/igPhrases: \(payload\) => igPhrases\(payload\)/.test(bridgeSrc));
  assert.ok(/call\('igPhraseList'\)/.test(src('content.js')) && /waRequest\('igPhrases'/.test(src('content.js')));
  assert.ok(/igPhraseList: +\(\) +=> WaApi\.igPhraseList\(\)/.test(src('background.js')));
  const v = JSON.parse(src('manifest.json')).version.split('.').map(Number);
  assert.ok(v[0] > 2 || (v[0] === 2 && (v[1] > 18 || (v[1] === 18 && v[2] >= 3))));
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.message}`); }
  }
  console.log(`\n${tests.length - fail}/${tests.length} testes passaram`);
  if (fail) process.exitCode = 1;
})();
