import {
  incidentPersonSelect,
  presentIncidentIdentity,
  redactIncidentHistory,
  historyObject,
  historicalIdentity,
} from './incident.identity.js';
import { approvedCycleSnapshot } from './incident.reopen.js';
import {
  incidentVisibility,
  personalCounts,
  type PersonalPriorityItem,
} from './personal-summary.js';
import { assertIncidentDeletionAllowed } from './incident.soft-delete.js';
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
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertPromotionVisible } from '../promotions/promotion-participant.policy.js';
import type {
  IncidentComment,
  Incident,
  Prisma,
  PrismaClient,
  UserRole,
} from '../../generated/prisma/client.js';
import type { IncidentListQuery, NewIncident } from './incident.validation.js';

function presentOperationalIncident<T extends Incident>(incident: T) {
  const result = { ...incident };
  Reflect.deleteProperty(result, 'deletedAt');
  Reflect.deleteProperty(result, 'deletedById');
  Reflect.deleteProperty(result, 'deletionReason');
  return result;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

const commentAuthor = {
  select: { firstName: true, lastName: true },
} as const;

function presentComment({
  author,
  ...comment
}: IncidentComment & { author: { firstName: string; lastName: string } }) {
  return { ...comment, authorName: `${author.firstName} ${author.lastName}` };
}

function incidentOrderBy(
  query: IncidentListQuery,
): Prisma.IncidentOrderByWithRelationInput[] {
  const direction = query.sortDirection;
  if (query.sortBy === 'priority' && direction)
    return [{ priority: direction }, { createdAt: 'desc' }, { id: 'desc' }];
  if (query.sortBy === 'status' && direction)
    return [{ status: direction }, { createdAt: 'desc' }, { id: 'desc' }];
  if (query.sortBy === 'createdAt' && direction)
    return [{ createdAt: direction }, { id: 'desc' }];
  return [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
}

export class IncidentsStore {
  private client?: PrismaClient;
  constructor(private readonly source: () => PrismaClient) {}
  private get prisma(): PrismaClient {
    this.client ??= this.source();
    return this.client;
  }
  private recordActivity(
    transaction: Prisma.TransactionClient,
    data: Prisma.IncidentActivityUncheckedCreateInput,
  ) {
    return transaction.incidentActivity.create({ data });
  }
  private visibility(
    actorId: string,
    role: UserRole | undefined,
  ): Prisma.IncidentWhereInput {
    return { ...incidentVisibility(actorId, role).where, deletedAt: null };
  }
  async list(
    actorId: string,
    query: IncidentListQuery = { page: 1, pageSize: 20 },
    deleted = false,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [actor] = await transaction.$queryRaw<
          Array<{ id: string; role: UserRole; isActive: boolean }>
        >`SELECT id, role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        if (deleted && actor!.role !== 'ADMIN' && actor!.role !== 'MANAGER')
          throw new ForbiddenException('Operación no permitida');
        const clauses: Prisma.IncidentWhereInput[] = [
          incidentVisibility(actorId, actor?.role).where,
          { deletedAt: deleted ? { not: null } : null },
        ];
        if (query.q) {
          const searchPattern = escapeLikePattern(query.q);
          clauses.push({
            OR: [
              {
                publicCode: {
                  contains: searchPattern,
                  mode: 'insensitive',
                },
              },
              { title: { contains: searchPattern, mode: 'insensitive' } },
            ],
          });
        }
        if (query.promotionId) clauses.push({ promotionId: query.promotionId });
        if (query.status) clauses.push({ status: query.status });
        if (query.priority) clauses.push({ priority: query.priority });
        if (query.category) clauses.push({ category: query.category });
        if (query.assignedToId)
          clauses.push({ assignedToId: query.assignedToId });

        const where: Prisma.IncidentWhereInput = { AND: clauses };
        const total = await transaction.incident.count({ where });
        const items = await transaction.incident.findMany({
          where,
          orderBy: incidentOrderBy(query),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          ...(deleted
            ? {
                include: {
                  deletedBy: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              }
            : {}),
        });
        return {
          items: deleted ? items : items.map(presentOperationalIncident),
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta de incidencias no disponible',
      );
    }
  }
  async listDeleted(actorId: string, query: IncidentListQuery) {
    return this.list(actorId, query, true);
  }

  async softDelete(
    actorId: string,
    id: string,
    input: { version: number; reason: string },
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
        // El ámbito histórico permite distinguir repetición autorizada sin reabrir rutas operativas.
        const incident = await transaction.incident.findFirst({
          where: { id, ...incidentVisibility(actorId, actor?.role).where },
          include: { promotion: { select: { status: true } } },
        });
        if (!incident) throw new NotFoundException('Incidencia no encontrada');
        if (actor!.role === 'COLLABORATOR' && incident.deletedAt)
          throw new NotFoundException('Incidencia no encontrada');
        assertIncidentDeletionAllowed(
          actor!.role,
          incident.status,
          incident.promotion.status,
        );
        if (incident.deletedAt || incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        const deletedAt = new Date();
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, deletedAt: null },
          data: {
            deletedAt,
            deletedById: actorId,
            deletionReason: input.reason,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'DELETED',
          createdAt: deletedAt,
          changes: { previousStatus: incident.status, reason: input.reason },
        });
        return transaction.incident.findUniqueOrThrow({
          where: { id },
          include: {
            deletedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Eliminación de incidencia no disponible',
      );
    }
  }

  async personalSummary(actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const [actor] = await transaction.$queryRaw<
            Array<{ role: UserRole; isActive: boolean }>
          >`SELECT role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
          assertPromotionVisible(
            actor ?? { role: 'COLLABORATOR', isActive: false },
            true,
          );
          const scope = incidentVisibility(actorId, actor?.role);
          const groups = await transaction.incident.groupBy({
            by: ['status'],
            where: {
              AND: [
                scope.where,
                { deletedAt: null },
                { assignedToId: actorId },
              ],
            },
            _count: { _all: true },
          });
          const visibleGroups = await transaction.incident.groupBy({
            by: ['status'],
            where: { AND: [scope.where, { deletedAt: null }] },
            _count: { _all: true },
          });
          const priorityItems = await transaction.$queryRaw<
            PersonalPriorityItem[]
          >`
          SELECT i.id, i.public_code AS "publicCode", i.title, i.promotion_id AS "promotionId",
                 p.name AS "promotionName", i.status, i.priority, i.created_at AS "createdAt"
          FROM incidents i JOIN promotions p ON p.id = i.promotion_id
          WHERE i.assigned_to_id = ${actorId}::uuid AND (${scope.sql}) AND i.status <> 'CLOSED' AND i.deleted_at IS NULL
          ORDER BY CASE i.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                   CASE i.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'OPEN' THEN 1 ELSE 2 END,
                   i.created_at ASC, i.id ASC
          LIMIT 10`;
          return {
            countsByStatus: personalCounts(groups),
            visibleCountsByStatus: personalCounts(visibleGroups),
            priorityItems,
            priorityLimit: 10,
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Resumen personal no disponible');
    }
  }
  async filterOptions(actorId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [actor] = await transaction.$queryRaw<
          Array<{ role: UserRole; isActive: boolean }>
        >`SELECT role, is_active AS "isActive" FROM users WHERE id = ${actorId}::uuid FOR SHARE`;
        assertPromotionVisible(
          actor ?? { role: 'COLLABORATOR', isActive: false },
          true,
        );
        return transaction.user.findMany({
          where: {
            assignedIncidents: { some: this.visibility(actorId, actor?.role) },
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: [
            { lastName: 'asc' },
            { firstName: 'asc' },
            { email: 'asc' },
            { id: 'asc' },
          ],
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Opciones de incidencias no disponibles',
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
            createdBy: { select: incidentPersonSelect },
            validatedBy: { select: incidentPersonSelect },
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
        const approval = [...incident.activities]
          .reverse()
          .map((activity) =>
            historyObject(historyObject(activity.changes)?.approvedCycle),
          )
          .find(
            (cycle) => cycle?.closedAt === incident.closedAt?.toISOString(),
          );
        const validator =
          (approval?.identitySnapshotVersion === 1
            ? historicalIdentity(approval.validatedBy)
            : undefined) ?? incident.validatedBy;
        return {
          ...presentOperationalIncident(details),
          promotionStatus: promotion.status,
          createdBy: presentIncidentIdentity(incident.createdBy, actor!.role),
          validatedBy: validator
            ? presentIncidentIdentity(validator, actor!.role)
            : null,
          activities: incident.activities.map((activity) => ({
            ...activity,
            changes: redactIncidentHistory(activity.changes, actor!.role),
          })),
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
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'COMMENT_ADDED',
          changes: { commentId: comment.id },
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
          // Consulta reutilizada para elegir responsable durante la reapertura.
          incident.status === 'CLOSED' ? 'OPEN' : incident.status,
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
          return presentOperationalIncident(
            await transaction.incident.findUniqueOrThrow({ where: { id } }),
          );
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version },
          data: { assignedToId: input.assignedToId, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          ...activity,
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
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
        if (incident.status !== 'OPEN')
          throw new ConflictException('La incidencia no admite inicio');
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
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'STATUS_CHANGED',
          changes: { previousStatus: 'OPEN', status: 'IN_PROGRESS' },
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
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
          return presentOperationalIncident(
            await transaction.incident.findUniqueOrThrow({ where: { id } }),
          );
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, status: 'IN_PROGRESS' },
          data: { solution, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'SOLUTION_UPDATED',
          changes: {
            previousSolution: incident.solution,
            solution,
          },
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
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
        const submittedBy = await transaction.user.findUniqueOrThrow({
          where: { id: actorId },
          select: incidentPersonSelect,
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
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'SOLUTION_SUBMITTED',
          changes: {
            previousStatus: 'IN_PROGRESS',
            status: 'PENDING_VALIDATION',
            solution: incident.solution,
            submittedBy,
            solutionSubmittedAt: submittedAt.toISOString(),
          },
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Envío de solución no disponible');
    }
  }

  async reopen(
    actorId: string,
    id: string,
    input: { version: number; reason: string; assignedToId: string },
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
        if (actor!.role !== 'ADMIN' && actor!.role !== 'MANAGER')
          throw new ForbiddenException('Operación no permitida');
        if (incident.version !== input.version)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        // La reapertura no utiliza la transición de rechazo desde Pendiente.
        if (incident.status !== 'CLOSED')
          throw new ConflictException('La incidencia no admite reapertura');
        assertIncidentTransition({
          from: incident.status,
          to: 'IN_PROGRESS',
          actorId,
          actorRole: actor!.role,
          promotionStatus: incident.promotion.status,
          assignedToId: input.assignedToId,
          presentedById: incident.solutionSubmittedById,
          solution: incident.solution ?? '',
          hasIndependentValidator: true,
          rejectionReason: input.reason,
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
        const legacyCycle = approvedCycleSnapshot(incident);
        const closure = await transaction.incidentActivity.findFirst({
          where: {
            incidentId: id,
            eventType: 'STATUS_CHANGED',
            changes: {
              path: ['approvedCycle', 'closedAt'],
              equals: legacyCycle.closedAt,
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const recorded = historyObject(
          historyObject(closure?.changes)?.approvedCycle,
        );
        const approvedCycle =
          recorded?.identitySnapshotVersion === 1
            ? {
                identitySnapshotVersion: 1,
                ...legacyCycle,
                submittedBy: recorded.submittedBy ?? null,
                validatedBy: recorded.validatedBy ?? null,
              }
            : legacyCycle;
        const changed = await transaction.incident.updateMany({
          where: {
            id,
            status: 'CLOSED',
            version: input.version,
            deletedAt: null,
          },
          data: {
            status: 'IN_PROGRESS',
            assignedToId: input.assignedToId,
            solution: null,
            solutionSubmittedById: null,
            solutionSubmittedAt: null,
            validatedById: null,
            closedAt: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'INCIDENT_VERSION_CONFLICT',
            message: 'La incidencia cambió. Recarga antes de continuar.',
          });
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'STATUS_CHANGED',
          changes: {
            snapshotVersion: 1,
            previousStatus: 'CLOSED',
            status: 'IN_PROGRESS',
            previousAssignedToId: incident.assignedToId,
            assignedToId: input.assignedToId,
            reason: input.reason,
            approvedCycle,
          },
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Reapertura de incidencia no disponible',
      );
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
        const closedAt = approving ? new Date() : null;
        let approvalSnapshot: Prisma.InputJsonObject | undefined;
        if (approving) {
          const validatedBy = await transaction.user.findUniqueOrThrow({
            where: { id: actorId },
            select: incidentPersonSelect,
          });
          const submission = await transaction.incidentActivity.findFirst({
            where: {
              incidentId: id,
              eventType: 'SOLUTION_SUBMITTED',
              changes: {
                path: ['solutionSubmittedAt'],
                equals: incident.solutionSubmittedAt!.toISOString(),
              },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          });
          approvalSnapshot = {
            identitySnapshotVersion: 1,
            ...approvedCycleSnapshot({
              ...incident,
              validatedById: actorId,
              closedAt,
            }),
            submittedBy:
              historyObject(historyObject(submission?.changes)?.submittedBy) ??
              null,
            validatedBy,
          };
        }
        const changed = await transaction.incident.updateMany({
          where: { id, version: input.version, status: 'PENDING_VALIDATION' },
          data: {
            status: approving ? 'CLOSED' : 'IN_PROGRESS',
            validatedById: approving ? actorId : null,
            closedAt,
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
        await this.recordActivity(transaction, {
          incidentId: id,
          actorId,
          eventType: 'STATUS_CHANGED',
          changes: {
            previousStatus: 'PENDING_VALIDATION',
            status: approving ? 'CLOSED' : 'IN_PROGRESS',
            ...(approving
              ? { approvedCycle: approvalSnapshot! }
              : {
                  solution: incident.solution,
                  solutionSubmittedById: incident.solutionSubmittedById,
                  solutionSubmittedAt:
                    incident.solutionSubmittedAt!.toISOString(),
                  reason: input.reason!,
                }),
          },
        });
        return presentOperationalIncident(
          await transaction.incident.findUniqueOrThrow({ where: { id } }),
        );
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
        await this.recordActivity(transaction, {
          incidentId: incident.id,
          actorId,
          eventType: 'CREATED',
          changes: { originPhase: input.originPhase },
        });
        return presentOperationalIncident(incident);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Creación de incidencias no disponible',
      );
    }
  }
}
