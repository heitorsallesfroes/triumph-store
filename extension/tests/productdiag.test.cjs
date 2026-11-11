// Testes da 2.16.14 (Diagnóstico do Produto e prévia da reserva). node extension/tests/productdiag.test.cjs
// rich-parts.js com uma WA-JS falsa (nada vai para o WhatsApp):
// - cada envio de Produto devolve o registro (trace): leitura (preço, oferta, datas, fotos), nativo (existe, aridade,
//   assinatura, cada ordem: erro exato ou "nenhuma mensagem nova"), reserva (upload thumbnailHQ, o que foi enviado e o
//   que a mensagem final ficou tendo; prévia aceita ou trocada). Sem dados de cliente (nem conversa nem número dele).
// - a reserva manda SEMPRE a prévia montada aqui (linkPreview: false, doNotPlayInline, título, descrição, miniatura)
// - oferta: das leituras ao vivo (getProductById e catálogo carregado) e, se elas não trazem oferta nenhuma, a salva
//   na parte quando o cheio bate; oferta vencida ao vivo não volta pela salva
// - productDiag: leitura sem enviar nada
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

let IMG_W = 1080;
class FakeImage { constructor() { this.naturalWidth = IMG_W; this.naturalHeight = IMG_W; } set src(v) { this._src = v; setTimeout(() => (this.onload || (() => {}))(), 0); } get src() { return this._src; } }
const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,SlBFRw==' }) };
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, Uint8Array, AbortController, Image: FakeImage, document, crypto: { getRandomValues: (a) => a }, Function });
vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
const R = ctx.TspRich;

const ME = '5521987654321';
const CLIENT = '5521911112222';
const PID = '7012345678901234';
const CHAT = `${CLIENT}@c.us`;
const IMG = 'https://media.fsdn1-1.fna.fbcdn.net/v/t45/raptor.jpg';
const URL_ = `https://wa.me/p/${PID}/${ME}`;
const MODEL = { id: PID, name: 'Raptor GPS', priceAmount1000: 709000, salePriceAmount1000: 629000, currency: 'BRL', imageCdnUrl: IMG };

function wa({ native = 'throws', hq = true, upload = 'ok', cat = MODEL, fresh = { id: PID, name: 'Raptor GPS', price: '709000', currency: 'BRL', image_cdn_urls: [{ key: 'requested', value: IMG }] }, replace = null } = {}) {
  const sent = { raw: [], rawOpts: [], native: 0 };
  const msgs = [];
  const chat = { id: { _serialized: CHAT }, msgs: { getModelsArray: () => msgs } };
  const add = (m) => msgs.push({ id: { fromMe: true, _serialized: `true_${CHAT}_${msgs.length + 1}` }, ...m });
  const W = {
    CatalogStore: { get: () => ({ productCollection: { get: (id) => (id === PID ? cat : null) } }) },
    OpaqueData: { createFromBase64Jpeg: async (b64) => ({ b64 }) },
    Base64: { encodeB64: () => 'a2V5' },
    functions: {},
  };
  if (hq) W.functions.uploadThumbnail = async () => { if (upload === 'throws') throw new Error('upload 403'); return { filehash: 'sha', mediaEntry: { mediaKey: 'mk', mediaKeyTimestamp: 1, directPath: '/v/t62/thumb', encFilehash: 'enc' } }; };
  if (native) W.functions.sendProductToChat = async function sendProductToChat(product, chatArg) { sent.native++; if (native === 'throws') throw new TypeError(`Cannot read properties of undefined (reading 'catalogWid') #${sent.native}`); };
  const wpp = {
    conn: { getMyUserId: () => ({ user: ME, _serialized: `${ME}@c.us` }) },
    profile: { isBusiness: () => true },
    catalog: { getProducts: async () => [], getProductById: async () => fresh, getMyCatalog: async () => ({}) },
    chat: {
      get: (id) => (id === CHAT ? chat : null),
      sendRawMessage: async (id, raw, opts) => { sent.raw.push(raw); sent.rawOpts.push(opts); add(replace ? { ...raw, ...replace } : raw); },
      sendTextMessage: async () => {},
    },
    whatsapp: W,
  };
  return { wpp, sent };
}
const DATA = { product_id: PID, name: 'Raptor GPS', price: 'R$ 709,00', image_url: IMG };
const send = async (w, data = DATA) => plain(await (await R.prepareSend(w.wpp, CHAT, { kind: 'produto', data, text: '' }, {}))());

