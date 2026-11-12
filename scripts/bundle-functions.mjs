// Gera as cópias "prontas para o painel do Supabase" das edge functions que usam supabase/functions/_shared/.
//   node scripts/bundle-functions.mjs            (gera / atualiza supabase/functions-dashboard/<nome>/)
//   node scripts/bundle-functions.mjs --check    (só confere se as cópias estão em dia; sai com erro se não)
// O editor web do painel não aceita a pasta compartilhada fora da function. Para cada function que importa
// '../_shared/...', copia os arquivos da function e os de _shared que ela usa (também os que eles usam) para
// supabase/functions-dashboard/<nome>/, trocando SÓ os caminhos de import: '../_shared/x.ts' → './x.ts'.
// Nada da lógica muda. Os originais (supabase/functions/<nome>/) continuam sendo os que valem para editar e testar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');
export const SHARED = path.join(FUNCTIONS, '_shared');
export const OUT = path.join(ROOT, 'supabase', 'functions-dashboard');

// import/export ... from '...'  e  import '...'  (só os caminhos relativos; jsr:/npm:/https: ficam como estão)
const SPEC_RE = /(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;
export const relSpecs = (code) => [...code.matchAll(SPEC_RE)].map((m) => m[3]);
// '../_shared/x.ts' → './x.ts' (o único ajuste)
export const rewrite = (code) => code.replace(SPEC_RE, (all, kw, q, spec) => (spec.startsWith('../_shared/') ? `${kw}${q}./${spec.slice('../_shared/'.length)}${q}` : all));

const listTs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();

// as functions que usam _shared e, para cada uma, os arquivos que vão para a pasta do painel
export function plan() {
  const out = [];
  for (const name of fs.readdirSync(FUNCTIONS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort()) {
    const dir = path.join(FUNCTIONS, name);
    const own = listTs(dir);
    const shared = new Set();
    const queue = [];
    for (const f of own) {
      for (const spec of relSpecs(fs.readFileSync(path.join(dir, f), 'utf8'))) {
        if (spec.startsWith('../_shared/')) queue.push(spec.slice('../_shared/'.length));
        else if (spec.startsWith('../')) throw new Error(`${name}/${f}: import fora da function que não é de _shared (${spec})`);
      }
    }
    if (!queue.length) continue;
    while (queue.length) {
      const f = path.posix.normalize(queue.shift());
      if (f.includes('/')) throw new Error(`${name}: arquivo de _shared em subpasta não é suportado (${f})`);
      if (shared.has(f)) continue;
      if (!fs.existsSync(path.join(SHARED, f))) throw new Error(`${name}: _shared/${f} não existe`);
      shared.add(f);
      for (const spec of relSpecs(fs.readFileSync(path.join(SHARED, f), 'utf8'))) {
        if (!spec.startsWith('./')) throw new Error(`_shared/${f}: import fora de _shared (${spec})`);
        queue.push(spec.slice(2));
      }
    }
    const clash = own.filter((f) => shared.has(f));
    if (clash.length) throw new Error(`${name}: arquivo com o mesmo nome na function e em _shared (${clash.join(', ')})`);
    out.push({
      name,
      files: [
        ...own.map((f) => ({ file: f, from: path.join(dir, f), shared: false })),
        ...[...shared].sort().map((f) => ({ file: f, from: path.join(SHARED, f), shared: true })),
      ],
    });
  }
  return out;
}

// o conteúdo de cada arquivo gerado
export function build() {
  return plan().map((fn) => ({ ...fn, files: fn.files.map((x) => ({ ...x, code: rewrite(fs.readFileSync(x.from, 'utf8')) })) }));
}

function main() {
  const check = process.argv.includes('--check');
  const fns = build();
  const stale = [];
  for (const fn of fns) {
    const dir = path.join(OUT, fn.name);
    const want = new Map(fn.files.map((x) => [x.file, x.code]));
    const have = fs.existsSync(dir) ? listTs(dir) : [];
    for (const [f, code] of want) {
      const p = path.join(dir, f);
      if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === code) continue;
      stale.push(`${fn.name}/${f}`);
      if (!check) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(p, code); }
    }
    for (const f of have.filter((f) => !want.has(f))) {
      stale.push(`${fn.name}/${f} (sobrando)`);
      if (!check) fs.rmSync(path.join(dir, f));
    }
  }
  // pasta de uma function que não usa mais _shared
  if (fs.existsSync(OUT)) {
    for (const e of fs.readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory() && !fns.some((fn) => fn.name === e.name))) {
      stale.push(`${e.name}/ (sobrando)`);
      if (!check) fs.rmSync(path.join(OUT, e.name), { recursive: true });
    }
  }
  for (const fn of fns) console.log(`${fn.name}: ${fn.files.map((x) => x.file).join(', ')}`);
  if (check) {
    if (stale.length) { console.log(`\nDesatualizado: ${stale.join(', ')}. Rode: node scripts/bundle-functions.mjs`); process.exitCode = 1; } else console.log('\nEm dia.');
  } else console.log(stale.length ? `\nAtualizado: ${stale.join(', ')}` : '\nJá estava em dia.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
