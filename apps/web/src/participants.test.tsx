import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App.js';

const promotion = {
  id: 'promotion-1',
  name: 'Promoción I04.2',
  status: 'ACTIVE',
  phases: ['PLANNING'],
  createdAt: 'date',
  updatedAt: 'date',
};
const collaborator = {
  id: 'collaborator-1',
  firstName: 'Ana',
  lastName: 'Prueba',
  email: 'ana@example.test',
  role: 'COLLABORATOR',
  isActive: true,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
let role = 'ADMIN';
beforeEach(() => {
  role = 'ADMIN';
  window.history.replaceState(null, '', '/#/promotions/promotion-1');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session')
      return response({
        user: { ...collaborator, role, createdAt: 'date', updatedAt: 'date' },
      });
    if (path === '/api/health') return response({ status: 'ok' });
    if (String(path).startsWith('/api/incidents?'))
      return response({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
    if (path === '/api/promotions/promotion-1') return response({ promotion });
    if (path === '/api/promotions')
      return response({ promotions: [promotion] });
    if (path === '/api/promotions/promotion-1/participants')
      return response({ participants: [] });
    if (path === '/api/promotions/promotion-1/eligible-participants')
      return response({ candidates: [collaborator] });
    if (path === '/api/auth/csrf') return response({ csrfToken: 'synthetic' });
    return response({}, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

it.each(['MANAGER', 'COLLABORATOR'])(
  'allows %s to consult promotions while hiding administrative navigation and writes',
  async (value) => {
    role = value;
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: promotion.name }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Editar promoción' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Archivar promoción' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Promociones' }));
    await screen.findByRole('heading', { name: 'Promociones' });
    expect(
      screen.queryByRole('button', { name: 'Crear promoción' }),
    ).toBeNull();
  },
);
it('denies direct user navigation for a manager without fetching users', async () => {
  role = 'MANAGER';
  window.history.replaceState(null, '', '/#/users');
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Resumen de incidencias' }),
  ).toBeTruthy();
  expect(window.location.hash).toBe('#/home');
  expect(fetchMock.mock.calls.some(([path]) => path === '/api/users')).toBe(
    false,
  );
});

it('announces an empty participant list and candidate selection', async () => {
  render(<App />);
  expect(
    await screen.findByText('No hay participantes vinculados.'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Colaborador')).toBeTruthy();
});
it.each([403, 404, 503])(
  'shows a safe participant %i failure and allows retry',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) =>
      path === '/api/promotions/promotion-1/participants'
        ? response({ message: 'private database detail' }, status)
        : base(path, init),
    );
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('private database detail');
    fetchMock.mockImplementation(base);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reintentar participantes' }),
    );
    expect(
      await screen.findByText('No hay participantes vinculados.'),
    ).toBeTruthy();
  },
);

it('adds and removes through CSRF, confirms removal and refreshes durable results', async () => {
  let linked = false;
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (
      path === '/api/promotions/promotion-1/participants' &&
      init?.method === 'POST'
    ) {
      linked = true;
      return response(
        { participant: { joinedAt: 'date', user: collaborator } },
        201,
      );
    }
    if (path === '/api/promotions/promotion-1/participants/collaborator-1') {
      linked = false;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/promotions/promotion-1/participants')
      return response({
        participants: linked ? [{ joinedAt: 'date', user: collaborator }] : [],
      });
    if (path === '/api/promotions/promotion-1/eligible-participants')
      return response({ candidates: linked ? [] : [collaborator] });
    return base(path, init);
  });
  render(<App />);
  await screen.findByLabelText('Colaborador');
  fireEvent.change(screen.getByLabelText('Colaborador'), {
    target: { value: collaborator.id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Añadir participante' }));
  expect(await screen.findByText('Participante añadido.')).toBeTruthy();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retirar Ana Prueba' }),
  );
  expect(
    screen.getByRole('dialog', { name: 'Retirar participante' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
  expect(
    await screen.findByText(
      'Participante retirado. Su acceso a esta promoción ha sido revocado.',
    ),
  ).toBeTruthy();
  await screen.findByText('No hay participantes vinculados.');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/promotions/promotion-1/participants/collaborator-1',
    expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic' }),
    }),
  );
});
it.each([403, 409, 503])(
  'preserves participant after a denied %i removal and announces safe feedback',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) => {
      if (path === '/api/promotions/promotion-1/participants')
        return response({
          participants: [{ joinedAt: 'date', user: collaborator }],
        });
      if (init?.method === 'DELETE')
        return response({ message: 'private diagnostic' }, status);
      return base(path, init);
    });
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retirar Ana Prueba' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect(
      screen.getByRole('list', { name: 'Participantes vinculados' })
        .textContent,
    ).toContain(collaborator.email);
  },
);
it('hides addition on archived promotions but retains authorized removal', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/promotions/promotion-1')
      return response({ promotion: { ...promotion, status: 'ARCHIVED' } });
    if (path === '/api/promotions/promotion-1/participants')
      return response({
        participants: [{ joinedAt: 'date', user: collaborator }],
      });
    return base(path, init);
  });
  render(<App />);
  expect(
    await screen.findByRole('button', { name: 'Retirar Ana Prueba' }),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Colaborador')).toBeNull();
});

