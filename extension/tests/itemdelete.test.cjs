// Testes da 2.13.1 (excluir mensagem rápida em uso): node extension/tests/itemdelete.test.cjs
// - supabase-api.js com fetch falso: itemUsage (agendamentos PENDENTES, automações/réguas e caixas ✉, réguas antigas,
//   disparos não terminados); deleteItem não apaga em uso; apaga livre
// - engine.js: as frases de onde está em uso e o erro do banco em frase clara
// - migration 20261110120000: tira a regra antiga e cria a nova (idempotente)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx);
const E = ctx.TspEngine;

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function api(db) {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p });
    const table = p.split('?')[0];
    if (method === 'DELETE') return res(204, null);
    if (db.missing && db.missing.includes(table)) return res(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}'` });
    const rows = (db[table] || []).filter((r) => {
      const q = new URLSearchParams(p.split('?')[1] || '');
      for (const [k, v] of q) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false;
        if (v.startsWith('in.(') && !v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(r[k]))) return false;
      }
      return true;
    });
    return res(200, rows);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, calls };
}
const DB = () => ({
  wa_schedules: [
    { id: 's1', chat_id: '5521988887777@c.us', chat_name: 'Joana', item_id: ITEM, send_at: '2026-12-01T13:00:00.000Z', status: 'pendente' },
    { id: 's2', chat_id: '5521988886666@c.us', chat_name: 'Pedro', item_id: ITEM, send_at: '2026-11-01T13:00:00.000Z', status: 'enviada' }, // já enviado: não conta
  ],
  wa_automations: [
    { id: 'a1', name: 'Follow de venda', active: true, kind: null, actions: [{ type: 'enviar', item_id: OTHER, variants: [{ when: 'anuncio', keyword: 'x', item_id: ITEM }] }], sequence: null },
    { id: 'a2', name: 'Régua de follow-up', active: false, kind: 'sequencia', actions: [], sequence: { start: { type: 'lead' }, steps: [{ id: 'n1', type: 'enviar', item_id: ITEM }] } },
    { id: 'a3', name: 'Outra', active: true, kind: null, actions: [{ type: 'enviar', item_id: OTHER, variants: [] }], sequence: null },
  ],
  wa_flows: [{ id: 'f1', name: 'Régua antiga', active: true, item_id: null }],
  wa_flow_variants: [{ flow_id: 'f1', item_id: ITEM }],
  wa_campaigns: [{ id: 'c1', name: 'Black Friday', status: 'pausada', item_id: ITEM }, { id: 'c2', name: 'Natal', status: 'concluida', item_id: ITEM }],
});

test('itemUsage: agendamentos PENDENTES, automações (ação, variante e caixa ✉), régua antiga (variante) e disparos não terminados', async () => {
  const { a } = api(DB());
  const u = plain(await a.itemUsage({ id: ITEM }));
  assert.deepStrictEqual(u.schedules, [{ id: 's1', chatId: '5521988887777@c.us', chatName: 'Joana', sendAt: '2026-12-01T13:00:00.000Z' }]);
  assert.deepStrictEqual(u.automations.map((x) => [x.name, x.active, x.kind]), [['Follow de venda', true, 'automacao'], ['Régua de follow-up', false, 'sequencia']]);
  assert.deepStrictEqual(u.flows.map((x) => x.name), ['Régua antiga']);
  assert.deepStrictEqual(u.campaigns.map((x) => [x.name, x.status]), [['Black Friday', 'pausada']]);
});
test('deleteItem em uso: não apaga e avisa "Mensagem em uso"', async () => {
  const { a, calls } = api(DB());
  await assert.rejects(a.deleteItem({ id: ITEM }), /Mensagem em uso/);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
});
test('deleteItem livre (só agendamento já enviado, disparo concluído): apaga; tabela que não existe é pulada', async () => {
  const db = DB();
  db.wa_schedules = db.wa_schedules.filter((s) => s.status !== 'pendente');
  db.wa_automations = db.wa_automations.filter((x) => x.id === 'a3');
  db.wa_flow_variants = [];
  db.wa_campaigns = db.wa_campaigns.filter((x) => x.status === 'concluida');
  db.missing = ['wa_flows'];
  const { a, calls } = api(db);
  assert.strictEqual(await a.deleteItem({ id: ITEM }), true);
  assert.deepStrictEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.path), [`wa_items?id=eq.${ITEM}`]);
});
test('frases de onde está em uso (conversa e data; nome das automações, réguas e disparos)', () => {
  const lines = plain(E.itemUsageLines({
    schedules: [{ chatId: '5521988887777@c.us', chatName: 'Joana', sendAt: '2026-12-01T13:00:00.000Z' }, { chatId: '5521977776666@c.us', chatName: null, sendAt: '2026-12-02T15:30:00.000Z' }],
    automations: [{ name: 'Follow de venda', active: true }], flows: [{ name: 'Régua antiga' }], campaigns: [{ name: 'Black Friday', status: 'pausada' }],
  }));
  assert.deepStrictEqual(lines.map((l) => l.head), ['Esta mensagem está em 2 agendamentos pendentes:', 'Está em 1 automação/régua:', 'Está em 1 régua de follow antiga:', 'Está em 1 disparo não terminado:']);
  assert.deepStrictEqual(lines[0].items, ['Joana · 01/12, 10:00', '5521977776666 · 02/12, 12:30']);
  assert.deepStrictEqual([lines[1].items[0], lines[3].items[0]], ['Follow de venda (ligada)', 'Black Friday (pausado)']);
  assert.strictEqual(E.itemInUse({ schedules: [], automations: [], flows: [], campaigns: [] }), false);
  assert.strictEqual(E.itemInUse(null), false);
});
test('erro do banco ao excluir vira frase clara', () => {
  assert.match(E.friendlyDeleteError('Supabase 400: {"code":"23514","message":"new row for relation \\"wa_schedules\\" violates check constraint","details":"Failing row contains (…)"}'), /um agendamento antigo ainda aponta para esta mensagem/);
  assert.match(E.friendlyDeleteError('Supabase 409: {"code":"23503"}'), /usada em outro lugar/);
  assert.match(E.friendlyDeleteError('Supabase 401: JWT expired'), /Sem permissão/);
  assert.match(E.friendlyDeleteError('Failed to fetch'), /Sem conexão/);
  assert.match(E.friendlyDeleteError('Mensagem em uso'), /ainda está em uso/);
  assert.match(E.friendlyDeleteError('qualquer coisa'), /^Não consegui excluir a mensagem/);
  ['23514', 'Supabase', 'JWT'].forEach((w) => assert.ok(!E.friendlyDeleteError(`Supabase 400: ${w}`).includes(w)));
});
test('migration 20261110120000: tira a regra "item_id ou body" (a antiga ou esta) e cria wa_schedules_item_or_body_check (pendente precisa de mensagem ou texto)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261110120000_wa_schedules_item_or_body.sql'), 'utf8');
  assert.match(sql, /pg_get_constraintdef\(oid\) ilike '%item_id is not null%'/);
  assert.match(sql, /alter table wa_schedules add constraint wa_schedules_item_or_body_check\s+check \(item_id is not null or body is not null or status <> 'pendente'\);/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
