import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const password = randomBytes(24).toString('base64url');
const emails = {
  ADMIN: fixtureEmail('ui-promotion-admin'),
  MANAGER: fixtureEmail('ui-promotion-manager'),
  COLLABORATOR: fixtureEmail('ui-promotion-collaborator'),
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
    await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Promotion UI',
        email: emails[role],
        role,
        passwordHash,
      },
    });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test('ADMIN creates, consults, edits phases, archives and reactivates from the interface', async ({
  page,
}) => {
  await page.goto('/');
  expect(
    await page.evaluate(
      async (credentials) =>
        (
          await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(credentials),
          })
        ).status,
      { email: emails.ADMIN, password },
    ),
  ).toBe(200);
  await page.getByRole('link', { name: 'Promociones', exact: true }).click();
  await page.getByRole('button', { name: 'Crear promoción' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('ab');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(
    page.getByText('Nombre: entre 3 y 150 caracteres.'),
  ).toBeVisible();
  const name = `Promoción interfaz ${randomBytes(6).toString('hex')}`;
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Datos sintéticos del flujo de interfaz');
  await page.getByLabel('Ubicación', { exact: true }).fill('Barcelona');
  await page.getByLabel('Posventa', { exact: true }).check();
  await page
    .getByLabel('Planificación y planos básicos', { exact: true })
    .check();
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/promotions') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect((await createdResponse).status()).toBe(201);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Fases activas' }).getByRole('listitem'),
  ).toHaveText(['Planificación y planos básicos', 'Posventa']);
  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a promociones' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Editar promoción' }).click();
  await page
    .getByLabel('Planificación y planos básicos', { exact: true })
    .uncheck();
  await page.getByLabel('Construcción', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Fases activas' }).getByRole('listitem'),
  ).toHaveText(['Construcción', 'Posventa']);
  await page
    .getByRole('button', { name: 'Archivar promoción', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar archivo', exact: true })
    .click();
  await expect(page.getByText('Archivada', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Editar promoción' }),
  ).toHaveCount(0);
  const archived = await prisma.promotion.findFirstOrThrow({
    where: { name },
    include: { phases: true },
  });
  expect(archived.status).toBe('ARCHIVED');
  expect(archived.phases.map(({ phase }) => phase).sort()).toEqual([
    'AFTER_SALES',
    'CONSTRUCTION',
  ]);
  await page
    .getByRole('button', { name: 'Reactivar promoción', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar reactivación', exact: true })
    .click();
  await expect(page.getByText('Activa', { exact: true })).toBeVisible();
  expect(
    (await prisma.promotion.findUniqueOrThrow({ where: { id: archived.id } }))
      .status,
  ).toBe('ACTIVE');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const role of ['MANAGER', 'COLLABORATOR'] as const) {
  test(`${role} receives a real server rejection without promotions or mutations`, async ({
    page,
  }) => {
    const deniedName = `Promoción denegada ${randomBytes(6).toString('hex')}`;
    await page.goto('/');
    expect(
      await page.evaluate(
        async (credentials) =>
          (
            await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(credentials),
            })
          ).status,
        { email: emails[role], password },
      ),
    ).toBe(200);
    const denied = page.waitForResponse((response) =>
      response.url().endsWith('/api/promotions'),
    );
    await page.getByRole('link', { name: 'Promociones', exact: true }).click();
    expect((await denied).status()).toBe(403);
    await expect(page.getByRole('alert')).toHaveText(
      'No tienes permisos para gestionar promociones.',
    );
    await expect(
      page.getByRole('button', { name: 'Crear promoción' }),
    ).toHaveCount(0);
    const rejectedCreation = await page.evaluate(async (name) => {
      const csrf = await (await fetch('/api/auth/csrf')).json();
      return (
        await fetch('/api/promotions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf.csrfToken,
          },
          body: JSON.stringify({ name, phases: ['PLANNING'] }),
        })
      ).status;
    }, deniedName);
    expect(rejectedCreation).toBe(403);
    expect(await prisma.promotion.count({ where: { name: deniedName } })).toBe(
      0,
    );
  });
}
