import {
  Currency,
  DomainError,
  err,
  Money,
  ok,
  Result,
  ValueObject,
} from '../../../../shared/domain';

interface PriceProps {
  amount: Money;
  /** Optional "from" price shown struck-through; must be higher than the sale price. */
  compareAt?: Money;
}

export const MAX_PRICE_IN_CENTS = 100_000_000; // R$ 1.000.000,00

export class Price extends ValueObject<PriceProps> {
  private constructor(props: PriceProps) {
    super(props);
  }

  static create(
    amountInCents: number,
    currency: Currency = 'BRL',
    compareAtInCents?: number | null,
  ): Result<Price> {
    if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
      return err(DomainError.validation('Price must be a positive integer amount in cents'));
    }
    if (amountInCents > MAX_PRICE_IN_CENTS) {
      return err(DomainError.validation('Price exceeds the maximum allowed value'));
    }
    if (compareAtInCents !== undefined && compareAtInCents !== null) {
      if (!Number.isInteger(compareAtInCents) || compareAtInCents <= amountInCents) {
        return err(
          DomainError.validation('Compare-at price must be an integer greater than the price', {
            amountInCents,
            compareAtInCents,
          }),
        );
      }
    }

    return ok(
      new Price({
        amount: Money.of(amountInCents, currency),
        compareAt:
          compareAtInCents !== undefined && compareAtInCents !== null
            ? Money.of(compareAtInCents, currency)
            : undefined,
      }),
    );
  }

  get amount(): Money {
    return this.props.amount;
  }

  get compareAt(): Money | undefined {
    return this.props.compareAt;
  }

  get currency(): Currency {
    return this.props.amount.currency;
  }

  get isOnSale(): boolean {
    return this.props.compareAt !== undefined;
  }

  /** Whole-number discount percentage relative to the compare-at price. */
  get discountPercentage(): number {
    const { amount, compareAt } = this.props;
    if (!compareAt) return 0;
    return Math.round((1 - amount.amountInCents / compareAt.amountInCents) * 100);
  }
}
