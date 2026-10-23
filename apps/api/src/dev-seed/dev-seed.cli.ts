import type { SeedSummary } from './dev-seed.js';
import {
  assertAllowedSeedRuntime,
  validateDevSeedCommandEnvironment,
} from './dev-seed.js';
import { DEFAULT_INCIDENT_COUNT, MAX_INCIDENT_COUNT } from './dev-seed.plan.js';

export const CLEANUP_CONFIRMATION = 'BORRAR SOLO DATOS SEED';

export type DevSeedCliDependencies = {
  loadDatabaseUrl: () => string;
  confirmCleanup: () => Promise<boolean>;
  seed: (url: string, incidentCount: number) => Promise<SeedSummary>;
  clean: (url: string) => Promise<SeedSummary>;
};

export function isCleanupConfirmation(response: string): boolean {
  return response === CLEANUP_CONFIRMATION;
}

export async function runDevSeedCommand(
  operation: 'seed' | 'clean',
  environment: NodeJS.ProcessEnv,
  dependencies: DevSeedCliDependencies,
): Promise<SeedSummary> {
  assertAllowedSeedRuntime(environment);
  const url = validateDevSeedCommandEnvironment({
    ...environment,
    DATABASE_URL: dependencies.loadDatabaseUrl(),
  });
  if (operation === 'clean') {
    if (!(await dependencies.confirmCleanup()))
      throw new Error('Limpieza cancelada: falta confirmación explícita.');
    return dependencies.clean(url);
  }
  const configured = environment.NEXTRIVA_SEED_INCIDENT_COUNT;
  if (configured !== undefined && !/^(0|[1-9]\d*)$/.test(configured))
    throw new Error('Cantidad de incidencias del seed inválida.');
  const incidentCount =
    configured === undefined ? DEFAULT_INCIDENT_COUNT : Number(configured);
  if (
    !Number.isSafeInteger(incidentCount) ||
    incidentCount > MAX_INCIDENT_COUNT
  )
    throw new Error('Cantidad de incidencias del seed inválida.');
  return dependencies.seed(url, incidentCount);
}
