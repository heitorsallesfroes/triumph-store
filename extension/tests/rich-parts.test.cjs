// Testes da 2.9.2 (localização, produto, catálogo, contato, Pix). Sem dependências: node extension/tests/rich-parts.test.cjs
// - salvar: saveItem/fetchLibrary de supabase-api.js com fetch falso (com e sem a migration)
// - prévia: richPreviewEl tirado de content.js, com um DOM mínimo
// - envio simulado: wa-bridge.js de verdade com uma WA-JS falsa (sendRich e campaignSend)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x)); // objetos de outro contexto (vm)
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function richCtx(extra = {}) {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, ...extra });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  return ctx;
}
const R = richCtx().TspRich;

const SAMPLES = {
  localizacao: { data: { name: 'Triumph Store', address: 'Rua A, 10 - Centro', lat: '-23.5505', lng: '-46.6333' } },
  produto: { data: { product_id: '7012345678901234', name: 'Camiseta', price: 'R$ 59,90', image_url: null }, body: 'Olá{, nome}! Olha esse:' },
  catalogo: { data: {}, body: 'Nosso catálogo' },
  contato: { data: { name: 'Fernanda', phone: '(11) 98888-7777' } },
  pix: { data: { key_type: 'CPF', key: '123.456.789-09', name: 'Triumph Store' } },
};

// ── Google Maps ──
const coords = (link) => plain(R.parseMapsLink(link));
test('Maps: @lat,lng', () => {
  assert.deepStrictEqual(coords('https://www.google.com/maps/@-23.5505199,-46.6333094,15z'), { lat: -23.5505199, lng: -46.6333094 });
});
test('Maps: ?q=lat,lng', () => {
  assert.deepStrictEqual(coords('https://maps.google.com/?q=-22.9068,-43.1729'), { lat: -22.9068, lng: -43.1729 });
  assert.deepStrictEqual(coords('https://www.google.com/maps/search/?api=1&query=-22.9068%2C-43.1729'), { lat: -22.9068, lng: -43.1729 });
});
test('Maps: /place/ com !3d!4d pega o ponto do local (não a câmera) e o nome', () => {
  const link = 'https://www.google.com/maps/place/Triumph+Store/@-23.5600000,-46.6400000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-23.5612345!4d-46.6456789';
  assert.deepStrictEqual(coords(link), { lat: -23.5612345, lng: -46.6456789 });
  assert.strictEqual(R.placeNameFromLink(link), 'Triumph Store');
});
test('Maps: link sem coordenadas → null (e link curto reconhecido)', () => {
  assert.strictEqual(R.parseMapsLink('https://maps.app.goo.gl/AbCdEf123'), null);
  assert.strictEqual(R.isShortMapsLink('https://maps.app.goo.gl/AbCdEf123'), true);
  assert.strictEqual(R.parseMapsLink('https://www.google.com/maps/place/Rua+Augusta'), null);
  assert.strictEqual(R.parseMapsLink('https://www.google.com/maps/@999,999,15z'), null); // fora do mapa
});
test('Maps: coordenadas coladas direto', () => {
  assert.deepStrictEqual(coords('-23.55, -46.63'), { lat: -23.55, lng: -46.63 });
});

