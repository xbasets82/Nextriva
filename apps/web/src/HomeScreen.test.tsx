import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it } from 'vitest';
import { admin, fetchMock, response } from '../test-support/auth-test-setup.js';
import { App } from './App.js';
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
function authenticated(summary: unknown = empty, role = 'ADMIN') {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session')
      return response({ user: { ...admin, role } });
    if (path === '/api/incidents/personal-summary') return response(summary);
    if (String(path).startsWith('/api/incidents?'))
      return response({
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize: 10,
      });
    if (path === '/api/incidents/filter-options')
      return response({
        assignees: [
          {
            id: admin.id,
            firstName: admin.firstName,
            lastName: admin.lastName,
            email: admin.email,
          },
        ],
      });
    return response({ promotions: [] });
  });
}
it.each(['ADMIN', 'MANAGER', 'COLLABORATOR'])(
  'opens personal Home from the root for %s without broadening navigation',
  async (role) => {
    authenticated(empty, role);
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Resumen de incidencias' }),
    ).toBeTruthy();
    await screen.findByText('No tienes incidencias asignadas.');
    expect(window.location.hash).toBe('#/home');
    expect(
      screen.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current'),
    ).toBe('page');
    const counts = screen.getByRole('list', { name: 'Recuentos por estado' });
    expect(within(counts).getAllByRole('listitem')).toHaveLength(4);
    for (const item of within(counts).getAllByRole('listitem'))
      expect(item.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Usuarios' }) !== null).toBe(
      role === 'ADMIN',
    );
  },
);
it('shows accessible loading, a recoverable safe error, then four counts and a prioritized link', async () => {
  authenticated();
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((path) =>
    path === '/api/auth/session'
      ? Promise.resolve(response({ user: admin }))
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  render(<App />);
  expect(await screen.findByText('Cargando tus incidencias…')).toBeTruthy();
  finish(response({}, 503));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo cargar tu resumen. Inténtalo de nuevo.',
  );
  authenticated({
    ...empty,
    countsByStatus: {
      OPEN: 2,
      IN_PROGRESS: 1,
      PENDING_VALIDATION: 0,
      CLOSED: 3,
    },
    priorityItems: [
      {
        id: 'one',
        publicCode: 'INC-000001',
        title: 'Revisar cubierta',
        promotionId: 'p',
        promotionName: 'Jardines del Norte',
        status: 'OPEN',
        priority: 'HIGH',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('link', { name: 'INC-000001' })).toBeTruthy();
  expect(screen.getByText('Jardines del Norte')).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'INC-000001' })
      .closest('li')
      ?.querySelector('time')
      ?.getAttribute('dateTime'),
  ).toBe('2026-01-01T00:00:00Z');
  expect(screen.getByLabelText('Alta')).toBeTruthy();
  expect(
    screen.getByRole('figure', { name: 'Mis incidencias por estado' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('list', { name: 'Recuentos por estado' }).textContent,
  ).toContain('Cerrada: 3');
});
it('navigates with the existing assignee filter and preserves it after opening another route', async () => {
  authenticated();
  render(<App />);
  await screen.findByText('No tienes incidencias asignadas.');
  fireEvent.click(
    screen.getByRole('link', { name: 'Ver todas mis incidencias' }),
  );
  await screen.findByRole('heading', { name: 'Incidencias' });
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([path]) =>
        String(path).includes('assignedToId=a'),
      ),
    ).toBe(true),
  );
  window.location.hash = '/promotions';
  fireEvent(window, new HashChangeEvent('hashchange'));
  await screen.findByRole('heading', { name: 'Promociones' });
  fireEvent.click(screen.getByRole('link', { name: 'Incidencias' }));
  await screen.findByRole('heading', { name: 'Incidencias' });
  expect(
    (screen.getByLabelText('Responsable') as HTMLSelectElement).value,
  ).toBe(admin.id);
  fireEvent.click(screen.getByRole('link', { name: 'Nextriva — Inicio' }));
  expect(
    await screen.findByRole('heading', { name: 'Resumen de incidencias' }),
  ).toBeTruthy();
  const before = fetchMock.mock.calls.filter(
    ([path]) => path === '/api/incidents/personal-summary',
  ).length;
  fireEvent.click(screen.getByRole('link', { name: 'Nextriva — Inicio' }));
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === '/api/incidents/personal-summary',
    ),
  ).toHaveLength(before);
});

