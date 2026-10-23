import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { getDevelopmentDatabaseUrl } from '../database/database-url.js';
import { assertResponsibilityReleased } from '../incidents/incident-responsibility.js';
import { assertIndependentValidatorRemains } from '../incidents/incident-validator.js';
import { lockUserAdministration } from '../users/users-management.store.js';
import { PasswordHasher } from '../users/password-hasher.js';
import {
  makeSeedPlan,
  MAX_INCIDENT_COUNT,
  SEED_PASSWORD,
  type SeedPlan,
} from './dev-seed.plan.js';

export type SeedSummary = {
  users: number;
  promotions: number;
  incidents: number;
  comments: number;
};

const DESTINATION_ERROR =
  'El seed solo se permite en nextriva_dev local fuera de CI.';
const OWNERSHIP_ERROR =
  'El destino contiene datos que coinciden con identificadores reservados del seed.';
const EXTERNAL_REFERENCE_ERROR =
  'No se puede limpiar: existen referencias ajenas al seed.';

export function assertAllowedSeedRuntime(environment: NodeJS.ProcessEnv): void {
  if (
    environment.CI !== undefined ||
    environment.NODE_ENV === 'production' ||
    environment.NODE_ENV === 'test' ||
    environment.AUTH_DATABASE_MODE === 'isolated-test' ||
    environment.TEST_DATABASE_URL !== undefined ||
    environment.NEXTRIVA_MIGRATION_DATABASE_URL !== undefined ||
    environment.NEXTRIVA_BOOTSTRAP_DATABASE_URL !== undefined
  ) {
    throw new Error(DESTINATION_ERROR);
  }
}

export function validateDevSeedCommandEnvironment(
  environment: NodeJS.ProcessEnv,
): string {
  assertAllowedSeedRuntime(environment);
  try {
    return getDevelopmentDatabaseUrl(environment);
  } catch {
    throw new Error(DESTINATION_ERROR);
  }
}

function summary(plan: SeedPlan): SeedSummary {
  return {
    users: plan.users.length,
    promotions: plan.promotions.length,
    incidents: plan.incidents.length,
    comments: plan.comments.length,
  };
}

async function lockSeed(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$queryRaw`SELECT 1::int AS acquired FROM pg_advisory_xact_lock(hashtext('nextriva-dev-seed-v1'))`;
}

async function lockSeedPromotions(
  transaction: Prisma.TransactionClient,
  plan: SeedPlan,
): Promise<void> {
  for (const id of plan.promotions.map((item) => item.id).sort()) {
    await transaction.$queryRaw`SELECT id FROM promotions WHERE id = ${id}::uuid FOR UPDATE`;
  }
}

async function ownedRows(
  transaction: Prisma.TransactionClient,
  plan: SeedPlan,
) {
  const [users, promotions, incidents, comments, activities] =
    await Promise.all([
      transaction.user.findMany({
        where: { id: { in: plan.users.map((item) => item.id) } },
      }),
      transaction.promotion.findMany({
        where: { id: { in: plan.promotions.map((item) => item.id) } },
      }),
      transaction.incident.findMany({
        where: { id: { in: plan.incidents.map((item) => item.id) } },
      }),
      transaction.incidentComment.findMany({
        where: { id: { in: plan.comments.map((item) => item.id) } },
      }),
      transaction.incidentActivity.findMany({
        where: { id: { in: plan.activities.map((item) => item.id) } },
      }),
    ]);
  const userPlan = new Map(plan.users.map((item) => [item.id, item]));
  const promotionPlan = new Map(plan.promotions.map((item) => [item.id, item]));
  const incidentPlan = new Map(plan.incidents.map((item) => [item.id, item]));
  const commentPlan = new Map(plan.comments.map((item) => [item.id, item]));
  const activityPlan = new Map(plan.activities.map((item) => [item.id, item]));
  if (
    users.some(
      (item) =>
        item.email !== userPlan.get(item.id)?.email ||
        item.createdAt.getTime() !== userPlan.get(item.id)?.createdAt.getTime(),
    ) ||
    promotions.some(
      (item) =>
        item.name !== promotionPlan.get(item.id)?.name ||
        item.createdAt.getTime() !==
          promotionPlan.get(item.id)?.createdAt.getTime(),
    ) ||
    incidents.some(
      (item) =>
        item.promotionId !== incidentPlan.get(item.id)?.promotionId ||
        item.createdById !== incidentPlan.get(item.id)?.createdById ||
        item.originPhase !== incidentPlan.get(item.id)?.originPhase ||
        item.title !== incidentPlan.get(item.id)?.title ||
        item.createdAt.getTime() !==
          incidentPlan.get(item.id)?.createdAt.getTime(),
    ) ||
    comments.some(
      (item) =>
        item.incidentId !== commentPlan.get(item.id)?.incidentId ||
        item.authorId !== commentPlan.get(item.id)?.authorId ||
        item.body !== commentPlan.get(item.id)?.body ||
        item.createdAt.getTime() !==
          commentPlan.get(item.id)?.createdAt.getTime(),
    ) ||
    activities.some(
      (item) =>
        item.incidentId !== activityPlan.get(item.id)?.incidentId ||
        item.actorId !== activityPlan.get(item.id)?.actorId ||
        item.eventType !== activityPlan.get(item.id)?.eventType ||
        !isDeepStrictEqual(item.changes, activityPlan.get(item.id)?.changes) ||
        item.createdAt.getTime() !==
          activityPlan.get(item.id)?.createdAt.getTime(),
    )
  ) {
    throw new Error(OWNERSHIP_ERROR);
  }
  return { users, promotions, incidents, comments, activities };
}

