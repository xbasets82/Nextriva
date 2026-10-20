import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getTemporaryMigrationDatabaseUrl(),
  }),
});

afterAll(async () => {
  await prisma.$disconnect();
});

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const meta = Reflect.get(error, 'meta');
  if (typeof meta === 'object' && meta !== null) {
    const code = Reflect.get(meta, 'code');
    if (typeof code === 'string') return code;
  }
  const message = Reflect.get(error, 'message');
  if (typeof message === 'string')
    return message.match(/Code: `([A-Z0-9]{5})`/)?.[1];
  return undefined;
}

async function expectPostgresCode(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    expect(postgresCode(error)).toBe(expectedCode);
  }
}

describe('I03.1 promotion constraints on isolated PostgreSQL', () => {
  it('rejects a phase that references a missing promotion with a real FK error', async () => {
    await expectPostgresCode(
      prisma.$executeRaw`
        INSERT INTO "promotion_phases" ("promotion_id", "phase")
        VALUES (${randomUUID()}::uuid, 'PLANNING'::"promotion_phase")
      `,
      '23503',
    );
  });

  it('rejects a duplicate phase for the same promotion with a composite unique error', async () => {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "promotions" ("id", "name", "status", "updated_at")
      VALUES (${id}::uuid, 'Archived synthetic promotion', 'ARCHIVED'::"promotion_status", CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO "promotion_phases" ("promotion_id", "phase")
      VALUES (${id}::uuid, 'PLANNING'::"promotion_phase")
    `;
    await expectPostgresCode(
      prisma.$executeRaw`
        INSERT INTO "promotion_phases" ("promotion_id", "phase")
        VALUES (${id}::uuid, 'PLANNING'::"promotion_phase")
      `,
      '23505',
    );
  });

  it('stores the approved phase order in the PostgreSQL enum', async () => {
    const values = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT enumlabel AS value
      FROM pg_enum
      WHERE enumtypid = 'promotion_phase'::regtype
      ORDER BY enumsortorder
    `;
    expect(values.map(({ value }) => value)).toEqual([
      'PLANNING',
      'COMMERCIALIZATION',
      'EXECUTIVE_PROJECT',
      'CONSTRUCTION',
      'PRE_HANDOVER',
      'HANDOVER',
      'AFTER_SALES',
    ]);
  });

  it('rejects an active promotion without any phase at transaction commit', async () => {
    await expectPostgresCode(
      prisma.$executeRaw`
        INSERT INTO "promotions" ("id", "name", "status", "updated_at")
        VALUES (${randomUUID()}::uuid, 'Active without phases', 'ACTIVE'::"promotion_status", CURRENT_TIMESTAMP)
      `,
      '23514',
    );
  });

  it('prevents physical promotion deletion from cascading into retained phases', async () => {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "promotions" ("id", "name", "status", "updated_at")
      VALUES (${id}::uuid, 'Archived synthetic promotion', 'ARCHIVED'::"promotion_status", CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO "promotion_phases" ("promotion_id", "phase")
      VALUES (${id}::uuid, 'PLANNING'::"promotion_phase")
    `;
    await expectPostgresCode(
      prisma.$executeRaw`DELETE FROM "promotions" WHERE "id" = ${id}::uuid`,
      '23001',
    );
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "promotion_phases"
      WHERE "promotion_id" = ${id}::uuid
    `;
    expect(rows[0]?.count).toBe(1);
  });
});
