import type { operations } from './schema.js';
import { ApiError, readUser } from './users.js';
import { advanceSession, apiFetch } from './transport.js';

type Credentials =
  operations['AuthController_login']['requestBody']['content']['application/json'];
export class AuthCoordinationError extends Error {
  constructor() {
    super(
      'Este navegador no permite coordinar la sesión de forma segura. Usa un navegador actualizado mediante HTTPS o localhost.',
    );
  }
}

async function coordinateSession<T>(operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new AuthCoordinationError();
  return await navigator.locks.request('nextriva-auth-transition', operation);
}

export function login({ email, password }: Credentials) {
  return coordinateSession(async () => {
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
  });
}
export function logout(): Promise<void> {
  return coordinateSession(async () => {
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
  });
}
type PasswordChange =
  operations['AuthController_changePassword']['requestBody']['content']['application/json'];
export function changePassword(input: PasswordChange): Promise<void> {
  return coordinateSession(async () => {
    const body: unknown = await (await apiFetch('/api/auth/csrf')).json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('csrfToken' in body) ||
      typeof body.csrfToken !== 'string' ||
      !body.csrfToken
    )
      throw new ApiError(0);
    await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': body.csrfToken,
      },
      body: JSON.stringify(input),
    });
    advanceSession();
  });
}

export function loginError(error: unknown): string {
  if (error instanceof AuthCoordinationError) return error.message;
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
