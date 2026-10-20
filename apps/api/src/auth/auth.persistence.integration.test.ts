import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import {
  AuthService,
  hashSessionToken,
  type NewSession,
} from './auth.service.js';
import { PrismaAuthStore } from './prisma-auth.store.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const store = new PrismaAuthStore(prisma);
const hasher = new PasswordHasher();
const password = randomBytes(24).toString('base64url');
const start = new Date('2026-10-20T10:00:00Z');
let currentTime = start;
const service = new AuthService(store, hasher, () => currentTime);
let userId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Authentication',
      email: 'persistent@example.test',
      passwordHash: await hasher.hash(password),
      role: 'MANAGER',
    },
  });
  userId = user.id;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('sessions on isolated real PostgreSQL', () => {
  it('migrates the sessions table with only approved fields', async () => {
    const fields = await prisma.$queryRaw<
      Array<{ column_name: string }>
    >`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY ordinal_position`;
    expect(fields.map((field) => field.column_name)).toEqual([
      'id',
      'user_id',
      'token_hash',
      'created_at',
      'last_seen_at',
      'expires_at',
      'revoked_at',
    ]);
  });
  it('persists only the hash and reads a session from a new service instance', async () => {
    currentTime = start;
    const result = await service.login(
      ' PERSISTENT@example.test ',
      password,
      '127.0.0.1',
    );
    const rows = await prisma.$queryRaw<
      Array<{ id: string; token_hash: string }>
    >`SELECT id, token_hash FROM sessions WHERE token_hash = ${hashSessionToken(result.token)}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(result.token);
    expect(rows[0]?.token_hash).toBe(hashSessionToken(result.token));
    expect(JSON.stringify(rows)).not.toContain(result.token);
    const fresh = new AuthService(
      new PrismaAuthStore(prisma),
      hasher,
      () => new Date(start.getTime() + 1000),
    );
    expect((await fresh.authenticate(result.token)).id).toBe(userId);
  });
  it('rejects exactly the idle and absolute boundaries with a controlled clock and no write on rejection', async () => {
    for (const [elapsed, lastSeen] of [
      [1_800_000, start],
      [28_800_000, new Date(start.getTime() + 28_799_999)],
    ] as const) {
      currentTime = start;
      const { token } = await service.login(
        'persistent@example.test',
        password,
        '127.0.0.1',
      );
      await prisma.$executeRaw`UPDATE sessions SET last_seen_at = ${lastSeen} WHERE token_hash = ${hashSessionToken(token)}`;
      currentTime = new Date(start.getTime() + elapsed);
      await expect(service.authenticate(token)).rejects.toMatchObject({
        status: 401,
      });
      const rows = await prisma.$queryRaw<
        Array<{ last_seen_at: Date }>
      >`SELECT last_seen_at FROM sessions WHERE token_hash = ${hashSessionToken(token)}`;
      expect(rows[0]?.last_seen_at).toEqual(lastSeen);
    }
    currentTime = start;
  });
  it('extends inactivity before the limit without extending absolute expiry', async () => {
    currentTime = start;
    const { token } = await service.login(
      'persistent@example.test',
      password,
      '127.0.0.1',
    );
    currentTime = new Date(start.getTime() + 1_799_999);
    await expect(service.authenticate(token)).resolves.toMatchObject({
      id: userId,
    });
    currentTime = new Date(start.getTime() + 1_800_000);
    await expect(service.authenticate(token)).resolves.toMatchObject({
      id: userId,
    });
    currentTime = start;
  });
  it('rotates a previous authenticated token and never accepts an attacker selected identifier', async () => {
    const first = await service.login(
      'persistent@example.test',
      password,
      '127.0.0.1',
    );
    const second = await service.login(
      'persistent@example.test',
      password,
      '127.0.0.1',
      first.token,
    );
    await expect(service.authenticate(first.token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.authenticate(second.token)).resolves.toMatchObject({
      id: userId,
    });
    await expect(
      service.authenticate(randomBytes(32).toString('base64url')),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('checks the current active user and rejects revoked sessions', async () => {
    const { token } = await service.login(
      'persistent@example.test',
      password,
      '127.0.0.1',
    );
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true, role: 'COLLABORATOR' },
    });
    expect((await service.authenticate(token)).role).toBe('COLLABORATOR');
    await prisma.$executeRaw`UPDATE sessions SET revoked_at = ${start} WHERE token_hash = ${hashSessionToken(token)}`;
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('enforces token uniqueness, real FK and chronological constraints', async () => {
    const session: NewSession = {
      userId,
      tokenHash: hashSessionToken(randomBytes(32).toString('base64url')),
      createdAt: start,
      lastSeenAt: start,
      expiresAt: new Date(start.getTime() + 28_800_000),
    };
    await store.createSession(session);
    await expect(store.createSession(session)).rejects.toBeDefined();
    await expect(
      store.createSession({
        ...session,
        tokenHash: 'a'.repeat(64),
        userId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toBeDefined();
    await expect(
      store.createSession({
        ...session,
        tokenHash: 'b'.repeat(64),
        expiresAt: start,
      }),
    ).rejects.toBeDefined();
  });
});
