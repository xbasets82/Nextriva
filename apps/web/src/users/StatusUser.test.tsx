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
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
let active = true;

beforeEach(() => {
  active = true;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    if (url === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (init?.method === 'PATCH') {
      active = !active;
      return response({ user: { ...user, isActive: active } });
    }
    return response(
      url === '/api/users'
        ? { users: [{ ...user, isActive: active }] }
        : { user },
    );
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

async function openStatusConfirmation() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Desactivar ada@example.test' }),
  );
  return screen.findByRole('alertdialog', {
    name: 'Confirmar cambio de estado',
  });
}

it('requires accessible confirmation and restores focus after cancellation', async () => {
  render(<UsersScreen />);
  await openStatusConfirmation();
  const cancel = screen.getByRole('button', { name: 'Cancelar' });
  expect(document.activeElement).toBe(cancel);
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);

  fireEvent.click(cancel);

  const trigger = await screen.findByRole('button', {
    name: 'Desactivar ada@example.test',
  });
  expect(document.activeElement).toBe(trigger);
  expect(active).toBe(true);
});

it('supports Escape and returns focus to the status action', async () => {
  render(<UsersScreen />);
  const dialog = await openStatusConfirmation();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  const trigger = await screen.findByRole('button', {
    name: 'Desactivar ada@example.test',
  });
  expect(document.activeElement).toBe(trigger);
  expect(
    fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
});

it('keeps the confirmation open while the status request is pending', async () => {
  const base = fetchMock.getMockImplementation()!;
  let finishStatus: ((value: Response) => void) | undefined;
  fetchMock.mockImplementation((url, init) => {
    if (init?.method === 'PATCH') {
      return new Promise<Response>((resolve) => {
        finishStatus = resolve;
      });
    }
    return base(url, init);
  });

  render(<UsersScreen />);
  const dialog = await openStatusConfirmation();
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar desactivación' }),
  );
  await waitFor(() => expect(finishStatus).toBeDefined());
  expect(
    (screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).toBe(dialog);

  active = false;
  finishStatus!(response({ user: { ...user, isActive: false } }));
  await screen.findByRole('button', { name: 'Activar ada@example.test' });
});

it('sends only isActive with CSRF, reloads persisted state and restores focus', async () => {
  render(<UsersScreen />);
  await openStatusConfirmation();
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar desactivación' }),
  );
  const activate = await screen.findByRole('button', {
    name: 'Activar ada@example.test',
  });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Usuarios' }),
    ),
  );
  expect(active).toBe(false);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/users/a/status',
    expect.objectContaining({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'synthetic-csrf',
      },
      body: JSON.stringify({ isActive: false }),
    }),
  );

  fireEvent.click(activate);
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar activación' }));
  await screen.findByRole('button', { name: 'Desactivar ada@example.test' });
  expect(active).toBe(true);
});

it.each([400, 401, 403, 409, 503])(
  'reports safe %i without claiming success or changing the list',
  async (status) => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === 'PATCH'
        ? Promise.resolve(response({ message: 'private diagnostic' }, status))
        : base(url, init),
    );
    render(<UsersScreen />);
    await openStatusConfirmation();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar desactivación' }),
    );
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect(screen.queryByText('Estado actualizado.')).toBeNull();
    expect(active).toBe(true);
    const trigger = screen.getByLabelText('Desactivar ada@example.test');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  },
);

it('does not allow status actions while an editor is open', async () => {
  render(<UsersScreen />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar ada@example.test' }),
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Desactivar ada@example.test',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
