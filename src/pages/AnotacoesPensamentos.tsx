// 🧠 Gestão › Anotações › PENSAMENTOS: mapas mentais (ideia central → ramos → sub-ramos), desenhados em SVG próprio.
// Regras puras (árvore, mover, layout sem sobreposição, setas, exportar lista) em src/lib/mapas.ts — testadas em
// scripts/tests/mapas.test.ts. Tabela erp_mapas: supabase/migrations/20261128120000_erp_mapas.sql — sem ela a aba
// mostra o aviso e não grava nada.
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode,
} from 'react';
import {
  AlertTriangle, ArrowLeft, Brain, Check, Copy, FileText, ImageDown, ListTodo, Loader2, LocateFixed, Minus, MoreHorizontal,
  Pencil, Plus, Redo2, Trash2, Undo2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useErpDirty, useErpRefresh } from '../lib/erpRefresh';
import { addDays, dateKey, tabelaFaltando } from '../lib/anotacoes';
import { announcePendentes, fetchPendentesHoje } from '../lib/anotacoesDb';
import {
  ICONES, NOTA_W, PALETA, PLACEHOLDER, addChild, addSibling, alternarRecolher, caminho, contarIdeias, duplicarDados, ideiaNoPonto,
  layout, moveNode, normalizar, novoId, novoMapa, paraTexto, removeNode, setNode, subarvore, vizinho,
  type Caixa, type Direcao, type Lado, type Layout, type MapaDados,
} from '../lib/mapas';

const ORANGE = '#f97316';
const MIGRATION = 'supabase/migrations/20261128120000_erp_mapas.sql';
const COLS = 'id,titulo,dados,created_at,updated_at';
const FONTE = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
const SAVE_MS = 700;
// campo de edição por cima da ideia: sem a borda/fundo globais dos campos
const EDIT_CSS = `.anot textarea.pens-edit { background: transparent !important; border: none !important; color: var(--pens-cor) !important;
  box-shadow: 0 0 0 2px var(--pens-sel) !important; border-radius: var(--pens-r) !important; outline: none !important; }`;
const LONG_MS = 550;

interface Mapa { id: string; titulo: string; dados: MapaDados; created_at: string; updated_at: string }
const card = { background: 'var(--bg-card)', border: '1px solid var(--border-main)' } as const;
const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const raizTexto = (d: MapaDados) => d.nodes[d.root]?.text.trim() || 'Sem título';
const tituloDe = (m: Mapa) => m.titulo.trim() || raizTexto(m.dados);
const lerMapa = (r: Record<string, unknown>): Mapa => ({ ...(r as unknown as Mapa), titulo: String(r.titulo ?? ''), dados: normalizar(r.dados) });

// cores do desenho (SVG com cores fixas para a imagem exportada sair igual à tela)
const TEMAS = {
  escuro: { fundo: '#0a0a0f', ideia: '#1a1a2a', texto: '#f5f5f7', suave: '#9ca3af', ponto: 'rgba(255,255,255,.07)', sel: '#60a5fa', tinta: 0.2 },
  claro: { fundo: '#f5f5f5', ideia: '#ffffff', texto: '#111111', suave: '#6b7280', ponto: 'rgba(0,0,0,.09)', sel: '#2563eb', tinta: 0.13 },
};
type Tema = (typeof TEMAS)['escuro'];
function useTema(): Tema {
  const [claro, setClaro] = useState(() => document.documentElement.classList.contains('light'));
  useEffect(() => {
    const o = new MutationObserver(() => setClaro(document.documentElement.classList.contains('light')));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return claro ? TEMAS.claro : TEMAS.escuro;
}

function editadoEm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = dateKey(new Date());
  const k = dateKey(d);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (k === hoje) return `hoje às ${hora}`;
  if (k === addDays(hoje, -1)) return `ontem às ${hora}`;
  return d.toLocaleDateString('pt-BR');
}

function Dialogo({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,.5)' }} onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onPointerDown={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] flex flex-col" style={{ ...card, boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>
        {children}
      </div>
    </div>
  );
}
const btnSec = { border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-secondary)' } as const;