it('does not claim that removing an ADMIN link revokes global access', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/promotions/promotion-1/participants')
      return response({
        participants: [
          { joinedAt: 'date', user: { ...collaborator, role: 'ADMIN' } },
        ],
      });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return base(path, init);
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retirar Ana Prueba' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
  expect(
    await screen.findByText(
      'Vinculación retirada. El administrador mantiene su acceso global.',
    ),
  ).toBeTruthy();
});

it('never requests eligible users for a collaborator and hides manager removal of ineligible targets', async () => {
  role = 'MANAGER';
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) =>
    path === '/api/promotions/promotion-1/participants'
      ? response({
          participants: [
            {
              joinedAt: 'date',
              user: { ...collaborator, id: 'manager', role: 'MANAGER' },
            },
            {
              joinedAt: 'date',
              user: { ...collaborator, id: 'inactive', isActive: false },
            },
          ],
        })
      : base(path, init),
  );
  const view = render(<App />);
  await screen.findByRole('list', { name: 'Participantes vinculados' });
  expect(
    screen.queryByRole('button', { name: 'Retirar Ana Prueba' }),
  ).toBeNull();
  view.unmount();
  fetchMock.mockClear();
  role = 'COLLABORATOR';
  render(<App />);
  await screen.findByRole('list', { name: 'Participantes vinculados' });
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).endsWith('/eligible-participants'),
    ),
  ).toBe(false);
});
it('prevents duplicate assignment while the response is pending', async () => {
  let finish!: (value: Response) => void;
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    init?.method === 'POST'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(path, init),
  );
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Colaborador'), {
    target: { value: collaborator.id },
  });
  const button = screen.getByRole('button', { name: 'Añadir participante' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText('Guardando participantes…');
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1);
  finish(
    response({ participant: { joinedAt: 'date', user: collaborator } }, 201),
  );
  await screen.findByText('Participante añadido.');
});

it('uses an accessible compact candidate picker and icon actions without changing participant order', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (path, init) =>
    path === '/api/promotions/promotion-1/participants'
      ? response({ participants: [{ joinedAt: 'date', user: collaborator }] })
      : base(path, init),
  );
  render(<App />);
  const picker = await screen.findByLabelText('Colaborador');
  expect(picker.querySelector('option')?.textContent).toBe(
    'Seleccionar colaborador',
  );
  expect(
    document.querySelector('label[for="participant-candidate-promotion-1"]')
      ?.className,
  ).toContain('sr-only');
  const add = screen.getByRole('button', { name: 'Añadir participante' });
  expect((add as HTMLButtonElement).disabled).toBe(true);
  expect(add.querySelector('svg[data-icon="plus"]')).toBeTruthy();
  fireEvent.change(picker, { target: { value: collaborator.id } });
  expect((add as HTMLButtonElement).disabled).toBe(false);
  const remove = screen.getByRole('button', { name: 'Retirar Ana Prueba' });
  expect(
    remove.querySelector('svg[data-icon="user-round-minus"]'),
  ).toBeTruthy();
  expect(remove.textContent).toBe('');
  fireEvent.focus(remove);
  expect(
    screen.getByRole('tooltip', { name: 'Retirar Ana Prueba' }),
  ).toBeTruthy();
  fireEvent.click(remove);
  expect(
    screen.getByRole('dialog', { name: 'Retirar participante' }),
  ).toBeTruthy();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
});

it.each([
  ['ADMIN', 'Administrador'],
  ['MANAGER', 'Gestor'],
  ['COLLABORATOR', 'Colaborador'],
])(
  'presents %s in Spanish with name and email on separate participant lines',
  async (userRole, label) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) =>
      path === '/api/promotions/promotion-1/participants'
        ? response({
            participants: [
              { joinedAt: 'date', user: { ...collaborator, role: userRole } },
            ],
          })
        : base(path, init),
    );
    render(<App />);
    const localizedRole = await screen.findByText(`${label} ·`);
    expect(localizedRole.tagName).toBe('P');
    const participant = within(localizedRole.closest('li')!);
    const name = participant.getByText('Ana Prueba', { exact: true });
    const email = participant.getByText(collaborator.email, { exact: true });
    expect(name.tagName).toBe('P');
    expect(email.tagName).toBe('P');
    expect(name.parentElement).toBe(email.parentElement);
  },
);
