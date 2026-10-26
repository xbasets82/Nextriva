import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

const fetchMock = vi.fn<typeof fetch>();

async function renderAuthenticatedApp(
  role: 'ADMIN' | 'MANAGER' | 'COLLABORATOR',
  hash = '#/promotions',
) {
  window.history.replaceState(null, '', `/${hash}`);
  const user = {
    id: `user-${role.toLowerCase()}`,
    firstName: 'Test',
    lastName: 'User',
    email: `${role.toLowerCase()}@example.test`,
    role,
    isActive: true,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  };
  fetchMock.mockImplementation(async (input) =>
    String(input) === '/api/auth/session'
      ? new Response(JSON.stringify({ user }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response(null, { status: 404 }),
  );
  render(<App />);
  return await screen.findByRole('navigation', { name: 'Principal' });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/login');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('login presentation', () => {
  it('shows one official brand image and no technical service status', async () => {
    fetchMock.mockImplementation(async (url) =>
      url === '/api/auth/session'
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
    );

    render(<App />);

    expect(
      await screen.findByRole('form', { name: 'Iniciar sesión' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Nextriva' })).toHaveLength(1);
    expect(
      screen.getByRole('img', { name: 'Nextriva' }).getAttribute('src'),
    ).toBe('/nextriva-icon-192.png');
    expect(screen.queryByText('NEXTRIVA')).toBeNull();
    expect(screen.queryByText('Nextriva')).toBeNull();
    expect(screen.queryByText('Estado inicial del servicio.')).toBeNull();
    expect(screen.queryByText('Estado del servicio')).toBeNull();
    expect(screen.queryByText(/Consultando el estado del servicio/)).toBeNull();
    expect(screen.queryByText(/Estado del servicio:/)).toBeNull();
  });
});

describe('authenticated header navigation', () => {
  it.each([
    ['ADMIN', true],
    ['MANAGER', false],
    ['COLLABORATOR', false],
  ] as const)(
    'shows only existing role links and an active promotion tab for %s',
    async (role, canManageUsers) => {
      const navigation = await renderAuthenticatedApp(role);
      expect(
        within(navigation)
          .getByRole('link', { name: 'Promociones' })
          .getAttribute('aria-current'),
      ).toBe('page');
      expect(
        within(navigation)
          .getByRole('link', { name: 'Incidencias' })
          .getAttribute('aria-current'),
      ).not.toBe('page');
      expect(
        Boolean(within(navigation).queryByRole('link', { name: 'Usuarios' })),
      ).toBe(canManageUsers);

      const navigationBrand = screen.getByRole('img', {
        name: 'Nextriva',
      });
      expect(navigationBrand.getAttribute('src')).toBe(
        '/nextriva-wordmark-blue.png',
      );
      expect(screen.getAllByRole('img', { name: 'Nextriva' })).toHaveLength(1);
      expect(screen.queryByText('NEXTRIVA')).toBeNull();

      const logout = await screen.findByRole('button', {
        name: 'Cerrar sesión',
      });
      expect(logout.getAttribute('type')).toBe('button');
      expect(logout.textContent?.trim()).toBe('');
      expect(logout.querySelector('svg[data-icon="log-out"]')).not.toBeNull();
    },
  );

  it('marks the incidents tab active for a nested incident route', async () => {
    const navigation = await renderAuthenticatedApp(
      'ADMIN',
      '#/incidents/incident-123',
    );
    expect(
      within(navigation)
        .getByRole('link', { name: 'Incidencias' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('user management screen', () => {
  beforeEach(() => window.history.replaceState(null, '', '/#/users'));
  it('shows the administrator user list from the API', async () => {
    const admin = {
      id: 'user-admin-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'admin@example.test',
      role: 'ADMIN',
      isActive: true,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    };

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/auth/session') {
        return new Response(JSON.stringify({ user: admin }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/users') {
        return new Response(JSON.stringify({ users: [admin] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Usuarios' }),
    ).toBeTruthy();
    expect(await screen.findByText('admin@example.test')).toBeTruthy();
  });

  it('asks before leaving a user form with unsaved changes', async () => {
    window.history.replaceState(null, '', '/#/users');
    const admin = {
      id: 'user-admin-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'admin@example.test',
      role: 'ADMIN',
      isActive: true,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/auth/session')
        return new Response(JSON.stringify({ user: admin }), { status: 200 });
      if (url === '/api/users')
        return new Response(JSON.stringify({ users: [] }), { status: 200 });
      if (url === '/api/health')
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      return new Response(null, { status: 404 });
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear usuario' }),
    );
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ada editada' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'Promociones' }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(window.location.hash).toBe('#/users');
    expect(screen.getByRole('form', { name: 'Crear usuario' })).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
      'Ada editada',
    );
  });
});
