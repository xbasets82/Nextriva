import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  PrismaClient,
  type IncidentStatus,
  type IncidentPriority,
  type UserRole,
} from '../../generated/prisma/client.js';
import { createApp } from '../app.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaAuthStore } from '../auth/prisma-auth.store.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';

// Base propia: ningún fixture de este fichero es visible para los conteos o triggers de otras suites.
const parentUrl = getTemporaryMigrationDatabaseUrl();
const databaseName = `nextriva_test_i00_1_${randomBytes(16).toString('hex')}`;
const isolatedUrl = new URL(parentUrl);
isolatedUrl.pathname = `/${databaseName}`;
getTemporaryMigrationDatabaseUrl({
  NEXTRIVA_MIGRATION_DATABASE_URL: isolatedUrl.toString(),
});
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: parentUrl }),
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }),
});
let databaseCreated = false;
const origin = 'https://nextriva.example';
let app: INestApplication;
let baseUrl: string;
const actors = new Map<UserRole, { id: string; cookie: string }>();
let otherId: string;
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
    throw new Error('Isolated personal summary fixture migration failed');
  vi.stubEnv('NEXTRIVA_MIGRATION_DATABASE_URL', isolatedUrl.toString());
  const hasher = new PasswordHasher();
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hasher.hash(password);
  app = await createApp(undefined, {
    service: new AuthService(new PrismaAuthStore(prisma), hasher),
    configuration: { origin, localHttp: false },
  });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  otherId = (
    await prisma.user.create({
      data: {
        firstName: 'Otro',
        lastName: 'Usuario',
        email: `home-other-${randomUUID()}@example.test`,
        role: 'COLLABORATOR',
        passwordHash,
      },
    })
  ).id;
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Resumen',
        lastName: role,
        email: `home-${randomUUID()}@example.test`,
        role,
        passwordHash,
      },
    });
    const login = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    expect(login.status).toBe(200);
    actors.set(role, {
      id: user.id,
      cookie: login.headers.get('set-cookie')!.split(';')[0]!,
    });
  }
});
afterAll(async () => {
  try {
    await app?.close();
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      vi.unstubAllEnvs();
      try {
        if (databaseCreated) {
          await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${databaseName} AND pid <> pg_backend_pid()`;
          await admin.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${databaseName}"`,
          );
          expect(
            (
              await admin.$queryRaw<
                Array<{ count: bigint }>
              >`SELECT count(*) FROM pg_database WHERE datname = ${databaseName}`
            )[0]?.count,
          ).toBe(0n);
        }
      } finally {
        await admin.$disconnect();
      }
    }
  }
});
async function promotion(userId?: string) {
  return prisma.promotion.create({
    data: {
      name: 'Home synthetic promotion',
      phases: { create: [{ phase: 'PLANNING' }] },
      ...(userId ? { participants: { create: [{ userId }] } } : {}),
    },
  });
}
async function incident(
  promotionId: string,
  assignedToId: string | null,
  status: IncidentStatus = 'OPEN',
  priority: IncidentPriority = 'HIGH',
  createdAt = new Date('2026-01-01'),
  id: string = randomUUID(),
) {
  const creator = actors.get('ADMIN')!.id;
  return prisma.incident.create({
    data: {
      id,
      promotionId,
      assignedToId,
      createdById: creator,
      originPhase: 'PLANNING',
      title: 'Incidencia de resumen',
      description: 'Descripción sintética para resumen personal.',
      category: 'STRUCTURE',
      status,
      priority,
      createdAt,
      ...(status === 'PENDING_VALIDATION' || status === 'CLOSED'
        ? {
            solution: 'Solución sintética',
            solutionSubmittedById: creator,
            solutionSubmittedAt: createdAt,
          }
        : {}),
      ...(status === 'CLOSED'
        ? { validatedById: actors.get('MANAGER')!.id, closedAt: createdAt }
        : {}),
    },
  });
}
async function summary(cookie: string, suffix = '') {
  const response = await fetch(
    baseUrl + '/api/incidents/personal-summary' + suffix,
    { headers: { cookie } },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json();
}
it('requires an authenticated session for personal summaries', async () => {
  expect(
    (await fetch(baseUrl + '/api/incidents/personal-summary')).status,
  ).toBe(401);
});
it.each(['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)(
  'aggregates only currently assigned and visible incidents for %s, before ordering and limiting',
  async (role) => {
    const actor = actors.get(role)!;
    const linked = await promotion(actor.id);
    const foreign = await promotion();
    const first = await incident(
      linked.id,
      actor.id,
      'IN_PROGRESS',
      'HIGH',
      new Date('2026-01-01'),
      '10000000-0000-4000-8000-' +
        {
          ADMIN: '000000000001',
          MANAGER: '000000000002',
          COLLABORATOR: '000000000003',
        }[role],
    );
    const second = await incident(
      linked.id,
      actor.id,
      'IN_PROGRESS',
      'HIGH',
      new Date('2026-01-01'),
      '20000000-0000-4000-8000-' +
        {
          ADMIN: '000000000001',
          MANAGER: '000000000002',
          COLLABORATOR: '000000000003',
        }[role],
    );
    const olderOpen = await incident(
      linked.id,
      actor.id,
      'OPEN',
      'HIGH',
      new Date('2025-01-01'),
    );
    const pending = await incident(
      linked.id,
      actor.id,
      'PENDING_VALIDATION',
      'HIGH',
      new Date('2024-01-01'),
    );
    const medium = await incident(linked.id, actor.id, 'IN_PROGRESS', 'MEDIUM');
    const low = await incident(linked.id, actor.id, 'IN_PROGRESS', 'LOW');
    const extra = [];
    for (let i = 0; i < 7; i++)
      extra.push(
        await incident(
          linked.id,
          actor.id,
          'OPEN',
          'LOW',
          new Date(Date.UTC(2026, 1, i + 1)),
        ),
      );
    await incident(linked.id, actor.id, 'CLOSED');
    await incident(linked.id, null);
    const createdOnly = await incident(linked.id, otherId);
    await prisma.incident.update({
      where: { id: createdOnly.id },
      data: { createdById: actor.id },
    });
    const foreignIncident = await incident(
      foreign.id,
      actor.id,
      'OPEN',
      'LOW',
      new Date('2027-01-01'),
    );
    const result = await summary(
      actor.cookie,
      '?userId=' + actors.get('ADMIN')!.id,
    );
    expect(result.countsByStatus).toEqual({
      OPEN: role === 'ADMIN' ? 9 : 8,
      IN_PROGRESS: 4,
      PENDING_VALIDATION: 1,
      CLOSED: 1,
    });
    expect(result.visibleCountsByStatus).toEqual({
      OPEN: { ADMIN: 11, MANAGER: 10, COLLABORATOR: 9 }[role],
      IN_PROGRESS: 4,
      PENDING_VALIDATION: 1,
      CLOSED: 1,
    });
    expect(result.priorityLimit).toBe(10);
    expect(result.priorityItems.map((item: { id: string }) => item.id)).toEqual(
      [
        first.id,
        second.id,
        olderOpen.id,
        pending.id,
        medium.id,
        low.id,
        ...extra.slice(0, 4).map((item) => item.id),
      ],
    );
    expect(result.priorityItems).not.toContainEqual(
      expect.objectContaining({ id: foreignIncident.id }),
    );
    expect(result.priorityItems[0]).toMatchObject({
      promotionId: linked.id,
      promotionName: linked.name,
      title: first.title,
      status: first.status,
      publicCode: first.publicCode,
      createdAt: first.createdAt.toISOString(),
    });
  },
);
it('returns four explicit zero counts for an account without assigned incidents', async () => {
  const actor = actors.get('COLLABORATOR')!;
  const former = await prisma.incident.findMany({
    where: { assignedToId: actor.id },
    select: { id: true },
  });
  await prisma.incident.updateMany({
    where: { id: { in: former.map((item) => item.id) } },
    data: { assignedToId: null },
  });
  expect(await summary(actor.cookie)).toEqual({
    countsByStatus: {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING_VALIDATION: 0,
      CLOSED: 0,
    },
    visibleCountsByStatus: {
      OPEN: 1,
      IN_PROGRESS: 0,
      PENDING_VALIDATION: 0,
      CLOSED: 0,
    },
    priorityItems: [],
    priorityLimit: 10,
  });
});
it('immediately removes reassigned and unlinked records while preserving history and other users data', async () => {
  const actor = actors.get('COLLABORATOR')!;
  const linked = await promotion(actor.id);
  const current = await incident(linked.id, actor.id);
  await prisma.incidentActivity.create({
    data: {
      incidentId: current.id,
      actorId: actors.get('ADMIN')!.id,
      eventType: 'CREATED',
      changes: { originPhase: 'PLANNING' },
    },
  });
  expect((await summary(actor.cookie)).countsByStatus.OPEN).toBe(1);
  expect((await summary(actor.cookie)).visibleCountsByStatus.OPEN).toBe(2);
  await prisma.incident.update({
    where: { id: current.id },
    data: { assignedToId: actors.get('ADMIN')!.id },
  });
  expect((await summary(actor.cookie)).countsByStatus.OPEN).toBe(0);
  expect((await summary(actor.cookie)).visibleCountsByStatus.OPEN).toBe(1);
  await prisma.incident.update({
    where: { id: current.id },
    data: { assignedToId: actor.id },
  });
  await prisma.promotionParticipant.delete({
    where: { promotionId_userId: { promotionId: linked.id, userId: actor.id } },
  });
  expect((await summary(actor.cookie)).countsByStatus.OPEN).toBe(0);
  expect((await summary(actor.cookie)).visibleCountsByStatus.OPEN).toBe(1);
  expect(
    (
      await fetch(baseUrl + '/api/incidents/' + current.id, {
        headers: { cookie: actor.cookie },
      })
    ).status,
  ).toBe(404);
  expect(await prisma.incident.count({ where: { id: current.id } })).toBe(1);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: current.id } }),
  ).toBe(1);
});

it.each(['MANAGER', 'COLLABORATOR'] as const)(
  'revokes both personal and visible aggregates for %s after membership removal, preserving closed history',
  async (role) => {
    const actor = actors.get(role)!;
    const linked = await promotion(actor.id);
    const closed = await incident(linked.id, actor.id, 'CLOSED');
    const before = await summary(actor.cookie);
    await prisma.promotionParticipant.delete({
      where: {
        promotionId_userId: { promotionId: linked.id, userId: actor.id },
      },
    });
    const after = await summary(actor.cookie);
    expect(after.countsByStatus).toEqual({
      ...before.countsByStatus,
      CLOSED: before.countsByStatus.CLOSED - 1,
    });
    expect(after.visibleCountsByStatus).toEqual({
      ...before.visibleCountsByStatus,
      CLOSED: before.visibleCountsByStatus.CLOSED - 1,
    });
    expect(after.priorityItems).toEqual(before.priorityItems);
    expect(
      await prisma.incident.findUnique({ where: { id: closed.id } }),
    ).toEqual(closed);
  },
);
