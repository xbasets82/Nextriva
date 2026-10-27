import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const docker = ['/usr/bin/docker', '/usr/local/bin/docker'].find(existsSync);
assert.ok(docker, 'Docker debe estar instalado en una ruta del sistema.');
if (
  process.env.CI !== undefined ||
  process.env.DATABASE_URL ||
  process.env.NEXTRIVA_MIGRATION_DATABASE_URL
) {
  throw new Error('El runner no admite conexiones heredadas.');
}
const session = `nextriva-demo-test-${randomBytes(8).toString('hex')}`;
const temporary = mkdtempSync(join(tmpdir(), `${session}-`));
const passwords = Array.from({ length: 6 }, () =>
  randomBytes(24).toString('hex'),
);
const [adminPassword, migrationPassword, runtimePassword] = passwords;
const credentials = Object.fromEntries(
  ['ADMIN', 'MANAGER', 'COLLABORATOR'].flatMap((role, index) => [
    [`DEMO_${role}_EMAIL`, `${role.toLowerCase()}@demo.nextriva.invalid`],
    [`DEMO_${role}_PASSWORD`, passwords[index + 3]],
  ]),
);
const containers = [];
const images = [];
let networkCreated = false;
let ingressCreated = false;
let child;
let interrupted = false;
const redact = (value) =>
  passwords
    .reduce(
      (text, password) => text.replaceAll(password, '[REDACTED]'),
      String(value),
    )
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[DATABASE_URL]');
const environment = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
function run(command, args, input) {
  if (interrupted) throw new Error('Validación interrumpida.');
  try {
    return execFileSync(command, args, {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      input,
      timeout: 240_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw new Error(`Falló una etapa local: ${redact(detail).slice(-2500)}`);
  }
}
function d(args, input) {
  return run(docker, args, input);
}
function file(name, value, mode = 0o600) {
  const path = join(temporary, name);
  writeFileSync(path, value, { mode });
  return path;
}
function envFile(name, values) {
  return file(
    name,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  );
}
function start(name, args, network = session) {
  containers.push(name);
  d([
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `nextriva.demo-test.session=${session}`,
    '--network',
    network,
    ...args,
  ]);
}
async function healthy(name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const status = d(['inspect', '--format', '{{.State.Health.Status}}', name]);
    if (status === 'healthy') return;
    if (
      status === 'unhealthy' ||
      d(['inspect', '--format', '{{.State.Status}}', name]) === 'exited'
    )
      throw new Error(`Contenedor efímero no disponible: ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Tiempo de espera agotado para servicio efímero.');
}
async function publishedPort(name) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = JSON.parse(
      d(['inspect', '--format', '{{json .State}}', name]),
    );
    if (!state.Running)
      throw new Error(`Proxy efímero no disponible: ${d(['logs', name])}`);
    const ports = JSON.parse(
      d(['inspect', '--format', '{{json .NetworkSettings.Ports}}', name]),
    );
    const port = ports?.['8443/tcp']?.[0]?.HostPort;
    if (port) return port;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('El proxy no publicó su puerto HTTPS de loopback.');
}
function cleanup() {
  const failed = [];
  for (const name of containers.reverse()) {
    const result = spawnSync(docker, ['rm', '-fv', name], {
      encoding: 'utf8',
      env: environment,
      timeout: 15_000,
    });
    if (result.status !== 0 && !result.stderr.includes('No such container'))
      failed.push(name);
  }
  if (
    networkCreated &&
    spawnSync(docker, ['network', 'rm', session], {
      env: environment,
      timeout: 15_000,
    }).status !== 0
  )
    failed.push(session);
  if (
    ingressCreated &&
    spawnSync(docker, ['network', 'rm', `${session}-ingress`], {
      env: environment,
      timeout: 15_000,
    }).status !== 0
  )
    failed.push(`${session}-ingress`);
  for (const image of images)
    spawnSync(docker, ['image', 'rm', image], {
      env: environment,
      stdio: 'ignore',
      timeout: 15_000,
    });
  rmSync(temporary, { recursive: true, force: true });
  if (failed.length)
    throw new Error(
      `Revisar limpieza de recursos propios: ${failed.join(', ')}`,
    );
}
function signal() {
  interrupted = true;
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* El hijo ya finalizó. */
    }
  }
}
process.on('SIGINT', signal);
process.on('SIGTERM', signal);
try {
  const tags = {};
  for (const name of ['postgres', 'api', 'web']) {
    tags[name] = `${session}-${name}:local`;
    images.push(tags[name]);
    console.log(`Construyendo imagen ${name} con versiones fijadas...`);
    d(['build', '-f', `deploy/Dockerfile.${name}`, '-t', tags[name], '.']);
  }
  d([
    'network',
    'create',
    '--internal',
    '--label',
    `nextriva.demo-test.session=${session}`,
    session,
  ]);
  networkCreated = true;
  d([
    'network',
    'create',
    '--label',
    `nextriva.demo-test.session=${session}`,
    `${session}-ingress`,
  ]);
  ingressCreated = true;
  const postgres = `${session}-postgres`;
  const runtimeSecret = file('runtime-password', `${runtimePassword}\n`, 0o444);
  const migrationSecret = file(
    'migration-password',
    `${migrationPassword}\n`,
    0o444,
  );
  const postgresEnv = envFile('postgres.env', {
    POSTGRES_DB: 'nextriva_demo',
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: adminPassword,
  });
  start(postgres, [
    '--network-alias',
    'postgres',
    '--tmpfs',
    '/var/lib/postgresql:rw',
    '--env-file',
    postgresEnv,
    '--mount',
    `type=bind,src=${runtimeSecret},dst=/run/secrets/runtime_password,readonly`,
    '--mount',
    `type=bind,src=${migrationSecret},dst=/run/secrets/migration_password,readonly`,
    '--health-cmd',
    'pg_isready -U postgres -d nextriva_demo',
    '--health-interval',
    '1s',
    '--health-retries',
    '30',
    tags.postgres,
  ]);
  await healthy(postgres);
  const migrationEnv = envFile('migration.env', {
    NODE_ENV: 'production',
    AUTH_DATABASE_MODE: 'demo',
    DATABASE_URL: `postgresql://nextriva_migrator:${migrationPassword}@postgres:5432/nextriva_demo`,
  });
  const migrate = `${session}-migrate`;
  containers.push(migrate);
  d([
    'run',
    '--name',
    migrate,
    '--network',
    session,
    '--env-file',
    migrationEnv,
    tags.api,
    '/bin/sh',
    '-ec',
    './node_modules/.bin/prisma migrate deploy --config prisma.demo.config.ts && node ./revoke-migration-access.mjs',
  ]);
  d([
    'exec',
    postgres,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'nextriva_demo',
    '-c',
    "COMMENT ON DATABASE nextriva_demo IS 'nextriva:demo:ready:v1'",
  ]);
  const seedEnv = envFile('seed.env', {
    NODE_ENV: 'production',
    AUTH_DATABASE_MODE: 'demo',
    DATABASE_URL: `postgresql://nextriva_migrator:${migrationPassword}@postgres:5432/nextriva_demo`,
    NEXTRIVA_DEMO_CONFIRM: 'INITIALIZE EMPTY DEMO',
    ...credentials,
  });
  const seed = `${session}-seed`;
  containers.push(seed);
  d([
    'run',
    '--name',
    seed,
    '--network',
    session,
    '--env-file',
    seedEnv,
    tags.api,
    'node',
    'dist/src/demo-seed/demo-seed.command.js',
  ]);
  console.log(
    'Migraciones y seed DEMO explícito completados en PostgreSQL efímero.',
  );
  const web = `${session}-web`;
  start(
    web,
    [
      '--network-alias',
      'web',
      '--read-only',
      '--tmpfs',
      '/tmp:mode=1777',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--health-cmd',
      'wget -qO- http://127.0.0.1:8080/ >/dev/null',
      '--health-interval',
      '1s',
      '--health-retries',
      '30',
      tags.web,
    ],
    `${session}-ingress`,
  );
  await healthy(web);
  const cert = join(temporary, 'cert.pem');
  const key = join(temporary, 'key.pem');
  run('/usr/bin/openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    cert,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ]);
  const publicKey = run('/usr/bin/openssl', [
    'x509',
    '-in',
    cert,
    '-pubkey',
    '-noout',
  ]);
  const pin = createHash('sha256')
    .update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' }))
    .digest('base64');
  const proxy = `${session}-proxy`;
  start(
    proxy,
    [
      '-p',
      '127.0.0.1::8443',
      '--mount',
      `type=bind,src=${temporary},dst=/certificates,readonly`,
      '--mount',
      `type=bind,src=${join(root, 'deploy/Caddyfile.demo-test')},dst=/etc/caddy/Caddyfile,readonly`,
      'caddy:2.11.2-alpine',
    ],
    `${session}-ingress`,
  );
  const port = await publishedPort(proxy);
  assert.match(port, /^\d+$/);
  const origin = `https://127.0.0.1:${port}`;
  const proxyIp = d([
    'inspect',
    '--format',
    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    proxy,
  ]);
  const apiEnv = envFile('api.env', {
    NODE_ENV: 'production',
    AUTH_DATABASE_MODE: 'demo',
    DATABASE_URL: `postgresql://nextriva_app:${runtimePassword}@postgres:5432/nextriva_demo`,
    AUTH_ORIGIN: origin,
    AUTH_LOCAL_HTTP: 'false',
    AUTH_TRUSTED_PROXY_IP: proxyIp,
  });
  const api = `${session}-api`;
  start(api, [
    '--network-alias',
    'api',
    '--read-only',
    '--tmpfs',
    '/tmp:mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--env-file',
    apiEnv,
    '--health-cmd',
    'node -e "fetch(\'http://127.0.0.1:3000/api/health\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"',
    '--health-interval',
    '1s',
    '--health-retries',
    '30',
    tags.api,
  ]);
  d(['network', 'connect', '--alias', 'api', `${session}-ingress`, api]);
  await healthy(api);
  const status = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        createRequire(join(root, 'apps/api/package.json')).resolve(
          '@playwright/test/cli',
        ),
        'test',
        '--config',
        'playwright.production.config.ts',
      ],
      {
        cwd: join(root, 'apps/api'),
        env: {
          ...environment,
          ...credentials,
          NEXTRIVA_DEMO_TEST_ORIGIN: origin,
          NEXTRIVA_DEMO_TEST_CERT_PIN: pin,
        },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.on('data', (data) => process.stdout.write(redact(data)));
    child.stderr.on('data', (data) => process.stderr.write(redact(data)));
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  child = undefined;
  assert.equal(status, 0, 'Playwright de producción falló.');
  const persisted = d([
    'exec',
    postgres,
    'psql',
    '-U',
    'postgres',
    '-d',
    'nextriva_demo',
    '-Atc',
    "SELECT count(*) FROM incidents WHERE title='I10.2 flujo HTTPS ficticio' AND status='CLOSED' AND solution_submitted_by_id <> validated_by_id AND EXISTS (SELECT 1 FROM incident_comments WHERE incident_id=incidents.id)",
  ]);
  assert.equal(persisted, '1');
  console.log(
    'Persistencia PostgreSQL: cierre independiente y comentario comprobados.',
  );
} finally {
  process.removeListener('SIGINT', signal);
  process.removeListener('SIGTERM', signal);
  cleanup();
}
console.log(
  'Recursos temporales propios eliminados; sin acceso al VPS ni a nextriva_dev.',
);
