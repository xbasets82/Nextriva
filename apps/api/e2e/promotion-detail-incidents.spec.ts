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
const roles = ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const;
const emails = {
  ADMIN: fixtureEmail('promotion-detail-admin'),
  MANAGER: fixtureEmail('promotion-detail-manager'),
  COLLABORATOR: fixtureEmail('promotion-detail-collaborator'),
};
const ids = new Map<string, string>();
let firstPromotionId: string;
let secondPromotionId: string;
let ownTitle: string;
let otherTitle: string;
let secondTitle: string;

test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of roles) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Lector',
        lastName: role,
        email: emails[role],
        role,
        passwordHash,
      },
    });
    ids.set(role, user.id);
  }
  const promotion = async (name: string) =>
    prisma.promotion.create({
      data: {
        name,
        phases: { create: { phase: 'PLANNING' } },
        participants: {
          create: ['MANAGER', 'COLLABORATOR'].map((role) => ({
            userId: ids.get(role)!,
          })),
        },
      },
    });
  firstPromotionId = (await promotion('Primera promoción de consulta')).id;
  secondPromotionId = (await promotion('Segunda promoción de consulta')).id;
  const suffix = randomBytes(4).toString('hex');
  ownTitle = `Incidencia propia ${suffix}${' detalle'.repeat(16)}`.slice(
    0,
    150,
  );
  otherTitle = `Incidencia ajena ${suffix}`;
  secondTitle = `Incidencia segunda promoción ${suffix}`;
  for (const [promotionId, title, actor] of [
    [firstPromotionId, ownTitle, 'COLLABORATOR'],
    [firstPromotionId, otherTitle, 'ADMIN'],
    [secondPromotionId, secondTitle, 'COLLABORATOR'],
  ] as const) {
    await prisma.incident.create({
      data: {
        promotionId,
        title,
        description:
          'Datos ficticios para verificar el alcance de consulta por promoción.',
        originPhase: 'PLANNING',
        category: 'STRUCTURE',
        priority: 'MEDIUM',
        createdById: ids.get(actor)!,
        activities: {
          create: {
            actorId: ids.get(actor)!,
            eventType: 'CREATED',
            changes: { originPhase: 'PLANNING' },
          },
        },
      },
    });
  }
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const role of roles) {
  test(`${role} consults only visible incidents of the current promotion and returns from detail`, async ({
    page,
  }) => {
    await page.goto('/#/login');
    await page.getByLabel('Email', { exact: true }).fill(emails[role]);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Promociones', exact: true })
      .waitFor();
    const scopedResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/incidents' &&
        url.searchParams.get('promotionId') === firstPromotionId
      );
    });
    await page.goto(`/#/promotions/${firstPromotionId}`);
    const result = await scopedResponse;
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.total).toBe(role === 'COLLABORATOR' ? 1 : 2);
    expect(
      body.items.every(
        (incident: { promotionId: string }) =>
          incident.promotionId === firstPromotionId,
      ),
    ).toBe(true);
    const list = page.getByRole('list', {
      name: 'Incidencias de la promoción',
    });
    await expect(list.getByText(ownTitle, { exact: true })).toBeVisible();
    await expect(list.getByText(secondTitle, { exact: true })).toHaveCount(0);
    await expect(list.getByText(otherTitle, { exact: true })).toHaveCount(
      role === 'COLLABORATOR' ? 0 : 1,
    );
    const ownRow = list.getByRole('listitem').filter({ hasText: ownTitle });
    const code = ownRow.getByRole('link');
    await expect(code).toHaveText(/^INC-\d+$/);
    const codeBox = await code.boundingBox();
    const titleBox = await ownRow
      .getByText(ownTitle, { exact: true })
      .boundingBox();
    expect(codeBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.y).toBeGreaterThan(codeBox!.y);
    const codeFontSize = await code.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    const titleFontSize = await ownRow
      .getByText(ownTitle, { exact: true })
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
    expect(codeFontSize).toBeLessThan(titleFontSize);
    const statusIndicator = ownRow.getByRole('img', {
      name: 'Abierta',
      exact: true,
    });
    const priorityIndicator = ownRow.getByRole('img', {
      name: 'Media',
      exact: true,
    });
    await statusIndicator.hover();
    await expect(
      page.getByRole('tooltip', { name: 'Abierta', exact: true }),
    ).toBeVisible();
    await priorityIndicator.focus();
    await expect(
      page.getByRole('tooltip', { name: 'Media', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('tooltip', { name: 'Media', exact: true }),
    ).toHaveCount(0);
    const statusBox = await statusIndicator.boundingBox();
    const priorityBox = await priorityIndicator.boundingBox();
    expect(statusBox!.x).toBeGreaterThan(codeBox!.x);
    expect(priorityBox!.x).toBeGreaterThan(statusBox!.x);

    await page.setViewportSize({ width: 390, height: 844 });
    const titleMetrics = await ownRow
      .getByText(ownTitle, { exact: true })
      .evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
        fullText: element.textContent,
      }));
    expect(titleMetrics.fullText).toBe(ownTitle);
    const mobileRowBox = await ownRow.boundingBox();
    const mobileStatusBox = await statusIndicator.boundingBox();
    const mobilePriorityBox = await priorityIndicator.boundingBox();
    expect(mobileStatusBox!.x).toBeGreaterThan(
      mobileRowBox!.x + mobileRowBox!.width / 2,
    );
    expect(mobilePriorityBox!.x + mobilePriorityBox!.width).toBeLessThanOrEqual(
      mobileRowBox!.x + mobileRowBox!.width,
    );
    expect(Math.abs(mobileStatusBox!.y - mobilePriorityBox!.y)).toBeLessThan(1);

    expect(titleMetrics.height).toBeLessThanOrEqual(
      titleMetrics.lineHeight + 1,
    );
    await page.setViewportSize({ width: 1280, height: 900 });

    await expect(
      page.getByRole('heading', { name: 'Fases activas', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Fases activas' }),
    ).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Buscar incidencias' });
    const exactQuery = ownTitle.slice(0, 80).toUpperCase();
    const filteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/incidents' &&
        url.searchParams.get('promotionId') === firstPromotionId &&
        url.searchParams.get('q') === exactQuery &&
        url.searchParams.get('status') === 'OPEN' &&
        url.searchParams.get('category') === 'STRUCTURE' &&
        url.searchParams.get('priority') === 'MEDIUM'
      );
    });
    await search.fill(` ${exactQuery} `);
    await page
      .getByLabel('Estado de incidencia', { exact: true })
      .selectOption('OPEN');
    await page
      .getByLabel('Categoría de incidencia', { exact: true })
      .selectOption('STRUCTURE');
    await page
      .getByLabel('Prioridad de incidencia', { exact: true })
      .selectOption('MEDIUM');
    const filtered = await filteredResponse;
    expect(filtered.status()).toBe(200);
    const filteredBody = await filtered.json();
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.items[0].title).toBe(ownTitle);
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByText(otherTitle, { exact: true })).toHaveCount(0);
    await expect(list.getByText(secondTitle, { exact: true })).toHaveCount(0);
    const publicCode = await list.getByRole('link').textContent();
    const codeSearchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/incidents' &&
        url.searchParams.get('promotionId') === firstPromotionId &&
        url.searchParams.get('q') === publicCode
      );
    });
    await search.fill(publicCode ?? '');
    expect((await codeSearchResponse).status()).toBe(200);
    await expect(list.getByText(ownTitle, { exact: true })).toBeVisible();
    await page
      .getByLabel('Prioridad de incidencia', { exact: true })
      .selectOption('HIGH');
    await expect(
      page.getByText('No hay incidencias visibles en esta promoción.', {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Prioridad de incidencia', { exact: true })
      .selectOption('MEDIUM');
    await expect(list.getByText(ownTitle, { exact: true })).toBeVisible();

    const participants = page.getByRole('list', {
      name: 'Participantes vinculados',
    });
    const managerName = participants.getByText('Lector MANAGER', {
      exact: true,
    });
    const managerEmail = participants.getByText(emails.MANAGER, {
      exact: true,
    });
    await expect(
      participants.getByText('Gestor ·', { exact: true }),
    ).toBeVisible();
    const nameBox = await managerName.boundingBox();
    const emailBox = await managerEmail.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(emailBox).not.toBeNull();
    expect(emailBox!.y).toBeGreaterThan(nameBox!.y);
    await list
      .getByRole('listitem')
      .filter({ hasText: ownTitle })
      .getByRole('link')
      .click();
    await expect(
      page.getByRole('heading', { name: ownTitle, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Volver a la promoción', exact: true })
      .click();
    await expect(
      page
        .getByRole('list', { name: 'Incidencias de la promoción' })
        .getByText(ownTitle, { exact: true }),
    ).toBeVisible();
    await page.goto(`/#/promotions/${secondPromotionId}`);
    const secondList = page.getByRole('list', {
      name: 'Incidencias de la promoción',
    });
    await expect(
      secondList.getByText(secondTitle, { exact: true }),
    ).toBeVisible();
    await expect(secondList.getByText(ownTitle, { exact: true })).toHaveCount(
      0,
    );
    await expect(secondList.getByText(otherTitle, { exact: true })).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
