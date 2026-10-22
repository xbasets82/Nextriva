import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import {
  createTestOutputRedactor,
  spawnRedactedSync,
  withRedactedDatabaseErrors,
} from './test-output.mjs';

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
