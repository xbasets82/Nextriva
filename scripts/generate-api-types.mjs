import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const temporary = await mkdtemp(join(tmpdir(), 'nextriva-openapi-'));
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
const webRequire = createRequire(join(root, 'apps/web/package.json'));
const rootRequire = createRequire(join(root, 'package.json'));
const typescriptCli = apiRequire.resolve('typescript/bin/tsc');
const openapiEntry = webRequire.resolve('openapi-typescript');
const openapiCli = resolve(dirname(openapiEntry), '..', 'bin/cli.js');
const prettierCli = rootRequire.resolve('prettier/bin/prettier.cjs');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`OpenAPI generation failed (${result.status})`);
}
try {
  run(typescriptCli, ['-p', resolve(root, 'apps/api/tsconfig.build.json')]);
  const exported = spawnSync(
    process.execPath,
    ['apps/api/dist/src/export-openapi.js', join(temporary, 'schema.json')],
    { cwd: root, stdio: 'inherit' },
  );
  if (exported.status !== 0) throw new Error('OpenAPI export failed');
  const output = check
    ? join(temporary, 'schema.d.ts')
    : join(root, 'apps/web/src/api/schema.d.ts');
  run(openapiCli, [join(temporary, 'schema.json'), '-o', output]);
  run(prettierCli, [
    '--config',
    join(root, '.prettierrc.json'),
    '--write',
    output,
  ]);
  if (
    check &&
    (await readFile(output, 'utf8')) !==
      (await readFile(join(root, 'apps/web/src/api/schema.d.ts'), 'utf8'))
  ) {
    throw new Error('OpenAPI types are outdated; run pnpm api:types');
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
