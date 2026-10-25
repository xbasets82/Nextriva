import { expect, it } from 'vitest';
import { formatIncidentCreatedAt } from './IncidentCreatedAt.js';

it('formats creation date and date-time with the Spanish locale in browser local time', () => {
  const value = '2026-10-22T12:00:00.000Z';
  expect(formatIncidentCreatedAt(value)).toBe(
    new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(
      new Date(value),
    ),
  );
  expect(formatIncidentCreatedAt(value, true)).toBe(
    new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)),
  );
});

it('provides a safe fallback for an invalid creation date', () => {
  expect(formatIncidentCreatedAt('invalid date')).toBe('Fecha no disponible');
});
