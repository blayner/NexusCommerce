import { DomainError, err, ok, Result, ValueObject } from '../../../../shared/domain';

/** e.g. "TSHIRT-BLK-M", "NB-PRO14-512" */
const SKU_PATTERN = /^[A-Z0-9]{2,12}(-[A-Z0-9]{1,12}){0,4}$/;

export class Sku extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): Result<Sku> {
    const normalized = (raw ?? '').trim().toUpperCase();
    if (!SKU_PATTERN.test(normalized)) {
      return err(
        DomainError.validation(`Invalid SKU "${raw}"`, {
          rule: 'Uppercase alphanumeric segments separated by "-" (max 5 segments)',
        }),
      );
    }
    return ok(new Sku(normalized));
  }

  static normalize(raw: string): string {
    return (raw ?? '').trim().toUpperCase();
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
