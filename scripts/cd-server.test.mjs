import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as server from './cd-server.mjs';
import { deployRelease, DeploymentFailure } from './cd-deploy.mjs';

async function exerciseServer(
  verificationToken,
  { deploymentFails = false, authorizationFails = false } = {},
) {
  const request = {
    operation: 'deploy',
    sha: 'a'.repeat(40),
    expectedSha: 'b'.repeat(40),
    ciRunId: 1,
    runId: 2,
    api: `ghcr.io/xbasets82/nextriva-api@sha256:${'c'.repeat(64)}`,
    web: `ghcr.io/xbasets82/nextriva-web@sha256:${'d'.repeat(64)}`,
  };
  const config = {
    composeFile: '/operator/compose.yml',
    composeEnv: '/operator/runtime.env',
    stateDirectory: '/private/state',
    databaseId: 'e'.repeat(64),
    databaseVolume: 'nextriva-demo_demo_database',
  };
  const output = [];
  const errors = [];
  const calls = [];
  const code = await server.runServer({
    invocation: {
      getuid: () => 0,
      argv: ['node', 'cd-server.mjs'],
      stdin: [JSON.stringify({ request, verificationToken })],
      stdout: { write: (value) => output.push(value) },
      stderr: { write: (value) => errors.push(value) },
    },
    files: {
      protectedDirectory: async () => {},
      privateFile: async (path) =>
        path === '/etc/nextriva-cd/config.json' ? JSON.stringify(config) : '',
      mkdtemp: async () => {
        calls.push('temporary-directory');
        return '/private/state/.docker-test';
      },
      rm: async () => calls.push('cleanup'),
    },
    runtime: (actualConfig, actualToken, directory) => {
      assert.deepEqual(actualConfig, config);
      assert.equal(actualToken, verificationToken);
      assert.equal(directory, '/private/state/.docker-test');
      calls.push('runtime');
      if (authorizationFails)
        return {
          lock: async () => {
            calls.push('lock');
            return async () => calls.push('unlock');
          },
          readState: async () => {
            calls.push('read-state');
            return {
              version: 1,
              lastRunId: 0,
              current: {
                sha: request.expectedSha,
                api: `sha256:${'c'.repeat(64)}`,
                web: `sha256:${'d'.repeat(64)}`,
              },
            };
          },
          authorize: async () => {
            calls.push('authorize');
            throw new DeploymentFailure('authorize', 'policy_rejected');
          },
        };
      return { marker: 'controlled-runtime' };
    },
    deploy: authorizationFails
      ? deployRelease
      : async (actualRequest, actualRuntime) => {
          assert.deepEqual(actualRequest, request);
          assert.deepEqual(actualRuntime, { marker: 'controlled-runtime' });
          calls.push('deploy');
          if (deploymentFails)
            throw new Error(`sensitive ${verificationToken}`);
          return { result: 'deployed', sha: request.sha };
        },
  });
  return { code, output: output.join(''), errors: errors.join(''), calls };
}

test('helper conserva el flujo existente con credencial sintética alfanumérica', async () => {
  const result = await exerciseServer('synthetic_word_token_1234567890');
  assert.equal(result.code, 0);
  assert.deepEqual(result.calls, [
    'temporary-directory',
    'runtime',
    'deploy',
    'cleanup',
  ]);
  assert.equal(result.errors, '');
  assert.deepEqual(JSON.parse(result.output), {
    result: 'deployed',
    sha: 'a'.repeat(40),
  });
});

test('helper acepta credencial opaca imprimible con guiones sin divulgarla', async () => {
  const token = 'synthetic-secret-marker-with-hyphens-1234567890';
  const result = await exerciseServer(token);
  assert.equal(result.code, 0, result.errors);
  assert.deepEqual(result.calls, [
    'temporary-directory',
    'runtime',
    'deploy',
    'cleanup',
  ]);
  assert.equal(result.errors, '');
  assert.equal((result.output + result.errors).includes(token), false);
});

test('credencial opaca llega al gate real de autorización del despliegue', async () => {
  const token = 'synthetic-secret-marker-with-hyphens-1234567890';
  const result = await exerciseServer(token, { authorizationFails: true });
  assert.equal(result.code, 1);
  assert.deepEqual(result.calls, [
    'temporary-directory',
    'runtime',
    'lock',
    'read-state',
    'authorize',
    'unlock',
    'cleanup',
  ]);
  assert.equal(result.output, '');
  assert.deepEqual(JSON.parse(result.errors), {
    cdDiagnostic: { phase: 'authorize', category: 'policy_rejected' },
  });
  assert.equal(result.errors.includes(token), false);
});

test('helper rechaza credencial con salto de línea final antes de crear runtime', async () => {
  const token = 'synthetic-secret-marker-1234567890\n';
  const result = await exerciseServer(token);
  assert.equal(result.code, 1);
  assert.deepEqual(result.calls, []);
  assert.equal(result.output, '');
  assert.deepEqual(JSON.parse(result.errors), {
    cdDiagnostic: { phase: 'server-setup', category: 'operation_failed' },
  });
  assert.equal(result.errors.includes('synthetic-secret-marker'), false);
});

test('helper conserva límites y rechaza tipos inválidos, espacios y controles antes de efectos', async () => {
  const invalidTokens = [
    undefined,
    null,
    123,
    '',
    'a'.repeat(19),
    'a'.repeat(4097),
    'synthetic-secret-marker-é-1234567890',
    ...Array.from(
      { length: 33 },
      (_, code) =>
        `synthetic-secret-marker${String.fromCharCode(code)}1234567890`,
    ),
    `synthetic-secret-marker${String.fromCharCode(127)}1234567890`,
  ];
  for (const token of invalidTokens) {
    const result = await exerciseServer(token);
    assert.equal(result.code, 1);
    assert.deepEqual(result.calls, []);
    assert.equal(result.output, '');
    assert.deepEqual(JSON.parse(result.errors), {
      cdDiagnostic: { phase: 'server-setup', category: 'operation_failed' },
    });
    assert.equal(result.errors.includes('synthetic-secret-marker'), false);
  }
});

test('helper admite longitudes extremas y puntuación ASCII opaca', async () => {
  for (const token of [
    'x'.repeat(20),
    'y'.repeat(4096),
    Array.from({ length: 94 }, (_, index) =>
      String.fromCharCode(index + 33),
    ).join(''),
  ]) {
    const result = await exerciseServer(token);
    assert.equal(result.code, 0, result.errors);
    assert.equal(result.calls.includes('deploy'), true);
    assert.equal((result.output + result.errors).includes(token), false);
  }
});

test('helper no divulga la credencial opaca si falla el despliegue', async () => {
  const token = 'synthetic-secret-marker-with-hyphens-1234567890';
  const result = await exerciseServer(token, { deploymentFails: true });
  assert.equal(result.code, 1);
  assert.deepEqual(result.calls, [
    'temporary-directory',
    'runtime',
    'deploy',
    'cleanup',
  ]);
  assert.equal(result.output, '');
  assert.deepEqual(JSON.parse(result.errors), {
    cdDiagnostic: { phase: 'server-setup', category: 'operation_failed' },
  });
  assert.equal(result.errors.includes(token), false);
  assert.equal(result.errors.includes('sensitive'), false);
});

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
