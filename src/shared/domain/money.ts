import { DomainError, DomainException } from './domain-error';
import { ValueObject } from './value-object.base';

export const SUPPORTED_CURRENCIES = ['BRL', 'USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

interface MoneyProps {
  amountInCents: number;
  currency: Currency;
}

/**
 * Monetary amount stored as integer minor units to avoid floating point drift.
 */
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static of(amountInCents: number, currency: Currency = 'BRL'): Money {
    if (!Number.isSafeInteger(amountInCents)) {
      throw new DomainException(
        DomainError.validation('Money amount must be an integer number of cents', {
          amountInCents,
        }),
      );
    }
    if (amountInCents < 0) {
      throw new DomainException(
        DomainError.validation('Money amount cannot be negative', { amountInCents }),
      );
    }
    return new Money({ amountInCents, currency });
  }

  static zero(currency: Currency = 'BRL'): Money {
    return new Money({ amountInCents: 0, currency });
  }

  static fromDecimal(amount: number, currency: Currency = 'BRL'): Money {
    return Money.of(Math.round(amount * 100), currency);
  }

  static sum(values: readonly Money[], currency: Currency = 'BRL'): Money {
    return values.reduce(
      (acc, value) => acc.add(value),
      Money.zero(values[0]?.currency ?? currency),
    );
  }

  get amountInCents(): number {
    return this.props.amountInCents;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get isZero(): boolean {
    return this.props.amountInCents === 0;
  }

  toDecimal(): number {
    return this.props.amountInCents / 100;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money({
      amountInCents: this.amountInCents + other.amountInCents,
      currency: this.currency,
    });
  }

  /** Subtracts, never going below zero (discounts can't produce negative totals). */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money({
      amountInCents: Math.max(0, this.amountInCents - other.amountInCents),
      currency: this.currency,
    });
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new DomainException(
        DomainError.validation('Cannot multiply money by a negative factor'),
      );
    }
    return new Money({
      amountInCents: Math.round(this.amountInCents * factor),
      currency: this.currency,
    });
  }

  percentage(percent: number): Money {
    return this.multiply(percent / 100);
  }

  min(other: Money): Money {
    this.assertSameCurrency(other);
    return this.amountInCents <= other.amountInCents ? this : other;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountInCents >= other.amountInCents;
  }

  /**
   * Splits the amount into `parts` installments without losing cents:
   * the remainder is distributed to the first installments (e.g. 100 / 3 => 34, 33, 33).
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new DomainException(DomainError.validation('Parts must be a positive integer'));
    }
    const base = Math.floor(this.amountInCents / parts);
    const remainder = this.amountInCents % parts;
    return Array.from({ length: parts }, (_, index) =>
      Money.of(base + (index < remainder ? 1 : 0), this.currency),
    );
  }

  format(locale = 'pt-BR'): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: this.currency }).format(
      this.toDecimal(),
    );
  }

  toJSON(): MoneyProps {
    return { amountInCents: this.amountInCents, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DomainException(
        DomainError.validation('Currency mismatch', { left: this.currency, right: other.currency }),
      );
    }
  }
}