async function assertNoOutsideReferences(
  transaction: Prisma.TransactionClient,
  plan: SeedPlan,
  owned: Awaited<ReturnType<typeof ownedRows>>,
): Promise<void> {
  const userIds = owned.users.map((item) => item.id);
  const promotionIds = owned.promotions.map((item) => item.id);
  const incidentIds = owned.incidents.map((item) => item.id);
  const ownedIncidentIds = new Set(incidentIds);
  const allowedPhaseKeys = new Set(
    plan.promotions.flatMap((promotion) =>
      promotion.phases.map((phase) => `${promotion.id}:${phase}`),
    ),
  );
  const allowedParticipants = new Map(
    plan.participants.map((item) => [
      `${item.promotionId}:${item.userId}`,
      item.joinedAt.getTime(),
    ]),
  );
  const [
    sessions,
    phases,
    participants,
    incidentReferences,
    commentReferences,
    activityReferences,
  ] = await Promise.all([
    transaction.session.findFirst({ where: { userId: { in: userIds } } }),
    transaction.promotionPhaseRecord.findMany({
      where: { promotionId: { in: promotionIds } },
    }),
    transaction.promotionParticipant.findMany({
      where: {
        OR: [
          { promotionId: { in: promotionIds } },
          { userId: { in: userIds } },
        ],
      },
    }),
    transaction.incident.findFirst({
      where: {
        id: { notIn: incidentIds },
        OR: [
          { promotionId: { in: promotionIds } },
          { createdById: { in: userIds } },
          { assignedToId: { in: userIds } },
          { solutionSubmittedById: { in: userIds } },
        ],
      },
    }),
    transaction.incidentComment.findFirst({
      where: {
        id: { notIn: owned.comments.map((item) => item.id) },
        OR: [
          { incidentId: { in: incidentIds } },
          { authorId: { in: userIds } },
        ],
      },
    }),
    transaction.incidentActivity.findFirst({
      where: {
        id: { notIn: owned.activities.map((item) => item.id) },
        OR: [{ incidentId: { in: incidentIds } }, { actorId: { in: userIds } }],
      },
    }),
  ]);
  if (
    sessions ||
    phases.some(
      (item) => !allowedPhaseKeys.has(`${item.promotionId}:${item.phase}`),
    ) ||
    participants.some(
      (item) =>
        allowedParticipants.get(`${item.promotionId}:${item.userId}`) !==
        item.joinedAt.getTime(),
    ) ||
    incidentReferences ||
    commentReferences ||
    activityReferences ||
    owned.comments.some((item) => !ownedIncidentIds.has(item.incidentId)) ||
    owned.activities.some((item) => !ownedIncidentIds.has(item.incidentId))
  ) {
    throw new Error(EXTERNAL_REFERENCE_ERROR);
  }
}

