import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createTestProcessEnvironment } from '../apps/api/src/database/test-process-env.ts';
import { resolveTestDatabaseConfig } from './test-database-config.mjs';
import {
  createTestUiSessionMarker,
  createTestOutputRedactor,
  createInteractiveSetupSignalGuard,
  recoverStaleTestUiSessions,
  resolveInteractiveUiPorts,
  spawnRedactedInteractive,
  spawnRedactedSync,
  withRedactedDatabaseErrors,
} from './test-output.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const apiDirectory = resolve(repositoryRoot, 'apps/api');
const composeFile = resolve(repositoryRoot, 'compose.test.yaml');
const interactiveUi = process.argv.includes('--e2e-ui');
const isolatedValidatorTest = process.argv.includes(
  '--isolated-validator-test',
);
if (
  interactiveUi &&
  (process.argv.includes('--e2e') || process.argv.includes('--coverage'))
) {
  throw new Error('Interactive E2E mode cannot combine with another test mode');
}
if (
  isolatedValidatorTest &&
  (interactiveUi ||
    process.argv.includes('--e2e') ||
    process.argv.includes('--coverage'))
) {
  throw new Error(
    'Isolated validator mode cannot combine with another test mode',
  );
}
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
let uiSessionMarker;
let interactiveFailure;
const setupSignalGuard = interactiveUi
  ? createInteractiveSetupSignalGuard(process)
  : null;

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
    setupSignalGuard?.throwIfInterrupted();
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
  if (isolatedValidatorTest)
    testEnvironment.NEXTRIVA_TEST_ISOLATED_VALIDATOR = '1';

  run(
    'pnpm',
    ['exec', 'prisma', 'generate', '--config', 'prisma.test.config.ts'],
    { cwd: apiDirectory, env: testEnvironment, inherit: true },
  );
  setupSignalGuard?.throwIfInterrupted();

  testDatabaseAdmin = new Client({ connectionString: testDatabaseUrl });
  await withRedactedDatabaseErrors(() => testDatabaseAdmin.connect(), redact);
  setupSignalGuard?.throwIfInterrupted();
  if (interactiveUi) {
    const recovered = await withRedactedDatabaseErrors(
      () => recoverStaleTestUiSessions(testDatabaseAdmin),
      redact,
    );
    setupSignalGuard?.throwIfInterrupted();
    if (recovered.cleaned > 0) {
      console.log(
        `Recovered ${recovered.cleaned} abandoned Playwright UI test database(s)`,
      );
    }
    uiSessionMarker = createTestUiSessionMarker(migrationDatabaseName);
  }
  await withRedactedDatabaseErrors(
    () => testDatabaseAdmin.query(`CREATE DATABASE "${migrationDatabaseName}"`),
    redact,
  );
  migrationDatabaseCreated = true;
  setupSignalGuard?.throwIfInterrupted();

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
  setupSignalGuard?.throwIfInterrupted();

  if (interactiveUi) {
    testEnvironment = await resolveInteractiveUiPorts(testEnvironment);
    setupSignalGuard?.throwIfInterrupted();
    const result = await spawnRedactedInteractive(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--ui',
        '--config',
        'playwright.config.ts',
      ],
      { cwd: apiDirectory, env: testEnvironment },
      redact,
      {
        onStart: (processGroupId) =>
          uiSessionMarker.updateProcessGroup(processGroupId),
      },
    );
    if (result.status !== 0) process.exitCode = result.status;
  } else {
    let testArguments = [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.ts',
    ];
    if (isolatedValidatorTest) {
      testArguments.push(
        'src/incidents/incidents.http.integration.test.ts',
        '--testNamePattern',
        'rejects submission when the only eligible validator is the submitting responsible ADMIN',
      );
    } else if (process.argv.includes('--e2e')) {
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
  }
} catch (error) {
  if (!interactiveUi) throw error;
  interactiveFailure = error;
} finally {
  if (!interactiveUi) {
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
  } else {
    const cleanupErrors = [];
    if (testDatabaseAdmin) {
      if (migrationDatabaseName && migrationDatabaseCreated) {
        try {
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
          migrationDatabaseCreated = false;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }

      if (uiSessionMarker) {
        try {
          if (migrationDatabaseCreated) uiSessionMarker.close();
          else uiSessionMarker.remove();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }

      try {
        await withRedactedDatabaseErrors(() => testDatabaseAdmin.end(), redact);
      } catch (error) {
        cleanupErrors.push(error);
      }
    } else {
      try {
        uiSessionMarker?.remove();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (shouldStop) {
      try {
        run('docker', [...compose, 'stop', 'postgres-test'], {
          env: composeEnvironment,
          inherit: true,
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      const details = cleanupErrors
        .map((error) =>
          redact(error instanceof Error ? error.message : 'Cleanup failed'),
        )
        .join('; ');
      if (interactiveFailure) {
        process.stderr.write(`Interactive cleanup also failed: ${details}\n`);
      } else {
        interactiveFailure = new Error(
          `Interactive cleanup failed: ${details}`,
        );
      }
    }
  }
  setupSignalGuard?.dispose();
}

if (interactiveFailure) {
  const message =
    interactiveFailure instanceof Error
      ? interactiveFailure.message
      : 'Interactive E2E runner failed';
  process.stderr.write(`${redact(message)}\n`);
  process.exitCode ??= 1;
}
