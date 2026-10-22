import 'reflect-metadata';
import { createRequire } from 'node:module';
import { IncidentsStore } from './incidents.store.js';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createOpenApiDocument } from '../openapi.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createApp } from '../app.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaAuthStore } from '../auth/prisma-auth.store.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const origin = 'https://nextriva.example';
let app: INestApplication;
let baseUrl: string;
let cookie: string;
let csrfToken: string;
let promotionId: string;
const actors = new Map<
  string,
  { id: string; cookie: string; csrfToken: string }
>();

beforeAll(async () => {
  const hasher = new PasswordHasher();
  const password = randomBytes(24).toString('base64url');
  const email = `i051-${randomBytes(8).toString('hex')}@example.test`;
  await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'ADMIN',
      email,
      role: 'ADMIN',
      passwordHash: await hasher.hash(password),
    },
  });
  const promotion = await prisma.promotion.create({
    data: {
      name: 'I05.1 synthetic promotion',
      phases: { create: [{ phase: 'PLANNING' }] },
    },
  });
  promotionId = promotion.id;
  app = await createApp(undefined, {
    service: new AuthService(new PrismaAuthStore(prisma), hasher),
    configuration: { origin, localHttp: false },
  });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  csrfToken = (
    await (
      await fetch(baseUrl + '/api/auth/csrf', { headers: { cookie } })
    ).json()
  ).csrfToken as string;
  for (const role of ['MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        email: `i051-${role.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`,
        role,
        passwordHash: await hasher.hash(password),
      },
    });
    const logged = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    expect(logged.status).toBe(200);
    const actorCookie = logged.headers.get('set-cookie')?.split(';')[0] ?? '';
    const token = (
      await (
        await fetch(baseUrl + '/api/auth/csrf', {
          headers: { cookie: actorCookie },
        })
      ).json()
    ).csrfToken as string;
    actors.set(role, { id: user.id, cookie: actorCookie, csrfToken: token });
  }
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

it('creates an OPEN incident with its global origin phase and server-owned identity', async () => {
  const response = await fetch(baseUrl + '/api/incidents', {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      promotionId,
      originPhase: 'PLANNING',
      title: 'Fisura en pared',
      description: 'Fisura visible en la pared del acceso.',
      category: 'STRUCTURE',
      priority: 'MEDIUM',
    }),
  });
  expect(response.status).toBe(201);
  expect((await response.json()).incident).toMatchObject({
    promotionId,
    originPhase: 'PLANNING',
    status: 'OPEN',
    publicCode: expect.stringMatching(/^INC-\d{6,}$/),
  });
});

it('persists exactly one CREATED activity with server actor/time and immutable origin snapshot', async () => {
  const response = await fetch(baseUrl + '/api/incidents', {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      promotionId,
      originPhase: 'AFTER_SALES',
      title: 'Fisura histórica',
      description: 'Origen válido aunque no sea fase activa.',
      category: 'STRUCTURE',
      priority: 'LOW',
    }),
  });
  expect(response.status).toBe(201);
  const { incident } = await response.json();
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  expect(activities).toHaveLength(1);
  expect(activities[0]).toMatchObject({
    eventType: 'CREATED',
    actorId: incident.createdById,
    changes: { originPhase: 'AFTER_SALES' },
    createdAt: expect.any(Date),
  });
  await prisma.promotionPhaseRecord.create({
    data: { promotionId, phase: 'HANDOVER' },
  });
  expect(
    await prisma.incident.findUnique({ where: { id: incident.id } }),
  ).toMatchObject({ originPhase: 'AFTER_SALES' });
  expect(
    (
      await prisma.incidentActivity.findMany({
        where: { incidentId: incident.id },
      })
    )[0]?.changes,
  ).toEqual({ originPhase: 'AFTER_SALES' });
});

const validInput = () =>
  ({
    promotionId,
    originPhase: 'PLANNING',
    title: 'Fisura en pared',
    description: 'Fisura visible en la pared del acceso.',
    category: 'STRUCTURE',
    priority: 'MEDIUM',
  }) as const;

