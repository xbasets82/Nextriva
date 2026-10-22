import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const password = randomBytes(24).toString('base64url');
const suffix = randomBytes(4).toString('hex');
const identities = {
  admin: fixtureEmail(`i041-admin-${suffix}`),
  manager: fixtureEmail(`i041-manager-${suffix}`),
  collaborator: fixtureEmail(`i041-collaborator-${suffix}`),
  outsideCollaborator: fixtureEmail(`i041-outside-${suffix}`),
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});

async function signIn(page: Page, email: string): Promise<string> {
  await page.goto('/');
  return page.evaluate(
    async ({ email, password }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error('E2E authentication failed');
      const csrfResponse = await fetch('/api/auth/csrf');
      if (!csrfResponse.ok) throw new Error('E2E CSRF setup failed');
      return (await csrfResponse.json()).csrfToken as string;
    },
    { email, password },
  );
}

async function api(
  page: Page,
  csrfToken: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ({ path, method, body, csrfToken }) => {
      const response = await fetch(path, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(method === 'GET' ? {} : { 'x-csrf-token': csrfToken }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : {},
      };
    },
    { path, method, body, csrfToken },
  );
}

test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const [role, email] of [
    ['ADMIN', identities.admin],
    ['MANAGER', identities.manager],
    ['COLLABORATOR', identities.collaborator],
    ['COLLABORATOR', identities.outsideCollaborator],
  ] as const) {
    await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        email,
        passwordHash,
        role,
      },
    });
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('Chromium enforces participant scope across two promotions and revokes access on removal', async ({
  browser,
  page: adminPage,
}) => {
  const adminCsrf = await signIn(adminPage, identities.admin);
  const first = await api(adminPage, adminCsrf, '/api/promotions', 'POST', {
    name: `I04.1 scoped ${suffix}`,
    phases: ['PLANNING'],
  });
  const second = await api(adminPage, adminCsrf, '/api/promotions', 'POST', {
    name: `I04.1 outside ${suffix}`,
    phases: ['PLANNING'],
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const firstId = (first.body.promotion as { id: string }).id;
  const secondId = (second.body.promotion as { id: string }).id;
  const managerId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: identities.manager },
    })
  ).id;
  const collaboratorId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: identities.collaborator },
    })
  ).id;
  const outsideId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: identities.outsideCollaborator },
    })
  ).id;

  expect(
    (
      await api(
        adminPage,
        adminCsrf,
        `/api/promotions/${firstId}/participants`,
        'POST',
        {
          userId: managerId,
        },
      )
    ).status,
  ).toBe(201);

  const managerPage = await browser.newPage();
  const managerCsrf = await signIn(managerPage, identities.manager);
  const visible = await api(managerPage, managerCsrf, '/api/promotions');
  expect(visible.status).toBe(200);
  expect(
    visible.body.promotions.map((item: { id: string }) => item.id),
  ).toEqual([firstId]);
  expect(
    (await api(managerPage, managerCsrf, `/api/promotions/${secondId}`)).status,
  ).toBe(404);
  expect(
    (
      await api(
        managerPage,
        managerCsrf,
        `/api/promotions/${secondId}/participants`,
        'POST',
        { userId: collaboratorId },
      )
    ).status,
  ).toBe(404);

  expect(
    (
      await api(
        managerPage,
        managerCsrf,
        `/api/promotions/${firstId}/participants`,
        'POST',
        { userId: collaboratorId },
      )
    ).status,
  ).toBe(201);

  const collaboratorPage = await browser.newPage();
  const collaboratorCsrf = await signIn(
    collaboratorPage,
    identities.collaborator,
  );
  expect(
    (
      await api(
        collaboratorPage,
        collaboratorCsrf,
        `/api/promotions/${firstId}`,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api(
        collaboratorPage,
        collaboratorCsrf,
        `/api/promotions/${secondId}`,
      )
    ).status,
  ).toBe(404);

  expect(
    (
      await api(
        adminPage,
        adminCsrf,
        `/api/promotions/${firstId}/status`,
        'PATCH',
        {
          status: 'ARCHIVED',
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api(
        managerPage,
        managerCsrf,
        `/api/promotions/${firstId}/participants`,
        'POST',
        { userId: outsideId },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await api(
        managerPage,
        managerCsrf,
        `/api/promotions/${firstId}/participants/${collaboratorId}`,
        'DELETE',
      )
    ).status,
  ).toBe(204);
  expect(
    (
      await api(
        collaboratorPage,
        collaboratorCsrf,
        `/api/promotions/${firstId}`,
      )
    ).status,
  ).toBe(404);
  expect(
    await prisma.promotionParticipant.count({
      where: { promotionId: firstId, userId: collaboratorId },
    }),
  ).toBe(0);
  await managerPage.close();
  await collaboratorPage.close();
});
