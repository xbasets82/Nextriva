import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const docker = ['/usr/bin/docker', '/usr/local/bin/docker'].find(existsSync);

test('DEMO is a separate project/database with explicit maintenance and seed profiles', () => {
  assert.ok(docker);
  const config = JSON.parse(
    execFileSync(
      docker,
      [
        'compose',
        '-f',
        'compose.demo.yaml',
        '--profile',
        'maintenance',
        '--profile',
        'demo-seed',
        'config',
        '--no-env-resolution',
        '--format',
        'json',
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NEXTRIVA_RELEASE: 'synthetic',
          NEXTRIVA_DEMO_ORIGIN: 'https://demo.invalid',
          NEXTRIVA_DEMO_PROXY_IP: '127.0.0.1',
          ...Object.fromEntries(
            [
              'NEXTRIVA_DEMO_ENV',
              'NEXTRIVA_DEMO_MIGRATION_ENV',
              'NEXTRIVA_DEMO_SEED_ENV',
              'NEXTRIVA_POSTGRES_PASSWORD_FILE',
              'NEXTRIVA_RUNTIME_PASSWORD_FILE',
              'NEXTRIVA_MIGRATION_PASSWORD_FILE',
            ].map((key) => [key, `/nonexistent-synthetic/${key}`]),
          ),
        },
      },
    ),
  );
  assert.equal(config.name, 'nextriva-demo');
  assert.equal(
    config.services.postgres.environment.POSTGRES_DB,
    'nextriva_demo',
  );
  assert.equal(config.services.postgres.ports, undefined);
  assert.equal(config.networks.database.internal, true);
  assert.equal(
    config.volumes.demo_database.name,
    'nextriva-demo_demo_database',
  );
  assert.equal(config.services.api.environment.AUTH_DATABASE_MODE, 'demo');
  assert.equal(config.services.api.environment.AUTH_LOCAL_HTTP, 'false');
  assert.equal(
    config.services.api.environment.AUTH_TRUSTED_PROXY_IP,
    '127.0.0.1',
  );
  assert.deepEqual(config.services.seed.profiles, ['demo-seed']);
  assert.deepEqual(config.services.seed.command, [
    'node',
    'dist/src/demo-seed/demo-seed.command.js',
  ]);
  assert.notDeepEqual(
    config.services.seed.env_file,
    config.services.api.env_file,
  );
  assert.match(
    config.services.migrate.command.at(-1),
    /prisma\.demo\.config\.ts/,
  );
  for (const service of ['api', 'web'])
    assert.equal(config.services[service].ports[0].host_ip, '127.0.0.1');
});

test('DEMO configuration does not load dotenv or automatically seed during migrations/startup', () => {
  const config = readFileSync('apps/api/prisma.demo.config.ts', 'utf8');
  assert.ok(config.includes('getDemoDatabaseUrl'));
  assert.ok(!config.includes('dotenv'));
  const seed = readFileSync(
    'apps/api/src/demo-seed/demo-seed.command.ts',
    'utf8',
  );
  assert.ok(!seed.includes('.env.local'));
  const proxy = readFileSync('deploy/Caddyfile.demo-test', 'utf8');
  assert.ok(proxy.includes('@api path /api /api/*'));
  assert.ok(proxy.includes('header_up X-Forwarded-For {remote_host}'));
});

test('production demo cleanup uses the same isolated Docker environment as setup', () => {
  const runner = readFileSync('scripts/test-demo-production.mjs', 'utf8');
  const cleanup = runner.slice(
    runner.indexOf('function cleanup()'),
    runner.indexOf('function signal()'),
  );
  const cleanupCommands = cleanup.match(/spawnSync\(docker,/g) ?? [];
  const isolatedEnvironments = cleanup.match(/env: environment/g) ?? [];

  assert.equal(cleanupCommands.length, 4);
  assert.equal(isolatedEnvironments.length, cleanupCommands.length);
});
