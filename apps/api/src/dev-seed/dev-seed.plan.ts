import { createHash } from 'node:crypto';
import type {
  IncidentCategory,
  IncidentEventType,
  IncidentPriority,
  IncidentStatus,
  PromotionPhase,
  PromotionStatus,
  UserRole,
} from '../../generated/prisma/client.js';

export const DEFAULT_INCIDENT_COUNT = 60;
export const MAX_INCIDENT_COUNT = 500;
export const SEED_PASSWORD = '123456';
export const SEED_RANDOM_STATE = 0x4e585452;
export const SEED_PROFILES = {
  small: { users: 12, promotions: 5, incidents: 60 },
  medium: { users: 20, promotions: 10, incidents: 150 },
  large: { users: 30, promotions: 15, incidents: 300 },
} as const;
export type SeedProfile = keyof typeof SEED_PROFILES;

export function seedId(kind: string, index: number): string {
  const bytes = createHash('sha256')
    .update(`nextriva-dev-seed-v1:${kind}:${index}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const categories: IncidentCategory[] = [
  'STRUCTURE',
  'ENVELOPE',
  'INSTALLATIONS',
  'FINISHES',
  'CARPENTRY',
  'COMMON_AREAS',
  'CLEANING',
  'SAFETY',
  'OTHER',
];
const priorities: IncidentPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const originPhases: PromotionPhase[] = [
  'PLANNING',
  'COMMERCIALIZATION',
  'EXECUTIVE_PROJECT',
  'CONSTRUCTION',
  'PRE_HANDOVER',
  'HANDOVER',
  'AFTER_SALES',
];
const titles = [
  'Fisura visible en el acceso principal',
  'Filtración en la cubierta comunitaria',
  'Cuadro eléctrico pendiente de revisión',
  'Remate irregular en el pavimento',
  'Puerta de acceso desajustada',
  'Iluminación intermitente en zona común',
  'Limpieza final pendiente en el portal',
  'Señalización temporal de obra incompleta',
  'Revisión de acabado en escalera',
];

const userDefinitions: Array<{
  firstName: string;
  lastName: string;
  login: string;
  role: UserRole;
  isActive: boolean;
}> = [
  {
    firstName: 'Ana',
    lastName: 'Vidal',
    login: 'ana.admin',
    role: 'ADMIN',
    isActive: true,
  },
  {
    firstName: 'Pablo',
    lastName: 'Serra',
    login: 'pablo.admin',
    role: 'ADMIN',
    isActive: true,
  },
  {
    firstName: 'Marta',
    lastName: 'Cano',
    login: 'marta.admin',
    role: 'ADMIN',
    isActive: false,
  },
  {
    firstName: 'Lucía',
    lastName: 'Roca',
    login: 'lucia.gestor',
    role: 'MANAGER',
    isActive: true,
  },
  {
    firstName: 'Diego',
    lastName: 'Soler',
    login: 'diego.gestor',
    role: 'MANAGER',
    isActive: true,
  },
  {
    firstName: 'Irene',
    lastName: 'Pons',
    login: 'irene.gestor',
    role: 'MANAGER',
    isActive: false,
  },
  {
    firstName: 'Nora',
    lastName: 'Gil',
    login: 'nora.colaborador',
    role: 'COLLABORATOR',
    isActive: true,
  },
  {
    firstName: 'Hugo',
    lastName: 'Marín',
    login: 'hugo.colaborador',
    role: 'COLLABORATOR',
    isActive: true,
  },
  {
    firstName: 'Eva',
    lastName: 'Mora',
    login: 'eva.colaborador',
    role: 'COLLABORATOR',
    isActive: true,
  },
  {
    firstName: 'Leo',
    lastName: 'Ferrer',
    login: 'leo.colaborador',
    role: 'COLLABORATOR',
    isActive: true,
  },
  {
    firstName: 'Clara',
    lastName: 'Reyes',
    login: 'clara.colaborador',
    role: 'COLLABORATOR',
    isActive: true,
  },
  {
    firstName: 'Raúl',
    lastName: 'Costa',
    login: 'raul.colaborador',
    role: 'COLLABORATOR',
    isActive: false,
  },
];

const expandedUserDefinitions: typeof userDefinitions = (
  [
    ['Elena', 'Robles', 'elena.gestor', 'MANAGER', true],
    ['Javier', 'Torres', 'javier.gestor', 'MANAGER', true],
    ['Sofía', 'Núñez', 'sofia.gestor', 'MANAGER', true],
    ['Marcos', 'Blanco', 'marcos.gestor', 'MANAGER', true],
    ['Paula', 'Iglesias', 'paula.colaborador', 'COLLABORATOR', true],
    ['Óscar', 'Molina', 'oscar.colaborador', 'COLLABORATOR', true],
    ['Alba', 'Santos', 'alba.colaborador', 'COLLABORATOR', true],
    ['Daniel', 'Ruiz', 'daniel.colaborador', 'COLLABORATOR', true],
    ['Sara', 'Navarro', 'sara.colaborador', 'COLLABORATOR', true],
    ['Tomás', 'Pérez', 'tomas.colaborador', 'COLLABORATOR', true],
    ['Celia', 'Ortega', 'celia.colaborador', 'COLLABORATOR', true],
    ['Iván', 'Prieto', 'ivan.colaborador', 'COLLABORATOR', true],
    ['Rocío', 'López', 'rocio.colaborador', 'COLLABORATOR', true],
    ['Bruno', 'Vega', 'bruno.colaborador', 'COLLABORATOR', true],
    ['Alicia', 'Moreno', 'alicia.colaborador', 'COLLABORATOR', true],
    ['Gabriel', 'Campos', 'gabriel.colaborador', 'COLLABORATOR', true],
    ['Noa', 'Díaz', 'noa.colaborador', 'COLLABORATOR', false],
    ['Andrés', 'León', 'andres.colaborador', 'COLLABORATOR', true],
  ] satisfies Array<readonly [string, string, string, UserRole, boolean]>
).map(([firstName, lastName, login, role, isActive]) => ({
  firstName,
  lastName,
  login,
  role,
  isActive,
}));

const promotionDefinitions: Array<{
  name: string;
  location: string;
  status: PromotionStatus;
  phases: PromotionPhase[];
  managers: number[];
  collaborators: number[];
}> = [
  {
    name: '[SEED] Jardines del Sur',
    location: 'Madrid',
    status: 'ACTIVE',
    phases: ['PLANNING', 'COMMERCIALIZATION'],
    managers: [3],
    collaborators: [6, 7],
  },
  {
    name: '[SEED] Mirador de la Vega',
    location: 'Valencia',
    status: 'ACTIVE',
    phases: ['EXECUTIVE_PROJECT', 'CONSTRUCTION'],
    managers: [4],
    collaborators: [7, 8],
  },
  {
    name: '[SEED] Parque del Río',
    location: 'Zaragoza',
    status: 'ACTIVE',
    phases: ['CONSTRUCTION', 'PRE_HANDOVER'],
    managers: [3, 4],
    collaborators: [8, 9],
  },
  {
    name: '[SEED] Alameda Norte',
    location: 'Sevilla',
    status: 'ACTIVE',
    phases: ['HANDOVER', 'AFTER_SALES'],
    managers: [3],
    collaborators: [9, 10],
  },
  {
    name: '[SEED] Patio de la Luz',
    location: 'Bilbao',
    status: 'ARCHIVED',
    phases: ['AFTER_SALES'],
    managers: [4],
    collaborators: [6, 10],
  },
];

const expandedPromotionDefinitions: typeof promotionDefinitions = (
  [
    [
      '[SEED] Robledal Central',
      'Valladolid',
      'ACTIVE',
      ['PLANNING', 'EXECUTIVE_PROJECT'],
      [12],
      [16, 17],
    ],
    [
      '[SEED] Altos del Mar',
      'Málaga',
      'ACTIVE',
      ['CONSTRUCTION'],
      [13],
      [17, 18],
    ],
    [
      '[SEED] Plaza del Olivo',
      'Granada',
      'ACTIVE',
      ['PRE_HANDOVER', 'HANDOVER'],
      [14],
      [18, 19],
    ],
    [
      '[SEED] Valle Claro',
      'Alicante',
      'ARCHIVED',
      ['AFTER_SALES'],
      [15],
      [16, 19],
    ],
    [
      '[SEED] Sendero Azul',
      'Cádiz',
      'ACTIVE',
      ['COMMERCIALIZATION'],
      [12],
      [17, 19],
    ],
    [
      '[SEED] Paseo de la Estación',
      'Logroño',
      'ACTIVE',
      ['PLANNING', 'COMMERCIALIZATION'],
      [13],
      [20, 21],
    ],
    [
      '[SEED] Jardines del Este',
      'Burgos',
      'ACTIVE',
      ['EXECUTIVE_PROJECT', 'CONSTRUCTION'],
      [14],
      [21, 22],
    ],
    [
      '[SEED] Mirador del Puerto',
      'Santander',
      'ACTIVE',
      ['CONSTRUCTION', 'PRE_HANDOVER'],
      [15],
      [23, 24],
    ],
    [
      '[SEED] La Arboleda',
      'Salamanca',
      'ARCHIVED',
      ['HANDOVER', 'AFTER_SALES'],
      [12],
      [25, 26],
    ],
    [
      '[SEED] Parque de la Sierra',
      'Pamplona',
      'ACTIVE',
      ['AFTER_SALES'],
      [13],
      [26, 27],
    ],
  ] satisfies Array<
    readonly [
      string,
      string,
      PromotionStatus,
      PromotionPhase[],
      number[],
      number[],
    ]
  >
).map(([name, location, status, phases, managers, collaborators]) => ({
  name,
  location,
  status,
  phases,
  managers,
  collaborators,
}));

export type SeedPlan = ReturnType<typeof makeSeedPlan>;

function expandedCommentCount(index: number): number {
  if (index % 10 === 0) return 0;
  if (index % 10 === 1) return 9;
  return 2 + (index % 3);
}

export function makeSeedPlan(
  incidentCount: number,
  profile: SeedProfile = 'small',
) {
  const profileSize = SEED_PROFILES[profile];
  if (
    !profileSize ||
    !Number.isSafeInteger(incidentCount) ||
    incidentCount < 0 ||
    incidentCount > MAX_INCIDENT_COUNT ||
    (profile !== 'small' && incidentCount !== profileSize.incidents)
  ) {
    throw new Error(
      `La cantidad de incidencias debe estar entre 0 y ${MAX_INCIDENT_COUNT}.`,
    );
  }
  const start = new Date('2026-09-01T08:00:00.000Z');
  let randomState = SEED_RANDOM_STATE;
  const nextRandom = () => {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return randomState;
  };
  const users = [...userDefinitions, ...expandedUserDefinitions]
    .slice(0, profileSize.users)
    .map((definition, index) => ({
      id: seedId('user', index),
      firstName: definition.firstName,
      lastName: definition.lastName,
      email: `${definition.login}@seed.nextriva.invalid`,
      role: definition.role,
      isActive: definition.isActive,
      createdAt: start,
      updatedAt: start,
    }));
  const selectedPromotions = [
    ...promotionDefinitions,
    ...expandedPromotionDefinitions,
  ].slice(0, profileSize.promotions);
  const promotions = selectedPromotions.map((definition, index) => ({
    id: seedId('promotion', index),
    name: definition.name,
    description: `Promoción ficticia para probar la gestión de incidencias en ${definition.location}.`,
    location: definition.location,
    status: definition.status,
    phases: definition.phases,
    managers: definition.managers,
    collaborators: definition.collaborators,
    createdAt: start,
    updatedAt: start,
  }));
  const participants = promotions.flatMap((promotion) =>
    [...promotion.managers, ...promotion.collaborators].map((userIndex) => ({
      promotionId: promotion.id,
      userId: users[userIndex]!.id,
      joinedAt: start,
    })),
  );
  const incidents: Array<{
    id: string;
    promotionId: string;
    originPhase: PromotionPhase;
    title: string;
    description: string;
    category: IncidentCategory;
    priority: IncidentPriority;
    status: IncidentStatus;
    createdById: string;
    assignedToId: string | null;
    solution: string | null;
    solutionSubmittedById: string | null;
    solutionSubmittedAt: Date | null;
    validatedById?: string | null;
    closedAt?: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const activities: Array<{
    id: string;
    incidentId: string;
    actorId: string;
    eventType: IncidentEventType;
    changes: Record<string, string | null>;
    createdAt: Date;
  }> = [];
  const comments: Array<{
    id: string;
    incidentId: string;
    authorId: string;
    body: string;
    createdAt: Date;
  }> = [];

  const addIncident = (index: number) => {
    const promotion = promotions[index % promotionDefinitions.length]!;
    const promotionDefinition =
      promotionDefinitions[index % promotionDefinitions.length]!;
    const creatorId =
      users[
        promotionDefinition.collaborators[
          index % promotionDefinition.collaborators.length
        ]!
      ]!.id;
    const assigneeId =
      users[
        promotionDefinition.collaborators[
          (index + 1) % promotionDefinition.collaborators.length
        ]!
      ]!.id;
    const managerId = users[promotionDefinition.managers[0]!]!.id;
    const id = seedId('incident', index);
    const createdAt = new Date(start.getTime() + (index + 1) * 3_600_000);
    const statuses: IncidentStatus[] = [
      'OPEN',
      'IN_PROGRESS',
      'PENDING_VALIDATION',
    ];
    const status = statuses[index % statuses.length]!;
    const assignedToId =
      status === 'OPEN' && index % 4 === 0 ? null : assigneeId;
    const solution =
      status === 'PENDING_VALIDATION' ||
      (status === 'IN_PROGRESS' && index % 2 === 1)
        ? `Se ha revisado el elemento afectado y se propone una intervención controlada en la zona ${index + 1}.`
        : null;
    let lastActivityAt = createdAt;
    let version = 1;
    let eventIndex = 0;
    const recordActivity = (
      eventType: IncidentEventType,
      actorId: string,
      changes: Record<string, string | null>,
    ) => {
      lastActivityAt = new Date(createdAt.getTime() + eventIndex * 60_000);
      activities.push({
        id: seedId(`activity:${index}`, eventIndex),
        incidentId: id,
        actorId,
        eventType,
        changes,
        createdAt: lastActivityAt,
      });
      if (eventIndex > 0) version += 1;
      eventIndex += 1;
    };
    const originPhase =
      promotion.phases[nextRandom() % promotion.phases.length]!;
    recordActivity('CREATED', creatorId, { originPhase });
    if (assignedToId) {
      recordActivity('ASSIGNED', managerId, {
        previousAssignedToId: null,
        assignedToId,
      });
    }
    if (status !== 'OPEN') {
      recordActivity('STATUS_CHANGED', assigneeId, {
        previousStatus: 'OPEN',
        status: 'IN_PROGRESS',
      });
    }
    if (solution) {
      recordActivity('SOLUTION_UPDATED', assigneeId, {
        previousSolution: null,
        solution,
      });
    }
    if (status === 'PENDING_VALIDATION') {
      recordActivity('SOLUTION_SUBMITTED', assigneeId, {
        previousStatus: 'IN_PROGRESS',
        status: 'PENDING_VALIDATION',
        solution,
      });
    }
    incidents.push({
      id,
      promotionId: promotion.id,
      originPhase,
      title: `${titles[nextRandom() % titles.length]} (${index + 1})`,
      description: `En la visita de seguimiento se detectó una incidencia ficticia en la promoción ${promotion.name}. Se solicita revisar el elemento y documentar la actuación correspondiente.`,
      category: categories[index % categories.length]!,
      priority:
        priorities[(index * 2 + Math.floor(index / 3)) % priorities.length]!,
      status,
      createdById: creatorId,
      assignedToId,
      solution,
      solutionSubmittedById:
        status === 'PENDING_VALIDATION' ? assigneeId : null,
      solutionSubmittedAt:
        status === 'PENDING_VALIDATION' ? lastActivityAt : null,
      version,
      createdAt,
      updatedAt: lastActivityAt,
    });
    if (index % 4 === 0) {
      comments.push({
        id: seedId('comment', index),
        incidentId: id,
        authorId: managerId,
        body: `Comentario de seguimiento ficticio: se revisará esta incidencia en la próxima visita de obra (${index + 1}).`,
        createdAt: new Date(lastActivityAt.getTime() + 60_000),
      });
    }
  };
  for (
    let index = 0;
    index < Math.min(incidentCount, DEFAULT_INCIDENT_COUNT);
    index += 1
  ) {
    addIncident(index);
  }
  if (profile === 'small') {
    for (let index = DEFAULT_INCIDENT_COUNT; index < incidentCount; index += 1)
      addIncident(index);
  } else {
    for (const [index, comment] of comments.entries()) {
      activities.push({
        id: seedId('activity:legacy-comment', index),
        incidentId: comment.incidentId,
        actorId: comment.authorId,
        eventType: 'COMMENT_ADDED',
        changes: { commentId: comment.id },
        createdAt: comment.createdAt,
      });
    }
    const addExpandedIncident = (index: number) => {
      const promotionIndex =
        index < 150 ? 5 + ((index - 60) % 4) : 10 + ((index - 150) % 4);
      const promotion = promotions[promotionIndex]!;
      const definition = selectedPromotions[promotionIndex]!;
      const creatorId =
        users[
          definition.collaborators[index % definition.collaborators.length]!
        ]!.id;
      const assigneeId =
        users[
          definition.collaborators[
            (index + 1) % definition.collaborators.length
          ]!
        ]!.id;
      const managerId = users[definition.managers[0]!]!.id;
      const id = seedId('incident-expanded', index);
      const createdAt = new Date(start.getTime() + (index + 1) * 3_600_000);
      const originPhase = originPhases[index % originPhases.length]!;
      const desiredStatus: IncidentStatus = (
        [
          'OPEN',
          'IN_PROGRESS',
          'PENDING_VALIDATION',
          'CLOSED',
          'IN_PROGRESS',
        ] as const
      )[index % 5]!;
      let status: IncidentStatus = 'OPEN';
      let assignedToId: string | null = null;
      let solution: string | null = null;
      let solutionSubmittedById: string | null = null;
      let solutionSubmittedAt: Date | null = null;
      let validatedById: string | null = null;
      let closedAt: Date | null = null;
      let version = 1;
      let eventIndex = 0;
      let updatedAt = createdAt;
      const record = (
        eventType: IncidentEventType,
        actorId: string,
        changes: Record<string, string | null>,
        mutation = true,
      ) => {
        const at = new Date(createdAt.getTime() + eventIndex * 60_000);
        activities.push({
          id: seedId(`activity-expanded:${index}`, eventIndex),
          incidentId: id,
          actorId,
          eventType,
          changes,
          createdAt: at,
        });
        if (mutation && eventIndex > 0) {
          version += 1;
          updatedAt = at;
        }
        eventIndex += 1;
        return at;
      };
      record('CREATED', creatorId, { originPhase });
      if (desiredStatus !== 'OPEN' || index % 2 === 0) {
        assignedToId = assigneeId;
        record('ASSIGNED', managerId, {
          previousAssignedToId: null,
          assignedToId,
        });
      }
      for (
        let commentIndex = 0;
        commentIndex < expandedCommentCount(index);
        commentIndex += 1
      ) {
        const commentId = seedId(`comment-expanded:${index}`, commentIndex);
        const authorId = commentIndex % 2 === 0 ? managerId : creatorId;
        const at = record('COMMENT_ADDED', authorId, { commentId }, false);
        comments.push({
          id: commentId,
          incidentId: id,
          authorId,
          body: `Seguimiento ficticio ${commentIndex + 1} de la incidencia ${index + 1}: se ha revisado el estado de la actuación.`,
          createdAt: at,
        });
      }
      if (desiredStatus !== 'OPEN') {
        status = 'IN_PROGRESS';
        record('STATUS_CHANGED', assigneeId, {
          previousStatus: 'OPEN',
          status,
        });
        solution = `Se ha revisado la incidencia ${index + 1} y se ha preparado una actuación documentada para su resolución.`;
        record('SOLUTION_UPDATED', assigneeId, {
          previousSolution: null,
          solution,
        });
        const rejectCurrentSolution = (
          proposedSolution: string,
          revisedSolution: string,
          reason: string,
        ) => {
          status = 'PENDING_VALIDATION';
          const submittedAt = record('SOLUTION_SUBMITTED', assigneeId, {
            previousStatus: 'IN_PROGRESS',
            status,
            solution: proposedSolution,
          });
          status = 'IN_PROGRESS';
          record('STATUS_CHANGED', managerId, {
            previousStatus: 'PENDING_VALIDATION',
            status,
            solution: proposedSolution,
            solutionSubmittedById: assigneeId,
            solutionSubmittedAt: submittedAt.toISOString(),
            reason,
          });
          record('SOLUTION_UPDATED', assigneeId, {
            previousSolution: proposedSolution,
            solution: revisedSolution,
          });
          return revisedSolution;
        };
        if (index % 5 === 4 || index % 17 === 0) {
          solution = rejectCurrentSolution(
            solution,
            `Tras revisar el rechazo de la incidencia ${index + 1}, se ha corregido la actuación propuesta.`,
            'La comprobación requiere ajustar el remate antes de validar.',
          );
          if (index % 17 === 0) {
            solution = rejectCurrentSolution(
              solution,
              `La incidencia ${index + 1} incorpora una segunda corrección verificada tras dos rechazos independientes.`,
              'La segunda comprobación requiere completar la intervención.',
            );
          }
        }
        if (
          desiredStatus === 'PENDING_VALIDATION' ||
          desiredStatus === 'CLOSED'
        ) {
          status = 'PENDING_VALIDATION';
          solutionSubmittedAt = record('SOLUTION_SUBMITTED', assigneeId, {
            previousStatus: 'IN_PROGRESS',
            status,
            solution,
          });
          solutionSubmittedById = assigneeId;
        }
        if (desiredStatus === 'CLOSED') {
          status = 'CLOSED';
          validatedById = managerId;
          closedAt = record('STATUS_CHANGED', managerId, {
            previousStatus: 'PENDING_VALIDATION',
            status,
          });
        }
      }
      incidents.push({
        id,
        promotionId: promotion.id,
        originPhase,
        title: `${titles[nextRandom() % titles.length]} (${index + 1})`,
        description: `En la visita de seguimiento se detectó una incidencia ficticia en ${promotion.name}. ${'Se solicita una inspección detallada de la zona afectada. '.repeat((index % 4) + 1)}`,
        category: categories[index % categories.length]!,
        priority:
          priorities[(index * 2 + Math.floor(index / 3)) % priorities.length]!,
        status,
        createdById: creatorId,
        assignedToId,
        solution,
        solutionSubmittedById,
        solutionSubmittedAt,
        validatedById,
        closedAt,
        version,
        createdAt,
        updatedAt,
      });
    };
    for (let index = DEFAULT_INCIDENT_COUNT; index < incidentCount; index += 1)
      addExpandedIncident(index);
  }
  return { users, promotions, participants, incidents, activities, comments };
}
