import { PROMOTION_PHASES } from '../promotions/promotion.validation.js';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
} from './incident.validation.js';
const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
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
const activity = {
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
    eventType: { type: 'string', enum: ['CREATED'] },
    changes: {
      type: 'object',
      additionalProperties: false,
      required: ['originPhase'],
      properties: {
        originPhase: { type: 'string', enum: [...PROMOTION_PHASES] },
      },
    },
    createdAt: timestamp,
  },
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
      required: [...incident.required, 'activities'],
      properties: {
        ...incident.properties,
        activities: { type: 'array', items: activity },
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
