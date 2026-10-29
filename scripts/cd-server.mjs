import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deployRelease,
  deploymentDiagnostic,
  DeploymentFailure,
} from './cd-deploy.mjs';
import { assertRequest } from './cd-policy.mjs';
import {
  createRuntime,
  privateFile,
  protectedDirectory,
} from './cd-runtime.mjs';

export async function finishServer(
  { result, failure, dockerDirectory },
  { remove = rm, stdout = process.stdout, stderr = process.stderr } = {},
) {
  try {
    if (dockerDirectory)
      await remove(dockerDirectory, { recursive: true, force: true });
  } catch {
    failure ??= new DeploymentFailure('cleanup');
  }
  if (failure) {
    stderr.write(
      JSON.stringify({ cdDiagnostic: deploymentDiagnostic(failure) }) + '\n',
    );
    return 1;
  }
  stdout.write(JSON.stringify(result) + '\n');
  return 0;
}

export async function runServer() {
  let dockerDirectory;
  let result;
  let failure;
  try {
    if (process.getuid() !== 0 || process.argv.length !== 2)
      throw new Error('Invocación no autorizada');
    await protectedDirectory(dirname(fileURLToPath(import.meta.url)));
    await protectedDirectory('/etc/nextriva-cd');
    const config = JSON.parse(
      await privateFile('/etc/nextriva-cd/config.json'),
    );
    const keys = [
      'composeFile',
      'composeEnv',
      'stateDirectory',
      'databaseId',
      'databaseVolume',
    ];
    if (
      Object.keys(config).length !== keys.length ||
      Object.keys(config).some((key) => !keys.includes(key)) ||
      !/^[a-f0-9]{64}$/.test(config.databaseId) ||
      !/^[A-Za-z0-9_-]+$/.test(config.databaseVolume)
    )
      throw new Error('Configuración inválida');
    for (const path of [config.composeFile, config.composeEnv]) {
      await protectedDirectory(dirname(path));
      await privateFile(path);
    }
    await protectedDirectory(config.stateDirectory);
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 16384)
        throw new Error('Petición demasiado grande');
    }
    const envelope = JSON.parse(input);
    if (
      Object.keys(envelope).sort().join(',') !== 'request,verificationToken' ||
      typeof envelope.verificationToken !== 'string' ||
      !/^\w{20,4096}$/.test(envelope.verificationToken)
    )
      throw new Error('Credencial efímera inválida');
    assertRequest(envelope.request);
    dockerDirectory = await mkdtemp(join(config.stateDirectory, '.docker-'));
    result = await deployRelease(
      envelope.request,
      createRuntime(config, envelope.verificationToken, dockerDirectory),
    );
  } catch (error) {
    failure = error;
  }
  return finishServer({ result, failure, dockerDirectory });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runServer();
