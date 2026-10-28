import { constants, createReadStream } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir, userInfo } from 'node:os';
import { gpgCommandEnvironment } from './proton-gpg-credentials.mjs';

function safeRemoteDirectory(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\')
  )
    return false;
  if (
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  const segments = value.slice(1).split('/');
  return (
    segments.length >= 2 &&
    segments.every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..',
    )
  );
}

function assertArtifactName(name) {
  if (
    typeof name !== 'string' ||
    !/^nextriva_demo-\d{8}T\d{6}Z-[a-f0-9]{32}\.dump$/.test(name)
  )
    throw new Error('Invalid backup name');
}

async function assertLocalArtifact(path) {
  if (
    !isAbsolute(path) ||
    resolve(dirname(path)) !== (await realpath(dirname(path)))
  )
    throw new Error('Unsafe local backup');
  await privatePath(dirname(path), true);
  await privatePath(path);
}

async function runProtonCommand(command) {
  return runBackupCommand({
    ...command,
    environment: protonCommandEnvironment(),
  });
}

export function protonCommandEnvironment(
  home = homedir(),
  source = process.env,
) {
  return {
    ...gpgCommandEnvironment(home, source),
    PROTON_DRIVE_CREDENTIALS_STORE: 'pass',
  };
}

export function createProtonTransport(
  { executable, remoteDirectory },
  run = runProtonCommand,
  getUsername = () => userInfo().username,
) {
  if (
    typeof executable !== 'string' ||
    !isAbsolute(executable) ||
    resolve(executable) !== executable ||
    basename(executable) !== 'proton-drive' ||
    !safeRemoteDirectory(remoteDirectory)
  )
    throw new Error('Invalid Proton configuration');
  const flags = [
    '--file-conflict-strategy',
    'skip',
    '--folder-conflict-strategy',
    'skip',
  ];
  const invoke = async (args) => run({ executable, args, shell: false });
  const guard = (name) => {
    if (getUsername() !== 'ubuntu')
      throw new Error('Proton must run as ubuntu');
    assertArtifactName(name);
    return posix.join(remoteDirectory, name);
  };
  return {
    async upload(localPath, name) {
      let staged;
      try {
        guard(name);
        await assertLocalArtifact(localPath);
        const destination = join(dirname(localPath), name);
        await link(localPath, destination);
        staged = destination;
        await invoke([
          'filesystem',
          'upload',
          ...flags,
          staged,
          remoteDirectory,
        ]);
      } catch {
        throw new Error('Proton backup operation failed');
      } finally {
        if (staged) await rm(staged, { force: true });
      }
    },
    async download(name, localPath) {
      let temporary;
      try {
        const remotePath = guard(name);
        await assertLocalArtifact(localPath);
        temporary = await mkdtemp(
          join(dirname(localPath), '.proton-download-'),
        );
        await chmod(temporary, 0o700);
        await invoke([
          'filesystem',
          'download',
          ...flags,
          remotePath,
          temporary,
        ]);
        const received = join(temporary, name);
        const info = await lstat(received);
        if (!info.isFile() || info.isSymbolicLink())
          throw new Error('Unsafe Proton download');
        await chmod(received, 0o600);
        await privatePath(received);
        await rename(received, localPath);
      } catch {
        throw new Error('Proton backup operation failed');
      } finally {
        if (temporary) await rm(temporary, { recursive: true, force: true });
      }
    },
    async trash(name) {
      try {
        await invoke(['filesystem', 'trash', guard(name)]);
      } catch {
        throw new Error('Proton backup operation failed');
      }
    },
  };
}

function stamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

async function runBackupCommand({
  executable,
  args,
  outputPath,
  environment = { PATH: '/usr/bin:/bin', LANG: 'C' },
}) {
  let output;
  try {
    if (outputPath) {
      await privatePath(outputPath);
      output = await open(
        outputPath,
        constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW,
      );
    }
    return await new Promise((resolveRun, rejectRun) => {
      const child = spawn(executable, args, {
        shell: false,
        env: environment,
        stdio: ['ignore', output ? output.fd : 'pipe', 'ignore'],
      });
      let stdout = '';
      let overflow = false;
      child.stdout?.on('data', (chunk) => {
        if (stdout.length + chunk.length > 4096) {
          overflow = true;
          child.kill('SIGKILL');
        } else stdout += chunk.toString('utf8');
      });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
      child.once('error', () => {
        clearTimeout(timeout);
        rejectRun(new Error('Docker backup command failed'));
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 || overflow)
          rejectRun(new Error('Docker backup command failed'));
        else resolveRun({ stdout });
      });
    });
  } finally {
    await output?.close();
  }
}

export function createDockerDump(run = runBackupCommand) {
  return async (outputPath) => {
    const executable = '/usr/bin/sudo';
    const result = await run({
      executable,
      args: [
        '-n',
        '/usr/bin/docker',
        'ps',
        '--filter',
        'label=com.docker.compose.project=nextriva-demo',
        '--filter',
        'label=com.docker.compose.service=postgres',
        '--filter',
        'label=com.docker.compose.oneoff=False',
        '--format',
        '{{.ID}}',
        '--no-trunc',
      ],
    });
    const id = result.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error('Cannot select unique demo PostgreSQL container');
    await run({
      executable,
      args: [
        '-n',
        '/usr/bin/docker',
        'exec',
        id,
        'sh',
        '-ec',
        'test "$POSTGRES_DB" = nextriva_demo; test "$POSTGRES_USER" = postgres; IFS= read -r PGPASSWORD < "$POSTGRES_PASSWORD_FILE" || test -n "$PGPASSWORD"; export PGPASSWORD; exec pg_dump --no-password --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl',
      ],
      outputPath,
    });
  };
}

