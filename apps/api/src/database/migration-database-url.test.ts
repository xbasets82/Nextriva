import { describe, expect, it } from 'vitest';
import { getTemporaryMigrationDatabaseUrl } from './database-url.js';

const isolatedDatabaseUrl =
  'postgresql://synthetic-user:synthetic-password@127.0.0.1:5433/nextriva_test_i01_1_0123456789abcdef0123456789abcdef';

describe('temporary migration database URL guard', () => {
  it('accepts only a local, uniquely named I01.1 test database', () => {
    expect(
      getTemporaryMigrationDatabaseUrl({
        NEXTRIVA_MIGRATION_DATABASE_URL: isolatedDatabaseUrl,
      }),
    ).toBe(isolatedDatabaseUrl);
  });

  it.each([
    'postgresql://synthetic-user:synthetic-password@127.0.0.1:5432/nextriva_dev',
    'postgresql://synthetic-user:synthetic-password@db.example.test:5433/nextriva_test_i01_1_0123456789abcdef0123456789abcdef',
    'postgresql://synthetic-user:synthetic-password@127.0.0.1:5433/nextriva_test',
    `${isolatedDatabaseUrl}?schema=public`,
  ])('rejects a non-isolated target without echoing its URL', (databaseUrl) => {
    expect(() =>
      getTemporaryMigrationDatabaseUrl({
        NEXTRIVA_MIGRATION_DATABASE_URL: databaseUrl,
      }),
    ).toThrow(
      'NEXTRIVA_MIGRATION_DATABASE_URL must target an isolated local I01.1 database',
    );
  });
});
