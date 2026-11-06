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
  assert.deepStrictEqual(d.convBtns, { venda: true, compra: true, automacao: true, proxima: true });
  assert.strictEqual(d.keepListPos, true); // 2.10.3: ligado por padrão
  assert.strictEqual(d.density, 'confortavel');
  assert.ok(Object.values(d.collapsed).every((v) => v === false));
  assert.strictEqual(d.topH, null);
});
test('o que vem do storage é limpo: lixo some, faltando vira padrão, filtros na ordem dos chips', () => {
  const p = plain(E.normPanelPrefs({ tabs: { midias: false, quadro: true, mensagens: false, hack: true }, filters: ['pix', 'texto', 'texto', 'tudo', 'xxx'], convBtns: { venda: 'sim', compra: false }, density: 'gigante', collapsed: { conv: true, outro: true }, topH: '150', extra: 1 }));
  assert.deepStrictEqual(p.tabs, { midias: false, etiquetas: true, vendas: true, conversoes: true, quadro: true, agendados: false, disparos: false, follows: false });
  assert.deepStrictEqual(p.filters, ['texto', 'pix']); // Tudo nunca entra (sempre aparece)
  assert.deepStrictEqual(p.convBtns, { venda: true, compra: false, automacao: true, proxima: true });
  assert.strictEqual(p.keepListPos, true);
  assert.strictEqual(E.normPanelPrefs({ keepListPos: false }).keepListPos, false);
  assert.strictEqual(E.normPanelPrefs({ keepListPos: 'nao' }).keepListPos, true);
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

// ── 2.10.3: manter a posição da lista de conversas ──
const base = { enabled: true, now: 10000, armAt: 9000, userAt: 5000, scrollTop: 0, saved: 1000, restores: 0 };
test('lista: pulou para o topo até 2 s depois do seu envio, sem você mexer → volta', () => {
  assert.strictEqual(E.listShouldRestore(base), true);
});
test('lista: não volta se desligado, depois de 2 s, sem envio, se você mexeu, se não pulou ou se não havia posição', () => {
  assert.strictEqual(E.listShouldRestore({ ...base, enabled: false }), false);
  assert.strictEqual(E.listShouldRestore({ ...base, now: 11001 }), false);
  assert.strictEqual(E.listShouldRestore({ ...base, armAt: 0 }), false);
  assert.strictEqual(E.listShouldRestore({ ...base, userAt: 9500 }), false); // rolou/clicou depois do envio
  assert.strictEqual(E.listShouldRestore({ ...base, scrollTop: 400 }), false);
  assert.strictEqual(E.listShouldRestore({ ...base, saved: null }), false);
  assert.strictEqual(E.listShouldRestore({ ...base, saved: 5 }), false); // já estava no topo
  assert.strictEqual(E.listShouldRestore({ ...base, restores: 3 }), false); // no máximo 3 vezes por envio
});
test('lista: volta para onde estava + 1 linha (as mesmas conversas continuam na tela), sem passar do fim', () => {
  assert.strictEqual(E.listRestoreTarget({ saved: 1000, rowH: 72, scrollHeight: 5000, clientHeight: 600 }), 1072);
  assert.strictEqual(E.listRestoreTarget({ saved: 4380, rowH: 72, scrollHeight: 5000, clientHeight: 600 }), 4400);
  assert.strictEqual(E.listRestoreTarget({ saved: 1000, rowH: 0, scrollHeight: 5000, clientHeight: 600 }), 1072); // linha desconhecida: 72 px
  assert.strictEqual(E.listRestoreTarget({ saved: 1000, rowH: 500, scrollHeight: 5000, clientHeight: 600 }), 1120); // no máximo 120 px
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
