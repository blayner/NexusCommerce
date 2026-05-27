import { DomainError, err, ok, Result, ValueObject } from '../../../../shared/domain';

export const MAX_QUANTITY_PER_ITEM = 99;

export class Quantity extends ValueObject<{ value: number }> {
  private constructor(value: number) {
    super({ value });
  }

  static create(value: number): Result<Quantity> {
    if (!Number.isInteger(value) || value < 1) {
      return err(DomainError.validation('Quantity must be a positive integer', { value }));
    }
    if (value > MAX_QUANTITY_PER_ITEM) {
      return err(
        DomainError.businessRule(
          `A maximum of ${MAX_QUANTITY_PER_ITEM} units per item is allowed`,
          {
            value,
          },
        ),
      );
    }
    return ok(new Quantity(value));
  }

  get value(): number {
    return this.props.value;
  }

  add(other: Quantity): Result<Quantity> {
    return Quantity.create(this.value + other.value);
  }
}
