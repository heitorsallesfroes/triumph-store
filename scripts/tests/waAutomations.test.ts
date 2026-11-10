// Testes da lógica portada da tela "Automações do WhatsApp" (src/lib/waAutomations.ts), com a RÉGUA REAL
// "Régua de follow-up" (3 h, dia 1, 3, 7, 15, 25 e 30 desde a entrada; seg–sex 9h–18h, sáb 9h–14h) e a
// "Avaliação Google" (⏳ 5 dias → ✉). Sem dependências: node scripts/tests/waAutomations.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mainPath, boxText, yesSummary, scheduleSummary, seqSendSteps, seqSimulate, seqNodeLabel, sinceEntryText, nextStep, futureOf,
  personTimeline, seqDescribe, currentDue, funnel, conversionBySend, maskPhone, fmtWhen, fmtAgo, fmtDateTime, startText, statusOf,
  outcomeText, outcomeGroup, stopText, matchesPerson, previewLines, simAtText, nextSendTime, weekSummary, weekOf,
  type SeqDef, type Names, type RunRow, type AutomationRow,
} from '../../src/lib/waAutomations.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGUA: SeqDef = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'reguaFollowup.json'), 'utf8'));
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const spT = (s: string) => Date.parse(`${s}-03:00`); // "2026-11-09T10:00" no horário de São Paulo
const H = 3600000;

const ITEMS: Record<string, string> = {
  '2f564cdb-5bc5-48c9-9681-6a32336d3f41': 'Follow Padrão 1', '21119a80-55a6-4099-a797-23d325e5df6f': 'Follow Padrão 2',
  'f29ef1c7-cbfa-470c-847d-324859dca399': 'Follow Padrão 3', 'c9dd1cc8-2082-4f16-8d24-422d5ac5b17e': 'Follow Padrão 4',
  '0daca7d3-23c7-4b0e-9cf5-ef2400f7c01d': 'Follow Padrão 5', '28a7ad8e-a8fe-4e9d-86b3-bfa29326850d': 'Follow Padrão 6',
  'af21afb0-e488-4ab0-9af1-1e69999259e8': 'Pedido de avaliação',
};
const LABELS: Record<string, string> = {
  'f9a864ef-e036-498e-b106-d8f70ad95758': 'Follow Up 1', '29d65d49-92e5-4025-95eb-307165282306': 'Follow Up 2', 'e9f9cde1-722a-4dbb-8c02-0c3b50b8bc25': 'Follow Up 3',
  'fb75baf1-0c8c-4ebc-b689-f56184b83896': 'Follow Up 4', '151434f5-15d2-432f-9236-4ad2dcb520d8': 'Follow Up 5', '9a2fbfce-d57d-40e9-9310-66dd78b2461e': 'Follow Up 6',
  '7383a110-8d09-474a-80d3-573a2c2d1998': 'Analisar conversa', 'f95c8d90-6eac-4e2b-81e7-3eaca0da8af3': 'Lead Perdido',
};
const names: Names = { item: (id) => (id && ITEMS[id]) || '(sem mensagem)', label: (id, s) => (s === 'whatsapp' ? `nº ${id}` : (id && LABELS[id]) || '(sem etiqueta)') };
const AVALIACAO: SeqDef = { start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: '1' }, steps: [{ id: 'p5', type: 'pausa', unit: 'dias', amount: 5 }, { id: 'av', type: 'enviar', item_id: 'af21afb0-e488-4ab0-9af1-1e69999259e8' }, { id: 'f', type: 'fim' }], business: false, schedule: { days: [1, 2, 3, 4], mode: 'personalizado', windows: [{ end: '22:00', start: '19:00' }] } };
const W = mainPath(REGUA).filter((n) => n.type === 'esperar'); // as 7 esperas de resposta
const run = (extra: Partial<RunRow>): RunRow => ({ id: 'r1', automation_id: 'a1', chat_id: '5521987651234@c.us', node: W[0].id, status: 'ativo', created_at: new Date(spT('2026-11-09T10:00')).toISOString(), branches: [], ...extra });

