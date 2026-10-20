import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';

const password = randomBytes(24).toString('base64url');
const email = 'browser-auth@example.test';
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Browser',
      email,
      passwordHash: await new PasswordHasher().hash(password),
      role: 'COLLABORATOR',
    },
  });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test('Chromium logs in against the real API and keeps its HttpOnly session across reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const login = await page.evaluate(
    async (input) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    },
    { email, password },
  );
  expect(login.status).toBe(200);
  expect(login.body.user.email).toBe(email);
  expect(login.body.user).not.toHaveProperty('passwordHash');
  const cookies = await context.cookies();
  const cookie = cookies.find((item) => item.name === 'nextriva_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.value.length).toBe(43);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(
    await page.evaluate(() => document.cookie.includes('nextriva_session')),
  ).toBe(false);
  await page.reload();
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session');
    return { status: response.status, body: await response.json() };
  });
  expect(session.status).toBe(200);
  expect(session.body.user.email).toBe(email);
  expect(session.body.user).not.toHaveProperty('passwordHash');
  await context.clearCookies();
  expect(
    await page.evaluate(async () => (await fetch('/api/auth/session')).status),
  ).toBe(401);
});

test('Chromium receives generic invalid login and cannot access the protected route', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (input) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    },
    { email, password: randomBytes(24).toString('base64url') },
  );
  expect(result.status).toBe(401);
  expect(result.body.message).toBe('Credenciales inválidas');
  expect(
    (await context.cookies()).some((item) => item.name === 'nextriva_session'),
  ).toBe(false);
  expect(
    await page.evaluate(async () => (await fetch('/api/auth/session')).status),
  ).toBe(401);
});