it.each([
  { originPhase: 'UNKNOWN' },
  { originPhase: undefined },
  { title: 'abcd' },
  { title: 'a'.repeat(151) },
  { description: 'a'.repeat(9) },
  { description: 'a'.repeat(5001) },
  { category: 'UNKNOWN' },
  { priority: 'URGENT' },
  { status: 'CLOSED' },
  { createdById: '00000000-0000-4000-8000-000000000000' },
  { id: '00000000-0000-4000-8000-000000000000' },
  { publicCode: 'INC-000001' },
  { createdAt: '2026-01-01' },
  { version: 5 },
  { promotionId: 'invalid' },
])(
  'rejects invalid or server-owned input %j with zero persistence',
  async (changes) => {
    const before = [
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ];
    const response = await fetch(baseUrl + '/api/incidents', {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validInput(), ...changes }),
    });
    expect(response.status).toBe(400);
    expect([
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ]).toEqual(before);
  },
);

function postAs(auth: { cookie: string; csrfToken: string }, input: unknown) {
  return fetch(baseUrl + '/api/incidents', {
    method: 'POST',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

it.each(['MANAGER', 'COLLABORATOR'])(
  'requires current promotion membership for %s and revokes creation scope immediately',
  async (role) => {
    const actor = actors.get(role)!;
    let before = [
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ];
    expect((await postAs(actor, validInput())).status).toBe(404);
    expect([
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ]).toEqual(before);
    await prisma.promotionParticipant.create({
      data: { promotionId, userId: actor.id },
    });
    expect((await postAs(actor, validInput())).status).toBe(201);
    await prisma.promotionParticipant.delete({
      where: { promotionId_userId: { promotionId, userId: actor.id } },
    });
    before = [
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ];
    expect((await postAs(actor, validInput())).status).toBe(404);
    expect([
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ]).toEqual(before);
  },
);

it('rejects archived and missing promotions without inserts', async () => {
  const archived = await prisma.promotion.create({
    data: { name: 'I05.1 archived', status: 'ARCHIVED' },
  });
  for (const [id, status] of [
    [archived.id, 409],
    ['00000000-0000-4000-8000-000000000098', 404],
  ] as const) {
    const before = [
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ];
    expect(
      (
        await postAs(
          { cookie, csrfToken },
          { ...validInput(), promotionId: id },
        )
      ).status,
    ).toBe(status);
    expect([
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ]).toEqual(before);
  }
});

it('rolls back incident and activity when PostgreSQL rejects CREATED, without leaking details', async () => {
  const before = [
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ];
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_i051_created() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private database detail'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_i051_created BEFORE INSERT ON incident_activities FOR EACH ROW EXECUTE FUNCTION reject_i051_created()`,
  );
  try {
    const response = await postAs({ cookie, csrfToken }, validInput());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(
      'synthetic private database detail',
    );
    expect([
      await prisma.incident.count(),
      await prisma.incidentActivity.count(),
    ]).toEqual(before);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_i051_created ON incident_activities',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION reject_i051_created()');
  }
});

it('rejects missing session and CSRF without incident or activity mutations', async () => {
  const before = [
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ];
  expect(
    (await postAs({ cookie: '', csrfToken: '' }, validInput())).status,
  ).toBe(401);
  expect((await postAs({ cookie, csrfToken: '' }, validInput())).status).toBe(
    403,
  );
  expect([
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ]).toEqual(before);
});

it('allocates distinct global public codes for concurrent creations', async () => {
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      postAs({ cookie, csrfToken }, validInput()),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual([
    201, 201, 201, 201,
  ]);
  const incidents = await Promise.all(
    responses.map(async (response) => (await response.json()).incident),
  );
  expect(new Set(incidents.map((incident) => incident.publicCode)).size).toBe(
    4,
  );
  for (const incident of incidents)
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId: incident.id },
      }),
    ).toBe(1);
});

