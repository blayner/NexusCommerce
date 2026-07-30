import { DomainException, Money } from '../../../src/shared/domain';
import { combine, err, ok } from '../../../src/shared/domain/result';
import { DomainError } from '../../../src/shared/domain/domain-error';

describe('Money', () => {
  it('works in integer cents and formats in pt-BR', () => {
    const price = Money.of(1_990);
    expect(price.add(Money.of(10)).amountInCents).toBe(2_000);
    expect(price.format()).toMatch(/R\$\s?19,90/);
  });

  it('rejects fractional cents, negatives and currency mixing', () => {
    expect(() => Money.of(10.5)).toThrow(DomainException);
    expect(() => Money.of(-1)).toThrow(DomainException);
    expect(() => Money.of(100, 'BRL').add(Money.of(100, 'USD'))).toThrow('Currency mismatch');
  });

  it('never goes below zero when subtracting', () => {
    expect(Money.of(500).subtract(Money.of(800)).amountInCents).toBe(0);
  });

  it('allocates installments without losing cents', () => {
    const parts = Money.of(10_000)
      .allocate(3)
      .map((part) => part.amountInCents);
    expect(parts).toEqual([3_334, 3_333, 3_333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('compares by value', () => {
    expect(Money.of(100).equals(Money.of(100))).toBe(true);
    expect(Money.of(100).equals(Money.of(100, 'USD'))).toBe(false);
  });
});

describe('Result.combine', () => {
  it('returns the first error', () => {
    const failure = DomainError.validation('boom');
    const combined = combine([ok(1), err(failure), ok(3)]);
    expect(combined).toEqual({ ok: false, error: failure });
  });

  it('collects every value', () => {
    expect(combine([ok(1), ok(2)])).toEqual({ ok: true, value: [1, 2] });
  });
});
