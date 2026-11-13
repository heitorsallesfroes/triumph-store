// 🧾 Gestão › Notas fiscais (NF-e própria, direto na SEFAZ/SVRS), no estilo da lista de notas do Tiny.
// Parte principal: a LISTA DE NOTAS (abas com contador, notas reais/testes, período pela data de emissão, busca,
// ordem por coluna, menu "…" de cada nota, seleção em lote para DANFEs num PDF só e XMLs em .zip, rodapé com
// quantidade e valor, páginas de 100). Os filtros ficam no endereço (?nf_…), para o F5 não perder.
// No topo, recolhível, "Configurações": certificado, conexão com a SEFAZ, emitente e numeração (com a chave
// "Liberar notas reais"). Também: aviso de produtos sem NCM e "Baixar XMLs do mês (.zip)" para o contador.
// Só leitura do banco, fora as ações que já existiam (consultar, cancelar, salvar a configuração).
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, RefreshCw, Wifi, Settings, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight, MoreHorizontal,
  Search, Printer, Archive, AlertTriangle, ArrowUp, ArrowDown, ExternalLink,
} from 'lucide-react';
import {
  NfeCert, STATUS_NFE, nfeGet, nfePost, baixarDanfe, baixarXml, baixarXmlCancelamento, baixarXmlsDoMes, baixarXmlsZip, imprimirDanfes,
} from '../lib/nfeApi';
import { prazoCancelamento } from '../lib/nfeRegras';
import {
  ABAS, AMBS, PERIODOS, Filtros, NotaLista, Ordem, aplicar, hrefComFiltros, hrefSemFiltros, intervalo, lerFiltros, trocarOrdem, hojeRJ, posicaoMenu,
} from '../lib/nfeLista';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/resumoAnualCalc';
import { useErpRefresh } from '../lib/erpRefresh';
import NfeCancelar from '../components/NfeCancelar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Config = Record<string, any>;
interface StatusUm { cStat?: string | null; motivo?: string | null; tMed?: string | null; erro?: string }
interface ProdutoSemNcm { id: string; model: string | null; color: string | null; sku: string | null }

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const docFmt = (d?: string | null) => { const s = String(d || ''); return s.length === 11 ? s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s; };
const diaBR = (d: string) => d.split('-').reverse().join('/');
const inp = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm';
const lbl = 'block text-xs font-medium text-gray-400 mb-1';
const CAMPOS: [string, string, string][] = [
  ['razao', 'Razão social', 'md:col-span-6'], ['fantasia', 'Nome fantasia', 'md:col-span-3'], ['cnpj', 'CNPJ', 'md:col-span-3'],
  ['ie', 'Inscrição estadual', 'md:col-span-3'], ['crt', 'CRT (1 = Simples Nacional)', 'md:col-span-3'], ['fone', 'Telefone (opcional)', 'md:col-span-3'], ['cep', 'CEP', 'md:col-span-3'],
  ['logradouro', 'Rua', 'md:col-span-6'], ['numero', 'Número', 'md:col-span-2'], ['complemento', 'Complemento', 'md:col-span-4'],
  ['bairro', 'Bairro', 'md:col-span-4'], ['municipio', 'Município', 'md:col-span-4'], ['uf', 'UF', 'md:col-span-1'], ['cod_municipio', 'Cód. IBGE do município', 'md:col-span-3'],
];
const SELO: Record<string, string> = {
  autorizada: 'bg-green-500/15 text-green-300 border-green-500/40', pendente: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  emitindo: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40', rejeitada: 'bg-red-500/15 text-red-300 border-red-500/40',
  cancelada: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
};
const TXT_SELO: Record<string, string> = { autorizada: 'Autorizada', pendente: 'Pendente', emitindo: 'Enviando', rejeitada: 'Rejeitada', cancelada: 'Cancelada' };
const mesAtual = () => hojeRJ().slice(0, 7);

// menu "…" por cima de tudo (portal no body, position fixed pela posição do botão): não fica cortado pela caixa da
// lista; vira para cima quando não cabe embaixo; fecha ao clicar fora, rolar a página, mudar o tamanho ou apertar Esc
function MenuFlutuante({ ancora, onFechar, children }: { ancora: HTMLElement; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(posicaoMenu(ancora.getBoundingClientRect(), { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }));
  }, [ancora]);
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || ancora.contains(alvo)) return; // o próprio botão abre/fecha sozinho
      onFechar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { onFechar(); ancora.focus(); } };
    document.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', tecla);
    window.addEventListener('scroll', onFechar, true);
    window.addEventListener('resize', onFechar);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', onFechar, true);
      window.removeEventListener('resize', onFechar);
    };
  }, [ancora, onFechar]);
  return createPortal(
    <div ref={ref} role="menu" style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="z-[1000] w-56 rounded-lg border border-gray-600 bg-gray-800 shadow-xl py-1 text-left">
      {children}
    </div>,
    document.body,
  );
}
const ambDoServidor = (a: Filtros['amb']) => (a === 'reais' ? '1' : a === 'testes' ? '2' : 'todas');

