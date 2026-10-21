import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  admin,
  fetchMock,
  fixturePassword,
  response,
} from '../test-support/auth-test-setup.js';
import { App } from './App.js';
import { LoginForm } from './auth/LoginForm.js';

async function loginForm() {
  render(<App />);
  return screen.findByRole('form', { name: 'Iniciar sesión' });
}
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

it('rejects malformed email and focuses password when email is corrected', async () => {
  const form = await loginForm();
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'not-an-email' },
  });
  fireEvent.submit(form);
  expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: admin.email },
  });
  fireEvent.submit(form);
  expect(document.activeElement).toBe(
    screen.getByLabelText('Contraseña', { exact: true }),
  );
  expect(
    fetchMock.mock.calls.some(([path]) => path === '/api/auth/login'),
  ).toBe(false);
});
it('does not update authentication after a login form is unmounted', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onAuthenticated = vi.fn();
  const view = render(<LoginForm onAuthenticated={onAuthenticated} />);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: admin.email },
  });
  fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), {
    target: { value: fixturePassword },
  });
  fireEvent.submit(screen.getByRole('form'));
  view.unmount();
  await act(async () => {
    finish(response({ user: admin }));
  });
  expect(onAuthenticated).not.toHaveBeenCalled();
});
it('prevents duplicate logout and ignores its completion after unmounting', async () => {
  authenticatedApi();
  let finish!: (value: Response) => void;
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    path === '/api/auth/logout'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(path, init),
  );
  const view = render(<App />);
  const button = await screen.findByRole('button', { name: 'Cerrar sesión' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText('Cerrando sesión…');
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([path]) => path === '/api/auth/logout'),
    ).toHaveLength(1),
  );
  view.unmount();
  await act(async () => {
    finish(new Response(null, { status: 204 }));
  });
  expect(screen.queryByRole('form')).toBeNull();
});
it('distinguishes a recovery network error and retries denied access safely', async () => {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session')
      throw new Error('private-network-diagnostic');
    return response({ status: 'ok' });
  });
  render(<App />);
  await screen.findByText(
    'No se pudo comprobar la sesión. Inténtalo de nuevo.',
  );
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/session'
      ? response({}, 403)
      : response({ status: 'ok' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('No tienes acceso a esta sesión.');
  authenticatedApi();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('link', { name: 'Usuarios' })).toBeTruthy();
});
