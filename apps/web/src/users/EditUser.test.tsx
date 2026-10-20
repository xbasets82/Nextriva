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
const other = {
  ...user,
  id: 'b',
  firstName: 'Grace',
  email: 'grace@example.test',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    if (url === '/api/auth/csrf') return response({ csrfToken: 'synthetic' });
    if (url === '/api/users' && !init?.method)
      return response({ users: [user, other] });
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
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar ada@example.test' }),
  );
}
it('prefills public fields and edits only approved fields with CSRF', async () => {
  await open();
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Ada',
  );
  expect(screen.queryByLabelText('Contraseña inicial')).toBeNull();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Augusta' },
  });
  for (const name of ['password', 'id', 'isActive']) {
    const extra = document.createElement('input');
    extra.name = name;
    extra.value = 'must-not-send';
    screen.getByRole('form', { name: 'Editar usuario' }).append(extra);
  }
  fireEvent.submit(screen.getByRole('form', { name: 'Editar usuario' }));
  await screen.findByText('Usuario actualizado.');
  await screen.findByRole('button', { name: 'Crear usuario' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Usuarios' }),
    ),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users/a',
    expect.objectContaining({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'synthetic',
      },
      body: JSON.stringify({
        firstName: 'Augusta',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        role: 'ADMIN',
      }),
    }),
  );
});
it('validates edited fields accessibly before making a request', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Editar usuario' }));
  expect(screen.getByLabelText('Nombre').getAttribute('aria-invalid')).toBe(
    'true',
  );
  expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
});
it('associates every edit validation message with its labeled field', async () => {
  await open();
  for (const field of ['Nombre', 'Apellidos', 'Email']) {
    fireEvent.change(screen.getByLabelText(field), { target: { value: '' } });
  }
  fireEvent.submit(screen.getByRole('form', { name: 'Editar usuario' }));
  for (const field of ['Nombre', 'Apellidos', 'Email']) {
    const input = screen.getByLabelText(field);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const description = input.getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    if (!description) throw new Error(`${field} has no validation description`);
    expect(document.getElementById(description)?.textContent).toBeTruthy();
  }
});
it.each([400, 401, 403, 404, 409, 503])(
  'safely reports %i without claiming the edit succeeded',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === 'PATCH'
        ? Promise.resolve(response({ message: 'private diagnostic' }, status))
        : base(url, init),
    );
    await open();
    fireEvent.submit(screen.getByRole('form', { name: 'Editar usuario' }));
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect(screen.queryByText('Usuario actualizado.')).toBeNull();
  },
);
it('confirms before changing editor and preserves rejected drafts', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await open();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Unsaved' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Editar ada@example.test' }),
  );
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Editar grace@example.test' }),
  );
  expect(confirm).toHaveBeenCalled();
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Unsaved',
  );
  confirm.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Editar grace@example.test' }),
  );
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Grace',
  );
});
