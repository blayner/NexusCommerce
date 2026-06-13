import { DomainError, err, ok, Result, ValueObject } from '../../../../shared/domain';

export type PaymentMethodType = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

export const MAX_INSTALLMENTS = 12;

/**
 * Discriminated union: each method carries only the data it needs. Card data is
 * always a gateway token – raw PANs never reach this service (PCI-DSS scope reduction).
 */
export type PaymentMethodDetails =
  | { type: 'CREDIT_CARD'; cardToken: string; installments: number; holderName?: string }
  | { type: 'PIX' }
  | { type: 'BOLETO'; customerDocument: string; customerName: string };

export class PaymentMethod extends ValueObject<{ details: PaymentMethodDetails }> {
  private constructor(details: PaymentMethodDetails) {
    super({ details });
  }

  static create(details: PaymentMethodDetails): Result<PaymentMethod> {
    switch (details.type) {
      case 'CREDIT_CARD': {
        if (!/^tok_[A-Za-z0-9_]{4,64}$/.test(details.cardToken ?? '')) {
          return err(DomainError.validation('Invalid card token'));
        }
        if (
          !Number.isInteger(details.installments) ||
          details.installments < 1 ||
          details.installments > MAX_INSTALLMENTS
        ) {
          return err(
            DomainError.validation(`Installments must be between 1 and ${MAX_INSTALLMENTS}`),
          );
        }
        return ok(new PaymentMethod({ ...details }));
      }
      case 'PIX':
        return ok(new PaymentMethod({ type: 'PIX' }));
      case 'BOLETO': {
        const document = (details.customerDocument ?? '').replace(/\D/g, '');
        if (!isValidCpf(document) && !isValidCnpj(document)) {
          return err(DomainError.validation('Boleto requires a valid CPF or CNPJ'));
        }
        if (!details.customerName?.trim()) {
          return err(DomainError.validation('Boleto requires the payer name'));
        }
        return ok(
          new PaymentMethod({
            type: 'BOLETO',
            customerDocument: document,
            customerName: details.customerName.trim(),
          }),
        );
      }
    }
  }

  get type(): PaymentMethodType {
    return this.props.details.type;
  }

  get details(): PaymentMethodDetails {
    return this.props.details;
  }

  /** Safe representation for logs/persistence (no tokens). */
  toPublicJSON(): Record<string, unknown> {
    const { details } = this.props;
    switch (details.type) {
      case 'CREDIT_CARD':
        return { type: details.type, installments: details.installments };
      case 'PIX':
        return { type: details.type };
      case 'BOLETO':
        return { type: details.type, customerDocument: maskDocument(details.customerDocument) };
    }
  }
}

export function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const checkDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .reduce((acc, digit, index) => acc + digit * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const checkDigit = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + weight * digits[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return checkDigit(12) === digits[12] && checkDigit(13) === digits[13];
}

function maskDocument(document: string): string {
  return document.length <= 4 ? '****' : `${'*'.repeat(document.length - 4)}${document.slice(-4)}`;
}
