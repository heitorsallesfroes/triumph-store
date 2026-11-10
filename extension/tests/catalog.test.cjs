// Testes da 2.15.3 + 2.16.1 (exportar o catálogo do WhatsApp Business; 2.16.1: fotos em tamanho cheio, ≥ 600 px): node extension/tests/catalog.test.cjs
// - ponte (WA-JS falsa): catalogExport lê TODOS os produtos visíveis (oculto fica fora) com descrição completa, preço,
//   promoção, moeda, link wa.me/p/<id>/<número>, coleções e todas as fotos; produto sem descrição pede getProductById;
//   catalogImage baixa a foto (só https). Nada é enviado e o catálogo não muda (nenhuma função de escrita é chamada).
// - supabase-api.js (fetch falso): foto em wa-media/catalog/<id>/<sha256>.<ext>; já existe (HEAD) ou 409 = reaproveita;
//   retrato limpo e gravado em system_config (wa_catalog_snapshot); endereço de fora do bucket é descartado.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const nodeCrypto = require('crypto');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x)); // objetos do vm são de outro realm
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ME = '5521999990000';
const IMG = (n) => `https://media.fsdu1-1.fna.whatsapp.net/v/t45/${n}.jpg?oh=1`;

// ── ponte ──
function bridge({ products, byId = {}, collections = null, business = true, fetchMap = {}, queryProduct = null }) {
  const queried = [];
  let listener = null;
  const replies = [];
  const writes = [];
  const wpp = {
    isReady: true, on: () => {},
    conn: { getMyUserId: () => ({ user: ME, _serialized: `${ME}@c.us` }) },
    profile: { isBusiness: () => business },
    chat: { get: () => null, list: async () => [], sendRawMessage: () => writes.push('sendRawMessage'), sendTextMessage: () => writes.push('sendTextMessage') },
    catalog: {
      getProducts: async (id, n) => { assert.strictEqual(id, `${ME}@c.us`); assert.ok(n >= 100); return products; },
      getProductById: async (id, pid) => { if (byId[pid] instanceof Error) throw byId[pid]; return byId[pid] || null; },
      ...(collections ? { getCollections: async () => collections } : {}),
      editProduct: () => writes.push('editProduct'), delProducts: () => writes.push('delProducts'), createProduct: () => writes.push('createProduct'),
    },
    contact: { getPnLidEntry: async () => null },
    ...(queryProduct ? { whatsapp: {
      WidFactory: { createWid: (s) => ({ _serialized: s }) },
      functions: { queryProduct: async (wid, pid, w, h) => { queried.push([wid._serialized, pid, w, h]); const d = queryProduct[pid]; if (d instanceof Error) throw d; return { data: d }; } },
    } } : {}),
  };
  let AB = ArrayBuffer;
  const fetch = async (url) => {
    const f = fetchMap[url];
    if (!f) throw new Error('sem rede');
    return { ok: true, status: 200, headers: { get: () => f.mime }, arrayBuffer: async () => { const ab = new AB(f.bytes.length); new Uint8Array(ab).set(f.bytes); return ab; } };
  };
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, fetch, WPP: wpp, location: { origin: 'x' },
    addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const ctx = vm.createContext(win);
  AB = vm.runInContext('ArrayBuffer', ctx); // a foto chega como ArrayBuffer da página
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
  return { request, writes, queried };
}

const CATALOG = [
  // resposta do catálogo (getProducts): preço em milésimos (texto), fotos em listas {key,value}
  { id: '111', name: 'Relógio Ouro', description: 'Pulseira de aço.\nResistente à água 5 ATM.', price: '459900', currency: 'BRL', sale_price: { price: '399900' },
    image_cdn_urls: [{ key: 'requested', value: IMG('a1') }, { key: 'full', value: IMG('a1-full') }],
    additional_image_cdn_urls: [[{ key: 'requested', value: IMG('a2') }], [{ key: 'requested', value: IMG('a3') }], [{ key: 'requested', value: IMG('a1') }, { key: 'full', value: IMG('a1-full') }]],
    retailer_id: 'SKU-1', url: 'https://loja.example/relogio' },
  // modelo do CatalogStore: priceAmount1000 / salePriceAmount1000 e imageCdnUrl
  { id: { _serialized: '222' }, name: 'Smartwatch', priceAmount1000: 199000, salePriceAmount1000: 249000, currency: 'BRL', imageCdnUrl: IMG('b1'), additionalImageCdnUrl: [IMG('b2')] },
  { id: '333', name: 'Oculto', is_hidden: true, price: '1000', image_cdn_urls: [{ key: 'requested', value: IMG('c1') }] },
  { id: '444', name: 'Sem descrição na lista', price: '50000', currency: 'USD' },
  { id: '111', name: 'Repetido' },
  { id: 'abc', name: 'Id inválido' },
];

