import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { publish, run } from './cd-client.mjs';
import { githubJson } from './cd-policy.mjs';

const privatePackage = {
  visibility: 'private',
  repository: { full_name: 'xbasets82/Nextriva' },
};
const context = { sha: 'a'.repeat(40) };

function publisherFixture(packages = {}) {
  const events = [];
  const outputs = [];
  const responses = {
    api: [...(packages.api ?? [privatePackage, privatePackage])],
    web: [...(packages.web ?? [privatePackage, privatePackage])],
  };
  const dependencies = {
    get: (path, token) =>
      githubJson(path, token, async (url) => {
        const service = url.endsWith('nextriva-api') ? 'api' : 'web';
        events.push(`get:${service}`);
        assert.ok(responses[service].length, 'consulta inesperada');
        const response = responses[service].shift();
        return typeof response === 'number'
          ? { ok: false, status: response }
          : { ok: true, json: async () => response };
      }),
    runCommand: async (executable, args) => {
      assert.equal(executable, 'docker');
      const service = args.some(
        (value) =>
          value.includes('nextriva-api') || value.includes('Dockerfile.api'),
      )
        ? 'api'
        : 'web';
      events.push(`${args[0]}:${service}`);
      return args[0] === 'image'
        ? JSON.stringify([
            `ghcr.io/xbasets82/nextriva-${service}@sha256:${'b'.repeat(64)}`,
          ])
        : '';
    },
    writeOutput: async (service, digest) => {
      outputs.push([service, digest]);
    },
  };
  return { events, outputs, dependencies };
}

test('bootstrap permite 404 inicial y comprueba ambos paquetes tras publicar antes de entregar digests', async () => {
  const fixture = publisherFixture({
    api: [404, privatePackage],
    web: [404, privatePackage],
  });
  await publish(context, 'test-token', fixture.dependencies);
  assert.deepEqual(
    fixture.events.filter((event) => /^(get|push):/.test(event)),
    ['get:api', 'get:web', 'push:api', 'get:api', 'push:web', 'get:web'],
  );
  assert.equal(fixture.outputs.length, 2);
});

test('publicación existente exige paquetes privados vinculados antes y después del push', async () => {
  const fixture = publisherFixture();
  await publish(context, 'test-token', fixture.dependencies);
  assert.deepEqual(
    fixture.events.filter((event) => /^(get|push):/.test(event)),
    ['get:api', 'get:web', 'push:api', 'get:api', 'push:web', 'get:web'],
  );
  assert.deepEqual(
    fixture.outputs.map(([service]) => service),
    ['api', 'web'],
  );
});

for (const service of ['api', 'web']) {
  for (const [name, response] of Object.entries({
    público: { ...privatePackage, visibility: 'public' },
    desvinculado: { visibility: 'private' },
    ajeno: { ...privatePackage, repository: { full_name: 'attacker/other' } },
    inválido: null,
    'HTTP 401': 401,
    'HTTP 403': 403,
    'HTTP 500': 500,
  })) {
    test(`${service}: rechaza ${name} antes de cualquier publicación`, async () => {
      const fixture = publisherFixture({ [service]: [response] });
      await assert.rejects(
        publish(context, 'test-token', fixture.dependencies),
      );
      assert.equal(
        fixture.events.some((event) => event.startsWith('push:')),
        false,
      );
      assert.deepEqual(fixture.outputs, []);
    });
  }
  for (const [name, response] of Object.entries({
    ausente: 404,
    público: { ...privatePackage, visibility: 'public' },
    desvinculado: { visibility: 'private' },
    'HTTP 401': 401,
    'HTTP 403': 403,
    'HTTP 500': 500,
  })) {
    test(`${service}: bloquea digests si la verificación posterior encuentra paquete ${name}`, async () => {
      const fixture = publisherFixture({ [service]: [404, response] });
      await assert.rejects(
        publish(context, 'test-token', fixture.dependencies),
      );
      assert.ok(fixture.events.includes(`push:${service}`));
      assert.deepEqual(fixture.outputs, []);
      if (service === 'api')
        assert.equal(fixture.events.includes('push:web'), false);
    });
  }
}

