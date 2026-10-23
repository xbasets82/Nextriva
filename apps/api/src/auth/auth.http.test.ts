import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApp } from '../app.factory.js';
import { AuthService, type AuthStore } from './auth.service.js';
import { csrfForSession } from './auth-security.js';

const password = randomBytes(24).toString('base64url');
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Synthetic',
  lastName: 'User',
  email: 'http@example.test',
  passwordHash: 'private-test-hash',
  role: 'ADMIN' as const,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const store: AuthStore = {
  findUser: vi.fn().mockResolvedValue(user),
  createSession: vi.fn().mockResolvedValue(user),
  consumeSession: vi.fn().mockResolvedValue(user),
  revokeSession: vi.fn().mockResolvedValue(true),
};
const service = new AuthService(store, {
  hash: async () => 'private-test-dummy-hash',
  verify: async (_hash, supplied) => supplied === password,
});
const origin = 'https://nextriva.example';
let app: INestApplication;
let baseUrl: string;
let logs = '';

beforeAll(async () => {
  app = await createApp(
    {
      write: (message) => {
        logs += message;
      },
    },
    { service, configuration: { origin, localHttp: false } },
  );
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app.close();
});

function login(body: unknown, headers: Record<string, string> = { origin }) {
  return fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

it('POST login creates an HTTP 200 safe user projection and a secure host cookie', async () => {
  const response = await login({ email: ' HTTP@example.test ', password });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body.user.email).toBe(user.email);
  expect(body.user).not.toHaveProperty('passwordHash');
  expect(Object.keys(body)).toEqual(['user']);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toMatch(
    /^__Host-nextriva_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/,
  );
  expect(cookie).not.toContain('Domain');
  expect(logs).not.toContain(password);
  expect(logs).not.toContain('private-test-hash');
  expect(logs).not.toContain(cookie?.split(';')[0]?.split('=')[1]);
});
it('uses exact Origin or Referer fallback before validating credentials', async () => {
  for (const headers of [
    {},
    { origin: 'null' },
    { origin: 'https://evil.test' },
    { origin: 'https://evil.test', referer: origin },
  ]) {
    const response = await login({ email: user.email, password }, headers);
    expect(response.status).toBe(403);
  }
  expect(
    (
      await login(
        { email: user.email, password },
        { referer: origin + '/login' },
      )
    ).status,
  ).toBe(200);
});
it('validates the input allowlist and bounded sizes without reflecting input', async () => {
  for (const body of [
    null,
    [],
    {},
    { email: user.email, password, role: 'ADMIN' },
    { email: 2, password },
    { email: user.email, password: '' },
    { email: user.email, password: 'x'.repeat(1025) },
    { email: 'x'.repeat(321), password },
  ]) {
    const response = await login(body);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(password);
  }
});
it('returns 401 for missing session, then safe session and CSRF for a valid cookie', async () => {
  expect((await fetch(baseUrl + '/api/auth/session')).status).toBe(401);
  expect((await fetch(baseUrl + '/api/auth/csrf')).status).toBe(401);
  const token = randomBytes(32).toString('base64url');
  const headers = { cookie: '__Host-nextriva_session=' + token };
  const session = await fetch(baseUrl + '/api/auth/session', { headers });
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({
    user: { id: user.id, role: 'ADMIN' },
  });
  const csrf = await fetch(baseUrl + '/api/auth/csrf', { headers });
  expect(csrf.status).toBe(200);
  expect(csrf.headers.get('cache-control')).toBe('no-store');
  const body = await csrf.json();
  expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(body.csrfToken).not.toBe(token);
  expect(logs).not.toContain(body.csrfToken);
});
it('POST logout revokes a valid session and expires the secure cookie with HTTP 204', async () => {
  const token = randomBytes(32).toString('base64url');
  const response = await fetch(baseUrl + '/api/auth/logout', {
    method: 'POST',
    headers: {
      origin,
      cookie: '__Host-nextriva_session=' + token,
      'x-csrf-token': csrfForSession(token),
    },
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(response.headers.get('set-cookie')).toBe(
    '__Host-nextriva_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  );
});

it('rejects invalid CSRF and origin for logout without revoking or clearing the cookie', async () => {
  const token = randomBytes(32).toString('base64url');
  const revoke = vi.mocked(store.revokeSession);
  revoke.mockClear();
  for (const headers of [
    { origin, cookie: '__Host-nextriva_session=' + token },
    {
      origin: 'https://evil.test',
      cookie: '__Host-nextriva_session=' + token,
      'x-csrf-token': csrfForSession(token),
    },
  ]) {
    const response = await fetch(baseUrl + '/api/auth/logout', {
      method: 'POST',
      headers,
    });
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
  }
  expect(revoke).not.toHaveBeenCalled();
});

it('documents the four auth endpoints and the logout response contract', async () => {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Nextriva API').setVersion('1.0.0').build(),
  );
  expect(Object.keys(document.paths).sort()).toEqual([
    '/api/auth/csrf',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/session',
    '/api/health',
    '/api/incidents',
    '/api/incidents/{id}',
    '/api/incidents/{id}/assignment',
    '/api/incidents/{id}/comments',
    '/api/incidents/{id}/eligible-assignees',
    '/api/incidents/{id}/start',
    '/api/promotions',
    '/api/promotions/{id}',
    '/api/promotions/{id}/status',
    '/api/promotions/{promotionId}/eligible-participants',
    '/api/promotions/{promotionId}/participants',
    '/api/promotions/{promotionId}/participants/{userId}',
    '/api/users',
    '/api/users/{id}',
    '/api/users/{id}/status',
  ]);
  const loginContract = document.paths['/api/auth/login']?.post;
  expect(loginContract?.responses).toHaveProperty('200');
  expect(loginContract?.responses).toHaveProperty('400');
  expect(loginContract?.responses).toHaveProperty('401');
  expect(loginContract?.responses).toHaveProperty('403');
  expect(loginContract?.responses).toHaveProperty('429');
  expect(loginContract?.requestBody).toBeDefined();
  expect(document.paths['/api/auth/session']?.get?.security).toBeDefined();
  const logoutContract = document.paths['/api/auth/logout']?.post;
  expect(logoutContract?.security).toBeDefined();
  expect(logoutContract?.responses).toHaveProperty('204');
  expect(logoutContract?.responses).toHaveProperty('401');
  expect(logoutContract?.responses).toHaveProperty('403');
  expect(JSON.stringify(document)).not.toContain('passwordHash');
});

it('does not reflect malformed JSON credential input or log it', async () => {
  const response = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{"password":"' + password + '",',
  });
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain(password);
  expect(logs).not.toContain(password);
});