test('ponte: catalogExport traz todos os visíveis com descrição completa, preços, link, coleções e todas as fotos', async () => {
  const b = bridge({
    products: CATALOG,
    byId: { 444: { id: '444', name: 'Sem descrição na lista', description: 'Descrição vinda do produto inteiro', price: '50000', currency: 'USD', imageCdnUrl: IMG('d1') } },
    collections: [{ id: 'c1', name: 'Relógios', products: [{ id: '111' }, { id: '222' }] }, { id: 'c2', name: 'Promoções', products: [{ id: '111' }] }],
  });
  const r = await b.request('catalogExport', {});
  assert.ok(r.ok, JSON.stringify(r));
  const d = plain(r.data);
  assert.strictEqual(d.me, ME);
  assert.deepStrictEqual(d.products.map((p) => p.id), ['111', '222', '444']);
  const [p1, p2, p4] = d.products;
  assert.strictEqual(p1.description, 'Pulseira de aço.\nResistente à água 5 ATM.');
  assert.deepStrictEqual([p1.price, p1.salePrice, p1.currency], [459.9, 399.9, 'BRL']);
  assert.strictEqual(p1.link, `https://wa.me/p/111/${ME}`);
  assert.deepStrictEqual(p1.images, [IMG('a1-full'), IMG('a2'), IMG('a3')]); // 2.16.1: a "full" (original), não a "requested"
  assert.deepStrictEqual(p1.collections, ['Relógios', 'Promoções']);
  assert.deepStrictEqual([p1.retailerId, p1.url], ['SKU-1', 'https://loja.example/relogio']);
  assert.deepStrictEqual([p2.price, p2.salePrice, p2.images, p2.collections], [199, null, [IMG('b1'), IMG('b2')], ['Relógios']]); // "promoção" maior que o preço não conta
  assert.deepStrictEqual([p4.description, p4.currency, p4.images, p4.link], ['Descrição vinda do produto inteiro', 'USD', [IMG('d1')], `https://wa.me/p/444/${ME}`]);
  assert.deepStrictEqual(b.writes, [], 'não muda o catálogo e não envia nada');
});

test('ponte: produto cujos detalhes falham continua na lista (com aviso); conta comum = sem catálogo', async () => {
  const b = bridge({ products: [{ id: '444', name: 'P', price: '1000' }, { id: '555', name: 'Q', description: 'ok', price: '2000', imageCdnUrl: IMG('q') }], byId: { 444: new Error('falhou') } });
  const r = await b.request('catalogExport', {});
  assert.deepStrictEqual(plain(r.data.products.map((p) => p.id)), ['444', '555']);
  assert.strictEqual(r.data.warnings.length, 1);
  assert.strictEqual(r.data.warnings[0].id, '444');
  const c = await bridge({ products: [], business: false }).request('catalogExport', {});
  assert.deepStrictEqual(plain([c.data.ok, c.data.reason]), [false, 'not_business']);
});

test('ponte: catalogImage baixa os bytes (só https); falha vira erro claro', async () => {
  const b = bridge({ products: [], fetchMap: { [IMG('a1')]: { mime: 'image/png', bytes: [137, 80, 78, 71] } } });
  const r = await b.request('catalogImage', { url: IMG('a1') });
  assert.ok(r.ok);
  assert.strictEqual(r.data.mime, 'image/png');
  assert.deepStrictEqual([...new Uint8Array(r.data.data)], [137, 80, 78, 71]);
  const bad = await b.request('catalogImage', { url: 'http://x/y.jpg' });
  assert.deepStrictEqual([bad.ok, bad.error.code], [false, 'invalid_url']);
  const off = await b.request('catalogImage', { url: IMG('nada') });
  assert.deepStrictEqual([off.ok, off.error.code], [false, 'image_failed']);
});

