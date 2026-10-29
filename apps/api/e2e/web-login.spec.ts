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

async function expectOfficialBrand(page: Page) {
  const brand = page.getByRole('img', { name: 'Nextriva', exact: true });
  await expect(brand).toHaveCount(1);
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute('src', '/nextriva-icon-192.png');
  await expect
    .poll(() =>
      brand.evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ complete: true, width: 192, height: 192 });
  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.width).toBe(box!.height);
  expect(
    await brand.evaluate((image) => getComputedStyle(image).objectFit),
  ).toBe('contain');
  await expect(page.getByText('NEXTRIVA', { exact: true })).toHaveCount(0);
}

async function expectNavigationWordmark(page: Page) {
  const brand = page.getByRole('img', { name: 'Nextriva', exact: true });
  await expect(brand).toHaveCount(1);
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute('src', '/nextriva-wordmark-blue.png');
  await expect
    .poll(() =>
      brand.evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ complete: true, width: 2508, height: 627 });
  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.width / box!.height).toBeCloseTo(4, 1);
  expect(
    await brand.evaluate((image) => getComputedStyle(image).objectFit),
  ).toBe('contain');
  await expect(page.getByText('NEXTRIVA', { exact: true })).toHaveCount(0);
}

test('local brand and favicon load without 404 at login and after a protected route reload', async ({
  page,
}) => {
  const missingAssets: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404 && /\/nextriva-.*\.png$/.test(response.url()))
      missingAssets.push(response.url());
  });
  await page.goto('/#/login');
  await expectOfficialBrand(page);
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute('href', '/nextriva-favicon-32.png');
  await expect(favicon).toHaveAttribute('type', 'image/png');
  await expect(favicon).toHaveAttribute('sizes', '32x32');
  const iconResponse = await page.request.get('/nextriva-icon-192.png');
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()['content-type']).toContain('image/png');
  const wordmarkResponse = await page.request.get(
    '/nextriva-wordmark-blue.png',
  );
  expect(wordmarkResponse.status()).toBe(200);
  expect(wordmarkResponse.headers()['content-type']).toContain('image/png');
  const wordmarkBytes = await wordmarkResponse.body();
  expect(wordmarkBytes.readUInt32BE(16)).toBe(2508);
  expect(wordmarkBytes.readUInt32BE(20)).toBe(627);
  for (const authenticated of [false, true]) {
    if (authenticated) {
      await login(page);
      await page.goto('/#/incidents');
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Incidencias', exact: true }),
      ).toBeVisible();
      await expectNavigationWordmark(page);
    }
    const faviconUrl = await favicon.evaluate(
      (link: HTMLLinkElement) => link.href,
    );
    const response = await page.request.get(faviconUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const bytes = await response.body();
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(bytes.readUInt32BE(16)).toBe(32);
    expect(bytes.readUInt32BE(20)).toBe(32);
  }
  expect(missingAssets).toEqual([]);
});

