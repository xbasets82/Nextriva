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
const suffix = randomBytes(8).toString('hex');
const roles = ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const;
const emails = new Map<string, string>();
const actors = new Map<string, string>();
let promotionId: string;
let ownId: string;
let otherId: string;
let outsideId: string;
async function login(page: Page, role: (typeof roles)[number]) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(emails.get(role)!);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page.getByRole('link', { name: 'Incidencias', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Incidencias', exact: true }),
  ).toBeVisible();
}
test.beforeAll(async () => {
  const hash = await new PasswordHasher().hash(password);
  for (const role of roles) {
    const email = fixtureEmail(`i052-${role.toLowerCase()}-${suffix}`);
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        role,
        email,
        passwordHash: hash,
      },
    });
    emails.set(role, email);
    actors.set(role, user.id);
  }
  promotionId = (
    await prisma.promotion.create({
      data: {
        name: `I05.2 readable ${suffix}`,
        status: 'ARCHIVED',
      },
    })
  ).id;
  const outside = await prisma.promotion.create({
    data: { name: `I05.2 outside ${suffix}`, status: 'ARCHIVED' },
  });
  const input = {
    originPhase: 'AFTER_SALES' as const,
    description: 'Contenido sintético de consulta persistente.',
    category: 'STRUCTURE' as const,
    priority: 'HIGH' as const,
    status: 'CLOSED' as const,
  };
  ownId = (
    await prisma.incident.create({
      data: {
        ...input,
        promotionId,
        createdById: actors.get('COLLABORATOR')!,
        title: `Propia ${suffix}`,
      },
    })
  ).id;
  otherId = (
    await prisma.incident.create({
      data: {
        ...input,
        promotionId,
        createdById: actors.get('ADMIN')!,
        title: `Otra ${suffix}`,
      },
    })
  ).id;
  outsideId = (
    await prisma.incident.create({
      data: {
        ...input,
        promotionId: outside.id,
        createdById: actors.get('COLLABORATOR')!,
        title: `Ajena ${suffix}`,
      },
    })
  ).id;
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test('ADMIN recovers a network error, opens a persisted list row by keyboard and returns on mobile', async ({
  page,
}) => {
  await login(page, 'ADMIN');
  const link = page.getByRole('link', {
    name: new RegExp(`Propia ${suffix}$`),
  });
  await expect(link).toBeVisible();
  let unavailable = true;
  await page.route('**/api/incidents?*', async (route) => {
    if (unavailable) {
      await route.abort('failed');
    } else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo completar la solicitud. Inténtalo de nuevo.',
  );
  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: `Propia ${suffix}`, exact: true }),
  ).toBeFocused();
  await expect(page.getByText('Posventa', { exact: true })).toBeVisible();
  await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver a incidencias' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const role of ['MANAGER', 'COLLABORATOR'] as const) {
  test(`${role} sees an empty list and rejects private UUIDs without membership or data mutation`, async ({
    page,
  }) => {
    await login(page, role);
    await expect(
      page.getByText('No hay incidencias accesibles.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(`Ajena ${suffix}$`) }),
    ).toHaveCount(0);
    const ids = [ownId, otherId, outsideId];
    const before = await prisma.incident.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    const activities = await prisma.incidentActivity.findMany({
      where: { incidentId: { in: ids } },
    });
    const denied = await page.request.get(`/api/incidents/${outsideId}`);
    expect(denied.status()).toBe(404);
    const detailResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/incidents/${ownId}`),
    );
    await page.goto(`/#/incidents/${ownId}`);
    expect((await detailResponse).status()).toBe(404);
    await expect(page.getByRole('alert')).toHaveText(
      'No se ha encontrado la incidencia o la promoción.',
    );
    expect(
      await prisma.incident.findMany({
        where: { id: { in: ids } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.findMany({
        where: { incidentId: { in: ids } },
      }),
    ).toEqual(activities);
  });
}

test('ADMIN searches, clears filters, pages and returns from incident detail', async ({
  page,
}) => {
  const pageSuffix = randomBytes(6).toString('hex');
  await prisma.incident.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      promotionId,
      originPhase: 'AFTER_SALES' as const,
      title: `Paginación ${pageSuffix} ${index}`,
      description: 'Incidencia sintética para comprobar paginación.',
      category: 'STRUCTURE' as const,
      priority: 'MEDIUM' as const,
      status: 'CLOSED' as const,
      createdById: actors.get('ADMIN')!,
    })),
  });

  await login(page, 'ADMIN');
  await page
    .getByRole('searchbox', { name: 'Código o título' })
    .fill(pageSuffix);
  await expect(page.getByText('Página 1 de 3')).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(pageSuffix) }),
  ).toHaveCount(10);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(pageSuffix) }),
  ).toHaveCount(10);

  const secondPageLink = page
    .getByRole('link', { name: new RegExp(pageSuffix) })
    .first();
  await secondPageLink.click();
  await page.getByRole('heading', { level: 2 }).waitFor();
  await page.getByRole('link', { name: 'Volver a incidencias' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: 'Código o título' }),
  ).toHaveValue(pageSuffix);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 3 de 3')).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(pageSuffix) }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Código o título' }),
  ).toHaveValue('');

  await page
    .getByRole('searchbox', { name: 'Código o título' })
    .fill(`Propia ${suffix}`);
  const own = page.getByRole('link', { name: new RegExp(`Propia ${suffix}$`) });
  await expect(own).toBeVisible();
  await own.click();
  await expect(
    page.getByRole('heading', { name: `Propia ${suffix}` }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Volver a incidencias' }).click();
  await expect(
    page.getByRole('heading', { name: 'Incidencias' }),
  ).toBeVisible();
});

