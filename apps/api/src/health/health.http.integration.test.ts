import { afterAll, beforeAll, expect, test } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../app.factory.js';

let app: INestApplication;
let baseUrl: string;
let logOutput = '';

beforeAll(async () => {
  app = await createApp({ write: (message) => (logOutput += message) });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

test('GET /api/health returns HTTP 200 and the exact public body', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'ok' });
});

test('logs a validated request ID and redacts sensitive request data', async () => {
  logOutput = '';

  const response = await fetch(
    `${baseUrl}/api/health?password=i005-query-secret`,
    {
      headers: {
        'x-request-id': 'nextriva-i005-request-123',
        cookie: 'session=i005-cookie-secret',
        authorization: 'Bearer i005-authorization-secret',
        'x-access-token': 'i005-token-secret',
      },
    },
  );

  expect(response.status).toBe(200);

  const log = JSON.parse(logOutput) as {
    requestId: string;
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  };
  expect(log).toMatchObject({
    requestId: 'nextriva-i005-request-123',
    method: 'GET',
    route: '/api/health',
    statusCode: 200,
  });
  expect(log.durationMs).toBeGreaterThanOrEqual(0);
  expect(logOutput).not.toContain('i005-query-secret');
  expect(logOutput).not.toContain('i005-cookie-secret');
  expect(logOutput).not.toContain('i005-authorization-secret');
  expect(logOutput).not.toContain('i005-token-secret');
});

test('generates a request ID when no valid ID is supplied', async () => {
  logOutput = '';

  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { 'x-request-id': 'invalid request id' },
  });

  expect(response.status).toBe(200);

  const log = JSON.parse(logOutput) as { requestId?: string };
  expect(log.requestId).toMatch(/^[0-9a-f-]{36}$/i);
});

test('generates a request ID when the request has no ID header', async () => {
  logOutput = '';

  const response = await fetch(`${baseUrl}/api/health`);

  expect(response.status).toBe(200);

  const log = JSON.parse(logOutput) as { requestId?: string };
  expect(log.requestId).toMatch(/^[0-9a-f-]{36}$/i);
});

test('logs unmatched routes with their actual HTTP status', async () => {
  logOutput = '';

  const response = await fetch(
    `${baseUrl}/api/not-found?token=i005-query-token-marker`,
    { headers: { 'x-request-id': 'nextriva-i005-not-found' } },
  );

  expect(response.status).toBe(404);

  const log = JSON.parse(logOutput) as {
    requestId: string;
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  };
  expect(log).toMatchObject({
    requestId: 'nextriva-i005-not-found',
    method: 'GET',
    route: 'unmatched',
    statusCode: 404,
  });
  expect(log.durationMs).toBeGreaterThanOrEqual(0);
  expect(logOutput).not.toContain('i005-query-token-marker');
});
