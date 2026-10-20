import type { PrismaClient } from '../../generated/prisma/client.js';
import type { NewUserRecord, UsersWriter } from './users.service.js';
import type { UserRecord } from './user-projection.js';
import { UserUniqueConstraintError } from './users.errors.js';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === 'P2002'
  );
}

export class PrismaUsersWriter implements UsersWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async create(user: NewUserRecord): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data: user });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new UserUniqueConstraintError();
      }

      throw error;
    }
  }
}
