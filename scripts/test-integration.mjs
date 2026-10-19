import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getTestDatabaseUrl } from '../apps/api/src/database/database-url.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const apiDirectory = resolve(repositoryRoot, 'apps/api');
const composeFile = resolve(repositoryRoot, 'compose.yaml');
const envFile = resolve(repositoryRoot, '.env.local');

getTestDatabaseUrl();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  });

  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}`);
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

try {
  run('pnpm', ['exec', 'prisma', 'generate'], { cwd: apiDirectory, inherit: true });

  if (!wasRunning) {
    shouldStop = true;
    run(
      'docker',
      [...compose, 'up', '-d', '--wait', '--wait-timeout', '60', 'postgres-test'],
      { inherit: true },
    );
  }

  run(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts'],
    { cwd: apiDirectory, inherit: true },
  );
} finally {
  if (shouldStop) {
    run('docker', [...compose, 'stop', 'postgres-test'], { inherit: true });
  }
}
