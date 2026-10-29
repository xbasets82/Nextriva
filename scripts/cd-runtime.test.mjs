import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  writeFile,
  symlink,
  chmod,
  rm,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertMigrations,
  privateFile,
  acquireLock,
  composeArguments,
  createRuntime,
} from './cd-runtime.mjs';

test('checksums exactos; bloquea pendientes, fallidas, revertidas o modificadas', () => {
  const image = [{ name: '20261001000000_initial', checksum: 'a'.repeat(64) }];
  const rows = [{ ...image[0], finished: true, rolledBack: false }];
  assert.doesNotThrow(() => assertMigrations(image, rows));
  for (const wrong of [
    [],
    [{ ...rows[0], finished: false }],
    [{ ...rows[0], rolledBack: true }],
    [{ ...rows[0], checksum: 'b'.repeat(64) }],
    [...rows, rows[0]],
  ]) {
    assert.throws(() => assertMigrations(image, wrong));
  }
});

test('archivos de operador rechazan symlinks y permisos escribibles por terceros', async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'nextriva-cd-test-')),
  );
  try {
    const file = join(directory, 'config.json');
    const link = join(directory, 'link');
    await writeFile(file, '{}', { mode: 0o600 });
    assert.equal(await privateFile(file, process.getuid()), '{}');
    await symlink(file, link);
    await assert.rejects(privateFile(link, process.getuid()));
    await chmod(file, 0o666);
    await assert.rejects(privateFile(file, process.getuid()));
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('bloqueo real local excluye otra ejecución sin sleeps y se libera', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-lock-'));
  try {
    const release = await acquireLock(directory);
    await assert.rejects(acquireLock(directory));
    await release();
    await (
      await acquireLock(directory)
    )();
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('único comando de activación actualiza api/web sin DB, build ni dependencias', () => {
  const args = composeArguments(
    {
      composeFile: '/etc/nextriva-cd/compose.yaml',
      composeEnv: '/etc/nextriva-cd/compose.env',
    },
    '/var/lib/nextriva-cd/images.json',
  );
  assert.deepEqual(args, [
    'compose',
    '--project-name',
    'nextriva-demo',
    '--env-file',
    '/etc/nextriva-cd/compose.env',
    '-f',
    '/etc/nextriva-cd/compose.yaml',
    '-f',
    '/var/lib/nextriva-cd/images.json',
    'up',
    '-d',
    '--no-deps',
    '--no-build',
    '--pull',
    'never',
    '--wait',
    '--wait-timeout',
    '90',
    'api',
    'web',
  ]);
});

test('fallos Docker se clasifican sin conservar stderr, argumentos ni credenciales', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-runtime-'));
  try {
    for (const [code, stderr, category] of [
      [1, 'unauthorized token=private-secret', 'registry_permission_denied'],
      ['ETIMEDOUT', 'private-secret', 'operation_timeout'],
      ['ENOENT', 'private-secret', 'tool_unavailable'],
      [1, 'no space left on device private-secret', 'storage_exhausted'],
      [1, 'TLS handshake timeout private-secret', 'network_unavailable'],
      [1, 'private-secret /etc/runtime', 'external_command_failed'],
    ]) {
      const runtime = createRuntime(
        { stateDirectory: directory },
        'private-token',
        directory,
        {
          execCommand(_file, _args, _options, callback) {
            queueMicrotask(() =>
              callback(
                Object.assign(new Error('private-command'), { code }),
                '',
                stderr,
              ),
            );
            return { stdin: { on() {}, end() {} } };
          },
        },
      );
      await assert.rejects(
        runtime.pull({ api: 'image', web: 'image' }),
        (error) => {
          assert.equal(error.phase, 'registry-login');
          assert.equal(error.category, category);
          assert.doesNotMatch(JSON.stringify(error), /private-|\/etc\/runtime/);
          assert.doesNotMatch(error.message, /private-|\/etc\/runtime/);
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
