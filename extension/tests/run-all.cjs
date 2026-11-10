// Roda TODOS os testes da extensão, um por vez (padrão para toda versão, desde a 2.10.2):
//   node extension/tests/run-all.cjs
// Inclui "o painel abre no Chrome real" (chrome-real.test.cjs). Sai com erro se algum falhar.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.cjs')).sort((a, b) => (a === 'chrome-real.test.cjs') - (b === 'chrome-real.test.cjs') || a.localeCompare(b));
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 450000, env: process.env });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}: ${out[out.length - 1] || ''}`);
  if (!ok) out.filter((l) => /^FAIL/.test(l)).slice(0, 10).forEach((l) => console.log(`     ${l}`));
}
console.log(`\n${files.length - failed}/${files.length} arquivos de teste passaram`);
if (failed) process.exitCode = 1;
