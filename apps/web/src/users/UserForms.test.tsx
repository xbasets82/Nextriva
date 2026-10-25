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
  fireEvent.submit(form);
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
