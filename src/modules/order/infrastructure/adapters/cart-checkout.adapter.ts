import { Injectable } from '@nestjs/common';
import { Result } from '../../../../shared/domain';
import { CartService } from '../../../cart';
import { CheckoutContent, CheckoutSourcePort } from '../../domain/ports/checkout-source.port';

@Injectable()
export class CartCheckoutAdapter implements CheckoutSourcePort {
  constructor(private readonly carts: CartService) {}

  load(customerId: string): Promise<Result<CheckoutContent>> {
    return this.carts.getCheckoutSnapshot(customerId);
  }

  complete(customerId: string): Promise<void> {
    return this.carts.clear(customerId);
  }
}
