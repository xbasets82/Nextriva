import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UsersScreen } from './UsersScreen.js';
import type { User } from '../api/users.js';

const admin: User = {
  id: 'a',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  isActive: true,
  createdAt: 'date',
  updatedAt: 'date',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
let users: User[];
beforeEach(() => {
  users = [
    admin,
    {
      ...admin,
      id: 'b',
      firstName: 'Grace',
      email: 'grace@example.test',
      role: 'MANAGER',
    },
  ];
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  fetchMock.mockImplementation(async (url, init) => {
    if (url === '/api/auth/csrf') return response({ csrfToken: 'synthetic' });
    if (url === '/api/auth/session') return response({ user: admin });
    if (url === '/api/users' && !init?.method) return response({ users });
    const id = String(url).split('/')[3];
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) return response({}, 404);
    users[index] = { ...users[index]!, ...JSON.parse(String(init?.body)) };
    return response({ user: users[index] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});
async function edit(email = 'grace@example.test') {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Editar usuario',
      description: new RegExp(email),
    }),
  );
  return screen.getByRole('form', { name: 'Editar usuario' });
}

it('uses named icon actions and toggles the creation password without submitting or losing its value', async () => {
  render(<UsersScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }));
  const password = screen.getByLabelText(
    'Contraseña inicial',
  ) as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'synthetic password' } });
  const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
  toggle.focus();
  fireEvent.click(toggle);
  expect(password.type).toBe('text');
  expect(password.value).toBe('synthetic password');
  expect(document.activeElement).toBe(toggle);
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
  expect(password.type).toBe('password');
  expect(
    screen
      .getByRole('button', { name: 'Guardar usuario' })
      .querySelector('svg'),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Cancelar' }).querySelector('svg'),
  ).toBeTruthy();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
});

it('changes status separately after confirmation and retains unsaved profile fields', async () => {
  render(<UsersScreen />);
  const form = await edit();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Draft name' },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  const confirmation = screen.getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
  fireEvent.click(
    within(confirmation).getByRole('button', {
      name: 'Confirmar desactivación',
    }),
  );
  await waitFor(() =>
    expect(
      within(form).getByRole('button', { name: 'Activar usuario' }),
    ).toBeTruthy(),
  );
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Draft name',
  );
  expect(users[1]!.firstName).toBe('Grace');
  expect(users[1]!.isActive).toBe(false);
  expect(screen.queryByLabelText('Contraseña inicial')).toBeNull();
  fireEvent.click(
    within(form).getByRole('button', { name: 'Guardar usuario' }),
  );
  await screen.findByText('Usuario actualizado.');
  expect(users[1]!.firstName).toBe('Draft name');
  expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe(
    'active',
  );
  expect(screen.queryByText('grace@example.test')).toBeNull();
});

it.each([409, 503])(
  'keeps a rejected status change and draft intact with safe feedback (%i)',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      String(url).endsWith('/status')
        ? Promise.resolve(response({ message: 'private diagnostic' }, status))
        : base(url, init),
    );
    render(<UsersScreen />);
    const form = await edit();
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Draft name' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Desactivar usuario' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar desactivación' }),
    );
    expect((await within(form).findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
      'Draft name',
    );
    expect(users[1]!.isActive).toBe(true);
    expect(users[1]!.firstName).toBe('Grace');
  },
);

it('preserves the current filtered page, server order and scroll after editing without remounting the list', async () => {
  users = Array.from({ length: 23 }, (_, index) => ({
    ...admin,
    id: `u${String(index).padStart(2, '0')}`,
    firstName: `Person ${index}`,
    email: `person${index}@example.test`,
    role: 'MANAGER',
  }));
  render(<UsersScreen />);
  await screen.findByLabelText('Buscar usuarios');
  fireEvent.change(screen.getByLabelText('Buscar usuarios'), {
    target: { value: 'Person' },
  });
  fireEvent.change(screen.getByLabelText('Rol'), {
    target: { value: 'MANAGER' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  const list = screen.getByRole('list');
  const before = within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 360 });
  await edit('person14@example.test');
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Person edited' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Editar usuario' }));
  await screen.findByText('Usuario actualizado.');
  expect(screen.getByText('Página 2 de 3')).toBeTruthy();
  expect(screen.getByRole('list')).toBe(list);
  expect(
    (screen.getByLabelText('Buscar usuarios') as HTMLInputElement).value,
  ).toBe('Person');
  expect((screen.getByLabelText('Rol') as HTMLSelectElement).value).toBe(
    'MANAGER',
  );
  expect(within(list).getAllByRole('listitem')[4]!.textContent).toContain(
    'Person edited',
  );
  expect(within(list).getAllByRole('listitem')[0]!.textContent).toBe(before[0]);
  expect(window.scrollTo).toHaveBeenCalledWith({
    left: 0,
    top: 360,
    behavior: 'instant',
  });
});

