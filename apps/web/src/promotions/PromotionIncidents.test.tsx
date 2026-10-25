import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { priorities, statusLabels, type Incident } from '../api/incidents.js';

const promotionId = 'a49c2e44-e455-4bbe-b9ce-7baee79c9893';
const incident: Incident = {
  id: 'incident-visible',
  publicCode: 'INC-000123',
  promotionId,
  title: 'Fisura visible de esta promoción',
  description: 'Descripción sintética',
  createdById: 'admin',
  assignedToId: null,
  originPhase: 'PLANNING',
  category: 'STRUCTURE',
  priority: 'HIGH',
  status: 'OPEN',
  solution: null,
  solutionSubmittedById: null,
  solutionSubmittedAt: null,
  validatedById: null,
  closedAt: null,
  version: 1,
  createdAt: '2026-10-25',
  updatedAt: '2026-10-25',
};
const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  window.history.replaceState(null, '', `/#/promotions/${promotionId}`);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session')
      return response({
        user: {
          id: 'admin',
          firstName: 'Ada',
          lastName: 'Prueba',
          email: 'admin@example.test',
          role: 'ADMIN',
          isActive: true,
          createdAt: 'date',
          updatedAt: 'date',
        },
      });
    if (path === `/api/promotions/${promotionId}`)
      return response({
        promotion: {
          id: promotionId,
          name: 'Promoción del detalle',
          status: 'ACTIVE',
          phases: ['PLANNING'],
          createdAt: 'date',
          updatedAt: 'date',
        },
      });
    if (path === '/api/health') return response({ status: 'ok' });
    if (String(path).endsWith('/participants'))
      return response({ participants: [] });
    if (String(path).endsWith('/eligible-participants'))
      return response({ candidates: [] });
    if (String(path).startsWith('/api/incidents?')) return response(emptyPage);
    return response({}, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

it('requests only the current promotion and announces its empty state', async () => {
  render(<App />);
  expect(
    await screen.findByText('No hay incidencias visibles en esta promoción.'),
  ).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/incidents?promotionId=${promotionId}&page=1&pageSize=20`,
    expect.anything(),
  );
});

it('announces loading without showing private incident rows', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    String(path).startsWith('/api/incidents?')
      ? new Promise<Response>(() => undefined)
      : base(path, init),
  );
  render(<App />);
  expect(
    await screen.findByText('Consultando incidencias de la promoción…'),
  ).toBeTruthy();
  expect(screen.queryByRole('link', { name: /INC-000123/ })).toBeNull();
});

it('offers a safe retry and navigates to a server-authorized incident', async () => {
  const base = fetchMock.getMockImplementation()!;
  let fail = true;
  fetchMock.mockImplementation(async (path, init) => {
    if (String(path).startsWith('/api/incidents?'))
      return fail
        ? response({ message: 'private database detail' }, 503)
        : response({
            ...emptyPage,
            items: [incident],
            total: 1,
            totalPages: 1,
          });
    if (path === '/api/incidents/incident-visible')
      return response({
        incident: {
          ...incident,
          comments: [],
          assignedTo: null,
          promotionStatus: 'ACTIVE',
        },
      });
    return base(path, init);
  });
  render(<App />);
  const retry = await screen.findByRole('button', {
    name: 'Reintentar incidencias',
  });
  expect(document.body.textContent).not.toContain('private database detail');
  fail = false;
  fireEvent.click(retry);
  const link = await screen.findByRole('link', {
    name: 'INC-000123',
  });
  expect(link.getAttribute('href')).toBe('#/incidents/incident-visible');
  fireEvent.click(link);
  expect(
    await screen.findByRole('heading', { name: incident.title }),
  ).toBeTruthy();
});

it('requests every page from the server with the fixed promotion scope', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (String(path).startsWith('/api/incidents?')) {
      const page = new URL(String(path), 'http://local.test').searchParams.get(
        'page',
      );
      return response({
        items: [
          { ...incident, id: `incident-${page}`, title: `Página ${page}` },
        ],
        page: Number(page),
        pageSize: 20,
        total: 21,
        totalPages: 2,
      });
    }
    return base(path, init);
  });
  render(<App />);
  await screen.findByText('Página 1', { exact: true });
  const next = screen.getByRole('button', {
    name: 'Siguiente página de incidencias',
  });
  fireEvent.click(next);
  await screen.findByText('Página 2', { exact: true });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents?promotionId=${promotionId}&page=2&pageSize=20`,
      expect.anything(),
    ),
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Siguiente página de incidencias',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Anterior página de incidencias' }),
  );
  await screen.findByText('Página 1', { exact: true });
});

