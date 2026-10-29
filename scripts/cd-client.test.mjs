import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publish, run, runClient } from './cd-client.mjs';
import { githubJson, requiredJobs } from './cd-policy.mjs';

const privatePackage = {
  name: 'nextriva-api',
  owner: { login: 'xbasets82' },
  visibility: 'private',
  repository: { full_name: 'xbasets82/Nextriva' },
};
const privatePackageFor = (service) => ({
  ...privatePackage,
  name: `nextriva-${service}`,
});
const context = { sha: 'a'.repeat(40) };

function publisherFixture(packages = {}) {
  const events = [];
  const packageQueries = [];
  const outputs = [];
  const responses = {
    api: [...(packages.api ?? [privatePackage, privatePackage])],
    web: [
      ...(packages.web ?? [privatePackageFor('web'), privatePackageFor('web')]),
    ],
  };
  const dependencies = {
    get: (path, token) =>
      githubJson(path, token, async (url) => {
        packageQueries.push(url);
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
  return { events, packageQueries, outputs, dependencies };
}

test('bootstrap permite 404 solo de web y comprueba ambos paquetes tras publicar antes de entregar digests', async () => {
  const fixture = publisherFixture({
    api: [privatePackage, privatePackage],
    web: [404, privatePackageFor('web')],
  });
  await publish(context, 'test-token', fixture.dependencies);
  assert.deepEqual(
    fixture.events.filter((event) => /^(get|push):/.test(event)),
    ['get:api', 'get:web', 'push:api', 'get:api', 'push:web', 'get:web'],
  );
  assert.equal(fixture.outputs.length, 2);
});

test('publicación consulta paquetes privados mediante el endpoint del usuario autenticado antes y después del push', async () => {
  const fixture = publisherFixture();
  await publish(context, 'test-token', fixture.dependencies);
  assert.deepEqual(fixture.packageQueries, [
    'https://api.github.com/user/packages/container/nextriva-api',
    'https://api.github.com/user/packages/container/nextriva-web',
    'https://api.github.com/user/packages/container/nextriva-api',
    'https://api.github.com/user/packages/container/nextriva-web',
  ]);
});

test('publicación existente exige identidad exacta de paquetes privados legibles antes y después del push', async () => {
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
  for (const fullName of ['xbasets82/nextriva', 'XBAsEts82/NEXTRIVA']) {
    test(`${service}: acepta la misma identidad de repositorio con mayúsculas distintas antes y después del push: ${fullName}`, async () => {
      const packageInfo = {
        ...privatePackageFor(service),
        repository: { full_name: fullName },
      };
      const fixture = publisherFixture({
        [service]: [packageInfo, packageInfo],
      });
      await publish(context, 'test-token', fixture.dependencies);
      assert.deepEqual(
        fixture.events.filter((event) => /^(get|push):/.test(event)),
        ['get:api', 'get:web', 'push:api', 'get:api', 'push:web', 'get:web'],
      );
      assert.deepEqual(
        fixture.outputs.map(([publishedService]) => publishedService),
        ['api', 'web'],
      );
    });
  }
}

for (const service of ['api', 'web']) {
  for (const fullName of [
    undefined,
    null,
    42,
    { value: 'xbasets82/Nextriva' },
    '',
    ' xbasets82/Nextriva ',
    'xbasets82/Nextriva/extra',
    'https://github.com/xbasets82/Nextriva',
    'XBASETS82/NEXTRIVA-OTHER',
    'other/Nextriva',
  ]) {
    for (const phase of ['before', 'after']) {
      test(`${service}: rechaza identidad de repositorio inválida o ajena ${JSON.stringify(fullName)} ${phase} del push`, async () => {
        const packageInfo = {
          ...privatePackageFor(service),
          repository: fullName === undefined ? {} : { full_name: fullName },
        };
        const fixture = publisherFixture({
          [service]:
            phase === 'before'
              ? [packageInfo]
              : [privatePackageFor(service), packageInfo],
        });
        await assert.rejects(
          publish(context, 'test-token', fixture.dependencies),
          (error) => {
            assert.equal(error.stage, `verify-package-${service}`);
            assert.equal(error.category, 'package_policy_rejected');
            assert.equal(error.reason, 'repository_mismatch');
            return true;
          },
        );
        assert.deepEqual(fixture.outputs, []);
        assert.equal(
          fixture.events.includes(`push:${service}`),
          phase === 'after',
        );
        if (phase === 'before')
          assert.equal(
            fixture.events.some((event) => event.startsWith('login:')),
            false,
          );
        if (phase === 'after' && service === 'api')
          assert.equal(fixture.events.includes('push:web'), false);
      });
    }
  }
}

for (const service of ['api', 'web']) {
  for (const [name, response] of Object.entries({
    público: { ...privatePackageFor(service), visibility: 'public' },
    'identidad de paquete ausente': { visibility: 'private' },
    ajeno: {
      ...privatePackageFor(service),
      repository: { full_name: 'attacker/other' },
    },
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
    público: { ...privatePackageFor(service), visibility: 'public' },
    'identidad de paquete ausente': { visibility: 'private' },
    'HTTP 401': 401,
    'HTTP 403': 403,
    'HTTP 500': 500,
  })) {
    test(`${service}: bloquea digests si la verificación posterior encuentra paquete ${name}`, async () => {
      const fixture = publisherFixture({
        [service]: [privatePackageFor(service), response],
      });
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

for (const service of ['api', 'web']) {
  test(`${service}: permite metadatos de repositorio ausentes con identidad exacta y acceso autenticado antes y después del push`, async () => {
    const packageInfo = {
      ...privatePackageFor(service),
      repository: undefined,
    };
    const fixture = publisherFixture({ [service]: [packageInfo, packageInfo] });
    await publish(context, 'test-token', fixture.dependencies);
    assert.equal(fixture.outputs.length, 2);
  });
  for (const [name, value] of Object.entries({
    'propietario ajeno': { owner: { login: 'attacker' } },
    'nombre ajeno': { name: 'other' },
    'nombre del otro servicio': {
      name: service === 'api' ? 'nextriva-web' : 'nextriva-api',
    },
    'propietario ausente': { owner: undefined },
    'nombre ausente': { name: undefined },
    'propietario malformado': { owner: ['xbasets82'] },
  })) {
    for (const phase of ['before', 'after']) {
      test(`${service}: rechaza ${name} ${phase} del push`, async () => {
        const invalid = { ...privatePackageFor(service), ...value };
        const fixture = publisherFixture({
          [service]:
            phase === 'before'
              ? [invalid]
              : [privatePackageFor(service), invalid],
        });
        await assert.rejects(
          publish(context, 'test-token', fixture.dependencies),
        );
        assert.deepEqual(fixture.outputs, []);
        assert.equal(
          fixture.events.includes(`push:${service}`),
          phase === 'after',
        );
        if (phase === 'before')
          assert.equal(
            fixture.events.some((event) => event.startsWith('login:')),
            false,
          );
      });
    }
  }
}

for (const service of ['api', 'web']) {
  for (const phase of ['before', 'after']) {
    test(`${service}: rechaza repository nulo ${phase} del push sin entregar digests`, async () => {
      const packageInfo = { ...privatePackageFor(service), repository: null };
      const fixture = publisherFixture({
        [service]:
          phase === 'before'
            ? [packageInfo]
            : [privatePackageFor(service), packageInfo],
      });
      await assert.rejects(
        publish(context, 'test-token', fixture.dependencies),
        (error) => {
          assert.equal(error.stage, `verify-package-${service}`);
          assert.equal(error.reason, 'repository_mismatch');
          return true;
        },
      );
      assert.deepEqual(fixture.outputs, []);
      assert.equal(
        fixture.events.includes(`push:${service}`),
        phase === 'after',
      );
      if (phase === 'before')
        assert.equal(
          fixture.events.some((event) => event.startsWith('login:')),
          false,
        );
      if (phase === 'after' && service === 'api')
        assert.equal(fixture.events.includes('push:web'), false);
    });
  }
}

test('API ausente no se confunde con bootstrap de web ni permite Docker', async () => {
  const fixture = publisherFixture({ api: [404] });
  await assert.rejects(
    publish(context, 'test-token', fixture.dependencies),
    (error) => {
      assert.equal(error.stage, 'verify-package-api');
      assert.equal(error.category, 'github_http_404');
      return true;
    },
  );
  assert.deepEqual(fixture.events, ['get:api']);
  assert.deepEqual(fixture.outputs, []);
});

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

for (const [reason, response] of Object.entries({
  visibility_not_private: { ...privatePackage, visibility: 'public' },
  repository_mismatch: {
    ...privatePackage,
    repository: { full_name: 'sensitive/repository' },
  },
  invalid_metadata: null,
})) {
  test(`política informa ${reason} sin exponer los metadatos recibidos`, async () => {
    const fixture = publisherFixture({ api: [response] });
    await assert.rejects(
      publish(context, 'sensitive-token', fixture.dependencies),
      (error) => {
        assert.equal(error.category, 'package_policy_rejected');
        assert.equal(error.reason, reason);
        assert.match(error.message, new RegExp(`motivo=${reason}$`));
        assert.doesNotMatch(error.message, /sensitive|visibility=|full_name/);
        return true;
      },
    );
    assert.equal(
      fixture.events.some((event) => event.startsWith('login:')),
      false,
    );
    assert.deepEqual(fixture.outputs, []);
  });
}

async function clientFixture(
  t,
  {
    operation = 'diagnose',
    expectedSha = '',
    apiPackage = {
      ...privatePackage,
      repository: { full_name: 'sensitive/repository' },
      secret: 'sensitive-token',
    },
  } = {},
) {
  const sha = 'a'.repeat(40);
  const queries = [];
  const written = [];
  const originalArgv = process.argv;
  const directory = await mkdtemp(join(tmpdir(), 'nextriva-cd-client-test-'));
  const outputPath = join(directory, 'output');
  const values = {
    GITHUB_REPOSITORY: 'xbasets82/Nextriva',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    GH_TOKEN: 'sensitive-token',
    CD_CI_RUN_ID: '42',
    CD_OPERATION: operation,
    CD_EXPECTED_SHA: expectedSha,
    GITHUB_OUTPUT: outputPath,
  };
  const originalEnv = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  t.after(async () => {
    process.argv = originalArgv;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  t.mock.method(process.stdout, 'write', (value) => {
    written.push(value);
    return true;
  });
  t.mock.method(process.stderr, 'write', (value) => {
    written.push(value);
    return true;
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    queries.push(url);
    let response;
    if (url.endsWith('/git/ref/heads/main')) response = { object: { sha } };
    else if (url.endsWith('/actions/runs/42'))
      response = {
        id: 42,
        run_attempt: 1,
        head_sha: sha,
        head_branch: 'main',
        event: 'push',
        path: '.github/workflows/ci.yml',
        repository: { full_name: 'xbasets82/Nextriva' },
        head_repository: { full_name: 'xbasets82/Nextriva' },
        status: 'completed',
        conclusion: 'success',
      };
    else if (url.includes('/jobs?'))
      response = {
        jobs: requiredJobs.map((name) => ({
          name,
          head_sha: sha,
          status: 'completed',
          conclusion: 'success',
        })),
      };
    else if (url.endsWith('nextriva-api')) {
      if (typeof apiPackage === 'number')
        return { ok: false, status: apiPackage };
      response = apiPackage;
    } else if (url.endsWith('nextriva-web')) return { ok: false, status: 404 };
    else throw new Error('Unexpected network request');
    return { ok: true, json: async () => response };
  });
  return {
    written,
    queries,
    outputPath,
    invoke: async (command, dependencies) => {
      process.argv = [process.execPath, 'scripts/cd-client.mjs', command];
      return runClient(dependencies);
    },
  };
}

test('diagnose consulta ambos paquetes y solo emite estado y predicados seguros sin Docker ni SSH', async (t) => {
  const { written, queries, invoke } = await clientFixture(t);
  const commands = [];
  const result = await invoke('diagnose', {
    runCommand: async (...args) => {
      commands.push(args);
      throw new Error('Docker/SSH prohibited');
    },
  });
  assert.equal(result, 0);
  assert.deepEqual(commands, []);
  assert.equal(queries.length, 5);
  assert.deepEqual(
    queries.filter((url) => url.includes('/packages/')),
    [
      'https://api.github.com/user/packages/container/nextriva-api',
      'https://api.github.com/user/packages/container/nextriva-web',
    ],
  );
  assert.deepEqual(
    written.map((value) => JSON.parse(value)),
    [
      {
        service: 'api',
        status: 'ok',
        private: true,
        repositoryMatches: false,
        repositoryMetadata: 'valid',
        repositoryOwnerMatches: false,
        repositoryNameMatches: false,
        reason: 'repository_mismatch',
      },
      { service: 'web', status: 'not_published_yet' },
    ],
  );
  assert.doesNotMatch(written.join(''), /sensitive|full_name/);
});

test('diagnose nunca presenta 404 de API como bootstrap permitido', async (t) => {
  const { written, invoke } = await clientFixture(t, { apiPackage: 404 });
  assert.equal(await invoke('diagnose'), 0);
  assert.deepEqual(
    written.map((value) => JSON.parse(value)),
    [
      { service: 'api', status: 'github_http_404' },
      { service: 'web', status: 'not_published_yet' },
    ],
  );
});

for (const fullName of ['xbasets82/nextriva', 'XBASETS82/NEXTRIVA']) {
  test(`diagnose reconoce identidad equivalente ${fullName} sin exponer metadatos`, async (t) => {
    const { written, invoke } = await clientFixture(t, {
      apiPackage: {
        ...privatePackage,
        repository: { full_name: fullName },
        secret: 'sensitive-token',
      },
    });
    assert.equal(await invoke('diagnose'), 0);
    assert.deepEqual(
      written.map((value) => JSON.parse(value)),
      [
        {
          service: 'api',
          status: 'ok',
          private: true,
          repositoryMatches: true,
          repositoryMetadata: 'valid',
          repositoryOwnerMatches: true,
          repositoryNameMatches: true,
        },
        { service: 'web', status: 'not_published_yet' },
      ],
    );
    assert.doesNotMatch(written.join(''), /sensitive|full_name|xbasets82/i);
  });
}

const repositoryDiagnostics = [
  ['paquete nulo', null, 'invalid', false, false],
  ['paquete no objeto', 'sensitive-metadata', 'invalid', false, false],
  ['paquete array', [], 'invalid', false, false],
  [
    'vínculo ausente',
    { ...privatePackage, repository: undefined },
    'absent',
    false,
    false,
  ],
  [
    'vínculo nulo',
    { ...privatePackage, repository: null },
    'invalid',
    false,
    false,
  ],
  [
    'vínculo inválido',
    { ...privatePackage, repository: 'sensitive' },
    'invalid',
    false,
    false,
  ],
  [
    'nombre ausente',
    { ...privatePackage, repository: {} },
    'invalid',
    false,
    false,
  ],
  [
    'nombre nulo',
    { ...privatePackage, repository: { full_name: null } },
    'invalid',
    false,
    false,
  ],
  [
    'nombre no cadena',
    { ...privatePackage, repository: { full_name: 42 } },
    'invalid',
    false,
    false,
  ],
  [
    'nombre malformado',
    { ...privatePackage, repository: { full_name: 'sensitive/path/extra' } },
    'invalid',
    false,
    false,
  ],
  [
    'nombre con espacios',
    { ...privatePackage, repository: { full_name: ' xbasets82/Nextriva' } },
    'invalid',
    false,
    false,
  ],
  [
    'propietario ajeno',
    { ...privatePackage, repository: { full_name: 'sensitive/Nextriva' } },
    'valid',
    false,
    true,
  ],
  [
    'repositorio ajeno',
    { ...privatePackage, repository: { full_name: 'xbasets82/sensitive' } },
    'valid',
    true,
    false,
  ],
];

for (const [
  name,
  apiPackage,
  metadata,
  ownerMatches,
  nameMatches,
] of repositoryDiagnostics) {
  test(`diagnose distingue ${name} sin exponer valores ni ejecutar comandos`, async (t) => {
    const { written, invoke } = await clientFixture(t, { apiPackage });
    const commands = [];
    assert.equal(
      await invoke('diagnose', {
        runCommand: async (...args) => commands.push(args),
      }),
      0,
    );
    assert.deepEqual(commands, []);
    assert.deepEqual(
      written.map((value) => JSON.parse(value)),
      [
        {
          service: 'api',
          status: 'ok',
          private: apiPackage?.visibility === 'private',
          repositoryMatches: false,
          repositoryMetadata: metadata,
          repositoryOwnerMatches: ownerMatches,
          repositoryNameMatches: nameMatches,
          ...(metadata === 'absent'
            ? {}
            : {
                reason:
                  metadata === 'invalid' &&
                  (apiPackage === null ||
                    typeof apiPackage !== 'object' ||
                    Array.isArray(apiPackage))
                    ? 'invalid_metadata'
                    : 'repository_mismatch',
              }),
        },
        { service: 'web', status: 'not_published_yet' },
      ],
    );
    assert.doesNotMatch(
      written.join(''),
      /sensitive|full_name|xbasets82|Nextriva/i,
    );
  });
}

test('gate bloquea deploy sin expected_sha antes de habilitar publicación o producir digests', async (t) => {
  const { invoke, outputPath } = await clientFixture(t, {
    operation: 'deploy',
  });
  const commands = [];
  const result = await invoke('gate', {
    runCommand: async (...args) => commands.push(args),
  });
  assert.equal(result, 1);
  assert.deepEqual(commands, []);
  await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
});

for (const [operation, expectedSha] of [
  ['rollback', ''],
  ['deploy', 'invalid-sha'],
  ['unknown-operation', 'a'.repeat(40)],
]) {
  test(`gate rechaza operación/versión inválida: ${operation}`, async (t) => {
    const { invoke, outputPath } = await clientFixture(t, {
      operation,
      expectedSha,
    });
    assert.equal(await invoke('gate'), 1);
    await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
  });
}

for (const operation of ['deploy', 'rollback', 'diagnose']) {
  test(`gate acepta contrato válido de ${operation}`, async (t) => {
    const { invoke, outputPath } = await clientFixture(t, {
      operation,
      expectedSha: operation === 'diagnose' ? '' : 'b'.repeat(40),
    });
    assert.equal(await invoke('gate'), 0);
    assert.equal(await readFile(outputPath, 'utf8'), `sha=${'a'.repeat(40)}\n`);
  });
}

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

test('workflow diagnose es manual de solo lectura y excluye publicación y despliegue', async () => {
  const text = await readFile(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8',
  );
  assert.match(text, /options: \[deploy, rollback, diagnose\]/);
  const gate = text.split('\n  gate:\n')[1]?.split('\n  diagnose:\n')[0];
  assert.match(gate, /CD_OPERATION: \$\{\{ inputs\.operation \}\}/);
  assert.match(gate, /CD_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  const diagnose = text.split('\n  diagnose:\n')[1]?.split('\n  publish:\n')[0];
  assert.ok(diagnose, 'job diagnose ausente');
  assert.match(diagnose, /needs: gate/);
  assert.match(diagnose, /inputs\.operation == 'diagnose'/);
  assert.match(diagnose, /packages: read/);
  assert.match(diagnose, /run: node scripts\/cd-client\.mjs diagnose/);
  assert.doesNotMatch(diagnose, /secrets\.|packages: write|docker|\bssh\b/i);
  const publishJob = text.split('\n  publish:\n')[1]?.split('\n  deploy:\n')[0];
  assert.match(publishJob, /if: \$\{\{ inputs\.operation == 'deploy' \}\}/);
  const deployJob = text.split('\n  deploy:\n')[1];
  assert.match(deployJob, /inputs\.operation != 'diagnose'/);
});

test('cliente conserva únicamente diagnóstico remoto cerrado y rechaza stderr arbitrario', async () => {
  const { formatClientFailure } = await import('./cd-client.mjs');
  const diagnostic = {
    cdDiagnostic: {
      phase: 'registry-login',
      category: 'registry_permission_denied',
    },
  };
  for (const [stderr, expected] of [
    [
      JSON.stringify(diagnostic),
      'CD despliegue fallido: etapa=registry-login categoría=registry_permission_denied',
    ],
    [
      JSON.stringify({
        cdDiagnostic: { ...diagnostic.cdDiagnostic, secret: 'private-token' },
      }),
      null,
    ],
    [
      JSON.stringify({
        cdDiagnostic: { ...diagnostic.cdDiagnostic, phase: 'private-token' },
      }),
      null,
    ],
    [
      JSON.stringify({
        cdDiagnostic: { ...diagnostic.cdDiagnostic, category: 'private-token' },
      }),
      null,
    ],
    [JSON.stringify(diagnostic) + '\nprivate-token', null],
    [JSON.stringify({ cdDiagnostic: { phase: 'registry-login' } }), null],
    [
      JSON.stringify({
        cdDiagnostic: { ...diagnostic.cdDiagnostic, recovery: 'private-token' },
      }),
      null,
    ],
    [JSON.stringify({ ...diagnostic, secret: 'private-token' }), null],
    ['Permission denied private-token /private/key', null],
  ]) {
    await assert.rejects(
      run('ssh', [], {
        execCommand(_file, _args, _options, callback) {
          queueMicrotask(() =>
            callback(
              Object.assign(new Error('private-command'), { code: 1 }),
              '',
              stderr,
            ),
          );
          return { stdin: { on() {}, end() {} } };
        },
      }),
      (error) => {
        const text = formatClientFailure(error);
        if (expected) assert.equal(text, expected);
        else
          assert.equal(
            text,
            'CD bloqueado o fallido; revisar condiciones y configuración sin publicar secretos.',
          );
        assert.doesNotMatch(text, /private-token|private-command|private\/key/);
        return true;
      },
    );
  }
});
