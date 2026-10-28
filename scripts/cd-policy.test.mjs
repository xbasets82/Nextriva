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
