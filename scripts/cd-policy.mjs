export const repository = 'xbasets82/Nextriva';
export const requiredJobs = [
  'Calidad estática y build',
  'Unitarias y cobertura',
  'Integración PostgreSQL temporal',
  'E2E Playwright con Chromium',
  'Auditoría pnpm',
  'Calidad, pruebas y build',
];
export const isSha = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isId = (value) => Number.isSafeInteger(value) && value > 0;
export const isImage = (value, service) =>
  typeof value === 'string' &&
  new RegExp(
    `^ghcr\\.io/xbasets82/nextriva-${service}@sha256:[a-f0-9]{64}$`,
  ).test(value);

export function assertDispatch(context) {
  if (
    context.repository !== repository ||
    context.event !== 'workflow_dispatch' ||
    context.ref !== 'refs/heads/main' ||
    !isSha(context.sha)
  )
    throw new Error('Dispatch de main requerido');
}

export function assertCi(context, run, jobs, mainSha) {
  assertDispatch(context);
  if (
    mainSha !== context.sha ||
    !isId(run.id) ||
    run.head_sha !== context.sha ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  )
    throw new Error('CI exacto de main requerido');
  for (const name of requiredJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].head_sha !== context.sha ||
      matches[0].status !== 'completed' ||
      matches[0].conclusion !== 'success'
    )
      throw new Error('CI incompleto');
  }
}

export function assertRequest(request) {
  const keys = [
    'operation',
    'sha',
    'ciRunId',
    'runId',
    'expectedSha',
    'api',
    'web',
  ];
  if (
    !request ||
    Object.keys(request).some((key) => !keys.includes(key)) ||
    !['deploy', 'rollback'].includes(request.operation) ||
    !isSha(request.sha) ||
    !isSha(request.expectedSha) ||
    !isId(request.ciRunId) ||
    !isId(request.runId)
  )
    throw new Error('Petición de despliegue inválida');
  if (
    request.operation === 'deploy'
      ? !isImage(request.api, 'api') || !isImage(request.web, 'web')
      : request.api !== undefined || request.web !== undefined
  )
    throw new Error('Digest no autorizado');
}

export class GitHubHttpError extends Error {
  constructor(status) {
    super('No se pudo verificar GitHub');
    this.status = status;
  }
}

export async function githubJson(path, token, fetchJson = fetch) {
  if (
    !path.startsWith(`/repos/${repository}/`) &&
    !/^\/user\/packages\/container\/nextriva-(api|web)$/.test(path)
  )
    throw new Error('API GitHub no autorizada');
  const response = await fetchJson(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new GitHubHttpError(response.status);
  return response.json();
}

export async function verifyCi(context, runId, token, get = githubJson) {
  assertDispatch(context);
  if (!isId(runId)) throw new Error('CI run inválido');
  const prefix = `/repos/${repository}`;
  const main = await get(`${prefix}/git/ref/heads/main`, token);
  const run = await get(`${prefix}/actions/runs/${runId}`, token);
  const jobs = [];
  for (let page = 1; ; page++) {
    const result = await get(
      `${prefix}/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
      token,
    );
    jobs.push(...result.jobs);
    if (result.jobs.length < 100) break;
    if (page >= 10) throw new Error('CI demasiado grande');
  }
  assertCi(context, run, jobs, main.object?.sha);
  return run;
}
