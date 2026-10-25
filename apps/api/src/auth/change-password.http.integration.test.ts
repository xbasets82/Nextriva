import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { csrfForSession } from './auth-security.js';
import { PrismaAuthStore } from './prisma-auth.store.js';

const replacementPassword = randomBytes(24).toString('base64url');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const hasher = new PasswordHasher();
const origin = 'https://nextriva.example';
let app: INestApplication;
let base: string;
@Module({})
class FixtureModule {}
beforeAll(async () => {
  app = await NestFactory.create(
    {
      module: FixtureModule,
      imports: [
        AuthModule.register({
          service: new AuthService(new PrismaAuthStore(prisma), hasher),
          configuration: { origin, localHttp: false },
        }),
      ],
    },
    { logger: false },
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});
async function fixture(role: 'ADMIN' | 'MANAGER' | 'COLLABORATOR' = 'ADMIN') {
  const password = randomBytes(24).toString('base64url');
  const user = await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Password',
      email: `password-${randomUUID()}@example.test`,
      passwordHash: await hasher.hash(password),
      role,
    },
  });
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const token = cookie.slice(cookie.indexOf('=') + 1);
  return { user, password, cookie, csrf: csrfForSession(token) };
}
function change(
  f: Awaited<ReturnType<typeof fixture>>,
  body: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(base + '/api/auth/change-password', {
    method: 'POST',
    headers: {
      origin,
      cookie: f.cookie,
      'content-type': 'application/json',
      'x-csrf-token': f.csrf,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
it('changes own password and revokes all own sessions atomically for every role', async () => {
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const f = await fixture(role);
    const other = await fixture();
    const secondLogin = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: f.user.email, password: f.password }),
    });
    const secondCookie = secondLogin.headers.get('set-cookie')!.split(';')[0]!;
    const next = randomBytes(24).toString('base64url');
    const response = await change(f, {
      currentPassword: f.password,
      newPassword: next,
      confirmPassword: next,
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: f.user.id },
    });
    expect(await hasher.verify(persisted.passwordHash, next)).toBe(true);
    expect(
      await prisma.session.count({
        where: { userId: f.user.id, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.session.count({
        where: { userId: other.user.id, revokedAt: null },
      }),
    ).toBe(1);
    expect(
      (
        await fetch(base + '/api/auth/session', {
          headers: { cookie: secondCookie },
        })
      ).status,
    ).toBe(401);
    for (const [supplied, status] of [
      [f.password, 401],
      [next, 200],
    ] as const) {
      expect(
        (
          await fetch(base + '/api/auth/login', {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify({ email: f.user.email, password: supplied }),
          })
        ).status,
      ).toBe(status);
    }
  }
});

it('rejects invalid bodies and CSRF without changing hash or sessions', async () => {
  const f = await fixture();
  const next = randomBytes(24).toString('base64url');
  const valid = {
    currentPassword: f.password,
    newPassword: next,
    confirmPassword: next,
  };
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: f.user.id },
  });
  const sessions = await prisma.session.findMany({
    where: { userId: f.user.id },
  });
  for (const body of [
    null,
    {},
    { ...valid, userId: randomUUID() },
    { ...valid, confirmPassword: 'different' },
    { ...valid, newPassword: f.password, confirmPassword: f.password },
    { ...valid, newPassword: '' },
    { ...valid, newPassword: 'x'.repeat(1025) },
    { ...valid, currentPassword: 'wrong' },
  ]) {
    expect((await change(f, body)).status).toBe(400);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } }),
    ).toEqual(before);
    expect(
      await prisma.session.findMany({ where: { userId: f.user.id } }),
    ).toEqual(sessions);
  }
  for (const headers of [
    { 'x-csrf-token': '' },
    { 'x-csrf-token': 'invalid' },
    { origin: 'https://other.example' },
  ])
    expect((await change(f, valid, headers)).status).toBe(403);
  expect((await change(f, valid, { cookie: '' })).status).toBe(401);
  expect(
    await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } }),
  ).toEqual(before);
  expect(
    await prisma.session.findMany({ where: { userId: f.user.id } }),
  ).toEqual(sessions);
});

