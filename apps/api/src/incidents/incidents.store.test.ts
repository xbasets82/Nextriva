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
