import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDispatch,
  assertRequest,
  githubJson,
  GitHubHttpError,
  isImage,
  repository,
  verifyCi,
} from './cd-policy.mjs';

const genericFailure =
  'CD bloqueado o fallido; revisar condiciones y configuración sin publicar secretos.';
const publishCategories = new Set([
  'github_request_failed',
  'registry_permission_denied',
  'runner_storage_exhausted',
  'network_unavailable',
  'operation_timeout',
  'tool_unavailable',
  'invalid_image_reference',
  'package_policy_rejected',
  'digest_output_invalid',
  'digest_missing',
  'external_command_failed',
  'operation_failed',
]);
const publishStages = new Set([
  'verify-package-api',
  'verify-package-web',
  'docker-login',
  'build-api',
  'build-web',
  'push-api',
  'push-web',
  'digest-api',
  'digest-web',
  'output-api',
  'output-web',
]);

function isPublishCategory(category) {
  return (
    publishCategories.has(category) || /^github_http_[45]\d{2}$/.test(category)
  );
}

function isExecFileTimeout(error) {
  return error?.code === null && error?.killed && error?.signal === 'SIGTERM';
}

function classifyExecFileFailure(error, stderr) {
  if (isExecFileTimeout(error)) return 'operation_timeout';
  return classifyPublishFailure({
    code: error.code,
    killed: error.killed,
    signal: error.signal,
    stderr,
  });
}

export class PublishFailure extends Error {
  constructor(stage, category) {
    if (!publishStages.has(stage) || !isPublishCategory(category))
      throw new Error('Etapa o categoría CD no permitida');
    super(`CD publicación fallida: etapa=${stage} categoría=${category}`);
    this.name = 'PublishFailure';
    this.stage = stage;
    this.category = category;
  }
}

function classifyPublishFailure(error) {
  if (
    error instanceof GitHubHttpError &&
    error.status >= 400 &&
    error.status < 600
  )
    return `github_http_${error.status}`;
  if (publishCategories.has(error?.safeCategory)) return error.safeCategory;
  if (error?.message === 'Paquete privado vinculado requerido')
    return 'package_policy_rejected';
  if (error?.message === 'Digest publicado ausente') return 'digest_missing';
  if (error?.code === 'ENOENT') return 'tool_unavailable';
  if (error?.code === 'ENOSPC') return 'runner_storage_exhausted';
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ESOCKETTIMEDOUT')
    return 'operation_timeout';

  const output = `${error?.stderr ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (
    /unauthorized|authentication required|insufficient_scope|permission denied|requested access.*denied/.test(
      output,
    )
  )
    return 'registry_permission_denied';
  if (/no space left|out of disk|enospc/.test(output))
    return 'runner_storage_exhausted';
  if (
    /i\/o timeout|connection reset|network is unreachable|temporary failure|could not resolve|tls handshake|x509/.test(
      output,
    )
  )
    return 'network_unavailable';
  if (/invalid reference format|invalid image|invalid tag/.test(output))
    return 'invalid_image_reference';
  if (/timed out|timeout/.test(output)) return 'operation_timeout';
  if (error instanceof GitHubHttpError) return 'github_request_failed';
  if (error?.stderr !== undefined || typeof error?.code === 'number')
    return 'external_command_failed';
  return 'operation_failed';
}

async function publishStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PublishFailure) throw error;
    throw new PublishFailure(stage, classifyPublishFailure(error));
  }
}

export function formatClientFailure(error) {
  return error instanceof PublishFailure ? error.message : genericFailure;
}

export function sshArguments(key, knownHosts) {
  return [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile=${knownHosts}`,
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'PasswordAuthentication=no',
    '-o',
    'KbdInteractiveAuthentication=no',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'ConnectTimeout=15',
    '-i',
    key,
    'nextriva-deploy@151.80.152.130',
  ];
}

