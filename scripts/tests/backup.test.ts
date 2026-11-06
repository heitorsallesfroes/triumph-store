// Backup completo (Configurações). node scripts/tests/backup.test.ts
// Falha se alguma tabela criada nas migrations (supabase/migrations) não estiver na lista do backup
// (src/lib/backup.ts: BACKUP_TABLES) nem nas exceções explícitas (BACKUP_EXCLUDED).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_TABLES, BACKUP_EXCLUDED, tablesFromSql, buildBackupSummary, formatBackupWhen, isBackupStale, extensionVersionFromManifest,
} from '../../src/lib/backup.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migDir = join(root, 'supabase', 'migrations');
const fromMigrations = new Set<string>();
for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql'))) {
  tablesFromSql(readFileSync(join(migDir, f), 'utf8')).forEach((t) => fromMigrations.add(t));
}
const inBackup = new Set(BACKUP_TABLES.map((t) => t.name));

const tests: [string, () => void][] = [
  ['toda tabela das migrations está no backup (ou nas exceções)', () => {
    const missing = [...fromMigrations].filter((t) => !inBackup.has(t) && !(t in BACKUP_EXCLUDED)).sort();
    assert.deepEqual(missing, [], `Faltam no backup (src/lib/backup.ts): ${missing.join(', ')}`);
  }],
  ['achou as tabelas das migrations (o leitor de SQL funciona)', () => {
    ['wa_sequence_runs', 'wa_leads', 'wa_replies', 'wa_media', 'wa_chat_names', 'sales'].forEach((t) => assert.ok(fromMigrations.has(t), t));
  }],
  ['exceção não pode estar também na lista, e sem tabela repetida', () => {
    Object.keys(BACKUP_EXCLUDED).forEach((t) => assert.ok(!inBackup.has(t), t));
    assert.equal(inBackup.size, BACKUP_TABLES.length);
    BACKUP_TABLES.forEach((t) => assert.ok(t.order.length > 0, t.name));
  }],
  ['leitor de SQL: if not exists, public., aspas, comentários e outros schemas', () => {
    const sql = `-- create table comentada (x int);
      /* create table bloco (x int); */
      create table if not exists public.a (id int);
      CREATE TABLE "b" (id int);
      create table c(id int);
      create table rls_backup_20261103.x (like public.a);
      execute format('create table rls_backup_20261103.%I (like public.%I)', t, t);`;
    assert.deepEqual(tablesFromSql(sql).sort(), ['a', 'b', 'c']);
  }],
  ['resumo no começo do arquivo: data/hora, linhas por tabela, total e versão da extensão', () => {
    const now = new Date(2026, 10, 6, 9, 5).getTime();
    const s = buildBackupSummary({ now, extensionVersion: '2.12.0', tables: [{ name: 'sales', rows: 1500 }, { name: 'wa_leads', rows: 3 }], skipped: [], mediaFiles: null });
    assert.equal(s.exportDateLocal, '06/11/2026 09:05');
    assert.equal(s.totalRows, 1503);
    assert.equal(s.extensionVersion, '2.12.0');
    assert.equal(s.exportDate, new Date(now).toISOString());
  }],
  ['"Último backup baixado: DD/MM às HH:MM" e aviso depois de 7 dias', () => {
    const t = new Date(2026, 0, 3, 7, 4).getTime();
    assert.equal(formatBackupWhen(t), '03/01 às 07:04');
    const day = 24 * 60 * 60 * 1000;
    assert.equal(isBackupStale(null, t), true);
    assert.equal(isBackupStale(t, t + 7 * day), false);
    assert.equal(isBackupStale(t, t + 7 * day + 1), true);
  }],
  ['versão da extensão lida do manifest', () => {
    assert.equal(extensionVersionFromManifest(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8')), JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8')).version);
    assert.equal(extensionVersionFromManifest('{'), null);
  }],
];
let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
