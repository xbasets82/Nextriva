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
    assignedToId: item.assignedToId === null ? null : text(item.assignedToId),
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
export type IncidentComment =
  operations['IncidentsController_comment']['responses'][201]['content']['application/json']['comment'];
export type Assignee =
  operations['IncidentsController_eligibleAssignees']['responses'][200]['content']['application/json']['users'][number];
export type IncidentDetail = Incident & {
  comments: IncidentComment[];
  assignedTo: Assignee | null;
};
function readComment(payload: unknown): IncidentComment {
  const value = object(payload);
  return {
    id: text(value.id),
    incidentId: text(value.incidentId),
    authorId: text(value.authorId),
    body: text(value.body),
    createdAt: text(value.createdAt),
  };
}
export async function getIncident(id: string): Promise<IncidentDetail> {
  const payload: unknown = await (
    await apiFetch(`/api/incidents/${encodeURIComponent(id)}`)
  ).json();
  const comments = object(object(payload).incident).comments;
  if (!Array.isArray(comments)) throw new ApiError(0);
  const assignedTo = object(object(payload).incident).assignedTo;
  return {
    ...readIncident(payload),
    comments: comments.map(readComment),
    assignedTo: assignedTo === null ? null : readAssignee(assignedTo),
  };
}
export async function createIncidentComment(
  id: string,
  body: string,
): Promise<IncidentComment> {
  const token = object(await (await apiFetch('/api/auth/csrf')).json());
  if (typeof token.csrfToken !== 'string' || !token.csrfToken)
    throw new ApiError(0);
  const payload: unknown = await (
    await apiFetch(`/api/incidents/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token.csrfToken,
      },
      body: JSON.stringify({ body }),
    })
  ).json();
  return readComment(object(payload).comment);
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

function readAssignee(payload: unknown): Assignee {
  const item = object(payload);
  return {
    id: text(item.id),
    firstName: text(item.firstName),
    lastName: text(item.lastName),
  };
}
export async function eligibleAssignees(id: string): Promise<Assignee[]> {
  const payload = object(
    await (
      await apiFetch(
        `/api/incidents/${encodeURIComponent(id)}/eligible-assignees`,
      )
    ).json(),
  );
  if (!Array.isArray(payload.users)) throw new ApiError(0);
  return payload.users.map(readAssignee);
}
export async function assignIncident(
  id: string,
  assignedToId: string,
  version: number,
): Promise<void> {
  const token = object(await (await apiFetch('/api/auth/csrf')).json());
  if (typeof token.csrfToken !== 'string' || !token.csrfToken)
    throw new ApiError(0);
  await apiFetch(`/api/incidents/${encodeURIComponent(id)}/assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token.csrfToken,
    },
    body: JSON.stringify({ assignedToId, version }),
  });
}
