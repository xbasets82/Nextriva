import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const password = randomBytes(24).toString('base64url');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const adminEmail = fixtureEmail('status-admin');
const managerEmail = fixtureEmail('status-manager');
const collaboratorEmail = fixtureEmail('status-collaborator');
const targetEmail = fixtureEmail('status-target');
let targetId: string;

test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  const admin = await prisma.user.create({
    data: {
      firstName: 'Status',
      lastName: 'Admin',
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
    },
  });
  await prisma.user.createMany({
    data: [
      {
        firstName: 'Status',
        lastName: 'Manager',
        email: managerEmail,
        passwordHash,
        role: 'MANAGER',
      },
      {
        firstName: 'Status',
        lastName: 'Collaborator',
        email: collaboratorEmail,
        passwordHash,
        role: 'COLLABORATOR',
      },
      {
        firstName: 'Status',
        lastName: 'Target',
        email: targetEmail,
        passwordHash,
        role: 'COLLABORATOR',
      },
    ],
  });
  expect(admin.isActive).toBe(true);
  targetId = (
    await prisma.user.findUniqueOrThrow({ where: { email: targetEmail } })
  ).id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function authenticate(page: Page, email: string) {
  await page.goto('/#/users');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

test('administrator toggles user status with accessible confirmation and persisted changes', async ({
  page,
}) => {
  await authenticate(page, adminEmail);
  await page
    .getByRole('searchbox', { name: 'Buscar usuarios' })
    .fill(targetEmail);
  const deactivate = page
    .getByRole('listitem')
    .filter({ hasText: targetEmail })
    .getByRole('button', {
      name: 'Desactivar usuario',
    });
  await deactivate.click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).isActive,
  ).toBe(true);

  await page.keyboard.press('Escape');
  await expect(deactivate).toBeFocused();
  await deactivate.click();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Tab');
  const confirmDeactivation = page.getByRole('button', {
    name: 'Confirmar desactivación',
  });
  await expect(confirmDeactivation).toBeFocused();
  const statusResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname.endsWith(
        `/api/users/${targetId}/status`,
      ),
  );
  await page.keyboard.press('Enter');
  const result = await statusResponse;
  expect(result.status()).toBe(200);
  expect((await result.json()).user.isActive).toBe(false);

  await expect(
    page.getByRole('listitem').filter({ hasText: targetEmail }),
  ).toHaveCount(0);
  await page.getByLabel('Estado', { exact: true }).selectOption('inactive');

  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: targetEmail })
      .getByRole('button', { name: 'Activar usuario' }),
  ).toBeVisible();
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).isActive,
  ).toBe(false);
  await expect(
    page.getByRole('heading', { name: 'Usuarios', exact: true }),
  ).toBeFocused();

  await page
    .getByRole('listitem')
    .filter({ hasText: targetEmail })
    .getByRole('button', { name: 'Activar usuario' })
    .click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.getByLabel('Estado', { exact: true }).selectOption('active');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: targetEmail })
      .getByRole('button', { name: 'Desactivar usuario' }),
  ).toBeVisible();
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).isActive,
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.locator('body').innerText()).not.toContain(password);
  expect(await page.locator('body').innerText()).not.toContain('$argon2');
});

for (const [role, email] of [
  ['MANAGER', managerEmail],
  ['COLLABORATOR', collaboratorEmail],
] as const) {
  test(`${role} cannot toggle status through the real API`, async ({
    page,
  }) => {
    await authenticate(page, email);
    await expect(
      page.getByRole('heading', { name: 'Incidencias', exact: true }),
    ).toBeVisible();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: targetId },
    });
    const responseStatus = await page.evaluate(async (id) => {
      const csrf = await (await fetch('/api/auth/csrf')).json();
      return (
        await fetch(`/api/users/${encodeURIComponent(id)}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf.csrfToken,
          },
          body: JSON.stringify({ isActive: false }),
        })
      ).status;
    }, targetId);
    expect(responseStatus).toBe(403);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: targetId } }),
    ).toEqual(before);
  });
}
