import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createTestProcessEnvironment } from '../apps/api/src/database/test-process-env.ts';
import { resolveTestDatabaseConfig } from './test-database-config.mjs';
import {
  createTestOutputRedactor,
  spawnRedactedSync,
  withRedactedDatabaseErrors,
} from './test-output.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const apiDirectory = resolve(repositoryRoot, 'apps/api');
const composeFile = resolve(repositoryRoot, 'compose.test.yaml');
if (process.env.DATABASE_URL !== undefined) {
  throw new Error('Integration tests must not receive DATABASE_URL');
}

const { url: testDatabaseUrl, source } =
  resolveTestDatabaseConfig(repositoryRoot);
if (process.argv.includes('--check-config')) {
  console.log(`TEST_DATABASE_URL available and validated (source: ${source})`);
  process.exit(0);
}

const requireFromApi = createRequire(resolve(apiDirectory, 'package.json'));
const { Client } = requireFromApi('pg');
const testDatabaseCredentials = new URL(testDatabaseUrl);
const redact = createTestOutputRedactor(testDatabaseUrl);
const composeEnvironment = createTestProcessEnvironment({
  NEXTRIVA_TEST_USER: decodeURIComponent(testDatabaseCredentials.username),
  NEXTRIVA_TEST_PASSWORD: decodeURIComponent(testDatabaseCredentials.password),
});

function run(command, args, options = {}) {
  const result = spawnRedactedSync(
    command,
    args,
    {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? createTestProcessEnvironment(),
    },
    redact,
  );

  if (options.inherit || result.error || result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }

  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }

  return result.stdout?.trim() ?? '';
}

const compose = ['compose', '-f', composeFile];
const existingTestContainer = run(
  'docker',
  [...compose, 'ps', '--status', 'running', '-q', 'postgres-test'],
  { env: composeEnvironment },
);
const wasRunning = existingTestContainer.length > 0;
let shouldStop = false;
let migrationDatabaseName;
let migrationDatabaseCreated = false;
let testDatabaseAdmin;
let migrationDatabaseUrl;
let testEnvironment;

try {
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
      { env: composeEnvironment, inherit: true },
    );
  }

  migrationDatabaseName = `nextriva_test_i02_1_${randomBytes(16).toString('hex')}`;
  if (!/^nextriva_test_i02_1_[a-f0-9]{32}$/.test(migrationDatabaseName)) {
    throw new Error('Generated migration test database name is invalid');
  }

  migrationDatabaseUrl = new URL(testDatabaseUrl);
  migrationDatabaseUrl.pathname = `/${migrationDatabaseName}`;
  testEnvironment = createTestProcessEnvironment({
    NEXTRIVA_MIGRATION_DATABASE_URL: migrationDatabaseUrl.toString(),
  });

  run(
    'pnpm',
    ['exec', 'prisma', 'generate', '--config', 'prisma.test.config.ts'],
    { cwd: apiDirectory, env: testEnvironment, inherit: true },
  );

  testDatabaseAdmin = new Client({ connectionString: testDatabaseUrl });
  await withRedactedDatabaseErrors(() => testDatabaseAdmin.connect(), redact);
  await withRedactedDatabaseErrors(
    () => testDatabaseAdmin.query(`CREATE DATABASE "${migrationDatabaseName}"`),
    redact,
  );
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
    { cwd: apiDirectory, env: testEnvironment, inherit: true },
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
  run('pnpm', testArguments, {
    cwd: apiDirectory,
    env: testEnvironment,
    inherit: true,
  });
} finally {
  if (testDatabaseAdmin) {
    if (migrationDatabaseName && migrationDatabaseCreated) {
      await withRedactedDatabaseErrors(
        () =>
          testDatabaseAdmin.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [migrationDatabaseName],
          ),
        redact,
      );
      await withRedactedDatabaseErrors(
        () =>
          testDatabaseAdmin.query(
            `DROP DATABASE IF EXISTS "${migrationDatabaseName}"`,
          ),
        redact,
      );
    }
    await withRedactedDatabaseErrors(() => testDatabaseAdmin.end(), redact);
  }

  if (shouldStop) {
    run('docker', [...compose, 'stop', 'postgres-test'], {
      env: composeEnvironment,
      inherit: true,
    });
  }
}
