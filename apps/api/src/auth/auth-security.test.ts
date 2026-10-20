import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertCsrf,
  assertTrustedOrigin,
  csrfForSession,
  LoginLimiter,
  readSessionToken,
  sessionCookie,
  validateAuthConfiguration,
} from './auth-security.js';

const secure = { origin: 'https://nextriva.example', localHttp: false };
const local = { origin: 'http://127.0.0.1:5173', localHttp: true };

describe('authentication transport security', () => {
  it('requires a canonical HTTPS origin unless HTTP local development is explicitly enabled', () => {
    expect(validateAuthConfiguration({ AUTH_ORIGIN: secure.origin })).toEqual(
      secure,
    );
    expect(
      validateAuthConfiguration({
        AUTH_ORIGIN: local.origin,
        NODE_ENV: 'development',
        AUTH_LOCAL_HTTP: 'true',
      }),
    ).toEqual(local);
    for (const env of [
      {},
      {
        AUTH_ORIGIN: 'http://example.test',
        AUTH_LOCAL_HTTP: 'true',
        NODE_ENV: 'development',
      },
      {
        AUTH_ORIGIN: local.origin,
        AUTH_LOCAL_HTTP: 'true',
        NODE_ENV: 'production',
      },
      { AUTH_ORIGIN: local.origin },
      { AUTH_ORIGIN: secure.origin + '/path' },
      { AUTH_ORIGIN: 'https://user:pass@example.test' },
    ]) {
      expect(() => validateAuthConfiguration(env)).toThrow(
        'Configuración de autenticación inválida',
      );
    }
  });
  it('accepts exact Origin or Referer fallback and denies absent, null or conflicting origins', () => {
    expect(() =>
      assertTrustedOrigin({ origin: secure.origin }, secure),
    ).not.toThrow();
    expect(() =>
      assertTrustedOrigin({ referer: secure.origin + '/login' }, secure),
    ).not.toThrow();
    for (const headers of [
      {},
      { origin: 'null' },
      { origin: secure.origin + '.evil.test' },
      { origin: secure.origin + '/path' },
      { origin: 'https://evil.test', referer: secure.origin },
      { referer: 'invalid' },
      { referer: 'https://evil.test/' },
      { origin: 'https://user:pass@nextriva.example' },
    ]) {
      expect(() => assertTrustedOrigin(headers, secure)).toThrow(
        'Origen no permitido',
      );
    }
  });
  it('emits a host-only secure cookie and an explicit separate HTTP development cookie', () => {
    const token = randomBytes(32).toString('base64url');
    expect(sessionCookie(token, secure)).toBe(
      '__Host-nextriva_session=' +
        token +
        '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800',
    );
    expect(sessionCookie(token, local)).toBe(
      'nextriva_session=' +
        token +
        '; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800',
    );
    expect(
      readSessionToken('other=value; __Host-nextriva_session=' + token, secure),
    ).toBe(token);
    expect(readSessionToken('nextriva_session=' + token, local)).toBe(token);
    expect(readSessionToken(undefined, secure)).toBeUndefined();
    expect(
      readSessionToken('__Host-nextriva_session=invalid', secure),
    ).toBeUndefined();
    expect(
      readSessionToken(
        '__Host-nextriva_session=' +
          token +
          '; __Host-nextriva_session=' +
          token,
        secure,
      ),
    ).toBeUndefined();
  });
  it('binds CSRF to its session and rejects missing, malformed or foreign tokens', () => {
    const token = randomBytes(32).toString('base64url');
    const csrf = csrfForSession(token);
    expect(csrf).not.toBe(token);
    expect(csrf).toHaveLength(43);
    expect(() => assertCsrf(token, csrf)).not.toThrow();
    for (const invalid of [
      undefined,
      '',
      'bad',
      csrfForSession(randomBytes(32).toString('base64url')),
      'x'.repeat(43),
    ]) {
      expect(() => assertCsrf(token, invalid)).toThrow('Token CSRF inválido');
    }
  });
});

describe('login failure sliding window', () => {
  it('allows five failures then denies the next attempt, with exact 15-minute expiry', () => {
    const limiter = new LoginLimiter();
    for (let count = 0; count < 5; count++) {
      expect(() =>
        limiter.assertAllowed(' A@example.test ', '127.0.0.1', count),
      ).not.toThrow();
      limiter.recordFailure('a@example.test', '127.0.0.1', count);
    }
    expect(() =>
      limiter.assertAllowed('a@example.test', '127.0.0.1', 5),
    ).toThrow('Demasiados intentos');
    expect(() =>
      limiter.assertAllowed('b@example.test', '127.0.0.1', 5),
    ).not.toThrow();
    expect(() =>
      limiter.assertAllowed('a@example.test', '127.0.0.2', 5),
    ).not.toThrow();
    expect(() =>
      limiter.assertAllowed('a@example.test', '127.0.0.1', 900_000),
    ).not.toThrow();
  });
});
