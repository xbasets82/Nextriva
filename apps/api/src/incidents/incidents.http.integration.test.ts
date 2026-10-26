import 'reflect-metadata';
import { createRequire } from 'node:module';
import { IncidentsStore } from './incidents.store.js';
import {
  incidentDetailSchema,
  reopenInputSchema,
  deletedIncidentListSchema,
  deletedIncidentResponseSchema,
  incidentResponseSchema,
} from './incident.schema.js';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createOpenApiDocument } from '../openapi.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaClient,
  type IncidentStatus,
} from '../../generated/prisma/client.js';
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
let adminActorId: string;
const actors = new Map<
  string,
  { id: string; cookie: string; csrfToken: string }
>();

beforeAll(async () => {
  const hasher = new PasswordHasher();
  const password = randomBytes(24).toString('base64url');
  const email = `i051-${randomBytes(8).toString('hex')}@example.test`;
  const admin = await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'ADMIN',
      email,
      role: 'ADMIN',
      passwordHash: await hasher.hash(password),
    },
  });
  adminActorId = admin.id;
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
  expect((await read(manager, incident.id)).status).toBe(404);
  await prisma.promotionParticipant.create({
    data: { promotionId, userId: manager.id },
  });
  expect((await read(manager, incident.id)).status).toBe(200);
  expect(
    (await commentAs(manager, incident.id, { body: 'Gestor autorizado' }))
      .status,
  ).toBe(201);
  await prisma.promotionParticipant.create({
    data: { promotionId, userId: collaborator.id },
  });
  expect((await read(collaborator, incident.id)).status).toBe(404);
  expect(
    (await commentAs(collaborator, incident.id, { body: 'Incidencia ajena' }))
      .status,
  ).toBe(404);
  const own = await (await postAs(collaborator, validInput())).json();
  expect((await read(collaborator, own.incident.id)).status).toBe(200);
  expect(
    (
      await commentAs(collaborator, own.incident.id, {
        body: 'Comentario propio',
      })
    ).status,
  ).toBe(201);
  await prisma.promotionParticipant.delete({
    where: { promotionId_userId: { promotionId, userId: collaborator.id } },
  });
  expect((await read(collaborator, own.incident.id)).status).toBe(404);
  const incidentBefore = await prisma.incident.findUniqueOrThrow({
    where: { id: own.incident.id },
  });
  const activitiesBefore = await prisma.incidentActivity.findMany({
    where: { incidentId: own.incident.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const commentsBefore = await prisma.incidentComment.findMany({
    where: { incidentId: own.incident.id },
  });
  expect(
    (
      await commentAs(collaborator, own.incident.id, {
        body: 'Acceso retirado',
      })
    ).status,
  ).toBe(404);
  expect(
    await prisma.incidentComment.findMany({
      where: { incidentId: own.incident.id },
    }),
  ).toEqual(commentsBefore);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: own.incident.id } }),
  ).toEqual(incidentBefore);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: own.incident.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ).toEqual(activitiesBefore);
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
  async function list(authCookie: string, targetPromotionId: string) {
    const response = await fetch(
      baseUrl + `/api/incidents?promotionId=${targetPromotionId}&pageSize=100`,
      {
        headers: { cookie: authCookie },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return (await response.json()).items as Array<{
      id: string;
      createdAt: string;
    }>;
  }
  const global = await list(cookie, linkedPromotion.id);
  expect(global.map((item) => item.id)).toEqual(
    expect.arrayContaining([own.id, other.id]),
  );
  expect(global).toEqual(
    [...global].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    ),
  );
  expect(
    (await list(cookie, otherPromotion.id)).map((item) => item.id),
  ).toContain(outside.id);
  const scoped = await list(manager.cookie, linkedPromotion.id);
  expect(scoped.map((item) => item.id)).toEqual(
    expect.arrayContaining([own.id, other.id]),
  );
  expect(scoped.some((item) => item.id === outside.id)).toBe(false);
  expect(
    (await list(collaborator.cookie, linkedPromotion.id)).map(
      (item) => item.id,
    ),
  ).toEqual([own.id]);
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
  expect(await list(manager.cookie, linkedPromotion.id)).toEqual([]);
  expect(await list(collaborator.cookie, linkedPromotion.id)).toEqual([]);
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

it('creates and reads immutable plain-text comments with server author and time', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const response = await fetch(
    baseUrl + `/api/incidents/${incident.id}/comments`,
    {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: '  <img src=x onerror=window.__commentXss=true>  ',
      }),
    },
  );
  expect(response.status).toBe(201);
  const { comment } = await response.json();
  expect(comment).toMatchObject({
    incidentId: incident.id,
    authorId: incident.createdById,
    authorName: 'Synthetic ADMIN',
    body: '<img src=x onerror=window.__commentXss=true>',
    createdAt: expect.any(String),
  });
  const commentActivity = await prisma.incidentActivity.findFirstOrThrow({
    where: { incidentId: incident.id, eventType: 'COMMENT_ADDED' },
  });
  expect(commentActivity).toMatchObject({
    incidentId: incident.id,
    actorId: incident.createdById,
    eventType: 'COMMENT_ADDED',
    changes: { commentId: comment.id },
    createdAt: expect.any(Date),
  });
  expect(commentActivity.createdAt.getTime()).toBeGreaterThanOrEqual(
    Date.parse(comment.createdAt),
  );
  const detail = await fetch(baseUrl + `/api/incidents/${incident.id}`, {
    headers: { cookie },
  });
  expect(detail.status).toBe(200);
  expect((await detail.json()).incident.comments).toEqual([comment]);
  expect(Object.keys(comment).sort()).toEqual(
    ['id', 'incidentId', 'authorId', 'authorName', 'body', 'createdAt'].sort(),
  );
  const before = await prisma.incidentComment.findMany({
    where: { incidentId: incident.id },
  });
  const denied = await fetch(baseUrl + `/api/incidents/${incident.id}`, {
    headers: { cookie: actors.get('MANAGER')!.cookie },
  });
  expect(denied.status).toBe(404);
  const deniedBody = await denied.text();
  expect(deniedBody).not.toContain(comment.authorId);
  expect(deniedBody).not.toContain('Synthetic ADMIN');
  expect(
    await prisma.incidentComment.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(before);
  try {
    await prisma.user.update({
      where: { id: incident.createdById },
      data: { firstName: 'Ada', lastName: 'Lovelace' },
    });
    const refreshed = await fetch(baseUrl + `/api/incidents/${incident.id}`, {
      headers: { cookie },
    });
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).incident.comments).toEqual([
      { ...comment, authorName: 'Ada Lovelace' },
    ]);
  } finally {
    await prisma.user.update({
      where: { id: incident.createdById },
      data: { firstName: 'Synthetic', lastName: 'ADMIN' },
    });
  }
});

it('documents comments input, response and ordered detail collection', () => {
  const operation =
    createOpenApiDocument(app).paths['/api/incidents/{id}/comments']?.post;
  expect(operation?.responses['201']).toHaveProperty('content');
  const body = operation?.requestBody;
  expect(
    body && 'content' in body
      ? body.content['application/json']?.schema
      : undefined,
  ).toMatchObject({
    additionalProperties: false,
    required: ['body'],
    properties: { body: { maxLength: 2000 } },
  });
});

async function commentAs(
  auth: { cookie: string; csrfToken: string },
  id: string,
  body: unknown,
) {
  return fetch(baseUrl + `/api/incidents/${id}/comments`, {
    method: 'POST',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
it('enforces comments validation, authentication, CSRF and non-visible UUIDs without inserts', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const before = await prisma.incidentComment.count();
  const activitiesBefore = await prisma.incidentActivity.count({
    where: { incidentId: incident.id },
  });
  for (const body of [
    { body: '' },
    { body: '   ' },
    { body: 'a'.repeat(2001) },
    { body: 'valid', authorId: incident.createdById },
    { body: 'valid', authorName: 'Forged author' },
    null,
    [],
  ]) {
    expect(
      (await commentAs({ cookie, csrfToken }, incident.id, body)).status,
    ).toBe(400);
  }
  expect(
    (
      await commentAs({ cookie: '', csrfToken: '' }, incident.id, {
        body: 'valid',
      })
    ).status,
  ).toBe(401);
  expect(
    (await commentAs({ cookie, csrfToken: '' }, incident.id, { body: 'valid' }))
      .status,
  ).toBe(403);
  expect(
    (await commentAs(actors.get('MANAGER')!, incident.id, { body: 'valid' }))
      .status,
  ).toBe(404);
  expect(
    (
      await commentAs(
        { cookie, csrfToken },
        '00000000-0000-4000-8000-000000000099',
        { body: 'valid' },
      )
    ).status,
  ).toBe(404);
  expect(await prisma.incidentComment.count()).toBe(before);
  expect(
    await prisma.incidentActivity.count({
      where: { incidentId: incident.id },
    }),
  ).toBe(activitiesBefore);
});
it('allows pending-validation comments but blocks closed and archived incidents without changing version or activity', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'PENDING_VALIDATION' },
  });
  expect(
    (
      await commentAs({ cookie, csrfToken }, incident.id, {
        body: 'Pendiente permite comentar',
      })
    ).status,
  ).toBe(201);
  const before = await prisma.incidentComment.count();
  const activities = await prisma.incidentActivity.count();
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'CLOSED' },
  });
  expect(
    (await commentAs({ cookie, csrfToken }, incident.id, { body: 'Cerrada' }))
      .status,
  ).toBe(409);
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'OPEN' },
  });
  await prisma.promotion.update({
    where: { id: promotionId },
    data: { status: 'ARCHIVED' },
  });
  try {
    expect(
      (
        await commentAs({ cookie, csrfToken }, incident.id, {
          body: 'Archivada',
        })
      ).status,
    ).toBe(409);
  } finally {
    await prisma.promotion.update({
      where: { id: promotionId },
      data: { status: 'ACTIVE' },
    });
  }
  expect(await prisma.incidentComment.count()).toBe(before);
  expect(await prisma.incidentActivity.count()).toBe(activities);
  expect(
    (await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }))
      .version,
  ).toBe(incident.version);
});
it('enforces comment FK constraints and preserves history when deleting referenced resources is attempted', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const missing = '00000000-0000-4000-8000-000000000099';
  const before = await prisma.incidentComment.count();
  for (const data of [
    {
      incidentId: missing,
      authorId: incident.createdById,
      body: 'FK incidencia',
    },
    { incidentId: incident.id, authorId: missing, body: 'FK autor' },
  ]) {
    await expect(prisma.incidentComment.create({ data })).rejects.toMatchObject(
      { code: 'P2003' },
    );
  }
  expect(await prisma.incidentComment.count()).toBe(before);
  expect(
    (await commentAs({ cookie, csrfToken }, incident.id, { body: 'Histórico' }))
      .status,
  ).toBe(201);
  const constraints = await prisma.$queryRaw<
    Array<{ confdeltype: string }>
  >`SELECT confdeltype::text AS confdeltype FROM pg_constraint WHERE conname IN ('incident_comments_incident_id_fkey', 'incident_comments_author_id_fkey')`;
  expect(constraints.map((item) => item.confdeltype)).toEqual(['r', 'r']);
  expect(
    await prisma.incidentComment.count({ where: { incidentId: incident.id } }),
  ).toBe(1);
});

it.each(['archive', 'close'] as const)(
  'serializes comments with concurrent %s and rejects without insert after the lock commits',
  async (operation) => {
    const { incident } = await (
      await postAs({ cookie, csrfToken }, validInput())
    ).json();
    interface Connection {
      connect(): Promise<void>;
      query<T = unknown>(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: T[] }>;
      end(): Promise<void>;
    }
    const { Client } = createRequire(import.meta.url)('pg') as {
      Client: new (options: { connectionString: string }) => Connection;
    };
    const blocker = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    const observer = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    await blocker.connect();
    await observer.connect();
    let pending: Promise<Response> | undefined;
    let finished = false;
    const before = await prisma.incidentComment.count({
      where: { incidentId: incident.id },
    });
    try {
      await blocker.query('BEGIN');
      if (operation === 'archive')
        await blocker.query(
          "UPDATE promotions SET status='ARCHIVED' WHERE id=$1",
          [promotionId],
        );
      else
        await blocker.query(
          "UPDATE incidents SET status='CLOSED' WHERE id=$1",
          [incident.id],
        );
      const { rows } = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      pending = commentAs({ cookie, csrfToken }, incident.id, {
        body: 'Comentario en carrera',
      }).finally(() => {
        finished = true;
      });
      let blocked = false;
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const result = await observer.query<{ pid: number }>(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))",
          [rows[0]!.pid],
        );
        if (result.rows.length) {
          blocked = true;
          break;
        }
        if (finished)
          throw new Error('El comentario terminó antes de respetar el bloqueo');
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(blocked).toBe(true);
      expect(finished).toBe(false);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(409);
      expect(
        await prisma.incidentComment.count({
          where: { incidentId: incident.id },
        }),
      ).toBe(before);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled([pending]);
      await prisma.promotion.update({
        where: { id: promotionId },
        data: { status: 'ACTIVE' },
      });
      await blocker.end();
      await observer.end();
    }
  },
);

it('rolls back comment insertion failures and returns a safe infrastructure error', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const before = await prisma.incidentComment.count();
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_i061_comment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic confidential comment database failure'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_i061_comment BEFORE INSERT ON incident_comments FOR EACH ROW EXECUTE FUNCTION reject_i061_comment()`,
  );
  try {
    const result = await commentAs({ cookie, csrfToken }, incident.id, {
      body: 'No debe persistir',
    });
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('synthetic confidential');
    expect(await prisma.incidentComment.count()).toBe(before);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_i061_comment ON incident_comments',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION reject_i061_comment()');
  }
});

