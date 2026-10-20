import type { operations } from './schema.js';

export type User =
  operations['UsersController_list']['responses'][200]['content']['application/json']['users'][number];
export type Role = User['role'];

export class ApiError extends Error {
  constructor(readonly status: number) {
    super('No se pudo completar la solicitud');
  }
}
export function errorMessage(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  switch (status) {
    case 401:
      return 'La sesión ha caducado. Se necesita una sesión válida.';
    case 403:
      return 'No tienes permisos o la protección de la solicitud no es válida.';
    default:
      return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
  }
}
async function request(path: string): Promise<unknown> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApiError(0);
  return value as Record<string, unknown>;
}
function readUser(value: unknown): User {
  const item = record(value);
  if (
    ['id', 'firstName', 'lastName', 'email', 'createdAt', 'updatedAt'].some(
      (key) => typeof item[key] !== 'string',
    ) ||
    typeof item.isActive !== 'boolean' ||
    !['ADMIN', 'MANAGER', 'COLLABORATOR'].includes(String(item.role))
  )
    throw new ApiError(0);
  // Solo se proyectan campos públicos del contrato; nunca se conserva el cuerpo completo.
  return {
    id: String(item.id),
    firstName: String(item.firstName),
    lastName: String(item.lastName),
    email: String(item.email),
    role: item.role as Role,
    isActive: item.isActive,
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}
export async function currentUser(): Promise<User> {
  return readUser(record(await request('/api/auth/session')).user);
}
export async function listUsers(): Promise<User[]> {
  const payload = record(await request('/api/users'));
  if (!Array.isArray(payload.users)) throw new ApiError(0);
  return payload.users.map(readUser);
}
