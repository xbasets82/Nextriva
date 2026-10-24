import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { cleanDevelopmentData, seedDevelopmentData } from './dev-seed.js';
import { makeSeedPlan, seedId } from './dev-seed.plan.js';

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
let databaseCreated = false;

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  try {
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
      throw new Error('Isolated seed migration failed');
  } catch (error) {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
    databaseCreated = false;
    throw error;
  }
}, 30_000);

afterAll(async () => {
  try {
    await prisma.$disconnect();
    if (databaseCreated) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}"`,
      );
      databaseCreated = false;
    }
  } finally {
    await admin.$disconnect();
  }
}, 30_000);

async function snapshot() {
  return {
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    promotions: await prisma.promotion.findMany({ orderBy: { id: 'asc' } }),
    phases: await prisma.promotionPhaseRecord.findMany({
      orderBy: [{ promotionId: 'asc' }, { phase: 'asc' }],
    }),
    participants: await prisma.promotionParticipant.findMany({
      orderBy: [{ promotionId: 'asc' }, { userId: 'asc' }],
    }),
    incidents: await prisma.incident.findMany({ orderBy: { id: 'asc' } }),
    comments: await prisma.incidentComment.findMany({
      orderBy: { id: 'asc' },
    }),
    activities: await prisma.incidentActivity.findMany({
      orderBy: { id: 'asc' },
    }),
  };
}

