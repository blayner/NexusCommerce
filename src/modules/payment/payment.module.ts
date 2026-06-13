import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';
import { PaymentService } from './application/services/payment.service';
import { PAYMENT_REPOSITORY } from './domain/repositories/payment.repository.port';
import { BoletoStrategy } from './domain/strategies/boleto.strategy';
import { CreditCardStrategy } from './domain/strategies/credit-card.strategy';
import {
  PAYMENT_STRATEGIES,
  PaymentStrategy,
} from './domain/strategies/payment-strategy.interface';
import { PaymentStrategyResolver } from './domain/strategies/payment-strategy.resolver';
import { PixStrategy } from './domain/strategies/pix.strategy';
import { PrismaPaymentRepository } from './infrastructure/adapters/payment.repository.adapter';
import {
  PAYMENT_MAINTENANCE_QUEUE,
  PaymentExpirationProcessor,
} from './infrastructure/jobs/payment-expiration.processor';
import { PaymentController } from './presentation/payment.controller';

@Module({
  imports: [BullModule.registerQueue({ name: PAYMENT_MAINTENANCE_QUEUE })],
  controllers: [PaymentController],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    {
      provide: PAYMENT_STRATEGIES,
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>): PaymentStrategy[] => [
        new CreditCardStrategy(),
        new PixStrategy(config.payments.pix),
        new BoletoStrategy(),
      ],
    },
    PaymentStrategyResolver,
    PaymentService,
    PaymentExpirationProcessor,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
