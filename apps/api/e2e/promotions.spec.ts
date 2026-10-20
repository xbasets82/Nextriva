import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const email = fixtureEmail('browser-promotions-admin');
const password = randomBytes(24).toString('base64url');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Promotion Administrator',
      email,
      passwordHash: await new PasswordHasher().hash(password),
      role: 'ADMIN',
    },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('Chromium creates and queries a promotion persisted with ordered phases', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (credentials) => {
      const login = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const csrf = await (await fetch('/api/auth/csrf')).json();
      const input = {
        name: 'E2E synthetic promotion',
        phases: ['AFTER_SALES', 'PLANNING', 'CONSTRUCTION'],
      };
      const created = await fetch('/api/promotions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify(input),
      });
      const createdBody = await created.json();
      const listed = await fetch('/api/promotions');
      const listBody = await listed.json();
      const detailed = await fetch(
        '/api/promotions/' + createdBody.promotion.id,
      );
      return {
        login: login.status,
        create: created.status,
        list: listed.status,
        detail: detailed.status,
        promotion: createdBody.promotion,
        listed: listBody.promotions.some(
          (promotion: { id: string }) =>
            promotion.id === createdBody.promotion.id,
        ),
        detailed: (await detailed.json()).promotion,
      };
    },
    { email, password },
  );

  expect(result).toMatchObject({
    login: 200,
    create: 201,
    list: 200,
    detail: 200,
    listed: true,
  });
  expect(result.promotion.phases).toEqual([
    'PLANNING',
    'CONSTRUCTION',
    'AFTER_SALES',
  ]);
  expect(result.detailed.phases).toEqual(result.promotion.phases);

  const persisted = await prisma.promotion.findUniqueOrThrow({
    where: { id: result.promotion.id },
    include: { phases: { select: { phase: true } } },
  });
  expect(persisted.phases.map(({ phase }) => phase)).toEqual([
    'PLANNING',
    'CONSTRUCTION',
    'AFTER_SALES',
  ]);
});