it('seeds reproducible, coherent fixtures and cleans only owned rows on real PostgreSQL', async () => {
  const manualUser = await prisma.user.create({
    data: {
      firstName: 'Manual',
      lastName: 'User',
      email: 'manual-user@example.test',
      passwordHash: 'manual-hash-never-replaced',
      role: 'COLLABORATOR',
    },
  });
  const manualPromotion = await prisma.promotion.create({
    data: {
      name: 'Manual promotion',
      status: 'ARCHIVED',
      phases: { create: [{ phase: 'PLANNING' }] },
    },
  });

  const collision = await prisma.user.create({
    data: {
      id: seedId('user', 0),
      firstName: 'Manual',
      lastName: 'Collision',
      email: 'manual-collision@example.test',
      passwordHash: 'manual-hash-never-replaced',
      role: 'COLLABORATOR',
    },
  });
  const beforeCollision = await snapshot();
  await expect(
    seedDevelopmentData(prisma, { incidentCount: 60 }),
  ).rejects.toThrow('identificadores reservados del seed');
  expect(await snapshot()).toEqual(beforeCollision);
  await prisma.user.delete({ where: { id: collision.id } });

  const firstResult = await seedDevelopmentData(prisma, { incidentCount: 60 });
  expect(firstResult).toMatchObject({
    users: 12,
    promotions: 5,
    incidents: 60,
  });
  expect(firstResult.comments).toBeGreaterThan(0);
  const first = await snapshot();
  expect(first.users).toHaveLength(13);
  expect(first.promotions).toHaveLength(6);
  expect(first.incidents).toHaveLength(60);
  expect(first.comments).toHaveLength(firstResult.comments);
  expect(
    await prisma.user.findUnique({ where: { id: manualUser.id } }),
  ).toEqual(manualUser);
  expect(
    await prisma.promotion.findUnique({ where: { id: manualPromotion.id } }),
  ).toEqual(manualPromotion);

  const seededUsers = first.users.filter((user) => user.id !== manualUser.id);
  expect(
    seededUsers.every((user) => user.email.endsWith('@seed.nextriva.invalid')),
  ).toBe(true);
  expect(new Set(seededUsers.map((user) => user.role))).toEqual(
    new Set(['ADMIN', 'MANAGER', 'COLLABORATOR']),
  );
  expect(seededUsers.some((user) => !user.isActive)).toBe(true);
  for (const user of seededUsers) {
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await new PasswordHasher().verify(user.passwordHash, '123456')).toBe(
      true,
    );
  }

  const seededPromotions = first.promotions.filter(
    (promotion) => promotion.id !== manualPromotion.id,
  );
  expect(
    new Set(seededPromotions.map((promotion) => promotion.status)),
  ).toEqual(new Set(['ACTIVE', 'ARCHIVED']));
  expect(
    seededPromotions.some(
      (promotion) =>
        first.phases.filter((phase) => phase.promotionId === promotion.id)
          .length > 1,
    ),
  ).toBe(true);

  const participantKeys = new Set(
    first.participants.map(
      ({ promotionId, userId }) => `${promotionId}:${userId}`,
    ),
  );
  const usersById = new Map(first.users.map((user) => [user.id, user]));
  const promotionsById = new Map(
    first.promotions.map((promotion) => [promotion.id, promotion]),
  );
  const activitiesByIncident = new Map<
    string,
    (typeof first.activities)[number][]
  >();
  for (const activity of first.activities) {
    const recorded = activitiesByIncident.get(activity.incidentId) ?? [];
    recorded.push(activity);
    activitiesByIncident.set(activity.incidentId, recorded);
  }
  expect(new Set(first.incidents.map((incident) => incident.category))).toEqual(
    new Set([
      'STRUCTURE',
      'ENVELOPE',
      'INSTALLATIONS',
      'FINISHES',
      'CARPENTRY',
      'COMMON_AREAS',
      'CLEANING',
      'SAFETY',
      'OTHER',
    ]),
  );
  expect(new Set(first.incidents.map((incident) => incident.priority))).toEqual(
    new Set(['LOW', 'MEDIUM', 'HIGH']),
  );
  expect(new Set(first.incidents.map((incident) => incident.status))).toEqual(
    new Set(['OPEN', 'IN_PROGRESS', 'PENDING_VALIDATION']),
  );
  expect(
    first.incidents.some((incident) => incident.assignedToId === null),
  ).toBe(true);
  for (const incident of first.incidents) {
    const promotion = promotionsById.get(incident.promotionId);
    const creator = usersById.get(incident.createdById);
    const activityTypes = new Set(
      activitiesByIncident
        .get(incident.id)
        ?.map((activity) => activity.eventType),
    );
    expect(promotion).toBeDefined();
    expect(creator).toBeDefined();
    expect(activityTypes.has('CREATED')).toBe(true);
    if (incident.assignedToId) {
      const assignee = usersById.get(incident.assignedToId);
      expect(assignee?.isActive).toBe(true);
      expect(
        assignee?.role === 'ADMIN' ||
          participantKeys.has(
            `${incident.promotionId}:${incident.assignedToId}`,
          ),
      ).toBe(true);
      expect(
        activityTypes.has('ASSIGNED') || activityTypes.has('REASSIGNED'),
      ).toBe(true);
    }
    if (incident.status !== 'OPEN') {
      expect(incident.assignedToId).not.toBeNull();
      expect(activityTypes.has('STATUS_CHANGED')).toBe(true);
    }
    if (incident.status === 'PENDING_VALIDATION') {
      expect(incident.solution?.trim()).not.toBe('');
      expect(incident.solutionSubmittedById).toBe(incident.assignedToId);
      expect(incident.solutionSubmittedAt).not.toBeNull();
      expect(activityTypes.has('SOLUTION_SUBMITTED')).toBe(true);
      expect(
        first.users.some(
          (user) =>
            user.id !== incident.solutionSubmittedById &&
            user.isActive &&
            (user.role === 'ADMIN' ||
              (user.role === 'MANAGER' &&
                participantKeys.has(`${incident.promotionId}:${user.id}`))),
        ),
      ).toBe(true);
    } else {
      expect(incident.solutionSubmittedById).toBeNull();
      expect(incident.solutionSubmittedAt).toBeNull();
    }
  }
  for (const comment of first.comments) {
    const incident = first.incidents.find(
      (row) => row.id === comment.incidentId,
    );
    const author = usersById.get(comment.authorId);
    expect(incident).toBeDefined();
    expect(author?.isActive).toBe(true);
    expect(
      author?.role === 'ADMIN' ||
        (incident !== undefined &&
          participantKeys.has(`${incident.promotionId}:${author?.id}`) &&
          (author?.role === 'MANAGER' ||
            incident.createdById === author?.id ||
            incident.assignedToId === author?.id)),
    ).toBe(true);
  }

  expect(await seedDevelopmentData(prisma, { incidentCount: 60 })).toEqual(
    firstResult,
  );
  expect(await snapshot()).toEqual(first);

  const linkedPromotion = seededPromotions.find(
    (promotion) => promotion.status === 'ACTIVE',
  );
  expect(linkedPromotion).toBeDefined();
  const manualReference = await prisma.incident.create({
    data: {
      promotionId: linkedPromotion!.id,
      originPhase: 'PLANNING',
      title: 'Manual record referencing a seeded promotion',
      description: 'This row must prevent destructive cleanup.',
      category: 'OTHER',
      priority: 'LOW',
      createdById: manualUser.id,
    },
  });
  const beforeRefusal = await snapshot();
  await expect(cleanDevelopmentData(prisma)).rejects.toThrow();
  expect(await snapshot()).toEqual(beforeRefusal);

  await prisma.incident.delete({ where: { id: manualReference.id } });
  expect(await cleanDevelopmentData(prisma)).toMatchObject({
    users: 12,
    promotions: 5,
    incidents: 60,
    comments: firstResult.comments,
  });
  const afterCleanup = await snapshot();
  expect(afterCleanup.users).toEqual([manualUser]);
  expect(afterCleanup.promotions).toEqual([manualPromotion]);
  expect(afterCleanup.phases).toEqual([
    { promotionId: manualPromotion.id, phase: 'PLANNING' },
  ]);
  expect(afterCleanup.participants).toEqual([]);
  expect(afterCleanup.incidents).toEqual([]);
  expect(afterCleanup.comments).toEqual([]);
  expect(afterCleanup.activities).toEqual([]);

  expect(await seedDevelopmentData(prisma, { incidentCount: 7 })).toMatchObject(
    { users: 12, promotions: 5, incidents: 7 },
  );
  const reduced = await snapshot();
  expect(reduced.incidents).toHaveLength(7);
  expect(
    reduced.users
      .filter((user) => user.id !== manualUser.id)
      .map((user) => user.id),
  ).toEqual(seededUsers.map((user) => user.id));
  await cleanDevelopmentData(prisma);
}, 60_000);

