import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AuthStore, NewSession } from './auth.service.js';
import { SESSION_IDLE_MS } from './auth-security.js';

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

  async consumeSession(hash: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.session.updateMany({
        where: {
          tokenHash: hash,
          revokedAt: null,
          createdAt: { lte: now },
          expiresAt: { gt: now },
          lastSeenAt: {
            gt: new Date(now.getTime() - SESSION_IDLE_MS),
            lte: now,
          },
          user: { isActive: true },
        },
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

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
