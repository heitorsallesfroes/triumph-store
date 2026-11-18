// 📓 Gestão › Anotações: regras puras das TAREFAS (agrupamento por data, atrasadas, repetição, ordem, contador do
// menu) e das NOTAS (cores, busca, ordem, listas com "- "). Sem banco nem React: testadas em
// scripts/tests/anotacoes.test.ts. Datas são "AAAA-MM-DD" no horário local (sem fuso); null = "Algum dia".

export type Repeticao = 'diario' | 'uteis' | 'semanal';
export const REPETICOES: { id: Repeticao; label: string }[] = [
  { id: 'diario', label: 'Todo dia' },
  { id: 'uteis', label: 'Dias úteis' },
  { id: 'semanal', label: 'Toda semana' },
];

export interface Tarefa {
  id: string;
  texto: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  importante: boolean;
  repeticao: Repeticao | null;
  position: number;
  created_at: string;
  updated_at?: string;
}

export type GrupoId = 'atrasadas' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'algum';
export const GRUPOS: { id: GrupoId; label: string }[] = [
  { id: 'atrasadas', label: 'Atrasadas' },
  { id: 'hoje', label: 'Hoje' },
  { id: 'amanha', label: 'Amanhã' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'depois', label: 'Mais pra frente' },
  { id: 'algum', label: 'Algum dia' },
];

// ── datas ─────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k: string): Date => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const isDateKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(parseKey(k)) === k;
export const addDays = (k: string, n: number): string => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
export const weekday = (k: string): number => parseKey(k).getDay(); // 0 = domingo
// fim da semana = domingo (semana de segunda a domingo); no domingo é o próprio dia
export const endOfWeek = (today: string): string => addDays(today, (7 - weekday(today)) % 7);

// ── escolha rápida do dia ao criar / mudar a data ──────────────────────────
export type Rapida = 'hoje' | 'amanha' | 'semana' | 'algum';
export const RAPIDAS: { id: Rapida; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'amanha', label: 'Amanhã' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'algum', label: 'Algum dia' },
];
// "Esta semana" = até domingo; se domingo já é hoje ou amanhã, fica no próprio domingo (cai em Hoje/Amanhã)
export function quickDate(r: Rapida, today: string): string | null {
  if (r === 'hoje') return today;
  if (r === 'amanha') return addDays(today, 1);
  if (r === 'semana') return endOfWeek(today);
  return null;
}

// ── grupos ────────────────────────────────────────────────────────────────
export function groupOf(due: string | null, today: string): GrupoId {
  if (!due) return 'algum';
  if (due < today) return 'atrasadas';
  if (due === today) return 'hoje';
  if (due === addDays(today, 1)) return 'amanha';
  if (due <= endOfWeek(today)) return 'semana';
  return 'depois';
}
export const isOverdue = (t: Pick<Tarefa, 'due_date' | 'done'>, today: string) => !t.done && !!t.due_date && t.due_date < today;

// ordem dentro do grupo: a posição (a que o usuário arrastou); empate = mais antiga primeiro
const byPos = (a: Tarefa, b: Tarefa) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
export const sortGroup = (list: Tarefa[]): Tarefa[] => [...list].sort(byPos);

export interface Agrupado { grupos: { id: GrupoId; label: string; tarefas: Tarefa[] }[]; feitas: Tarefa[] }
// grupos com tarefas não feitas (só os que têm alguma, menos "Hoje", que aparece sempre) e as feitas (mais recentes primeiro)
export function agrupar(tarefas: Tarefa[], today: string): Agrupado {
  const by = new Map<GrupoId, Tarefa[]>(GRUPOS.map((g) => [g.id, []]));
  const feitas: Tarefa[] = [];
  for (const t of tarefas) {
    if (t.done) feitas.push(t);
    else by.get(groupOf(t.due_date, today))!.push(t);
  }
  feitas.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '') || byPos(a, b));
  const grupos = GRUPOS
    .map((g) => ({ ...g, tarefas: sortGroup(by.get(g.id)!) }))
    .filter((g) => g.id === 'hoje' || g.tarefas.length > 0);
  return { grupos, feitas };
}

// contador do menu: hoje + atrasadas que faltam
export const pendentesHoje = (tarefas: Pick<Tarefa, 'due_date' | 'done'>[], today: string) =>
  tarefas.filter((t) => !t.done && !!t.due_date && t.due_date <= today).length;

// ── repetição ─────────────────────────────────────────────────────────────
// Próxima data ao marcar como feita: a primeira ocorrência DEPOIS da data da tarefa e depois de hoje (feita
// atrasada não cria outra atrasada; feita adiantada pula para a seguinte). Sem data = conta de hoje.
//   diario  : dia seguinte
//   uteis   : próximo dia de segunda a sexta
//   semanal : mesmo dia da semana da data original
export function nextDue(due: string | null, rep: Repeticao, today: string): string {
  const base = due && due > today ? due : today;
  if (rep === 'diario') return addDays(base, 1);
  if (rep === 'uteis') {
    let d = addDays(base, 1);
    while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
    return d;
  }
  let d = addDays(due || today, 7);
  while (d <= today) d = addDays(d, 7);
  return d;
}

