import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  createWriteStream,
  lstatSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { getTemporaryMigrationDatabaseUrl } from '../apps/api/src/database/database-url.ts';
import { createTestOutputRedactor } from './test-output.mjs';

const databaseNamePattern = /^nextriva_test_i09_3_[a-f0-9]{32}$/;
const databaseRolePattern = /^[A-Za-z_]\w*$/;
const dockerCliCandidates = {
  darwin: [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ],
  linux: ['/usr/bin/docker', '/usr/local/bin/docker'],
};

function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveDockerCliPath(
  platform = process.platform,
  isExecutable = isExecutableFile,
) {
  const candidates = dockerCliCandidates[platform];
  const executable = candidates?.find(isExecutable);
  if (!executable) {
    throw new Error('Docker CLI was not found in trusted system locations');
  }
  return executable;
}

export function getBackupRestoreDatabaseName(suffix) {
  if (!/^[a-f0-9]{32}$/.test(suffix)) {
    throw new Error('Invalid temporary database suffix');
  }
  return `nextriva_test_i09_3_${suffix}`;
}

function getBackupRestoreDatabase(urlValue) {
  const url = getTemporaryMigrationDatabaseUrl({
    NEXTRIVA_MIGRATION_DATABASE_URL: urlValue,
  });
  const parsed = new URL(url);
  const databaseName = parsed.pathname.slice(1);
  if (!databaseNamePattern.test(databaseName)) {
    throw new Error(
      'Backup and restore must use uniquely named I09.3 test databases',
    );
  }
  const databaseUser = decodeURIComponent(parsed.username);
  if (!databaseRolePattern.test(databaseUser)) {
    throw new Error('Backup and restore test database role is invalid');
  }
  return { parsed, databaseName, databaseUser };
}

export function assertBackupRestoreDatabaseUrls(sourceUrl, targetUrl) {
  const source = getBackupRestoreDatabase(sourceUrl);
  const target = getBackupRestoreDatabase(targetUrl);
  if (source.databaseName === target.databaseName) {
    throw new Error('Source and restore databases must be distinct');
  }
  if (
    source.parsed.protocol !== target.parsed.protocol ||
    source.parsed.hostname !== target.parsed.hostname ||
    source.parsed.port !== target.parsed.port ||
    source.parsed.username !== target.parsed.username ||
    source.parsed.password !== target.parsed.password
  ) {
    throw new Error(
      'Source and restore databases must use the same isolated PostgreSQL test instance',
    );
  }
  return {
    sourceDatabaseName: source.databaseName,
    targetDatabaseName: target.databaseName,
    databaseUser: source.databaseUser,
  };
}

export function assertBackupArchiveOutsideRepository(
  archivePath,
  repositoryRoot,
) {
  const repository = realpathSync(repositoryRoot);
  const archiveDirectory = realpathSync(dirname(resolve(archivePath)));
  const resolvedArchive = resolve(archiveDirectory, basename(archivePath));
  const fromRepository = relative(repository, resolvedArchive);
  if (
    fromRepository === '' ||
    (fromRepository !== '..' &&
      !fromRepository.startsWith(`..${sep}`) &&
      !isAbsolute(fromRepository))
  ) {
    throw new Error('Backup archive must be outside the repository');
  }
  return true;
}

