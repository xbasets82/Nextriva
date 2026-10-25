import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const password = randomBytes(24).toString('base64url');
const suffix = randomBytes(8).toString('hex');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const emails = {
  ADMIN: fixtureEmail(`i042-admin-${suffix}`),
  MANAGER: fixtureEmail(`i042-manager-${suffix}`),
  COLLABORATOR: fixtureEmail(`i042-collab-${suffix}`),
};
const users = new Map<string, string>();
let promotionId: string;
let outsideId: string;
const name = `Participantes UI ${suffix}`;
async function login(page: Page, role: keyof typeof emails) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(emails[role]);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Promociones', exact: true }),
  ).toBeVisible();
}
test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        email: emails[role],
        role,
        passwordHash,
      },
    });
    users.set(role, user.id);
  }
  const promotion = await prisma.promotion.create({
    data: {
      name,
      phases: { create: { phase: 'PLANNING' } },
      participants: { create: { userId: users.get('MANAGER')! } },
    },
  });
  promotionId = promotion.id;
  outsideId = (
    await prisma.promotion.create({
      data: {
        name: `Fuera ${suffix}`,
        phases: { create: { phase: 'CONSTRUCTION' } },
      },
    })
  ).id;
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test('real MANAGER assigns/removes from UI and a real collaborator loses scope immediately', async ({
  page,
  browser,
}) => {
  await login(page, 'MANAGER');
  await page.getByRole('link', { name: 'Promociones', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `Fuera ${suffix}`, exact: true }),
  ).toHaveCount(0);
  const candidatesResponse = page.waitForResponse((response) =>
    response
      .url()
      .endsWith(`/api/promotions/${promotionId}/eligible-participants`),
  );
  await page.getByRole('link', { name, exact: true }).click();
  expect((await candidatesResponse).status()).toBe(200);
  await expect(
    page.getByRole('combobox', { name: 'Colaborador', exact: true }),
  ).toHaveAccessibleName('Colaborador');
  await expect(
    page
      .getByRole('combobox', { name: 'Colaborador', exact: true })
      .locator('option')
      .first(),
  ).toHaveText('Seleccionar colaborador');
  await expect(
    page.getByRole('button', { name: 'Añadir participante' }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole('button', { name: 'Añadir participante' })
      .locator('svg[data-icon="plus"]'),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(
    page.getByRole('button', { name: 'Editar promoción' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Usuarios', exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Colaborador', { exact: true })
    .selectOption(users.get('COLLABORATOR')!);
  const added = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/promotions/${promotionId}/participants`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Añadir participante' }).click();
  expect((await added).status()).toBe(201);
  await expect(
    page.getByText('Participante añadido.', { exact: true }),
  ).toBeVisible();
  expect(
    await prisma.promotionParticipant.count({
      where: { promotionId, userId: users.get('COLLABORATOR')! },
    }),
  ).toBe(1);
  const collaboratorPage = await browser.newPage();
  await login(collaboratorPage, 'COLLABORATOR');
  await collaboratorPage
    .getByRole('link', { name: 'Promociones', exact: true })
    .click();
  await collaboratorPage.getByRole('link', { name, exact: true }).click();
  await expect(
    collaboratorPage.getByRole('list', { name: 'Participantes vinculados' }),
  ).toBeVisible();
  await expect(
    collaboratorPage.getByRole('button', { name: 'Añadir participante' }),
  ).toHaveCount(0);
  await expect(
    collaboratorPage.getByRole('button', { name: /Retirar/ }),
  ).toHaveCount(0);
  const before = await prisma.promotionParticipant.count({
    where: { promotionId },
  });
  const denied = await collaboratorPage.evaluate(
    async ({ id, outside }) => {
      const csrf = (await (await fetch('/api/auth/csrf')).json()).csrfToken;
      return Promise.all([
        fetch(`/api/promotions/${id}/eligible-participants`),
        fetch(`/api/promotions/${outside}`),
        fetch(`/api/promotions/${id}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({
            userId: '00000000-0000-4000-8000-000000000000',
          }),
        }),
      ]).then((responses) => responses.map((response) => response.status));
    },
    { id: promotionId, outside: outsideId },
  );
  expect(denied).toEqual([403, 404, 403]);
  expect(
    await prisma.promotionParticipant.count({ where: { promotionId } }),
  ).toBe(before);
  await expect(
    page
      .getByRole('button', { name: 'Retirar Synthetic COLLABORATOR' })
      .locator('svg[data-icon="user-round-minus"]'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Retirar Synthetic COLLABORATOR' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Retirar Synthetic COLLABORATOR' }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Retirar Synthetic COLLABORATOR' })
    .click();
  const removed = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().includes(`/api/promotions/${promotionId}/participants/`),
  );
  await page.getByRole('button', { name: 'Confirmar retirada' }).click();
  expect((await removed).status()).toBe(204);
  await expect(
    page.getByText(
      'Participante retirado. Su acceso a esta promoción ha sido revocado.',
      { exact: true },
    ),
  ).toBeFocused();
  expect(
    await prisma.promotionParticipant.count({
      where: { promotionId, userId: users.get('COLLABORATOR')! },
    }),
  ).toBe(0);
  const revoked = collaboratorPage.waitForResponse((response) =>
    response.url().endsWith(`/api/promotions/${promotionId}`),
  );
  await collaboratorPage.reload();
  expect((await revoked).status()).toBe(404);
  await expect(
    collaboratorPage.getByText('No se ha encontrado la promoción.', {
      exact: true,
    }),
  ).toBeVisible();
  await collaboratorPage
    .getByRole('link', { name: 'Promociones', exact: true })
    .click();
  await expect(
    collaboratorPage.getByRole('link', { name, exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await collaboratorPage.close();
});
