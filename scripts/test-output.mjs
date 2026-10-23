import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  ftruncateSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const MAX_OUTPUT_LINE_LENGTH = 64 * 1024;

function closeReservedServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        release: () => closeReservedServer(server),
      });
    });
  });
}

export async function resolveInteractiveUiPorts(
  environment,
  reservePort = reserveLoopbackPort,
) {
  const selected = { ...environment };
  const keys = ['NEXTRIVA_E2E_API_PORT', 'NEXTRIVA_E2E_WEB_PORT'];
  const reservations = [];
  try {
    for (const key of keys) {
      if (selected[key] !== undefined) continue;
      let reservation;
      do {
        reservation = await reservePort();
        reservations.push(reservation);
      } while (
        keys.some((other) => Number(selected[other]) === reservation.port)
      );
      selected[key] = String(reservation.port);
    }
    return selected;
  } finally {
    await Promise.all(reservations.map((reservation) => reservation.release()));
  }
}

function redactionPatterns(values) {
  const secrets = new Set();
  for (const value of values) {
    if (!value) continue;
    for (const form of [
      value,
      decodeURIComponent(value),
      encodeURIComponent(value),
    ]) {
      secrets.add(form);
      secrets.add(JSON.stringify(form).slice(1, -1));
    }
  }
  return [...secrets]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

export function createTestOutputRedactor(connectionString) {
  const url = new URL(connectionString);
  const patterns = [
    ...redactionPatterns([connectionString]),
    '\\bpostgres(?:ql)?:\\/\\/[^\\s"\'<>]+',
    ...redactionPatterns([url.username, url.password]),
  ];
  const sensitive = new RegExp(patterns.join('|'), 'gi');
  return (text) =>
    stripVTControlCharacters(text).replace(sensitive, '[REDACTED]');
}

export function spawnRedactedSync(command, args, options, redact) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    error: Boolean(result.error),
    stdout: result.error ? '' : redact(result.stdout ?? ''),
    stderr: result.error ? '' : redact(result.stderr ?? ''),
  };
}

function createStreamingRedactedWriter(redact, output) {
  let pending = '';
  let discardingLongLine = false;

  return (chunk, flush = false) => {
    let value = pending + chunk.toString('utf8');
    pending = '';

    while (value.length > 0) {
      const delimiter = value.search(/[\r\n]/);
      if (delimiter === -1) break;

      const line = value.slice(0, delimiter + 1);
      if (!discardingLongLine) output.write(redact(line));
      discardingLongLine = false;
      value = value.slice(delimiter + 1);
    }

    if (discardingLongLine) {
      if (value.length > 0) return;
    } else if (value.length > MAX_OUTPUT_LINE_LENGTH) {
      output.write('[OUTPUT LINE OMITTED: length limit exceeded]\n');
      discardingLongLine = true;
      value = '';
    }

    pending = value;
    if (flush) {
      if (!discardingLongLine && pending.length > 0) {
        output.write(redact(pending));
      }
      pending = '';
      discardingLongLine = false;
    }
  };
}

function signalGroup(pid, signal) {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };

export function createInteractiveSetupSignalGuard(signalSource = process) {
  let receivedSignal;
  const onInterrupt = () => {
    receivedSignal ??= 'SIGINT';
  };
  const onTerminate = () => {
    receivedSignal ??= 'SIGTERM';
  };

  signalSource.on('SIGINT', onInterrupt);
  signalSource.on('SIGTERM', onTerminate);

  return {
    throwIfInterrupted() {
      if (receivedSignal) {
        throw new Error(
          `Interactive E2E setup interrupted by ${receivedSignal}`,
        );
      }
    },
    dispose() {
      signalSource.removeListener('SIGINT', onInterrupt);
      signalSource.removeListener('SIGTERM', onTerminate);
    },
  };
}