// ── Etapas ──
test('caminho "se não responder": 7 esperas (3 h, dia 1, 3, 7, 15, 25, 30), 6 envios na ordem, Lead Perdido e fim', () => {
  const p = mainPath(REGUA);
  assert.deepEqual(p.map((n) => n.type), ['esperar', 'enviar', 'etiqueta', 'esperar', 'enviar', 'etiqueta', 'esperar', 'enviar', 'etiqueta', 'esperar', 'enviar', 'etiqueta', 'esperar', 'enviar', 'etiqueta', 'esperar', 'enviar', 'esperar', 'etiqueta', 'fim']);
  assert.deepEqual(W.map((n) => sinceEntryText(n)), ['3 h desde a entrada', 'dia 1 desde a entrada', 'dia 3 desde a entrada', 'dia 7 desde a entrada', 'dia 15 desde a entrada', 'dia 25 desde a entrada', 'dia 30 desde a entrada']);
  assert.deepEqual(p.filter((n) => n.type === 'enviar').map((n) => boxText(REGUA, n, names).text), [1, 2, 3, 4, 5, 6].map((k) => `Envia Follow Padrão ${k}`));
});
test('caixas: ❓ "até 3 horas depois de entrar · 3 h desde a entrada", 🏷 "(e tira as outras)", ✅ "coloca Analisar conversa e termina"', () => {
  assert.deepEqual(boxText(REGUA, W[0], names), { text: 'Espera resposta até 3 horas depois de entrar', sub: '3 h desde a entrada' });
  assert.deepEqual(boxText(REGUA, W[1], names), { text: 'Espera resposta até 1 dia depois de entrar', sub: 'dia 1 desde a entrada' });
  const tag = mainPath(REGUA)[2];
  assert.deepEqual(boxText(REGUA, tag, names), { text: 'Coloca Follow Up 2 (e tira as outras)', sub: 'etiqueta do CRM' });
  W.forEach((w) => assert.equal(yesSummary(REGUA, w, names), 'Se responder: coloca Analisar conversa e termina'));
  assert.equal(seqNodeLabel(REGUA, W[0].id, names), 'Esperando resposta (até 3 h depois de entrar)');
  assert.equal(seqNodeLabel(REGUA, W[6].id, names), 'Esperando resposta (até 30 dias depois de entrar)');
  assert.equal(boxText(AVALIACAO, AVALIACAO.steps![0], names).text, 'Espera 5 dias');
});
test('como começa, horário e status', () => {
  const a = (seq: SeqDef, extra: Partial<AutomationRow> = {}): AutomationRow => ({ id: 'x', name: 'x', active: true, kind: 'sequencia', sequence: seq, ...extra });
  assert.equal(startText(a(REGUA), names), 'Quando entra na etiqueta CRM Follow Up 1');
  assert.equal(startText(a(AVALIACAO), { ...names, label: (id, s) => (s === 'whatsapp' && id === '1' ? 'Cliente' : '?') }), 'Quando entra na etiqueta do WhatsApp Cliente');
  assert.equal(startText(a({ start: { type: 'lead' }, steps: [] })), 'Quando o lead chama pela primeira vez');
  assert.equal(startText(a({ start: { type: 'venda' }, steps: [] })), 'Quando uma venda é registrada');
  assert.equal(scheduleSummary(REGUA), 'Seg–Sex 9h–18h · Sáb 9h–14h');
  assert.equal(scheduleSummary(AVALIACAO), 'Seg–Qui 19h–22h');
  assert.equal(scheduleSummary({ steps: [] }), 'Horário geral da extensão');
  assert.equal(weekSummary(weekOf(REGUA.schedule), { short: false }), 'Seg–Sex 09:00–18:00 · Sáb 09:00–14:00'); // o mesmo texto da extensão
  assert.equal(statusOf(a(REGUA)), 'ligada');
  assert.equal(statusOf(a(REGUA, { active: false })), 'desligada');
  const draft = JSON.parse(JSON.stringify(REGUA));
  draft.steps[0].no[0].item_id = '';
  assert.equal(statusOf(a(draft, { active: false })), 'rascunho');
});

