import { describe, expect, it } from 'vitest';
import { getApplicationDatabaseUrl } from './database-url.js';

const developmentUrl =
  'postgresql://dev_user:dev_password@127.0.0.1:5432/nextriva_dev';
const temporaryUrl =
  'postgresql://test_user:test_password@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef';
const productionUrl =
  'postgresql://production_user:synthetic_password@postgres:5432/nextriva_production';

describe('application database destination', () => {
  it('uses the explicit private production destination in production', () => {
    expect(
      getApplicationDatabaseUrl({
        NODE_ENV: 'production',
        DATABASE_URL: productionUrl,
      }),
    ).toBe(productionUrl);
  });

  it.each([
    undefined,
    developmentUrl,
    temporaryUrl,
    productionUrl.replace('postgres:5432', '127.0.0.1:5432'),
    productionUrl.replace('postgres:5432', 'remote.example:5432'),
    productionUrl.replace('nextriva_production', 'nextriva_dev'),
    productionUrl.replace('nextriva_production', 'nextriva_test'),
    productionUrl.replace(':synthetic_password', ''),
    `${productionUrl}?host=elsewhere`,
    `${productionUrl}#fragment`,
    'not a URL',
  ])('rejects an unsafe production destination without exposing it', (url) => {
    expect(() =>
      getApplicationDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: url }),
    ).toThrow('DATABASE_URL must target the private production database');
  });

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
