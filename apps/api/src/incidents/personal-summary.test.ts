import { expect, it } from 'vitest';
import { IncidentsStore } from './incidents.store.js';
import { incidentVisibility, personalCounts } from './personal-summary.js';
it('includes the four official states with explicit zero counts', () => {
  expect(personalCounts([])).toEqual({
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING_VALIDATION: 0,
    CLOSED: 0,
  });
  expect(
    personalCounts([
      { status: 'IN_PROGRESS', _count: { _all: 3 } },
      { status: 'CLOSED', _count: { _all: 1 } },
    ]),
  ).toEqual({ OPEN: 0, IN_PROGRESS: 3, PENDING_VALIDATION: 0, CLOSED: 1 });
});
it('reuses a global ADMIN scope and participant scopes for MANAGER and COLLABORATOR', () => {
  expect(incidentVisibility('actor', 'ADMIN').where).toEqual({});
  expect(incidentVisibility('actor', 'MANAGER').where).toEqual({
    promotion: { participants: { some: { userId: 'actor' } } },
  });
  expect(incidentVisibility('actor', 'COLLABORATOR').where).toEqual({
    promotion: { participants: { some: { userId: 'actor' } } },
    OR: [{ createdById: 'actor' }, { assignedToId: 'actor' }],
  });
  expect(incidentVisibility('actor', 'MANAGER').sql.values).toEqual(['actor']);
  expect(incidentVisibility('actor', 'COLLABORATOR').sql.values).toEqual([
    'actor',
    'actor',
    'actor',
  ]);
});
it('redacts infrastructure failures of the personal summary', async () => {
  const store = new IncidentsStore(() => {
    throw new Error('synthetic confidential detail');
  });
  await expect(
    store.personalSummary('00000000-0000-4000-8000-000000000001'),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Resumen personal no disponible',
  });
});
