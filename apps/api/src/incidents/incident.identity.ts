import type { Prisma, UserRole } from '../../generated/prisma/client.js';

export const incidentPersonSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

// Solo se proyectan identidades ya autorizadas por el ámbito de la incidencia.
export function presentIncidentIdentity<T extends { email: string }>(
  person: T,
  role: UserRole,
) {
  const { email, ...name } = person;
  return { ...name, ...(role === 'COLLABORATOR' ? {} : { email }) };
}

export function redactIncidentHistory(
  value: Prisma.JsonValue,
  role: UserRole,
): Prisma.JsonValue {
  if (role !== 'COLLABORATOR' || value === null || typeof value !== 'object')
    return value;
  if (Array.isArray(value))
    return value.map((entry) => redactIncidentHistory(entry, role));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'email')
      .map(([key, entry]) => [key, redactIncidentHistory(entry ?? null, role)]),
  );
}

export function historyObject(
  value: Prisma.JsonValue | undefined,
): Prisma.JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
}

// Los nombres históricos solo se toman de la instantánea registrada, nunca de IDs resueltos a posteriori.
export function historicalIdentity(value: Prisma.JsonValue | undefined) {
  const person = historyObject(value);
  if (
    !person ||
    typeof person.id !== 'string' ||
    typeof person.firstName !== 'string' ||
    typeof person.lastName !== 'string' ||
    typeof person.email !== 'string'
  )
    return undefined;
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
  };
}
