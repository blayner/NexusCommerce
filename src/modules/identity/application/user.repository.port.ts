import { Role } from '../../../shared/auth';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
}
