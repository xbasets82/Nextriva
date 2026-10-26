import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const password = randomBytes(24).toString('base64url');
const users = new Map<string, { id: string; email: string }>();
let promotionId: string;
test.beforeAll(async () => {
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: `Deletion ${role}`,
        email: fixtureEmail(`issue119-${role.toLowerCase()}`),
        role,
        passwordHash: await new PasswordHasher().hash(password),
      },
    });
    users.set(role, user);
  }
  promotionId = (
    await prisma.promotion.create({
      data: {
        name: 'Issue119 deletion promotion',
        phases: { create: { phase: 'PLANNING' } },
        participants: {
          create: [
            { userId: users.get('MANAGER')!.id },
            { userId: users.get('COLLABORATOR')!.id },
          ],
        },
      },
    })
  ).id;
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
async function login(page: Page, role: string) {
  await page.goto('/#/login');
  await page.getByLabel('Email', { exact: true }).fill(users.get(role)!.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión', exact: true }),
  ).toBeVisible();
}
async function fixture(title: string) {
  return prisma.incident.create({
    data: {
      promotionId,
      createdById: users.get('COLLABORATOR')!.id,
      assignedToId: users.get('COLLABORATOR')!.id,
      originPhase: 'PLANNING',
      title,
      description: 'Synthetic logical deletion scenario',
      priority: 'HIGH',
      category: 'OTHER',
    },
  });
}
test('Issue119 ADMIN confirms deletion with a reason and examines the preserved audit in restricted history', async ({
  page,
}) => {
  const incident = await fixture('Issue119 ADMIN visual deletion');
  await login(page, 'ADMIN');
  await page.goto(`/#/incidents/${incident.id}`);
  await page
    .getByRole('button', { name: 'Eliminar incidencia', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar incidencia' });
  await expect(dialog.getByLabel('Motivo de eliminación')).toBeFocused();
  await dialog
    .getByRole('button', { name: 'Confirmar eliminación', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('entre 5 y 2.000');
  await dialog
    .getByLabel('Motivo de eliminación')
    .fill('Retirada sintética para auditoría');
  const removed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/incidents/${incident.id}/soft-delete`),
  );
  await dialog
    .getByRole('button', { name: 'Confirmar eliminación', exact: true })
    .click();
  expect((await removed).status()).toBe(200);
  await expect(page).toHaveURL(/#\/incidents$/);
  await page
    .getByRole('link', {
      name: 'Consultar incidencias eliminadas',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Incidencias eliminadas', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(incident.title, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Retirada sintética para auditoría', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic Deletion ADMIN', { exact: true }),
  ).toBeVisible();
  const persisted = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
    include: { activities: true },
  });
  expect(persisted.status).toBe('OPEN');
  expect(persisted.deletedById).toBe(users.get('ADMIN')!.id);
  expect(persisted.version).toBe(2);
  expect(persisted.activities).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const direct = await page.request.get(`/api/incidents/${incident.id}`);
  expect(direct.status()).toBe(404);
});
test('Issue119 COLLABORATOR cannot delete or consult deleted data and causes no persisted mutation', async ({
  page,
}) => {
  const incident = await fixture('Issue119 collaborator denied');
  await login(page, 'COLLABORATOR');
  await page.goto(`/#/incidents/${incident.id}`);
  await expect(
    page.getByRole('heading', { name: incident.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Eliminar incidencia', exact: true }),
  ).toHaveCount(0);
  const token = (await (await page.request.get('/api/auth/csrf')).json())
    .csrfToken as string;
  const denied = await page.request.post(
    `/api/incidents/${incident.id}/soft-delete`,
    {
      headers: { origin: new URL(page.url()).origin, 'x-csrf-token': token },
      data: { version: 1, reason: 'Forbidden deletion attempt' },
    },
  );
  expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/incidents/deleted')).status()).toBe(403);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ deletedAt: null, version: 1 });
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(0);
});
