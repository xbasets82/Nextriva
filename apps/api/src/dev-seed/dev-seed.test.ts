import { describe, expect, it } from 'vitest';
import { validateDevSeedCommandEnvironment } from './dev-seed.js';

const localUrl =
  'postgresql://seed_user:local-secret@127.0.0.1:5432/nextriva_dev';

describe('development seed destination guard', () => {
  it('accepts only the exact local development destination', () => {
    expect(
      validateDevSeedCommandEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: localUrl,
      }),
    ).toBe(localUrl);
  });

  it.each([
    ['production', { NODE_ENV: 'production', DATABASE_URL: localUrl }],
    ['CI', { CI: 'true', DATABASE_URL: localUrl }],
    ['test mode', { NODE_ENV: 'test', DATABASE_URL: localUrl }],
    [
      'isolated test mode',
      { AUTH_DATABASE_MODE: 'isolated-test', DATABASE_URL: localUrl },
    ],
    [
      'test database configuration',
      { DATABASE_URL: localUrl, TEST_DATABASE_URL: localUrl },
    ],
    [
      'remote host',
      {
        DATABASE_URL:
          'postgresql://seed_user:local-secret@db.example.test:5432/nextriva_dev',
      },
    ],
    [
      'wrong port',
      {
        DATABASE_URL:
          'postgresql://seed_user:local-secret@127.0.0.1:5433/nextriva_dev',
      },
    ],
    [
      'test database',
      {
        DATABASE_URL:
          'postgresql://seed_user:local-secret@127.0.0.1:5432/nextriva_test',
      },
    ],
    ['database URL overrides', { DATABASE_URL: `${localUrl}?schema=other` }],
  ])('rejects %s without exposing credentials', (_reason, environment) => {
    try {
      validateDevSeedCommandEnvironment(environment);
      throw new Error('Expected the seed guard to reject the destination');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'El seed solo se permite en nextriva_dev local fuera de CI.',
      );
      expect((error as Error).message).not.toContain('local-secret');
      expect((error as Error).message).not.toContain('postgresql://');
      expect((error as Error).message).not.toContain('Expected the seed guard');
    }
  });
});
