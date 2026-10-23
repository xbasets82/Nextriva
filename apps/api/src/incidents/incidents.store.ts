import { lockUserAdministration } from '../users/users-management.store.js';
import {
  assignmentActivity,
  assertAssignmentAllowed,
  assertEligibleAssignee,
} from './incident.assignment.js';
import {
  assertReviewActor,
  assertIncidentSolutionActor,
  assertIncidentSolutionDraftAllowed,
  assertIncidentStartActor,
  assertIncidentTransition,
} from './incident.state.js';
import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertPromotionVisible } from '../promotions/promotion-participant.policy.js';
import type {
  IncidentComment,
  Prisma,
  PrismaClient,
  UserRole,
} from '../../generated/prisma/client.js';
import type { NewIncident } from './incident.validation.js';

const commentAuthor = {
  select: { firstName: true, lastName: true },
} as const;

function presentComment({
  author,
  ...comment
}: IncidentComment & { author: { firstName: string; lastName: string } }) {
  return { ...comment, authorName: `${author.firstName} ${author.lastName}` };
}

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
      ...(role === 'COLLABORATOR'
        ? { OR: [{ createdById: actorId }, { assignedToId: actorId }] }
        : {}),
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
            promotion: { select: { status: true } },
            assignedTo: {
              select: { id: true, firstName: true, lastName: true },
            },
            activities: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            comments: {
              include: { author: commentAuthor },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        const { promotion, ...details } = incident;
        return {
          ...details,
          promotionStatus: promotion.status,
          comments: incident.comments.map(presentComment),
        };
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
        const comment = await transaction.incidentComment.create({
          data: { incidentId: id, authorId: actorId, body },
          include: { author: commentAuthor },
        });
        return presentComment(comment);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Creación de comentario no disponible',
      );
    }
  }
  async eligibleAssignees(actorId: string, id: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const reference = await transaction.incident.findUnique({
          where: { id },
          select: { promotionId: true },
        });
        if (!reference) throw new NotFoundException('Incidencia no encontrada');
        await transaction.$queryRaw`SELECT id FROM promotions WHERE id = ${reference.promotionId}::uuid FOR SHARE`;
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        const incident = await transaction.incident.findFirst({
          where: { id, ...this.visibility(actorId, actor?.role) },
          include: { promotion: { select: { status: true } } },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        assertAssignmentAllowed(
          actor!.role,
          incident.status,
          incident.promotion.status,
        );
        return transaction.user.findMany({
          where: {
            isActive: true,
            OR: [
              { role: 'ADMIN' },
              {
                promotionParticipants: {
                  some: { promotionId: incident.promotionId },
                },
              },
            ],
          },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta de responsables no disponible',
      );
    }
  }
  async assign(
    actorId: string,
    id: string,
    input: { assignedToId: string; version: number },
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Comparte el cerrojo de I02 antes de comprobar elegibilidad y escribir responsabilidad.
        await lockUserAdministration(transaction);
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
        assertAssignmentAllowed(
          actor!.role,
          incident.status,
          incident.promotion.status,
        );
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        const [target] = await transaction.$queryRaw<
          Array<{ role: UserRole; isActive: boolean }>
        >`SELECT role, is_active AS "isActive" FROM users WHERE id = ${input.assignedToId}::uuid FOR SHARE`;
        const linked = await transaction.promotionParticipant.findUnique({
          where: {
            promotionId_userId: {
              promotionId: incident.promotionId,
              userId: input.assignedToId,
            },
          },
        });
        assertEligibleAssignee(target, Boolean(linked));
        const activity = assignmentActivity(
          incident.assignedToId,
          input.assignedToId,
        );
        if (activity === undefined)
          return transaction.incident.findUniqueOrThrow({ where: { id } });
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version },
          data: { assignedToId: input.assignedToId, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await transaction.incidentActivity.create({
          data: {
            incidentId: id,
            actorId,
            ...activity,
          },
        });
        return transaction.incident.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Asignación de responsable no disponible',
      );
    }
  }
  async start(actorId: string, id: string, input: { version: number }) {
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
        assertIncidentStartActor({
          actorId,
          actorRole: actor!.role,
          assignedToId: incident.assignedToId,
        });
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        assertIncidentTransition({
          from: incident.status,
          to: 'IN_PROGRESS',
          actorId,
          actorRole: actor!.role,
          promotionStatus: incident.promotion.status,
          assignedToId: incident.assignedToId,
          presentedById: null,
          solution: '',
          hasIndependentValidator: false,
          rejectionReason: '',
        });
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, status: 'OPEN' },
          data: { status: 'IN_PROGRESS', version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await transaction.incidentActivity.create({
          data: {
            incidentId: id,
            actorId,
            eventType: 'STATUS_CHANGED',
            changes: { previousStatus: 'OPEN', status: 'IN_PROGRESS' },
          },
        });
        return transaction.incident.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Inicio de incidencia no disponible',
      );
    }
  }
  async saveSolution(
    actorId: string,
    id: string,
    input: { solution: string; version: number },
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockUserAdministration(transaction);
        const reference = await transaction.incident.findUnique({
          where: { id },
          select: { promotionId: true },
        });
        if (!reference) throw new NotFoundException('Incidencia no encontrada');
        await transaction.$queryRaw`SELECT id FROM promotions WHERE id = ${reference.promotionId}::uuid FOR UPDATE`;
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        const linked = await transaction.promotionParticipant.findUnique({
          where: {
            promotionId_userId: {
              promotionId: reference.promotionId,
              userId: actorId,
            },
          },
          select: { userId: true },
        });
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          Boolean(linked),
        );
        await transaction.$queryRaw`SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
        const incident = await transaction.incident.findFirst({
          where: { id, ...this.visibility(actorId, actor?.role) },
          include: { promotion: { select: { status: true } } },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        assertIncidentSolutionActor({
          actorId,
          assignedToId: incident.assignedToId,
        });
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        assertIncidentSolutionDraftAllowed({
          actorId,
          assignedToId: incident.assignedToId,
          status: incident.status,
          promotionStatus: incident.promotion.status,
        });
        const solution = input.solution === '' ? null : input.solution;
        if (incident.solution === solution)
          return transaction.incident.findUniqueOrThrow({ where: { id } });
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, status: 'IN_PROGRESS' },
          data: { solution, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await transaction.incidentActivity.create({
          data: {
            incidentId: id,
            actorId,
            eventType: 'SOLUTION_UPDATED',
            changes: {
              previousSolution: incident.solution,
              solution,
            },
          },
        });
        return transaction.incident.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Guardado de solución no disponible',
      );
    }
  }

  async submitSolution(
    actorId: string,
    id: string,
    input: { version: number },
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockUserAdministration(transaction);
        const reference = await transaction.incident.findUnique({
          where: { id },
          select: { promotionId: true },
        });
        if (!reference) throw new NotFoundException('Incidencia no encontrada');
        await transaction.$queryRaw`SELECT id FROM promotions WHERE id = ${reference.promotionId}::uuid FOR UPDATE`;
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        const linked = await transaction.promotionParticipant.findUnique({
          where: {
            promotionId_userId: {
              promotionId: reference.promotionId,
              userId: actorId,
            },
          },
          select: { userId: true },
        });
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          Boolean(linked),
        );
        await transaction.$queryRaw`SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
        const incident = await transaction.incident.findFirst({
          where: { id, ...this.visibility(actorId, actor?.role) },
          include: { promotion: { select: { status: true } } },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        assertIncidentSolutionActor({
          actorId,
          assignedToId: incident.assignedToId,
        });
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        const hasIndependentValidator = Boolean(
          await transaction.user.findFirst({
            where: {
              isActive: true,
              id: { not: actorId },
              OR: [
                { role: 'ADMIN' },
                {
                  role: 'MANAGER',
                  promotionParticipants: {
                    some: { promotionId: incident.promotionId },
                  },
                },
              ],
            },
            select: { id: true },
          }),
        );
        assertIncidentTransition({
          from: incident.status,
          to: 'PENDING_VALIDATION',
          actorId,
          actorRole: actor!.role,
          promotionStatus: incident.promotion.status,
          assignedToId: incident.assignedToId,
          presentedById: actorId,
          solution: incident.solution ?? '',
          hasIndependentValidator,
          rejectionReason: '',
        });
        const submittedAt = new Date();
        const changed = await transaction.incident.updateMany({
          where: {
            id,
            version: input.version,
            status: 'IN_PROGRESS',
            assignedToId: actorId,
          },
          data: {
            status: 'PENDING_VALIDATION',
            solutionSubmittedById: actorId,
            solutionSubmittedAt: submittedAt,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await transaction.incidentActivity.create({
          data: {
            incidentId: id,
            actorId,
            eventType: 'SOLUTION_SUBMITTED',
            changes: {
              previousStatus: 'IN_PROGRESS',
              status: 'PENDING_VALIDATION',
              solution: incident.solution,
            },
          },
        });
        return transaction.incident.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Envío de solución no disponible');
    }
  }

  async approveSolution(
    actorId: string,
    id: string,
    input: { version: number },
  ) {
    return this.reviewSolution(actorId, id, input);
  }

  async rejectSolution(
    actorId: string,
    id: string,
    input: { version: number; reason: string },
  ) {
    return this.reviewSolution(actorId, id, input);
  }

  private async reviewSolution(
    actorId: string,
    id: string,
    input: { version: number; reason?: string },
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockUserAdministration(transaction);
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
        const transition = {
          from: incident.status,
          to: input.reason === undefined ? 'CLOSED' : 'IN_PROGRESS',
          actorId,
          actorRole: actor!.role,
          promotionStatus: incident.promotion.status,
          assignedToId: incident.assignedToId,
          presentedById: incident.solutionSubmittedById,
          solution: incident.solution ?? '',
          hasIndependentValidator: true,
          rejectionReason: input.reason ?? '',
        };
        // Tras un rechazo, ya no existe presentación vigente: la repetición autorizada sigue siendo un conflicto.
        assertReviewActor(transition);
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        assertIncidentTransition(transition);
        const approving = input.reason === undefined;
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, status: 'PENDING_VALIDATION' },
          data: {
            status: approving ? 'CLOSED' : 'IN_PROGRESS',
            validatedById: approving ? actorId : null,
            closedAt: approving ? new Date() : null,
            ...(approving
              ? {}
              : { solutionSubmittedById: null, solutionSubmittedAt: null }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await transaction.incidentActivity.create({
          data: {
            incidentId: id,
            actorId,
            eventType: 'STATUS_CHANGED',
            changes: {
              previousStatus: 'PENDING_VALIDATION',
              status: approving ? 'CLOSED' : 'IN_PROGRESS',
              ...(approving
                ? {}
                : {
                    solution: incident.solution,
                    solutionSubmittedById: incident.solutionSubmittedById,
                    solutionSubmittedAt:
                      incident.solutionSubmittedAt!.toISOString(),
                    reason: input.reason!,
                  }),
            },
          },
        });
        return transaction.incident.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Validación de solución no disponible',
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
