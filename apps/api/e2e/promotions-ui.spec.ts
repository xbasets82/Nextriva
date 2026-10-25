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
  const filterPrefix = `Filtro UI ${randomBytes(4).toString('hex')}`;
  const longName = `${filterPrefix} 0${'x'.repeat(150 - filterPrefix.length - 2)}`;
  const locations = new Map([
    [2, 'L'.repeat(200)],
    [11, 'Barcelona'],
  ]);
  for (let index = 1; index <= 11; index += 1)
    await prisma.promotion.create({
      data: {
        name: index === 1 ? longName : `${filterPrefix} ${index}`,
        location: locations.get(index) ?? `Ubicación ${index}`,
        status: index === 11 ? 'ARCHIVED' : 'ACTIVE',
        phases: { create: [{ phase: 'HANDOVER' }] },
      },
    });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(emails.ADMIN);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page.getByRole('link', { name: 'Promociones', exact: true }).click();
  const promotionList = page.getByRole('list', {
    name: 'Listado de promociones',
  });
  const promotionRows = promotionList.locator(':scope > li');
  const promotionSearch = page.getByRole('searchbox', {
    name: 'Buscar promociones',
  });
  await promotionSearch.fill(filterPrefix);
  await expect(promotionRows).toHaveCount(10);
  await expect(
    promotionList.getByRole('link', { name: longName }),
  ).toBeVisible();
  await expect(promotionList.getByText('L'.repeat(200))).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText('Página 1 de 2 · 11 promociones')).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(promotionRows).toHaveCount(1);
  await page
    .getByLabel('Fase activa', { exact: true })
    .selectOption('HANDOVER');
  await expect(promotionRows).toHaveCount(10);
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(promotionRows).toHaveCount(1);
  const secondPagePromotion = promotionRows.getByRole('link');
  const secondPageName = await secondPagePromotion.textContent();
  await secondPagePromotion.click();
  await expect(
    page.getByRole('heading', { name: secondPageName ?? '', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Volver a promociones' }).click();
  await expect(promotionSearch).toHaveValue(filterPrefix);
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('all');
  await expect(page.getByLabel('Fase activa', { exact: true })).toHaveValue(
    'HANDOVER',
  );
  await expect(page.getByText('Página 2 de 2 · 11 promociones')).toBeVisible();
  await expect(promotionRows).toHaveCount(1);
  await promotionSearch.fill(` ${filterPrefix} 11 `);
  await expect(promotionRows).toHaveCount(1);
  await page.getByLabel('Estado', { exact: true }).selectOption('ARCHIVED');
  await page
    .getByLabel('Fase activa', { exact: true })
    .selectOption('HANDOVER');
  await expect(
    promotionList.getByRole('img', { name: 'Archivada' }),
  ).toBeVisible();
  await promotionList.getByRole('link', { name: `${filterPrefix} 11` }).click();
  await page.getByRole('link', { name: 'Volver a promociones' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Buscar promociones' }),
  ).toHaveValue(` ${filterPrefix} 11 `);
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue(
    'ARCHIVED',
  );
  await expect(page.getByLabel('Fase activa', { exact: true })).toHaveValue(
    'HANDOVER',
  );
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
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
  await page.getByRole('searchbox', { name: 'Buscar promociones' }).fill(name);
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
  test(`${role} sees no unlinked promotions and cannot mutate promotions`, async ({
    page,
  }) => {
    const deniedName = `Promoción denegada ${randomBytes(6).toString('hex')}`;
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(emails[role]);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Promociones', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Usuarios', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Promociones', exact: true }).click();
    await expect(
      page.getByText('No hay promociones.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Paginación de promociones' }),
    ).toHaveCount(0);
    const visiblePromotions = await page.evaluate(async () => {
      const response = await fetch('/api/promotions');
      return { status: response.status, body: await response.json() };
    });
    expect(visiblePromotions).toEqual({
      status: 200,
      body: { promotions: [] },
    });
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
