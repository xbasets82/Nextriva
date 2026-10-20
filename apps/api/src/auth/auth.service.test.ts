import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthService, type AuthStore } from './auth.service.js';
import type { PasswordHasher } from '../users/password-hasher.js';
import type { UserRecord } from '../users/user-projection.js';

const user: UserRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Synthetic',
  lastName: 'User',
  email: 'auth@example.test',
  passwordHash: randomBytes(32).toString('base64url'),
  role: 'ADMIN',
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
let store: AuthStore;
let hasher: {
  hash: Mock<PasswordHasher['hash']>;
  verify: Mock<PasswordHasher['verify']>;
};
let service: AuthService;
const now = new Date('2026-10-20T10:00:00Z');

beforeEach(() => {
  store = {
    findUser: vi.fn().mockResolvedValue(user),
    createSession: vi.fn().mockResolvedValue(undefined),
    consumeSession: vi.fn().mockResolvedValue(user),
  };
  hasher = {
    hash: vi.fn().mockResolvedValue('synthetic-dummy-hash'),
    verify: vi.fn().mockResolvedValue(true),
  };
  service = new AuthService(store, hasher, () => now);
});

describe('login and opaque persistent sessions', () => {
  it('normalizes identity, creates a fresh 32-byte token and stores only its SHA-256 for 8 hours', async () => {
    const oldToken = randomBytes(32).toString('base64url');
    const result = await service.login(
      ' AUTH@Example.Test ',
      'synthetic-input',
      '127.0.0.1',
      oldToken,
    );
    expect(store.findUser).toHaveBeenCalledWith('auth@example.test');
    expect(result.token).toHaveLength(43);
    expect(Buffer.from(result.token, 'base64url')).toHaveLength(32);
    expect(result.token).not.toBe(oldToken);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(store.createSession).toHaveBeenCalledWith(
      {
        userId: user.id,
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 28_800_000),
      },
      createHash('sha256').update(oldToken).digest('hex'),
    );
    expect(
      JSON.stringify(vi.mocked(store.createSession).mock.calls),
    ).not.toContain(result.token);
    const second = await service.login(
      user.email,
      'synthetic-input',
      '127.0.0.1',
    );
    expect(second.token).not.toBe(result.token);
  });
  it.each(['missing', 'inactive', 'wrong', 'corrupt'] as const)(
    'rejects %s credentials generically and persists nothing',
    async (kind) => {
      if (kind === 'missing') vi.mocked(store.findUser).mockResolvedValue(null);
      if (kind === 'inactive')
        vi.mocked(store.findUser).mockResolvedValue({
          ...user,
          isActive: false,
        });
      if (kind === 'wrong') hasher.verify.mockResolvedValue(false);
      if (kind === 'corrupt')
        hasher.verify.mockRejectedValue(
          new Error('synthetic-private-hash-marker'),
        );
      await expect(
        service.login(user.email, 'synthetic-input', '127.0.0.1'),
      ).rejects.toMatchObject({
        message: 'Credenciales inválidas',
        status: 401,
      });
      expect(hasher.verify).toHaveBeenCalled();
      expect(store.createSession).not.toHaveBeenCalled();
    },
  );
  it('limits the sixth failed attempt independently by email/IP', async () => {
    hasher.verify.mockResolvedValue(false);
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        service.login(user.email, 'invalid', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.login(' AUTH@example.test ', 'invalid', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      service.login(user.email, 'invalid', '127.0.0.2'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('projects the current user and rejects absent, malformed, expired and unknown sessions', async () => {
    const token = randomBytes(32).toString('base64url');
    expect(await service.authenticate(token)).not.toHaveProperty(
      'passwordHash',
    );
    expect(store.consumeSession).toHaveBeenCalledWith(
      createHash('sha256').update(token).digest('hex'),
      now,
    );
    for (const missing of [undefined, '', 'invalid'])
      await expect(service.authenticate(missing)).rejects.toMatchObject({
        status: 401,
      });
    vi.mocked(store.consumeSession).mockResolvedValue(null);
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('does not expose database or hashing errors', async () => {
    vi.mocked(store.createSession).mockRejectedValue(
      new Error('private-database-marker'),
    );
    await expect(
      service.login(user.email, 'synthetic-input', '127.0.0.1'),
    ).rejects.toMatchObject({
      message: 'Autenticación no disponible',
      status: 503,
    });
    vi.mocked(store.consumeSession).mockRejectedValue(
      new Error('private-database-marker'),
    );
    await expect(
      service.authenticate(randomBytes(32).toString('base64url')),
    ).rejects.toMatchObject({
      message: 'Autenticación no disponible',
      status: 503,
    });
  });
});

it('serializes concurrent failures for one normalized identity/IP before the sixth attempt', async () => {
  hasher.verify.mockResolvedValue(false);
  const responses = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      service.login(user.email, 'invalid', '127.0.0.1'),
    ),
  );
  const limited = responses.filter(
    (response) =>
      response.status === 'rejected' && response.reason.getStatus() === 429,
  );
  expect(limited).toHaveLength(1);
  expect(hasher.verify).toHaveBeenCalledTimes(5);
});

it('fails closed with a generic 503 when dummy Argon2 initialization fails', async () => {
  hasher.hash.mockRejectedValue(new Error('private-hashing-marker'));
  const unavailable = new AuthService(store, hasher, () => now);
  await expect(
    unavailable.login(user.email, 'synthetic-input', '127.0.0.1'),
  ).rejects.toMatchObject({
    message: 'Autenticación no disponible',
    status: 503,
  });
  expect(store.findUser).not.toHaveBeenCalled();
});
