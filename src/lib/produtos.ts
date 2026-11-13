// 📦 Regras puras da tela de Produtos (Cadastros › Produtos), testadas em scripts/tests/produtos.test.ts:
// categoria (smartwatch / pulseira / fone / outros acessórios), margem colorida, selo de estoque, busca, filtros,
// ordem, cards do topo, validação do cadastro (NCM 8 dígitos, GTIN), duplicar, edição em lote e filtros no
// endereço (?pr_…), para o F5 não perder.
// Antes da migration 20261123120000_produtos_cadastro.sql as colunas ativo/origem/unidade/gtin não existem:
// tudo aqui trata a falta delas como "ativo", origem 0, unidade "Pc" e "SEM GTIN".

// Categoria = classificação da TELA. No banco, products.category é só 'smartwatch' ou 'acessorio' (Controle de
// Estoque, Nova Venda e a extensão só conhecem esses dois); pulseira/fone saem do nome. Gravar sempre via categoriaBanco.
export type Categoria = 'smartwatch' | 'pulseira' | 'fone' | 'acessorio';
export type CategoriaBanco = 'smartwatch' | 'acessorio';
export type FiltroCat = 'todos' | Categoria;
export type Situacao = 'todos' | 'sem-ncm' | 'sem-estoque' | 'estoque-baixo' | 'inativos';
export type Ordem = 'nome' | 'preco' | 'margem' | 'estoque';
export interface Filtros { cat: FiltroCat; sit: Situacao; busca: string; ordem: Ordem; dir: 'asc' | 'desc' }
export interface Produto {
  id: string; model: string; color?: string | null; category?: string | null; supplier?: string | null; sku?: string | null;
  ncm?: string | null; cost?: number | string | null; price?: number | string | null; current_stock?: number | null;
  ativo?: boolean | null; origem?: number | string | null; unidade?: string | null; gtin?: string | null;
}

export const CATEGORIAS: [Categoria, string][] = [['smartwatch', 'Smartwatches'], ['pulseira', 'Pulseiras'], ['fone', 'Fones'], ['acessorio', 'Outros acessórios']];
export const FILTROS_CAT: [FiltroCat, string][] = [['todos', 'Todos'], ...CATEGORIAS];
export const SITUACOES: [Situacao, string][] = [['todos', 'Ativos'], ['sem-ncm', 'Sem NCM'], ['sem-estoque', 'Sem estoque'], ['estoque-baixo', 'Estoque baixo'], ['inativos', 'Inativos']];
export const ORDENS: [Ordem, string][] = [['nome', 'Nome'], ['preco', 'Preço'], ['margem', 'Margem'], ['estoque', 'Estoque']];
export const PADRAO: Filtros = { cat: 'todos', sit: 'todos', busca: '', ordem: 'nome', dir: 'asc' };
export const ESTOQUE_BAIXO = 2;
export const ORIGEM_PADRAO = 0;
export const UNIDADE_PADRAO = 'Pc';
export const SEM_GTIN = 'SEM GTIN';
// origem da mercadoria (tabela da NF-e, campo orig)
export const ORIGENS: [number, string][] = [
  [0, '0 – Nacional'], [1, '1 – Estrangeira, importação direta'], [2, '2 – Estrangeira, adquirida no mercado interno'],
  [3, '3 – Nacional, conteúdo de importação > 40%'], [4, '4 – Nacional, processos básicos'], [5, '5 – Nacional, conteúdo de importação ≤ 40%'],
  [6, '6 – Estrangeira, importação direta, sem similar'], [7, '7 – Estrangeira, mercado interno, sem similar'], [8, '8 – Nacional, conteúdo de importação > 70%'],
];

const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v: number) => Math.round(v * 100) / 100;

// ── categoria, situação ──
// "acessorio" vira Pulseiras/Fones pelo nome; sem categoria = outros acessórios
// ('pulseira'/'fone' gravados por engano antes da migration 20261124120000 ainda são lidos como tal)
export function categoriaDe(p: Pick<Produto, 'category' | 'model' | 'color'>): Categoria {
  const c = String(p.category || '').toLowerCase();
  if (c === 'smartwatch' || c === 'pulseira' || c === 'fone') return c;
  const nome = `${p.model || ''} ${p.color || ''}`;
  if (/pulseira/i.test(nome)) return 'pulseira';
  if (/\bfones?\b/i.test(nome)) return 'fone';
  return 'acessorio';
}
// o que vai para products.category: só 'smartwatch' ou 'acessorio'
export const categoriaBanco = (c: Categoria | string | null | undefined): CategoriaBanco => (c === 'smartwatch' ? 'smartwatch' : 'acessorio');
export const rotuloCategoria = (c: Categoria) => CATEGORIAS.find((x) => x[0] === c)?.[1] || c;
export const ativo = (p: Pick<Produto, 'ativo'>) => p.ativo !== false;
export const ncmOk = (ncm: unknown) => /^\d{8}$/.test(dig(ncm));
export const estoqueDe = (p: Pick<Produto, 'current_stock'>) => num(p.current_stock);
export type SeloEstoque = 'sem' | 'baixo' | 'ok';
export const seloEstoque = (qtd: number): SeloEstoque => (qtd <= 0 ? 'sem' : qtd <= ESTOQUE_BAIXO ? 'baixo' : 'ok');

