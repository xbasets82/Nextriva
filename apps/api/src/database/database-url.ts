type TestDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'TEST_DATABASE_URL'>
>;
type DevelopmentDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'DATABASE_URL'>
>;
type TemporaryMigrationDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'NEXTRIVA_MIGRATION_DATABASE_URL'>
>;
type TemporaryBootstrapDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'NEXTRIVA_BOOTSTRAP_DATABASE_URL'>
>;
type BootstrapDatabaseEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'NODE_ENV'
    | 'AUTH_DATABASE_MODE'
    | 'DATABASE_URL'
    | 'NEXTRIVA_BOOTSTRAP_DATABASE_URL'
  >
>;
type ApplicationDatabaseEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'NODE_ENV'
    | 'AUTH_DATABASE_MODE'
    | 'DATABASE_URL'
    | 'NEXTRIVA_MIGRATION_DATABASE_URL'
  >
>;

const TEST_DATABASE_ERROR =
  'TEST_DATABASE_URL must target the local nextriva_test database';
const DEVELOPMENT_DATABASE_ERROR =
  'DATABASE_URL must target the local nextriva_dev database';
const TEMPORARY_MIGRATION_DATABASE_ERROR =
  'NEXTRIVA_MIGRATION_DATABASE_URL must target an isolated local test database';
const TEMPORARY_BOOTSTRAP_DATABASE_ERROR =
  'NEXTRIVA_BOOTSTRAP_DATABASE_URL must target an isolated local test database';
const ISOLATED_BOOTSTRAP_MODE_ERROR =
  'Test bootstrap requires isolated-test mode and a temporary database URL';
const ISOLATED_RUNTIME_MODE_ERROR =
  'Test runtime requires isolated-test mode and a temporary database URL';

function getLocalDatabaseUrl(
  connectionString: string | undefined,
  database: string,
  port: string,
  errorMessage: string,
): string {
  if (!connectionString) {
    throw new Error(errorMessage);
  }

  try {
    const url = new URL(connectionString);
    const isLocalHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const hasExpectedDatabase = url.pathname === `/${database}`;
    const hasExpectedPort = url.port === port;
    const hasCredentials = url.username.length > 0 && url.password.length > 0;
    const hasNoOverrides = url.search.length === 0 && url.hash.length === 0;

    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !isLocalHost ||
      !hasExpectedPort ||
      !hasExpectedDatabase ||
      !hasCredentials ||
      !hasNoOverrides
    ) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }

  return connectionString;
}

export function getDevelopmentDatabaseUrl(
  environment: DevelopmentDatabaseEnvironment = process.env,
): string {
  return getLocalDatabaseUrl(
    environment.DATABASE_URL,
    'nextriva_dev',
    '5432',
    DEVELOPMENT_DATABASE_ERROR,
  );
}

export function getTestDatabaseUrl(
  environment: TestDatabaseEnvironment = process.env,
): string {
  return getLocalDatabaseUrl(
    environment.TEST_DATABASE_URL,
    'nextriva_test',
    '5433',
    TEST_DATABASE_ERROR,
  );
}

function validateTemporaryDatabaseUrl(
  connectionString: string | undefined,
  errorMessage: string,
): string {
  if (!connectionString) {
    throw new Error(errorMessage);
  }

  try {
    const url = new URL(connectionString);
    const isLocalHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const hasIsolatedDatabaseName =
      /^\/nextriva_test_i\d{2}_\d{1,2}_[a-f0-9]{32}$/i.test(url.pathname);
    const hasCredentials = url.username.length > 0 && url.password.length > 0;
    const hasExpectedPort = url.port === '5433';
    const hasNoOverrides = url.search.length === 0 && url.hash.length === 0;

    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !isLocalHost ||
      !hasExpectedPort ||
      !hasIsolatedDatabaseName ||
      !hasCredentials ||
      !hasNoOverrides
    ) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }

  return connectionString;
}

export function getTemporaryMigrationDatabaseUrl(
  environment: TemporaryMigrationDatabaseEnvironment = process.env,
): string {
  return validateTemporaryDatabaseUrl(
    environment.NEXTRIVA_MIGRATION_DATABASE_URL,
    TEMPORARY_MIGRATION_DATABASE_ERROR,
  );
}

export function getTemporaryBootstrapDatabaseUrl(
  environment: TemporaryBootstrapDatabaseEnvironment = process.env,
): string {
  return validateTemporaryDatabaseUrl(
    environment.NEXTRIVA_BOOTSTRAP_DATABASE_URL,
    TEMPORARY_BOOTSTRAP_DATABASE_ERROR,
  );
}

export function getApplicationDatabaseUrl(
  environment: ApplicationDatabaseEnvironment = process.env,
): string {
  if (
    environment.NODE_ENV === 'test' ||
    environment.AUTH_DATABASE_MODE === 'isolated-test'
  ) {
    if (
      !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
      environment.AUTH_DATABASE_MODE !== 'isolated-test'
    ) {
      throw new Error(ISOLATED_RUNTIME_MODE_ERROR);
    }
    return getTemporaryMigrationDatabaseUrl(environment);
  }

  return getDevelopmentDatabaseUrl(environment);
}

export function resolveBootstrapDatabaseUrl(
  environment: BootstrapDatabaseEnvironment = process.env,
): string {
  if (
    environment.NODE_ENV === 'test' ||
    environment.AUTH_DATABASE_MODE === 'isolated-test'
  ) {
    if (
      !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
      environment.AUTH_DATABASE_MODE !== 'isolated-test'
    ) {
      throw new Error(ISOLATED_BOOTSTRAP_MODE_ERROR);
    }
    return getTemporaryBootstrapDatabaseUrl(environment);
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error(ISOLATED_BOOTSTRAP_MODE_ERROR);
  }

  return getDevelopmentDatabaseUrl(environment);
}