it('retains the explicit current-user filter when no assigned incidents provide a filter option', async () => {
  authenticated();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/incidents/filter-options'
      ? Promise.resolve(response({ assignees: [] }))
      : base(path, init),
  );
  render(<App />);
  await screen.findByText('No tienes incidencias asignadas.');
  fireEvent.click(
    screen.getByRole('link', { name: 'Ver todas mis incidencias' }),
  );
  await screen.findByRole('heading', { name: 'Incidencias' });
  const select = await screen.findByRole('combobox', { name: 'Responsable' });
  await waitFor(() =>
    expect((select as HTMLSelectElement).disabled).toBe(false),
  );
  expect((select as HTMLSelectElement).value).toBe(admin.id);
  expect(
    within(select).getByRole('option', { selected: true }).textContent,
  ).toBe(`${admin.firstName} ${admin.lastName} — ${admin.email}`);
});

it('toggles only the chart between assigned and role-visible counts without changing priority items', async () => {
  authenticated({
    ...empty,
    countsByStatus: {
      OPEN: 1,
      IN_PROGRESS: 0,
      PENDING_VALIDATION: 0,
      CLOSED: 0,
    },
    visibleCountsByStatus: {
      OPEN: 5,
      IN_PROGRESS: 2,
      PENDING_VALIDATION: 1,
      CLOSED: 3,
    },
    priorityItems: [
      {
        id: 'own',
        publicCode: 'INC-000001',
        title: 'Mi incidencia asignada',
        promotionId: 'p',
        promotionName: 'Promoción visible',
        status: 'OPEN',
        priority: 'HIGH',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  });
  render(<App />);
  await screen.findByRole('link', { name: 'INC-000001' });
  const counts = screen.getByRole('list', { name: 'Recuentos por estado' });
  expect(counts.textContent).toContain('Abierta: 1');
  const priority = screen.getByRole('list', {
    name: 'Incidencias prioritarias',
  }).textContent;
  const calls = fetchMock.mock.calls.length;
  const all = screen.getByRole('button', { name: 'Todas visibles' });
  fireEvent.click(all);
  expect(all.getAttribute('aria-pressed')).toBe('true');
  expect(
    within(counts)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual([
    'Abierta: 5',
    'En curso: 2',
    'Pendiente de validación: 1',
    'Cerrada: 3',
  ]);
  expect(
    screen.getByRole('figure', { name: 'Incidencias visibles por estado' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('list', { name: 'Incidencias prioritarias' }).textContent,
  ).toBe(priority);
  expect(
    screen
      .getByRole('link', { name: 'Ver todas mis incidencias' })
      .getAttribute('href'),
  ).toBe('#/incidents');
  expect(fetchMock.mock.calls).toHaveLength(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Asignadas a mí' }));
  expect(counts.textContent).toContain('Abierta: 1');
  expect(
    screen.getByRole('list', { name: 'Incidencias prioritarias' }).textContent,
  ).toBe(priority);
});

it('removes the visible Home title while keeping an accessible summary heading and Home navigation', async () => {
  authenticated();
  render(<App />);
  await screen.findByText('No tienes incidencias asignadas.');
  expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
  expect(
    screen
      .getByRole('heading', { name: 'Resumen de incidencias' })
      .classList.contains('sr-only'),
  ).toBe(true);
  expect(screen.getByRole('link', { name: 'Inicio' })).toBeTruthy();
});
