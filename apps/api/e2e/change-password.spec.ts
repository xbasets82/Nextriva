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
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)
  test(`${role} changes own password through the keyboard accessible dialog and revokes old sessions`, async ({
    page,
    context,
  }) => {
    const password = randomBytes(24).toString('base64url');
    const next = randomBytes(24).toString('base64url');
    const email = fixtureEmail(`password-change-${role.toLowerCase()}`);
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Password',
        email,
        passwordHash: await new PasswordHasher().hash(password),
        role,
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    const trigger = page.getByRole('button', {
      name: 'Cambiar contraseña',
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Incidencias', exact: true }),
    ).toHaveAttribute('aria-busy', 'false');
    await trigger.focus();
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Cambiar contraseña' });
    await expect(
      dialog.getByLabel('Contraseña actual', { exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog
      .getByLabel('Contraseña actual', { exact: true })
      .fill(password);
    await dialog
      .getByRole('button', { name: 'Mostrar contraseña actual' })
      .click();
    await expect(
      dialog.getByLabel('Contraseña actual', { exact: true }),
    ).toHaveAttribute('type', 'text');
    await dialog
      .getByRole('button', { name: 'Ocultar contraseña actual' })
      .click();
    await dialog.getByLabel('Nueva contraseña', { exact: true }).fill(next);
    await dialog
      .getByLabel('Confirmar nueva contraseña', { exact: true })
      .fill(next);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog
      .getByLabel('Contraseña actual', { exact: true })
      .fill(randomBytes(24).toString('base64url'));
    const invalid = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/change-password'),
    );
    await dialog.getByRole('button', { name: 'Guardar contraseña' }).click();
    expect((await invalid).status()).toBe(400);
    await expect(
      dialog.getByText('No se pudo cambiar la contraseña. Revisa los datos.'),
    ).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    await dialog
      .getByLabel('Contraseña actual', { exact: true })
      .fill(password);
    await dialog.getByLabel('Nueva contraseña', { exact: true }).fill(next);
    await dialog
      .getByLabel('Confirmar nueva contraseña', { exact: true })
      .fill(next);
    const changed = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/change-password'),
    );
    await dialog.getByRole('button', { name: 'Guardar contraseña' }).click();
    expect((await changed).status()).toBe(204);
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
      ),
    ).toBeVisible();
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === 'nextriva_session',
      ),
    ).toBe(false);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    for (const [supplied, expected] of [
      [password, 401],
      [next, 200],
    ] as const) {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Contraseña', { exact: true }).fill(supplied);
      const response = page.waitForResponse((result) =>
        result.url().endsWith('/api/auth/login'),
      );
      await page
        .getByRole('button', { name: 'Iniciar sesión', exact: true })
        .click();
      expect((await response).status()).toBe(expected);
      if (expected === 401)
        await expect(
          page.getByText('Email o contraseña incorrectos.'),
        ).toBeVisible();
    }
    await expect(
      page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
    ).toBe(0);
  });