it('refuses to clean a participant removed and rejoined outside the seed', async () => {
  const plan = makeSeedPlan(0);
  await seedDevelopmentData(prisma, { incidentCount: 0 });
  const participant = plan.participants[0]!;
  await prisma.promotionParticipant.delete({
    where: {
      promotionId_userId: {
        promotionId: participant.promotionId,
        userId: participant.userId,
      },
    },
  });
  await prisma.promotionParticipant.create({
    data: {
      promotionId: participant.promotionId,
      userId: participant.userId,
      joinedAt: new Date('2026-10-01T08:00:00.000Z'),
    },
  });
  const beforeRefusal = await snapshot();
  await expect(cleanDevelopmentData(prisma)).rejects.toThrow();
  expect(await snapshot()).toEqual(beforeRefusal);
  await prisma.promotionParticipant.update({
    where: {
      promotionId_userId: {
        promotionId: participant.promotionId,
        userId: participant.userId,
      },
    },
    data: { joinedAt: participant.joinedAt },
  });
  await cleanDevelopmentData(prisma);
}, 30_000);

it.each([
  {
    label: 'deactivation',
    userIndex: 2,
    changedRole: 'ADMIN' as const,
    changedActive: true,
  },
  {
    label: 'role degradation',
    userIndex: 6,
    changedRole: 'MANAGER' as const,
    changedActive: true,
  },
])(
  'refuses seed user $label while responsible for a manual incident',
  async ({ userIndex, changedRole, changedActive }) => {
    const plan = makeSeedPlan(0);
    await seedDevelopmentData(prisma, { incidentCount: 0 });
    const responsible = plan.users[userIndex]!;
    await prisma.user.update({
      where: { id: responsible.id },
      data: { role: changedRole, isActive: changedActive },
    });
    const manualCreator = await prisma.user.create({
      data: {
        firstName: 'Manual',
        lastName: 'Creator',
        email: `manual-creator-${userIndex}@example.test`,
        passwordHash: 'manual-hash',
        role: 'ADMIN',
      },
    });
    const manualPromotion = await prisma.promotion.create({
      data: {
        name: `Manual promotion for seed guard ${userIndex}`,
        status: 'ACTIVE',
        phases: { create: [{ phase: 'PLANNING' }] },
      },
    });
    const manualIncident = await prisma.incident.create({
      data: {
        promotionId: manualPromotion.id,
        originPhase: 'PLANNING',
        title: `Manual responsibility ${userIndex}`,
        description:
          'A manual incident must retain an eligible responsible user.',
        category: 'OTHER',
        priority: 'LOW',
        createdById: manualCreator.id,
        assignedToId: responsible.id,
      },
    });
    const beforeRefusal = await snapshot();
    await expect(
      seedDevelopmentData(prisma, { incidentCount: 0 }),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(beforeRefusal);
    await prisma.incident.delete({ where: { id: manualIncident.id } });
    await cleanDevelopmentData(prisma);
  },
  30_000,
);

it('extends profiles without remapping rows, preserves manual data and cleans only owned rows', async () => {
  const baseline = await snapshot();
  const manual = await prisma.user.create({
    data: {
      firstName: 'Manual',
      lastName: 'Profile',
      email: 'manual-profile@example.test',
      passwordHash: 'manual-hash',
      role: 'COLLABORATOR',
    },
  });
  const small = await seedDevelopmentData(prisma, { incidentCount: 60 });
  const original = await snapshot();
  expect(small).toMatchObject({ users: 12, promotions: 5, incidents: 60 });
  expect(
    await seedDevelopmentData(prisma, {
      incidentCount: 150,
      profile: 'medium',
    }),
  ).toMatchObject({
    users: 20,
    promotions: 10,
    incidents: 150,
  });
  const middle = await snapshot();
  for (const incident of original.incidents) {
    expect(middle.incidents.find((item) => item.id === incident.id)).toEqual(
      incident,
    );
  }
  const manualCollision = await prisma.user.create({
    data: {
      id: seedId('user', 25),
      firstName: 'Manual',
      lastName: 'Collision',
      email: 'manual-expanded-collision@example.test',
      passwordHash: 'manual-hash',
      role: 'COLLABORATOR',
    },
  });
  const beforeCollision = await snapshot();
  await expect(
    seedDevelopmentData(prisma, { incidentCount: 300, profile: 'large' }),
  ).rejects.toThrow('identificadores reservados del seed');
  expect(await snapshot()).toEqual(beforeCollision);
  await prisma.user.delete({ where: { id: manualCollision.id } });
  expect(
    await seedDevelopmentData(prisma, { incidentCount: 300, profile: 'large' }),
  ).toMatchObject({
    users: 30,
    promotions: 15,
    incidents: 300,
  });
  const expanded = await snapshot();
  const largePlan = makeSeedPlan(300, 'large');
  const twiceRejectedIncident = largePlan.incidents.find(
    (incident) =>
      largePlan.activities.filter(
        (activity) =>
          activity.incidentId === incident.id &&
          activity.eventType === 'STATUS_CHANGED' &&
          activity.changes.previousStatus === 'PENDING_VALIDATION' &&
          activity.changes.status === 'IN_PROGRESS',
      ).length >= 2,
  );
  expect(twiceRejectedIncident).toBeDefined();
  for (const activity of largePlan.activities.filter(
    (item) =>
      item.incidentId === twiceRejectedIncident?.id &&
      item.eventType === 'STATUS_CHANGED' &&
      item.changes.previousStatus === 'PENDING_VALIDATION' &&
      item.changes.status === 'IN_PROGRESS',
  )) {
    expect(
      expanded.activities.find((item) => item.id === activity.id),
    ).toMatchObject(activity);
  }
  expect(
    largePlan.users.every((item) =>
      expanded.users.some((row) => row.id === item.id),
    ),
  ).toBe(true);
  expect(
    largePlan.promotions.every((item) =>
      expanded.promotions.some((row) => row.id === item.id),
    ),
  ).toBe(true);
  expect(
    largePlan.incidents.every((item) =>
      expanded.incidents.some((row) => row.id === item.id),
    ),
  ).toBe(true);
  expect(
    expanded.comments.length - baseline.comments.length,
  ).toBeGreaterThanOrEqual(600);
  expect(
    expanded.comments.length - baseline.comments.length,
  ).toBeLessThanOrEqual(900);
  expect(expanded.users.find((item) => item.id === manual.id)).toEqual(manual);
  expect(
    await seedDevelopmentData(prisma, { incidentCount: 300, profile: 'large' }),
  ).toMatchObject({
    users: 30,
    promotions: 15,
    incidents: 300,
  });
  expect(await snapshot()).toEqual(expanded);
  await expect(
    seedDevelopmentData(prisma, { incidentCount: 150, profile: 'medium' }),
  ).rejects.toThrow('limpia primero');
  expect(await snapshot()).toEqual(expanded);
  const cleaned = await cleanDevelopmentData(prisma);
  expect(cleaned).toMatchObject({ users: 30, promotions: 15, incidents: 300 });
  const after = await snapshot();
  expect(after.users).toEqual(
    [...baseline.users, manual].sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(after.promotions).toEqual(baseline.promotions);
  expect(after.incidents).toEqual(baseline.incidents);
  expect(after.comments).toEqual(baseline.comments);
  expect(after.activities).toEqual(baseline.activities);
  await prisma.user.delete({ where: { id: manual.id } });
}, 120_000);