it('rolls back a comment when its COMMENT_ADDED activity insert fails', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const beforeIncident = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const commentsBefore = await prisma.incidentComment.count({
    where: { incidentId: incident.id },
  });
  const activitiesBefore = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });

  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_i081_comment_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic confidential comment activity failure'; END $$`,
  );
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_i081_comment_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_i081_comment_activity()`,
    );
    const response = await commentAs({ cookie, csrfToken }, incident.id, {
      body: 'El comentario debe revertirse',
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic confidential');
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    ).toEqual(beforeIncident);
    expect(
      await prisma.incidentComment.count({
        where: { incidentId: incident.id },
      }),
    ).toBe(commentsBefore);
    expect(
      await prisma.incidentActivity.findMany({
        where: { incidentId: incident.id },
      }),
    ).toEqual(activitiesBefore);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reject_i081_comment_activity ON incident_activities',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS reject_i081_comment_activity()',
    );
  }
});

it('returns comments in chronological order with UUID tie-breaking', async () => {
  const { incident } = await (
    await postAs({ cookie, csrfToken }, validInput())
  ).json();
  const timestamp = new Date('2026-01-01T00:00:00Z');
  const first = '00000000-0000-4000-8000-000000000001';
  const second = '00000000-0000-4000-8000-000000000002';
  await prisma.incidentComment.createMany({
    data: [
      {
        id: second,
        incidentId: incident.id,
        authorId: incident.createdById,
        body: 'Segundo',
        createdAt: timestamp,
      },
      {
        id: first,
        incidentId: incident.id,
        authorId: incident.createdById,
        body: 'Primero',
        createdAt: timestamp,
      },
    ],
  });
  const result = await fetch(baseUrl + `/api/incidents/${incident.id}`, {
    headers: { cookie },
  });
  expect(
    (await result.json()).incident.comments.map(
      (comment: { id: string }) => comment.id,
    ),
  ).toEqual([first, second]);
});

describe('I06.2 assignment', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    }),
  });
  const origin = 'https://nextriva.example';
  let app: INestApplication;
  let baseUrl: string;
  let promotionId: string;
  type Actor = { id: string; cookie: string; csrfToken: string };
  const actors = new Map<string, Actor>();
  beforeAll(async () => {
    const hasher = new PasswordHasher();
    const password = randomBytes(24).toString('base64url');
    app = await createApp(undefined, {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    promotionId = (
      await prisma.promotion.create({
        data: {
          name: 'I06.2 temporary',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    for (const [name, role] of [
      ['admin', 'ADMIN'],
      ['manager', 'MANAGER'],
      ['collaborator', 'COLLABORATOR'],
      ['other', 'COLLABORATOR'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: name,
          email: `i062-${name}-${randomBytes(8).toString('hex')}@example.test`,
          role,
          passwordHash: await hasher.hash(password),
        },
      });
      const login = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
      const csrfToken = (
        await (
          await fetch(baseUrl + '/api/auth/csrf', { headers: { cookie } })
        ).json()
      ).csrfToken as string;
      actors.set(name, { id: user.id, cookie, csrfToken });
      if (name !== 'admin')
        await prisma.promotionParticipant.create({
          data: { promotionId, userId: user.id },
        });
    }
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });
  async function incident() {
    return prisma.incident.create({
      data: {
        promotionId,
        createdById: actors.get('admin')!.id,
        originPhase: 'PLANNING',
        title: 'I06.2 assignment',
        description: 'Synthetic assignment test incident',
        category: 'OTHER',
        priority: 'LOW',
      },
    });
  }
  function assign(auth: Actor, id: string, body: unknown) {
    return fetch(baseUrl + `/api/incidents/${id}/assignment`, {
      method: 'PATCH',
      headers: {
        origin,
        cookie: auth.cookie,
        'x-csrf-token': auth.csrfToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
  const snapshot = reviewSnapshot;
  it('assigns and reassigns atomically with server actor/time and distinct event snapshots without changing status', async () => {
    const item = await incident();
    const first = await assign(actors.get('manager')!, item.id, {
      assignedToId: actors.get('collaborator')!.id,
      version: 1,
    });
    expect(first.status).toBe(200);
    expect((await first.json()).incident).toMatchObject({
      assignedToId: actors.get('collaborator')!.id,
      version: 2,
      status: 'OPEN',
    });
    const second = await assign(actors.get('admin')!, item.id, {
      assignedToId: actors.get('admin')!.id,
      version: 2,
    });
    expect(second.status).toBe(200);
    const activities = await prisma.incidentActivity.findMany({
      where: { incidentId: item.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({
      eventType: 'ASSIGNED',
      actorId: actors.get('manager')!.id,
      createdAt: expect.any(Date),
      changes: {
        previousAssignedToId: null,
        assignedToId: actors.get('collaborator')!.id,
      },
    });
    expect(activities[1]).toMatchObject({
      eventType: 'REASSIGNED',
      actorId: actors.get('admin')!.id,
      changes: {
        previousAssignedToId: actors.get('collaborator')!.id,
        assignedToId: actors.get('admin')!.id,
      },
    });
    expect((await snapshot(item.id)).incident).toMatchObject({
      status: 'OPEN',
      version: 3,
    });
  });
  it('rejects malformed/null payload, missing session and CSRF, forbidden actor and invisible UUID without mutations', async () => {
    const item = await incident();
    const before = await snapshot(item.id);
    for (const body of [
      null,
      {},
      { assignedToId: null, version: 1 },
      { assignedToId: 'bad', version: 1 },
      { assignedToId: actors.get('other')!.id, version: 0 },
      {
        assignedToId: actors.get('other')!.id,
        version: 1,
        actorId: actors.get('admin')!.id,
      },
    ]) {
      expect((await assign(actors.get('admin')!, item.id, body)).status).toBe(
        400,
      );
      expect(await snapshot(item.id)).toEqual(before);
    }
    expect(
      (
        await assign({ id: '', cookie: '', csrfToken: '' }, item.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        })
      ).status,
    ).toBe(401);
    expect(await snapshot(item.id)).toEqual(before);
    expect(
      (
        await assign({ ...actors.get('admin')!, csrfToken: '' }, item.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        })
      ).status,
    ).toBe(403);
    expect(await snapshot(item.id)).toEqual(before);
    const own = await prisma.incident.update({
      where: { id: item.id },
      data: { createdById: actors.get('collaborator')!.id },
    });
    const ownBefore = await snapshot(item.id);
    expect(
      (
        await assign(actors.get('collaborator')!, own.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        })
      ).status,
    ).toBe(403);
    expect(await snapshot(item.id)).toEqual(ownBefore);
    await prisma.incident.update({
      where: { id: item.id },
      data: {
        createdById: before.incident.createdById,
        updatedAt: before.incident.updatedAt,
      },
    });
    const hidden = await prisma.promotion.create({
      data: { name: 'I06.2 hidden', phases: { create: { phase: 'PLANNING' } } },
    });
    await prisma.incident.update({
      where: { id: item.id },
      data: { promotionId: hidden.id },
    });
    const hiddenBefore = await snapshot(item.id);
    expect(
      (
        await assign(actors.get('manager')!, item.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        })
      ).status,
    ).toBe(404);
    expect(await snapshot(item.id)).toEqual(hiddenBefore);
  });
  it('rejects inactive, unlinked and unknown assignees without changing version or activities', async () => {
    const item = await incident();
    const target = await prisma.user.create({
      data: {
        firstName: 'Ineligible',
        lastName: 'Target',
        email: `i062-ineligible-${randomBytes(8).toString('hex')}@example.test`,
        passwordHash: randomBytes(32).toString('hex'),
        role: 'COLLABORATOR',
      },
    });
    const before = await snapshot(item.id);
    for (const id of [target.id, '00000000-0000-4000-8000-000000000099'])
      expect(
        (
          await assign(actors.get('admin')!, item.id, {
            assignedToId: id,
            version: 1,
          })
        ).status,
      ).toBe(400);
    await prisma.promotionParticipant.create({
      data: { promotionId, userId: target.id },
    });
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: false },
    });
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: target.id,
          version: 1,
        })
      ).status,
    ).toBe(400);
    expect(await snapshot(item.id)).toEqual(before);
  });
  it('blocks assignment in pending/closed incidents or archived promotion and permits IN_PROGRESS', async () => {
    const item = await incident();
    for (const status of ['PENDING_VALIDATION', 'CLOSED'] as const) {
      await prisma.incident.update({
        where: { id: item.id },
        data: { status },
      });
      const before = await snapshot(item.id);
      expect(
        (
          await assign(actors.get('admin')!, item.id, {
            assignedToId: actors.get('other')!.id,
            version: 1,
          })
        ).status,
      ).toBe(409);
      expect(await snapshot(item.id)).toEqual(before);
    }
    await prisma.incident.update({
      where: { id: item.id },
      data: { status: 'IN_PROGRESS' },
    });
    await prisma.promotion.update({
      where: { id: promotionId },
      data: { status: 'ARCHIVED' },
    });
    try {
      const before = await snapshot(item.id);
      expect(
        (
          await assign(actors.get('admin')!, item.id, {
            assignedToId: actors.get('other')!.id,
            version: 1,
          })
        ).status,
      ).toBe(409);
      expect(await snapshot(item.id)).toEqual(before);
    } finally {
      await prisma.promotion.update({
        where: { id: promotionId },
        data: { status: 'ACTIVE' },
      });
    }
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        })
      ).status,
    ).toBe(200);
  });
  it('rejects stale concurrent versions with one winner and no overwritten history', async () => {
    const item = await incident();
    const responses = await Promise.all(
      ['collaborator', 'other'].map((key) =>
        assign(actors.get('admin')!, item.id, {
          assignedToId: actors.get(key)!.id,
          version: 1,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect(await conflict.json()).toMatchObject({
      code: 'INCIDENT_VERSION_CONFLICT',
    });
    const before = await snapshot(item.id);
    expect(before.incident.version).toBe(2);
    expect(before.activities).toHaveLength(1);
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: actors.get('admin')!.id,
          version: 1,
        })
      ).status,
    ).toBe(409);
    expect(await snapshot(item.id)).toEqual(before);
  });
  it('rolls back assignment and version if activity insert fails and conceals database diagnostics', async () => {
    const item = await incident();
    const independent = await incident();
    const before = await snapshot(item.id);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_i062_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private assignment diagnostic'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER reject_i062_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${item.id}'::uuid) EXECUTE FUNCTION reject_i062_activity()`,
      );
      const [response, unaffected] = await Promise.all([
        assign(actors.get('admin')!, item.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        }),
        assign(actors.get('admin')!, independent.id, {
          assignedToId: actors.get('other')!.id,
          version: 1,
        }),
      ]);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('synthetic private');
      expect(await snapshot(item.id)).toEqual(before);
      expect(unaffected.status).toBe(200);
      expect((await snapshot(independent.id)).activities).toHaveLength(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reject_i062_activity ON incident_activities',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_i062_activity()',
      );
    }
    expect(
      await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE tgname = 'reject_i062_activity'`,
    ).toEqual([]);
    expect(
      await prisma.$queryRaw`SELECT proname FROM pg_proc WHERE proname = 'reject_i062_activity'`,
    ).toEqual([]);
  });

  function mutate(auth: Actor, path: string, method: string, body?: unknown) {
    return fetch(baseUrl + path, {
      method,
      headers: {
        origin,
        cookie: auth.cookie,
        'x-csrf-token': auth.csrfToken,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function targetUser(role: 'MANAGER' | 'COLLABORATOR' = 'COLLABORATOR') {
    const target = await prisma.user.create({
      data: {
        firstName: 'Responsable',
        lastName: 'Synthetic',
        email: `i062-target-${randomBytes(8).toString('hex')}@example.test`,
        role,
        passwordHash: randomBytes(32).toString('hex'),
      },
    });
    await prisma.promotionParticipant.create({
      data: { promotionId, userId: target.id },
    });
    return target;
  }
  function withdrawResponsible(
    operation: 'deactivate' | 'demote' | 'remove',
    id: string,
  ) {
    if (operation === 'remove')
      return mutate(
        actors.get('admin')!,
        `/api/promotions/${promotionId}/participants/${id}`,
        'DELETE',
      );
    if (operation === 'deactivate')
      return mutate(actors.get('admin')!, `/api/users/${id}/status`, 'PATCH', {
        isActive: false,
      });
    return mutate(actors.get('admin')!, `/api/users/${id}`, 'PATCH', {
      role: 'COLLABORATOR',
    });
  }
  it.each(['deactivate', 'demote', 'remove'] as const)(
    'blocks %s for a nonclosed assignee with no mutation, and permits it after closure',
    async (operation) => {
      const target = await targetUser('MANAGER');
      const item = await incident();
      expect(
        (
          await assign(actors.get('admin')!, item.id, {
            assignedToId: target.id,
            version: 1,
          })
        ).status,
      ).toBe(200);
      const perform = () => withdrawResponsible(operation, target.id);
      for (const status of [
        'OPEN',
        'IN_PROGRESS',
        'PENDING_VALIDATION',
      ] as const) {
        await prisma.incident.update({
          where: { id: item.id },
          data: { status },
        });
        const before = await snapshot(item.id);
        const userBefore = await prisma.user.findUniqueOrThrow({
          where: { id: target.id },
        });
        expect((await perform()).status).toBe(409);
        expect(await snapshot(item.id)).toEqual(before);
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
        ).toEqual(userBefore);
        expect(
          await prisma.promotionParticipant.count({
            where: { promotionId, userId: target.id },
          }),
        ).toBe(1);
      }
      await prisma.incident.update({
        where: { id: item.id },
        data: { status: 'CLOSED' },
      });
      expect((await perform()).status).toBe(operation === 'remove' ? 204 : 200);
    },
  );
  it('grants assigned collaborator visibility and comments, revokes on reassignment and membership removal', async () => {
    const item = await incident();
    const visibilityPromotionId = (
      await prisma.promotion.create({
        data: {
          name: 'I06.2 isolated visibility',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    await prisma.incident.update({
      where: { id: item.id },
      data: { promotionId: visibilityPromotionId },
    });
    await prisma.promotionParticipant.createMany({
      data: ['collaborator', 'other'].map((key) => ({
        promotionId: visibilityPromotionId,
        userId: actors.get(key)!.id,
      })),
    });
    const collaborator = actors.get('collaborator')!;
    const other = actors.get('other')!;
    const get = (auth: Actor) =>
      fetch(baseUrl + `/api/incidents/${item.id}`, {
        headers: { cookie: auth.cookie },
      });
    expect((await get(collaborator)).status).toBe(404);
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: collaborator.id,
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect((await get(collaborator)).status).toBe(200);
    const list = await fetch(
      baseUrl +
        `/api/incidents?promotionId=${visibilityPromotionId}&pageSize=100`,
      {
        headers: { cookie: collaborator.cookie },
      },
    );
    expect(
      (await list.json()).items.map((value: { id: string }) => value.id),
    ).toContain(item.id);
    expect(
      (
        await mutate(
          collaborator,
          `/api/incidents/${item.id}/comments`,
          'POST',
          { body: 'Responsable autorizado' },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: other.id,
          version: 2,
        })
      ).status,
    ).toBe(200);
    const before = await snapshot(item.id);
    expect((await get(collaborator)).status).toBe(404);
    expect(
      (
        await mutate(
          collaborator,
          `/api/incidents/${item.id}/comments`,
          'POST',
          { body: 'Responsable anterior' },
        )
      ).status,
    ).toBe(404);
    expect(await snapshot(item.id)).toEqual(before);
    await prisma.incident.update({
      where: { id: item.id },
      data: { status: 'CLOSED' },
    });
    expect(
      (
        await mutate(
          actors.get('admin')!,
          `/api/promotions/${visibilityPromotionId}/participants/${other.id}`,
          'DELETE',
        )
      ).status,
    ).toBe(204);
    expect((await get(other)).status).toBe(404);
    await prisma.promotionParticipant.create({
      data: { promotionId: visibilityPromotionId, userId: other.id },
    });
  });
  it('lists only active linked assignees or global ADMIN and denies discovery to unauthorized actors', async () => {
    const item = await incident();
    const inactive = await targetUser();
    await prisma.user.update({
      where: { id: inactive.id },
      data: { isActive: false },
    });
    const get = (auth: Actor) =>
      fetch(baseUrl + `/api/incidents/${item.id}/eligible-assignees`, {
        headers: { cookie: auth.cookie },
      });
    const result = await get(actors.get('manager')!);
    expect(result.status).toBe(200);
    const { users } = await result.json();
    expect(users.map((user: { id: string }) => user.id)).toEqual(
      expect.arrayContaining([
        actors.get('admin')!.id,
        actors.get('manager')!.id,
        actors.get('collaborator')!.id,
      ]),
    );
    expect(users.map((user: { id: string }) => user.id)).not.toContain(
      inactive.id,
    );
    expect(
      users.every(
        (user: Record<string, unknown>) =>
          !('passwordHash' in user) && !('email' in user),
      ),
    ).toBe(true);
    expect((await get(actors.get('collaborator')!)).status).toBe(404);
    await prisma.incident.update({
      where: { id: item.id },
      data: { createdById: actors.get('collaborator')!.id },
    });
    expect((await get(actors.get('collaborator')!)).status).toBe(403);
  });

  it('enforces the assignee FK and preserves referenced users', async () => {
    const item = await incident();
    const before = await snapshot(item.id);
    await expect(
      prisma.incident.update({
        where: { id: item.id },
        data: { assignedToId: '00000000-0000-4000-8000-000000000099' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await snapshot(item.id)).toEqual(before);
    expect(
      await prisma.$queryRaw`SELECT confdeltype::text AS action FROM pg_constraint WHERE conname='incidents_assigned_to_id_fkey'`,
    ).toEqual([{ action: 'r' }]);
  });
  it.each(['deactivate', 'demote', 'remove'] as const)(
    'serializes assignment before concurrent %s and preserves the nonclosed assignee',
    async (operation) => {
      const item = await incident();
      const target = await targetUser('MANAGER');
      interface Connection {
        connect(): Promise<void>;
        query<T = unknown>(
          sql: string,
          values?: unknown[],
        ): Promise<{ rows: T[] }>;
        end(): Promise<void>;
      }
      const { Client } = createRequire(import.meta.url)('pg') as {
        Client: new (options: { connectionString: string }) => Connection;
      };
      const blocker = new Client({
        connectionString: getTemporaryMigrationDatabaseUrl(),
      });
      const observer = new Client({
        connectionString: getTemporaryMigrationDatabaseUrl(),
      });
      await blocker.connect();
      await observer.connect();
      let assignment: Promise<Response> | undefined;
      let withdrawal: Promise<Response> | undefined;
      let assignmentFinished = false;
      let withdrawalFinished = false;
      async function waiter(pid: number, done: () => boolean, excludedPid = 0) {
        const deadline = performance.now() + 5000;
        while (performance.now() < deadline) {
          const result = await observer.query<{ pid: number }>(
            "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND pid <> $2",
            [pid, excludedPid],
          );
          if (result.rows[0]) return result.rows[0].pid;
          if (done())
            throw new Error(
              'La operación terminó antes de la barrera PostgreSQL',
            );
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        throw new Error('No se observó el bloqueo PostgreSQL esperado');
      }
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT id FROM promotions WHERE id=$1 FOR UPDATE',
          [promotionId],
        );
        const { rows } = await blocker.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        assignment = assign(actors.get('admin')!, item.id, {
          assignedToId: target.id,
          version: 1,
        }).finally(() => {
          assignmentFinished = true;
        });
        const assignmentPid = await waiter(
          rows[0]!.pid,
          () => assignmentFinished,
        );
        withdrawal = withdrawResponsible(operation, target.id).finally(() => {
          withdrawalFinished = true;
        });
        await waiter(assignmentPid, () => withdrawalFinished, assignmentPid);
        expect(assignmentFinished).toBe(false);
        expect(withdrawalFinished).toBe(false);
        await blocker.query('COMMIT');
        expect((await assignment).status).toBe(200);
        expect((await withdrawal).status).toBe(409);
        expect((await snapshot(item.id)).incident).toMatchObject({
          assignedToId: target.id,
          version: 2,
        });
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
        ).toMatchObject({ isActive: true, role: 'MANAGER' });
        expect(
          await prisma.promotionParticipant.count({
            where: { promotionId, userId: target.id },
          }),
        ).toBe(1);
      } finally {
        await blocker.query('ROLLBACK');
        await Promise.allSettled([assignment, withdrawal]);
        await blocker.end();
        await observer.end();
      }
    },
  );
  it('treats the current assignee as idempotent 200 without touching assignment, timestamp, version or activity', async () => {
    const item = await incident();
    const target = await prisma.user.create({
      data: {
        id: `a0620000-0000-4000-8000-${randomBytes(6).toString('hex')}`,
        firstName: 'Canonical',
        lastName: 'Responsable',
        email: `i062-canonical-${randomBytes(8).toString('hex')}@example.test`,
        passwordHash: randomBytes(32).toString('hex'),
        role: 'COLLABORATOR',
      },
    });
    await prisma.promotionParticipant.create({
      data: { promotionId, userId: target.id },
    });
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: target.id,
          version: 1,
        })
      ).status,
    ).toBe(200);
    const before = await snapshot(item.id);
    const result = await assign(actors.get('admin')!, item.id, {
      assignedToId: target.id,
      version: 2,
    });
    expect(result.status).toBe(200);
    expect((await result.json()).incident).toMatchObject({
      assignedToId: target.id,
      version: 2,
      updatedAt: before.incident.updatedAt.toISOString(),
    });
    expect(await snapshot(item.id)).toEqual(before);
    const repeatedCase = await assign(actors.get('admin')!, item.id, {
      assignedToId: target.id.toUpperCase(),
      version: 2,
    });
    expect(repeatedCase.status).toBe(200);
    expect(await snapshot(item.id)).toEqual(before);
  });
  it('revalidates authorization, state, version and eligibility before an idempotent request and never mutates on rejection', async () => {
    const item = await incident();
    const target = await targetUser();
    expect(
      (
        await assign(actors.get('admin')!, item.id, {
          assignedToId: target.id,
          version: 1,
        })
      ).status,
    ).toBe(200);
    const body = { assignedToId: target.id, version: 2 };
    for (const [auth, expected] of [
      [{ id: '', cookie: '', csrfToken: '' }, 401],
      [{ ...actors.get('admin')!, csrfToken: '' }, 403],
    ] as const) {
      const before = await snapshot(item.id);
      expect((await assign(auth, item.id, body)).status).toBe(expected);
      expect(await snapshot(item.id)).toEqual(before);
    }
    await prisma.incident.update({
      where: { id: item.id },
      data: { createdById: actors.get('collaborator')!.id },
    });
    let before = await snapshot(item.id);
    expect(
      (await assign(actors.get('collaborator')!, item.id, body)).status,
    ).toBe(403);
    expect(await snapshot(item.id)).toEqual(before);
    expect(
      (await assign(actors.get('admin')!, item.id, { ...body, version: 1 }))
        .status,
    ).toBe(409);
    expect(await snapshot(item.id)).toEqual(before);
    for (const status of ['PENDING_VALIDATION', 'CLOSED'] as const) {
      await prisma.incident.update({
        where: { id: item.id },
        data: { status },
      });
      before = await snapshot(item.id);
      expect((await assign(actors.get('admin')!, item.id, body)).status).toBe(
        409,
      );
      expect(await snapshot(item.id)).toEqual(before);
    }
    await prisma.incident.update({
      where: { id: item.id },
      data: { status: 'OPEN' },
    });
    await prisma.promotion.update({
      where: { id: promotionId },
      data: { status: 'ARCHIVED' },
    });
    try {
      before = await snapshot(item.id);
      expect((await assign(actors.get('admin')!, item.id, body)).status).toBe(
        409,
      );
      expect(await snapshot(item.id)).toEqual(before);
    } finally {
      await prisma.promotion.update({
        where: { id: promotionId },
        data: { status: 'ACTIVE' },
      });
    }
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: false },
    });
    try {
      before = await snapshot(item.id);
      expect((await assign(actors.get('admin')!, item.id, body)).status).toBe(
        400,
      );
      expect(await snapshot(item.id)).toEqual(before);
    } finally {
      await prisma.user.update({
        where: { id: target.id },
        data: { isActive: true },
      });
    }
    await prisma.promotionParticipant.delete({
      where: { promotionId_userId: { promotionId, userId: target.id } },
    });
    before = await snapshot(item.id);
    expect((await assign(actors.get('admin')!, item.id, body)).status).toBe(
      400,
    );
    expect(await snapshot(item.id)).toEqual(before);
  });
});

it('inicia una incidencia asignada con versión y actividad atómicas, y rechaza versiones obsoletas', async () => {
  const password = randomBytes(24).toString('base64url');
  const user = await prisma.user.create({
    data: {
      firstName: 'I07',
      lastName: 'Responsable',
      email: `i071-${randomBytes(8).toString('hex')}@example.test`,
      role: 'COLLABORATOR',
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  expect(login.status).toBe(200);
  const actorCookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const actorCsrf = (
    await (
      await fetch(baseUrl + '/api/auth/csrf', {
        headers: { cookie: actorCookie },
      })
    ).json()
  ).csrfToken as string;
  const isolatedPromotion = await prisma.promotion.create({
    data: {
      name: `I07.1 synthetic ${randomBytes(8).toString('hex')}`,
      phases: { create: [{ phase: 'PLANNING' }] },
    },
  });
  const created = await postAs(
    { cookie, csrfToken },
    {
      ...validInput(),
      promotionId: isolatedPromotion.id,
    },
  );
  expect(created.status).toBe(201);
  const { incident } = await created.json();
  await prisma.promotionParticipant.create({
    data: { promotionId: isolatedPromotion.id, userId: user.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: user.id, version: 2 },
  });
  const start = (version: number) =>
    fetch(baseUrl + `/api/incidents/${incident.id}/start`, {
      method: 'POST',
      headers: {
        origin,
        cookie: actorCookie,
        'x-csrf-token': actorCsrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ version }),
    });
  const response = await start(2);
  expect(response.status).toBe(200);
  expect((await response.json()).incident).toMatchObject({
    status: 'IN_PROGRESS',
    version: 3,
  });
  const persisted = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  expect(persisted).toMatchObject({ status: 'IN_PROGRESS', version: 3 });
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
      orderBy: { createdAt: 'asc' },
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        eventType: 'STATUS_CHANGED',
        actorId: user.id,
        changes: { previousStatus: 'OPEN', status: 'IN_PROGRESS' },
      }),
    ]),
  );
  expect((await start(2)).status).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(persisted);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(2);
});

async function startFixture() {
  const promotion = await prisma.promotion.create({
    data: {
      name: `I07.1 isolated ${randomBytes(8).toString('hex')}`,
      phases: { create: { phase: 'PLANNING' } },
    },
  });
  const created = await postAs(
    { cookie, csrfToken },
    {
      ...validInput(),
      promotionId: promotion.id,
    },
  );
  expect(created.status).toBe(201);
  const { incident } = await created.json();
  return { promotion, incident } as {
    promotion: { id: string };
    incident: { id: string; createdById: string };
  };
}

function startAs(
  auth: { cookie: string; csrfToken: string },
  id: string,
  body: unknown,
) {
  return fetch(baseUrl + `/api/incidents/${id}/start`, {
    method: 'POST',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function putSolutionAs(
  auth: { cookie: string; csrfToken: string },
  id: string,
  body: unknown,
) {
  return fetch(baseUrl + `/api/incidents/${id}/solution`, {
    method: 'PUT',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function submitSolutionAs(
  auth: { cookie: string; csrfToken: string },
  id: string,
  body: unknown,
) {
  return fetch(baseUrl + `/api/incidents/${id}/submit-solution`, {
    method: 'POST',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function readySolution() {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: responsible.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  const started = await startAs(responsible, incident.id, { version: 1 });
  expect(started.status).toBe(200);
  const drafted = await putSolutionAs(responsible, incident.id, {
    solution: 'Se reparó y verificó la filtración.',
    version: 2,
  });
  expect(drafted.status).toBe(200);
  return { promotion, responsible, incident };
}

async function freshStartActor(role: 'MANAGER' | 'COLLABORATOR') {
  const password = randomBytes(24).toString('base64url');
  const user = await prisma.user.create({
    data: {
      firstName: 'I07',
      lastName: role,
      email: `i071-${role.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`,
      role,
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  expect(login.status).toBe(200);
  const actorCookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const actorCsrf = (
    await (
      await fetch(baseUrl + '/api/auth/csrf', {
        headers: { cookie: actorCookie },
      })
    ).json()
  ).csrfToken as string;
  return { id: user.id, cookie: actorCookie, csrfToken: actorCsrf };
}

it('distingue 401, 403 y 404 por sesión, rol y ámbito sin alterar estado ni actividad', async () => {
  const { promotion, incident } = await startFixture();
  const manager = await freshStartActor('MANAGER');
  const collaborator = await freshStartActor('COLLABORATOR');
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: incident.createdById },
  });
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  expect(
    (await startAs({ cookie: '', csrfToken: '' }, incident.id, { version: 1 }))
      .status,
  ).toBe(401);
  expect((await startAs(manager, incident.id, { version: 1 })).status).toBe(
    404,
  );
  await prisma.promotionParticipant.createMany({
    data: [manager.id, collaborator.id].map((userId) => ({
      promotionId: promotion.id,
      userId,
    })),
  });
  expect(
    (await startAs(collaborator, incident.id, { version: 1 })).status,
  ).toBe(404);
  await prisma.incident.update({
    where: { id: incident.id },
    data: { createdById: collaborator.id },
  });
  expect(
    (await startAs(collaborator, incident.id, { version: 1 })).status,
  ).toBe(403);
  expect(
    (
      await startAs({ cookie: manager.cookie, csrfToken: '' }, incident.id, {
        version: 1,
      })
    ).status,
  ).toBe(403);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ status: before.status, version: before.version });
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(1);
  expect((await startAs(manager, incident.id, { version: 1 })).status).toBe(
    200,
  );
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
});

it('deniega con 403 la acción visible sin permiso aunque la versión solicitada sea obsoleta', async () => {
  const { promotion, incident } = await startFixture();
  const collaborator = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: collaborator.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      createdById: collaborator.id,
      assignedToId: incident.createdById,
      version: 2,
    },
  });
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  expect(
    (await startAs(collaborator, incident.id, { version: 1 })).status,
  ).toBe(403);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(activities);
  expect(
    (await startAs({ cookie, csrfToken }, incident.id, { version: 1 })).status,
  ).toBe(409);
});

it('saves a solution draft for the assigned participant in an in-progress incident', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: responsible.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  expect((await startAs(responsible, incident.id, { version: 1 })).status).toBe(
    200,
  );

  const response = await putSolutionAs(responsible, incident.id, {
    solution: 'Se ha reparado la fisura.',
    version: 2,
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    incident: {
      id: incident.id,
      status: 'IN_PROGRESS',
      solution: 'Se ha reparado la fisura.',
      version: 3,
    },
  });
});

it('allows an empty draft, clearing prior content and keeping identical saves idempotent', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: responsible.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  await startAs(responsible, incident.id, { version: 1 });

  const first = await putSolutionAs(responsible, incident.id, {
    solution: 'Solución persistida',
    version: 2,
  });
  expect(first.status).toBe(200);
  const firstBody = await first.json();
  expect(Object.keys(firstBody.incident).sort()).toEqual(
    Object.keys(incidentResponseSchema.properties.incident.properties).sort(),
  );
  const before = await prisma.$queryRaw<
    Array<{ solution: string | null; version: number; updatedAt: Date }>
  >`SELECT solution, version, updated_at AS "updatedAt" FROM incidents WHERE id = ${incident.id}::uuid`;
  const activityCount = await prisma.incidentActivity.count({
    where: { incidentId: incident.id },
  });
  expect(activityCount).toBe(3);
  expect(
    await prisma.incidentActivity.findFirstOrThrow({
      where: { incidentId: incident.id, eventType: 'SOLUTION_UPDATED' },
    }),
  ).toMatchObject({
    actorId: responsible.id,
    changes: { previousSolution: null, solution: 'Solución persistida' },
  });
  const idempotent = await putSolutionAs(responsible, incident.id, {
    solution: 'Solución persistida',
    version: 3,
  });
  expect(idempotent.status).toBe(200);
  const idempotentBody = await idempotent.json();
  expect(incidentResponseSchema.properties.incident.additionalProperties).toBe(
    false,
  );
  expect(Object.keys(idempotentBody.incident).sort()).toEqual(
    Object.keys(incidentResponseSchema.properties.incident.properties).sort(),
  );
  expect(idempotentBody).toEqual(firstBody);
  expect(
    await prisma.$queryRaw<
      Array<{ solution: string | null; version: number; updatedAt: Date }>
    >`SELECT solution, version, updated_at AS "updatedAt" FROM incidents WHERE id = ${incident.id}::uuid`,
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(activityCount);

  const cleared = await putSolutionAs(responsible, incident.id, {
    solution: '',
    version: 3,
  });
  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toMatchObject({
    incident: { solution: null, version: 4, status: 'IN_PROGRESS' },
  });
});

it('rejects oversized, stale and unauthorized draft writes without changing persisted state', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  const manager = await freshStartActor('MANAGER');
  await prisma.promotionParticipant.createMany({
    data: [responsible.id, manager.id].map((userId) => ({
      promotionId: promotion.id,
      userId,
    })),
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  await startAs(responsible, incident.id, { version: 1 });
  await putSolutionAs(responsible, incident.id, {
    solution: 'Conservada',
    version: 2,
  });
  const before = await prisma.$queryRaw<
    Array<{
      solution: string | null;
      status: string;
      version: number;
      updatedAt: Date;
    }>
  >`SELECT solution, status, version, updated_at AS "updatedAt" FROM incidents WHERE id = ${incident.id}::uuid`;
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });

  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: 'x'.repeat(5001),
        version: 3,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: 'Sobrescritura obsoleta',
        version: 2,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await putSolutionAs(manager, incident.id, {
        solution: 'Cambio de otro actor',
        version: 3,
      })
    ).status,
  ).toBe(403);
  expect(
    await prisma.$queryRaw<
      Array<{
        solution: string | null;
        status: string;
        version: number;
        updatedAt: Date;
      }>
    >`SELECT solution, status, version, updated_at AS "updatedAt" FROM incidents WHERE id = ${incident.id}::uuid`,
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(activities);
  expect(
    (
      await putSolutionAs(responsible, '00000000-0000-4000-8000-000000000099', {
        solution: 'No visible',
        version: 1,
      })
    ).status,
  ).toBe(404);
});

it('serializes concurrent draft writes with one version winner and one activity', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: responsible.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  await startAs(responsible, incident.id, { version: 1 });
  const responses = await Promise.all([
    putSolutionAs(responsible, incident.id, {
      solution: 'Primera',
      version: 2,
    }),
    putSolutionAs(responsible, incident.id, {
      solution: 'Segunda',
      version: 2,
    }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ status: 'IN_PROGRESS', version: 3 });
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(3);
});

it('rolls back a changed draft and version if its SOLUTION_UPDATED activity fails', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: responsible.id },
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  await startAs(responsible, incident.id, { version: 1 });
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  try {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_i072_draft_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private draft diagnostic'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_i072_draft_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_i072_draft_activity()`,
    );
    const response = await putSolutionAs(responsible, incident.id, {
      solution: 'No debe persistir',
      version: 2,
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic private');
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.findMany({
        where: { incidentId: incident.id },
      }),
    ).toEqual(activities);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reject_i072_draft_activity ON incident_activities',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS reject_i072_draft_activity()',
    );
  }
});

