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
const roles = ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const;
const emails = new Map<string, string>();
test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of roles) {
    const email = fixtureEmail(`landing-${role.toLowerCase()}`);
    await prisma.user.create({
      data: { firstName: 'Landing', lastName: role, email, passwordHash, role },
    });
    emails.set(role, email);
  }
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page, role: (typeof roles)[number]) {
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(emails.get(role)!);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/api/auth/login'),
  );
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  expect((await response).status()).toBe(200);
}

for (const role of roles)
  test(`public landing, real ${role} login, Home and private logo`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Cada promoción. Cada incidencia. Todo bajo control.',
    );
    await expect(
      page.getByRole('navigation', { name: 'Principal' }),
    ).toHaveCount(0);
    if (role === 'ADMIN')
      await page.screenshot({
        path: info.outputPath('landing-desktop.png'),
        fullPage: true,
      });
    await page.getByRole('link', { name: 'Acceder a Nextriva' }).click();
    await login(page, role);
    await expect(page).toHaveURL(/#\/home$/);
    await page.goto('/#/welcome');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toHaveCount(0);
    await page.goto('/');
    await expect(page).toHaveURL(/#\/home$/);
    await page.getByRole('link', { name: 'Incidencias', exact: true }).click();
    await page.getByRole('link', { name: 'Nextriva — Inicio' }).click();
    await expect(page).toHaveURL(/#\/home$/);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await fetch('/api/auth/session')).status,
      ),
    ).toBe(401);
    expect(errors).toEqual([]);
  });

test('protected destination survives real login without exposing private content', async ({
  page,
}) => {
  await page.goto('/#/incidents');
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Incidencias', exact: true }),
  ).toHaveCount(0);
  await login(page, 'ADMIN');
  await expect(page).toHaveURL(/#\/incidents$/);
  await expect(
    page.getByRole('heading', { name: 'Incidencias', exact: true }),
  ).toBeVisible();
});

test('mobile sections, keyboard navigation and demo contact send and store nothing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/welcome');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') mutations.push(request.method());
  });
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Cerrar menú' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Pública' })
      .getByRole('link', { name: 'Funcionalidades' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page
    .getByRole('navigation', { name: 'Pública' })
    .getByRole('link', { name: 'Contacto' })
    .click();
  await expect(page).toHaveURL(/#\/welcome\/contact$/);
  await expect(
    page.getByRole('heading', {
      name: 'El siguiente paso, cuando estés preparado.',
    }),
  ).toBeFocused();
  const form = page.getByRole('form', { name: 'Contacto de demostración' });
  await form.getByRole('button', { name: 'Enviar consulta' }).click();
  await expect(form.getByLabel('Nombre', { exact: true })).toBeFocused();
  await form.getByLabel('Nombre', { exact: true }).fill('Ejemplo ficticio');
  await form.getByLabel('Email', { exact: true }).fill('demo@example.test');
  await form
    .getByLabel('Mensaje', { exact: true })
    .fill('Mensaje ficticio sin envío');
  await form.getByRole('button', { name: 'Enviar consulta' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'El contacto todavía no está disponible. No se ha enviado ni guardado ningún dato.',
  );
  expect(mutations).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  const publicBrand = page
    .getByRole('link', { name: 'Nextriva — Presentación' })
    .last();
  const start = page.getByRole('heading', { level: 1 });
  await publicBrand.click();
  await expect(page).toHaveURL(/#\/welcome$/);
  await expect(start).toBeFocused();
  await expect(start).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await publicBrand.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await publicBrand.focus();
  await page.keyboard.press('Enter');
  await expect(start).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const footerFeatures = page
    .getByRole('navigation', { name: 'Pie de página' })
    .getByRole('link', { name: 'Funcionalidades' });
  const featuresHeading = page.getByRole('heading', {
    name: 'El trabajo, conectado de principio a fin.',
  });
  await footerFeatures.click();
  await expect(page).toHaveURL(/#\/welcome\/features$/);
  await expect(featuresHeading).toBeFocused();
  await expect(featuresHeading).toBeInViewport();
  const sectionScroll = await page.evaluate(() => window.scrollY);
  await footerFeatures.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(
    sectionScroll,
  );
  await footerFeatures.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/welcome\/features$/);
  await expect(featuresHeading).toBeFocused();
  await expect(featuresHeading).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(sectionScroll);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/welcome');
  await page.screenshot({
    path: info.outputPath('landing-mobile.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('link', { name: 'Acceder a Nextriva' }),
  ).toHaveCSS('transition-duration', '0s');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({
    path: info.outputPath('landing-mobile-dark.png'),
    fullPage: true,
  });
});