test('login presentation is centered and keyboard accessible on mobile and desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/login');

  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('img', { name: 'Nextriva', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText('NEXTRIVA', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nextriva', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      /Estado inicial del servicio|Estado del servicio|Consultando el estado/,
    ),
  ).toHaveCount(0);

  const email = page.getByLabel('Email');
  const password = page.locator('#login-password');
  await expect(email).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.press('Tab');

  const showPassword = page.getByRole('button', {
    name: 'Mostrar contraseña',
  });
  await expect(showPassword).toBeFocused();
  await expect(showPassword).toHaveAttribute('type', 'button');
  await expect(showPassword.locator('svg[data-icon="eye"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  const hidePassword = page.getByRole('button', {
    name: 'Ocultar contraseña',
  });
  await expect(hidePassword).toBeFocused();
  await expect(hidePassword.locator('svg[data-icon="eye-off"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByText('Introduce un email válido.')).toHaveCount(0);
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toHaveAttribute('aria-busy', 'false');

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expectOfficialBrand(page);
    const brandBox = await page
      .getByRole('img', { name: 'Nextriva', exact: true })
      .boundingBox();
    const formBox = await page
      .getByRole('form', { name: 'Iniciar sesión' })
      .boundingBox();
    expect(brandBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    expect(
      Math.abs(
        brandBox!.x + brandBox!.width / 2 - (formBox!.x + formBox!.width / 2),
      ),
    ).toBeLessThan(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const historyLengthBeforeLogout = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(historyLengthBeforeLogout);
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  const loggedOutBrandBox = await page
    .getByRole('img', { name: 'Nextriva', exact: true })
    .boundingBox();
  const loggedOutFormBox = await page
    .getByRole('form', { name: 'Iniciar sesión' })
    .boundingBox();
  expect(loggedOutBrandBox).not.toBeNull();
  expect(loggedOutFormBox).not.toBeNull();
  const loginContentCenter =
    (loggedOutBrandBox!.y + loggedOutFormBox!.y + loggedOutFormBox!.height) / 2;
  const loginCanvasBox = await page.locator('main').boundingBox();
  expect(loginCanvasBox).not.toBeNull();
  const loginCanvasCenter = loginCanvasBox!.y + loginCanvasBox!.height / 2;
  expect(Math.abs(loginContentCenter - loginCanvasCenter)).toBeLessThan(10);
});

test('email and password labels have comfortable spacing from their fields', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/login');
  const fields = [
    { label: 'label[for="login-email"]', input: '#login-email' },
    { label: 'label[for="login-password"]', input: '#login-password' },
  ];
  for (const field of fields) {
    const labelBox = await page.locator(field.label).boundingBox();
    const inputBox = await page.locator(field.input).boundingBox();
    expect(labelBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.y - labelBox!.y - labelBox!.height).toBeGreaterThanOrEqual(
      10,
    );
  }
});

for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
  test(`${role} lands on Home after login and when opening the root`, async ({
    page,
  }) => {
    await page.goto('/#/login');
    await login(page, role);
    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      page.getByRole('heading', {
        name: 'Resumen de incidencias',
        exact: true,
      }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Resumen de incidencias',
        exact: true,
      }),
    ).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      page.getByRole('heading', {
        name: 'Resumen de incidencias',
        exact: true,
      }),
    ).toBeVisible();
  });

