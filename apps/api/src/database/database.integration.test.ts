import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTemporaryMigrationDatabaseUrl } from './database-url.js';

const databaseUrl = getTemporaryMigrationDatabaseUrl();
const databaseName = new URL(databaseUrl).pathname.slice(1);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

describe('temporary isolated PostgreSQL database', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to the generated temporary database and runs a read-only probe', async () => {
    const [probe] = await prisma.$queryRaw<
      Array<{ result: number; database_name: string }>
    >`SELECT 1::int AS result, current_database() AS database_name`;

    expect(probe).toEqual({ result: 1, database_name: databaseName });
  });

  it('uses only a validated temporary I00/I01/I02/I03 test database name', () => {
    expect(databaseName).toMatch(/^nextriva_test_i\d{2}_\d{1,2}_[a-f0-9]{32}$/);
  });

  it('contains only the business tables deployed for this integration run', async () => {
    const tables = await prisma.$queryRaw<
      Array<{ table_name: string }>
    >`SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'incident_activities',
      'incidents',
      'promotion_participants',
      'promotion_phases',
      'promotions',
      'sessions',
      'users',
    ]);
  });
});
