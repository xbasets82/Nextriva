import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerBinary = ['/usr/bin/docker', '/usr/local/bin/docker'].find(
  existsSync,
);
if (!dockerBinary)
  throw new Error('Docker must be installed in a system directory');

test('production Compose isolates PostgreSQL and publishes only loopback web/API', () => {
  const config = JSON.parse(
    execFileSync(
      dockerBinary,
      [
        'compose',
        '-f',
        'compose.production.yaml',
        '--profile',
        'maintenance',
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
          NEXTRIVA_RELEASE: 'synthetic-validation',
          NEXTRIVA_PRODUCTION_ENV:
            '/nonexistent-nextriva-synthetic/production.env',
          NEXTRIVA_MIGRATION_ENV:
            '/nonexistent-nextriva-synthetic/migration.env',
          NEXTRIVA_POSTGRES_PASSWORD_FILE:
            '/nonexistent-nextriva-synthetic/postgres-password',
          NEXTRIVA_RUNTIME_PASSWORD_FILE:
            '/nonexistent-nextriva-synthetic/runtime-password',
          NEXTRIVA_MIGRATION_PASSWORD_FILE:
            '/nonexistent-nextriva-synthetic/migration-password',
        },
      },
    ),
  );
  assert.equal(config.name, 'nextriva-production');
  assert.equal(config.services.postgres.ports, undefined);
  assert.equal(config.networks.database.internal, true);
  assert.equal(config.services.postgres.environment.POSTGRES_USER, 'postgres');
  assert.notDeepEqual(
    config.services.api.env_file,
    config.services.migrate.env_file,
  );
  assert.equal(
    config.services.postgres.environment.POSTGRES_DB,
    'nextriva_production',
  );
  assert.equal(
    config.services.postgres.environment.POSTGRES_PASSWORD,
    undefined,
  );
  assert.equal(
    config.services.postgres.environment.POSTGRES_PASSWORD_FILE,
    '/run/secrets/postgres_password',
  );
  assert.equal(
    config.services.postgres.volumes[0].target,
    '/var/lib/postgresql',
  );
  for (const name of ['api', 'web']) {
    const service = config.services[name];
    assert.equal(service.ports.length, 1);
    assert.equal(service.ports[0].host_ip, '127.0.0.1');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.ok(service.security_opt.includes('no-new-privileges:true'));
  }
  assert.deepEqual(config.services.migrate.profiles, ['maintenance']);
  assert.deepEqual(config.services.migrate.command, [
    '/bin/sh',
    '-ec',
    './node_modules/.bin/prisma migrate deploy --config prisma.production.config.ts && node ./revoke-migration-access.mjs',
  ]);
  assert.equal(config.services.api.environment.NODE_ENV, 'production');
  assert.equal(
    config.services.api.environment.AUTH_ORIGIN,
    'https://nextriva.es',
  );
  assert.equal(config.services.api.environment.AUTH_LOCAL_HTTP, 'false');
});

test('production migrations and build context cannot load local environment files', () => {
  const prisma = readFileSync('apps/api/prisma.production.config.ts', 'utf8');
  assert.ok(prisma.includes('getProductionDatabaseUrl'));
  assert.ok(!prisma.includes('dotenv'));
  assert.ok(!prisma.includes('.env.local'));
  const ignores = readFileSync('.dockerignore', 'utf8').split('\n');
  assert.ok(ignores.includes('**/.env*'));
  assert.ok(ignores.includes('.git'));
  assert.ok(ignores.includes('**/*.dump'));
  const caddy = readFileSync('deploy/Caddyfile.example', 'utf8');
  assert.ok(caddy.includes('redir https://nextriva.es{uri} permanent'));
  assert.ok(caddy.includes('handle /api/*'));
  assert.ok(!caddy.includes('handle_path'));
  assert.ok(caddy.includes('127.0.0.1:3000'));
  assert.ok(caddy.includes('127.0.0.1:8080'));
});
