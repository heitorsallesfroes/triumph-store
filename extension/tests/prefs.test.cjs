// Testes da 2.10.2 (painel personalizável: regras das preferências em engine.js). node extension/tests/prefs.test.cjs
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

test('padrão: Mídias, Etiquetas, Vendas e Conversões na barra; filtros Tudo + 5; tudo aberto; confortável', () => {
  const d = plain(E.defaultPanelPrefs());
  assert.deepStrictEqual(Object.keys(d.tabs).filter((k) => d.tabs[k]), ['midias', 'etiquetas', 'vendas', 'conversoes']);
  assert.deepStrictEqual(d.filters, ['mais_usadas', 'texto', 'audio', 'imagem', 'video']);
  assert.deepStrictEqual(d.convBtns, { venda: true, compra: true, automacao: true });
  assert.strictEqual(d.density, 'confortavel');
  assert.ok(Object.values(d.collapsed).every((v) => v === false));
  assert.strictEqual(d.topH, null);
});
test('o que vem do storage é limpo: lixo some, faltando vira padrão, filtros na ordem dos chips', () => {
  const p = plain(E.normPanelPrefs({ tabs: { midias: false, quadro: true, mensagens: false, hack: true }, filters: ['pix', 'texto', 'texto', 'tudo', 'xxx'], convBtns: { venda: 'sim', compra: false }, density: 'gigante', collapsed: { conv: true, outro: true }, topH: '150', extra: 1 }));
  assert.deepStrictEqual(p.tabs, { midias: false, etiquetas: true, vendas: true, conversoes: true, quadro: true, agendados: false, disparos: false, follows: false });
  assert.deepStrictEqual(p.filters, ['texto', 'pix']); // Tudo nunca entra (sempre aparece)
  assert.deepStrictEqual(p.convBtns, { venda: true, compra: false, automacao: true });
  assert.strictEqual(p.density, 'confortavel');
  assert.deepStrictEqual(p.collapsed, { conv: true, etiquetas: false, nome: false, busca: false });
  assert.strictEqual(p.topH, 150);
  assert.strictEqual(p.extra, undefined);
});
test('storage vazio ou quebrado → padrão', () => {
  assert.deepStrictEqual(plain(E.normPanelPrefs(null)), plain(E.defaultPanelPrefs()));
  assert.deepStrictEqual(plain(E.normPanelPrefs('x')), plain(E.defaultPanelPrefs()));
  assert.strictEqual(E.normPanelPrefs({ topH: 'abc' }).topH, null);
  assert.strictEqual(E.normPanelPrefs({ topH: 5 }).topH, 48);
  assert.strictEqual(E.normPanelPrefs({ density: 'compacta' }).density, 'compacta');
});
test('altura do topo ao arrastar: mínimo 48 px e sobra ~160 px para a lista', () => {
  assert.strictEqual(E.clampTopH(10, 800), 48);
  assert.strictEqual(E.clampTopH(300, 800), 300);
  assert.strictEqual(E.clampTopH(900, 800), 640);
  assert.strictEqual(E.clampTopH(300, 100), 48);
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
