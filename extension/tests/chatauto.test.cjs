// Testes da 2.18.5: "🔁 ESTA CONVERSA" — a pessoa da conversa aberta nas automações (réguas).
//   node extension/tests/chatauto.test.cjs
// - supabase-api (PostgREST falso com eq/neq/in/gte/or): acha os percursos da conversa aberta mesmo gravados com OUTRO
//   chat_id — pelo telefone (o @c.us do @lid aberto), pelo contato (contact_id) e pelo chat_id do contato; sem repetir;
//   os 5 últimos encerrados; os envios de cada percurso; o mesmo chat_id com o telefone de outra pessoa não vale
// - motor: a etapa em português simples ("Esperando resposta — até 3 dias depois de entrar"), sem "vai mexer nas
//   etiquetas"; o cartão (já recebeu, próximo e quando, linha do tempo feitos ✓ + previstos) e os motivos de parado
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

// ── motor ──
const ectx = vm.createContext({ console, Intl, Date, Math });
vm.runInContext('var globalThis = this;', ectx);
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;
const DAY = 86400000;
// Régua de follow-up: Follow 1 → ❓ 1 dia desde a entrada → Follow 2 → ❓ 3 dias → Follow 3 → ❓ 6 dias → Frio
const DEF = E.seqNormalize({
  start: { type: 'manual' }, business: false, schedule: { mode: 'personalizado', week: [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: '00:00', end: '23:59' }]) },
  steps: [
    { id: 's1', type: 'enviar', item_id: 'i1' },
    { id: 'w1', type: 'esperar', amount: 1, unit: 'dias', from: 'entrada', yes: [{ id: 'f1', type: 'fim' }], no: [
      { id: 's2', type: 'enviar', item_id: 'i2' },
      { id: 'w2', type: 'esperar', amount: 3, unit: 'dias', from: 'entrada', yes: [{ id: 'f2', type: 'fim' }], no: [
        { id: 'l3', type: 'etiqueta', op: 'colocar', source: 'crm', label_id: 'x' },
        { id: 's3', type: 'enviar', item_id: 'i3' },
        { id: 'w3', type: 'esperar', amount: 6, unit: 'dias', from: 'entrada', yes: [{ id: 'f3', type: 'fim' }], no: [{ id: 'f4', type: 'fim' }] },
      ] },
    ] },
  ],
});
const TITLES = { i1: 'Follow 1', i2: 'Follow 2', i3: 'Follow Padrão 3' };
const itemTitle = (id) => TITLES[id] || id;
const T0 = Date.parse('2026-11-10T12:28:00-03:00'); // entrou e recebeu o Follow 1
const NOW = Date.parse('2026-11-12T10:00:00-03:00');
const RUN = { id: 'r1', automation_id: 'a1', chat_id: '111@lid', node: 'w2', status: 'ativo', created_at: new Date(T0).toISOString(), due_at: T0 + 3 * DAY, skip_wait: false,
  branches: [{ node: 'w1', result: 'nao', at: Date.parse('2026-11-11T09:55:00-03:00') }] };
const SENDS = [
  { source_id: 'a1', item_id: 'i1', status: 'enviado', created_at: new Date(T0).toISOString() },
  { source_id: 'a1', item_id: 'i2', status: 'enviado', created_at: '2026-11-11T09:56:00-03:00' },
  { source_id: 'a1', item_id: 'i1', status: 'enviado', created_at: '2026-11-01T09:00:00-03:00' }, // de um percurso ANTERIOR: fora
];

