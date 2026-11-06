// Testes da 2.11.0 (automações mais simples). node extension/tests/automations.test.cjs
// - cada modelo do passo a passo gera a(s) automação(ões) certa(s) e a frase-resumo
// - validação do editor avançado (diz onde está o problema)
// - "X dias depois da venda" no gatilho de venda registrada
// - as automações geradas passam pela validação do supabase-api.js (saveAutomation com fetch falso)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ectx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;
const SETTINGS = { business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6] }; // 600 min por dia
const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const L3 = '33333333-3333-4333-8333-333333333333';
const LX = '44444444-4444-4444-8444-444444444444';
const I1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const I2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const I3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const names = { labelName: (id) => ({ [L1]: 'Follow Up 1', [L2]: 'Follow Up 2', [L3]: 'Follow Up 3', [LX]: 'Cliente' })[id] || id, itemTitle: (id) => ({ [I1]: 'Msg 1', [I2]: 'Msg 2', [I3]: 'Msg 3' })[id] || id, waLabelName: () => 'Novo cliente' };

test('modelos: 4 passo a passo (Pós-venda, Follow-up, Lead novo, Cliente sumido)', () => {
  assert.deepStrictEqual(plain(E.WIZARDS.map((w) => w.key)), ['posvenda', 'followup', 'lead', 'sumido']);
});
test('Pós-venda: venda registrada → 7 dias depois (corridos) → manda; opcional colocar etiqueta', () => {
  const [a] = plain(E.wizardToAutomations('posvenda', { name: 'Avaliação', trigger: { source: 'crm', id: '' }, amount: 7, unit: 'dias', itemId: I1, moveTo: LX }, { settings: SETTINGS }));
  assert.deepStrictEqual([a.trigger_type, a.trigger_label_id, a.wait_minutes, a.active], ['venda_registrada', null, 7 * 1440, false]);
  assert.deepStrictEqual(a.actions, [{ type: 'enviar', item_id: I1, variants: [] }, { type: 'adicionar_etiqueta', label_id: LX }]);
  assert.strictEqual(E.wizardSentence('posvenda', { trigger: { source: 'crm', id: '' }, amount: 7, unit: 'dias', itemId: I1, moveTo: LX }, names),
    'Quando uma venda for registrada pela conversa, 7 dias depois manda “Msg 1” e coloca em “Cliente”.');
});
test('Follow-up em 3 etapas: uma automação por etapa, sem resposta em 1 dia útil, move para a próxima; a última sai da etiqueta', () => {
  const w = { name: 'Follow', trigger: { source: 'crm', id: L1 }, amount: 1, unit: 'dias', stages: [{ itemId: I1, labelId: L1 }, { itemId: I2, labelId: L2 }, { itemId: I3, labelId: L3 }] };
  const list = plain(E.wizardToAutomations('followup', w, { settings: SETTINGS }));
  assert.deepStrictEqual(list.map((a) => [a.name, a.trigger_type, a.trigger_label_id, a.wait_minutes]), [
    ['Follow · etapa 1', 'sem_resposta', L1, 600], ['Follow · etapa 2', 'sem_resposta', L2, 600], ['Follow · etapa 3', 'sem_resposta', L3, 600]]);
  assert.deepStrictEqual(list.map((a) => a.actions), [
    [{ type: 'enviar', item_id: I1, variants: [] }, { type: 'mover', label_id: L2 }],
    [{ type: 'enviar', item_id: I2, variants: [] }, { type: 'mover', label_id: L3 }],
    [{ type: 'enviar', item_id: I3, variants: [] }, { type: 'remover_etiqueta', label_id: L3 }]]);
  assert.match(E.wizardSentence('followup', w, names), /^Quem está em “Follow Up 1” e não responde em 1 dia útil recebe “Msg 1” e vai para “Follow Up 2”; .* recebe “Msg 3” e sai do follow-up\. Se o cliente responder, para\.$/);
});
test('Follow-up: no fim, mover para a etiqueta escolhida; no máximo 4 etapas', () => {
  const st = (k) => ({ itemId: I1, labelId: `${k}`.padStart(8, '0') + '-0000-4000-8000-000000000000' });
  const list = plain(E.wizardToAutomations('followup', { trigger: { source: 'crm', id: st(1).labelId }, amount: 2, unit: 'horas', moveTo: LX, stages: [st(1), st(2), st(3), st(4), st(5)] }, { settings: SETTINGS }));
  assert.strictEqual(list.length, 4);
  assert.strictEqual(list[0].wait_minutes, 120);
  assert.deepStrictEqual(list[3].actions[1], { type: 'mover', label_id: LX });
});
test('Lead novo sem resposta: etiqueta do WhatsApp, 3 horas sem responder → manda', () => {
  const [a] = plain(E.wizardToAutomations('lead', { trigger: { source: 'whatsapp', id: '7' }, amount: 3, unit: 'horas', itemId: I1 }, { settings: SETTINGS }));
  assert.deepStrictEqual([a.trigger_type, a.trigger_label_source, a.trigger_wa_label_id, a.trigger_label_id, a.wait_minutes], ['sem_resposta', 'whatsapp', '7', null, 180]);
  assert.deepStrictEqual(a.actions, [{ type: 'enviar', item_id: I1, variants: [] }]);
  assert.match(E.wizardSentence('lead', { trigger: { source: 'whatsapp', id: '7' }, amount: 3, unit: 'horas', itemId: I1 }, names), /^Lead em “Novo cliente” \(etiqueta do WhatsApp\) que não respondeu à sua mensagem em 3 horas recebe “Msg 1”/);
});
test('Cliente sumido: 15 dias úteis sem responder, com etiqueta → manda e move; não ignora a conversa antes do tempo', () => {
  const [a] = plain(E.wizardToAutomations('sumido', { trigger: { source: 'crm', id: LX }, amount: 15, unit: 'dias', itemId: I1, moveTo: L2 }, { settings: SETTINGS }));
  assert.deepStrictEqual([a.trigger_type, a.trigger_label_id, a.wait_minutes], ['sem_resposta', LX, 15 * 600]);
  assert.ok(a.ignore_older_days > 15, `ignore_older_days ${a.ignore_older_days}`);
  assert.deepStrictEqual(a.actions, [{ type: 'enviar', item_id: I1, variants: [] }, { type: 'mover', label_id: L2 }]);
});
test('modo teste: a automação gerada vai com a conversa de teste', () => {
  const [a] = plain(E.wizardToAutomations('lead', { trigger: { source: 'crm', id: LX }, amount: 1, unit: 'horas', itemId: I1, testChatId: '5511999999999@c.us' }, { settings: SETTINGS }));
  assert.strictEqual(a.test_chat_id, '5511999999999@c.us');
});

