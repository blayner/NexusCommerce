import { Inject, Injectable } from '@nestjs/common';
import { DomainError, err, ok, Result } from '../../../../shared/domain';
import { Cart } from '../../domain/entities/cart.entity';
import {
  CART_REPOSITORY,
  CartRepositoryPort,
} from '../../domain/repositories/cart.repository.port';
import { CART_SETTINGS, CartSettings } from '../cart-settings';

export class RemoveFromCartCommand {
  constructor(
    public readonly customerId: string,
    public readonly productId: string,
  ) {}
}

@Injectable()
export class RemoveFromCartHandler {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepositoryPort,
    @Inject(CART_SETTINGS) private readonly settings: CartSettings,
  ) {}

  async execute(command: RemoveFromCartCommand): Promise<Result<Cart>> {
    const cart = await this.carts.findByCustomerId(command.customerId);
    if (!cart || cart.isExpired()) return err(DomainError.notFound('Cart', command.customerId));

    const removed = cart.removeItem(command.productId);
    if (!removed.ok) return removed;

    if (cart.isEmpty) {
      await this.carts.delete(command.customerId);
    } else {
      cart.extendExpiry(this.settings.ttlSeconds);
      await this.carts.save(cart);
    }
    return ok(cart);
  }
}
