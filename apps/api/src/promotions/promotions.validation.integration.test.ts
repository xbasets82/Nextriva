import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createApp } from '../app.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaAuthStore } from '../auth/prisma-auth.store.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { UsersManagementStore } from '../users/users-management.store.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const hasher = new PasswordHasher();
const password = randomBytes(24).toString('base64url');
const origin = 'https://nextriva.example';
const credentials = new Map<string, { cookie: string; csrfToken: string }>();
const emails = new Map<string, string>();
const userIds = new Map<string, string>();
let app: INestApplication;
let baseUrl: string;

async function signIn(
  email: string,
): Promise<{ cookie: string; csrfToken: string }> {
  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const csrfResponse = await fetch(baseUrl + '/api/auth/csrf', {
    headers: { cookie },
  });
  return { cookie, csrfToken: (await csrfResponse.json()).csrfToken as string };
}

function request(
  role: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<Response> {
  const auth = credentials.get(role);
  return fetch(baseUrl + '/api/promotions' + path, {
    method,
    headers: {
      origin,
      cookie: auth?.cookie ?? '',
      'x-csrf-token': auth?.csrfToken ?? '',
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function newPromotionInput(name = 'Synthetic I03.1 promotion') {
  return { name, phases: ['PLANNING', 'CONSTRUCTION'] };
}

async function promotionCount(): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM "promotions"
  `;
  return result[0]?.count ?? 0;
}

beforeAll(async () => {
  const passwordHash = await hasher.hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const email = `i031-${role.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`;
    emails.set(role, email);
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        email,
        role,
        passwordHash,
      },
    });
    userIds.set(role, user.id);
  }
  app = await createApp(
    undefined,
    {
      service: new AuthService(new PrismaAuthStore(prisma), hasher),
      configuration: { origin, localHttp: false },
    },
    new UsersManagementStore(prisma),
  );
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const email = emails.get(role);
    if (!email) throw new Error(`Missing synthetic ${role} identity`);
    credentials.set(role, await signIn(email));
  }
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('I03.1 promotion input validation over authenticated HTTP', () => {
  it('rejects a name below the approved minimum and does not create a promotion', async () => {
    const response = await fetch(baseUrl + '/api/promotions', {
      method: 'POST',
      headers: {
        origin,
        cookie: credentials.get('ADMIN')?.cookie ?? '',
        'x-csrf-token': credentials.get('ADMIN')?.csrfToken ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'AB' }),
    });

    expect(response.status).toBe(400);
  });

  it.each([
    { name: 'a'.repeat(151), phases: ['PLANNING'] },
    {
      name: 'Promoción válida',
      description: 'a'.repeat(1001),
      phases: ['PLANNING'],
    },
    {
      name: 'Promoción válida',
      location: 'a'.repeat(201),
      phases: ['PLANNING'],
    },
    { name: 'Promoción válida', phases: ['PLANNING'], unexpected: true },
    { name: 'Promoción válida', phases: [] },
    { name: 'Promoción válida', phases: ['UNKNOWN'] },
    { name: 'Promoción válida', phases: ['PLANNING', 'PLANNING'] },
  ])('rejects invalid HTTP creation input %j with 400', async (body) => {
    const response = await fetch(baseUrl + '/api/promotions', {
      method: 'POST',
      headers: {
        origin,
        cookie: credentials.get('ADMIN')?.cookie ?? '',
        'x-csrf-token': credentials.get('ADMIN')?.csrfToken ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
  });

  for (const role of ['MANAGER', 'COLLABORATOR']) {
    it(`returns only linked promotions to ${role}`, async () => {
      const auth = credentials.get(role);
      const response = await fetch(baseUrl + '/api/promotions', {
        headers: { cookie: auth?.cookie ?? '' },
      });
      expect(response.status).toBe(200);
      expect((await response.json()).promotions).toEqual([]);
    });
  }

  it('allows ADMIN to create and query a promotion with ordered phases', async () => {
    const auth = credentials.get('ADMIN');
    const create = await fetch(baseUrl + '/api/promotions', {
      method: 'POST',
      headers: {
        origin,
        cookie: auth?.cookie ?? '',
        'x-csrf-token': auth?.csrfToken ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: `Residencial I03.1 ${randomBytes(4).toString('hex')}`,
        phases: ['AFTER_SALES', 'PLANNING', 'CONSTRUCTION'],
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()).promotion as {
      id: string;
      phases: string[];
    };
    expect(created.phases).toEqual(['PLANNING', 'CONSTRUCTION', 'AFTER_SALES']);

    const list = await fetch(baseUrl + '/api/promotions', {
      headers: { cookie: auth?.cookie ?? '' },
    });
    expect(list.status).toBe(200);
    expect(
      ((await list.json()).promotions as Array<{ id: string }>).some(
        (promotion) => promotion.id === created.id,
      ),
    ).toBe(true);

    const detail = await fetch(baseUrl + `/api/promotions/${created.id}`, {
      headers: { cookie: auth?.cookie ?? '' },
    });
    expect(detail.status).toBe(200);
    expect((await detail.json()).promotion).toMatchObject({
      id: created.id,
      phases: ['PLANNING', 'CONSTRUCTION', 'AFTER_SALES'],
    });
  });

  it('hides a guessed promotion UUID from an unlinked MANAGER without mutation', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`I04.1 guessed UUID ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    const before = await prisma.promotion.findUniqueOrThrow({
      where: { id },
      include: { phases: { select: { phase: true } } },
    });

    const response = await request('MANAGER', `/${id}`);

    expect(response.status).toBe(404);
    expect(
      await prisma.promotion.findUniqueOrThrow({
        where: { id },
        include: { phases: { select: { phase: true } } },
      }),
    ).toEqual(before);
  });

  it('grants and revokes promotion scope through participant membership', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`I04.1 membership ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const promotionId = ((await create.json()).promotion as { id: string }).id;
    const outsideCreate = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`I04.1 outside ${randomBytes(4).toString('hex')}`),
    );
    expect(outsideCreate.status).toBe(201);
    const outsidePromotionId = (
      (await outsideCreate.json()).promotion as { id: string }
    ).id;
    const managerId = userIds.get('MANAGER');
    const collaboratorId = userIds.get('COLLABORATOR');
    const adminId = userIds.get('ADMIN');
    if (!managerId || !collaboratorId || !adminId)
      throw new Error('Synthetic identities are missing');
    const archivedTarget = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'ArchivedTarget',
        email: `i041-archived-${randomBytes(6).toString('hex')}@example.test`,
        passwordHash: '$argon2id$synthetic-test-hash',
        role: 'COLLABORATOR',
      },
    });

    expect(
      (
        await request('ADMIN', `/${promotionId}/participants`, 'POST', {
          userId: managerId,
        })
      ).status,
    ).toBe(201);
    expect((await request('MANAGER', `/${outsidePromotionId}`)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          'MANAGER',
          `/${outsidePromotionId}/participants`,
          'POST',
          { userId: collaboratorId },
        )
      ).status,
    ).toBe(404);
    expect((await request('MANAGER', `/${promotionId}`)).status).toBe(200);
    const promotionBeforeForbiddenEdit =
      await prisma.promotion.findUniqueOrThrow({
        where: { id: promotionId },
      });
    expect(
      (
        await request('MANAGER', `/${promotionId}`, 'PATCH', {
          name: 'Must remain unchanged',
        })
      ).status,
    ).toBe(403);
    expect(
      await prisma.promotion.findUniqueOrThrow({
        where: { id: promotionId },
      }),
    ).toEqual(promotionBeforeForbiddenEdit);
    expect(
      (
        await request('MANAGER', `/${promotionId}/participants`, 'POST', {
          userId: collaboratorId,
        })
      ).status,
    ).toBe(201);

    const duplicate = await request(
      'MANAGER',
      `/${promotionId}/participants`,
      'POST',
      { userId: collaboratorId },
    );
    expect(duplicate.status).toBe(409);
    expect(
      (
        await request('MANAGER', `/${promotionId}/participants`, 'POST', {
          userId: adminId,
        })
      ).status,
    ).toBe(403);

    const inactiveTarget = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Inactive',
        email: `i041-inactive-${randomBytes(6).toString('hex')}@example.test`,
        passwordHash: '$argon2id$synthetic-test-hash',
        role: 'COLLABORATOR',
        isActive: false,
      },
    });
    expect(
      (
        await request('ADMIN', `/${promotionId}/participants`, 'POST', {
          userId: inactiveTarget.id,
        })
      ).status,
    ).toBe(409);

    const visibleList = await request('MANAGER', '');
    expect(visibleList.status).toBe(200);
    expect(
      ((await visibleList.json()).promotions as Array<{ id: string }>).map(
        ({ id }) => id,
      ),
    ).toEqual([promotionId]);
    expect((await request('COLLABORATOR', `/${promotionId}`)).status).toBe(200);

    const participantList = await request(
      'MANAGER',
      `/${promotionId}/participants`,
    );
    expect(participantList.status).toBe(200);
    const listedParticipants = (await participantList.json())
      .participants as Array<{ user: Record<string, unknown> }>;
    expect(listedParticipants).toHaveLength(2);
    expect(JSON.stringify(listedParticipants)).not.toContain('passwordHash');
    expect(
      (await request('COLLABORATOR', `/${outsidePromotionId}`)).status,
    ).toBe(404);

    const beforeDenied = await prisma.promotionParticipant.count({
      where: { promotionId },
    });
    expect(
      (
        await request('COLLABORATOR', `/${promotionId}/participants`, 'POST', {
          userId: adminId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          'COLLABORATOR',
          `/${promotionId}/participants/${collaboratorId}`,
          'DELETE',
        )
      ).status,
    ).toBe(403);
    expect(
      await prisma.promotionParticipant.count({ where: { promotionId } }),
    ).toBe(beforeDenied);

    expect(
      (
        await request('ADMIN', `/${promotionId}/status`, 'PATCH', {
          status: 'ARCHIVED',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('MANAGER', `/${promotionId}/participants`, 'POST', {
          userId: archivedTarget.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          'MANAGER',
          `/${promotionId}/participants/${collaboratorId}`,
          'DELETE',
        )
      ).status,
    ).toBe(204);
    expect((await request('COLLABORATOR', `/${promotionId}`)).status).toBe(404);
    expect(
      await prisma.promotionParticipant.count({
        where: { promotionId, userId: collaboratorId },
      }),
    ).toBe(0);
    expect(
      await prisma.user.findUnique({ where: { id: collaboratorId } }),
    ).not.toBeNull();
    expect(
      await prisma.promotion.findUnique({ where: { id: promotionId } }),
    ).not.toBeNull();
  });

  it('rolls back a participant insert when PostgreSQL rejects the write', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`I04.1 rollback ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const promotionId = ((await create.json()).promotion as { id: string }).id;
    const targetId = userIds.get('COLLABORATOR');
    if (!targetId) throw new Error('Synthetic collaborator is missing');

    const independent = await prisma.promotion.create({
      data: {
        name: 'I06.2 isolated trigger control',
        phases: { create: { phase: 'PLANNING' } },
      },
    });
    try {
      await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_i041_participant_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic participant write failure'; END $$
    `);
      await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_i041_participant_insert
      BEFORE INSERT ON "promotion_participants"
      FOR EACH ROW
      WHEN (NEW.promotion_id = '${promotionId}'::uuid)
      EXECUTE FUNCTION reject_i041_participant_insert()
    `);
      const [response, unaffected] = await Promise.all([
        request('ADMIN', `/${promotionId}/participants`, 'POST', {
          userId: targetId,
        }),
        prisma.promotionParticipant.create({
          data: { promotionId: independent.id, userId: targetId },
        }),
      ]);
      expect(response.status).toBe(503);
      expect(unaffected).toMatchObject({
        promotionId: independent.id,
        userId: targetId,
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS fail_i041_participant_insert ON "promotion_participants"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS reject_i041_participant_insert()',
      );
    }
    expect(
      await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE tgname = 'fail_i041_participant_insert'`,
    ).toEqual([]);
    expect(
      await prisma.promotionParticipant.count({
        where: { promotionId, userId: targetId },
      }),
    ).toBe(0);
  });

  it('serializes concurrent duplicate participant additions with one durable link', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`I04.1 concurrent ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const promotionId = ((await create.json()).promotion as { id: string }).id;
    const targetId = userIds.get('COLLABORATOR');
    if (!targetId) throw new Error('Synthetic collaborator is missing');

    const results = await Promise.all([
      request('ADMIN', `/${promotionId}/participants`, 'POST', {
        userId: targetId,
      }),
      request('ADMIN', `/${promotionId}/participants`, 'POST', {
        userId: targetId,
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.promotionParticipant.count({
        where: { promotionId, userId: targetId },
      }),
    ).toBe(1);
  });

  it('replaces phases and updates every editable field in one successful request', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Edit ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;

    const edit = await request('ADMIN', `/${id}`, 'PATCH', {
      name: 'Promoción revisada',
      description: 'Descripción actualizada',
      location: 'Valencia',
      phases: ['AFTER_SALES', 'HANDOVER'],
    });

    expect(edit.status).toBe(200);
    expect((await edit.json()).promotion).toMatchObject({
      id,
      name: 'Promoción revisada',
      description: 'Descripción actualizada',
      location: 'Valencia',
      phases: ['HANDOVER', 'AFTER_SALES'],
    });
    expect(
      await prisma.promotionPhaseRecord.findMany({
        where: { promotionId: id },
        orderBy: { phase: 'asc' },
      }),
    ).toMatchObject([{ phase: 'HANDOVER' }, { phase: 'AFTER_SALES' }]);
  });

  it('translates a PostgreSQL uniqueness conflict and rolls back the new promotion', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_i031_duplicate_phase() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'synthetic duplicate phase' USING ERRCODE = '23505';
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER duplicate_i031_phase BEFORE INSERT ON "promotion_phases"
      FOR EACH ROW EXECUTE FUNCTION reject_i031_duplicate_phase()
    `);
    try {
      const before = await promotionCount();
      const response = await request(
        'ADMIN',
        '',
        'POST',
        newPromotionInput(`Unique conflict ${randomBytes(4).toString('hex')}`),
      );

      expect(response.status).toBe(409);
      expect(await promotionCount()).toBe(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER duplicate_i031_phase ON "promotion_phases"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION reject_i031_duplicate_phase()',
      );
    }
  });

  it('rejects reactivation if a concurrent database change leaves no phases and preserves archived state', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Reactivate guard ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    expect(
      (
        await request('ADMIN', `/${id}/status`, 'PATCH', {
          status: 'ARCHIVED',
        })
      ).status,
    ).toBe(200);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION remove_i031_phase_on_reactivation() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status = 'ACTIVE' THEN
          DELETE FROM "promotion_phases" WHERE "promotion_id" = NEW.id;
        END IF;
        RETURN NEW;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER remove_i031_phase BEFORE UPDATE ON "promotions"
      FOR EACH ROW EXECUTE FUNCTION remove_i031_phase_on_reactivation()
    `);
    try {
      const response = await request('ADMIN', `/${id}/status`, 'PATCH', {
        status: 'ACTIVE',
      });
      expect(response.status).toBe(400);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER remove_i031_phase ON "promotions"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION remove_i031_phase_on_reactivation()',
      );
    }

    const persisted = await request('ADMIN', `/${id}`);
    expect((await persisted.json()).promotion).toMatchObject({
      status: 'ARCHIVED',
      phases: ['PLANNING', 'CONSTRUCTION'],
    });
  });

  it('rolls back promotion creation when phase persistence fails', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_i031_phase_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic phase write failure'; END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_i031_phase_insert BEFORE INSERT ON "promotion_phases"
      FOR EACH ROW EXECUTE FUNCTION reject_i031_phase_insert()
    `);
    try {
      const before = await promotionCount();
      const response = await request(
        'ADMIN',
        '',
        'POST',
        newPromotionInput(`Rollback create ${randomBytes(4).toString('hex')}`),
      );
      expect(response.status).toBe(503);
      expect(await promotionCount()).toBe(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER fail_i031_phase_insert ON "promotion_phases"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION reject_i031_phase_insert()',
      );
    }
  });

  it('rolls back field edits and the prior phase set when replacement fails', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Rollback replace ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    const before = await request('ADMIN', `/${id}`);
    const beforeBody = (await before.json()).promotion as {
      name: string;
      phases: string[];
    };

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_i031_phase_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic phase write failure'; END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_i031_phase_insert BEFORE INSERT ON "promotion_phases"
      FOR EACH ROW EXECUTE FUNCTION reject_i031_phase_insert()
    `);
    try {
      const response = await request('ADMIN', `/${id}`, 'PATCH', {
        name: 'Updated before failure',
        phases: ['HANDOVER'],
      });
      expect(response.status).toBe(503);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER fail_i031_phase_insert ON "promotion_phases"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION reject_i031_phase_insert()',
      );
    }

    const after = await request('ADMIN', `/${id}`);
    expect((await after.json()).promotion).toMatchObject(beforeBody);
  });

  it('archives and reactivates without changing phase rows', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Archive ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    const original = (await (await request('ADMIN', `/${id}`)).json())
      .promotion as { phases: string[] };

    for (const status of ['ARCHIVED', 'ACTIVE']) {
      const response = await request('ADMIN', `/${id}/status`, 'PATCH', {
        status,
      });
      expect(response.status).toBe(200);
      expect((await response.json()).promotion).toMatchObject({
        status,
        phases: original.phases,
      });
    }
  });

  it('keeps archived promotion details readable and blocks ordinary edits', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Archived edit ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    expect(
      (
        await request('ADMIN', `/${id}/status`, 'PATCH', {
          status: 'ARCHIVED',
        })
      ).status,
    ).toBe(200);
    const before = await request('ADMIN', `/${id}`);
    expect(before.status).toBe(200);
    const beforePromotion = (await before.json()).promotion;

    const edit = await request('ADMIN', `/${id}`, 'PATCH', {
      name: 'Archived promotion changed',
      phases: ['HANDOVER'],
    });
    expect(edit.status).toBe(409);
    expect((await request('ADMIN', `/${id}`)).status).toBe(200);
    expect((await (await request('ADMIN', `/${id}`)).json()).promotion).toEqual(
      beforePromotion,
    );
  });

  it('rejects malformed, unknown and non-allowlisted edit/status requests without mutation', async () => {
    const create = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput(`Validation ${randomBytes(4).toString('hex')}`),
    );
    expect(create.status).toBe(201);
    const id = ((await create.json()).promotion as { id: string }).id;
    const before = await prisma.promotion.findUniqueOrThrow({
      where: { id },
      include: { phases: { select: { phase: true } } },
    });

    for (const [path, method, body, status] of [
      [`/not-a-uuid`, 'GET', undefined, 400],
      [`/00000000-0000-4000-8000-000000000099`, 'GET', undefined, 404],
      [`/${id}`, 'PATCH', { status: 'ARCHIVED' }, 400],
      [`/${id}`, 'PATCH', { createdAt: '2026-10-20T00:00:00Z' }, 400],
      [`/${id}`, 'PATCH', { name: 'A' }, 400],
      [`/${id}/status`, 'PATCH', { status: 'DELETED' }, 400],
      [
        `/${id}/status`,
        'PATCH',
        { status: 'ARCHIVED', name: 'forbidden' },
        400,
      ],
    ] as const) {
      const response = await request('ADMIN', path, method, body);
      expect(response.status).toBe(status);
    }

    const after = await prisma.promotion.findUniqueOrThrow({
      where: { id },
      include: { phases: { select: { phase: true } } },
    });
    expect(after).toEqual(before);
  });

  it('returns 404 when an authorized administrator edits a well-formed missing promotion id', async () => {
    const before = await promotionCount();
    const response = await request(
      'ADMIN',
      '/00000000-0000-4000-8000-000000000098',
      'PATCH',
      { name: 'Promoción inexistente' },
    );

    expect(response.status).toBe(404);
    expect(await promotionCount()).toBe(before);
  });

  for (const role of ['MANAGER', 'COLLABORATOR']) {
    it(`denies ${role} direct detail and mutations without changing promotion or session rows`, async () => {
      const create = await request(
        'ADMIN',
        '',
        'POST',
        newPromotionInput(`Denied ${role} ${randomBytes(4).toString('hex')}`),
      );
      expect(create.status).toBe(201);
      const id = ((await create.json()).promotion as { id: string }).id;
      const beforePromotion = await prisma.promotion.findUniqueOrThrow({
        where: { id },
        include: { phases: { select: { phase: true } } },
      });
      const userId = userIds.get(role);
      if (!userId) throw new Error(`Missing synthetic ${role} identity`);
      const beforeSessions = await prisma.session.findMany({
        where: { userId },
      });

      const responses = await Promise.all([
        request(role, `/${id}`),
        request(role, '', 'POST', newPromotionInput('Forbidden create')),
        request(role, `/${id}`, 'PATCH', { name: 'Forbidden edit' }),
        request(role, `/${id}`, 'PATCH', { phases: ['HANDOVER'] }),
        request(role, `/${id}/status`, 'PATCH', { status: 'ARCHIVED' }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([
        404, 403, 404, 404, 404,
      ]);
      expect(
        await prisma.promotion.findUniqueOrThrow({
          where: { id },
          include: { phases: { select: { phase: true } } },
        }),
      ).toEqual(beforePromotion);
      expect(await prisma.session.findMany({ where: { userId } })).toEqual(
        beforeSessions,
      );
    });
  }

  it('requires an authenticated session to list promotions', async () => {
    const before = await promotionCount();
    const response = await fetch(baseUrl + '/api/promotions');

    expect(response.status).toBe(401);
    expect(await promotionCount()).toBe(before);
  });

  it('requires CSRF on ADMIN mutations and leaves data unchanged when missing', async () => {
    const auth = credentials.get('ADMIN');
    const before = await promotionCount();
    const response = await fetch(baseUrl + '/api/promotions', {
      method: 'POST',
      headers: {
        origin,
        cookie: auth?.cookie ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify(newPromotionInput('Missing CSRF token')),
    });
    expect(response.status).toBe(403);
    expect(await promotionCount()).toBe(before);
  });

  it('documents only the approved routes, schemas, authorization and status codes', () => {
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
    const paths = document.paths;
    const create = paths['/api/promotions']?.post;
    const list = paths['/api/promotions']?.get;
    const edit = paths['/api/promotions/{id}']?.patch;
    const status = paths['/api/promotions/{id}/status']?.patch;
    const participants = paths['/api/promotions/{promotionId}/participants'];
    const participantRead = participants?.get;
    const participantCreate = participants?.post;
    const participantDelete =
      paths['/api/promotions/{promotionId}/participants/{userId}']?.delete;

    expect(create?.responses['201']).toBeDefined();
    expect(list?.responses['200']).toBeDefined();
    expect(paths['/api/promotions/{id}']?.get?.responses['404']).toBeDefined();
    expect(edit?.responses['200']).toBeDefined();
    expect(status?.responses['200']).toBeDefined();
    expect(participantRead?.responses['200']).toBeDefined();
    expect(participantRead?.responses['404']).toBeDefined();
    expect(participantCreate?.responses['201']).toBeDefined();
    expect(participantCreate?.responses['403']).toBeDefined();
    expect(participantCreate?.responses['409']).toBeDefined();
    expect(participantDelete?.responses['204']).toBeDefined();
    expect(participantDelete?.responses['404']).toBeDefined();
    expect(paths['/api/promotions']?.delete).toBeUndefined();
    expect(create?.security).toBeDefined();
    expect(create?.parameters).toContainEqual(
      expect.objectContaining({
        name: 'X-CSRF-Token',
        in: 'header',
        required: true,
      }),
    );
    const requestBody = create?.requestBody;
    expect(
      requestBody && 'content' in requestBody
        ? requestBody.content['application/json']?.schema
        : undefined,
    ).toMatchObject({
      required: ['name', 'phases'],
      additionalProperties: false,
      properties: {
        name: { minLength: 3, maxLength: 150 },
        phases: {
          minItems: 1,
          uniqueItems: true,
          items: {
            enum: [
              'PLANNING',
              'COMMERCIALIZATION',
              'EXECUTIVE_PROJECT',
              'CONSTRUCTION',
              'PRE_HANDOVER',
              'HANDOVER',
              'AFTER_SALES',
            ],
          },
        },
      },
    });
    const promotionContract = JSON.stringify([
      paths['/api/promotions'],
      paths['/api/promotions/{id}'],
      paths['/api/promotions/{id}/status'],
    ]);
    expect(promotionContract).not.toContain('MANAGER');
    expect(promotionContract).not.toContain('COLLABORATOR');
    const participantContract = JSON.stringify([
      participantRead,
      participantCreate,
      participantDelete,
    ]);
    expect(participantContract).not.toContain('passwordHash');
    expect(participantContract).not.toContain('tokenHash');
    const participantBody = participantCreate?.requestBody;
    expect(
      participantBody && 'content' in participantBody
        ? participantBody.content['application/json']?.schema
        : undefined,
    ).toMatchObject({
      required: ['userId'],
      additionalProperties: false,
      properties: { userId: { type: 'string', format: 'uuid' } },
    });
  });
});

describe('I04.2 eligible participants over real authenticated HTTP', () => {
  it('limits candidates to active unlinked collaborators and enforces resource scope without mutation', async () => {
    const created = await request(
      'ADMIN',
      '',
      'POST',
      newPromotionInput('I04.2 candidates'),
    );
    const { promotion } = await created.json();
    const promotionId = promotion.id as string;
    const managerId = userIds.get('MANAGER')!;
    const collaboratorId = userIds.get('COLLABORATOR')!;
    await request('ADMIN', `/${promotionId}/participants`, 'POST', {
      userId: managerId,
    });
    const inactive = await prisma.user.create({
      data: {
        firstName: 'Inactive',
        lastName: 'Candidate',
        email: `i042-inactive-${randomBytes(8).toString('hex')}@example.test`,
        passwordHash: await hasher.hash(password),
        role: 'COLLABORATOR',
        isActive: false,
      },
    });
    const before = await prisma.promotionParticipant.count();
    for (const role of ['ADMIN', 'MANAGER']) {
      const response = await request(
        role,
        `/${promotionId}/eligible-participants`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const { candidates } = await response.json();
      expect(candidates).toContainEqual(
        expect.objectContaining({ id: collaboratorId }),
      );
      expect(
        candidates.some(
          (candidate: { id: string }) => candidate.id === managerId,
        ),
      ).toBe(false);
      expect(
        candidates.some(
          (candidate: { id: string }) => candidate.id === inactive.id,
        ),
      ).toBe(false);
      expect(Object.keys(candidates[0]).sort()).toEqual([
        'email',
        'firstName',
        'id',
        'lastName',
      ]);
    }
    await request('ADMIN', `/${promotionId}/participants`, 'POST', {
      userId: collaboratorId,
    });
    expect(
      (await request('COLLABORATOR', `/${promotionId}/eligible-participants`))
        .status,
    ).toBe(403);
    const candidates = await (
      await request('MANAGER', `/${promotionId}/eligible-participants`)
    ).json();
    expect(
      candidates.candidates.some(
        (candidate: { id: string }) => candidate.id === collaboratorId,
      ),
    ).toBe(false);
    const outside = await (
      await request('ADMIN', '', 'POST', newPromotionInput('I04.2 outside'))
    ).json();
    expect(
      (
        await request(
          'MANAGER',
          `/${outside.promotion.id}/eligible-participants`,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request('ANONYMOUS', `/${promotionId}/eligible-participants`))
        .status,
    ).toBe(401);
    expect(await prisma.promotionParticipant.count()).toBe(before + 1);
  });
});
