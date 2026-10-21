export class ApiError extends Error {
  constructor(readonly status: number) {
    super('No se pudo completar la solicitud');
  }
}

let sessionEpoch = 0;
export function sessionRevision() {
  return sessionEpoch;
}
const expiredListeners = new Set<() => void>();
export function advanceSession() {
  sessionEpoch += 1;
}
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const epoch = sessionEpoch;
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401 && epoch === sessionEpoch) {
    advanceSession();
    for (const listener of expiredListeners) listener();
  }
  if (!response.ok) throw new ApiError(response.status);
  return response;
}
