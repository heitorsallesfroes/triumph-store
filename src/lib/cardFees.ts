import { getConfigNumber } from './systemConfig';

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
  installments: number
): number {
  const prefix = BRAND_PREFIX[resolveBrand(cardBrand)];

  if (paymentMethod === 'debit_card') {
    return getConfigNumber(`${prefix}_debit`);
  }

  if ((paymentMethod === 'credit_card' || paymentMethod === 'payment_link') && installments > 0) {
    const numInstallments = Math.min(Math.max(installments, 1), 12);
    return getConfigNumber(`${prefix}_credit_${numInstallments}`);
  }

  return 0;
}

export function calculateCardFee(
  amount: number,
  paymentMethod: string,
  cardBrand: string | null,
  installments: number
): number {
  const feeRate = getCardFeeRate(paymentMethod, cardBrand, installments);
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
  installments: number
): string {
  const rate = getCardFeeRate(paymentMethod, cardBrand, installments);
  return `${(rate * 100).toFixed(2)}%`;
}
