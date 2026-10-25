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
export const INCIDENT_SORT_FIELDS = [
  'priority',
  'status',
  'createdAt',
] as const;
export const INCIDENT_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export interface IncidentListQuery {
  q?: string;
  promotionId?: string;
  status?: (typeof INCIDENT_STATUSES)[number];
  priority?: (typeof INCIDENT_PRIORITIES)[number];
  category?: (typeof INCIDENT_CATEGORIES)[number];
  assignedToId?: string;
  sortBy?: (typeof INCIDENT_SORT_FIELDS)[number];
  sortDirection?: (typeof INCIDENT_SORT_DIRECTIONS)[number];
  page: number;
  pageSize: number;
}
export interface NewIncident {
  promotionId: string;
  originPhase: PromotionPhase;
  title: string;
  description: string;
  category: (typeof INCIDENT_CATEGORIES)[number];
  priority: (typeof INCIDENT_PRIORITIES)[number];
}
export interface IncidentSolutionDraft {
  solution: string;
  version: number;
}
export interface IncidentSolutionSubmission {
  version: number;
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
function positiveQueryInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) invalid();
  return parsed;
}

const incidentListFields = [
  'q',
  'promotionId',
  'status',
  'priority',
  'category',
  'assignedToId',
  'sortBy',
  'sortDirection',
  'page',
  'pageSize',
] as const;

function incidentListRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid();
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) =>
        !incidentListFields.includes(
          key as (typeof incidentListFields)[number],
        ),
    )
  )
    invalid();
  return source;
}

function optionalQueryText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid();
  const trimmed = value.trim();
  if (Array.from(trimmed).length > 150) invalid();
  return trimmed || undefined;
}

function optionalIncidentId(value: unknown): string | undefined {
  return value === undefined ? undefined : incidentId(value);
}

function optionalQueryMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return value === undefined ? undefined : member(value, allowed);
}

export function incidentListQuery(value: unknown): IncidentListQuery {
  const source = incidentListRecord(value);

  const page = positiveQueryInteger(source.page, 1);
  const pageSize = positiveQueryInteger(source.pageSize, 20);
  if (pageSize > 100 || !Number.isSafeInteger((page - 1) * pageSize)) invalid();

  const q = optionalQueryText(source.q);
  const promotionId = optionalIncidentId(source.promotionId);
  const assignedToId = optionalIncidentId(source.assignedToId);
  const status = optionalQueryMember(source.status, INCIDENT_STATUSES);
  const priority = optionalQueryMember(source.priority, INCIDENT_PRIORITIES);
  const category = optionalQueryMember(source.category, INCIDENT_CATEGORIES);
  const sortBy = optionalQueryMember(source.sortBy, INCIDENT_SORT_FIELDS);
  const sortDirection = optionalQueryMember(
    source.sortDirection,
    INCIDENT_SORT_DIRECTIONS,
  );
  if (!sortBy && sortDirection) invalid();
  const resolvedSortDirection = sortBy ? (sortDirection ?? 'desc') : undefined;

  return {
    ...(q ? { q } : {}),
    ...(promotionId ? { promotionId } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(category ? { category } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(sortBy ? { sortBy } : {}),
    ...(resolvedSortDirection ? { sortDirection: resolvedSortDirection } : {}),
    page,
    pageSize,
  };
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

export function newIncidentComment(body: unknown): { body: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  const source = body as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== 'body')) invalid();
  return { body: text(source.body, 1, 2000) };
}

export function newIncidentSolutionDraft(body: unknown): IncidentSolutionDraft {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  const source = body as Record<string, unknown>;
  if (
    Object.keys(source).length !== 2 ||
    !Object.hasOwn(source, 'solution') ||
    typeof source.solution !== 'string' ||
    Array.from(source.solution).length > 5000 ||
    !Number.isSafeInteger(source.version) ||
    (source.version as number) < 1
  )
    invalid();
  return { solution: source.solution, version: source.version as number };
}

export function newIncidentSolutionSubmission(
  body: unknown,
): IncidentSolutionSubmission {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  const source = body as Record<string, unknown>;
  if (
    Object.keys(source).length !== 1 ||
    !Object.hasOwn(source, 'version') ||
    !Number.isSafeInteger(source.version) ||
    (source.version as number) < 1
  )
    invalid();
  return { version: source.version as number };
}

export function newIncidentSolutionRejection(body: unknown): {
  version: number;
  reason: string;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  const source = body as Record<string, unknown>;
  if (Object.keys(source).length !== 2 || !Object.hasOwn(source, 'reason'))
    invalid();
  const { version } = newIncidentSolutionSubmission({
    version: source.version,
  });
  if (typeof source.reason !== 'string') invalid();
  const reason = source.reason.trim();
  const length = Array.from(reason).length;
  if (length < 5 || length > 2000) invalid();
  return { version, reason };
}
