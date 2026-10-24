import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertBackupArchiveOutsideRepository,
  assertBackupRestoreDatabaseUrls,
  assertCompatiblePostgresMajorVersions,
  createSecureBackupArchive,
  dumpPostgresDatabase,
  getPostgresToolVersions,
  restorePostgresDatabase,
} from '../../../../scripts/backup-restore.mjs';
import { getTemporaryMigrationDatabaseUrl } from './database-url.js';

const enabled = process.env.NEXTRIVA_BACKUP_RESTORE_TEST === '1';
interface QueryResult<Row> {
  rows: Row[];
  rowCount: number | null;
}

interface TestDatabaseClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

interface TestDatabaseClientConstructor {
  new (options: { connectionString: string }): TestDatabaseClient;
}

const { Client } = createRequire(import.meta.url)('pg') as {
  Client: TestDatabaseClientConstructor;
};

function onlyRow<Row>(result: QueryResult<Row>, label: string): Row {
  const row = result.rows[0];
  if (!row) throw new Error(`Expected a row for ${label}`);
  return row;
}
const businessTables = [
  'users',
  'sessions',
  'promotions',
  'promotion_phases',
  'promotion_participants',
  'incidents',
  'incident_comments',
  'incident_activities',
] as const;

async function createSyntheticSourceData(client: TestDatabaseClient) {
  const adminId = randomUUID();
  const managerId = randomUUID();
  const collaboratorId = randomUUID();
  const promotionId = randomUUID();
  const incidentId = randomUUID();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const lastSeenAt = new Date('2026-01-01T00:00:01.000Z');
  const expiresAt = new Date('2026-01-02T00:00:00.000Z');

  await client.query('BEGIN');
  try {
    for (const [id, role, email] of [
      [adminId, 'ADMIN', `admin-${adminId}@example.invalid`],
      [managerId, 'MANAGER', `manager-${managerId}@example.invalid`],
      [
        collaboratorId,
        'COLLABORATOR',
        `collaborator-${collaboratorId}@example.invalid`,
      ],
    ]) {
      await client.query(
        'INSERT INTO users (id, first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6::user_role)',
        [
          id,
          'Synthetic',
          'Backup',
          email,
          '$argon2id$synthetic$not-for-login',
          role,
        ],
      );
    }

    await client.query(
      'INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [
        adminId,
        randomBytes(32).toString('hex'),
        createdAt,
        lastSeenAt,
        expiresAt,
      ],
    );
    await client.query(
      'INSERT INTO promotions (id, name, status) VALUES ($1, $2, $3::promotion_status)',
      [promotionId, `Synthetic recovery ${promotionId}`, 'ACTIVE'],
    );
    await client.query(
      'INSERT INTO promotion_phases (promotion_id, phase) VALUES ($1, $2::promotion_phase)',
      [promotionId, 'PLANNING'],
    );
    await client.query(
      'INSERT INTO promotion_participants (promotion_id, user_id) VALUES ($1, $2), ($1, $3)',
      [promotionId, managerId, collaboratorId],
    );
    await client.query(
      'INSERT INTO incidents (id, promotion_id, origin_phase, title, description, category, priority, created_by_id, assigned_to_id) VALUES ($1, $2, $3::promotion_phase, $4, $5, $6::incident_category, $7::incident_priority, $8, $9)',
      [
        incidentId,
        promotionId,
        'PLANNING',
        'Synthetic recovery incident',
        'Synthetic recovery description',
        'OTHER',
        'MEDIUM',
        collaboratorId,
        managerId,
      ],
    );
    await client.query(
      'INSERT INTO incident_comments (incident_id, author_id, body) VALUES ($1, $2, $3)',
      [incidentId, managerId, 'Synthetic recovery comment'],
    );
    await client.query(
      'INSERT INTO incident_activities (incident_id, actor_id, event_type, changes) VALUES ($1, $2, $3::incident_event_type, $4::jsonb)',
      [
        incidentId,
        collaboratorId,
        'CREATED',
        '{"source":"backup-restore-test"}',
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return { incidentId };
}

async function snapshot(client: TestDatabaseClient) {
  const counts = {} as Record<string, number>;
  for (const table of businessTables) {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    counts[table] = onlyRow(result, `count for ${table}`).count;
  }
  const migrationHistory = await client.query<{
    migration_name: string;
    checksum: string;
    finished_at: string | null;
    rolled_back_at: string | null;
  }>(
    'SELECT migration_name, checksum, finished_at::text, rolled_back_at::text FROM "_prisma_migrations" ORDER BY migration_name',
  );
  const foreignKeys = await client.query<{
    conname: string;
    convalidated: boolean;
  }>(
    "SELECT conname, convalidated FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY conname",
  );
  const extensions = await client.query<{ extname: string }>(
    'SELECT extname FROM pg_extension ORDER BY extname',
  );
  const sequence = await client.query<{
    last_value: string;
    is_called: boolean;
  }>('SELECT last_value, is_called FROM incident_public_code_seq');
  const integrity = await client.query<{ invalid_relations: number }>(
    `SELECT (
      (SELECT count(*) FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL) +
      (SELECT count(*) FROM promotion_phases pp LEFT JOIN promotions p ON p.id = pp.promotion_id WHERE p.id IS NULL) +
      (SELECT count(*) FROM promotion_participants pp LEFT JOIN promotions p ON p.id = pp.promotion_id LEFT JOIN users u ON u.id = pp.user_id WHERE p.id IS NULL OR u.id IS NULL) +
      (SELECT count(*) FROM incidents i LEFT JOIN promotions p ON p.id = i.promotion_id LEFT JOIN users c ON c.id = i.created_by_id LEFT JOIN users a ON a.id = i.assigned_to_id LEFT JOIN users s ON s.id = i.solution_submitted_by_id LEFT JOIN users v ON v.id = i.validated_by_id WHERE p.id IS NULL OR c.id IS NULL OR (i.assigned_to_id IS NOT NULL AND a.id IS NULL) OR (i.solution_submitted_by_id IS NOT NULL AND s.id IS NULL) OR (i.validated_by_id IS NOT NULL AND v.id IS NULL)) +
      (SELECT count(*) FROM incident_comments c LEFT JOIN incidents i ON i.id = c.incident_id LEFT JOIN users u ON u.id = c.author_id WHERE i.id IS NULL OR u.id IS NULL) +
      (SELECT count(*) FROM incident_activities a LEFT JOIN incidents i ON i.id = a.incident_id LEFT JOIN users u ON u.id = a.actor_id WHERE i.id IS NULL OR u.id IS NULL)
      )::int AS invalid_relations`,
  );
  const publicCodeFunction = await client.query<{
    function_name: string | null;
  }>(
    "SELECT to_regprocedure('next_incident_public_code()')::text AS function_name",
  );

  return {
    counts,
    migrationHistory: migrationHistory.rows,
    foreignKeys: foreignKeys.rows,
    extensions: extensions.rows.map(({ extname }) => extname),
    sequence: onlyRow(sequence, 'public code sequence'),
    invalidRelations: onlyRow(integrity, 'relation integrity')
      .invalid_relations,
    publicCodeFunction: onlyRow(publicCodeFunction, 'public code function')
      .function_name,
  };
}

describe.skipIf(!enabled)('I09.3 PostgreSQL backup and restore', () => {
  it('restores a synthetic migrated database with its data and invariants', async () => {
    const sourceUrl = getTemporaryMigrationDatabaseUrl();
    const targetName = process.env.NEXTRIVA_BACKUP_RESTORE_TARGET_DATABASE;
    const failureName = process.env.NEXTRIVA_BACKUP_RESTORE_FAILURE_DATABASE;
    if (!targetName || !failureName) {
      throw new Error('Isolated backup/restore database names are required');
    }
    const targetUrl = new URL(sourceUrl);
    targetUrl.pathname = `/${targetName}`;
    const failureUrl = new URL(sourceUrl);
    failureUrl.pathname = `/${failureName}`;
    const sourceNames = assertBackupRestoreDatabaseUrls(
      sourceUrl,
      targetUrl.toString(),
    );
    assertBackupRestoreDatabaseUrls(sourceUrl, failureUrl.toString());
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.TEST_DATABASE_URL).toBeUndefined();

    const repositoryRoot = resolve(process.cwd(), '../..');
    const composeFile = resolve(repositoryRoot, 'compose.test.yaml');
    const backupFile = createSecureBackupArchive(repositoryRoot, tmpdir());
    const source = new Client({ connectionString: sourceUrl });
    const target = new Client({ connectionString: targetUrl.toString() });
    const failedTarget = new Client({
      connectionString: failureUrl.toString(),
    });

    try {
      await source.connect();
      await target.connect();
      await failedTarget.connect();
      await createSyntheticSourceData(source);
      const sourceSnapshot = await snapshot(source);

      const serverVersion = await source.query<{ server_version_num: string }>(
        "SELECT current_setting('server_version_num') AS server_version_num",
      );
      const toolVersions = await getPostgresToolVersions({
        composeFile,
        cwd: repositoryRoot,
        environment: process.env,
        sourceDatabaseUrl: sourceUrl,
      });
      expect(
        assertCompatiblePostgresMajorVersions(
          toolVersions.dump,
          toolVersions.restore,
          onlyRow(serverVersion, 'PostgreSQL server version')
            .server_version_num,
        ),
      ).toBe(18);

      const dumpResult = await dumpPostgresDatabase({
        composeFile,
        cwd: repositoryRoot,
        environment: process.env,
        sourceDatabaseUrl: sourceUrl,
        targetDatabaseUrl: targetUrl.toString(),
        databaseUser: sourceNames.databaseUser,
        sourceDatabaseName: sourceNames.sourceDatabaseName,
        repositoryRoot,
        archivePath: backupFile.archivePath,
      });
      expect(dumpResult.exitCode).toBe(0);
      expect(dumpResult.stderr).toBe('');
      expect(statSync(backupFile.archivePath).mode & 0o777).toBe(0o600);
      assertBackupArchiveOutsideRepository(
        backupFile.archivePath,
        repositoryRoot,
      );

      const restoreResult = await restorePostgresDatabase({
        composeFile,
        cwd: repositoryRoot,
        environment: process.env,
        sourceDatabaseUrl: sourceUrl,
        targetDatabaseUrl: targetUrl.toString(),
        databaseUser: sourceNames.databaseUser,
        targetDatabaseName: sourceNames.targetDatabaseName,
        repositoryRoot,
        archivePath: backupFile.archivePath,
      });
      expect(restoreResult.exitCode).toBe(0);
      const targetSnapshot = await snapshot(target);
      expect(targetSnapshot).toEqual(sourceSnapshot);
      expect(targetSnapshot.invalidRelations).toBe(0);
      expect(
        targetSnapshot.foreignKeys.every(
          (foreignKey: { convalidated: boolean }) => foreignKey.convalidated,
        ),
      ).toBe(true);

      await target.query('BEGIN READ ONLY');
      try {
        const smoke = await target.query(
          'SELECT i.public_code, p.name, u.email FROM incidents i JOIN promotions p ON p.id = i.promotion_id JOIN users u ON u.id = i.created_by_id',
        );
        expect(smoke.rowCount).toBe(1);
        await target.query('ROLLBACK');
      } catch (error) {
        await target.query('ROLLBACK');
        throw error;
      }

      const corruptedArchivePath = join(backupFile.directory, 'truncated.dump');
      const archiveBytes = readFileSync(backupFile.archivePath);
      writeFileSync(
        corruptedArchivePath,
        archiveBytes.subarray(
          0,
          Math.max(16, Math.floor(archiveBytes.length / 2)),
        ),
        { mode: 0o600, flag: 'wx' },
      );
      assertBackupArchiveOutsideRepository(
        corruptedArchivePath,
        repositoryRoot,
      );
      const failedRestore = await restorePostgresDatabase({
        composeFile,
        cwd: repositoryRoot,
        environment: process.env,
        sourceDatabaseUrl: sourceUrl,
        targetDatabaseUrl: failureUrl.toString(),
        databaseUser: sourceNames.databaseUser,
        targetDatabaseName: failureName,
        repositoryRoot,
        archivePath: corruptedArchivePath,
      });
      expect(failedRestore.exitCode).not.toBe(0);
      if (process.env.NEXTRIVA_TEST_PASSWORD) {
        expect(failedRestore.stderr).not.toContain(
          process.env.NEXTRIVA_TEST_PASSWORD,
        );
      }
      const incompleteTables = await failedTarget.query(
        'SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2',
        ['public', 'BASE TABLE'],
      );
      expect(onlyRow(incompleteTables, 'restored table count').count).toBe(0);
      const incompleteSequence = await failedTarget.query(
        "SELECT to_regclass('incident_public_code_seq') AS sequence_name",
      );
      expect(
        onlyRow(incompleteSequence, 'restored sequence').sequence_name,
      ).toBeNull();
    } finally {
      await Promise.allSettled([
        source.end(),
        target.end(),
        failedTarget.end(),
      ]);
      backupFile.cleanup();
    }
  }, 60_000);
});
