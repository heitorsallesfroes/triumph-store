import { getAdSpendBreakdown } from '../lib/adTax';

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdTaxBreakdown({ bruto, fontSize = 12 }: { bruto: number; fontSize?: number }) {
  if (!bruto || bruto <= 0) return null;
  const { imposto, total } = getAdSpendBreakdown(bruto);
  return (
    <div style={{ marginTop: 6, fontSize, lineHeight: 1.6 }}>
      <div style={{ color: 'var(--text-muted, #9ca3af)' }}>+ Imposto (13,83%): {fmt(imposto)}</div>
      <div style={{ color: 'var(--text-secondary, #d1d5db)', fontWeight: 600 }}>= Total Real: {fmt(total)}</div>
    </div>
  );
}
