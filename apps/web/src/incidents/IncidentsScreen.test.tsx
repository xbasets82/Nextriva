import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  assignedToId: null,
  solution: null,
  solutionSubmittedById: null,
  solutionSubmittedAt: null,
  validatedById: null,
  closedAt: null,
  version: 1,
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const emptyPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};
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
    if (path === '/api/promotions')
      return response({
        promotions: [
          {
            id: incident.promotionId,
            name: 'Promoción visible',
            status: 'ACTIVE',
            phases: ['PLANNING'],
            createdAt: '2026-10-22',
            updatedAt: '2026-10-22',
          },
        ],
      });
    if (path === '/api/incidents/filter-options')
      return response({
        assignees: [
          {
            id: 'assignee-uuid',
            firstName: 'Ana',
            lastName: 'Prueba',
            email: 'ana@example.test',
          },
        ],
      });
    if (String(path).startsWith('/api/incidents/'))
      return response({
        incident: {
          ...incident,
          assignedTo: null,
          comments: [],
          promotionStatus: 'ACTIVE',
        },
      });
    return response(emptyPage);
  });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

it('announces incident loading while keeping private rows absent', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (String(path).startsWith('/api/incidents'))
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
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Incidencias' }),
    ),
  );
  expect(screen.getByRole('link', { name: 'Incidencias' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
});
it('shows a safe error and retries the list without exposing infrastructure details', async () => {
  const original = fetchMock.getMockImplementation()!;
  let attempts = 0;
  fetchMock.mockImplementation(async (path, init) =>
    String(path).startsWith('/api/incidents?') && ++attempts === 1
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
    path === '/api/incidents' || String(path).startsWith('/api/incidents?')
      ? response({ ...emptyPage, items: [incident], total: 1, totalPages: 1 })
      : original(path, init),
  );
  render(<App />);
  const link = await screen.findByRole('link', {
    name: 'INC-000123 — Fisura accesible',
  });
  expect(link.getAttribute('href')).toBe(`#/incidents/${incident.id}`);
  expect(
    within(
      screen.getByRole('list', { name: 'Incidencias accesibles' }),
    ).getByText('Promoción visible'),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole('list', { name: 'Incidencias accesibles' }),
    ).getByRole('img', { name: 'Cerrada' }),
  ).toBeTruthy();
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

it('filters incidents and clears the active criteria from the accessible list', async () => {
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  const search = screen.getByRole('searchbox', {
    name: 'Código o título',
  });
  fireEvent.change(search, { target: { value: 'fachada' } });
  expect((search as HTMLInputElement).value).toBe('fachada');
  fireEvent.change(screen.getByLabelText('Categoría'), {
    target: { value: 'STRUCTURE' },
  });

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents?q=fachada&category=STRUCTURE&page=1&pageSize=10',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents?page=1&pageSize=10',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    ),
  );
});

it('Issue 105 automatically applies named filter options, requests ten rows and debounces search without stealing focus', async () => {
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  expect(screen.queryByRole('button', { name: 'Buscar' })).toBeNull();
  expect(
    await screen.findByRole('option', { name: 'Promoción visible' }),
  ).toBeTruthy();
  expect(
    await screen.findByRole('option', {
      name: 'Ana Prueba — ana@example.test',
    }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Promoción'), {
    target: { value: incident.promotionId },
  });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents?promotionId=${incident.promotionId}&page=1&pageSize=10`,
      expect.anything(),
    ),
  );
  const search = screen.getByRole('searchbox', { name: 'Código o título' });
  search.focus();
  fireEvent.change(search, { target: { value: '  fachada  ' } });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents?q=fachada&promotionId=${incident.promotionId}&page=1&pageSize=10`,
      expect.anything(),
    ),
  );
  expect(document.activeElement).toBe(search);
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/incidents?page=1&pageSize=10',
      expect.anything(),
    ),
  );
});

