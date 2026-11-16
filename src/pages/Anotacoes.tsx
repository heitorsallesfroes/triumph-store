// 📓 Gestão › Anotações: TAREFAS (checklist por dia, com prioridade, repetição e arrastar) e NOTAS (cartões tipo
// post-it, salvos sozinhos enquanto digita). Regras puras em src/lib/anotacoes.ts (testadas em
// scripts/tests/anotacoes.test.ts). Tabelas erp_tarefas / erp_notas: supabase/migrations/20261127120000_erp_anotacoes.sql
// — sem ela a página mostra o aviso e não grava nada.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  NotebookPen, ListChecks, StickyNote, Plus, Star, Trash2, GripVertical, Repeat, Check, ChevronDown, ChevronRight,
  Search, Pin, PinOff, X, AlertTriangle, CalendarDays, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useErpDirty, useErpRefresh } from '../lib/erpRefresh';
import { initialTab, writeTab } from '../lib/erpRoute';
import { announcePendentes } from '../lib/anotacoesDb';
import {
  CORES, RAPIDAS, REPETICOES, agrupar, blocosDoTexto, corValida, dateKey, dueLabel, filtrarNotas, isDateKey, isOverdue,
  moveInList, nextDue, nextPosition, notaVazia, pendentesHoje, quickDate, reorderUpdates, tabelaFaltando,
  type Cor, type GrupoId, type Nota, type Rapida, type Repeticao, type Tarefa,
} from '../lib/anotacoes';

const ORANGE = '#f97316';
const MIGRATION = 'supabase/migrations/20261127120000_erp_anotacoes.sql';
const TABS = ['tarefas', 'notas'] as const;
type Tab = (typeof TABS)[number];
const UNDO_MS = 5000;

// estilos da página (cores das notas nos dois temas; campos "limpos" sem a borda global dos inputs)
const CSS = `
.anot { --nota-amarelo:#3a3317; --nota-verde:#1b3325; --nota-azul:#172a3d; --nota-rosa:#3a1d2b; --nota-roxo:#2a2140; --nota-cinza:#24242c;
  --nota-amarelo-b:#5c4f1c; --nota-verde-b:#2a5038; --nota-azul-b:#24425f; --nota-rosa-b:#5a2c42; --nota-roxo-b:#433463; --nota-cinza-b:#3a3a45; }
html.light .anot { --nota-amarelo:#fef6c7; --nota-verde:#dcf5e3; --nota-azul:#dbeafe; --nota-rosa:#fce1ec; --nota-roxo:#ede4fd; --nota-cinza:#eef0f3;
  --nota-amarelo-b:#f1df86; --nota-verde-b:#a9e2bb; --nota-azul-b:#a8c9f5; --nota-rosa-b:#f3b5cd; --nota-roxo-b:#cdb8f5; --nota-cinza-b:#d3d7de; }
.anot input.anot-plain, .anot textarea.anot-plain { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 4px !important; padding: 0 !important; }
.anot .anot-row:hover .anot-hover { opacity: 1; }
.anot .anot-hover { opacity: .55; transition: opacity .15s; }
@media (hover: none) { .anot .anot-hover { opacity: 1; } }
.anot .anot-card { transition: transform .12s, box-shadow .12s; }
.anot .anot-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
`;

const card = { background: 'var(--bg-card)', border: '1px solid var(--border-main)' } as const;
const chip = (on: boolean, color = ORANGE) => ({
  background: on ? `${color}1f` : 'transparent',
  border: `1px solid ${on ? color : 'var(--border-main)'}`,
  color: on ? color : 'var(--text-secondary)',
});
const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

function useToday(): string {
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    const tick = () => setToday(dateKey(new Date()));
    const iv = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return today;
}