// ── validação ──
test('validação: cada tipo normaliza', () => {
  assert.deepStrictEqual({ ...R.normalize('localizacao', SAMPLES.localizacao.data) }, { name: 'Triumph Store', address: 'Rua A, 10 - Centro', lat: -23.5505, lng: -46.6333 });
  assert.deepStrictEqual({ ...R.normalize('contato', SAMPLES.contato.data) }, { name: 'Fernanda', phone: '5511988887777' });
  assert.deepStrictEqual({ ...R.normalize('pix', SAMPLES.pix.data) }, { key_type: 'CPF', key: '12345678909', name: 'Triumph Store' });
  assert.strictEqual(R.normalize('pix', { key_type: 'PHONE', key: '11 98888-7777', name: 'X' }).key, '+5511988887777');
  assert.strictEqual(R.normalize('pix', { key_type: 'EVP', key: '123E4567-E89B-12D3-A456-426614174000', name: 'X' }).key, '123e4567-e89b-12d3-a456-426614174000');
  assert.strictEqual(R.normalize('produto', SAMPLES.produto.data).image_url, null);
});
test('validação: erros claros', () => {
  assert.throws(() => R.normalize('localizacao', { lat: '', lng: '' }), /latitude/);
  assert.throws(() => R.normalize('produto', { product_id: '' }), /escolha o produto/);
  assert.throws(() => R.normalize('contato', { name: 'A', phone: '123' }), /telefone/);
  assert.throws(() => R.normalize('pix', { key_type: 'CPF', key: '123', name: 'A' }), /CPF/);
  assert.throws(() => R.normalize('pix', { key_type: 'XX', key: '1', name: 'A' }), /tipo da chave/);
  assert.throws(() => R.normalize('pix', { key_type: 'EMAIL', key: 'a@b.com', name: '' }), /recebedor/);
});
test('produto da WA-JS sem foto e com preço em milésimos', () => {
  const a = R.normalizeProduct({ id: '7012345678901234', name: 'Camiseta', priceAmount1000: 59900, currency: 'BRL' });
  assert.strictEqual(a.image_url, null);
  assert.match(a.price, /59,90/);
  const b = R.normalizeProduct({ id: '99', name: 'Boné', price: '25000', currency: 'BRL', image_cdn_urls: [{ key: 'requested', value: 'https://mmg.whatsapp.net/x.jpg' }] });
  assert.match(b.price, /25,00/);
  assert.strictEqual(b.image_url, 'https://mmg.whatsapp.net/x.jpg');
  assert.strictEqual(R.normalizeProduct({ id: '1', name: 'Oculto', isHidden: true }), null);
});

// ── salvar (supabase-api.js com fetch falso) ──
function apiCtx({ migration }) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const p = url.replace('https://x.supabase.co/rest/v1/', '');
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (!migration && /\bdata\b/.test(p.split('&')[0]) && p.startsWith('wa_item_parts?select=')) return res(400, { code: '42703', message: 'column wa_item_parts.data does not exist' });
    if (p.startsWith('wa_items?select=position')) return res(200, []);
    if (method === 'POST' && p === 'wa_items') return res(201, [{ id: '11111111-1111-1111-1111-111111111111' }]);
    if (method === 'POST' && p === 'wa_item_parts') return res(201, null);
    if (method === 'DELETE') return res(204, null);
    if (p.startsWith('wa_categories')) return res(200, [{ id: 'c1', name: 'Geral' }]);
    if (p.startsWith('wa_items?select=')) return res(200, [{ id: '11111111-1111-1111-1111-111111111111', title: 'T', type: 'texto', body: '📍 Localização: x', category_id: 'c1' }]);
    if (p.startsWith('wa_item_parts?select=') && p.includes('order=')) {
      return res(200, [{ id: 'p1', item_id: '11111111-1111-1111-1111-111111111111', position: 0, type: 'localizacao', body: null, data: { lat: -23.5, lng: -46.6, name: 'Loja', address: '' }, wait_seconds: 0, typing_seconds: 2 }]);
    }
    return res(200, []);
  };
  const ctx = richCtx({ fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, calls };
}
const CAT = '22222222-2222-2222-2222-222222222222';
for (const type of Object.keys(SAMPLES)) {
  test(`salvar: ${type} (com a migration)`, async () => {
    const { api, calls } = apiCtx({ migration: true });
    const part = { type, body: SAMPLES[type].body || null, data: SAMPLES[type].data, wait_seconds: 1, typing_seconds: 2 };
    await api.saveItem({ category_id: CAT, title: `Teste ${type}`, parts: [part, { type: 'texto', body: 'depois', wait_seconds: 0, typing_seconds: 0 }] });
    const item = calls.find((c) => c.method === 'POST' && c.path === 'wa_items').body;
    assert.strictEqual(item.type, 'texto'); // wa_items não muda de regra: o ERP vê um texto
    assert.ok(item.body.startsWith(R.EMOJI[type]), item.body);
    const rows = calls.find((c) => c.method === 'POST' && c.path === 'wa_item_parts').body;
    assert.strictEqual(rows[0].type, type);
    assert.deepStrictEqual(rows[0].data, JSON.parse(JSON.stringify(R.normalize(type, SAMPLES[type].data))));
    assert.strictEqual(rows[0].body, R.allowsText(type) ? SAMPLES[type].body : null);
    assert.strictEqual(rows[1].data, null); // todas as linhas com as mesmas chaves
  });
}
test('salvar: sem a migration → "Atualize o banco" e nada é gravado', async () => {
  const { api, calls } = apiCtx({ migration: false });
  await assert.rejects(api.saveItem({ category_id: CAT, title: 'X', parts: [{ type: 'pix', data: SAMPLES.pix.data }] }), /Atualize o banco/);
  assert.ok(!calls.some((c) => c.method !== 'GET'));
});
test('salvar: dados inválidos → erro com o número da parte', async () => {
  const { api } = apiCtx({ migration: true });
  await assert.rejects(api.saveItem({ category_id: CAT, title: 'X', parts: [{ type: 'texto', body: 'oi' }, { type: 'contato', data: { name: '', phone: '' } }] }), /Parte 2: nome do contato/);
});
test('biblioteca: com a migration, tipo de verdade + richAvailable', async () => {
  const { api } = apiCtx({ migration: true });
  const lib = await api.fetchLibrary();
  assert.strictEqual(lib.richAvailable, true);
  assert.strictEqual(lib.items[0].type, 'localizacao');
});
test('biblioteca: sem a migration, tudo como antes (richAvailable false)', async () => {
  const { api } = apiCtx({ migration: false });
  const lib = await api.fetchLibrary();
  assert.strictEqual(lib.richAvailable, false);
  assert.strictEqual(lib.partsAvailable, true);
});

