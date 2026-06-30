// Imposto aplicado sobre o gasto bruto em ads (cobrado pela plataforma além do valor exibido no Gerenciador de Anúncios).
export const AD_TAX_RATE = 0.1383;

export interface AdSpendBreakdown {
  bruto: number;
  imposto: number;
  total: number;
}

export function getAdSpendBreakdown(bruto: number): AdSpendBreakdown {
  const imposto = bruto * AD_TAX_RATE;
  return { bruto, imposto, total: bruto + imposto };
}

// Valor de gasto em ads a usar em cálculos derivados (ROAS, ROI, CPV) — reflete o custo real.
export function toAdSpendReal(bruto: number): number {
  return bruto * (1 + AD_TAX_RATE);
}
