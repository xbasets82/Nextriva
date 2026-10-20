import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { revokeSessionsForUser } from '../auth/prisma-auth.store.js';
import { toSafeUser } from './user-projection.js';
import type { NewUserRecord } from './users.service.js';
import type { UserDetails } from './users-management.validation.js';

/** Bloqueo compartido por todos los escritores del invariante de administradores. */
export async function lockUserAdministration(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(210021)`;
}
export class UsersManagementStore {
  private client?: PrismaClient;
  constructor(private readonly source: PrismaClient | (() => PrismaClient)) {}
  private get prisma(): PrismaClient {
    this.client ??=
      typeof this.source === 'function' ? this.source() : this.source;
    return this.client;
  }
  private async asAdministrator<T>(
    actorId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await lockUserAdministration(transaction);
          const actor = await transaction.user.findUnique({
            where: { id: actorId },
          });
          if (!actor?.isActive || actor.role !== 'ADMIN')
            throw new ForbiddenException('Operación no permitida');
          return operation(transaction);
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'code') === 'P2002'
      )
        throw new ConflictException(
          'El usuario no se puede guardar por un conflicto de unicidad',
        );
      throw new ServiceUnavailableException(
        'Gestión de usuarios no disponible',
      );
    }
  }
  list(actorId: string) {
    return this.asAdministrator(actorId, async (transaction) =>
      (await transaction.user.findMany({ orderBy: { id: 'asc' } })).map(
        toSafeUser,
      ),
    );
  }
  get(actorId: string, id: string) {
    return this.asAdministrator(actorId, async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      return toSafeUser(user);
    });
  }
  create(actorId: string, data: NewUserRecord) {
    return this.asAdministrator(actorId, async (transaction) =>
      toSafeUser(await transaction.user.create({ data })),
    );
  }
  update(
    actorId: string,
    id: string,
    changes: Partial<UserDetails> & { isActive?: boolean },
  ) {
    return this.asAdministrator(actorId, async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      const losesAdmin =
        user.isActive &&
        user.role === 'ADMIN' &&
        (changes.isActive === false ||
          (changes.role !== undefined && changes.role !== 'ADMIN'));
      if (
        losesAdmin &&
        (await transaction.user.count({
          where: { isActive: true, role: 'ADMIN' },
        })) <= 1
      )
        throw new ConflictException('Debe permanecer un administrador activo');
      const result = await transaction.user.update({
        where: { id },
        data: changes,
      });
      if (
        (changes.role !== undefined && changes.role !== user.role) ||
        (changes.isActive !== undefined && changes.isActive !== user.isActive)
      )
        await revokeSessionsForUser(transaction, id, new Date());
      return toSafeUser(result);
    });
  }
  async bootstrap(data: NewUserRecord): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockUserAdministration(transaction);
        if (await transaction.user.count({ where: { role: 'ADMIN' } }))
          return false;
        await transaction.user.create({ data: { ...data, role: 'ADMIN' } });
        return true;
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo aprovisionar el administrador',
      );
    }
  }
  async close() {
    await this.client?.$disconnect();
  }
}
