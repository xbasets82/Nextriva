import assert from 'node:assert/strict';
import { test } from 'node:test';

const sha = 'a'.repeat(40);
const repository = 'xbasets82/Nextriva';
const context = {
  repository,
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  sha,
};
const run = {
  id: 77,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  path: '.github/workflows/ci.yml',
  repository: { full_name: repository },
  head_repository: { full_name: repository },
};
const names = [
  'Calidad estática y build',
  'Unitarias y cobertura',
  'Integración PostgreSQL temporal',
  'E2E Playwright con Chromium',
  'Auditoría pnpm',
  'Calidad, pruebas y build',
];
const jobs = names.map((name) => ({
  name,
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
}));

test('solo admite dispatch de main del repositorio fijo', async () => {
  const { assertDispatch } = await import('./cd-policy.mjs');
  assert.doesNotThrow(() => assertDispatch(context));
  for (const change of [
    { event: 'pull_request' },
    { repository: 'attacker/fork' },
    { ref: 'refs/heads/feature' },
    { sha: 'main;id' },
  ]) {
    assert.throws(() => assertDispatch({ ...context, ...change }));
  }
});

test('exige CI del SHA exacto y todos sus jobs, rechaza fork, skips y fallos', async () => {
  const { assertCi } = await import('./cd-policy.mjs');
  assert.doesNotThrow(() => assertCi(context, run, jobs, sha));
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'attacker/fork' } },
  ]) {
    assert.throws(() => assertCi(context, { ...run, ...change }, jobs, sha));
  }
  assert.throws(() => assertCi(context, run, jobs.slice(1), sha));
  assert.throws(() =>
    assertCi(
      context,
      run,
      [{ ...jobs[0], conclusion: 'skipped' }, ...jobs.slice(1)],
      sha,
    ),
  );
  assert.throws(() => assertCi(context, run, jobs, 'b'.repeat(40)));
});

test('valida request acotada, digests inmutables, operación y versión esperada', async () => {
  const { assertRequest } = await import('./cd-policy.mjs');
  const request = {
    operation: 'deploy',
    sha,
    ciRunId: 77,
    runId: 80,
    expectedSha: 'b'.repeat(40),
    api: `ghcr.io/xbasets82/nextriva-api@sha256:${'c'.repeat(64)}`,
    web: `ghcr.io/xbasets82/nextriva-web@sha256:${'d'.repeat(64)}`,
  };
  assert.doesNotThrow(() => assertRequest(request));
  assert.doesNotThrow(() =>
    assertRequest({ ...request, expectedSha: 'current' }),
  );
  assert.throws(() =>
    assertRequest({
      ...request,
      operation: 'rollback',
      expectedSha: 'current',
    }),
  );
  for (const change of [
    { api: 'nextriva-api:latest' },
    { web: 'ghcr.io/attacker/web@sha256:' + 'd'.repeat(64) },
    { operation: 'seed' },
    { command: 'id' },
    { runId: 0 },
    { expectedSha: 'main' },
  ]) {
    assert.throws(() => assertRequest({ ...request, ...change }));
  }
});

test('los errores HTTP de GitHub conservan solo el estado para distinguir un 404', async () => {
  const { githubJson } = await import('./cd-policy.mjs');
  for (const status of [404, 401, 403, 500]) {
    await assert.rejects(
      githubJson(
        '/user/packages/container/nextriva-api',
        'secret',
        async () => ({ ok: false, status }),
      ),
      (error) => error.status === status && !error.message.includes('secret'),
    );
  }
});

test('solo permite metadatos de los dos paquetes mediante el usuario autenticado', async () => {
  const { githubJson } = await import('./cd-policy.mjs');
  for (const service of ['api', 'web']) {
    const info = { visibility: 'private' };
    const requests = [];
    const result = await githubJson(
      `/user/packages/container/nextriva-${service}`,
      'secret',
      async (url) => {
        requests.push(url);
        return { ok: true, json: async () => info };
      },
    );
    assert.equal(result, info);
    assert.deepEqual(requests, [
      `https://api.github.com/user/packages/container/nextriva-${service}`,
    ]);
  }
});

test('rechaza el endpoint público anterior y paquetes ajenos antes de consultar GitHub', async () => {
  const { githubJson } = await import('./cd-policy.mjs');
  const requests = [];
  for (const path of [
    '/users/xbasets82/packages/container/nextriva-api',
    '/users/xbasets82/packages/container/nextriva-web',
    '/user/packages/container/other',
    '/user/packages/container/nextriva-api-extra',
    '/user/packages/npm/nextriva-api',
    '/user/packages/container/nextriva-api?other=1',
    '/user/packages/container/nextriva-web/versions',
  ]) {
    await assert.rejects(
      githubJson(path, 'secret', async (url) => {
        requests.push(url);
        return { ok: true, json: async () => ({}) };
      }),
      { message: 'API GitHub no autorizada' },
    );
  }
  assert.deepEqual(requests, []);
});
