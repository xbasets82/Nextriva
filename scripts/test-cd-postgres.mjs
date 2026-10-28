import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { deployRelease } from './cd-deploy.mjs';
import { assertMigrations } from './cd-runtime.mjs';

const executable = ['/usr/bin/docker', '/usr/local/bin/docker'].find(
  existsSync,
);
if (!executable)
  throw new Error('Docker debe estar instalado en una ruta del sistema');

function docker(args) {
  return new Promise((done, fail) => {
    execFile(
      executable,
      args,
      { timeout: 90000, maxBuffer: 1024 * 1024 },
      (error, stdout) =>
        error
          ? fail(new Error('Docker temporal no disponible'))
          : done(stdout.trim()),
    );
  });
}

function healthyEvent(name, since) {
  return new Promise((done, fail) => {
    const events = spawn(
      executable,
      [
        'events',
        '--since',
        since,
        '--filter',
        `container=${name}`,
        '--filter',
        'event=health_status',
        '--format',
        '{{.Action}}',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const timer = setTimeout(() => {
      events.kill();
      fail(new Error('PostgreSQL temporal no saludable'));
    }, 45000);
    events.once('error', () => {
      clearTimeout(timer);
      fail(new Error('Eventos Docker no disponibles'));
    });
    events.once('exit', (code) => {
      if (code && code !== 0) {
        clearTimeout(timer);
        fail(new Error('Eventos Docker no disponibles'));
      }
    });
    events.stdout.on('data', (data) => {
      if (data.toString().includes('health_status: healthy')) {
        clearTimeout(timer);
        events.kill();
        done();
      }
    });
  });
}

test(
  'PostgreSQL desechable conserva filas y relaciones en publicación simulada, fallo y migración pendiente',
  { timeout: 120000 },
  async () => {
    if (process.env.DATABASE_URL || process.env.NEXTRIVA_MIGRATION_DATABASE_URL)
      throw new Error('Conexiones heredadas no autorizadas');
    const name = `nextriva-cd-test-${randomBytes(8).toString('hex')}`;
    const previous = {
      sha: 'a'.repeat(40),
      api: `sha256:${'a'.repeat(64)}`,
      web: `sha256:${'b'.repeat(64)}`,
    };
    const target = {
      sha: 'c'.repeat(40),
      api: `ghcr.io/xbasets82/nextriva-api@sha256:${'c'.repeat(64)}`,
      web: `ghcr.io/xbasets82/nextriva-web@sha256:${'d'.repeat(64)}`,
    };
    const query = (sql) =>
      docker([
        'exec',
        name,
        'psql',
        '-U',
        'postgres',
        '-d',
        'nextriva_cd_test',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ]);
    let started = false;
    try {
      const since = new Date(Date.now() - 1000).toISOString();
      await docker([
        'run',
        '-d',
        '--name',
        name,
        '--label',
        `nextriva.cd-test.session=${name}`,
        '--network',
        'none',
        '--tmpfs',
        '/var/lib/postgresql',
        '-e',
        'POSTGRES_DB=nextriva_cd_test',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '--health-cmd',
        'pg_isready -U postgres -d nextriva_cd_test',
        '--health-interval',
        '1s',
        '--health-retries',
        '30',
        'postgres:18.6-bookworm',
      ]);
      started = true;
      await healthyEvent(name, since);
      await query(
        "CREATE TABLE parent(id integer PRIMARY KEY); CREATE TABLE child(id integer PRIMARY KEY, parent_id integer REFERENCES parent(id)); INSERT INTO parent VALUES(1); INSERT INTO child VALUES(2,1); CREATE TABLE migration_guard(name text, checksum text, finished boolean, rolled_back boolean); INSERT INTO migration_guard VALUES('20261001000000_initial',repeat('e',64),true,false)",
      );
      const before = await query(
        'SELECT row_to_json(t) FROM (SELECT (SELECT count(*) FROM parent) AS parents, (SELECT count(*) FROM child JOIN parent ON parent.id=child.parent_id) AS relations) t',
      );
      const identity = await docker(['inspect', '--format', '{{.Id}}', name]);
      let state = {
        version: 1,
        current: previous,
        previous: null,
        lastRunId: 0,
        pending: null,
      };
      let failHealth = false;
      let activated = 0;
      const io = {
        async lock() {
          return async () => {};
        },
        async readState() {
          return structuredClone(state);
        },
        async saveState(value) {
          state = structuredClone(value);
        },
        async authorize() {},
        async inventory() {
          return { id: await docker(['inspect', '--format', '{{.Id}}', name]) };
        },
        async pull() {},
        async compatible() {
          const rows = JSON.parse(
            await query(
              "SELECT json_agg(json_build_object('name',name,'checksum',checksum,'finished',finished,'rolledBack',rolled_back)) FROM migration_guard",
            ),
          );
          assertMigrations(
            [{ name: '20261001000000_initial', checksum: 'e'.repeat(64) }],
            rows,
          );
        },
        async activate() {
          activated++;
        },
        async health(release) {
          if (failHealth && release.sha === previous.sha)
            throw new Error('Salud simulada');
        },
        async audit() {},
      };
      const request = {
        operation: 'deploy',
        ...target,
        ciRunId: 1,
        runId: 2,
        expectedSha: previous.sha,
      };
      assert.equal((await deployRelease(request, io)).result, 'deployed');
      failHealth = true;
      await assert.rejects(
        deployRelease(
          {
            operation: 'rollback',
            sha: target.sha,
            expectedSha: target.sha,
            ciRunId: 1,
            runId: 3,
          },
          io,
        ),
      );
      assert.equal(state.current.sha, target.sha);
      await query('UPDATE migration_guard SET finished=false');
      const count = activated;
      await assert.rejects(
        deployRelease(
          { ...request, sha: previous.sha, expectedSha: target.sha, runId: 4 },
          io,
        ),
      );
      assert.equal(activated, count);
      assert.equal(
        await query(
          'SELECT row_to_json(t) FROM (SELECT (SELECT count(*) FROM parent) AS parents, (SELECT count(*) FROM child JOIN parent ON parent.id=child.parent_id) AS relations) t',
        ),
        before,
      );
      assert.equal(
        await docker(['inspect', '--format', '{{.Id}}', name]),
        identity,
      );
    } finally {
      if (started) await docker(['rm', '-fv', name]);
    }
  },
);
