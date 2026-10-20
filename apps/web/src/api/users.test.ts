import { afterEach, expect, it, vi } from 'vitest';
import {
  createUser,
  currentUser,
  editUser,
  listUsers,
  type NewUser,
  type UserChanges,
} from './users.js';
const user = {
  id: 'id',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  isActive: true,
  createdAt: 'date',
  updatedAt: 'date',
};
afterEach(() => vi.unstubAllGlobals());
it('projects only public response fields with same-origin credentials', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        user: { ...user, internalDiagnostic: 'must not escape' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  expect(await currentUser()).toEqual(user);
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
});
it.each([
  null,
  [],
  { users: 'invalid' },
  { users: [{ ...user, role: 'OTHER' }] },
])('rejects malformed list responses: %j', async (value) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
  );
  await expect(listUsers()).rejects.toThrow();
});

it('allowlists creation fields even when runtime input contains extra properties', async () => {
  const password = crypto.randomUUID();
  const extraHash = crypto.randomUUID();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      url === '/api/auth/csrf'
        ? new Response(JSON.stringify({ csrfToken: 'synthetic' }))
        : new Response(JSON.stringify({ user })),
    );
  vi.stubGlobal('fetch', fetchMock);
  const allowed: NewUser = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    role: 'ADMIN',
    password,
  };
  const input = Object.assign(allowed, {
    isActive: false,
    passwordHash: extraHash,
  });
  await createUser(input);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'ADMIN',
        password,
      }),
    }),
  );
});

it('encodes the user identifier and allowlists edit fields', async () => {
  const extraPassword = crypto.randomUUID();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      url === '/api/auth/csrf'
        ? new Response(JSON.stringify({ csrfToken: 'synthetic' }))
        : new Response(JSON.stringify({ user })),
    );
  vi.stubGlobal('fetch', fetchMock);
  const allowed: UserChanges = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    role: 'ADMIN',
  };
  const input = Object.assign(allowed, {
    isActive: false,
    password: extraPassword,
  });
  await editUser('id/with ? reserved', input);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users/id%2Fwith%20%3F%20reserved',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'ADMIN',
      }),
    }),
  );
});
