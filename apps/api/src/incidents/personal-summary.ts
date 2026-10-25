import {
  Prisma,
  type IncidentStatus,
  type UserRole,
} from '../../generated/prisma/client.js';

// La misma política genera los predicados ORM y SQL; «i» es el alias fijo de incidents.
export function incidentVisibility(
  actorId: string,
  role: UserRole | undefined,
): { where: Prisma.IncidentWhereInput; sql: Prisma.Sql } {
  if (role === 'ADMIN') return { where: {}, sql: Prisma.sql`TRUE` };
  const membership = Prisma.sql`EXISTS (SELECT 1 FROM promotion_participants pp WHERE pp.promotion_id = i.promotion_id AND pp.user_id = ${actorId}::uuid)`;
  const where: Prisma.IncidentWhereInput = {
    promotion: { participants: { some: { userId: actorId } } },
  };
  if (role === 'COLLABORATOR')
    return {
      where: {
        ...where,
        OR: [{ createdById: actorId }, { assignedToId: actorId }],
      },
      sql: Prisma.sql`${membership} AND (i.created_by_id = ${actorId}::uuid OR i.assigned_to_id = ${actorId}::uuid)`,
    };
  return { where, sql: membership };
}

export function personalCounts(
  groups: Array<{ status: IncidentStatus; _count: { _all: number } }>,
): Record<IncidentStatus, number> {
  const counts = { OPEN: 0, IN_PROGRESS: 0, PENDING_VALIDATION: 0, CLOSED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}
export type PersonalPriorityItem = {
  id: string;
  publicCode: string;
  title: string;
  promotionId: string;
  promotionName: string;
  status: IncidentStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: Date;
};
