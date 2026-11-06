// Testes da 2.10.4 (prévia: tirar partes só deste envio — regras em engine.js). node extension/tests/preview.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const PARTS = [
  { id: 'p1', type: 'audio', file_url: 'https://x/a.ogg', file_name: 'a.ogg', wait_seconds: 2, typing_seconds: 5 },
  { id: 'p2', type: 'texto', body: 'Oi {nome}!', wait_seconds: 3, typing_seconds: 4 },
  { id: 'p3', type: 'imagem', body: 'Fotos', wait_seconds: 1, typing_seconds: 2, file_url: 'https://x/1.jpg', file_name: '1.jpg',
    files: [{ kind: 'imagem', file_url: 'https://x/1.jpg', file_name: '1.jpg', caption_before: true }, { kind: 'video', file_url: 'https://x/2.mp4', file_name: '2.mp4' }, { kind: 'imagem', file_url: 'https://x/3.jpg', file_name: '3.jpg' }] },
];

test('nada tirado: vai tudo, tempo total = esperar + digitando de todas', () => {
  const p = plain(E.previewSendPlan(PARTS));
  assert.strictEqual(p.parts.length, 3);
  assert.strictEqual(p.seconds, 17);
  assert.strictEqual(p.empty, false);
});
test('tirar a 1ª parte (áudio): sai só ela e o tempo dela não conta', () => {
  const p = plain(E.previewSendPlan(PARTS, [0]));
  assert.deepStrictEqual(p.parts.map((x) => x.id), ['p2', 'p3']);
  assert.strictEqual(p.seconds, 10);
});
test('desfazer: tirar e devolver dá o mesmo envio de antes', () => {
  assert.deepStrictEqual(plain(E.previewSendPlan(PARTS, [])), plain(E.previewSendPlan(PARTS)));
});
test('tirar todas: nada para enviar', () => {
  const p = plain(E.previewSendPlan(PARTS, [0, 1, 2]));
  assert.deepStrictEqual([p.parts.length, p.seconds, p.empty], [0, 0, true]);
});
test('a mensagem salva não muda (as partes de entrada continuam iguais)', () => {
  const before = JSON.stringify(PARTS);
  E.previewSendPlan(PARTS, [0], { 2: [0, 1] });
  assert.strictEqual(JSON.stringify(PARTS), before);
});
test('álbum: tirar uma foto deixa as outras (a legenda continua antes das fotos)', () => {
  const p = plain(E.previewSendPlan(PARTS, [], { 2: [1] })).parts[2];
  assert.deepStrictEqual(p.files.map((f) => f.file_name), ['1.jpg', '3.jpg']);
  assert.strictEqual(p.files[0].caption_before, true);
  const q = plain(E.previewSendPlan(PARTS, [], { 2: [0] })).parts[2]; // tirou a 1ª: a "antes das fotos" passa para a nova 1ª
  assert.deepStrictEqual(q.files.map((f) => f.file_name), ['2.mp4', '3.jpg']);
  assert.strictEqual(q.files[0].caption_before, true);
  assert.strictEqual(q.file_url, 'https://x/2.mp4');
});
test('álbum: sobrou 1 foto → vira imagem/vídeo normal com a legenda; sobrou 0 → a parte sai', () => {
  const one = plain(E.previewSendPlan(PARTS, [], { 2: [0, 2] })).parts[2];
  assert.deepStrictEqual([one.type, one.file_url, one.files, one.body], ['video', 'https://x/2.mp4', undefined, 'Fotos']);
  const none = plain(E.previewSendPlan(PARTS, [], { 2: [0, 1, 2] }));
  assert.deepStrictEqual(none.parts.map((x) => x.id), ['p1', 'p2']);
});
test('etiquetas "Ao enviar": valem quando as partes escolhidas saíram (pelo menos uma); não valem com falha ou nada enviado', () => {
  assert.strictEqual(E.sendLabelsApply({ status: 'ok', sent: 1 }), true);
  assert.strictEqual(E.sendLabelsApply({ status: 'ok', sent: 2 }), true);
  assert.strictEqual(E.sendLabelsApply({ status: 'ok', sent: 0 }), false);
  assert.strictEqual(E.sendLabelsApply({ status: 'failed', sent: 1 }), false);
  assert.strictEqual(E.sendLabelsApply({ status: 'stopped', sent: 1 }), false);
  assert.strictEqual(E.sendLabelsApply(null), false);
});
test('"digitando" vazio (áudio automático) não soma tempo', () => {
  assert.strictEqual(E.previewSendPlan([{ type: 'audio', wait_seconds: 2, typing_seconds: null }]).seconds, 2);
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
