import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  lstat,
  realpath,
  open,
  mkdir,
  rename,
  rm,
  appendFile,
  statfs,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  assertRelease,
  DeploymentFailure,
  deploymentStage,
} from './cd-deploy.mjs';
import { githubJson, repository, verifyCi } from './cd-policy.mjs';

export function assertMigrations(image, rows) {
  const valid = (entry) =>
    /^\d{14}_[a-z0-9_]+$/.test(entry.name) &&
    /^[a-f0-9]{64}$/.test(entry.checksum);
  if (
    !Array.isArray(image) ||
    !image.length ||
    !Array.isArray(rows) ||
    image.length !== rows.length ||
    !image.every(valid) ||
    new Set(image.map((entry) => entry.name)).size !== image.length ||
    !rows.every(
      (row) => valid(row) && row.finished === true && row.rolledBack === false,
    )
  )
    throw new Error('Migraciones pendientes o incompatibles');
  const normalize = (entries) =>
    entries.map(({ name, checksum }) => `${name}:${checksum}`).sort();
  if (JSON.stringify(normalize(image)) !== JSON.stringify(normalize(rows)))
    throw new Error('Migraciones pendientes o incompatibles');
}

export async function privateFile(path, owner = 0) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== owner ||
    info.mode & 0o022 ||
    (await realpath(path)) !== resolve(path)
  )
    throw new Error('Archivo de operador inseguro');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

export async function acquireLock(directory) {
  const path = join(directory, '.deployment-lock');
  await mkdir(path, { mode: 0o700 });
  return async () => rm(path, { recursive: true });
}

export function composeArguments(config, override) {
  return [
    'compose',
    '--project-name',
    'nextriva-demo',
    '--env-file',
    config.composeEnv,
    '-f',
    config.composeFile,
    '-f',
    override,
    'up',
    '-d',
    '--no-deps',
    '--no-build',
    '--pull',
    'never',
    '--wait',
    '--wait-timeout',
    '90',
    'api',
    'web',
  ];
}

export async function protectedDirectory(path) {
  if (
    !path.startsWith('/') ||
    path !== resolve(path) ||
    path !== (await realpath(path))
  )
    throw new Error('Ruta de operador insegura');
  for (let current = path; ; current = dirname(current)) {
    const info = await lstat(current);
    if (!info.isDirectory() || info.uid !== 0 || info.mode & 0o022)
      throw new Error('Directorio de operador inseguro');
    if (current === '/') break;
  }
}

