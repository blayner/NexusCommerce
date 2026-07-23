import { Injectable } from '@nestjs/common';
import { isRole, Role } from '../../../shared/auth';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { UserRecord, UserRepositoryPort } from '../application/user.repository.port';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return { ...user, role: isRole(user.role) ? user.role : Role.Customer };
  }

  async create(user: UserRecord): Promise<void> {
    await this.prisma.user.create({ data: user });
  }
}