// ── ordem / arrastar ──────────────────────────────────────────────────────
// posição de uma tarefa nova: no fim de tudo
export const nextPosition = (tarefas: Pick<Tarefa, 'position'>[]) => tarefas.reduce((m, t) => Math.max(m, t.position), 0) + 1;

// move "fromId" para o lugar de "toId" dentro da lista do grupo (já ordenada) e devolve a nova ordem
export function moveInList<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((t) => t.id === fromId);
  const to = list.findIndex((t) => t.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

// posições para gravar depois de arrastar: a nova ordem recebe as mesmas posições do grupo (ordenadas), assim
// nada fora do grupo muda; posições repetidas viram 1, 2, 3… depois da maior. Só devolve as que mudaram.
export function reorderUpdates(oldOrder: Tarefa[], newOrder: Tarefa[]): { id: string; position: number }[] {
  let slots = oldOrder.map((t) => t.position).sort((a, b) => a - b);
  if (new Set(slots).size !== slots.length) {
    const top = Math.max(0, ...slots);
    slots = slots.map((_, i) => top + i + 1);
  }
  return newOrder
    .map((t, i) => ({ id: t.id, position: slots[i] }))
    .filter((u, i) => newOrder[i].position !== u.position);
}

// ── rótulos ───────────────────────────────────────────────────────────────
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function dueLabel(due: string | null, today: string): string {
  if (!due) return 'Algum dia';
  if (due === today) return 'Hoje';
  if (due === addDays(today, 1)) return 'Amanhã';
  if (due === addDays(today, -1)) return 'Ontem';
  const d = parseKey(due);
  const base = `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === parseKey(today).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// ── NOTAS ─────────────────────────────────────────────────────────────────
export type Cor = 'amarelo' | 'verde' | 'azul' | 'rosa' | 'roxo' | 'cinza';
export const CORES: { id: Cor; label: string }[] = [
  { id: 'amarelo', label: 'Amarelo' },
  { id: 'verde', label: 'Verde' },
  { id: 'azul', label: 'Azul' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'roxo', label: 'Roxo' },
  { id: 'cinza', label: 'Cinza' },
];
export const corValida = (c: unknown): Cor => (CORES.some((x) => x.id === c) ? (c as Cor) : 'amarelo');

export interface Nota {
  id: string;
  titulo: string;
  texto: string;
  cor: Cor;
  fixada: boolean;
  created_at: string;
  updated_at: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// fixadas primeiro, depois a editada mais recente; a busca ignora acento e maiúscula e procura título e texto
export function filtrarNotas(notas: Nota[], busca: string): Nota[] {
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  return notas
    .filter((n) => { const alvo = norm(`${n.titulo}\n${n.texto}`); return termos.every((t) => alvo.includes(t)); })
    .sort((a, b) => Number(b.fixada) - Number(a.fixada) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
}
export const notaVazia = (n: Pick<Nota, 'titulo' | 'texto'>) => !n.titulo.trim() && !n.texto.trim();

// capa do cartão: só o título; sem título, a primeira linha do texto (cortada com "…") para saber o que é
export interface Capa { titulo: string; semTitulo: boolean; temTexto: boolean }
export function capaDaNota(n: Pick<Nota, 'titulo' | 'texto'>, max = 60): Capa {
  const temTexto = !!n.texto.trim();
  const titulo = n.titulo.trim();
  if (titulo) return { titulo, semTitulo: false, temTexto };
  const linha = (n.texto.replace(/\r\n?/g, '\n').split('\n').find((l) => l.trim()) || '').trim().replace(/^[-*•]\s+/, '');
  if (!linha) return { titulo: 'Nota vazia', semTitulo: true, temTexto: false };
  return { titulo: linha.length > max ? `${linha.slice(0, max).trimEnd()}…` : linha, semTitulo: true, temTexto };
}

// data da última edição, curta: "hoje, 14:05", "ontem", "12 nov" (mesmo ano) ou "12/11/2025"
export function editadaLabel(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const k = dateKey(d), hoje = dateKey(agora);
  if (k === hoje) return `hoje, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (k === addDays(hoje, -1)) return 'ontem';
  if (d.getFullYear() === agora.getFullYear()) return `${d.getDate()} ${MESES[d.getMonth()]}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// texto da nota em blocos para mostrar: linhas com "- " (ou "* ") viram itens de lista; o resto, parágrafos
export type Bloco = { tipo: 'lista'; itens: string[] } | { tipo: 'texto'; linhas: string[] };
export function blocosDoTexto(texto: string): Bloco[] {
  const out: Bloco[] = [];
  for (const linha of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(linha);
    const last = out[out.length - 1];
    if (m) {
      if (last && last.tipo === 'lista') last.itens.push(m[1]);
      else out.push({ tipo: 'lista', itens: [m[1]] });
    } else if (last && last.tipo === 'texto') last.linhas.push(linha);
    else out.push({ tipo: 'texto', linhas: [linha] });
  }
  return out;
}

// erro do Supabase de tabela que ainda não existe (migration não aplicada)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tabelaFaltando = (e: any) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(String(e.message || '')));
