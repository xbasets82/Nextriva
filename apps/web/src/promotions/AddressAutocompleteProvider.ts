export type AddressSuggestion = { id: string; label: string };

export interface AddressAutocompleteProvider {
  suggest(query: string, signal: AbortSignal): Promise<AddressSuggestion[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createGeoapifyAddressProvider(
  apiKey: string,
  request: typeof fetch = fetch,
): AddressAutocompleteProvider {
  return {
    async suggest(query, signal) {
      const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
      url.search = new URLSearchParams({
        text: query,
        apiKey,
        lang: 'es',
        bias: 'countrycode:es',
        limit: '5',
        format: 'json',
      }).toString();
      const response = await request(url, {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('Address suggestions unavailable');
      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.results))
        throw new Error('Invalid address suggestions');
      return body.results
        .filter(isRecord)
        .filter(
          (item) => typeof item.formatted === 'string' && item.formatted.trim(),
        )
        .slice(0, 5)
        .map((item, index) => ({
          id: typeof item.place_id === 'string' ? item.place_id : String(index),
          label: String(item.formatted).trim(),
        }));
    },
  };
}

const publicApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
export const configuredAddressProvider = publicApiKey
  ? createGeoapifyAddressProvider(publicApiKey)
  : undefined;