// ── prévia (richPreviewEl de content.js num DOM mínimo) ──
class FakeEl {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this._text = ''; this.attrs = {}; }
  append(...xs) { xs.forEach((x) => this.children.push(typeof x === 'string' ? Object.assign(new FakeEl('#text'), { _text: x }) : x)); }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  find(cls) { if (this.className.split(' ').includes(cls)) return this; for (const c of this.children) { const f = c.find && c.find(cls); if (f) return f; } return null; }
  findTag(tag) { if (this.tag === tag) return this; for (const c of this.children) { const f = c.findTag && c.findTag(tag); if (f) return f; } return null; }
}
function previewFn() {
  const code = src('content.js');
  const start = code.indexOf('  function richPreviewEl(');
  const end = code.indexOf('\n  const SEQ_TEXT_MAX', start);
  assert.ok(start > 0 && end > start, 'richPreviewEl não encontrado');
  const document = { createElement: (t) => new FakeEl(t) };
  const el = (tag, cls, text) => { const e = new FakeEl(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const state = previewState;
  return new Function('Rich', 'el', 'document', 'state', `${code.slice(start, end)}\nreturn richPreviewEl;`)(R, el, document, state);
}
const previewState = {};
const preview = previewFn();
test('prévia: localização (nome, endereço, link do mapa)', () => {
  const c = preview({ type: 'localizacao', data: R.normalize('localizacao', SAMPLES.localizacao.data) });
  assert.match(c.textContent, /Triumph Store/);
  assert.match(c.textContent, /Rua A, 10/);
  assert.strictEqual(c.findTag('a').href, 'https://maps.google.com/?q=-23.5505,-46.6333');
});
test('prévia: produto sem foto mostra o ícone, nome e preço', () => {
  const c = preview({ type: 'produto', data: SAMPLES.produto.data });
  assert.strictEqual(c.find('rp-thumb').findTag('img'), null);
  assert.match(c.find('rp-thumb').textContent, /🛍️/);
  assert.match(c.textContent, /Camiseta/);
  assert.match(c.textContent, /59,90/);
});
test('prévia: produto com foto usa a imagem', () => {
  const c = preview({ type: 'produto', data: { ...SAMPLES.produto.data, image_url: 'https://mmg.whatsapp.net/a.jpg' } });
  assert.strictEqual(c.find('rp-thumb').findTag('img').src, 'https://mmg.whatsapp.net/a.jpg');
});
test('prévia: catálogo, contato e Pix', () => {
  // 2.18.9: catálogo = texto + link wa.me/c/<meu número> com a prévia do link
  previewState.waMe = undefined;
  const c0 = preview({ type: 'catalogo', data: {} }).textContent;
  assert.match(c0, /Acesse este link para ver nosso catálogo no WhatsApp:/);
  assert.match(c0, /https:\/\/wa\.me\/c\/<seu número>/);
  assert.match(c0, /Catálogo no WhatsApp/);
  assert.ok(!/Veja os nossos produtos|cartão do seu catálogo/.test(c0));
  previewState.waMe = '5511912345678';
  const c1 = preview({ type: 'catalogo', data: {}, body: 'Nosso catálogo' }).textContent;
  assert.match(c1, /https:\/\/wa\.me\/c\/5511912345678/);
  assert.ok(!/Acesse este link/.test(c1), 'com legenda, a frase padrão não aparece');
  const ct = preview({ type: 'contato', data: R.normalize('contato', SAMPLES.contato.data) });
  assert.match(ct.textContent, /Fernanda/);
  assert.match(ct.textContent, /\(11\) 98888-7777/);
  const px = preview({ type: 'pix', data: R.normalize('pix', SAMPLES.pix.data) });
  assert.match(px.textContent, /CPF: 12345678909/);
  assert.match(px.textContent, /Recebedor: Triumph Store/);
});

// ── envio simulado (wa-bridge.js de verdade, WA-JS falsa) ──
const CHAT = '5511999990000@c.us';
function bridge({ business = true, pixThrows = false } = {}) {
  const sent = [];
  const replies = [];
  let listener = null;
  const product = { id: '7012345678901234', name: 'Camiseta (atual)', priceAmount1000: 64900, currency: 'BRL' }; // sem foto
  // 2.18.9: as mensagens da conversa (para o id da parte enviada e os tracinhos); a WA-JS devolve { id } nos envios
  const msgs = [];
  const chatModel = { msgs: { getModelsArray: () => msgs } };
  let nid = 0;
  const ret = () => ({ id: `msg-${++nid}`, ack: 0 });
  const wpp = {
    isReady: true,
    on: () => {},
    conn: { getMyUserId: () => ({ user: '5511912345678', _serialized: '5511912345678@c.us' }) },
    profile: { isBusiness: () => business },
    contact: {
      queryExists: async () => ({ wid: CHAT }),
      list: async () => [{ id: { _serialized: '5511977776666@c.us' }, name: 'Fernanda Souza' }, { id: { _serialized: '123@lid' }, name: 'Sem número' }],
    },
    catalog: { getProducts: async () => [product, { id: '55', name: 'Oculto', isHidden: true }], getProductById: async () => product },
    chat: {
      list: async () => [{ id: { _serialized: CHAT } }],
      markIsComposing: async () => sent.push(['digitando']),
      markIsPaused: async () => {},
      get: (id) => (id === CHAT ? chatModel : null),
      sendLocationMessage: async (...a) => { sent.push(['sendLocationMessage', ...a]); return ret(); },
      sendVCardContactMessage: async (...a) => { sent.push(['sendVCardContactMessage', ...a]); return ret(); },
      sendPixKeyMessage: async (...a) => { if (pixThrows) throw new Error('falhou'); sent.push(['sendPixKeyMessage', ...a]); return ret(); },
      sendCatalogMessage: async (...a) => sent.push(['sendCatalogMessage', ...a]),
      // o link do Produto não devolve id: a mensagem aparece na conversa
      sendRawMessage: async (...a) => { sent.push(['sendRawMessage', ...a]); msgs.push({ id: { fromMe: true, _serialized: `raw-${msgs.length + 1}` }, body: a[1].body, t: 1, ack: 1 }); },
      sendTextMessage: async (...a) => { sent.push(['sendTextMessage', ...a]); return ret(); },
    },
  };
  const win = {
    console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp,
    location: { origin: 'https://web.whatsapp.com' },
    addEventListener: (t, fn) => { if (t === 'message') listener = fn; },
    postMessage: (msg) => replies.push(msg),
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('wa-bridge.js'), ctx, { filename: 'wa-bridge.js' });
  const me = vm.runInContext('window', ctx); // o window de dentro do contexto (o event.source que a ponte confere)
  let n = 0;
  const request = (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false, error: { message: 'sem resposta da ponte' } }); else setTimeout(wait, 5); };
    wait();
  });
  return { request, sent, msgs };
}
test('envio: localização (nome e endereço no cartão) com "digitando"', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'localizacao', data: SAMPLES.localizacao.data, typingMs: 10 });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.deepStrictEqual(b.sent[0], ['digitando']);
  const [, chat, loc] = b.sent[1];
  assert.strictEqual(chat, CHAT);
  assert.deepStrictEqual(plain(loc), { createChat: false, markIsRead: false, lat: -23.5505, lng: -46.6333, name: 'Triumph Store', address: 'Rua A, 10 - Centro' });
});
test('envio: contato (vCard)', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'contato', data: SAMPLES.contato.data });
  assert.ok(r.ok);
  assert.deepStrictEqual(plain(b.sent[0][2]), { id: '5511988887777@c.us', name: 'Fernanda' });
});
test('envio: Pix', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'pix', data: SAMPLES.pix.data });
  assert.ok(r.ok);
  assert.deepStrictEqual(plain(b.sent[0][2]), { keyType: 'CPF', key: '12345678909', name: 'Triumph Store' });
});
test('envio: Pix em conta comum → erro claro e nada sai', async () => {
  const b = bridge({ business: false });
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'pix', data: SAMPLES.pix.data });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.stage, 'before-send');
  assert.match(r.error.message, /WhatsApp Business.*Nada foi enviado/);
  assert.strictEqual(b.sent.length, 0);
});
test('envio: Pix recusado pelo WhatsApp → erro claro (pix_failed)', async () => {
  const b = bridge({ pixThrows: true });
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'pix', data: SAMPLES.pix.data });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, 'pix_failed');
  assert.match(r.error.message, /Chave Pix/);
});
test('envio: catálogo com texto junto → TEXTO com o link wa.me/c/<meu número> e a prévia do link (sem sendCatalogMessage)', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'catalogo', data: {}, text: 'Nosso catálogo' });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.strictEqual(b.sent.length, 1);
  const [name, chat, body, opts] = b.sent[0];
  assert.strictEqual(name, 'sendTextMessage');
  assert.strictEqual(chat, CHAT);
  assert.strictEqual(body, 'Nosso catálogo\nhttps://wa.me/c/5511912345678');
  assert.strictEqual(opts.linkPreview, true);
  assert.strictEqual(opts.createChat, false);
  assert.ok(!b.sent.some((s) => s[0] === 'sendCatalogMessage'));
  assert.strictEqual(r.data.msgId, 'msg-1', 'devolve o id da mensagem para acompanhar os tracinhos');
});
test('envio: catálogo sem texto → a frase do WhatsApp antes do link, na mesma mensagem', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'catalogo', data: {} });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.strictEqual(b.sent[0][0], 'sendTextMessage');
  assert.strictEqual(b.sent[0][2], 'Acesse este link para ver nosso catálogo no WhatsApp: https://wa.me/c/5511912345678');
  const c = await b.request('campaignSend', { campaign: true, chatId: CHAT, kind: 'catalogo', data: {} });
  assert.ok(c.ok, JSON.stringify(c.error));
  assert.strictEqual(b.sent[1][0], 'sendTextMessage');
  assert.strictEqual(b.sent[1][3].createChat, true);
  assert.strictEqual(b.sent[1][3].linkPreview, true);
});
test('catálogo: disponível com sendTextMessage mesmo sem sendCatalogMessage; conta comum não', () => {
  const chat = { sendTextMessage() {}, sendLocationMessage() {} };
  assert.strictEqual(R.availability({ chat, profile: { isBusiness: () => true } }).catalogo, true);
  assert.strictEqual(R.availability({ chat, profile: { isBusiness: () => false } }).catalogo, false);
  assert.strictEqual(R.catalogBody('  ', '55 11 91234-5678'), 'Acesse este link para ver nosso catálogo no WhatsApp: https://wa.me/c/5511912345678');
});
test('tracinhos (2.18.9): richAck lê o ack da parte e das outras mensagens nossas; veredito só avisa com as outras entregues', async () => {
  const b = bridge();
  b.msgs.push(
    { id: { fromMe: true, _serialized: 'cat-1' }, t: 1000, ack: 1 },
    { id: { fromMe: true, _serialized: 'txt-1' }, t: 1010, ack: 2 },
    { id: { fromMe: false, _serialized: 'cli-1' }, t: 1020, ack: 0 },
  );
  const r = await b.request('richAck', { chatId: CHAT, msgId: 'cat-1' });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.deepStrictEqual(plain(r.data), { found: true, ack: 1, others: 1, othersDelivered: true });
  assert.strictEqual(R.ackVerdict(r.data), 'warn');
  assert.strictEqual(R.ackVerdict({ ...r.data, othersDelivered: false }), 'unknown', 'sem as outras chegando (cliente sem internet?) não avisa');
  assert.strictEqual(R.ackVerdict({ ...r.data, ack: 2 }), 'ok');
  assert.strictEqual(R.ackVerdict({ found: false }), 'unknown');
  assert.deepStrictEqual(plain((await b.request('richAck', { chatId: CHAT, msgId: 'nao-existe' })).data), { found: false });
  const bad = await b.request('richAck', { chatId: 'grupo@g.us', msgId: 'cat-1' });
  assert.strictEqual(bad.ok, false);
});
test('envio: produto e localização também devolvem o id (Produto: a 1ª mensagem nova nossa na conversa)', async () => {
  const b = bridge();
  const l = await b.request('sendRich', { chatId: CHAT, kind: 'localizacao', data: SAMPLES.localizacao.data });
  assert.strictEqual(l.data.msgId, 'msg-1');
  const p = await b.request('sendRich', { chatId: CHAT, kind: 'produto', data: SAMPLES.produto.data });
  assert.ok(p.ok, JSON.stringify(p.error));
  assert.strictEqual(typeof p.data.via, 'string');
  assert.strictEqual(p.data.msgId, 'raw-1');
});
test('envio: produto sem foto → link wa.me/p com prévia (nome e preço atuais), sem miniatura', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'produto', data: SAMPLES.produto.data, text: 'Olha esse:' });
  assert.ok(r.ok, JSON.stringify(r.error));
  const [name, chat, raw] = b.sent[0];
  assert.strictEqual(name, 'sendRawMessage');
  assert.strictEqual(chat, CHAT);
  assert.strictEqual(raw.matchedText, 'https://wa.me/p/7012345678901234/5511912345678');
  assert.strictEqual(raw.body, 'Olha esse:\nhttps://wa.me/p/7012345678901234/5511912345678');
  assert.strictEqual(raw.title, 'Camiseta (atual)');
  assert.match(raw.description, /64,90/);
  assert.strictEqual(raw.thumbnail, undefined);
});
test('envio: disparo para conversa nova (campaignSend) com localização', async () => {
  const b = bridge();
  const r = await b.request('campaignSend', { campaign: true, chatId: CHAT, kind: 'localizacao', data: SAMPLES.localizacao.data });
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.strictEqual(b.sent[0][0], 'sendLocationMessage');
  assert.strictEqual(b.sent[0][2].createChat, true);
});
test('envio: dados inválidos não saem', async () => {
  const b = bridge();
  const r = await b.request('sendRich', { chatId: CHAT, kind: 'contato', data: { name: 'X', phone: '1' } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.stage, 'before-send');
  assert.strictEqual(b.sent.length, 0);
});
test('catálogo: lista os produtos (oculto fica de fora) e contatos só com número', async () => {
  const b = bridge();
  const c = await b.request('catalogProducts', {});
  assert.ok(c.ok);
  assert.deepStrictEqual(plain(c.data.products.map((p) => p.id)), ['7012345678901234']);
  const k = await b.request('contactSearch', { q: 'fern' });
  assert.deepStrictEqual(plain(k.data), [{ name: 'Fernanda Souza', phone: '5511977776666' }]);
  const info = await b.request('richInfo', {});
  assert.deepStrictEqual(plain(info.data.types), { localizacao: true, contato: true, catalogo: true, produto: true, pix: true, business: true });
  assert.strictEqual(info.data.me, '5511912345678'); // 2.18.9: para a prévia do link wa.me/c/
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} testes passaram`);
})();
