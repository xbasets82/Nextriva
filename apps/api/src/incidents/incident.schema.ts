import { PROMOTION_PHASES } from '../promotions/promotion.validation.js';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
} from './incident.validation.js';
const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const assignee = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'firstName', 'lastName'],
  properties: {
    id: uuid,
    firstName: { type: 'string' },
    lastName: { type: 'string' },
  },
};
export const eligibleAssigneesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['users'],
  properties: { users: { type: 'array', items: assignee } },
};
export const assignmentInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assignedToId', 'version'],
  properties: { assignedToId: uuid, version: { type: 'integer', minimum: 1 } },
};
export const startInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: { version: { type: 'integer', minimum: 1 } },
};
export const solutionDraftInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['solution', 'version'],
  properties: {
    solution: { type: 'string', maxLength: 5000 },
    version: { type: 'integer', minimum: 1 },
  },
};
export const solutionSubmissionInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: { version: { type: 'integer', minimum: 1 } },
};
export const solutionRejectionInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'reason'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    reason: { type: 'string', minLength: 5, maxLength: 2000 },
  },
};
export const reopenInputSchema = {
  ...solutionRejectionInputSchema,
  required: ['version', 'reason', 'assignedToId'],
  properties: {
    ...solutionRejectionInputSchema.properties,
    assignedToId: uuid,
  },
};
export const commentInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string', minLength: 1, maxLength: 2000 } },
};
const comment = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'incidentId', 'authorId', 'authorName', 'body', 'createdAt'],
  properties: {
    id: uuid,
    incidentId: uuid,
    authorId: uuid,
    authorName: { type: 'string' },
    body: commentInputSchema.properties.body,
    createdAt: timestamp,
  },
};
export const commentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['comment'],
  properties: { comment },
};
export const incidentInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promotionId',
    'originPhase',
    'title',
    'description',
    'category',
    'priority',
  ],
  properties: {
    promotionId: uuid,
    originPhase: { type: 'string', enum: [...PROMOTION_PHASES] },
    title: { type: 'string', minLength: 5, maxLength: 150 },
    description: { type: 'string', minLength: 10, maxLength: 5000 },
    category: { type: 'string', enum: [...INCIDENT_CATEGORIES] },
    priority: { type: 'string', enum: [...INCIDENT_PRIORITIES] },
  },
};
const activityBase = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'incidentId',
    'actorId',
    'eventType',
    'changes',
    'createdAt',
  ],
  properties: {
    id: uuid,
    incidentId: uuid,
    actorId: uuid,
    createdAt: timestamp,
  },
};
const activity = {
  oneOf: [
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['CREATED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['originPhase'],
          properties: {
            originPhase: { type: 'string', enum: [...PROMOTION_PHASES] },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['ASSIGNED', 'REASSIGNED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['previousAssignedToId', 'assignedToId'],
          properties: {
            previousAssignedToId: { ...uuid, nullable: true },
            assignedToId: uuid,
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['STATUS_CHANGED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['previousStatus', 'status'],
          properties: {
            previousStatus: { type: 'string', enum: [...INCIDENT_STATUSES] },
            status: { type: 'string', enum: [...INCIDENT_STATUSES] },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['STATUS_CHANGED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: [
            'previousStatus',
            'status',
            'solution',
            'solutionSubmittedById',
            'solutionSubmittedAt',
            'reason',
          ],
          properties: {
            previousStatus: { type: 'string', enum: ['PENDING_VALIDATION'] },
            status: { type: 'string', enum: ['IN_PROGRESS'] },
            solution: { type: 'string', minLength: 1, maxLength: 5000 },
            solutionSubmittedById: uuid,
            solutionSubmittedAt: timestamp,
            reason: { type: 'string', minLength: 5, maxLength: 2000 },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['STATUS_CHANGED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: [
            'snapshotVersion',
            'previousStatus',
            'status',
            'previousAssignedToId',
            'assignedToId',
            'reason',
            'approvedCycle',
          ],
          properties: {
            snapshotVersion: { type: 'integer', enum: [1] },
            previousStatus: { type: 'string', enum: ['CLOSED'] },
            status: { type: 'string', enum: ['IN_PROGRESS'] },
            previousAssignedToId: { ...uuid, nullable: true },
            assignedToId: uuid,
            reason: solutionRejectionInputSchema.properties.reason,
            approvedCycle: {
              type: 'object',
              additionalProperties: false,
              required: [
                'solution',
                'solutionSubmittedById',
                'solutionSubmittedAt',
                'validatedById',
                'closedAt',
              ],
              properties: {
                solution: { type: 'string', minLength: 1, maxLength: 5000 },
                solutionSubmittedById: uuid,
                solutionSubmittedAt: timestamp,
                validatedById: uuid,
                closedAt: timestamp,
              },
            },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['SOLUTION_UPDATED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['previousSolution', 'solution'],
          properties: {
            previousSolution: {
              type: 'string',
              nullable: true,
              maxLength: 5000,
            },
            solution: { type: 'string', nullable: true, maxLength: 5000 },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['SOLUTION_SUBMITTED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['previousStatus', 'status', 'solution'],
          properties: {
            previousStatus: { type: 'string', enum: [...INCIDENT_STATUSES] },
            status: { type: 'string', enum: [...INCIDENT_STATUSES] },
            solution: { type: 'string', maxLength: 5000 },
          },
        },
      },
    },
    {
      ...activityBase,
      properties: {
        ...activityBase.properties,
        eventType: { type: 'string', enum: ['COMMENT_ADDED'] },
        changes: {
          type: 'object',
          additionalProperties: false,
          required: ['commentId'],
          properties: { commentId: uuid },
        },
      },
    },
  ],
};
const incident = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'publicCode',
    ...incidentInputSchema.required,
    'status',
    'createdById',
    'assignedToId',
    'solution',
    'solutionSubmittedById',
    'solutionSubmittedAt',
    'validatedById',
    'closedAt',
    'version',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    ...incidentInputSchema.properties,
    id: uuid,
    publicCode: { type: 'string', pattern: '^INC-[0-9]{6,}$' },
    status: { type: 'string', enum: [...INCIDENT_STATUSES] },
    createdById: uuid,
    assignedToId: { ...uuid, nullable: true },
    solution: { type: 'string', nullable: true, maxLength: 5000 },
    solutionSubmittedById: { ...uuid, nullable: true },
    solutionSubmittedAt: { ...timestamp, nullable: true },
    validatedById: { ...uuid, nullable: true },
    closedAt: { ...timestamp, nullable: true },
    version: { type: 'integer', minimum: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  },
};
export const incidentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['incident'],
  properties: { incident },
};
export const incidentDetailSchema = {
  ...incidentResponseSchema,
  properties: {
    incident: {
      ...incident,
      required: [
        ...incident.required,
        'activities',
        'comments',
        'assignedTo',
        'promotionStatus',
      ],
      properties: {
        ...incident.properties,
        promotionStatus: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] },
        assignedTo: { ...assignee, nullable: true },
        activities: { type: 'array', items: activity },
        comments: { type: 'array', items: comment },
      },
    },
  },
};

export const incidentListSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: incident },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
};

const deletedIncident = {
  ...incident,
  required: [
    ...incident.required,
    'deletedAt',
    'deletedById',
    'deletionReason',
    'deletedBy',
  ],
  properties: {
    ...incident.properties,
    deletedAt: timestamp,
    deletedById: uuid,
    deletionReason: { type: 'string', minLength: 5, maxLength: 2000 },
    deletedBy: assignee,
  },
};
export const deletedIncidentResponseSchema = {
  ...incidentResponseSchema,
  properties: { incident: deletedIncident },
};
export const deletedIncidentListSchema = {
  ...incidentListSchema,
  properties: {
    ...incidentListSchema.properties,
    items: { type: 'array', items: deletedIncident },
  },
};

export const incidentFilterOptionsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assignees'],
  properties: {
    assignees: {
      type: 'array',
      items: {
        ...assignee,
        required: [...assignee.required, 'email'],
        properties: {
          ...assignee.properties,
          email: { type: 'string', format: 'email' },
        },
      },
    },
  },
};

const statusCountsSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...INCIDENT_STATUSES],
  properties: Object.fromEntries(
    INCIDENT_STATUSES.map((status) => [
      status,
      { type: 'integer', minimum: 0 },
    ]),
  ),
};

export const personalSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'countsByStatus',
    'visibleCountsByStatus',
    'priorityItems',
    'priorityLimit',
  ],
  properties: {
    countsByStatus: statusCountsSchema,
    visibleCountsByStatus: statusCountsSchema,
    priorityLimit: { type: 'integer', enum: [10] },
    priorityItems: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'publicCode',
          'title',
          'promotionId',
          'promotionName',
          'status',
          'priority',
          'createdAt',
        ],
        properties: {
          id: uuid,
          publicCode: incident.properties.publicCode,
          title: incidentInputSchema.properties.title,
          promotionId: uuid,
          promotionName: { type: 'string' },
          status: {
            type: 'string',
            enum: ['OPEN', 'IN_PROGRESS', 'PENDING_VALIDATION'],
          },
          priority: incident.properties.priority,
          createdAt: timestamp,
        },
      },
    },
  },
};
