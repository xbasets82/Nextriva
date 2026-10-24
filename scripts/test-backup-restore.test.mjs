import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getBackupRestoreDatabaseName } from './backup-restore.mjs';
import {
  assertBackupRestoreDatabaseUrls,
  assertBackupArchiveOutsideRepository,
  buildPostgresToolArguments,
  createSecureBackupArchive,
  parsePostgresMajorVersion,
  assertCompatiblePostgresMajorVersions,
  resolveDockerCliPath,
} from './backup-restore.mjs';

test('creates uniquely named I09.3 databases only from a UUID-shaped suffix', () => {
  assert.equal(
    getBackupRestoreDatabaseName('0123456789abcdef0123456789abcdef'),
    'nextriva_test_i09_3_0123456789abcdef0123456789abcdef',
  );
  assert.throws(
    () => getBackupRestoreDatabaseName('nextriva_dev'),
    /Invalid temporary database suffix/,
  );
});

test('accepts only two distinct isolated local I09.3 database URLs', () => {
  const source =
    'postgresql://synthetic:synthetic@127.0.0.1:5433/nextriva_test_i09_3_0123456789abcdef0123456789abcdef';
  const target =
    'postgresql://synthetic:synthetic@127.0.0.1:5433/nextriva_test_i09_3_abcdef0123456789abcdef0123456789';

  assert.deepEqual(assertBackupRestoreDatabaseUrls(source, target), {
    sourceDatabaseName: 'nextriva_test_i09_3_0123456789abcdef0123456789abcdef',
    targetDatabaseName: 'nextriva_test_i09_3_abcdef0123456789abcdef0123456789',
    databaseUser: 'synthetic',
  });
  assert.throws(
    () => assertBackupRestoreDatabaseUrls(source, source),
    /Source and restore databases must be distinct/,
  );
  assert.throws(
    () =>
      assertBackupRestoreDatabaseUrls(
        'postgresql://synthetic:synthetic@127.0.0.1:5432/nextriva_dev',
        target,
      ),
    /isolated local test database/,
  );
  assert.throws(
    () =>
      assertBackupRestoreDatabaseUrls(
        source,
        'postgresql://synthetic:synthetic@db.example.test:5433/nextriva_test_i09_3_abcdef0123456789abcdef0123456789',
      ),
    /isolated local test database/,
  );
});

test('rejects a dump path inside the repository, including a symlinked directory', (t) => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'nextriva-i09-3-repo-'));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'nextriva-i09-3-outside-'));
  t.after(() => {
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  });

  assert.equal(
    assertBackupArchiveOutsideRepository(
      join(outsideRoot, 'synthetic.dump'),
      repositoryRoot,
    ),
    true,
  );
  assert.throws(
    () =>
      assertBackupArchiveOutsideRepository(
        join(repositoryRoot, 'synthetic.dump'),
        repositoryRoot,
      ),
    /Backup archive must be outside the repository/,
  );

  symlinkSync(repositoryRoot, join(outsideRoot, 'repo-link'));
  assert.throws(
    () =>
      assertBackupArchiveOutsideRepository(
        join(outsideRoot, 'repo-link', 'synthetic.dump'),
        repositoryRoot,
      ),
    /Backup archive must be outside the repository/,
  );
});

test('creates a private temporary archive outside the repository and removes it', (t) => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'nextriva-i09-3-repo-'));
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'nextriva-i09-3-tmp-'));
  t.after(() => {
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  const archive = createSecureBackupArchive(repositoryRoot, temporaryRoot);
  assertBackupArchiveOutsideRepository(archive.archivePath, repositoryRoot);
  assert.equal(statSync(archive.directory).mode & 0o777, 0o700);
  assert.equal(statSync(archive.archivePath).mode & 0o777, 0o600);
  archive.cleanup();
  assert.equal(existsSync(archive.directory), false);
});

test('requires pg_dump, pg_restore, and server to share a major version', () => {
  assert.equal(parsePostgresMajorVersion('pg_dump (PostgreSQL) 18.6'), 18);
  assert.throws(() => parsePostgresMajorVersion('pg_dump version unknown'));
  assert.equal(
    assertCompatiblePostgresMajorVersions(
      'pg_dump (PostgreSQL) 18.6',
      'pg_restore (PostgreSQL) 18.6',
      '180006',
    ),
    18,
  );
  assert.throws(
    () =>
      assertCompatiblePostgresMajorVersions(
        'pg_dump (PostgreSQL) 16.15',
        'pg_restore (PostgreSQL) 16.15',
        '180006',
      ),
    /PostgreSQL client and server major versions must match/,
  );
});

test('resolves Docker from fixed executable paths without consulting PATH', () => {
  const checkedPaths = [];
  const dockerPath = resolveDockerCliPath('darwin', (candidate) => {
    checkedPaths.push(candidate);
    return candidate === '/opt/homebrew/bin/docker';
  });

  assert.equal(dockerPath, '/opt/homebrew/bin/docker');
  assert.deepEqual(checkedPaths, [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
  ]);
  assert.throws(
    () => resolveDockerCliPath('linux', () => false),
    /Docker CLI was not found in trusted system locations/,
  );
});

test('builds pg_dump and pg_restore arguments without connection URLs or passwords', () => {
  const options = {
    composeFile: '/repo/compose.test.yaml',
    databaseUser: 'nextriva_test',
    databaseName: 'nextriva_test_i09_3_0123456789abcdef0123456789abcdef',
  };
  const dumpArgs = buildPostgresToolArguments({ ...options, tool: 'pg_dump' });
  const restoreArgs = buildPostgresToolArguments({
    ...options,
    tool: 'pg_restore',
  });

  assert.ok(dumpArgs.includes('--format=custom'));
  assert.ok(dumpArgs.includes('--no-password'));
  assert.ok(restoreArgs.includes('--single-transaction'));
  assert.ok(restoreArgs.includes('--exit-on-error'));
  assert.ok(restoreArgs.includes('--no-owner'));
  assert.ok(restoreArgs.includes('--no-acl'));
  assert.ok(
    [...dumpArgs, ...restoreArgs].every(
      (argument) =>
        !argument.includes('postgresql://') &&
        !argument.includes('synthetic-secret'),
    ),
  );
  assert.throws(
    () =>
      buildPostgresToolArguments({
        ...options,
        databaseName: 'nextriva_dev',
        tool: 'pg_dump',
      }),
    /Invalid I09.3 temporary database name/,
  );
});