async function assertSeedUserChangeAllowed(
  transaction: Prisma.TransactionClient,
  current: Awaited<ReturnType<typeof ownedRows>>['users'][number],
  planned: SeedPlan['users'][number],
): Promise<void> {
  const ranks = { ADMIN: 2, MANAGER: 1, COLLABORATOR: 0 };
  if (planned.isActive === false || ranks[planned.role] < ranks[current.role]) {
    await assertResponsibilityReleased(transaction, planned.id);
  }
  if (
    current.isActive &&
    current.role === 'ADMIN' &&
    (!planned.isActive || planned.role !== 'ADMIN') &&
    (await transaction.user.count({
      where: { isActive: true, role: 'ADMIN' },
    })) <= 1
  ) {
    throw new Error(EXTERNAL_REFERENCE_ERROR);
  }
}

async function upsertSeedUsers(
  transaction: Prisma.TransactionClient,
  plan: SeedPlan,
  existingUsers: Awaited<ReturnType<typeof ownedRows>>['users'],
  hasher: PasswordHasher,
): Promise<void> {
  const byId = new Map(existingUsers.map((item) => [item.id, item]));
  for (const user of plan.users) {
    const current = byId.get(user.id);
    if (!current) {
      await transaction.user.create({
        data: { ...user, passwordHash: await hasher.hash(SEED_PASSWORD) },
      });
      continue;
    }
    const passwordMatches = await hasher
      .verify(current.passwordHash, SEED_PASSWORD)
      .catch(() => false);
    const detailsChanged =
      current.firstName !== user.firstName ||
      current.lastName !== user.lastName ||
      current.role !== user.role ||
      current.isActive !== user.isActive;
    if (!passwordMatches || detailsChanged) {
      await assertSeedUserChangeAllowed(transaction, current, user);
      await transaction.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          ...(!passwordMatches && {
            passwordHash: await hasher.hash(SEED_PASSWORD),
          }),
        },
      });
      if (user.isActive === false || user.role !== current.role) {
        await assertIndependentValidatorRemains(transaction, current);
      }
      await transaction.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}

