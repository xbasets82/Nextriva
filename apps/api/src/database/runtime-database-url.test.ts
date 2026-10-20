import { describe, expect, it } from 'vitest';
import { getApplicationDatabaseUrl } from './database-url.js';

const developmentUrl =
  'postgresql://dev_user:dev_password@127.0.0.1:5432/nextriva_dev';
const temporaryUrl =
  'postgresql://test_user:test_password@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef';

describe('application database destination', () => {
  it('uses the isolated temporary database in test mode', () => {
    expect(
      getApplicationDatabaseUrl({
        NODE_ENV: 'test',
        AUTH_DATABASE_MODE: 'isolated-test',
        DATABASE_URL: developmentUrl,
        NEXTRIVA_MIGRATION_DATABASE_URL: temporaryUrl,
      }),
    ).toBe(temporaryUrl);
  });

  it('fails closed instead of falling back to DATABASE_URL in test mode', () => {
    expect(() =>
      getApplicationDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: developmentUrl,
      }),
    ).toThrow(
      'Test runtime requires isolated-test mode and a temporary database URL',
    );
  });

  it('rejects isolated-test mode outside development or test', () => {
    expect(() =>
      getApplicationDatabaseUrl({
        NODE_ENV: 'production',
        AUTH_DATABASE_MODE: 'isolated-test',
        DATABASE_URL: developmentUrl,
      }),
    ).toThrow(
      'Test runtime requires isolated-test mode and a temporary database URL',
    );
  });

  it('keeps normal development runtime on the validated development URL', () => {
    expect(
      getApplicationDatabaseUrl({
        NODE_ENV: 'development',
        DATABASE_URL: developmentUrl,
      }),
    ).toBe(developmentUrl);
  });
});