export function spawnRedactedInteractive(
  command,
  args,
  options,
  redact,
  {
    spawnProcess = spawn,
    signalSource = process,
    signalGroup: sendSignalGroup = signalGroup,
    stdout = process.stdout,
    stderr = process.stderr,
    onStart = () => {},
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    shutdownGraceMs = 5000,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      ...options,
      detached: process.platform !== 'win32',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const writeStdout = createStreamingRedactedWriter(redact, stdout);
    const writeStderr = createStreamingRedactedWriter(redact, stderr);
    let receivedSignal;
    let shutdownTimer;
    let settled = false;
    let startupError;

    const onSpawn = () => {
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return;
      try {
        onStart(child.pid);
      } catch {
        startupError = new Error('Could not register Playwright UI process');
        onSignal('SIGTERM');
      }
    };

    const onInterrupt = () => onSignal('SIGINT');
    const onTerminate = () => onSignal('SIGTERM');

    const cleanupListeners = () => {
      signalSource.removeListener('SIGINT', onInterrupt);
      signalSource.removeListener('SIGTERM', onTerminate);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
      child.removeListener('spawn', onSpawn);
      if (shutdownTimer) clearTimer(shutdownTimer);
    };

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      writeStdout('', true);
      writeStderr('', true);
      callback(value);
    };

    const onSignal = (signal) => {
      if (receivedSignal) return;
      receivedSignal = signal;
      if (Number.isInteger(child.pid)) {
        try {
          sendSignalGroup(child.pid, signal);
          shutdownTimer = setTimer(() => {
            try {
              sendSignalGroup(child.pid, 'SIGKILL');
            } catch {
              // The child group may exit between the grace period and escalation.
            }
          }, shutdownGraceMs);
          shutdownTimer.unref?.();
        } catch {
          // close/error still resolves lifecycle cleanup if the group already exited.
        }
      }
    };

    const onError = () => {
      finish(reject, new Error(`Could not start ${command}`));
    };

    const onClose = (code, childSignal) => {
      if (startupError) {
        finish(reject, startupError);
        return;
      }
      const signal = receivedSignal ?? childSignal;
      const status =
        signal === null || signal === undefined
          ? (code ?? 1)
          : (signalExitCodes[signal] ?? 1);
      finish(resolve, { status, signal: signal ?? null });
    };

    signalSource.on('SIGINT', onInterrupt);
    signalSource.on('SIGTERM', onTerminate);
    child.on('error', onError);
    child.on('close', onClose);
    child.on('spawn', onSpawn);
    child.stdout.on('data', writeStdout);
    child.stderr.on('data', writeStderr);
  });
}

export async function withRedactedDatabaseErrors(operation, redact) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      redact(
        error instanceof Error ? error.message : 'Database operation failed',
      ),
    );
  }
}

export const DEFAULT_TEST_UI_SESSION_DIRECTORY = join(
  tmpdir(),
  'nextriva-playwright-ui-sessions',
);

const TEMPORARY_DATABASE = /^nextriva_test_i\d{2}_\d{1,2}_([a-f0-9]{32})$/;
const SESSION_ID = /^[a-f0-9]{32}$/;
const MARKER_FILE = /^([a-f0-9]{32})\.json$/;
const MARKER_MAX_BYTES = 2048;

function currentUid() {
  if (typeof process.getuid !== 'function') {
    throw new Error('Playwright UI session registry requires a local user id');
  }
  return process.getuid();
}

function assertOwnedDirectory(directory, create) {
  if (create) mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!existsSync(directory)) return false;

  let metadata;
  try {
    metadata = lstatSync(directory);
  } catch {
    throw new Error('Unsafe Playwright UI session registry');
  }
  if (
    !metadata.isDirectory() ||
    metadata.uid !== currentUid() ||
    (metadata.mode & 0o777) !== 0o700
  ) {
    throw new Error('Unsafe Playwright UI session registry');
  }
  return true;
}

function validateUiSessionRecord(record, expectedSessionId) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return false;
  }
  const keys = Object.keys(record).sort();
  if (
    keys.join(',') !==
    'createdAt,databaseName,processGroupId,runnerPid,sessionId,version'
  ) {
    return false;
  }
  const databaseMatch = TEMPORARY_DATABASE.exec(record.databaseName);
  return (
    record.version === 1 &&
    record.sessionId === expectedSessionId &&
    SESSION_ID.test(record.sessionId) &&
    databaseMatch?.[1] === expectedSessionId &&
    Number.isSafeInteger(record.runnerPid) &&
    record.runnerPid > 0 &&
    (record.processGroupId === null ||
      (Number.isSafeInteger(record.processGroupId) &&
        record.processGroupId > 0)) &&
    Number.isSafeInteger(record.createdAt) &&
    record.createdAt > 0
  );
}

