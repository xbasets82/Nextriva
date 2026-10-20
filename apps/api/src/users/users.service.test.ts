import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { UserRecord } from './user-projection.js';

describe('UsersService', () => {
  it('normalizes email, hashes before persistence, and returns no password hash', async () => {
    const password = randomBytes(24).toString('base64url');
    const passwordHash = `$argon2id$${randomBytes(24).toString('base64url')}`;
    const now = new Date('2026-10-20T00:00:00.000Z');
    const persistedUser: UserRecord = {
      id: '00000000-0000-4000-8000-000000000002',
      firstName: 'Synthetic',
      lastName: 'User',
      email: 'user@example.test',
      passwordHash,
      role: 'COLLABORATOR',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const usersWriter = { create: vi.fn().mockResolvedValue(persistedUser) };
    const passwordHasher = { hash: vi.fn().mockResolvedValue(passwordHash) };
    const service = new UsersService(usersWriter, passwordHasher);

    const result = await service.create({
      firstName: 'Synthetic',
      lastName: 'User',
      email: '  USER@Example.Test  ',
      password,
      role: 'COLLABORATOR',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith(password);
    expect(usersWriter.create).toHaveBeenCalledWith({
      firstName: 'Synthetic',
      lastName: 'User',
      email: 'user@example.test',
      passwordHash,
      role: 'COLLABORATOR',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });
});
