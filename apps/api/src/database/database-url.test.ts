import { describe, expect, it } from 'vitest';
import {
  getDevelopmentDatabaseUrl,
  getTestDatabaseUrl,
} from './database-url.js';

describe('getDevelopmentDatabaseUrl', () => {
  it('accepts only the local development database', () => {
    expect(
      getDevelopmentDatabaseUrl({
        DATABASE_URL:
          'postgresql://dev_user:dev_password@127.0.0.1:5432/nextriva_dev',
      }),
    ).toBe('postgresql://dev_user:dev_password@127.0.0.1:5432/nextriva_dev');
  });

  it.each([
    undefined,
    'postgresql://dev:dev@127.0.0.1:5433/nextriva_test',
    'postgresql://dev:dev@cloud.example.com:5432/nextriva_dev',
    'postgresql://dev:dev@127.0.0.1:5432/nextriva_dev?host=cloud.example.com',
    'not a url',
  ])('rejects unsafe development database URL %s', (url) => {
    expect(() => getDevelopmentDatabaseUrl({ DATABASE_URL: url })).toThrow(
      'DATABASE_URL must target the local nextriva_dev database',
    );
  });
});

describe('getTestDatabaseUrl', () => {
  it('accepts only the local test database', () => {
    expect(
      getTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgresql://test_user:test_password@127.0.0.1:5433/nextriva_test',
      }),
    ).toBe('postgresql://test_user:test_password@127.0.0.1:5433/nextriva_test');
  });

  it.each([
    undefined,
    'postgresql://dev:dev@127.0.0.1:5432/nextriva_dev',
    'postgresql://test:test@db.example.com:5433/nextriva_test',
    'postgresql://test:test@127.0.0.1:5433/other',
    'postgresql://test:test@127.0.0.1:5433/nextriva_test?host=cloud.example.com',
    'not a url',
  ])('rejects unsafe test database URL %s without revealing it', (url) => {
    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(
      'TEST_DATABASE_URL must target the local nextriva_test database',
    );
  });
});
