// 🧾 Regras puras da lista de Notas fiscais (Gestão › Notas fiscais), testadas em scripts/tests/nfeLista.test.ts:
// período pela data de emissão no horário do RJ, abas com contador, ambiente, busca, ordem, rodapé, páginas e os
// filtros no endereço (?nf_aba=…), para o F5 não perder. O servidor traz as notas do ambiente e do período (op=lista).

export type Aba = 'todas' | 'pendentes' | 'autorizadas' | 'rejeitadas' | 'canceladas';
export type Amb = 'reais' | 'testes' | 'todas';
export type Periodo = 'hoje' | 'ontem' | '7dias' | 'mes' | 'mes-passado' | 'datas';
export type Ordem = 'numero' | 'data' | 'cliente' | 'valor';
export interface Filtros { aba: Aba; amb: Amb; periodo: Periodo; de: string; ate: string; busca: string; ordem: Ordem; dir: 'asc' | 'desc'; pagina: number }
export interface NotaLista {
  id: string; venda_id?: string | null; ambiente: number; serie: number; numero: number; chave?: string | null; status: string;
  cstat?: string | null; motivo?: string | null; cliente?: string | null; valor?: number | string | null; criado_em: string;
  autorizada_em?: string | null; cancelada_em?: string | null; uf?: string | null; doc?: string | null;
}

export const ABAS: [Aba, string][] = [['todas', 'Todas'], ['pendentes', 'Pendentes'], ['autorizadas', 'Autorizadas'], ['rejeitadas', 'Rejeitadas'], ['canceladas', 'Canceladas']];
export const AMBS: [Amb, string][] = [['reais', 'Notas reais'], ['testes', 'Testes'], ['todas', 'Todas']];
export const PERIODOS: [Periodo, string][] = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7dias', '7 dias'], ['mes', 'Este mês'], ['mes-passado', 'Mês passado'], ['datas', 'Escolher datas']];
export const ORDENS: Ordem[] = ['numero', 'data', 'cliente', 'valor'];
export const POR_PAGINA = 100;
export const PADRAO: Filtros = { aba: 'todas', amb: 'reais', periodo: 'mes', de: '', ate: '', busca: '', ordem: 'data', dir: 'desc', pagina: 1 };

// ── período (data de emissão, horário do RJ: -03:00 o ano todo) ──
const FUSO_MS = 3 * 3600e3;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
// dia de hoje no RJ (AAAA-MM-DD)
export const hojeRJ = (agora = new Date()) => ymd(new Date(agora.getTime() - FUSO_MS));
const somaDias = (dia: string, n: number) => ymd(new Date(Date.parse(`${dia}T12:00:00Z`) + n * 864e5));
const inicioMes = (dia: string, n = 0) => { const [a, m] = dia.split('-').map(Number); return ymd(new Date(Date.UTC(a, m - 1 + n, 1, 12))); };
const meiaNoite = (dia: string) => `${dia}T00:00:00-03:00`;
// [de, ate) em ISO com fuso, e os dias (inclusive) para mostrar
export function intervalo(f: Pick<Filtros, 'periodo' | 'de' | 'ate'>, agora = new Date()): { de: string; ate: string; dias: [string, string] } {
  const hoje = hojeRJ(agora);
  let a = hoje, b = hoje; // dias, inclusive
  if (f.periodo === 'ontem') { a = b = somaDias(hoje, -1); }
  else if (f.periodo === '7dias') { a = somaDias(hoje, -6); }
  else if (f.periodo === 'mes') { a = inicioMes(hoje); b = somaDias(inicioMes(hoje, 1), -1); }
  else if (f.periodo === 'mes-passado') { a = inicioMes(hoje, -1); b = somaDias(inicioMes(hoje), -1); }
  else if (f.periodo === 'datas') {
    if (DIA.test(f.de) && DIA.test(f.ate)) { a = f.de <= f.ate ? f.de : f.ate; b = f.de <= f.ate ? f.ate : f.de; }
    else { a = inicioMes(hoje); b = somaDias(inicioMes(hoje, 1), -1); } // datas incompletas: este mês
  }
  return { de: meiaNoite(a), ate: meiaNoite(somaDias(b, 1)), dias: [a, b] };
}

// ── abas, busca, ordem ──
export const abaDaNota = (status: string): Aba => (status === 'autorizada' ? 'autorizadas' : status === 'rejeitada' ? 'rejeitadas'
  : status === 'cancelada' ? 'canceladas' : 'pendentes'); // pendente e emitindo
