import { expect, it, vi } from 'vitest';
import { createGeoapifyAddressProvider } from './AddressAutocompleteProvider.js';

it('queries the fixed Geoapify endpoint with Spanish bias, bounded suggestions and no credentials', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [{ place_id: 'id', formatted: '  Dirección legible  ' }],
      }),
    ),
  );
  const signal = new AbortController().signal;
  const result = await createGeoapifyAddressProvider(
    'synthetic-test-key',
    request,
  ).suggest('Carrer 25', signal);
  expect(result).toEqual([{ id: 'id', label: 'Dirección legible' }]);
  const url = new URL(String(request.mock.calls[0]?.[0]));
  expect(url.origin + url.pathname).toBe(
    'https://api.geoapify.com/v1/geocode/autocomplete',
  );
  expect(url.searchParams.get('text')).toBe('Carrer 25');
  expect(url.searchParams.get('bias')).toBe('countrycode:es');
  expect(url.searchParams.has('filter')).toBe(false);
  expect(url.searchParams.get('limit')).toBe('5');
  expect(request.mock.calls[0]?.[1]).toEqual({
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
});

it.each([
  new Response('{}', { status: 429 }),
  new Response('{"results":null}'),
  new Response('[]'),
])('rejects unavailable or malformed provider responses', async (response) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(
    createGeoapifyAddressProvider('synthetic-test-key', request).suggest(
      'Sabadell',
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});

it('ignores malformed entries and limits normalized suggestions to five', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [
          null,
          {},
          { formatted: '   ' },
          ...Array.from({ length: 7 }, (_, index) => ({
            formatted: `Address ${index}`,
          })),
        ],
      }),
    ),
  );
  const result = await createGeoapifyAddressProvider(
    'synthetic-test-key',
    request,
  ).suggest('Sabadell', new AbortController().signal);
  expect(result).toHaveLength(5);
  expect(result[0]).toEqual({ id: '0', label: 'Address 0' });
});
