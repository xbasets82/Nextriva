import { afterEach, expect, it, vi } from 'vitest';
import { getIncident, createIncident, listIncidents } from './incidents.js';
afterEach(() => vi.unstubAllGlobals());
it('rejects malformed HTTP success payloads instead of trusting generated TypeScript types', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ incident: { id: 'partial' } })),
      ),
  );
  await expect(getIncident('synthetic')).rejects.toMatchObject({ status: 0 });
});
it('rejects a missing CSRF token before creating an incident', async () => {
  const mocked = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({})));
  vi.stubGlobal('fetch', mocked);
  await expect(
    createIncident({
      promotionId: 'synthetic',
      originPhase: 'PLANNING',
      title: 'Título prueba',
      description: 'Descripción prueba',
      category: 'STRUCTURE',
      priority: 'MEDIUM',
    }),
  ).rejects.toMatchObject({ status: 0 });
  expect(mocked).toHaveBeenCalledTimes(1);
});

it.each([
  null,
  {},
  { incidents: null },
  { incidents: {} },
  { incidents: [null] },
  { incidents: [{ id: 'partial' }] },
])('rejects malformed incident list success %j', async (payload) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
  );
  await expect(listIncidents()).rejects.toMatchObject({ status: 0 });
});
it('reads an empty incident list through the authenticated transport', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ incidents: [] })));
  vi.stubGlobal('fetch', fetchMock);
  await expect(listIncidents()).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
});
