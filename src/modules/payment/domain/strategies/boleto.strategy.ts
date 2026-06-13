import { randomInt } from 'crypto';
import { Payment } from '../entities/payment.entity';
import { PaymentStrategy, StrategyOutcome } from './payment-strategy.interface';

const SANDBOX_BANK_CODE = '999';
const DUE_IN_DAYS = 3;
const FACTOR_BASE_DATE = Date.UTC(1997, 9, 7); // FEBRABAN due-date factor base (1997-10-07)

/**
 * Registers a boleto bancário and returns the 44-digit barcode and the 47-digit
 * digitable line, with the FEBRABAN mod-11 (barcode) and mod-10 (fields) check digits.
 */
export class BoletoStrategy implements PaymentStrategy {
  readonly method = 'BOLETO' as const;

  async execute(payment: Payment): Promise<StrategyOutcome> {
    if (payment.amount.currency !== 'BRL') {
      return { status: 'DECLINED', reason: 'Boleto only supports BRL' };
    }
    if (payment.amount.amountInCents > 9_999_999_999) {
      return { status: 'DECLINED', reason: 'Amount exceeds boleto limit' };
    }

    const dueDate = new Date(Date.now() + DUE_IN_DAYS * 86_400_000);
    const freeField = Array.from({ length: 25 }, () => randomInt(0, 10)).join('');
    const barcode = buildBarcode(
      SANDBOX_BANK_CODE,
      dueDate,
      payment.amount.amountInCents,
      freeField,
    );

    return {
      status: 'PENDING',
      providerReference: `bol_${freeField.slice(0, 17)}`,
      instructions: {
        type: 'BOLETO',
        barcode,
        digitableLine: toDigitableLine(barcode),
        dueDate: dueDate.toISOString().slice(0, 10),
      },
      // Boletos settle in D+1/D+2: keep the reservation a bit longer than the due date.
      expiresAt: new Date(dueDate.getTime() + 2 * 86_400_000),
    };
  }

  async refund(_payment: Payment): Promise<void> {
    // Boleto refunds are made by bank transfer; would be delegated to the finance flow.
  }
}

export function dueDateFactor(date: Date): string {
  const days = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - FACTOR_BASE_DATE) /
      86_400_000,
  );
  // The factor rolled over after 9999 (Feb 2025) and restarts at 1000.
  const factor = days > 9999 ? ((days - 10_000) % 9_000) + 1_000 : days;
  return factor.toString().padStart(4, '0');
}

export function buildBarcode(
  bank: string,
  dueDate: Date,
  amountInCents: number,
  freeField: string,
): string {
  const withoutDv =
    bank + '9' + dueDateFactor(dueDate) + amountInCents.toString().padStart(10, '0') + freeField;
  const dv = mod11(withoutDv);
  return withoutDv.slice(0, 4) + dv + withoutDv.slice(4);
}

export function toDigitableLine(barcode: string): string {
  const field1 = barcode.slice(0, 4) + barcode.slice(19, 24);
  const field2 = barcode.slice(24, 34);
  const field3 = barcode.slice(34, 44);
  const field4 = barcode[4];
  const field5 = barcode.slice(5, 19);

  const f1 = field1 + mod10(field1);
  const f2 = field2 + mod10(field2);
  const f3 = field3 + mod10(field3);

  return `${f1.slice(0, 5)}.${f1.slice(5)} ${f2.slice(0, 5)}.${f2.slice(5)} ${f3.slice(0, 5)}.${f3.slice(5)} ${field4} ${field5}`;
}

export function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const product = Number(digits[i]) * weight;
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

export function mod11(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}
