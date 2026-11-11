// estilos das abas Automações e Direct do Instagram (o mesmo visual do Rastreio)
import type React from 'react';

export const ORANGE = '#f97316';
export const PINK = '#c026d3';
export const GREEN = '#16a34a';
export const RED = '#ef4444';
export const bd = 'var(--border-main)';
export const box: React.CSSProperties = { background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid', borderColor: bd, borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', minWidth: 0 };
export const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
export const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
export const primary: React.CSSProperties = { ...btn, background: ORANGE, borderColor: ORANGE, color: '#fff' };
export const chip = (on: boolean): React.CSSProperties => ({ ...btn, padding: '6px 12px', borderRadius: 999, ...(on ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : {}) });
export const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
export const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: 'var(--bg-inner)', color: 'var(--text-primary)', fontSize: 14 };
export const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '12px 0 4px' };
export const badge = (bg: string, color = '#fff'): React.CSSProperties => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' });
export const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
export const ddmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
