import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('initial health screen', () => {
  it('shows the Nextriva heading and an accessible loading state', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Nextriva' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Consultando');
  });

  it('shows the status returned by the health endpoint', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<App />);

    expect(await screen.findByText('Estado del servicio: ok')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('shows an accessible generic message when the endpoint returns an error', async () => {
    fetchMock.mockResolvedValue(
      new Response('private diagnostic', { status: 503 }),
    );

    render(<App />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain(
      'private diagnostic',
    );
  });

  it('shows an accessible generic message when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('private network diagnostic'));

    render(<App />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain(
      'private network diagnostic',
    );
  });
});
