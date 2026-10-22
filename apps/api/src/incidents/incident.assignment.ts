import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';
import { incidentId } from './incident.validation.js';
export function incidentAssignment(body: unknown): {
  assignedToId: string;
  version: number;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new BadRequestException('Datos de asignación inválidos');
  const source = body as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) => !['assignedToId', 'version'].includes(key),
    ) ||
    typeof source.version !== 'number' ||
    !Number.isSafeInteger(source.version) ||
    source.version < 1
  )
    throw new BadRequestException('Datos de asignación inválidos');
  let assignedToId: string;
  try {
    assignedToId = incidentId(source.assignedToId).toLowerCase();
  } catch {
    throw new BadRequestException('Datos de asignación inválidos');
  }
  return { assignedToId, version: source.version };
}
export function assertAssignmentAllowed(
  role: UserRole,
  status: string,
  promotionStatus: string,
): void {
  if (role !== 'ADMIN' && role !== 'MANAGER')
    throw new ForbiddenException('Operación no permitida');
  if (promotionStatus !== 'ACTIVE' || !['OPEN', 'IN_PROGRESS'].includes(status))
    throw new ConflictException('La incidencia no admite asignación');
}
export function assertEligibleAssignee(
  target: { role: UserRole; isActive: boolean } | undefined,
  linked: boolean,
): void {
  if (!target?.isActive || (target.role !== 'ADMIN' && !linked))
    throw new BadRequestException('Responsable no elegible');
}

export function assignmentActivity(
  previousAssignedToId: string | null,
  assignedToId: string,
):
  | {
      eventType: 'ASSIGNED' | 'REASSIGNED';
      changes: { previousAssignedToId: string | null; assignedToId: string };
    }
  | undefined {
  if (previousAssignedToId === assignedToId) return undefined;
  return {
    eventType: previousAssignedToId === null ? 'ASSIGNED' : 'REASSIGNED',
    changes: { previousAssignedToId, assignedToId },
  };
}