export default function NotasFiscais() {
  // ── configurações ──
  const [cert, setCert] = useState<NfeCert | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [tpag, setTpag] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState('');
  const [sefaz, setSefaz] = useState<{ homologacao?: StatusUm; producao?: StatusUm; autorizador?: string; erro?: string } | null>(null);
  const [configAberto, setConfigAberto] = useState(false);
  const [liberando, setLiberando] = useState<string | null>(null); // próximo nº de produção digitado ao ligar
  const [semNcm, setSemNcm] = useState<ProdutoSemNcm[]>([]);
  const [verNcm, setVerNcm] = useState(false);
  const [mesZip, setMesZip] = useState(mesAtual());

  // ── lista ──
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(window.location.search));
  const [buscaTxt, setBuscaTxt] = useState(filtros.busca);
  const [notas, setNotas] = useState<NotaLista[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; botao: HTMLElement } | null>(null);
  const fecharMenu = useCallback(() => setMenu(null), []);
  const [aberta, setAberta] = useState<{ id: string; tipo: 'cancelar' | 'motivo' } | null>(null);
  const [lote, setLote] = useState('');

  const iv = useMemo(() => intervalo(filtros), [filtros.periodo, filtros.de, filtros.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => aplicar(notas, filtros), [notas, filtros]);
  const mudar = (p: Partial<Filtros>) => setFiltros((f) => ({ ...f, pagina: 1, ...p }));

  // filtros no endereço (F5 não perde); ao sair da página, tira
  useEffect(() => {
    try { window.history.replaceState(window.history.state, '', hrefComFiltros(window.location.href, filtros)); } catch { /* sem history */ }
  }, [filtros]);
  useEffect(() => () => { try { window.history.replaceState(window.history.state, '', hrefSemFiltros(window.location.href)); } catch { /* sem history */ } }, []);
  // busca: espera parar de digitar
  useEffect(() => { const t = setTimeout(() => setFiltros((f) => (f.busca === buscaTxt ? f : { ...f, busca: buscaTxt, pagina: 1 })), 250); return () => clearTimeout(t); }, [buscaTxt]);
  // seleção e menus valem só para o que está na tela
  useEffect(() => { setSel(new Set()); setAberta(null); }, [filtros.aba, filtros.amb, filtros.periodo, filtros.de, filtros.ate, filtros.busca]);

  const carregarConfig = useCallback(async () => {
    setErro('');
    try {
      const j = await nfeGet({ op: 'painel' });
      if (j.erro) throw new Error(j.erro);
      setCert(j.cert || null); setCfg(j.config || null); setTpag(j.tpag || {});
      if (!j.cert?.ok) setConfigAberto(true);
    } catch (e) { setErro(e instanceof Error ? e.message : 'falhou'); setConfigAberto(true); }
    setCarregando(false);
  }, []);
  const carregarLista = useCallback(async () => {
    setCarregandoLista(true); setErroLista('');
    try {
      const j = await nfeGet({ op: 'lista', amb: ambDoServidor(filtros.amb), de: iv.de, ate: iv.ate });
      if (j.erro) throw new Error(j.erro);
      setNotas(j.notas || []); setTruncado(!!j.truncado);
    } catch (e) { setErroLista(e instanceof Error ? e.message : 'falhou'); setNotas([]); }
    setCarregandoLista(false);
  }, [filtros.amb, iv.de, iv.ate]);
  const carregarSemNcm = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todos: any[] = await fetchAllRows((f: number, t: number) => supabase.from('products').select('id, model, color, sku, ncm').order('model').range(f, t));
      setSemNcm(todos.filter((p) => !/^\d{8}$/.test(String(p.ncm ?? '').replace(/\D/g, ''))));
    } catch { setSemNcm([]); }
  }, []);
  useEffect(() => { carregarConfig(); carregarSemNcm(); }, [carregarConfig, carregarSemNcm]);
  useEffect(() => { carregarLista(); }, [carregarLista]);
  useErpRefresh(() => { carregarConfig(); carregarLista(); carregarSemNcm(); });

  // ── ações ──
  const testar = async () => {
    setOcupado('sefaz'); setSefaz(null);
    try { setSefaz(await nfeGet({ op: 'sefaz' })); } catch (e) { setSefaz({ erro: e instanceof Error ? e.message : 'falhou' }); }
    setOcupado('');
  };
  const consultar = async (n: NotaLista) => {
    setOcupado(n.id); setMsg('');
    try { const j = await nfePost({ op: 'consultar', id: n.id }); setMsg(j.erro ? `⚠️ ${j.erro}` : `Nota nº ${n.numero}: ${STATUS_NFE[j.status] || j.status}${j.motivo ? ` — ${j.motivo}` : ''}`); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado(''); carregarLista();
  };
  const baixar = async (n: NotaLista, tipo: 'pdf' | 'xml' | 'canc') => {
    setOcupado(`${tipo}${n.id}`);
    try { if (tipo === 'pdf') await baixarDanfe(n.id); else if (tipo === 'xml') await baixarXml(n.id); else await baixarXmlCancelamento(n.id); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado('');
  };
  const salvar = async () => {
    if (!editando) return;
    setOcupado('cfg'); setMsg('');
    try {
      const j = await nfePost({ op: 'config', ...editando });
      if (j.erro) throw new Error(j.erro);
      setMsg('Configuração salva ✓'); setEditando(null); carregarConfig();
    } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado('');
  };
  const producao = async (ligar: boolean) => {
    setOcupado('producao'); setMsg('');
    try {
      const j = await nfePost({ op: 'producao', ligar, confirmar: ligar, proximo_producao: liberando ?? undefined });
      if (j.erro) throw new Error(j.erro);
      setMsg(ligar ? `✅ Notas reais liberadas. A próxima nota real será a nº ${j.proximo_producao}, série ${j.serie}.` : 'Notas reais desligadas: só sai nota de teste.');
      setLiberando(null); carregarConfig();
    } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setOcupado('');
  };
  const zipDoMes = async () => {
    setOcupado('zipmes'); setMsg('');
    try { const n = await baixarXmlsDoMes(mesZip, (k) => setLote(`Buscando os XMLs… ${k} notas`)); setMsg(`📦 XMLs de ${mesZip.split('-').reverse().join('/')} baixados (${n} notas reais).`); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setLote(''); setOcupado('');
  };
  const escolhidas = r.lista.filter((n) => sel.has(n.id));
  const loteDanfes = async () => {
    setOcupado('lote'); setMsg('');
    try {
      const x = await imprimirDanfes(escolhidas.map((n) => n.id), (k) => setLote(`Gerando DANFEs… ${k}/${escolhidas.length}`));
      setMsg(`🖨️ PDF com ${x.feitas} DANFE${x.feitas > 1 ? 's' : ''}${x.puladas ? ` (${x.puladas} sem DANFE ficaram de fora: só autorizadas e canceladas têm)` : ''}.`);
    } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setLote(''); setOcupado('');
  };
  const loteXmls = async () => {
    setOcupado('lote'); setMsg('');
    try { const k = await baixarXmlsZip(escolhidas.map((n) => n.id), `NFe-${escolhidas.length}-notas.zip`, (i) => setLote(`Juntando os XMLs… ${i}/${escolhidas.length}`)); setMsg(`📦 ${k} XMLs no .zip.`); } catch (e) { setMsg(`⚠️ ${e instanceof Error ? e.message : 'falhou'}`); }
    setLote(''); setOcupado('');
  };
  const marcar = (id: string) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const todasDaPagina = r.daPagina.length > 0 && r.daPagina.every((n) => sel.has(n.id));
  const marcarPagina = () => setSel((s) => { const x = new Set(s); r.daPagina.forEach((n) => (todasDaPagina ? x.delete(n.id) : x.add(n.id))); return x; });

  const setE = (k: string, v: string) => setEditando((c) => (c ? { ...c, emitente: { ...(c.emitente || {}), [k]: v } } : c));
  const setR = (k: string, v: string) => setEditando((c) => (c ? { ...c, emitente: { ...(c.emitente || {}), resp: { ...(c.emitente?.resp || {}), [k]: v } } } : c));
  const linhaStatus = (nome: string, s?: StatusUm) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-300">{nome}</span>
      {!s ? <span className="text-gray-500">—</span> : s.erro ? <span className="text-red-400">✖ {s.erro}</span>
        : <span className={s.cStat === '107' ? 'text-green-400' : 'text-yellow-400'}>{s.cStat === '107' ? '✔' : '⚠'} {s.cStat} — {s.motivo}{s.tMed ? ` (tempo médio ${s.tMed}s)` : ''}</span>}
    </div>
  );
  const temChave = !!cfg && 'producao_liberada' in cfg;
  const liberada = cfg?.producao_liberada === true;

  const cab = (rot: string, o: Ordem, cls = '') => (
    <th className={`py-2 pr-3 ${cls}`}>
      <button type="button" onClick={() => setFiltros((f) => trocarOrdem(f, o))} className={`inline-flex items-center gap-1 uppercase hover:text-white ${filtros.ordem === o ? 'text-white' : ''}`} aria-label={`Ordenar por ${rot}`}>
        {rot}{filtros.ordem === o && (filtros.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
  const itemMenu = (rot: string, acao: () => void, cor = 'text-gray-200') => (
    <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); acao(); }} className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 ${cor}`}>{rot}</button>
  );

  return (
    <div className="p-4 md:p-8 text-white space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="text-yellow-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold">Notas fiscais</h1>
            <p className="text-sm text-gray-400">NF-e própria direto na SEFAZ (SVRS). {liberada ? 'Notas reais liberadas.' : 'Só notas de teste (homologação), sem valor fiscal.'} Emita pelo Histórico de Vendas › “Nota fiscal”.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-300" title="Para o contador: XMLs das notas reais autorizadas e canceladas do mês (com o XML do cancelamento)">
            <input type="month" value={mesZip} max={mesAtual()} onChange={(e) => setMesZip(e.target.value)} className="bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 text-sm" aria-label="Mês dos XMLs" />
          </label>
          <button type="button" disabled={!!ocupado || !/^\d{4}-\d{2}$/.test(mesZip)} onClick={zipDoMes} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><Archive size={15} />{ocupado === 'zipmes' ? 'Juntando…' : 'Baixar XMLs do mês (.zip)'}</button>
          <button type="button" onClick={() => { carregarConfig(); carregarLista(); carregarSemNcm(); }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><RefreshCw size={15} />Atualizar</button>
        </div>
      </div>

      {erro && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{erro}</div>}
      {msg && <div className={`rounded-lg border px-4 py-3 text-sm cursor-pointer ${msg.startsWith('⚠️') ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-green-500/50 bg-green-500/10 text-green-200'}`} onClick={() => setMsg('')} role="status">{msg}</div>}
      {lote && <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200 flex items-center gap-2"><RefreshCw size={14} className="animate-spin" />{lote}</div>}

      {/* ── Configurações (recolhível) ── */}
      <section className="bg-gray-800 rounded-xl border border-gray-700">
        <button type="button" onClick={() => setConfigAberto((v) => !v)} aria-expanded={configAberto} className="w-full flex items-center justify-between px-5 py-3 text-left">
          <span className="font-bold flex items-center gap-2">{configAberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<Settings size={18} className="text-orange-400" />Configurações</span>
          <span className="text-xs text-gray-400 flex items-center gap-3">
            <span className={cert?.ok ? 'text-green-400' : 'text-red-400'}>{cert ? (cert.ok ? `certificado até ${cert.validade?.split('-').reverse().join('/')}` : 'certificado com problema') : carregando ? 'carregando…' : 'sem certificado'}</span>
            <span className={liberada ? 'text-green-400' : 'text-yellow-400'}>{liberada ? 'notas reais liberadas' : 'só teste'}</span>
          </span>
        </button>
        {configAberto && (
          <div className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-gray-900/40 rounded-xl border border-gray-700 p-5">
                <h2 className="font-bold mb-3 flex items-center gap-2">{cert?.ok ? <ShieldCheck className="text-green-400" size={18} /> : <ShieldAlert className="text-red-400" size={18} />}Certificado digital (A1)</h2>
                {carregando ? <p className="text-sm text-gray-400">Carregando…</p> : !cert ? <p className="text-sm text-gray-400">—</p> : cert.ok ? (
                  <div className="text-sm space-y-1">
                    <p className="text-green-300">Válido até <b>{cert.validade?.split('-').reverse().join('/')}</b> ({cert.dias} dias){(cert.dias ?? 99) <= 30 && <span className="text-yellow-400"> — vence logo, renove!</span>}</p>
                    <p className="text-gray-400">{cert.nome}</p>
                    <p className="text-gray-400">CNPJ do certificado: {cert.cnpj || '—'}</p>
                  </div>
                ) : <p className="text-sm text-red-300">⚠️ {cert.erro}</p>}
                <p className="text-xs text-gray-500 mt-3">O certificado e a senha ficam só nas variáveis de ambiente da Vercel (NFE_CERT_B64 e NFE_CERT_SENHA). Veja docs/nfe-passo-a-passo.md.</p>
              </section>

              <section className="bg-gray-900/40 rounded-xl border border-gray-700 p-5">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h2 className="font-bold flex items-center gap-2"><Wifi size={18} className="text-blue-400" />Conexão com a SEFAZ</h2>
                  <button type="button" disabled={ocupado === 'sefaz'} onClick={testar} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                    <RefreshCw size={14} className={ocupado === 'sefaz' ? 'animate-spin' : ''} />{ocupado === 'sefaz' ? 'Testando…' : 'Testar conexão com a SEFAZ'}
                  </button>
                </div>
                {sefaz?.erro ? <p className="text-sm text-red-300">⚠️ {sefaz.erro}</p> : sefaz ? (
                  <div>
                    {linhaStatus('Homologação (teste)', sefaz.homologacao)}
                    {linhaStatus('Produção', sefaz.producao)}
                    <p className="text-xs text-gray-500 mt-2">Autorizador: {sefaz.autorizador || '—'}. 107 = serviço em operação.</p>
                  </div>
                ) : <p className="text-sm text-gray-400">Consulta o status do serviço (NFeStatusServico4) com o certificado. Não emite nada.</p>}
              </section>
            </div>

            <section className="bg-gray-900/40 rounded-xl border border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-bold flex items-center gap-2"><Settings size={18} className="text-orange-400" />Emitente e numeração</h2>
                {cfg && !editando && <button type="button" onClick={() => setEditando(JSON.parse(JSON.stringify(cfg)))} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-semibold">Editar</button>}
              </div>
              {!cfg ? <p className="text-sm text-gray-400">{carregando ? 'Carregando…' : 'Sem configuração (a migration das notas fiscais foi aplicada?)'}</p> : !editando ? (
                <>
                  <div className="text-sm text-gray-300 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                    <p><span className="text-gray-500">Empresa:</span> {cfg.emitente?.razao} ({cfg.emitente?.fantasia})</p>
                    <p><span className="text-gray-500">CNPJ / IE:</span> {cfg.emitente?.cnpj} / {cfg.emitente?.ie} · CRT {cfg.emitente?.crt}</p>
                    <p><span className="text-gray-500">Endereço:</span> {cfg.emitente?.logradouro}, {cfg.emitente?.numero}{cfg.emitente?.complemento ? ` - ${cfg.emitente.complemento}` : ''}, {cfg.emitente?.bairro}</p>
                    <p><span className="text-gray-500">Cidade:</span> {cfg.emitente?.municipio}/{cfg.emitente?.uf} · CEP {cfg.emitente?.cep} · IBGE {cfg.emitente?.cod_municipio}</p>
                    <p><span className="text-gray-500">Série:</span> {cfg.serie} · <span className="text-gray-500">próximo nº real:</span> {cfg.proximo_producao} · <span className="text-gray-500">de teste:</span> {cfg.proximo_homolog}</p>
                    <p><span className="text-gray-500">Natureza:</span> {cfg.natop}</p>
                    <p><span className="text-gray-500">Tributos aprox. (IBPT):</span> {String(cfg.ibpt_fed).replace('.', ',')}% federal · {String(cfg.ibpt_est).replace('.', ',')}% estadual</p>
                    <p><span className="text-gray-500">Pagamento na nota:</span> {cfg.tpag} — {tpag[cfg.tpag] || ''}</p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-semibold">Liberar notas reais (produção)</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {!temChave ? 'Para usar, aplique no Supabase a migration supabase/migrations/20261122120000_nfe_producao.sql.'
                            : liberada ? `Ligada${cfg.producao_liberada_em ? ` desde ${dataHora(cfg.producao_liberada_em)}` : ''}: o modal da venda tem o botão “Autorizar na SEFAZ” (nota com valor fiscal).`
                              : 'Desligada: só sai nota de teste (homologação).'}
                        </p>
                      </div>
                      <button type="button" role="switch" aria-checked={liberada} aria-label="Liberar notas reais (produção)" disabled={!temChave || ocupado === 'producao'}
                        onClick={() => (liberada ? producao(false) : setLiberando(String(cfg.proximo_producao ?? 1)))}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${liberada ? 'bg-green-600' : 'bg-gray-600'}`}>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${liberada ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {liberando !== null && !liberada && (
                      <div className="mt-3 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm space-y-3" role="alertdialog" aria-label="Confirmar notas reais">
                        <p className="text-green-200 font-semibold flex items-center gap-2"><AlertTriangle size={15} />Ao ligar, o botão principal do modal passa a emitir nota REAL, com valor fiscal.</p>
                        <div className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className={lbl}>Próximo número de produção (série {cfg.serie})</label>
                            <input className={`${inp} w-40`} value={liberando} inputMode="numeric" onChange={(e) => setLiberando(e.target.value.replace(/\D/g, ''))} />
                          </div>
                          <button type="button" disabled={ocupado === 'producao' || !(Number(liberando) > 0)} onClick={() => producao(true)} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded-lg font-semibold">
                            {ocupado === 'producao' ? 'Ligando…' : `Confirmar e liberar (próxima: nº ${liberando || '?'})`}
                          </button>
                          <button type="button" onClick={() => setLiberando(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-12 gap-3">
                    {CAMPOS.map(([k, rot, w]) => (
                      <div key={k} className={`col-span-12 ${w}`}>
                        <label className={lbl}>{rot}</label>
                        <input className={inp} value={editando.emitente?.[k] ?? ''} onChange={(e) => setE(k, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-6 md:col-span-2"><label className={lbl}>Série</label><input className={inp} value={editando.serie} onChange={(e) => setEditando({ ...editando, serie: e.target.value })} /></div>
                    <div className="col-span-6 md:col-span-2"><label className={lbl}>Próximo nº (real)</label><input className={inp} value={editando.proximo_producao} onChange={(e) => setEditando({ ...editando, proximo_producao: e.target.value })} /></div>
                    <div className="col-span-6 md:col-span-2"><label className={lbl}>Próximo nº (teste)</label><input className={inp} value={editando.proximo_homolog} onChange={(e) => setEditando({ ...editando, proximo_homolog: e.target.value })} /></div>
                    <div className="col-span-12 md:col-span-6"><label className={lbl}>Natureza da operação</label><input className={inp} value={editando.natop} onChange={(e) => setEditando({ ...editando, natop: e.target.value })} /></div>
                    <div className="col-span-6 md:col-span-3"><label className={lbl}>% tributos federais (IBPT)</label><input className={inp} value={String(editando.ibpt_fed).replace('.', ',')} onChange={(e) => setEditando({ ...editando, ibpt_fed: e.target.value })} /></div>
                    <div className="col-span-6 md:col-span-3"><label className={lbl}>% tributos estaduais (IBPT)</label><input className={inp} value={String(editando.ibpt_est).replace('.', ',')} onChange={(e) => setEditando({ ...editando, ibpt_est: e.target.value })} /></div>
                    <div className="col-span-12 md:col-span-6">
                      <label className={lbl}>Forma de pagamento na nota</label>
                      <select className={inp} value={editando.tpag} onChange={(e) => setEditando({ ...editando, tpag: e.target.value })}>
                        {Object.entries(tpag).map(([k, rot]) => <option key={k} value={k}>{k} — {rot}{k === '90' ? ' (igual ao Tiny)' : ''}</option>)}
                      </select>
                    </div>
                    <div className="col-span-12"><label className={lbl}>Frase fixa nas informações complementares (vai depois dos tributos aproximados)</label><input className={inp} value={editando.info} onChange={(e) => setEditando({ ...editando, info: e.target.value })} /></div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Responsável técnico (opcional; só vai na nota se nome, e-mail e telefone estiverem preenchidos — preencha se a SEFAZ pedir, rejeição 972)</p>
                    <div className="grid grid-cols-12 gap-3">
                      {[['cnpj', 'CNPJ (vazio = o da empresa)'], ['contato', 'Nome do contato'], ['email', 'E-mail'], ['fone', 'Telefone']].map(([k, rot]) => (
                        <div key={k} className="col-span-12 md:col-span-3"><label className={lbl}>{rot}</label><input className={inp} value={editando.emitente?.resp?.[k] ?? ''} onChange={(e) => setR(k, e.target.value)} /></div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={ocupado === 'cfg'} onClick={salvar} className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 px-5 py-2 rounded-lg font-semibold">{ocupado === 'cfg' ? 'Salvando…' : 'Salvar'}</button>
                    <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Cancelar</button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {/* ── produtos sem NCM ── */}
      {semNcm.length > 0 && (
        // fundo âmbar claro com texto âmbar escuro nos dois temas (as classes amber-* não são trocadas pelo tema claro)
        <section className="rounded-xl border border-amber-400 bg-amber-100 px-5 py-3 text-sm text-amber-950">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="flex items-center gap-2"><AlertTriangle size={15} className="shrink-0 text-amber-700" /><span><b>{semNcm.length} produto{semNcm.length > 1 ? 's' : ''} sem NCM</b>: a nota trava quando um deles entra (brinde sem cadastro vai pelo nome: pulseira e fone).</span></p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVerNcm((v) => !v)} className="text-xs font-semibold text-amber-900 underline hover:text-amber-950">{verNcm ? 'esconder lista' : 'ver lista'}</button>
              <a href="?pagina=produtos" className="text-xs font-semibold bg-amber-800 hover:bg-amber-900 text-amber-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><ExternalLink size={12} />Abrir Produtos</a>
            </div>
          </div>
          {verNcm && (
            <ul className="mt-2 max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-6 text-xs text-amber-950">
              {semNcm.map((p) => <li key={p.id} className="py-0.5">{`${p.model || ''} ${p.color || ''}`.trim() || '(sem nome)'}{p.sku ? <span className="text-amber-800"> · {p.sku}</span> : ''}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* ── LISTA DE NOTAS ── */}
      <section className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-gray-700" role="tablist" aria-label="Situação">
          {ABAS.map(([a, rot]) => (
            <button key={a} type="button" role="tab" aria-selected={filtros.aba === a} onClick={() => mudar({ aba: a })}
              className={`px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px ${filtros.aba === a ? 'border-orange-500 text-white font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
              {rot} <span className={`ml-1 text-xs rounded-full px-1.5 ${filtros.aba === a ? 'bg-orange-500/30' : 'bg-gray-700'}`}>{r.contadores[a]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className={lbl}>Ambiente</label>
            <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden" role="group" aria-label="Ambiente">
              {AMBS.map(([a, rot]) => <button key={a} type="button" aria-pressed={filtros.amb === a} onClick={() => mudar({ amb: a })} className={`px-3 py-1.5 text-sm ${filtros.amb === a ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{rot}</button>)}
            </div>
          </div>
          <div>
            <label className={lbl}>Período (data de emissão)</label>
            <select className={`${inp} w-auto`} value={filtros.periodo} onChange={(e) => mudar({ periodo: e.target.value as Filtros['periodo'] })} aria-label="Período">
              {PERIODOS.map(([p, rot]) => <option key={p} value={p}>{rot}</option>)}
            </select>
          </div>
          {filtros.periodo === 'datas' && (
            <div className="flex items-end gap-2">
              <div><label className={lbl}>De</label><input type="date" className={inp} value={filtros.de} onChange={(e) => mudar({ de: e.target.value })} /></div>
              <div><label className={lbl}>Até</label><input type="date" className={inp} value={filtros.ate} onChange={(e) => mudar({ ate: e.target.value })} /></div>
            </div>
          )}
          <div className="flex-1 min-w-[220px]">
            <label className={lbl}>Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={`${inp} pl-9`} value={buscaTxt} onChange={(e) => setBuscaTxt(e.target.value)} placeholder="Cliente, CPF/CNPJ, nº da nota ou chave" aria-label="Buscar notas" />
            </div>
          </div>
          <p className="text-xs text-gray-500 w-full md:w-auto">{diaBR(iv.dias[0])}{iv.dias[0] !== iv.dias[1] ? ` a ${diaBR(iv.dias[1])}` : ''}</p>
        </div>

        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <span className="text-sm text-gray-300">{sel.size} selecionada{sel.size > 1 ? 's' : ''}</span>
            <button type="button" disabled={!!ocupado} onClick={loteDanfes} className="bg-green-700 hover:bg-green-600 disabled:bg-gray-600 px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-1.5"><Printer size={14} />Imprimir DANFEs</button>
            <button type="button" disabled={!!ocupado} onClick={loteXmls} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-1.5"><Archive size={14} />Baixar XMLs (.zip)</button>
            <button type="button" onClick={() => setSel(new Set())} className="text-xs text-gray-400 underline">limpar seleção</button>
          </div>
        )}

        {erroLista && <div className="mx-4 mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{erroLista}</div>}
        {truncado && <p className="mx-4 mb-3 text-xs text-yellow-300">Período com muitas notas: mostrando as 3.000 mais novas. Escolha um período menor.</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
              <th className="py-2 pl-4 pr-2 w-8"><input type="checkbox" checked={todasDaPagina} onChange={marcarPagina} aria-label="Selecionar as notas desta página" className="h-4 w-4 accent-orange-500" /></th>
              {cab('Nº', 'numero')}
              <th className="py-2 pr-3">Série</th>
              {cab('Data/hora de emissão', 'data')}
              {cab('Cliente', 'cliente')}
              <th className="py-2 pr-3">UF</th>
              {cab('Valor', 'valor', 'text-right')}
              <th className="py-2 pr-3">Situação</th>
              <th className="py-2 pr-4 text-right">Ações</th>
            </tr></thead>
            <tbody>
              {carregandoLista ? (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">Carregando…</td></tr>
              ) : !r.daPagina.length ? (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">Nenhuma nota {filtros.busca ? 'com essa busca ' : ''}neste período.</td></tr>
              ) : r.daPagina.map((n) => {
                const pz = prazoCancelamento(n);
                return [
                  <tr key={n.id} className={`border-b border-gray-700/60 align-top ${sel.has(n.id) ? 'bg-orange-500/5' : ''}`}>
                    <td className="py-2 pl-4 pr-2"><input type="checkbox" checked={sel.has(n.id)} onChange={() => marcar(n.id)} aria-label={`Selecionar a nota ${n.numero}`} className="h-4 w-4 accent-orange-500" /></td>
                    <td className="py-2 pr-3 whitespace-nowrap font-semibold">{n.numero}{n.ambiente === 2 && <span className="ml-1.5 text-[10px] font-bold tracking-wide bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded px-1 py-0.5 align-middle">TESTE</span>}</td>
                    <td className="py-2 pr-3">{n.serie}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-300">{dataHora(n.criado_em)}</td>
                    <td className="py-2 pr-3">{n.cliente || '—'}{n.doc && <span className="block text-xs text-gray-500">{docFmt(n.doc)}</span>}</td>
                    <td className="py-2 pr-3">{n.uf || '—'}</td>
                    <td className={`py-2 pr-3 text-right whitespace-nowrap ${['cancelada', 'rejeitada'].includes(n.status) ? 'text-gray-500 line-through' : ''}`}>{brl(n.valor)}</td>
                    <td className="py-2 pr-3"><span className={`inline-block text-xs font-semibold border rounded px-2 py-0.5 ${SELO[n.status] || SELO.cancelada}`}>{TXT_SELO[n.status] || n.status}</span></td>
                    <td className="py-2 pr-4 text-right">
                      <button type="button" aria-haspopup="menu" aria-expanded={menu?.id === n.id} aria-label={`Ações da nota ${n.numero}`} onClick={(e) => { const b = e.currentTarget; setMenu((m) => (m?.id === n.id ? null : { id: n.id, botao: b })); }} className="p-1.5 rounded hover:bg-gray-700">
                        {ocupado.endsWith(n.id) || ocupado === n.id ? <RefreshCw size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
                      </button>
                      {menu?.id === n.id && (
                        <MenuFlutuante ancora={menu.botao} onFechar={fecharMenu}>
                          {['autorizada', 'cancelada'].includes(n.status) && itemMenu('Baixar DANFE', () => baixar(n, 'pdf'))}
                          {['autorizada', 'cancelada'].includes(n.status) && itemMenu('Baixar XML', () => baixar(n, 'xml'))}
                          {n.status === 'cancelada' && itemMenu('Baixar XML do cancelamento', () => baixar(n, 'canc'))}
                          {['pendente', 'emitindo'].includes(n.status) && itemMenu('Consultar SEFAZ', () => consultar(n), 'text-yellow-300')}
                          {n.status === 'autorizada' && (pz.pode
                            ? itemMenu('Cancelar', () => setAberta({ id: n.id, tipo: 'cancelar' }), 'text-red-300')
                            : <span className="block px-3 py-1.5 text-xs text-gray-500">Cancelar: passou do prazo de 24 h</span>)}
                          {n.status === 'rejeitada' && itemMenu('Ver motivo', () => setAberta({ id: n.id, tipo: 'motivo' }))}
                          {n.venda_id
                            ? <a role="menuitem" href={`?pagina=historico&venda=${n.venda_id}`} className="block px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700">Abrir venda</a>
                            : <span className="block px-3 py-1.5 text-xs text-gray-500">Sem venda ligada</span>}
                        </MenuFlutuante>
                      )}
                    </td>
                  </tr>,
                  aberta?.id === n.id && (
                    <tr key={`${n.id}-aberta`} className="border-b border-gray-700/60">
                      <td colSpan={9} className="px-4 py-3">
                        {aberta.tipo === 'motivo'
                          ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start justify-between gap-3">
                              <span><b>Rejeitada{n.cstat ? ` (${n.cstat})` : ''}:</b> {n.motivo || 'a SEFAZ não mandou o motivo'}</span>
                              <button type="button" onClick={() => setAberta(null)} className="text-xs underline text-gray-300">fechar</button>
                            </div>
                          : <NfeCancelar nota={n} aberto onFechar={() => setAberta(null)} onFeito={(m) => { setMsg(m); setAberta(null); carregarLista(); }} />}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm">
          <span className="text-gray-300"><b>{r.quantidade}</b> nota{r.quantidade === 1 ? '' : 's'} · valor <b>{brl(r.valor)}</b> <span className="text-xs text-gray-500">(sem canceladas nem rejeitadas)</span></span>
          {r.paginas > 1 && (
            <div className="flex items-center gap-2">
              <button type="button" disabled={r.pagina <= 1} onClick={() => setFiltros((f) => ({ ...f, pagina: r.pagina - 1 }))} className="px-3 py-1 rounded border border-gray-600 disabled:opacity-40 hover:bg-gray-700">‹ Anterior</button>
              <span className="text-gray-400">Página {r.pagina} de {r.paginas}</span>
              <button type="button" disabled={r.pagina >= r.paginas} onClick={() => setFiltros((f) => ({ ...f, pagina: r.pagina + 1 }))} className="px-3 py-1 rounded border border-gray-600 disabled:opacity-40 hover:bg-gray-700">Próxima ›</button>
            </div>
          )}
        </div>
      </section>
      <p className="text-xs text-gray-500">Cancelamento: até 24 h depois da autorização. Guarde os XMLs: a lei pede 5 anos (ficam guardados aqui também).</p>
    </div>
  );
}
