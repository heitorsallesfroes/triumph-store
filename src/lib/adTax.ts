import { getConfigNumber } from './systemConfig';

// Imposto aplicado sobre o gasto bruto em ads (cobrado pela plataforma além do valor exibido no Gerenciador de Anúncios).
export function getAdTaxRate(): number {
  return getConfigNumber('ad_tax_rate');
}

export interface AdSpendBreakdown {
  bruto: number;
  imposto: number;
  total: number;
}

export function getAdSpendBreakdown(bruto: number): AdSpendBreakdown {
  const imposto = bruto * getAdTaxRate();
  return { bruto, imposto, total: bruto + imposto };
}

// Valor de gasto em ads a usar em cálculos derivados (ROAS, ROI, CPV) — reflete o custo real.
export function toAdSpendReal(bruto: number): number {
  return bruto * (1 + getAdTaxRate());
}
