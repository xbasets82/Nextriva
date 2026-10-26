import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';
import { newIncidentSolutionRejection } from './incident.validation.js';

export function assertIncidentDeletionAllowed(
  role: UserRole,
  status: string,
  promotionStatus: string,
): void {
  if (role !== 'ADMIN' && role !== 'MANAGER')
    throw new ForbiddenException('Operación no permitida');
  if (
    promotionStatus !== 'ACTIVE' ||
    !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)
  )
    throw new ConflictException('La incidencia no admite eliminación');
}

export function incidentDeletionInput(body: unknown): {
  version: number;
  reason: string;
} {
  return newIncidentSolutionRejection(body);
}
