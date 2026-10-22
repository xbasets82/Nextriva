import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

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
