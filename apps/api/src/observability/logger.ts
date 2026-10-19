import pino, { type DestinationStream, type Logger } from 'pino';

const REDACTED_FIELDS = [
  'authorization',
  'cookie',
  'cookies',
  'password',
  'token',
  'tokens',
  'tokens.*',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'apiToken',
  'databaseUrl',
  'databaseURL',
  'database_url',
  'DATABASE_URL',
  'connectionString',
  'body',
  'req.body',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["set-cookie"]',
  'req.headers["x-access-token"]',
  'req.headers["x-auth-token"]',
  'headers.cookie',
  'headers.authorization',
  'headers["set-cookie"]',
  'headers["x-access-token"]',
  'headers["x-auth-token"]',
];

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: 'info',
      redact: { paths: REDACTED_FIELDS, remove: true },
    },
    destination,
  );
}
