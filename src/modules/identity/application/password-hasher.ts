import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'crypto';

export class PasswordHasher {
  /**
   * Hash compared against when the e-mail does not exist, so a login for an unknown
   * account costs the same as a wrong password (prevents user enumeration by timing).
   */
  private dummyHash?: Promise<string>;

  constructor(private readonly cost = 12) {}

  hash(password: string): Promise<string> {
    return hash(password, this.cost);
  }

  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    if (passwordHash === null) {
      this.dummyHash ??= hash(randomUUID(), this.cost);
      await compare(password, await this.dummyHash);
      return false;
    }
    return compare(password, passwordHash);
  }
}
