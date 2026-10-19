import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiProxyTarget } from './lib/api-proxy.js';

describe('API proxy target', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the API development port by default', () => {
    vi.stubEnv('API_PROXY_TARGET', '');

    expect(resolveApiProxyTarget()).toBe('http://127.0.0.1:3000');
  });

  it('accepts an explicit target for managed E2E servers', () => {
    vi.stubEnv('API_PROXY_TARGET', 'http://127.0.0.1:4317');

    expect(resolveApiProxyTarget()).toBe('http://127.0.0.1:4317');
  });
});
