import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from './password-hasher.js';
import { PrismaUsersWriter } from './prisma-users.writer.js';
import { UsersService } from './users.service.js';
import { UserUniqueConstraintError } from './users.errors.js';

const migrationDatabaseUrl = getTemporaryMigrationDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: migrationDatabaseUrl }),
});
const passwordHasher = new PasswordHasher();
const usersService = new UsersService(
  new PrismaUsersWriter(prisma),
  passwordHasher,
);

describe('I01.1 users migration on an isolated PostgreSQL database', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates exactly the users business table', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual(['users']);
  });

  it('normalizes email and persists only an Argon2id hash through Prisma', async () => {
    const password = randomBytes(24).toString('base64url');
    const user = await usersService.create({
      firstName: 'Synthetic',
      lastName: 'User',
      email: '  HASH@Example.Test  ',
      password,
      role: 'ADMIN',
    });
    const persistedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    expect(user.email).toBe('hash@example.test');
    expect(user).not.toHaveProperty('passwordHash');
    expect(persistedUser?.passwordHash).not.toBe(password);
    await expect(
      passwordHasher.verify(persistedUser?.passwordHash ?? '', password),
    ).resolves.toBe(true);
  });

  it('rejects duplicate normalized email addresses in PostgreSQL', async () => {
    const user = {
      firstName: 'Synthetic',
      lastName: 'User',
      email: 'i01.1@example.test',
      password: randomBytes(24).toString('base64url'),
      role: UserRole.ADMIN,
    };

    await usersService.create(user);

    await expect(usersService.create(user)).rejects.toBeInstanceOf(
      UserUniqueConstraintError,
    );
  });

  it('atomically maps concurrent normalized duplicate emails to a safe error', async () => {
    const password = randomBytes(24).toString('base64url');
    const baseInput = {
      firstName: 'Synthetic',
      lastName: 'User',
      password,
      role: UserRole.MANAGER,
    };
    const results = await Promise.allSettled([
      usersService.create({
        ...baseInput,
        email: ' Concurrent@Example.Test ',
      }),
      usersService.create({ ...baseInput, email: 'concurrent@example.test' }),
    ]);
    const created = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    const failure = failures[0];

    expect(created).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failure || failure.status !== 'rejected') {
      throw new Error('Expected one concurrent duplicate to be rejected');
    }
    expect(failure.reason).toBeInstanceOf(UserUniqueConstraintError);
    if (!(failure.reason instanceof UserUniqueConstraintError)) {
      throw new Error('Expected a safe uniqueness error');
    }
    expect(failure.reason.message).toBe(
      'The user could not be created because of a uniqueness conflict.',
    );
    expect(failure.reason.message).not.toContain(password);
    expect(failure.reason.message).not.toContain('concurrent@example.test');
    await expect(
      prisma.user.count({ where: { email: 'concurrent@example.test' } }),
    ).resolves.toBe(1);
  });

  it('rejects emails that bypass the approved normalization rule', async () => {
    await expect(
      prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'User',
          email: 'UPPER@example.test',
          passwordHash: '$argon2id$synthetic-test-hash',
          role: UserRole.COLLABORATOR,
        },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects role values outside the approved set in PostgreSQL', async () => {
    await expect(prisma.$queryRaw`
      SELECT 'OWNER'::user_role
    `).rejects.toBeDefined();
  });
});
