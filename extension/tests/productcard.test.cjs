// Testes da 2.16.13 (parte "Produto" com o cartão do catálogo). node extension/tests/productcard.test.cjs
// rich-parts.js com uma WA-JS falsa (nada vai para o WhatsApp):
// - preço de OFERTA: salePriceAmount1000 (modelo do catálogo) e sale_price { price } (getProductById), só dentro das
//   datas e menor que o cheio; o cheio vai junto ("R$ 629,00 · de R$ 709,00")
// - 1) envio NATIVO (WPP.whatsapp.functions.sendProductToChat), nas duas ordens de parâmetros; só vale se aparecer
//   uma mensagem nova nossa; o texto da parte vai logo depois
// - 2) reserva automática: link com prévia (título = nome, descrição com a oferta) e a foto GRANDE pelo upload de
//   miniatura do próprio WhatsApp (thumbnailHQ); sem o upload, a miniatura pequena
// - o nativo que não dá erro e não aparece não é repetido (nada de produto duplicado)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const nb = (s) => String(s).replace(/\s/g, ' ');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// Image/canvas falsos: a foto do catálogo "carrega" com 1080 px
class FakeImage { constructor() { this.naturalWidth = 1080; this.naturalHeight = 1080; } set src(v) { this._src = v; setTimeout(() => (this.onload || (() => {}))(), 0); } get src() { return this._src; } }
const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,SlBFRw==' }) };
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, Uint8Array, AbortController, Image: FakeImage, document, crypto: { getRandomValues: (a) => a } });
vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
const R = ctx.TspRich;

const ME = '5521987654321';
const PID = '7012345678901234';
const CHAT = '5521911112222@c.us';
const IMG = 'https://media.fsdn1-1.fna.fbcdn.net/v/t45/produto.jpg';
const model = { id: PID, name: 'Relógio S11 Mini Rose Gold', priceAmount1000: 709000, salePriceAmount1000: 629000, currency: 'BRL', imageCdnUrl: IMG };

// WA-JS falsa. native: 'model-chat' | 'chat-model' | 'throws' | 'silent' | null; hq: com o upload de miniatura
function wa({ native = 'model-chat', hq = true, fresh = { id: PID, name: 'Relógio S11 Mini Rose Gold', price: '709000', currency: 'BRL', sale_price: { price: '629000' }, image_cdn_urls: [{ key: 'requested', value: IMG }] } } = {}) {
  const sent = { raw: [], text: [], native: [], uploads: 0 };
  const msgs = [];
  const chat = { id: { _serialized: CHAT }, msgs: { getModelsArray: () => msgs } };
  const addMine = (type) => msgs.push({ id: { fromMe: true, _serialized: `true_${CHAT}_${msgs.length + 1}` }, type });
  const W = {
    CatalogStore: { get: () => ({ productCollection: { get: (id) => (id === PID ? model : null) } }) },
    OpaqueData: { createFromBase64Jpeg: async (b64) => ({ b64 }) },
    Base64: { encodeB64: () => 'a2V5' },
    functions: {},
  };
  if (hq) W.functions.uploadThumbnail = async (o) => { sent.uploads++; assert.strictEqual(o.mediaType, 'thumbnail-link'); return { filehash: 'sha', mediaEntry: { mediaKey: 'mk', mediaKeyTimestamp: 1762800000, directPath: '/v/t62/thumb', encFilehash: 'enc' } }; };
  if (native) {
    W.functions.sendProductToChat = async (a, b) => {
      sent.native.push([a === model ? 'model' : a === chat ? 'chat' : '?', b === model ? 'model' : b === chat ? 'chat' : '?']);
      if (native === 'throws') throw new Error('falhou');
      if (native === 'silent') return undefined;
      const want = native === 'model-chat' ? [model, chat] : [chat, model];
      if (a !== want[0] || b !== want[1]) throw new TypeError('ordem errada');
      addMine('product');
    };
  }
  const wpp = {
    conn: { getMyUserId: () => ({ user: ME, _serialized: `${ME}@c.us` }) },
    profile: { isBusiness: () => true },
    catalog: { getProducts: async () => [], getProductById: async () => fresh, getMyCatalog: async () => ({}) },
    chat: {
      get: (id) => (id === CHAT ? chat : null),
      sendRawMessage: async (id, raw) => { sent.raw.push(raw); addMine('chat'); },
      sendTextMessage: async (id, text) => { sent.text.push(text); addMine('chat'); },
    },
    whatsapp: W,
  };
  return { wpp, sent };
}
const send = async (w, text = '') => { const fn = await R.prepareSend(w.wpp, CHAT, { kind: 'produto', data: { product_id: PID, name: 'Relógio', price: 'R$ 709,00', image_url: IMG }, text }, {}); return plain(await fn()); };

