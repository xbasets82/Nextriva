import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDispatch,
  assertRequest,
  githubJson,
  isImage,
  repository,
  verifyCi,
} from './cd-policy.mjs';

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

function run(
  executable,
  args,
  { input = '', env = process.env, timeout = 900000 } = {},
) {
  return new Promise((done, fail) => {
    const child = execFile(
      executable,
      args,
      { env, timeout, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) =>
        error
          ? fail(new Error('Operación de publicación fallida'))
          : done(stdout.trim()),
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

async function publish(context, token) {
  for (const service of ['api', 'web']) {
    const info = await githubJson(
      `/users/xbasets82/packages/container/nextriva-${service}`,
      token,
    );
    if (
      info.visibility !== 'private' ||
      info.repository?.full_name !== repository
    )
      throw new Error('Paquete privado vinculado requerido');
  }
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-registry-'));
  const env = { ...process.env, DOCKER_CONFIG: directory };
  try {
    await run(
      'docker',
      ['login', 'ghcr.io', '--username', 'xbasets82', '--password-stdin'],
      { input: token, env },
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
      await run('docker', [...args, '.'], { env });
      await run('docker', ['push', tag], { env });
      const digests = JSON.parse(
        await run(
          'docker',
          ['image', 'inspect', '--format', '{{json .RepoDigests}}', tag],
          { env },
        ),
      );
      const digest = digests.find((value) => isImage(value, service));
      if (!digest) throw new Error('Digest publicado ausente');
      await output(service, digest);
    }
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
  } catch {
    process.stderr.write(
      'CD bloqueado o fallido; revisar condiciones y configuración sin publicar secretos.\n',
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runClient();