export async function seedDevelopmentData(
  prisma: PrismaClient,
  options: { incidentCount: number },
): Promise<SeedSummary> {
  const plan = makeSeedPlan(options.incidentCount);
  const allPossible = makeSeedPlan(MAX_INCIDENT_COUNT);
  const hasher = new PasswordHasher();
  return prisma.$transaction(
    async (transaction) => {
      await lockUserAdministration(transaction);
      await lockSeed(transaction);
      await lockSeedPromotions(transaction, allPossible);
      const existing = await ownedRows(transaction, allPossible);
      const requestedIncidentIds = new Set(
        plan.incidents.map((item) => item.id),
      );
      if (
        existing.incidents.some((item) => !requestedIncidentIds.has(item.id))
      ) {
        throw new Error(
          'Para reducir la cantidad de incidencias, limpia primero el seed con confirmación explícita.',
        );
      }
      const emailCollisions = await transaction.user.findMany({
        where: { email: { in: plan.users.map((item) => item.email) } },
        select: { id: true, email: true },
      });
      if (
        emailCollisions.some(
          (item) =>
            plan.users.find((planned) => planned.email === item.email)?.id !==
            item.id,
        )
      ) {
        throw new Error(OWNERSHIP_ERROR);
      }
      await upsertSeedUsers(transaction, plan, existing.users, hasher);
      const existingPromotions = new Map(
        existing.promotions.map((item) => [item.id, item]),
      );
      for (const promotion of plan.promotions) {
        const current = existingPromotions.get(promotion.id);
        if (!current) {
          await transaction.promotion.create({
            data: {
              id: promotion.id,
              name: promotion.name,
              description: promotion.description,
              location: promotion.location,
              status: promotion.status,
              createdAt: promotion.createdAt,
              updatedAt: promotion.updatedAt,
              phases: {
                create: promotion.phases.map((phase) => ({ phase })),
              },
            },
          });
        } else if (
          current.name !== promotion.name ||
          current.description !== promotion.description ||
          current.location !== promotion.location ||
          current.status !== promotion.status
        ) {
          await transaction.promotion.update({
            where: { id: promotion.id },
            data: {
              name: promotion.name,
              description: promotion.description,
              location: promotion.location,
              status: promotion.status,
            },
          });
        }
      }
      const existingPhases = await transaction.promotionPhaseRecord.findMany({
        where: { promotionId: { in: plan.promotions.map((item) => item.id) } },
      });
      const existingPhaseKeys = new Set(
        existingPhases.map((item) => `${item.promotionId}:${item.phase}`),
      );
      const plannedPhaseKeys = new Set(
        plan.promotions.flatMap((promotion) =>
          promotion.phases.map((phase) => `${promotion.id}:${phase}`),
        ),
      );
      if (
        existingPhases.some(
          (item) => !plannedPhaseKeys.has(`${item.promotionId}:${item.phase}`),
        )
      ) {
        throw new Error(EXTERNAL_REFERENCE_ERROR);
      }
      const newPhases = plan.promotions.flatMap((promotion) =>
        promotion.phases
          .filter((phase) => !existingPhaseKeys.has(`${promotion.id}:${phase}`))
          .map((phase) => ({ promotionId: promotion.id, phase })),
      );
      if (newPhases.length > 0)
        await transaction.promotionPhaseRecord.createMany({ data: newPhases });
      const existingParticipants =
        await transaction.promotionParticipant.findMany({
          where: {
            promotionId: { in: plan.promotions.map((item) => item.id) },
          },
        });
      const participantKeys = new Set(
        existingParticipants.map(
          (item) => `${item.promotionId}:${item.userId}`,
        ),
      );
      const newParticipants = plan.participants.filter(
        (item) => !participantKeys.has(`${item.promotionId}:${item.userId}`),
      );
      if (newParticipants.length > 0)
        await transaction.promotionParticipant.createMany({
          data: newParticipants,
        });
      const existingIncidentIds = new Set(
        existing.incidents.map((item) => item.id),
      );
      const newIncidents = plan.incidents.filter(
        (item) => !existingIncidentIds.has(item.id),
      );
      if (newIncidents.length > 0)
        await transaction.incident.createMany({ data: newIncidents });
      const existingActivityIds = new Set(
        existing.activities.map((item) => item.id),
      );
      const newActivities = plan.activities.filter(
        (item) => !existingActivityIds.has(item.id),
      );
      if (newActivities.length > 0)
        await transaction.incidentActivity.createMany({ data: newActivities });
      const existingCommentIds = new Set(
        existing.comments.map((item) => item.id),
      );
      const newComments = plan.comments.filter(
        (item) => !existingCommentIds.has(item.id),
      );
      if (newComments.length > 0)
        await transaction.incidentComment.createMany({ data: newComments });
      return summary(plan);
    },
    { timeout: 30_000 },
  );
}

export async function cleanDevelopmentData(
  prisma: PrismaClient,
): Promise<SeedSummary> {
  const plan = makeSeedPlan(MAX_INCIDENT_COUNT);
  return prisma.$transaction(
    async (transaction) => {
      await lockUserAdministration(transaction);
      await lockSeed(transaction);
      await lockSeedPromotions(transaction, plan);
      const owned = await ownedRows(transaction, plan);
      await assertNoOutsideReferences(transaction, plan, owned);
      await transaction.incidentComment.deleteMany({
        where: { id: { in: owned.comments.map((item) => item.id) } },
      });
      await transaction.incidentActivity.deleteMany({
        where: { id: { in: owned.activities.map((item) => item.id) } },
      });
      await transaction.incident.deleteMany({
        where: { id: { in: owned.incidents.map((item) => item.id) } },
      });
      await transaction.promotionParticipant.deleteMany({
        where: {
          OR: plan.participants.map((item) => ({
            promotionId: item.promotionId,
            userId: item.userId,
            joinedAt: item.joinedAt,
          })),
        },
      });
      await transaction.promotionPhaseRecord.deleteMany({
        where: { promotionId: { in: owned.promotions.map((item) => item.id) } },
      });
      await transaction.promotion.deleteMany({
        where: { id: { in: owned.promotions.map((item) => item.id) } },
      });
      await transaction.user.deleteMany({
        where: { id: { in: owned.users.map((item) => item.id) } },
      });
      return {
        users: owned.users.length,
        promotions: owned.promotions.length,
        incidents: owned.incidents.length,
        comments: owned.comments.length,
      };
    },
    { timeout: 30_000 },
  );
}
