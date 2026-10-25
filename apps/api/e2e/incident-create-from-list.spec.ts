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
const marker = randomBytes(8).toString('hex');
async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Incidencias', exact: true }),
  ).toBeVisible();
}
async function fillIncident(page: Page, title: string) {
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Descripción sintética de creación desde el listado general.');
  await page.getByLabel('Fase de origen').selectOption('AFTER_SALES');
  await page.getByLabel('Categoría', { exact: true }).selectOption('OTHER');
  await page.getByLabel('Prioridad', { exact: true }).selectOption('MEDIUM');
}
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
  test(`Issue 106 ${role} creates from the list, preserves filters and persists an initial activity`, async ({
    page,
  }) => {
    const user = await prisma.user.create({
      data: {
        firstName: 'I106',
        lastName: role,
        role,
        email: fixtureEmail(`i106-${role.toLowerCase()}-${marker}`),
        passwordHash: await new PasswordHasher().hash(password),
      },
    });
    const promotion = await prisma.promotion.create({
      data: {
        name: `I106 activa ${role} ${marker}`,
        phases: { create: { phase: 'PLANNING' } },
        participants:
          role === 'ADMIN' ? undefined : { create: { userId: user.id } },
      },
    });
    const archived = await prisma.promotion.create({
      data: {
        name: `I106 archivada ${role} ${marker}`,
        status: 'ARCHIVED',
        participants:
          role === 'ADMIN' ? undefined : { create: { userId: user.id } },
      },
    });
    const outside = await prisma.promotion.create({
      data: {
        name: `I106 privada ${role} ${marker}`,
        phases: { create: { phase: 'CONSTRUCTION' } },
      },
    });
    await login(page, user.email);
    const title = `I106 creada ${role} ${marker}`;
    await page.getByRole('searchbox', { name: 'Código o título' }).fill(title);
    await expect(
      page.getByText('No hay incidencias accesibles.'),
    ).toBeVisible();
    const create = page.getByRole('button', {
      name: 'Crear incidencia',
      exact: true,
    });
    await create.focus();
    await page.keyboard.press('Enter');
    const selector = page.getByRole('form', { name: 'Seleccionar promoción' });
    await expect(
      page.getByRole('heading', { name: 'Seleccionar promoción' }),
    ).toBeFocused();
    await expect(
      selector.getByRole('option', { name: archived.name }),
    ).toHaveCount(0);
    if (role !== 'ADMIN')
      await expect(
        selector.getByRole('option', { name: outside.name }),
      ).toHaveCount(0);
    await selector
      .getByLabel('Promoción', { exact: true })
      .selectOption(promotion.id);
    await selector.getByRole('button', { name: 'Continuar' }).click();
    await expect(
      page.getByRole('form', { name: 'Crear incidencia' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(
      page.getByRole('searchbox', { name: 'Código o título' }),
    ).toHaveValue(title);
    await create.click();
    await selector
      .getByLabel('Promoción', { exact: true })
      .selectOption(promotion.id);
    await selector.getByRole('button', { name: 'Continuar' }).click();
    await fillIncident(page, title);
    if (role === 'COLLABORATOR')
      await page.setViewportSize({ width: 390, height: 844 });
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/incidents') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Crear incidencia', exact: true })
      .click();
    expect((await createdResponse).status()).toBe(201);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    const persisted = await prisma.incident.findFirstOrThrow({
      where: { promotionId: promotion.id, title },
      include: { activities: true },
    });
    expect(persisted).toMatchObject({
      createdById: user.id,
      originPhase: 'AFTER_SALES',
      status: 'OPEN',
      assignedToId: null,
    });
    expect(persisted.activities).toEqual([
      expect.objectContaining({ eventType: 'CREATED', actorId: user.id }),
    ]);
    await page.getByRole('link', { name: 'Volver a incidencias' }).click();
    await expect(
      page.getByRole('searchbox', { name: 'Código o título' }),
    ).toHaveValue(title);
    await expect(
      page.getByRole('link', { name: `${persisted.publicCode} — ${title}` }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test('Issue 106 participant revocation after selection is rejected by the real API without inserts', async ({
  page,
}) => {
  const user = await prisma.user.create({
    data: {
      firstName: 'I106',
      lastName: 'Revocado',
      role: 'COLLABORATOR',
      email: fixtureEmail(`i106-revoked-${marker}`),
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  const promotion = await prisma.promotion.create({
    data: {
      name: `I106 revocación ${marker}`,
      phases: { create: { phase: 'CONSTRUCTION' } },
      participants: { create: { userId: user.id } },
    },
  });
  await login(page, user.email);
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  await page
    .getByLabel('Promoción', { exact: true })
    .selectOption(promotion.id);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('form', { name: 'Crear incidencia' }).waitFor();
  await prisma.promotionParticipant.deleteMany({
    where: { promotionId: promotion.id, userId: user.id },
  });
  await fillIncident(page, `I106 revocada ${marker}`);
  const denied = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/incidents') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  expect((await denied).status()).toBe(404);
  await expect(page.getByRole('alert')).toHaveText(
    'No se ha encontrado la incidencia o la promoción.',
  );
  expect(
    await prisma.incident.count({ where: { promotionId: promotion.id } }),
  ).toBe(0);
  expect(
    await prisma.incidentActivity.count({
      where: { incident: { promotionId: promotion.id } },
    }),
  ).toBe(0);
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  await expect(
    page.getByText(
      'No hay promociones activas disponibles para crear incidencias.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
});
