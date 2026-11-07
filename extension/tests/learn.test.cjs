// Testes da 2.12.1: nome aprendido que não se perde, 3 tentativas com o motivo real do erro e as preferências dos
// atalhos no cabeçalho. node extension/tests/learn.test.cjs
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
const CHAT = '36369816625228@lid'; // "Meu Numero Pessoal"
const noSleep = { sleep: async () => {} };

test('as duas frases exatas ensinam "Heitor" (a pontuação "!!" e o "Bommm" não atrapalham)', () => {
  assert.strictEqual(E.learnNameFrom('Olá, Heitor!! Tudo bem?'), 'Heitor');
  assert.strictEqual(E.learnNameFrom('Bommm dia, Heitor!! Tduo bem?'), 'Heitor');
});
test('o caso de 07/11: a gravação falhou → antes o nome se perdia; agora fica guardado e grava quando volta', async () => {
  let clock = 1000;
  const saved = [];
  let down = true;
  const L = E.createNameLearner({ now: () => clock, save: async (chatId, name) => { if (down) throw new Error('Sem resposta da extensão'); saved.push([chatId, name]); return { name, source: 'aprendido' }; } });
  assert.strictEqual(L.push([{ chatId: CHAT, head: 'Olá, Heitor!! Tudo bem?' }]), 1);
  assert.deepStrictEqual(plain(await L.flush()), []);
  assert.strictEqual(L.size(), 1); // não se perdeu
  assert.strictEqual(L.error(CHAT).name, 'Heitor');
  assert.match(L.error(CHAT).reason, /extensão não respondeu/);
  // a 2ª mensagem chega enquanto ainda está fora
  L.push([{ chatId: CHAT, head: 'Bommm dia, Heitor!! Tduo bem?' }]);
  await L.flush();
  assert.strictEqual(L.size(), 1);
  down = false;
  assert.deepStrictEqual(plain(await L.flush()), []); // espera o intervalo (não martela o banco)
  clock += 9000;
  const done = await L.flush();
  assert.deepStrictEqual(plain(done.map((d) => [d.chatId, d.name])), [[CHAT, 'Heitor']]);
  assert.deepStrictEqual([L.size(), L.error(CHAT), saved.length], [0, null, 1]);
});
test('"Tentar de novo": grava na hora, sem esperar o intervalo', async () => {
  let fail = true;
  const L = E.createNameLearner({ now: () => 0, save: async (c, name) => { if (fail) throw new Error('Supabase 503: Service Unavailable'); return { name }; } });
  L.push([{ chatId: CHAT, head: 'Olá, Heitor!! Tudo bem?' }]);
  await L.flush();
  assert.match(L.error(CHAT).reason, /Supabase deu erro ou demorou demais \(503\)/);
  fail = false;
  const done = await L.flush({ force: true, only: CHAT });
  assert.strictEqual(done.length, 1);
});
test('envio com {nome} vazio continua bloqueando o aprendizado (regra da 2.9.1) e grupos/inválidos ficam de fora', () => {
  const L = E.createNameLearner({ save: async () => ({}), blocked: (c) => c === CHAT });
  assert.strictEqual(L.push([{ chatId: CHAT, head: 'Olá, Heitor!!' }, { chatId: '123@g.us', head: 'Olá, Ana!' }, { chatId: '5511999999999@c.us', head: 'Oi tudo bem' }]), 0);
});
test('3 tentativas: falha 2 vezes e dá certo na 3ª', async () => {
  let n = 0;
  const r = await E.withRetry(async () => { n++; if (n < 3) throw new Error('Failed to fetch'); return 'ok'; }, noSleep);
  assert.deepStrictEqual([r, n], ['ok', 3]);
  n = 0;
  await assert.rejects(E.withRetry(async () => { n++; throw new Error('Supabase 503: x'); }, noSleep), /503/);
  assert.strictEqual(n, 3);
});
test('não repete o que nunca vai dar certo (extensão atualizada, conversa inválida)', async () => {
  for (const msg of ['A extensão foi atualizada. Recarregue o WhatsApp (F5).', 'Identificação inválida', 'Atualize o banco para usar este recurso']) {
    let n = 0;
    await assert.rejects(E.withRetry(async () => { n++; throw new Error(msg); }, noSleep));
    assert.strictEqual(n, 1, msg);
  }
});
test('motivo real em português para cada falha', () => {
  const R = E.errorReason;
  assert.match(R('A extensão foi atualizada. Recarregue o WhatsApp (F5).'), /recarregue o WhatsApp/);
  assert.match(R('Could not establish connection. Receiving end does not exist.'), /extensão não respondeu/);
  assert.match(R('Sem resposta da extensão'), /extensão não respondeu/);
  assert.match(R('Failed to fetch'), /Sem conexão com o Supabase/);
  assert.match(R('Supabase 401: {"message":"JWT expired"}'), /Sessão expirada/);
  assert.match(R('Supabase 500: boom'), /\(500\)/);
  assert.match(R('Supabase 400: {"code":"PGRST100"}'), /Consulta recusada pelo Supabase \(400\)/);
  assert.match(R('Identificação inválida'), /identificar esta conversa/);
});
test('Personalizar: atalhos no cabeçalho ligados por padrão (os 4) e "esconder do painel" desligado', () => {
  const d = plain(E.defaultPanelPrefs());
  assert.deepStrictEqual([d.hdr, d.hdrHidePanel], [{ on: true, venda: true, compra: true, agendar: true, etiqueta: true }, false]);
  const p = plain(E.normPanelPrefs({ hdr: { on: false, compra: false, hack: true, venda: 'sim' }, hdrHidePanel: true }));
  assert.deepStrictEqual([p.hdr, p.hdrHidePanel], [{ on: false, venda: true, compra: false, agendar: true, etiqueta: true }, true]);
  assert.deepStrictEqual(plain(E.normPanelPrefs({ convBtns: { venda: false } })).hdr, d.hdr); // prefs antigas (sem hdr) ganham o padrão
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
