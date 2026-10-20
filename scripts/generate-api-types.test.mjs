import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('writes generated OpenAPI types to the web package target', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'nextriva-openapi-target-'));
  const write = async (path, content) => {
    const target = join(fixture, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content);
  };

  try {
    await write(
      'scripts/generate-api-types.mjs',
      await readFile(join(repositoryRoot, 'scripts/generate-api-types.mjs')),
    );
    await write('package.json', '{"type":"module"}');
    await write('apps/api/package.json', '{}');
    await write('apps/web/package.json', '{}');
    await write(
      'apps/api/dist/src/export-openapi.js',
      `
      import { writeFileSync } from 'node:fs';
      writeFileSync(process.argv[2], '{"openapi":"3.0.0"}');
    `,
    );
    await write(
      'apps/api/node_modules/typescript/bin/tsc',
      'process.exit(0);\n',
    );
    await write(
      'apps/api/node_modules/typescript/package.json',
      '{"exports":{"./bin/tsc":"./bin/tsc"}}',
    );
    await write(
      'apps/web/node_modules/openapi-typescript/dist/index.js',
      'export {};\n',
    );
    await write(
      'apps/web/node_modules/openapi-typescript/package.json',
      '{"type":"module","exports":"./dist/index.js"}',
    );
    await write(
      'apps/web/node_modules/openapi-typescript/bin/cli.js',
      `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { dirname } from 'node:path';
        const output = process.argv[process.argv.indexOf('-o') + 1];
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, 'generated-schema\\n');
      `,
    );
    await write('node_modules/prettier/bin/prettier.cjs', 'process.exit(0);\n');
    await write('node_modules/prettier/package.json', '{}');
    await write('apps/web/src/api/schema.d.ts', 'stale-schema\n');

    const result = spawnSync(
      process.execPath,
      ['scripts/generate-api-types.mjs'],
      { cwd: fixture, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      await readFile(join(fixture, 'apps/web/src/api/schema.d.ts'), 'utf8'),
      'generated-schema\n',
    );
    await assert.rejects(readFile(join(fixture, 'src/api/schema.d.ts')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