// ═══════════════════════════════ LISTA DE MAPAS ═══════════════════════════════
export default function Pensamentos() {
  const [mapas, setMapas] = useState<Mapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [falta, setFalta] = useState(false);
  const [aberto, setAberto] = useState<{ id: string; novo: boolean } | null>(null);
  const [renomear, setRenomear] = useState<{ m: Mapa; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<Mapa | null>(null);
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('erp_mapas').select(COLS).order('updated_at', { ascending: false });
    setLoading(false);
    if (error) { if (tabelaFaltando(error)) setFalta(true); else setErro(errMsg(error)); return; }
    setErro(null);
    setFalta(false);
    setMapas((data || []).map(lerMapa));
  }, []);
  useEffect(() => { load(); }, [load]);
  useErpRefresh(() => { if (!aberto) return load(); });

  const falhou = (error: unknown) => { if (tabelaFaltando(error)) setFalta(true); else setErro(errMsg(error)); };
  const inserir = async (row: { titulo: string; dados: MapaDados }) => {
    const { data, error } = await supabase.from('erp_mapas').insert(row).select(COLS).single();
    if (error) { falhou(error); return null; }
    const m = lerMapa(data);
    setMapas((l) => [m, ...l]);
    return m;
  };
  const novo = async () => {
    if (falta || criando) return;
    setCriando(true);
    const m = await inserir({ titulo: '', dados: novoMapa('Ideia central') });
    setCriando(false);
    if (m) setAberto({ id: m.id, novo: true });
  };
  const duplicar = (m: Mapa) => inserir({ titulo: `${tituloDe(m)} (cópia)`, dados: duplicarDados(m.dados) });
  const salvarNome = async () => {
    if (!renomear) return;
    const { m, texto } = renomear;
    setRenomear(null);
    const titulo = texto.trim();
    if (titulo === m.titulo) return;
    setMapas((l) => l.map((x) => (x.id === m.id ? { ...x, titulo } : x)));
    const { error } = await supabase.from('erp_mapas').update({ titulo }).eq('id', m.id);
    if (error) { falhou(error); load(); }
  };
  const excluir = async (m: Mapa) => {
    setConfirmar(null);
    setMapas((l) => l.filter((x) => x.id !== m.id));
    const { error } = await supabase.from('erp_mapas').delete().eq('id', m.id);
    if (error) { falhou(error); load(); }
  };
  const onSaved = useCallback((m: Mapa) => setMapas((l) => [m, ...l.filter((x) => x.id !== m.id)]), []);
  const mapaAberto = aberto ? mapas.find((m) => m.id === aberto.id) : null;

  return (
    <div data-testid="pens-lista">
      {falta && (
        <div role="alert" data-testid="pens-migration" className="mb-5 p-4 rounded-xl flex gap-3 text-sm"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.45)', color: 'var(--text-primary)' }}>
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
          <div>
            <p className="font-semibold">Falta aplicar a migration dos Pensamentos (mapas mentais) no Supabase</p>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Rode o arquivo <code className="px-1 rounded" style={{ background: 'var(--bg-inner)' }}>{MIGRATION}</code> no SQL Editor
              do Supabase. Até lá não dá para criar nem salvar mapas.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <p className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>Mapas mentais para pensar e planejar em cascata.</p>
        <button type="button" onClick={novo} disabled={falta || criando} data-testid="pens-novo"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold flex-shrink-0"
          style={{ background: ORANGE, color: '#fff', border: 'none', opacity: falta || criando ? 0.5 : 1 }}>
          {criando ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Novo mapa
        </button>
      </div>

      {erro && <p role="alert" className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>{erro}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : mapas.length === 0 ? (
        <div className="text-center py-14 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Brain size={30} className="mx-auto mb-2 opacity-60" />
          {falta ? 'Os mapas aparecem aqui depois de aplicar a migration.' : 'Nenhum mapa ainda. Clique em "Novo mapa" para começar.'}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' }}>
          {mapas.map((m) => (
            <article key={m.id} className="anot-card anot-row rounded-2xl overflow-hidden cursor-pointer flex flex-col" style={card} data-testid="pens-mapa"
              onClick={() => setAberto({ id: m.id, novo: false })}>
              <div className="h-28 p-2" style={{ background: 'var(--bg-inner)', borderBottom: '1px solid var(--border-main)' }}><MiniMapa dados={m.dados} /></div>
              <div className="p-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[15px] truncate" style={{ color: 'var(--text-primary)' }}>{tituloDe(m)}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {contarIdeias(m.dados)} {contarIdeias(m.dados) === 1 ? 'ideia' : 'ideias'} · editado {editadoEm(m.updated_at)}
                  </p>
                </div>
                <div className="flex -mr-1" onClick={(e) => e.stopPropagation()}>
                  {([
                    ['Renomear', Pencil, () => setRenomear({ m, texto: tituloDe(m) })],
                    ['Duplicar', Copy, () => duplicar(m)],
                    ['Excluir', Trash2, () => setConfirmar(m)],
                  ] as const).map(([label, Icon, fn]) => (
                    <button key={label} type="button" onClick={fn} aria-label={`${label} mapa`} title={label} className="anot-hover p-1.5 rounded"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><Icon size={15} /></button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {renomear && (
        <Dialogo label="Renomear mapa" onClose={() => setRenomear(null)}>
          <form onSubmit={(e) => { e.preventDefault(); salvarNome(); }}>
            <p className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Renomear mapa</p>
            <input value={renomear.texto} onChange={(e) => setRenomear({ ...renomear, texto: e.target.value })} autoFocus maxLength={200}
              aria-label="Nome do mapa" className="w-full px-3 py-2.5 text-base mb-4" onFocus={(e) => e.target.select()} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRenomear(null)} className="px-4 py-2 rounded-lg text-sm" style={btnSec}>Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: ORANGE, color: '#fff', border: 'none' }}>Salvar</button>
            </div>
          </form>
        </Dialogo>
      )}

      {confirmar && (
        <Dialogo label="Excluir mapa" onClose={() => setConfirmar(null)}>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Excluir este mapa?</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            “{tituloDe(confirmar)}” e suas {contarIdeias(confirmar.dados)} ideias serão apagados. Não dá para desfazer.
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConfirmar(null)} className="px-4 py-2 rounded-lg text-sm" style={btnSec}>Cancelar</button>
            <button type="button" onClick={() => excluir(confirmar)} data-testid="pens-confirmar-excluir" className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#ef4444', color: '#fff', border: 'none' }}>Excluir</button>
          </div>
        </Dialogo>
      )}

      {mapaAberto && aberto && (
        <MapaEditor key={mapaAberto.id} inicial={mapaAberto} novo={aberto.novo} onSaved={onSaved} onMissing={() => setFalta(true)}
          onClose={() => setAberto(null)} />
      )}
    </div>
  );
}

// miniatura do cartão: só linhas e caixinhas coloridas
function MiniMapa({ dados }: { dados: MapaDados }) {
  const lay = useMemo(() => layout(dados), [dados]);
  const b = lay.bounds;
  const pad = 16;
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {lay.ordem.map((id) => {
        const c = lay.caixas[id];
        return c.pai ? <path key={`l${id}`} d={caminho(lay.caixas[c.pai], c)} fill="none" stroke={c.cor || ORANGE} strokeWidth={c.prof === 1 ? 5 : 3.5} opacity={0.75} /> : null;
      })}
      {lay.ordem.map((id) => {
        const c = lay.caixas[id];
        return <rect key={id} x={c.x} y={c.y} width={c.w} height={c.h} rx={c.prof === 0 ? c.h / 2 : 8}
          fill={c.prof === 0 ? ORANGE : c.cor || ORANGE} opacity={c.prof === 0 ? 1 : c.prof === 1 ? 0.75 : 0.45} />;
      })}
    </svg>
  );
}

// ═══════════════════════════════ EDITOR DO MAPA ═══════════════════════════════
type Status = 'salvo' | 'pendente' | 'salvando' | 'erro';
interface Edicao { id: string; texto: string; novo: boolean; selecionar: boolean }
type Gesto =
  | { tipo: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { tipo: 'no'; id: string; sx: number; sy: number; movido: boolean; longo: boolean; timer: number | null; toque: boolean; jaSel: boolean }
  | { tipo: 'pinch'; d0: number; k0: number; cx: number; cy: number; vx: number; vy: number };
interface UiProps { 'data-ui': string; onPointerDown: (e: RPointerEvent) => void; onClick: (e: RMouseEvent) => void; style: CSSProperties }
interface Arrasto { id: string; wx: number; wy: number; alvo: string | null; lado: Lado }

function MapaEditor({ inicial, novo, onSaved, onClose, onMissing }: {
  inicial: Mapa; novo: boolean; onSaved: (m: Mapa) => void; onClose: () => void; onMissing: () => void;
}) {
  const T = useTema();
  const [dados, setDadosState] = useState<MapaDados>(inicial.dados);
  const dadosRef = useRef(dados);
  const setDados = (d: MapaDados) => { dadosRef.current = d; setDadosState(d); };
  const passado = useRef<MapaDados[]>([]);
  const futuro = useRef<MapaDados[]>([]);
  const [, setHistVer] = useState(0);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const tituloRef = useRef(titulo);
  tituloRef.current = titulo;
  const [sel, setSel] = useState(inicial.dados.root);
  const [edit, setEditState] = useState<Edicao | null>(novo ? { id: inicial.dados.root, texto: raizTexto(inicial.dados), novo: false, selecionar: true } : null);
  const editRef = useRef(edit);
  const setEdit = (e: Edicao | null) => { editRef.current = e; setEditState(e); };
  const [view, setViewState] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  const setView = (v: { x: number; y: number; k: number }) => { viewRef.current = v; setViewState(v); };
  const [menu, setMenu] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<Arrasto | null>(null);
  const [toast, setToast] = useState<{ texto: string; desfazer?: boolean; id: number } | null>(null);
  const [exportTxt, setExportTxt] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [status, setStatus] = useState<Status>('salvo');
  const [tam, setTam] = useState({ w: 800, h: 600 });
  const boxRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  useErpDirty(status === 'pendente' || status === 'salvando' || !!edit);

  // layout ao vivo (enquanto digita a caixa já cresce e os vizinhos abrem espaço)
  const dadosVis = useMemo(() => (edit && dados.nodes[edit.id] ? setNode(dados, edit.id, { text: edit.texto }) : dados), [dados, edit]);
  const lay = useMemo(() => layout(dadosVis), [dadosVis]);
  const layRef = useRef<Layout>(lay);
  layRef.current = lay;

  // ── salvar sozinho ──
  // título automático = texto da ideia central, até a pessoa dar outro nome
  const tituloAuto = useRef(!inicial.titulo.trim() || inicial.titulo.trim() === raizTexto(inicial.dados));
  const tituloFinal = () => (tituloAuto.current ? raizTexto(dadosRef.current) : tituloRef.current.trim() || raizTexto(dadosRef.current));
  const salvoRef = useRef(JSON.stringify([tituloFinal(), inicial.dados]));
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | null>(null);
  const cb = useRef({ onSaved, onMissing });
  cb.current = { onSaved, onMissing };

  const salvar = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const d = dadosRef.current;
      const t = tituloFinal();
      const snap = JSON.stringify([t, d]);
      if (snap === salvoRef.current) { setStatus((s) => (s === 'erro' ? s : 'salvo')); return; }
      setStatus('salvando');
      const { data, error } = await supabase.from('erp_mapas').update({ titulo: t, dados: d }).eq('id', inicial.id).select(COLS).single();
      if (error) { if (tabelaFaltando(error)) cb.current.onMissing(); setStatus('erro'); return; }
      salvoRef.current = snap;
      cb.current.onSaved({ ...lerMapa(data), dados: d });
      setStatus(JSON.stringify([tituloFinal(), dadosRef.current]) === snap ? 'salvo' : 'pendente');
    });
    return chain.current;
  }, [inicial.id]);
  const agendar = useCallback(() => {
    setStatus('pendente');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; salvar(); }, SAVE_MS);
  }, [salvar]);
  const salvarJa = useCallback(() => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } return salvar(); }, [salvar]);
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); salvar(); } }, [salvar]);
  useEffect(() => {
    // fechou a aba do navegador com coisa por salvar
    const antes = (e: BeforeUnloadEvent) => { if (timer.current) { salvarJa(); e.preventDefault(); } };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [salvarJa]);

  // ── histórico (desfazer/refazer) ──
  const commit = (novoM: MapaDados, hist = true) => {
    if (novoM === dadosRef.current) return;
    if (hist) {
      passado.current.push(dadosRef.current);
      if (passado.current.length > 200) passado.current.shift();
      futuro.current = [];
    }
    setDados(novoM);
    setHistVer((v) => v + 1);
    agendar();
  };
  const voltarPara = (m: MapaDados) => {
    setDados(m);
    setHistVer((v) => v + 1);
    setSel((s) => (m.nodes[s] ? s : m.root));
    setMenu(null);
    setNota(null);
    agendar();
  };
  const desfazer = () => {
    // desfazer com uma ideia nova ainda vazia = só cancelar ela
    const e = editRef.current;
    fecharEdicao(true);
    if (e?.novo && !e.texto.trim()) return;
    const p = passado.current.pop(); if (!p) return; futuro.current.push(dadosRef.current); voltarPara(p); };
  const refazer = () => { fecharEdicao(true); const f = futuro.current.pop(); if (!f) return; passado.current.push(dadosRef.current); voltarPara(f); };

  const avisar = (texto: string, desfazerBtn = false) => setToast({ texto, desfazer: desfazerBtn, id: Date.now() });
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(t); }, [toast]);

  // ── tela: tamanho, centralizar, zoom ──
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setTam({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const centralizar = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const b = layRef.current.bounds;
    const k = clamp(Math.min(1, W / (b.maxX - b.minX + 80), H / (b.maxY - b.minY + 80)), 0.25, 1);
    setView({ k, x: W / 2 - ((b.minX + b.maxX) / 2) * k, y: H / 2 - ((b.minY + b.maxY) / 2) * k });
  }, []);
  useLayoutEffect(() => { centralizar(); boxRef.current?.focus({ preventScroll: true }); }, [centralizar]);
  const zoom = useCallback((f: number, cx?: number, cy?: number) => {
    const v = viewRef.current;
    const el = boxRef.current;
    const px = cx ?? (el ? el.clientWidth / 2 : 0);
    const py = cy ?? (el ? el.clientHeight / 2 : 0);
    const k = clamp(v.k * f, 0.2, 3);
    setView({ k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) });
  }, []);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scroll]')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  // a ideia selecionada sempre visível
  useEffect(() => {
    const c = layRef.current.caixas[sel];
    const el = boxRef.current;
    if (!c || !el) return;
    const v = viewRef.current;
    const m = 30;
    const sx = c.x * v.k + v.x;
    const sy = c.y * v.k + v.y;
    let dx = 0;
    let dy = 0;
    if (sx < m) dx = m - sx; else if (sx + c.w * v.k > el.clientWidth - m) dx = el.clientWidth - m - (sx + c.w * v.k);
    if (sy < m) dy = m - sy; else if (sy + c.h * v.k > el.clientHeight - m) dy = el.clientHeight - m - (sy + c.h * v.k);
    if (dx || dy) setView({ ...v, x: v.x + dx, y: v.y + dy });
  }, [sel, edit?.id]);

  // ── ações nas ideias ──
  const no = (id: string) => dadosRef.current.nodes[id];
  const focar = () => boxRef.current?.focus({ preventScroll: true });
  const criarFilho = (id: string, lado?: Lado) => {
    fecharEdicao(true);
    const r = addChild(dadosRef.current, id, '', novoId, lado);
    if (r.mapa === dadosRef.current) return;
    commit(r.mapa);
    setSel(r.id);
    setMenu(null);
    setEdit({ id: r.id, texto: '', novo: true, selecionar: false });
  };
  const criarIrmao = (id: string) => {
    fecharEdicao(true);
    const r = addSibling(dadosRef.current, id, '', novoId);
    if (r.mapa === dadosRef.current) return;
    commit(r.mapa);
    setSel(r.id);
    setMenu(null);
    setEdit({ id: r.id, texto: '', novo: true, selecionar: false });
  };
  const apagar = (id: string) => {
    const n = no(id);
    if (!n || !n.parent) return;
    const irmaos = no(n.parent).children;
    const i = irmaos.indexOf(id);
    const prox = irmaos[i - 1] ?? irmaos[i + 1] ?? n.parent;
    const qtd = subarvore(dadosRef.current, id).length - 1;
    commit(removeNode(dadosRef.current, id));
    setSel(prox);
    setMenu(null);
    setNota(null);
    avisar(qtd ? `Ideia apagada (com ${qtd} embaixo)` : 'Ideia apagada', true);
  };
  const editar = (id: string, comeco?: string) => {
    const n = no(id);
    if (!n) return;
    setMenu(null);
    setSel(id);
    setEdit({ id, texto: comeco ?? n.text, novo: false, selecionar: comeco === undefined });
  };
  // termina a edição: grava (ou cancela). Ideia nova que ficou vazia some sem deixar rastro no histórico.
  function fecharEdicao(gravar: boolean, depois?: 'filho' | 'irmao') {
    const e = editRef.current;
    if (!e) return;
    setEdit(null);
    focar();
    const n = no(e.id);
    if (!n) return;
    const txt = e.texto.replace(/^\s+|\s+$/g, '');
    if (e.novo && (!gravar || !txt)) {
      const p = passado.current.pop();
      if (p) { setDados(p); setHistVer((v) => v + 1); setSel(n.parent && p.nodes[n.parent] ? n.parent : p.root); agendar(); }
      return;
    }
    if (gravar && txt && txt !== n.text) commit(setNode(dadosRef.current, e.id, { text: txt }), !e.novo);
    if (depois === 'filho') criarFilho(e.id);
    else if (depois === 'irmao') criarIrmao(e.id);
  }
  const alterar = (id: string, p: Parameters<typeof setNode>[2]) => commit(setNode(dadosRef.current, id, p));
  // grava a nota só se mudou (o balão pode chamar mais de uma vez ao fechar)
  const salvarNota = (id: string, t: string) => { const n = no(id); if (n && (n.note || '') !== t.trim()) alterar(id, { note: t.trim() }); };
  const recolher = (id: string) => commit(alternarRecolher(dadosRef.current, id));

  const virarTarefa = async (id: string) => {
    const n = no(id);
    if (!n) return;
    setMenu(null);
    const texto = (n.text.trim() || PLACEHOLDER).replace(/\s*\n\s*/g, ' ').slice(0, 500);
    const { data: ult } = await supabase.from('erp_tarefas').select('position').order('position', { ascending: false }).limit(1);
    const position = (Number((ult?.[0] as { position?: number } | undefined)?.position) || 0) + 1;
    const { error } = await supabase.from('erp_tarefas').insert({ texto, due_date: dateKey(new Date()), position });
    if (error) { avisar(tabelaFaltando(error) ? 'Tarefas: falta aplicar a migration das Anotações' : `Não deu para criar a tarefa: ${errMsg(error)}`); return; }
    if (no(id)) commit(setNode(dadosRef.current, id, { tarefa: true }));
    avisar('Tarefa criada em Tarefas › Hoje');
    fetchPendentesHoje().then((q) => { if (q !== null) announcePendentes(q); });
  };

  // ── teclado (como no MindMeister) ──
  const onKey = (e: RKeyboardEvent) => {
    if (editRef.current || exportTxt || (e.target as HTMLElement).closest('input,textarea,[data-pop]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); refazer(); return; }
    if (mod || e.altKey) return;
    const id = no(sel) ? sel : dadosRef.current.root;
    const setas: Record<string, Direcao> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (setas[k]) {
      e.preventDefault();
      setMenu(null);
      const v = vizinho(dadosRef.current, layRef.current, id, setas[k]);
      if (v) setSel(v);
      return;
    }
    switch (k) {
      case 'Tab': e.preventDefault(); criarFilho(id); return;
      case 'Enter': e.preventDefault(); criarIrmao(id); return;
      case 'Delete': case 'Backspace': e.preventDefault(); apagar(id); return;
      case 'F2': e.preventDefault(); editar(id); return;
      case ' ': e.preventDefault(); recolher(id); return;
      case 'Escape': setMenu(null); setNota(null); setExportMenu(false); return;
      case '+': case '=': e.preventDefault(); zoom(1.2); return;
      case '-': e.preventDefault(); zoom(1 / 1.2); return;
      default:
        if (k.length === 1 || Array.from(k).length === 1) { e.preventDefault(); editar(id, k); }
    }
  };

  // ── mouse e toque ──
  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const mundo = (p: { x: number; y: number }) => { const v = viewRef.current; return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }; };
  const noDoAlvo = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-no]') as Element | null)?.getAttribute('data-no') ?? null;
  const pararGesto = () => { const g = gesto.current; if (g?.tipo === 'no' && g.timer) window.clearTimeout(g.timer); gesto.current = null; };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-pop],[data-ui-html]') || e.button === 2) return;
    if ((e.target as Element).closest('textarea')) return;
    fecharEdicao(true);
    setMenu(null);
    setNota(null);
    setExportMenu(false);
    if (e.isPrimary) ptrs.current.clear();
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 2) {
      pararGesto();
      setDrag(null);
      const [a, b] = [...ptrs.current.values()];
      const v = viewRef.current;
      gesto.current = { tipo: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: v.x, vy: v.y };
      return;
    }
    const id = noDoAlvo(e.target);
    const v = viewRef.current;
    if (id) {
      const toque = e.pointerType !== 'mouse';
      const g: Gesto = { tipo: 'no', id, sx: p.x, sy: p.y, movido: false, longo: false, timer: null, toque, jaSel: sel === id };
      if (toque) {
        g.timer = window.setTimeout(() => {
          if (gesto.current !== g || g.movido) return;
          g.longo = true;
          g.timer = null;
          setSel(id);
          setMenu(id);
          try { navigator.vibrate?.(15); } catch { /* sem vibrar */ }
        }, LONG_MS);
      }
      gesto.current = g;
      setSel(id);
    } else {
      gesto.current = { tipo: 'pan', sx: p.x, sy: p.y, vx: v.x, vy: v.y };
    }
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && !gesto.current) { const h = noDoAlvo(e.target); if (h !== hover) setHover(h); }
    if (!ptrs.current.has(e.pointerId)) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'pinch') {
      const pts = [...ptrs.current.values()];
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const k = clamp((g.k0 * d) / g.d0, 0.2, 3);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      setView({ k, x: mx - (g.cx - g.vx) * (k / g.k0), y: my - (g.cy - g.vy) * (k / g.k0) });
      return;
    }
    // captura só quando começa a mexer (capturar no clique atrapalha o duplo clique)
    try { if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
    if (g.tipo === 'pan') { setView({ ...viewRef.current, x: g.vx + p.x - g.sx, y: g.vy + p.y - g.sy }); return; }
    if (g.longo) return;
    if (!g.movido && Math.hypot(p.x - g.sx, p.y - g.sy) < 6) return;
    if (!g.movido) {
      g.movido = true;
      if (g.timer) { window.clearTimeout(g.timer); g.timer = null; }
      // a central não se arrasta: vira mover a tela
      if (g.id === dadosRef.current.root) { const v = viewRef.current; gesto.current = { tipo: 'pan', sx: g.sx, sy: g.sy, vx: v.x, vy: v.y }; return; }
    }
    const w = mundo(p);
    const fora = new Set(subarvore(dadosRef.current, g.id));
    setDrag({ id: g.id, wx: w.x, wy: w.y, alvo: ideiaNoPonto(layRef.current, w.x, w.y, fora), lado: w.x < 0 ? 'L' : 'R' });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>, cancelou = false) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo === 'pinch') { if (ptrs.current.size < 2) gesto.current = null; return; }
    pararGesto();
    if (!g || g.tipo !== 'no') return;
    if (drag && !cancelou) {
      const m = dadosRef.current;
      const n = m.nodes[drag.id];
      if (drag.alvo) commit(moveNode(m, drag.id, drag.alvo));
      else if (n && n.parent === m.root && n.side !== drag.lado) commit(moveNode(m, drag.id, m.root, undefined, drag.lado));
      setDrag(null);
      return;
    }
    setDrag(null);
    // toque numa ideia já selecionada = editar
    if (!cancelou && !g.movido && !g.longo && g.toque && g.jaSel) editar(g.id);
  };
  const onDouble = (e: RMouseEvent) => { const id = noDoAlvo(e.target); if (id && !(e.target as Element).closest('[data-ui]')) editar(id); };
  const onContext = (e: RMouseEvent) => {
    const id = noDoAlvo(e.target);
    if (!id) return;
    e.preventDefault();
    pararGesto();
    setDrag(null);
    fecharEdicao(true);
    setSel(id);
    setMenu(id);
  };
  // botões dentro do desenho ("+", "⋯", nota, recolhido) não começam arrasto
  const ui = (fn: () => void): UiProps => ({
    'data-ui': '1',
    onPointerDown: (e: RPointerEvent) => { e.stopPropagation(); },
    onClick: (e: RMouseEvent) => { e.stopPropagation(); fn(); },
    style: { cursor: 'pointer' },
  });

  // ── exportar ──
  const exportarPng = async () => {
    setExportMenu(false);
    fecharEdicao(true);
    const g = gRef.current;
    if (!g) return;
    const b = layRef.current.bounds;
    const pad = 40;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    const clone = g.cloneNode(true) as SVGGElement;
    clone.removeAttribute('transform');
    clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${b.minX - pad} ${b.minY - pad} ${w} ${h}">`
      + `<rect x="${b.minX - pad}" y="${b.minY - pad}" width="${w}" height="${h}" fill="${T.fundo}"/>${new XMLSerializer().serializeToString(clone)}</svg>`;
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const escala = Math.min(2, 8000 / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * escala);
      cv.height = Math.round(h * escala);
      const ctx = cv.getContext('2d')!;
      ctx.scale(escala, escala);
      ctx.drawImage(img, 0, 0, w, h);
      const blob: Blob | null = await new Promise((r) => cv.toBlob(r, 'image/png'));
      if (!blob) throw new Error('sem imagem');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${tituloFinal().replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'mapa'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      avisar(`Não deu para gerar a imagem: ${errMsg(err)}`);
    }
  };
  const copiar = async () => {
    if (!exportTxt) return;
    try { await navigator.clipboard.writeText(exportTxt); } catch {
      const ta = document.getElementById('pens-export-txt') as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  };

  const fechar = async () => { fecharEdicao(true); await salvarJa(); onClose(); };

  // ── edição: foco no campo ──
  useEffect(() => {
    const ta = textRef.current;
    if (!edit || !ta) return;
    ta.focus({ preventScroll: true });
    if (edit.selecionar) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.id]);

  // ── desenho ──
  const { k } = view;
  const tela = (c: Caixa) => ({ x: c.x * k + view.x, y: c.y * k + view.y, w: c.w * k, h: c.h * k });
  const raiz = dados.root;
  const podeDesfazer = passado.current.length > 0;
  const podeRefazer = futuro.current.length > 0;
  const tituloMostrado = tituloAuto.current ? raizTexto(dadosVis) : titulo;
  const statusTxt: Record<Status, string> = { salvo: 'Salvo', pendente: 'Editando…', salvando: 'Salvando…', erro: 'Erro ao salvar' };
  const ladoDe = (c: Caixa): Lado => (c.lado === 'L' ? 'L' : 'R');
  const btnTopo = 'p-2 rounded-lg flex items-center gap-1.5 text-sm flex-shrink-0';
  const selCaixa = lay.caixas[sel];
  const foraDrag = drag ? new Set(subarvore(dados, drag.id)) : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: T.fundo }} data-testid="pens-editor">
      <style>{EDIT_CSS}</style>
      {/* barra de cima */}
      <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 flex-shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <button type="button" onClick={fechar} aria-label="Voltar para a lista de mapas" title="Voltar" className={btnTopo}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}><ArrowLeft size={18} /> <span className="hidden sm:inline">Mapas</span></button>
        <Brain size={18} className="hidden sm:block flex-shrink-0" style={{ color: ORANGE }} />
        <input value={tituloMostrado} aria-label="Título do mapa" maxLength={200} data-testid="pens-titulo"
          onChange={(e) => { const v = e.target.value; tituloAuto.current = !v.trim() || v.trim() === raizTexto(dadosRef.current); setTitulo(v); agendar(); }}
          className="anot-plain flex-1 min-w-0 font-semibold text-[15px] sm:text-base" />
        <button type="button" onClick={() => (status === 'erro' ? salvar() : undefined)} data-testid="pens-status"
          className="text-xs flex items-center gap-1 px-1.5 flex-shrink-0" title={status === 'erro' ? 'Tentar de novo' : undefined}
          style={{ background: 'none', border: 'none', color: status === 'erro' ? '#ef4444' : 'var(--text-muted)', cursor: status === 'erro' ? 'pointer' : 'default' }}>
          {status === 'salvo' && <Check size={12} />}{status === 'salvando' && <Loader2 size={12} className="animate-spin" />}
          <span className={status === 'erro' ? '' : 'hidden sm:inline'}>{statusTxt[status]}</span>
        </button>
        <button type="button" onClick={desfazer} disabled={!podeDesfazer} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" className={btnTopo}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', opacity: podeDesfazer ? 1 : 0.35 }}><Undo2 size={18} /></button>
        <button type="button" onClick={refazer} disabled={!podeRefazer} aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)" className={btnTopo}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', opacity: podeRefazer ? 1 : 0.35 }}><Redo2 size={18} /></button>
        <div className="relative" data-pop>
          <button type="button" onClick={() => setExportMenu((v) => !v)} aria-label="Exportar" aria-expanded={exportMenu} className={`${btnTopo} px-3`}
            style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', color: 'var(--text-primary)' }}>
            <ImageDown size={16} /> <span className="hidden sm:inline">Exportar</span>
          </button>
          {exportMenu && (
            <div className="absolute right-0 top-full mt-1 z-10 p-1.5 rounded-xl w-52" style={{ ...card, boxShadow: '0 10px 30px rgba(0,0,0,.3)' }}>
              <button type="button" onClick={exportarPng} className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2" style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }}>
                <ImageDown size={15} /> Imagem PNG
              </button>
              <button type="button" onClick={() => { setExportMenu(false); fecharEdicao(true); setExportTxt(paraTexto(dadosRef.current)); }} data-testid="pens-exportar-texto"
                className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2" style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }}>
                <FileText size={15} /> Lista em texto
              </button>
            </div>
          )}
        </div>
      </div>

      {/* área do mapa */}
      <div ref={boxRef} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => onUp(e)}
        onPointerCancel={(e) => onUp(e, true)} onPointerLeave={() => { if (!gesto.current) setHover(null); }} onDoubleClick={onDouble} onContextMenu={onContext}
        aria-label="Mapa mental. Tab cria filho, Enter cria irmão, F2 edita, Delete apaga, setas navegam, Espaço recolhe."
        className="relative flex-1 min-h-0 overflow-hidden outline-none select-none"
        style={{
          touchAction: 'none', WebkitTouchCallout: 'none', cursor: gesto.current?.tipo === 'pan' ? 'grabbing' : drag ? 'grabbing' : 'default',
          backgroundImage: `radial-gradient(${T.ponto} ${Math.max(1, 1.2 * k)}px, transparent 0)`,
          backgroundSize: `${24 * k}px ${24 * k}px`, backgroundPosition: `${view.x}px ${view.y}px`,
        }}>
        <svg width={tam.w} height={tam.h} className="absolute inset-0 block" style={{ fontFamily: FONTE }}>
          <g ref={gRef} transform={`translate(${view.x},${view.y}) scale(${k})`} fontFamily={FONTE}>
            {/* linhas */}
            {lay.ordem.map((id) => {
              const c = lay.caixas[id];
              if (!c.pai) return null;
              return <path key={`l${id}`} d={caminho(lay.caixas[c.pai], c)} fill="none" stroke={c.cor || ORANGE} strokeWidth={c.prof === 1 ? 3 : 2}
                strokeLinecap="round" opacity={foraDrag?.has(id) ? 0.25 : 0.85} />;
            })}
            {/* ideias */}
            {lay.ordem.map((id) => {
              const c = lay.caixas[id];
              const n = dadosVis.nodes[id];
              if (!n) return null;
              const ehRaiz = id === raiz;
              const cor = c.cor || ORANGE;
              const selecionada = sel === id;
              const alvo = drag?.alvo === id;
              const arrastando = !!foraDrag?.has(id);
              const editando = edit?.id === id;
              const rx = ehRaiz ? Math.min(c.h / 2, 22) : c.prof === 1 ? 10 : 8;
              const esq = c.x + c.padX + c.extraEsq;
              const dir = c.x + c.w - c.padX - (n.note ? NOTA_W : 0);
              const cx = (esq + dir) / 2;
              const corTexto = ehRaiz ? '#ffffff' : T.texto;
              const mostrarMais = !edit && !drag && (hover === id || selecionada);
              const escondidos = n.collapsed ? subarvore(dados, id).length - 1 : 0;
              const lado = ladoDe(c);
              const bordaFora = lado === 'R' ? c.x + c.w : c.x;
              const sentido = lado === 'R' ? 1 : -1;
              return (
                <g key={id} data-no={id} opacity={arrastando ? 0.35 : 1} style={{ cursor: ehRaiz ? 'default' : 'grab' }}>
                  {/* área de toque um pouco maior para o "+" não sumir no caminho */}
                  <rect data-ui="1" x={c.x - (ehRaiz || lado === 'L' ? 28 : 4)} y={c.y - 4} width={c.w + (ehRaiz ? 56 : 32)} height={c.h + 8} fill="transparent" />
                  {(selecionada || alvo) && (
                    <rect data-ui="1" x={c.x - 4} y={c.y - 4} width={c.w + 8} height={c.h + 8} rx={rx + 4} fill={alvo ? `${cor}22` : 'none'}
                      stroke={alvo ? cor : T.sel} strokeWidth={2} strokeDasharray={alvo ? '5 4' : undefined} />
                  )}
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={rx} fill={ehRaiz ? ORANGE : T.ideia}
                    stroke={ehRaiz ? 'none' : cor} strokeWidth={c.prof === 1 ? 2 : 1.4} />
                  {c.prof === 1 && <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={rx} fill={cor} opacity={T.tinta} pointerEvents="none" />}
                  {n.done && (
                    <g pointerEvents="none">
                      <circle cx={c.x + c.padX + 7} cy={c.y + c.h / 2} r={7} fill="#22c55e" />
                      <path d={`M${c.x + c.padX + 3.8},${c.y + c.h / 2} l2.3,2.4 l4.3,-4.6`} stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  )}
                  {!editando && (
                    <text x={cx} y={c.y + c.padY} fontSize={c.font} fontWeight={ehRaiz ? 700 : c.prof === 1 ? 600 : 400} textAnchor="middle"
                      fill={n.text.trim() ? corTexto : T.suave} opacity={n.done ? 0.55 : 1} textDecoration={n.done ? 'line-through' : undefined} pointerEvents="none">
                      {c.linhas.map((l, i) => <tspan key={i} x={cx} dy={i === 0 ? c.line * 0.75 : c.line}>{l || ' '}</tspan>)}
                    </text>
                  )}
                  {n.note && (
                    <text {...ui(() => { setSel(id); setNota(id); setMenu(null); })} x={c.x + c.w - c.padX - NOTA_W / 2 + 2} y={c.y + c.h / 2 + 5} fontSize={14} textAnchor="middle">
                      <title>Ver nota</title>📝
                    </text>
                  )}
                  {escondidos > 0 && (
                    <g {...ui(() => recolher(id))}>
                      <title>Expandir ({escondidos})</title>
                      <circle cx={bordaFora + sentido * 13} cy={c.y + c.h / 2} r={11} fill={T.ideia} stroke={cor} strokeWidth={1.6} />
                      <text x={bordaFora + sentido * 13} y={c.y + c.h / 2 + 4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={cor}>{escondidos > 99 ? '99+' : `+${escondidos}`}</text>
                    </g>
                  )}
                  {mostrarMais && !escondidos && (
                    ehRaiz ? (['R', 'L'] as const).map((l) => (
                      <BotaoMais key={l} x={l === 'R' ? c.x + c.w + 14 : c.x - 14} y={c.y + c.h / 2} cor={ORANGE} fundo={T.ideia} ui={ui(() => criarFilho(id, l))} />
                    )) : <BotaoMais x={bordaFora + sentido * 14} y={c.y + c.h / 2} cor={cor} fundo={T.ideia} ui={ui(() => criarFilho(id))} />
                  )}
                  {selecionada && !edit && !drag && (
                    <g {...ui(() => setMenu(menu === id ? null : id))} data-testid="pens-mais-opcoes">
                      <title>Opções da ideia</title>
                      <circle cx={ehRaiz ? c.x + c.w / 2 : lado === 'R' ? c.x - 14 : c.x + c.w + 14} cy={ehRaiz ? c.y + c.h + 15 : c.y + c.h / 2} r={10} fill={T.ideia} stroke={T.suave} strokeWidth={1.2} />
                      {[-4, 0, 4].map((d) => (
                        <circle key={d} cx={(ehRaiz ? c.x + c.w / 2 : lado === 'R' ? c.x - 14 : c.x + c.w + 14) + d} cy={ehRaiz ? c.y + c.h + 15 : c.y + c.h / 2} r={1.4} fill={T.texto} />
                      ))}
                    </g>
                  )}
                </g>
              );
            })}
            {/* fantasma do arrasto */}
            {drag && lay.caixas[drag.id] && (() => {
              const c = lay.caixas[drag.id];
              const alvo = drag.alvo ? lay.caixas[drag.alvo] : null;
              return (
                <g data-ui="1" pointerEvents="none">
                  {alvo && <line x1={alvo.x + alvo.w / 2} y1={alvo.y + alvo.h / 2} x2={drag.wx} y2={drag.wy} stroke={alvo.cor || ORANGE} strokeWidth={2} strokeDasharray="4 4" />}
                  <rect x={drag.wx - c.w / 2} y={drag.wy - c.h / 2} width={c.w} height={c.h} rx={8} fill={T.ideia} stroke={c.cor || ORANGE} strokeWidth={2} opacity={0.9} />
                  <text x={drag.wx} y={drag.wy - c.h / 2 + c.padY + c.line * 0.75} fontSize={c.font} textAnchor="middle" fill={T.texto}>{c.linhas[0]}{c.linhas.length > 1 ? '…' : ''}</text>
                </g>
              );
            })()}
          </g>
        </svg>

        {/* campo de edição por cima da ideia */}
        {edit && lay.caixas[edit.id] && (() => {
          const c = lay.caixas[edit.id];
          const s = tela(c);
          const ehRaiz = edit.id === raiz;
          const n = dadosVis.nodes[edit.id];
          return (
            <textarea ref={textRef} value={edit.texto} data-testid="pens-edicao" aria-label="Texto da ideia" maxLength={1000} rows={1}
              placeholder={PLACEHOLDER}
              onChange={(e) => setEdit({ ...edit, texto: e.target.value })}
              onBlur={() => fecharEdicao(true)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fecharEdicao(true); }
                else if (e.key === 'Tab') { e.preventDefault(); fecharEdicao(true, 'filho'); }
                else if (e.key === 'Escape') { e.preventDefault(); fecharEdicao(false); }
              }}
              className="pens-edit absolute resize-none overflow-hidden"
              style={{
                left: s.x, top: s.y, width: s.w, height: s.h,
                paddingTop: `${c.padY * k}px`, paddingBottom: 0, paddingLeft: `${(c.padX + c.extraEsq) * k}px`, paddingRight: `${(c.padX + (n?.note ? NOTA_W : 0)) * k}px`,
                fontSize: c.font * k, lineHeight: `${c.line * k}px`, fontWeight: ehRaiz ? 700 : c.prof === 1 ? 600 : 400, fontFamily: FONTE,
                textAlign: 'center', caretColor: ehRaiz ? '#fff' : T.sel, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                ['--pens-cor' as string]: ehRaiz ? '#fff' : T.texto, ['--pens-sel' as string]: T.sel, ['--pens-r' as string]: `${Math.min(c.h / 2, 12) * k}px`,
              } as CSSProperties} />
          );
        })()}

        {/* menu da ideia */}
        {menu && lay.caixas[menu] && dados.nodes[menu] && (
          <MenuIdeia key={menu} caixa={tela(lay.caixas[menu])} tam={tam} m={dados} id={menu}
            onClose={() => { setMenu(null); focar(); }}
            acoes={{
              filho: () => criarFilho(menu), irmao: () => criarIrmao(menu), editar: () => editar(menu), apagar: () => apagar(menu),
              recolher: () => recolher(menu), nota: () => { setNota(menu); setMenu(null); }, tarefa: () => virarTarefa(menu),
              alterar: (p) => alterar(menu, p),
            }} />
        )}

        {/* balão da nota */}
        {nota && lay.caixas[nota] && dados.nodes[nota] && (
          <BalaoNota key={nota} caixa={tela(lay.caixas[nota])} tam={tam} texto={dados.nodes[nota].note || ''}
            onSave={(t) => salvarNota(nota, t)}
            onClose={() => { setNota(null); focar(); }} />
        )}

        {/* zoom */}
        <div data-ui-html className="absolute right-3 bottom-3 flex flex-col rounded-xl overflow-hidden" style={{ ...card, boxShadow: '0 4px 14px rgba(0,0,0,.2)' }}>
          {([
            ['Aproximar', Plus, () => zoom(1.2)],
            ['Afastar', Minus, () => zoom(1 / 1.2)],
            ['Centralizar', LocateFixed, centralizar],
          ] as const).map(([label, Icon, fn], i) => (
            <button key={label} type="button" onClick={() => { fn(); focar(); }} aria-label={label} title={label} className="w-10 h-10 flex items-center justify-center"
              style={{ background: 'none', border: 'none', borderTop: i ? '1px solid var(--border-main)' : 'none', color: 'var(--text-secondary)' }}><Icon size={17} /></button>
          ))}
          <span className="text-[10px] text-center pb-1" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-main)' }}>{Math.round(k * 100)}%</span>
        </div>

        {/* atalhos (computador) */}
        <p className="hidden md:block absolute left-3 bottom-3 text-[11px] px-2.5 py-1.5 rounded-lg pointer-events-none" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-main)', opacity: 0.9 }}>
          <b>Tab</b> filho · <b>Enter</b> irmão · <b>F2</b> editar · <b>Del</b> apagar · <b>setas</b> navegar · <b>Espaço</b> recolher · arraste uma ideia para outra para mudar de lugar
        </p>
        {selCaixa && !edit && !menu && (
          <p className="md:hidden absolute left-3 bottom-3 text-[11px] px-2 py-1 rounded-lg pointer-events-none" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-main)' }}>
            Toque de novo para editar · segure para opções
          </p>
        )}

        {toast && (
          <div data-ui-html role="status" className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm"
            style={{ width: 'min(92vw, 380px)', background: 'var(--text-primary)', color: 'var(--bg-base)', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
            <span className="truncate">{toast.texto}</span>
            {toast.desfazer && (
              <button type="button" onClick={() => { setToast(null); desfazer(); }} className="font-bold flex-shrink-0" style={{ color: ORANGE, background: 'none', border: 'none' }}>Desfazer</button>
            )}
          </div>
        )}
      </div>

      {exportTxt !== null && (
        <Dialogo label="Lista em texto" onClose={() => { setExportTxt(null); focar(); }}>
          <div className="flex items-center gap-2 mb-3">
            <p className="flex-1 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Lista em texto</p>
            <button type="button" onClick={() => { setExportTxt(null); focar(); }} aria-label="Fechar" className="p-1" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
          <textarea id="pens-export-txt" readOnly value={exportTxt} data-scroll className="w-full flex-1 px-3 py-2 text-sm font-mono resize-none" style={{ minHeight: 260 }} />
          <div className="flex justify-end mt-3">
            <button type="button" onClick={copiar} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: ORANGE, color: '#fff', border: 'none' }}>
              {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

function BotaoMais({ x, y, cor, fundo, ui }: { x: number; y: number; cor: string; fundo: string; ui: UiProps }) {
  return (
    <g {...ui} data-testid="pens-mais">
      <title>Nova ideia filha</title>
      <circle cx={x} cy={y} r={10} fill={fundo} stroke={cor} strokeWidth={1.6} />
      <path d={`M${x - 4.5},${y} h9 M${x},${y - 4.5} v9`} stroke={cor} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

// popover posicionado perto da ideia, sem sair da tela (no celular vira folha embaixo)
function usePopover(caixa: { x: number; y: number; w: number; h: number }, tam: { w: number; h: number }, largura: number, altura: number, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [onClose]);
  const celular = tam.w < 560;
  const left = clamp(caixa.x, 8, Math.max(8, tam.w - largura - 8));
  const abaixo = caixa.y + caixa.h + 8;
  const top = abaixo + altura < tam.h - 8 ? abaixo : clamp(caixa.y - altura - 8, 8, Math.max(8, tam.h - altura - 8));
  const style: CSSProperties = celular
    ? { left: 0, right: 0, bottom: 0, maxHeight: '70%', borderRadius: '16px 16px 0 0' }
    : { left, top, width: largura, maxHeight: tam.h - 16 };
  return { ref, style };
}

function MenuIdeia({ caixa, tam, m, id, onClose, acoes }: {
  caixa: { x: number; y: number; w: number; h: number }; tam: { w: number; h: number }; m: MapaDados; id: string; onClose: () => void;
  acoes: { filho: () => void; irmao: () => void; editar: () => void; apagar: () => void; recolher: () => void; nota: () => void; tarefa: () => void; alterar: (p: Parameters<typeof setNode>[2]) => void };
}) {
  const { ref, style } = usePopover(caixa, tam, 264, 430, onClose);
  const n = m.nodes[id];
  const ehRaiz = id === m.root;
  const item = 'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2.5';
  const it = { background: 'none', border: 'none', color: 'var(--text-primary)' } as const;
  const atalho = (t: string) => <span className="ml-auto text-[11px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{t}</span>;
  return (
    <div ref={ref} data-pop data-scroll role="menu" aria-label="Opções da ideia" data-testid="pens-menu" onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 p-1.5 rounded-xl overflow-y-auto" style={{ ...card, boxShadow: '0 12px 34px rgba(0,0,0,.35)', ...style }}>
      <div className="px-3 pt-1.5 pb-2 text-xs font-semibold truncate" style={{ color: 'var(--text-muted)' }}>{n.text.trim() || PLACEHOLDER}</div>
      <button type="button" className={item} style={it} onClick={acoes.filho}><Plus size={15} /> Nova ideia filha {atalho('Tab')}</button>
      {!ehRaiz && <button type="button" className={item} style={it} onClick={acoes.irmao}><Plus size={15} /> Nova ideia irmã {atalho('Enter')}</button>}
      <button type="button" className={item} style={it} onClick={acoes.editar}><Pencil size={15} /> Editar texto {atalho('F2')}</button>

      {!ehRaiz && (
        <div className="px-3 py-2">
          <p className="text-[11px] font-bold tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>COR</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da ideia">
            <button type="button" role="radio" aria-checked={!n.cor} onClick={() => acoes.alterar({ cor: undefined })} title="Cor do ramo (automática)"
              className="h-6 px-2 rounded-full text-[11px]" style={{ border: `2px solid ${!n.cor ? ORANGE : 'var(--border-main)'}`, background: 'none', color: 'var(--text-secondary)' }}>auto</button>
            {PALETA.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={n.cor === c} aria-label={`Cor ${c}`} onClick={() => acoes.alterar({ cor: c })}
                className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: c, border: n.cor === c ? '2px solid var(--text-primary)' : '2px solid transparent', color: '#fff' }}>
                {n.cor === c && <Check size={12} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="px-3 py-2">
        <p className="text-[11px] font-bold tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>ÍCONE</p>
        <div className="grid grid-cols-9 gap-0.5">
          {ICONES.map((ic) => (
            <button key={ic} type="button" onClick={() => acoes.alterar({ icon: n.icon === ic ? undefined : ic })} aria-label={`Ícone ${ic}`} aria-pressed={n.icon === ic}
              className="h-7 rounded-md text-base flex items-center justify-center" style={{ background: n.icon === ic ? `${ORANGE}26` : 'none', border: 'none' }}>{ic}</button>
          ))}
        </div>
        {n.icon && <button type="button" onClick={() => acoes.alterar({ icon: undefined })} className="text-xs mt-1" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>Tirar ícone</button>}
      </div>

      <div style={{ borderTop: '1px solid var(--border-main)' }} className="mt-1 pt-1">
        <button type="button" className={item} style={it} onClick={() => acoes.alterar({ done: !n.done })} aria-pressed={!!n.done}>
          <Check size={15} style={{ color: n.done ? '#22c55e' : undefined }} /> {n.done ? 'Desmarcar feita' : 'Marcar como feita'}
        </button>
        <button type="button" className={item} style={it} onClick={acoes.nota}><span className="w-[15px] text-center">📝</span> {n.note ? 'Ver/editar nota' : 'Adicionar nota'}</button>
        <button type="button" className={item} style={it} onClick={acoes.tarefa} data-testid="pens-virar-tarefa">
          <ListTodo size={15} /> {n.tarefa ? 'Virar tarefa de novo' : 'Virar tarefa (para Hoje)'}
        </button>
        {!ehRaiz && n.children.length > 0 && (
          <button type="button" className={item} style={it} onClick={acoes.recolher}><MoreHorizontal size={15} /> {n.collapsed ? 'Expandir ramo' : 'Recolher ramo'} {atalho('Espaço')}</button>
        )}
        {!ehRaiz && (
          <button type="button" className={item} style={{ ...it, color: '#ef4444' }} onClick={acoes.apagar}>
            <Trash2 size={15} /> Apagar{n.children.length ? ' com o que tem embaixo' : ''} {atalho('Del')}
          </button>
        )}
      </div>
    </div>
  );
}

function BalaoNota({ caixa, tam, texto, onSave, onClose }: {
  caixa: { x: number; y: number; w: number; h: number }; tam: { w: number; h: number }; texto: string; onSave: (t: string) => void; onClose: () => void;
}) {
  const [t, setT] = useState(texto);
  const tRef = useRef(t);
  tRef.current = t;
  const salvarRef = useRef(onSave);
  salvarRef.current = onSave;
  const fechar = useCallback(() => { salvarRef.current(tRef.current); onClose(); }, [onClose]);
  const { ref, style } = usePopover(caixa, tam, 300, 220, fechar);
  // fechou de outro jeito (clicou no mapa, apagou a ideia): grava o que foi escrito
  useEffect(() => () => salvarRef.current(tRef.current), []);
  return (
    <div ref={ref} data-pop role="dialog" aria-label="Nota da ideia" data-testid="pens-nota" onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 p-3 rounded-xl flex flex-col" style={{ background: 'var(--nota-amarelo, var(--bg-card))', border: '1px solid var(--nota-amarelo-b, var(--border-main))', boxShadow: '0 12px 34px rgba(0,0,0,.35)', ...style }}>
      <div className="flex items-center mb-2">
        <p className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>📝 Nota</p>
        <button type="button" onClick={fechar} aria-label="Fechar nota" className="p-1" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={16} /></button>
      </div>
      <textarea value={t} onChange={(e) => setT(e.target.value)} autoFocus maxLength={4000} placeholder="Escreva uma nota para esta ideia…" data-scroll
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); fechar(); } }}
        className="anot-plain w-full text-sm leading-relaxed resize-none" style={{ minHeight: 130 }} />
    </div>
  );
}
