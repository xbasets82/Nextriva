import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
const password = crypto.randomUUID();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    if (url === '/api/auth/csrf') return response({ csrfToken: 'synthetic' });
    if (url === '/api/users' && !init?.method)
      return response({ users: [user] });
    return response({ user });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});
async function open() {
  render(<UsersScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }));
}
function fill() {
  for (const [label, value] of Object.entries({
    Nombre: 'Grace',
    Apellidos: 'Hopper',
    Email: 'grace@example.test',
    'Contraseña inicial': password,
  }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
it('opens a labeled form and rejects invalid fields without making a mutation', async () => {
  await open();
  fireEvent.submit(screen.getByRole('form', { name: 'Crear usuario' }));
  const name = screen.getByLabelText('Nombre');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  expect(
    document.getElementById(name.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toBeTruthy();
  expect(document.activeElement).toBe(name);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
});
it('creates with CSRF, clears the initial password and reloads safely', async () => {
  await open();
  fill();
  const extra = document.createElement('input');
  extra.name = 'isActive';
  extra.value = 'false';
  screen.getByRole('form', { name: 'Crear usuario' }).append(extra);
  fireEvent.submit(screen.getByRole('form', { name: 'Crear usuario' }));
  await screen.findByText('Usuario creado.');
  expect(screen.queryByLabelText('Contraseña inicial')).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Usuarios' }),
    ),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'synthetic',
      },
      body: JSON.stringify({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.test',
        role: 'COLLABORATOR',
        password,
      }),
    }),
  );
});

it('clears the initial password while the create request is still pending', async () => {
  const base = fetchMock.getMockImplementation()!;
  let finish: ((result: Response) => void) | undefined;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : base(url, init),
  );
  await open();
  fill();
  fireEvent.submit(screen.getByRole('form', { name: 'Crear usuario' }));
  await waitFor(() => expect(finish).toBeDefined());
  expect(
    (screen.getByLabelText('Contraseña inicial') as HTMLInputElement).value,
  ).toBe('');
  if (!finish) throw new Error('The create request did not start');
  finish(response({ user }));
  await screen.findByText('Usuario creado.');
});
it.each([400, 401, 403, 409, 503])(
  'shows a safe %i without reporting success',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === 'POST'
        ? Promise.resolve(response({ message: 'private diagnostic' }, status))
        : base(url, init),
    );
    await open();
    fill();
    fireEvent.submit(screen.getByRole('form', { name: 'Crear usuario' }));
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect(screen.queryByText('Usuario creado.')).toBeNull();
    expect(
      (screen.getByLabelText('Contraseña inicial') as HTMLInputElement).value,
    ).toBe('');
  },
);
it('keeps unsaved fields and password unless native discard confirmation is accepted', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await open();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(confirm).toHaveBeenCalled();
  expect(
    (screen.getByLabelText('Contraseña inicial') as HTMLInputElement).value,
  ).toBe(password);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('form')).toBeNull();
});
it('does not send POST when the API does not provide a CSRF token', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    url === '/api/auth/csrf' ? Promise.resolve(response({})) : base(url, init),
  );
  await open();
  fill();
  fireEvent.submit(screen.getByRole('form', { name: 'Crear usuario' }));
  await screen.findByRole('alert');
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
});
