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
import type {
  NewPromotion,
  PromotionPhase,
  PromotionChanges,
  PromotionStatus,
} from './promotion.validation.js';

const phasesInclude = {
  phases: { select: { phase: true as const } },
} as const;

type PromotionRecord = Prisma.PromotionGetPayload<{
  include: { phases: { select: { phase: true } } };
}>;

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
    return this.asAdministrator(actorId, async (transaction) => {
      const records = await transaction.promotion.findMany({
        include: phasesInclude,
      });
      return records.map(projectPromotion);
    });
  }

  async get(actorId: string, id: string) {
    return this.asAdministrator(actorId, async (transaction) => {
      const record = await transaction.promotion.findUnique({
        where: { id },
        include: phasesInclude,
      });
      if (!record) throw new NotFoundException('Promoción no encontrada');
      return projectPromotion(record);
    });
  }

  async edit(actorId: string, id: string, changes: PromotionChanges) {
    return this.asAdministrator(actorId, async (transaction) => {
      const current = await this.lockPromotion(transaction, id);
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
    });
  }

  async setStatus(actorId: string, id: string, status: PromotionStatus) {
    return this.asAdministrator(actorId, async (transaction) => {
      await this.lockPromotion(transaction, id);
      const updated = await transaction.promotion.update({
        where: { id },
        data: { status, updatedAt: new Date() },
        include: phasesInclude,
      });
      return projectPromotion(updated);
    });
  }
}
