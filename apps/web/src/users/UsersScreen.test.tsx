import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UsersScreen } from './UsersScreen.js';
const user = {
  id: 'a',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  isActive: true,
  createdAt: 'date',
  updatedAt: 'date',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url) =>
    response(url === '/api/auth/session' ? { user } : { users: [user] }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
it('announces loading', () => {
  fetchMock.mockReturnValue(new Promise(() => undefined));
  render(<UsersScreen />);
  expect(screen.getByRole('status').textContent).toContain('Consultando');
});
it('renders safe details with editing and status controls', async () => {
  fetchMock.mockImplementation(async (url) =>
    response(
      url === '/api/auth/session'
        ? { user }
        : { users: [{ ...user, isActive: false }] },
    ),
  );
  render(<UsersScreen />);
  await screen.findByLabelText('Estado');
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'inactive' },
  });
  await screen.findByText('ada@example.test');
  expect(screen.getByText('Administrador ·')).toBeTruthy();
  expect(screen.getByLabelText('Inactivo')).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Activar usuario',
      description: /ada@example.test/,
    }),
  ).toBeTruthy();
});
it('renders an empty list', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    url === '/api/users'
      ? Promise.resolve(response({ users: [] }))
      : base(url, init),
  );
  render(<UsersScreen />);
  expect(await screen.findByText('No hay usuarios.')).toBeTruthy();
});
it('requires an existing session', async () => {
  fetchMock.mockResolvedValue(response({}, 401));
  render(<UsersScreen />);
  expect(await screen.findByText(/Se necesita una sesión/)).toBeTruthy();
});
it.each(['MANAGER', 'COLLABORATOR'])(
  'offers no administration for %s',
  async (role) => {
    fetchMock.mockResolvedValue(response({ user: { ...user, role } }));
    render(<UsersScreen />);
    expect(await screen.findByText(/No tienes permisos/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/users', expect.anything());
  },
);
it.each([403, 503])(
  'shows a safe %i and can retry the real list request',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async () =>
      response({ message: 'private diagnostic' }, status),
    );
    render(<UsersScreen />);
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    fetchMock.mockImplementation(base);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('ada@example.test')).toBeTruthy();
  },
);

it('combines partial case-insensitive name/email search, status and role, and clears filters', async () => {
  const users = [
    user,
    {
      ...user,
      id: 'b',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.test',
      role: 'MANAGER',
      isActive: true,
    },
  ];
  fetchMock.mockImplementation(async (url) =>
    response(url === '/api/auth/session' ? { user } : { users }),
  );
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar usuarios' }), {
    target: { value: 'HOPP' },
  });
  expect(screen.queryByText('ada@example.test')).toBeNull();
  expect(screen.getByText('grace@example.test')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'inactive' },
  });
  expect(
    screen.getByText('No hay usuarios que coincidan con los filtros.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'ADA@EXAMPLE' },
  });
  fireEvent.change(screen.getByLabelText('Rol'), {
    target: { value: 'MANAGER' },
  });
  expect(screen.queryByText('ada@example.test')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(screen.getByText('ada@example.test')).toBeTruthy();
  expect(screen.getByText('grace@example.test')).toBeTruthy();
});
it('uses icon actions and a non-color status indication with accessible names', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  for (const name of [
    'Crear usuario',
    'Editar usuario',
    'Desactivar usuario',
  ]) {
    const button = screen.getByRole('button', { name });
    expect(button.querySelector('svg')).toBeTruthy();
    expect(button.textContent).toBe('');
  }
  expect(screen.getByLabelText('Activo')).toBeTruthy();
});

it('keeps the destructive status icon color independent from its muted base color', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  const deactivate = screen.getByRole('button', {
    name: 'Desactivar usuario',
  });
  expect(deactivate.className).toContain('text-destructive');
  expect(deactivate.className).not.toContain('text-muted-foreground');
  expect(deactivate.className).toContain('hover:text-destructive');
  expect(deactivate.className).not.toContain('hover:text-foreground');
});

it('separates the user search label from its input', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  const label = screen.getByRole('searchbox', {
    name: 'Buscar usuarios',
  }).parentElement;
  expect(label?.className).toContain('grid');
  expect(label?.className).toContain('gap-3');
  expect(label?.querySelector('span')?.textContent).toBe('Buscar usuarios');
});

