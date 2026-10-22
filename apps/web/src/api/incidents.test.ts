import { afterEach, expect, it, vi } from 'vitest';
import { getIncident, createIncident } from './incidents.js';
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