it('restores focus to the status action when cancelling with Escape', async () => {
  render(<UsersScreen />);
  const form = await edit();
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  const cancel = screen.getByRole('button', {
    name: 'Cancelar cambio de estado',
  });
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(cancel, { key: 'Escape' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(form).getByRole('button', { name: 'Desactivar usuario' }),
    ),
  );
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
});
it('recovers effective status after a lost response without discarding the profile draft', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/status')) {
      users[1] = { ...users[1]!, isActive: false };
      throw new TypeError('synthetic lost response');
    }
    return base(url, init);
  });
  render(<UsersScreen />);
  const form = await edit();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Draft name' },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar desactivación' }),
  );
  await within(form).findByRole('alert');
  expect(
    within(form).getByRole('button', { name: 'Activar usuario' }),
  ).toBeTruthy();
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Draft name',
  );
});
it('retries only the list refresh after the profile was saved successfully', async () => {
  const base = fetchMock.getMockImplementation()!;
  let saved = false;
  let failedRefresh = false;
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method === 'PATCH') saved = true;
    if (url === '/api/users' && !init?.method && saved && !failedRefresh) {
      failedRefresh = true;
      return response({}, 503);
    }
    return base(url, init);
  });
  render(<UsersScreen />);
  await edit();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Saved name' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar usuario' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Los datos se guardaron',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar listado' }));
  await screen.findByText('Usuario actualizado.');
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(1);
});

it.each(['create', 'edit'])(
  'renders the %s role dropdown with the same noninteractive arrow as the list filters',
  async (mode) => {
    render(<UsersScreen />);
    if (mode === 'create')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Crear usuario' }),
      );
    else await edit();
    const form = screen.getByRole('form', {
      name: mode === 'create' ? 'Crear usuario' : 'Editar usuario',
    });
    const select = within(form).getByLabelText('Rol');
    const filter = screen.getByLabelText('Rol', {
      selector: '#users-role-filter',
    });
    expect(select.classList.contains('appearance-none')).toBe(true);
    expect(select.classList.contains('pr-10')).toBe(true);
    expect(select.parentElement?.classList.contains('relative')).toBe(true);
    const arrow = select.parentElement?.querySelector(
      '[data-icon="chevron-down"]',
    );
    const filterArrow = filter.parentElement?.querySelector(
      '[data-icon="chevron-down"]',
    );
    expect(arrow).toBeTruthy();
    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
    expect(arrow?.classList.contains('pointer-events-none')).toBe(true);
    expect(arrow?.querySelector('path')?.getAttribute('d')).toBe(
      filterArrow?.querySelector('path')?.getAttribute('d'),
    );
  },
);

it('uses the same status confirmation message from the list and the edit form', async () => {
  render(<UsersScreen />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Desactivar usuario',
      description: /grace@example.test/,
    }),
  );
  const listDialog = screen.getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  const listMessage = document
    .getElementById(listDialog.getAttribute('aria-describedby')!)
    ?.textContent?.replace(/\s+/g, ' ')
    .trim();
  expect(listMessage).toBe(
    '¿Desactivar a grace@example.test? La operación puede revocar sus sesiones. Los demás campos no se guardarán.',
  );
  fireEvent.click(within(listDialog).getByRole('button', { name: 'Cancelar' }));
  const form = await edit();
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  const editDialog = screen.getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  expect(
    document
      .getElementById(editDialog.getAttribute('aria-describedby')!)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim(),
  ).toBe(listMessage);
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
});

