// Cópias "prontas para o painel do Supabase" (scripts/bundle-functions.mjs → supabase/functions-dashboard/<nome>/).
//   node scripts/tests/bundleFunctions.test.ts
// Confere: cada function que usa _shared tem a sua pasta; cada arquivo gerado é IGUAL ao original, tirando só os
// caminhos de import ('../_shared/x.ts' → './x.ts'); nenhum import para '../' sobrou; todo import relativo aponta para
// um arquivo que está na mesma pasta; a pasta não tem arquivo a mais nem a menos; e as cópias estão em dia (--check).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// @ts-expect-error: módulo .mjs sem tipos
import { FUNCTIONS, OUT, SHARED, plan, relSpecs, rewrite } from '../bundle-functions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
type Fn = { name: string; files: { file: string; from: string; shared: boolean }[] };
const P = plan() as Fn[];
const read = (p: string) => fs.readFileSync(p, 'utf8');
// o original com os caminhos de import trocados pelo que o painel recebe (a ÚNICA diferença permitida)
const onlyImports = (code: string) => code.replace(/(['"])\.\.\/_shared\/([^'"]+)\1/g, '$1./$2$1');

test('as functions que importam _shared (ig-manage e ig-webhook) têm a sua pasta no painel', () => {
  const users = fs.readdirSync(FUNCTIONS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .filter((e) => fs.readdirSync(path.join(FUNCTIONS, e.name)).some((f) => /\.\.\/_shared\//.test(read(path.join(FUNCTIONS, e.name, f))))).map((e) => e.name).sort();
  assert.deepEqual(users, ['ig-manage', 'ig-webhook']);
  assert.deepEqual(P.map((f) => f.name), users);
  assert.deepEqual(fs.readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(), users);
});
test('cada arquivo gerado = original, exceto os caminhos de import; nada a mais nem a menos na pasta', () => {
  for (const fn of P) {
    const dir = path.join(OUT, fn.name);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort(), fn.files.map((x) => x.file).sort(), fn.name);
    for (const x of fn.files) {
      const orig = read(x.from);
      const got = read(path.join(dir, x.file));
      assert.equal(got, onlyImports(orig), `${fn.name}/${x.file}`);
      // tirando os imports dos dois lados, o resto é idêntico letra por letra
      const strip = (s: string) => s.replace(/(['"])\.{1,2}\/(?:_shared\/)?[^'"]+\1/g, "'X'");
      assert.equal(strip(got), strip(orig), `${fn.name}/${x.file}: só os caminhos mudam`);
      assert.equal(got.split('\n').length, orig.split('\n').length, `${fn.name}/${x.file}: mesmas linhas`);
    }
  }
});
test('nenhum import para "../" sobrou; todo import relativo aponta para um arquivo da mesma pasta', () => {
  for (const fn of P) {
    const dir = path.join(OUT, fn.name);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = read(path.join(dir, f));
      assert.ok(!/(from|import)\s*['"]\.\.\//.test(code), `${fn.name}/${f} ainda tem import para ../`);
      for (const spec of relSpecs(code) as string[]) {
        assert.ok(spec.startsWith('./') && !spec.slice(2).includes('/'), `${fn.name}/${f}: ${spec}`);
        assert.ok(fs.existsSync(path.join(dir, spec.slice(2))), `${fn.name}/${f}: ${spec} não está na pasta`);
      }
    }
    assert.ok(fs.existsSync(path.join(dir, 'index.ts')), `${fn.name}: index.ts (o que o painel roda)`);
  }
});
test('os arquivos de _shared levados são exatamente os que a function usa (também os que eles usam)', () => {
  const manage = P.find((f) => f.name === 'ig-manage')!;
  const hook = P.find((f) => f.name === 'ig-webhook')!;
  assert.deepEqual(manage.files.filter((x) => x.shared).map((x) => x.file), ['igApi.ts', 'igEngine.ts', 'igRules.ts', 'igStore.ts', 'igToken.ts']);
  assert.deepEqual(hook.files.filter((x) => x.shared).map((x) => x.file), ['igApi.ts', 'igEngine.ts', 'igRules.ts', 'igStore.ts', 'igToken.ts']);
  assert.ok(manage.files.filter((x) => x.shared).every((x) => path.dirname(x.from) === SHARED));
});
test('a troca de caminho só mexe em "../_shared/" (jsr:, npm:, https: e "./" ficam iguais)', () => {
  const src = `import "jsr:@supabase/functions-js/edge-runtime.d.ts";\nimport { a } from '../_shared/igApi.ts';\nimport type { B } from "../_shared/igStore.ts";\nimport { c } from './manage.ts';\nexport { d } from '../_shared/igRules.ts';\nconst s = '../_shared/não-é-import';`;
  assert.equal(rewrite(src), `import "jsr:@supabase/functions-js/edge-runtime.d.ts";\nimport { a } from './igApi.ts';\nimport type { B } from "./igStore.ts";\nimport { c } from './manage.ts';\nexport { d } from './igRules.ts';\nconst s = '../_shared/não-é-import';`);
});
test('as cópias commitadas estão em dia (node scripts/bundle-functions.mjs --check)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'bundle-functions.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Em dia\./);
});
test('README da pasta diz como publicar pelo painel', () => {
  const md = read(path.join(OUT, 'README.md'));
  assert.match(md, /Para publicar pelo painel, use os arquivos de supabase\/functions-dashboard\/<nome>\//);
});

let ok = 0;
for (const [n, f] of tests) { try { f(); ok++; console.log(`ok   ${n}`); } catch (e) { console.log(`FAIL ${n}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; } }
console.log(`\n${ok}/${tests.length} testes passaram`);
