import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { PROMOTION_PHASES } from './promotion.validation.js';
import {
  assertParticipantAdditionAllowed,
  assertParticipantManagement,
  assertPromotionVisible,
} from './promotion-participant.policy.js';
import type {
  NewPromotion,
  PromotionPhase,
  PromotionChanges,
  PromotionStatus,
} from './promotion.validation.js';

const phasesInclude = {
  phases: { select: { phase: true as const } },
} as const;

const participantUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
} as const;

type PromotionRecord = Prisma.PromotionGetPayload<{
  include: { phases: { select: { phase: true } } };
}>;

type PromotionActor = {
  id: string;
  role: 'ADMIN' | 'MANAGER' | 'COLLABORATOR';
  isActive: boolean;
};

function projectPromotion(record: PromotionRecord) {
  const phases = record.phases.map(({ phase }) => phase);
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    location: record.location,
    status: record.status,
    phases: [...phases].sort(
      (left: PromotionPhase, right: PromotionPhase) =>
        PROMOTION_PHASES.indexOf(left) - PROMOTION_PHASES.indexOf(right),
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function databaseCode(
  error: unknown,
  seen = new Set<object>(),
): string | undefined {
  if (typeof error !== 'object' || error === null || seen.has(error))
    return undefined;
  seen.add(error);
  const sqlState = Reflect.get(error, 'sqlState');
  if (typeof sqlState === 'string') return sqlState;
  const code = Reflect.get(error, 'code');
  if (typeof code === 'string' && code !== 'P2010' && code !== 'P2028')
    return code;
  const meta = Reflect.get(error, 'meta');
  if (typeof meta === 'object' && meta !== null) {
    const nested = Reflect.get(meta, 'code');
    if (typeof nested === 'string') return nested;
  }
  const cause = databaseCode(Reflect.get(error, 'cause'), seen);
  if (cause !== undefined) return cause;
  const message = Reflect.get(error, 'message');
  if (typeof message === 'string')
    return message.match(/Code: `([A-Z0-9]{5})`/)?.[1];
  return undefined;
}

export class PromotionsStore {
  private client?: PrismaClient;

  constructor(private readonly source: PrismaClient | (() => PrismaClient)) {}

  private get prisma(): PrismaClient {
    this.client ??=
      typeof this.source === 'function' ? this.source() : this.source;
    return this.client;
  }

  private async actorForShare(
    transaction: Prisma.TransactionClient,
    actorId: string,
  ) {
    const [actor] = await transaction.$queryRaw<
      Array<{
        id: string;
        role: 'ADMIN' | 'MANAGER' | 'COLLABORATOR';
        isActive: boolean;
      }>
    >`
      SELECT "id", "role", "is_active" AS "isActive"
      FROM "users"
      WHERE "id" = ${actorId}::uuid
      FOR SHARE
    `;
    if (!actor?.isActive)
      throw new ForbiddenException('Operación no permitida');
    return actor;
  }

  private async targetForShare(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    const [target] = await transaction.$queryRaw<
      Array<{
        role: 'ADMIN' | 'MANAGER' | 'COLLABORATOR';
        isActive: boolean;
      }>
    >`
      SELECT "role", "is_active" AS "isActive"
      FROM "users"
      WHERE "id" = ${userId}::uuid
      FOR SHARE
    `;
    return target;
  }

  private async asActiveActor<T>(
    actorId: string,
    operation: (
      transaction: Prisma.TransactionClient,
      actor: PromotionActor,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.actorForShare(transaction, actorId);
        return operation(transaction, actor);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Gestión de promociones no disponible',
      );
    }
  }

  private async asAdministrator<T>(
    actorId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const actor = await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "users"
            WHERE "id" = ${actorId}::uuid
              AND "is_active" = true
              AND "role" = 'ADMIN'::"user_role"
            FOR SHARE
          `;
          if (actor.length === 0)
            throw new ForbiddenException('Operación no permitida');
          return operation(transaction);
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = databaseCode(error);
      if (code === '23514')
        throw new BadRequestException(
          'Una promoción activa debe tener al menos una fase',
        );
      if (code === '23505' || code === 'P2002')
        throw new ConflictException('Conflicto de integridad de promoción');
      throw new ServiceUnavailableException(
        'Gestión de promociones no disponible',
      );
    }
  }

  private async lockPromotion(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<PromotionRecord> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "promotions" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    if (rows.length === 0)
      throw new NotFoundException('Promoción no encontrada');
    const record = await transaction.promotion.findUnique({
      where: { id },
      include: phasesInclude,
    });
    if (!record) throw new NotFoundException('Promoción no encontrada');
    return record;
  }

  async create(actorId: string, input: NewPromotion) {
    return this.asAdministrator(actorId, async (transaction) =>
      projectPromotion(
        await transaction.promotion.create({
          data: {
            name: input.name,
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.location === undefined
              ? {}
              : { location: input.location }),
            phases: {
              create: input.phases.map((phase) => ({ phase })),
            },
          },
          include: phasesInclude,
        }),
      ),
    );
  }

  async list(actorId: string) {
    return this.asActiveActor(actorId, async (transaction, actor) => {
      const records = await transaction.promotion.findMany({
        where:
          actor.role === 'ADMIN'
            ? {}
            : { participants: { some: { userId: actor.id } } },
        include: phasesInclude,
      });
      return records.map(projectPromotion);
    });
  }

  async get(actorId: string, id: string) {
    return this.asActiveActor(actorId, async (transaction, actor) => {
      const record = await transaction.promotion.findFirst({
        where: {
          id,
          ...(actor.role === 'ADMIN'
            ? {}
            : { participants: { some: { userId: actor.id } } }),
        },
        include: phasesInclude,
      });
      if (!record) throw new NotFoundException('Promoción no encontrada');
      return projectPromotion(record);
    });
  }

  async edit(actorId: string, id: string, changes: PromotionChanges) {
    return this.asPromotionAdministrator(
      actorId,
      id,
      async (transaction, current) => {
        if (current.status === 'ARCHIVED')
          throw new ConflictException(
            'La promoción archivada no se puede editar',
          );

        if (changes.phases) {
          await transaction.promotionPhaseRecord.deleteMany({
            where: { promotionId: id },
          });
          await transaction.promotionPhaseRecord.createMany({
            data: changes.phases.map((phase) => ({ promotionId: id, phase })),
          });
        }

        const updated = await transaction.promotion.update({
          where: { id },
          data: {
            ...(changes.name === undefined ? {} : { name: changes.name }),
            ...(changes.description === undefined
              ? {}
              : { description: changes.description }),
            ...(changes.location === undefined
              ? {}
              : { location: changes.location }),
            updatedAt: new Date(),
          },
          include: phasesInclude,
        });
        return projectPromotion(updated);
      },
    );
  }

  async setStatus(actorId: string, id: string, status: PromotionStatus) {
    return this.asPromotionAdministrator(actorId, id, async (transaction) => {
      const updated = await transaction.promotion.update({
        where: { id },
        data: { status, updatedAt: new Date() },
        include: phasesInclude,
      });
      return projectPromotion(updated);
    });
  }

  private async asPromotionAdministrator<T>(
    actorId: string,
    promotionId: string,
    operation: (
      transaction: Prisma.TransactionClient,
      promotion: PromotionRecord,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const promotion = await this.lockPromotion(transaction, promotionId);
        const actor = await this.actorForShare(transaction, actorId);
        const isLinked = await this.isLinked(transaction, promotionId, actorId);
        assertPromotionVisible(actor, isLinked);
        if (actor.role !== 'ADMIN')
          throw new ForbiddenException('Operación no permitida');
        return operation(transaction, promotion);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = databaseCode(error);
      if (code === '23514')
        throw new BadRequestException(
          'Una promoción activa debe tener al menos una fase',
        );
      if (code === '23505' || code === 'P2002')
        throw new ConflictException('Conflicto de integridad de promoción');
      throw new ServiceUnavailableException(
        'Gestión de promociones no disponible',
      );
    }
  }

  async listParticipants(actorId: string, promotionId: string) {
    return this.asActiveActor(actorId, async (transaction, actor) => {
      await this.visiblePromotion(transaction, actor, promotionId);
      return transaction.promotionParticipant.findMany({
        where: { promotionId },
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        select: {
          joinedAt: true,
          user: { select: participantUserSelect },
        },
      });
    });
  }

  async eligibleParticipants(actorId: string, promotionId: string) {
    return this.asActiveActor(actorId, async (transaction, actor) => {
      await this.visiblePromotion(transaction, actor, promotionId);
      assertParticipantManagement(actor, true, {
        role: 'COLLABORATOR',
        isActive: true,
      });
      return transaction.user.findMany({
        where: {
          role: 'COLLABORATOR',
          isActive: true,
          promotionParticipants: { none: { promotionId } },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      });
    });
  }

  async addParticipant(actorId: string, promotionId: string, userId: string) {
    return this.withParticipantMutation(async (transaction) => {
      const promotion = await this.lockPromotion(transaction, promotionId);
      const actor = await this.actorForShare(transaction, actorId);
      const isLinked = await this.isLinked(transaction, promotionId, actorId);
      const target = await this.targetForShare(transaction, userId);
      assertParticipantManagement(
        actor,
        isLinked,
        target ?? { role: 'COLLABORATOR', isActive: false },
      );
      assertParticipantAdditionAllowed(target ?? undefined, promotion.status);
      const participant = await transaction.promotionParticipant.create({
        data: { promotionId, userId },
        select: {
          joinedAt: true,
          user: { select: participantUserSelect },
        },
      });
      return participant;
    });
  }

  async removeParticipant(
    actorId: string,
    promotionId: string,
    userId: string,
  ): Promise<void> {
    await this.withParticipantMutation(async (transaction) => {
      await this.lockPromotion(transaction, promotionId);
      const actor = await this.actorForShare(transaction, actorId);
      const isLinked = await this.isLinked(transaction, promotionId, actorId);
      const target = await this.targetForShare(transaction, userId);
      assertParticipantManagement(
        actor,
        isLinked,
        target ?? { role: 'COLLABORATOR', isActive: false },
      );
      const existing = await transaction.promotionParticipant.findUnique({
        where: { promotionId_userId: { promotionId, userId } },
        select: { userId: true },
      });
      if (!existing) throw new NotFoundException('Participante no encontrado');
      await transaction.promotionParticipant.delete({
        where: { promotionId_userId: { promotionId, userId } },
      });
    });
  }

  private async isLinked(
    transaction: Prisma.TransactionClient,
    promotionId: string,
    userId: string,
  ): Promise<boolean> {
    return Boolean(
      await transaction.promotionParticipant.findUnique({
        where: { promotionId_userId: { promotionId, userId } },
        select: { userId: true },
      }),
    );
  }

  private async visiblePromotion(
    transaction: Prisma.TransactionClient,
    actor: PromotionActor,
    promotionId: string,
  ) {
    const [promotion] = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "promotions"
      WHERE "id" = ${promotionId}::uuid
      FOR SHARE
    `;
    const isLinked = await this.isLinked(transaction, promotionId, actor.id);
    assertPromotionVisible(actor, Boolean(promotion) && isLinked);
    if (!promotion) throw new NotFoundException('Promoción no encontrada');
    return promotion;
  }

  private async withParticipantMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = databaseCode(error);
      if (code === '23505' || code === 'P2002')
        throw new ConflictException('El participante ya está vinculado');
      if (code === '23503' || code === 'P2003')
        throw new ConflictException('La vinculación no se puede guardar');
      throw new ServiceUnavailableException(
        'Gestión de participantes no disponible',
      );
    }
  }
}
