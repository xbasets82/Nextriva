import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createOpenApiDocument } from '../openapi.js';
import type {
  OpenAPIObject,
  SchemaObject,
  ReferenceObject,
} from '@nestjs/swagger';
import { createApp } from '../app.factory.js';
import { AuthService, type AuthStore } from './auth.service.js';
import { csrfForSession } from './auth-security.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { INCIDENT_STATUSES } from '../incidents/incident.validation.js';

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
  changePassword: async () => true,
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

it('uses only a configured immediate proxy and a single validated forwarded address for login limits', async () => {
  const loginSpy = vi.spyOn(service, 'login');
  vi.stubEnv('AUTH_TRUSTED_PROXY_IP', '127.0.0.1');
  try {
    const response = await login(
      { email: user.email, password },
      { origin, 'x-forwarded-for': '192.0.2.138' },
    );
    expect(response.status).toBe(200);
    expect(loginSpy.mock.calls.at(-1)?.[2]).toBe('192.0.2.138');
  } finally {
    vi.unstubAllEnvs();
    loginSpy.mockRestore();
  }
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

it('documents the five auth endpoints and the logout response contract', async () => {
  const document = createOpenApiDocument(app);
  expect(Object.keys(document.paths).sort()).toEqual([
    '/api/auth/change-password',
    '/api/auth/csrf',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/session',
    '/api/health',
    '/api/incidents',
    '/api/incidents/deleted',
    '/api/incidents/filter-options',
    '/api/incidents/personal-summary',
    '/api/incidents/{id}',
    '/api/incidents/{id}/approve-solution',
    '/api/incidents/{id}/assignment',
    '/api/incidents/{id}/comments',
    '/api/incidents/{id}/eligible-assignees',
    '/api/incidents/{id}/reject-solution',
    '/api/incidents/{id}/reopen',
    '/api/incidents/{id}/soft-delete',
    '/api/incidents/{id}/solution',
    '/api/incidents/{id}/start',
    '/api/incidents/{id}/submit-solution',
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
  expect(logoutContract?.parameters).toContainEqual(
    expect.objectContaining({
      name: 'X-CSRF-Token',
      in: 'header',
      required: true,
    }),
  );
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

it('documents a closed JSON schema for every declared HTTP error and both actual conflict bodies', async () => {
  const document = createOpenApiDocument(app);
  const missing: string[] = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem?.[method];
      for (const [status, response] of Object.entries(
        operation?.responses ?? {},
      )) {
        if (Number(status) < 400 || !response || '$ref' in response) continue;
        if (!response.content?.['application/json']?.schema) {
          missing.push(`${method.toUpperCase()} ${path}: ${status}`);
        } else {
          documentedError(document, path, method, status);
        }
      }
    }
  }
  expect(missing).toEqual([]);
  const response = await fetch(baseUrl + '/api/auth/session');
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    message: 'Sesión inválida',
    error: 'Unauthorized',
    statusCode: 401,
  });
  expect(
    documentedError(document, '/api/auth/session', 'get', '401'),
  ).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['message', 'error', 'statusCode'],
    properties: { statusCode: { type: 'integer', enum: [401] } },
  });
  expect(
    documentedError(document, '/api/incidents/{id}/start', 'post', '409'),
  ).toEqual({
    oneOf: [
      expect.objectContaining({
        required: ['message', 'error', 'statusCode'],
        additionalProperties: false,
      }),
      {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', enum: ['INCIDENT_VERSION_CONFLICT'] },
          message: { type: 'string' },
        },
      },
    ],
  });
});

