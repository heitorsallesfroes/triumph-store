// Testes da 2.16.11 (Quadro: nome salvo na agenda em vez do número). Sem dependências: node extension/tests/boardnames.test.cjs
// - wa-bridge.js com WA-JS falsa: labelChats traz o nome da agenda, o do perfil (pushname) e o telefone SÓ do que está
//   na memória (ContactStore + lidPnCache), também pelo outro lado (@lid ↔ @c.us); nunca consulta o servidor
// - contactNames (cartões do CRM): pelo telefone; sem nome na memória fica de fora, sem erro
// - content.js: ordem do título (agenda > CRM/título > ~pushname > número) e o número embaixo quando é nome
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const LABEL = '1';
const A = '5521979762603'; // salvo na agenda como "Maria da Agenda"
const B = '5521911112222'; // @lid, salvo na agenda só do lado @c.us
const B_LID = '80685306003593@lid';
const C = '5521933334444'; // sem agenda, com pushname
const D = '5521955556666'; // nada na memória

function bridge() {
  let queried = 0;
  const contacts = {
    [`${A}@c.us`]: { name: 'Maria da Agenda', pushname: 'Mari' },
    [`${B}@c.us`]: { name: 'João Agenda', pushname: null },
    [B_LID]: { name: undefined, pushname: 'Jão' },
    [`${C}@c.us`]: { name: undefined, pushname: 'Zé Perfil' },
    [`${D}@c.us`]: { name: '+55 21 95555-6666', pushname: undefined },
  };
  const W = {
    WidFactory: { createWid: (id) => ({ _serialized: id, toString: () => id }) },
    lidPnCache: {
      getCurrentLid: (w) => (w._serialized === `${B}@c.us` ? { _serialized: B_LID } : null),
      getPhoneNumber: (w) => (w._serialized === B_LID ? { _serialized: `${B}@c.us` } : null),
    },
    ApiContact: { getCurrentLid: () => null },
    ContactStore: { get: (w) => contacts[typeof w === 'string' ? w : w && w._serialized] || null },
  };
  const chat = (id, title) => ({ id: { _serialized: id }, labels: [LABEL], formattedTitle: title, t: 100, contact: null });
  const chats = [chat(`${A}@c.us`, 'Maria da Agenda'), chat(B_LID, '+55 21 91111-2222'), chat(`${C}@c.us`, '+55 21 93333-4444'), chat(`${D}@c.us`, '+55 21 95555-6666'),
    { id: { _serialized: '123@g.us' }, isGroup: true, labels: [LABEL], formattedTitle: 'Grupo da Loja', t: 99 }];
  const wpp = {
    isReady: true, isFullReady: true, webpack: { isReady: true, isFullReady: true }, whatsapp: W,
    on: () => {},
    chat: { list: async () => chats, get: (id) => chats.find((c) => c.id._serialized === id) || null },
    labels: { getAllLabels: async () => [{ id: LABEL, name: 'Analisar', count: 5 }] },
    contact: { getPnLidEntry: async () => { queried++; return null; }, queryExists: async () => { queried++; return null; }, get: async () => { queried++; return null; } },
  };
  let listener = null;
  const replies = [];
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' },
    addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
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
  return { request, queried: () => queried };
}

test('ponte labelChats: agenda, perfil e telefone só da memória (também @lid → agenda do @c.us); grupo sem nada disso; sem servidor', async () => {
  const b = bridge();
  const r = await b.request('labelChats', { labelId: LABEL });
  assert.ok(r.ok, JSON.stringify(r));
  const by = Object.fromEntries(JSON.parse(JSON.stringify(r.data.chats)).map((c) => [c.id, c]));
  const pick = (c) => [c.contactName, c.pushname, c.phone];
  assert.deepStrictEqual(pick(by[`${A}@c.us`]), ['Maria da Agenda', 'Mari', A]);
  assert.deepStrictEqual(pick(by[B_LID]), ['João Agenda', 'Jão', B]);
  assert.deepStrictEqual(pick(by[`${C}@c.us`]), [null, 'Zé Perfil', C]);
  assert.deepStrictEqual(pick(by[`${D}@c.us`]), [null, null, D], 'número salvo como nome não conta como nome');
  assert.strictEqual(by['123@g.us'].contactName, undefined);
  assert.strictEqual(by['123@g.us'].name, 'Grupo da Loja');
  assert.strictEqual(b.queried(), 0, 'nada de consulta ao servidor (getPnLidEntry/queryExists)');
});

