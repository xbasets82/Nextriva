import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getTemporaryMigrationDatabaseUrl } from '../database/database-url.js';
import { createTestProcessEnvironment } from '../database/test-process-env.js';
import { PasswordHasher } from '../users/password-hasher.js';
import {
  DEMO_READY_MARKER,
  DEMO_INITIALIZED_MARKER,
  seedDemoData,
} from './demo-seed.js';

const parentUrl = getTemporaryMigrationDatabaseUrl();
const databaseName = `nextriva_test_i02_1_${randomBytes(16).toString('hex')}`;
const isolatedUrl = new URL(parentUrl);
isolatedUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: parentUrl }),
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }),
});
let databaseCreated = false;

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  try {
    const migration = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        'prisma.test.config.ts',
      ],
      {
        env: createTestProcessEnvironment({
          NEXTRIVA_MIGRATION_DATABASE_URL: isolatedUrl.toString(),
        }),
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0)
      throw new Error('Isolated seed migration failed');
  } catch (error) {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
    databaseCreated = false;
    throw error;
  }
}, 30_000);

afterAll(async () => {
  try {
    await prisma.$disconnect();
    if (databaseCreated) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}"`,
      );
      databaseCreated = false;
    }
  } finally {
    await admin.$disconnect();
  }
}, 30_000);

const credentials = {
  ADMIN: {
    email: 'private-admin@demo.nextriva.invalid',
    password: randomBytes(24).toString('hex'),
  },
  MANAGER: {
    email: 'manager@demo.nextriva.invalid',
    password: randomBytes(24).toString('hex'),
  },
  COLLABORATOR: {
    email: 'collaborator@demo.nextriva.invalid',
    password: randomBytes(24).toString('hex'),
  },
};

async function counts() {
  return Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.promotion.count(),
    prisma.promotionPhaseRecord.count(),
    prisma.promotionParticipant.count(),
    prisma.incident.count(),
    prisma.incidentComment.count(),
    prisma.incidentActivity.count(),
  ]);
}
async function marker() {
  const rows = await prisma.$queryRaw<
    { marker: string | null }[]
  >`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`;
  return rows[0]?.marker;
}

it('initializes only a marked empty database atomically, serializes concurrent seeds and refuses repeats', async () => {
  await expect(seedDemoData(prisma, credentials)).rejects.toThrow('marcada');
  expect(await counts()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(await marker()).toBeNull();
  await prisma.$executeRawUnsafe(
    `COMMENT ON DATABASE "${databaseName}" IS '${DEMO_READY_MARKER}'`,
  );
  const manual = await prisma.promotion.create({
    data: { name: 'Manual fixture', status: 'ARCHIVED' },
  });
  await expect(seedDemoData(prisma, credentials)).rejects.toThrow('vacía');
  expect(await counts()).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
  expect(
    await prisma.promotion.findUnique({ where: { id: manual.id } }),
  ).toEqual(manual);
  await prisma.promotion.delete({ where: { id: manual.id } });

  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION demo_fail_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic demo activity failure'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER demo_fail_activity BEFORE INSERT ON incident_activities FOR EACH ROW EXECUTE FUNCTION demo_fail_activity()`,
  );
  try {
    await expect(seedDemoData(prisma, credentials)).rejects.toThrow();
    expect(await counts()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await marker()).toBe(DEMO_READY_MARKER);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS demo_fail_activity ON incident_activities',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS demo_fail_activity()',
    );
  }
  const results = await Promise.allSettled([
    seedDemoData(prisma, credentials),
    seedDemoData(prisma, credentials),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  expect(await marker()).toBe(DEMO_INITIALIZED_MARKER);
  expect(await counts()).toEqual([3, 0, 1, 1, 2, 1, 0, 1]);
  const users = await prisma.user.findMany();
  expect(new Set(users.map((user) => user.role))).toEqual(
    new Set(['ADMIN', 'MANAGER', 'COLLABORATOR']),
  );
  for (const user of users) {
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await new PasswordHasher().verify(
        user.passwordHash,
        credentials[user.role].password,
      ),
    ).toBe(true);
  }
  const incident = await prisma.incident.findFirstOrThrow({
    include: { activities: true, createdBy: true },
  });
  expect(incident.status).toBe('OPEN');
  expect(incident.createdBy.role).toBe('COLLABORATOR');
  expect(incident.activities).toHaveLength(1);
  expect(incident.activities[0]?.actorId).toBe(incident.createdById);
  expect(incident.activities[0]?.eventType).toBe('CREATED');
  expect(
    await prisma.promotionParticipant.count({
      where: {
        userId: incident.createdById,
        promotionId: incident.promotionId,
      },
    }),
  ).toBe(1);
  const before = await counts();
  await expect(seedDemoData(prisma, credentials)).rejects.toThrow();
  expect(await counts()).toEqual(before);
}, 30_000);
