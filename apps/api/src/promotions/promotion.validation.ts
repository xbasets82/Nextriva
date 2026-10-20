import { BadRequestException } from '@nestjs/common';

export const PROMOTION_PHASES = [
  'PLANNING',
  'COMMERCIALIZATION',
  'EXECUTIVE_PROJECT',
  'CONSTRUCTION',
  'PRE_HANDOVER',
  'HANDOVER',
  'AFTER_SALES',
] as const;

export const PROMOTION_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

export type PromotionPhase = (typeof PROMOTION_PHASES)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

const phaseSet: ReadonlySet<string> = new Set(PROMOTION_PHASES);
const statusSet: ReadonlySet<string> = new Set(PROMOTION_STATUSES);

export interface NewPromotion {
  name: string;
  description?: string;
  location?: string;
  phases: PromotionPhase[];
}

export interface PromotionChanges {
  name?: string;
  description?: string;
  location?: string;
  phases?: PromotionPhase[];
}

function invalid(): never {
  throw new BadRequestException('Datos de promoción inválidos');
}

function object(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  if (Object.keys(body).some((key) => !allowed.includes(key))) invalid();
  return body as Record<string, unknown>;
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

function isPromotionPhase(value: unknown): value is PromotionPhase {
  return typeof value === 'string' && phaseSet.has(value);
}

function isPromotionStatus(value: unknown): value is PromotionStatus {
  return typeof value === 'string' && statusSet.has(value);
}

function optionalText(
  source: Record<string, unknown>,
  field: 'description' | 'location',
  max: number,
): string | undefined {
  if (!(field in source)) return undefined;
  return text(source[field], 0, max);
}

function phases(value: unknown): PromotionPhase[] {
  if (!Array.isArray(value) || value.length === 0) invalid();
  const result: PromotionPhase[] = [];
  for (const phase of value) {
    if (!isPromotionPhase(phase)) invalid();
    result.push(phase);
  }
  if (new Set(result).size !== result.length) invalid();

  return result.sort(
    (left, right) =>
      PROMOTION_PHASES.indexOf(left) - PROMOTION_PHASES.indexOf(right),
  );
}

export function newPromotion(body: unknown): NewPromotion {
  const source = object(body, ['name', 'description', 'location', 'phases']);
  if (!('name' in source) || !('phases' in source)) invalid();
  const description = optionalText(source, 'description', 1000);
  const location = optionalText(source, 'location', 200);
  return {
    name: text(source.name, 3, 150),
    ...(description === undefined ? {} : { description }),
    ...(location === undefined ? {} : { location }),
    phases: phases(source.phases),
  };
}

export function promotionChanges(body: unknown): PromotionChanges {
  const source = object(body, ['name', 'description', 'location', 'phases']);
  if (Object.keys(source).length === 0) invalid();
  const result: PromotionChanges = {};
  if ('name' in source) result.name = text(source.name, 3, 150);
  if ('description' in source)
    result.description = text(source.description, 0, 1000);
  if ('location' in source) result.location = text(source.location, 0, 200);
  if ('phases' in source) result.phases = phases(source.phases);
  return result;
}

export function promotionStatus(body: unknown): PromotionStatus {
  const source = object(body, ['status']);
  if (!isPromotionStatus(source.status)) invalid();
  return source.status;
}

export function promotionId(value: string): string {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value;
}
