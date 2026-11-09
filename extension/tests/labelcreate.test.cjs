// Testes da 2.13.4 ("+ Nova etiqueta…" em qualquer lista): node extension/tests/labelcreate.test.cjs
// O fluxo de verdade (criar CRM, repetido, WhatsApp, salvar) está no Chrome real (seção 17). Aqui: todas as listas
// passam pela MESMA função, e a ponte só cria etiqueta do WhatsApp com a função da WA-JS e no WhatsApp Business.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const c = src('content.js');
const b = src('wa-bridge.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const body = (s, start) => { const i = s.indexOf(start); assert.ok(i >= 0, start); return s.slice(i, s.indexOf('\n  }\n', i)); };

test('uma função só (withLabelCreate) em todas as listas de etiqueta: CRM, WhatsApp, gatilho misto e as da venda 💰', () => {
  assert.strictEqual((c.match(/function withLabelCreate\(/g) || []).length, 1);
  assert.match(body(c, '  function labelSelect('), /return create \? withLabelCreate\(sel, \{ kinds: \['crm'\] \}\) : sel;/);
  assert.match(body(c, '  function waLabelSelect('), /withLabelCreate\(sel, \{ kinds: \['wa'\] \}\)/);
  assert.match(body(c, '  function triggerPicker('), /withLabelCreate\(sel, \{ kinds: v25 && waList\.length \? \['crm', 'wa'\] : \['crm'\], waPrefix: 'wa:' \}\)/);
  assert.match(c, /schedField\('Etiqueta CRM ao registrar', withLabelCreate\(selectOf\(/);
  assert.match(c, /schedField\('Etiqueta do WhatsApp ao registrar', lcWaSel\(selectOf\(/);
  assert.match(c, /schedField\('Tirar das etiquetas do WhatsApp', lcWaSel\(selectOf\(/);
  // editor de mensagem rápida, disparos, automações antigas, filtros e construtor usam labelSelect/labelPicker/waLabelSelect
  ['Ao enviar, colocar na etiqueta CRM', 'Ao enviar, colocar na etiqueta do WhatsApp', 'Etiqueta CRM do disparo'].forEach((a) => assert.ok(c.includes(a), a));
});
test('a opção nunca chega a quem usa a lista: volta ao valor de antes e para o "change"; criada, dispara o "change" com a nova', () => {
  const w = body(c, '  function withLabelCreate(');
  assert.match(w, /sel\.prepend\(\.\.\.opts\)/);
  assert.match(w, /e\.stopImmediatePropagation\(\)/);
  assert.match(w, /sel\.value = prev;/);
  assert.match(body(c, '  function lcPick('), /sel\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  const f = body(c, '  function lcOpenForm(');
  assert.match(f, /Já existe a etiqueta/);
  assert.match(f, /waRequest\('labelCreate'/);
  assert.match(f, /call\('createLabel'/);
});
test('ponte: cria só com labels.addNewLabel, só no WhatsApp Business, e diz por quê quando não dá', () => {
  assert.match(b, /typeof wpp\.labels\.addNewLabel !== 'function'\) return \{ available: false, reason: 'no_function' \}/);
  assert.match(b, /businessAccount\(\) === false\) return \{ available: false, reason: 'not_business' \}/);
  assert.match(b, /labelCreate: \(payload\) => labelCreate\(payload\)/);
  assert.match(b, /labelColors: \(\) => labelColors\(\)/);
  assert.match(c, /'só no WhatsApp Business'/);
  // a WA-JS empacotada (4.7.2) tem a função
  const v = src('vendor/wppconnect-wa.js');
  assert.ok(v.includes('t.addNewLabel=async function'));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
