import { fixtureEmail } from './fixture-email.js';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../src/database/database-url.js';
import { PasswordHasher } from '../src/users/password-hasher.js';

const password = randomBytes(24).toString('base64url');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});
let target: string;
test.beforeAll(async () => {
  const passwordHash = await new PasswordHasher().hash(password);
  for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Browser',
        lastName: 'Users',
        email: fixtureEmail(`browser-users-${role.toLowerCase()}`),
        passwordHash,
        role,
      },
    });
    if (role === 'COLLABORATOR') target = user.id;
  }
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR']) {
  test(`Chromium real API enforces user administration permissions for ${role}`, async ({
    page,
  }) => {
    await page.goto('/');
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: target },
    });
    const result = await page.evaluate(
      async (input) => {
        const login = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
          }),
        });
        const csrf = await (await fetch('/api/auth/csrf')).json();
        const listed = await fetch('/api/users');
        const detailed = await fetch('/api/users/' + input.target);
        const edited = await fetch('/api/users/' + input.target, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf.csrfToken,
          },
          body: JSON.stringify({ firstName: 'Revisado' }),
        });
        const created = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf.csrfToken,
          },
          body: JSON.stringify({
            firstName: 'Nueva',
            lastName: 'Cuenta',
            email: input.newEmail,
            role: 'COLLABORATOR',
            password: input.password,
          }),
        });
        return {
          login: login.status,
          statuses: [
            listed.status,
            detailed.status,
            edited.status,
            created.status,
          ],
          text: await created.text(),
        };
      },
      {
        email: fixtureEmail(`browser-users-${role.toLowerCase()}`),
        password,
        target,
        newEmail: fixtureEmail(`browser-created-${role.toLowerCase()}`),
      },
    );
    expect(result.login).toBe(200);
    await page.reload();
    if (role === 'ADMIN') {
      await expect(
        page.getByText(fixtureEmail('browser-users-admin'), { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Usuarios', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Crear usuario' }).click();
      await page.getByLabel('Nombre', { exact: true }).fill('Creada');
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Apellidos', { exact: true })).toBeFocused();
      await page.getByLabel('Apellidos', { exact: true }).fill('Interfaz');
      await page
        .getByLabel('Email', { exact: true })
        .fill(fixtureEmail('browser-ui-created'));
      await page.getByLabel('Contraseña inicial').fill(password);
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(
        page.getByText('Usuario creado.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(fixtureEmail('browser-ui-created'), { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel('Contraseña inicial')).toHaveCount(0);
      const persisted = await prisma.user.findUniqueOrThrow({
        where: { email: fixtureEmail('browser-ui-created') },
      });
      expect(persisted.passwordHash).not.toBe(password);
      expect(persisted.role).toBe('COLLABORATOR');
      await page
        .getByRole('button', { name: `Editar ${persisted.email}`, exact: true })
        .click();
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
        'Creada',
      );
      await expect(page.getByLabel('Contraseña inicial')).toHaveCount(0);
      await page.getByLabel('Nombre', { exact: true }).fill('Editada');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(
        page.getByText('Usuario actualizado.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Usuarios', exact: true }),
      ).toBeFocused();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: persisted.id } }))
          .firstName,
      ).toBe('Editada');
      await page.getByRole('button', { name: 'Crear usuario' }).click();
      await page.getByLabel('Nombre', { exact: true }).fill('Sin guardar');
      page.once('dialog', (dialog) => dialog.dismiss());
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
        'Sin guardar',
      );
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(page.getByRole('form')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toContain(password);
      expect(await page.locator('body').innerText()).not.toContain('$argon2');
    } else {
      await expect(
        page.getByText('No tienes permisos para gestionar usuarios.'),
      ).toBeVisible();
    }
    expect(result.statuses).toEqual(
      role === 'ADMIN' ? [200, 200, 200, 201] : [403, 403, 403, 403],
    );
    expect(result.text).not.toContain(password);
    expect(result.text).not.toContain('$argon2');
    if (role !== 'ADMIN')
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: target } }),
      ).toEqual(before);
  });
}
