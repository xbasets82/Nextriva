import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { UsersManagementStore } from '../users/users-management.store.js';
import {
  AuthService,
  type AuthStore,
  hashSessionToken,
  type NewSession,
} from './auth.service.js';
import { PrismaAuthStore, revokeSessionsForUser } from './prisma-auth.store.js';

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
const users = new UsersManagementStore(prisma);
let userId: string;
interface PostgreSqlQueryResult<Row> {
  rows: Row[];
}

interface PostgreSqlObserverClient {
  connect(): Promise<void>;
  query<Row = unknown>(
    sql: string,
    values?: unknown[],
  ): Promise<PostgreSqlQueryResult<Row>>;
  end(): Promise<void>;
}

const { Client: PostgreSqlClient } = createRequire(import.meta.url)('pg') as {
  Client: new (options: {
    connectionString: string;
    connectionTimeoutMillis: number;
    query_timeout: number;
    statement_timeout: number;
  }) => PostgreSqlObserverClient;
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForDatabaseState<T>(
  readState: () => Promise<T | null>,
  description: string,
  isOperationFinished: () => boolean,
): Promise<T> {
  const watchdogDeadline = performance.now() + 12_000;
  while (performance.now() < watchdogDeadline) {
    const state = await readState();
    if (state !== null) return state;
    if (isOperationFinished()) {
      throw new Error(`${description}: la operación terminó antes del bloqueo`);
    }
    await new Promise<void>((resolveNextTurn) => setImmediate(resolveNextTurn));
  }
  throw new Error(`${description}: venció el watchdog de seguridad`);
}

async function readBlockedBackendPid(
  observer: PostgreSqlObserverClient,
  blockingPid: number,
  wait: 'advisory' | 'user-update',
): Promise<number | null> {
  const condition =
    wait === 'advisory'
      ? `wait_event_type = 'Lock' AND wait_event = 'advisory'`
      : `wait_event_type = 'Lock' AND query ILIKE 'UPDATE%users%'`;
  const { rows } = await observer.query<{ pid: number }>(
    `SELECT pid
     FROM pg_stat_activity
     WHERE datname = current_database()
       AND pid <> pg_backend_pid()
       AND ${condition}
       AND $1 = ANY(pg_blocking_pids(pid))`,
    [blockingPid],
  );
  return rows[0]?.pid ?? null;
}

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
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { isActive: false },
      });
      await revokeSessionsForUser(transaction, userId, start);
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true, role: 'COLLABORATOR' },
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    await prisma.$executeRaw`UPDATE sessions SET revoked_at = ${start} WHERE token_hash = ${hashSessionToken(token)}`;
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('revokes sessions atomically with a permission change and rolls both back on failure', async () => {
    currentTime = start;
    const { token } = await service.login(
      'persistent@example.test',
      password,
      '127.0.0.1',
    );
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: userId },
          data: { role: 'ADMIN' },
        });
        await revokeSessionsForUser(transaction, userId, start);
        throw new Error('synthetic transaction rollback');
      }),
    ).rejects.toThrow('synthetic transaction rollback');
    const afterRollback = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    expect(afterRollback.revokedAt).toBeNull();
    expect(afterRollback.user.role).toBe('COLLABORATOR');

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { role: 'MANAGER' },
      });
      expect(await revokeSessionsForUser(transaction, userId, start)).toBe(1);
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
    currentTime = start;
  });
  it.each(['deactivate', 'change role'] as const)(
    'rejects a login whose verified user is %s before session creation',
    async (change) => {
      const administrator = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'Administrator',
          email: `admin-${randomBytes(6).toString('hex')}@example.test`,
          passwordHash: await hasher.hash(password),
          role: 'ADMIN',
        },
      });
      const target = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'Login Race',
          email: `login-race-${randomBytes(6).toString('hex')}@example.test`,
          passwordHash: await hasher.hash(password),
          role: 'MANAGER',
        },
      });
      const verifyStarted = deferred();
      const allowVerifyToFinish = deferred();
      const gatedHasher = {
        hash: (value: string) => hasher.hash(value),
        verify: async (encoded: string, value: string) => {
          const matches = await hasher.verify(encoded, value);
          verifyStarted.resolve();
          await allowVerifyToFinish.promise;
          return matches;
        },
      };
      const login = new AuthService(store, gatedHasher, () => start).login(
        target.email,
        password,
        '127.0.0.1',
      );
      await verifyStarted.promise;

      try {
        await users.update(
          administrator.id,
          target.id,
          change === 'deactivate'
            ? { isActive: false }
            : { role: 'COLLABORATOR' },
        );
      } finally {
        allowVerifyToFinish.resolve();
      }

      const result = await login.then(
        ({ user: authenticatedUser }) => ({
          status: 200,
          user: {
            id: authenticatedUser.id,
            role: authenticatedUser.role,
            isActive: authenticatedUser.isActive,
          },
        }),
        (error: { status: number; message: string }) => ({
          status: error.status,
          message: error.message,
        }),
      );
      expect(result).toEqual({
        status: 401,
        message: 'Credenciales inválidas',
      });
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(
        0,
      );
      await prisma.user.delete({ where: { id: administrator.id } });
    },
  );
  it('revokes a session when login commits before a concurrent user change', async () => {
    const administrator = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Administrator',
        email: `admin-${randomBytes(6).toString('hex')}@example.test`,
        passwordHash: await hasher.hash(password),
        role: 'ADMIN',
      },
    });
    const target = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Login First',
        email: `login-first-${randomBytes(6).toString('hex')}@example.test`,
        passwordHash: await hasher.hash(password),
        role: 'MANAGER',
      },
    });
    const sessionCommitted = deferred();
    const allowLoginToReturn = deferred();
    const gatedStore: AuthStore = {
      findUser: (email) => store.findUser(email),
      createSession: async (session, verifiedUser, previousHash) => {
        const created = await store.createSession(
          session,
          verifiedUser,
          previousHash,
        );
        sessionCommitted.resolve();
        await allowLoginToReturn.promise;
        return created;
      },
      consumeSession: (hash, now, refreshActivity) =>
        store.consumeSession(hash, now, refreshActivity),
      revokeSession: (hash, now) => store.revokeSession(hash, now),
    };
    const login = new AuthService(gatedStore, hasher, () => start).login(
      target.email,
      password,
      '127.0.0.1',
    );
    await sessionCommitted.promise;

    try {
      await users.update(administrator.id, target.id, {
        role: 'COLLABORATOR',
      });
      const sessions = await prisma.session.findMany({
        where: { userId: target.id, createdAt: start },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.revokedAt).toBeInstanceOf(Date);
    } finally {
      allowLoginToReturn.resolve();
    }
    const result = await login;
    await expect(service.authenticate(result.token)).rejects.toMatchObject({
      status: 401,
    });
    await prisma.user.delete({ where: { id: administrator.id } });
  });
  it('holds the user row lock until login commits, then administration revokes that session', async () => {
    const observer = new PostgreSqlClient({
      connectionString: getTemporaryMigrationDatabaseUrl(),
      connectionTimeoutMillis: 2_000,
      query_timeout: 3_000,
      statement_timeout: 3_000,
    });
    await observer.connect();
    currentTime = start;
    const generatedLockKey =
      randomBytes(8).readBigUInt64BE(0) & 0x7fff_ffff_ffff_ffffn;
    const lockKey = generatedLockKey === 210021n ? 210022n : generatedLockKey;
    const key = lockKey.toString();
    let loginOutcome:
      | Promise<
          | { ok: true; result: Awaited<ReturnType<AuthService['login']>> }
          | { ok: false; error: unknown }
        >
      | undefined;
    let adminOutcome:
      | Promise<{ ok: true; result: unknown } | { ok: false; error: unknown }>
      | undefined;
    let loginFinished = false;
    let adminFinished = false;
    let lockHeld = false;

    try {
      await observer.query(`
          CREATE TABLE i02_1_login_gate (
            user_id uuid PRIMARY KEY,
            advisory_key bigint NOT NULL
          )
        `);
      await observer.query(`
          CREATE FUNCTION i02_1_login_gate_before_session_insert()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $$
          DECLARE gate_key bigint;
          BEGIN
            SELECT advisory_key INTO gate_key
            FROM i02_1_login_gate
            WHERE user_id = NEW.user_id;
            IF gate_key IS NOT NULL THEN
              PERFORM pg_advisory_xact_lock(gate_key);
            END IF;
            RETURN NEW;
          END;
          $$
        `);
      await observer.query(`
          CREATE TRIGGER i02_1_login_gate_before_session_insert
          BEFORE INSERT ON sessions
          FOR EACH ROW EXECUTE FUNCTION i02_1_login_gate_before_session_insert()
        `);

      const administrator = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'Lock Administrator',
          email: `lock-admin-${randomBytes(6).toString('hex')}@example.test`,
          passwordHash: await hasher.hash(password),
          role: 'ADMIN',
        },
      });
      const target = await prisma.user.create({
        data: {
          firstName: 'Synthetic',
          lastName: 'Lock Target',
          email: `lock-target-${randomBytes(6).toString('hex')}@example.test`,
          passwordHash: await hasher.hash(password),
          role: 'MANAGER',
        },
      });
      await observer.query(
        'INSERT INTO i02_1_login_gate (user_id, advisory_key) VALUES ($1, $2)',
        [target.id, key],
      );
      const { rows: observerPidRows } = await observer.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const observerPid = observerPidRows[0]?.pid as number;
      await observer.query('SELECT pg_advisory_lock($1::bigint)', [key]);
      lockHeld = true;

      const loginPromise = service
        .login(target.email, password, '127.0.0.1')
        .then(
          (result) => {
            loginFinished = true;
            return { ok: true as const, result };
          },
          (error: unknown) => {
            loginFinished = true;
            return { ok: false as const, error };
          },
        );
      loginOutcome = loginPromise;

      const loginPid = await waitForDatabaseState(
        () => readBlockedBackendPid(observer, observerPid, 'advisory'),
        'El login debía alcanzar la barrera del trigger PostgreSQL',
        () => loginFinished,
      );

      const adminPromise = users
        .update(administrator.id, target.id, { role: 'COLLABORATOR' })
        .then(
          (result) => {
            adminFinished = true;
            return { ok: true as const, result };
          },
          (error: unknown) => {
            adminFinished = true;
            return { ok: false as const, error };
          },
        );
      adminOutcome = adminPromise;

      await waitForDatabaseState(
        () => readBlockedBackendPid(observer, loginPid, 'user-update'),
        'La actualización administrativa debía esperar el bloqueo del login',
        () => adminFinished,
      );

      await observer.query('SELECT pg_advisory_unlock($1::bigint)', [key]);
      lockHeld = false;
      const [login, administration] = await Promise.all([
        loginPromise,
        adminPromise,
      ]);
      expect(login.ok).toBe(true);
      expect(administration.ok).toBe(true);
      if (!login.ok || !administration.ok)
        throw new Error(
          'El login y la operación administrativa debían confirmar',
        );

      const persistedSession = await prisma.session.findFirstOrThrow({
        where: { userId: target.id, createdAt: start },
      });
      expect(persistedSession.revokedAt).toBeInstanceOf(Date);
      await expect(
        service.authenticate(login.result.token),
      ).rejects.toMatchObject({
        status: 401,
      });
    } finally {
      if (lockHeld) {
        await observer.query('SELECT pg_advisory_unlock($1::bigint)', [key]);
      }
      await Promise.allSettled(
        [loginOutcome, adminOutcome].filter(
          (outcome): outcome is NonNullable<typeof outcome> =>
            outcome !== undefined,
        ),
      );
      await observer.query(
        'DROP TRIGGER IF EXISTS i02_1_login_gate_before_session_insert ON sessions',
      );
      await observer.query(
        'DROP FUNCTION IF EXISTS i02_1_login_gate_before_session_insert()',
      );
      await observer.query('DROP TABLE IF EXISTS i02_1_login_gate');
      await observer.end();
    }
  }, 20_000);
  it('enforces token uniqueness, real FK and chronological constraints', async () => {
    const session: NewSession = {
      userId,
      tokenHash: hashSessionToken(randomBytes(32).toString('base64url')),
      createdAt: start,
      lastSeenAt: start,
      expiresAt: new Date(start.getTime() + 28_800_000),
    };
    const verifiedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await store.createSession(session, verifiedUser);
    await expect(
      store.createSession(session, verifiedUser),
    ).rejects.toBeDefined();
    await expect(
      prisma.session.create({
        data: {
          ...session,
          tokenHash: 'a'.repeat(64),
          userId: '00000000-0000-4000-8000-000000000000',
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      store.createSession(
        {
          ...session,
          tokenHash: 'b'.repeat(64),
          expiresAt: start,
        },
        verifiedUser,
      ),
    ).rejects.toBeDefined();
  });
});
