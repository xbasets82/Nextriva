import { ConflictException } from '@nestjs/common';
import type { Incident } from '../../generated/prisma/client.js';
import { incidentAssignment } from './incident.assignment.js';
import { newIncidentSolutionRejection } from './incident.validation.js';

export function incidentReopenInput(body: unknown): {
  version: number;
  reason: string;
  assignedToId: string;
} {
  // Ambos validadores exigen sus campos y rechazan propiedades no autorizadas.
  const assignment = incidentAssignment(
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? {
          assignedToId: Reflect.get(body, 'assignedToId'),
          version: Reflect.get(body, 'version'),
        }
      : body,
  );
  const source = body as Record<string, unknown>;
  const rejection = { ...source };
  Reflect.deleteProperty(rejection, 'assignedToId');
  const reason = newIncidentSolutionRejection(rejection);
  return { ...assignment, reason: reason.reason };
}

export function approvedCycleSnapshot(
  incident: Pick<
    Incident,
    | 'solution'
    | 'solutionSubmittedById'
    | 'solutionSubmittedAt'
    | 'validatedById'
    | 'closedAt'
  >,
) {
  if (
    !incident.solution?.trim() ||
    !incident.solutionSubmittedById ||
    !incident.solutionSubmittedAt ||
    !incident.validatedById ||
    !incident.closedAt ||
    incident.validatedById === incident.solutionSubmittedById
  )
    throw new ConflictException(
      'El cierre no dispone de metadatos históricos completos',
    );
  return {
    solution: incident.solution,
    solutionSubmittedById: incident.solutionSubmittedById,
    solutionSubmittedAt: incident.solutionSubmittedAt.toISOString(),
    validatedById: incident.validatedById,
    closedAt: incident.closedAt.toISOString(),
  };
}
