import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import {
  createTestUiSessionMarker,
  createTestOutputRedactor,
  createInteractiveSetupSignalGuard,
  recoverStaleTestUiSessions,
  spawnRedactedInteractive,
  spawnRedactedSync,
  withRedactedDatabaseErrors,
} from './test-output.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as testOutput from './test-output.mjs';

test('allocates separate UI ports while keeping both reservations until selection finishes', async () => {
  const events = [];
  const source = { NODE_ENV: 'test' };
  const result = await testOutput.resolveInteractiveUiPorts(
    source,
    async () => {
      const port = 46000 + events.filter((event) => event === 'reserve').length;
      events.push('reserve');
      return { port, release: async () => events.push(`release:${port}`) };
    },
  );

  assert.deepEqual(result, {
    NODE_ENV: 'test',
    NEXTRIVA_E2E_API_PORT: '46000',
    NEXTRIVA_E2E_WEB_PORT: '46001',
  });
  assert.deepEqual(events, [
    'reserve',
    'reserve',
    'release:46000',
    'release:46001',
  ]);
  assert.deepEqual(source, { NODE_ENV: 'test' });
});

test('preserves explicit UI port overrides without allocating replacements', async () => {
  const source = {
    NEXTRIVA_E2E_API_PORT: '4517',
    NEXTRIVA_E2E_WEB_PORT: '5517',
  };
  const result = await testOutput.resolveInteractiveUiPorts(
    source,
    async () => {
      assert.fail('explicit ports must not be replaced');
    },
  );
  assert.deepEqual(result, source);
});

test('avoids an explicit port when allocating the other UI server port', async () => {
  const released = [];
  const ports = [4517, 46001];
  const result = await testOutput.resolveInteractiveUiPorts(
    { NEXTRIVA_E2E_API_PORT: '4517' },
    async () => {
      const port = ports.shift();
      return { port, release: async () => released.push(port) };
    },
  );
  assert.equal(result.NEXTRIVA_E2E_API_PORT, '4517');
  assert.equal(result.NEXTRIVA_E2E_WEB_PORT, '46001');
  assert.deepEqual(released, [4517, 46001]);
});

test('releases the first UI reservation if selecting the second port fails', async () => {
  let calls = 0;
  let released = false;
  await assert.rejects(
    testOutput.resolveInteractiveUiPorts({}, async () => {
      if (calls++ > 0) throw new Error('synthetic listen failure');
      return {
        port: 46000,
        release: async () => {
          released = true;
        },
      };
    }),
    { message: 'synthetic listen failure' },
  );
  assert.equal(released, true);
});

test('selects distinct available localhost ports with the real network allocator', async () => {
  const result = await testOutput.resolveInteractiveUiPorts({});
  for (const key of ['NEXTRIVA_E2E_API_PORT', 'NEXTRIVA_E2E_WEB_PORT']) {
    assert.match(result[key], /^\d+$/);
    assert.ok(Number(result[key]) >= 1024 && Number(result[key]) <= 65535);
  }
  assert.notEqual(result.NEXTRIVA_E2E_API_PORT, result.NEXTRIVA_E2E_WEB_PORT);
});

const username = 'synthetic-audit@example.test';
const password = 'synthetic-P@ss/word:2026';
const encodedUsername = encodeURIComponent(username);
const encodedPassword = encodeURIComponent(password);
const url = `postgresql://${encodedUsername}:${encodedPassword}@127.0.0.1:5433/nextriva_test`;
const redact = createTestOutputRedactor(url);
const sensitive = [url, username, password, encodedUsername, encodedPassword];

function assertNoSecrets(output) {
  for (const value of sensitive) assert.ok(!output.includes(value));
}

test('redacts PostgreSQL authentication diagnostics and all credential forms', () => {
  const output = redact(
    [
      `password authentication failed for user "${username}"`,
      url,
      decodeURIComponent(url),
      encodedUsername,
      encodedPassword,
      encodedPassword.replace(/%[A-F\d]{2}/g, (escape) => escape.toLowerCase()),
    ].join('\n'),
  );
  assertNoSecrets(output);
  assert.ok(
    !output.includes(
      encodedPassword.replace(/%[A-F\d]{2}/g, (escape) => escape.toLowerCase()),
    ),
  );
  assert.match(output, /password authentication failed/);
});