// ── 2.16.1: fotos em tamanho cheio ──
// cabeçalhos mínimos de JPEG / PNG / WebP com o tamanho dado (o resto do arquivo não importa para medir)
const jpeg = (w, h) => [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9];
const png = (w, h) => [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, w >> 8, w & 255, 0, 0, h >> 8, h & 255, 8, 2, 0, 0, 0];
const webpX = (w, h) => [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0,
  (w - 1) & 255, ((w - 1) >> 8) & 255, 0, (h - 1) & 255, ((h - 1) >> 8) & 255, 0, 0, 0];

test('ponte (catálogo simulado): o produto é pedido de novo em 1080 px e a foto "full" vence a miniatura da lista', async () => {
  const THUMB = (n) => `https://media.fcaw3-1.fna.whatsapp.net/v/t45/${n}.jpg?stp=dst-jpg_p100x100_tt6&oh=1`;
  const b = bridge({
    products: [
      { id: '901', name: 'Com foto grande', description: 'ok', price: '1000', image_cdn_urls: [{ key: 'requested', value: THUMB('g1') }], additional_image_cdn_urls: [[{ key: 'requested', value: THUMB('g2') }]] },
      { id: '902', name: 'Só miniatura', description: 'ok', price: '1000', imageCdnUrl: THUMB('m1') },
      { id: '903', name: 'Detalhe falhou', description: 'ok', price: '1000', imageCdnUrl: THUMB('f1') },
    ],
    queryProduct: {
      901: { id: '901', name: 'Com foto grande', description: 'ok', price: '1000',
        image_cdn_urls: [{ key: 'requested', value: IMG('g1-1080') }, { key: 'full', value: IMG('g1-full') }],
        additional_image_cdn_urls: [[{ key: 'requested', value: IMG('g2-1080') }, { key: 'full', value: IMG('g2-full') }]] },
      902: { id: '902', name: 'Só miniatura', price: '1000', image_cdn_urls: [{ key: 'requested', value: THUMB('m1') }] },
      903: new Error('timeout'),
    },
  });
  const r = await b.request('catalogExport', {});
  assert.ok(r.ok, JSON.stringify(r));
  const d = plain(r.data);
  assert.deepStrictEqual(d.products.map((p) => [p.id, p.images]), [
    ['901', [IMG('g1-full'), IMG('g2-full')]],
    ['902', [THUMB('m1')]], // só existe a miniatura: segue (o painel mede e avisa)
    ['903', [THUMB('f1')]], // queryProduct falhou e getProductById não tem: fica a da lista
  ]);
  assert.deepStrictEqual(plain(b.queried), [[`${ME}@c.us`, '901', 1080, 1080], [`${ME}@c.us`, '902', 1080, 1080], [`${ME}@c.us`, '903', 1080, 1080]]);
  assert.deepStrictEqual(b.writes, [], 'só leitura');
});

test('ponte: catalogImage devolve largura x altura (JPEG, PNG e WebP); arquivo ilegível = null', async () => {
  const files = { big: { mime: 'image/jpeg', bytes: jpeg(1080, 1440) }, thumb: { mime: 'image/jpeg', bytes: jpeg(100, 133) },
    png: { mime: 'image/png', bytes: png(800, 600) }, webp: { mime: 'image/webp', bytes: webpX(1200, 900) }, junk: { mime: 'image/jpeg', bytes: [1, 2, 3] } };
  const fetchMap = Object.fromEntries(Object.entries(files).map(([k, v]) => [IMG(k), v]));
  const b = bridge({ products: [], fetchMap });
  const size = async (k) => { const r = await b.request('catalogImage', { url: IMG(k) }); assert.ok(r.ok, k); return [r.data.width, r.data.height]; };
  assert.deepStrictEqual(await size('big'), [1080, 1440]);
  assert.deepStrictEqual(await size('thumb'), [100, 133]);
  assert.deepStrictEqual(await size('png'), [800, 600]);
  assert.deepStrictEqual(await size('webp'), [1200, 900]);
  assert.deepStrictEqual(await size('junk'), [null, null]);
});