it.each([0, 1])(
  'recovers from a later page when visible results shrink to %i pages',
  async (remainingPages) => {
    const base = fetchMock.getMockImplementation()!;
    let firstPageRequests = 0;
    fetchMock.mockImplementation(async (path, init) => {
      if (!String(path).startsWith('/api/incidents?')) return base(path, init);
      const requestedPage = Number(
        new URL(String(path), 'http://local.test').searchParams.get('page'),
      );
      if (requestedPage === 1) firstPageRequests += 1;
      if (firstPageRequests === 1 && requestedPage === 1)
        return response({
          ...emptyPage,
          items: [incident],
          total: 21,
          totalPages: 2,
        });
      return response({
        ...emptyPage,
        page: requestedPage,
        total: remainingPages,
        totalPages: remainingPages,
        items:
          requestedPage === 1 && remainingPages === 1
            ? [{ ...incident, title: 'Resultado restante' }]
            : [],
      });
    });
    render(<App />);
    await screen.findByRole('link', {
      name: 'INC-000123',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Siguiente página de incidencias' }),
    );
    await waitFor(() => expect(firstPageRequests).toBe(2));
    if (remainingPages === 1) {
      expect(
        await screen.findByText('Resultado restante', { exact: true }),
      ).toBeTruthy();
    } else {
      expect(
        await screen.findByText(
          'No hay incidencias visibles en esta promoción.',
        ),
      ).toBeTruthy();
    }
    expect(
      fetchMock.mock.calls.filter(([path]) =>
        String(path).startsWith('/api/incidents?'),
      ),
    ).toHaveLength(3);
    expect(
      screen.queryByRole('navigation', {
        name: 'Paginación de incidencias de la promoción',
      }),
    ).toBeNull();
  },
);

it('shows the linked incident code on its first line and the title on the second', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) =>
    String(path).startsWith('/api/incidents?')
      ? response({ ...emptyPage, items: [incident], total: 1, totalPages: 1 })
      : base(path, init),
  );
  render(<App />);
  const code = await screen.findByRole('link', {
    name: incident.publicCode,
  });
  const title = screen.getByText(incident.title, { exact: true });
  expect(code.getAttribute('href')).toBe(`#/incidents/${incident.id}`);
  expect(title.tagName).toBe('P');
  expect(title.getAttribute('title')).toBe(incident.title);
  expect(code.nextElementSibling).toBe(title);
  expect(
    code.closest('li')?.querySelectorAll(':scope > a, :scope > p'),
  ).toHaveLength(2);
});

it('combines the approved incident filters with the immutable promotion scope and resets each change to page one', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (!String(path).startsWith('/api/incidents?')) return base(path, init);
    const page = Number(
      new URL(String(path), 'http://local.test').searchParams.get('page'),
    );
    return response({
      ...emptyPage,
      page,
      items: [incident],
      total: 41,
      totalPages: 3,
    });
  });
  render(<App />);
  const search = await screen.findByRole('searchbox', {
    name: 'Buscar incidencias',
  });
  const filters = [
    { control: search, value: '  FiSuRa  ', expected: { q: 'FiSuRa' } },
    {
      control: screen.getByLabelText('Estado de incidencia', { exact: true }),
      value: 'OPEN',
      expected: { q: 'FiSuRa', status: 'OPEN' },
    },
    {
      control: screen.getByLabelText('Categoría de incidencia', {
        exact: true,
      }),
      value: 'STRUCTURE',
      expected: { q: 'FiSuRa', status: 'OPEN', category: 'STRUCTURE' },
    },
    {
      control: screen.getByLabelText('Prioridad de incidencia', {
        exact: true,
      }),
      value: 'HIGH',
      expected: {
        q: 'FiSuRa',
        status: 'OPEN',
        category: 'STRUCTURE',
        priority: 'HIGH',
      },
    },
    {
      control: search,
      value: ' ',
      expected: { status: 'OPEN', category: 'STRUCTURE', priority: 'HIGH' },
    },
    {
      control: screen.getByLabelText('Estado de incidencia', { exact: true }),
      value: '',
      expected: { category: 'STRUCTURE', priority: 'HIGH' },
    },
    {
      control: screen.getByLabelText('Categoría de incidencia', {
        exact: true,
      }),
      value: '',
      expected: { priority: 'HIGH' },
    },
    {
      control: screen.getByLabelText('Prioridad de incidencia', {
        exact: true,
      }),
      value: '',
      expected: {},
    },
  ];
  for (const filter of filters) {
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Siguiente página de incidencias',
      }),
    );
    await screen.findByText('Página 2 de 3');
    fireEvent.change(filter.control, { target: { value: filter.value } });
    await screen.findByText('Página 1 de 3');
    const requests = fetchMock.mock.calls.filter(([path]) =>
      String(path).startsWith('/api/incidents?'),
    );
    const query = new URL(String(requests.at(-1)?.[0]), 'http://local.test')
      .searchParams;
    expect(Object.fromEntries(query)).toEqual({
      ...filter.expected,
      promotionId,
      page: '1',
      pageSize: '20',
    });
  }
});

