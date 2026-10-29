import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const sha = 'a'.repeat(40);
const repository = 'xbasets82/Nextriva';
const run = {
  id: 77,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  event: 'push',
  head_sha: sha,
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
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
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
}));

function githubFixture() {
  const requests = [];
  const get = async (path) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha } };
    if (path.endsWith('/actions/runs/77')) return run;
    if (path.includes('/jobs?')) return { jobs };
    throw new Error('unexpected GitHub path');
  };
  return { requests, get };
}

test('dispatch automático convierte solo CI exitoso exacto en workflow_dispatch manual', async () => {
  const { dispatchVerifiedDeployment } = await import('./cd-auto.mjs');
  const fixture = githubFixture();
  const result = await dispatchVerifiedDeployment(
    {
      repository,
      event: 'workflow_run',
      ref: 'refs/heads/main',
    },
    77,
    'token-test',
    {
      get: fixture.get,
      fetchJson: async (url, options) => {
        fixture.requests.push([url, options]);
        return { ok: true, status: 204 };
      },
    },
  );
  assert.deepEqual(result, { result: 'dispatched', sha, ciRunId: 77 });
  assert.equal(fixture.requests.length, 1);
  assert.equal(
    fixture.requests[0][0],
    `https://api.github.com/repos/${repository}/actions/workflows/deploy.yml/dispatches`,
  );
  assert.deepEqual(JSON.parse(fixture.requests[0][1].body), {
    ref: 'main',
    inputs: {
      ci_run_id: '77',
      expected_sha: 'current',
      operation: 'deploy',
    },
  });
});

test('dispatch no crea ejecución si la verificación del CI falla o no es el SHA actual', async () => {
  const { dispatchVerifiedDeployment } = await import('./cd-auto.mjs');
  for (const change of [
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { head_sha: 'b'.repeat(40) },
  ]) {
    const fixture = githubFixture();
    fixture.get = async (path) => {
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha } };
      if (path.endsWith('/actions/runs/77')) return { ...run, ...change };
      if (path.includes('/jobs?')) return { jobs };
      throw new Error('unexpected GitHub path');
    };
    await assert.rejects(
      dispatchVerifiedDeployment(
        { repository, event: 'workflow_run', ref: 'refs/heads/main' },
        77,
        'token-test',
        {
          get: fixture.get,
          fetchJson: async (...args) => {
            fixture.requests.push(args);
            return { ok: true, status: 204 };
          },
        },
      ),
    );
    assert.deepEqual(fixture.requests, []);
  }
});

test('workflow automático solo observa CI completado de main y conserva permisos mínimos', async () => {
  const text = await readFile(
    new URL('../.github/workflows/auto-deploy.yml', import.meta.url),
    'utf8',
  );
  assert.match(text, /workflow_run:/);
  assert.match(text, /workflows: \[.*CI.*\]/);
  assert.match(text, /types: \[completed\]/);
  assert.match(text, /branches: \[main\]/);
  assert.match(text, /workflow_run\.conclusion == 'success'/);
  assert.match(text, /vars\.NEXTRIVA_CD_AUTO_ENABLED == 'true'/);
  assert.match(text, /vars\.NEXTRIVA_CD_MANUAL_ENABLED == 'true'/);
  assert.match(text, /group: nextriva-auto-dispatch/);
  assert.match(text, /cancel-in-progress: false/);
  assert.match(text, /actions: write/);
  assert.match(text, /contents: read/);
  assert.doesNotMatch(text, /packages: write|secrets\.|CD_SSH_KEY/);
  assert.match(text, /node scripts\/cd-auto\.mjs/);
  for (const action of text.matchAll(/uses: (\S+)/g))
    assert.match(action[1], /@[a-f0-9]{40}$/);
});
