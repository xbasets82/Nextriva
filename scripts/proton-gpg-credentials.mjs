import { spawn } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYGRIP_PATTERN = /^[a-f0-9]{40}$/i;
const MAX_CREDENTIAL_BYTES = 16 * 1024;

export function gpgCommandEnvironment(home = homedir(), source = process.env) {
  const environment = { PATH: '/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8' };
  for (const name of ['GNUPGHOME', 'XDG_RUNTIME_DIR']) {
    const value = source[name];
    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      !isAbsolute(value) ||
      resolve(value) !== value ||
      /[\r\n\0]/u.test(value)
    ) {
      throw new Error('Invalid GPG environment');
    }
    environment[name] = value;
  }
  return environment;
}

async function runPresetCommand({ executable, args, input }) {
  return new Promise((resolveRun, rejectRun) => {
    const captureResponse = args[0]?.startsWith('CLEAR_PASSPHRASE ');
    const response = Buffer.alloc(captureResponse ? 4096 : 0);
    let responseBytes = 0;
    let overflow = false;
    const child = spawn(executable, args, {
      shell: false,
      env: gpgCommandEnvironment(),
      stdio: ['pipe', captureResponse ? 'pipe' : 'ignore', 'ignore'],
    });
    child.stdout?.on('data', (chunk) => {
      if (responseBytes + chunk.length > response.length) {
        overflow = true;
        child.kill();
      } else {
        chunk.copy(response, responseBytes);
        responseBytes += chunk.length;
      }
      chunk.fill(0);
    });
    child.once('error', () => {
      response.fill(0);
      rejectRun(new Error('GPG preset failed'));
    });
    child.once('close', (code) => {
      // El código de salida de Assuan no garantiza que se haya limpiado la caché.
      const acknowledged =
        !captureResponse ||
        (!overflow &&
          response.subarray(0, responseBytes).equals(Buffer.from('OK'))) ||
        (!overflow &&
          response.subarray(0, responseBytes).equals(Buffer.from('OK\n')));
      response.fill(0);
      if (code === 0 && acknowledged) resolveRun();
      else rejectRun(new Error('GPG preset failed'));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function validatePresetOptions(
  { keygrip, executable },
  command = 'gpg-preset-passphrase',
) {
  if (
    typeof keygrip !== 'string' ||
    !KEYGRIP_PATTERN.test(keygrip) ||
    typeof executable !== 'string' ||
    !isAbsolute(executable) ||
    resolve(executable) !== executable ||
    /[\r\n\0]/u.test(executable) ||
    basename(executable) !== command
  ) {
    throw new Error('Invalid GPG preset configuration');
  }
}

async function readCredential(credentialsDirectory) {
  if (
    typeof credentialsDirectory !== 'string' ||
    !isAbsolute(credentialsDirectory) ||
    resolve(credentialsDirectory) !== credentialsDirectory ||
    (await realpath(credentialsDirectory)) !== credentialsDirectory
  ) {
    throw new Error('Invalid GPG credential directory');
  }
  const credentialPath = join(credentialsDirectory, 'proton-gpg-passphrase');
  const metadata = await lstat(credentialPath);
  const permissions = metadata.mode & 0o7777;
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (permissions & ~0o440) !== 0 ||
    (permissions & 0o440) === 0 ||
    metadata.size === 0 ||
    metadata.size > MAX_CREDENTIAL_BYTES
  ) {
    throw new Error('Invalid GPG credential file');
  }
  const credential = await readFile(credentialPath);
  if (credential.includes(0)) {
    credential.fill(0);
    throw new Error('Invalid GPG credential file');
  }
  return credential;
}

export async function unlockProtonGpg(options, run = runPresetCommand) {
  validatePresetOptions(options ?? {});
  let credential;
  try {
    credential = await readCredential(options.credentialsDirectory);
    await run({
      executable: options.executable,
      args: ['--preset', options.keygrip],
      input: credential,
    });
  } catch {
    throw new Error('GPG credential unlock failed');
  } finally {
    credential?.fill(0);
  }
}

export async function forgetProtonGpg(options, run = runPresetCommand) {
  validatePresetOptions(options ?? {}, 'gpg-connect-agent');
  try {
    await run({
      executable: options.executable,
      args: [`CLEAR_PASSPHRASE ${options.keygrip}`, '/bye'],
    });
  } catch {
    throw new Error('GPG credential cleanup failed');
  }
}

async function main() {
  const action = process.argv[2];
  const options = {
    credentialsDirectory: process.env.CREDENTIALS_DIRECTORY,
    keygrip: process.env.NEXTRIVA_GPG_KEYGRIP,
    executable:
      action === 'forget'
        ? process.env.NEXTRIVA_GPG_AGENT_EXECUTABLE
        : process.env.NEXTRIVA_GPG_PRESET_EXECUTABLE,
  };
  if (action === 'unlock') await unlockProtonGpg(options);
  else if (action === 'forget') await forgetProtonGpg(options);
  else throw new Error('Invalid GPG credential action');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write('GPG credential operation failed\n');
    process.exitCode = 1;
  });
}
