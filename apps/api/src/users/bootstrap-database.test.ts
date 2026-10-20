import { describe, expect, it, vi } from 'vitest';
import {
  createBootstrapDatabaseClient,
  resolveBootstrapDatabaseUrl,
} from './bootstrap-database.js';

const developmentUrl =
  'postgresql://dev_user:dev_password@127.0.0.1:5432/nextriva_dev';
const temporaryUrl =
  'postgresql://test_user:test_password@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef';

describe('bootstrap database destination', () => {
  it('uses the explicit isolated URL in test mode even when development URL is inherited', () => {
    expect(
      resolveBootstrapDatabaseUrl({
        NODE_ENV: 'test',
        AUTH_DATABASE_MODE: 'isolated-test',
        DATABASE_URL: developmentUrl,
        NEXTRIVA_BOOTSTRAP_DATABASE_URL: temporaryUrl,
      }),
    ).toBe(temporaryUrl);
  });

  it('rejects a development URL when the explicit temporary URL is missing', () => {
    expect(() =>
      resolveBootstrapDatabaseUrl({
        NODE_ENV: 'test',
        AUTH_DATABASE_MODE: 'isolated-test',
        DATABASE_URL: developmentUrl,
      }),
    ).toThrow(
      'NEXTRIVA_BOOTSTRAP_DATABASE_URL must target an isolated local test database',
    );
  });

  it('rejects test execution without isolated-test mode even if development URL exists', () => {
    expect(() =>
      resolveBootstrapDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: developmentUrl,
      }),
    ).toThrow(
      'Test bootstrap requires isolated-test mode and a temporary database URL',
    );
  });

  it.each([
    'postgresql://user:pass@127.0.0.1:5432/nextriva_dev',
    'postgresql://user:pass@remote.example:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef',
    'postgresql://user:pass@127.0.0.1:5433/nextriva_test',
  ])('rejects unsafe temporary destination %s', (url) => {
    expect(() =>
      resolveBootstrapDatabaseUrl({
        NODE_ENV: 'test',
        AUTH_DATABASE_MODE: 'isolated-test',
        DATABASE_URL: developmentUrl,
        NEXTRIVA_BOOTSTRAP_DATABASE_URL: url,
      }),
    ).toThrow(
      'NEXTRIVA_BOOTSTRAP_DATABASE_URL must target an isolated local test database',
    );
  });

  it('does not create a database client when the temporary URL is absent', () => {
    const factory = vi.fn((url: string) => ({ url }));

    expect(() =>
      createBootstrapDatabaseClient(
        {
          NODE_ENV: 'test',
          AUTH_DATABASE_MODE: 'isolated-test',
          DATABASE_URL: developmentUrl,
        },
        factory,
      ),
    ).toThrow(
      'NEXTRIVA_BOOTSTRAP_DATABASE_URL must target an isolated local test database',
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('keeps manual local bootstrap explicitly on nextriva_dev', () => {
    expect(
      resolveBootstrapDatabaseUrl({
        NODE_ENV: 'development',
        DATABASE_URL: developmentUrl,
      }),
    ).toBe(developmentUrl);
  });
});
