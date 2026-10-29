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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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

it('Issue 117 changes server sorting while preserving filters and resetting pagination', async () => {
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
  await screen.findByRole('link', { name: /INC-000123/ });
  fireEvent.change(screen.getByLabelText('Categoría'), {
    target: { value: 'STRUCTURE' },
  });
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Siguiente',
    }),
  );
  await screen.findByText('Página 2 de 3');
  fireEvent.change(screen.getByLabelText('Ordenar por'), {
    target: { value: 'priority' },
  });
  fireEvent.change(screen.getByLabelText('Dirección'), {
    target: { value: 'asc' },
  });

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents?category=STRUCTURE&sortBy=priority&sortDirection=asc&page=1&pageSize=10',
      expect.anything(),
    ),
  );
  await screen.findByText('Página 1 de 3');
});

it('Issue 117 exposes the creation timestamp on an incident list card', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
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
  const incidentLink = await screen.findByRole('link', {
    name: /INC-000123/,
  });
  const time = incidentLink.closest('li')?.querySelector('time');
  expect(time?.getAttribute('dateTime')).toBe(incident.createdAt);
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
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

for (const role of ['ADMIN', 'MANAGER', 'COLLABORATOR'] as const) {
  it(`Issue 106 ${role} selects an active authorized promotion and reuses the creation form`, async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) => {
      if (path === '/api/auth/session')
        return response({
          user: {
            id: 'creator',
            firstName: 'Synthetic',
            lastName: 'User',
            email: 'reader@example.test',
            role,
            isActive: true,
            createdAt: '2026-10-22',
            updatedAt: '2026-10-22',
          },
        });
      if (path === '/api/promotions')
        return response({
          promotions: [
            {
              id: incident.promotionId,
              name: 'Promoción elegible',
              status: 'ACTIVE',
              phases: ['PLANNING'],
              createdAt: '2026-10-22',
              updatedAt: '2026-10-22',
            },
            {
              id: 'archived',
              name: 'Promoción archivada',
              status: 'ARCHIVED',
              phases: ['PLANNING'],
              createdAt: '2026-10-22',
              updatedAt: '2026-10-22',
            },
          ],
        });
      if (path === `/api/promotions/${incident.promotionId}`)
        return response({
          promotion: {
            id: incident.promotionId,
            name: 'Promoción elegible',
            status: 'ACTIVE',
            phases: ['PLANNING'],
            createdAt: '2026-10-22',
            updatedAt: '2026-10-22',
          },
        });
      return original(path, init);
    });
    render(<App />);
    await screen.findByText('No hay incidencias accesibles.');
    fireEvent.click(screen.getByRole('button', { name: 'Crear incidencia' }));
    const selection = screen.getByRole('form', {
      name: 'Seleccionar promoción',
    });
    expect(screen.getByRole('heading', { name: 'Seleccionar promoción' })).toBe(
      document.activeElement,
    );
    expect(
      within(selection).queryByRole('option', { name: 'Promoción archivada' }),
    ).toBeNull();
    expect(
      within(selection).queryByRole('option', { name: 'Promoción privada' }),
    ).toBeNull();
    const next = within(selection).getByRole('button', { name: 'Continuar' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(selection).getByLabelText('Promoción'), {
      target: { value: incident.promotionId },
    });
    fireEvent.click(next);
    fireEvent(window, new HashChangeEvent('hashchange'));
    await screen.findByRole('form', { name: 'Crear incidencia' });
    expect(window.location.hash).toBe(
      `#/incidents/new/${incident.promotionId}`,
    );
    expect(screen.getByText('Promoción elegible')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
    fireEvent(window, new HashChangeEvent('hashchange'));
    await screen.findByRole('heading', { name: 'Incidencias' });
  });
}

it('Issue 106 gives the create action the same primary emphasis as other modules', async () => {
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  const create = screen.getByRole('button', { name: 'Crear incidencia' });
  expect(create.className).toContain('action-primary');
  expect(create.className).not.toContain('bg-primary');
});

it('Issue 106 explains missing eligible promotions and preserves list filters/page when cancelling selection', async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/promotions') return response({ promotions: [] });
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
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Crear incidencia' }));
  expect(screen.getByRole('status').textContent).toBe(
    'No hay promociones activas disponibles para crear incidencias.',
  );
  expect(
    (screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await screen.findByText('Página 2 de 3');
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
  expect((screen.getByLabelText('Prioridad') as HTMLSelectElement).value).toBe(
    'HIGH',
  );
});

it('Issue 106 announces promotion loading, reports a safe error and retries before enabling selection', async () => {
  const original = fetchMock.getMockImplementation()!;
  let resolvePromotions: ((value: Response) => void) | undefined;
  let attempts = 0;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/promotions' && ++attempts === 1)
      return new Promise<Response>((resolve) => {
        resolvePromotions = resolve;
      });
    return original(path, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
  await screen.findByText('No hay incidencias accesibles.');
  fireEvent.click(screen.getByRole('button', { name: 'Crear incidencia' }));
  expect(screen.getByRole('status').textContent).toBe(
    'Consultando promociones…',
  );
  expect(
    (screen.getByLabelText('Promoción') as HTMLSelectElement).disabled,
  ).toBe(true);
  await act(async () => {
    resolvePromotions?.(response({ message: 'private diagnostic' }, 503));
  });
  expect(screen.getByRole('alert').textContent).toBe(
    'No se pudieron cargar las promociones.',
  );
  expect(screen.queryByText('private diagnostic')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar promociones' }),
  );
  await screen.findByRole('option', { name: 'Promoción visible' });
  expect(
    (screen.getByLabelText('Promoción') as HTMLSelectElement).disabled,
  ).toBe(false);
});

it('Issue 106 preserves a pending search when opening creation before the debounce expires', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
  await screen.findByText('No hay incidencias accesibles.');
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Código o título' }), {
    target: { value: '  búsqueda pendiente  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear incidencia' }));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/incidents?q=b%C3%BAsqueda+pendiente&page=1&pageSize=10',
    expect.anything(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Código o título',
      }) as HTMLInputElement
    ).value,
  ).toBe('  búsqueda pendiente  ');
});

