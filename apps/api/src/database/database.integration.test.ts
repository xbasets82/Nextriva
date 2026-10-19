import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseUrl } from './database-url.js';

const databaseUrl = getTestDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

describe('isolated PostgreSQL test database', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to nextriva_test and runs a read-only probe', async () => {
    const [probe] = await prisma.$queryRaw<
      Array<{ result: number; database_name: string }>
    >`SELECT 1::int AS result, current_database() AS database_name`;

    expect(probe).toEqual({ result: 1, database_name: 'nextriva_test' });
  });

  it('has no business tables', async () => {
    const [tableCount] = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

    expect(tableCount?.count).toBe(0n);
  });
});
