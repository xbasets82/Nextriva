import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, toSafeUser } from './user-projection.js';

describe('user projection', () => {
  it('normalizes email before persistence', () => {
    expect(normalizeEmail('  USER@Example.Test  ')).toBe('user@example.test');
  });

  it('omits the password hash from the safe user representation', () => {
    const passwordHash = `$argon2id$${randomBytes(24).toString('base64url')}`;
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'Synthetic',
      lastName: 'User',
      email: 'user@example.test',
      passwordHash,
      role: 'ADMIN' as const,
      isActive: true,
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    };

    const safeUser = toSafeUser(user);

    expect(safeUser).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(safeUser)).not.toContain(passwordHash);
    expect(safeUser).toMatchObject({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
  });
});