test('redacts unexpected PostgreSQL connection URLs as a whole', () => {
  const output = redact(
    'Database URL: postgres://different:private@127.0.0.1:5433/nextriva_test',
  );
  assert.ok(!output.includes('different:private'));
  assert.ok(!output.includes('postgres://'));
});

test('redacts entire PostgreSQL URLs before a username matching the scheme', () => {
  const redactPostgresUser = createTestOutputRedactor(
    'postgresql://postgres:synthetic@127.0.0.1:5433/nextriva_test',
  );
  const output = redactPostgresUser(
    'postgresql://different:private@127.0.0.1:5433/nextriva_test',
  );
  assert.ok(!output.includes('different'));
  assert.ok(!output.includes('private'));
  assert.ok(!output.includes('://'));
});

test('redacts JSON-escaped credentials with newline and quote characters', () => {
  const redactEscaped = createTestOutputRedactor(
    'postgresql://audit%0Auser%22quoted:secret%0Aline%22quote@127.0.0.1:5433/nextriva_test',
  );
  const output = redactEscaped(
    JSON.stringify({
      password: 'secret\nline"quote',
      user: 'audit\nuser"quoted',
    }),
  );
  assert.ok(!output.includes('secret'));
  assert.ok(!output.includes('quote'));
  assert.ok(!output.includes('audit'));
});

test('preserves functional test diagnostics without secrets', () => {
  const message =
    'Tests 162 passed (162)\nHTTP 403: operation forbidden\nExit code 1\n';
  assert.equal(redact(message), message);
});

test('redacts credentials split by terminal color controls', () => {
  const coloredUsername = username.replace('audit', '\u001b[31maudit\u001b[0m');
  const output = redact(
    `password authentication failed for user "${coloredUsername}"`,
  );
  assertNoSecrets(output);
  assert.ok(!output.includes('\u001b'));
  assert.ok(!output.includes('audit'));
});

test('sanitizes both child streams without exposing process metadata', () => {
  const payload = JSON.stringify({
    stdout: `Tests 2 passed\n${url}\n`,
    stderr: `auth failed for user "${username}" with ${password}\n`,
  });
  const result = spawnRedactedSync(
    process.execPath,
    [
      '-e',
      `const p = ${payload}; process.stdout.write(p.stdout); process.stderr.write(p.stderr); process.exitCode = 1;`,
    ],
    { env: {}, encoding: 'utf8' },
    redact,
  );
  assert.equal(result.status, 1);
  assertNoSecrets(inspect(result));
  assert.match(result.stdout, /Tests 2 passed/);
  assert.match(result.stderr, /auth failed for user/);
});

test('runs an interactive child asynchronously and redacts secrets split across output chunks', async () => {
  const child = new EventEmitter();
  child.pid = 42001;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const output = { stdout: '', stderr: '' };
  const spawnCalls = [];
  let startedProcessGroupId;
  let settled = false;
  const running = spawnRedactedInteractive(
    'playwright',
    ['test', '--ui'],
    { cwd: '/synthetic/api', env: { NODE_ENV: 'test' } },
    redact,
    {
      spawnProcess: (...args) => {
        spawnCalls.push(args);
        return child;
      },
      signalSource: new EventEmitter(),
      stdout: { write: (value) => (output.stdout += value) },
      stderr: { write: (value) => (output.stderr += value) },
      onStart: (processGroupId) => {
        startedProcessGroupId = processGroupId;
      },
    },
  ).then((result) => {
    settled = true;
    return result;
  });

  assert.equal(settled, false);
  child.emit('spawn');
  assert.equal(spawnCalls[0][0], 'playwright');
  assert.deepEqual(spawnCalls[0][1], ['test', '--ui']);
  assert.equal(spawnCalls[0][2].cwd, '/synthetic/api');
  assert.equal(spawnCalls[0][2].env.NODE_ENV, 'test');
  assert.equal(spawnCalls[0][2].detached, true);
  assert.deepEqual(spawnCalls[0][2].stdio, ['inherit', 'pipe', 'pipe']);
  assert.equal(startedProcessGroupId, 42001);

  child.stdout.write(`UI ready\n${url.slice(0, 17)}`);
  child.stdout.write(`${url.slice(17)}\n`);
  child.stderr.write(`diagnostic ${password}`);
  child.stderr.end();
  child.stdout.end();
  assert.equal(settled, false);
  child.emit('close', 0, null);

  assert.deepEqual(await running, { status: 0, signal: null });
  assert.match(output.stdout, /UI ready/);
  assert.match(output.stdout, /\[REDACTED\]/);
  assert.match(output.stderr, /diagnostic/);
  assertNoSecrets(output.stdout + output.stderr);
});

