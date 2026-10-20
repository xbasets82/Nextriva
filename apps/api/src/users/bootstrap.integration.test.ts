import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';
import { UsersManagementStore } from './users-management.store.js';
import { PasswordHasher } from './password-hasher.js';

const parentUrl = getTemporaryMigrationDatabaseUrl();
const name = `nextriva_test_i02_1_${randomBytes(16).toString('hex')}`;
const isolated = new URL(parentUrl);
isolated.pathname = `/${name}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: parentUrl }),
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolated.toString() }),
});
const store = new UsersManagementStore(prisma);
beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const migration = spawnSync(
    process.execPath,
    [
      createRequire(import.meta.url).resolve('prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      'prisma.test.config.ts',
    ],
    {
      env: createTestProcessEnvironment({
        NEXTRIVA_MIGRATION_DATABASE_URL: isolated.toString(),
      }),
      encoding: 'utf8',
    },
  );
  if (migration.status !== 0) throw new Error('Isolated migration failed');
});
afterAll(async () => {
  await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.$disconnect();
});
it('provisions exactly one first administrator under concurrent different identities and never changes existing administrators', async () => {
  const passwordHash = await new PasswordHasher().hash(
    randomBytes(24).toString('base64url'),
  );
  const input = {
    firstName: 'Inicial',
    lastName: 'Administrador',
    email: 'bootstrap-a@example.test',
    role: 'ADMIN' as const,
    passwordHash,
  };
  const results = await Promise.all([
    store.bootstrap(input),
    store.bootstrap({ ...input, email: 'bootstrap-b@example.test' }),
  ]);
  expect(results.sort()).toEqual([false, true]);
  const before = await prisma.user.findMany();
  expect(before).toHaveLength(1);
  expect(before[0]?.role).toBe('ADMIN');
  expect(
    await store.bootstrap({
      ...input,
      passwordHash: randomBytes(32).toString('hex'),
    }),
  ).toBe(false);
  expect(await prisma.user.findMany()).toEqual(before);
  await prisma.user.updateMany({ data: { isActive: false } });
  const inactive = await prisma.user.findMany();
  expect(await store.bootstrap(input)).toBe(false);
  expect(await prisma.user.findMany()).toEqual(inactive);
});

it('runs the real bootstrap command against an isolated empty PostgreSQL database without exposing credentials', async () => {
  const commandName = `nextriva_test_i02_1_${randomBytes(16).toString('hex')}`;
  const commandUrl = new URL(parentUrl);
  commandUrl.pathname = `/${commandName}`;
  const commandPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: commandUrl.toString() }),
  });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${commandName}"`);
  try {
    const migrationEnvironment = createTestProcessEnvironment({
      NEXTRIVA_MIGRATION_DATABASE_URL: commandUrl.toString(),
    });
    const migration = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        'prisma.test.config.ts',
      ],
      { env: migrationEnvironment, encoding: 'utf8' },
    );
    if (migration.status !== 0)
      throw new Error('Command fixture migration failed');
    const build = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('typescript/bin/tsc'),
        '-p',
        'tsconfig.build.json',
      ],
      { env: createTestProcessEnvironment(), encoding: 'utf8' },
    );
    if (build.status !== 0) throw new Error('Command fixture build failed');
    const password = randomBytes(24).toString('base64url');
    const input = {
      firstName: 'Inicial',
      lastName: 'Comando',
      email: 'command-admin@example.test',
      password,
    };
    const run = (email: string) =>
      spawnSync(
        process.execPath,
        ['dist/src/users/bootstrap-admin.command.js'],
        {
          env: createTestProcessEnvironment({
            NEXTRIVA_BOOTSTRAP_DATABASE_URL: commandUrl.toString(),
          }),
          input: JSON.stringify({ ...input, email }),
          encoding: 'utf8',
        },
      );
    const result = run(input.email);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Administrador inicial creado.\n');
    expect(result.stderr).toBe('');
    const before = await commandPrisma.user.findMany();
    expect(before).toHaveLength(1);
    expect(
      await new PasswordHasher().verify(
        before[0]?.passwordHash ?? '',
        password,
      ),
    ).toBe(true);
    const repeated = run('another-command@example.test');
    expect(repeated.status).toBe(0);
    expect(repeated.stdout).toBe(
      'Existe un administrador; no se han realizado cambios.\n',
    );
    expect(await commandPrisma.user.findMany()).toEqual(before);
    for (const output of [
      result.stdout,
      result.stderr,
      repeated.stdout,
      repeated.stderr,
    ]) {
      expect(output).not.toContain(password);
      expect(output).not.toContain('$argon2');
      expect(output).not.toContain(input.email);
    }
  } finally {
    await commandPrisma.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${commandName}"`);
  }
}, 15_000);