it('submits a non-empty solution atomically to pending validation', async () => {
  const { responsible, incident } = await readySolution();
  const response = await submitSolutionAs(responsible, incident.id, {
    version: 3,
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.incident).toMatchObject({
    id: incident.id,
    status: 'PENDING_VALIDATION',
    solution: 'Se reparó y verificó la filtración.',
    solutionSubmittedById: responsible.id,
    version: 4,
  });
  expect(Date.parse(result.incident.solutionSubmittedAt)).not.toBeNaN();
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
      orderBy: { createdAt: 'asc' },
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        eventType: 'SOLUTION_SUBMITTED',
        actorId: responsible.id,
        changes: {
          previousStatus: 'IN_PROGRESS',
          status: 'PENDING_VALIDATION',
          solution: 'Se reparó y verificó la filtración.',
        },
      }),
    ]),
  );
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(4);
});

it.skipIf(process.env.NEXTRIVA_TEST_ISOLATED_VALIDATOR !== '1')(
  'rejects submission when the only eligible validator is the submitting responsible ADMIN',
  async () => {
    const { promotion, incident } = await startFixture();
    const responsible = { cookie, csrfToken };
    await prisma.incident.update({
      where: { id: incident.id },
      data: { assignedToId: adminActorId },
    });

    expect(
      (await startAs(responsible, incident.id, { version: 1 })).status,
    ).toBe(200);
    expect(
      (
        await putSolutionAs(responsible, incident.id, {
          solution: 'Solución de prueba sin validador independiente',
          version: 2,
        })
      ).status,
    ).toBe(200);

    const otherEligibleValidator = await prisma.user.findFirst({
      where: {
        isActive: true,
        id: { not: adminActorId },
        OR: [
          { role: 'ADMIN' },
          {
            role: 'MANAGER',
            promotionParticipants: { some: { promotionId: promotion.id } },
          },
        ],
      },
      select: { id: true },
    });
    expect(otherEligibleValidator).toBeNull();

    const incidentBefore = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    });
    const activitiesBefore = await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
      orderBy: { createdAt: 'asc' },
    });
    const rejected = await submitSolutionAs(responsible, incident.id, {
      version: incidentBefore.version,
    });

    expect(rejected.status).toBe(409);
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    ).toEqual(incidentBefore);
    expect(
      await prisma.incidentActivity.findMany({
        where: { incidentId: incident.id },
        orderBy: { createdAt: 'asc' },
      }),
    ).toEqual(activitiesBefore);
  },
);