// ── validação ──
const base = () => ({ name: 'X', trigger_type: 'entrou_etiqueta', trigger_label_source: 'crm', trigger_label_id: L1, wait_minutes: 60, conditions: [], actions: [{ type: 'enviar', item_id: I1, variants: [] }] });
test('validação: tudo certo → nenhum problema', () => assert.deepStrictEqual(plain(E.validateAutomationDraft(base())), []));
test('validação: "Adicionar etiqueta" sem etiqueta → aponta a ação', () => {
  const a = { ...base(), actions: [{ type: 'enviar', item_id: I1, variants: [] }, { type: 'adicionar_etiqueta', label_id: '' }] };
  assert.deepStrictEqual(plain(E.validateAutomationDraft(a)), [{ where: 'action:1', msg: 'Ação 2: escolha a etiqueta.' }]);
});
test('validação: nome, etiqueta do gatilho, tempo, mensagem, variante, condição e teste — cada um no seu lugar', () => {
  const a = { name: '', trigger_type: 'sem_resposta', trigger_label_source: 'crm', trigger_label_id: '', wait_minutes: 0,
    conditions: [{ type: 'tem_etiqueta', label_id: '' }], actions: [{ type: 'enviar', item_id: '', variants: [{ when: 'anuncio', keyword: '', item_id: I1 }] }, { type: 'mover', label_id: L1 }] };
  const w = plain(E.validateAutomationDraft({ ...a, trigger_label_id: L1, test_chat_id: null }, { testOn: true })).map((x) => x.where);
  assert.deepStrictEqual(w, ['name', 'wait', 'test', 'cond:0', 'variant:0:0', 'action:1']); // mover para a própria etiqueta do gatilho
  assert.ok(plain(E.validateAutomationDraft(a)).some((x) => x.where === 'trigger'));
  assert.ok(plain(E.validateAutomationDraft({ ...base(), actions: [{ type: 'enviar', item_id: '', variants: [] }] })).some((x) => x.where === 'action:0' && /crie uma aqui/.test(x.msg)));
});
test('validação: dia e hora sem dias/hora; WhatsApp sem etiqueta; venda sem etiqueta não pode "mover"', () => {
  assert.deepStrictEqual(plain(E.validateAutomationDraft({ ...base(), trigger_type: 'dia_hora', schedule_days: [], schedule_time: '' })).map((x) => x.where), ['days', 'time']);
  assert.deepStrictEqual(plain(E.validateAutomationDraft({ ...base(), actions: [{ type: 'adicionar_etiqueta_wa', wa_label_id: '' }] })).map((x) => x.where), ['action:0']);
  assert.deepStrictEqual(plain(E.validateAutomationDraft({ ...base(), trigger_type: 'venda_registrada', trigger_label_id: null, actions: [{ type: 'mover', label_id: L2 }] })).map((x) => x.where), ['action:0']);
});
test('as automações geradas pelos 4 modelos passam na validação do editor', () => {
  const ws = {
    posvenda: { trigger: { source: 'crm', id: '' }, amount: 7, unit: 'dias', itemId: I1 },
    followup: { trigger: { source: 'crm', id: L1 }, amount: 1, unit: 'dias', stages: [{ itemId: I1, labelId: L1 }, { itemId: I2, labelId: L2 }] },
    lead: { trigger: { source: 'whatsapp', id: '7' }, amount: 3, unit: 'horas', itemId: I1 },
    sumido: { trigger: { source: 'crm', id: LX }, amount: 15, unit: 'dias', itemId: I1 },
  };
  for (const [k, w] of Object.entries(ws)) for (const a of E.wizardToAutomations(k, { name: k, ...w }, { settings: SETTINGS })) assert.deepStrictEqual(plain(E.validateAutomationDraft(a)), [], `${k}: ${a.name}`);
});

