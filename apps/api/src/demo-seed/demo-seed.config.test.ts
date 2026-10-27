import { expect, it } from 'vitest';
import { validateDemoSeedEnvironment } from './demo-seed.config.js';

const environment = {
  NODE_ENV: 'production',
  AUTH_DATABASE_MODE: 'demo',
  DATABASE_URL: 'postgresql://demo:synthetic@postgres:5432/nextriva_demo',
  NEXTRIVA_DEMO_CONFIRM: 'INITIALIZE EMPTY DEMO',
};

it.each([
  { CI: 'true' },
  { NODE_ENV: 'test' },
  { AUTH_DATABASE_MODE: 'isolated-test' },
  { NEXTRIVA_DEMO_CONFIRM: undefined },
  { TEST_DATABASE_URL: 'forbidden' },
  { NEXTRIVA_MIGRATION_DATABASE_URL: 'forbidden' },
])(
  'rejects implicit, CI and test seed execution before connecting',
  (overrides) => {
    expect(() =>
      validateDemoSeedEnvironment({ ...environment, ...overrides }),
    ).toThrow();
  },
);

it('accepts only explicitly confirmed local DEMO initialization', () => {
  expect(validateDemoSeedEnvironment(environment)).toBe(
    environment.DATABASE_URL,
  );
});