test('preço de oferta: modelo do catálogo (salePriceAmount1000) e getProductById (sale_price { price })', () => {
  const a = plain(R.normalizeProduct(model));
  assert.deepStrictEqual([nb(a.price), nb(a.full_price)], ['R$ 629,00', 'R$ 709,00']);
  const b = plain(R.normalizeProduct({ id: PID, name: 'X', price: '709000', currency: 'BRL', sale_price: { price: '629000' } }));
  assert.deepStrictEqual([nb(b.price), nb(b.full_price)], ['R$ 629,00', 'R$ 709,00']);
  assert.strictEqual(nb(R.productDescription(b)), 'R$ 629,00 · de R$ 709,00');
  // sem oferta / oferta igual ou maior / fora das datas: preço cheio, sem riscado
  const c = plain(R.normalizeProduct({ ...model, salePriceAmount1000: undefined }));
  assert.deepStrictEqual([nb(c.price), c.full_price], ['R$ 709,00', '']);
  assert.strictEqual(plain(R.normalizeProduct({ ...model, salePriceAmount1000: 709000 })).full_price, '');
  const past = Math.floor(Date.now() / 1000) - 86400;
  assert.strictEqual(plain(R.normalizeProduct({ id: PID, name: 'X', price: '709000', sale_price: { price: '629000', end_date: String(past) } })).full_price, '', 'oferta vencida');
  const future = Math.floor(Date.now() / 1000) + 86400;
  assert.strictEqual(plain(R.normalizeProduct({ id: PID, name: 'X', price: '709000', sale_price: { price: '629000', start_date: String(future) } })).full_price, '', 'oferta ainda não começou');
  assert.strictEqual(nb(plain(R.normalizeProduct({ id: PID, name: 'X', price: '709000', sale_price: { price: '629000', end_date: String(future) } })).price), 'R$ 629,00');
  assert.strictEqual(R.productDescription({ price: '' }), 'Ver produto no WhatsApp');
  // a parte salva guarda o cheio
  assert.strictEqual(plain(R.normalize('produto', { product_id: PID, name: 'X', price: 'R$ 629,00', full_price: 'R$ 709,00' })).full_price, 'R$ 709,00');
  assert.ok(!('full_price' in plain(R.normalize('produto', { product_id: PID, name: 'X', price: 'R$ 709,00' }))));
});

test('1) nativo: sendProductToChat(produto, conversa) → cartão do catálogo; o link não vai; o texto vai logo depois', async () => {
  const w = wa();
  const r = await send(w, 'Olha esse!');
  assert.deepStrictEqual(r, { tspVia: 'nativo' });
  assert.deepStrictEqual(w.sent.native, [['model', 'chat']]);
  assert.strictEqual(w.sent.raw.length, 0, 'sem link');
  assert.deepStrictEqual(w.sent.text, ['Olha esse!']);
});

test('1) nativo na outra ordem de parâmetros (conversa, produto): tenta a segunda ordem quando a primeira dá erro', async () => {
  const w = wa({ native: 'chat-model' });
  assert.deepStrictEqual(await send(w), { tspVia: 'nativo' });
  assert.deepStrictEqual(w.sent.native, [['model', 'chat'], ['chat', 'model']]);
  assert.strictEqual(w.sent.raw.length, 0);
});

