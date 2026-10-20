import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { AuthStore, NewSession } from './auth.service.js';
import { SESSION_IDLE_MS } from './auth-security.js';

function activeSessionWhere(hash: string, now: Date): Prisma.SessionWhereInput {
  return {
    tokenHash: hash,
    revokedAt: null,
    createdAt: { lte: now },
    expiresAt: { gt: now },
    lastSeenAt: {
      gt: new Date(now.getTime() - SESSION_IDLE_MS),
      lte: now,
    },
    user: { isActive: true },
  };
}

/** Revoca sesiones dentro de la misma transacción que cambia estado o permisos. */
export async function revokeSessionsForUser(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<number> {
  const result = await transaction.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly prisma: PrismaClient) {}

  findUser(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createSession(
    session: NewSession,
    previousHash?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.create({ data: session });
      if (previousHash) {
        await transaction.session.updateMany({
          where: {
            tokenHash: previousHash,
            userId: session.userId,
            revokedAt: null,
          },
          data: { revokedAt: session.createdAt },
        });
      }
    });
  }

  async consumeSession(hash: string, now: Date, refreshActivity = true) {
    const where = activeSessionWhere(hash, now);
    if (!refreshActivity) {
      const session = await this.prisma.session.findFirst({
        where,
        include: { user: true },
      });
      return session?.user ?? null;
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.session.updateMany({
        where,
        data: { lastSeenAt: now },
      });
      if (updated.count !== 1) return null;
      const session = await transaction.session.findUnique({
        where: { tokenHash: hash },
        include: { user: true },
      });
      return session?.user ?? null;
    });
  }

  async revokeSession(hash: string, now: Date): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: activeSessionWhere(hash, now),
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