// ── Simular (igual à extensão) ──
test('envios desde a entrada (seqSendSteps): +3 h, dia 1, 3, 7, 15, 25', () => {
  const s = seqSendSteps(REGUA);
  assert.deepEqual(s.map((x) => [x.n, x.at, x.day, names.item(x.itemId)]), [[1, 180, 0, 'Follow Padrão 1'], [2, 1440, 1, 'Follow Padrão 2'], [3, 4320, 3, 'Follow Padrão 3'], [4, 10080, 7, 'Follow Padrão 4'], [5, 21600, 15, 'Follow Padrão 5'], [6, 36000, 25, 'Follow Padrão 6']]);
  assert.deepEqual(s.map((x) => x.branches.length), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(s.map((x) => simAtText(x.at)), ['+3 h', '+1 dia', '+3 dias', '+7 dias', '+15 dias', '+25 dias']);
});
test('simular com horário: entrou seg 09/11 10:00 → F1 13:00, F2 ter 10:00 … F6 sex 04/12; ❌ dia 30 → Lead Perdido', () => {
  const t0 = spT('2026-11-09T10:00');
  const ev = seqSimulate(REGUA, 'nunca', { names, startAt: t0 });
  const sends = ev.filter((e) => e.kind === 'enviar').map((e) => fmtDateTime(e.when!));
  assert.deepEqual(sends, ['09/11 às 13:00', '10/11 às 10:00', '12/11 às 10:00', '16/11 às 10:00', '24/11 às 10:00', '04/12 às 10:00']);
  const last = ev.slice(-3).map((e) => [e.kind, e.text]);
  assert.deepEqual(last, [['nao', '❌ Não respondeu até 30 dias depois de entrar'], ['etiqueta', 'Entra na etiqueta Lead Perdido (e sai das outras)'], ['fim', 'Fim: sai da automação']]);
  // entrou sábado 13:00: +3 h cai às 16:00 (sáb só até 14h) → segunda 09:00
  const sat = seqSimulate(REGUA, 'nunca', { names, startAt: spT('2026-11-14T13:00') }).find((e) => e.kind === 'enviar')!;
  assert.equal(fmtDateTime(sat.when!), '16/11 às 09:00');
  // sexta 20:00 → 23:00 fora → sábado 09:00
  assert.equal(fmtDateTime(seqSimulate(REGUA, 'nunca', { startAt: spT('2026-11-13T20:00') }).find((e) => e.kind === 'enviar')!.when!), '14/11 às 09:00');
  // respondeu na 1ª ❓
  const yes = seqSimulate(REGUA, 'primeiro', { names, startAt: t0 }).map((e) => e.kind);
  assert.deepEqual(yes, ['inicio', 'respondeu', 'etiqueta', 'fim']);
  // Avaliação Google: ⏳ 5 dias (sáb 14/11 13:34) → próximo horário seg–qui 19h → seg 16/11 19:00
  const av = seqSimulate(AVALIACAO, 'nunca', { names, startAt: spT('2026-11-09T13:34') }).find((e) => e.kind === 'enviar')!;
  assert.equal(fmtDateTime(av.when!), '16/11 às 19:00');
  assert.equal(nextSendTime(spT('2026-11-12T22:30'), AVALIACAO), spT('2026-11-16T19:00')); // qui 22:30 → seg
});

// ── Pessoa na régua ──
test('pessoa na ❓ dia 1 (entrou seg 10:00, agora 15:00): próximo = Follow Padrão 2 amanhã 10:00; depois F3…F6 e fim', () => {
  const now = spT('2026-11-09T15:00');
  const r = run({ node: W[1].id, wait_started_at: new Date(spT('2026-11-09T13:00')).toISOString(), branches: [{ node: W[0].id, result: 'nao', at: spT('2026-11-09T13:00') }] });
  assert.equal(currentDue(REGUA, r), spT('2026-11-10T10:00'));
  assert.equal(seqDescribe(REGUA, r, now, names), 'esperando resposta (faltam 19h00)');
  const nx = nextStep(REGUA, r, now, names)!;
  assert.deepEqual([nx.text, fmtWhen(nx.when, now), nx.late], ['Recebe Follow Padrão 2', 'amanhã 10:00', false]);
  const fut = futureOf(REGUA, r, now, names).filter((e) => e.kind === 'enviar').map((e) => `${e.text} ${fmtDateTime(e.when!)}`);
  assert.deepEqual(fut, ['Recebe Follow Padrão 2 10/11 às 10:00', 'Recebe Follow Padrão 3 12/11 às 10:00', 'Recebe Follow Padrão 4 16/11 às 10:00', 'Recebe Follow Padrão 5 24/11 às 10:00', 'Recebe Follow Padrão 6 04/12 às 10:00']);
});
test('atrasado: ❓ 3 h venceu às 13:00 e agora são 14:00 → "Recebe Follow Padrão 1" hoje 13:00 em vermelho', () => {
  const now = spT('2026-11-09T14:00');
  const r = run({ wait_started_at: new Date(spT('2026-11-09T10:00')).toISOString() });
  const nx = nextStep(REGUA, r, now, names)!;
  assert.deepEqual([nx.text, fmtWhen(nx.when, now), nx.late], ['Recebe Follow Padrão 1', 'hoje 13:00', true]);
  assert.equal(seqDescribe(REGUA, r, now, names), 'esperando resposta (prazo vencido)');
});
test('linha do tempo: feito (entrada, ❌, envio do log) com hora real e o previsto em seguida', () => {
  const now = spT('2026-11-09T15:00');
  const r = run({ node: W[1].id, branches: [{ node: W[0].id, result: 'nao', at: spT('2026-11-09T13:00') }] });
  const tl = personTimeline(REGUA, r, [{ id: 's1', created_at: new Date(spT('2026-11-09T13:01')).toISOString(), chat_id: r.chat_id, item_id: '2f564cdb-5bc5-48c9-9681-6a32336d3f41', status: 'enviado' }], now, names);
  const done = tl.filter((e) => e.done).map((e) => `${e.text} ${fmtDateTime(e.when)}`);
  assert.deepEqual(done, ['Entrou na automação 09/11 às 10:00', '❌ Não respondeu até 3 horas depois de entrar 09/11 às 13:00', 'Recebeu Follow Padrão 1 09/11 às 13:01']);
  const next = tl.filter((e) => !e.done);
  assert.deepEqual([next[0].text, fmtDateTime(next[0].when)], ['❌ Não respondeu até 1 dia depois de entrar', '10/11 às 10:00']);
  assert.ok(next.some((e) => e.text === 'Recebe Follow Padrão 2'));
  assert.equal(next[next.length - 1].text, 'Termina a automação');
});
test('funil: quantos em cada etapa do caminho; conversão "respondeu depois do Follow k" / enviados', () => {
  const f = funnel(REGUA, [W[0].id, W[0].id, W[1].id, W[6].id, 'sumiu'], names);
  assert.deepEqual(f.rows.filter((x) => x.kind === 'esperar').map((x) => x.count), [2, 1, 0, 0, 0, 0, 1]);
  assert.equal(f.other, 1);
  const ended = (sim: number, outcome = 'respondeu'): RunRow => run({ status: 'fim', outcome, branches: [...W.slice(0, sim).map((w) => ({ node: w.id, result: 'nao' })), { node: W[sim].id, result: outcome === 'respondeu' ? 'sim' : 'nao' }] });
  const conv = conversionBySend(REGUA, [ended(0), ended(1), ended(1), ended(2), ended(6, 'nao_respondeu')], { '2f564cdb-5bc5-48c9-9681-6a32336d3f41': 10, '21119a80-55a6-4099-a797-23d325e5df6f': 4 }, names);
  assert.deepEqual(conv.map((c) => [c.label, c.responded, c.sent]), [['Antes do 1º envio', 1, null], ['Depois do Follow Padrão 1', 2, 10], ['Depois do Follow Padrão 2', 1, 4], ['Depois do Follow Padrão 3', 0, null], ['Depois do Follow Padrão 4', 0, null], ['Depois do Follow Padrão 5', 0, null], ['Depois do Follow Padrão 6', 0, null]]);
  assert.equal(conv[1].rate, 0.2);
});
test('saídas traduzidas, grupos dos 4 números e "parou em"', () => {
  assert.deepEqual(['respondeu', 'nao_respondeu', 'manual', 'nao_enviar', 'etiqueta_excluida', 'id_duplicado', 'outra_regua', 'reentrou'].map(outcomeText),
    ['Respondeu ✅', 'Chegou ao fim sem responder', 'Tirado manualmente', 'Etiqueta Não enviar', 'Etiqueta excluída', 'ID duplicado (troca de id do WhatsApp)', 'Entrou em outra régua', 'Entrou de novo']);
  assert.deepEqual(['respondeu', 'nao_respondeu', 'fim', 'manual', null].map(outcomeGroup), ['respondeu', 'fim', 'fim', 'outro', 'outro']);
  assert.equal(stopText(REGUA, run({ status: 'fim', node: null, branches: [{ node: W[0].id, result: 'sim' }] }), names), '✅ Esperando resposta (até 3 h depois de entrar)');
  assert.equal(stopText(REGUA, run({ status: 'saiu', node: W[2].id }), names), 'Esperando resposta (até 3 dias depois de entrar)');
});
test('formatos: telefone mascarado, datas, busca e prévia', () => {
  assert.equal(maskPhone('5521987651234'), '21 9****-1234');
  assert.equal(maskPhone('2133334444'), '21 3****-4444');
  assert.equal(maskPhone(null), '—');
  const now = spT('2026-11-10T08:00'); // ter
  assert.equal(fmtWhen(spT('2026-11-10T14:00'), now), 'hoje 14:00');
  assert.equal(fmtWhen(spT('2026-11-13T09:00'), now), 'sex 13/11 às 09:00');
  assert.equal(fmtAgo(now - 2 * 24 * H - 60000, now), 'há 2 dias');
  assert.equal(fmtAgo(now - 3 * H, now), 'há 3 h');
  assert.equal(fmtDateTime(spT('2026-11-09T23:55')), '09/11 às 23:55');
  assert.ok(matchesPerson('joao', 'João Silva', null) && matchesPerson('8765', null, '5521987651234') && !matchesPerson('maria', 'João', '55'));
  assert.deepEqual(previewLines('Oi!\nTudo bem?\nTerceira linha'), { text: 'Oi!\nTudo bem?', more: true });
});

let ok = 0;
for (const [name, fn] of tests) {
  try { fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`); process.exitCode = 1; }
}
console.log(`\n${ok}/${tests.length} testes passaram`);
