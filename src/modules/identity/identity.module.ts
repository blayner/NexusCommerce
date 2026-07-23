import { Module } from '@nestjs/common';
import { IdentityService } from './application/identity.service';
import { PasswordHasher } from './application/password-hasher';
import { USER_REPOSITORY } from './application/user.repository.port';
import { PrismaUserRepository } from './infrastructure/user.repository.adapter';
import { IdentityController } from './presentation/identity.controller';

@Module({
  controllers: [IdentityController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PasswordHasher, useValue: new PasswordHasher() },
    IdentityService,
  ],
})
export class IdentityModule {}