it('enforces real FK and public code uniqueness constraints without orphan activities', async () => {
  const response = await postAs({ cookie, csrfToken }, validInput());
  const { incident } = await response.json();
  const before = [
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ];
  const input = { ...validInput(), createdById: incident.createdById };
  await expect(
    prisma.incident.create({
      data: { ...input, publicCode: incident.publicCode },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
  await expect(
    prisma.incident.create({
      data: { ...input, promotionId: '00000000-0000-4000-8000-000000000099' },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    prisma.incidentActivity.create({
      data: {
        incidentId: '00000000-0000-4000-8000-000000000099',
        actorId: incident.createdById,
        eventType: 'CREATED',
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  expect([
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ]).toEqual(before);
});

it('opens the created incident detail including its initial CREATED activity', async () => {
  const response = await postAs({ cookie, csrfToken }, validInput());
  const { incident } = await response.json();
  const detail = await fetch(baseUrl + `/api/incidents/${incident.id}`, {
    headers: { cookie },
  });
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({
    incident: {
      id: incident.id,
      publicCode: incident.publicCode,
      originPhase: 'PLANNING',
      status: 'OPEN',
      activities: [
        { eventType: 'CREATED', changes: { originPhase: 'PLANNING' } },
      ],
    },
  });
});

it('documents create/detail HTTP contracts with allowed input and initial activity', () => {
  const paths = createOpenApiDocument(app).paths;
  const create = paths['/api/incidents']?.post;
  expect(create?.responses['201']).toHaveProperty('content');
  expect(create?.responses['400']).toBeDefined();
  expect(create?.responses['401']).toBeDefined();
  expect(create?.responses['403']).toBeDefined();
  expect(create?.responses['404']).toBeDefined();
  expect(create?.responses['409']).toBeDefined();
  expect(create?.responses['503']).toBeDefined();
  expect(create?.security).toBeDefined();
  expect(paths['/api/incidents/{id}']?.get?.responses['200']).toHaveProperty(
    'content',
  );
  const body = create?.requestBody;
  expect(
    body && 'content' in body
      ? body.content['application/json']?.schema
      : undefined,
  ).toMatchObject({
    additionalProperties: false,
    required: [
      'promotionId',
      'originPhase',
      'title',
      'description',
      'category',
      'priority',
    ],
  });
});

it('keeps incident detail private for unlinked and non-creator collaborators and revokes visibility on removal', async () => {
  const collaborator = actors.get('COLLABORATOR')!;
  const manager = actors.get('MANAGER')!;
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const read = (actor: { cookie: string }, id: string) =>
    fetch(baseUrl + `/api/incidents/${id}`, {
      headers: { cookie: actor.cookie },
    });
  const before = [
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ];
  expect((await read(manager, incident.id)).status).toBe(404);
  await prisma.promotionParticipant.create({
    data: { promotionId, userId: manager.id },
  });
  expect((await read(manager, incident.id)).status).toBe(200);
  await prisma.promotionParticipant.create({
    data: { promotionId, userId: collaborator.id },
  });
  expect((await read(collaborator, incident.id)).status).toBe(404);
  const own = await (await postAs(collaborator, validInput())).json();
  expect((await read(collaborator, own.incident.id)).status).toBe(200);
  await prisma.promotionParticipant.delete({
    where: { promotionId_userId: { promotionId, userId: collaborator.id } },
  });
  expect((await read(collaborator, own.incident.id)).status).toBe(404);
  expect([
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ]).toEqual(before.map((n) => n + 1));
  expect((await read({ cookie: '' }, incident.id)).status).toBe(401);
  expect((await read({ cookie }, 'invalid')).status).toBe(400);
  expect(
    (await read({ cookie }, '00000000-0000-4000-8000-000000000099')).status,
  ).toBe(404);
  await prisma.promotionParticipant.delete({
    where: { promotionId_userId: { promotionId, userId: manager.id } },
  });
});

it('lists only visible incidents in stable newest-first order, revokes membership and preserves persisted values', async () => {
  const manager = actors.get('MANAGER')!;
  const collaborator = actors.get('COLLABORATOR')!;
  const author = (
    await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
  ).id;
  const linkedPromotion = await prisma.promotion.findFirstOrThrow({
    where: { name: 'I05.1 archived' },
  });
  await prisma.promotionParticipant.createMany({
    data: [
      { promotionId: linkedPromotion.id, userId: manager.id },
      { promotionId: linkedPromotion.id, userId: collaborator.id },
    ],
  });
  const otherPromotion = { id: promotionId };
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  const input = {
    originPhase: 'PLANNING' as const,
    title: 'Incidencia de consulta',
    description: 'Contenido sintético para comprobar visibilidad.',
    category: 'STRUCTURE' as const,
    priority: 'MEDIUM' as const,
    createdAt: timestamp,
  };
  const own = await prisma.incident.create({
    data: {
      ...input,
      promotionId: linkedPromotion.id,
      createdById: collaborator.id,
      status: 'CLOSED',
    },
  });
  const other = await prisma.incident.create({
    data: { ...input, promotionId: linkedPromotion.id, createdById: author },
  });
  const outside = await prisma.incident.create({
    data: {
      ...input,
      promotionId: otherPromotion.id,
      createdById: collaborator.id,
    },
  });
  const before = await prisma.incident.findMany({
    where: { id: { in: [own.id, other.id, outside.id] } },
    orderBy: { id: 'asc' },
  });
  const activitiesBefore = await prisma.incidentActivity.count();
  async function list(authCookie: string) {
    const response = await fetch(baseUrl + '/api/incidents', {
      headers: { cookie: authCookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return (await response.json()).incidents as Array<{
      id: string;
      createdAt: string;
    }>;
  }
  const global = await list(cookie);
  expect(global.map((item) => item.id)).toEqual(
    expect.arrayContaining([own.id, other.id, outside.id]),
  );
  expect(global).toEqual(
    [...global].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    ),
  );
  const scoped = await list(manager.cookie);
  expect(scoped.map((item) => item.id)).toEqual(
    expect.arrayContaining([own.id, other.id]),
  );
  expect(scoped.some((item) => item.id === outside.id)).toBe(false);
  expect((await list(collaborator.cookie)).map((item) => item.id)).toEqual([
    own.id,
  ]);
  for (const [auth, id, status] of [
    [manager, other.id, 200],
    [manager, outside.id, 404],
    [collaborator, own.id, 200],
    [collaborator, other.id, 404],
    [collaborator, outside.id, 404],
  ] as const) {
    expect(
      (
        await fetch(baseUrl + `/api/incidents/${id}`, {
          headers: { cookie: auth.cookie },
        })
      ).status,
    ).toBe(status);
  }
  await prisma.promotionParticipant.deleteMany({
    where: {
      promotionId: linkedPromotion.id,
      userId: { in: [manager.id, collaborator.id] },
    },
  });
  expect(await list(manager.cookie)).toEqual([]);
  expect(await list(collaborator.cookie)).toEqual([]);
  for (const actor of [manager, collaborator]) {
    expect(
      (
        await fetch(baseUrl + `/api/incidents/${own.id}`, {
          headers: { cookie: actor.cookie },
        })
      ).status,
    ).toBe(404);
  }
  expect((await fetch(baseUrl + '/api/incidents')).status).toBe(401);
  expect(
    await prisma.incident.findMany({
      where: { id: { in: [own.id, other.id, outside.id] } },
      orderBy: { id: 'asc' },
    }),
  ).toEqual(before);
  expect(await prisma.incidentActivity.count()).toBe(activitiesBefore);
});

it('rejects a deactivated account session without persistence', async () => {
  const actor = actors.get('COLLABORATOR')!;
  const before = [
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ];
  await prisma.user.update({
    where: { id: actor.id },
    data: { isActive: false },
  });
  expect((await postAs(actor, validInput())).status).toBe(401);
  expect([
    await prisma.incident.count(),
    await prisma.incidentActivity.count(),
  ]).toEqual(before);
});

it('serializes a detail read with concurrent ADMIN demotion, then denies the reduced scope', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  interface Observer {
    connect(): Promise<void>;
    query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
  const { Client } = createRequire(import.meta.url)('pg') as {
    Client: new (options: { connectionString: string }) => Observer;
  };
  const blocker = new Client({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  });
  const observer = new Client({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  });
  await blocker.connect();
  await observer.connect();
  const store = new IncidentsStore(() => prisma);
  let readFinished = false;
  let demotionFinished = false;
  let read: Promise<unknown> | undefined;
  let demotion: Promise<unknown> | undefined;
  async function blockedBy(
    pid: number,
    finished: () => boolean,
    message: string,
  ): Promise<number> {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const { rows } = await observer.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      if (rows[0]) return rows[0].pid;
      if (finished()) throw new Error(message);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('No se observó el bloqueo PostgreSQL esperado');
  }
  try {
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE public.incidents IN ACCESS EXCLUSIVE MODE');
    const { rows } = await blocker.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    read = store.get(incident.createdById, incident.id).finally(() => {
      readFinished = true;
    });
    const readerPid = await blockedBy(
      rows[0]!.pid,
      () => readFinished,
      'La lectura terminó antes de la barrera',
    );
    demotion = prisma.user
      .update({
        where: { id: incident.createdById },
        data: { role: 'MANAGER' },
      })
      .finally(() => {
        demotionFinished = true;
      });
    await blockedBy(
      readerPid,
      () => demotionFinished,
      'La degradación se confirmó mientras la lectura retenía permisos ADMIN',
    );
    expect(demotionFinished).toBe(false);
    await blocker.query('COMMIT');
    await expect(read).resolves.toMatchObject({ id: incident.id });
    await demotion;
    await expect(
      store.get(incident.createdById, incident.id),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    await blocker.query('ROLLBACK');
    await Promise.allSettled([read, demotion]);
    await prisma.user.update({
      where: { id: incident.createdById },
      data: { role: 'ADMIN' },
    });
    await blocker.end();
    await observer.end();
  }
});