it('rejects empty submission and unauthorized submitter without any mutation', async () => {
  const { promotion, incident } = await startFixture();
  const responsible = await freshStartActor('COLLABORATOR');
  const manager = await freshStartActor('MANAGER');
  await prisma.promotionParticipant.createMany({
    data: [responsible.id, manager.id].map((userId) => ({
      promotionId: promotion.id,
      userId,
    })),
  });
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: responsible.id },
  });
  expect((await startAs(responsible, incident.id, { version: 1 })).status).toBe(
    200,
  );
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  expect(
    (await submitSolutionAs(responsible, incident.id, { version: 2 })).status,
  ).toBe(409);
  expect(
    (await submitSolutionAs(manager, incident.id, { version: 2 })).status,
  ).toBe(403);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(activities);
});

it('blocks draft changes after submission, closure, or promotion archival', async () => {
  const { responsible, incident } = await readySolution();
  const submission = await submitSolutionAs(responsible, incident.id, {
    version: 3,
  });
  expect(submission.status).toBe(200);
  const afterSubmission = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const afterSubmissionActivities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: 'Edición fuera de orden',
        version: 4,
      })
    ).status,
  ).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(afterSubmission);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(afterSubmissionActivities);

  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'CLOSED' },
  });
  const closed = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const closedActivities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: 'Edición de incidencia cerrada',
        version: closed.version,
      })
    ).status,
  ).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(closed);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(closedActivities);

  const {
    promotion: archivedPromotion,
    responsible: archivedResponsible,
    incident: archivedIncident,
  } = await readySolution();
  await prisma.promotion.update({
    where: { id: archivedPromotion.id },
    data: { status: 'ARCHIVED' },
  });
  const archivedBefore = await prisma.incident.findUniqueOrThrow({
    where: { id: archivedIncident.id },
  });
  const archivedActivities = await prisma.incidentActivity.findMany({
    where: { incidentId: archivedIncident.id },
  });
  expect(
    (
      await putSolutionAs(archivedResponsible, archivedIncident.id, {
        solution: 'Edición tras archivar',
        version: archivedBefore.version,
      })
    ).status,
  ).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({
      where: { id: archivedIncident.id },
    }),
  ).toEqual(archivedBefore);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: archivedIncident.id },
    }),
  ).toEqual(archivedActivities);
});

it('rejects submission when the promotion is archived and preserves incident/activity', async () => {
  const { promotion, responsible, incident } = await readySolution();
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  await prisma.promotion.update({
    where: { id: promotion.id },
    data: { status: 'ARCHIVED' },
  });
  const response = await submitSolutionAs(responsible, incident.id, {
    version: 3,
  });
  expect(response.status).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual(activities);
});

it('serializes concurrent solution submissions with one activity and one state change', async () => {
  const { responsible, incident } = await readySolution();
  const responses = await Promise.all([
    submitSolutionAs(responsible, incident.id, { version: 3 }),
    submitSolutionAs(responsible, incident.id, { version: 3 }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  for (const response of responses) {
    if (response.status === 409)
      expect(await response.json()).toMatchObject({
        code: 'INCIDENT_VERSION_CONFLICT',
      });
  }
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ status: 'PENDING_VALIDATION', version: 4 });
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(4);
});

it('returns a version conflict for a stale draft after submission while preserving authorization before conflicts', async () => {
  const { promotion, responsible, incident } = await readySolution();
  expect(
    (await submitSolutionAs(responsible, incident.id, { version: 3 })).status,
  ).toBe(200);
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
    orderBy: { id: 'asc' },
  });
  const stale = await putSolutionAs(responsible, incident.id, {
    solution: 'Intento con versión anterior al envío',
    version: 3,
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({
    code: 'INCIDENT_VERSION_CONFLICT',
  });

  const manager = await freshStartActor('MANAGER');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: manager.id },
  });
  const outsider = await freshStartActor('MANAGER');
  for (const [actor, status] of [
    [manager, 403],
    [outsider, 404],
  ] as const) {
    for (const response of [
      await putSolutionAs(actor, incident.id, {
        solution: 'Cambio no permitido',
        version: 3,
      }),
      await submitSolutionAs(actor, incident.id, { version: 3 }),
    ]) {
      expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty('code');
    }
  }
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
      orderBy: { id: 'asc' },
    }),
  ).toEqual(activities);
});

it('rolls back submission state, version and audit activity when activity insertion fails', async () => {
  const { responsible, incident } = await readySolution();
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  const activities = await prisma.incidentActivity.findMany({
    where: { incidentId: incident.id },
  });
  try {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_i072_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private solution diagnostic'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_i072_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_i072_activity()`,
    );
    const response = await submitSolutionAs(responsible, incident.id, {
      version: 3,
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic private');
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.findMany({
        where: { incidentId: incident.id },
      }),
    ).toEqual(activities);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reject_i072_activity ON incident_activities',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS reject_i072_activity()',
    );
  }
});

it('rechaza entrada inválida, falta de responsable y promoción archivada sin mutaciones', async () => {
  const { promotion, incident } = await startFixture();
  const auth = { cookie, csrfToken };
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  for (const body of [
    {},
    { version: 0 },
    { version: 1.5 },
    { version: 1, status: 'CLOSED' },
    { version: '1' },
  ]) {
    expect((await startAs(auth, incident.id, body)).status).toBe(400);
  }
  expect((await startAs(auth, incident.id, { version: 1 })).status).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(before);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(1);
  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToId: incident.createdById },
  });
  await prisma.promotion.update({
    where: { id: promotion.id },
    data: { status: 'ARCHIVED' },
  });
  const archivedBefore = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  expect((await startAs(auth, incident.id, { version: 1 })).status).toBe(409);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(archivedBefore);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(1);
});

it('serializa inicios concurrentes y revierte estado y versión si falla la actividad', async () => {
  const auth = { cookie, csrfToken };
  const first = await startFixture();
  await prisma.incident.update({
    where: { id: first.incident.id },
    data: { assignedToId: first.incident.createdById },
  });
  const results = await Promise.all([
    startAs(auth, first.incident.id, { version: 1 }),
    startAs(auth, first.incident.id, { version: 1 }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(
    await prisma.incident.findUniqueOrThrow({
      where: { id: first.incident.id },
    }),
  ).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
  expect(
    await prisma.incidentActivity.count({
      where: { incidentId: first.incident.id },
    }),
  ).toBe(2);

  const second = await startFixture();
  await prisma.incident.update({
    where: { id: second.incident.id },
    data: { assignedToId: second.incident.createdById },
  });
  const before = await prisma.incident.findUniqueOrThrow({
    where: { id: second.incident.id },
  });
  try {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_i071_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private state diagnostic'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_i071_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${second.incident.id}'::uuid) EXECUTE FUNCTION reject_i071_activity()`,
    );
    const response = await startAs(auth, second.incident.id, { version: 1 });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic private');
    expect(
      await prisma.incident.findUniqueOrThrow({
        where: { id: second.incident.id },
      }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId: second.incident.id },
      }),
    ).toBe(1);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reject_i071_activity ON incident_activities',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS reject_i071_activity()',
    );
  }
});

function reviewAs(
  auth: { cookie: string; csrfToken: string },
  id: string,
  action: 'approve' | 'reject',
  body: unknown,
) {
  return fetch(baseUrl + `/api/incidents/${id}/${action}-solution`, {
    method: 'POST',
    headers: {
      origin,
      cookie: auth.cookie,
      'x-csrf-token': auth.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
async function pendingReview() {
  const fixture = await readySolution();
  expect(
    (
      await submitSolutionAs(fixture.responsible, fixture.incident.id, {
        version: 3,
      })
    ).status,
  ).toBe(200);
  return fixture;
}
async function reviewSnapshot(id: string) {
  return {
    incident: await prisma.incident.findUniqueOrThrow({ where: { id } }),
    activities: await prisma.incidentActivity.findMany({
      where: { incidentId: id },
      orderBy: { id: 'asc' },
    }),
  };
}
it('I07.3 approves once as an independent global ADMIN and persists closure atomically', async () => {
  const { incident } = await pendingReview();
  const before = await reviewSnapshot(incident.id);
  const response = await reviewAs(
    { cookie, csrfToken },
    incident.id,
    'approve',
    { version: 4 },
  );
  expect(response.status).toBe(200);
  expect((await response.json()).incident).toMatchObject({
    status: 'CLOSED',
    validatedById: adminActorId,
    closedAt: expect.any(String),
    version: 5,
  });
  const after = await reviewSnapshot(incident.id);
  expect(after.incident).toMatchObject({ status: 'CLOSED', version: 5 });
  expect(after.activities).toHaveLength(before.activities.length + 1);
  expect(after.activities).toContainEqual(
    expect.objectContaining({
      actorId: adminActorId,
      eventType: 'STATUS_CHANGED',
      changes: { previousStatus: 'PENDING_VALIDATION', status: 'CLOSED' },
    }),
  );
  const repeated = await reviewAs(
    { cookie, csrfToken },
    incident.id,
    'approve',
    { version: 4 },
  );
  expect(repeated.status).toBe(409);
  expect(await repeated.json()).toMatchObject({
    code: 'INCIDENT_VERSION_CONFLICT',
  });
  expect(await reviewSnapshot(incident.id)).toEqual(after);
});

it('I07.3 rejects atomically preserving an immutable snapshot through empty draft and re-presentation', async () => {
  const { incident, responsible, promotion } = await pendingReview();
  const manager = await freshStartActor('MANAGER');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: manager.id },
  });
  const before = await reviewSnapshot(incident.id);
  const rejected = await reviewAs(manager, incident.id, 'reject', {
    version: 4,
    reason: '  Falta verificar la reparación  ',
  });
  expect(rejected.status).toBe(200);
  expect((await rejected.json()).incident).toMatchObject({
    status: 'IN_PROGRESS',
    solution: before.incident.solution,
    solutionSubmittedById: null,
    solutionSubmittedAt: null,
    validatedById: null,
    closedAt: null,
    version: 5,
  });
  const after = await reviewSnapshot(incident.id);
  const snapshot = after.activities.find(
    (item) => !before.activities.some((previous) => previous.id === item.id),
  )!;
  expect(snapshot).toMatchObject({
    actorId: manager.id,
    eventType: 'STATUS_CHANGED',
    changes: {
      previousStatus: 'PENDING_VALIDATION',
      status: 'IN_PROGRESS',
      solution: before.incident.solution,
      solutionSubmittedById: responsible.id,
      solutionSubmittedAt: before.incident.solutionSubmittedAt!.toISOString(),
      reason: 'Falta verificar la reparación',
    },
  });
  expect(after.activities).toHaveLength(before.activities.length + 1);
  const repeat = await reviewAs(manager, incident.id, 'reject', {
    version: 4,
    reason: 'Falta verificar',
  });
  expect(repeat.status).toBe(409);
  expect(await repeat.json()).toMatchObject({
    code: 'INCIDENT_VERSION_CONFLICT',
  });
  expect(await reviewSnapshot(incident.id)).toEqual(after);
  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: '',
        version: 5,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await putSolutionAs(responsible, incident.id, {
        solution: 'Nueva solución corregida',
        version: 6,
      })
    ).status,
  ).toBe(200);
  expect(
    (await submitSolutionAs(responsible, incident.id, { version: 7 })).status,
  ).toBe(200);
  expect(
    await prisma.incidentActivity.findUniqueOrThrow({
      where: { id: snapshot.id },
    }),
  ).toEqual(snapshot);
});

it.each(['approve', 'reject'] as const)(
  'I07.3 enforces %s identity, role, scope, session and CSRF without mutations',
  async (action) => {
    const { incident, responsible, promotion } = await pendingReview();
    const manager = await freshStartActor('MANAGER');
    const outsider = await freshStartActor('MANAGER');
    await prisma.promotionParticipant.create({
      data: { promotionId: promotion.id, userId: manager.id },
    });
    const body = {
      version: 4,
      ...(action === 'reject' ? { reason: 'Revisión pendiente' } : {}),
    };
    const before = await reviewSnapshot(incident.id);
    for (const [auth, status] of [
      [responsible, 403],
      [outsider, 404],
      [{ cookie: '', csrfToken: '' }, 401],
      [{ cookie, csrfToken: '' }, 403],
    ] as const) {
      expect((await reviewAs(auth, incident.id, action, body)).status).toBe(
        status,
      );
      expect(await reviewSnapshot(incident.id)).toEqual(before);
    }
    // El presentador ADMIN tampoco puede eludir P02; creador y responsable no son la identidad excluida.
    const self = await prisma.incident.update({
      where: { id: incident.id },
      data: { solutionSubmittedById: adminActorId },
    });
    const selfBefore = await reviewSnapshot(incident.id);
    expect(
      (await reviewAs({ cookie, csrfToken }, incident.id, action, body)).status,
    ).toBe(403);
    expect(await reviewSnapshot(incident.id)).toEqual(selfBefore);
    expect(
      (await reviewAs(responsible, incident.id, action, body)).status,
    ).toBe(403);
    expect(await reviewSnapshot(incident.id)).toEqual(selfBefore);
    expect((await reviewAs(manager, incident.id, action, body)).status).toBe(
      200,
    );
    expect(self.createdById).toBe(adminActorId);
    expect(
      (
        await reviewAs(
          manager,
          '00000000-0000-4000-8000-000000000099',
          action,
          body,
        )
      ).status,
    ).toBe(404);
    expect((await reviewAs(manager, 'invalid', action, body)).status).toBe(400);
  },
);
it.each(['approve', 'reject'] as const)(
  'I07.3 rejects invalid %s payloads, archive, order and stale version without mutation',
  async (action) => {
    const { incident, promotion } = await pendingReview();
    const auth = { cookie, csrfToken };
    const before = await reviewSnapshot(incident.id);
    const valid = {
      version: 4,
      ...(action === 'reject' ? { reason: 'Motivo válido' } : {}),
    };
    const invalid = [
      null,
      {},
      { ...valid, version: 0 },
      { ...valid, version: 1.5 },
      { ...valid, version: '4' },
      { ...valid, validatedById: adminActorId },
    ];
    if (action === 'reject')
      invalid.push(
        { version: 4, reason: '' },
        { version: 4, reason: 'abcd' },
        { version: 4, reason: 'a'.repeat(2001) },
      );
    for (const body of invalid) {
      expect((await reviewAs(auth, incident.id, action, body)).status).toBe(
        400,
      );
      expect(await reviewSnapshot(incident.id)).toEqual(before);
    }
    const stale = await reviewAs(auth, incident.id, action, {
      ...valid,
      version: 3,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'INCIDENT_VERSION_CONFLICT',
    });
    expect(await reviewSnapshot(incident.id)).toEqual(before);
    await prisma.promotion.update({
      where: { id: promotion.id },
      data: { status: 'ARCHIVED' },
    });
    expect((await reviewAs(auth, incident.id, action, valid)).status).toBe(409);
    expect(await reviewSnapshot(incident.id)).toEqual(before);
    await prisma.promotion.update({
      where: { id: promotion.id },
      data: { status: 'ACTIVE' },
    });
    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        status: 'IN_PROGRESS',
        solutionSubmittedById: null,
        solutionSubmittedAt: null,
      },
    });
    const wrongOrder = await reviewSnapshot(incident.id);
    expect((await reviewAs(auth, incident.id, action, valid)).status).toBe(409);
    expect(await reviewSnapshot(incident.id)).toEqual(wrongOrder);
  },
);
it.each(['approve', 'reject'] as const)(
  'I07.3 rolls back %s and sanitizes an activity failure',
  async (action) => {
    const { incident } = await pendingReview();
    const before = await reviewSnapshot(incident.id);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_i073_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private validation diagnostic'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER reject_i073_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_i073_activity()`,
      );
      const response = await reviewAs(
        { cookie, csrfToken },
        incident.id,
        action,
        {
          version: 4,
          ...(action === 'reject' ? { reason: 'Motivo válido' } : {}),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('synthetic private');
      expect(await reviewSnapshot(incident.id)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reject_i073_activity ON incident_activities',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_i073_activity()',
      );
    }
  },
);

it.each([
  ['approve', 'approve'],
  ['approve', 'reject'],
  ['reject', 'approve'],
] as const)(
  'I07.3 deterministically serializes %s against concurrent %s using separate PostgreSQL connections',
  async (firstAction, secondAction) => {
    const { incident } = await pendingReview();
    const before = await reviewSnapshot(incident.id);
    type Connection = {
      connect(): Promise<void>;
      end(): Promise<void>;
      query<T = { pid: number }>(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: T[] }>;
    };
    const { Client } = createRequire(import.meta.url)('pg') as {
      Client: new (options: { connectionString: string }) => Connection;
    };
    const blocker = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    const observer = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    await blocker.connect();
    await observer.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    let completed = false;
    async function waiting(excluded = 0) {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const { rows } = await observer.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND pid <> $2",
          [blockerPid, excluded],
        );
        if (rows[0]) return rows[0].pid;
        if (completed)
          throw new Error('La revisión terminó antes de la barrera PostgreSQL');
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error('No se observó la barrera PostgreSQL');
    }
    let blockerPid = 0;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(210021)');
      blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      first = reviewAs({ cookie, csrfToken }, incident.id, firstAction, {
        version: 4,
        ...(firstAction === 'reject' ? { reason: 'Revisar reparación' } : {}),
      }).finally(() => {
        completed = true;
      });
      const firstPid = await waiting();
      second = reviewAs({ cookie, csrfToken }, incident.id, secondAction, {
        version: 4,
        ...(secondAction === 'reject'
          ? { reason: 'Falta comprobar reparación' }
          : {}),
      });
      const secondPid = await waiting(firstPid);
      expect(firstPid).not.toBe(secondPid);
      expect(completed).toBe(false);
      await blocker.query('COMMIT');
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.status)).toEqual([200, 409]);
      expect(await responses[1]!.json()).toMatchObject({
        code: 'INCIDENT_VERSION_CONFLICT',
      });
      const after = await reviewSnapshot(incident.id);
      expect(after.incident).toMatchObject({
        status: firstAction === 'approve' ? 'CLOSED' : 'IN_PROGRESS',
        version: before.incident.version + 1,
        validatedById: firstAction === 'approve' ? adminActorId : null,
      });
      expect(after.activities).toHaveLength(before.activities.length + 1);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled([first, second]);
      await blocker.end();
      await observer.end();
    }
  },
);

