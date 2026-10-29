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
        lastName: `Reopen ${role}`,
        email: fixtureEmail(`issue120-${role.toLowerCase()}`),
        role,
        passwordHash: await new PasswordHasher().hash(password),
      },
    });
    users.set(role, user);
  }
  promotionId = (
    await prisma.promotion.create({
      data: {
        name: 'Issue120 reopen promotion',
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
      description: 'Synthetic logical reopen scenario',
      priority: 'HIGH',
      category: 'OTHER',
      status: 'CLOSED',
      solution: 'Solución aprobada anterior',
      solutionSubmittedById: users.get('COLLABORATOR')!.id,
      solutionSubmittedAt: new Date('2026-10-24T10:00:00Z'),
      validatedById: users.get('ADMIN')!.id,
      closedAt: new Date('2026-10-25T10:00:00Z'),
    },
  });
}

test('Issue120 two real sessions reopen, preserve the closure after reload and require an independent new validation', async ({
  page,
  browser,
  baseURL,
}) => {
  const incident = await fixture('Issue120 preserved approved cycle');
  await login(page, 'ADMIN');
  const responsibleContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const responsiblePage = await responsibleContext.newPage();
    await login(responsiblePage, 'COLLABORATOR');
    await page.goto(`/#/incidents/${incident.id}`);
    const trigger = page.getByRole('button', {
      name: 'Reabrir incidencia',
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', {
      name: 'Reabrir incidencia',
      exact: true,
    });
    await expect(dialog.getByLabel('Motivo de reapertura')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    dialog = page.getByRole('dialog', {
      name: 'Reabrir incidencia',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo de reapertura')
      .fill('Nueva revisión del aislamiento');
    await dialog
      .getByLabel('Responsable de la nueva revisión')
      .selectOption(users.get('COLLABORATOR')!.id);
    const response = page.waitForResponse((value) =>
      value.url().endsWith(`/api/incidents/${incident.id}/reopen`),
    );
    await dialog
      .getByRole('button', { name: 'Confirmar reapertura', exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText('En curso', { exact: true })).toBeVisible();
    await page.reload();
    const history = page.getByRole('region', {
      name: 'Cierres anteriores y reaperturas',
    });
    await expect(
      history.getByText('Solución aprobada anterior', { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByText('Nueva revisión del aislamiento'),
    ).toBeVisible();
    await expect(
      history.getByText('Identidad histórica no registrada', { exact: true }),
    ).toHaveCount(2);
    await expect(history).not.toContainText(users.get('ADMIN')!.id);
    await expect(
      page
        .getByText('Creada por', { exact: true })
        .locator('..')
        .getByText('Synthetic Reopen COLLABORATOR', { exact: true }),
    ).toBeVisible();
    const summary = await (
      await responsiblePage.request.get('/api/incidents/personal-summary')
    ).json();
    expect(summary.countsByStatus.IN_PROGRESS).toBe(1);
    expect(
      summary.priorityItems.some(
        (value: { id: string }) => value.id === incident.id,
      ),
    ).toBe(true);
    await responsiblePage.goto(`/#/incidents/${incident.id}`);
    await expect(
      responsiblePage.getByRole('button', {
        name: 'Reabrir incidencia',
        exact: true,
      }),
    ).toHaveCount(0);
    const solution = responsiblePage.getByRole('textbox', {
      name: 'Solución',
      exact: true,
    });
    await expect(solution).toHaveValue('');
    await solution.fill('Nueva solución independiente documentada');
    await responsiblePage
      .getByRole('button', { name: 'Enviar a validación', exact: true })
      .click();
    await expect(
      responsiblePage.getByText('Pendiente de validación', { exact: true }),
    ).toBeVisible();
    await expect(
      responsiblePage.getByRole('button', {
        name: 'Aprobar solución',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.reload();
    await page
      .getByRole('button', { name: 'Aprobar solución', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Aprobar solución' })
      .getByRole('button', { name: 'Aprobar solución', exact: true })
      .click();
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Solución aprobada', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Gestión y solución de incidencia' })
        .getByText('Synthetic Reopen ADMIN', { exact: true }),
    ).toBeVisible();
    await responsiblePage.reload();
    await expect(
      responsiblePage.getByRole('region', {
        name: 'Cierres anteriores y reaperturas',
      }),
    ).not.toContainText('@');
    expect(
      await responsiblePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      responsiblePage
        .getByRole('region', { name: 'Cierres anteriores y reaperturas' })
        .getByText('Solución aprobada anterior', { exact: true }),
    ).toBeVisible();
    expect(
      await responsiblePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const persisted = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { activities: true },
    });
    expect(persisted).toMatchObject({
      status: 'CLOSED',
      solution: 'Nueva solución independiente documentada',
      validatedById: users.get('ADMIN')!.id,
    });
    expect(
      persisted.activities.filter(
        (value) =>
          value.eventType === 'STATUS_CHANGED' &&
          typeof value.changes === 'object' &&
          value.changes !== null &&
          'snapshotVersion' in value.changes,
      ),
    ).toHaveLength(1);
    await page
      .getByRole('button', { name: 'Reabrir incidencia', exact: true })
      .click();
    const secondReopen = page.getByRole('dialog', {
      name: 'Reabrir incidencia',
      exact: true,
    });
    await secondReopen
      .getByLabel('Motivo de reapertura')
      .fill('Nueva inspección posterior documentada');
    await secondReopen
      .getByLabel('Responsable de la nueva revisión')
      .selectOption(users.get('COLLABORATOR')!.id);
    await secondReopen
      .getByRole('button', { name: 'Confirmar reapertura', exact: true })
      .click();
    await expect(
      history.getByText('Synthetic Reopen ADMIN', { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByText('Synthetic Reopen COLLABORATOR', { exact: true }),
    ).toBeVisible();
    await expect(history).toContainText(users.get('ADMIN')!.email);
    await responsiblePage.reload();
    await expect(
      responsiblePage.getByRole('region', {
        name: 'Cierres anteriores y reaperturas',
      }),
    ).not.toContainText('@');
    expect(
      await responsiblePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await responsibleContext.close();
  }
});

test('Issue120 collaborator cannot reopen a visible closure and no persistent data changes', async ({
  page,
}) => {
  const incident = await fixture('Issue120 forbidden reopen');
  await login(page, 'COLLABORATOR');
  await page.goto(`/#/incidents/${incident.id}`);
  await expect(
    page.getByRole('heading', { name: incident.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reabrir incidencia', exact: true }),
  ).toHaveCount(0);
  const token = (await (await page.request.get('/api/auth/csrf')).json())
    .csrfToken as string;
  const denied = await page.request.post(
    `/api/incidents/${incident.id}/reopen`,
    {
      headers: { origin: new URL(page.url()).origin, 'x-csrf-token': token },
      data: {
        version: 1,
        reason: 'Forbidden reopen request',
        assignedToId: users.get('COLLABORATOR')!.id,
      },
    },
  );
  expect(denied.status()).toBe(403);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toEqual(incident);
  expect(
    await prisma.incidentActivity.count({ where: { incidentId: incident.id } }),
  ).toBe(0);
});

test('Issue120 keeps keyboard focus inside the pending reopen dialog and after a real version conflict', async ({
  page,
}) => {
  const incident = await fixture('Issue120 deferred conflict focus');
  await login(page, 'ADMIN');
  await page.goto(`/#/incidents/${incident.id}`);
  await page
    .getByRole('button', { name: 'Reabrir incidencia', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Reabrir incidencia',
    exact: true,
  });
  await dialog
    .getByLabel('Motivo de reapertura')
    .fill('Revisión adicional con conflicto');
  await dialog
    .getByLabel('Responsable de la nueva revisión')
    .selectOption(users.get('COLLABORATOR')!.id);
  // Un cambio externo deja obsoleta la versión ya cargada en la pantalla.
  await prisma.incident.update({
    where: { id: incident.id },
    data: { version: { increment: 1 } },
  });
  let signalReached: (() => void) | undefined;
  let releaseResponse: (() => void) | undefined;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const routePattern = `**/api/incidents/${incident.id}/reopen`;
  await page.route(routePattern, async (route) => {
    const realResponse = await route.fetch();
    expect(realResponse.status()).toBe(409);
    signalReached?.();
    await held;
    await route.fulfill({ response: realResponse });
  });
  const response = page.waitForResponse((value) =>
    value.url().endsWith(`/api/incidents/${incident.id}/reopen`),
  );
  try {
    await dialog
      .getByRole('button', { name: 'Confirmar reapertura', exact: true })
      .click();
    await reached;
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog).toBeFocused();
    releaseResponse?.();
    expect((await response).status()).toBe(409);
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Motivo de reapertura')).toBeFocused();
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId: incident.id },
      }),
    ).toBe(0);
  } finally {
    releaseResponse?.();
    await response;
    await page.unroute(routePattern);
  }
});
