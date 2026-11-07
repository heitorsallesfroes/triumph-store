// Testes da 2.12.6 (ligar/desligar mais simples). node extension/tests/activation.test.cjs
// - engine.js: activationSentence (a frase da confirmação)
// - content.js: o editor não tem mais a caixa "Ativa" nem o quadro Segurança; os botões certos em cada estado; a lista
//   tem o interruptor; "Ligar para todos" religa (o "daqui pra frente" recomeça)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8').replace(/\r\n/g, '\n');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math, Promise });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;

test('frase da confirmação: etiqueta e quantos ficam de fora (singular/plural/ninguém)', () => {
  assert.strictEqual(E.activationSentence({ name: 'Pedido de avaliação', label: 'CLIENTE - TESTE', kind: 'etiqueta', n: 16 }),
    "Ligar 'Pedido de avaliação'? Vale só para quem entrar na etiqueta CLIENTE - TESTE a partir de agora. 16 contatos que já estão nela não vão receber.");
  assert.strictEqual(E.activationSentence({ name: 'X', label: 'L', kind: 'etiqueta', n: 1 }), "Ligar 'X'? Vale só para quem entrar na etiqueta L a partir de agora. 1 contato que já está nela não vai receber.");
  assert.strictEqual(E.activationSentence({ name: 'X', label: 'L', kind: 'etiqueta', n: 0 }), "Ligar 'X'? Vale só para quem entrar na etiqueta L a partir de agora. Ninguém está nela agora.");
  assert.strictEqual(E.activationSentence({ name: 'X', label: 'L', kind: 'etiqueta', n: null }), "Ligar 'X'? Vale só para quem entrar na etiqueta L a partir de agora.");
});
test('frase da confirmação: dia e hora, venda registrada e sequência sem etiqueta', () => {
  assert.strictEqual(E.activationSentence({ name: 'A', label: null, kind: 'dia_hora', n: null }), "Ligar 'A'? Vale a partir do próximo dia e hora.");
  assert.strictEqual(E.activationSentence({ name: 'A', label: null, kind: 'venda', n: null }), "Ligar 'A'? Só as vendas registradas a partir de agora disparam.");
  assert.strictEqual(E.activationSentence({ name: 'A', label: null, kind: 'outro', n: 3 }), "Ligar 'A'? Vale só para quem entrar a partir de agora.");
});
test('editor: sem a caixa "Ativa" e sem o quadro Segurança; os botões de cada estado; a linha de segurança', () => {
  const c = src('content.js');
  const ed = c.slice(c.indexOf('  function renderAutomationEditor() {'), c.indexOf('  // ── Limites e horário ──'));
  assert.ok(!/act\.append\(cb, 'Ativa'\)/.test(ed), 'a caixa "Ativa" saiu');
  assert.ok(!/'SEGURANÇA'/.test(ed) && !/function automationSafetyEl/.test(c), 'o quadro Segurança saiu');
  ['Salvar desligada', 'Salvar e ligar', 'Testar comigo', 'Salvar e desligar', 'Ligar para todos', 'Só vale para quem entrar depois de ligar. Nunca envia para "Não enviar".']
    .forEach((t) => assert.ok(ed.includes(t), t));
  assert.ok(/'bbtn primary fw-save-on', 'Salvar e ligar'/.test(ed) && /'bbtn fw-save-off'/.test(ed), 'laranja e cinza');
  // "Ligar para todos" religa (setAutomationActive) para o "daqui pra frente" recomeçar
  assert.ok(/if \(mode === 'todos'\) await call\('setAutomationActive'/.test(ed));
});
test('lista: interruptor (role=switch) liga com a confirmação e desliga na hora; sem o botão "Ligar"/"Desligar"', () => {
  const c = src('content.js');
  const card = c.slice(c.indexOf('  function automationCard(a) {'), c.indexOf('  // ── 2.8.8: ativar = vale daqui pra frente ──'));
  assert.ok(/'fw-switch'/.test(card) && /setAttribute\('role', 'switch'\)/.test(card) && /toggleAutomation\(a\)/.test(card));
  assert.ok(!/fbtn\('ed-mini', a\.active \? 'Desligar' : 'Ligar'/.test(card));
  assert.ok(/'EM TESTE'/.test(card));
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
