import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { CartModule } from './modules/cart';
import { CatalogModule } from './modules/catalog';
import { NotificationModule } from './modules/notification';
import { OrderModule } from './modules/order';
import { PaymentModule } from './modules/payment';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig],
      validate: validateEnv,
    }),
    SharedModule,
    // Bounded contexts
    CatalogModule,
    CartModule,
    PaymentModule,
    OrderModule,
    NotificationModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
