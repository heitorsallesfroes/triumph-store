// Peças comuns das abas novas da página WhatsApp (mesmo visual da página).
import { useState } from 'react';
import { LABEL_PALETTE } from '../../lib/crmBridge';
import { createLabel, type WaLabelRow } from '../../lib/crmBridgeDb';

export const ORANGE = '#f97316';

// Mesmo cartão em todas as sub-abas (Painel incluso; ver ui.tsx)
export const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
export const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-main)', background: 'var(--bg-inner)', color: 'var(--text-primary)', fontSize: 13 };
export const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
export const btnPrimary: React.CSSProperties = { ...btn, background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff' };
export const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };
export const money = (n: number) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--bg-inner)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: ORANGE, transition: 'width .2s' }} />
      </div>
      <span style={muted}>{done}/{total}</span>
    </div>
  );
}

// Escolher etiqueta CRM existente ou criar uma nova (nome + cor da paleta da extensão)
export function LabelChooser({ labels, value, onChange, onCreated }: {
  labels: WaLabelRow[]; value: string; onChange: (id: string) => void; onCreated: (l: WaLabelRow) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_PALETTE[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const l = await createLabel(name, color);
      onCreated(l);
      onChange(l.id);
      setCreating(false);
      setName('');
    } catch (e: any) {
      setError(e.message || 'Não consegui criar');
    }
    setBusy(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label="Etiqueta CRM" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...input, minWidth: 220 }}>
          <option value="">Escolha a etiqueta CRM…</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button type="button" style={btn} onClick={() => setCreating(!creating)}>{creating ? 'Cancelar' : '+ Nova etiqueta'}</button>
      </div>
      {creating && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input aria-label="Nome da nova etiqueta" value={name} maxLength={40} placeholder="Nome (até 40)" onChange={(e) => setName(e.target.value)} style={input} />
          <div style={{ display: 'flex', gap: 4 }}>
            {LABEL_PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
          <button type="button" style={btnPrimary} disabled={busy || !name.trim()} onClick={create}>Criar</button>
          {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
