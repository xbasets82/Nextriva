import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertPromotionVisible } from '../promotions/promotion-participant.policy.js';
import type { PrismaClient, UserRole } from '../../generated/prisma/client.js';
import type { NewIncident } from './incident.validation.js';

export class IncidentsStore {
  private client?: PrismaClient;
  constructor(private readonly source: () => PrismaClient) {}
  private get prisma(): PrismaClient {
    this.client ??= this.source();
    return this.client;
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
          where: {
            id,
            ...(actor?.role === 'ADMIN'
              ? {}
              : { promotion: { participants: { some: { userId: actorId } } } }),
            ...(actor?.role === 'COLLABORATOR' ? { createdById: actorId } : {}),
          },
          include: {
            activities: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
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
