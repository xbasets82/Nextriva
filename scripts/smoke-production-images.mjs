import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dockerBinary = ['/usr/bin/docker', '/usr/local/bin/docker'].find(
  existsSync,
);
assert.ok(dockerBinary, 'Docker must be installed in a system directory');

// Solo crea recursos efímeros propios: sin puertos publicados ni volúmenes persistentes.
const session = `nextriva-smoke-${randomBytes(8).toString('hex')}`;
const apiImage = 'nextriva-issue134-api:local';
const webImage = 'nextriva-issue134-web:local';
const password = randomBytes(24).toString('hex');
const migrationPassword = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://nextriva_app:${password}@postgres:5432/nextriva_production`;
const migrationUrl = `postgresql://nextriva_migrator:${migrationPassword}@postgres:5432/nextriva_production`;
const secrets = mkdtempSync(join(tmpdir(), 'nextriva-smoke-secrets-'));
writeFileSync(join(secrets, 'runtime_password'), `${password}\n`, {
  mode: 0o444,
});
writeFileSync(join(secrets, 'migration_password'), `${migrationPassword}\n`, {
  mode: 0o444,
});
const containers = [];
let networkCreated = false;

function docker(args, input) {
  try {
    return execFileSync(dockerBinary, args, {
      encoding: 'utf8',
      input,
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`
      .replaceAll(password, '[REDACTED]')
      .replaceAll(migrationPassword, '[REDACTED]');
    throw new Error(
      `Docker smoke step failed: ${args[0]}: ${detail.slice(-3000)}`,
    );
  }
}

function cleanup() {
  const failures = [];
  while (containers.length > 0) {
    const name = containers.pop();
    try {
      const result = spawnSync(dockerBinary, ['rm', '-f', name], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (
        result.status !== 0 &&
        !result.stderr?.includes(`No such container: ${name}`)
      ) {
        throw new Error('Could not remove owned smoke container');
      }
    } catch {
      failures.push(name);
    }
  }
  if (networkCreated) {
    try {
      docker(['network', 'rm', session]);
      networkCreated = false;
    } catch {
      failures.push(session);
    }
  }
  rmSync(secrets, { recursive: true, force: true });
  if (failures.length)
    throw new Error(`Smoke cleanup needs attention: ${failures.join(', ')}`);
}

function start(name, args) {
  containers.push(name);
  docker(['run', '-d', '--name', name, '--network', session, ...args]);
}

async function waitUntilHealthy(name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const status = docker([
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      name,
    ]);
    if (status === 'healthy') return;
    const state = docker(['inspect', '--format', '{{.State.Status}}', name]);
    if (status === 'unhealthy' || state === 'exited') {
      const result = spawnSync(dockerBinary, ['logs', name], {
        encoding: 'utf8',
        timeout: 5000,
      });
      const logs = `${result.stdout ?? ''}${result.stderr ?? ''}`
        .replaceAll(password, '[REDACTED]')
        .replaceAll(migrationPassword, '[REDACTED]');
      throw new Error(`Smoke container failed: ${logs.slice(-3000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Smoke healthcheck deadline exceeded');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    try {
      cleanup();
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  });
}

try {
  docker(['network', 'create', '--internal', session]);
  networkCreated = true;
  if (process.argv.includes('--check-failed-start-cleanup')) {
    const failedContainer = `${session}-failed-start`;
    assert.throws(
      () =>
        start(failedContainer, [
          '--entrypoint',
          '/nonexistent-nextriva-smoke-entrypoint',
          apiImage,
        ]),
      /Docker smoke step failed/,
    );
    const created = spawnSync(
      dockerBinary,
      ['container', 'inspect', failedContainer],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(created.status, 0);
    // Incluye también el caso registrado cuyo docker run no llegó a crear recurso.
    containers.push(`${session}-never-created`);
    cleanup();
    cleanup();
    const inspected = spawnSync(
      dockerBinary,
      ['container', 'inspect', failedContainer],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(inspected.status, 1);
    console.log(
      'Failed-start cleanup passed: owned created/missing containers removed; repeated cleanup safe',
    );
    process.exit(0);
  }
  const postgres = `${session}-postgres`;
  start(postgres, [
    '--network-alias',
    'postgres',
    '--tmpfs',
    '/var/lib/postgresql:rw',
    '-e',
    'POSTGRES_DB=nextriva_production',
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '--mount',
    `type=bind,src=${join(secrets, 'runtime_password')},dst=/run/secrets/runtime_password,readonly`,
    '--mount',
    `type=bind,src=${join(secrets, 'migration_password')},dst=/run/secrets/migration_password,readonly`,
    '--health-cmd',
    'pg_isready -U postgres -d nextriva_production',
    '--health-interval',
    '1s',
    '--health-timeout',
    '3s',
    '--health-retries',
    '30',
    'nextriva-issue134-postgres:local',
  ]);
  await waitUntilHealthy(postgres);
  const migrate = `${session}-migrate`;
  containers.push(migrate);
  docker([
    'run',
    '--name',
    migrate,
    '--network',
    session,
    '--read-only',
    '--tmpfs',
    '/tmp:mode=1777',
    '-e',
    `DATABASE_URL=${migrationUrl}`,
    apiImage,
    '/bin/sh',
    '-ec',
    './node_modules/.bin/prisma migrate deploy --config prisma.production.config.ts && node ./revoke-migration-access.mjs',
  ]);
  const migrations = docker([
    'exec',
    postgres,
    'psql',
    '-U',
    'postgres',
    '-d',
    'nextriva_production',
    '-Atc',
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;',
  ]);
  assert.ok(Number(migrations) > 0);
  console.log(
    `Production image migrations applied to ephemeral PostgreSQL: ${migrations}`,
  );

  const api = `${session}-api`;
  start(api, [
    '--read-only',
    '--tmpfs',
    '/tmp:mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '-e',
    `DATABASE_URL=${databaseUrl}`,
    '-e',
    'AUTH_ORIGIN=https://nextriva.es',
    '--health-cmd',
    'node -e "fetch(\'http://127.0.0.1:3000/api/health\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"',
    '--health-interval',
    '1s',
    '--health-timeout',
    '3s',
    '--health-retries',
    '30',
    apiImage,
  ]);
  await waitUntilHealthy(api);
  docker(
    ['exec', '-i', api, 'node', '--input-type=module'],
    `
    import assert from 'node:assert/strict';
    import pg from 'pg';
    const client = new pg.Client({connectionString:process.env.DATABASE_URL});
    await client.connect();
    try {
      const {rows}=await client.query("SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, has_schema_privilege(current_user,'public','CREATE') AS can_create FROM pg_roles WHERE rolname=current_user");
      assert.equal(rows[0].current_user,'nextriva_app');
      for(const key of ['rolsuper','rolcreatedb','rolcreaterole','can_create']) assert.equal(rows[0][key],false);
      await assert.rejects(client.query('CREATE TABLE forbidden_smoke(id int)'),{code:'42501'});
      for(const sql of [
        'SELECT id FROM public._prisma_migrations LIMIT 0',
        'INSERT INTO public._prisma_migrations SELECT * FROM public._prisma_migrations WHERE false',
        'UPDATE public._prisma_migrations SET logs=logs WHERE false',
        'DELETE FROM public._prisma_migrations WHERE false',
      ]) await assert.rejects(client.query(sql),{code:'42501'});
    } finally {await client.end();}
  `,
  );
  console.log(
    'Packaged API: runtime is non-superuser and cannot create schema objects',
  );
  // Fixture sintético exclusivo de esta BD efímera; no utiliza el seed de desarrollo.
  const hash = docker(
    ['exec', '-i', api, 'node', '--input-type=module'],
    "import argon2 from 'argon2'; console.log(await argon2.hash('synthetic-smoke-only', {type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1}));",
  );
  docker(
    [
      'exec',
      '-i',
      postgres,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'nextriva_production',
    ],
    `INSERT INTO users(first_name,last_name,email,password_hash,role) VALUES ('Smoke','Synthetic','smoke@example.invalid','${hash}','ADMIN');`,
  );
  docker(
    ['exec', '-i', api, 'node', '--input-type=module'],
    `
    import assert from 'node:assert/strict';
    const base = 'http://127.0.0.1:3000/api';
    const login = await fetch(base+'/auth/login', {method:'POST',headers:{Origin:'https://nextriva.es','Content-Type':'application/json'},body:JSON.stringify({email:'smoke@example.invalid',password:'synthetic-smoke-only'})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie');
    assert.match(cookie,/^__Host-nextriva_session=/);
    assert.match(cookie,/; Secure/); assert.match(cookie,/; HttpOnly/); assert.match(cookie,/; SameSite=Lax/);
    const headers={Cookie:cookie.split(';')[0],Origin:'https://nextriva.es'};
    const list=await fetch(base+'/incidents',{headers}); assert.equal(list.status,200);
    const csrf=await fetch(base+'/auth/csrf',{headers}); assert.equal(csrf.status,200);
    const {csrfToken}=await csrf.json();
    const denied=await fetch(base+'/auth/logout',{method:'POST',headers}); assert.equal(denied.status,403);
    const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':csrfToken}}); assert.equal(logout.status,204);
    const revoked=await fetch(base+'/auth/session',{headers}); assert.equal(revoked.status,401);
  `,
  );
  console.log(
    'Packaged API: Argon2id, PostgreSQL login, secure cookie attributes, list, CSRF and logout passed',
  );

  const web = `${session}-web`;
  start(web, [
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
    webImage,
  ]);
  await waitUntilHealthy(web);
  const html = docker(['exec', web, 'wget', '-qO-', 'http://127.0.0.1:8080/']);
  assert.match(html, /Nextriva/i);
  assert.match(html, /\/assets\/.*\.js/);
  console.log(
    'Packaged web: production HTML and hashed bundle reference passed',
  );
} finally {
  cleanup();
}
console.log(
  'Smoke resources removed; no development or remote database accessed',
);
