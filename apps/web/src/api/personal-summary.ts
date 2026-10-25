import type { operations } from './schema.js';
import { ApiError, apiFetch } from './transport.js';
import { priorities, statusLabels } from './incidents.js';
export type PersonalSummary =
  operations['IncidentsController_personalSummary']['responses'][200]['content']['application/json'];
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApiError(0);
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(0);
  return value;
}
function member<T extends string>(value: unknown, allowed: readonly T[]): T {
  for (const item of allowed) if (value === item) return item;
  throw new ApiError(0);
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ApiError(0);
  return value;
}
function readCounts(value: unknown): PersonalSummary['countsByStatus'] {
  const counts = object(value);
  return {
    OPEN: count(counts.OPEN),
    IN_PROGRESS: count(counts.IN_PROGRESS),
    PENDING_VALIDATION: count(counts.PENDING_VALIDATION),
    CLOSED: count(counts.CLOSED),
  };
}
export async function personalSummary(): Promise<PersonalSummary> {
  const result = object(
    await (await apiFetch('/api/incidents/personal-summary')).json(),
  );
  if (
    result.priorityLimit !== 10 ||
    !Array.isArray(result.priorityItems) ||
    result.priorityItems.length > 10
  )
    throw new ApiError(0);
  return {
    countsByStatus: readCounts(result.countsByStatus),
    visibleCountsByStatus: readCounts(result.visibleCountsByStatus),
    priorityLimit: 10,
    priorityItems: result.priorityItems.map((value) => {
      const item = object(value);
      return {
        id: text(item.id),
        publicCode: text(item.publicCode),
        title: text(item.title),
        promotionId: text(item.promotionId),
        promotionName: text(item.promotionName),
        createdAt: text(item.createdAt),
        status: member(item.status, [
          'OPEN',
          'IN_PROGRESS',
          'PENDING_VALIDATION',
        ] as const),
        priority: member(
          item.priority,
          Object.keys(priorities) as Array<keyof typeof priorities>,
        ),
      };
    }),
  };
}
export const summaryStates = Object.keys(statusLabels) as Array<
  keyof typeof statusLabels
>;