for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
  test(`${role} sees centered navigation with the active module marked on desktop and mobile`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/incidents');
    await login(page, role);

    const navigation = page.getByRole('navigation', { name: 'Principal' });
    const usersLink = navigation.getByRole('link', { name: 'Usuarios' });
    if (role === 'ADMIN') await expect(usersLink).toBeVisible();
    else await expect(usersLink).toHaveCount(0);

    const incidentsLink = navigation.getByRole('link', {
      name: 'Incidencias',
    });
    await expect(incidentsLink).toHaveAttribute('aria-current', 'page');
    const brand = page.getByRole('img', { name: 'Nextriva', exact: true });
    const logout = page.getByRole('button', { name: 'Cerrar sesión' });
    const account = page.getByRole('group', { name: 'Cuenta de usuario' });
    const accountControl = account.locator('summary');
    const label = {
      ADMIN: 'Administrador',
      MANAGER: 'Gestor',
      COLLABORATOR: 'Colaborador',
    }[role];
    await expect(accountControl).toHaveAccessibleName(`Web Login · ${label}`);
    await accountControl.focus();
    await page.keyboard.press('Enter');
    await expect(
      account.getByText(emails[role], { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(accountControl).toBeFocused();
    await expect(account.getByText(emails[role], { exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press('Space');
    await expect(
      account.getByText(emails[role], { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(accountControl).toBeFocused();

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 640, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNavigationWordmark(page);
      const navBox = await navigation.boundingBox();
      const brandBox = await brand.boundingBox();
      const logoutBox = await logout.boundingBox();
      expect(navBox).not.toBeNull();
      expect(brandBox).not.toBeNull();
      expect(logoutBox).not.toBeNull();
      expect(
        Math.abs(navBox!.x + navBox!.width / 2 - viewport.width / 2),
      ).toBeLessThan(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (viewport.width >= 768) {
        expect(brandBox!.x + brandBox!.width).toBeLessThan(navBox!.x);
        expect(navBox!.x + navBox!.width).toBeLessThan(logoutBox!.x);
      } else {
        expect(navBox!.y).toBeGreaterThan(brandBox!.y + brandBox!.height);
      }
    }

    await page.getByRole('link', { name: 'Promociones' }).click();
    await expect(
      navigation.getByRole('link', { name: 'Promociones' }),
    ).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Incidencias' }).click();
    await expect(incidentsLink).toHaveAttribute('aria-current', 'page');
  });

test('logout icon keeps the existing revocation flow when activated by keyboard', async ({
  page,
}) => {
  await page.goto('/#/login');
  await login(page);
  const logout = page.getByRole('button', { name: 'Cerrar sesión' });
  await expect(logout).toHaveAttribute('type', 'button');
  await expect(logout).toHaveAttribute('aria-label', 'Cerrar sesión');
  await expect(logout).toHaveText('');
  const historyLength = await page.evaluate(() => history.length);
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/api/auth/logout'),
  );
  await logout.focus();
  await page.keyboard.press('Space');
  expect((await response).status()).toBe(204);
  await expect(
    page.getByRole('group', { name: 'Cuenta de usuario' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(historyLength);
  expect(
    await page.evaluate(async () => (await fetch('/api/auth/session')).status),
  ).toBe(401);
});

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
  await page.goto('/#/login');
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

test('a delayed logout response cannot clear a newer browser session', async ({
  page,
  context,
}) => {
  await page.goto('/#/login');
  await login(page);
  const originalCookie = (await context.cookies()).find(
    (cookie) => cookie.name === 'nextriva_session',
  );
  expect(originalCookie).toBeDefined();

  let releaseLogout!: () => void;
  const logoutResponseGate = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  let signalLogoutProcessed!: (result: {
    status: number;
    setCookie: string;
  }) => void;
  const logoutProcessed = new Promise<{
    status: number;
    setCookie: string;
  }>((resolve) => {
    signalLogoutProcessed = resolve;
  });

  await page.route('**/api/auth/logout', async (route) => {
    const requestHeaders = await route.request().allHeaders();
    const response = await fetch(
      `http://127.0.0.1:${process.env.NEXTRIVA_E2E_API_PORT ?? '4317'}/api/auth/logout`,
      {
        method: 'POST',
        headers: {
          cookie: requestHeaders.cookie ?? '',
          origin: requestHeaders.origin ?? '',
          'x-csrf-token': requestHeaders['x-csrf-token'] ?? '',
        },
      },
    );
    const cookies = response.headers.getSetCookie();
    expect(response.status).toBe(204);
    expect(cookies).toHaveLength(1);
    signalLogoutProcessed({
      status: response.status,
      setCookie: cookies[0] ?? '',
    });
    await logoutResponseGate;
    await route.fulfill({
      status: response.status,
      headers: { 'set-cookie': cookies[0] ?? '' },
    });
  });

  try {
    const browserLogoutResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/logout'),
    );
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    const processedLogout = await logoutProcessed;
    expect(processedLogout.status).toBe(204);
    expect(processedLogout.setCookie).toContain('Max-Age=0');

    const deniedPromotions = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/promotions') && response.status() === 401,
    );
    await page.getByRole('link', { name: 'Promociones', exact: true }).click();
    expect((await deniedPromotions).status()).toBe(401);
    const loginForm = page.getByRole('form', { name: 'Iniciar sesión' });
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText('Cerrando sesión…')).toBeVisible();
    await expect(loginForm).toHaveCount(0);
    const loginAvailableWhileLogoutPending = await loginForm.isVisible();

    releaseLogout();
    expect((await browserLogoutResponse).status()).toBe(204);
    await expect
      .poll(async () =>
        (await context.cookies()).some(
          (cookie) => cookie.name === 'nextriva_session',
        ),
      )
      .toBe(false);
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await fetch('/api/auth/session')).status,
      ),
    ).toBe(401);

    await login(page);
    const newCookie = (await context.cookies()).find(
      (cookie) => cookie.name === 'nextriva_session',
    );
    expect(newCookie).toBeDefined();
    expect(newCookie?.value).not.toBe(originalCookie?.value);
    expect(
      await page.evaluate(
        async () => (await fetch('/api/auth/session')).status,
      ),
    ).toBe(200);
    expect(loginAvailableWhileLogoutPending).toBe(false);
  } finally {
    releaseLogout();
    await page.unroute('**/api/auth/logout');
  }
});

test('a delayed logout response cannot clear a session created in another tab', async ({
  page,
  context,
}) => {
  await page.goto('/#/login');
  await login(page);
  const otherPage = await context.newPage();
  await otherPage.goto('/#/login');
  await expect(
    otherPage.getByRole('link', { name: 'Promociones', exact: true }),
  ).toBeVisible();

  let releaseLogout!: () => void;
  const logoutResponseGate = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  let signalLogoutProcessed!: () => void;
  const logoutProcessed = new Promise<void>((resolve) => {
    signalLogoutProcessed = resolve;
  });

  await page.route('**/api/auth/logout', async (route) => {
    const requestHeaders = await route.request().allHeaders();
    const response = await fetch(
      `http://127.0.0.1:${process.env.NEXTRIVA_E2E_API_PORT ?? '4317'}/api/auth/logout`,
      {
        method: 'POST',
        headers: {
          cookie: requestHeaders.cookie ?? '',
          origin: requestHeaders.origin ?? '',
          'x-csrf-token': requestHeaders['x-csrf-token'] ?? '',
        },
      },
    );
    const cookies = response.headers.getSetCookie();
    expect(response.status).toBe(204);
    signalLogoutProcessed();
    await logoutResponseGate;
    await route.fulfill({
      status: response.status,
      headers: { 'set-cookie': cookies[0] ?? '' },
    });
  });

  try {
    const browserLogoutResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/logout'),
    );
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await logoutProcessed;

    const deniedPromotions = otherPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/promotions') && response.status() === 401,
    );
    await otherPage
      .getByRole('link', { name: 'Promociones', exact: true })
      .click();
    expect((await deniedPromotions).status()).toBe(401);
    await expect(
      otherPage.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();

    const loginRequest = otherPage.waitForResponse((response) =>
      response.url().endsWith('/api/auth/login'),
    );
    await otherPage.getByLabel('Email', { exact: true }).fill(emails.ADMIN);
    await otherPage.getByLabel('Contraseña', { exact: true }).fill(password);
    let loginSentWhileLogoutPending = false;
    const recordLogin = (request: import('@playwright/test').Request) => {
      if (request.url().endsWith('/api/auth/login'))
        loginSentWhileLogoutPending = true;
    };
    otherPage.on('request', recordLogin);
    await otherPage
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect
      .poll(async () =>
        otherPage.evaluate(
          async () =>
            (await navigator.locks.query()).pending?.some(
              (lock) => lock.name === 'nextriva-auth-transition',
            ) ?? false,
        ),
      )
      .toBe(true);
    const loginSentBeforeLogoutResponse = loginSentWhileLogoutPending;
    otherPage.off('request', recordLogin);
    const sessionBeforeLogoutResponse = await otherPage.evaluate(
      async () => (await fetch('/api/auth/session')).status,
    );

    releaseLogout();
    expect((await browserLogoutResponse).status()).toBe(204);
    expect((await loginRequest).status()).toBe(200);
    await expect(
      otherPage.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();
    const sessionStatus = await otherPage.evaluate(
      async () => (await fetch('/api/auth/session')).status,
    );

    expect(loginSentBeforeLogoutResponse).toBe(false);
    expect(sessionBeforeLogoutResponse).toBe(401);
    expect(sessionStatus).toBe(200);
  } finally {
    releaseLogout();
    await page.unroute('**/api/auth/logout');
    await otherPage.close();
  }
});

test('incorrect existing/unknown credentials share one safe error and create no session', async ({
  page,
}) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: emails.ADMIN },
  });
  const before = await prisma.session.count({ where: { userId: user.id } });
  await page.goto('/#/login');
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
  test(`${role} remains authenticated with scoped promotion reads and no administrative mutations`, async ({
    page,
  }) => {
    await page.goto('/#/promotions');
    await login(page, role);
    await expect(
      page.getByRole('link', { name: 'Promociones', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Usuarios', exact: true }),
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
    expect(statuses).toEqual([403, 200, 403, 403, 200]);
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
  await page.goto('/#/login');
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
