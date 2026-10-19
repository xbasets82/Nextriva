import { expect, test } from 'vitest';
import { createLogger } from './logger.js';

test('removes sensitive fields and request bodies from structured output', () => {
  let logOutput = '';
  const logger = createLogger({ write: (message) => (logOutput += message) });

  logger.info({
    event: 'synthetic-request',
    req: {
      headers: {
        cookie: 'synthetic-cookie-marker',
        authorization: 'synthetic-authorization-marker',
        'x-access-token': 'synthetic-header-token-marker',
      },
      body: { password: 'synthetic-body-password-marker' },
    },
    body: { comment: 'synthetic-sensitive-body-marker' },
    password: 'synthetic-password-marker',
    token: 'synthetic-token-marker',
    refreshToken: 'synthetic-refresh-token-marker',
    databaseUrl: 'postgresql://synthetic-database-marker',
  });

  expect(logOutput).toContain('synthetic-request');
  expect(logOutput).not.toContain('synthetic-cookie-marker');
  expect(logOutput).not.toContain('synthetic-authorization-marker');
  expect(logOutput).not.toContain('synthetic-header-token-marker');
  expect(logOutput).not.toContain('synthetic-body-password-marker');
  expect(logOutput).not.toContain('synthetic-sensitive-body-marker');
  expect(logOutput).not.toContain('synthetic-password-marker');
  expect(logOutput).not.toContain('synthetic-token-marker');
  expect(logOutput).not.toContain('synthetic-refresh-token-marker');
  expect(logOutput).not.toContain('synthetic-database-marker');
});
