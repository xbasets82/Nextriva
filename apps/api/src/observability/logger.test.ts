import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { createLogger } from './logger.js';

test('removes sensitive fields and request bodies from structured output', () => {
  let logOutput = '';
  const logger = createLogger({ write: (message) => (logOutput += message) });
  const syntheticPassword = randomBytes(24).toString('base64url');
  const syntheticPasswordHash = `$argon2id$${randomBytes(24).toString('base64url')}`;

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
    password: syntheticPassword,
    password_hash: syntheticPasswordHash,
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
  expect(logOutput).not.toContain(syntheticPassword);
  expect(logOutput).not.toContain(syntheticPasswordHash);
  expect(logOutput).not.toContain('synthetic-token-marker');
  expect(logOutput).not.toContain('synthetic-refresh-token-marker');
  expect(logOutput).not.toContain('synthetic-database-marker');
});

test('redacts all self password change fields when supplied as structured properties', () => {
  let output = '';
  const logger = createLogger({
    write: (message) => {
      output += message;
    },
  });
  const secret = randomBytes(24).toString('base64url');
  logger.info({
    currentPassword: secret,
    newPassword: secret,
    confirmPassword: secret,
  });
  expect(output).not.toContain(secret);
});
