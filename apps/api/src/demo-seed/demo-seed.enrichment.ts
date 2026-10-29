import { createHash } from 'node:crypto';
import type {
  PrismaClient,
  Prisma,
  PromotionPhase,
  IncidentStatus,
  IncidentCategory,
  IncidentPriority,
  User,
} from '../../generated/prisma/client.js';
import type { DemoCredentials } from './demo-seed.js';

const OWNER = '[DEMO-167]';
export function demoScenarioId(kind: string, index: number): string {
  const bytes = createHash('sha256')
    .update(`nextriva-demo-167-v1:${kind}:${index}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const definitions: {
  name: string;
  phases: PromotionPhase[];
  titles: string[];
}[] = [
  {
    name: 'Patio del Alba',
    phases: ['PLANNING', 'COMMERCIALIZATION'],
    titles: [
      'Ajuste del itinerario accesible del portal',
      'Reserva de patinillo para futuras instalaciones',
      'Revisión de orientación de ventanas',
      'Coordinación de accesos del espacio comunitario',
      'Actualización del trazado de la rampa',
    ],
  },
  {
    name: 'Mirador de Papel',
    phases: ['EXECUTIVE_PROJECT'],
    titles: [
      'Cruce de conductos en el plano de techo',
      'Detalle de impermeabilización de cubierta',
      'Coordinación de cotas de cimentación',
      'Sección de carpintería del vestíbulo',
      'Revisión del aislamiento del cuarto técnico',
    ],
  },
  {
    name: 'Jardines de la Brisa',
    phases: ['CONSTRUCTION'],
    titles: [
      'Canalización eléctrica próxima a bajante',
      'Remate de encuentro entre fachada y cubierta',
      'Fisura superficial en muro de escalera',
      'Anclaje pendiente en barandilla del patio',
      'Sellado incompleto del paso de instalaciones',
    ],
  },
  {
    name: 'Plaza del Horizonte',
    phases: ['PRE_HANDOVER', 'HANDOVER'],
    titles: [
      'Comprobación de presión en red de agua',
      'Rejilla de ventilación pendiente de ajuste',
      'Diferencia de nivel en pavimento del portal',
      'Puerta de acceso con cierre desajustado',
      'Revisión de iluminación del acceso comunitario',
    ],
  },
  {
    name: 'Alameda de Cristal',
    phases: ['AFTER_SALES'],
    titles: [
      'Goteo en unión de tubería del cuarto común',
      'Humedad en encuentro de ventana del portal',
      'Asentamiento de una pieza del pavimento',
      'Ruido intermitente en puerta del garaje',
      'Revisión del acabado tras reparación de filtración',
    ],
  },
  { name: 'Parque del Boceto', phases: ['PLANNING'], titles: [] },
];
const categories: IncidentCategory[] = [
  'INSTALLATIONS',
  'ENVELOPE',
  'STRUCTURE',
  'CARPENTRY',
  'COMMON_AREAS',
];
const priorities: IncidentPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
const states: IncidentStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VALIDATION',
  'CLOSED',
  'IN_PROGRESS',
];

type DemoUser = Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
type DemoPeople = {
  admin: DemoUser;
  manager: DemoUser;
  collaborator: DemoUser;
};
function scenarioContext(
  promotionIndex: number,
  caseIndex: number,
  people: DemoPeople,
) {
  const definition = definitions[promotionIndex]!;
  const index = promotionIndex * 5 + caseIndex;
  const title = definition.titles[caseIndex]!;
  const promotionId = demoScenarioId('promotion', promotionIndex);
  const id = demoScenarioId('incident', index);
  const createdActivityId = demoScenarioId('created-activity', index);
  const time = (hour: number) => new Date(Date.UTC(2026, 8, 1 + index, hour));
  const responsible = index % 2 === 0 ? people.collaborator : people.manager;
  const solution = `Se ha revisado «${title.toLocaleLowerCase('es-ES')}» en la documentación ficticia de ${definition.name}. La comprobación técnica y las fotografías de inspección confirman la corrección del detalle.`;
  const identity = (user: DemoUser) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  });
  const submittedAt = time(4);
  const closedAt = time(6);
  const approvedCycle = {
    identitySnapshotVersion: 1,
    solution,
    solutionSubmittedById: responsible.id,
    solutionSubmittedAt: submittedAt.toISOString(),
    validatedById: people.admin.id,
    closedAt: closedAt.toISOString(),
    submittedBy: identity(responsible),
    validatedBy: identity(people.admin),
  };
  return {
    ...people,
    definition,
    index,
    caseIndex,
    title,
    promotionId,
    id,
    createdActivityId,
    time,
    responsible,
    solution,
    identity,
    submittedAt,
    closedAt,
    approvedCycle,
  };
}
type Scenario = ReturnType<typeof scenarioContext>;
function scenarioActivities(context: Scenario) {
  const {
    index,
    caseIndex,
    time,
    responsible,
    collaborator,
    manager,
    admin,
    createdActivityId,
    definition,
    solution,
    submittedAt,
    approvedCycle,
    identity,
  } = context;
  const events: Prisma.IncidentActivityUncheckedCreateWithoutIncidentInput[] =
    [];
  const event = (
    eventType: Prisma.IncidentActivityUncheckedCreateWithoutIncidentInput['eventType'],
    changes: Prisma.InputJsonValue,
    hour: number,
    actorId = responsible.id,
  ) =>
    events.push({
      id: demoScenarioId(`activity-${events.length}`, index),
      actorId,
      eventType,
      changes,
      createdAt: time(hour),
    });
  events.push({
    id: createdActivityId,
    actorId: collaborator.id,
    eventType: 'CREATED',
    changes: { originPhase: definition.phases[0]! },
    createdAt: time(0),
  });
  event(
    'ASSIGNED',
    { previousAssignedToId: null, assignedToId: responsible.id },
    1,
    manager.id,
  );
  if (caseIndex > 0)
    event(
      'STATUS_CHANGED',
      { previousStatus: 'OPEN', status: 'IN_PROGRESS' },
      2,
    );
  if (caseIndex > 0)
    event('SOLUTION_UPDATED', { previousSolution: null, solution }, 3);
  if (caseIndex > 0)
    event(
      'SOLUTION_SUBMITTED',
      {
        previousStatus: 'IN_PROGRESS',
        status: 'PENDING_VALIDATION',
        solution,
        solutionSubmittedAt: submittedAt.toISOString(),
        submittedBy: identity(responsible),
      },
      4,
    );
  if (caseIndex === 1)
    event(
      'STATUS_CHANGED',
      {
        previousStatus: 'PENDING_VALIDATION',
        status: 'IN_PROGRESS',
        solution,
        solutionSubmittedById: responsible.id,
        solutionSubmittedAt: submittedAt.toISOString(),
        reason:
          'La inspección requiere contrastar la medición con el plano antes de aprobar.',
      },
      5,
      admin.id,
    );
  if (caseIndex >= 3)
    event(
      'STATUS_CHANGED',
      {
        previousStatus: 'PENDING_VALIDATION',
        status: 'CLOSED',
        approvedCycle,
      },
      6,
      admin.id,
    );
  if (caseIndex === 4) {
    event(
      'STATUS_CHANGED',
      {
        snapshotVersion: 1,
        previousStatus: 'CLOSED',
        status: 'IN_PROGRESS',
        previousAssignedToId: responsible.id,
        assignedToId: responsible.id,
        reason:
          'La revisión posterior detecta un ajuste adicional que requiere una nueva validación independiente.',
        approvedCycle,
      },
      8,
      manager.id,
    );
    event(
      'SOLUTION_UPDATED',
      {
        previousSolution: null,
        solution:
          'Nueva revisión en preparación; se conserva la solución del ciclo anterior.',
      },
      9,
    );
  }
  return events;
}
function scenarioData(context: Scenario): Prisma.IncidentUncheckedCreateInput {
  const {
    id,
    promotionId,
    collaborator,
    manager,
    responsible,
    definition,
    title,
    index,
    caseIndex,
    solution,
    submittedAt,
    closedAt,
    time,
    admin,
  } = context;
  const events = scenarioActivities(context);
  const currentSolution = [
    null,
    solution,
    solution,
    solution,
    'Nueva revisión en preparación; se conserva la solución del ciclo anterior.',
  ][caseIndex]!;
  const isSubmitted = caseIndex === 2 || caseIndex === 3;
  return {
    id,
    promotionId,
    createdById: collaborator.id,
    assignedToId: responsible.id,
    originPhase: definition.phases[0]!,
    title,
    description: `${OWNER} En la revisión de ${definition.name}, durante la fase prevista, se ha detectado: ${title.toLocaleLowerCase('es-ES')}. Se solicita contrastar las mediciones con el plano vigente y documentar la comprobación antes del cierre. Todos los datos son ficticios.`,
    category: categories[caseIndex]!,
    priority: priorities[index % 3]!,
    status: states[caseIndex]!,
    solution: currentSolution,
    solutionSubmittedById: isSubmitted ? responsible.id : null,
    solutionSubmittedAt: isSubmitted ? submittedAt : null,
    validatedById: caseIndex === 3 ? admin.id : null,
    closedAt: caseIndex === 3 ? closedAt : null,
    createdAt: time(0),
    updatedAt: time([1, 5, 4, 6, 9][caseIndex]!),
    version: events.length,
    activities: { create: events },
    comments: {
      create: [
        {
          id: demoScenarioId('comment-collaborator', index),
          authorId: collaborator.id,
          body: 'Se ha contrastado el punto señalado con el plano de coordinación ficticio. La observación queda localizada para la siguiente inspección.',
          createdAt: time(1),
        },
        {
          id: demoScenarioId('comment-manager', index),
          authorId: manager.id,
          body: 'Se coordina la revisión con el equipo técnico. La aprobación debe realizarla una persona distinta de quien presenta la solución.',
          createdAt: time(2),
        },
      ],
    },
  };
}
async function addScenario(tx: Prisma.TransactionClient, context: Scenario) {
  const {
    id,
    promotionId,
    collaborator,
    manager,
    createdActivityId,
    index,
    time,
  } = context;
  const existing = await tx.incident.findUnique({
    where: { id },
    include: { activities: { where: { id: createdActivityId } } },
  });
  if (existing) {
    if (
      existing.promotionId !== promotionId ||
      existing.createdById !== collaborator.id ||
      !existing.description.startsWith(OWNER) ||
      existing.activities[0]?.eventType !== 'CREATED'
    )
      throw new Error(
        'Colisión con una incidencia ajena a DEMO; no se modifica ningún registro.',
      );
    return 0;
  }
  await tx.incident.create({ data: scenarioData(context) });
  // Comentarios y auditoría se escriben juntos sin modificar los registros ya existentes.
  for (const [commentIndex, authorId] of [
    collaborator.id,
    manager.id,
  ].entries())
    await tx.incidentActivity.create({
      data: {
        id: demoScenarioId(`comment-activity-${commentIndex}`, index),
        incidentId: id,
        actorId: authorId,
        eventType: 'COMMENT_ADDED',
        changes: {
          commentId: demoScenarioId(
            commentIndex === 0 ? 'comment-collaborator' : 'comment-manager',
            index,
          ),
        },
        createdAt: time(1 + commentIndex),
      },
    });
  return 1;
}
async function addPromotion(
  tx: Prisma.TransactionClient,
  promotionIndex: number,
  people: DemoPeople,
) {
  const { manager, collaborator } = people;
  const definition = definitions[promotionIndex]!;
  const promotionId = demoScenarioId('promotion', promotionIndex);
  const existing = await tx.promotion.findUnique({
    where: { id: promotionId },
  });
  if (existing && !existing.description?.startsWith(OWNER))
    throw new Error(
      'Colisión con una promoción ajena a DEMO; no se modifica ningún registro.',
    );
  if (!existing)
    await tx.promotion.create({
      data: {
        id: promotionId,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        name: `DEMO — ${definition.name}`,
        description: `${OWNER} Escenario ficticio para presentación del TFM; no corresponde a ninguna promoción real.`,
        location: `Paseo Imaginario ${10 + promotionIndex}, Municipio Ficticio`,
        status: promotionIndex === 4 ? 'ARCHIVED' : 'ACTIVE',
        phases: { create: definition.phases.map((phase) => ({ phase })) },
        participants: {
          create: [{ userId: manager.id }, { userId: collaborator.id }],
        },
      },
    });
  let created = 0;
  for (let caseIndex = 0; caseIndex < definition.titles.length; caseIndex++)
    created += await addScenario(
      tx,
      scenarioContext(promotionIndex, caseIndex, people),
    );
  return { incidents: created, promotions: existing ? 0 : 1 };
}
async function demoPeople(
  tx: Prisma.TransactionClient,
  credentials: DemoCredentials,
): Promise<DemoPeople> {
  const users = await Promise.all(
    (['ADMIN', 'MANAGER', 'COLLABORATOR'] as const).map(async (role) => {
      const user = await tx.user.findUnique({
        where: { email: credentials[role].email },
      });
      if (
        !user ||
        !user.isActive ||
        user.role !== role ||
        !user.email.endsWith('@demo.nextriva.invalid')
      )
        throw new Error(
          'Las cuentas DEMO esperadas no coinciden; no se modifica ningún usuario.',
        );
      return user;
    }),
  );
  const [admin, manager, collaborator] = users;
  if (!admin || !manager || !collaborator)
    throw new Error('Cuentas DEMO incompletas.');
  return { admin, manager, collaborator };
}

// Operación aditiva explícita. El bootstrap original sigue exigiendo una base vacía.
export async function enrichDemoScenarios(
  prisma: PrismaClient,
  credentials: DemoCredentials,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE users, sessions, promotions, promotion_phases, promotion_participants, incidents, incident_comments, incident_activities IN ACCESS EXCLUSIVE MODE`;
      const [destination] = await tx.$queryRaw<
        { marker: string | null }[]
      >`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`;
      if (destination?.marker !== 'nextriva:demo:initialized:v1')
        throw new Error(
          'El enriquecimiento requiere una base DEMO previamente inicializada.',
        );
      const people = await demoPeople(tx, credentials);
      let created = 0;
      let promotions = 0;
      for (let index = 0; index < definitions.length; index++) {
        const added = await addPromotion(tx, index, people);
        created += added.incidents;
        promotions += added.promotions;
      }
      return {
        users: 0,
        promotions,
        incidents: created,
        incidentId: demoScenarioId('incident', 0),
      };
    },
    { timeout: 30_000 },
  );
}
