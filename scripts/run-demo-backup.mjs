import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backupDemoPostgres,
  createDockerDump,
  createProtonTransport,
} from './backup-demo-postgres.mjs';

export async function runDemoBackup({
  environment = process.env,
  createDump = createDockerDump,
  createTransport = createProtonTransport,
  backup = backupDemoPostgres,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const stateDirectory = environment.NEXTRIVA_BACKUP_STATE_DIRECTORY;
    if (
      typeof stateDirectory !== 'string' ||
      !isAbsolute(stateDirectory) ||
      resolve(stateDirectory) !== stateDirectory
    ) {
      throw new Error('Invalid backup configuration');
    }
    const transport = createTransport({
      executable: environment.NEXTRIVA_PROTON_EXECUTABLE,
      remoteDirectory: environment.NEXTRIVA_PROTON_REMOTE_DIRECTORY,
    });
    const result = await backup({
      stateDirectory,
      dump: createDump(),
      transport,
      prune: false,
    });
    if (result?.verified !== true) throw new Error('Unverified backup');
    stdout.write('Demo backup verified\n');
    return 0;
  } catch {
    stderr.write('Demo backup failed\n');
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runDemoBackup();
}
