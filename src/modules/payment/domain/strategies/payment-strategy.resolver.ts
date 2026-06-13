import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethodType } from '../value-objects/payment-method.vo';
import { PAYMENT_STRATEGIES, PaymentStrategy } from './payment-strategy.interface';

@Injectable()
export class PaymentStrategyResolver {
  private readonly strategies: ReadonlyMap<PaymentMethodType, PaymentStrategy>;

  constructor(@Inject(PAYMENT_STRATEGIES) strategies: PaymentStrategy[]) {
    const map = new Map<PaymentMethodType, PaymentStrategy>();
    for (const strategy of strategies) {
      if (map.has(strategy.method)) {
        throw new Error(`Duplicate payment strategy registered for ${strategy.method}`);
      }
      map.set(strategy.method, strategy);
    }
    this.strategies = map;
  }

  resolve(method: PaymentMethodType): PaymentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new Error(`No payment strategy registered for ${method}`);
    }
    return strategy;
  }

  get supportedMethods(): PaymentMethodType[] {
    return [...this.strategies.keys()];
  }
}
