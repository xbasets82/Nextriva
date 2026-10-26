import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { phases } from '../api/promotions.js';
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
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: promotion.name, level: 2 }),
    ),
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
    render(
      status === 401 ? (
        <PromotionsScreen id={undefined} role="ADMIN" />
      ) : (
        <App />
      ),
    );
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
  expect(await screen.findByRole('img', { name: 'Archivada' })).toBeTruthy();
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

it('filters promotions before ten-item pagination and restores filters after detail navigation', async () => {
  const promotions = [
    {
      ...promotion,
      id: 'promo-11',
      name: 'Zeta',
      location: 'Madrid',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-10',
      name: 'Theta',
      location: 'Bilbao',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-09',
      name: 'Lambda',
      location: 'Bilbao',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-08',
      name: 'Kappa',
      location: 'Bilbao',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-07',
      name: 'Iota',
      location: 'Bilbao',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-05',
      name: 'Epsilon',
      location: 'Valencia',
      status: 'ARCHIVED',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-04',
      name: 'Delta',
      location: 'Barcelona',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-03',
      name: 'Gamma',
      location: 'Barcelona',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-12',
      name: 'Eta',
      location: 'Bilbao',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-02',
      name: 'Beta',
      location: 'Madrid',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
    {
      ...promotion,
      id: 'promo-01',
      name: 'Alpha',
      location: 'Sevilla',
      status: 'ACTIVE',
      phases: ['HANDOVER'],
    },
  ];
  fetchMock.mockImplementation(async (path) => {
    const requestPath = String(path);
    if (requestPath === '/api/promotions') return response({ promotions });
    if (requestPath.startsWith('/api/promotions/')) {
      const id = requestPath.split('/').at(-1);
      return response({
        promotion: promotions.find((promotion) => promotion.id === id),
      });
    }
    return response({ status: 'ok' });
  });
  render(<App />);

  await screen.findByRole('list', { name: 'Listado de promociones' });
  const listLinks = () =>
    within(screen.getByRole('list', { name: 'Listado de promociones' }))
      .getAllByRole('link')
      .map((link) => link.textContent);
  expect(listLinks()).toEqual([
    'Alpha',
    'Beta',
    'Delta',
    'Epsilon',
    'Eta',
    'Gamma',
    'Iota',
    'Kappa',
    'Lambda',
    'Theta',
  ]);
  expect(screen.getByText('Página 1 de 2 · 11 promociones')).toBeTruthy();
  expect(
    within(
      screen.getByRole('list', { name: 'Listado de promociones' }),
    ).getByRole('img', { name: 'Archivada' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  expect(listLinks()).toEqual(['Zeta']);
  fireEvent.change(screen.getByLabelText('Fase activa'), {
    target: { value: 'HANDOVER' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  expect(listLinks()).toEqual(['Zeta']);
  fireEvent.click(screen.getByRole('link', { name: 'Zeta' }));
  await screen.findByRole('heading', { name: 'Zeta', level: 2 });
  fireEvent.click(screen.getByRole('link', { name: 'Volver a promociones' }));
  await screen.findByRole('list', { name: 'Listado de promociones' });
  expect(listLinks()).toEqual(['Zeta']);
  expect(screen.getByText('Página 2 de 2 · 11 promociones')).toBeTruthy();
  expect(
    (screen.getByLabelText('Fase activa') as HTMLSelectElement).value,
  ).toBe('HANDOVER');

  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Buscar promociones' }),
    {
      target: { value: '  BARCEL ' },
    },
  );
  expect(listLinks()).toEqual(['Delta', 'Gamma']);
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'ARCHIVED' },
  });
  expect(
    screen.getByText('No hay promociones que coincidan con los filtros.'),
  ).toBeTruthy();
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Buscar promociones' }),
    {
      target: { value: '' },
    },
  );
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'all' },
  });
  fireEvent.change(screen.getByLabelText('Fase activa'), {
    target: { value: 'HANDOVER' },
  });
  expect(listLinks()).toEqual([
    'Alpha',
    'Beta',
    'Delta',
    'Epsilon',
    'Eta',
    'Gamma',
    'Iota',
    'Kappa',
    'Lambda',
    'Theta',
  ]);
  fireEvent.click(screen.getByRole('link', { name: 'Gamma' }));
  await screen.findByRole('heading', { name: 'Gamma', level: 2 });
  fireEvent.click(screen.getByRole('link', { name: 'Volver a promociones' }));
  expect(
    (
      (await screen.findByRole('searchbox', {
        name: 'Buscar promociones',
      })) as HTMLInputElement
    ).value,
  ).toBe('');
  expect(
    (screen.getByLabelText('Fase activa') as HTMLSelectElement).value,
  ).toBe('HANDOVER');
  expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe(
    'all',
  );
});

