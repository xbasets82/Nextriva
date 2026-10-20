import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';
import { fixtureEmail } from './fixture-email.js';

const password = randomBytes(24).toString('base64url');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
const emails = {
  ADMIN: fixtureEmail('web-login-admin'),
  MANAGER: fixtureEmail('web-login-manager'),
  COLLABORATOR: fixtureEmail('web-login-collaborator'),
};
test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
    await prisma.user.create({
      data: {
        firstName: 'Web',
        lastName: 'Login',
        email: emails[role],
        passwordHash,
        role,
      },
    });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
async function login(page: Page, role: keyof typeof emails = 'ADMIN') {
  await page.getByLabel('Email', { exact: true }).fill(emails[role]);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const loggedIn = page.waitForResponse((result) =>
    result.url().endsWith('/api/auth/login'),
  );
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  expect((await loggedIn).status()).toBe(200);
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

test('ADMIN uses keyboard login, users/promotions, reload and real logout revocation on mobile', async ({
  page,
  context,
}) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /^\/api\/(users|promotions)(?:\/|$)/.test(new URL(request.url()).pathname)
    )
      privateRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  expect(privateRequests).toEqual([]);
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Introduce un email válido.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.type(emails.ADMIN);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  const loggedIn = page.waitForResponse((result) =>
    result.url().endsWith('/api/auth/login'),
  );
  await page.keyboard.press('Enter');
  expect((await loggedIn).status()).toBe(200);
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Usuarios', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Promociones', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Promociones', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Promociones', exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (value) => value.name === 'nextriva_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'nextriva_session',
  );
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const revoked = page.waitForResponse((result) =>
    result.url().endsWith('/api/auth/logout'),
  );
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  expect((await revoked).status()).toBe(204);
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => (await fetch('/api/promotions')).status),
  ).toBe(401);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: emails.ADMIN },
  });
  const session = await prisma.session.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  expect(session.revokedAt).not.toBeNull();
  expect(
    (await context.cookies()).some(
      (value) => value.name === 'nextriva_session',
    ),
  ).toBe(false);
  await login(page);
});

test('incorrect existing/unknown credentials share one safe error and create no session', async ({
  page,
}) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: emails.ADMIN },
  });
  const before = await prisma.session.count({ where: { userId: user.id } });
  await page.goto('/');
  for (const email of [emails.ADMIN, fixtureEmail('web-login-absent')]) {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill(randomBytes(24).toString('base64url'));
    const rejected = page.waitForResponse((result) =>
      result.url().endsWith('/api/auth/login'),
    );
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    expect((await rejected).status()).toBe(401);
    await expect(
      page.getByText('Email o contraseña incorrectos.'),
    ).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      '',
    );
  }
  expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
    before,
  );
});

for (const role of ['MANAGER', 'COLLABORATOR'] as const)
  test(`${role} remains authenticated but receives real 403 with no administrative mutations`, async ({
    page,
  }) => {
    await page.goto('/#/promotions');
    await login(page, role);
    await expect(
      page.getByText(
        'No tienes acceso a las funciones administrativas disponibles.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Promociones', exact: true }),
    ).toHaveCount(0);
    const target = await prisma.user.findUniqueOrThrow({
      where: { email: emails.ADMIN },
    });
    const name = `Denied login ${randomBytes(12).toString('hex')}`;
    const statuses = await page.evaluate(
      async ({ id, name }) => {
        const csrf = await (await fetch('/api/auth/csrf')).json();
        const headers = {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf.csrfToken,
        };
        return Promise.all([
          fetch('/api/users'),
          fetch('/api/promotions'),
          fetch(`/api/users/${id}/status`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ isActive: false }),
          }),
          fetch('/api/promotions', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, phases: ['PLANNING'] }),
          }),
          fetch('/api/auth/session'),
        ]).then((responses) => responses.map((response) => response.status));
      },
      { id: target.id, name },
    );
    expect(statuses).toEqual([403, 403, 403, 403, 200]);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).toEqual(target);
    expect(await prisma.promotion.count({ where: { name } })).toBe(0);
  });

for (const invalidation of ['expired', 'revoked'] as const)
  test(`${invalidation} session returns to login and can authenticate again`, async ({
    page,
  }) => {
    await page.goto('/#/promotions');
    await login(page);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: emails.ADMIN },
    });
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.session.update({
      where: { id: session.id },
      data:
        invalidation === 'expired'
          ? {
              createdAt: new Date(0),
              lastSeenAt: new Date(1000),
              expiresAt: new Date(2000),
            }
          : { revokedAt: new Date() },
    });
    await page.reload();
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Promociones', exact: true }),
    ).toHaveCount(0);
    await login(page);
    await expect(
      page.getByRole('heading', { name: 'Promociones', exact: true }),
    ).toBeVisible();
  });

test('temporary recovery fault is distinct from login and retry recovers the real session', async ({
  page,
}) => {
  await page.goto('/');
  await login(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.reload();
  await expect(
    page.getByText('No se pudo comprobar la sesión. Inténtalo de nuevo.'),
  ).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  await page.unroute('**/api/auth/session');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(
    page.getByRole('link', { name: 'Usuarios', exact: true }),
  ).toBeVisible();
});