it('I07.3 participant withdrawal immediately revokes review scope without changing incident or activities', async () => {
  const { incident, promotion } = await pendingReview();
  const manager = await freshStartActor('MANAGER');
  await prisma.promotionParticipant.create({
    data: { promotionId: promotion.id, userId: manager.id },
  });
  expect(
    (
      await fetch(baseUrl + `/api/incidents/${incident.id}`, {
        headers: { cookie: manager.cookie },
      })
    ).status,
  ).toBe(200);
  await prisma.promotionParticipant.delete({
    where: {
      promotionId_userId: { promotionId: promotion.id, userId: manager.id },
    },
  });
  const before = await reviewSnapshot(incident.id);
  for (const action of ['approve', 'reject'] as const) {
    expect(
      (
        await reviewAs(manager, incident.id, action, {
          version: 4,
          ...(action === 'reject' ? { reason: 'Motivo válido' } : {}),
        })
      ).status,
    ).toBe(404);
    expect(await reviewSnapshot(incident.id)).toEqual(before);
  }
});
it('I07.3 PostgreSQL enforces validator FK, paired closure fields and independent closure metadata', async () => {
  const { incident } = await pendingReview();
  const before = await reviewSnapshot(incident.id);
  for (const data of [
    { validatedById: adminActorId },
    { closedAt: new Date() },
    {
      validatedById: before.incident.solutionSubmittedById,
      closedAt: new Date(),
      status: 'CLOSED' as const,
    },
    { validatedById: adminActorId, closedAt: new Date() },
  ]) {
    await expect(
      prisma.incident.update({ where: { id: incident.id }, data }),
    ).rejects.toThrow();
    expect(await reviewSnapshot(incident.id)).toEqual(before);
  }
  await expect(
    prisma.incident.update({
      where: { id: incident.id },
      data: {
        status: 'CLOSED',
        validatedById: '00000000-0000-4000-8000-000000000099',
        closedAt: new Date(),
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  expect(await reviewSnapshot(incident.id)).toEqual(before);
});

it('I07.3 publishes exact guarded review request bodies and closure response fields in OpenAPI', () => {
  const paths = createOpenApiDocument(app).paths;
  for (const [action, required] of [
    ['approve', ['version']],
    ['reject', ['version', 'reason']],
  ] as const) {
    const operation = paths[`/api/incidents/{id}/${action}-solution`]?.post;
    expect(operation?.security).toBeDefined();
    for (const status of ['200', '400', '401', '403', '404', '409', '503'])
      expect(operation?.responses[status]).toBeDefined();
    const body = operation?.requestBody;
    expect(
      body && 'content' in body
        ? body.content['application/json']?.schema
        : undefined,
    ).toMatchObject({ additionalProperties: false, required: [...required] });
  }
  expect(incidentResponseSchema.properties.incident.required).toEqual(
    expect.arrayContaining(['validatedById', 'closedAt']),
  );
});

it('I07.3 rejects four Unicode characters and accepts 2000 without partial mutation or truncation', async () => {
  const { incident } = await pendingReview();
  const before = await reviewSnapshot(incident.id);
  expect(
    (
      await reviewAs({ cookie, csrfToken }, incident.id, 'reject', {
        version: 4,
        reason: '😀'.repeat(4),
      })
    ).status,
  ).toBe(400);
  expect(await reviewSnapshot(incident.id)).toEqual(before);
  const reason = '😀'.repeat(2000);
  const response = await reviewAs(
    { cookie, csrfToken },
    incident.id,
    'reject',
    { version: 4, reason },
  );
  expect(response.status).toBe(200);
  const after = await reviewSnapshot(incident.id);
  const added = after.activities.filter(
    (item) => !before.activities.some((previous) => previous.id === item.id),
  );
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    eventType: 'STATUS_CHANGED',
    actorId: adminActorId,
    changes: {
      previousStatus: 'PENDING_VALIDATION',
      status: 'IN_PROGRESS',
      reason,
    },
  });
});

it('I08.2 filters and paginates authorized incidents before returning items and totals', async () => {
  const manager = await freshStartActor('MANAGER');
  const collaborator = await freshStartActor('COLLABORATOR');
  const suffix = randomBytes(6).toString('hex');
  const linkedPromotion = await prisma.promotion.create({
    data: { name: `I08.2 linked ${suffix}`, status: 'ARCHIVED' },
  });
  const outsidePromotion = await prisma.promotion.create({
    data: { name: `I08.2 outside ${suffix}`, status: 'ARCHIVED' },
  });
  await prisma.promotionParticipant.createMany({
    data: [
      { promotionId: linkedPromotion.id, userId: manager.id },
      { promotionId: linkedPromotion.id, userId: collaborator.id },
    ],
  });
  const timestamp = new Date('2026-02-03T04:05:06.000Z');
  const shared = {
    originPhase: 'PLANNING' as const,
    description: `Descripción de fixture ${suffix}`,
    category: 'STRUCTURE' as const,
    priority: 'HIGH' as const,
    status: 'OPEN' as const,
    createdAt: timestamp,
  };
  const matching = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: linkedPromotion.id,
      createdById: collaborator.id,
      assignedToId: collaborator.id,
      title: `Reparación de Fachada ${suffix}`,
    },
  });
  const matchingButNotOwn = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: linkedPromotion.id,
      createdById: adminActorId,
      title: `Seguimiento de fachada ${suffix}`,
    },
  });
  const descriptionOnly = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: linkedPromotion.id,
      createdById: adminActorId,
      title: `Incidencia independiente ${suffix}`,
      description: `fachada ${suffix} aparece solo en descripción`,
    },
  });
  const outside = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: outsidePromotion.id,
      createdById: collaborator.id,
      title: `Fachada privada ${suffix}`,
    },
  });
  const percentTitle = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: linkedPromotion.id,
      createdById: adminActorId,
      title: `Tasa 100% ${suffix}`,
    },
  });
  const underscoreTitle = await prisma.incident.create({
    data: {
      ...shared,
      promotionId: linkedPromotion.id,
      createdById: adminActorId,
      title: `Referencia A_B ${suffix}`,
    },
  });
  const fixtureIds = [
    matching.id,
    matchingButNotOwn.id,
    descriptionOnly.id,
    outside.id,
    percentTitle.id,
    underscoreTitle.id,
  ];
  const persistedBefore = await prisma.incident.findMany({
    where: { id: { in: fixtureIds } },
    orderBy: { id: 'asc' },
  });
  const activityCountBefore = await prisma.incidentActivity.count({
    where: { incidentId: { in: fixtureIds } },
  });
  type Page = {
    items: Array<{
      id: string;
      title: string;
      publicCode: string;
      createdAt: string;
    }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  async function listAs(
    authCookie: string,
    query: Record<string, string> = {},
  ) {
    const url = new URL('/api/incidents', baseUrl);
    url.search = new URLSearchParams(query).toString();
    return fetch(url, { headers: { cookie: authCookie } });
  }

  const substringSearch = await listAs(manager.cookie, {
    q: `  fAcHaDa ${suffix}  `,
    promotionId: linkedPromotion.id,
  });
  expect(substringSearch.status).toBe(200);
  const substringPage = (await substringSearch.json()) as Page;
  expect(substringPage).toMatchObject({
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  });
  expect(substringPage.items.map(({ id }) => id)).toEqual(
    expect.arrayContaining([matching.id, matchingButNotOwn.id]),
  );
  expect(substringPage.items.some(({ id }) => id === outside.id)).toBe(false);

  for (const [literal, expectedId] of [
    ['%', percentTitle.id],
    ['_', underscoreTitle.id],
  ] as const) {
    const literalSearch = await listAs(manager.cookie, {
      q: literal,
      promotionId: linkedPromotion.id,
    });
    expect(literalSearch.status).toBe(200);
    const literalPage = (await literalSearch.json()) as Page;
    expect(literalPage.total).toBe(1);
    expect(literalPage.items.map(({ id }) => id)).toEqual([expectedId]);
  }

  const codeSearch = await listAs(cookie, {
    q: matching.publicCode.slice(0, -2).toLowerCase(),
    pageSize: '100',
  });
  expect(codeSearch.status).toBe(200);
  expect(
    ((await codeSearch.json()) as Page).items.map(({ id }) => id),
  ).toContain(matching.id);

  const combinedFilters = await listAs(manager.cookie, {
    q: `fachada ${suffix}`,
    promotionId: linkedPromotion.id,
    status: 'OPEN',
    priority: 'HIGH',
    category: 'STRUCTURE',
    assignedToId: collaborator.id,
  });
  expect(combinedFilters.status).toBe(200);
  expect(
    ((await combinedFilters.json()) as Page).items.map(({ id }) => id),
  ).toEqual([matching.id]);

  const collaboratorPage = await listAs(collaborator.cookie, {
    q: `fachada ${suffix}`,
    promotionId: linkedPromotion.id,
  });
  expect(collaboratorPage.status).toBe(200);
  expect(
    ((await collaboratorPage.json()) as Page).items.map(({ id }) => id),
  ).toEqual([matching.id]);

  const foreignFilter = await listAs(manager.cookie, {
    q: `fachada ${suffix}`,
    promotionId: outsidePromotion.id,
  });
  expect(foreignFilter.status).toBe(200);
  expect(await foreignFilter.json()).toMatchObject({ items: [], total: 0 });

  const pagedQuery = { q: `fachada ${suffix}`, pageSize: '1' };
  const firstPageResponse = await listAs(cookie, pagedQuery);
  expect(firstPageResponse.status).toBe(200);
  const firstPage = (await firstPageResponse.json()) as Page;
  const secondPageResponse = await listAs(cookie, {
    ...pagedQuery,
    page: '2',
  });
  expect(secondPageResponse.status).toBe(200);
  const secondPage = (await secondPageResponse.json()) as Page;
  expect(firstPage).toMatchObject({
    page: 1,
    pageSize: 1,
    total: 2,
    totalPages: 2,
  });
  expect(secondPage).toMatchObject({
    page: 2,
    pageSize: 1,
    total: 2,
    totalPages: 2,
  });
  expect(firstPage.items).toHaveLength(1);
  expect(secondPage.items).toHaveLength(1);
  expect(firstPage.items[0]!.createdAt).toBe(secondPage.items[0]!.createdAt);
  expect(
    firstPage.items[0]!.id.localeCompare(secondPage.items[0]!.id),
  ).toBeGreaterThan(0);

  const beyondLastPage = await listAs(cookie, {
    ...pagedQuery,
    page: '99',
  });
  expect(beyondLastPage.status).toBe(200);
  expect(await beyondLastPage.json()).toMatchObject({
    items: [],
    page: 99,
    pageSize: 1,
    total: 2,
    totalPages: 2,
  });

  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'not-a-number' },
    { pageSize: '0' },
    { pageSize: '101' },
    { pageSize: '1.5' },
    { status: 'UNKNOWN' },
    { priority: 'URGENT' },
    { category: 'UNKNOWN' },
    { promotionId: 'not-a-uuid' },
    { assignedToId: 'not-a-uuid' },
    { q: 'x'.repeat(151) },
    { sort: 'createdAt' },
  ]) {
    expect((await listAs(cookie, query)).status).toBe(400);
  }

  const descriptionSearch = await listAs(cookie, { q: `fachada ${suffix}` });
  expect(descriptionSearch.status).toBe(200);
  expect(
    ((await descriptionSearch.json()) as Page).items.map(({ id }) => id),
  ).not.toContain(descriptionOnly.id);
  expect(
    await prisma.incident.findMany({
      where: { id: { in: fixtureIds } },
      orderBy: { id: 'asc' },
    }),
  ).toEqual(persistedBefore);
  expect(
    await prisma.incidentActivity.count({
      where: { incidentId: { in: fixtureIds } },
    }),
  ).toBe(activityCountBefore);
});

