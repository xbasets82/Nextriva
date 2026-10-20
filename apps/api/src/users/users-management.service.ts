import { ServiceUnavailableException } from '@nestjs/common';
import type { PasswordHasher } from './password-hasher.js';
import type { UsersManagementStore } from './users-management.store.js';
import {
  newManagedUser,
  userChanges,
  userId,
  userStatus,
} from './users-management.validation.js';

export class UsersManagementService {
  constructor(
    private readonly store: UsersManagementStore,
    private readonly hasher: Pick<PasswordHasher, 'hash'>,
  ) {}
  list(actorId: string) {
    return this.store.list(actorId);
  }
  get(actorId: string, id: string) {
    return this.store.get(actorId, userId(id));
  }
  async create(actorId: string, body: unknown) {
    const input = newManagedUser(body);
    const { password, ...details } = input;
    let passwordHash: string;
    try {
      passwordHash = await this.hasher.hash(password);
    } catch {
      throw new ServiceUnavailableException(
        'Gestión de usuarios no disponible',
      );
    }
    return this.store.create(actorId, { ...details, passwordHash });
  }
  edit(actorId: string, id: string, body: unknown) {
    return this.store.update(actorId, userId(id), userChanges(body));
  }
  status(actorId: string, id: string, body: unknown) {
    return this.store.update(actorId, userId(id), {
      isActive: userStatus(body),
    });
  }
  async onModuleDestroy() {
    await this.store.close();
  }
}
