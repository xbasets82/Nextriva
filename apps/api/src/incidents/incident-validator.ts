import { ConflictException } from '@nestjs/common';
import type { Prisma, UserRole } from '../../generated/prisma/client.js';

/**
 * Colaboración I02/I04–Incidents: comprobar después del cambio y antes del
 * commit, reteniendo el mismo bloqueo de administración que submitSolution.
 * La excepción revierte también el cambio de usuario o la retirada.
 */
export async function assertIndependentValidatorRemains(
  transaction: Prisma.TransactionClient,
  previous: { id: string; role: UserRole; isActive: boolean },
  promotionId?: string,
): Promise<void> {
  if (
    !previous.isActive ||
    previous.role === 'COLLABORATOR' ||
    (promotionId !== undefined && previous.role === 'ADMIN')
  )
    return;

  const unprotected = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT i.id FROM incidents i
    WHERE i.status = 'PENDING_VALIDATION'
      AND i.solution_submitted_by_id <> ${previous.id}::uuid
      AND (${promotionId ?? null}::uuid IS NULL
        OR i.promotion_id = ${promotionId ?? null}::uuid)
      AND (${previous.role} = 'ADMIN' OR ${promotionId ?? null}::uuid IS NOT NULL
        OR EXISTS (SELECT 1 FROM promotion_participants affected
          WHERE affected.promotion_id = i.promotion_id
            AND affected.user_id = ${previous.id}::uuid))
      AND NOT EXISTS (
        SELECT 1 FROM users validator
        WHERE validator.is_active
          AND validator.id <> i.solution_submitted_by_id
          AND (validator.role = 'ADMIN'
            OR (validator.role = 'MANAGER' AND EXISTS (
              SELECT 1 FROM promotion_participants participant
              WHERE participant.promotion_id = i.promotion_id
                AND participant.user_id = validator.id
            )))
      )
    LIMIT 1
  `;
  if (unprotected.length > 0)
    throw new ConflictException(
      'Debe permanecer otro validador activo y autorizado para las soluciones pendientes',
    );
}
