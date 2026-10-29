import { readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { githubJson, repository, verifyWorkflowRun } from './cd-policy.mjs';

export async function dispatchVerifiedDeployment(
  context,
  runId,
  token,
  { get = githubJson, fetchJson = fetch } = {},
) {
  const run = await verifyWorkflowRun(context, runId, token, get);
  const response = await fetchJson(
    `https://api.github.com/repos/${repository}/actions/workflows/deploy.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          ci_run_id: String(run.id),
          expected_sha: 'current',
          operation: 'deploy',
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error('No se pudo solicitar el despliegue');
  return { result: 'dispatched', sha: run.head_sha, ciRunId: run.id };
}

export async function runAuto(
  env = process.env,
  { get = githubJson, fetchJson = fetch, read = readFile } = {},
) {
  try {
    if (!env.GH_TOKEN || !env.GITHUB_EVENT_PATH)
      throw new Error('Contexto de Actions requerido');
    const payload = JSON.parse(await read(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await dispatchVerifiedDeployment(
      {
        repository: env.GITHUB_REPOSITORY,
        event: env.GITHUB_EVENT_NAME,
        ref: env.GITHUB_REF,
      },
      payload.workflow_run?.id,
      env.GH_TOKEN,
      { get, fetchJson },
    );
    if (!env.GITHUB_STEP_SUMMARY)
      throw new Error('Resumen de Actions requerido');
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Despliegue solicitado para CI #${result.ciRunId} y commit \`${result.sha}\`. La publicación y el despliegue siguen sujetos a las guardas de \`deploy.yml\`.\n`,
    );
    return 0;
  } catch {
    process.stderr.write(
      'CD automático bloqueado; revisar el workflow sin exponer credenciales.\n',
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runAuto();