// ── "X dias depois da venda" ──
test('venda registrada com espera: aguarda até X dias depois da venda, depois roda (uma vez por venda)', () => {
  const sale = '2026-11-01T12:00:00.000Z';
  const a = { id: 'A', active: true, trigger_type: 'venda_registrada', trigger_label_id: null, wait_minutes: 7 * 1440, conditions: [], actions: [{ type: 'enviar', item_id: I1, variants: [] }], activated_at: '2026-10-01T00:00:00Z' };
  const contact = { id: 'C', chat_id: '5511999999999@c.us', labelIds: [], sale_id: 'S', sale_at: sale };
  const chat = { loaded: true, last: { t: Date.parse(sale) / 1000, fromMe: true } };
  const ev1 = E.evaluateAutomation({ automation: a, contact, chat, settings: SETTINGS, now: Date.parse(sale) + 3 * 86400000, ranKeys: new Set() });
  assert.strictEqual(ev1.action, 'wait');
  assert.strictEqual(ev1.dueAt, Date.parse(sale) + 7 * 86400000);
  const ev2 = E.evaluateAutomation({ automation: a, contact, chat, settings: SETTINGS, now: Date.parse(sale) + 7 * 86400000 + 1000, ranKeys: new Set() });
  assert.deepStrictEqual([ev2.action, ev2.runKey], ['run', 'venda@S']);
  const ev3 = E.evaluateAutomation({ automation: { ...a, wait_minutes: null }, contact, chat, settings: SETTINGS, now: Date.parse(sale) + 1000, ranKeys: new Set() });
  assert.strictEqual(ev3.action, 'run'); // sem espera: na hora, como antes
  assert.match(E.automationSummary(a).quando, /^Quando uma venda for registrada pela conversa, 7 dias depois/);
});

// ── supabase-api.js: as geradas passam na validação do servidor ──
function api() {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: () => '*/0' } });
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(url.replace('https://x.supabase.co/rest/v1/', ''));
    const method = init.method || 'GET';
    calls.push({ method, path: p, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'POST' && p === 'wa_automations') return res(201, [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
    return res(200, []);
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('supabase-api.js'), ctx);
  return { a: ctx.WaApi, calls };
}
test('servidor: as automações dos 4 modelos salvam (inclusive "7 dias depois da venda")', async () => {
  const { a, calls } = api();
  const gen = [
    ...E.wizardToAutomations('posvenda', { name: 'Pós', trigger: { source: 'crm', id: '' }, amount: 7, unit: 'dias', itemId: I1 }, { settings: SETTINGS }),
    ...E.wizardToAutomations('followup', { name: 'F', trigger: { source: 'crm', id: L1 }, amount: 1, unit: 'dias', stages: [{ itemId: I1, labelId: L1 }, { itemId: I2, labelId: L2 }] }, { settings: SETTINGS }),
    ...E.wizardToAutomations('lead', { name: 'L', trigger: { source: 'whatsapp', id: '7' }, amount: 3, unit: 'horas', itemId: I1 }, { settings: SETTINGS }),
    ...E.wizardToAutomations('sumido', { name: 'S', trigger: { source: 'crm', id: LX }, amount: 15, unit: 'dias', itemId: I1 }, { settings: SETTINGS }),
  ];
  for (const x of gen) await a.saveAutomation({ automation: plain(x) });
  const posts = calls.filter((c) => c.method === 'POST' && c.path === 'wa_automations').map((c) => c.body);
  assert.strictEqual(posts.length, 5);
  assert.deepStrictEqual([posts[0].trigger_type, posts[0].wait_minutes], ['venda_registrada', 10080]);
  assert.deepStrictEqual(posts.map((p) => p.active), [false, false, false, false, false]);
});
test('servidor: venda registrada sem espera continua igual (wait_minutes nulo)', async () => {
  const { a, calls } = api();
  await a.saveAutomation({ automation: { name: 'V', trigger_type: 'venda_registrada', trigger_label_id: null, conditions: [], actions: [{ type: 'enviar', item_id: I1, variants: [] }] } });
  assert.strictEqual(calls.find((c) => c.method === 'POST' && c.path === 'wa_automations').body.wait_minutes, null);
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
