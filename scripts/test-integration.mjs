import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getTestDatabaseUrl } from '../apps/api/src/database/database-url.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const apiDirectory = resolve(repositoryRoot, 'apps/api');
const composeFile = resolve(repositoryRoot, 'compose.yaml');
const envFile = resolve(repositoryRoot, '.env.local');
const requireFromApi = createRequire(resolve(apiDirectory, 'package.json'));
const { Client } = requireFromApi('pg');

getTestDatabaseUrl();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }

  return result.stdout?.trim() ?? '';
}

const compose = ['compose', '--env-file', envFile, '-f', composeFile];
const existingTestContainer = run('docker', [
  ...compose,
  'ps',
  '--status',
  'running',
  '-q',
  'postgres-test',
]);
const wasRunning = existingTestContainer.length > 0;
let shouldStop = false;
let migrationDatabaseName;
let migrationDatabaseCreated = false;
let testDatabaseAdmin;

try {
  run('pnpm', ['exec', 'prisma', 'generate'], {
    cwd: apiDirectory,
    inherit: true,
  });

  if (!wasRunning) {
    shouldStop = true;
    run(
      'docker',
      [
        ...compose,
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '60',
        'postgres-test',
      ],
      { inherit: true },
    );
  }

  const testDatabaseUrl = getTestDatabaseUrl();
  migrationDatabaseName = `nextriva_test_i01_1_${randomBytes(16).toString('hex')}`;
  if (!/^nextriva_test_i01_1_[a-f0-9]{32}$/.test(migrationDatabaseName)) {
    throw new Error('Generated migration test database name is invalid');
  }

  const migrationDatabaseUrl = new URL(testDatabaseUrl);
  migrationDatabaseUrl.pathname = `/${migrationDatabaseName}`;
  process.env.NEXTRIVA_MIGRATION_DATABASE_URL = migrationDatabaseUrl.toString();

  testDatabaseAdmin = new Client({ connectionString: testDatabaseUrl });
  await testDatabaseAdmin.connect();
  await testDatabaseAdmin.query(`CREATE DATABASE "${migrationDatabaseName}"`);
  migrationDatabaseCreated = true;

  run(
    'pnpm',
    [
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      'prisma.test.config.ts',
    ],
    { cwd: apiDirectory, inherit: true },
  );

  let testArguments = [
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.integration.config.ts',
  ];
  if (process.argv.includes('--e2e')) {
    testArguments = ['exec', 'playwright', 'test'];
  } else if (process.argv.includes('--coverage')) {
    testArguments = [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.coverage.config.ts',
      '--coverage',
    ];
  }
  run('pnpm', testArguments, { cwd: apiDirectory, inherit: true });
} finally {
  if (testDatabaseAdmin) {
    if (migrationDatabaseName && migrationDatabaseCreated) {
      await testDatabaseAdmin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [migrationDatabaseName],
      );
      await testDatabaseAdmin.query(
        `DROP DATABASE IF EXISTS "${migrationDatabaseName}"`,
      );
    }
    await testDatabaseAdmin.end();
  }

  if (shouldStop) {
    run('docker', [...compose, 'stop', 'postgres-test'], { inherit: true });
  }
}
