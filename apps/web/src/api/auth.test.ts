import { afterEach, expect, it, vi } from 'vitest';
import { login, logout } from './auth.js';
import { advanceSession, apiFetch, onSessionExpired } from './transport.js';

afterEach(() => {
  vi.unstubAllGlobals();
});
it('invalidates once for concurrent 401s and ignores old requests after a new session', async () => {
  const completions: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => completions.push(resolve))),
  );
  const listener = vi.fn();
  const unsubscribe = onSessionExpired(listener);
  try {
    const first = apiFetch('/api/users').catch((error: unknown) => error);
    const second = apiFetch('/api/promotions').catch((error: unknown) => error);
    completions[0]!(new Response(null, { status: 401 }));
    completions[1]!(new Response(null, { status: 401 }));
    await Promise.all([first, second]);
    expect(listener).toHaveBeenCalledTimes(1);
    const stale = apiFetch('/api/users').catch((error: unknown) => error);
    advanceSession();
    completions[2]!(new Response(null, { status: 401 }));
    await stale;
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
  }
});
it.each([null, {}, { user: { role: 'ADMIN', passwordHash: 'private' } }])(
  'rejects malformed login projection %j without retaining private fields',
  async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body))),
    );
    await expect(
      login({ email: 'synthetic@example.test', password: crypto.randomUUID() }),
    ).rejects.toThrow('No se pudo completar la solicitud');
  },
);
it.each([null, {}, { csrfToken: '' }, { csrfToken: 123 }])(
  'does not send logout with malformed csrf %j',
  async (body) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(logout()).rejects.toThrow('No se pudo completar la solicitud');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
