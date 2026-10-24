import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolveTestDatabaseConfig } from './test-database-config.mjs';

const url = 'postgresql://synthetic:synthetic@127.0.0.1:5433/nextriva_test';

function fixture(t, contents, mode = 0o600) {
  const root = mkdtempSync(join(tmpdir(), 'nextriva-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (contents !== undefined) {
    writeFileSync(join(root, '.env.test.local'), contents, { mode });
  }
  return root;
}

test('loads only TEST_DATABASE_URL from the ignored local file', (t) => {
  const root = fixture(
    t,
    `# Local test configuration\nTEST_DATABASE_URL=${url}\n`,
  );
  assert.deepEqual(resolveTestDatabaseConfig(root, {}), {
    url,
    source: 'file',
  });
});

test('uses an explicitly provided environment value without reading the file', (t) => {
  const root = fixture(t, 'DATABASE_URL=never-read\n', 0o644);
  assert.deepEqual(
    resolveTestDatabaseConfig(root, { TEST_DATABASE_URL: url }),
    {
      url,
      source: 'environment',
    },
  );
});

test('rejects inherited DATABASE_URL even when local configuration is valid', (t) => {
  const root = fixture(t, `TEST_DATABASE_URL=${url}\n`);
  assert.throws(
    () =>
      resolveTestDatabaseConfig(root, {
        DATABASE_URL: 'redacted',
        TEST_DATABASE_URL: url,
      }),
    { message: 'Integration tests must not receive DATABASE_URL' },
  );
});

test('does not fall back to the file when the explicit environment is invalid', (t) => {
  const root = fixture(t, `TEST_DATABASE_URL=${url}\n`);
  assert.throws(
    () => resolveTestDatabaseConfig(root, { TEST_DATABASE_URL: '' }),
    {
      message: 'TEST_DATABASE_URL must target the local nextriva_test database',
    },
  );
});

test('checks availability through the real runner without PostgreSQL or Docker', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./test-integration.mjs', import.meta.url)),
      '--check-config',
    ],
    {
      env: { TEST_DATABASE_URL: url },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    'TEST_DATABASE_URL available and validated (source: environment)\n',
  );
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(url));
});

test('the real runner rejects DATABASE_URL before checking configuration', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./test-integration.mjs', import.meta.url)),
      '--check-config',
    ],
    {
      env: { DATABASE_URL: 'never-disclose', TEST_DATABASE_URL: url },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Integration tests must not receive DATABASE_URL/,
  );
  assert.ok(!result.stderr.includes('never-disclose'));
  assert.ok(!result.stderr.includes(url));
});

test('rejects mixing backup/restore mode with other database test modes', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./test-integration.mjs', import.meta.url)),
      '--backup-restore-test',
      '--e2e',
      '--check-config',
    ],
    { env: { TEST_DATABASE_URL: url }, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Backup and restore mode cannot combine with another test mode/,
  );
  assert.ok(!result.stderr.includes('DATABASE_URL'));
});

for (const contents of [
  '',
  '# empty\n',
  `DATABASE_URL=${url}\n`,
  `TEST_DATABASE_URL=${url}\nOTHER=value\n`,
  `TEST_DATABASE_URL=${url}\nTEST_DATABASE_URL=${url}\n`,
  `export TEST_DATABASE_URL=${url}\n`,
  `TEST_DATABASE_URL="${url}"\n`,
  'TEST_DATABASE_URL=$(unexpected-command)\n',
]) {
  test('rejects unsupported local configuration without disclosing contents', (t) => {
    const root = fixture(t, contents);
    assert.throws(() => resolveTestDatabaseConfig(root, {}), {
      message:
        'Invalid .env.test.local: use one unquoted TEST_DATABASE_URL assignment only',
    });
  });
}

test('requires a private regular file owned by the current user', (t) => {
  const root = fixture(t, `TEST_DATABASE_URL=${url}\n`);
  chmodSync(join(root, '.env.test.local'), 0o644);
  assert.throws(() => resolveTestDatabaseConfig(root, {}), {
    message:
      'Unsafe .env.test.local: require an owned regular file with mode 0600',
  });
});

test('rejects configuration owned by a different user', (t) => {
  const root = fixture(t, `TEST_DATABASE_URL=${url}\n`);
  const currentUser = process.getuid();
  t.mock.method(process, 'getuid', () => currentUser + 1);
  assert.throws(() => resolveTestDatabaseConfig(root, {}), {
    message:
      'Unsafe .env.test.local: require an owned regular file with mode 0600',
  });
});

test('bounds local configuration size before reading', (t) => {
  const root = fixture(t, `#${'x'.repeat(8192)}`);
  assert.throws(() => resolveTestDatabaseConfig(root, {}), {
    message: 'Invalid .env.test.local: configuration is too large',
  });
});

test('rejects a symlink before reading local configuration', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'target'), `TEST_DATABASE_URL=${url}\n`, {
    mode: 0o600,
  });
  symlinkSync(join(root, 'target'), join(root, '.env.test.local'));
  assert.throws(() => resolveTestDatabaseConfig(root, {}), {
    message: 'Cannot securely read .env.test.local',
  });
});

test('reports missing configuration without reading .env.local', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, '.env.local'), `TEST_DATABASE_URL=${url}\n`, {
    mode: 0o600,
  });
  assert.throws(() => resolveTestDatabaseConfig(root, {}), {
    message:
      'Set TEST_DATABASE_URL or configure the ignored .env.test.local file',
  });
});

test('exposes backup and restore through the isolated integration runner', () => {
  const apiManifest = JSON.parse(
    readFileSync(new URL('../apps/api/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    apiManifest.scripts['test:backup-restore'],
    'node ../../scripts/test-integration.mjs --backup-restore-test',
  );
});

test('runs the isolated backup and restore verification as a required CI integration step', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const integrationJob = workflow
    .split('\n  e2e:')[0]
    .split('\n  integration:')[1];
  assert.ok(integrationJob, 'integration job must exist before E2E job');
  assert.match(
    integrationJob,
    /name: Backup y restauración PostgreSQL en base temporal aislada\s+run: pnpm --filter @nextriva\/api test:backup-restore/,
  );
});

test('exposes a separate UI command through the existing secure runner', () => {
  const apiManifest = JSON.parse(
    readFileSync(new URL('../apps/api/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    apiManifest.scripts['test:e2e'],
    'node ../../scripts/test-integration.mjs --e2e',
  );
  assert.equal(
    apiManifest.scripts['test:e2e:ui'],
    'node ../../scripts/test-integration.mjs --e2e-ui',
  );
});

for (const target of [
  'postgresql://synthetic:synthetic@127.0.0.1:5433/nextriva_dev',
  'postgresql://synthetic:synthetic@127.0.0.1:5432/nextriva_test',
  'postgresql://synthetic:synthetic@remote.example:5433/nextriva_test',
  'postgresql://synthetic:synthetic@127.0.0.1:5433/other',
  `${url}?host=remote.example`,
  `${url}#override`,
]) {
  test('preserves the existing destination restrictions for local files', (t) => {
    const root = fixture(t, `TEST_DATABASE_URL=${target}\n`);
    assert.throws(() => resolveTestDatabaseConfig(root, {}), {
      message: 'TEST_DATABASE_URL must target the local nextriva_test database',
    });
  });
}
