import { afterEach, expect, it, vi } from 'vitest';
import {
  getIncident,
  createIncident,
  listIncidents,
  incidentFilterOptions,
} from './incidents.js';
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

it('sends only approved incident list filters and validates pagination metadata', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [],
        page: 2,
        pageSize: 5,
        total: 11,
        totalPages: 3,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    listIncidents({
      q: 'fachada & patio',
      promotionId: 'promotion-id',
      category: 'STRUCTURE',
      sortBy: 'status',
      sortDirection: 'desc',
      page: 2,
      pageSize: 5,
    }),
  ).resolves.toMatchObject({ page: 2, pageSize: 5, total: 11, totalPages: 3 });
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents?q=fachada+%26+patio&promotionId=promotion-id&category=STRUCTURE&sortBy=status&sortDirection=desc&page=2&pageSize=5',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
});

it.each([
  null,
  {},
  { items: null, page: 1, pageSize: 20, total: 0, totalPages: 0 },
  { items: {}, page: 1, pageSize: 20, total: 0, totalPages: 0 },
  { items: [null], page: 1, pageSize: 20, total: 0, totalPages: 0 },
  {
    items: [{ id: 'partial' }],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
  { items: [], page: 0, pageSize: 20, total: 0, totalPages: 0 },
  { items: [], page: 1, pageSize: 101, total: 0, totalPages: 0 },
])('rejects malformed incident list success %j', async (payload) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
  );
  await expect(listIncidents()).rejects.toMatchObject({ status: 0 });
});
it('reads an empty incident list through the authenticated transport', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(listIncidents({ page: 1, pageSize: 20 })).resolves.toMatchObject(
    {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents?page=1&pageSize=20',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
});

it('reads only the approved assignee filter fields from the typed endpoint', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            assignees: [
              {
                id: 'responsible',
                firstName: 'Ana',
                lastName: 'Prueba',
                email: 'ana@example.test',
                unexpected: 'not exposed',
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
  await expect(incidentFilterOptions()).resolves.toEqual([
    {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Prueba',
      email: 'ana@example.test',
    },
  ]);
});
it.each([
  { assignees: null },
  { assignees: [{ id: 'responsible', firstName: 'Ana', lastName: 'Prueba' }] },
])('rejects malformed assignee filter responses safely', async (payload) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  );
  await expect(incidentFilterOptions()).rejects.toMatchObject({ status: 0 });
});