for (const role of ['MANAGER', 'COLLABORATOR'] as const) {
  test(`Issue 105 ${role} sees named filter options only from its incident scope`, async ({
    page,
  }) => {
    const marker = randomBytes(6).toString('hex');
    const hash = await new PasswordHasher().hash(password);
    const reader = await prisma.user.create({
      data: {
        firstName: 'Lector',
        lastName: role,
        email: fixtureEmail(`options-reader-${marker}`),
        role,
        passwordHash: hash,
      },
    });
    const candidates = [];
    for (const label of ['Visible', 'Private'])
      candidates.push(
        await prisma.user.create({
          data: {
            firstName: label,
            lastName: marker,
            email: fixtureEmail(`options-${label.toLowerCase()}-${marker}`),
            role: 'COLLABORATOR',
            passwordHash: hash,
          },
        }),
      );
    const linked = await prisma.promotion.create({
      data: { name: `Promoción visible ${marker}`, status: 'ARCHIVED' },
    });
    const outside = await prisma.promotion.create({
      data: { name: `Promoción privada ${marker}`, status: 'ARCHIVED' },
    });
    await prisma.promotionParticipant.createMany({
      data: [
        { promotionId: linked.id, userId: reader.id },
        ...candidates.map(({ id }) => ({ promotionId: linked.id, userId: id })),
      ],
    });
    const shared = {
      originPhase: 'PLANNING' as const,
      description: 'Fixture real de opciones por ámbito',
      category: 'STRUCTURE' as const,
      priority: 'HIGH' as const,
      status: 'CLOSED' as const,
    };
    const own = await prisma.incident.create({
      data: {
        ...shared,
        promotionId: linked.id,
        createdById: reader.id,
        assignedToId: candidates[0]!.id,
        title: `Propia ${marker}`,
      },
    });
    const assigned = await prisma.incident.create({
      data: {
        ...shared,
        promotionId: linked.id,
        createdById: actors.get('ADMIN')!,
        assignedToId: reader.id,
        title: `Asignada ${marker}`,
      },
    });
    const other = await prisma.incident.create({
      data: {
        ...shared,
        promotionId: linked.id,
        createdById: actors.get('ADMIN')!,
        assignedToId: candidates[1]!.id,
        title: `Otra ${marker}`,
      },
    });
    const privateIncident = await prisma.incident.create({
      data: {
        ...shared,
        promotionId: outside.id,
        createdById: reader.id,
        title: `Privada ${marker}`,
      },
    });
    const ids = [own.id, assigned.id, other.id, privateIncident.id];
    const before = await prisma.incident.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(reader.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    const filter = page.getByLabel('Responsable', { exact: true });
    await expect(filter).toBeEnabled();
    await expect(
      filter.getByRole('option', {
        name: `Visible ${marker} — ${candidates[0]!.email}`,
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      filter.getByRole('option', {
        name: `Private ${marker} — ${candidates[1]!.email}`,
        exact: true,
      }),
    ).toHaveCount(role === 'MANAGER' ? 1 : 0);
    await expect(
      page
        .getByLabel('Promoción', { exact: true })
        .getByRole('option', { name: outside.name }),
    ).toHaveCount(0);
    await filter.selectOption(candidates[0]!.id);
    await expect(
      page.getByRole('link', { name: new RegExp(`Propia ${marker}$`) }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(`Asignada ${marker}$`) }),
    ).toHaveCount(0);
    expect(
      (await page.request.get(`/api/incidents/${privateIncident.id}`)).status(),
    ).toBe(404);
    expect(
      await prisma.incident.findMany({
        where: { id: { in: ids } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId: { in: ids } },
      }),
    ).toBe(0);
  });
}