function makeUiSessionRecord(databaseName, runnerPid) {
  const sessionId = TEMPORARY_DATABASE.exec(databaseName)?.[1];
  if (!sessionId || !Number.isSafeInteger(runnerPid) || runnerPid <= 0) {
    throw new Error('Invalid Playwright UI session identity');
  }
  return {
    version: 1,
    sessionId,
    databaseName,
    runnerPid,
    processGroupId: null,
    createdAt: Date.now(),
  };
}

function uiSessionMarkerPath(directory, sessionId) {
  return join(directory, `${sessionId}.json`);
}

function sameOwnedUiMarker(path, expected) {
  try {
    const metadata = lstatSync(path);
    return (
      metadata.isFile() &&
      metadata.dev === expected.dev &&
      metadata.ino === expected.ino &&
      metadata.uid === currentUid() &&
      (metadata.mode & 0o777) === 0o600
    );
  } catch {
    return false;
  }
}

export function createTestUiSessionMarker(
  databaseName,
  {
    directory = DEFAULT_TEST_UI_SESSION_DIRECTORY,
    runnerPid = process.pid,
  } = {},
) {
  assertOwnedDirectory(directory, true);
  const record = makeUiSessionRecord(databaseName, runnerPid);
  const path = uiSessionMarkerPath(directory, record.sessionId);
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch {
    throw new Error('Could not create Playwright UI session marker');
  }
  const identity = fstatSync(descriptor);

  const persist = () => {
    const serialized = JSON.stringify(record);
    ftruncateSync(descriptor, 0);
    writeSync(descriptor, serialized, 0, 'utf8');
    fsyncSync(descriptor);
  };
  persist();

  let closed = false;
  return {
    path,
    updateProcessGroup(processGroupId) {
      if (
        closed ||
        !Number.isSafeInteger(processGroupId) ||
        processGroupId <= 0
      ) {
        throw new Error('Invalid Playwright UI process group');
      }
      record.processGroupId = processGroupId;
      persist();
    },
    close() {
      if (!closed) {
        closeSync(descriptor);
        closed = true;
      }
    },
    remove() {
      if (sameOwnedUiMarker(path, identity)) unlinkSync(path);
      if (!closed) {
        closeSync(descriptor);
        closed = true;
      }
    },
  };
}

function readUiSessionMarker(path, sessionId) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.uid !== currentUid() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > MARKER_MAX_BYTES
    ) {
      return null;
    }
    const record = JSON.parse(readFileSync(descriptor, 'utf8'));
    return validateUiSessionRecord(record, sessionId)
      ? { record, identity: { dev: metadata.dev, ino: metadata.ino } }
      : null;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function isProcessActive(pid, isGroup) {
  if (!pid) return false;
  try {
    process.kill(isGroup ? -pid : pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function recoverOwnedStaleUiSession(
  admin,
  path,
  marker,
  processIsActive,
) {
  const isActive = () =>
    processIsActive(marker.record.runnerPid, false) ||
    processIsActive(marker.record.processGroupId, true);
  if (isActive()) return false;

  const databaseName = marker.record.databaseName;
  const lock = await admin.query(
    'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
    [databaseName],
  );
  if (lock.rows?.[0]?.locked !== true) return false;

  try {
    if (isActive()) return false;
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    if (!sameOwnedUiMarker(path, marker.identity)) return false;
    unlinkSync(path);
    return true;
  } finally {
    await admin.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
      databaseName,
    ]);
  }
}

export async function recoverStaleTestUiSessions(
  admin,
  {
    directory = DEFAULT_TEST_UI_SESSION_DIRECTORY,
    isProcessActive: processIsActive = isProcessActive,
  } = {},
) {
  if (!assertOwnedDirectory(directory, false)) {
    return { cleaned: 0, skipped: 0 };
  }

  let cleaned = 0;
  let skipped = 0;
  for (const entry of readdirSync(directory)) {
    const match = MARKER_FILE.exec(entry);
    if (!match) continue;
    const path = join(directory, entry);
    const marker = readUiSessionMarker(path, match[1]);
    if (!marker) {
      skipped += 1;
      continue;
    }

    const recovered = await recoverOwnedStaleUiSession(
      admin,
      path,
      marker,
      processIsActive,
    );
    if (recovered) cleaned += 1;
    else skipped += 1;
  }

  return { cleaned, skipped };
}
