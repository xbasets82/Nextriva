import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import {
  admin,
  fetchMock,
  fixturePassword,
  response,
} from '../test-support/auth-test-setup.js';
import { apiFetch } from './api/transport.js';
import { App } from './App.js';

async function loginForm() {
  render(<App />);
  return screen.findByRole('form', { name: 'Iniciar sesión' });
}
async function enterCredentials() {
  await loginForm();
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'ada@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), {
    target: { value: fixturePassword },
  });
}

const unsupportedBrowserMessage =
  'Este navegador no permite coordinar la sesión de forma segura. Usa un navegador actualizado mediante HTTPS o localhost.';

it('blocks login accessibly without Web Locks and sends no credentials', async () => {
  vi.stubGlobal('navigator', {});
  await enterCredentials();
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByText(unsupportedBrowserMessage)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('alert')),
  );
  expect(
    fetchMock.mock.calls.some(([path]) => path === '/api/auth/login'),
  ).toBe(false);
});

it('blocks logout without Web Locks before obtaining CSRF or mutating a session', async () => {
  vi.stubGlobal('navigator', {});
  authenticatedApi(204);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByText(unsupportedBrowserMessage)).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(
      ([path]) => path === '/api/auth/csrf' || path === '/api/auth/logout',
    ),
  ).toBe(false);
});

function authenticatedApi(status = 200) {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session') return response({ user: admin });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/auth/logout')
      return status === 204
        ? new Response(null, { status })
        : response({}, status);
    if (path === '/api/promotions') return response({ promotions: [] });
    return response({ status: 'ok' });
  });
}

it('logs out using CSRF, clears private content and returns to login', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  authenticatedApi(204);
  render(<App />);
  await screen.findByText('No hay promociones.');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(
    await screen.findByRole('form', { name: 'Iniciar sesión' }),
  ).toBeTruthy();
  expect(screen.queryByText('No hay promociones.')).toBeNull();
  expect(window.location.hash).toBe('#/login');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/logout',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-CSRF-Token': 'synthetic-csrf' },
    }),
  );
});
it('keeps the session after temporary logout failure and allows retry', async () => {
  authenticatedApi(503);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(
    await screen.findByText('No se pudo cerrar la sesión. Inténtalo de nuevo.'),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Usuarios' })).toBeTruthy();
  authenticatedApi(204);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('form')).toBeTruthy();
});
it('handles 401 during logout as invalidated session without sending logout', async () => {
  authenticatedApi(204);
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/auth/csrf'
      ? Promise.resolve(response({}, 401))
      : base(path, init),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('form')).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout'),
  ).toBe(false);
});
it('waits for pending logout before showing login after a concurrent 401', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  authenticatedApi();
  const base = fetchMock.getMockImplementation()!;
  let finishLogout!: (value: Response) => void;
  let expirePromotions = false;
  fetchMock.mockImplementation((path, init) => {
    if (path === '/api/auth/logout')
      return new Promise((resolve) => {
        finishLogout = resolve;
      });
    if (path === '/api/promotions' && expirePromotions)
      return Promise.resolve(response({}, 401));
    return base(path, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout'),
    ).toBe(true),
  );

  expirePromotions = true;
  await act(async () => {
    await expect(apiFetch('/api/promotions')).rejects.toMatchObject({
      status: 401,
    });
  });
  expect(await screen.findByText('Cerrando sesión…')).toBeTruthy();
  expect(screen.queryByRole('form', { name: 'Iniciar sesión' })).toBeNull();

  await act(async () => {
    finishLogout(response({}, 503));
  });
  expect(
    await screen.findByRole('form', { name: 'Iniciar sesión' }),
  ).toBeTruthy();
  expect(
    screen.queryByText('No se pudo cerrar la sesión. Inténtalo de nuevo.'),
  ).toBeNull();
});
it('clears private screens on simultaneous 401 responses and permits reauthentication without a loop', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  authenticatedApi();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/promotions'
      ? Promise.resolve(response({}, 401))
      : base(path, init),
  );
  render(<App />);
  expect(await screen.findByRole('form')).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
  const sessionCalls = fetchMock.mock.calls.filter(
    ([path]) => path === '/api/auth/session',
  ).length;
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([path]) => path === '/api/auth/session'),
    ).toHaveLength(sessionCalls),
  );
  authenticatedApi();
  const authenticated = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/auth/login'
      ? Promise.resolve(response({ user: admin }))
      : authenticated(path, init),
  );
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: admin.email },
  });
  fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), {
    target: { value: 'synthetic' },
  });
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByText('No hay promociones.')).toBeTruthy();
});
it('shows 403 as access denied without logging out', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  authenticatedApi();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/promotions'
      ? Promise.resolve(response({}, 403))
      : base(path, init),
  );
  render(<App />);
  expect(
    await screen.findByText('No tienes permisos para gestionar promociones.'),
  ).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
});

it('redirects unauthenticated protected navigation to login and restores it after authentication', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  authenticatedApi();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) => {
    if (path === '/api/auth/session') return Promise.resolve(response({}, 401));
    if (path === '/api/auth/login')
      return Promise.resolve(response({ user: admin }));
    return base(path, init);
  });
  await enterCredentials();
  expect(window.location.hash).toBe('#/login');
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByText('No hay promociones.')).toBeTruthy();
  expect(window.location.hash).toBe('#/promotions');
});
it('presents session 403 as access denied with retry, not as login or temporary failure', async () => {
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/session'
      ? response({}, 403)
      : response({ status: 'ok' }),
  );
  render(<App />);
  expect(
    await screen.findByText('No tienes acceso a esta sesión.'),
  ).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
});

it('ignores a delayed bootstrap 401 from before a successful login in StrictMode', async () => {
  const finish: ((value: Response) => void)[] = [];
  fetchMock.mockImplementation((path) => {
    if (path === '/api/auth/session')
      return new Promise((resolve) => finish.push(resolve));
    if (path === '/api/auth/login')
      return Promise.resolve(response({ user: admin }));
    return Promise.resolve(response({ status: 'ok' }));
  });
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  finish[0]!(response({}, 401));
  await screen.findByRole('form');
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: admin.email },
  });
  fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), {
    target: { value: fixturePassword },
  });
  fireEvent.submit(screen.getByRole('form'));
  await screen.findByRole('link', { name: 'Usuarios' });
  await act(async () => {
    finish[1]!(response({}, 401));
  });
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
  expect(screen.getByRole('link', { name: 'Usuarios' })).toBeTruthy();
});
