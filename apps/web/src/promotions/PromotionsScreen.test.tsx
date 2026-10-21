import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { PromotionsScreen } from './PromotionsScreen.js';

const promotion = {
  id: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  name: 'Promoción sintética',
  description: 'Descripción de prueba',
  location: 'Barcelona',
  status: 'ACTIVE',
  phases: ['PLANNING', 'AFTER_SALES'],
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.history.replaceState(null, '', '/#/promotions');
  vi.stubGlobal('fetch', (path: RequestInfo | URL, init?: RequestInit) =>
    path === '/api/auth/session'
      ? Promise.resolve(
          response({
            user: {
              id: 'admin',
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: 'admin@example.test',
              role: 'ADMIN',
              isActive: true,
              createdAt: 'date',
              updatedAt: 'date',
            },
          }),
        )
      : fetchMock(path, init),
  );
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    if (path === '/api/health') return response({ status: 'ok' });
    if (path === '/api/promotions')
      return response({ promotions: [promotion] });
    if (path === `/api/promotions/${promotion.id}`)
      return response({ promotion });
    return response({}, 404);
  });
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

it('navigates from the list to a persistent detail route identifying ordered phases', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('link', { name: promotion.name }));
  expect(
    await screen.findByRole('heading', { name: promotion.name, level: 2 }),
  ).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: promotion.name, level: 2 }),
  );
  expect(window.location.hash).toBe(`#/promotions/${promotion.id}`);
  const phases = screen.getByRole('list', { name: 'Fases activas' });
  expect(
    within(phases)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Planificación y planos básicos', 'Posventa']);
  expect(screen.getByText('Barcelona')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Volver a promociones' }));
  expect(
    await screen.findByRole('heading', { name: 'Promociones' }),
  ).toBeTruthy();
});

it('announces loading and empty results without invented promotions', async () => {
  fetchMock.mockImplementation(async (path) =>
    path === '/api/promotions'
      ? response({ promotions: [] })
      : response({ status: 'ok' }),
  );
  render(<App />);
  expect(await screen.findByText('No hay promociones.')).toBeTruthy();
});

it.each([401, 403, 503])(
  'shows a safe %i error and retries',
  async (status) => {
    fetchMock.mockImplementation(async (path) =>
      path === '/api/promotions'
        ? response({ message: 'private diagnostic' }, status)
        : response({ status: 'ok' }),
    );
    render(status === 401 ? <PromotionsScreen id={undefined} /> : <App />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('private diagnostic');
    expect(
      screen.queryByRole('button', { name: 'Crear promoción' }),
    ).toBeNull();
    fetchMock.mockImplementation(async () =>
      response({ promotions: [promotion] }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('link', { name: promotion.name }),
    ).toBeTruthy();
  },
);

it('opens an archived detail directly without exposing editing', async () => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  fetchMock.mockImplementation(async (path) =>
    path === '/api/health'
      ? response({ status: 'ok' })
      : response({ promotion: { ...promotion, status: 'ARCHIVED' } }),
  );
  render(<App />);
  expect(await screen.findByText('Archivada')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Editar promoción' })).toBeNull();
});

it('rejects malformed response phases', async () => {
  fetchMock.mockImplementation(async (path) =>
    path === '/api/health'
      ? response({ status: 'ok' })
      : response({ promotions: [{ ...promotion, phases: ['UNKNOWN'] }] }),
  );
  render(<App />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('link', { name: promotion.name })).toBeNull();
});
