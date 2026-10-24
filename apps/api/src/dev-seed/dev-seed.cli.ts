import type { SeedSummary } from './dev-seed.js';
import {
  assertAllowedSeedRuntime,
  validateDevSeedCommandEnvironment,
} from './dev-seed.js';
import {
  MAX_INCIDENT_COUNT,
  SEED_PROFILES,
  type SeedProfile,
} from './dev-seed.plan.js';

export const CLEANUP_CONFIRMATION = 'BORRAR SOLO DATOS SEED';

export type DevSeedCliDependencies = {
  loadDatabaseUrl: () => string;
  confirmCleanup: () => Promise<boolean>;
  seed: (
    url: string,
    incidentCount: number,
    profile?: SeedProfile,
  ) => Promise<SeedSummary>;
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
  const profileName = environment.NEXTRIVA_SEED_PROFILE;
  if (profileName !== undefined && !Object.hasOwn(SEED_PROFILES, profileName))
    throw new Error('Perfil del seed inválido.');
  const profile = (profileName ?? 'small') as SeedProfile;
  const configured = environment.NEXTRIVA_SEED_INCIDENT_COUNT;
  if (profile !== 'small' && configured !== undefined)
    throw new Error('No combines perfil y cantidad de incidencias.');
  if (configured !== undefined && !/^(0|[1-9]\d*)$/.test(configured))
    throw new Error('Cantidad de incidencias del seed inválida.');
  const incidentCount =
    configured === undefined
      ? SEED_PROFILES[profile].incidents
      : Number(configured);
  if (
    !Number.isSafeInteger(incidentCount) ||
    incidentCount > MAX_INCIDENT_COUNT
  )
    throw new Error('Cantidad de incidencias del seed inválida.');
  return profileName === undefined
    ? dependencies.seed(url, incidentCount)
    : dependencies.seed(url, incidentCount, profile);
}
