type TestDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'TEST_DATABASE_URL'>
>;
type DevelopmentDatabaseEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'DATABASE_URL'>
>;

const TEST_DATABASE_ERROR =
  'TEST_DATABASE_URL must target the local nextriva_test database';
const DEVELOPMENT_DATABASE_ERROR =
  'DATABASE_URL must target the local nextriva_dev database';

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