test('un fallo de red inicial no se confunde con un paquete ausente', async () => {
  const fixture = publisherFixture();
  fixture.dependencies.get = async () => {
    throw new Error('network unavailable');
  };
  await assert.rejects(publish(context, 'test-token', fixture.dependencies));
  assert.deepEqual(fixture.events, []);
  assert.deepEqual(fixture.outputs, []);
});

test('publicación informa etapa y categoría seguras sin volcar salida Docker', async () => {
  const fixture = publisherFixture();
  fixture.dependencies.runCommand = async (executable, args) => {
    const service = args.some((value) => value.includes('nextriva-api'))
      ? 'api'
      : 'web';
    if (args[0] === 'push' && service === 'web') {
      const error = new Error('token=ghp_sensitive raw diagnostic');
      error.stderr =
        'denied: requested access to resource is denied; token=ghp_sensitive';
      throw error;
    }
    return args[0] === 'image'
      ? JSON.stringify([
          `ghcr.io/xbasets82/nextriva-${service}@sha256:${'b'.repeat(64)}`,
        ])
      : '';
  };

  await assert.rejects(
    publish(context, 'test-token', fixture.dependencies),
    (error) => {
      assert.equal(error.stage, 'push-web');
      assert.equal(error.category, 'registry_permission_denied');
      assert.doesNotMatch(error.message, /ghp_sensitive|raw diagnostic/);
      return true;
    },
  );
});

test('timeout real de execFile se clasifica como operation_timeout', async () => {
  await assert.rejects(
    run(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {
      timeout: 25,
    }),
    (error) => {
      assert.equal(error.safeCategory, 'operation_timeout');
      return true;
    },
  );
});

test('diagnóstico de GitHub identifica un 403 sin mostrar el cuerpo de respuesta', async () => {
  const fixture = publisherFixture({ api: [403] });
  await assert.rejects(
    publish(context, 'test-token', fixture.dependencies),
    (error) => {
      assert.equal(error.stage, 'verify-package-api');
      assert.equal(error.category, 'github_http_403');
      assert.doesNotMatch(error.message, /test-token|ghp_/);
      return true;
    },
  );
});

test('diagnóstico distingue el rechazo de la política de paquete', async () => {
  const fixture = publisherFixture({
    api: [{ ...privatePackage, visibility: 'public' }],
  });
  await assert.rejects(
    publish(context, 'test-token', fixture.dependencies),
    (error) => {
      assert.equal(error.stage, 'verify-package-api');
      assert.equal(error.category, 'package_policy_rejected');
      return true;
    },
  );
});

test('diagnóstico etiqueta una respuesta de digest ilegible sin exponerla', async () => {
  const fixture = publisherFixture();
  fixture.dependencies.runCommand = async (executable, args) => {
    if (args[0] === 'image') return 'not-json-private-output';
    return '';
  };
  await assert.rejects(
    publish(context, 'test-token', fixture.dependencies),
    (error) => {
      assert.equal(error.stage, 'digest-api');
      assert.equal(error.category, 'digest_output_invalid');
      assert.doesNotMatch(error.message, /not-json-private-output/);
      return true;
    },
  );
});

test('el cliente formatea errores CD sin exponer errores arbitrarios', async () => {
  const client = await import('./cd-client.mjs');
  assert.equal(typeof client.formatClientFailure, 'function');
  const failure = new client.PublishFailure(
    'push-web',
    'registry_permission_denied',
  );
  assert.equal(
    client.formatClientFailure(failure),
    'CD publicación fallida: etapa=push-web categoría=registry_permission_denied',
  );
  assert.equal(
    client.formatClientFailure(new Error('token=ghp_sensitive private data')),
    'CD bloqueado o fallido; revisar condiciones y configuración sin publicar secretos.',
  );
  assert.throws(
    () => new client.PublishFailure('external-input', 'private-data'),
    /Etapa o categoría CD no permitida/,
  );
});

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
  assert.match(
    text,
    /needs\.publish\.result == 'success'.*inputs\.operation == 'rollback'/,
  );
  assert.match(text, /refs\/heads\/main/);
  assert.doesNotMatch(text, /ssh-keyscan|StrictHostKeyChecking=no/);
  for (const action of text.matchAll(/uses: (\S+)/g))
    assert.match(action[1], /@[a-f0-9]{40}$/);
});
