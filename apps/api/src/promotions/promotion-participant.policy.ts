import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type {
  PromotionStatus,
  UserRole,
} from '../../generated/prisma/client.js';

export interface ParticipantActor {
  role: UserRole;
  isActive: boolean;
}

export function assertPromotionVisible(
  actor: ParticipantActor,
  isLinked: boolean,
): void {
  if (!actor.isActive) throw new ForbiddenException('Operación no permitida');
  if (actor.role !== 'ADMIN' && !isLinked)
    throw new NotFoundException('Promoción no encontrada');
}

export function assertParticipantManagement(
  actor: ParticipantActor,
  isLinked: boolean,
  target: { role: UserRole; isActive: boolean },
): void {
  assertPromotionVisible(actor, isLinked);
  if (actor.role === 'MANAGER' && !target.isActive)
    throw new ConflictException('El participante no se puede vincular');
  if (
    actor.role !== 'ADMIN' &&
    !(actor.role === 'MANAGER' && target.role === 'COLLABORATOR')
  )
    throw new ForbiddenException('Operación no permitida');
}

export function assertParticipantAdditionAllowed(
  target: { isActive: boolean } | undefined,
  status: PromotionStatus,
): void {
  if (!target?.isActive || status === 'ARCHIVED')
    throw new ConflictException('El participante no se puede vincular');
}
