import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UsersScreen } from './UsersScreen.js';
const user = {
  id: 'a',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  isActive: false,
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
it('renders safe read-only details without write controls', async () => {
  render(<UsersScreen />);
  await screen.findByText('ada@example.test');
  expect(screen.getByText('Administrador · Inactivo')).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
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
