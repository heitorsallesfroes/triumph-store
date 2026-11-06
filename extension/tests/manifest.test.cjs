// Testes da 2.10.1 (o painel não abria): node extension/tests/manifest.test.cjs
// - nenhum arquivo aparece em mais de uma entrada de content_scripts (o Chrome injeta o mesmo arquivo só uma vez
//   por página: o segundo mundo ficava sem ele)
// - rich-parts-iso.js (mundo isolado) é igual a rich-parts.js (mundo MAIN), fora o comentário do topo
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('manifest.json'));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('nenhum arquivo repetido entre as entradas de content_scripts', () => {
  const seen = new Map();
  const repeated = [];
  (manifest.content_scripts || []).forEach((cs, i) => {
    [...(cs.js || []), ...(cs.css || [])].forEach((f) => {
      if (seen.has(f)) repeated.push(`${f} (entradas ${seen.get(f) + 1} e ${i + 1})`);
      else seen.set(f, i);
    });
  });
  assert.deepStrictEqual(repeated, [], `arquivo em mais de um content_scripts: ${repeated.join(', ')}`);
});

test('todo arquivo dos content_scripts existe', () => {
  (manifest.content_scripts || []).forEach((cs) => (cs.js || []).forEach((f) => assert.ok(fs.existsSync(path.join(EXT, f)), `não existe: ${f}`)));
});

test('rich-parts.js no mundo MAIN e rich-parts-iso.js no isolado (antes de engine.js e content.js)', () => {
  const main = manifest.content_scripts.find((cs) => cs.world === 'MAIN' && (cs.js || []).includes('wa-bridge.js'));
  const iso = manifest.content_scripts.find((cs) => !cs.world && (cs.js || []).includes('content.js'));
  assert.ok(main && iso, 'entradas do MAIN (ponte) e do isolado (painel) não encontradas');
  assert.ok(main.js.indexOf('rich-parts.js') >= 0 && main.js.indexOf('rich-parts.js') < main.js.indexOf('wa-bridge.js'));
  const k = iso.js.indexOf('rich-parts-iso.js');
  assert.ok(k >= 0 && k < iso.js.indexOf('engine.js') && k < iso.js.indexOf('content.js'));
});

test('rich-parts-iso.js é idêntico a rich-parts.js (fora o comentário do topo)', () => {
  const iso = read('rich-parts-iso.js').split('\n');
  assert.match(iso[0], /^\/\/ cópia de rich-parts\.js para o mundo isolado/);
  assert.strictEqual(iso.slice(1).join('\n'), read('rich-parts.js'), 'rich-parts-iso.js está diferente de rich-parts.js: copie de novo');
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