const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');
// cliente (sem acento), CPF/CNPJ (com ou sem pontos), número da nota (exato) ou chave (parte dela)
export function casaBusca(n: NotaLista, busca: string): boolean {
  const b = busca.trim();
  if (!b) return true;
  if (semAcento(n.cliente).includes(semAcento(b))) return true;
  const d = dig(b);
  if (!d || /[a-z]/i.test(b.replace(/[.\-/\s]/g, ''))) return false;
  return String(n.numero) === d || (d.length >= 5 && dig(n.doc).includes(d)) || (d.length >= 4 && dig(n.chave).includes(d));
}
const ambOk = (n: NotaLista, amb: Amb) => amb === 'todas' || (amb === 'reais' ? n.ambiente === 1 : n.ambiente === 2);
// notas do ambiente e da busca (antes da aba): é delas que saem os contadores das abas
export const base = (notas: NotaLista[], f: Pick<Filtros, 'amb' | 'busca'>) => notas.filter((n) => ambOk(n, f.amb) && casaBusca(n, f.busca));
export function contadores(notas: NotaLista[]): Record<Aba, number> {
  const c: Record<Aba, number> = { todas: notas.length, pendentes: 0, autorizadas: 0, rejeitadas: 0, canceladas: 0 };
  for (const n of notas) c[abaDaNota(n.status)]++;
  return c;
}
const valorDe = (n: NotaLista) => Number(n.valor) || 0;
export const dataEmissao = (n: NotaLista) => n.criado_em;
export function ordenar(notas: NotaLista[], ordem: Ordem, dir: 'asc' | 'desc'): NotaLista[] {
  const s = dir === 'asc' ? 1 : -1;
  const cmp: Record<Ordem, (a: NotaLista, b: NotaLista) => number> = {
    numero: (a, b) => (a.numero - b.numero) || (a.serie - b.serie) || (a.ambiente - b.ambiente),
    data: (a, b) => dataEmissao(a).localeCompare(dataEmissao(b)),
    cliente: (a, b) => semAcento(a.cliente).localeCompare(semAcento(b.cliente), 'pt-BR'),
    valor: (a, b) => valorDe(a) - valorDe(b),
  };
  return [...notas].sort((a, b) => (cmp[ordem](a, b) * s) || dataEmissao(b).localeCompare(dataEmissao(a)));
}
// lista final (aba + ordem) e o rodapé: quantidade de notas e valor sem canceladas nem rejeitadas
export function aplicar(notas: NotaLista[], f: Filtros) {
  const b = base(notas, f);
  const naAba = f.aba === 'todas' ? b : b.filter((n) => abaDaNota(n.status) === f.aba);
  const lista = ordenar(naAba, f.ordem, f.dir);
  const valor = Math.round(lista.filter((n) => !['cancelada', 'rejeitada'].includes(n.status)).reduce((s, n) => s + valorDe(n), 0) * 100) / 100;
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, f.pagina), paginas);
  return { lista, contadores: contadores(b), quantidade: lista.length, valor, paginas, pagina, daPagina: lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA) };
}
// clicar no cabeçalho: mesma coluna inverte; outra coluna começa em ordem natural (texto A→Z, número/data/valor maior primeiro)
export const trocarOrdem = (f: Filtros, ordem: Ordem): Filtros => ({ ...f, ordem, dir: f.ordem === ordem ? (f.dir === 'asc' ? 'desc' : 'asc') : ordem === 'cliente' ? 'asc' : 'desc', pagina: 1 });

// ── filtros no endereço (só o que é diferente do padrão; prefixo nf_ para não bater com os outros parâmetros) ──
const um = <T extends string>(v: string | null, validos: readonly T[], def: T): T => (v && (validos as readonly string[]).includes(v) ? (v as T) : def);
export function lerFiltros(search: string): Filtros {
  const q = new URLSearchParams(search);
  const de = q.get('nf_de') || '', ate = q.get('nf_ate') || '';
  return {
    aba: um(q.get('nf_aba'), ABAS.map((x) => x[0]), PADRAO.aba),
    amb: um(q.get('nf_amb'), AMBS.map((x) => x[0]), PADRAO.amb),
    periodo: um(q.get('nf_periodo'), PERIODOS.map((x) => x[0]), PADRAO.periodo),
    de: DIA.test(de) ? de : '', ate: DIA.test(ate) ? ate : '',
    busca: (q.get('nf_busca') || '').slice(0, 80),
    ordem: um(q.get('nf_ordem'), ORDENS, PADRAO.ordem),
    dir: q.get('nf_dir') === 'asc' ? 'asc' : q.get('nf_dir') === 'desc' ? 'desc' : PADRAO.dir,
    pagina: Math.max(1, parseInt(q.get('nf_pag') || '1', 10) || 1),
  };
}
const CHAVES: [keyof Filtros, string][] = [['aba', 'nf_aba'], ['amb', 'nf_amb'], ['periodo', 'nf_periodo'], ['de', 'nf_de'], ['ate', 'nf_ate'], ['busca', 'nf_busca'], ['ordem', 'nf_ordem'], ['dir', 'nf_dir'], ['pagina', 'nf_pag']];
// endereço com os filtros (os outros parâmetros, como ?pagina=notas-fiscais, e o #hash ficam)
export function hrefComFiltros(href: string, f: Filtros): string {
  const url = new URL(href);
  for (const [k, p] of CHAVES) {
    const v = f[k], d = PADRAO[k];
    const usar = (k === 'de' || k === 'ate') ? f.periodo === 'datas' && !!v : String(v) !== String(d) && String(v) !== '';
    if (usar) url.searchParams.set(p, String(v)); else url.searchParams.delete(p);
  }
  return url.pathname + url.search + url.hash;
}
// tira os filtros do endereço (ao sair da página)
export function hrefSemFiltros(href: string): string {
  const url = new URL(href);
  for (const [, p] of CHAVES) url.searchParams.delete(p);
  return url.pathname + url.search + url.hash;
}

// ── menu "…" flutuante (position fixed, por cima de tudo) ──
// abre embaixo do botão, alinhado à direita dele; vira para cima quando não cabe embaixo; nunca sai da tela
export interface Caixa { top: number; bottom: number; left: number; right: number }
export function posicaoMenu(botao: Caixa, menu: { w: number; h: number }, tela: { w: number; h: number }, gap = 4, margem = 8) {
  const limita = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  const espacoBaixo = tela.h - margem - (botao.bottom + gap);
  const espacoCima = botao.top - gap - margem;
  const up = menu.h > espacoBaixo && espacoCima > espacoBaixo;
  const top = limita(up ? botao.top - gap - menu.h : botao.bottom + gap, margem, tela.h - margem - menu.h);
  const left = limita(botao.right - menu.w, margem, tela.w - margem - menu.w);
  return { top, left, up };
}
