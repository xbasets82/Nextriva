import { expect, it } from 'vitest';
import { IncidentsStore } from './incidents.store.js';

it('keeps unexpected incident list infrastructure errors as safe 503 responses', async () => {
  const store = new IncidentsStore(() => {
    throw new Error('synthetic confidential infrastructure diagnostic');
  });
  await expect(
    store.list('00000000-0000-4000-8000-000000000001'),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Consulta de incidencias no disponible',
  });
});

it('keeps assignment and eligible-assignee infrastructure failures safe without raw database details', async () => {
  const store = new IncidentsStore(() => {
    throw new Error('synthetic confidential infrastructure diagnostic');
  });
  const id = '00000000-0000-4000-8000-000000000001';
  await expect(
    store.assign(id, id, { assignedToId: id, version: 1 }),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Asignación de responsable no disponible',
  });
  await expect(store.eligibleAssignees(id, id)).rejects.toMatchObject({
    status: 503,
    message: 'Consulta de responsables no disponible',
  });
});

it('keeps deletion and restricted history infrastructure errors as safe 503 responses', async () => {
  const store = new IncidentsStore(() => {
    throw new Error('synthetic confidential infrastructure diagnostic');
  });
  const id = '00000000-0000-4000-8000-000000000001';
  await expect(
    store.softDelete(id, id, { version: 1, reason: 'Synthetic reason' }),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Eliminación de incidencia no disponible',
  });
  await expect(
    store.listDeleted(id, { page: 1, pageSize: 10 }),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Consulta de incidencias no disponible',
  });
});
