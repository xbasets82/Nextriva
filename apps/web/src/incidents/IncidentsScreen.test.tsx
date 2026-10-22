import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import type { Incident } from '../api/incidents.js';

const incident: Incident = {
  id: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  publicCode: 'INC-000123',
  promotionId: '98c4837d-fd7e-459e-ae92-c29258cb4cea',
  originPhase: 'AFTER_SALES',
  title: 'Fisura accesible',
  description: 'Descripción de la incidencia de prueba.',
  category: 'STRUCTURE',
  priority: 'HIGH',
  status: 'CLOSED',
  createdById: 'creator',
  version: 1,
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.history.replaceState(null, '', '/#/incidents');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session')
      return response({
        user: {
          id: 'creator',
          firstName: 'Synthetic',
          lastName: 'User',
          email: 'reader@example.test',
          role: 'COLLABORATOR',
          isActive: true,
          createdAt: '2026-10-22',
          updatedAt: '2026-10-22',
        },
      });
    if (path === '/api/health') return response({ status: 'ok' });
    if (String(path).startsWith('/api/incidents/'))
      return response({ incident });
    return response({ incidents: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

it('announces incident loading while keeping private rows absent', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/incidents')
      return new Promise<Response>(() => undefined);
    return original(path, init);
  });
  render(<App />);
  expect(await screen.findByText('Consultando incidencias…')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /INC-000123/ })).toBeNull();
});
it('shows an accessible empty list and focuses the list heading', async () => {
  render(<App />);
  const empty = await screen.findByText('No hay incidencias accesibles.');
  expect(empty.getAttribute('role')).toBe('status');
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'Incidencias' }),
  );
  expect(screen.getByRole('link', { name: 'Incidencias' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
});
it('shows a safe error and retries the list without exposing infrastructure details', async () => {
  const original = fetchMock.getMockImplementation()!;
  let attempts = 0;
  fetchMock.mockImplementation(async (path, init) =>
    path === '/api/incidents' && ++attempts === 1
      ? response({ message: 'private database diagnostic' }, 503)
      : original(path, init),
  );
  render(<App />);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'No se pudo completar la solicitud. Inténtalo de nuevo.',
  );
  expect(screen.queryByText('private database diagnostic')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(
    await screen.findByText('No hay incidencias accesibles.'),
  ).toBeTruthy();
  expect(attempts).toBe(2);
});
it('navigates from a safely rendered row to the existing read-only detail and back', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) =>
    path === '/api/incidents'
      ? response({ incidents: [incident] })
      : original(path, init),
  );
  render(<App />);
  const link = await screen.findByRole('link', {
    name: 'INC-000123 — Fisura accesible',
  });
  expect(link.getAttribute('href')).toBe(`#/incidents/${incident.id}`);
  expect(screen.getByText('Posventa')).toBeTruthy();
  expect(screen.getByText('Cerrada')).toBeTruthy();
  fireEvent.click(link);
  fireEvent(window, new HashChangeEvent('hashchange'));
  await waitFor(() =>
    expect(window.location.hash).toBe(`#/incidents/${incident.id}`),
  );
  expect(
    await screen.findByRole('heading', { name: incident.title }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'Volver a incidencias' })
      .getAttribute('href'),
  ).toBe('#/incidents');
  expect(screen.queryByRole('form')).toBeNull();
});
