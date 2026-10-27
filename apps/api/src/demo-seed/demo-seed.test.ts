import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { readDemoCredentials } from './demo-seed.js';

function environment() {
  return Object.fromEntries(
    ['ADMIN', 'MANAGER', 'COLLABORATOR'].flatMap((role) => [
      [`DEMO_${role}_EMAIL`, `${role.toLowerCase()}@demo.nextriva.invalid`],
      [`DEMO_${role}_PASSWORD`, randomBytes(24).toString('hex')],
    ]),
  );
}

it('accepts external fictitious accounts with distinct strong passwords for exactly three roles', () => {
  const input = environment();
  const credentials = readDemoCredentials(input);
  expect(Object.keys(credentials)).toEqual([
    'ADMIN',
    'MANAGER',
    'COLLABORATOR',
  ]);
  expect(credentials.ADMIN.password).toBe(input.DEMO_ADMIN_PASSWORD);
});

it('rejects missing, shared, weak credentials and non-fictitious emails with a redacted error', () => {
  const valid = environment();
  for (const overrides of [
    { DEMO_ADMIN_PASSWORD: '' },
    { DEMO_ADMIN_PASSWORD: '123456' },
    { DEMO_ADMIN_PASSWORD: valid.DEMO_MANAGER_PASSWORD },
    { DEMO_ADMIN_EMAIL: 'real@example.com' },
    { DEMO_ADMIN_EMAIL: valid.DEMO_MANAGER_EMAIL },
  ]) {
    expect(() => readDemoCredentials({ ...valid, ...overrides })).toThrow(
      'Credenciales DEMO externas inválidas',
    );
  }
});
