export type CardBrand = 'visa_mastercard' | 'elo_amex';

const VISA_MASTERCARD_FEES = {
  debit: 0.0099,
  credit: {
    1: 0.0320,
    2: 0.0406,
    3: 0.0466,
    4: 0.0526,
    5: 0.0586,
    6: 0.0646,
    7: 0.0753,
    8: 0.0813,
    9: 0.0873,
    10: 0.0933,
    11: 0.0993,
    12: 0.1053,
  },
};

const ELO_AMEX_FEES = {
  debit: 0.0179,
  credit: {
    1: 0.0400,
    2: 0.0486,
    3: 0.0546,
    4: 0.0606,
    5: 0.0666,
    6: 0.0726,
    7: 0.0833,
    8: 0.0893,
    9: 0.0953,
    10: 0.1013,
    11: 0.1073,
    12: 0.1133,
  },
};

export function getCardFeeRate(
  paymentMethod: string,
  cardBrand: string | null,
  installments: number
): number {
  if (paymentMethod === 'debit_card') {
    if (cardBrand === 'elo_amex') {
      return ELO_AMEX_FEES.debit;
    }
    return VISA_MASTERCARD_FEES.debit;
  }

  if (paymentMethod === 'credit_card' && installments > 0) {
    const numInstallments = Math.min(Math.max(installments, 1), 12) as keyof typeof VISA_MASTERCARD_FEES.credit;

    if (cardBrand === 'elo_amex') {
      return ELO_AMEX_FEES.credit[numInstallments];
    }
    return VISA_MASTERCARD_FEES.credit[numInstallments];
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