test('motor: a etapa em português simples; caixa de etiqueta mostra a etapa real (não "vai mexer nas etiquetas")', () => {
  assert.match(E.seqStepText(DEF, RUN, NOW, { itemTitle }), /^Esperando resposta — até 3 dias depois de entrar \(faltam /);
  const atLabel = { ...RUN, node: 'l3', due_at: null };
  assert.strictEqual(E.seqStepText(DEF, atLabel, NOW, { itemTitle }), 'Vai mandar “Follow Padrão 3”');
  assert.strictEqual(E.seqDescribe(DEF, atLabel, NOW, { itemTitle }), 'vai mandar “Follow Padrão 3”');
  assert.ok(!/mexer nas etiquetas/.test(E.seqDescribe(DEF, atLabel, NOW, { itemTitle })));
  assert.strictEqual(E.seqStepText(DEF, { ...RUN, skip_wait: true }, NOW, { itemTitle }), 'Espera pulada: o próximo envio está na fila');
});
test('motor: cartão — já recebeu (só deste percurso), próximo Follow 3 na hora certa, linha do tempo feitos ✓ + previstos', () => {
  const c = plain(E.seqChatCard(DEF, RUN, SENDS, NOW, { itemTitle }));
  assert.deepStrictEqual(c.received.map((x) => x.title), ['Follow 1', 'Follow 2']);
  assert.strictEqual(c.next.text, '“Follow Padrão 3”');
  assert.strictEqual(c.next.when, T0 + 3 * DAY, 'sai quando vence a espera de 3 dias desde a entrada');
  assert.strictEqual(c.next.held, null);
  const done = c.timeline.filter((e) => e.done).map((e) => e.text);
  assert.deepStrictEqual(done, ['Entrou na automação', 'Recebeu “Follow 1”', '❌ Não respondeu até 1 dia depois de entrar', 'Recebeu “Follow 2”']);
  const fut = c.timeline.filter((e) => !e.done).map((e) => e.text);
  assert.deepStrictEqual(fut.filter((t) => /Recebe|Termina|Não respondeu/.test(t)), ['❌ Não respondeu até 3 dias depois de entrar', 'Recebe “Follow Padrão 3”', '❌ Não respondeu até 6 dias depois de entrar', 'Termina a automação']);
  assert.ok(c.timeline.filter((e) => !e.done).every((e) => e.when >= NOW - 60000), 'previstos daqui para frente');
});
test('motor: parado (automação desligada / envios pausados), atrasado e encerrado', () => {
  const held = plain(E.seqChatCard(DEF, RUN, SENDS, NOW, { itemTitle, hold: 'parado: a automação está desligada' }));
  assert.strictEqual(held.next.held, 'parado: a automação está desligada');
  assert.strictEqual(held.next.when, null);
  const late = plain(E.seqChatCard(DEF, { ...RUN, due_at: NOW - 2 * 3600000 }, SENDS, NOW, { itemTitle }));
  assert.match(late.next.held || '', /^atrasado/);
  const ended = plain(E.seqChatCard(DEF, { ...RUN, status: 'saiu', outcome: 'respondeu', updated_at: '2026-11-11T15:00:00-03:00' }, SENDS, NOW, { itemTitle }));
  assert.strictEqual(ended.step, 'Saiu: respondeu');
  assert.strictEqual(ended.next, null);
  assert.strictEqual(E.seqOutcomeText('saiu_etiqueta'), 'saiu da etiqueta');
});

// ── PostgREST falso ──
function db(seed) {
  const T = { wa_contacts: [], wa_sequence_runs: [], wa_automations: [], wa_send_log: [], ...seed };
  const calls = [];
  const unq = (v) => v.replace(/^"|"$/g, '');
  const listOf = (v) => v.replace(/^\(|\)$/g, '').split(',').map(unq);
  const match = (r, k, v) => {
    const i = v.indexOf('.'); const op = v.slice(0, i); const val = v.slice(i + 1);
    if (op === 'eq') return String(r[k]) === unq(val);
    if (op === 'neq') return String(r[k]) !== unq(val);
    if (op === 'in') return listOf(val).includes(String(r[k]));
    if (op === 'gte') return String(r[k]) >= val;
    if (op === 'is') return val === 'null' ? r[k] == null : true;
    return true;
  };
  const orOf = (v) => { // (chat_id.in.("a","b"),contact_id.in.("c"))
    const body = v.replace(/^\(|\)$/g, '');
    const parts = []; let depth = 0; let cur = '';
    for (const ch of body) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    if (cur) parts.push(cur);
    return parts.map((p) => { const i = p.indexOf('.'); return [p.slice(0, i), p.slice(i + 1)]; });
  };
  const handle = (method, url) => {
    const [table, qs] = url.split('?');
    calls.push(`${method} ${url}`);
    let rows = (T[table] || []).slice();
    let lim = null; let order = null;
    for (const p of (qs || '').split('&').filter(Boolean)) {
      const i = p.indexOf('='); const k = p.slice(0, i); const v = p.slice(i + 1);
      if (k === 'select') { const cols = v.split(','); if (table === 'wa_automations' && cols.includes('kind') && cols.length === 1) return { status: 200, out: [] }; continue; }
      if (k === 'limit') { lim = Number(v); continue; }
      if (k === 'order') { order = v.split(',')[0].split('.'); continue; }
      if (k === 'offset') continue;
      if (k === 'or') { const conds = orOf(v); rows = rows.filter((r) => conds.some(([c, cv]) => match(r, c, cv))); continue; }
      rows = rows.filter((r) => match(r, k, v));
    }
    if (order) rows.sort((a, b) => String(a[order[0]] || '').localeCompare(String(b[order[0]] || '')) * (order[1] === 'desc' ? -1 : 1));
    if (lim != null) rows = rows.slice(0, lim);
    return { status: 200, out: rows.map((r) => ({ ...r })) };
  };
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(String(url).replace('https://x.supabase.co/rest/v1/', ''));
    const { status, out } = handle(String(init.method || 'GET').toUpperCase(), p);
    return { ok: status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(out) };
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  return { api: ctx.WaApi, T, calls };
}
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001'; const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const C1 = 'cccccccc-0000-4000-8000-000000000001'; const C2 = 'cccccccc-0000-4000-8000-000000000002';
const run = (id, o) => ({ id, automation_id: A1, chat_id: null, contact_id: null, entry_key: `k${id}`, node: 'w2', status: 'ativo', outcome: null, wait_started_at: null, due_at: null, last_sent_at: null, skip_wait: false, branches: [], version: 1, created_at: '2026-11-10T15:28:00.000Z', updated_at: '2026-11-11T12:56:00.000Z', ended_at: null, ...o });
const AUTOS = [{ id: A1, name: 'Régua de follow-up', kind: 'sequencia', active: true, sequence: {}, test_chat_id: null }, { id: A2, name: 'Pós-venda', kind: 'sequencia', active: true, sequence: {}, test_chat_id: null }];

test('acha o percurso gravado com OUTRO chat_id: pelo telefone (o @c.us do @lid aberto)', async () => {
  // a conversa aberta é o @lid 999; o percurso foi gravado no @c.us do mesmo telefone (troca @lid/@c.us)
  const { api } = db({ wa_automations: AUTOS, wa_sequence_runs: [run('r1', { chat_id: '5521979762603@c.us' })],
    wa_send_log: [{ source: 'follow', source_id: A1, chat_id: '5521979762603@c.us', item_id: 'i1', status: 'enviado', reason: null, created_at: '2026-11-10T15:28:00.000Z' }] });
  const ov = plain(await api.seqChatOverview({ chatId: '99887766554433@lid', phone: '5521979762603' }));
  assert.deepStrictEqual(ov.runs.map((r) => [r.id, r.automation.name]), [['r1', 'Régua de follow-up']]);
  assert.strictEqual(ov.sends.length, 1);
  const runs = plain(await api.seqChatRuns({ chatId: '99887766554433@lid', phone: '5521979762603' }));
  assert.deepStrictEqual(runs.map((r) => r.id), ['r1'], 'a mesma busca no aviso da aba Mensagens e no 🔁');
  // sem o telefone, o @lid sozinho não acha (era o problema da 2.18.2)
  assert.strictEqual(plain(await api.seqChatRuns({ chatId: '99887766554433@lid' })).length, 0);
});
test('pelo contato: contact_id do percurso = contato do telefone, e o chat_id do contato (outro @lid)', async () => {
  const { api } = db({
    wa_automations: AUTOS,
    wa_contacts: [{ id: C1, name: 'Fabiola', phone: '5521986216333', chat_id: '11122233344455@lid' }],
    wa_sequence_runs: [
      run('r2', { chat_id: '55555555555555@lid', contact_id: C1 }), // outro @lid, mas o contato é o dela
      run('r3', { chat_id: '11122233344455@lid', automation_id: A2 }), // o chat_id antigo do contato
      run('r4', { chat_id: '5521986216333@c.us', status: 'saiu', outcome: 'respondeu', ended_at: '2026-11-11T14:00:00.000Z', updated_at: '2026-11-11T14:00:00.000Z' }),
      run('rX', { chat_id: '5521900000000@c.us' }), // outra pessoa
    ],
  });
  const ov = plain(await api.seqChatOverview({ chatId: '5521986216333@c.us' }));
  assert.deepStrictEqual(ov.runs.map((r) => r.id).sort(), ['r2', 'r3']);
  assert.deepStrictEqual(ov.ended.map((r) => [r.id, r.outcome]), [['r4', 'respondeu']]);
  assert.ok(!ov.runs.some((r) => r.id === 'rX'));
});
test('sem repetir; no máximo 5 encerrados (os mais recentes); o mesmo chat_id com o telefone de OUTRA pessoa não vale', async () => {
  const ended = [1, 2, 3, 4, 5, 6, 7].map((i) => run(`e${i}`, { chat_id: '5521979762603@c.us', status: 'saiu', outcome: 'fim', updated_at: `2026-11-0${i}T10:00:00.000Z` }));
  const { api } = db({
    wa_automations: AUTOS,
    wa_contacts: [{ id: C1, name: 'Alyson', phone: '5521979762603', chat_id: '5521979762603@c.us' }, { id: C2, name: 'Outra', phone: '5521911112222', chat_id: '77788899900011@lid' }],
    wa_sequence_runs: [run('r1', { chat_id: '5521979762603@c.us', contact_id: C1 }), ...ended, run('rZ', { chat_id: '22233344455566@lid', contact_id: C2 })],
  });
  const ov = plain(await api.seqChatOverview({ chatId: '5521979762603@c.us' }));
  assert.deepStrictEqual(ov.runs.map((r) => r.id), ['r1'], 'casou por chat_id E contact_id: aparece uma vez');
  assert.deepStrictEqual(ov.ended.map((r) => r.id), ['e7', 'e6', 'e5', 'e4', 'e3']);
  // conversa aberta 77788899900011@lid com o telefone de outra pessoa (o contato C2 tem outro telefone): C2 não vale
  const other = plain(await api.seqChatOverview({ chatId: '77788899900011@lid', phone: '5521900001111' }));
  assert.ok(!other.runs.some((r) => r.id === 'rZ'), 'contato com o mesmo chat_id mas telefone de outra pessoa');
});

test('painel e ponte do motor: busca pela pessoa em todo lugar; bloco "🔁 ESTA CONVERSA" antes da lista; manifesto 2.18.5', () => {
  const c = src('content.js');
  assert.ok(/call\('seqChatOverview', who\)/.test(c), 'aba Automações e aviso da aba Mensagens: seqChatOverview com o telefone');
  assert.ok(/seqChatRuns', \{ chatId, \.\.\.\(phone \? \{ phone \} : \{\}\) \}/.test(c), 'tirar de todas (venda): a mesma pessoa');
  assert.ok(/renderFollowsTop\(ftabEl\);\n\s+ftabEl\.append\(chatBlockEl\(\)\);/.test(c.replace(/\r\n/g, '\n')), 'o bloco vem antes da lista geral');
  assert.ok(/'🔁 ESTA CONVERSA'/.test(c) && /Esta conversa não está em nenhuma automação\./.test(c) && /Já passou por: /.test(c));
  assert.ok(/seqChatOverview: \(m\) => WaApi\.seqChatOverview\(\{ chatId: m\.chatId, phone: m\.phone \}\)/.test(src('background.js')));
  const v = JSON.parse(src('manifest.json')).version.split('.').map(Number);
  assert.ok(v[0] > 2 || (v[0] === 2 && (v[1] > 18 || (v[1] === 18 && v[2] >= 5))));
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.message}`); }
  }
  console.log(`\n${tests.length - fail}/${tests.length} testes passaram`);
  if (fail) process.exitCode = 1;
})();
