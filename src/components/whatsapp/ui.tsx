// Kit visual das sub-abas da página WhatsApp (Painel e as outras): título de seção, cartão de número,
// dica (i), esqueleto de carregamento, estado vazio e tabela ordenável. Cores do ERP (variáveis do tema
// claro/escuro) com o laranja da Triumph de destaque.
import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { ORANGE } from './shared';

export const GREEN = '#22c55e';
export const RED = '#ef4444';
export const BLUE = '#3b82f6';
export const SLATE = '#94a3b8';

export const panel: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 16, padding: 18,
  boxShadow: '0 1px 2px rgba(0,0,0,0.06)', minWidth: 0,
};
export const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };

// ── Formatos ──
const nf = new Intl.NumberFormat('pt-BR');
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(Math.round(n)));
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n >= 1000 ? 0 : 2 }));
export const fmtPct = (p: number | null | undefined, digits = 0) => (p == null ? '—' : `${(p * 100).toFixed(digits).replace('.', ',')}%`);
export function fmtMinutes(m: number | null | undefined): string {
  if (m == null) return '—';
  const v = Math.round(m);
  if (v < 60) return `${v} min`;
  if (v < 1440) { const h = Math.floor(v / 60); const r = v % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.floor(v / 1440); const h = Math.round((v % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

// ── Título de seção (mesmo em todas as sub-abas) ──
export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Dica (i): passa o mouse, toca ou dá foco ──
export function InfoTip({ text, label = 'Como é calculado' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        style={{ display: 'inline-flex', padding: 0, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'help' }}>
        <Info size={13} />
      </button>
      {open && (
        <span role="tooltip" id={id} style={{
          position: 'absolute', zIndex: 30, top: 20, left: '50%', transform: 'translateX(-50%)', width: 260, maxWidth: '70vw',
          padding: '10px 12px', borderRadius: 10, background: 'var(--bg-inner)', border: '1px solid var(--border-main)',
          color: 'var(--text-secondary)', fontSize: 12, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0, textTransform: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', whiteSpace: 'normal',
        }}>{text}</span>
      )}
    </span>
  );
}

// ── Variação em relação ao período anterior ──
export function Delta({ value, title }: { value: number | null; title?: string }) {
  if (value === null) return <span title={title} style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>novo</span>;
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return <span title={title} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>= 0%</span>;
  const up = value > 0;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: up ? GREEN : RED,
      background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: 999 }}>
      {up ? '▲' : '▼'} {fmtPct(Math.abs(value))}
    </span>
  );
}

// ── Cartão de número grande ──
export function StatCard({ label, value, sub, delta, deltaTitle, info, accent = false }: {
  label: string; value: string; sub?: React.ReactNode; delta?: number | null; deltaTitle?: string; info?: string; accent?: boolean;
}) {
  return (
    <div style={{ ...panel, position: 'relative', overflow: 'visible', display: 'flex', flexDirection: 'column', gap: 6, ...(accent ? { borderColor: 'rgba(249,115,22,0.45)' } : {}) }}>
      {accent && <span aria-hidden style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3, background: ORANGE }} />}
      <div style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{label}</span>
        {info && <InfoTip text={info} label={`Como "${label}" é calculado`} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</span>
        {delta !== undefined && <Delta value={delta} title={deltaTitle} />}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

// ── Esqueleto e vazio ──
export function SkeletonStyle() {
  return <style>{'@keyframes waSkel{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}.wa-skel{background:linear-gradient(90deg,var(--bg-inner) 0,var(--bg-hover) 50%,var(--bg-inner) 100%);background-size:200px 100%;animation:waSkel 1.2s ease-in-out infinite;border-radius:10px}@media (prefers-reduced-motion: reduce){.wa-skel{animation:none}}'}</style>;
}
export const Skeleton = ({ h = 16, w = '100%' }: { h?: number; w?: number | string }) => <div className="wa-skel" aria-hidden style={{ height: h, width: w }} />;
export function EmptyState({ text = 'Sem dados neste período' }: { text?: string }) {
  return <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{text}</div>;
}

// ── Tabela ordenável ──
export interface Column<T> { key: string; label: string; value: (r: T) => number | string | null; render?: (r: T) => React.ReactNode; align?: 'left' | 'right'; info?: string }
export function SortTable<T>({ rows, columns, rowKey, initialSort, empty, max = 50 }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; initialSort: string; empty?: string; max?: number;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initialSort, desc: true });
  if (!rows.length) return <EmptyState text={empty} />;
  const col = columns.find((c) => c.key === sort.key) || columns[0];
  const sorted = [...rows].sort((a, b) => {
    const va = col.value(a); const vb = col.value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return sort.desc ? -c : c;
  }).slice(0, max);
  const th: React.CSSProperties = { ...eyebrow, padding: '10px 12px', borderBottom: '1px solid var(--border-main)', whiteSpace: 'nowrap', background: 'var(--bg-card)' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-main)' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = c.key === sort.key;
              return (
                <th key={c.key} style={{ ...th, textAlign: c.align || 'left' }} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : true })}
                      style={{ padding: 0, border: 'none', background: 'transparent', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer', color: active ? ORANGE : 'var(--text-muted)' }}>
                      {c.label}{active ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                    {c.info && <InfoTip text={c.info} label={`Como "${c.label}" é calculado`} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => <td key={c.key} style={{ ...td, textAlign: c.align || 'left' }}>{c.render ? c.render(r) : (c.value(r) ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Mostrando {max} de {rows.length}.</div>}
    </div>
  );
}
