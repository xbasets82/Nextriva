import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
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
const email = fixtureEmail('i051-incident-admin');
let promotionId: string;
test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Incident ADMIN',
      email,
      role: 'ADMIN',
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  promotionId = (
    await prisma.promotion.create({
      data: {
        name: 'I05.1 creación web',
        phases: { create: { phase: 'PLANNING' } },
      },
    })
  ).id;
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('ADMIN creates an incident with a valid inactive phase and opens its persisted detail', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page.getByRole('link', { name: 'Promociones', exact: true }).click();
  await page
    .getByRole('link', { name: 'I05.1 creación web', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Crear incidencia', exact: true })
    .click();
  await page.getByLabel('Título', { exact: true }).fill('Fisura web sintética');
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Fisura sintética para probar creación atómica.');
  await page
    .getByLabel('Fase de origen', { exact: true })
    .selectOption('AFTER_SALES');
  await page.getByLabel('Categoría', { exact: true }).selectOption('STRUCTURE');
  await page.getByLabel('Prioridad', { exact: true }).selectOption('HIGH');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/incidents') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  expect((await created).status()).toBe(201);
  await expect(
    page.getByRole('heading', { name: 'Fisura web sintética', exact: true }),
  ).toBeFocused();
  await expect(page.getByText('Abierta', { exact: true })).toBeVisible();
  await expect(page.getByText('Posventa', { exact: true })).toBeVisible();
  await expect(page.getByText(/^INC-\d{6,}$/)).toBeVisible();
  const incident = await prisma.incident.findFirstOrThrow({
    where: { promotionId, title: 'Fisura web sintética' },
    include: { activities: true },
  });
  expect(incident.originPhase).toBe('AFTER_SALES');
  expect(incident.activities).toHaveLength(1);
  expect(incident.activities[0]?.changes).toEqual({
    originPhase: 'AFTER_SALES',
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Fisura web sintética', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
