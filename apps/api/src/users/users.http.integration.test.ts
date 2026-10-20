import { createRequire } from 'node:module';
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';
import { createApp } from '../app.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaAuthStore } from '../auth/prisma-auth.store.js';
import { UsersManagementStore } from './users-management.store.js';
import { PasswordHasher } from './password-hasher.js';

const parentUrl = getTemporaryMigrationDatabaseUrl();
const databaseName = `nextriva_test_i02_1_${randomBytes(16).toString('hex')}`;
const isolatedUrl = new URL(parentUrl);
isolatedUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: parentUrl }),
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }),
});
const hasher = new PasswordHasher();
const password = randomBytes(24).toString('base64url');
const origin = 'https://nextriva.example';
let app: INestApplication;
let url: string;
let adminId: string;
let targetId: string;
let logOutput = '';
const credentials = new Map<string, { cookie: string; csrf: string }>();

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
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
        NEXTRIVA_MIGRATION_DATABASE_URL: isolatedUrl.toString(),
      }),
      encoding: 'utf8',
    },
  );
  if (migration.status !== 0)
    throw new Error('Isolated fixture migration failed');
  const hash = await hasher.hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'User',
        email: `i021-${role.toLowerCase()}@example.test`,
        role,
        passwordHash: hash,
      },
    });
    if (role === 'ADMIN') adminId = user.id;
  }
  targetId = (
    await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Target',
        email: 'i021-target@example.test',
        role: 'COLLABORATOR',
        passwordHash: hash,
      },
    })
  ).id;
  app = await createApp(
    {
      write: (message) => {
        logOutput += message;
      },
    },
    {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    },
    new UsersManagementStore(prisma),
  );
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR']) {
    const response = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `i021-${role.toLowerCase()}@example.test`,
        password,
      }),
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    const csrf = await (
      await fetch(url + '/api/auth/csrf', { headers: { cookie } })
    ).json();
    credentials.set(role, { cookie, csrf: csrf.csrfToken as string });
  }
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.$disconnect();
});
function request(role: string, path = '', method = 'GET', body?: unknown) {
  const auth = credentials.get(role);
  return fetch(url + '/api/users' + path, {
    method,
    headers: {
      origin,
      cookie: auth?.cookie ?? '',
      'x-csrf-token': auth?.csrf ?? '',
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const input = () => ({
  firstName: 'Nueva',
  lastName: 'Cuenta',
  email: `new-${randomBytes(6).toString('hex')}@example.test`,
  role: 'MANAGER',
  password,
});

describe('I02.1 administrative HTTP and isolated PostgreSQL', () => {
  it('allows ADMIN to list, inspect, create, edit and activate without leaking secrets', async () => {
    const created = await request('ADMIN', '', 'POST', input());
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(
      await hasher.verify(
        (
          await prisma.user.findUniqueOrThrow({
            where: { id: body.user.id as string },
          })
        ).passwordHash,
        password,
      ),
    ).toBe(true);
    expect((await request('ADMIN')).status).toBe(200);
    expect((await request('ADMIN', `/${targetId}`)).status).toBe(200);
    expect(
      (
        await request('ADMIN', `/${targetId}`, 'PATCH', {
          firstName: 'Editado',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('ADMIN', `/${targetId}/status`, 'PATCH', {
          isActive: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: targetId } }))
        .isActive,
    ).toBe(false);
    expect(
      (
        await request('ADMIN', `/${targetId}/status`, 'PATCH', {
          isActive: true,
        })
      ).status,
    ).toBe(200);
    expect(logOutput).not.toContain(password);
    expect(logOutput).not.toContain('$argon2');
  });
  for (const role of ['MANAGER', 'COLLABORATOR']) {
    it(`denies every direct API operation for ${role}, with no user/session mutation`, async () => {
      const before = {
        users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
        sessions: await prisma.session.findMany({ orderBy: { id: 'asc' } }),
      };
      for (const [path, method, body] of [
        ['', 'GET', undefined],
        [`/${targetId}`, 'GET', undefined],
        ['', 'POST', input()],
        [`/${targetId}`, 'PATCH', { role: 'ADMIN' }],
        [`/${targetId}/status`, 'PATCH', { isActive: false }],
        [`/${adminId}`, 'PATCH', { firstName: 'Intruso' }],
      ] as const) {
        expect((await request(role, path, method, body)).status).toBe(403);
      }
      expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(
        before.users,
      );
      expect(await prisma.session.findMany({ orderBy: { id: 'asc' } })).toEqual(
        before.sessions,
      );
    });
  }
  it('rejects anonymous, extra/invalid fields, malformed identifiers, CSRF and physical deletion without mutation', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: targetId },
    });
    expect((await request('missing')).status).toBe(401);
    for (const body of [
      { id: adminId },
      { passwordHash: 'forbidden' },
      { password: 'forbidden' },
      { createdAt: new Date().toISOString() },
      { isActive: false },
      { role: 'OWNER' },
      { firstName: 'A' },
      { lastName: 'A' },
      { email: 'invalid' },
      {},
    ]) {
      expect(
        (await request('ADMIN', `/${targetId}`, 'PATCH', body)).status,
      ).toBe(400);
    }
    expect((await request('ADMIN', '/invalid')).status).toBe(400);
    expect(
      (await request('ADMIN', '/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
    expect((await request('ADMIN', `/${targetId}`, 'DELETE')).status).toBe(404);
    const cookie = credentials.get('ADMIN')?.cookie ?? '';
    const rejected = await fetch(url + `/api/users/${targetId}/status`, {
      method: 'PATCH',
      headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('set-cookie')).toBeNull();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: targetId } }),
    ).toEqual(before);
  });
  it.each([
    { id: 'forbidden' },
    { passwordHash: 'forbidden' },
    { password: 'forbidden' },
    { createdAt: '2026-10-20' },
    { isActive: false },
    { role: 'OWNER' },
    { firstName: 'A' },
    { lastName: 'A' },
    { email: 'invalid' },
    {},
  ])('rejects edit input %j without user mutation', async (body) => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: targetId },
    });
    expect((await request('ADMIN', `/${targetId}`, 'PATCH', body)).status).toBe(
      400,
    );
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: targetId } }),
    ).toEqual(before);
  });
  it('normalizes email and rejects concurrent duplicate creation with a safe conflict', async () => {
    const data = input();
    data.email = '  CONCURRENT-I021@Example.Test  ';
    const results = await Promise.all([
      request('ADMIN', '', 'POST', data),
      request('ADMIN', '', 'POST', {
        ...data,
        email: 'concurrent-i021@example.test',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.user.count({
        where: { email: 'concurrent-i021@example.test' },
      }),
    ).toBe(1);
    for (const response of results) {
      const text = await response.text();
      expect(text).not.toContain(password);
      expect(text).not.toContain('$argon2');
    }
  });
  it('rejects degrading/deactivating the sole ADMIN without session or user mutation', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    const sessions = await prisma.session.findMany({
      where: { userId: adminId },
    });
    expect(
      (await request('ADMIN', `/${adminId}`, 'PATCH', { role: 'MANAGER' }))
        .status,
    ).toBe(409);
    expect(
      (
        await request('ADMIN', `/${adminId}/status`, 'PATCH', {
          isActive: false,
        })
      ).status,
    ).toBe(409);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: adminId } }),
    ).toEqual(before);
    expect(
      await prisma.session.findMany({ where: { userId: adminId } }),
    ).toEqual(sessions);
  });
  it('revokes sessions on role/status changes and rolls the whole change back if revocation fails', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Transaccion',
        lastName: 'Usuario',
        email: 'rollback-i021@example.test',
        role: 'COLLABORATOR',
        passwordHash: await hasher.hash(password),
      },
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_test_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic revocation failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_test_revocation BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION reject_test_revocation()`,
    );
    try {
      const response = await request('ADMIN', `/${user.id}`, 'PATCH', {
        role: 'MANAGER',
      });
      expect(response.status).toBe(503);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ).toEqual(user);
      expect(
        await prisma.session.findUniqueOrThrow({ where: { id: session.id } }),
      ).toEqual(session);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER fail_test_revocation ON sessions',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_test_revocation()');
    }
    expect(
      (await request('ADMIN', `/${user.id}`, 'PATCH', { role: 'MANAGER' }))
        .status,
    ).toBe(200);
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
        .revokedAt,
    ).not.toBeNull();
    const second = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(
      (
        await request('ADMIN', `/${user.id}/status`, 'PATCH', {
          isActive: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: second.id } }))
        .revokedAt,
    ).not.toBeNull();
  });
  it.each(['deactivate', 'degrade'])(
    'preserves one active ADMIN under concurrent self-%s requests',
    async (operation) => {
      const actors = await Promise.all(
        ['a', 'b'].map(async (suffix) =>
          prisma.user.create({
            data: {
              firstName: 'Concurrente',
              lastName: 'Administrador',
              email: `last-admin-${operation}-${suffix}@example.test`,
              role: 'ADMIN',
              passwordHash: await hasher.hash(password),
            },
          }),
        ),
      );
      for (const user of actors) {
        const response = await fetch(url + '/api/auth/login', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ email: user.email, password }),
        });
        const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
        const csrf = await (
          await fetch(url + '/api/auth/csrf', { headers: { cookie } })
        ).json();
        credentials.set(user.id, { cookie, csrf: csrf.csrfToken as string });
      }
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'COLLABORATOR' },
      });
      const before = await prisma.session.findMany({
        where: { userId: { in: actors.map((actor) => actor.id) } },
      });
      try {
        const responses = await Promise.all(
          actors.map((actor) =>
            request(
              actor.id,
              `/${actor.id}${operation === 'deactivate' ? '/status' : ''}`,
              'PATCH',
              operation === 'deactivate'
                ? { isActive: false }
                : { role: 'MANAGER' },
            ),
          ),
        );
        expect(responses.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        expect(
          await prisma.user.count({ where: { role: 'ADMIN', isActive: true } }),
        ).toBe(1);
        const rejected =
          actors[responses.findIndex((response) => response.status === 409)];
        if (!rejected) throw new Error('Expected rejected administrator');
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: rejected.id } }),
        ).toEqual(rejected);
        expect(
          await prisma.session.findMany({ where: { userId: rejected.id } }),
        ).toEqual(before.filter((session) => session.userId === rejected.id));
      } finally {
        await prisma.user.update({
          where: { id: adminId },
          data: { role: 'ADMIN' },
        });
        await prisma.user.updateMany({
          where: { id: { in: actors.map((actor) => actor.id) } },
          data: { role: 'COLLABORATOR' },
        });
      }
    },
  );
  it('documents the exact administrative routes and safe output in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addCookieAuth(
          '__Host-nextriva_session',
          { type: 'apiKey', in: 'cookie' },
          'session',
        )
        .build(),
    );
    expect(document.paths['/api/users']?.get?.responses['200']).toBeDefined();
    expect(document.paths['/api/users']?.post?.responses['201']).toBeDefined();
    expect(
      document.paths['/api/users/{id}']?.patch?.responses['409'],
    ).toBeDefined();
    expect(
      document.paths['/api/users/{id}/status']?.patch?.responses['200'],
    ).toBeDefined();
    expect(JSON.stringify(document.paths)).not.toContain('passwordHash');
  });
});