// ── margem (sobre o preço de venda) ──
export type CorMargem = 'verde' | 'amarela' | 'vermelha' | 'nenhuma';
export function margem(custo: unknown, preco: unknown): { valor: number; pct: number | null; cor: CorMargem } {
  const c = num(custo), p = num(preco);
  if (p <= 0) return { valor: r2(p - c), pct: null, cor: 'nenhuma' };
  const pct = ((p - c) / p) * 100;
  return { valor: r2(p - c), pct: Math.round(pct * 10) / 10, cor: pct >= 50 ? 'verde' : pct >= 30 ? 'amarela' : 'vermelha' };
}

// ── busca, filtros, ordem ──
// modelo, cor, SKU (parte) ou NCM (com ou sem pontos); cada palavra precisa aparecer
export function casaBusca(p: Produto, busca: string): boolean {
  const b = semAcento(busca).trim();
  if (!b) return true;
  const texto = semAcento(`${p.model || ''} ${p.color || ''} ${p.sku || ''}`);
  const ncm = dig(p.ncm);
  return b.split(/\s+/).every((w) => { const n = w.replace(/[.-]/g, ''); return texto.includes(w) || (/^\d{2,}$/.test(n) && ncm.includes(n)); });
}
export function casaSituacao(p: Produto, sit: Situacao): boolean {
  if (sit === 'inativos') return !ativo(p);
  if (!ativo(p)) return false; // as outras visões mostram só os ativos
  if (sit === 'sem-ncm') return !ncmOk(p.ncm);
  if (sit === 'sem-estoque') return estoqueDe(p) <= 0;
  if (sit === 'estoque-baixo') return estoqueDe(p) > 0 && estoqueDe(p) <= ESTOQUE_BAIXO;
  return true;
}
export function ordenar(lista: Produto[], ordem: Ordem, dir: 'asc' | 'desc'): Produto[] {
  const s = dir === 'asc' ? 1 : -1;
  const nome = (p: Produto) => semAcento(`${p.model || ''} ${p.color || ''}`);
  const m = (p: Produto) => margem(p.cost, p.price).pct ?? -Infinity;
  const cmp: Record<Ordem, (a: Produto, b: Produto) => number> = {
    nome: (a, b) => nome(a).localeCompare(nome(b), 'pt-BR'),
    preco: (a, b) => num(a.price) - num(b.price),
    margem: (a, b) => (m(a) === m(b) ? 0 : m(a) < m(b) ? -1 : 1),
    estoque: (a, b) => estoqueDe(a) - estoqueDe(b),
  };
  return [...lista].sort((a, b) => (cmp[ordem](a, b) * s) || nome(a).localeCompare(nome(b), 'pt-BR'));
}
export function aplicar(lista: Produto[], f: Filtros): Produto[] {
  return ordenar(lista.filter((p) => (f.cat === 'todos' || categoriaDe(p) === f.cat) && casaSituacao(p, f.sit) && casaBusca(p, f.busca)), f.ordem, f.dir);
}
// clicar no cabeçalho: mesma coluna inverte; outra começa em nome A→Z, números do maior para o menor
export const trocarOrdem = (f: Filtros, ordem: Ordem): Filtros => ({ ...f, ordem, dir: f.ordem === ordem ? (f.dir === 'asc' ? 'desc' : 'asc') : ordem === 'nome' ? 'asc' : 'desc' });

// ── cards do topo (só produtos ativos; estoque negativo não soma) ──
export function resumo(lista: Produto[]) {
  const at = lista.filter(ativo);
  let unidades = 0, custo = 0, venda = 0;
  for (const p of at) {
    const q = Math.max(0, estoqueDe(p));
    unidades += q; custo += q * num(p.cost); venda += q * num(p.price);
  }
  return { ativos: at.length, unidades, valorCusto: r2(custo), valorVenda: r2(venda), semNcm: at.filter((p) => !ncmOk(p.ncm)).length, inativos: lista.length - at.length };
}

