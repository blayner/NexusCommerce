import { Request } from 'express';
import { Role } from './role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