it('keeps promotion names and options available when responsible options fail, and retries only the failed source', async () => {
  const original = fetchMock.getMockImplementation()!;
  let unavailable = true;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/incidents/filter-options' && unavailable)
      return response({ message: 'Not Found' }, 404);
    if (String(path).startsWith('/api/incidents?'))
      return response({
        ...emptyPage,
        items: [incident],
        total: 1,
        totalPages: 1,
      });
    return original(path, init);
  });
  render(<App />);
  expect(
    await screen.findByRole('option', { name: 'Promoción visible' }),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole('list', { name: 'Incidencias accesibles' }),
    ).getByText('Promoción visible'),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText('Promoción') as HTMLSelectElement).disabled,
  ).toBe(false);
  expect(
    (screen.getByLabelText('Responsable') as HTMLSelectElement).disabled,
  ).toBe(true);
  expect(
    await screen.findByText('No se pudieron cargar los responsables.'),
  ).toBeTruthy();
  unavailable = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar responsables' }),
  );
  expect(
    await screen.findByRole('option', {
      name: 'Ana Prueba — ana@example.test',
    }),
  ).toBeTruthy();
  expect(
    fetchMock.mock.calls.filter(([path]) => path === '/api/promotions'),
  ).toHaveLength(1);
});

it('keeps responsible options available when promotions fail and retries promotions independently', async () => {
  const original = fetchMock.getMockImplementation()!;
  let unavailable = true;
  fetchMock.mockImplementation(async (path, init) =>
    path === '/api/promotions' && unavailable
      ? response({ message: 'Unavailable' }, 503)
      : original(path, init),
  );
  render(<App />);
  expect(
    await screen.findByRole('option', {
      name: 'Ana Prueba — ana@example.test',
    }),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText('Responsable') as HTMLSelectElement).disabled,
  ).toBe(false);
  expect(
    (screen.getByLabelText('Promoción') as HTMLSelectElement).disabled,
  ).toBe(true);
  expect(
    await screen.findByText('No se pudieron cargar las promociones.'),
  ).toBeTruthy();
  unavailable = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar promociones' }),
  );
  expect(
    await screen.findByRole('option', { name: 'Promoción visible' }),
  ).toBeTruthy();
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === '/api/incidents/filter-options',
    ),
  ).toHaveLength(1);
});

it('Issue 105 debounces exactly 300ms and ignores stale list responses', async () => {
  let resolveOld: ((response: Response) => void) | undefined;
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (String(path).includes('q=antigua'))
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    if (String(path).includes('q=nueva'))
      return response({
        ...emptyPage,
        pageSize: 10,
        items: [{ ...incident, title: 'Resultado nuevo' }],
        total: 1,
        totalPages: 1,
      });
    return original(path, init);
  });
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  vi.useFakeTimers();
  const search = screen.getByRole('searchbox', { name: 'Código o título' });
  fireEvent.change(search, { target: { value: 'antigua' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(299);
  });
  expect(
    fetchMock.mock.calls.filter(([path]) => String(path).includes('q=antigua')),
  ).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(
    fetchMock.mock.calls.filter(([path]) => String(path).includes('q=antigua')),
  ).toHaveLength(1);
  fireEvent.change(search, { target: { value: 'nueva' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(screen.getByText('Resultado nuevo')).toBeTruthy();
  await act(async () => {
    resolveOld?.(
      response({
        ...emptyPage,
        items: [{ ...incident, title: 'Resultado antiguo' }],
        total: 1,
        totalPages: 1,
      }),
    );
  });
  expect(screen.queryByText('Resultado antiguo')).toBeNull();
  expect(screen.getByText('Resultado nuevo')).toBeTruthy();
});

it('Issue 105 preserves filters and page on detail return and resets page when a selector changes', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (String(path).startsWith('/api/incidents?')) {
      const params = new URLSearchParams(String(path).split('?')[1]);
      return response({
        ...emptyPage,
        page: Number(params.get('page')),
        pageSize: 10,
        items: [incident],
        total: 21,
        totalPages: 3,
      });
    }
    return original(path, init);
  });
  render(<App />);
  await screen.findByRole('link', { name: /INC-000123/ });
  fireEvent.change(screen.getByLabelText('Prioridad'), {
    target: { value: 'HIGH' },
  });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents?priority=HIGH&page=1&pageSize=10',
      expect.anything(),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Página 2 de 3');
  fireEvent.click(screen.getByRole('link', { name: /INC-000123/ }));
  fireEvent(window, new HashChangeEvent('hashchange'));
  await screen.findByRole('heading', { name: incident.title });
  fireEvent.click(screen.getByRole('link', { name: 'Volver a incidencias' }));
  fireEvent(window, new HashChangeEvent('hashchange'));
  await screen.findByText('Página 2 de 3');
  expect((screen.getByLabelText('Prioridad') as HTMLSelectElement).value).toBe(
    'HIGH',
  );
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'CLOSED' },
  });
  await screen.findByText('Página 1 de 3');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents?status=CLOSED&priority=HIGH&page=1&pageSize=10',
    expect.anything(),
  );
});
