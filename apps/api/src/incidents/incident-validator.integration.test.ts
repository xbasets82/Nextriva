import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createApp } from '../app.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaAuthStore } from '../auth/prisma-auth.store.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';
import { PromotionsStore } from '../promotions/promotions.store.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { UsersManagementStore } from '../users/users-management.store.js';

// Cada fichero dispone de una base propia: otros ADMIN de la suite no alteran
// quién es el último validador de sus promociones sintéticas.
const parentUrl = getTemporaryMigrationDatabaseUrl();
const databaseName = `nextriva_test_i07_2_${randomBytes(16).toString('hex')}`;
const isolatedUrl = new URL(parentUrl);
isolatedUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: parentUrl }),
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }),
});
const password = randomBytes(24).toString('base64url');
const origin = 'https://nextriva.example';
let app: INestApplication;
let baseUrl: string;
let presenterId: string;
let passwordHash: string;
let cookie: string;
let csrfToken: string;
let databaseCreated = false;

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
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
    throw new Error('Isolated validator fixture migration failed');
  vi.stubEnv('NEXTRIVA_MIGRATION_DATABASE_URL', isolatedUrl.toString());
  const hasher = new PasswordHasher();
  passwordHash = await hasher.hash(password);
  const presenter = await user('ADMIN');
  presenterId = presenter.id;
  app = await createApp(
    undefined,
    {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    },
    new UsersManagementStore(prisma),
    new PromotionsStore(prisma),
  );
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: presenter.email, password }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  csrfToken = (
    await (
      await fetch(baseUrl + '/api/auth/csrf', { headers: { cookie } })
    ).json()
  ).csrfToken as string;
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  if (databaseCreated) {
    await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${databaseName} AND pid <> pg_backend_pid()`;
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await admin.$disconnect();
});

function request(path: string, method = 'POST', body?: unknown) {
  return fetch(baseUrl + path, {
    method,
    headers: {
      origin,
      cookie,
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function user(role: 'ADMIN' | 'MANAGER') {
  return prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Validator',
      email: `validator-${randomBytes(8).toString('hex')}@example.test`,
      passwordHash,
      role,
    },
  });
}

async function fixture() {
  const validator = await user('MANAGER');
  expect(
    (
      await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: validator.email, password }),
      })
    ).status,
  ).toBe(200);
  const promotion = await prisma.promotion.create({
    data: {
      name: `Validator fixture ${randomBytes(8).toString('hex')}`,
      phases: { create: { phase: 'PLANNING' } },
      participants: { create: { userId: validator.id } },
    },
  });
  const incident = await prisma.incident.create({
    data: {
      promotionId: promotion.id,
      createdById: presenterId,
      assignedToId: presenterId,
      originPhase: 'PLANNING',
      title: 'Independent validation',
      description: 'Synthetic solution awaiting independent validation',
      category: 'STRUCTURE',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      solution: 'Synthetic completed repair',
    },
  });
  return { validator, promotion, incident };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Withdrawal = 'deactivate' | 'demote' | 'remove';
function withdraw(operation: Withdrawal, item: Fixture) {
  if (operation === 'remove')
    return request(
      `/api/promotions/${item.promotion.id}/participants/${item.validator.id}`,
      'DELETE',
    );
  return request(
    `/api/users/${item.validator.id}${operation === 'deactivate' ? '/status' : ''}`,
    'PATCH',
    operation === 'deactivate' ? { isActive: false } : { role: 'COLLABORATOR' },
  );
}

async function snapshot(item: Fixture) {
  return {
    incident: await prisma.incident.findUniqueOrThrow({
      where: { id: item.incident.id },
    }),
    validator: await prisma.user.findUniqueOrThrow({
      where: { id: item.validator.id },
    }),
    participants: await prisma.promotionParticipant.findMany({
      where: { promotionId: item.promotion.id },
      orderBy: { userId: 'asc' },
    }),
    activities: await prisma.incidentActivity.findMany({
      where: { incidentId: item.incident.id },
      orderBy: { id: 'asc' },
    }),
    sessions: await prisma.session.findMany({
      where: { userId: item.validator.id },
      orderBy: { id: 'asc' },
    }),
  };
}

it.each(['deactivate', 'demote', 'remove'] as const)(
  'rejects %s of the sole independent validator without any persisted mutation',
  async (operation) => {
    const item = await fixture();
    expect(
      (
        await request(
          `/api/incidents/${item.incident.id}/submit-solution`,
          'POST',
          { version: 1 },
        )
      ).status,
    ).toBe(200);
    const before = await snapshot(item);
    expect((await withdraw(operation, item)).status).toBe(409);
    expect(await snapshot(item)).toEqual(before);
  },
);

interface Connection {
  connect(): Promise<void>;
  query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

async function waitForBlockedBackend(
  observer: Connection,
  blockerPid: number,
  finished: () => boolean,
  excludedPid = 0,
) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const { rows } = await observer.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND pid <> $2",
      [blockerPid, excludedPid],
    );
    if (rows[0]) return rows[0].pid;
    if (finished())
      throw new Error('La operación terminó antes de la barrera PostgreSQL');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('No se observó el bloqueo PostgreSQL esperado');
}

for (const first of ['submission', 'withdrawal'] as const) {
  it.each(['deactivate', 'demote', 'remove'] as const)(
    `serializes ${first} first against concurrent %s without losing the independent validator`,
    async (operation) => {
      const item = await fixture();
      const { Client } = createRequire(import.meta.url)('pg') as {
        Client: new (options: { connectionString: string }) => Connection;
      };
      const blocker = new Client({ connectionString: isolatedUrl.toString() });
      const observer = new Client({ connectionString: isolatedUrl.toString() });
      await blocker.connect();
      await observer.connect();
      let firstRequest: Promise<Response> | undefined;
      let secondRequest: Promise<Response> | undefined;
      let firstFinished = false;
      let secondFinished = false;
      const submit = () =>
        request(`/api/incidents/${item.incident.id}/submit-solution`, 'POST', {
          version: 1,
        });
      const before = await snapshot(item);
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT pg_advisory_xact_lock(210021)');
        const { rows } = await blocker.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        firstRequest = (
          first === 'submission' ? submit() : withdraw(operation, item)
        ).finally(() => {
          firstFinished = true;
        });
        const firstPid = await waitForBlockedBackend(
          observer,
          rows[0]!.pid,
          () => firstFinished,
        );
        secondRequest = (
          first === 'submission' ? withdraw(operation, item) : submit()
        ).finally(() => {
          secondFinished = true;
        });
        await waitForBlockedBackend(
          observer,
          rows[0]!.pid,
          () => secondFinished,
          firstPid,
        );
        expect(firstFinished).toBe(false);
        expect(secondFinished).toBe(false);
        await blocker.query('COMMIT');
        expect((await firstRequest).status).toBe(
          first === 'withdrawal' && operation === 'remove' ? 204 : 200,
        );
        expect((await secondRequest).status).toBe(409);
        const after = await snapshot(item);
        if (first === 'submission') {
          expect(after.incident).toMatchObject({
            status: 'PENDING_VALIDATION',
            version: 2,
            solutionSubmittedById: presenterId,
          });
          expect(after.validator).toEqual(before.validator);
          expect(after.participants).toEqual(before.participants);
          expect(after.sessions).toEqual(before.sessions);
          expect(after.activities).toHaveLength(1);
          expect(after.activities[0]?.eventType).toBe('SOLUTION_SUBMITTED');
        } else {
          expect(after.incident).toEqual(before.incident);
          expect(after.activities).toEqual(before.activities);
          if (operation === 'remove')
            expect(after.participants).toHaveLength(0);
          else
            expect(after.validator).toMatchObject(
              operation === 'deactivate'
                ? { isActive: false }
                : { role: 'COLLABORATOR' },
            );
        }
      } finally {
        await blocker.query('ROLLBACK');
        await Promise.allSettled([firstRequest, secondRequest]);
        await blocker.end();
        await observer.end();
      }
    },
  );
}

it('preserves the global ADMIN validator and permits removal of its optional participation', async () => {
  const item = await fixture();
  await prisma.user.update({
    where: { id: item.validator.id },
    data: { role: 'ADMIN' },
  });
  expect(
    (
      await request(
        `/api/incidents/${item.incident.id}/submit-solution`,
        'POST',
        { version: 1 },
      )
    ).status,
  ).toBe(200);
  const before = await snapshot(item);
  expect((await withdraw('deactivate', item)).status).toBe(409);
  expect((await withdraw('demote', item)).status).toBe(409);
  expect(await snapshot(item)).toEqual(before);
  expect((await withdraw('remove', item)).status).toBe(204);
  expect(
    (
      await request(`/api/users/${item.validator.id}`, 'PATCH', {
        role: 'MANAGER',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(
        `/api/promotions/${item.promotion.id}/participants`,
        'POST',
        { userId: item.validator.id },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await request(`/api/users/${item.validator.id}`, 'PATCH', {
        role: 'MANAGER',
      })
    ).status,
  ).toBe(200);
  const after = await snapshot(item);
  expect(after.incident).toEqual(before.incident);
  expect(after.activities).toEqual(before.activities);
  expect(after.validator).toMatchObject({ role: 'MANAGER', isActive: true });
});

it.each(['deactivate', 'demote', 'remove'] as const)(
  'allows %s when another independent active linked validator remains',
  async (operation) => {
    const item = await fixture();
    const alternative = await user('MANAGER');
    await prisma.promotionParticipant.create({
      data: { promotionId: item.promotion.id, userId: alternative.id },
    });
    expect(
      (
        await request(
          `/api/incidents/${item.incident.id}/submit-solution`,
          'POST',
          { version: 1 },
        )
      ).status,
    ).toBe(200);
    const before = await snapshot(item);
    expect((await withdraw(operation, item)).status).toBe(
      operation === 'remove' ? 204 : 200,
    );
    const after = await snapshot(item);
    expect(after.incident).toEqual(before.incident);
    expect(after.activities).toEqual(before.activities);
  },
);

it('serializes concurrent withdrawal of two validators and keeps one eligible', async () => {
  const item = await fixture();
  const alternative = await user('MANAGER');
  await prisma.promotionParticipant.create({
    data: { promotionId: item.promotion.id, userId: alternative.id },
  });
  expect(
    (
      await request(
        `/api/incidents/${item.incident.id}/submit-solution`,
        'POST',
        { version: 1 },
      )
    ).status,
  ).toBe(200);
  const before = await snapshot(item);
  const results = await Promise.all([
    withdraw('remove', item),
    withdraw('deactivate', { ...item, validator: alternative }),
  ]);
  const statuses = results.map((result) => result.status);
  expect(statuses.filter((status) => status === 409)).toHaveLength(1);
  expect(
    statuses.filter((status) => status === 200 || status === 204),
  ).toHaveLength(1);
  expect(
    await prisma.user.count({
      where: {
        id: { not: presenterId },
        isActive: true,
        OR: [
          { role: 'ADMIN' },
          {
            role: 'MANAGER',
            promotionParticipants: { some: { promotionId: item.promotion.id } },
          },
        ],
      },
    }),
  ).toBe(1);
  const after = await snapshot(item);
  expect(after.incident).toEqual(before.incident);
  expect(after.activities).toEqual(before.activities);
});

it('persists exactly 5000 Unicode code points and rejects 5001 without changing the draft', async () => {
  const item = await fixture();
  const solution = '😀'.repeat(5000);
  expect(
    (
      await request(`/api/incidents/${item.incident.id}/solution`, 'PUT', {
        version: 1,
        solution,
      })
    ).status,
  ).toBe(200);
  const before = await snapshot(item);
  expect(before.incident.solution).toBe(solution);
  expect(
    (
      await request(`/api/incidents/${item.incident.id}/solution`, 'PUT', {
        version: 2,
        solution: solution + '😀',
      })
    ).status,
  ).toBe(400);
  expect(await snapshot(item)).toEqual(before);
});

it('does not count inactive linked or active unlinked MANAGER alternatives', async () => {
  const item = await fixture();
  const inactive = await user('MANAGER');
  await prisma.user.update({
    where: { id: inactive.id },
    data: { isActive: false },
  });
  await prisma.promotionParticipant.create({
    data: { promotionId: item.promotion.id, userId: inactive.id },
  });
  await user('MANAGER');
  expect(
    (
      await request(
        `/api/incidents/${item.incident.id}/submit-solution`,
        'POST',
        { version: 1 },
      )
    ).status,
  ).toBe(200);
  const before = await snapshot(item);
  expect((await withdraw('remove', item)).status).toBe(409);
  expect(await snapshot(item)).toEqual(before);
});