export function run(
  executable,
  args,
  { input = '', env = process.env, timeout = 900000 } = {},
) {
  return new Promise((done, fail) => {
    const child = execFile(
      executable,
      args,
      { env, timeout, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return done(stdout.trim());
        const failure = new Error('External command failed');
        failure.code = error.code;
        failure.killed = error.killed;
        failure.signal = error.signal;
        failure.safeCategory = classifyExecFileFailure(error, stderr);
        fail(failure);
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function output(name, value) {
  if (!process.env.GITHUB_OUTPUT)
    throw new Error('Salida de Actions requerida');
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function verifyPackage(service, token, get, allowMissing = false) {
  let info;
  try {
    info = await get(
      `/users/xbasets82/packages/container/nextriva-${service}`,
      token,
    );
  } catch (error) {
    if (
      allowMissing &&
      error instanceof GitHubHttpError &&
      error.status === 404
    )
      return;
    throw error;
  }
  if (
    info?.visibility !== 'private' ||
    info.repository?.full_name !== repository
  )
    throw new Error('Paquete privado vinculado requerido');
}

export async function publish(
  context,
  token,
  { get = githubJson, runCommand = run, writeOutput = output } = {},
) {
  for (const service of ['api', 'web'])
    await publishStage(`verify-package-${service}`, () =>
      verifyPackage(service, token, get, true),
    );
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-registry-'));
  const env = { ...process.env, DOCKER_CONFIG: directory };
  const published = [];
  try {
    await publishStage('docker-login', () =>
      runCommand(
        'docker',
        ['login', 'ghcr.io', '--username', 'xbasets82', '--password-stdin'],
        { input: token, env },
      ),
    );
    for (const service of ['api', 'web']) {
      const image = `ghcr.io/xbasets82/nextriva-${service}`;
      const tag = `${image}:${context.sha}`;
      const args = [
        'build',
        '--platform',
        'linux/amd64',
        '--file',
        `deploy/Dockerfile.${service}`,
        '--label',
        `org.opencontainers.image.revision=${context.sha}`,
        '--label',
        `org.opencontainers.image.source=https://github.com/${repository}`,
        '--tag',
        tag,
      ];
      if (service === 'web')
        args.push(
          '--build-arg',
          `NEXTRIVA_BUILD_SHA=${context.sha}`,
          '--build-arg',
          `GEOAPIFY_PUBLIC_VALUE=${process.env.GEOAPIFY_PUBLIC_VALUE ?? ''}`,
        );
      await publishStage(`build-${service}`, () =>
        runCommand('docker', [...args, '.'], { env }),
      );
      await publishStage(`push-${service}`, () =>
        runCommand('docker', ['push', tag], { env }),
      );
      await publishStage(`verify-package-${service}`, () =>
        verifyPackage(service, token, get),
      );
      const digest = await publishStage(`digest-${service}`, async () => {
        let digests;
        try {
          digests = JSON.parse(
            await runCommand(
              'docker',
              ['image', 'inspect', '--format', '{{json .RepoDigests}}', tag],
              { env },
            ),
          );
        } catch (error) {
          if (error instanceof SyntaxError)
            throw new PublishFailure(
              `digest-${service}`,
              'digest_output_invalid',
            );
          throw error;
        }
        const image = digests.find((value) => isImage(value, service));
        if (!image) throw new Error('Digest publicado ausente');
        return image;
      });
      published.push([service, digest]);
    }
    for (const [service, digest] of published)
      await publishStage(`output-${service}`, () =>
        writeOutput(service, digest),
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function deploy(context, token) {
  const request = {
    operation: process.env.CD_OPERATION,
    sha: context.sha,
    ciRunId: Number(process.env.CD_CI_RUN_ID),
    runId: Number(process.env.GITHUB_RUN_ID),
    expectedSha: process.env.CD_EXPECTED_SHA,
  };
  if (request.operation === 'deploy')
    Object.assign(request, {
      api: process.env.CD_API_IMAGE,
      web: process.env.CD_WEB_IMAGE,
    });
  assertRequest(request);
  if (
    !process.env.CD_SSH_KEY ||
    !/^151\.80\.152\.130 ssh-ed25519 [A-Za-z0-9+/=]+\s*$/.test(
      process.env.CD_KNOWN_HOSTS ?? '',
    )
  )
    throw new Error('Identidad SSH no configurada');
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-ssh-'));
  try {
    const key = join(directory, 'key');
    const known = join(directory, 'known_hosts');
    await writeFile(key, process.env.CD_SSH_KEY + '\n', { mode: 0o600 });
    await writeFile(known, process.env.CD_KNOWN_HOSTS + '\n', { mode: 0o600 });
    const response = JSON.parse(
      await run('ssh', sshArguments(key, known), {
        input: JSON.stringify({ request, verificationToken: token }),
        timeout: 600000,
      }),
    );
    if (
      !['deployed', 'rolled_back', 'already_deployed'].includes(
        response.result,
      ) ||
      !/^[a-f0-9]{40}$/.test(response.sha)
    )
      throw new Error('Resultado remoto inválido');
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Publicación: ${response.result}\n\nCommit en ejecución: \`${response.sha}\`\n\nWorkflow: ${process.env.GITHUB_RUN_ID}\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runClient() {
  try {
    const context = {
      repository: process.env.GITHUB_REPOSITORY,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    };
    assertDispatch(context);
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('Token requerido');
    await verifyCi(context, Number(process.env.CD_CI_RUN_ID), token);
    const operation = process.argv[2];
    if (operation === 'gate') await output('sha', context.sha);
    else if (operation === 'publish') await publish(context, token);
    else if (operation === 'deploy') await deploy(context, token);
    else throw new Error('Operación no admitida');
    return 0;
  } catch (error) {
    process.stderr.write(`${formatClientFailure(error)}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runClient();
