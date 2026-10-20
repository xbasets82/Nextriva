import { resolveBootstrapDatabaseUrl as resolveFromEnvironment } from '../database/database-url.js';

type BootstrapEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'NODE_ENV'
    | 'AUTH_DATABASE_MODE'
    | 'DATABASE_URL'
    | 'NEXTRIVA_BOOTSTRAP_DATABASE_URL'
  >
>;

export function resolveBootstrapDatabaseUrl(
  environment: BootstrapEnvironment,
): string {
  return resolveFromEnvironment(environment);
}

export function createBootstrapDatabaseClient<T>(
  environment: BootstrapEnvironment,
  factory: (connectionString: string) => T,
): T {
  return factory(resolveBootstrapDatabaseUrl(environment));
}