it('limits five wrong current passwords separately from login and preserves sessions', async () => {
  const f = await fixture();
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: f.user.id },
  });
  const sessions = await prisma.session.findMany({
    where: { userId: f.user.id },
  });
  const body = {
    currentPassword: 'incorrect',
    newPassword: replacementPassword,
    confirmPassword: replacementPassword,
  };
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await change(f, body)).status).toBe(400);
  expect((await change(f, body)).status).toBe(429);
  expect(
    await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } }),
  ).toEqual(before);
  expect(
    await prisma.session.findMany({ where: { userId: f.user.id } }),
  ).toEqual(sessions);
  expect(
    (
      await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: f.user.email, password: f.password }),
      })
    ).status,
  ).toBe(200);
});
it('rolls back the hash if revoking own sessions fails', async () => {
  const f = await fixture();
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: f.user.id },
  });
  const sessions = await prisma.session.findMany({
    where: { userId: f.user.id },
  });
  // El UUID sintético generado por PostgreSQL acota el fallo a este fixture.
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION fail_password_revocation() RETURNS trigger AS $$ BEGIN IF NEW.user_id = '${f.user.id}'::uuid THEN RAISE EXCEPTION 'synthetic revocation failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER fail_password_revocation BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION fail_password_revocation()',
  );
  try {
    const response = await change(f, {
      currentPassword: f.password,
      newPassword: replacementPassword,
      confirmPassword: replacementPassword,
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic revocation failure');
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } }),
    ).toEqual(before);
    expect(
      await prisma.session.findMany({ where: { userId: f.user.id } }),
    ).toEqual(sessions);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fail_password_revocation ON sessions',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS fail_password_revocation()',
    );
  }
});
function gate() {
  let release!: () => void;
  return {
    promise: new Promise<void>((resolve) => {
      release = resolve;
    }),
    resolve: () => release(),
  };
}
it('allows exactly one concurrent password change verified against the same previous hash', async () => {
  const f = await fixture();
  const arrived = gate();
  const release = gate();
  let checks = 0;
  const concurrentHasher = {
    hash: (value: string) => hasher.hash(value),
    verify: async (hash: string, value: string) => {
      const result = await hasher.verify(hash, value);
      if (++checks === 2) arrived.resolve();
      await release.promise;
      return result;
    },
  };
  const services = [
    new AuthService(new PrismaAuthStore(prisma), concurrentHasher),
    new AuthService(new PrismaAuthStore(prisma), concurrentHasher),
  ];
  const token = f.cookie.slice(f.cookie.indexOf('=') + 1);
  const operations = services.map((service, index) =>
    service.changePassword(
      f.user,
      token,
      {
        currentPassword: f.password,
        newPassword: `synthetic-next-${index}`,
        confirmPassword: `synthetic-next-${index}`,
      },
      '127.0.0.1',
    ),
  );
  const settled = Promise.allSettled(operations);
  try {
    await arrived.promise;
  } finally {
    release.resolve();
  }
  const results = await settled;
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === 'rejected');
  expect(rejected?.status === 'rejected' && rejected.reason.getStatus()).toBe(
    400,
  );
  expect(
    await prisma.session.count({
      where: { userId: f.user.id, revokedAt: null },
    }),
  ).toBe(0);
});
it('rejects login verified before a concurrent password change instead of creating a stale session', async () => {
  const f = await fixture();
  const arrived = gate();
  const release = gate();
  class GatedStore extends PrismaAuthStore {
    override async createSession(
      ...input: Parameters<PrismaAuthStore['createSession']>
    ) {
      arrived.resolve();
      await release.promise;
      return super.createSession(...input);
    }
  }
  const loginService = new AuthService(new GatedStore(prisma), hasher);
  const pendingLogin = loginService
    .login(f.user.email, f.password, '127.0.0.1')
    .then(
      () => 200,
      (error: unknown) =>
        error instanceof Error &&
        'getStatus' in error &&
        typeof error.getStatus === 'function'
          ? (error.getStatus() as number)
          : 0,
    );
  try {
    await arrived.promise;
    const changed = await change(f, {
      currentPassword: f.password,
      newPassword: replacementPassword,
      confirmPassword: replacementPassword,
    });
    expect(changed.status).toBe(204);
  } finally {
    release.resolve();
  }
  expect(await pendingLogin).toBe(401);
  expect(
    await prisma.session.count({
      where: { userId: f.user.id, revokedAt: null },
    }),
  ).toBe(0);
});

it('denies an inactive account without changing its hash or revoking additional sessions', async () => {
  const f = await fixture('COLLABORATOR');
  await prisma.user.update({
    where: { id: f.user.id },
    data: { isActive: false },
  });
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: f.user.id },
  });
  const sessions = await prisma.session.findMany({
    where: { userId: f.user.id },
  });
  const response = await change(f, {
    currentPassword: f.password,
    newPassword: replacementPassword,
    confirmPassword: replacementPassword,
  });
  expect(response.status).toBe(401);
  expect(
    await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } }),
  ).toEqual(before);
  expect(
    await prisma.session.findMany({ where: { userId: f.user.id } }),
  ).toEqual(sessions);
});