it('groups the create action with the heading and uses circular status icons', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  const heading = screen.getByRole('heading', { name: 'Usuarios' });
  expect(
    heading
      .closest('header')
      ?.contains(screen.getByRole('button', { name: 'Crear usuario' })),
  ).toBe(true);
});
it('uses a circular pause icon for inactive status', async () => {
  fetchMock.mockImplementation(async (url) =>
    response(
      url === '/api/auth/session'
        ? { user }
        : { users: [{ ...user, isActive: false }] },
    ),
  );
  render(<UsersScreen />);
  await screen.findByLabelText('Estado');
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'inactive' },
  });
  await screen.findByText('ada@example.test');
  const status = screen.getByLabelText('Inactivo');
  expect(status.querySelector('svg circle')).toBeTruthy();
  expect(status.querySelector('[data-icon="circle-pause"]')).toBeTruthy();
});
it('names icon actions exactly as approved', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  expect(screen.getByRole('button', { name: 'Editar usuario' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Desactivar usuario' }),
  ).toBeTruthy();
});

it('uses a circular check icon for active status', async () => {
  fetchMock.mockImplementation(async (url) =>
    response(
      url === '/api/auth/session'
        ? { user }
        : { users: [{ ...user, isActive: true }] },
    ),
  );
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  expect(
    screen
      .getByLabelText('Activo')
      .querySelector('[data-icon="circle-check"] circle'),
  ).toBeTruthy();
});

it.each([false, true])(
  'uses recognizable user silhouettes for create and status actions (active=%s)',
  async (isActive) => {
    fetchMock.mockImplementation(async (url) =>
      response(
        url === '/api/auth/session'
          ? { user }
          : { users: [{ ...user, isActive }] },
      ),
    );
    render(<UsersScreen />);
    await screen.findByLabelText('Estado');
    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: isActive ? 'active' : 'inactive' },
    });
    await screen.findByText('ada@example.test');
    const action = screen.getByRole('button', {
      name: isActive ? 'Desactivar usuario' : 'Activar usuario',
    });
    expect(
      action.querySelector(
        `[data-icon="${isActive ? 'user-round-x' : 'user-round-check'}"] [data-user-silhouette]`,
      ),
    ).toBeTruthy();
  },
);

it('uses a recognizable user-round-plus create icon', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  expect(
    screen
      .getByRole('button', { name: 'Crear usuario' })
      .querySelector('[data-icon="user-round-plus"] [data-user-silhouette]'),
  ).toBeTruthy();
});

it('separates filter labels from their controls with consistent spacing', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  const searchLabel = screen
    .getByRole('searchbox', { name: 'Buscar usuarios' })
    .closest('label');
  expect(searchLabel?.className).toContain('grid');
  expect(searchLabel?.className).toContain('gap-3');
  expect(searchLabel?.querySelector('span')?.textContent).toBe(
    'Buscar usuarios',
  );
  for (const label of ['Estado', 'Rol']) {
    const control = screen.getByLabelText(label);
    const group = control.parentElement?.parentElement;
    expect(group?.className).toContain('grid');
    expect(group?.className).toContain('gap-3');
    expect(group?.querySelector('label')?.textContent).toBe(label);
  }
});

it('starts with active users and paginates filtered results by ten', async () => {
  const users = [
    ...Array.from({ length: 12 }, (_, index) => ({
      ...user,
      id: `active-${index + 1}`,
      firstName: `Active ${index + 1}`,
      email: `active-${index + 1}@example.test`,
      isActive: true,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      ...user,
      id: `inactive-${index + 1}`,
      firstName: `Inactive ${index + 1}`,
      email: `inactive-${index + 1}@example.test`,
      isActive: false,
    })),
  ];
  fetchMock.mockImplementation(async (url) =>
    response(url === '/api/auth/session' ? { user } : { users }),
  );
  render(<UsersScreen />);
  await screen.findByText('active-1@example.test');
  expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe(
    'active',
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(10);
  expect(screen.queryByText('inactive-1@example.test')).toBeNull();
  expect(screen.getByText('Página 1 de 2')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('active-12@example.test')).toBeTruthy();
  expect(screen.getByText('Página 2 de 2')).toBeTruthy();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar usuarios' }), {
    target: { value: 'active 1' },
  });
  expect(screen.getByText('Página 1 de 1')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
});

