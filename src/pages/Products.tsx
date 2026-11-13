// 📦 Cadastros › Produtos — cadastro principal dos produtos do ERP (o Tiny fica só como integração temporária).
// Lista com busca (modelo, cor, SKU, NCM), filtros de categoria e situação, ordem por coluna e filtros no endereço
// (?pr_…, o F5 não perde); cards do topo; painel lateral de cadastro em seções (identificação, fiscal da NF-e
// própria, preços com margem na hora, estoque só leitura); Duplicar (outra cor rápido) e Desativar (some da Nova
// Venda, fica no histórico); edição em lote com confirmação. Regras puras em src/lib/produtos.ts.
// Antes da migration 20261123120000_produtos_cadastro.sql: tudo conta como ativo e os dados fiscais não são gravados.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, Plus, Search, X, RefreshCw, Watch, ShoppingBag, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Copy, Power,
  Pencil, AlertTriangle, Boxes, Wallet, Tag, FileWarning, Save,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/resumoAnualCalc';
import { useErpRefresh } from '../lib/erpRefresh';
import {
  CATEGORIAS, FILTROS_CAT, SITUACOES, ORIGENS, FORM_VAZIO, Filtros, Form, Lote, Ordem, Produto, Categoria,
  aplicar, ativo, alteracoesLote, categoriaDe, categoriaRecusada, duplicar, estoqueDe, faltaColuna, formDe, hrefComFiltros,
  hrefSemFiltros, lerFiltros, loteValido, margem, ncmOk, numBR, paraBanco, resumo, rotuloCategoria, seloEstoque, textoLote,
  trocarOrdem, validar,
} from '../lib/produtos';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inp = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm';
const lbl = 'block text-xs font-medium text-gray-400 mb-1';
const COR_MARGEM: Record<string, string> = { verde: 'text-green-400', amarela: 'text-yellow-400', vermelha: 'text-red-400', nenhuma: 'text-gray-500' };
const SELO_ESTOQUE: Record<string, string> = {
  sem: 'bg-red-500/15 text-red-400 border-red-500/40', baixo: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40', ok: 'bg-green-500/15 text-green-400 border-green-500/40',
};
const pctTxt = (p: number | null) => (p === null ? '—' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

type Painel = { modo: 'novo' | 'editar'; id: string | null; form: Form } | null;
type LoteTipo = Lote['tipo'];

export default function Products() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(window.location.search));
  const [buscaTxt, setBuscaTxt] = useState(filtros.busca);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [painel, setPainel] = useState<Painel>(null);
  const [salvando, setSalvando] = useState(false);
  const [errosForm, setErrosForm] = useState<string[]>([]);
  // edição em lote
  const [loteTipo, setLoteTipo] = useState<LoteTipo | ''>('');
  const [loteCat, setLoteCat] = useState<Categoria>('smartwatch');
  const [loteNcm, setLoteNcm] = useState('');
  const [lotePrecoModo, setLotePrecoModo] = useState<'valor' | 'pct'>('pct');
  const [lotePreco, setLotePreco] = useState('');
  const [loteAtivo, setLoteAtivo] = useState(false);
  const [confirmar, setConfirmar] = useState<{ lote: Lote; mudancas: { id: string; dados: Record<string, unknown> }[] } | null>(null);
  // Tiny (temporário)
  const [tinyAberto, setTinyAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const data = await fetchAllRows((f: number, t: number) => supabase.from('products').select('*').order('model').order('id').range(f, t));
      setProdutos((data || []) as Produto[]);
    } catch (e) {
      setErro(`Não consegui carregar os produtos: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useErpRefresh(() => carregar()); // "Atualizar" do topo

  // filtros no endereço (F5 não perde); ao sair da página, tira
  useEffect(() => { try { window.history.replaceState(window.history.state, '', hrefComFiltros(window.location.href, filtros)); } catch { /* sem history */ } }, [filtros]);
  useEffect(() => () => { try { window.history.replaceState(window.history.state, '', hrefSemFiltros(window.location.href)); } catch { /* sem history */ } }, []);
  useEffect(() => { const t = setTimeout(() => setFiltros((f) => (f.busca === buscaTxt ? f : { ...f, busca: buscaTxt })), 200); return () => clearTimeout(t); }, [buscaTxt]);
  useEffect(() => { setSel(new Set()); }, [filtros.cat, filtros.sit, filtros.busca]);
  // Esc fecha o painel
  useEffect(() => {
    if (!painel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPainel(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [painel]);

  const lista = useMemo(() => aplicar(produtos, filtros), [produtos, filtros]);
  const r = useMemo(() => resumo(produtos), [produtos]);
  const semMigracao = produtos.length > 0 && !('ativo' in produtos[0]);
  const mudar = (p: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...p }));
  const selecionados = useMemo(() => lista.filter((p) => sel.has(p.id)), [lista, sel]);
  const todosMarcados = lista.length > 0 && lista.every((p) => sel.has(p.id));

  // ── cadastro ──
  const abrirNovo = () => { setErrosForm([]); setPainel({ modo: 'novo', id: null, form: { ...FORM_VAZIO } }); };
  const abrirEditar = (p: Produto) => { setErrosForm([]); setPainel({ modo: 'editar', id: p.id, form: formDe(p) }); };
  const setCampo = (k: keyof Form, v: string) => setPainel((pn) => (pn ? { ...pn, form: { ...pn.form, [k]: v } } : pn));
  const atual = painel?.id ? produtos.find((p) => p.id === painel.id) || null : null;

  const gravar = async (dados: Record<string, unknown>, id: string | null) => {
    const q = id ? supabase.from('products').update(dados).eq('id', id) : supabase.from('products').insert([{ ...dados, current_stock: 0 }]);
    const { error } = await q;
    return error;
  };
  const salvar = async () => {
    if (!painel) return;
    const problemas = validar(painel.form, produtos, painel.id);
    setErrosForm(problemas);
    if (problemas.length) return;
    setSalvando(true);
    try {
      const { base, fiscal } = paraBanco(painel.form);
      let dados: Record<string, unknown> = { ...base, ...fiscal, updated_at: new Date().toISOString() };
      let aviso = '';
      let error = await gravar(dados, painel.id);
      if (error && faltaColuna(error)) { // migration ainda não aplicada: grava sem os dados fiscais
        dados = { ...base, updated_at: dados.updated_at };
        error = await gravar(dados, painel.id);
        aviso = ' (origem, unidade e GTIN só serão gravados depois da migration de produtos)';
      }
      if (error && categoriaRecusada(error) && base.category !== 'smartwatch') {
        dados = { ...dados, category: 'acessorio' };
        error = await gravar(dados, painel.id);
      }
      if (error) throw error;
      setMsg(`✅ Produto ${painel.modo === 'novo' ? 'cadastrado' : 'salvo'}${aviso}.`);
      setPainel(null);
      carregar();
    } catch (e) {
      setErrosForm([`Erro ao salvar: ${(e as { message?: string })?.message || 'erro desconhecido'}`]);
    } finally { setSalvando(false); }
  };
  const duplicarAtual = () => {
    if (!painel) return;
    setErrosForm([]);
    setPainel({ modo: 'novo', id: null, form: { ...painel.form, sku: '', color: '' } }); // o que está no painel, menos SKU e cor (estoque novo = 0)
    setMsg('📋 Cópia pronta: digite a nova cor e o SKU e salve.');
  };
  const alternarAtivo = async (p: Produto) => {
    const novo = !ativo(p);
    const { error } = await supabase.from('products').update({ ativo: novo, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) {
      setMsg(faltaColuna(error) ? '⚠️ Para ativar/desativar, aplique antes a migration de produtos (20261123120000_produtos_cadastro.sql).' : `⚠️ Erro: ${error.message}`);
      return;
    }
    setMsg(novo ? '✅ Produto ativado: volta a aparecer na Nova Venda.' : '✅ Produto desativado: some da Nova Venda e das listas, mas continua no histórico.');
    setPainel(null);
    carregar();
  };

  // ── edição em lote ──
  const montarLote = (): Lote | null => {
    if (loteTipo === 'categoria') return { tipo: 'categoria', categoria: loteCat };
    if (loteTipo === 'ncm') return { tipo: 'ncm', ncm: loteNcm.replace(/\D/g, '') };
    if (loteTipo === 'preco') return { tipo: 'preco', modo: lotePrecoModo, valor: numBR(lotePreco) };
    if (loteTipo === 'ativo') return { tipo: 'ativo', ativo: loteAtivo };
    return null;
  };
  const pedirLote = () => {
    const l = montarLote();
    if (!l) return;
    const e = loteValido(l);
    if (e) { setMsg(`⚠️ ${e}`); return; }
    setConfirmar({ lote: l, mudancas: alteracoesLote(selecionados, l) });
  };
  const aplicarLote = async () => {
    if (!confirmar) return;
    setSalvando(true);
    let ok = 0, falhou = '';
    for (const m of confirmar.mudancas) {
      let dados: Record<string, unknown> = { ...m.dados, updated_at: new Date().toISOString() };
      let { error } = await supabase.from('products').update(dados).eq('id', m.id);
      if (error && categoriaRecusada(error) && dados.category && dados.category !== 'smartwatch') {
        dados = { ...dados, category: 'acessorio' };
        ({ error } = await supabase.from('products').update(dados).eq('id', m.id));
      }
      if (error) { falhou = faltaColuna(error) ? 'aplique antes a migration de produtos para ativar/desativar' : error.message; break; }
      ok++;
    }
    setSalvando(false);
    setConfirmar(null);
    setMsg(falhou ? `⚠️ ${ok} alterado(s); parou: ${falhou}` : `✅ ${ok} produto(s) alterado(s).`);
    if (!falhou) { setSel(new Set()); setLoteTipo(''); }
    carregar();
  };

  // ── Tiny (temporário) ──
  const importarTiny = async (categoria: 'smartwatch' | 'acessorio') => {
    setImportando(true); setImportResult(null);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/import-tiny-products`, {
        method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ categoria }),
      });
      const data = await resp.json();
      if (data.success) { setImportResult(`✅ ${data.imported} produtos importados com sucesso!`); carregar(); } else setImportResult(`❌ Erro: ${data.error}`);
    } catch { setImportResult('❌ Erro ao importar produtos'); } finally { setImportando(false); }
  };

  const cab = (rot: string, o: Ordem | null, cls = '') => (
    <th className={`py-2 pr-3 font-medium ${cls}`}>
      {o ? (
        <button type="button" onClick={() => setFiltros((f) => trocarOrdem(f, o))} className={`inline-flex items-center gap-1 uppercase hover:text-white ${filtros.ordem === o ? 'text-white' : ''}`} aria-label={`Ordenar por ${rot}`}>
          {rot}{filtros.ordem === o && (filtros.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      ) : rot}
    </th>
  );
  const card = (icone: JSX.Element, titulo: string, valor: string, sub?: string, onClick?: () => void, destaque = false) => {
    const corpo = (
      <>
        <span className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide">{icone}{titulo}</span>
        <span className={`block text-2xl font-bold mt-1 ${destaque ? 'text-yellow-400' : 'text-white'}`}>{valor}</span>
        {sub && <span className="block text-xs text-gray-500 mt-0.5">{sub}</span>}
      </>
    );
    const cls = 'bg-gray-800 rounded-xl border border-gray-700 px-4 py-3 text-left';
    return onClick
      ? <button type="button" onClick={onClick} className={`${cls} hover:border-orange-500 transition-colors ${filtros.sit === 'sem-ncm' ? 'border-orange-500' : ''}`} title="Mostrar só os produtos sem NCM">{corpo}</button>
      : <div className={cls}>{corpo}</div>;
  };

  const f = painel?.form;
  const mg = f ? margem(numBR(f.cost) || 0, numBR(f.price) || 0) : null;

  return (
    <div className="p-4 md:p-8 text-white space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="text-orange-400" size={28} />
          <div>
            <h1 className="text-2xl font-bold">Produtos</h1>
            <p className="text-sm text-gray-400">Cadastro principal dos produtos: preços, margem, dados fiscais da NF-e e estoque.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => carregar()} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><RefreshCw size={15} />Atualizar</button>
          <button type="button" onClick={abrirNovo} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus size={16} />Novo produto</button>
        </div>
      </div>

      {erro && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">{erro}</div>}
      {msg && <div role="status" onClick={() => setMsg('')} className={`rounded-lg border px-4 py-3 text-sm cursor-pointer ${msg.startsWith('⚠️') ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-green-500/50 bg-green-500/10 text-green-400'}`}>{msg}</div>}
      {semMigracao && <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400 flex items-center gap-2"><AlertTriangle size={15} />Migration de produtos ainda não aplicada: ativar/desativar e os dados fiscais (origem, unidade, GTIN) ficam disponíveis depois dela.</div>}

      {/* ── cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {card(<Package size={14} />, 'Produtos ativos', r.ativos.toLocaleString('pt-BR'), r.inativos ? `${r.inativos} inativo(s)` : undefined)}
        {card(<Boxes size={14} />, 'Unidades em estoque', r.unidades.toLocaleString('pt-BR'))}
        {card(<Wallet size={14} />, 'Estoque a custo', brl(r.valorCusto))}
        {card(<Tag size={14} />, 'Estoque a preço de venda', brl(r.valorVenda))}
        {card(<FileWarning size={14} />, 'Sem NCM', r.semNcm.toLocaleString('pt-BR'), 'clique para ver', () => mudar({ sit: filtros.sit === 'sem-ncm' ? 'todos' : 'sem-ncm' }), r.semNcm > 0)}
      </div>

      {/* ── busca e filtros ── */}
      <section className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="search" value={buscaTxt} onChange={(e) => setBuscaTxt(e.target.value)} placeholder="Buscar por modelo, cor, SKU ou NCM…" aria-label="Buscar produtos" className={`${inp} pl-9`} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400">Ordenar
            <select value={`${filtros.ordem}:${filtros.dir}`} onChange={(e) => { const [o, d] = e.target.value.split(':'); mudar({ ordem: o as Ordem, dir: d as 'asc' | 'desc' }); }} className="bg-gray-700 text-white rounded-lg px-2 py-2 border border-gray-600 text-sm">
              <option value="nome:asc">Nome (A→Z)</option><option value="nome:desc">Nome (Z→A)</option>
              <option value="preco:desc">Maior preço</option><option value="preco:asc">Menor preço</option>
              <option value="margem:desc">Maior margem</option><option value="margem:asc">Menor margem</option>
              <option value="estoque:desc">Mais estoque</option><option value="estoque:asc">Menos estoque</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {FILTROS_CAT.map(([c, rot]) => (
            <button key={c} type="button" aria-pressed={filtros.cat === c} onClick={() => mudar({ cat: c })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filtros.cat === c ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}>{rot}</button>
          ))}
          <span className="w-px h-6 bg-gray-600 mx-1" />
          {SITUACOES.map(([s, rot]) => (
            <button key={s} type="button" aria-pressed={filtros.sit === s} onClick={() => mudar({ sit: s })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filtros.sit === s ? 'bg-gray-600 border-orange-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}>{rot}</button>
          ))}
          <span className="text-sm text-gray-400 ml-auto">{lista.length} produto{lista.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {/* ── edição em lote ── */}
      {sel.size > 0 && (
        <section className="bg-gray-800 rounded-xl border border-orange-500/60 p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">{sel.size} selecionado{sel.size === 1 ? '' : 's'}</span>
          <select value={loteTipo} onChange={(e) => setLoteTipo(e.target.value as LoteTipo | '')} aria-label="O que mudar" className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm">
            <option value="">Mudar…</option><option value="categoria">Categoria</option><option value="ncm">NCM</option><option value="preco">Preço</option><option value="ativo">Ativar / desativar</option>
          </select>
          {loteTipo === 'categoria' && (
            <select value={loteCat} onChange={(e) => setLoteCat(e.target.value as Categoria)} className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm">
              {CATEGORIAS.map(([c, rot]) => <option key={c} value={c}>{rot}</option>)}
            </select>
          )}
          {loteTipo === 'ncm' && <input value={loteNcm} onChange={(e) => setLoteNcm(e.target.value)} inputMode="numeric" maxLength={10} placeholder="8 números" className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm w-32" />}
          {loteTipo === 'preco' && (
            <>
              <select value={lotePrecoModo} onChange={(e) => setLotePrecoModo(e.target.value as 'valor' | 'pct')} className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm">
                <option value="pct">+/- %</option><option value="valor">Novo valor (R$)</option>
              </select>
              <input value={lotePreco} onChange={(e) => setLotePreco(e.target.value)} inputMode="decimal" placeholder={lotePrecoModo === 'pct' ? 'ex.: 10 ou -5' : 'ex.: 299,90'} className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm w-32" />
            </>
          )}
          {loteTipo === 'ativo' && (
            <select value={loteAtivo ? '1' : '0'} onChange={(e) => setLoteAtivo(e.target.value === '1')} className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm">
              <option value="0">Desativar</option><option value="1">Ativar</option>
            </select>
          )}
          {loteTipo && <button type="button" onClick={pedirLote} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium">Aplicar</button>}
          <button type="button" onClick={() => setSel(new Set())} className="text-gray-400 hover:text-white ml-auto">Limpar seleção</button>
        </section>
      )}

      {/* ── tabela ── */}
      <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
            <th className="py-2 pl-4 pr-2 w-8"><input type="checkbox" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)))} aria-label="Selecionar todos da lista" className="h-4 w-4 accent-orange-500" /></th>
            {cab('Produto', 'nome')}
            {cab('Categoria', null)}
            {cab('SKU', null)}
            {cab('NCM', null)}
            {cab('Custo', null, 'text-right')}
            {cab('Preço', 'preco', 'text-right')}
            {cab('Margem', 'margem', 'text-right')}
            {cab('Estoque', 'estoque', 'text-center')}
            <th className="py-2 pr-4 text-right font-medium">Ações</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-700">
            {carregando ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Carregando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Nenhum produto encontrado.</td></tr>
            ) : lista.map((p) => {
              const m = margem(p.cost, p.price);
              const q = estoqueDe(p);
              const selo = seloEstoque(q);
              const inativo = !ativo(p);
              return (
                <tr key={p.id} className={`hover:bg-gray-700/50 ${inativo ? 'opacity-60' : ''}`}>
                  <td className="py-2.5 pl-4 pr-2"><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label={`Selecionar ${p.model} ${p.color || ''}`} className="h-4 w-4 accent-orange-500" /></td>
                  <td className="py-2.5 pr-3">
                    <button type="button" onClick={() => abrirEditar(p)} className="text-left hover:text-orange-400">
                      <span className="font-medium text-white">{p.model}</span>
                      {p.color && <span className="text-gray-400"> · {p.color}</span>}
                      {inativo && <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded border border-gray-500 text-gray-400">inativo</span>}
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-300">{rotuloCategoria(categoriaDe(p))}</td>
                  <td className="py-2.5 pr-3 text-gray-400 font-mono text-xs">{p.sku || '—'}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{ncmOk(p.ncm) ? <span className="text-gray-300">{p.ncm}</span> : <span className="text-red-400 inline-flex items-center gap-1"><AlertTriangle size={12} />sem NCM</span>}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-300 tabular-nums">{brl(p.cost)}</td>
                  <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{brl(p.price)}</td>
                  <td className={`py-2.5 pr-3 text-right tabular-nums ${COR_MARGEM[m.cor]}`}>
                    <span className="font-medium">{pctTxt(m.pct)}</span>
                    <span className="block text-xs opacity-80">{brl(m.valor)}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className={`inline-block min-w-[2.5rem] px-2 py-0.5 rounded-full border text-xs font-medium tabular-nums ${SELO_ESTOQUE[selo]}`} title={selo === 'sem' ? 'Sem estoque' : selo === 'baixo' ? 'Estoque baixo' : 'Estoque ok'}>{q}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-700" title="Editar" aria-label={`Editar ${p.model}`}><Pencil size={16} /></button>
                      <button type="button" onClick={() => { setErrosForm([]); setPainel({ modo: 'novo', id: null, form: duplicar(p) }); }} className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-gray-700" title="Duplicar (outra cor)" aria-label={`Duplicar ${p.model}`}><Copy size={16} /></button>
                      <button type="button" onClick={() => alternarAtivo(p)} className={`p-1.5 rounded-lg hover:bg-gray-700 ${inativo ? 'text-green-400' : 'text-gray-400 hover:text-red-400'}`} title={inativo ? 'Ativar' : 'Desativar'} aria-label={`${inativo ? 'Ativar' : 'Desativar'} ${p.model}`}><Power size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ── Integração Tiny (temporária, recolhida) ── */}
      <section className="bg-gray-800 rounded-xl border border-gray-700">
        <button type="button" onClick={() => setTinyAberto((v) => !v)} aria-expanded={tinyAberto} className="w-full flex items-center justify-between px-5 py-3 text-left">
          <span className="font-medium flex items-center gap-2 text-gray-300">{tinyAberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<RefreshCw size={16} className="text-gray-400" />Integração Tiny (temporária)</span>
          <span className="text-xs text-gray-500">importar produtos do Tiny ERP</span>
        </button>
        {tinyAberto && (
          <div className="px-5 pb-5">
            <p className="text-xs text-gray-400 mb-3">O cadastro principal agora é aqui no ERP. A importação fica só enquanto a migração do Tiny não termina; o envio de estoque para o Tiny nas vendas e no Controle de Estoque continua igual.</p>
            <div className="flex gap-3 flex-wrap">
              <button type="button" onClick={() => importarTiny('smartwatch')} disabled={importando} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm disabled:opacity-50"><Watch size={15} />{importando ? 'Importando…' : 'Importar Smartwatches'}</button>
              <button type="button" onClick={() => importarTiny('acessorio')} disabled={importando} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm disabled:opacity-50"><ShoppingBag size={15} />{importando ? 'Importando…' : 'Importar Acessórios'}</button>
            </div>
            {importResult && <p className="mt-3 text-sm text-gray-300">{importResult}</p>}
          </div>
        )}
      </section>

      {/* ── painel lateral de cadastro ── */}
      {painel && f && mg && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPainel(null)} />
          <aside role="dialog" aria-modal="true" aria-label={painel.modo === 'novo' ? 'Novo produto' : 'Editar produto'} className="relative w-full max-w-xl h-full bg-gray-800 border-l border-gray-700 shadow-2xl flex flex-col">
            <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-lg font-bold">{painel.modo === 'novo' ? 'Novo produto' : 'Editar produto'}</h2>
                {atual && !ativo(atual) && <p className="text-xs text-yellow-400">Produto inativo (não aparece na Nova Venda)</p>}
              </div>
              <button type="button" onClick={() => setPainel(null)} className="text-gray-400 hover:text-white" aria-label="Fechar"><X size={22} /></button>
            </header>
            <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <fieldset className="space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wide text-orange-400 mb-2">Identificação</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl} htmlFor="pr-model">Modelo *</label><input id="pr-model" className={inp} value={f.model} onChange={(e) => setCampo('model', e.target.value)} placeholder="Ex.: S11 Pro" autoFocus /></div>
                  <div><label className={lbl} htmlFor="pr-color">Cor</label><input id="pr-color" className={inp} value={f.color} onChange={(e) => setCampo('color', e.target.value)} placeholder="Ex.: Preto" /></div>
                  <div><label className={lbl} htmlFor="pr-cat">Categoria</label>
                    <select id="pr-cat" className={inp} value={f.category} onChange={(e) => setCampo('category', e.target.value)}>{CATEGORIAS.map(([c, rot]) => <option key={c} value={c}>{rot}</option>)}</select>
                  </div>
                  <div><label className={lbl} htmlFor="pr-sup">Fornecedor</label><input id="pr-sup" className={inp} value={f.supplier} onChange={(e) => setCampo('supplier', e.target.value)} /></div>
                  <div className="col-span-2"><label className={lbl} htmlFor="pr-sku">SKU</label><input id="pr-sku" className={`${inp} font-mono`} value={f.sku} onChange={(e) => setCampo('sku', e.target.value)} placeholder="Código interno (único)" /></div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wide text-orange-400 mb-2">Fiscal (NF-e)</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl} htmlFor="pr-ncm">NCM</label>
                    <input id="pr-ncm" className={`${inp} font-mono ${f.ncm && !ncmOk(f.ncm) ? 'border-red-500' : ''}`} value={f.ncm} onChange={(e) => setCampo('ncm', e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" maxLength={10} placeholder="8 números" />
                    {!f.ncm ? <p className="text-xs text-yellow-400 mt-1">Sem NCM a NF-e não sai.</p> : !ncmOk(f.ncm) && <p className="text-xs text-red-400 mt-1">Precisa ter 8 números.</p>}
                  </div>
                  <div><label className={lbl} htmlFor="pr-un">Unidade</label><input id="pr-un" className={inp} value={f.unidade} onChange={(e) => setCampo('unidade', e.target.value)} maxLength={6} /></div>
                  <div className="col-span-2"><label className={lbl} htmlFor="pr-orig">Origem</label>
                    <select id="pr-orig" className={inp} value={f.origem} onChange={(e) => setCampo('origem', e.target.value)}>{ORIGENS.map(([o, rot]) => <option key={o} value={o}>{rot}</option>)}</select>
                  </div>
                  <div className="col-span-2"><label className={lbl} htmlFor="pr-gtin">GTIN / EAN</label><input id="pr-gtin" className={`${inp} font-mono`} value={f.gtin} onChange={(e) => setCampo('gtin', e.target.value)} placeholder="SEM GTIN" /></div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wide text-orange-400 mb-2">Preços</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl} htmlFor="pr-cost">Custo (R$)</label><input id="pr-cost" className={inp} value={f.cost} onChange={(e) => setCampo('cost', e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
                  <div><label className={lbl} htmlFor="pr-price">Preço de venda (R$)</label><input id="pr-price" className={inp} value={f.price} onChange={(e) => setCampo('price', e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
                </div>
                <div className="rounded-lg bg-gray-900/50 border border-gray-700 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-400">Margem</span>
                  <span className={`text-lg font-bold tabular-nums ${COR_MARGEM[mg.cor]}`}>{pctTxt(mg.pct)} <span className="text-sm font-medium">· {brl(mg.valor)}</span></span>
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-bold uppercase tracking-wide text-orange-400 mb-2">Estoque</legend>
                <div className="flex items-center justify-between rounded-lg bg-gray-900/50 border border-gray-700 px-4 py-3">
                  <span className="text-sm text-gray-400">Estoque atual</span>
                  {painel.modo === 'editar' && atual ? (
                    <span className={`px-2.5 py-0.5 rounded-full border text-sm font-medium ${SELO_ESTOQUE[seloEstoque(estoqueDe(atual))]}`}>{estoqueDe(atual)} un.</span>
                  ) : <span className="text-sm text-gray-500">0 un. (novo)</span>}
                </div>
                <p className="text-xs text-gray-500">Entradas e ajustes de estoque continuam no Controle de Estoque.</p>
              </fieldset>

              {errosForm.length > 0 && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400 space-y-1">{errosForm.map((e) => <p key={e}>{e}</p>)}</div>
              )}
              <button type="submit" className="hidden" />
            </form>
            <footer className="px-6 py-4 border-t border-gray-700 flex items-center gap-2 flex-wrap">
              <button type="button" onClick={salvar} disabled={salvando} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Save size={15} />{salvando ? 'Salvando…' : 'Salvar'}</button>
              <button type="button" onClick={duplicarAtual} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-2" title="Copia tudo menos SKU e estoque"><Copy size={15} />Duplicar</button>
              {atual && (
                <button type="button" onClick={() => alternarAtivo(atual)} className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-gray-700 hover:bg-gray-600 ${ativo(atual) ? 'text-red-400' : 'text-green-400'}`}><Power size={15} />{ativo(atual) ? 'Desativar' : 'Ativar'}</button>
              )}
              <button type="button" onClick={() => setPainel(null)} className="ml-auto text-sm text-gray-400 hover:text-white px-3 py-2">Cancelar</button>
            </footer>
          </aside>
        </div>
      )}

      {/* ── confirmação do lote ── */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !salvando && setConfirmar(null)} />
          <div role="alertdialog" aria-modal="true" className="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">Confirmar edição em lote</h3>
            {confirmar.mudancas.length === 0 ? (
              <p className="text-sm text-gray-300">Nenhum dos {selecionados.length} selecionados muda com isso.</p>
            ) : (
              <>
                <p className="text-sm text-gray-300">{textoLote(confirmar.lote, confirmar.mudancas.length)}</p>
                {confirmar.mudancas.length < selecionados.length && <p className="text-xs text-gray-400">{selecionados.length - confirmar.mudancas.length} dos selecionados já estão assim e ficam como estão.</p>}
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} disabled={salvando} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
              {confirmar.mudancas.length > 0 && (
                <button type="button" onClick={aplicarLote} disabled={salvando} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">{salvando ? 'Alterando…' : `Alterar ${confirmar.mudancas.length}`}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
