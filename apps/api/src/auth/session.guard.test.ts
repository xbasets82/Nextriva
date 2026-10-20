import { randomBytes } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { csrfForSession } from './auth-security.js';
import { SessionGuard } from './session.guard.js';

const token = randomBytes(32).toString('base64url');
const origin = 'https://nextriva.example';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Synthetic',
  lastName: 'Guard',
  email: 'guard@example.test',
  passwordHash: randomBytes(32).toString('base64url'),
  role: 'ADMIN' as const,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const service = new AuthService(
  {
    findUser: async () => user,
    createSession: async () => {},
    consumeSession: async () => user,
  },
  { hash: async () => 'dummy', verify: async () => true },
);
const guard = new SessionGuard(service, () => ({ origin, localHttp: false }));
function context(
  method: string,
  headers: Record<string, string | string[]>,
): ExecutionContext {
  // Doble unitario mínimo del contexto HTTP de Nest; no sustituye la integración real.
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as ExecutionContext;
}
describe('server session and mutation guard', () => {
  it('denies unauthenticated requests before any application mutation', async () => {
    await expect(guard.canActivate(context('GET', {}))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('requires the session-bound token and exact origin for every authenticated unsafe method', async () => {
    const cookie = '__Host-nextriva_session=' + token;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const csrf of [
        '',
        'invalid',
        csrfForSession(randomBytes(32).toString('base64url')),
      ]) {
        await expect(
          guard.canActivate(
            context(method, { cookie, origin, 'x-csrf-token': csrf }),
          ),
        ).rejects.toMatchObject({ status: 403 });
      }
      await expect(
        guard.canActivate(
          context(method, {
            cookie,
            origin: 'https://evil.test',
            'x-csrf-token': csrfForSession(token),
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        guard.canActivate(
          context(method, {
            cookie,
            origin,
            'x-csrf-token': csrfForSession(token),
          }),
        ),
      ).resolves.toBe(true);
    }
    await expect(guard.canActivate(context('GET', { cookie }))).resolves.toBe(
      true,
    );
  });
});

it('rejects ambiguous multiple CSRF header values', async () => {
  await expect(
    guard.canActivate(
      context('POST', {
        cookie: '__Host-nextriva_session=' + token,
        origin,
        'x-csrf-token': [csrfForSession(token), csrfForSession(token)],
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
