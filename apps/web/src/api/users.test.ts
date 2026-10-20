import { afterEach, expect, it, vi } from 'vitest';
import { currentUser, listUsers } from './users.js';
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