test('forwards SIGINT to the interactive process group and waits for its close', async () => {
  const child = new EventEmitter();
  child.pid = 42002;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const signalSource = new EventEmitter();
  const forwarded = [];
  let settled = false;
  const running = spawnRedactedInteractive(
    'playwright',
    ['test', '--ui'],
    { env: {} },
    redact,
    {
      spawnProcess: () => child,
      signalSource,
      signalGroup: (pid, signal) => forwarded.push([pid, signal]),
      stdout: { write() {} },
      stderr: { write() {} },
    },
  ).then((result) => {
    settled = true;
    return result;
  });

  signalSource.emit('SIGINT');
  assert.deepEqual(forwarded, [[42002, 'SIGINT']]);
  assert.equal(settled, false);
  child.emit('close', null, 'SIGINT');
  assert.deepEqual(await running, { status: 130, signal: 'SIGINT' });
  assert.equal(signalSource.listenerCount('SIGINT'), 0);
  assert.equal(signalSource.listenerCount('SIGTERM'), 0);
});

test('records setup interruption and removes signal handlers after cleanup', () => {
  const signalSource = new EventEmitter();
  const guard = createInteractiveSetupSignalGuard(signalSource);

  signalSource.emit('SIGINT');
  assert.throws(guard.throwIfInterrupted, {
    message: 'Interactive E2E setup interrupted by SIGINT',
  });
  guard.dispose();
  assert.equal(signalSource.listenerCount('SIGINT'), 0);
  assert.equal(signalSource.listenerCount('SIGTERM'), 0);
});

const uiDatabaseName = 'nextriva_test_i02_1_0123456789abcdef0123456789abcdef';

function temporaryUiSessionDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'nextriva-ui-session-test-'));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fakeAdmin(queries) {
  return {
    async query(sql, parameters = []) {
      queries.push([sql, parameters]);
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ locked: true }] };
      }
      return { rows: [] };
    },
  };
}

test('creates a private ownership marker and records the interactive process group', (t) => {
  const directory = temporaryUiSessionDirectory(t);
  const marker = createTestUiSessionMarker(uiDatabaseName, {
    directory,
    runnerPid: 1234,
  });

  marker.updateProcessGroup(5678);
  const record = JSON.parse(readFileSync(marker.path, 'utf8'));
  assert.equal(record.databaseName, uiDatabaseName);
  assert.equal(record.runnerPid, 1234);
  assert.equal(record.processGroupId, 5678);
  assert.equal(record.sessionId, '0123456789abcdef0123456789abcdef');
  assert.equal(record.version, 1);
  assert.equal(statSync(marker.path).mode & 0o777, 0o600);

  marker.remove();
});

test('does not recover a marker while its runner or process group is alive', async (t) => {
  const directory = temporaryUiSessionDirectory(t);
  const marker = createTestUiSessionMarker(uiDatabaseName, {
    directory,
    runnerPid: 1234,
  });
  marker.updateProcessGroup(5678);
  const queries = [];
  const alive = new Set([1234, 5678]);

  const result = await recoverStaleTestUiSessions(fakeAdmin(queries), {
    directory,
    isProcessActive: (pid) => alive.has(pid),
  });

  assert.equal(result.cleaned, 0);
  assert.equal(queries.length, 0);
  assert.equal(readFileSync(marker.path, 'utf8').length > 0, true);
  marker.remove();
});

