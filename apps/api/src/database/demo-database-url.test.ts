import { expect, it } from 'vitest';
import { getApplicationDatabaseUrl } from './database-url.js';

it('accepts an explicit separate local DEMO destination in production runtime', () => {
  const url = 'postgresql://demo:synthetic@postgres:5432/nextriva_demo';
  expect(
    getApplicationDatabaseUrl({
      NODE_ENV: 'production',
      AUTH_DATABASE_MODE: 'demo',
      DATABASE_URL: url,
    }),
  ).toBe(url);
});

it.each([
  'postgresql://demo:synthetic@postgres:5432/nextriva_production',
  'postgresql://demo:synthetic@127.0.0.1:5432/nextriva_dev',
  'postgresql://demo:synthetic@127.0.0.1:5433/nextriva_test',
  'postgresql://demo:synthetic@db.example.com:5432/nextriva_demo',
  'postgresql://demo:synthetic@postgres:5432/nextriva_demo?host=evil.invalid',
])(
  'rejects other destinations in explicit DEMO mode without exposing connection details',
  (url) => {
    expect(() =>
      getApplicationDatabaseUrl({
        NODE_ENV: 'production',
        AUTH_DATABASE_MODE: 'demo',
        DATABASE_URL: url,
      }),
    ).toThrow('DEMO');
  },
);
