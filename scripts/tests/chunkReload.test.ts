// Testes da recarga quando sai versão nova do ERP com a página aberta (src/lib/chunkReload.ts), sem navegador.
// Sem dependências: node scripts/tests/chunkReload.test.ts
import assert from 'node:assert/strict';
import { AVISO, JANELA_MS, comParam, decidir, ehErroDeChunk, importar, podeRecarregar } from '../../src/lib/chunkReload.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('reconhece o erro de arquivo antigo nos navegadores (e só ele)', () => {
  for (const m of [
    'Failed to fetch dynamically imported module: https://erp.exemplo.com/assets/danfe-Bx12ab.js',
    'error loading dynamically imported module: https://erp.exemplo.com/assets/jspdf.es.min-9f.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-abc.css',
  ]) {
    assert.ok(ehErroDeChunk(new TypeError(m)), m);
    assert.ok(ehErroDeChunk(m), `texto: ${m}`);
  }
  for (const m of ['Failed to fetch', 'XML não encontrado', 'NetworkError when attempting to fetch resource.', '']) assert.ok(!ehErroDeChunk(new Error(m)), m);
  assert.ok(!ehErroDeChunk(null));
  assert.ok(!ehErroDeChunk(undefined));
  assert.ok(!ehErroDeChunk({}));
});

test('recarrega sozinho uma vez; falhou de novo logo depois = aviso', () => {
  const agora = 1_800_000_000_000;
  assert.equal(decidir({ ultima: null, agora, lembra: true, digitando: false }), 'recarregar', 'primeira vez');
  assert.equal(decidir({ ultima: agora - 10_000, agora, lembra: true, digitando: false }), 'avisar', 'acabou de recarregar e falhou de novo');
  assert.equal(decidir({ ultima: agora - JANELA_MS - 1, agora, lembra: true, digitando: false }), 'recarregar', 'outra versão, bem depois');
  assert.equal(decidir({ ultima: null, agora, lembra: false, digitando: false }), 'avisar', 'sem como lembrar: não arrisca laço');
  assert.equal(decidir({ ultima: null, agora, lembra: true, digitando: true }), 'avisar', 'tela com algo digitado: não perde o que foi escrito');
  assert.ok(podeRecarregar(Number.NaN, agora));
  assert.ok(podeRecarregar(agora + 60_000, agora), 'relógio voltou: pode');
});

test('endereço guarda o modal aberto e mantém página, aba e o resto', () => {
  const base = 'https://erp.exemplo.com/?pagina=historico&aba=x#topo';
  assert.equal(comParam(base, 'nfe', 'abc-123'), '/?pagina=historico&aba=x&nfe=abc-123#topo');
  assert.equal(comParam('https://erp.exemplo.com/?pagina=historico&nfe=abc', 'nfe', null), '/?pagina=historico');
  assert.equal(comParam('https://erp.exemplo.com/?nfe=1&pagina=historico', 'nfe', '2'), '/?nfe=2&pagina=historico');
});

test('importar(): passa o resultado; outros erros seguem iguais', async () => {
  assert.equal(await importar(async () => 42), 42);
  await assert.rejects(importar(async () => { throw new Error('outro erro'); }), /outro erro/);
});

test('importar(): erro de arquivo antigo recarrega a página (uma vez) e devolve o aviso', async () => {
  const mem = new Map<string, string>();
  let recargas = 0;
  const g = globalThis as Record<string, unknown>;
  g.sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  g.window = { location: { reload: () => { recargas++; } } };
  const appended: unknown[] = [];
  g.document = {
    getElementById: () => null,
    createElement: () => ({ setAttribute() {}, style: {} }),
    body: { appendChild: (e: unknown) => appended.push(e) },
  };
  const falha = async () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/danfe-x.js'); };
  await assert.rejects(importar(falha), (e: Error) => e.message === AVISO);
  assert.equal(recargas, 1);
  // falhou de novo logo depois da recarga: não recarrega outra vez, mostra o aviso
  await assert.rejects(importar(falha), (e: Error) => e.message === AVISO);
  assert.equal(recargas, 1);
  assert.equal(appended.length, 1);
  assert.match(String((appended[0] as { textContent: string }).textContent), /O sistema foi atualizado — clique para recarregar/);
  delete g.sessionStorage; delete g.window; delete g.document;
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
