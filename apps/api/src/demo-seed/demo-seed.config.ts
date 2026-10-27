import { getDemoDatabaseUrl } from '../database/database-url.js';

export function validateDemoSeedEnvironment(
  environment: NodeJS.ProcessEnv,
): string {
  if (
    environment.CI !== undefined ||
    environment.TEST_DATABASE_URL !== undefined ||
    environment.NEXTRIVA_MIGRATION_DATABASE_URL !== undefined ||
    environment.NEXTRIVA_BOOTSTRAP_DATABASE_URL !== undefined ||
    environment.NEXTRIVA_DEMO_CONFIRM !== 'INITIALIZE EMPTY DEMO'
  )
    throw new Error(
      'La inicialización DEMO requiere confirmación explícita y está prohibida en CI/test.',
    );
  return getDemoDatabaseUrl(environment);
}