async function privatePath(path, directory = false) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (info.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw new Error('Unsafe backup state');
}

async function hashFile(path) {
  await privatePath(path);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  if (bytes === 0) throw new Error('Empty backup');
  return hash.digest('hex');
}

async function persistManifest(path, entries) {
  const temporary = `${path}.${randomBytes(16).toString('hex')}.partial`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({ version: 1, entries }) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function assertStateDirectory(stateDirectory) {
  if (
    !isAbsolute(stateDirectory) ||
    resolve(stateDirectory) !== (await realpath(stateDirectory))
  )
    throw new Error('Unsafe backup state');
  const repository = await realpath(
    fileURLToPath(new URL('../', import.meta.url)),
  );
  const fromRepository = relative(repository, stateDirectory);
  if (
    fromRepository === '' ||
    (!fromRepository.startsWith(`..${sep}`) &&
      fromRepository !== '..' &&
      !isAbsolute(fromRepository))
  )
    throw new Error('Backup state must be outside the repository');
  await privatePath(stateDirectory, true);
}

async function loadManifest(manifestPath) {
  try {
    await privatePath(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.version !== 1) throw new Error('Invalid backup manifest');
    return manifest.entries;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

export async function backupDemoPostgres({
  stateDirectory,
  now = new Date(),
  dump,
  transport,
  prune = false,
}) {
  let locked = false;
  let temporary;
  let lock;
  try {
    if (typeof prune !== 'boolean') throw new Error('Invalid pruning option');
    await assertStateDirectory(stateDirectory);
    lock = join(stateDirectory, '.backup-lock');
    await mkdir(lock, { mode: 0o700 });
    locked = true;
    const manifestPath = join(stateDirectory, 'manifest.json');
    let entries = await loadManifest(manifestPath);
    selectRetainedBackups(entries, now);
    if (
      typeof dump !== 'function' ||
      typeof transport?.upload !== 'function' ||
      typeof transport?.download !== 'function' ||
      (prune && typeof transport.trash !== 'function')
    )
      throw new Error('Missing backup adapter');
    temporary = await mkdtemp(join(stateDirectory, '.run-'));
    await chmod(temporary, 0o700);
    const archive = join(temporary, 'archive.dump');
    const downloaded = join(temporary, 'download.dump');
    for (const path of [archive, downloaded]) {
      const file = await open(path, 'wx', 0o600);
      await file.close();
    }
    await dump(archive);
    const sha256 = await hashFile(archive);
    const name = `nextriva_demo-${stamp(now)}-${randomBytes(16).toString('hex')}.dump`;
    await transport.upload(archive, name);
    await transport.download(name, downloaded);
    if ((await hashFile(downloaded)) !== sha256)
      throw new Error('Backup verification failed');
    entries.push({ name, createdAt: now.toISOString(), sha256 });
    const retained = new Set(
      selectRetainedBackups(entries, now).map((entry) => entry.name),
    );
    const pendingPrune = entries
      .filter((entry) => !retained.has(entry.name))
      .map((entry) => entry.name);
    await persistManifest(manifestPath, entries);
    if (prune) {
      for (const candidate of pendingPrune) {
        await transport.trash(candidate);
        entries = entries.filter((entry) => entry.name !== candidate);
        await persistManifest(manifestPath, entries);
      }
    }
    return {
      verified: true,
      name,
      sha256,
      pendingPrune: prune ? [] : pendingPrune,
    };
  } catch {
    throw new Error(
      'Backup failed; pruning stopped. Inspect private state without exposing credentials.',
    );
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    if (locked) await rm(lock, { recursive: true });
  }
}

export function selectRetainedBackups(entries, now) {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Array.isArray(entries)
  ) {
    throw new Error('Invalid backup manifest');
  }
  const names = new Set();
  for (const entry of entries) {
    const date = new Date(entry?.createdAt);
    if (
      !entry ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== entry.createdAt ||
      date > now ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !/^nextriva_demo-\d{8}T\d{6}Z-[a-f0-9]{32}\.dump$/.test(entry.name) ||
      !entry.name.startsWith(`nextriva_demo-${stamp(date)}-`) ||
      names.has(entry.name)
    ) {
      throw new Error('Invalid backup manifest');
    }
    names.add(entry.name);
  }
  const days = new Map();
  for (const entry of [...entries].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name),
  )) {
    const day = entry.createdAt.slice(0, 10);
    if (!days.has(day)) days.set(day, entry);
  }
  const daily = [...days.values()].slice(0, 3);
  const weekly = [...days.values()]
    .filter((entry) => new Date(entry.createdAt).getUTCDay() === 0)
    .slice(0, 2);
  const retained = new Set([...daily, ...weekly].map((entry) => entry.name));
  return [...days.values()].filter((entry) => retained.has(entry.name));
}
