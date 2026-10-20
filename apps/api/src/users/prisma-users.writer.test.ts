import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { NewUserRecord } from './users.service.js';
import { PrismaUsersWriter } from './prisma-users.writer.js';
import type { UserRecord } from './user-projection.js';

describe('PrismaUsersWriter', () => {
  it('persists the provided user data through the Prisma users delegate', async () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    const persistedUser: UserRecord = {
      id: '00000000-0000-4000-8000-000000000003',
      firstName: 'Synthetic',
      lastName: 'User',
      email: 'user@example.test',
      passwordHash: '$argon2id$synthetic-test-hash',
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const newUser: NewUserRecord = {
      firstName: persistedUser.firstName,
      lastName: persistedUser.lastName,
      email: persistedUser.email,
      passwordHash: persistedUser.passwordHash,
      role: persistedUser.role,
    };
    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://127.0.0.1:5433/nextriva_test',
      }),
    });
    const create = vi
      .spyOn(prisma.user, 'create')
      .mockResolvedValue(persistedUser);
    const writer = new PrismaUsersWriter(prisma);

    await expect(writer.create(newUser)).resolves.toBe(persistedUser);
    expect(create).toHaveBeenCalledWith({ data: newUser });

    await prisma.$disconnect();
  });

  it('returns a safe duplicate-email error without exposing Prisma details', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://127.0.0.1:5433/nextriva_test',
      }),
    });
    const sensitiveEmail = 'private.user@example.test';
    vi.spyOn(prisma.user, 'create').mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
      message: `Unique constraint failed for ${sensitiveEmail}`,
    });
    const writer = new PrismaUsersWriter(prisma);

    const error = await writer
      .create({
        firstName: 'Synthetic',
        lastName: 'User',
        email: sensitiveEmail,
        passwordHash: '$argon2id$synthetic-test-hash',
        role: 'ADMIN',
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error('Expected an Error instance');
    }
    expect(error.message).toBe(
      'The user could not be created because of a uniqueness conflict.',
    );
    expect(String(error)).not.toContain(sensitiveEmail);
    await prisma.$disconnect();
  });
});
