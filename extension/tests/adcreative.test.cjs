// Testes da 2.15.2 (criativo do anúncio para o 👁 do Rastreamento no ERP): node extension/tests/adcreative.test.cjs
// - ponte: o ctwaContext devolve a miniatura (thumbnailUrl; mediaUrl se for imagem) e o tipo de mídia (1/2 → IMAGE/VIDEO)
// - supabase-api.js: saveAdAttributions grava thumbnail_url/media_type; linha que já existe só ganha o que estava vazio
// - sem a migration 20261112120000: grava como antes (sem as colunas novas)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const A = '5511900000001@c.us';
const B = '5511900000002@c.us';
const THUMB = 'https://scontent.xx.fbcdn.net/v/t45/abc.jpg?stp=dst-jpg&oh=1';

// ── supabase-api.js com fetch falso ──
function api({ thumbCols = true, existing = [] } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (!thumbCols && /thumbnail_url|media_type/.test(p)) return res(400, { code: '42703', message: 'column wa_ad_attribution.thumbnail_url does not exist' });
    if (method === 'GET' && p.startsWith('wa_ad_attribution?select=chat_id,')) return res(200, existing.filter((r) => p.includes(r.chat_id)));
    return res(method === 'POST' ? 201 : 200, method === 'POST' ? null : []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, calls };
}
const item = (chatId, ad) => ({ chatId, t: 1762430400, ad: { title: 'Relógio Promo', sourceId: '120200000000001', sourceApp: 'Instagram', ...ad } });

test('api: grava a miniatura e o tipo de mídia (só https; tipo em maiúsculas)', async () => {
  const { api: a, calls } = api();
  await a.saveAdAttributions({ items: [
    item(A, { sourceUrl: 'https://www.instagram.com/reel/XYZ/', thumbnailUrl: THUMB, mediaType: 'video' }),
    item(B, { thumbnailUrl: 'javascript:alert(1)', mediaType: 'x y' }),
  ] });
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'gravou');
  const [ra, rb] = post.body;
  assert.deepStrictEqual([ra.source_url, ra.thumbnail_url, ra.media_type], ['https://www.instagram.com/reel/XYZ/', THUMB, 'VIDEO']);
  assert.deepStrictEqual([rb.thumbnail_url, rb.media_type], [null, null]);
});

test('api: linha que já existe só ganha o link do criativo / miniatura que estavam vazios', async () => {
  const { api: a, calls } = api({ existing: [{ chat_id: A, ctwa_clid: 'CLIDCLIDCLID', source_url: 'https://www.instagram.com/p/OLD/', thumbnail_url: null, media_type: null }] });
  const r = await a.saveAdAttributions({ items: [item(A, { sourceUrl: 'https://www.instagram.com/reel/NEW/', thumbnailUrl: THUMB, mediaType: 'IMAGE', ctwaClid: 'OUTROCLID123' })] });
  assert.ok(!calls.some((c) => c.method === 'POST'), 'não grava de novo');
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch);
  assert.match(patch.path, /thumbnail_url=is\.null/);
  assert.match(patch.path, /media_type=is\.null/);
  assert.strictEqual(patch.body.thumbnail_url, THUMB);
  assert.strictEqual(patch.body.media_type, 'IMAGE');
  assert.ok(!('source_url' in patch.body), 'o link antigo não é trocado');
  assert.ok(!('ctwa_clid' in patch.body), 'o ctwa_clid antigo não é trocado');
  assert.strictEqual(r.completed, 1);
});

test('api: nada a completar → nenhuma gravação', async () => {
  const { api: a, calls } = api({ existing: [{ chat_id: A, ctwa_clid: 'CLIDCLIDCLID', source_url: 'https://x.com/a', thumbnail_url: THUMB, media_type: 'IMAGE' }] });
  await a.saveAdAttributions({ items: [item(A, { sourceUrl: 'https://x.com/b', thumbnailUrl: THUMB, mediaType: 'IMAGE' })] });
  assert.ok(!calls.some((c) => c.method === 'PATCH' || c.method === 'POST'));
});

test('api: sem a migration 20261112120000 grava como antes (sem thumbnail_url/media_type)', async () => {
  const { api: a, calls } = api({ thumbCols: false });
  await a.saveAdAttributions({ items: [item(A, { sourceUrl: 'https://www.instagram.com/reel/XYZ/', thumbnailUrl: THUMB, mediaType: 'VIDEO' })] });
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'gravou');
  assert.ok(!('thumbnail_url' in post.body[0]) && !('media_type' in post.body[0]));
  assert.strictEqual(post.body[0].source_url, 'https://www.instagram.com/reel/XYZ/');
  const got = await a.getAdAttribution({ chatId: A });
  assert.strictEqual(got.row, null);
  assert.ok(!calls.filter((c) => c.path.startsWith('wa_ad_attribution?select=chat_id,phone')).some((c) => /thumbnail_url/.test(c.path)));
});

// ── wa-bridge.js com uma WA-JS falsa ──
function bridge(msgs) {
  let listener = null;
  const replies = [];
  const chatModel = (id) => ({ id: { _serialized: id }, name: 'Nome', msgs: { getModelsArray: () => msgs[id] || [], msgLoadState: { noEarlierMsgs: true } } });
  const wpp = {
    isReady: true, on: () => {},
    chat: { get: (id) => chatModel(id), list: async () => Object.keys(msgs).map(chatModel), getMessages: async () => [] },
    contact: { getPnLidEntry: async () => null },
  };
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' },
    addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('wa-bridge.js'), ctx);
  const me = vm.runInContext('window', ctx);
  let n = 0;
  return (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false }); else setTimeout(wait, 5); };
    wait();
  });
}
const msg = (chat, id, t, ctwaContext) => ({ id: { remote: { _serialized: chat }, fromMe: false, id }, t, type: 'chat', ctwaContext });

test('ponte: adContext e a varredura levam a miniatura e o tipo de mídia do ctwaContext', async () => {
  const now = Math.floor(Date.now() / 1000);
  const request = bridge({
    [A]: [msg(A, 'm1', now, { sourceId: '1202', title: 'Promo', sourceUrl: 'https://www.instagram.com/reel/XYZ/', thumbnailUrl: THUMB, mediaType: 2, sourceApp: 'instagram' })],
    [B]: [msg(B, 'm2', now, { sourceId: '1203', title: 'Foto', mediaType: 1, mediaUrl: 'https://scontent.xx.fbcdn.net/img.jpg', thumbnail: 'AAAA' })],
  });
  const a = await request('adContext', { chatId: A });
  assert.ok(a.ok, JSON.stringify(a));
  assert.deepStrictEqual([a.data.thumbnailUrl, a.data.mediaType, a.data.platform], [THUMB, 'VIDEO', 'Instagram']);
  const b = await request('adContext', { chatId: B });
  assert.deepStrictEqual([b.data.thumbnailUrl, b.data.mediaType], ['https://scontent.xx.fbcdn.net/img.jpg', 'IMAGE']);
  const scan = await request('adAttributions', { scan: true });
  const byChat = Object.fromEntries(scan.data.items.map((it) => [it.chatId, it.ad]));
  assert.deepStrictEqual([byChat[A].thumbnailUrl, byChat[A].mediaType, byChat[A].sourceUrl], [THUMB, 'VIDEO', 'https://www.instagram.com/reel/XYZ/']);
  assert.strictEqual(byChat[B].thumbnailUrl, 'https://scontent.xx.fbcdn.net/img.jpg');
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 14).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
