import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

/** I02 e I04 consultan el invariante dentro de su propia transacción. */
export async function assertResponsibilityReleased(
  transaction: Prisma.TransactionClient,
  userId: string,
  promotionId?: string,
): Promise<void> {
  if (
    await transaction.incident.findFirst({
      where: {
        assignedToId: userId,
        status: { not: 'CLOSED' },
        ...(promotionId === undefined ? {} : { promotionId }),
      },
      select: { id: true },
    })
  )
    throw new ConflictException(
      'Reasigna las incidencias no cerradas antes de retirar al responsable',
    );
}
