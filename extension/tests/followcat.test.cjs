// Testes da 2.18.8 (follow manual por categoria / mensagem, para os Resultados do ERP): node extension/tests/followcat.test.cjs
// - supabase-api.js com banco falso: setCategoryFollow grava em wa_categories.is_followup (com a migration
//   20261119120000) e SEMPRE em system_config "wa_followup_marks"; sem a migration, só no system_config e nada quebra
// - fetchLibrary devolve is_followup das categorias e mensagens (coluna OU lista)
// - saveItem com is_followup (sem etapa) e desmarcar
// - content.js: opção da categoria, texto novo da caixinha, sem seletor de etapa
// - migration: só colunas novas, idempotente
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const CAT = '11111111-1111-4111-8111-111111111111';
const CAT2 = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
function api(db, { migrated }) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const NEW_COLS = { wa_categories: 'is_followup', wa_items: 'is_followup' };
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: p, body });
    const table = p.split('?')[0];
    const q = new URLSearchParams(p.split('?')[1] || '');
    const sel = q.get('select') || '';
    const col = NEW_COLS[table];
    if (!migrated && col && (new RegExp(`\\b${col}\\b`).test(sel) || (body && !Array.isArray(body) && col in body))) {
      return res(400, { code: '42703', message: `column ${table}.${col} does not exist` });
    }
    const match = (r) => { for (const [k, v] of q) { if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue; if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false; } return true; };
    db[table] = db[table] || [];
    if (method === 'PATCH') { db[table].filter(match).forEach((r) => Object.assign(r, body)); return res(200, db[table].filter(match)); }
    if (method === 'POST' && table === 'system_config') { const cur = db[table].find((r) => r.key === body.key); if (cur) Object.assign(cur, body); else db[table].push({ ...body }); return res(201, null); }
    if (method === 'POST') { const row = { id: ITEM, ...body }; db[table].push(row); return res(201, [row]); }
    if (method === 'DELETE') return res(204, null);
    return res(200, db[table].filter(match));
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls, db };
}
const DB = () => ({
  wa_categories: [{ id: CAT, name: 'Follow', position: 0, created_at: '2026-11-01' }, { id: CAT2, name: 'Endereço', position: 1, created_at: '2026-11-01' }],
  wa_items: [{ id: ITEM, category_id: CAT2, title: 'Oi', type: 'texto', body: 'oi', position: 0, follow_step: null }],
  wa_item_parts: [], system_config: [],
});
const marks = (db) => { const r = db.system_config.find((x) => x.key === 'wa_followup_marks'); return r ? JSON.parse(r.value) : null; };

test('com a migration: a opção da categoria vai para wa_categories.is_followup e para system_config; desmarcar tira dos dois', async () => {
  const { a, db } = api(DB(), { migrated: true });
  assert.deepStrictEqual(plain(await a.setCategoryFollow({ id: CAT, on: true })), { id: CAT, is_followup: true });
  assert.strictEqual(db.wa_categories[0].is_followup, true);
  assert.deepStrictEqual(marks(db).categories, [CAT]);
  const lib = await a.fetchLibrary();
  assert.deepStrictEqual(plain(lib.categories.map((c) => [c.name, c.is_followup])), [["Follow", true], ["Endereço", false]]);
  await a.setCategoryFollow({ id: CAT, on: false });
  assert.strictEqual(db.wa_categories[0].is_followup, false);
  assert.deepStrictEqual(marks(db).categories, []);
});
test('sem a migration: grava só no system_config, a biblioteca abre e mostra a categoria como follow-up', async () => {
  const { a, db, calls } = api(DB(), { migrated: false });
  await a.setCategoryFollow({ id: CAT, on: true });
  assert.ok(!('is_followup' in db.wa_categories[0]));
  assert.ok(!calls.some((c) => c.method === 'PATCH' && c.path.startsWith('wa_categories')));
  assert.deepStrictEqual(marks(db).categories, [CAT]);
  const lib = await a.fetchLibrary();
  assert.deepStrictEqual(plain(lib.categories.map((c) => [c.name, c.is_followup])), [["Follow", true], ["Endereço", false]]);
  assert.deepStrictEqual(plain(lib.items.map((i) => [i.title, i.is_followup])), [['Oi', false]]);
});
test('mensagem solta: saveItem com is_followup marca (sem etapa) e desmarca; sem is_followup não mexe', async () => {
  for (const migrated of [true, false]) {
    const { a, db } = api(DB(), { migrated });
    const parts = [{ type: 'texto', body: 'oi', wait_seconds: 0, typing_seconds: 0 }];
    await a.saveItem({ id: ITEM, category_id: CAT2, title: 'Oi', parts, is_followup: true });
    assert.deepStrictEqual(marks(db).items, [ITEM], `migrated=${migrated}`);
    if (migrated) assert.strictEqual(db.wa_items[0].is_followup, true);
    assert.strictEqual(db.wa_items[0].follow_step, null);
    const lib = await a.fetchLibrary();
    assert.strictEqual(lib.items[0].is_followup, true);
    const before = db.system_config.length;
    await a.saveItem({ id: ITEM, category_id: CAT2, title: 'Oi 2', parts });
    assert.deepStrictEqual(marks(db).items, [ITEM]);
    assert.strictEqual(db.system_config.length, before);
    await a.saveItem({ id: ITEM, category_id: CAT2, title: 'Oi', parts, is_followup: false });
    assert.deepStrictEqual(marks(db).items, []);
  }
});
test('categoria inválida é recusada', async () => {
  const { a } = api(DB(), { migrated: true });
  await assert.rejects(() => a.setCategoryFollow({ id: 'x', on: true }), /Categoria inválida/);
});
test('content.js: opção no menu da categoria, selo, caixinha com o texto novo e sem seletor de etapa', () => {
  const c = src('content.js');
  assert.ok(c.includes('Mensagens desta categoria são follow-up'));
  assert.ok(c.includes("categoryOp('setCategoryFollow'"));
  assert.ok(c.includes('Contar como follow-up nos Resultados do ERP (mesmo fora de uma categoria de follow)'));
  assert.ok(!c.includes("lbl.append(cb, ' Esta mensagem é um follow-up')"));
  assert.ok(!c.includes("'Etapa do follow-up'"));
  assert.ok(c.includes("'cat-fu', 'follow-up'"));
  const bg = src('background.js');
  assert.ok(/setCategoryFollow: \(m\) => WaApi\.setCategoryFollow\(\{ id: m\.id, on: m\.on \}\)/.test(bg));
  assert.ok(/is_followup: m\.is_followup/.test(bg));
});
test('migration 20261119120000: só colunas novas (is_followup), idempotente, nada apagado', () => {
  const m = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261119120000_wa_followup_categories.sql'), 'utf8');
  assert.ok(/alter table wa_categories add column if not exists is_followup boolean not null default false/i.test(m));
  assert.ok(/alter table wa_items add column if not exists is_followup boolean not null default false/i.test(m));
  assert.ok(!/\b(drop|delete|truncate|update)\b/i.test(m.replace(/--.*$/gm, '')));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e && e.message).split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