it('preserves the search focus when a filter supersedes a pending page request', async () => {
  const base = fetchMock.getMockImplementation()!;
  let finishSlowPage!: (value: Response) => void;
  fetchMock.mockImplementation((path, init) => {
    if (!String(path).startsWith('/api/incidents?')) return base(path, init);
    const params = new URL(String(path), 'http://local.test').searchParams;
    if (params.get('page') === '2')
      return new Promise<Response>((resolve) => {
        finishSlowPage = resolve;
      });
    return Promise.resolve(
      response({
        ...emptyPage,
        items: [
          {
            ...incident,
            title: params.has('q')
              ? 'Resultado filtrado vigente'
              : incident.title,
          },
        ],
        total: 21,
        totalPages: 2,
      }),
    );
  });
  render(<App />);
  await screen.findByText(incident.title, { exact: true });
  fireEvent.click(
    screen.getByRole('button', { name: 'Siguiente página de incidencias' }),
  );
  await waitFor(() => expect(finishSlowPage).toBeTypeOf('function'));
  const search = screen.getByRole('searchbox', { name: 'Buscar incidencias' });
  search.focus();
  fireEvent.change(search, { target: { value: 'vigente' } });
  await screen.findByText('Resultado filtrado vigente', { exact: true });
  await act(async () => {
    finishSlowPage(
      response({
        ...emptyPage,
        page: 2,
        items: [{ ...incident, title: 'Respuesta antigua descartada' }],
        total: 21,
        totalPages: 2,
      }),
    );
  });
  expect(document.activeElement).toBe(search);
  expect(screen.queryByText('Respuesta antigua descartada')).toBeNull();
});

const indicatorCases = (
  ['OPEN', 'IN_PROGRESS', 'PENDING_VALIDATION', 'CLOSED'] as const
).flatMap((status) =>
  (['LOW', 'MEDIUM', 'HIGH'] as const).map((priority) => ({
    status,
    priority,
  })),
);
it.each(indicatorCases)(
  'presents informational $status/$priority icons with accessible tooltips',
  async ({ status, priority }) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) =>
      String(path).startsWith('/api/incidents?')
        ? response({
            ...emptyPage,
            items: [{ ...incident, status, priority }],
            total: 1,
            totalPages: 1,
          })
        : base(path, init),
    );
    render(<App />);
    const list = await screen.findByRole('list', {
      name: 'Incidencias de la promoción',
    });
    const statusIcon = within(list).getByRole('img', {
      name: statusLabels[status],
    });
    const priorityIcon = within(list).getByRole('img', {
      name: priorities[priority],
    });
    for (const icon of [statusIcon, priorityIcon]) {
      expect(icon.closest('button')).toBeNull();
      expect(icon.querySelector('svg')).toBeTruthy();
      expect(icon.getAttribute('tabindex')).toBe('0');
    }
    fireEvent.mouseEnter(statusIcon);
    expect(
      screen.getByRole('tooltip', { name: statusLabels[status] }),
    ).toBeTruthy();
    fireEvent.mouseLeave(statusIcon);
    expect(
      screen.queryByRole('tooltip', { name: statusLabels[status] }),
    ).toBeNull();
    fireEvent.focus(priorityIcon);
    expect(
      screen.getByRole('tooltip', { name: priorities[priority] }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('tooltip', { name: priorities[priority] }),
    ).toBeNull();
    fireEvent.keyDown(priorityIcon, { key: 'Enter' });
    fireEvent.keyDown(priorityIcon, { key: ' ' });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
  },
);
