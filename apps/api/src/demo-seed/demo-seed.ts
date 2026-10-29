import { enrichDemoScenarios } from './demo-seed.enrichment.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../users/password-hasher.js';

export const DEMO_READY_MARKER = 'nextriva:demo:ready:v1';
export const DEMO_INITIALIZED_MARKER = 'nextriva:demo:initialized:v1';
const DEMO_ROLES = ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const;
const DEMO_NAMES = {
  ADMIN: 'Administración privada',
  MANAGER: 'Gestión',
  COLLABORATOR: 'Colaboración',
};
export type DemoCredentials = Record<
  (typeof DEMO_ROLES)[number],
  { email: string; password: string }
>;

export function readDemoCredentials(
  environment: NodeJS.ProcessEnv,
): DemoCredentials {
  const credentials = Object.fromEntries(
    DEMO_ROLES.map((role) => [
      role,
      {
        email: environment[`DEMO_${role}_EMAIL`] ?? '',
        password: environment[`DEMO_${role}_PASSWORD`] ?? '',
      },
    ]),
  ) as DemoCredentials;
  if (
    Object.values(credentials).some(
      ({ email, password }) =>
        !/^[a-z0-9._+-]+@demo\.nextriva\.invalid$/.test(email) ||
        password.length < 16 ||
        password.length > 128,
    ) ||
    new Set(Object.values(credentials).map(({ email }) => email)).size !== 3 ||
    new Set(Object.values(credentials).map(({ password }) => password)).size !==
      3
  ) {
    throw new Error(
      'Credenciales DEMO externas inválidas; se requieren cuentas ficticias y contraseñas distintas de 16–128 caracteres.',
    );
  }
  return credentials;
}

// El comando público valida el destino; las pruebas invocan esta operación en su BD temporal propia.
export async function seedDemoData(
  prisma: PrismaClient,
  credentials: DemoCredentials,
  options: { mode?: 'initialize' | 'enrich' } = {},
) {
  if (options.mode === 'enrich')
    return enrichDemoScenarios(prisma, credentials);
  const hasher = new PasswordHasher();
  const hashes = await Promise.all(
    DEMO_ROLES.map((role) => hasher.hash(credentials[role].password)),
  );
  return prisma.$transaction(
    async (transaction) => {
      // Exclusión de todas las tablas de negocio durante el bootstrap, también frente al arranque accidental de API.
      await transaction.$executeRaw`LOCK TABLE users, sessions, promotions, promotion_phases, promotion_participants, incidents, incident_comments, incident_activities IN ACCESS EXCLUSIVE MODE`;
      const destinations = await transaction.$queryRaw<
        { name: string; marker: string | null }[]
      >`
      SELECT datname AS name, shobj_description(oid, 'pg_database') AS marker
      FROM pg_database WHERE datname = current_database()`;
      const destination = destinations[0];
      if (
        !destination ||
        destination.marker !== DEMO_READY_MARKER ||
        !/^[a-z0-9_]{1,63}$/.test(destination.name)
      ) {
        throw new Error(
          'La base debe estar marcada explícitamente como DEMO vacía y pendiente.',
        );
      }
      const counts = await Promise.all([
        transaction.user.count(),
        transaction.session.count(),
        transaction.promotion.count(),
        transaction.promotionPhaseRecord.count(),
        transaction.promotionParticipant.count(),
        transaction.incident.count(),
        transaction.incidentComment.count(),
        transaction.incidentActivity.count(),
      ]);
      if (counts.some((count) => count !== 0))
        throw new Error(
          'La base DEMO debe estar vacía; no se modifica ningún dato existente.',
        );
      const users = await Promise.all(
        DEMO_ROLES.map((role, index) =>
          transaction.user.create({
            data: {
              firstName: 'Demo',
              lastName: DEMO_NAMES[role],
              email: credentials[role].email,
              passwordHash: hashes[index]!,
              role,
            },
          }),
        ),
      );
      const [admin, manager, collaborator] = users;
      if (!admin || !manager || !collaborator)
        throw new Error('Datos DEMO incompletos.');
      const promotion = await transaction.promotion.create({
        data: {
          name: 'DEMO — Jardines del Horizonte',
          location: 'Avenida Ficticia 18, Ciudad de Demostración',
          description:
            'Promoción completamente ficticia para validación de Nextriva.',
          phases: { create: [{ phase: 'CONSTRUCTION' }] },
          participants: {
            create: [{ userId: manager.id }, { userId: collaborator.id }],
          },
        },
      });
      const incident = await transaction.incident.create({
        data: {
          promotionId: promotion.id,
          createdById: collaborator.id,
          originPhase: 'CONSTRUCTION',
          title: 'DEMO — Revisión de acabado en zona común',
          description:
            'Comprobar el acabado del revestimiento de la zona común ficticia.',
          category: 'FINISHES',
          priority: 'MEDIUM',
          activities: {
            create: { actorId: collaborator.id, eventType: 'CREATED' },
          },
        },
      });
      // Solo se interpola un identificador devuelto por PostgreSQL y validado; el marcador es constante.
      await transaction.$executeRawUnsafe(
        `COMMENT ON DATABASE "${destination.name}" IS '${DEMO_INITIALIZED_MARKER}'`,
      );
      return {
        users: users.length,
        promotions: 1,
        incidents: 1,
        incidentId: incident.id,
      };
    },
    { timeout: 15_000 },
  );
}
