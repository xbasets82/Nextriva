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

test('I07.3 two real sessions reject, revise and independently approve a persisted solution', async ({
  browser,
  baseURL,
}) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
  const presenter = await prisma.user.create({
    data: {
      firstName: 'I073',
      lastName: 'Presentador',
      email: fixtureEmail(`i073-${randomBytes(6).toString('hex')}`),
      role: 'MANAGER',
      passwordHash: await new PasswordHasher().hash(password),
    },
  });
  const promotion = await prisma.promotion.create({
    data: {
      name: 'I07.3 validación independiente',
      phases: { create: { phase: 'CONSTRUCTION' } },
      participants: { create: { userId: presenter.id } },
    },
  });
  const incident = await prisma.incident.create({
    data: {
      promotionId: promotion.id,
      createdById: admin.id,
      assignedToId: presenter.id,
      originPhase: 'CONSTRUCTION',
      title: 'I07.3 solución y revisión independiente',
      description:
        'Incidencia sintética para dos sesiones y revisión de solución.',
      category: 'OTHER',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
    },
  });
  const presenterContext = await browser.newContext({ baseURL });
  const reviewerContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const responsiblePage = await presenterContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    for (const [page, loginEmail] of [
      [responsiblePage, presenter.email],
      [reviewerPage, email],
    ] as const) {
      await page.goto('/');
      await page.getByLabel('Email', { exact: true }).fill(loginEmail);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      await page
        .getByRole('button', { name: 'Iniciar sesión', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Cerrar sesión', exact: true }),
      ).toBeVisible();
    }
    await responsiblePage.goto(`/#/incidents/${incident.id}`);
    await responsiblePage
      .getByRole('textbox', { name: 'Solución', exact: true })
      .fill('Primera propuesta de reparación.');
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
    await reviewerPage.goto(`/#/incidents/${incident.id}`);
    const reason =
      '<img src=x onerror=window.__rejectionXss=true> Revisar sellado.';
    await reviewerPage
      .getByRole('textbox', { name: 'Motivo del rechazo' })
      .fill(reason);
    await reviewerPage
      .getByRole('button', { name: 'Rechazar solución', exact: true })
      .click();
    await expect(
      reviewerPage.getByText('En curso', { exact: true }),
    ).toBeVisible();
    const snapshot = await prisma.incidentActivity.findFirstOrThrow({
      where: { incidentId: incident.id, eventType: 'STATUS_CHANGED' },
    });
    expect(snapshot).toMatchObject({
      actorId: admin.id,
      changes: {
        previousStatus: 'PENDING_VALIDATION',
        status: 'IN_PROGRESS',
        solution: 'Primera propuesta de reparación.',
        solutionSubmittedById: presenter.id,
        solutionSubmittedAt: expect.any(String),
        reason,
      },
    });
    await responsiblePage.reload();
    const solutionField = responsiblePage.getByRole('textbox', {
      name: 'Solución',
      exact: true,
    });
    await expect(solutionField).toHaveValue('Primera propuesta de reparación.');
    await solutionField.fill('');
    await responsiblePage
      .getByRole('button', { name: 'Guardar borrador', exact: true })
      .click();
    await expect(
      responsiblePage.getByText('Borrador guardado.', { exact: true }),
    ).toBeVisible();
    await solutionField.fill('Reparación revisada y comprobada.');
    await responsiblePage
      .getByRole('button', { name: 'Enviar a validación', exact: true })
      .click();
    await expect(
      responsiblePage.getByText('Pendiente de validación', { exact: true }),
    ).toBeVisible();
    await reviewerPage.reload();
    const approveButton = reviewerPage.getByRole('button', {
      name: 'Aprobar solución',
      exact: true,
    });
    await approveButton.click();
    const dialog = reviewerPage.getByRole('dialog', {
      name: 'Aprobar y cerrar incidencia',
    });
    await expect(
      dialog.getByRole('button', { name: 'Cancelar', exact: true }),
    ).toBeFocused();
    await reviewerPage.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: 'Confirmar aprobación', exact: true }),
    ).toBeFocused();
    await reviewerPage.keyboard.press('Escape');
    await expect(approveButton).toBeFocused();
    await reviewerPage.keyboard.press('Enter');
    await reviewerPage.keyboard.press('Tab');
    await reviewerPage.keyboard.press('Enter');
    await expect(
      reviewerPage.getByText('Cerrada', { exact: true }),
    ).toBeVisible();
    await reviewerPage.reload();
    await expect(
      reviewerPage.getByText('Cerrada', { exact: true }),
    ).toBeVisible();
    await expect(
      reviewerPage.getByRole('button', {
        name: 'Aprobar solución',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await reviewerPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await reviewerPage.evaluate(() =>
        Object.hasOwn(window, '__rejectionXss'),
      ),
    ).toBe(false);
    const persisted = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
      include: { activities: true },
    });
    expect(persisted).toMatchObject({
      status: 'CLOSED',
      validatedById: admin.id,
      closedAt: expect.any(Date),
      solutionSubmittedById: presenter.id,
      solution: 'Reparación revisada y comprobada.',
      version: 8,
    });
    expect(
      persisted.activities.filter(
        (item) => item.eventType === 'STATUS_CHANGED',
      ),
    ).toHaveLength(2);
    expect(
      await prisma.incidentActivity.findUniqueOrThrow({
        where: { id: snapshot.id },
      }),
    ).toEqual(snapshot);
  } finally {
    await presenterContext.close();
    await reviewerContext.close();
  }
});
