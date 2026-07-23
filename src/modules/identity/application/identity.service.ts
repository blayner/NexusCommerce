import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { JwtPayload, Role } from '../../../shared/auth';
import { DomainError, err, ok, Result } from '../../../shared/domain';
import { PasswordHasher } from './password-hasher';
import { USER_REPOSITORY, UserRepositoryPort } from './user.repository.port';

export interface AccessToken {
  accessToken: string;
  tokenType: 'Bearer';
  user: { id: string; email: string; name: string; role: Role };
}

/**
 * Identity is a supporting subdomain: a thin application service is enough here, so it
 * intentionally skips the full aggregate/port ceremony used by the core modules.
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<Result<AccessToken>> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      return err(DomainError.conflict('E-mail already registered'));
    }

    const user = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      passwordHash: await this.hasher.hash(input.password),
      role: Role.Customer, // admins are provisioned out-of-band, never self-registered
    };
    await this.users.create(user);
    return ok(await this.issueToken(user));
  }

  async login(emailInput: string, password: string): Promise<Result<AccessToken>> {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
    const valid = await this.hasher.verify(password, user?.passwordHash ?? null);
    if (!user || !valid) {
      // Same message for unknown e-mail and wrong password (no user enumeration).
      return err(DomainError.unauthorized('Invalid e-mail or password'));
    }
    return ok(await this.issueToken(user));
  }

  private async issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  }): Promise<AccessToken> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
