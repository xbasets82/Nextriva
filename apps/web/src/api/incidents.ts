import { phases } from './promotions.js';
import type { operations } from './schema.js';
import { apiFetch, ApiError } from './transport.js';
export type IncidentInput =
  operations['IncidentsController_create']['requestBody']['content']['application/json'];
export type Incident =
  operations['IncidentsController_create']['responses'][201]['content']['application/json']['incident'];
export const categories = {
  STRUCTURE: 'Estructura',
  ENVELOPE: 'Envolvente y cubierta',
  INSTALLATIONS: 'Instalaciones',
  FINISHES: 'Acabados',
  CARPENTRY: 'Carpintería y cerrajería',
  COMMON_AREAS: 'Zonas comunes y urbanización',
  CLEANING: 'Limpieza',
  SAFETY: 'Seguridad',
  OTHER: 'Otros',
} satisfies Record<IncidentInput['category'], string>;
export const priorities = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
} satisfies Record<IncidentInput['priority'], string>;
export const statusLabels = {
  OPEN: 'Abierta',
  IN_PROGRESS: 'En curso',
  PENDING_VALIDATION: 'Pendiente de validación',
  CLOSED: 'Cerrada',
} satisfies Record<Incident['status'], string>;
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
  for (const entry of allowed) if (entry === value) return entry;
  throw new ApiError(0);
}
function readIncident(payload: unknown): Incident {
  const item = object(object(payload).incident);
  if (
    !Number.isInteger(item.version) ||
    typeof item.version !== 'number' ||
    item.version < 1
  )
    throw new ApiError(0);
  return {
    id: text(item.id),
    publicCode: text(item.publicCode),
    promotionId: text(item.promotionId),
    title: text(item.title),
    description: text(item.description),
    createdById: text(item.createdById),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
    version: item.version,
    originPhase: member(item.originPhase, phases),
    category: member(
      item.category,
      Object.keys(categories) as Array<keyof typeof categories>,
    ),
    priority: member(
      item.priority,
      Object.keys(priorities) as Array<keyof typeof priorities>,
    ),
    status: member(
      item.status,
      Object.keys(statusLabels) as Array<keyof typeof statusLabels>,
    ),
  };
}
export async function createIncident(input: IncidentInput): Promise<Incident> {
  const token = object(await (await apiFetch('/api/auth/csrf')).json());
  if (typeof token.csrfToken !== 'string' || !token.csrfToken)
    throw new ApiError(0);
  return readIncident(
    await (
      await apiFetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token.csrfToken,
        },
        body: JSON.stringify(input),
      })
    ).json(),
  );
}
type IncidentList =
  operations['IncidentsController_list']['responses'][200]['content']['application/json'];
export async function listIncidents(): Promise<IncidentList['incidents']> {
  const payload: unknown = await (await apiFetch('/api/incidents')).json();
  const items = object(payload).incidents;
  if (!Array.isArray(items)) throw new ApiError(0);
  return items.map((item) => readIncident({ incident: item }));
}
export async function getIncident(id: string): Promise<Incident> {
  return readIncident(
    await (await apiFetch(`/api/incidents/${encodeURIComponent(id)}`)).json(),
  );
}
export function incidentError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Revisa los campos de la incidencia.';
    if (error.status === 403) return 'No tienes permiso para esta operación.';
    if (error.status === 404)
      return 'No se ha encontrado la incidencia o la promoción.';
    if (error.status === 409)
      return 'La promoción está archivada. No admite nuevas incidencias.';
  }
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}
