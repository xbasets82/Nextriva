import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { AuthStore, NewSession, VerifiedUser } from './auth.service.js';
import type { UserRecord } from '../users/user-projection.js';
import { SESSION_IDLE_MS } from './auth-security.js';

function activeSessionWhere(hash: string, now: Date): Prisma.SessionWhereInput {
  return {
    tokenHash: hash,
    revokedAt: null,
    createdAt: { lte: now },
    expiresAt: { gt: now },
    lastSeenAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS) },
    user: { isActive: true },
  };
}

function matchesVerifiedUser(
  current: UserRecord | null,
  verified: VerifiedUser,
): current is UserRecord {
  return (
    current !== null &&
    current.isActive &&
    current.id === verified.id &&
    current.email === verified.email &&
    current.passwordHash === verified.passwordHash &&
    current.role === verified.role
  );
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
    verifiedUser: VerifiedUser,
    previousHash?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const lockedUsers = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users WHERE id = ${session.userId} FOR SHARE
      `;
      if (lockedUsers.length !== 1) return null;
      const currentUser = await transaction.user.findUnique({
        where: { id: session.userId },
      });
      if (!matchesVerifiedUser(currentUser, verifiedUser)) return null;

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
      return currentUser;
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
      const updated = await transaction.$executeRaw`
        UPDATE sessions
        SET last_seen_at = GREATEST(last_seen_at, ${now})
        WHERE token_hash = ${hash}
          AND revoked_at IS NULL
          AND created_at <= ${now}
          AND expires_at > ${now}
          AND last_seen_at > ${new Date(now.getTime() - SESSION_IDLE_MS)}
          AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = sessions.user_id AND users.is_active = TRUE
          )
      `;
      if (updated !== 1) return null;
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