// ── cadastro ──
export interface Form { model: string; color: string; category: Categoria; supplier: string; sku: string; ncm: string; origem: string; unidade: string; gtin: string; cost: string; price: string }
export const FORM_VAZIO: Form = { model: '', color: '', category: 'smartwatch', supplier: '', sku: '', ncm: '', origem: String(ORIGEM_PADRAO), unidade: UNIDADE_PADRAO, gtin: SEM_GTIN, cost: '', price: '' };
const numTxt = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
export const formDe = (p: Produto): Form => ({
  model: p.model || '', color: p.color || '', category: categoriaDe(p), supplier: p.supplier || '', sku: p.sku || '', ncm: dig(p.ncm),
  origem: String(p.origem ?? ORIGEM_PADRAO), unidade: p.unidade || UNIDADE_PADRAO, gtin: p.gtin || SEM_GTIN, cost: numTxt(p.cost), price: numTxt(p.price),
});
// duplicar: tudo menos SKU e estoque (para cadastrar outra cor rápido); a cor fica vazia para digitar a nova
export const duplicar = (p: Produto): Form => ({ ...formDe(p), sku: '', color: '' });
// número digitado com vírgula ou ponto ("1.234,50", "99,9", "120.00")
export function numBR(v: unknown): number {
  const s = String(v ?? '').trim().replace(/\s|R\$/g, '');
  if (!s) return 0;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : NaN;
}
// GTIN/EAN: "SEM GTIN" ou 8/12/13/14 números com o dígito verificador certo
export function gtinOk(g: unknown): boolean {
  const s = String(g ?? '').trim();
  if (!s || s.toUpperCase() === SEM_GTIN) return true;
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
  const d = s.split('').map(Number), dv = d.pop()!;
  const soma = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === dv;
}
export const gtinLimpo = (g: unknown) => { const s = String(g ?? '').trim(); return !s || s.toUpperCase() === SEM_GTIN || !gtinOk(s) ? SEM_GTIN : s; };
// problemas que impedem salvar (vazio = ok). outros = produtos já cadastrados (SKU repetido)
export function validar(f: Form, outros: Produto[] = [], idAtual?: string | null): string[] {
  const e: string[] = [];
  if (!f.model.trim()) e.push('Informe o modelo.');
  if (f.ncm.trim() && !ncmOk(f.ncm)) e.push('NCM precisa ter 8 números.');
  if (dig(f.ncm).length > 8) e.push('NCM precisa ter 8 números.');
  if (!gtinOk(f.gtin)) e.push('GTIN/EAN inválido (8, 12, 13 ou 14 números com o dígito verificador) — ou use "SEM GTIN".');
  const o = Number(f.origem);
  if (!Number.isInteger(o) || o < 0 || o > 8) e.push('Origem precisa ser de 0 a 8.');
  if (!f.unidade.trim() || f.unidade.trim().length > 6) e.push('Unidade precisa ter de 1 a 6 letras (ex.: Pc, Un).');
  if (Number.isNaN(numBR(f.cost)) || numBR(f.cost) < 0) e.push('Custo inválido.');
  if (Number.isNaN(numBR(f.price)) || numBR(f.price) < 0) e.push('Preço inválido.');
  const sku = f.sku.trim().toLowerCase();
  if (sku && outros.some((p) => p.id !== idAtual && String(p.sku || '').trim().toLowerCase() === sku)) e.push(`O SKU "${f.sku.trim()}" já é de outro produto.`);
  return [...new Set(e)];
}
// dados para gravar no banco (fiscais separados: antes da migration, grava sem eles)
export function paraBanco(f: Form) {
  return {
    base: {
      model: f.model.trim(), color: f.color.trim(), category: categoriaBanco(f.category), supplier: f.supplier.trim(), sku: f.sku.trim() || null,
      ncm: dig(f.ncm) || null, cost: r2(numBR(f.cost) || 0), price: r2(numBR(f.price) || 0),
    },
    fiscal: { origem: Number(f.origem) || 0, unidade: f.unidade.trim() || UNIDADE_PADRAO, gtin: gtinLimpo(f.gtin) },
  };
}
// erro do Supabase por coluna que ainda não existe (migration não aplicada)
export const faltaColuna = (err: { code?: string; message?: string } | null | undefined) =>
  !!err && (err.code === 'PGRST204' || err.code === '42703' || /column .* (does not exist|not find)|could not find the '.*' column/i.test(err.message || ''));
