import type { operations } from './schema.js';
import { ApiError, readUser } from './users.js';
import { advanceSession, apiFetch } from './transport.js';

type Credentials =
  operations['AuthController_login']['requestBody']['content']['application/json'];
export async function login({ email, password }: Credentials) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new ApiError(response.status);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('user' in body))
    throw new ApiError(0);
  const user = readUser(body.user);
  advanceSession();
  return user;
}
export async function logout(): Promise<void> {
  const body: unknown = await (await apiFetch('/api/auth/csrf')).json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string' ||
    !body.csrfToken
  )
    throw new ApiError(0);
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': body.csrfToken },
  });
  advanceSession();
}
export function loginError(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  switch (status) {
    case 400:
      return 'Revisa el email y la contraseña.';
    case 401:
      return 'Email o contraseña incorrectos.';
    case 403:
      return 'No se pudo validar la solicitud de acceso. Recarga la página e inténtalo de nuevo.';
    case 429:
      return 'Demasiados intentos. Inténtalo más tarde.';
    default:
      return 'No se pudo conectar con el servicio. Inténtalo de nuevo.';
  }
}