test('registro do envio: nativo nas 2 ordens com o erro exato, reserva com upload ok e prévia aceita', async () => {
  const w = wa();
  const r = await send(w);
  assert.strictEqual(r.tspVia, 'link-grande');
  const t = r.tspTrace;
  assert.strictEqual(t.via, 'link-grande');
  assert.strictEqual(t.product_id, PID);
  assert.deepStrictEqual([t.native.exists, t.native.arity], [true, 2]);
  assert.match(t.native.signature, /sendProductToChat\(product, chatArg\)/);
  assert.deepStrictEqual(t.native.attempts.map((a) => [a.order, a.params]), [[1, '(produto, conversa)'], [2, '(conversa, produto)']]);
  assert.match(t.native.attempts[0].result, /^erro: Cannot read properties of undefined \(reading 'catalogWid'\) #1$/);
  assert.match(t.native.attempts[1].result, /#2$/);
  assert.match(t.reserve.hq, /^ok \(800x800\)$/);
  assert.strictEqual(t.reserve.thumbnail, 'grande (thumbnailHQ)');
  assert.strictEqual(nb(t.reserve.sent.description), 'R$ 629,00 · de R$ 709,00');
  assert.strictEqual(t.reserve.final.title, 'Raptor GPS');
  assert.deepStrictEqual([t.reserve.final.thumbnail, t.reserve.final.thumbnailHQ, t.reserve.final.thumbnailDirectPath], [true, true, true]);
  assert.strictEqual(t.reserve.previewAccepted, true);
  // leitura: preço, oferta e fotos de cada fonte
  assert.strictEqual(t.read.catalogModel.salePriceAmount1000, 629000);
  assert.strictEqual(t.read.getProductById.price, '709000');
  assert.ok(t.read.getProductById.images[0].includes(IMG));
  assert.strictEqual(t.chosen.from, 'catalogo');
  // sem dados de cliente
  assert.ok(!JSON.stringify(t).includes(CLIENT), 'o número do cliente não vai para o registro');
});

test('reserva: a prévia é sempre a nossa (linkPreview: false, doNotPlayInline, título, descrição, canonicalUrl)', async () => {
  const w = wa({ native: null });
  await send(w);
  const raw = plain(w.sent.raw[0]);
  assert.strictEqual(w.sent.rawOpts[0].linkPreview, false);
  assert.deepStrictEqual([raw.type, raw.subtype, raw.richPreviewType, raw.doNotPlayInline, raw.matchedText, raw.canonicalUrl, raw.body], ['chat', 'url', 0, true, URL_, URL_, URL_]);
  assert.strictEqual(raw.title, 'Raptor GPS');
});

test('o WhatsApp trocou a prévia depois do envio: o registro mostra (previewAccepted: false e a mensagem final)', async () => {
  const w = wa({ native: null, replace: { description: 'R$ 709,00', thumbnailHQ: undefined } });
  const t = (await send(w)).tspTrace;
  assert.strictEqual(t.reserve.previewAccepted, false);
  assert.strictEqual(nb(t.reserve.final.description), 'R$ 709,00');
  assert.strictEqual(t.reserve.final.thumbnailHQ, false);
  assert.strictEqual(t.native.skipped, 'WPP.whatsapp.functions.sendProductToChat não existe');
});

test('nativo que não dá erro e não aparece: "nenhuma mensagem nova" e uma tentativa só', async () => {
  const w = wa({ native: 'silent' });
  const t = (await send(w)).tspTrace;
  assert.strictEqual(w.sent.native, 1);
  assert.match(t.native.attempts[0].result, /^nenhuma mensagem nova \(a função devolveu undefined\)$/);
});

test('upload da miniatura grande: o motivo da falha fica no registro e vai a pequena', async () => {
  let t = (await send(wa({ native: null, upload: 'throws' }))).tspTrace;
  assert.strictEqual(t.reserve.hq, 'upload falhou: upload 403');
  assert.strictEqual(t.reserve.thumbnail, 'pequena');
  assert.strictEqual(t.via, 'link');
  t = (await send(wa({ native: null, hq: false }))).tspTrace;
  assert.match(t.reserve.hq, /^indisponível \(uploadThumbnail: undefined/);
  IMG_W = 120;
  try { t = (await send(wa({ native: null }))).tspTrace; } finally { IMG_W = 1080; }
  assert.strictEqual(t.reserve.hq, 'foto pequena demais (120x120)');
  // 600 px (antes exigia 300+ de largura; agora o mínimo é o da WA-JS: 140 x 100)
  IMG_W = 200;
  try { t = (await send(wa({ native: null }))).tspTrace; } finally { IMG_W = 1080; }
  assert.match(t.reserve.hq, /^ok \(200x200\)$/);
});

test('oferta: ao vivo sem oferta nenhuma → usa a oferta salva na parte quando o cheio bate', async () => {
  const w = wa({ native: null, cat: { ...MODEL, salePriceAmount1000: undefined } });
  const r = await send(w, { ...DATA, price: 'R$ 629,00', full_price: 'R$ 709,00' });
  assert.strictEqual(nb(plain(w.sent.raw[0]).description), 'R$ 629,00 · de R$ 709,00');
  assert.strictEqual(r.tspTrace.chosen.from, 'getProductById+salvo');
  // o cheio mudou no catálogo: a oferta salva não vale
  const w2 = wa({ native: null, cat: null, fresh: { id: PID, name: 'Raptor GPS', price: '759000', currency: 'BRL' } });
  await send(w2, { ...DATA, price: 'R$ 629,00', full_price: 'R$ 709,00' });
  assert.strictEqual(nb(plain(w2.sent.raw[0]).description), 'R$ 759,00');
  // ao vivo traz a oferta, mas vencida: não volta pela salva
  const past = Math.floor(Date.now() / 1000) - 86400;
  const w3 = wa({ native: null, cat: null, fresh: { id: PID, name: 'Raptor GPS', price: '709000', currency: 'BRL', sale_price: { price: '629000', end_date: String(past) } } });
  await send(w3, { ...DATA, price: 'R$ 629,00', full_price: 'R$ 709,00' });
  assert.strictEqual(nb(plain(w3.sent.raw[0]).description), 'R$ 709,00');
  // só o catálogo carregado tem a oferta (getProductById sem os campos): usa a do catálogo
  const w4 = wa({ native: null });
  await send(w4);
  assert.strictEqual(nb(plain(w4.sent.raw[0]).description), 'R$ 629,00 · de R$ 709,00');
});

test('productDiag: lê sem enviar nada (preço, oferta, datas, fotos, função nativa e a descrição escolhida)', async () => {
  const w = wa({ native: 'throws', fresh: { id: PID, name: 'Raptor GPS', price: '709000', currency: 'BRL', sale_price: { price: '629000', start_date: '1762000000', end_date: '1893456000' } } });
  const d = plain(await R.productDiag(w.wpp, PID));
  assert.strictEqual(w.sent.raw.length + w.sent.native, 0, 'nada enviado');
  assert.deepStrictEqual([d.native.exists, d.native.arity, d.native.modelLoaded, d.hqAvailable], [true, 2, true, true]);
  assert.match(d.read.getProductById.sale_price, /"price":"629000"/);
  assert.match(d.read.getProductById.sale_price, /"end_date":"1893456000"/);
  assert.ok(d.read.getProductById.keys.includes('sale_price'));
  assert.strictEqual(nb(d.chosen.description), 'R$ 629,00 · de R$ 709,00');
  assert.strictEqual(d.chosen.image_url, IMG);
  await assert.rejects(() => R.productDiag(w.wpp, 'x'), /Produto inválido/);
});

test('ponte e painel: trace no resultado, log da extensão, botão em Manutenção, teste só em "Meu Numero Pessoal"', () => {
  const b = src('wa-bridge.js');
  assert.ok(b.includes('...(r.tspTrace ? { trace: r.tspTrace } : {})'));
  assert.ok(b.includes('productDiag: (payload) => productDiag(payload)'));
  const c = src('content.js');
  assert.ok(c.includes("const PRODUCT_LOG_KEY = 'productSendLog';"));
  assert.ok(c.includes("if (part.type === 'produto') logProductTrace(res);"));
  assert.ok(c.includes('class="ppdiag"') && c.includes('Diagnóstico do Produto'));
  assert.ok(c.includes("normTxt(name) === 'meu numero pessoal'"));
  assert.ok(c.includes("Confirmar: enviar"), 'confirmação antes do teste');
  assert.strictEqual(src('rich-parts.js'), src('rich-parts-iso.js').split('\n').slice(1).join('\n'), 'rich-parts-iso.js idêntico');
  let dirty = '';
  try { dirty = require('child_process').execSync('git status --porcelain -- vendor', { cwd: EXT, encoding: 'utf8' }).trim(); } catch { dirty = ''; }
  assert.strictEqual(dirty, '', 'vendor/ modificado');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.message ? e.message : e}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
