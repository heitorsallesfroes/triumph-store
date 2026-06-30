import { getAdSpendBreakdown } from '../lib/adTax';

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Linha secundária mostrada abaixo do valor total (com imposto) em destaque — detalha a composição bruto + imposto.
export default function AdTaxBreakdown({ bruto, fontSize = 12 }: { bruto: number; fontSize?: number }) {
  if (!bruto || bruto <= 0) return null;
  const { imposto } = getAdSpendBreakdown(bruto);
  return (
    <div style={{ marginTop: 4, fontSize, color: 'var(--text-muted, #9ca3af)' }}>
      Anúncios: {fmt(bruto)} <span style={{ opacity: 0.5 }}>|</span> Imposto: {fmt(imposto)}
    </div>
  );
}