export async function atomicJson(path, value) {
  const temporary = `${path}.partial`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(value) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

const manifestCode =
  "const fs=require('fs'),p=require('path'),c=require('crypto');const d='/app/prisma/migrations';process.stdout.write(JSON.stringify(fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>({name:x.name,checksum:c.createHash('sha256').update(fs.readFileSync(p.join(d,x.name,'migration.sql'))).digest('hex')}))))";
const migrationSql =
  "SELECT COALESCE(json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL)),'[]'::json) FROM public._prisma_migrations";
const databaseQuery = `test "$POSTGRES_DB" = nextriva_demo; test "$POSTGRES_USER" = postgres; IFS= read -r PGPASSWORD < "$POSTGRES_PASSWORD_FILE" || test -n "$PGPASSWORD"; export PGPASSWORD; exec psql --no-password --host=127.0.0.1 --username=postgres --dbname=nextriva_demo -At -v ON_ERROR_STOP=1 -c "${migrationSql}"`;

function dockerFailureCategory(error, stderr) {
  if (error?.code === 'ENOENT') return 'tool_unavailable';
  if (error?.code === 'ENOSPC') return 'storage_exhausted';
  if (
    error?.code === 'ETIMEDOUT' ||
    (error?.killed && error?.signal === 'SIGTERM')
  )
    return 'operation_timeout';
  const output = typeof stderr === 'string' ? stderr.toLowerCase() : '';
  if (
    /unauthorized|authentication required|insufficient_scope|permission denied|requested access.*denied/.test(
      output,
    )
  )
    return 'registry_permission_denied';
  if (/no space left|out of disk|enospc/.test(output))
    return 'storage_exhausted';
  if (
    /i\/o timeout|connection reset|network is unreachable|temporary failure|could not resolve|tls handshake|x509/.test(
      output,
    )
  )
    return 'network_unavailable';
  return 'external_command_failed';
}

export function createRuntime(
  config,
  token,
  dockerDirectory,
  { execCommand = execFile } = {},
) {
  const environment = {
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    HOME: '/root',
    DOCKER_CONFIG: dockerDirectory,
  };
  const execute = (args, options = {}) =>
    new Promise((done, fail) => {
      try {
        const child = execCommand(
          '/usr/bin/docker',
          args,
          { env: environment, timeout: 180000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) =>
            error
              ? fail(
                  new DeploymentFailure(
                    options.phase ?? 'docker-command',
                    dockerFailureCategory(error, stderr),
                  ),
                )
              : done(stdout.trim()),
        );
        child.stdin.on('error', () => {});
        child.stdin.end(options.input ?? '');
      } catch (error) {
        fail(
          new DeploymentFailure(
            options.phase ?? 'docker-command',
            dockerFailureCategory(error),
          ),
        );
      }
    });
  const container = async (service) => {
    const id = await execute([
      'ps',
      '--filter',
      'label=com.docker.compose.project=nextriva-demo',
      '--filter',
      `label=com.docker.compose.service=${service}`,
      '--filter',
      'label=com.docker.compose.oneoff=False',
      '--format',
      '{{.ID}}',
      '--no-trunc',
    ]);
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error('Servicio único no encontrado');
    return id;
  };
  const details = async (id) =>
    JSON.parse(
      await execute([
        'inspect',
        '--format',
        '{"image":{{json .Image}},"status":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"mounts":{{json .Mounts}},"ports":{{json .HostConfig.PortBindings}}}',
        id,
      ]),
    );
  const imageId = (image) =>
    execute(['image', 'inspect', '--format', '{{.Id}}', image], {
      phase: 'check-image',
    });
  const inventory = async () => {
    const id = await container('postgres');
    const info = await details(id);
    const mounts = info.mounts.filter(
      (entry) =>
        entry.Type === 'volume' && entry.Destination === '/var/lib/postgresql',
    );
    if (
      id !== config.databaseId ||
      info.status !== 'running' ||
      info.health !== 'healthy' ||
      mounts.length !== 1 ||
      mounts[0].Name !== config.databaseVolume ||
      Object.values(info.ports ?? {}).some((value) => value?.length)
    )
      throw new DeploymentFailure('inventory', 'database_identity_mismatch');
    return { databaseId: id, volume: mounts[0].Name };
  };
  const manifest = async (image) =>
    JSON.parse(
      await execute(
        [
          'run',
          '--rm',
          '--network',
          'none',
          '--read-only',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges:true',
          '--entrypoint',
          'node',
          image,
          '-e',
          manifestCode,
        ],
        { phase: 'check-schema' },
      ),
    );
  const compatible = async (release) => {
    assertRelease(release);
    const id = await container('postgres');
    const rows = JSON.parse(
      await execute(['exec', id, 'sh', '-ec', databaseQuery], {
        phase: 'check-schema',
      }),
    );
    await deploymentStage(
      'check-schema',
      async () => assertMigrations(await manifest(release.api), rows),
      'schema_incompatible',
    );
  };
  const get = async (path) => githubJson(path, token);
  const authorize = async (request) => {
    const context = {
      repository,
      event: 'workflow_dispatch',
      ref: 'refs/heads/main',
      sha: request.sha,
    };
    await verifyCi(context, request.ciRunId, token);
    const run = await get(`/repos/${repository}/actions/runs/${request.runId}`);
    if (
      run.head_sha !== request.sha ||
      run.head_branch !== 'main' ||
      run.event !== 'workflow_dispatch' ||
      run.path !== '.github/workflows/deploy.yml' ||
      run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository ||
      run.status !== 'in_progress'
    )
      throw new Error('Ejecución de publicación no autorizada');
  };
  const health = async (release) => {
    for (const [service, port] of [
      ['api', '3000'],
      ['web', '8080'],
    ]) {
      const info = await details(await container(service));
      const binding = info.ports[`${port}/tcp`];
      if (
        info.image !== (await imageId(release[service])) ||
        info.status !== 'running' ||
        (service === 'api' && info.health !== 'healthy') ||
        binding?.length !== 1 ||
        binding[0].HostIp !== '127.0.0.1' ||
        binding[0].HostPort !== (service === 'api' ? '3100' : '8180')
      )
        throw new Error('Contenedor no coincide');
    }
    const read = async (path) => {
      const response = await fetch(`https://nextriva.es${path}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'cache-control': 'no-cache' },
      });
      if (!response.ok) throw new Error('HTTP no saludable');
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024)
        throw new Error('Respuesta demasiado grande');
      return { text, response };
    };
    if (JSON.parse((await read('/api/health')).text).status !== 'ok')
      throw new Error('API no saludable');
    const html = (await read('/')).text;
    if (!html.includes('<html') || !html.includes('<div id="root"'))
      throw new Error('Landing no saludable');
    const asset = html.match(/src="(\/assets\/[A-Za-z0-9_.-]+\.js)"/);
    if (
      !asset ||
      !(await read(asset[1])).response.headers
        .get('content-type')
        ?.includes('javascript')
    )
      throw new Error('Recurso principal no saludable');
    // El baseline previo al CD puede no tener marcador público: se valida por image ID inventariado.
    if (
      !release.api.startsWith('sha256:') &&
      JSON.parse((await read('/release.json')).text).sha !== release.sha
    )
      throw new Error('Revisión pública incorrecta');
    const missing = await fetch('https://nextriva.es/api/__cd_not_found__', {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (
      missing.status !== 404 ||
      !missing.headers.get('content-type')?.includes('application/json')
    )
      throw new Error('Proxy API interceptado por SPA');
  };
  let authenticated = false;
  return {
    lock: () => acquireLock(config.stateDirectory),
    async readState() {
      const state = JSON.parse(
        await privateFile(join(config.stateDirectory, 'state.json')),
      );
      assertRelease(state.current);
      if (!state.pending) {
        for (const service of ['api', 'web']) {
          if (
            (await details(await container(service))).image !==
            (await imageId(state.current[service]))
          )
            throw new Error('Aplicación fuera del estado inventariado');
        }
      }
      return state;
    },
    saveState: (state) =>
      atomicJson(join(config.stateDirectory, 'state.json'), state),
    authorize,
    inventory: () => deploymentStage('inventory', inventory),
    compatible: (release) =>
      deploymentStage('check-schema', () => compatible(release)),
    health: (release) => deploymentStage('health', () => health(release)),
    async pull(release) {
      const space = await statfs(config.stateDirectory);
      if (space.bavail * space.bsize < 2 * 1024 ** 3)
        throw new DeploymentFailure('pull-images', 'storage_exhausted');
      if (!authenticated) {
        await execute(
          ['login', 'ghcr.io', '--username', 'xbasets82', '--password-stdin'],
          { input: token, phase: 'registry-login' },
        );
        authenticated = true;
      }
      for (const service of ['api', 'web']) {
        if (release[service].startsWith('sha256:')) {
          await imageId(release[service]);
          continue;
        }
        await execute(['pull', release[service]], { phase: `pull-${service}` });
        const labels = JSON.parse(
          await execute(
            [
              'image',
              'inspect',
              '--format',
              '{{json .Config.Labels}}',
              release[service],
            ],
            { phase: 'check-image' },
          ),
        );
        if (
          labels?.['org.opencontainers.image.revision'] !== release.sha ||
          labels?.['org.opencontainers.image.source'] !==
            `https://github.com/${repository}`
        )
          throw new DeploymentFailure('check-image', 'image_mismatch');
      }
    },
    async activate(release) {
      const override = join(config.stateDirectory, 'images.json');
      await atomicJson(override, {
        services: { api: { image: release.api }, web: { image: release.web } },
      });
      await execute(composeArguments(config, override), { phase: 'activate' });
    },
    audit: (record) =>
      appendFile(
        join(config.stateDirectory, 'history.jsonl'),
        JSON.stringify({ ...record, date: new Date().toISOString() }) + '\n',
        { mode: 0o600 },
      ),
  };
}
