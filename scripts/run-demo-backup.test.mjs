import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDemoBackup } from './run-demo-backup.mjs';

test('rechaza configuración inválida antes de invocar adaptadores', async () => {
  for (const stateDirectory of [
    undefined,
    '',
    'relative/state',
    '/var/lib/../state',
  ]) {
    const output = [];
    let invoked = false;
    const result = await runDemoBackup({
      environment: { NEXTRIVA_BACKUP_STATE_DIRECTORY: stateDirectory },
      createDump: () => {
        invoked = true;
      },
      createTransport: () => {
        invoked = true;
      },
      stdout: { write: (text) => output.push(text) },
      stderr: { write: (text) => output.push(text) },
    });
    assert.equal(result, 1);
    assert.equal(invoked, false);
    assert.deepEqual(output, ['Demo backup failed\n']);
  }
});

test('rechaza rutas Proton inválidas sin iniciar el dump', async () => {
  for (const configuration of [
    {},
    {
      executable: 'proton-drive',
      remoteDirectory: '/my-files/Nextriva-Backups',
    },
    {
      executable: '/usr/local/bin/proton-drive',
      remoteDirectory: '/my-files/../other',
    },
  ]) {
    const output = [];
    let dumped = false;
    const result = await runDemoBackup({
      environment: {
        NEXTRIVA_BACKUP_STATE_DIRECTORY: '/var/lib/nextriva-backup',
        NEXTRIVA_PROTON_EXECUTABLE: configuration.executable,
        NEXTRIVA_PROTON_REMOTE_DIRECTORY: configuration.remoteDirectory,
      },
      createDump: () => {
        dumped = true;
      },
      stdout: { write: (text) => output.push(text) },
      stderr: { write: (text) => output.push(text) },
    });
    assert.equal(result, 1);
    assert.equal(dumped, false);
    assert.deepEqual(output, ['Demo backup failed\n']);
  }
});

test('compone adaptadores y espera la verificación sin activar retirada', async () => {
  const dump = async () => {};
  const transport = {};
  const calls = [];
  const output = [];
  const result = await runDemoBackup({
    environment: {
      NEXTRIVA_BACKUP_STATE_DIRECTORY: '/var/lib/nextriva-backup',
      NEXTRIVA_PROTON_EXECUTABLE: '/usr/local/bin/proton-drive',
      NEXTRIVA_PROTON_REMOTE_DIRECTORY: '/my-files/Nextriva-Backups',
    },
    createDump: () => {
      calls.push('dump');
      return dump;
    },
    createTransport: (configuration) => {
      calls.push(configuration);
      return transport;
    },
    backup: async (options) => {
      assert.deepEqual(options, {
        stateDirectory: '/var/lib/nextriva-backup',
        dump,
        transport,
        prune: false,
      });
      await Promise.resolve();
      calls.push('verified');
      return { verified: true, sha256: 'private-hash', name: 'private-name' };
    },
    stdout: { write: (text) => output.push(text) },
    stderr: { write: (text) => output.push(text) },
  });
  assert.equal(result, 0);
  assert.deepEqual(calls, [
    {
      executable: '/usr/local/bin/proton-drive',
      remoteDirectory: '/my-files/Nextriva-Backups',
    },
    'dump',
    'verified',
  ]);
  assert.deepEqual(output, ['Demo backup verified\n']);
});

test('oculta errores de adaptador y de ejecución y devuelve fallo', async () => {
  for (const phase of ['transport', 'dump', 'backup', 'unverified']) {
    const output = [];
    const fail = () => {
      throw new Error('synthetic-private-error');
    };
    const result = await runDemoBackup({
      environment: {
        NEXTRIVA_BACKUP_STATE_DIRECTORY: '/var/lib/nextriva-backup',
      },
      createTransport: phase === 'transport' ? fail : () => ({}),
      createDump: phase === 'dump' ? fail : () => async () => {},
      backup: phase === 'backup' ? fail : async () => ({ verified: false }),
      stdout: { write: (text) => output.push(text) },
      stderr: { write: (text) => output.push(text) },
    });
    assert.equal(result, 1);
    assert.deepEqual(output, ['Demo backup failed\n']);
  }
});

test('el comando sin configuración sale con código 1 y sin detalles privados', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./run-demo-backup.mjs', import.meta.url))],
    {
      env: { PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Demo backup failed\n');
});