it('uses the promotion id as a deterministic tie-breaker for equal names', async () => {
  const duplicateNames = [
    { ...promotion, id: 'z-promotion', name: 'Repeated', location: 'North' },
    { ...promotion, id: 'a-promotion', name: 'Repeated', location: 'South' },
  ];
  fetchMock.mockImplementation(async (path) =>
    path === '/api/promotions'
      ? response({ promotions: duplicateNames })
      : response({ status: 'ok' }),
  );
  render(<App />);
  const links = await screen.findAllByRole('link', { name: 'Repeated' });
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '#/promotions/a-promotion',
    '#/promotions/z-promotion',
  ]);
  expect(
    screen.getByLabelText('Fase activa').querySelectorAll('option'),
  ).toHaveLength(8);
});

it.each(phases)(
  'filters by approved phase %s, including multiple and retained phases',
  async (phase) => {
    const promotions = [
      {
        ...promotion,
        id: 'multi-phase-promotion',
        name: 'Activa multietapa',
        status: 'ACTIVE',
        phases,
      },
      {
        ...promotion,
        id: 'archived-retained-phases',
        name: 'Archivada con fases conservadas',
        status: 'ARCHIVED',
        phases: ['HANDOVER', 'AFTER_SALES'],
      },
    ];
    fetchMock.mockImplementation(async (input) =>
      String(input) === '/api/promotions'
        ? response({ promotions })
        : response({ status: 'ok' }),
    );
    render(<App />);

    const list = await screen.findByRole('list', {
      name: 'Listado de promociones',
    });
    fireEvent.change(screen.getByLabelText('Fase activa'), {
      target: { value: phase },
    });

    const expectedNames = ['Activa multietapa'];
    if (phase === 'HANDOVER' || phase === 'AFTER_SALES')
      expectedNames.push('Archivada con fases conservadas');
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(expectedNames);
  },
);

it('presents accessible icon actions and a non-interactive status in the promotion detail', async () => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  render(<App />);
  const back = await screen.findByRole('link', {
    name: 'Volver a promociones',
  });
  expect(back.querySelector('svg[data-icon="arrow-left"]')).toBeTruthy();
  expect(back.textContent).toBe('');
  const create = screen.getByRole('link', { name: 'Crear incidencia' });
  expect(create.getAttribute('href')).toBe(`#/incidents/new/${promotion.id}`);
  expect(create.querySelector('svg[data-icon="file-plus-2"]')).toBeTruthy();
  const edit = screen.getByRole('button', { name: 'Editar promoción' });
  expect(edit.querySelector('svg[data-icon="pencil"]')).toBeTruthy();
  const archive = screen.getByRole('button', { name: 'Archivar promoción' });
  expect(archive.querySelector('svg[data-icon="archive"]')).toBeTruthy();
  expect(
    screen.getByRole('img', { name: 'Activa' }).closest('button'),
  ).toBeNull();
  fireEvent.focus(edit);
  expect(
    screen.getByRole('tooltip', { name: 'Editar promoción' }),
  ).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(
    screen.queryByRole('tooltip', { name: 'Editar promoción' }),
  ).toBeNull();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
});

it('shows only editable promotion data while editing, not detail sections', async () => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar promoción' }),
  );

  expect(screen.getByRole('form', { name: 'Editar promoción' })).toBeTruthy();
  expect(screen.getByLabelText('Nombre')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Incidencias' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Participantes' })).toBeNull();
  expect(
    screen.queryByRole('list', { name: 'Participantes vinculados' }),
  ).toBeNull();
});

it('keeps the phase values accessible without a visible standalone phase heading', async () => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  render(<App />);
  await screen.findByRole('heading', { name: promotion.name });
  expect(screen.queryByRole('heading', { name: 'Fases activas' })).toBeNull();
  expect(screen.getByRole('list', { name: 'Fases activas' }).textContent).toBe(
    'Planificación y planos básicosPosventa',
  );
});

it('keeps the promotion location in a separate second row and supplies an empty fallback', async () => {
  fetchMock.mockImplementation(async () =>
    response({
      promotions: [
        promotion,
        { ...promotion, id: 'empty', name: 'Sin dirección', location: null },
      ],
    }),
  );
  render(<PromotionsScreen id={undefined} role="ADMIN" />);
  const link = await screen.findByRole('link', { name: promotion.name });
  const card = link.closest('li')!;
  const location = within(card).getByText('Barcelona');
  expect(location.parentElement).not.toBe(link.parentElement);
  expect(location.className).toContain('col-span-full');
  expect(screen.getByText('Ubicación no indicada')).toBeTruthy();
});
