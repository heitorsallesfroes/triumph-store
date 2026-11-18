// Testes das regras de Gestão › Anotações (src/lib/anotacoes.ts), sem banco.
// Sem dependências: node scripts/tests/anotacoes.test.ts
// - agrupamento por data (Atrasadas, Hoje, Amanhã, Esta semana, Mais pra frente, Algum dia) e Feitas
// - atrasadas e contador do menu (hoje + atrasadas que faltam)
// - repetição: todo dia, dias úteis, toda semana (feita no dia, atrasada ou adiantada)
// - escolha rápida do dia, arrastar (posições), notas (busca, ordem, listas com "- ", capa do cartão, data da edição)
import assert from 'node:assert/strict';
import {
  addDays, agrupar, blocosDoTexto, capaDaNota, corValida, dueLabel, editadaLabel, endOfWeek, filtrarNotas, groupOf, isDateKey, isOverdue, moveInList,
  nextDue, nextPosition, pendentesHoje, quickDate, reorderUpdates, tabelaFaltando,
  type Nota, type Tarefa,
} from '../../src/lib/anotacoes.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// 2026-11-18 é quarta-feira
const QUA = '2026-11-18';
let seq = 0;
const t = (p: Partial<Tarefa>): Tarefa => ({
  id: `t${++seq}`, texto: 'x', due_date: QUA, done: false, done_at: null, importante: false, repeticao: null,
  position: seq, created_at: `2026-11-01T00:00:${String(seq % 60).padStart(2, '0')}Z`, ...p,
});