it('I08.2 publishes the allowlisted filter query and paginated response in OpenAPI', () => {
  const operation = JSON.parse(
    JSON.stringify(createOpenApiDocument(app).paths['/api/incidents']?.get),
  ) as {
    parameters: Array<{
      name: string;
      in: string;
      description?: string;
      schema: Record<string, unknown>;
    }>;
    responses: Record<string, { content?: Record<string, unknown> }>;
  };
  expect(operation.parameters.map(({ name }) => name).sort()).toEqual(
    [
      'assignedToId',
      'category',
      'page',
      'pageSize',
      'priority',
      'promotionId',
      'q',
      'sortBy',
      'sortDirection',
      'status',
    ].sort(),
  );
  expect(
    operation.parameters.find(({ name }) => name === 'q')?.schema,
  ).toMatchObject({
    type: 'string',
    maxLength: 150,
  });
  expect(
    operation.parameters.find(({ name }) => name === 'pageSize')?.schema,
  ).toMatchObject({
    type: 'integer',
    minimum: 1,
    maximum: 100,
  });
  expect(
    operation.parameters.find(({ name }) => name === 'sortBy')?.schema,
  ).toMatchObject({
    type: 'string',
    enum: ['priority', 'status', 'createdAt'],
  });
  expect(
    operation.parameters.find(({ name }) => name === 'sortDirection')?.schema,
  ).toMatchObject({
    type: 'string',
    enum: ['asc', 'desc'],
  });
  expect(
    operation.parameters.find(({ name }) => name === 'sortBy')?.description,
  ).toContain('usa desc');
  expect(
    operation.parameters.find(({ name }) => name === 'sortDirection')
      ?.description,
  ).toContain('requiere sortBy');
  expect(
    operation.responses['200']?.content?.['application/json'],
  ).toMatchObject({
    schema: {
      required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
    },
  });
});

it('Issue 105 orders priority before pagination with deterministic date and UUID ties', async () => {
  const promotion = await prisma.promotion.create({
    data: {
      name: 'Issue 105 priority fixture',
      phases: { create: [{ phase: 'PLANNING' }] },
    },
  });
  const date = new Date('2026-01-01T00:00:00Z');
  const fixtures = [];
  for (const [priority, createdAt] of [
    ['LOW', new Date('2026-03-01')],
    ['MEDIUM', new Date('2026-02-01')],
    ['HIGH', date],
    ['HIGH', date],
  ] as const) {
    fixtures.push(
      await prisma.incident.create({
        data: {
          promotionId: promotion.id,
          createdById: adminActorId,
          originPhase: 'PLANNING',
          title: 'Priority fixture',
          description: 'Deterministic ordering fixture',
          category: 'STRUCTURE',
          priority,
          createdAt,
        },
      }),
    );
  }
  const expected = [fixtures[2]!, fixtures[3]!]
    .sort((a, b) => b.id.localeCompare(a.id))
    .concat([fixtures[1]!, fixtures[0]!]);
  const received = [];
  for (let page = 1; page <= 4; page++) {
    const response = await fetch(
      baseUrl +
        `/api/incidents?promotionId=${promotion.id}&pageSize=1&page=${page}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.total).toBe(4);
    received.push(result.items[0].id);
  }
  expect(received).toEqual(expected.map(({ id }) => id));
});

it('Issue 117 applies semantic sort order in PostgreSQL before pagination', async () => {
  const promotion = await prisma.promotion.create({
    data: {
      name: 'Issue 117 sorting fixture',
      phases: { create: [{ phase: 'PLANNING' }] },
    },
  });
  const definitions = [
    ['OPEN', 'HIGH', '2026-01-01T00:00:00Z'],
    ['IN_PROGRESS', 'LOW', '2026-01-04T00:00:00Z'],
    ['PENDING_VALIDATION', 'MEDIUM', '2026-01-03T00:00:00Z'],
    ['CLOSED', 'HIGH', '2026-01-02T00:00:00Z'],
  ] as const;
  const fixtures = [];
  for (const [status, priority, createdAt] of definitions) {
    fixtures.push(
      await prisma.incident.create({
        data: {
          promotionId: promotion.id,
          createdById: adminActorId,
          originPhase: 'PLANNING',
          title: `Issue 117 ${status}`,
          description: 'Sorting fixture',
          category: 'STRUCTURE',
          status,
          priority,
          createdAt: new Date(createdAt),
        },
      }),
    );
  }
  const expectedBySort = [
    [
      'priority',
      'asc',
      [fixtures[1]!, fixtures[2]!, fixtures[3]!, fixtures[0]!],
    ],
    [
      'priority',
      'desc',
      [fixtures[3]!, fixtures[0]!, fixtures[2]!, fixtures[1]!],
    ],
    ['status', 'asc', [fixtures[0]!, fixtures[1]!, fixtures[2]!, fixtures[3]!]],
    [
      'status',
      'desc',
      [fixtures[3]!, fixtures[2]!, fixtures[1]!, fixtures[0]!],
    ],
    [
      'createdAt',
      'asc',
      [fixtures[0]!, fixtures[3]!, fixtures[2]!, fixtures[1]!],
    ],
    [
      'createdAt',
      'desc',
      [fixtures[1]!, fixtures[2]!, fixtures[3]!, fixtures[0]!],
    ],
  ] as const;

  for (const [sortBy, sortDirection, expected] of expectedBySort) {
    const received = [];
    for (const page of ['1', '2']) {
      const response = await fetch(
        baseUrl +
          `/api/incidents?promotionId=${promotion.id}&pageSize=2&page=${page}&sortBy=${sortBy}&sortDirection=${sortDirection}`,
        { headers: { cookie } },
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.total).toBe(4);
      received.push(...result.items.map((item: { id: string }) => item.id));
    }
    expect(received).toEqual(expected.map(({ id }) => id));
  }
});

it('Issue 105 derives distinct filter assignees only from visible incidents, includes inactive historical assignments and revokes scope', async () => {
  const manager = await freshStartActor('MANAGER');
  const collaborator = await freshStartActor('COLLABORATOR');
  const suffix = randomBytes(6).toString('hex');
  const linked = await prisma.promotion.create({
    data: { name: 'Options linked', status: 'ARCHIVED' },
  });
  const outside = await prisma.promotion.create({
    data: { name: 'Options private', status: 'ARCHIVED' },
  });
  await prisma.promotionParticipant.createMany({
    data: [
      { promotionId: linked.id, userId: manager.id },
      { promotionId: linked.id, userId: collaborator.id },
    ],
  });
  const assignees = [];
  for (const label of ['own', 'other', 'private']) {
    assignees.push(
      await prisma.user.create({
        data: {
          firstName: 'Nombre',
          lastName: 'Homónimo',
          email: `options-${label}-${suffix}@example.test`,
          role: 'COLLABORATOR',
          isActive: false,
          passwordHash: await new PasswordHasher().hash(
            randomBytes(24).toString('base64url'),
          ),
        },
      }),
    );
  }
  const data = {
    originPhase: 'PLANNING' as const,
    title: 'Filter option fixture',
    description: 'Visible and invisible option fixture',
    category: 'STRUCTURE' as const,
    priority: 'LOW' as const,
    status: 'CLOSED' as const,
  };
  for (const [index, owner] of [
    [0, collaborator.id],
    [0, collaborator.id],
    [1, adminActorId],
    [2, collaborator.id],
  ] as const) {
    await prisma.incident.create({
      data: {
        ...data,
        promotionId: index === 2 ? outside.id : linked.id,
        createdById: owner,
        assignedToId: assignees[index]!.id,
      },
    });
  }
  const before = {
    incidents: await prisma.incident.count(),
    activities: await prisma.incidentActivity.count(),
  };
  const read = async (actorCookie: string) => {
    const response = await fetch(baseUrl + '/api/incidents/filter-options', {
      headers: { cookie: actorCookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return (await response.json()).assignees as Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }>;
  };
  const managerOptions = await read(manager.cookie);
  expect(managerOptions).toEqual(
    assignees
      .slice(0, 2)
      .map(({ id, firstName, lastName, email }) => ({
        id,
        firstName,
        lastName,
        email,
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  );
  expect(await read(collaborator.cookie)).toEqual([
    expect.objectContaining({
      id: assignees[0]!.id,
      email: assignees[0]!.email,
    }),
  ]);
  expect((await read(cookie)).map(({ id }) => id)).toEqual(
    expect.arrayContaining(assignees.map(({ id }) => id)),
  );
  const unauthenticated = await fetch(
    baseUrl + '/api/incidents/filter-options',
  );
  expect(unauthenticated.status).toBe(401);
  await prisma.promotionParticipant.delete({
    where: {
      promotionId_userId: { promotionId: linked.id, userId: manager.id },
    },
  });
  expect(await read(manager.cookie)).toEqual([]);
  expect({
    incidents: await prisma.incident.count(),
    activities: await prisma.incidentActivity.count(),
  }).toEqual(before);
});

it('Issue 105 documents the scoped read-only assignee options and fixed priority ordering', () => {
  const document = createOpenApiDocument(app);
  const operation = document.paths['/api/incidents/filter-options']?.get;
  expect(operation?.security).toBeDefined();
  expect(operation?.responses).toHaveProperty('200');
  expect(operation?.responses).toHaveProperty('401');
  const json = JSON.stringify(operation?.responses['200']);
  for (const field of ['id', 'firstName', 'lastName', 'email'])
    expect(json).toContain(`"${field}"`);
  expect(json).not.toContain('passwordHash');
  expect(document.paths['/api/incidents']?.get?.description).toContain(
    'HIGH, MEDIUM, LOW',
  );
});

describe('Issue 119 logical deletion', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    }),
  });
  const origin = 'https://nextriva.example';
  type Actor = { id: string; cookie: string; csrfToken: string };
  const actors = new Map<string, Actor>();
  let app: INestApplication;
  let baseUrl: string;
  let promotionId: string;
  let otherPromotionId: string;

  beforeAll(async () => {
    const hasher = new PasswordHasher();
    const password = randomBytes(24).toString('base64url');
    app = await createApp(undefined, {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    promotionId = (
      await prisma.promotion.create({
        data: {
          name: 'Issue 119 synthetic',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    otherPromotionId = (
      await prisma.promotion.create({
        data: {
          name: 'Issue 119 inaccessible',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
      const user = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: role,
          email: `delete-${role.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`,
          role,
          passwordHash: await hasher.hash(password),
        },
      });
      const login = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
      const csrfToken = (
        await (
          await fetch(baseUrl + '/api/auth/csrf', { headers: { cookie } })
        ).json()
      ).csrfToken as string;
      actors.set(role, { id: user.id, cookie, csrfToken });
      if (role !== 'ADMIN')
        await prisma.promotionParticipant.create({
          data: { promotionId, userId: user.id },
        });
    }
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });
  function actor(role = 'ADMIN') {
    return actors.get(role)!;
  }
  async function create(
    status: IncidentStatus = 'OPEN',
    targetPromotion = promotionId,
  ) {
    return prisma.incident.create({
      data: {
        promotionId: targetPromotion,
        createdById: actor('COLLABORATOR').id,
        assignedToId: actor('COLLABORATOR').id,
        originPhase: 'PLANNING',
        title: 'Issue 119 synthetic incident',
        description: 'Synthetic incident for logical deletion',
        category: 'OTHER',
        priority: 'LOW',
        status,
        ...(status === 'PENDING_VALIDATION'
          ? {
              solution: 'Valid solution',
              solutionSubmittedById: actor('COLLABORATOR').id,
              solutionSubmittedAt: new Date(),
            }
          : {}),
        ...(status === 'CLOSED'
          ? {
              solution: 'Approved solution',
              solutionSubmittedById: actor('COLLABORATOR').id,
              solutionSubmittedAt: new Date(),
              validatedById: actor().id,
              closedAt: new Date(),
            }
          : {}),
      },
    });
  }
  function request(auth: Actor, path: string, method = 'GET', body?: unknown) {
    return fetch(baseUrl + '/api/incidents' + path, {
      method,
      headers: {
        origin,
        cookie: auth.cookie,
        'x-csrf-token': auth.csrfToken,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function remove(
    auth: Actor,
    id: string,
    version = 1,
    reason = '  Retirada sintética justificada  ',
  ) {
    return request(auth, `/${id}/soft-delete`, 'POST', { version, reason });
  }
  async function snapshot(id: string) {
    return {
      incident: await prisma.incident.findUniqueOrThrow({ where: { id } }),
      activities: await prisma.incidentActivity.findMany({
        where: { incidentId: id },
        orderBy: { id: 'asc' },
      }),
      comments: await prisma.incidentComment.findMany({
        where: { incidentId: id },
      }),
    };
  }
  it('Issue 119 atomically marks deletion with server actor/time, preserves state and relationships and records one immutable event', async () => {
    const incident = await create();
    await prisma.incidentComment.create({
      data: {
        incidentId: incident.id,
        authorId: actor().id,
        body: 'Historical comment',
      },
    });
    await prisma.incidentActivity.create({
      data: {
        incidentId: incident.id,
        actorId: actor().id,
        eventType: 'CREATED',
        changes: { originPhase: 'PLANNING' },
      },
    });
    const before = await snapshot(incident.id);
    const response = await remove(actor(), incident.id);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Object.keys(result.incident).sort()).toEqual(
      Object.keys(
        deletedIncidentResponseSchema.properties.incident.properties,
      ).sort(),
    );
    expect(result.incident).toMatchObject({
      id: incident.id,
      deletedById: actor().id,
      deletionReason: 'Retirada sintética justificada',
      status: 'OPEN',
      version: 2,
      deletedAt: expect.any(String),
    });
    const after = await snapshot(incident.id);
    expect(after.incident).toMatchObject({
      createdAt: incident.createdAt,
      status: 'OPEN',
      version: 2,
      deletedById: actor().id,
      deletedAt: expect.any(Date),
    });
    expect(after.comments).toEqual(before.comments);
    expect(after.activities).toHaveLength(before.activities.length + 1);
    expect(after.activities).toEqual(expect.arrayContaining(before.activities));
    expect(
      after.activities.find((activity) => activity.eventType === 'DELETED'),
    ).toMatchObject({
      actorId: actor().id,
      eventType: 'DELETED',
      changes: {
        previousStatus: 'OPEN',
        reason: 'Retirada sintética justificada',
      },
      createdAt: after.incident.deletedAt,
    });
    const frozen = await snapshot(incident.id);
    expect(
      (await remove(actor(), incident.id, 2, 'Otro motivo diferente')).status,
    ).toBe(409);
    expect(await snapshot(incident.id)).toEqual(frozen);
  });
  it('Issue 119 permits linked MANAGER and closed incidents, denies collaborator, unrelated manager, archived and pending without mutation', async () => {
    const closed = await create('CLOSED');
    expect((await remove(actor('MANAGER'), closed.id)).status).toBe(200);
    const ordinary = await create();
    const unrelated = await create('OPEN', otherPromotionId);
    const pending = await create('PENDING_VALIDATION');
    for (const [auth, incident, code] of [
      [actor('COLLABORATOR'), ordinary, 403],
      [actor('MANAGER'), unrelated, 404],
      [actor(), pending, 409],
    ] as const) {
      const before = await snapshot(incident.id);
      expect((await remove(auth, incident.id)).status).toBe(code);
      expect(await snapshot(incident.id)).toEqual(before);
    }
    const archivedPromotion = await prisma.promotion.create({
      data: { name: 'Archived deletion fixture', status: 'ARCHIVED' },
    });
    const archived = await create('OPEN', archivedPromotion.id);
    const before = await snapshot(archived.id);
    expect((await remove(actor(), archived.id)).status).toBe(409);
    expect(await snapshot(archived.id)).toEqual(before);
  });
  it('Issue 119 rejects invalid version/reason, missing CSRF/session and stale version without changes', async () => {
    const incident = await create();
    const before = await snapshot(incident.id);
    for (const body of [
      { version: 1, reason: '' },
      { version: 1, reason: 'abcd' },
      { version: 1, reason: 'a'.repeat(2001) },
      { version: 0, reason: 'valid reason' },
      { version: 1, reason: 'valid reason', deletedById: actor().id },
    ])
      expect(
        (await request(actor(), `/${incident.id}/soft-delete`, 'POST', body))
          .status,
      ).toBe(400);
    expect(
      (await remove({ ...actor(), csrfToken: '' }, incident.id)).status,
    ).toBe(403);
    expect((await remove({ ...actor(), cookie: '' }, incident.id)).status).toBe(
      401,
    );
    expect((await remove(actor(), incident.id, 99)).status).toBe(409);
    expect(await snapshot(incident.id)).toEqual(before);
  });
  it('Issue 119 excludes deleted incidents from lists, totals, options, Home and every operational secondary route', async () => {
    const incident = await create();
    expect((await remove(actor(), incident.id)).status).toBe(200);
    for (const path of [
      `/${incident.id}`,
      `/${incident.id}/eligible-assignees`,
    ])
      expect((await request(actor(), path)).status).toBe(404);
    for (const [path, method, body] of [
      ['comments', 'POST', { body: 'New comment' }],
      ['assignment', 'PATCH', { version: 2, assignedToId: actor().id }],
      ['start', 'POST', { version: 2 }],
      ['solution', 'PUT', { version: 2, solution: 'New solution' }],
      ['submit-solution', 'POST', { version: 2 }],
      ['approve-solution', 'POST', { version: 2 }],
      ['reject-solution', 'POST', { version: 2, reason: 'Invalid proposal' }],
    ] as const) {
      const before = await snapshot(incident.id);
      expect(
        (await request(actor(), `/${incident.id}/${path}`, method, body))
          .status,
      ).toBe(404);
      expect(await snapshot(incident.id)).toEqual(before);
    }
    const list = await (
      await request(actor(), `?q=${incident.publicCode}`)
    ).json();
    expect(list).toMatchObject({ items: [], total: 0, totalPages: 0 });
    const personal = await (
      await request(actor('COLLABORATOR'), '/personal-summary')
    ).json();
    expect(
      personal.priorityItems.some(
        (item: { id: string }) => item.id === incident.id,
      ),
    ).toBe(false);
    const visible = await prisma.incident.count({
      where: {
        assignedToId: actor('COLLABORATOR').id,
        deletedAt: null,
        status: 'OPEN',
        promotion: {
          participants: { some: { userId: actor('COLLABORATOR').id } },
        },
      },
    });
    expect(personal.countsByStatus.OPEN).toBe(visible);
  });
  it('Issue 119 restricts deleted pagination and audit projection to current scope and revokes manager history access on removal', async () => {
    const isolated = await prisma.promotion.create({
      data: {
        name: 'History scope fixture',
        phases: { create: { phase: 'PLANNING' } },
      },
    });
    await prisma.promotionParticipant.create({
      data: { promotionId: isolated.id, userId: actor('MANAGER').id },
    });
    const incident = await create('OPEN', isolated.id);
    expect((await remove(actor(), incident.id)).status).toBe(200);
    const other = await create('OPEN', otherPromotionId);
    expect((await remove(actor(), other.id)).status).toBe(200);
    const query = `/deleted?promotionId=${isolated.id}&page=1&pageSize=1`;
    const history = await (await request(actor('MANAGER'), query)).json();
    expect(history).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      id: incident.id,
      deletionReason: 'Retirada sintética justificada',
      deletedBy: { id: actor().id, firstName: 'Synthetic', lastName: 'ADMIN' },
    });
    expect((await request(actor('COLLABORATOR'), '/deleted')).status).toBe(403);
    await prisma.promotionParticipant.delete({
      where: {
        promotionId_userId: {
          promotionId: isolated.id,
          userId: actor('MANAGER').id,
        },
      },
    });
    expect(await (await request(actor('MANAGER'), query)).json()).toMatchObject(
      { items: [], total: 0 },
    );
    expect((await request(actor(), '/deleted?pageSize=101')).status).toBe(400);
  });

  it('Issue 119 rolls back all deletion markers and version if its own DELETED activity insertion fails', async () => {
    const incident = await create();
    const before = await snapshot(incident.id);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_issue119_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deletion activity failure'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER reject_issue119_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_issue119_activity()`,
      );
      expect((await remove(actor(), incident.id)).status).toBe(503);
      expect(await snapshot(incident.id)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reject_issue119_activity ON incident_activities',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_issue119_activity()',
      );
    }
  });
  it('Issue 119 serializes two PostgreSQL deletion connections at a deterministic barrier with one winner and one event', async () => {
    const incident = await create();
    type Connection = {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: Array<{ pid: number }> }>;
    };
    const { Client } = createRequire(import.meta.url)('pg') as {
      Client: new (options: { connectionString: string }) => Connection;
    };
    const blocker = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    const observer = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    await blocker.connect();
    await observer.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    let completed = false;
    let blockerPid = 0;
    async function waiting(excluded = 0) {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const { rows } = await observer.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND pid <> $2",
          [blockerPid, excluded],
        );
        if (rows[0]) return rows[0].pid;
        if (completed)
          throw new Error('Deletion completed before PostgreSQL barrier');
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error('PostgreSQL deletion barrier not observed');
    }
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(210021)');
      blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      first = remove(actor(), incident.id).finally(() => {
        completed = true;
      });
      const firstPid = await waiting();
      second = remove(actor('MANAGER'), incident.id);
      expect(await waiting(firstPid)).not.toBe(firstPid);
      expect(completed).toBe(false);
      await blocker.query('COMMIT');
      expect(
        (await Promise.all([first, second])).map((response) => response.status),
      ).toEqual([200, 409]);
      const after = await snapshot(incident.id);
      expect(after.incident).toMatchObject({ version: 2, status: 'OPEN' });
      expect(after.activities).toHaveLength(1);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled([first, second]);
      await blocker.end();
      await observer.end();
    }
  });
  it('Issue 119 preserves nonclosed responsibility guards for deactivate, demote and participant withdrawal after deletion', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Guard',
        lastName: 'Synthetic',
        email: `guard-delete-${randomBytes(8).toString('hex')}@example.test`,
        role: 'MANAGER',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({ where: { id: actor().id } })
        ).passwordHash,
      },
    });
    await prisma.promotionParticipant.create({
      data: { promotionId, userId: user.id },
    });
    const incident = await prisma.incident.create({
      data: {
        promotionId,
        createdById: actor().id,
        assignedToId: user.id,
        originPhase: 'PLANNING',
        title: 'Guard after deletion',
        description: 'Responsibility guard synthetic incident',
        category: 'OTHER',
        priority: 'LOW',
      },
    });
    expect((await remove(actor(), incident.id)).status).toBe(200);
    const before = await snapshot(incident.id);
    for (const [path, method, body] of [
      [`/api/users/${user.id}/status`, 'PATCH', { isActive: false }],
      [`/api/users/${user.id}`, 'PATCH', { role: 'COLLABORATOR' }],
      [
        `/api/promotions/${promotionId}/participants/${user.id}`,
        'DELETE',
        undefined,
      ],
    ] as const) {
      const response = await fetch(baseUrl + path, {
        method,
        headers: {
          origin,
          cookie: actor().cookie,
          'x-csrf-token': actor().csrfToken,
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(response.status).toBe(409);
      expect(await snapshot(incident.id)).toEqual(before);
      expect(
        await prisma.user.findUnique({ where: { id: user.id } }),
      ).toMatchObject({ isActive: true, role: 'MANAGER' });
      expect(
        await prisma.promotionParticipant.findUnique({
          where: { promotionId_userId: { promotionId, userId: user.id } },
        }),
      ).not.toBeNull();
    }
  });
  it('Issue 119 enforces marker completeness and a restrictive deleter foreign key without losing rows', async () => {
    const incident = await create();
    const before = await snapshot(incident.id);
    await expect(
      prisma.incident.update({
        where: { id: incident.id },
        data: { deletedAt: new Date() },
      }),
    ).rejects.toThrow();
    expect(await snapshot(incident.id)).toEqual(before);
    await expect(
      prisma.incident.update({
        where: { id: incident.id },
        data: {
          deletedAt: new Date(),
          deletedById: '00000000-0000-4000-8000-000000000099',
          deletionReason: 'Foreign key fixture',
        },
      }),
    ).rejects.toThrow();
    expect(await snapshot(incident.id)).toEqual(before);
  });
  it('Issue 119 excludes unique deleted assignees from filter options and counts only scoped history matching the documented projection', async () => {
    const owner = await prisma.user.create({
      data: {
        firstName: 'Option',
        lastName: 'Synthetic',
        email: `option-delete-${randomBytes(8).toString('hex')}@example.test`,
        role: 'COLLABORATOR',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({ where: { id: actor().id } })
        ).passwordHash,
      },
    });
    const incident = await create();
    await prisma.incident.update({
      where: { id: incident.id },
      data: { assignedToId: owner.id },
    });
    const before = await (await request(actor(), '/filter-options')).json();
    expect(
      before.assignees.some((user: { id: string }) => user.id === owner.id),
    ).toBe(true);
    expect((await remove(actor(), incident.id)).status).toBe(200);
    const after = await (await request(actor(), '/filter-options')).json();
    expect(
      after.assignees.some((user: { id: string }) => user.id === owner.id),
    ).toBe(false);
    const outsideScope = await (
      await request(
        actor('MANAGER'),
        `/deleted?promotionId=${otherPromotionId}`,
      )
    ).json();
    expect(outsideScope).toMatchObject({ items: [], total: 0, totalPages: 0 });
    const history = await (
      await request(actor(), `/deleted?q=${incident.publicCode}`)
    ).json();
    expect(Object.keys(history).sort()).toEqual(
      Object.keys(deletedIncidentListSchema.properties).sort(),
    );
    expect(history.items).toHaveLength(1);
    expect(Object.keys(history.items[0]).sort()).toEqual(
      Object.keys(
        deletedIncidentResponseSchema.properties.incident.properties,
      ).sort(),
    );
    const openapi = createOpenApiDocument(app);
    expect(
      openapi.paths['/api/incidents/{id}/soft-delete']?.post?.responses,
    ).toHaveProperty('200');
    expect(
      openapi.paths['/api/incidents/deleted']?.get?.responses,
    ).toHaveProperty('200');
  });
});

