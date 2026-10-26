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
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
  test(`personal Home for ${role}: real summary, scope, detail, logo and persistent assignee filter`, async ({
    page,
  }) => {
    const passwordHash = await new PasswordHasher().hash(password);
    const actor = await prisma.user.create({
      data: {
        firstName: 'Home',
        lastName: role,
        email: fixtureEmail(`home-${role.toLowerCase()}`),
        role,
        passwordHash,
      },
    });
    const creator = await prisma.user.create({
      data: {
        firstName: 'Otro',
        lastName: 'Creador',
        email: fixtureEmail(`home-creator-${role.toLowerCase()}`),
        role: 'ADMIN',
        passwordHash,
      },
    });
    const promotion = await prisma.promotion.create({
      data: {
        name: `Promoción Home ${role}`,
        phases: { create: [{ phase: 'PLANNING' }] },
        participants: { create: [{ userId: actor.id }] },
      },
    });
    const data = {
      promotionId: promotion.id,
      createdById: creator.id,
      assignedToId: actor.id,
      originPhase: 'PLANNING',
      title: 'Revisión de acceso principal',
      description: 'Comprobación sintética de Home personal.',
      category: 'OTHER',
      priority: 'HIGH',
    } as const;
    const first = await prisma.incident.create({
      data: { ...data, status: 'IN_PROGRESS' },
    });
    await prisma.incident.create({ data: { ...data, status: 'OPEN' } });
    await prisma.incident.create({
      data: {
        ...data,
        status: 'PENDING_VALIDATION',
        solution: 'Solución sintética',
        solutionSubmittedById: actor.id,
        solutionSubmittedAt: new Date(),
      },
    });
    await prisma.incident.create({
      data: {
        ...data,
        status: 'CLOSED',
        solution: 'Solución aprobada',
        solutionSubmittedById: actor.id,
        solutionSubmittedAt: new Date(),
        validatedById: creator.id,
        closedAt: new Date(),
      },
    });
    await prisma.incident.create({
      data: {
        ...data,
        assignedToId: creator.id,
        createdById: actor.id,
        title: 'Incidencia ajena de creador',
      },
    });
    await page.goto('/#/login');
    await page.getByLabel('Email', { exact: true }).fill(actor.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const summaryResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/incidents/personal-summary') &&
        response.status() === 200,
    );
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    const summary = await (await summaryResponse).json();
    await expect(page).toHaveURL(/#\/home$/);
    const counts = page.getByRole('list', { name: 'Recuentos por estado' });
    await expect(counts.getByRole('listitem')).toHaveText([
      'Abierta: 1',
      'En curso: 1',
      'Pendiente de validación: 1',
      'Cerrada: 1',
    ]);
    const list = page.getByRole('list', { name: 'Incidencias prioritarias' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list.getByRole('link').first()).toHaveText(first.publicCode);
    await expect(page.getByText('Incidencia ajena de creador')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Todas visibles', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Todas visibles', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(counts.getByRole('listitem')).toHaveText([
      `Abierta: ${summary.visibleCountsByStatus.OPEN}`,
      `En curso: ${summary.visibleCountsByStatus.IN_PROGRESS}`,
      `Pendiente de validación: ${summary.visibleCountsByStatus.PENDING_VALIDATION}`,
      `Cerrada: ${summary.visibleCountsByStatus.CLOSED}`,
    ]);
    expect(summary.visibleCountsByStatus.OPEN).toBeGreaterThanOrEqual(2);
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByText('Incidencia ajena de creador')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Asignadas a mí', exact: true })
      .click();
    await expect(counts.getByRole('listitem')).toHaveText([
      'Abierta: 1',
      'En curso: 1',
      'Pendiente de validación: 1',
      'Cerrada: 1',
    ]);
    await list.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(first.id + '$'));
    await page.reload();
    await expect(
      page.getByRole('heading', { name: first.title, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Nextriva — Inicio' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Resumen de incidencias',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver todas mis incidencias' }).click();
    await expect(
      page.getByRole('combobox', { name: 'Responsable', exact: true }),
    ).toHaveValue(actor.id);
    await page
      .getByRole('link', {
        name: `${first.publicCode} — ${first.title}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('link', { name: 'Volver a incidencias', exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Responsable', exact: true }),
    ).toHaveValue(actor.id);
    await page.getByRole('link', { name: 'Nextriva — Inicio' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(counts).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto('/');
    await expect(page).toHaveURL(/#\/home$/);
    await expect(counts).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
  });
test('a user without assigned incidents sees all four zero states and an empty priority list', async ({
  page,
}) => {
  const actor = await prisma.user.create({
    data: {
      firstName: 'Sin',
      lastName: 'Incidencias',
      email: fixtureEmail('home-empty'),
      role: 'COLLABORATOR',
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  await page.goto('/#/login');
  await page.getByLabel('Email', { exact: true }).fill(actor.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByText('No tienes incidencias asignadas.'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Recuentos por estado' })
      .getByRole('listitem'),
  ).toHaveText([
    'Abierta: 0',
    'En curso: 0',
    'Pendiente de validación: 0',
    'Cerrada: 0',
  ]);
  await expect(
    page.getByText('No tienes incidencias activas asignadas.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ver todas mis incidencias' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Responsable', exact: true }),
  ).toHaveValue(actor.id);
  await expect(
    page.getByRole('option', {
      name: `${actor.firstName} ${actor.lastName} — ${actor.email}`,
      exact: true,
    }),
  ).toBeAttached();
});
