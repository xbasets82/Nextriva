import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { getTestDatabaseUrl } from '../apps/api/src/database/database-url.ts';

function readLocalConfiguration(repositoryRoot) {
  let descriptor;
  try {
    descriptor = openSync(
      resolve(repositoryRoot, '.env.test.local'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Set TEST_DATABASE_URL or configure the ignored .env.test.local file',
      );
    }
    throw new Error('Cannot securely read .env.test.local');
  }

  try {
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      typeof process.getuid !== 'function' ||
      metadata.uid !== process.getuid() ||
      (metadata.mode & 0o777) !== 0o600
    ) {
      throw new Error(
        'Unsafe .env.test.local: require an owned regular file with mode 0600',
      );
    }
    if (metadata.size > 8192) {
      throw new Error('Invalid .env.test.local: configuration is too large');
    }
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

export function resolveTestDatabaseConfig(
  repositoryRoot,
  environment = process.env,
) {
  if (environment.DATABASE_URL !== undefined) {
    throw new Error('Integration tests must not receive DATABASE_URL');
  }
  if (environment.TEST_DATABASE_URL !== undefined) {
    return { url: getTestDatabaseUrl(environment), source: 'environment' };
  }

  const assignments = readLocalConfiguration(repositoryRoot)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const match = assignments[0]?.match(
    /^TEST_DATABASE_URL=(postgres(?:ql)?:\/\/[^\s"'`]+)$/,
  );
  if (assignments.length !== 1 || !match) {
    throw new Error(
      'Invalid .env.test.local: use one unquoted TEST_DATABASE_URL assignment only',
    );
  }
  return {
    url: getTestDatabaseUrl({ TEST_DATABASE_URL: match[1] }),
    source: 'file',
  };
}
