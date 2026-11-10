// A tela "Automações do WhatsApp" lendo os DADOS REAIS (somente leitura: só GET/HEAD, cliente realReadOnly.ts).
//   node scripts/tests/waAutomationsReal.test.ts
// Monta o mesmo que a tela mostra (cards, etapas com quantos em cada uma, pessoas com próximo envio, histórico e
// envios) e confere que nenhuma consulta escreve, passa de 500 linhas ou vai sem filtro. Não mostra nomes nem
// telefones (só contagens e o telefone mascarado do 1º da lista).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readOnlyClient } from './realReadOnly.ts';
import { makeAutomationsDb } from '../../src/lib/waAutomationsDb.ts';
import {
  startText, statusOf, scheduleSummary, funnel, mainPath, boxText, nextStep, fmtWhen, fmtDateTime, maskPhone, phoneOfChat, outcomeText, conversionBySend, seqSendSteps,
  type Names, type SeqDef,
} from '../../src/lib/waAutomations.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg: { self: { WA_CONFIG?: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string } } } = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(HERE, '..', '..', 'extension', 'config.js'), 'utf8'), cfg);
const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg.self.WA_CONFIG!;
const queries: [string, string][] = [];
const db = makeAutomationsDb(readOnlyClient(SUPABASE_URL, SUPABASE_ANON_KEY, (m, p) => queries.push([m, p])));

const now = Date.now();
const ov = await db.loadOverview();
assert.equal(ov.automations.error, null, ov.automations.error || '');
const labels = new Map(ov.labels.data.map((l) => [l.id, l.name]));
const items = new Map(ov.items.data.map((i) => [i.id, i]));
const names: Names = { item: (id) => (id && items.get(id)?.title) || '(mensagem apagada)', label: (id, s) => (s === 'whatsapp' ? `nº ${id}` : (id && labels.get(id)) || '(etiqueta apagada)') };
console.log(`${ov.automations.data.length} automações · ${ov.labels.data.length} etiquetas · ${ov.items.data.length} mensagens usadas`);
for (const a of ov.automations.data) {
  const st = ov.stats[a.id]?.data;
  console.log(`\n■ ${a.name} [${statusOf(a).toUpperCase()}] — ${startText(a, names)} · ${scheduleSummary(a.sequence)} · vale desde ${fmtDateTime(a.activated_at ? Date.parse(a.activated_at) : null)}`);
  if (!a.sequence) continue;
  const def = a.sequence as SeqDef;
  console.log(`  Em andamento ${st?.active} · Responderam ${st?.responded} · Fim sem responder ${st?.finished} · Outro motivo ${st?.other}`);
  const f = funnel(def, ov.nodes[a.id]?.data || [], names);
  f.rows.forEach((r) => console.log(`  ${String(r.count).padStart(4)}  ${r.label}`));
  if (f.other) console.log(`  ${String(f.other).padStart(4)}  em outro caminho`);
  console.log(`  etapas: ${mainPath(def).map((n) => boxText(def, n, names).text).slice(0, 4).join(' → ')}${mainPath(def).length > 4 ? ' → …' : ''}`);
  const act = await db.loadActive(a.id);
  assert.equal(act.error, null);
  assert.equal(act.data.length, st?.active, 'a lista de pessoas bate com o número "Em andamento"');
  const people = await db.peopleOf(act.data);
  assert.equal(people.error, null);
  const first = act.data[0];
  if (first) {
    const nx = nextStep(def, first, now, names);
    const ph = people.byChat[first.chat_id]?.phone || phoneOfChat(first.chat_id);
    console.log(`  1ª pessoa: ${maskPhone(ph)} · próximo: ${nx ? `${nx.text} ${fmtWhen(nx.when, now)}${nx.late ? ' (atrasado)' : ''}` : '—'} · com nome: ${act.data.filter((r) => people.byChat[r.chat_id]?.name).length}/${act.data.length}`);
  }
  const hist = await db.loadHistory(a.id, 30);
  assert.equal(hist.error, null);
  assert.ok(hist.data.length <= 200);
  const motivos = new Map<string, number>();
  hist.data.forEach((r) => motivos.set(outcomeText(r.outcome), (motivos.get(outcomeText(r.outcome)) || 0) + 1));
  console.log(`  histórico 30 dias: ${hist.data.length} (${[...motivos].map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  const sent = await db.loadSentByItem(a.id, seqSendSteps(def).map((s) => s.itemId || ''), 30);
  assert.equal(sent.error, null);
  const conv = conversionBySend(def, hist.data, sent.data, names);
  console.log(`  conversão: ${conv.map((c) => `${c.label}: ${c.responded}${c.sent != null ? `/${c.sent}` : ''}`).join(' · ')}`);
  const sends = await db.loadSends(a.id, { days: 30 });
  assert.equal(sends.error, null);
  assert.ok(sends.data.length <= 500);
  console.log(`  envios 30 dias: ${sends.data.length} (${['enviado', 'pulado', 'falhou'].map((s) => `${s} ${sends.data.filter((x) => x.status === s).length}`).join(', ')})`);
}
const s = await db.searchPeople('a');
assert.equal(s.error, null);

// ── o que foi pedido ao banco ──
const writes = queries.filter(([m]) => m !== 'GET' && m !== 'HEAD');
assert.deepEqual(writes, [], 'nenhuma escrita');
const big = queries.filter(([m, p]) => m === 'GET' && !/[?&]limit=([1-9]\d{0,1}|[1-4]\d\d|500)(&|$)/.test(p));
assert.deepEqual(big, [], 'toda leitura tem limite de no máximo 500');
const unfiltered = queries.filter(([, p]) => /^wa_(sequence_runs|send_log|contacts|leads|items)\?/.test(p) && !/=(eq|in|ilike|gte)\./.test(p));
assert.deepEqual(unfiltered, [], 'as tabelas grandes sempre com filtro');
console.log(`\nok: ${queries.length} consultas, todas GET/HEAD, com limite ≤ 500 e filtro`);
