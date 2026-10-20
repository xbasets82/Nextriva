import type { operations } from './schema.js';
import { ApiError } from './users.js';

export type Promotion =
  operations['PromotionsController_list']['responses'][200]['content']['application/json']['promotions'][number];
export type NewPromotion =
  operations['PromotionsController_create']['requestBody']['content']['application/json'];
export type Phase = Promotion['phases'][number];

export const phaseLabels = {
  PLANNING: 'Planificación y planos básicos',
  COMMERCIALIZATION: 'Comercialización',
  EXECUTIVE_PROJECT: 'Proyecto ejecutivo / planos definitivos',
  CONSTRUCTION: 'Construcción',
  PRE_HANDOVER: 'Preentrega',
  HANDOVER: 'Entrega',
  AFTER_SALES: 'Posventa',
} satisfies Record<Phase, string>;
export const phases = Object.keys(phaseLabels) as Phase[];

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApiError(0);
  return value as Record<string, unknown>;
}
function readPromotion(value: unknown): Promotion {
  const item = object(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    (item.status !== 'ACTIVE' && item.status !== 'ARCHIVED') ||
    !Array.isArray(item.phases) ||
    item.phases.some(
      (phase: unknown) =>
        typeof phase !== 'string' || !Object.hasOwn(phaseLabels, phase),
    ) ||
    (item.description != null && typeof item.description !== 'string') ||
    (item.location != null && typeof item.location !== 'string')
  )
    throw new ApiError(0);
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    description: typeof item.description === 'string' ? item.description : null,
    location: typeof item.location === 'string' ? item.location : null,
    phases: phases.filter((phase) =>
      (item.phases as unknown[]).includes(phase),
    ),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
async function request(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiError(response.status);
  return object(await response.json());
}
export async function listPromotions(): Promise<Promotion[]> {
  const result = await request('/api/promotions');
  if (!Array.isArray(result.promotions)) throw new ApiError(0);
  return result.promotions.map(readPromotion);
}
export async function getPromotion(id: string): Promise<Promotion> {
  return readPromotion(
    (await request(`/api/promotions/${encodeURIComponent(id)}`)).promotion,
  );
}
async function mutate(
  path: string,
  method: 'POST' | 'PATCH',
  input: object,
): Promise<Promotion> {
  const token = (await request('/api/auth/csrf')).csrfToken;
  if (typeof token !== 'string' || !token) throw new ApiError(0);
  return readPromotion(
    (
      await request(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(input),
      })
    ).promotion,
  );
}
export async function savePromotion(
  input: NewPromotion,
  id?: string,
): Promise<Promotion> {
  const { name, description, location, phases: selected } = input;
  return mutate(
    id ? `/api/promotions/${encodeURIComponent(id)}` : '/api/promotions',
    id ? 'PATCH' : 'POST',
    { name, description, location, phases: selected },
  );
}
export async function setPromotionStatus(
  id: string,
  status: Promotion['status'],
): Promise<Promotion> {
  const input: operations['PromotionsController_setStatus']['requestBody']['content']['application/json'] =
    { status };
  return mutate(
    `/api/promotions/${encodeURIComponent(id)}/status`,
    'PATCH',
    input,
  );
}
export function promotionError(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  switch (status) {
    case 400:
      return 'Revisa los datos de la promoción.';
    case 401:
      return 'Se necesita una sesión válida para consultar promociones.';
    case 403:
      return 'No tienes permisos para gestionar promociones.';
    case 404:
      return 'No se ha encontrado la promoción.';
    case 409:
      return 'El estado de la promoción ha cambiado. Vuelve a consultarla.';
    default:
      return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
  }
}