describe('Issue 120 reopen', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    }),
  });
  const origin = 'https://nextriva.example';
  type Actor = { id: string; cookie: string; csrfToken: string };
  const actors = new Map<string, Actor>();
  let app: INestApplication;
  let baseUrl: string;
  let promotionId: string;
  let otherPromotionId: string;

  beforeAll(async () => {
    const hasher = new PasswordHasher();
    const password = randomBytes(24).toString('base64url');
    app = await createApp(undefined, {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    promotionId = (
      await prisma.promotion.create({
        data: {
          name: 'Issue 120 synthetic',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    otherPromotionId = (
      await prisma.promotion.create({
        data: {
          name: 'Issue 120 inaccessible',
          phases: { create: { phase: 'PLANNING' } },
        },
      })
    ).id;
    for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
      const user = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: role,
          email: `delete-${role.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`,
          role,
          passwordHash: await hasher.hash(password),
        },
      });
      const login = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
      const csrfToken = (
        await (
          await fetch(baseUrl + '/api/auth/csrf', { headers: { cookie } })
        ).json()
      ).csrfToken as string;
      actors.set(role, { id: user.id, cookie, csrfToken });
      if (role !== 'ADMIN')
        await prisma.promotionParticipant.create({
          data: { promotionId, userId: user.id },
        });
    }
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });
  function actor(role = 'ADMIN') {
    return actors.get(role)!;
  }
  async function create(
    status: IncidentStatus = 'OPEN',
    targetPromotion = promotionId,
  ) {
    return prisma.incident.create({
      data: {
        promotionId: targetPromotion,
        createdById: actor('COLLABORATOR').id,
        assignedToId: actor('COLLABORATOR').id,
        originPhase: 'PLANNING',
        title: 'Issue 120 synthetic incident',
        description: 'Synthetic incident for logical deletion',
        category: 'OTHER',
        priority: 'LOW',
        status,
        ...(status === 'PENDING_VALIDATION'
          ? {
              solution: 'Valid solution',
              solutionSubmittedById: actor('COLLABORATOR').id,
              solutionSubmittedAt: new Date(),
            }
          : {}),
        ...(status === 'CLOSED'
          ? {
              solution: 'Approved solution',
              solutionSubmittedById: actor('COLLABORATOR').id,
              solutionSubmittedAt: new Date(),
              validatedById: actor().id,
              closedAt: new Date(),
            }
          : {}),
      },
    });
  }
  function request(auth: Actor, path: string, method = 'GET', body?: unknown) {
    const endpoint = new URL('/api/incidents' + path, baseUrl);
    return fetch(endpoint, {
      method,
      headers: {
        origin,
        cookie: auth.cookie,
        'x-csrf-token': auth.csrfToken,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function remove(
    auth: Actor,
    id: string,
    version = 1,
    reason = '  Retirada sintética justificada  ',
  ) {
    return request(auth, `/${id}/soft-delete`, 'POST', { version, reason });
  }
  async function snapshot(id: string) {
    return {
      incident: await prisma.incident.findUniqueOrThrow({ where: { id } }),
      activities: await prisma.incidentActivity.findMany({
        where: { incidentId: id },
        orderBy: { id: 'asc' },
      }),
      comments: await prisma.incidentComment.findMany({
        where: { incidentId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    };
  }

  function reopen(auth: Actor, id: string, body: unknown) {
    return request(auth, `/${id}/reopen`, 'POST', body);
  }
  function input(version = 1) {
    return {
      version,
      reason: '  Revisión adicional necesaria  ',
      assignedToId: actor('COLLABORATOR').id,
    };
  }
  it('Issue 120 reopens atomically and preserves an exact immutable approved-cycle snapshot', async () => {
    const incident = await create('CLOSED');
    const response = await reopen(actor(), incident.id, input());
    expect(response.status).toBe(200);
    const after = await snapshot(incident.id);
    expect(after.incident).toMatchObject({
      status: 'IN_PROGRESS',
      version: 2,
      assignedToId: input().assignedToId,
      solution: null,
      solutionSubmittedById: null,
      solutionSubmittedAt: null,
      validatedById: null,
      closedAt: null,
      createdAt: incident.createdAt,
    });
    expect(after.activities).toHaveLength(1);
    expect(after.activities[0]).toMatchObject({
      actorId: actor().id,
      eventType: 'STATUS_CHANGED',
      changes: {
        snapshotVersion: 1,
        previousStatus: 'CLOSED',
        status: 'IN_PROGRESS',
        reason: input().reason.trim(),
        previousAssignedToId: incident.assignedToId,
        assignedToId: input().assignedToId,
        approvedCycle: {
          solution: incident.solution,
          solutionSubmittedById: incident.solutionSubmittedById,
          solutionSubmittedAt: incident.solutionSubmittedAt!.toISOString(),
          validatedById: incident.validatedById,
          closedAt: incident.closedAt!.toISOString(),
        },
      },
    });
    const historical = after.activities;
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/solution`,
          'PUT',
          { version: 2, solution: 'Nueva revisión' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/solution`,
          'PUT',
          { version: 3, solution: '' },
        )
      ).status,
    ).toBe(200);
    expect(
      (await snapshot(incident.id)).activities.filter(
        (a) => a.eventType === 'STATUS_CHANGED',
      ),
    ).toEqual(historical);
  });
  it('Issue 120 offers eligible assignees for reopening a visible closed incident', async () => {
    const incident = await create('CLOSED');
    const response = await request(
      actor(),
      `/${incident.id}/eligible-assignees`,
    );
    expect(response.status).toBe(200);
    const { users } = await response.json();
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: actor('COLLABORATOR').id }),
        expect.objectContaining({ id: actor().id }),
      ]),
    );
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/eligible-assignees`,
        )
      ).status,
    ).toBe(403);
  });

  it('Issue 120 enforces roles, visibility and immediate membership revocation without mutations', async () => {
    const permitted = await create('CLOSED');
    expect((await reopen(actor('MANAGER'), permitted.id, input())).status).toBe(
      200,
    );
    const forbidden = await create('CLOSED');
    const before = await snapshot(forbidden.id);
    expect(
      (await reopen(actor('COLLABORATOR'), forbidden.id, input())).status,
    ).toBe(403);
    expect(await snapshot(forbidden.id)).toEqual(before);
    const privateIncident = await create('CLOSED', otherPromotionId);
    const privateBefore = await snapshot(privateIncident.id);
    expect(
      (await reopen(actor('MANAGER'), privateIncident.id, input())).status,
    ).toBe(404);
    expect(await snapshot(privateIncident.id)).toEqual(privateBefore);
    const isolated = await prisma.promotion.create({
      data: {
        name: 'Issue120 revocation',
        phases: { create: { phase: 'PLANNING' } },
        participants: { create: { userId: actor('MANAGER').id } },
      },
    });
    const revoked = await create('CLOSED', isolated.id);
    await prisma.promotionParticipant.delete({
      where: {
        promotionId_userId: {
          promotionId: isolated.id,
          userId: actor('MANAGER').id,
        },
      },
    });
    const revokedBefore = await snapshot(revoked.id);
    expect(
      (
        await reopen(actor('MANAGER'), revoked.id, {
          ...input(),
          assignedToId: actor().id,
        })
      ).status,
    ).toBe(404);
    expect(await snapshot(revoked.id)).toEqual(revokedBefore);
  });

  it.each([
    {},
    { version: 1, reason: 'Valid reason' },
    { version: 0 },
    { version: 1.5 },
    { reason: '    ' },
    { reason: 'abcd' },
    { reason: '😀'.repeat(2001) },
    { assignedToId: null },
    { assignedToId: 'invalid' },
    { assignedToId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    { extra: 'server field' },
  ])(
    'Issue 120 rejects invalid reopen input %# without writes',
    async (change) => {
      const incident = await create('CLOSED');
      const before = await snapshot(incident.id);
      let body: unknown = { ...input(), ...change };
      if (Object.keys(change).length === 0) body = {};
      else if ('reason' in change && Object.keys(change).length === 2)
        body = change;
      expect((await reopen(actor(), incident.id, body)).status).toBe(400);
      expect(await snapshot(incident.id)).toEqual(before);
    },
  );

  it('Issue 120 accepts Unicode reason boundaries and an active global ADMIN as explicit new assignee', async () => {
    const incident = await create('CLOSED');
    expect(
      (
        await reopen(actor(), incident.id, {
          ...input(),
          assignedToId: actor().id,
          reason: `  ${'😀'.repeat(2000)}  `,
        })
      ).status,
    ).toBe(200);
    expect((await snapshot(incident.id)).incident.assignedToId).toBe(
      actor().id,
    );
  });

  it('Issue 120 rejects inactive or unlinked assignees and permits replacing a former ineligible responsible', async () => {
    const target = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Former responsible',
        email: `reopen-target-${randomBytes(8).toString('hex')}@example.test`,
        role: 'COLLABORATOR',
        isActive: false,
        passwordHash: 'synthetic unusable hash',
      },
    });
    const incident = await create('CLOSED');
    await prisma.incident.update({
      where: { id: incident.id },
      data: { assignedToId: target.id },
    });
    const before = await snapshot(incident.id);
    expect(
      (
        await reopen(actor(), incident.id, {
          ...input(),
          assignedToId: target.id,
        })
      ).status,
    ).toBe(400);
    expect(await snapshot(incident.id)).toEqual(before);
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: true },
    });
    expect(
      (
        await reopen(actor(), incident.id, {
          ...input(),
          assignedToId: target.id,
        })
      ).status,
    ).toBe(400);
    expect(await snapshot(incident.id)).toEqual(before);
    expect((await reopen(actor(), incident.id, input())).status).toBe(200);
    expect((await snapshot(incident.id)).activities[0]?.changes).toMatchObject({
      previousAssignedToId: target.id,
    });
  });

  it.each(['OPEN', 'IN_PROGRESS', 'PENDING_VALIDATION'] as const)(
    'Issue 120 rejects wrong state %s without mutation',
    async (status) => {
      const incident = await create(status);
      const before = await snapshot(incident.id);
      expect((await reopen(actor(), incident.id, input())).status).toBe(409);
      expect(await snapshot(incident.id)).toEqual(before);
    },
  );

  it('Issue 120 rejects archived, deleted and legacy incomplete closures without fabricating history', async () => {
    const archived = await prisma.promotion.create({
      data: {
        name: 'Issue120 archived',
        status: 'ARCHIVED',
        phases: { create: { phase: 'PLANNING' } },
      },
    });
    const incident = await create('CLOSED', archived.id);
    const before = await snapshot(incident.id);
    expect((await reopen(actor(), incident.id, input())).status).toBe(409);
    expect(await snapshot(incident.id)).toEqual(before);
    const deleted = await create('CLOSED');
    expect((await remove(actor(), deleted.id)).status).toBe(200);
    const deletedBefore = await snapshot(deleted.id);
    expect((await reopen(actor(), deleted.id, input(2))).status).toBe(404);
    expect(await snapshot(deleted.id)).toEqual(deletedBefore);
    const legacy = await create('CLOSED');
    await prisma.incident.update({
      where: { id: legacy.id },
      data: {
        solution: null,
        solutionSubmittedAt: null,
        solutionSubmittedById: null,
        validatedById: null,
        closedAt: null,
      },
    });
    const legacyBefore = await snapshot(legacy.id);
    expect((await reopen(actor(), legacy.id, input())).status).toBe(409);
    expect(await snapshot(legacy.id)).toEqual(legacyBefore);
  });

  it('Issue 120 rejects stale versions, repeated calls, missing sessions and CSRF without extra activity', async () => {
    const incident = await create('CLOSED');
    const before = await snapshot(incident.id);
    expect((await reopen(actor(), incident.id, input(2))).status).toBe(409);
    expect(
      (await reopen({ ...actor(), cookie: '' }, incident.id, input())).status,
    ).toBe(401);
    expect(
      (await reopen({ ...actor(), csrfToken: 'invalid' }, incident.id, input()))
        .status,
    ).toBe(403);
    expect(await snapshot(incident.id)).toEqual(before);
    expect((await reopen(actor(), incident.id, input())).status).toBe(200);
    const changed = await snapshot(incident.id);
    expect((await reopen(actor(), incident.id, input())).status).toBe(409);
    expect((await reopen(actor(), incident.id, input(2))).status).toBe(409);
    expect(await snapshot(incident.id)).toEqual(changed);
  });

  it('Issue 120 rolls back the entire reopen if its own activity cannot be inserted', async () => {
    const incident = await create('CLOSED');
    const before = await snapshot(incident.id);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_issue120_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic reopen activity failure'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER reject_issue120_activity BEFORE INSERT ON incident_activities FOR EACH ROW WHEN (NEW.incident_id = '${incident.id}'::uuid) EXECUTE FUNCTION reject_issue120_activity()`,
      );
      const response = await reopen(actor(), incident.id, input());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(
        'synthetic reopen activity failure',
      );
      expect(await snapshot(incident.id)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reject_issue120_activity ON incident_activities',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_issue120_activity()',
      );
    }
  });

  it('Issue 120 requires a new independent validation and preserves each approved cycle through repeated reopening', async () => {
    const incident = await create('CLOSED');
    expect((await reopen(actor(), incident.id, input())).status).toBe(200);
    const initial = (await snapshot(incident.id)).activities[0];
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/submit-solution`,
          'POST',
          { version: 2 },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/solution`,
          'PUT',
          { version: 2, solution: 'Segunda solución documentada' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/submit-solution`,
          'POST',
          { version: 3 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          actor('COLLABORATOR'),
          `/${incident.id}/approve-solution`,
          'POST',
          { version: 4 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          actor('MANAGER'),
          `/${incident.id}/approve-solution`,
          'POST',
          { version: 4 },
        )
      ).status,
    ).toBe(200);
    expect((await reopen(actor(), incident.id, input(5))).status).toBe(200);
    const after = await snapshot(incident.id);
    const cycles = after.activities.filter(
      (a) =>
        a.eventType === 'STATUS_CHANGED' &&
        typeof a.changes === 'object' &&
        a.changes !== null &&
        'snapshotVersion' in a.changes,
    );
    expect(cycles).toHaveLength(2);
    expect(cycles).toContainEqual(initial);
    expect(cycles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changes: expect.objectContaining({
            approvedCycle: expect.objectContaining({
              solution: 'Segunda solución documentada',
            }),
          }),
        }),
      ]),
    );
    expect(after.incident).toMatchObject({
      version: 6,
      solution: null,
      status: 'IN_PROGRESS',
    });
  });
  it('Issue 120 serializes two PostgreSQL reopening connections at a deterministic barrier with one winner and one event', async () => {
    const incident = await create('CLOSED');
    type Connection = {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: Array<{ pid: number }> }>;
    };
    const { Client } = createRequire(import.meta.url)('pg') as {
      Client: new (options: { connectionString: string }) => Connection;
    };
    const blocker = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    const observer = new Client({
      connectionString: getTemporaryMigrationDatabaseUrl(),
    });
    await blocker.connect();
    await observer.connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    let completed = false;
    let blockerPid = 0;
    async function waiting(excluded = 0) {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const { rows } = await observer.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND pid <> $2",
          [blockerPid, excluded],
        );
        if (rows[0]) return rows[0].pid;
        if (completed)
          throw new Error('Reopen completed before PostgreSQL barrier');
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error('PostgreSQL reopen barrier not observed');
    }
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(210021)');
      blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      first = reopen(actor(), incident.id, input()).finally(() => {
        completed = true;
      });
      const firstPid = await waiting();
      second = reopen(actor('MANAGER'), incident.id, input());
      expect(await waiting(firstPid)).not.toBe(firstPid);
      expect(completed).toBe(false);
      await blocker.query('COMMIT');
      expect(
        (await Promise.all([first, second])).map((response) => response.status),
      ).toEqual([200, 409]);
      const after = await snapshot(incident.id);
      expect(after.incident).toMatchObject({
        version: 2,
        status: 'IN_PROGRESS',
      });
      expect(after.activities).toHaveLength(1);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled([first, second]);
      await blocker.end();
      await observer.end();
    }
  });
  it('Issue 120 keeps the real HTTP response, strict OpenAPI body and snapshot keys coherent', async () => {
    const incident = await create('CLOSED');
    const response = await reopen(actor(), incident.id, input());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload.incident).sort()).toEqual(
      Object.keys(incidentResponseSchema.properties.incident.properties).sort(),
    );
    const openapi = createOpenApiDocument(app);
    const operation = openapi.paths['/api/incidents/{id}/reopen']?.post;
    expect(operation?.security).toBeDefined();
    for (const status of ['200', '400', '401', '403', '404', '409', '503'])
      expect(operation?.responses).toHaveProperty(status);
    expect(JSON.stringify(operation?.requestBody)).toContain('assignedToId');
    expect(reopenInputSchema.required).toEqual([
      'version',
      'reason',
      'assignedToId',
    ]);
    expect(reopenInputSchema.additionalProperties).toBe(false);
    const detail = await (await request(actor(), `/${incident.id}`)).json();
    const activity = detail.incident.activities[0];
    const variants =
      incidentDetailSchema.properties.incident.properties.activities.items
        .oneOf;
    const serialized = variants.map((value) => JSON.stringify(value));
    expect(
      serialized.some(
        (value) =>
          value.includes('snapshotVersion') && value.includes('approvedCycle'),
      ),
    ).toBe(true);
    expect(activity.changes).toMatchObject({
      snapshotVersion: 1,
      previousStatus: 'CLOSED',
      status: 'IN_PROGRESS',
      approvedCycle: {
        solution: incident.solution,
        validatedById: incident.validatedById,
      },
    });
  });

  it.each(['deactivation', 'withdrawal', 'archive'] as const)(
    'Issue 120 rechecks concurrent %s after the PostgreSQL coordination barrier',
    async (operation) => {
      const target = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'Eligibility race',
          email: `reopen-race-${randomBytes(8).toString('hex')}@example.test`,
          role: 'COLLABORATOR',
          passwordHash: 'synthetic unusable hash',
        },
      });
      const promotion = await prisma.promotion.create({
        data: {
          name: 'Issue120 eligibility race',
          phases: { create: { phase: 'PLANNING' } },
          participants: { create: { userId: target.id } },
        },
      });
      const incident = await create('CLOSED', promotion.id);
      const before = await snapshot(incident.id);
      type Connection = {
        connect(): Promise<void>;
        end(): Promise<void>;
        query(
          sql: string,
          values?: unknown[],
        ): Promise<{ rows: Array<{ pid: number }> }>;
      };
      const { Client } = createRequire(import.meta.url)('pg') as {
        Client: new (options: { connectionString: string }) => Connection;
      };
      const blocker = new Client({
        connectionString: getTemporaryMigrationDatabaseUrl(),
      });
      const observer = new Client({
        connectionString: getTemporaryMigrationDatabaseUrl(),
      });
      await blocker.connect();
      await observer.connect();

      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT pg_advisory_xact_lock(210021)');
        const blockerPid = (
          await blocker.query('SELECT pg_backend_pid() AS pid')
        ).rows[0]!.pid;
        pending = reopen(actor(), incident.id, {
          ...input(),
          assignedToId: target.id,
        });
        const deadline = performance.now() + 5000;
        let waiting = false;
        while (performance.now() < deadline) {
          const { rows } = await observer.query(
            "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))",
            [blockerPid],
          );
          if (rows.length) {
            waiting = true;
            break;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        expect(waiting).toBe(true);
        if (operation === 'deactivation')
          await blocker.query('UPDATE users SET is_active=false WHERE id=$1', [
            target.id,
          ]);
        else if (operation === 'withdrawal')
          await blocker.query(
            'DELETE FROM promotion_participants WHERE promotion_id=$1 AND user_id=$2',
            [promotion.id, target.id],
          );
        else
          await blocker.query(
            "UPDATE promotions SET status='ARCHIVED' WHERE id=$1",
            [promotion.id],
          );
        await blocker.query('COMMIT');
        expect((await pending).status).toBe(
          operation === 'archive' ? 409 : 400,
        );
        expect(await snapshot(incident.id)).toEqual(before);
      } finally {
        await blocker.query('ROLLBACK');
        await Promise.allSettled([pending]);
        await blocker.end();
        await observer.end();
      }
    },
  );
  it('Issue 120 rejects a pending reopen by its MANAGER presenter as a state conflict, without invoking rejection semantics', async () => {
    const incident = await create('PENDING_VALIDATION');
    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        assignedToId: actor('MANAGER').id,
        solutionSubmittedById: actor('MANAGER').id,
      },
    });
    const before = await snapshot(incident.id);
    expect((await reopen(actor('MANAGER'), incident.id, input())).status).toBe(
      409,
    );
    expect(await snapshot(incident.id)).toEqual(before);
  });
  it.each(['ADMIN', 'MANAGER'])(
    'Issue 120 preserves the ordinary start conflict for a CLOSED incident by %s',
    async (role) => {
      const incident = await create('CLOSED');
      const before = await snapshot(incident.id);
      expect(
        (
          await request(actor(role), `/${incident.id}/start`, 'POST', {
            version: incident.version,
          })
        ).status,
      ).toBe(409);
      expect(await snapshot(incident.id)).toEqual(before);
    },
  );
});
