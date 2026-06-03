import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { CatalogModule } from '../catalog';
import { PaymentModule } from '../payment';
import { CancelOrderHandler } from './application/commands/cancel-order.command';
import { PlaceOrderHandler } from './application/commands/place-order.command';
import { OrderPlacementSaga } from './application/sagas/order.saga';
import { OrderService } from './application/services/order.service';
import { CHECKOUT_SOURCE_PORT } from './domain/ports/checkout-source.port';
import { INVENTORY_PORT } from './domain/ports/inventory.port';
import { ORDER_REPOSITORY } from './domain/ports/order.repository.port';
import { PAYMENT_GATEWAY_PORT } from './domain/ports/payment-gateway.port';
import { CartCheckoutAdapter } from './infrastructure/adapters/cart-checkout.adapter';
import { CatalogInventoryAdapter } from './infrastructure/adapters/catalog-inventory.adapter';
import { PrismaOrderRepository } from './infrastructure/adapters/order.repository.adapter';
import { PaymentGatewayAdapter } from './infrastructure/adapters/payment-gateway.adapter';
import { OrderController } from './presentation/order.controller';

@Module({
  imports: [CatalogModule, CartModule, PaymentModule],
  controllers: [OrderController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: INVENTORY_PORT, useClass: CatalogInventoryAdapter },
    { provide: PAYMENT_GATEWAY_PORT, useClass: PaymentGatewayAdapter },
    { provide: CHECKOUT_SOURCE_PORT, useClass: CartCheckoutAdapter },
    OrderPlacementSaga,
    PlaceOrderHandler,
    CancelOrderHandler,
    OrderService,
  ],
  exports: [OrderService],
})
export class OrderModule {}
