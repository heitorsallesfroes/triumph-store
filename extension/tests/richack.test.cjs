// Testes da 2.18.9 (tracinhos das partes especiais): node extension/tests/richack.test.cjs
// - content.js watchRichAck (código de verdade, ponte falsa): acompanha o ack por 2 minutos (aqui encurtado);
//   em 1 tracinho com as outras mensagens chegando → grava no log de envio e mostra o aviso; nunca reenvia
// - entregue (2 tracinhos) antes do fim: sem aviso; sem as outras chegando: sem aviso
// - o envio da parte chama o acompanhamento (sendRich e disparo) e o Diagnóstico mostra o log
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise });
vm.runInContext(src('rich-parts.js'), ctx);
const R = ctx.TspRich;

function watcher(answers) {
  const code = src('content.js').split('\r\n').join('\n');
  const start = code.indexOf('  const RICH_ACK_MS = ');
  const end = code.indexOf('\n  const productLog = ', start);
  assert.ok(start > 0 && end > start, 'watchRichAck não encontrado');
  const store = {};
  const calls = [];
  const toasts = [];
  const chrome = { storage: { local: { get: (keys, cb) => cb({ [keys[0]]: store[keys[0]] }) } } };
  const storageSet = (o) => Object.assign(store, o);
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));
  let i = 0;
  const waRequest = async (type, payload) => { calls.push([type, payload]); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return a; };
  const toast = (text, kind, ms) => toasts.push([text, kind, ms]);
  const fns = new Function('Rich', 'sleep', 'waRequest', 'toast', 'chrome', 'storageSet',
    `${code.slice(start, end)}\nreturn { watchRichAck, richAckLog, richAckWarnText, RICH_ACK_MS, RICH_ACK_STEP_MS };`)(R, sleep, waRequest, toast, chrome, storageSet);
  return { ...fns, store, calls, toasts };
}
const ONE = { found: true, ack: 1, others: 2, othersDelivered: true };

test('2 minutos, a cada 15 s; o catálogo continua em 1 tracinho e as outras chegam → log + aviso discreto, sem reenviar', async () => {
  const w = watcher([ONE]);
  assert.strictEqual(w.RICH_ACK_MS, 120000);
  assert.strictEqual(w.RICH_ACK_STEP_MS, 15000);
  const r = await w.watchRichAck('catalogo', '5511999990000@c.us', { sent: true, msgId: 'm1' }, { totalMs: 60, stepMs: 10 });
  assert.strictEqual(r, 'warn');
  assert.ok(w.calls.length >= 2 && w.calls.every(([t, p]) => t === 'richAck' && p.msgId === 'm1'), 'só lê (richAck), nunca reenvia');
  assert.deepStrictEqual(w.toasts, [['O catálogo pode não ter chegado ao cliente. Confira a conversa.', 'warn', 12000]]);
  const log = w.store.richSendLog;
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].kind, 'catalogo');
  assert.strictEqual(log[0].ack, 1);
  assert.ok(!JSON.stringify(log).includes('5511999990000'), 'sem o número da conversa no log');
});
test('chegou (2 tracinhos) no meio: para de olhar e não avisa', async () => {
  const w = watcher([ONE, { ...ONE, ack: 2 }]);
  const r = await w.watchRichAck('produto', 'x@c.us', { msgId: 'm2', via: 'link' }, { totalMs: 200, stepMs: 10 });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(w.calls.length, 2);
  assert.deepStrictEqual(w.toasts, []);
  assert.strictEqual(w.store.richSendLog, undefined);
});
test('1 tracinho mas as outras mensagens também não chegaram (ou ponte sem resposta): não avisa', async () => {
  for (const ans of [[{ ...ONE, othersDelivered: false }], [new Error('sem resposta')], [{ found: false }]]) {
    const w = watcher(ans);
    const r = await w.watchRichAck('pix', 'x@c.us', { msgId: 'm3' }, { totalMs: 30, stepMs: 10 });
    assert.strictEqual(r, 'unknown');
    assert.deepStrictEqual(w.toasts, []);
  }
});
test('sem id da mensagem não acompanha; textos do aviso para cada parte', () => {
  const w = watcher([ONE]);
  assert.strictEqual(w.watchRichAck('catalogo', 'x@c.us', { sent: true }), null);
  assert.strictEqual(w.richAckWarnText('localizacao'), 'A localização pode não ter chegado ao cliente. Confira a conversa.');
  assert.strictEqual(w.richAckWarnText('pix'), 'A chave Pix pode não ter chegado ao cliente. Confira a conversa.');
  assert.strictEqual(w.richAckWarnText('contato'), 'O contato pode não ter chegado ao cliente. Confira a conversa.');
});
test('content.js: o envio de qualquer parte especial chama o acompanhamento; Diagnóstico mostra o log', () => {
  const c = src('content.js');
  assert.ok(c.includes("watchRichAck(part.type, chatId, res);"));
  assert.ok(c.includes('watchRichAck(part.type, chatId, cr);'));
  assert.ok(c.includes('Partes especiais que ficaram em 1 tracinho'));
  assert.ok(c.includes("productDiagText(info, test, await productLog(), await richAckLog())"));
  const b = src('wa-bridge.js');
  assert.ok(/richAck: \(payload\) => richAck\(payload\)/.test(b));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String(e && e.stack).split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