test('datas: soma dias atravessando mês/ano; fim da semana é domingo', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(endOfWeek(QUA), '2026-11-22');
  assert.equal(endOfWeek('2026-11-22'), '2026-11-22', 'domingo = o próprio dia');
  assert.equal(endOfWeek('2026-11-16'), '2026-11-22', 'segunda');
  assert.ok(isDateKey('2026-02-28'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.ok(!isDateKey('ontem'));
});

test('grupo pela data', () => {
  assert.equal(groupOf(null, QUA), 'algum');
  assert.equal(groupOf('2026-11-17', QUA), 'atrasadas');
  assert.equal(groupOf('2025-01-01', QUA), 'atrasadas');
  assert.equal(groupOf(QUA, QUA), 'hoje');
  assert.equal(groupOf('2026-11-19', QUA), 'amanha');
  assert.equal(groupOf('2026-11-20', QUA), 'semana');
  assert.equal(groupOf('2026-11-22', QUA), 'semana', 'domingo ainda é esta semana');
  assert.equal(groupOf('2026-11-23', QUA), 'depois', 'segunda seguinte');
  // sábado: amanhã (domingo) é "Amanhã", não "Esta semana"
  assert.equal(groupOf('2026-11-22', '2026-11-21'), 'amanha');
  assert.equal(groupOf('2026-11-23', '2026-11-22'), 'amanha', 'no domingo, segunda é amanhã');
  assert.equal(groupOf('2026-11-24', '2026-11-22'), 'depois', 'no domingo, terça já é a semana que vem');
});

test('agrupar: ordem dos grupos, Hoje sempre aparece, feitas separadas e mais recentes primeiro', () => {
  const lista = [
    t({ id: 'a', due_date: '2026-11-25' }),
    t({ id: 'b', due_date: null }),
    t({ id: 'c', due_date: '2026-11-10' }),
    t({ id: 'd', due_date: '2026-11-19' }),
    t({ id: 'e', due_date: '2026-11-21' }),
    t({ id: 'f', due_date: '2026-11-10', done: true, done_at: '2026-11-17T10:00:00Z' }),
    t({ id: 'g', due_date: QUA, done: true, done_at: '2026-11-18T10:00:00Z' }),
  ];
  const r = agrupar(lista, QUA);
  assert.deepEqual(r.grupos.map((g) => g.id), ['atrasadas', 'hoje', 'amanha', 'semana', 'depois', 'algum']);
  assert.deepEqual(r.grupos.map((g) => g.tarefas.map((x) => x.id)), [['c'], [], ['d'], ['e'], ['a'], ['b']]);
  assert.deepEqual(r.feitas.map((x) => x.id), ['g', 'f'], 'feita atrasada não volta para Atrasadas');
  assert.deepEqual(agrupar([], QUA).grupos.map((g) => g.id), ['hoje']);
});

test('agrupar: dentro do grupo vale a posição (arrastar), empate pela mais antiga', () => {
  const r = agrupar([
    t({ id: 'x', position: 5, due_date: QUA }),
    t({ id: 'y', position: 1, due_date: QUA }),
    t({ id: 'z', position: 5, due_date: QUA, created_at: '2026-10-01T00:00:00Z' }),
  ], QUA);
  assert.deepEqual(r.grupos[0].tarefas.map((x) => x.id), ['y', 'z', 'x']);
});

test('atrasadas e contador do menu', () => {
  assert.ok(isOverdue({ due_date: '2026-11-17', done: false }, QUA));
  assert.ok(!isOverdue({ due_date: '2026-11-17', done: true }, QUA), 'feita não é atrasada');
  assert.ok(!isOverdue({ due_date: QUA, done: false }, QUA), 'hoje não é atrasada');
  assert.ok(!isOverdue({ due_date: null, done: false }, QUA), 'algum dia nunca atrasa');
  const lista = [
    { due_date: '2026-11-01', done: false }, { due_date: QUA, done: false }, { due_date: QUA, done: true },
    { due_date: '2026-11-19', done: false }, { due_date: null, done: false },
  ];
  assert.equal(pendentesHoje(lista, QUA), 2);
  assert.equal(pendentesHoje(lista, '2026-11-19'), 3, 'virou o dia: a de ontem vira atrasada e a de amanhã vira hoje');
});

test('repetir todo dia', () => {
  assert.equal(nextDue(QUA, 'diario', QUA), '2026-11-19', 'feita no dia');
  assert.equal(nextDue('2026-11-10', 'diario', QUA), '2026-11-19', 'feita atrasada: não cria outra atrasada');
  assert.equal(nextDue('2026-11-20', 'diario', QUA), '2026-11-21', 'feita adiantada: a seguinte');
  assert.equal(nextDue(null, 'diario', QUA), '2026-11-19', 'sem data conta de hoje');
  assert.equal(nextDue('2026-12-31', 'diario', '2026-12-31'), '2027-01-01');
});

test('repetir em dias úteis pula sábado e domingo', () => {
  assert.equal(nextDue(QUA, 'uteis', QUA), '2026-11-19');
  assert.equal(nextDue('2026-11-20', 'uteis', '2026-11-20'), '2026-11-23', 'sexta → segunda');
  assert.equal(nextDue('2026-11-21', 'uteis', '2026-11-21'), '2026-11-23', 'sábado → segunda');
  assert.equal(nextDue('2026-11-13', 'uteis', '2026-11-21'), '2026-11-23', 'atrasada feita no sábado → segunda');
});

test('repetir toda semana mantém o dia da semana', () => {
  assert.equal(nextDue(QUA, 'semanal', QUA), '2026-11-25');
  assert.equal(nextDue('2026-11-16', 'semanal', QUA), '2026-11-23', 'segunda atrasada feita na quarta → próxima segunda');
  assert.equal(nextDue('2026-11-02', 'semanal', QUA), '2026-11-23', 'várias semanas atrasada: a próxima segunda depois de hoje');
  assert.equal(nextDue('2026-11-11', 'semanal', QUA), '2026-11-25', 'quarta passada feita hoje (quarta) → semana que vem');
  assert.equal(nextDue('2026-11-20', 'semanal', QUA), '2026-11-27', 'adiantada');
  assert.equal(nextDue(null, 'semanal', QUA), '2026-11-25');
});

test('escolha rápida do dia', () => {
  assert.equal(quickDate('hoje', QUA), QUA);
  assert.equal(quickDate('amanha', QUA), '2026-11-19');
  assert.equal(quickDate('semana', QUA), '2026-11-22');
  assert.equal(quickDate('algum', QUA), null);
  assert.equal(groupOf(quickDate('semana', QUA), QUA), 'semana');
});

test('rótulo da data', () => {
  assert.equal(dueLabel(QUA, QUA), 'Hoje');
  assert.equal(dueLabel('2026-11-19', QUA), 'Amanhã');
  assert.equal(dueLabel('2026-11-17', QUA), 'Ontem');
  assert.equal(dueLabel('2026-11-25', QUA), 'qua, 25 nov');
  assert.equal(dueLabel('2027-01-04', QUA), 'seg, 4 jan 2027');
  assert.equal(dueLabel(null, QUA), 'Algum dia');
});

test('arrastar: nova ordem reaproveita as posições do grupo e só grava as que mudaram', () => {
  const a = t({ id: 'a', position: 2 }); const b = t({ id: 'b', position: 7 }); const c = t({ id: 'c', position: 9 });
  const nova = moveInList([a, b, c], 'c', 'a');
  assert.deepEqual(nova.map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(reorderUpdates([a, b, c], nova), [{ id: 'c', position: 2 }, { id: 'a', position: 7 }, { id: 'b', position: 9 }]);
  assert.deepEqual(moveInList([a, b, c], 'a', 'b').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(moveInList([a, b, c], 'a', 'zz'), [a, b, c]);
  // posições repetidas: renumera depois da maior
  const p = t({ id: 'p', position: 3 }); const q = t({ id: 'q', position: 3 });
  assert.deepEqual(reorderUpdates([p, q], [q, p]), [{ id: 'q', position: 4 }, { id: 'p', position: 5 }]);
  assert.equal(nextPosition([a, b, c]), 10);
  assert.equal(nextPosition([]), 1);
});

const n = (p: Partial<Nota>): Nota => ({ id: 'n', titulo: '', texto: '', cor: 'amarelo', fixada: false, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...p });
test('notas: fixadas primeiro, depois a mais recente; busca sem acento em título e texto', () => {
  const lista = [
    n({ id: '1', titulo: 'Fornecedores', texto: 'Ligar para o João', updated_at: '2026-11-10T00:00:00Z' }),
    n({ id: '2', titulo: 'Ideias', texto: 'Promoção de Natal', updated_at: '2026-11-12T00:00:00Z' }),
    n({ id: '3', titulo: '', texto: 'senha do wi-fi', fixada: true, updated_at: '2026-11-01T00:00:00Z' }),
  ];
  assert.deepEqual(filtrarNotas(lista, '').map((x) => x.id), ['3', '2', '1']);
  assert.deepEqual(filtrarNotas(lista, 'promocao').map((x) => x.id), ['2']);
  assert.deepEqual(filtrarNotas(lista, 'JOAO ligar').map((x) => x.id), ['1']);
  assert.deepEqual(filtrarNotas(lista, 'fornecedores natal'), []);
  assert.equal(corValida('verde'), 'verde');
  assert.equal(corValida('neon'), 'amarelo');
});

test('notas: linhas com "- " viram lista, o resto parágrafo', () => {
  assert.deepEqual(blocosDoTexto('Comprar:\n- caixa\n- fita\nfim'), [
    { tipo: 'texto', linhas: ['Comprar:'] },
    { tipo: 'lista', itens: ['caixa', 'fita'] },
    { tipo: 'texto', linhas: ['fim'] },
  ]);
  assert.deepEqual(blocosDoTexto('a\r\n\r\nb'), [{ tipo: 'texto', linhas: ['a', '', 'b'] }]);
  assert.deepEqual(blocosDoTexto('-sem espaço'), [{ tipo: 'texto', linhas: ['-sem espaço'] }]);
});

test('notas: capa mostra só o título; sem título, a 1ª linha do texto cortada com "…"', () => {
  assert.deepEqual(capaDaNota({ titulo: '  Fornecedores ', texto: 'Ligar para o João' }), { titulo: 'Fornecedores', semTitulo: false, temTexto: true });
  assert.deepEqual(capaDaNota({ titulo: 'Só título', texto: '  ' }), { titulo: 'Só título', semTitulo: false, temTexto: false });
  assert.deepEqual(capaDaNota({ titulo: '', texto: '\n\n- senha do wi-fi\noutra linha' }), { titulo: 'senha do wi-fi', semTitulo: true, temTexto: true });
  assert.deepEqual(capaDaNota({ titulo: ' ', texto: '' }), { titulo: 'Nota vazia', semTitulo: true, temTexto: false });
  const longa = capaDaNota({ titulo: '', texto: 'a'.repeat(100) }, 60);
  assert.equal(longa.titulo, `${'a'.repeat(60)}…`);
  assert.ok(longa.semTitulo);
});

test('notas: data da última edição curta', () => {
  const agora = new Date(2026, 10, 18, 15, 0);
  assert.equal(editadaLabel(new Date(2026, 10, 18, 9, 5).toISOString(), agora), 'hoje, 09:05');
  assert.equal(editadaLabel(new Date(2026, 10, 17, 23, 0).toISOString(), agora), 'ontem');
  assert.equal(editadaLabel(new Date(2026, 2, 3, 12, 0).toISOString(), agora), '3 mar');
  assert.equal(editadaLabel(new Date(2025, 10, 12, 12, 0).toISOString(), agora), '12/11/2025');
  assert.equal(editadaLabel('lixo', agora), '');
});

test('migration não aplicada é reconhecida', () => {
  assert.ok(tabelaFaltando({ code: 'PGRST205', message: "Could not find the table 'public.erp_tarefas'" }));
  assert.ok(tabelaFaltando({ code: '42P01', message: 'relation "erp_notas" does not exist' }));
  assert.ok(!tabelaFaltando({ code: '42501', message: 'permission denied' }));
  assert.ok(!tabelaFaltando(null));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
