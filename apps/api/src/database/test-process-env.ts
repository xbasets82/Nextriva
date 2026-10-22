type TestProcessOverrides = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'NEXTRIVA_MIGRATION_DATABASE_URL'
    | 'NEXTRIVA_BOOTSTRAP_DATABASE_URL'
    | 'NEXTRIVA_TEST_USER'
    | 'NEXTRIVA_TEST_PASSWORD'
    | 'AUTH_ORIGIN'
    | 'AUTH_LOCAL_HTTP'
    | 'PORT'
    | 'API_PROXY_TARGET'
  >
>;

const RUNTIME_ENVIRONMENT_KEYS = [
  'NEXTRIVA_E2E_API_PORT',
  'NEXTRIVA_E2E_WEB_PORT',
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CI',
  'TERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'SYSTEMROOT',
  'WINDIR',
] as const;

const TEST_OVERRIDE_KEYS = [
  'NEXTRIVA_MIGRATION_DATABASE_URL',
  'NEXTRIVA_BOOTSTRAP_DATABASE_URL',
  'NEXTRIVA_TEST_USER',
  'NEXTRIVA_TEST_PASSWORD',
  'AUTH_ORIGIN',
  'AUTH_LOCAL_HTTP',
  'PORT',
  'API_PROXY_TARGET',
] as const;

export function createTestProcessEnvironment(
  overrides: TestProcessOverrides = {},
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};

  for (const key of RUNTIME_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }

  for (const key of TEST_OVERRIDE_KEYS) {
    const value = overrides[key];
    if (value !== undefined) environment[key] = value;
  }

  environment.NODE_ENV = 'test';
  environment.AUTH_DATABASE_MODE = 'isolated-test';

  return environment;
}
