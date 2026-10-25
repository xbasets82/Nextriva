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
  await prisma.user.createMany({
    data: Array.from({ length: 11 }, (_, index) => ({
      firstName: `Page fixture ${index + 1}`,
      lastName: 'Browser Users',
      email: fixtureEmail(`browser-users-page-${index + 1}`),
      passwordHash,
      role: 'COLLABORATOR' as const,
    })),
  });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});
for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR']) {
  test(`Chromium real API enforces user administration permissions for ${role}`, async ({
    page,
  }) => {
    await page.goto('/#/users');
    await page
      .getByLabel('Email', { exact: true })
      .fill(fixtureEmail(`browser-users-${role.toLowerCase()}`));
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: target },
    });
    const result = await page.evaluate(
      async (input) => {
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
    await page.reload();
    if (role === 'ADMIN') {
      await expect(
        page.getByRole('heading', { name: 'Usuarios', exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel('Estado', { exact: true })).toHaveValue(
        'active',
      );
      await expect(page.getByRole('listitem')).toHaveCount(10);
      await expect(page.getByText(/^Página 1 de \d+$/)).toBeVisible();
      await page.getByRole('button', { name: 'Página siguiente' }).click();
      await expect(page.getByText(/^Página 2 de \d+$/)).toBeVisible();
      await page
        .getByRole('searchbox', { name: 'Buscar usuarios' })
        .fill(fixtureEmail('browser-users-page-1'));
      await expect(page.getByText('Página 1 de 1')).toBeVisible();
      await expect(
        page.getByText(fixtureEmail('browser-users-page-1'), { exact: true }),
      ).toBeVisible();
      await page
        .getByRole('searchbox', { name: 'Buscar usuarios' })
        .fill(fixtureEmail('browser-users-admin').toUpperCase());
      await expect(
        page.getByText(fixtureEmail('browser-users-admin'), { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(fixtureEmail('browser-users-manager'), { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel('Rol', { exact: true }).selectOption('MANAGER');
      await expect(
        page.getByText('No hay usuarios que coincidan con los filtros.', {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page
        .getByRole('searchbox', { name: 'Buscar usuarios' })
        .fill(fixtureEmail('browser-users-manager'));
      await expect(
        page.getByText(fixtureEmail('browser-users-manager'), { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      for (const width of [1280, 768, 375]) {
        await page.setViewportSize({ width, height: 800 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
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
      await page
        .getByRole('searchbox', { name: 'Buscar usuarios' })
        .fill(fixtureEmail('browser-ui-created'));
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
        .getByRole('listitem')
        .filter({ hasText: persisted.email })
        .getByRole('button', { name: 'Editar usuario', exact: true })
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
        page.getByRole('heading', { name: 'Incidencias', exact: true }),
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