it('documents HTTPS and explicit local HTTP cookies as alternative authentication modes', async () => {
  const document = createOpenApiDocument(app);
  expect(document.components?.securitySchemes).toMatchObject({
    session: { type: 'apiKey', in: 'cookie', name: '__Host-nextriva_session' },
    localSession: { type: 'apiKey', in: 'cookie', name: 'nextriva_session' },
  });
  for (const pathItem of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem?.[method];
      if (
        operation?.security?.some((requirement) => 'session' in requirement)
      ) {
        expect(operation.security).toContainEqual({ session: [] });
        expect(operation.security).toContainEqual({ localSession: [] });
      }
    }
  }
  const localOrigin = 'http://127.0.0.1:5173';
  const localApp = await createApp(
    { write: () => undefined },
    {
      service,
      configuration: { origin: localOrigin, localHttp: true },
    },
  );
  try {
    await localApp.listen(0, '127.0.0.1');
    const response = await fetch(
      (await localApp.getUrl()) + '/api/auth/login',
      {
        method: 'POST',
        headers: { origin: localOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(
      /^nextriva_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/,
    );
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  } finally {
    await localApp.close();
  }
});

it('keeps documented role and incident status enums aligned with server values', async () => {
  const document = createOpenApiDocument(app);
  const enumValues = (propertyName: string) => {
    const values: string[][] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      const properties = record.properties;
      if (properties && typeof properties === 'object') {
        const property = (properties as Record<string, unknown>)[propertyName];
        if (property && typeof property === 'object') {
          const enumeration = (property as Record<string, unknown>).enum;
          if (
            Array.isArray(enumeration) &&
            enumeration.every((item) => typeof item === 'string')
          )
            values.push(enumeration);
        }
      }
      Object.values(record).forEach(visit);
    };
    visit(document);
    return values;
  };
  const sorted = (values: readonly string[]) => [...values].sort();
  const expectedRoles = sorted(Object.values(UserRole));
  const documentedRoles = enumValues('role');

  expect(documentedRoles.length).toBeGreaterThan(0);
  expect(
    documentedRoles
      .map(sorted)
      .filter((values) => values.join('|') !== expectedRoles.join('|')),
  ).toEqual([]);
  const incidentList = document.paths['/api/incidents']?.get;
  const statusParameter = incidentList?.parameters?.find(
    (parameter) => !('$ref' in parameter) && parameter.name === 'status',
  );
  expect(statusParameter).toMatchObject({
    schema: { enum: [...INCIDENT_STATUSES] },
  });
  const listResponse = incidentList?.responses['200'];
  if (!listResponse || '$ref' in listResponse)
    throw new Error('Missing incidents list response');
  const listSchema = listResponse.content?.['application/json']?.schema;
  if (!listSchema || '$ref' in listSchema)
    throw new Error('Missing incidents list response schema');
  const items = listSchema.properties?.items;
  if (!items || '$ref' in items || !items.items || '$ref' in items.items)
    throw new Error('Missing incidents list item schema');
  const incidentStatus = items.items.properties?.status;
  expect(incidentStatus).toMatchObject({ enum: [...INCIDENT_STATUSES] });
});

it('documents the actual rate-limit response without an invented error property', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rejected = await login({ email: user.email, password: 'invalid' });
    expect(rejected.status).toBe(401);
  }
  const response = await login({ email: user.email, password: 'invalid' });
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    statusCode: 429,
    message: 'Demasiados intentos. Inténtalo más tarde.',
  });
  const document = createOpenApiDocument(app);
  expect(documentedError(document, '/api/auth/login', 'post', '429')).toEqual({
    type: 'object',
    required: ['message', 'statusCode'],
    additionalProperties: false,
    properties: {
      message: { type: 'string' },
      statusCode: { type: 'integer', enum: [429] },
    },
  });
});

function documentedError(
  document: OpenAPIObject,
  path: string,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  status: string,
): SchemaObject {
  const response = document.paths[path]?.[method]?.responses[status];
  if (!response || '$ref' in response)
    throw new Error(`Missing response: ${method} ${path} ${status}`);
  const schema = response.content?.['application/json']?.schema;
  if (!schema) throw new Error(`Missing schema: ${method} ${path} ${status}`);
  function resolve(value: SchemaObject | ReferenceObject): SchemaObject {
    if ('$ref' in value) {
      expect(value.$ref).toMatch(/^#\/components\/schemas\/[^/]+$/);
      const target =
        document.components?.schemas?.[value.$ref.split('/').at(-1) ?? ''];
      if (!target) throw new Error(`Unresolved schema: ${value.$ref}`);
      return resolve(target);
    }
    return value.oneOf ? { ...value, oneOf: value.oneOf.map(resolve) } : value;
  }
  return resolve(schema);
}
