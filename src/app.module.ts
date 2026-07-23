import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { CartModule } from './modules/cart';
import { CatalogModule } from './modules/catalog';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationModule } from './modules/notification';
import { OrderModule } from './modules/order';
import { PaymentModule } from './modules/payment';
import { AuthModule, JwtAuthGuard, RolesGuard } from './shared/auth';
import { CacheModule } from './shared/infrastructure/cache/cache.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { DomainExceptionFilter } from './shared/infrastructure/http/domain-exception.filter';
import { LoggingInterceptor } from './shared/infrastructure/http/logging.interceptor';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { QueueModule } from './shared/infrastructure/queue/queue.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig],
      validate: validateEnv,
    }),
    // Shared kernel & infrastructure
    SharedModule,
    PrismaModule,
    CacheModule,
    QueueModule,
    AuthModule,
    HealthModule,
    // Bounded contexts
    IdentityModule,
    CatalogModule,
    CartModule,
    PaymentModule,
    OrderModule,
    NotificationModule,
  ],
  providers: [
    // Guards run in order: authenticate, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
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
