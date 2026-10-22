import { describe, expect, it } from 'vitest';
import { createTestProcessEnvironment } from './test-process-env.js';

describe('test child process environment', () => {
  it('passes only explicitly allowed runtime and isolated database settings', () => {
    const environment = createTestProcessEnvironment(
      {
        NEXTRIVA_MIGRATION_DATABASE_URL:
          'postgresql://test:secret@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef',
      },
      {
        DATABASE_URL: 'postgresql://dev:secret@127.0.0.1:5432/nextriva_dev',
        TEST_DATABASE_URL:
          'postgresql://test:secret@127.0.0.1:5433/nextriva_test',
        PATH: '/usr/bin',
        HOME: '/home/test-home',
        NODE_OPTIONS: '--require ./unexpected.js',
      },
    );

    expect(environment).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/test-home',
      NODE_ENV: 'test',
      AUTH_DATABASE_MODE: 'isolated-test',
      NEXTRIVA_MIGRATION_DATABASE_URL:
        'postgresql://test:secret@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef',
    });
    expect(environment).not.toHaveProperty('DATABASE_URL');
    expect(environment).not.toHaveProperty('TEST_DATABASE_URL');
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
  });

  it('filters unsafe properties even when an untyped override object is passed', () => {
    const temporaryMigrationUrl =
      'postgresql://test:secret@127.0.0.1:5433/nextriva_test_i02_1_0123456789abcdef0123456789abcdef';
    const unsafeOverrides = {
      DATABASE_URL: 'postgresql://dev:secret@127.0.0.1:5432/nextriva_dev',
      NODE_OPTIONS: '--require ./unexpected.js',
      NEXTRIVA_MIGRATION_DATABASE_URL: temporaryMigrationUrl,
    } as unknown as Parameters<typeof createTestProcessEnvironment>[0];

    const environment = createTestProcessEnvironment(unsafeOverrides, {});

    expect(environment).not.toHaveProperty('DATABASE_URL');
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
    expect(environment).toHaveProperty(
      'NEXTRIVA_MIGRATION_DATABASE_URL',
      temporaryMigrationUrl,
    );
  });
});

it('forwards explicitly selected E2E ports while filtering application database environment', () => {
  const environment = createTestProcessEnvironment(
    {},
    {
      NEXTRIVA_E2E_API_PORT: '4321',
      NEXTRIVA_E2E_WEB_PORT: '5174',
      DATABASE_URL: 'forbidden',
    },
  );
  expect(environment.NEXTRIVA_E2E_API_PORT).toBe('4321');
  expect(environment.NEXTRIVA_E2E_WEB_PORT).toBe('5174');
  expect(environment).not.toHaveProperty('DATABASE_URL');
});
