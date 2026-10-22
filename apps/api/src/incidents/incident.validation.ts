import { BadRequestException } from '@nestjs/common';
import {
  PROMOTION_PHASES,
  type PromotionPhase,
} from '../promotions/promotion.validation.js';

export const INCIDENT_CATEGORIES = [
  'STRUCTURE',
  'ENVELOPE',
  'INSTALLATIONS',
  'FINISHES',
  'CARPENTRY',
  'COMMON_AREAS',
  'CLEANING',
  'SAFETY',
  'OTHER',
] as const;
export const INCIDENT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const INCIDENT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VALIDATION',
  'CLOSED',
] as const;
export interface NewIncident {
  promotionId: string;
  originPhase: PromotionPhase;
  title: string;
  description: string;
  category: (typeof INCIDENT_CATEGORIES)[number];
  priority: (typeof INCIDENT_PRIORITIES)[number];
}
function invalid(): never {
  throw new BadRequestException('Datos de incidencia inválidos');
}
function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    invalid();
  return value.trim();
}
function member<T extends string>(value: unknown, allowed: readonly T[]): T {
  for (const entry of allowed) if (entry === value) return entry;
  return invalid();
}
export function incidentId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value;
}
export function newIncident(body: unknown): NewIncident {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  const source = body as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) =>
        ![
          'promotionId',
          'originPhase',
          'title',
          'description',
          'category',
          'priority',
        ].includes(key),
    )
  )
    invalid();
  return {
    promotionId: incidentId(source.promotionId),
    originPhase: member(source.originPhase, PROMOTION_PHASES),
    title: text(source.title, 5, 150),
    description: text(source.description, 10, 5000),
    category: member(source.category, INCIDENT_CATEGORIES),
    priority: member(source.priority, INCIDENT_PRIORITIES),
  };
}
