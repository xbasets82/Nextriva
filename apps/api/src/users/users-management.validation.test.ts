import { expect, it } from 'vitest';
import {
  newManagedUser,
  userChanges,
  userId,
  userStatus,
} from './users-management.validation.js';
it.each([
  null,
  [],
  2,
  {},
  { firstName: '' },
  { firstName: 'a'.repeat(101) },
  { lastName: 'a'.repeat(151) },
  { email: 'a@b' },
  { role: 2 },
  { id: 'forbidden' },
])('rejects invalid allowed-list input %j', (body) => {
  expect(() => userChanges(body)).toThrow('Datos de usuario inválidos');
});
it('normalizes approved input, validates ids and status without coercion', () => {
  expect(
    userChanges({
      firstName: ' Nombre ',
      lastName: ' Apellido ',
      email: ' EMAIL@Example.Test ',
      role: 'MANAGER',
    }),
  ).toEqual({
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'email@example.test',
    role: 'MANAGER',
  });
  expect(userId('00000000-0000-4000-8000-000000000001')).toContain('0001');
  expect(userStatus({ isActive: true })).toBe(true);
  for (const body of [
    {},
    { isActive: 'false' },
    { isActive: false, role: 'ADMIN' },
  ])
    expect(() => userStatus(body)).toThrow();
});
it('requires all creation fields and a bounded nonempty password', () => {
  for (const password of ['', 1, 'a'.repeat(1025)])
    expect(() =>
      newManagedUser({
        firstName: 'Nombre',
        lastName: 'Apellido',
        email: 'user@example.test',
        role: 'ADMIN',
        password,
      }),
    ).toThrow('Datos de usuario inválidos');
  expect(() => newManagedUser({ password: 'test-only' })).toThrow(
    'Datos de usuario inválidos',
  );
});