test('painel: só aceita foto com lado maior ≥ 600 px; produto só com miniatura vai para "sem foto grande"', () => {
  const c = src('content.js');
  assert.ok(/const CATX_MIN_PX = 600;/.test(c));
  assert.ok(/if \(Math\.max\(w, h\) < CATX_MIN_PX\) \{ small\.push/.test(c), 'miniatura não sobe');
  assert.ok(/sem foto grande: o WhatsApp só deu miniatura/.test(c));
  assert.ok(c.indexOf("small.push(") < c.indexOf("call('uploadCatalogImage'"), 'mede antes de subir');
});

// ── supabase-api.js ──
function api({ stored = new Set(), conflict = false } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url, body: init.body });
    const pub = /\/storage\/v1\/object\/public\/wa-media\/(.+)$/.exec(url);
    if (pub && method === 'HEAD') return res(stored.has(pub[1]) ? 200 : 400, null);
    const up = /\/storage\/v1\/object\/wa-media\/(.+)$/.exec(url);
    if (up && method === 'POST') { if (conflict) return res(400, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}'); stored.add(up[1]); return res(200, { Key: up[1] }); }
    return res(method === 'POST' ? 201 : 200, method === 'POST' ? null : []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, atob, btoa, crypto: nodeCrypto.webcrypto, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, calls, stored };
}
const PNG = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
const SHA = nodeCrypto.createHash('sha256').update(PNG).digest('hex');

test('api: foto vai para wa-media/catalog/<id>/<sha256>.png; a mesma foto de novo não sobe (reaproveita)', async () => {
  const { api: a, calls } = api();
  const r1 = await a.uploadCatalogImage({ productId: '111', base64: PNG.toString('base64'), mime: 'image/png' });
  assert.strictEqual(r1.path, `catalog/111/${SHA}.png`);
  assert.strictEqual(r1.url, `https://x.supabase.co/storage/v1/object/public/wa-media/catalog/111/${SHA}.png`);
  assert.deepStrictEqual([r1.reused, r1.sha256, r1.size], [false, SHA, PNG.length]);
  const r2 = await a.uploadCatalogImage({ productId: '111', base64: PNG.toString('base64'), mime: 'image/png' });
  assert.strictEqual(r2.reused, true);
  assert.strictEqual(calls.filter((c) => c.method === 'POST').length, 1, 'só um upload');
  await assert.rejects(a.uploadCatalogImage({ productId: '../x', base64: PNG.toString('base64'), mime: 'image/png' }), /Produto inválido/);
  await assert.rejects(a.uploadCatalogImage({ productId: '1', base64: PNG.toString('base64'), mime: 'image/gif' }), /não aceito/);
});

test('api: upload que responde "já existe" (409) também reaproveita', async () => {
  const { api: a } = api({ conflict: true });
  const r = await a.uploadCatalogImage({ productId: '222', base64: PNG.toString('base64'), mime: 'image/jpeg' });
  assert.deepStrictEqual([r.reused, r.path], [true, `catalog/222/${SHA}.jpg`]);
});