it('Issue 129 starts collapsed with an associated button and no accessible hidden controls', async () => {
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  const toggle = screen.getByRole('button', { name: 'Filtros' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.getAttribute('type')).toBe('button');
  const panelId = toggle.getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  expect(document.getElementById(panelId!)).toBeTruthy();
  expect(
    screen.queryByRole('searchbox', { name: 'Código o título' }),
  ).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Estado' })).toBeNull();
  toggle.focus();
  fireEvent.click(toggle);
  expect(document.activeElement).toBe(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(
    screen.getByRole('searchbox', { name: 'Código o título' }),
  ).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(
    screen.queryByRole('searchbox', { name: 'Código o título' }),
  ).toBeNull();
});

it('Issue 129 counts applied filters after debounce, keeps them collapsed and separates sorting', async () => {
  render(<App />);
  await screen.findByText('No hay incidencias accesibles.');
  const toggle = screen.getByRole('button', { name: 'Filtros' });
  fireEvent.click(toggle);
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Código o título' }), {
    target: { value: '  fachada  ' },
  });
  expect(toggle.textContent).not.toContain('activo');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(toggle.textContent).toContain('1 activo');
  vi.useRealTimers();
  fireEvent.change(screen.getByLabelText('Promoción'), {
    target: { value: incident.promotionId },
  });
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'OPEN' },
  });
  fireEvent.change(screen.getByLabelText('Prioridad'), {
    target: { value: 'HIGH' },
  });
  fireEvent.change(screen.getByLabelText('Categoría'), {
    target: { value: 'STRUCTURE' },
  });
  fireEvent.change(screen.getByLabelText('Responsable'), {
    target: { value: 'assignee-uuid' },
  });
  fireEvent.change(screen.getByLabelText('Ordenar por'), {
    target: { value: 'status' },
  });
  fireEvent.change(screen.getByLabelText('Dirección'), {
    target: { value: 'asc' },
  });
  expect(toggle.textContent).toContain('6 activos');
  expect(screen.getByText('Orden: Estado · Ascendente')).toBeTruthy();
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents?q=fachada&promotionId=${incident.promotionId}&status=OPEN&priority=HIGH&category=STRUCTURE&assignedToId=assignee-uuid&sortBy=status&sortDirection=asc&page=1&pageSize=10`,
      expect.anything(),
    ),
  );
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.textContent).toContain('6 activos');
  expect(screen.getByText('Orden: Estado · Ascendente')).toBeTruthy();
  const requests = fetchMock.mock.calls.length;
  fireEvent.click(toggle);
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Código o título',
      }) as HTMLInputElement
    ).value,
  ).toBe('  fachada  ');
  expect(
    (screen.getByLabelText('Responsable') as HTMLSelectElement).value,
  ).toBe('assignee-uuid');
  expect(fetchMock.mock.calls).toHaveLength(requests);
  const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
  expect(clear.querySelector('svg')?.getAttribute('data-icon')).toBe(
    'rotate-ccw',
  );
  fireEvent.click(clear);
  expect(toggle.textContent).not.toContain('activo');
  expect(screen.queryByText('Orden: Estado · Ascendente')).toBeNull();
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Código o título',
      }) as HTMLInputElement
    ).value,
  ).toBe('');
  expect(
    (screen.getByLabelText('Ordenar por') as HTMLSelectElement).value,
  ).toBe('');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
});

it.each([false, true])(
  'Issue 129 keeps keyboard focus on the filter toggle when the initial list resolves after interaction (expanded=%s)',
  async (expand) => {
    let resolveList: ((value: Response) => void) | undefined;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((path, init) =>
      String(path).startsWith('/api/incidents?')
        ? new Promise<Response>((resolve) => {
            resolveList = resolve;
          })
        : original(path, init),
    );
    render(<App />);
    await screen.findByText('Consultando incidencias…');
    const toggle = screen.getByRole('button', { name: 'Filtros' });
    toggle.focus();
    if (expand) fireEvent.click(toggle);
    expect(document.activeElement).toBe(toggle);
    await act(async () => {
      resolveList?.(response(emptyPage));
    });
    await screen.findByText('No hay incidencias accesibles.');
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe(String(expand));
  },
);