it('matches the edit status card styling and action layout from the list', async () => {
  render(<UsersScreen />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Desactivar usuario',
      description: /grace@example.test/,
    }),
  );
  const listDialog = screen.getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  const listButtons = within(listDialog).getAllByRole('button');
  const listStyle = {
    card: Array.from(listDialog.classList)
      .filter((name) => !['mx-auto', 'w-full', 'max-w-2xl'].includes(name))
      .sort(),
    title: within(listDialog).getByRole('heading').className,
    actions: listButtons[0]!.parentElement?.className,
    buttons: listButtons.map((button) => button.className),
  };
  expect(document.activeElement).toBe(listButtons[0]);
  fireEvent.click(listButtons[0]!);
  const form = await edit();
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  const editDialog = within(form).getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  const editButtons = within(editDialog).getAllByRole('button');
  expect(listStyle).toEqual({
    card: Array.from(editDialog.classList)
      .filter((name) => name !== 'sm:col-span-2')
      .sort(),
    title: within(editDialog).getByRole('heading').className,
    actions: editButtons[0]!.parentElement?.className,
    buttons: editButtons.map((button) => button.className),
  });
  expect(listDialog.classList.contains('w-full')).toBe(true);
  expect(listDialog.classList.contains('max-w-2xl')).toBe(true);
  expect(listDialog.classList.contains('mx-auto')).toBe(true);
  expect(document.activeElement).toBe(editButtons[0]);
});

it('keeps the list status current when the status update succeeds but refreshing the list fails', async () => {
  const base = fetchMock.getMockImplementation()!;
  let listReads = 0;
  fetchMock.mockImplementation(async (url, init) => {
    if (url === '/api/users' && !init?.method && ++listReads === 2)
      throw new Error('temporary list failure');
    return base(url, init);
  });
  users = [users[1]!];
  render(<UsersScreen />);
  fireEvent.click(await screen.findByLabelText('Desactivar usuario'));
  fireEvent.click(screen.getByText('Confirmar desactivación'));
  await screen.findByRole('alert');
  expect(users[0]!.isActive).toBe(false);
  expect(screen.queryByLabelText('Desactivar usuario')).toBeNull();
});

it('keeps the edit status confirmation open when Escape is pressed during the mutation', async () => {
  const base = fetchMock.getMockImplementation()!;
  let finish: ((value: Response) => void) | undefined;
  fetchMock.mockImplementation((url, init) =>
    String(url).endsWith('/status')
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : base(url, init),
  );
  render(<UsersScreen />);
  const form = await edit();
  fireEvent.click(
    within(form).getByRole('button', { name: 'Desactivar usuario' }),
  );
  const dialog = within(form).getByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
  const confirm = within(dialog).getByRole('button', {
    name: 'Confirmar desactivación',
  });
  fireEvent.click(confirm);
  await waitFor(() => expect(finish).toBeDefined());
  try {
    expect(form.getAttribute('aria-busy')).toBe('true');
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(
      within(form).queryByRole('alertdialog', {
        name: 'Confirmar cambio de estado',
      }),
    ).toBe(dialog);
  } finally {
    users[1] = { ...users[1]!, isActive: false };
    finish?.(response({ user: users[1] }));
    await within(form).findByRole('button', { name: 'Activar usuario' });
  }
});

it('removes an edited user who no longer matches the role filter without clearing the search or filters', async () => {
  render(<UsersScreen />);
  await screen.findByLabelText('Buscar usuarios');
  fireEvent.change(screen.getByLabelText('Buscar usuarios'), {
    target: { value: 'grace' },
  });
  fireEvent.change(screen.getByLabelText('Rol'), {
    target: { value: 'MANAGER' },
  });
  const form = await edit();
  fireEvent.change(within(form).getByLabelText('Rol'), {
    target: { value: 'COLLABORATOR' },
  });
  fireEvent.submit(form);
  await screen.findByText('Usuario actualizado.');
  expect(
    screen.getByText('No hay usuarios que coincidan con los filtros.'),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText('Buscar usuarios') as HTMLInputElement).value,
  ).toBe('grace');
  expect((screen.getByLabelText('Rol') as HTMLSelectElement).value).toBe(
    'MANAGER',
  );
  expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe(
    'active',
  );
  expect(screen.queryByText('grace@example.test')).toBeNull();
  expect(users[1]!.role).toBe('COLLABORATOR');
});

it('restores the scroll captured before focusing the list status confirmation', async () => {
  const originalFocus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    if (this.hasAttribute('data-safe-focus')) {
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 0,
      });
    }
    originalFocus.call(this, options);
  });
  render(<UsersScreen />);
  const deactivate = await screen.findByRole('button', {
    name: 'Desactivar usuario',
    description: /grace@example.test/,
  });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
  fireEvent.click(deactivate);
  expect(window.scrollY).toBe(0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar desactivación' }),
  );
  await screen.findByText('Estado actualizado.');
  expect(window.scrollTo).toHaveBeenCalledWith({
    left: 0,
    top: 420,
    behavior: 'instant',
  });
});