test('api: retrato gravado em system_config (wa_catalog_snapshot), limpo e com as contagens', async () => {
  const { api: a, calls } = api();
  const bucket = 'https://x.supabase.co/storage/v1/object/public/wa-media/catalog/';
  const out = await a.saveCatalogSnapshot({ snapshot: { phone: ME, failed: [{ id: '444', name: 'P', error: '1 de 2 fotos' }], products: [
    { id: '111', name: 'Relógio', description: 'x'.repeat(6000), price: 459.9, salePrice: 399.9, currency: 'BRL', collections: ['Relógios'], link: 'https://evil/', images: [
      { url: `${bucket}111/${SHA}.png`, source: IMG('a1'), sha256: SHA, size: 7, mime: 'image/png' },
      { url: 'https://evil.example/x.png', source: IMG('a2') },
      { url: `${bucket}999/${SHA}.png` }, // pasta de outro produto
    ] },
    { id: '444', name: 'P', price: 50, currency: 'USD', images: [] },
  ] } });
  assert.deepStrictEqual([out.product_count, out.image_count, out.failed], [2, 1, 1]);
  const post = calls.find((c) => c.method === 'POST' && /system_config\?on_conflict=key/.test(c.url));
  assert.ok(post);
  const row = JSON.parse(post.body);
  assert.strictEqual(row.key, 'wa_catalog_snapshot');
  const v = JSON.parse(row.value);
  assert.strictEqual(v.phone, ME);
  assert.ok(Date.parse(v.exported_at));
  assert.strictEqual(v.products[0].description.length, 5000);
  assert.strictEqual(v.products[0].link, `https://wa.me/p/111/${ME}`);
  assert.deepStrictEqual(v.products[0].images.map((i) => i.url), [`${bucket}111/${SHA}.png`]);
  assert.deepStrictEqual([v.products[1].currency, v.products[1].salePrice], ['USD', null]);
  await assert.rejects(a.saveCatalogSnapshot({ snapshot: { phone: '12', products: [] } }), /Número da loja/);
});

test('api: exportar de novo apaga do bucket as miniaturas do retrato anterior (só de quem ganhou foto nova) e guarda largura/altura', async () => {
  const bucket = 'https://x.supabase.co/storage/v1/object/public/wa-media/catalog/';
  const OLD = 'a'.repeat(64);
  const KEEP = 'b'.repeat(64);
  const old = { version: 1, products: [
    { id: '111', images: [{ url: `${bucket}111/${OLD}.jpg` }, { url: `${bucket}111/${KEEP}.jpg` }, { url: `${bucket}222/${OLD}.jpg` }, { url: 'https://evil.example/x.jpg' }] },
    { id: '333', images: [{ url: `${bucket}333/${OLD}.jpg` }] }, // sem foto grande agora: a antiga fica
  ] };
  // fetch falso: o GET do system_config devolve o retrato anterior
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const log = [];
  const fake = async (url, init = {}) => {
    const method = init.method || 'GET';
    log.push(`${method} ${url}`);
    if (method === 'GET' && /system_config\?select=value&key=eq\.wa_catalog_snapshot/.test(url)) return res(200, [{ value: JSON.stringify(old) }]);
    return res(method === 'POST' ? 201 : 200, method === 'POST' ? null : []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch: fake, atob, btoa, crypto: nodeCrypto.webcrypto, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('supabase-api.js'), ctx);
  const out = await ctx.WaApi.saveCatalogSnapshot({ snapshot: { phone: ME, products: [
    { id: '111', name: 'R', images: [{ url: `${bucket}111/${KEEP}.jpg`, source: IMG('g'), sha256: KEEP, size: 9, mime: 'image/jpeg', width: 1080, height: 1440 }] },
    { id: '333', name: 'Só miniatura', images: [] },
  ] } });
  assert.strictEqual(out.removed, 1);
  const dels = log.filter((l) => l.startsWith('DELETE'));
  assert.deepStrictEqual(dels, [`DELETE https://x.supabase.co/storage/v1/object/wa-media/catalog/111/${OLD}.jpg`]);
  const post = log.findIndex((l) => /^POST .*system_config/.test(l));
  assert.ok(post >= 0 && post < log.indexOf(dels[0]), 'grava o retrato novo antes de apagar');
});

test('api: o retrato guarda largura/altura de cada foto', () => {
  const { api: a } = api();
  const bucket = 'https://x.supabase.co/storage/v1/object/public/wa-media/catalog/';
  const v = a.checkCatalogSnapshot({ phone: ME, products: [{ id: '1', images: [{ url: `${bucket}1/${SHA}.png`, width: 1080, height: 1440 }, { url: `${bucket}1/${SHA}.jpg`, width: -1, height: 'x' }] }] });
  assert.deepStrictEqual(plain(v.products[0].images.map((i) => [i.width, i.height])), [[1080, 1440], [null, null]]);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 14).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
