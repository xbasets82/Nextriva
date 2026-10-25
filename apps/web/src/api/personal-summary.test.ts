import { afterEach, expect, it, vi } from 'vitest';
import { personalSummary } from './personal-summary.js';
const empty = {
  countsByStatus: { OPEN: 0, IN_PROGRESS: 0, PENDING_VALIDATION: 0, CLOSED: 0 },
  visibleCountsByStatus: {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING_VALIDATION: 0,
    CLOSED: 0,
  },
  priorityItems: [],
  priorityLimit: 10,
};
afterEach(() => vi.unstubAllGlobals());
it('reads the generated personal contract without sending an identity parameter', async () => {
  const item = {
    id: 'id',
    publicCode: 'INC-000001',
    title: 'Comprobación pendiente',
    promotionId: 'p',
    promotionName: 'Promoción',
    createdAt: '2026-01-01T00:00:00Z',
    priority: 'HIGH',
    status: 'OPEN',
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ...empty, priorityItems: [item] })),
    );
  vi.stubGlobal('fetch', fetchMock);
  expect(await personalSummary()).toEqual({ ...empty, priorityItems: [item] });
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents/personal-summary',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
});
it.each([
  null,
  [],
  { ...empty, countsByStatus: null },
  { ...empty, visibleCountsByStatus: undefined },
  { ...empty, visibleCountsByStatus: null },
  {
    ...empty,
    visibleCountsByStatus: { ...empty.visibleCountsByStatus, OPEN: -1 },
  },
  { ...empty, countsByStatus: { ...empty.countsByStatus, OPEN: -1 } },
  { ...empty, countsByStatus: { ...empty.countsByStatus, CLOSED: 1.5 } },
  { ...empty, priorityLimit: 11 },
  { ...empty, priorityItems: null },
  { ...empty, priorityItems: Array.from({ length: 11 }, () => ({})) },
  { ...empty, priorityItems: [{}] },
  {
    ...empty,
    priorityItems: [
      {
        id: 'id',
        publicCode: 'INC-000001',
        title: 'Título',
        promotionId: 'p',
        promotionName: 'Promoción',
        createdAt: '2026-01-01',
        status: 'CLOSED',
        priority: 'HIGH',
      },
    ],
  },
])('rejects malformed summaries safely: %j', async (payload) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
  );
  await expect(personalSummary()).rejects.toMatchObject({ status: 0 });
});
