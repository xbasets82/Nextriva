import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

export const fixturePassword = crypto.randomUUID();
export const admin = {
  id: 'a',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  isActive: true,
  createdAt: 'date',
  updatedAt: 'date',
};
export const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
export const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, callback: () => Promise<unknown>) =>
        callback(),
    },
  });
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/session'
      ? response({}, 401)
      : response({ status: 'ok' }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});
