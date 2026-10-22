import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertPromotionVisible } from '../promotions/promotion-participant.policy.js';
import type {
  Prisma,
  PrismaClient,
  UserRole,
} from '../../generated/prisma/client.js';
import type { NewIncident } from './incident.validation.js';

export class IncidentsStore {
  private client?: PrismaClient;
  constructor(private readonly source: () => PrismaClient) {}
  private get prisma(): PrismaClient {
    this.client ??= this.source();
    return this.client;
  }
  private visibility(
    actorId: string,
    role: UserRole | undefined,
  ): Prisma.IncidentWhereInput {
    if (role === 'ADMIN') return {};
    return {
      promotion: { participants: { some: { userId: actorId } } },
      ...(role === 'COLLABORATOR' ? { createdById: actorId } : {}),
    };
  }
  async list(actorId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        return transaction.incident.findMany({
          where: this.visibility(actorId, actor?.role),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta de incidencias no disponible',
      );
    }
  }
  async get(actorId: string, id: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        const incident = await transaction.incident.findFirst({
          where: { id, ...this.visibility(actorId, actor?.role) },
          include: {
            activities: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            comments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        return incident;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta de incidencia no disponible',
      );
    }
  }
  async comment(actorId: string, id: string, body: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const reference = await transaction.incident.findUnique({
          where: { id },
          select: { promotionId: true },
        });
        if (!reference) throw new NotFoundException('Incidencia no encontrada');
        await transaction.$queryRaw`SELECT id FROM promotions WHERE id = ${reference.promotionId}::uuid FOR UPDATE`;
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        await transaction.$queryRaw`SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
        const incident = await transaction.incident.findFirst({
          where: { id, ...this.visibility(actorId, actor?.role) },
          include: { promotion: { select: { status: true } } },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        if (
          incident.status === 'CLOSED' ||
          incident.promotion.status !== 'ACTIVE'
        )
          throw new ConflictException(
            'La incidencia cerrada o promoción archivada no admite comentarios',
          );
        return transaction.incidentComment.create({
          data: { incidentId: id, authorId: actorId, body },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Creación de comentario no disponible',
      );
    }
  }
  async create(actorId: string, input: NewIncident) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [promotion] = await transaction.$queryRaw<
          Array<{ id: string; status: string }>
        >`SELECT id, status FROM promotions WHERE id = ${input.promotionId}::uuid FOR UPDATE`;
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        const linked = await transaction.promotionParticipant.findUnique({
          where: {
            promotionId_userId: {
              promotionId: input.promotionId,
              userId: actorId,
            },
          },
          select: { userId: true },
        });
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          Boolean(linked),
        );
        if (!promotion) throw new NotFoundException('Promoción no encontrada');
        if (promotion.status !== 'ACTIVE')
          throw new ConflictException(
            'La promoción archivada no admite incidencias',
          );
        const incident = await transaction.incident.create({
          data: {
            promotionId: input.promotionId,
            originPhase: input.originPhase,
            title: input.title,
            description: input.description,
            category: input.category,
            priority: input.priority,
            createdById: actorId,
          },
        });
        await transaction.incidentActivity.create({
          data: {
            incidentId: incident.id,
            actorId,
            eventType: 'CREATED',
            changes: { originPhase: input.originPhase },
          },
        });
        return incident;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Creación de incidencias no disponible',
      );
    }
  }
}