test('ponte contactNames (CRM): pelo telefone; sem nome na memória fica de fora; lixo é ignorado', async () => {
  const b = bridge();
  const r = await b.request('contactNames', { ids: [A, B, C, D, 'abc', '', null] });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.data.names)), {
    [A]: { contactName: 'Maria da Agenda', pushname: 'Mari' },
    [B]: { contactName: 'João Agenda', pushname: 'Jão' },
    [C]: { contactName: null, pushname: 'Zé Perfil' },
  });
  const bad = await b.request('contactNames', {});
  assert.ok(!bad.ok);
  assert.strictEqual(b.queried(), 0);
});

// boardCardTitle do content.js de verdade
function titleFn() {
  const c = src('content.js');
  const a = c.indexOf('  const isNameText = ');
  const z = c.indexOf('  // 2.16.11: nomes da agenda/perfil dos contatos do CRM');
  assert.ok(a > 0 && z > a);
  const ctx = vm.createContext({});
  const fp = c.slice(c.indexOf('  function formatPhone(digits) {'), c.indexOf('  // "Esta conversa"'));
  vm.runInContext(`${fp}\n${c.slice(a, z)}\nthis.T = boardCardTitle;`, ctx);
  return (x) => JSON.parse(JSON.stringify(ctx.T(x)));
}

test('título: agenda > CRM > ~pushname > número; número pequeno embaixo só quando é nome', () => {
  const T = titleFn();
  // CRM
  assert.deepStrictEqual(T({ crm: true, name: 'Nome CRM', phone: A, contactName: 'Maria da Agenda', pushname: 'Mari' }), { title: 'Maria da Agenda', phoneLine: '+55 (21) 97976-2603' });
  assert.deepStrictEqual(T({ crm: true, name: 'Nome CRM', phone: A, pushname: 'Mari' }), { title: 'Nome CRM', phoneLine: '+55 (21) 97976-2603' });
  assert.deepStrictEqual(T({ crm: true, name: null, phone: A, pushname: 'Mari' }), { title: '~Mari', phoneLine: '+55 (21) 97976-2603' });
  assert.deepStrictEqual(T({ crm: true, name: null, phone: A }), { title: '+55 (21) 97976-2603', phoneLine: '' });
  assert.deepStrictEqual(T({ crm: true, name: 'Só Nome', phone: null }), { title: 'Só Nome', phoneLine: '' });
  // WhatsApp (name = título da conversa: o número quando não está na agenda)
  assert.deepStrictEqual(T({ name: '+55 21 97976-2603', phone: A, contactName: 'Maria da Agenda' }), { title: 'Maria da Agenda', phoneLine: '+55 (21) 97976-2603' });
  assert.deepStrictEqual(T({ name: '+55 21 97976-2603', phone: A, pushname: 'Zé' }), { title: '~Zé', phoneLine: '+55 (21) 97976-2603' });
  assert.deepStrictEqual(T({ name: 'Zé', phone: A, pushname: 'Zé' }), { title: '~Zé', phoneLine: '+55 (21) 97976-2603' }, 'título igual ao perfil vira ~perfil');
  assert.deepStrictEqual(T({ name: '+55 21 97976-2603', phone: A }), { title: '+55 (21) 97976-2603', phoneLine: '' });
  assert.deepStrictEqual(T({ name: 'Grupo da Loja', kind: 'grupo' }), { title: 'Grupo da Loja', phoneLine: '' });
  assert.deepStrictEqual(T({ name: '' }), { title: '—', phoneLine: '' });
});

test('content.js: CRM pede contactNames com timeout e sem erro; encolhido usa o mesmo cartão; manifesto 2.16.11', () => {
  const c = src('content.js');
  assert.ok(/waRequest\('contactNames', \{ ids \}, \{ timeout: 4000 \}\); \} catch \{ return; \}/.test(c));
  assert.ok(/await addCrmWaNames\(got\);[\s\S]{0,120}if \(stale\(\)\) return;/.test(c));
  assert.strictEqual((c.match(/= boardCardTitle\(c\)/g) || []).length, 2, 'WhatsApp e CRM');
  assert.ok(/^2\.(16\.(1[1-9])|(1[7-9]|[2-9]\d)\.\d+)$/.test(JSON.parse(src('manifest.json')).version), 'manifesto 2.16.11 ou depois');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed++; console.log(`FAIL ${name}\n     ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n     ') : err}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
