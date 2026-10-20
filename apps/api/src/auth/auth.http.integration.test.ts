import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import {
  Controller,
  Module,
  Post,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { createLogger } from '../observability/logger.js';
import { createRequestLoggingMiddleware } from '../observability/request-logging.middleware.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { PrismaAuthStore } from './prisma-auth.store.js';
import { SessionGuard } from './session.guard.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const hasher = new PasswordHasher();
const password = randomBytes(24).toString('base64url');
const origin = 'https://nextriva.example';
const start = new Date('2026-10-20T10:00:00Z');
let now = start;
let baseUrl: string;
let app: INestApplication;
let userId: string;
let logOutput = '';

// Ruta de prueba: no se registra en AppModule ni en la aplicación entregada.
@Controller('test-only')
class MutationFixtureController {
  @Post('mutation')
  @UseGuards(SessionGuard)
  async mutate() {
    await prisma.user.update({
      where: { id: userId },
      data: { lastName: 'MutationVerified' },
    });
    return { updated: true };
  }
}
@Module({})
class HttpFixtureModule {}

async function startApp() {
  const service = new AuthService(
    new PrismaAuthStore(prisma),
    hasher,
    () => now,
  );
  app = await NestFactory.create(
    {
      module: HttpFixtureModule,
      imports: [
        AuthModule.register({
          service,
          configuration: { origin, localHttp: false },
        }),
      ],
      controllers: [MutationFixtureController],
    },
    { logger: false },
  );
  app.use(
    createRequestLoggingMiddleware(
      createLogger({
        write: (message) => {
          logOutput += message;
        },
      }),
    ),
  );
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
}

beforeAll(async () => {
  const passwordHash = await hasher.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'HTTP',
      email: 'real-http@example.test',
      passwordHash,
      role: 'ADMIN',
    },
  });
  userId = user.id;
  await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Inactive',
      email: 'inactive-http@example.test',
      passwordHash,
      role: 'COLLABORATOR',
      isActive: false,
    },
  });
  await startApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

function login(
  email = 'real-http@example.test',
  supplied = password,
  headers: Record<string, string> = { origin },
) {
  return fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password: supplied }),
  });
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Expected a session cookie');
  return cookie;
}

describe('HTTP authentication using real isolated PostgreSQL', () => {
  it('persists login through an API restart and never leaks secrets through JSON or logs', async () => {
    logOutput = '';
    const response = await login();
    expect(response.status).toBe(200);
    const cookie = cookieFrom(response);
    const body = await response.json();
    expect(body.user).toMatchObject({
      id: userId,
      email: 'real-http@example.test',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
    await app.close();
    await startApp();
    const session = await fetch(baseUrl + '/api/auth/session', {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    expect((await session.json()).user.id).toBe(userId);
    expect(logOutput).not.toContain(password);
    expect(logOutput).not.toContain(cookie);
    expect(logOutput).not.toContain(cookie.split('=')[1]);
    expect(logOutput).not.toContain('$argon2');
    const safeLog = JSON.parse(
      logOutput.trim().split('\n').at(-1) ?? '{}',
    ) as Record<string, unknown>;
    expect(safeLog).toMatchObject({
      method: 'GET',
      route: '/api/auth/session',
      statusCode: 200,
    });
  });
  it('has equivalent 401 responses for missing, inactive and wrong-password identities with zero new sessions', async () => {
    const count = await prisma.session.count();
    let generic: unknown;
    for (const [email, supplied] of [
      ['missing-http@example.test', password],
      ['inactive-http@example.test', password],
      ['real-http@example.test', randomBytes(24).toString('base64url')],
    ]) {
      const response = await login(email, supplied);
      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      if (generic) expect(body).toEqual(generic);
      generic = body;
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(await prisma.session.count()).toBe(count);
  });
  it('denies missing, malformed, unknown, revoked and expired sessions', async () => {
    for (const cookie of [
      '',
      '__Host-nextriva_session=malformed',
      '__Host-nextriva_session=' + randomBytes(32).toString('base64url'),
    ]) {
      expect(
        (await fetch(baseUrl + '/api/auth/session', { headers: { cookie } }))
          .status,
      ).toBe(401);
    }
    const cookie = cookieFrom(await login());
    now = new Date(start.getTime() + 1_800_000);
    expect(
      (await fetch(baseUrl + '/api/auth/session', { headers: { cookie } }))
        .status,
    ).toBe(401);
    now = start;
  });
  it('denies foreign/missing CSRF and invalid origins without persisted fixture changes', async () => {
    const cookie = cookieFrom(await login());
    const foreign = cookieFrom(await login());
    const csrfResponse = await fetch(baseUrl + '/api/auth/csrf', {
      headers: { cookie },
    });
    const { csrfToken } = await csrfResponse.json();
    const foreignResponse = await fetch(baseUrl + '/api/auth/csrf', {
      headers: { cookie: foreign },
    });
    const foreignCsrf = (await foreignResponse.json()).csrfToken;
    for (const headers of [
      { cookie, origin },
      { cookie, origin, 'x-csrf-token': 'invalid' },
      { cookie, origin, 'x-csrf-token': foreignCsrf },
      { cookie, origin: 'https://evil.test', 'x-csrf-token': csrfToken },
      { cookie, 'x-csrf-token': csrfToken },
    ]) {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const response = await fetch(baseUrl + '/test-only/mutation', {
        method: 'POST',
        headers,
      });
      expect(response.status).toBe(403);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      ).toEqual(before);
    }
    const allowed = await fetch(baseUrl + '/test-only/mutation', {
      method: 'POST',
      headers: { cookie, origin, 'x-csrf-token': csrfToken },
    });
    expect(allowed.status).toBe(201);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).lastName,
    ).toBe('MutationVerified');
    expect(logOutput).not.toContain(csrfToken);
    expect(logOutput).not.toContain(foreignCsrf);
  });
  it('checks origin before credentials and rate limits the sixth failed attempt until window expiry', async () => {
    const count = await prisma.session.count();
    expect((await login('real-http@example.test', password, {})).status).toBe(
      403,
    );
    expect(
      (await login('real-http@example.test', password, { origin: 'null' }))
        .status,
    ).toBe(403);
    expect(await prisma.session.count()).toBe(count);
    for (let index = 0; index < 5; index++)
      expect((await login('rate-http@example.test', password)).status).toBe(
        401,
      );
    expect((await login('rate-http@example.test', password)).status).toBe(429);
    now = new Date(start.getTime() + 900_000);
    expect((await login('rate-http@example.test', password)).status).toBe(401);
    now = start;
    expect(
      (
        await login('real-http@example.test', password, {
          referer: origin + '/login',
        })
      ).status,
    ).toBe(200);
  });
});