export function createSecureBackupArchive(
  repositoryRoot,
  temporaryRoot = tmpdir(),
) {
  const resolvedTemporaryRoot = realpathSync(temporaryRoot);
  assertBackupArchiveOutsideRepository(
    join(resolvedTemporaryRoot, 'candidate.dump'),
    repositoryRoot,
  );
  const directory = mkdtempSync(join(resolvedTemporaryRoot, 'nextriva-i09-3-'));
  try {
    chmodSync(directory, 0o700);
    const archivePath = join(directory, 'synthetic.dump');
    assertBackupArchiveOutsideRepository(archivePath, repositoryRoot);
    const descriptor = openSync(archivePath, 'wx', 0o600);
    closeSync(descriptor);
    return {
      directory,
      archivePath,
      cleanup() {
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function parsePostgresMajorVersion(output) {
  const match = output.match(/PostgreSQL\)\s+(\d+)\./i);
  if (!match) throw new Error('PostgreSQL tool version could not be parsed');
  return Number(match[1]);
}

export function assertCompatiblePostgresMajorVersions(
  dumpToolVersion,
  restoreToolVersion,
  serverVersionNumber,
) {
  const dumpMajor = parsePostgresMajorVersion(dumpToolVersion);
  const restoreMajor = parsePostgresMajorVersion(restoreToolVersion);
  const numericServerVersion = Number(serverVersionNumber);
  if (
    !Number.isSafeInteger(numericServerVersion) ||
    numericServerVersion < 10000
  ) {
    throw new Error('PostgreSQL server version could not be parsed');
  }
  const serverMajor = Math.floor(numericServerVersion / 10000);
  if (dumpMajor !== restoreMajor || dumpMajor !== serverMajor) {
    throw new Error('PostgreSQL client and server major versions must match');
  }
  return dumpMajor;
}

export function buildPostgresToolArguments({
  composeFile,
  tool,
  databaseUser,
  databaseName,
}) {
  if (!['pg_dump', 'pg_restore'].includes(tool)) {
    throw new Error('Unsupported PostgreSQL backup tool');
  }
  if (!databaseRolePattern.test(databaseUser)) {
    throw new Error('Backup and restore test database role is invalid');
  }
  if (!databaseNamePattern.test(databaseName)) {
    throw new Error('Invalid I09.3 temporary database name');
  }

  const argumentsForTool = [
    'compose',
    '-f',
    composeFile,
    'exec',
    '-T',
    'postgres-test',
    tool,
    '--no-password',
    `--username=${databaseUser}`,
  ];
  if (tool === 'pg_dump') {
    argumentsForTool.push('--format=custom', `--dbname=${databaseName}`);
  } else {
    argumentsForTool.push(
      '--format=custom',
      '--exit-on-error',
      '--no-owner',
      '--no-acl',
      '--single-transaction',
      `--dbname=${databaseName}`,
    );
  }
  return argumentsForTool;
}

function buildToolVersionArguments(composeFile, tool) {
  if (!['pg_dump', 'pg_restore'].includes(tool)) {
    throw new Error('Unsupported PostgreSQL backup tool');
  }
  return [
    'compose',
    '-f',
    composeFile,
    'exec',
    '-T',
    'postgres-test',
    tool,
    '--version',
  ];
}

async function runComposeTool({
  argumentsForTool,
  cwd,
  environment,
  sourceDatabaseUrl,
  inputPath,
  outputPath,
}) {
  const redact = createTestOutputRedactor(sourceDatabaseUrl);
  const child = spawn(resolveDockerCliPath(), argumentsForTool, {
    cwd,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderrChunks = [];
  const stdoutChunks = [];
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  let outputPromise;
  if (outputPath) {
    outputPromise = pipeline(
      child.stdout,
      createWriteStream(outputPath, { flags: 'w', mode: 0o600 }),
    ).catch((error) => {
      child.kill('SIGTERM');
      throw error;
    });
  } else {
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    outputPromise = Promise.resolve();
  }

  let inputPromise = Promise.resolve();
  if (inputPath) {
    inputPromise = pipeline(createReadStream(inputPath), child.stdin).catch(
      (error) => {
        if (error.code === 'EPIPE') return;
        child.kill('SIGTERM');
        throw error;
      },
    );
  } else {
    child.stdin.end();
  }

  const exitPromise = new Promise((resolveExit, rejectExit) => {
    child.once('error', () =>
      rejectExit(new Error('PostgreSQL container tool could not start')),
    );
    child.once('close', (code, signal) => {
      resolveExit({ code: code ?? 1, signal });
    });
  });
  const [exitResult, outputResult, inputResult] = await Promise.allSettled([
    exitPromise,
    outputPromise,
    inputPromise,
  ]);
  if (
    exitResult.status === 'rejected' ||
    outputResult.status === 'rejected' ||
    inputResult.status === 'rejected'
  ) {
    throw new Error('PostgreSQL container tool stream failed');
  }
  const exit = exitResult.value;
  const stderr = redact(Buffer.concat(stderrChunks).toString('utf8'));
  return {
    exitCode: exit.code,
    signal: exit.signal,
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr,
  };
}

export async function getPostgresToolVersions({
  composeFile,
  cwd,
  environment,
  sourceDatabaseUrl,
}) {
  const [dump, restore] = await Promise.all(
    ['pg_dump', 'pg_restore'].map((tool) =>
      runComposeTool({
        argumentsForTool: buildToolVersionArguments(composeFile, tool),
        cwd,
        environment,
        sourceDatabaseUrl,
      }),
    ),
  );
  if (dump.exitCode !== 0 || restore.exitCode !== 0) {
    throw new Error('Could not verify PostgreSQL container tool versions');
  }
  return { dump: dump.stdout.trim(), restore: restore.stdout.trim() };
}

export async function dumpPostgresDatabase({
  composeFile,
  cwd,
  environment,
  sourceDatabaseUrl,
  targetDatabaseUrl,
  databaseUser,
  sourceDatabaseName,
  repositoryRoot,
  archivePath,
}) {
  const validatedDatabases = assertBackupRestoreDatabaseUrls(
    sourceDatabaseUrl,
    targetDatabaseUrl,
  );
  if (validatedDatabases.sourceDatabaseName !== sourceDatabaseName) {
    throw new Error('Backup source database name does not match its URL');
  }
  assertBackupArchiveOutsideRepository(archivePath, repositoryRoot);
  if (!lstatSync(archivePath).isFile()) {
    throw new Error('Backup archive path must be a regular file');
  }
  const result = await runComposeTool({
    argumentsForTool: buildPostgresToolArguments({
      composeFile,
      tool: 'pg_dump',
      databaseUser,
      databaseName: sourceDatabaseName,
    }),
    cwd,
    environment,
    sourceDatabaseUrl,
    outputPath: archivePath,
  });
  if (result.exitCode !== 0) {
    throw new Error(`pg_dump failed (exit ${result.exitCode})`);
  }
  if (result.stderr.trim() !== '') {
    throw new Error('pg_dump emitted a warning; review sanitized tool output');
  }
  return result;
}

export async function restorePostgresDatabase({
  composeFile,
  cwd,
  environment,
  sourceDatabaseUrl,
  targetDatabaseUrl,
  databaseUser,
  targetDatabaseName,
  repositoryRoot,
  archivePath,
}) {
  const validatedDatabases = assertBackupRestoreDatabaseUrls(
    sourceDatabaseUrl,
    targetDatabaseUrl,
  );
  if (validatedDatabases.targetDatabaseName !== targetDatabaseName) {
    throw new Error('Restore target database name does not match its URL');
  }
  assertBackupArchiveOutsideRepository(archivePath, repositoryRoot);
  if (!lstatSync(archivePath).isFile()) {
    throw new Error('Backup archive path must be a regular file');
  }
  return runComposeTool({
    argumentsForTool: buildPostgresToolArguments({
      composeFile,
      tool: 'pg_restore',
      databaseUser,
      databaseName: targetDatabaseName,
    }),
    cwd,
    environment,
    sourceDatabaseUrl,
    inputPath: archivePath,
  });
}
