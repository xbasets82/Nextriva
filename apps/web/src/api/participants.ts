import type { operations } from './schema.js';
import { ApiError, apiFetch } from './transport.js';

export type Participant =
  operations['PromotionsController_listParticipants']['responses'][200]['content']['application/json']['participants'][number];
export type Candidate =
  operations['PromotionsController_eligibleParticipants']['responses'][200]['content']['application/json']['candidates'][number];
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApiError(0);
  return value as Record<string, unknown>;
}
function candidate(value: unknown): Candidate {
  const item = record(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.firstName !== 'string' ||
    typeof item.lastName !== 'string' ||
    typeof item.email !== 'string'
  )
    throw new ApiError(0);
  return {
    id: item.id,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email,
  };
}
function participant(value: unknown): Participant {
  const item = record(value);
  const user = record(item.user);
  if (
    typeof item.joinedAt !== 'string' ||
    typeof user.isActive !== 'boolean' ||
    !['ADMIN', 'MANAGER', 'COLLABORATOR'].includes(String(user.role))
  )
    throw new ApiError(0);
  return {
    joinedAt: item.joinedAt,
    user: {
      ...candidate(user),
      role: user.role as Participant['user']['role'],
      isActive: user.isActive,
    },
  };
}
const path = (id: string) => `/api/promotions/${encodeURIComponent(id)}`;
export async function listParticipants(id: string): Promise<Participant[]> {
  const result = record(
    await (await apiFetch(`${path(id)}/participants`)).json(),
  );
  if (!Array.isArray(result.participants)) throw new ApiError(0);
  return result.participants.map(participant);
}
export async function eligibleParticipants(id: string): Promise<Candidate[]> {
  const result = record(
    await (await apiFetch(`${path(id)}/eligible-participants`)).json(),
  );
  if (!Array.isArray(result.candidates)) throw new ApiError(0);
  return result.candidates.map(candidate);
}
export function participantError(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  switch (status) {
    case 400:
      return 'Revisa el participante seleccionado.';
    case 401:
      return 'Se necesita una sesión válida para consultar participantes.';
    case 403:
      return 'No tienes permisos para realizar esta operación de participantes.';
    case 404:
      return 'La promoción o el participante ya no están disponibles.';
    case 409:
      return 'No se puede completar el cambio. Actualiza los participantes y comprueba su estado.';
    default:
      return 'No se pudieron consultar o actualizar los participantes. Inténtalo de nuevo.';
  }
}

async function mutate(
  promotionId: string,
  userId: string,
  remove: boolean,
): Promise<void> {
  const csrf = record(
    await (await apiFetch('/api/auth/csrf')).json(),
  ).csrfToken;
  if (typeof csrf !== 'string' || !csrf) throw new ApiError(0);
  const suffix = remove ? '/' + encodeURIComponent(userId) : '';
  const response = await apiFetch(
    `${path(promotionId)}/participants${suffix}`,
    {
      method: remove ? 'DELETE' : 'POST',
      headers: {
        'X-CSRF-Token': csrf,
        ...(remove ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(remove
        ? {}
        : {
            body: JSON.stringify({
              userId,
            } satisfies operations['PromotionsController_addParticipant']['requestBody']['content']['application/json']),
          }),
    },
  );
  if (!remove) participant(record(await response.json()).participant);
}
export const addParticipant = (promotionId: string, userId: string) =>
  mutate(promotionId, userId, false);
export const removeParticipant = (promotionId: string, userId: string) =>
  mutate(promotionId, userId, true);
