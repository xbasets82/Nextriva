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
        email: `browser-users-${role.toLowerCase()}@example.test`,
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
        email: `browser-users-${role.toLowerCase()}@example.test`,
        password,
        target,
        newEmail: `browser-created-${role.toLowerCase()}@example.test`,
      },
    );
    expect(result.login).toBe(200);
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
