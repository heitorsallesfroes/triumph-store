import { getConfigNumber, getConfigString } from './systemConfig';

// Data da venda (AAAA-MM-DD) para a taxa do link. Texto já em AAAA-MM-DD fica como está (é o que os
// relatórios usam para agrupar as vendas); data/hora completa vira o dia no fuso de São Paulo.
export type FeeDate = string | Date | null | undefined;
export function feeDateOf(d: FeeDate): string | null {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Hoje no fuso de São Paulo (venda nova)
export const todayFeeDate = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export type CardBrand = 'visa_mastercard' | 'elo_amex';

const BRAND_PREFIX: Record<CardBrand, string> = {
  visa_mastercard: 'fee_vm',
  elo_amex: 'fee_ea',
};

function resolveBrand(cardBrand: string | null): CardBrand {
  return cardBrand === 'elo_amex' ? 'elo_amex' : 'visa_mastercard';
}

export function getCardFeeRate(
  paymentMethod: string,
  cardBrand: string | null,
  installments: number,
  saleDate?: FeeDate
): number {
  const prefix = BRAND_PREFIX[resolveBrand(cardBrand)];

  if (paymentMethod === 'debit_card') {
    return getConfigNumber(`${prefix}_debit`);
  }

  // Link de pagamento: taxas próprias (fee_link_*) só para vendas a partir de fee_link_start_date;
  // antes dessa data (ou sem data) usa a taxa do crédito, como sempre foi
  if (paymentMethod === 'payment_link' && installments > 0) {
    const numInstallments = Math.min(Math.max(installments, 1), 12);
    const day = feeDateOf(saleDate);
    const start = getConfigString('fee_link_start_date');
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(start) && day >= start) {
      const linkPrefix = prefix.replace('fee_', 'fee_link_');
      return getConfigNumber(`${linkPrefix}_credit_${numInstallments}`);
    }
    return getConfigNumber(`${prefix}_credit_${numInstallments}`);
  }

  if (paymentMethod === 'credit_card' && installments > 0) {
    const numInstallments = Math.min(Math.max(installments, 1), 12);
    return getConfigNumber(`${prefix}_credit_${numInstallments}`);
  }

  return 0;
}

export function calculateCardFee(
  amount: number,
  paymentMethod: string,
  cardBrand: string | null,
  installments: number,
  saleDate?: FeeDate
): number {
  const feeRate = getCardFeeRate(paymentMethod, cardBrand, installments, saleDate);
  return amount * feeRate;
}

export function getCardBrandLabel(cardBrand: string | null): string {
  if (cardBrand === 'visa_mastercard') return 'Visa / Mastercard';
  if (cardBrand === 'elo_amex') return 'Elo / Amex';
  return '';
}

export function getFeePercentageLabel(
  paymentMethod: string,
  cardBrand: string | null,
  installments: number,
  saleDate?: FeeDate
): string {
  const rate = getCardFeeRate(paymentMethod, cardBrand, installments, saleDate);
  return `${(rate * 100).toFixed(2)}%`;
}
