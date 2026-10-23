import type { UserRole } from '../../generated/prisma/client.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

export type IncidentTransitionInput = {
  from: string;
  to: string;
  actorId: string;
  actorRole: UserRole;
  promotionStatus: string;
  assignedToId: string | null;
  presentedById: string | null;
  solution: string;
  hasIndependentValidator: boolean;
  rejectionReason: string;
};

export function incidentStartInput(body: unknown): { version: number } {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new BadRequestException('Datos de transición inválidos');
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).length !== 1 ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  )
    throw new BadRequestException('Datos de transición inválidos');
  return { version: value.version };
}

export function assertIncidentTransition(input: IncidentTransitionInput): void {
  const transitions: Record<string, readonly string[]> = {
    OPEN: ['IN_PROGRESS'],
    IN_PROGRESS: ['PENDING_VALIDATION'],
    PENDING_VALIDATION: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: [],
  };
  if (
    !Object.hasOwn(transitions, input.from) ||
    !Object.hasOwn(transitions, input.to)
  )
    throw new BadRequestException('Estado de incidencia desconocido');
  if (!transitions[input.from]!.includes(input.to))
    throw new ConflictException('Transición de incidencia no permitida');
  if (input.promotionStatus !== 'ACTIVE')
    throw new ConflictException(
      'La promoción archivada no admite cambios de estado',
    );
  if (input.from === 'OPEN') {
    assertIncidentStartActor(input);
    return;
  }
  if (input.from === 'IN_PROGRESS') {
    assertIncidentSolutionActor(input);
    if (!input.solution.trim() || !input.hasIndependentValidator)
      throw new ConflictException(
        'Solución o validador independiente pendiente',
      );
    return;
  }
  assertReviewActor(input);
  if (
    input.to === 'IN_PROGRESS' &&
    (input.rejectionReason.trim().length < 5 ||
      input.rejectionReason.trim().length > 2000)
  )
    throw new BadRequestException('Motivo de rechazo inválido');
}

export function assertIncidentStartActor(
  input: Pick<
    IncidentTransitionInput,
    'actorId' | 'actorRole' | 'assignedToId'
  >,
): void {
  if (!input.assignedToId)
    throw new ConflictException('La incidencia requiere responsable');
  if (
    input.actorId !== input.assignedToId &&
    input.actorRole !== 'ADMIN' &&
    input.actorRole !== 'MANAGER'
  )
    throw new ForbiddenException('Operación no permitida');
}

export function assertIncidentSolutionActor(
  input: Pick<IncidentTransitionInput, 'actorId' | 'assignedToId'>,
): void {
  if (!input.assignedToId || input.actorId !== input.assignedToId)
    throw new ForbiddenException('Operación no permitida');
}

export function assertIncidentSolutionDraftAllowed(input: {
  actorId: string;
  assignedToId: string | null;
  status: string;
  promotionStatus: string;
}): void {
  assertIncidentSolutionActor(input);
  if (input.status !== 'IN_PROGRESS' || input.promotionStatus !== 'ACTIVE')
    throw new ConflictException(
      'La incidencia no admite cambios en el borrador de solución',
    );
}

function assertReviewActor(input: IncidentTransitionInput): void {
  if (
    !input.presentedById ||
    (input.actorRole !== 'ADMIN' && input.actorRole !== 'MANAGER') ||
    input.actorId === input.presentedById
  )
    throw new ForbiddenException('Operación no permitida');
}
