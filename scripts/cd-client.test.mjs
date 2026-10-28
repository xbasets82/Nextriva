import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('SSH exige clave de host preestablecida y usuario dedicado sin aceptar hosts', async () => {
  const { sshArguments } = await import('./cd-client.mjs');
  const args = sshArguments('/operator/key', '/operator/known_hosts');
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('BatchMode=yes'));
  assert.equal(args.at(-1), 'nextriva-deploy@151.80.152.130');
  assert.equal(
    args.some((entry) => entry.includes('StrictHostKeyChecking=no')),
    false,
  );
});

test('workflow solo manual, depende de gate/publish y requiere habilitación explícita', async () => {
  const text = await readFile(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8',
  );
  assert.match(text, /workflow_dispatch:/);
  for (const line of text.split('\n'))
    assert.doesNotMatch(line.trim(), /^(?:push|pull_request|workflow_run):/);
  assert.match(text, /NEXTRIVA_CD_MANUAL_ENABLED == 'true'/);
  assert.match(text, /cancel-in-progress: false/);
  assert.match(text, /needs: \[gate, publish\]/);
  assert.match(text, /refs\/heads\/main/);
  assert.doesNotMatch(text, /ssh-keyscan|StrictHostKeyChecking=no/);
  for (const action of text.matchAll(/uses: (\S+)/g))
    assert.match(action[1], /@[a-f0-9]{40}$/);
});