it('gives create and deactivate actions distinct visual emphasis', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  expect(
    screen.getByRole('button', { name: 'Crear usuario' }).className,
  ).toContain('bg-primary');
  expect(
    screen.getByRole('button', { name: 'Desactivar usuario' }).className,
  ).toContain('text-destructive');
});

it('shows visible chevrons while keeping the filters as native selects', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  for (const label of ['Estado', 'Rol']) {
    const select = screen.getByLabelText(label);
    expect(select.tagName).toBe('SELECT');
    expect(
      select.parentElement?.querySelector('[data-icon="chevron-down"]'),
    ).toBeTruthy();
  }
});

it('clears filters with an icon button and exposes tooltips on icon actions', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');

  const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
  expect(clear.textContent).toBe('');
  expect(clear.querySelector('[data-icon="filter-x"]')).toBeTruthy();
  expect(clear.parentElement?.className).toContain('self-end');

  for (const name of [
    'Crear usuario',
    'Limpiar filtros',
    'Editar usuario',
    'Desactivar usuario',
  ]) {
    const button = screen.getByRole('button', { name });
    const tooltipId = button
      .getAttribute('aria-describedby')
      ?.split(' ')
      .at(-1);
    expect(tooltipId).toBeTruthy();
    const tooltip = document.getElementById(tooltipId!);
    expect(tooltip?.getAttribute('role')).toBe('tooltip');
    expect(tooltip?.textContent).toBe(name);
    expect(button.parentElement?.className).toContain('group');
    expect(tooltip?.className).toContain('pointer-events-auto');
    expect(tooltip?.className).toContain('top-full');
    expect(tooltip?.className).toContain('pt-2');
  }
});

it('opens icon tooltips on focus and dismisses them with Escape', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');

  const button = screen.getByRole('button', { name: 'Limpiar filtros' });
  const tooltipId = button.getAttribute('aria-describedby')?.split(' ').at(-1);
  const tooltip = document.getElementById(tooltipId!);
  expect(tooltip).toBeTruthy();

  fireEvent.focus(button);
  expect(tooltip?.classList.contains('invisible')).toBe(false);
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(tooltip?.classList.contains('invisible')).toBe(true);

  fireEvent.blur(button);
  fireEvent.focus(button);
  expect(tooltip?.classList.contains('invisible')).toBe(false);
});

it('keeps a focused tooltip open when the pointer leaves its trigger', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');

  const button = screen.getByRole('button', { name: 'Limpiar filtros' });
  const tooltipId = button.getAttribute('aria-describedby')?.split(' ').at(-1);
  const tooltip = document.getElementById(tooltipId!);
  fireEvent.focus(button);
  fireEvent.mouseEnter(button);
  fireEvent.mouseLeave(button);

  expect(tooltip?.classList.contains('invisible')).toBe(false);
});

it('dismisses a hovered tooltip with Escape when focus is elsewhere', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');

  const search = screen.getByRole('searchbox', { name: 'Buscar usuarios' });
  const button = screen.getByRole('button', { name: 'Limpiar filtros' });
  const tooltipId = button.getAttribute('aria-describedby')?.split(' ').at(-1);
  const tooltip = document.getElementById(tooltipId!);

  fireEvent.focus(search);
  fireEvent.mouseEnter(button);
  expect(tooltip?.classList.contains('invisible')).toBe(false);
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(tooltip?.classList.contains('invisible')).toBe(true);
});

it('keeps the icon tooltip hoverable from its trigger', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');

  const button = screen.getByRole('button', { name: 'Limpiar filtros' });
  const wrapper = button.parentElement;
  const tooltip = wrapper?.querySelector('[role="tooltip"]');
  expect(wrapper?.className).toContain('group');
  expect(tooltip?.className).toContain('pointer-events-auto');
  expect(tooltip?.className).toContain('pt-2');
  expect(tooltip?.className).not.toContain('mt-2');
  fireEvent.mouseEnter(button);
  expect(tooltip?.classList.contains('invisible')).toBe(false);
  fireEvent.mouseEnter(tooltip!);
  expect(tooltip?.classList.contains('invisible')).toBe(false);
});