// ── "desfazer" por alguns segundos (excluir só vai para o banco quando o tempo acaba) ──
interface Undo { id: number; text: string; undo: () => void; commit: () => void }
function useUndo() {
  const [items, setItems] = useState<Undo[]>([]);
  const timers = useRef(new Map<number, { t: number; commit: () => void }>());
  const push = useCallback((text: string, undo: () => void, commit: () => void) => {
    const id = Date.now() + Math.random();
    const t = window.setTimeout(() => { timers.current.delete(id); setItems((l) => l.filter((x) => x.id !== id)); commit(); }, UNDO_MS);
    timers.current.set(id, { t, commit });
    setItems((l) => [...l.slice(-2), { id, text, undo, commit }]);
  }, []);
  const doUndo = (u: Undo) => {
    const tm = timers.current.get(u.id);
    if (tm) window.clearTimeout(tm.t);
    timers.current.delete(u.id);
    setItems((l) => l.filter((x) => x.id !== u.id));
    u.undo();
  };
  // saiu da página: grava o que estava esperando
  useEffect(() => () => { timers.current.forEach(({ t, commit }) => { window.clearTimeout(t); commit(); }); timers.current.clear(); }, []);
  const view = (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center" style={{ width: 'min(92vw, 380px)' }}>
      {items.map((u) => (
        <div key={u.id} role="status" className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
          <span className="truncate">{u.text}</span>
          <button type="button" onClick={() => doUndo(u)} className="font-bold flex-shrink-0" style={{ color: ORANGE, background: 'none', border: 'none' }}>Desfazer</button>
        </div>
      ))}
    </div>
  );
  return { push, view };
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Anotacoes() {
  const [tab, setTab] = useState<Tab>(() => initialTab('anotacoes', TABS, 'tarefas'));
  const [faltaMigration, setFaltaMigration] = useState(false);
  const onMissing = useCallback(() => setFaltaMigration(true), []);
  const choose = (t: Tab) => { setTab(t); writeTab('anotacoes', t === 'tarefas' ? null : t); };

  return (
    <div className="anot p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <style>{CSS}</style>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}>
          <NotebookPen size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Anotações</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Suas tarefas do dia e um bloco de notas.</p>
        </div>
      </div>

      {faltaMigration && (
        <div role="alert" data-testid="anot-migration" className="mb-5 p-4 rounded-xl flex gap-3 text-sm"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.45)', color: 'var(--text-primary)' }}>
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
          <div>
            <p className="font-semibold">Falta aplicar a migration das Anotações no Supabase</p>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Rode o arquivo <code className="px-1 rounded" style={{ background: 'var(--bg-inner)' }}>{MIGRATION}</code> no SQL Editor
              do Supabase. Até lá nada aqui é salvo.
            </p>
          </div>
        </div>
      )}

      <div role="tablist" className="inline-flex p-1 rounded-xl mb-5" style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
        {([['tarefas', 'Tarefas', ListChecks], ['notas', 'Notas', StickyNote]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => choose(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: tab === id ? 'var(--bg-card)' : 'transparent', color: tab === id ? ORANGE : 'var(--text-muted)',
              boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,.15)' : 'none', border: 'none' }}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'tarefas' ? <Tarefas bloqueado={faltaMigration} onMissing={onMissing} /> : <Notas bloqueado={faltaMigration} onMissing={onMissing} />}
    </div>
  );
}

// ═══════════════════════════════ TAREFAS ═══════════════════════════════════
const TASK_COLS = 'id,texto,due_date,done,done_at,importante,repeticao,position,created_at,updated_at';
const DONE_LIMIT = 100;

function Tarefas({ bloqueado, onMissing }: { bloqueado: boolean; onMissing: () => void }) {
  const today = useToday();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [rapida, setRapida] = useState<Rapida | 'data'>('hoje');
  const [dataEscolhida, setDataEscolhida] = useState('');
  const [verFeitas, setVerFeitas] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const undo = useUndo();
  useErpDirty(texto.trim().length > 0);

  const load = useCallback(async () => {
    const [pend, feitas] = await Promise.all([
      supabase.from('erp_tarefas').select(TASK_COLS).eq('done', false),
      supabase.from('erp_tarefas').select(TASK_COLS).eq('done', true).order('done_at', { ascending: false }).limit(DONE_LIMIT),
    ]);
    const e = pend.error || feitas.error;
    if (e) { if (tabelaFaltando(e)) onMissing(); else setErro(errMsg(e)); setLoading(false); return; }
    setErro(null);
    setTarefas([...(pend.data || []), ...(feitas.data || [])] as Tarefa[]);
    setLoading(false);
  }, [onMissing]);
  useEffect(() => { load(); }, [load]);
  useErpRefresh(load);

  // contador do menu
  const pendentes = pendentesHoje(tarefas, today);
  useEffect(() => { if (!loading && !bloqueado) announcePendentes(pendentes); }, [pendentes, loading, bloqueado]);

  const fail = (e: unknown) => { setErro(`Não foi possível salvar: ${errMsg(e)}`); load(); };
  const patch = async (id: string, p: Partial<Tarefa>) => {
    setTarefas((l) => l.map((t) => (t.id === id ? { ...t, ...p } : t)));
    const { error } = await supabase.from('erp_tarefas').update(p).eq('id', id);
    if (error) fail(error);
  };

  const adicionar = async () => {
    const txt = texto.trim();
    if (!txt || bloqueado) return;
    const due = rapida === 'data' ? (isDateKey(dataEscolhida) ? dataEscolhida : today) : quickDate(rapida, today);
    const row = { texto: txt, due_date: due, position: nextPosition(tarefas) };
    setTexto('');
    const { data, error } = await supabase.from('erp_tarefas').insert(row).select(TASK_COLS).single();
    if (error) { setTexto(txt); if (tabelaFaltando(error)) onMissing(); else setErro(`Não foi possível adicionar: ${errMsg(error)}`); return; }
    setErro(null);
    setTarefas((l) => [...l, data as Tarefa]);
    inputRef.current?.focus();
  };

  const alternar = async (t: Tarefa) => {
    if (t.done) { patch(t.id, { done: false, done_at: null }); return; }
    const done_at = new Date().toISOString();
    // repetir: esta fica feita (sem repetir) e nasce a próxima com a mesma repetição
    await patch(t.id, { done: true, done_at, ...(t.repeticao ? { repeticao: null } : {}) });
    if (t.repeticao) {
      const prox = { texto: t.texto, importante: t.importante, repeticao: t.repeticao, due_date: nextDue(t.due_date, t.repeticao, today), position: t.position };
      const { data, error } = await supabase.from('erp_tarefas').insert(prox).select(TASK_COLS).single();
      if (error) fail(error); else setTarefas((l) => [...l, data as Tarefa]);
    }
  };

  const excluir = (t: Tarefa) => {
    setTarefas((l) => l.filter((x) => x.id !== t.id));
    undo.push('Tarefa excluída',
      () => setTarefas((l) => (l.some((x) => x.id === t.id) ? l : [...l, t])),
      () => { supabase.from('erp_tarefas').delete().eq('id', t.id).then(({ error }) => { if (error) fail(error); }); });
  };

  const reordenar = async (antes: Tarefa[], depois: Tarefa[]) => {
    const ups = reorderUpdates(antes, depois);
    if (!ups.length) return;
    const pos = new Map(ups.map((u) => [u.id, u.position]));
    setTarefas((l) => l.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t)));
    const res = await Promise.all(ups.map((u) => supabase.from('erp_tarefas').update({ position: u.position }).eq('id', u.id)));
    const e = res.find((r) => r.error)?.error;
    if (e) fail(e);
  };

  const { grupos, feitas } = useMemo(() => agrupar(tarefas, today), [tarefas, today]);
  const desab = bloqueado;

  return (
    <div>
      {/* adicionar */}
      <div className="p-3 sm:p-4 rounded-2xl mb-6" style={card}>
        <form onSubmit={(e) => { e.preventDefault(); adicionar(); }} className="flex gap-2">
          <input ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={desab}
            placeholder="O que precisa fazer?" aria-label="Nova tarefa" data-testid="anot-nova-tarefa" maxLength={500}
            className="flex-1 min-w-0 px-4 py-3 text-base" autoFocus />
          <button type="submit" disabled={desab || !texto.trim()} aria-label="Adicionar tarefa"
            className="px-4 rounded-lg flex items-center gap-1.5 font-semibold text-sm flex-shrink-0"
            style={{ background: ORANGE, color: '#fff', border: 'none', opacity: desab || !texto.trim() ? 0.5 : 1 }}>
            <Plus size={18} /> <span className="hidden sm:inline">Adicionar</span>
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {RAPIDAS.map((r) => (
            <button key={r.id} type="button" onClick={() => setRapida(r.id)} className="px-3 py-1 rounded-full text-xs font-medium" style={chip(rapida === r.id)}>
              {r.label}
            </button>
          ))}
          <button type="button" onClick={() => { setRapida('data'); if (!dataEscolhida) setDataEscolhida(today); }}
            className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1" style={chip(rapida === 'data')}>
            <CalendarDays size={12} /> {rapida === 'data' && isDateKey(dataEscolhida) ? dueLabel(dataEscolhida, today) : 'Escolher data'}
          </button>
          {rapida === 'data' && (
            <input type="date" value={dataEscolhida} min={today} onChange={(e) => setDataEscolhida(e.target.value)} aria-label="Data da tarefa"
              className="px-2 py-1 text-xs" />
          )}
        </div>
      </div>

      {erro && <p role="alert" className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>{erro}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <Grupo key={g.id} id={g.id} label={g.label} tarefas={g.tarefas} today={today}
              onToggle={alternar} onPatch={patch} onDelete={excluir} onReorder={reordenar} />
          ))}

          {feitas.length > 0 && (
            <section>
              <button type="button" onClick={() => setVerFeitas((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold mb-2"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }} aria-expanded={verFeitas}>
                {verFeitas ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Feitas
                <span className="text-xs font-normal">({feitas.length}{feitas.length >= DONE_LIMIT ? '+' : ''})</span>
              </button>
              {verFeitas && (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  {feitas.map((t) => (
                    <TaskRow key={t.id} t={t} today={today} onToggle={alternar} onPatch={patch} onDelete={excluir} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {undo.view}
    </div>
  );
}

const GRUPO_COR: Partial<Record<GrupoId, string>> = { atrasadas: '#ef4444', hoje: ORANGE };

function Grupo({ id, label, tarefas, today, onToggle, onPatch, onDelete, onReorder }: {
  id: GrupoId; label: string; tarefas: Tarefa[]; today: string;
  onToggle: (t: Tarefa) => void; onPatch: (id: string, p: Partial<Tarefa>) => void; onDelete: (t: Tarefa) => void;
  onReorder: (antes: Tarefa[], depois: Tarefa[]) => void;
}) {
  // arrastar pela alça (mouse e toque): a lista muda ao vivo e grava ao soltar
  const [drag, setDrag] = useState<{ id: string; order: Tarefa[] } | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const lista = drag ? drag.order : tarefas;
  const cor = GRUPO_COR[id];

  const start = (tid: string, e: RPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: tid, order: tarefas });
  };
  const move = (e: RPointerEvent) => {
    if (!drag) return;
    for (const t of drag.order) {
      const el = rows.current.get(t.id);
      if (!el || t.id === drag.id) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        const order = moveInList(drag.order, drag.id, t.id);
        if (order !== drag.order) setDrag({ id: drag.id, order });
        break;
      }
    }
  };
  const end = () => {
    if (!drag) return;
    onReorder(tarefas, drag.order);
    setDrag(null);
  };

  return (
    <section data-testid={`anot-grupo-${id}`}>
      <h2 className="flex items-center gap-2 text-sm font-bold mb-2 px-1" style={{ color: cor || 'var(--text-secondary)' }}>
        {label}
        <span className="text-xs font-semibold px-1.5 rounded-full" style={{ background: cor ? `${cor}1f` : 'var(--bg-inner)', color: cor || 'var(--text-muted)' }}>{tarefas.length}</span>
      </h2>
      <div className="rounded-2xl overflow-hidden" style={{ ...card, ...(id === 'atrasadas' ? { borderColor: 'rgba(239,68,68,.4)' } : {}) }}>
        {lista.length === 0 ? (
          <p className="px-4 py-5 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Nada para hoje. 🎉</p>
        ) : lista.map((t) => (
          <div key={t.id} ref={(el) => { if (el) rows.current.set(t.id, el); else rows.current.delete(t.id); }}
            style={{ opacity: drag && drag.id !== t.id ? 0.85 : 1, background: drag?.id === t.id ? `${ORANGE}14` : undefined }}>
            <TaskRow t={t} today={today} onToggle={onToggle} onPatch={onPatch} onDelete={onDelete}
              handle={lista.length > 1 ? { onPointerDown: (e) => start(t.id, e), onPointerMove: move, onPointerUp: end, onPointerCancel: end } : undefined} />
          </div>
        ))}
      </div>
    </section>
  );
}

type HandleProps = Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>;

function TaskRow({ t, today, onToggle, onPatch, onDelete, handle }: {
  t: Tarefa; today: string; onToggle: (t: Tarefa) => void; onPatch: (id: string, p: Partial<Tarefa>) => void; onDelete: (t: Tarefa) => void; handle?: HandleProps;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(t.texto);
  const [menu, setMenu] = useState(false);
  const atrasada = isOverdue(t, today);
  useErpDirty(editando && rascunho.trim() !== t.texto);

  const salvar = () => {
    const v = rascunho.trim();
    setEditando(false);
    if (v && v !== t.texto) onPatch(t.id, { texto: v }); else setRascunho(t.texto);
  };

  return (
    <div className="anot-row flex items-start gap-2 px-2 sm:px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-main)' }} data-testid="anot-tarefa">
      {handle ? (
        <span {...handle} title="Arraste para reordenar" aria-label="Arrastar" className="anot-hover mt-0.5 cursor-grab flex-shrink-0 p-0.5"
          style={{ color: 'var(--text-muted)', touchAction: 'none' }}>
          <GripVertical size={16} />
        </span>
      ) : <span className="w-5 flex-shrink-0" />}

      <button type="button" onClick={() => onToggle(t)} aria-label={t.done ? 'Desmarcar' : 'Marcar como feita'} aria-pressed={t.done}
        className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
        style={{ border: `2px solid ${t.done ? '#22c55e' : atrasada ? '#ef4444' : 'var(--text-muted)'}`, background: t.done ? '#22c55e' : 'transparent', color: '#fff' }}>
        {t.done && <Check size={13} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
        <div className="flex-1 min-w-0">
          {editando ? (
            <input value={rascunho} autoFocus onChange={(e) => setRascunho(e.target.value)} onBlur={salvar} maxLength={500}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setRascunho(t.texto); setEditando(false); } }}
              className="anot-plain w-full text-[15px]" aria-label="Editar tarefa" />
          ) : (
            <button type="button" onClick={() => { setRascunho(t.texto); setEditando(true); }} title="Clique para editar"
              className="text-left w-full text-[15px] break-words"
              style={{ background: 'none', border: 'none', padding: 0, color: t.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.done ? 'line-through' : 'none' }}>
              {t.texto}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!t.done && (
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Mudar data e repetição"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ ...chip(atrasada, '#ef4444'), ...(atrasada ? {} : { color: 'var(--text-muted)' }) }}>
                {t.repeticao && <Repeat size={11} />}
                {dueLabel(t.due_date, today)}
              </button>
              {menu && <DateMenu t={t} today={today} onClose={() => setMenu(false)} onPatch={(p) => onPatch(t.id, p)} />}
            </div>
          )}
          <button type="button" onClick={() => onPatch(t.id, { importante: !t.importante })} aria-label={t.importante ? 'Tirar de importante' : 'Marcar como importante'}
            aria-pressed={t.importante} title="Importante" className={`p-1 rounded ${t.importante ? '' : 'anot-hover'}`} style={{ background: 'none', border: 'none' }}>
            <Star size={16} fill={t.importante ? '#f59e0b' : 'none'} style={{ color: t.importante ? '#f59e0b' : 'var(--text-muted)' }} />
          </button>
          <button type="button" onClick={() => onDelete(t)} aria-label="Excluir tarefa" title="Excluir" className="anot-hover p-1 rounded"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DateMenu({ t, today, onClose, onPatch }: { t: Tarefa; today: string; onClose: () => void; onPatch: (p: Partial<Tarefa>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  const setDue = (d: string | null) => { onPatch({ due_date: d }); onClose(); };
  const setRep = (r: Repeticao | null) => onPatch({ repeticao: r, ...(r && !t.due_date ? { due_date: today } : {}) });
  const item = 'w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center justify-between gap-2';

  return (
    <div ref={ref} role="dialog" aria-label="Data e repetição" className="absolute right-0 top-full mt-1 z-40 p-2 rounded-xl w-56"
      style={{ ...card, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
      <p className="px-3 pt-1 pb-1 text-[11px] font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>QUANDO</p>
      {RAPIDAS.map((r) => {
        const d = quickDate(r.id, today);
        return (
          <button key={r.id} type="button" onClick={() => setDue(d)} className={item}
            style={{ background: t.due_date === d ? 'var(--bg-inner)' : 'transparent', border: 'none', color: 'var(--text-primary)' }}>
            {r.label}{d && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dueLabel(d, today)}</span>}
          </button>
        );
      })}
      <label className="block px-3 py-1.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Escolher data</span>
        <input type="date" value={t.due_date || ''} onChange={(e) => { if (isDateKey(e.target.value)) setDue(e.target.value); }} className="w-full mt-1 px-2 py-1 text-sm" />
      </label>
      <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-main)' }}>REPETIR</p>
      {[{ id: null as Repeticao | null, label: 'Não repetir' }, ...REPETICOES].map((r) => (
        <button key={r.id || 'nao'} type="button" onClick={() => setRep(r.id)} className={item}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)' }}>
          {r.label}{t.repeticao === r.id && <Check size={14} style={{ color: ORANGE }} />}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════ NOTAS ═════════════════════════════════════
const NOTE_COLS = 'id,titulo,texto,cor,fixada,created_at,updated_at';
type Rascunho = Pick<Nota, 'titulo' | 'texto' | 'cor' | 'fixada'> & { id: string | null };
const corVar = (c: Cor) => `var(--nota-${c})`;
const corBorda = (c: Cor) => `var(--nota-${c}-b)`;

function Notas({ bloqueado, onMissing }: { bloqueado: boolean; onMissing: () => void }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<Rascunho | null>(null);
  const [confirmar, setConfirmar] = useState<Nota | null>(null);
  const undo = useUndo();
  const excluidas = useRef(new Set<string>()); // excluída esperando o "desfazer": o editor não a traz de volta

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('erp_notas').select(NOTE_COLS);
    if (error) { if (tabelaFaltando(error)) onMissing(); else setErro(errMsg(error)); setLoading(false); return; }
    setErro(null);
    setNotas((data || []).map((n) => ({ ...n, cor: corValida(n.cor) })) as Nota[]);
    setLoading(false);
  }, [onMissing]);
  useEffect(() => { load(); }, [load]);
  useErpRefresh(() => { if (!aberta) return load(); });

  const lista = useMemo(() => filtrarNotas(notas, busca), [notas, busca]);
  const upsertLocal = (n: Nota) => !excluidas.current.has(n.id) && setNotas((l) => (l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [n, ...l]));

  const fixar = async (n: Nota) => {
    const up = { ...n, fixada: !n.fixada };
    upsertLocal(up);
    const { error } = await supabase.from('erp_notas').update({ fixada: up.fixada }).eq('id', n.id);
    if (error) { setErro(errMsg(error)); load(); }
  };
  const excluir = (n: Nota) => {
    setConfirmar(null);
    setAberta((a) => (a?.id === n.id ? null : a));
    excluidas.current.add(n.id);
    setNotas((l) => l.filter((x) => x.id !== n.id));
    undo.push('Nota excluída',
      () => { excluidas.current.delete(n.id); setNotas((l) => (l.some((x) => x.id === n.id) ? l : [...l, n])); },
      () => { supabase.from('erp_notas').delete().eq('id', n.id).then(({ error }) => { if (error) { setErro(errMsg(error)); load(); } }); });
  };
  const nova = () => { if (!bloqueado) setAberta({ id: null, titulo: '', texto: '', cor: 'amarelo', fixada: false }); };

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-4 flex gap-2 items-center" style={{ background: 'var(--bg-base)' }}>
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas notas" aria-label="Buscar nas notas"
            className="w-full pl-9 pr-8 py-2.5 text-sm" />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={14} /></button>
          )}
        </div>
        <button type="button" onClick={nova} disabled={bloqueado} data-testid="anot-nova-nota"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold flex-shrink-0"
          style={{ background: ORANGE, color: '#fff', border: 'none', opacity: bloqueado ? 0.5 : 1 }}>
          <Plus size={17} /> Nova nota
        </button>
      </div>

      {erro && <p role="alert" className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>{erro}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="text-center py-14 text-sm" style={{ color: 'var(--text-muted)' }}>
          <StickyNote size={30} className="mx-auto mb-2 opacity-60" />
          {busca ? 'Nenhuma nota encontrada.' : 'Nenhuma nota ainda. Clique em "Nova nota" para começar.'}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
          {lista.map((n) => (
            <article key={n.id} className="anot-card anot-row relative rounded-2xl p-4 cursor-pointer flex flex-col" data-testid="anot-nota"
              style={{ background: corVar(n.cor), border: `1px solid ${corBorda(n.cor)}`, minHeight: 120, maxHeight: 320, overflow: 'hidden' }}
              onClick={() => setAberta({ id: n.id, titulo: n.titulo, texto: n.texto, cor: n.cor, fixada: n.fixada })}>
              <div className="flex items-start gap-2 mb-1">
                <h3 className="flex-1 min-w-0 font-semibold text-[15px] break-words" style={{ color: 'var(--text-primary)' }}>
                  {n.titulo || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{n.texto ? '' : 'Nota vazia'}</span>}
                </h3>
                <button type="button" onClick={(e) => { e.stopPropagation(); fixar(n); }} aria-label={n.fixada ? 'Desafixar' : 'Fixar no topo'}
                  title={n.fixada ? 'Desafixar' : 'Fixar no topo'} className={`p-1 -m-1 rounded ${n.fixada ? '' : 'anot-hover'}`}
                  style={{ background: 'none', border: 'none', color: n.fixada ? ORANGE : 'var(--text-muted)' }}>
                  <Pin size={15} fill={n.fixada ? ORANGE : 'none'} />
                </button>
              </div>
              <div className="flex-1 text-sm overflow-hidden" style={{ color: 'var(--text-secondary)' }}><TextoNota texto={n.texto} /></div>
              <div className="flex justify-end mt-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmar(n); }} aria-label="Excluir nota" title="Excluir"
                  className="anot-hover p-1 -m-1 rounded" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {aberta && (
        <NotaEditor key={aberta.id || 'nova'} inicial={aberta} onSaved={upsertLocal} onClose={() => setAberta(null)} onMissing={onMissing}
          onDelete={(id) => { const n = notas.find((x) => x.id === id); if (n) setConfirmar(n); }} />
      )}

      {confirmar && (
        <Modal onClose={() => setConfirmar(null)} label="Excluir nota" small>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Excluir esta nota?</p>
          <p className="text-sm mb-4 truncate" style={{ color: 'var(--text-muted)' }}>{confirmar.titulo || confirmar.texto.slice(0, 80) || 'Nota vazia'}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConfirmar(null)} className="px-4 py-2 rounded-lg text-sm"
              style={{ border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-secondary)' }}>Cancelar</button>
            <button type="button" onClick={() => excluir(confirmar)} data-testid="anot-confirmar-excluir" className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#ef4444', color: '#fff', border: 'none' }}>Excluir</button>
          </div>
        </Modal>
      )}
      {undo.view}
    </div>
  );
}

function TextoNota({ texto }: { texto: string }) {
  return (
    <>
      {blocosDoTexto(texto).map((b, i) => (b.tipo === 'lista' ? (
        <ul key={i} className="list-disc pl-5 my-1 space-y-0.5">{b.itens.map((it, j) => <li key={j} className="break-words">{it}</li>)}</ul>
      ) : (
        <p key={i} className="whitespace-pre-wrap break-words">{b.linhas.join('\n')}</p>
      )))}
    </>
  );
}

function Modal({ children, onClose, label, small, style }: { children: ReactNode; onClose: () => void; label: string; small?: boolean; style?: CSSProperties }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,.5)' }} onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onPointerDown={(e) => e.stopPropagation()}
        className={`w-full ${small ? 'sm:max-w-sm' : 'sm:max-w-xl'} rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] flex flex-col`}
        style={{ ...card, boxShadow: '0 20px 50px rgba(0,0,0,.35)', ...style }}>
        {children}
      </div>
    </div>
  );
}

// editor da nota: salva sozinho ~0,6 s depois de parar de digitar (a nova só vai para o banco quando tiver conteúdo)
function NotaEditor({ inicial, onSaved, onClose, onDelete, onMissing }: {
  inicial: Rascunho; onSaved: (n: Nota) => void; onClose: () => void; onDelete: (id: string) => void; onMissing: () => void;
}) {
  const [d, setD] = useState<Rascunho>(inicial);
  const [status, setStatus] = useState<'idle' | 'pendente' | 'salvando' | 'salvo' | 'erro'>('idle');
  const latest = useRef(d);
  latest.current = d;
  const idRef = useRef<string | null>(inicial.id);
  const saved = useRef(JSON.stringify(inicial));
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | null>(null);
  useErpDirty(status === 'pendente' || status === 'salvando');
  // callbacks do pai em refs: "salvar" fica estável (o efeito de saída não roda a cada tecla)
  const cb = useRef({ onSaved, onMissing, onClose });
  cb.current = { onSaved, onMissing, onClose };

  const salvar = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const cur = latest.current;
      const snap = JSON.stringify({ ...cur, id: idRef.current });
      if (snap === saved.current || (!idRef.current && notaVazia(cur))) { setStatus((s) => (s === 'erro' ? s : saved.current === snap ? 'salvo' : 'idle')); return; }
      setStatus('salvando');
      const row = { titulo: cur.titulo, texto: cur.texto, cor: cur.cor, fixada: cur.fixada };
      const q = idRef.current
        ? supabase.from('erp_notas').update(row).eq('id', idRef.current).select(NOTE_COLS).single()
        : supabase.from('erp_notas').insert(row).select(NOTE_COLS).single();
      const { data, error } = await q;
      if (error) { if (tabelaFaltando(error)) cb.current.onMissing(); setStatus('erro'); return; }
      idRef.current = (data as Nota).id;
      saved.current = JSON.stringify({ ...cur, id: idRef.current });
      cb.current.onSaved({ ...(data as Nota), cor: corValida((data as Nota).cor) });
      setStatus(JSON.stringify({ ...latest.current, id: idRef.current }) === saved.current ? 'salvo' : 'pendente');
    });
    return chain.current;
  }, []);

  const change = (p: Partial<Rascunho>) => {
    setD((x) => ({ ...x, ...p }));
    setStatus('pendente');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; salvar(); }, 600);
  };
  const fechar = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    salvar();
    cb.current.onClose();
  }, [salvar]);
  // saiu da página com o editor aberto: grava o que faltava
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); salvar(); } }, [salvar]);

  const label = { idle: '', pendente: 'Digitando…', salvando: 'Salvando…', salvo: 'Salvo', erro: 'Erro ao salvar — tente de novo' }[status];

  return (
    <Modal onClose={fechar} label="Nota" style={{ background: corVar(d.cor), borderColor: corBorda(d.cor) }}>
      <div className="flex items-center gap-2 mb-3">
        <input value={d.titulo} onChange={(e) => change({ titulo: e.target.value })} placeholder="Título" aria-label="Título da nota" maxLength={200}
          className="anot-plain flex-1 min-w-0 text-lg font-semibold" autoFocus={!inicial.id} />
        <button type="button" onClick={() => change({ fixada: !d.fixada })} aria-label={d.fixada ? 'Desafixar' : 'Fixar no topo'} title={d.fixada ? 'Desafixar' : 'Fixar no topo'}
          className="p-1.5 rounded-lg" style={{ background: 'none', border: 'none', color: d.fixada ? ORANGE : 'var(--text-muted)' }}>
          {d.fixada ? <Pin size={18} fill={ORANGE} /> : <PinOff size={18} />}
        </button>
        <button type="button" onClick={fechar} aria-label="Fechar" className="p-1.5 rounded-lg" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={18} /></button>
      </div>
      <textarea value={d.texto} onChange={(e) => change({ texto: e.target.value })} aria-label="Texto da nota" data-testid="anot-nota-texto"
        placeholder={'Escreva aqui…\n- use "- " para fazer uma lista'} autoFocus={!!inicial.id}
        className="anot-plain w-full flex-1 text-[15px] leading-relaxed resize-none" style={{ minHeight: 220 }} />
      <div className="flex items-center gap-2 mt-3 pt-3 flex-wrap" style={{ borderTop: `1px solid ${corBorda(d.cor)}` }}>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Cor da nota">
          {CORES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={d.cor === c.id} aria-label={c.label} title={c.label} onClick={() => change({ cor: c.id })}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: corVar(c.id), border: `2px solid ${d.cor === c.id ? ORANGE : corBorda(c.id)}`, color: ORANGE }}>
              {d.cor === c.id && <Check size={12} strokeWidth={3} />}
            </button>
          ))}
        </div>
        <span className="flex-1 text-right text-xs flex items-center justify-end gap-1" data-testid="anot-nota-status"
          style={{ color: status === 'erro' ? '#ef4444' : 'var(--text-muted)' }}>
          {status === 'salvo' && <Check size={12} />}{label}
        </span>
        {idRef.current && (
          <button type="button" onClick={() => onDelete(idRef.current!)} aria-label="Excluir nota" title="Excluir" className="p-1.5 rounded-lg"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><Trash2 size={16} /></button>
        )}
      </div>
    </Modal>
  );
}
