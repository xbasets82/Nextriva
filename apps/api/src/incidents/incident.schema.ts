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
      required: [...incident.required, 'activities', 'comments', 'assignedTo'],
      properties: {
        ...incident.properties,
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
  required: ['incidents'],
  properties: { incidents: { type: 'array', items: incident } },
};
