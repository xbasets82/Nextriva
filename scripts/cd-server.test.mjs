import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as server from './cd-server.mjs';
import { DeploymentFailure } from './cd-deploy.mjs';

test('helper rechaza invocación indebida con diagnóstico JSON sin rutas ni errores crudos', async () => {
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      new URL('./cd-server.mjs', import.meta.url).pathname,
      'invalid',
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.deepEqual(JSON.parse(error.stderr), {
        cdDiagnostic: { phase: 'server-setup', category: 'operation_failed' },
      });
      assert.doesNotMatch(error.stderr, /\/etc\/|Error:|stack|token/);
      return true;
    },
  );
});

test('cleanup fallido emite solo diagnóstico seguro y conserva el fallo primario', async () => {
  assert.equal(typeof server.finishServer, 'function');
  for (const primaryFails of [false, true]) {
    const output = [];
    const errors = [];
    const code = await server.finishServer(
      {
        result: { result: 'deployed', sha: 'a'.repeat(40) },
        failure: primaryFails
          ? new DeploymentFailure('health', 'operation_failed', 'required')
          : undefined,
        dockerDirectory: '/private/runtime',
      },
      {
        remove: async () => {
          throw new Error('private-token /private/runtime');
        },
        stdout: { write: (value) => output.push(value) },
        stderr: { write: (value) => errors.push(value) },
      },
    );
    assert.equal(code, 1);
    assert.equal(output.length, 0);
    assert.deepEqual(JSON.parse(errors.join('')), {
      cdDiagnostic: primaryFails
        ? {
            phase: 'health',
            category: 'operation_failed',
            recovery: 'required',
          }
        : { phase: 'cleanup', category: 'operation_failed' },
    });
    assert.doesNotMatch(
      errors.join(''),
      /private-token|private\/runtime|Error:|stack/,
    );
  }
});