test('drops only a stale database recorded in a validated ownership marker', async (t) => {
  const directory = temporaryUiSessionDirectory(t);
  const marker = createTestUiSessionMarker(uiDatabaseName, {
    directory,
    runnerPid: 1234,
  });
  marker.updateProcessGroup(5678);
  marker.close();
  const queries = [];

  const result = await recoverStaleTestUiSessions(fakeAdmin(queries), {
    directory,
    isProcessActive: () => false,
  });

  assert.equal(result.cleaned, 1);
  assert.deepEqual(queries[0], [
    'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
    [uiDatabaseName],
  ]);
  assert.ok(
    queries.some(
      ([sql, parameters]) =>
        sql.includes('pg_terminate_backend') &&
        parameters[0] === uiDatabaseName,
    ),
  );
  assert.ok(
    queries.some(
      ([sql]) => sql === `DROP DATABASE IF EXISTS "${uiDatabaseName}"`,
    ),
  );
  assert.ok(
    queries.some(
      ([sql, parameters]) =>
        sql.includes('pg_advisory_unlock') && parameters[0] === uiDatabaseName,
    ),
  );
  assert.equal(existsSync(marker.path), false);
});

test('ignores malformed and symlinked markers without querying PostgreSQL', async (t) => {
  const directory = temporaryUiSessionDirectory(t);
  const id = 'fedcba9876543210fedcba9876543210';
  const markerPath = join(directory, `${id}.json`);
  writeFileSync(markerPath, '{"databaseName":"nextriva_dev"}', { mode: 0o600 });
  writeFileSync(
    join(directory, 'target'),
    JSON.stringify({
      version: 1,
      sessionId: id,
      databaseName: uiDatabaseName,
      runnerPid: 1234,
      processGroupId: null,
      createdAt: Date.now(),
    }),
    { mode: 0o600 },
  );
  symlinkSync(
    join(directory, 'target'),
    join(directory, '0123456789abcdef0123456789abcdef.json'),
  );
  const queries = [];

  const result = await recoverStaleTestUiSessions(fakeAdmin(queries), {
    directory,
    isProcessActive: () => false,
  });

  assert.deepEqual(result, { cleaned: 0, skipped: 2 });
  assert.equal(queries.length, 0);
  assert.equal(
    readFileSync(markerPath, 'utf8'),
    '{"databaseName":"nextriva_dev"}',
  );
});

test('refuses an unsafe registry directory before reading session data', async (t) => {
  const parent = temporaryUiSessionDirectory(t);
  const directory = join(parent, 'sessions');
  mkdirSync(directory, { mode: 0o755 });
  const queries = [];

  await assert.rejects(
    recoverStaleTestUiSessions(fakeAdmin(queries), {
      directory,
      isProcessActive: () => false,
    }),
    { message: 'Unsafe Playwright UI session registry' },
  );
  assert.equal(queries.length, 0);
});

test('suppresses both partial child streams when its capture buffer is exceeded', () => {
  const prefix = JSON.stringify(password.slice(0, -4));
  const result = spawnRedactedSync(
    process.execPath,
    [
      '-e',
      `process.stdout.write(${prefix}); process.stderr.write("x".repeat(17 * 1024 * 1024));`,
    ],
    { env: {} },
    redact,
  );
  assert.equal(result.error, true);
  assert.ok(result.stdout.length === 0);
  assert.ok(result.stderr.length === 0);
});

test('removes credential-bearing properties, stack and cause from database failures', async () => {
  const original = new Error(
    `password authentication failed for user "${username}"`,
    { cause: new Error(url) },
  );
  original.password = password;
  original.stack += `\n${url}`;
  await assert.rejects(
    withRedactedDatabaseErrors(async () => {
      throw original;
    }, redact),
    (error) => {
      assertNoSecrets(inspect(error, { showHidden: true, depth: 5 }));
      assert.equal(error.cause, undefined);
      assert.match(error.message, /password authentication failed/);
      return true;
    },
  );
});

test('does not inspect arbitrary thrown objects that may contain credentials', async () => {
  await assert.rejects(
    withRedactedDatabaseErrors(async () => {
      throw { password, url };
    }, redact),
    { message: 'Database operation failed' },
  );
});

test('preserves database success results', async () => {
  assert.equal(await withRedactedDatabaseErrors(async () => 42, redact), 42);
});
