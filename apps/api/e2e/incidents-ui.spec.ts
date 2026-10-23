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

test('ADMIN starts an assigned incident in the browser and sees the state after reload', async ({
  page,
}) => {
  const author = await prisma.user.findUniqueOrThrow({ where: { email } });
  const incident = await prisma.incident.create({
    data: {
      promotionId,
      createdById: author.id,
      assignedToId: author.id,
      originPhase: 'PLANNING',
      title: 'I07.1 resolución sintética',
      description: 'Incidencia sintética asignada para iniciar resolución.',
      category: 'OTHER',
      priority: 'MEDIUM',
    },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .waitFor();
  await page.goto(`/#/incidents/${incident.id}`);
  await expect(
    page.getByRole('button', { name: 'Iniciar resolución' }),
  ).toBeVisible();
  const started = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/start`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Iniciar resolución' }).click();
  expect((await started).status()).toBe(200);
  await expect(page.getByText('En curso', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('En curso', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Iniciar resolución' }),
  ).toHaveCount(0);
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
  expect(
    await prisma.incidentActivity.findMany({
      where: { incidentId: incident.id },
    }),
  ).toEqual([
    expect.objectContaining({
      eventType: 'STATUS_CHANGED',
      actorId: author.id,
      changes: { previousStatus: 'OPEN', status: 'IN_PROGRESS' },
    }),
  ]);
});

test('comments persist as plain text and never execute HTML in Chromium', async ({
  page,
}) => {
  const author = await prisma.user.findUniqueOrThrow({ where: { email } });
  const incident = await prisma.incident.create({
    data: {
      promotionId,
      createdById: author.id,
      originPhase: 'PLANNING',
      title: 'I06.1 texto seguro',
      description: 'Descripción sintética para comentarios seguros.',
      category: 'OTHER',
      priority: 'LOW',
    },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .waitFor();
  await page.goto(`/#/incidents/${incident.id}`);
  await expect(
    page.getByText('No hay comentarios.', { exact: true }),
  ).toBeVisible();
  const body = '<img src=x onerror=window.__commentXss=true>';
  await page.getByLabel('Comentario', { exact: true }).fill(body);
  const added = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/comments`) &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Añadir comentario', exact: true })
    .click();
  expect((await added).status()).toBe(201);
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`Autor: ${author.firstName} ${author.lastName}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`Autor: ${author.id}`, { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, '__commentXss'))).toBe(
    false,
  );
  const persisted = await prisma.incidentComment.findMany({
    where: { incidentId: incident.id },
  });
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({
    body,
    authorId: author.id,
    createdAt: expect.any(Date),
  });
  await page.reload();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`Autor: ${author.firstName} ${author.lastName}`, {
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Comentario', { exact: true }).focus();
  await page.keyboard.type('Comentario mediante teclado');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Añadir comentario', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Comentario mediante teclado', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Comentario', { exact: true })).toBeFocused();
});

test('responsible saves and submits a solution safely; pending validation survives reload', async ({
  page,
}) => {
  const author = await prisma.user.findUniqueOrThrow({ where: { email } });
  const managerPassword = randomBytes(24).toString('base64url');
  const manager = await prisma.user.create({
    data: {
      firstName: 'Synthetic',
      lastName: 'Solution manager',
      email: fixtureEmail(`i072-solution-${randomBytes(6).toString('hex')}`),
      role: 'MANAGER',
      passwordHash: await new PasswordHasher().hash(managerPassword),
    },
  });
  await prisma.promotionParticipant.create({
    data: { promotionId, userId: manager.id },
  });
  const incident = await prisma.incident.create({
    data: {
      promotionId,
      createdById: author.id,
      assignedToId: manager.id,
      originPhase: 'PLANNING',
      title: 'I07.2 solución sintética',
      description: 'Incidencia en curso para documentar y enviar solución.',
      category: 'OTHER',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
    },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(manager.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(managerPassword);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .waitFor();
  await page.goto(`/#/incidents/${incident.id}`);
  const solution = '<img src=x onerror=window.__solutionXss=true>';
  await page
    .getByRole('textbox', { name: 'Solución', exact: true })
    .fill(solution);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/solution`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('p').filter({ hasText: solution })).toBeVisible();

  const submitted = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/incidents/${incident.id}/submit-solution`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Enviar a validación' }).click();
  expect((await submitted).status()).toBe(200);
  await expect(
    page.getByText('Pendiente de validación', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('p').filter({ hasText: solution })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect(
    await page.evaluate(() => Object.hasOwn(window, '__solutionXss')),
  ).toBe(false);

  const persisted = await prisma.incident.findUniqueOrThrow({
    where: { id: incident.id },
    include: { activities: true },
  });
  expect(persisted).toMatchObject({
    status: 'PENDING_VALIDATION',
    solution,
    solutionSubmittedById: manager.id,
    solutionSubmittedAt: expect.any(Date),
    version: 3,
  });
  expect(persisted.activities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        eventType: 'SOLUTION_SUBMITTED',
        actorId: manager.id,
        changes: expect.objectContaining({ solution }),
      }),
    ]),
  );
  await page.reload();
  await expect(page.locator('p').filter({ hasText: solution })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enviar a validación' }),
  ).toHaveCount(0);
});

test('solution drafts use Unicode limits, can be cleared and cannot submit empty content', async ({
  page,
}) => {
  const author = await prisma.user.findUniqueOrThrow({ where: { email } });
  const incident = await prisma.incident.create({
    data: {
      promotionId,
      createdById: author.id,
      assignedToId: author.id,
      originPhase: 'PLANNING',
      title: 'I07.2 borrador Unicode',
      description:
        'Incidencia sintética para límites, borrado y nuevo borrador.',
      category: 'OTHER',
      priority: 'LOW',
      status: 'IN_PROGRESS',
    },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .waitFor();
  await page.goto(`/#/incidents/${incident.id}`);
  const field = page.getByRole('textbox', { name: 'Solución', exact: true });
  const valid = '😀'.repeat(5000);
  await field.fill(valid);
  await expect(field).toHaveValue(valid);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/solution`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.getByRole('form', { name: 'Documentar solución' }).getByRole('status'),
  ).toHaveText('Borrador guardado.');
  const snapshot = () =>
    prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { activities: { orderBy: { id: 'asc' } } },
    });
  const beforeInvalid = await snapshot();
  expect(beforeInvalid).toMatchObject({
    solution: valid,
    status: 'IN_PROGRESS',
    version: 2,
  });
  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes(`/api/incidents/${incident.id}/`) &&
      ['PUT', 'POST'].includes(request.method())
    )
      mutationRequests.push(request.url());
  });
  await field.fill(valid + '😀');
  await expect(field).toHaveValue(valid + '😀');
  for (const action of ['Guardar borrador', 'Enviar a validación']) {
    await page.getByRole('button', { name: action }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'La solución no puede superar los 5.000 caracteres.',
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    expect(mutationRequests).toHaveLength(0);
    expect(await snapshot()).toEqual(beforeInvalid);
  }

  await field.fill('');
  const cleared = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/solution`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  expect((await cleared).status()).toBe(200);
  await expect(
    page.getByRole('form', { name: 'Documentar solución' }).getByRole('status'),
  ).toHaveText('Borrador guardado.');
  const beforeEmptySubmit = await snapshot();
  expect(beforeEmptySubmit).toMatchObject({
    solution: null,
    status: 'IN_PROGRESS',
    version: 3,
    solutionSubmittedById: null,
    solutionSubmittedAt: null,
  });
  expect(beforeEmptySubmit.activities).toHaveLength(2);
  const emptySubmission = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/incidents/${incident.id}/submit-solution`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Enviar a validación' }).click();
  expect((await emptySubmission).status()).toBe(409);
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await snapshot()).toEqual(beforeEmptySubmit);

  const replacement = 'Solución guardada después de vaciar el borrador.';
  await field.fill(replacement);
  const resaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/incidents/${incident.id}/solution`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  expect((await resaved).status()).toBe(200);
  await expect(
    page.getByRole('form', { name: 'Documentar solución' }).getByRole('status'),
  ).toHaveText('Borrador guardado.');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Solución', exact: true }),
  ).toHaveValue(replacement);
  expect(await snapshot()).toMatchObject({
    solution: replacement,
    status: 'IN_PROGRESS',
    version: 4,
    solutionSubmittedById: null,
    solutionSubmittedAt: null,
  });
});

test('assigns and reassigns a responsible user, persists after reload and denies a real COLLABORATOR mutation', async ({
  page,
  browser,
}) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
  const target = await prisma.user.create({
    data: {
      firstName: 'Ana',
      lastName: 'I062 Responsable',
      email: fixtureEmail('i062-assignee'),
      role: 'COLLABORATOR',
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  const replacement = await prisma.user.create({
    data: {
      firstName: 'Eva',
      lastName: 'I062 Reasignada',
      email: fixtureEmail('i062-replacement'),
      role: 'COLLABORATOR',
      passwordHash: randomBytes(32).toString('hex'),
    },
  });
  await prisma.promotionParticipant.createMany({
    data: [target, replacement].map((user) => ({
      promotionId,
      userId: user.id,
    })),
  });
  const incident = await prisma.incident.create({
    data: {
      promotionId,
      createdById: admin.id,
      originPhase: 'PLANNING',
      title: 'I06.2 responsabilidad web',
      description: 'Descripción sintética de asignación y permisos.',
      category: 'OTHER',
      priority: 'LOW',
    },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .waitFor();
  await page.goto(`/#/incidents/${incident.id}`);
  await page
    .getByLabel('Nuevo responsable', { exact: true })
    .selectOption(target.id);
  await page
    .getByRole('button', { name: 'Asignar responsable', exact: true })
    .click();
  await expect(
    page.getByText('Responsable: Ana I062 Responsable', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Responsable: Ana I062 Responsable', { exact: true }),
  ).toBeVisible();
  expect(
    await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
  ).toMatchObject({ assignedToId: target.id, version: 2, status: 'OPEN' });
  const context = await browser.newContext();
  try {
    const collaborator = await context.newPage();
    await collaborator.goto(new URL('/', page.url()).toString());
    await collaborator.getByLabel('Email', { exact: true }).fill(target.email);
    await collaborator.getByLabel('Contraseña', { exact: true }).fill(password);
    await collaborator
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await collaborator
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .waitFor();
    await collaborator.goto(
      new URL(`/#/incidents/${incident.id}`, page.url()).toString(),
    );
    await expect(
      collaborator.getByText('Responsable: Ana I062 Responsable', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      collaborator.getByRole('form', { name: 'Asignar responsable' }),
    ).toHaveCount(0);
    const csrf = await context.request.get(
      new URL('/api/auth/csrf', page.url()).toString(),
    );
    const { csrfToken } = await csrf.json();
    const before = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    });
    const activities = await prisma.incidentActivity.count({
      where: { incidentId: incident.id },
    });
    const denied = await context.request.patch(
      new URL(
        `/api/incidents/${incident.id}/assignment`,
        page.url(),
      ).toString(),
      {
        headers: {
          Origin: new URL(page.url()).origin,
          'X-CSRF-Token': csrfToken,
        },
        data: { assignedToId: replacement.id, version: 2 },
      },
    );
    expect(denied.status()).toBe(403);
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    ).toEqual(before);
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId: incident.id },
      }),
    ).toBe(activities);
    await page
      .getByLabel('Nuevo responsable', { exact: true })
      .selectOption(replacement.id);
    await page
      .getByRole('button', { name: 'Reasignar responsable', exact: true })
      .click();
    await expect(
      page.getByText('Responsable: Eva I062 Reasignada', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Responsable: Eva I062 Reasignada', { exact: true }),
    ).toBeVisible();
    await collaborator.reload();
    await expect(collaborator.getByRole('alert')).toHaveText(
      'No se ha encontrado la incidencia o la promoción.',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