// categoria nova (pulseira/fone) barrada por alguma regra antiga do banco: grava como "acessorio"
export const categoriaRecusada = (err: { code?: string } | null | undefined) => !!err && err.code === '23514';

// ── edição em lote ──
export type Lote =
  | { tipo: 'categoria'; categoria: Categoria }
  | { tipo: 'ncm'; ncm: string }
  | { tipo: 'preco'; modo: 'valor' | 'pct'; valor: number }
  | { tipo: 'ativo'; ativo: boolean };
// novo preço: valor fixo, ou +/- % arredondado para centavos (nunca negativo)
export const precoNovo = (atual: unknown, modo: 'valor' | 'pct', valor: number) => Math.max(0, r2(modo === 'valor' ? valor : num(atual) * (1 + valor / 100)));
export function loteValido(l: Lote): string | null {
  if (l.tipo === 'ncm' && !ncmOk(l.ncm)) return 'NCM precisa ter 8 números.';
  if (l.tipo === 'preco' && (!Number.isFinite(l.valor) || (l.modo === 'valor' && l.valor < 0) || (l.modo === 'pct' && l.valor <= -100))) return 'Valor inválido.';
  return null;
}
// alterações por produto (só os que mudam de verdade)
export function alteracoesLote(lista: Produto[], l: Lote): { id: string; dados: Record<string, unknown> }[] {
  const out: { id: string; dados: Record<string, unknown> }[] = [];
  for (const p of lista) {
    if (l.tipo === 'categoria' && p.category !== categoriaBanco(l.categoria)) out.push({ id: p.id, dados: { category: categoriaBanco(l.categoria) } });
    if (l.tipo === 'ncm' && dig(p.ncm) !== dig(l.ncm)) out.push({ id: p.id, dados: { ncm: dig(l.ncm) } });
    if (l.tipo === 'preco') { const n = precoNovo(p.price, l.modo, l.valor); if (n !== r2(num(p.price))) out.push({ id: p.id, dados: { price: n } }); }
    if (l.tipo === 'ativo' && ativo(p) !== l.ativo) out.push({ id: p.id, dados: { ativo: l.ativo } });
  }
  return out;
}
export function textoLote(l: Lote, n: number): string {
  const q = `${n} produto${n === 1 ? '' : 's'}`;
  if (l.tipo === 'categoria') return `Mudar a categoria de ${q} para ${rotuloCategoria(l.categoria)}?`;
  if (l.tipo === 'ncm') return `Mudar o NCM de ${q} para ${dig(l.ncm)}?`;
  if (l.tipo === 'preco') return l.modo === 'valor' ? `Mudar o preço de ${q} para R$ ${l.valor.toFixed(2).replace('.', ',')}?` : `${l.valor >= 0 ? 'Aumentar' : 'Baixar'} o preço de ${q} em ${Math.abs(l.valor)}%?`;
  return `${l.ativo ? 'Ativar' : 'Desativar'} ${q}?`;
}

// ── filtros no endereço (só o que é diferente do padrão; prefixo pr_) ──
const um = <T extends string>(v: string | null, validos: readonly T[], def: T): T => (v && (validos as readonly string[]).includes(v) ? (v as T) : def);
export function lerFiltros(search: string): Filtros {
  const q = new URLSearchParams(search);
  return {
    cat: um(q.get('pr_cat'), FILTROS_CAT.map((x) => x[0]), PADRAO.cat),
    sit: um(q.get('pr_sit'), SITUACOES.map((x) => x[0]), PADRAO.sit),
    busca: (q.get('pr_busca') || '').slice(0, 80),
    ordem: um(q.get('pr_ordem'), ORDENS.map((x) => x[0]), PADRAO.ordem),
    dir: q.get('pr_dir') === 'desc' ? 'desc' : q.get('pr_dir') === 'asc' ? 'asc' : PADRAO.dir,
  };
}
const CHAVES: [keyof Filtros, string][] = [['cat', 'pr_cat'], ['sit', 'pr_sit'], ['busca', 'pr_busca'], ['ordem', 'pr_ordem'], ['dir', 'pr_dir']];
export function hrefComFiltros(href: string, f: Filtros): string {
  const url = new URL(href);
  for (const [k, p] of CHAVES) { if (f[k] !== PADRAO[k] && f[k] !== '') url.searchParams.set(p, String(f[k])); else url.searchParams.delete(p); }
  return url.pathname + url.search + url.hash;
}
export function hrefSemFiltros(href: string): string {
  const url = new URL(href);
  for (const [, p] of CHAVES) url.searchParams.delete(p);
  return url.pathname + url.search + url.hash;
}