test('2) reserva: nativo falha → link com prévia: nome, "R$ 629,00 · de R$ 709,00" e foto grande (thumbnailHQ pelo upload do WhatsApp)', async () => {
  const w = wa({ native: 'throws' });
  const r = await send(w, 'Olha esse!');
  assert.deepStrictEqual(r, { tspVia: 'link-grande' });
  assert.strictEqual(w.sent.raw.length, 1);
  const raw = plain(w.sent.raw[0]);
  assert.strictEqual(raw.title, 'Relógio S11 Mini Rose Gold');
  assert.strictEqual(nb(raw.description), 'R$ 629,00 · de R$ 709,00');
  assert.strictEqual(raw.body, `Olha esse!\nhttps://wa.me/p/${PID}/${ME}`);
  assert.deepStrictEqual([raw.thumbnailHQ, raw.mediaKey, raw.thumbnailDirectPath, raw.thumbnailSha256, raw.thumbnailEncSha256, raw.thumbnailWidth], ['SlBFRw==', 'mk', '/v/t62/thumb', 'sha', 'enc', 800]);
  assert.strictEqual(w.sent.uploads, 1);
  assert.strictEqual(w.sent.text.length, 0, 'o texto vai no próprio link');
});

test('2) reserva sem o upload de miniatura: link com a miniatura pequena e o preço de oferta', async () => {
  const w = wa({ native: null, hq: false });
  assert.deepStrictEqual(await send(w), { tspVia: 'link' });
  const raw = plain(w.sent.raw[0]);
  assert.strictEqual(nb(raw.description), 'R$ 629,00 · de R$ 709,00');
  assert.ok(raw.thumbnail && !raw.thumbnailHQ);
});

test('nativo que não dá erro e não aparece: não repete o nativo (sem produto duplicado) e vai a reserva', async () => {
  const w = wa({ native: 'silent' });
  const t0 = Date.now();
  assert.deepStrictEqual(await send(w), { tspVia: 'link-grande' });
  assert.strictEqual(w.sent.native.length, 1, 'uma tentativa só');
  assert.ok(Date.now() - t0 >= 5500, 'esperou a mensagem aparecer antes da reserva');
});

test('sem a oferta no catálogo: preço cheio, sem "de"', async () => {
  const w = wa({ native: null, fresh: { id: PID, name: 'Relógio', price: '709000', currency: 'BRL' } });
  await send(w);
  assert.strictEqual(nb(plain(w.sent.raw[0]).description), 'R$ 709,00');
});

test('ponte e painel: o caminho volta no resultado ("via") e o painel avisa; prévia com o cheio riscado', () => {
  const b = src('wa-bridge.js');
  assert.match(b, /return r && typeof r\.tspVia === 'string' \? \{ sent: true, via: r\.tspVia \} : \{ sent: true \};/);
  const c = src('content.js');
  assert.match(c, /if \(part\.type === 'produto' && res && res\.via && PRODUCT_VIA\[res\.via\]\) lastProductVia = res\.via;/);
  assert.ok(c.includes("toast(`${total > 1 ? `Enviado: ${total} partes.` : 'Enviado.'}${via}`"), 'o caminho vai junto no "Enviado"');
  assert.match(c, /el\('s', 'rp-full', d\.full_price\)/);
  assert.match(c, /full_price: x\.full_price/);
  // o vendor WA-JS não muda
  let dirty = '';
  try { dirty = require('child_process').execSync('git status --porcelain -- vendor', { cwd: EXT, encoding: 'utf8' }).trim(); } catch { dirty = ''; }
  assert.strictEqual(dirty, '', 'vendor/ modificado');
  assert.strictEqual(JSON.parse(src('manifest.json')).version, '2.16.13');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
