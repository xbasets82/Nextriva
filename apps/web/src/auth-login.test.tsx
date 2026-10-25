import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  admin,
  fetchMock,
  fixturePassword,
  response,
} from '../test-support/auth-test-setup.js';
import { App } from './App.js';

it('waits for the session before mounting private screens or navigation', () => {
  fetchMock.mockReturnValue(new Promise(() => undefined));
  render(<App />);
  expect(screen.getByText('Comprobando sesión…')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
  expect(
    fetchMock.mock.calls.some(
      ([path]) => path === '/api/users' || path === '/api/promotions',
    ),
  ).toBe(false);
});
it('shows login for a missing or expired session', async () => {
  render(<App />);
  expect(
    await screen.findByRole('form', { name: 'Iniciar sesión' }),
  ).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
});
it('distinguishes temporary session errors and retries recovery', async () => {
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/session'
      ? response({}, 503)
      : response({ status: 'ok' }),
  );
  render(<App />);
  expect(
    await screen.findByText(
      'No se pudo comprobar la sesión. Inténtalo de nuevo.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  fetchMock.mockImplementation(async (path) =>
    response(path === '/api/auth/session' ? { user: admin } : { status: 'ok' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('link', { name: 'Usuarios' })).toBeTruthy();
});
it.each(['MANAGER', 'COLLABORATOR'])(
  'keeps %s authenticated without administrative navigation',
  async (role) => {
    fetchMock.mockImplementation(async (path) =>
      response(
        path === '/api/auth/session'
          ? { user: { ...admin, role } }
          : { status: 'ok' },
      ),
    );
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'Promociones' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/users')).toBe(
      false,
    );
  },
);

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

it('validates fields accessibly before sending credentials and focuses the first error', async () => {
  const form = await loginForm();
  fireEvent.submit(form);
  const email = screen.getByLabelText('Email');
  expect(email.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(email);
  expect(screen.getByText('Introduce un email válido.').id).toBe(
    email.getAttribute('aria-describedby'),
  );
  expect(screen.getByText('Introduce la contraseña.')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
});
it('toggles the password with an inline icon button and accessible action name', async () => {
  await enterCredentials();
  const password = screen.getByLabelText('Contraseña', { exact: true });
  const showButton = screen.getByRole('button', {
    name: 'Mostrar contraseña',
  });

  expect(showButton.getAttribute('type')).toBe('button');
  expect(showButton.querySelector('svg[data-icon="eye"]')).not.toBeNull();
  expect(showButton.textContent?.trim()).toBe('');
  expect(showButton.parentElement?.classList.contains('relative')).toBe(true);
  expect(password.parentElement).toBe(showButton.parentElement);
  expect(password.getAttribute('autocomplete')).toBe('current-password');

  fireEvent.click(showButton);
  expect((password as HTMLInputElement).type).toBe('text');
  const hideButton = screen.getByRole('button', {
    name: 'Ocultar contraseña',
  });
  expect(hideButton.getAttribute('aria-pressed')).toBe('true');
  expect(hideButton.querySelector('svg[data-icon="eye-off"]')).not.toBeNull();
  expect((password as HTMLInputElement).value).toBe(fixturePassword);

  fireEvent.click(hideButton);
  expect((password as HTMLInputElement).type).toBe('password');
  expect(
    screen
      .getByRole('button', { name: 'Mostrar contraseña' })
      .getAttribute('aria-pressed'),
  ).toBe('false');
});
it('logs in once, restores the requested route and exposes only public fields', async () => {
  window.history.replaceState(null, '', '/#/promotions');
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((path) => {
    if (path === '/api/auth/login')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return Promise.resolve(
      path === '/api/auth/session'
        ? response({}, 401)
        : response({ status: 'ok', promotions: [] }),
    );
  });
  await enterCredentials();
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
  expect(
    screen.getByLabelText('Contraseña', { exact: true }).getAttribute('type'),
  ).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
  const form = screen.getByRole('form', { name: 'Iniciar sesión' });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(form.getAttribute('aria-busy')).toBe('true');
  expect(
    fetchMock.mock.calls.filter(([path]) => path === '/api/auth/login'),
  ).toHaveLength(1);
  finish(response({ user: { ...admin, passwordHash: crypto.randomUUID() } }));
  expect(await screen.findByText('No hay promociones.')).toBeTruthy();
  expect(window.location.hash).toBe('#/promotions');
  expect(document.body.textContent).not.toContain('private-hash');
  expect(localStorage.length + sessionStorage.length).toBe(0);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/login',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        email: admin.email,
        password: fixturePassword,
      }),
    }),
  );
});
it.each(['ADMIN', 'MANAGER', 'COLLABORATOR'] as const)(
  'opens incidents after a successful %s login when no destination was requested',
  async (role) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/session') return response({}, 401);
      if (path === '/api/auth/login')
        return response({ user: { ...admin, role } });
      if (path === '/api/incidents')
        return response({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        });
      return response({ status: 'ok' });
    });

    await enterCredentials();
    fireEvent.submit(screen.getByRole('form', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByRole('heading', { name: 'Incidencias' }),
    ).toBeTruthy();
    expect(window.location.hash).toBe('#/incidents');
  },
);
it.each([
  [400, 'Revisa el email y la contraseña.'],
  [401, 'Email o contraseña incorrectos.'],
  [
    403,
    'No se pudo validar la solicitud de acceso. Recarga la página e inténtalo de nuevo.',
  ],
  [429, 'Demasiados intentos. Inténtalo más tarde.'],
  [503, 'No se pudo conectar con el servicio. Inténtalo de nuevo.'],
])(
  'presents safe login status %i and preserves email for retry',
  async (status, message) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/login')
        return response({ message: 'private diagnostic' }, status);
      if (path === '/api/auth/session') return response({}, 401);
      return response({ status: 'ok' });
    });
    await enterCredentials();
    fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      admin.email,
    );
    expect(
      (screen.getByLabelText('Contraseña', { exact: true }) as HTMLInputElement)
        .value,
    ).toBe('');
    expect(document.body.textContent).not.toContain('private diagnostic');
    expect(screen.queryByRole('navigation')).toBeNull();
  },
);
it('handles network failure safely and permits another login', async () => {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/login') throw new Error('private failure');
    return path === '/api/auth/session'
      ? response({}, 401)
      : response({ status: 'ok' });
  });
  await enterCredentials();
  fireEvent.submit(screen.getByRole('form'));
  expect(
    await screen.findByText(
      'No se pudo conectar con el servicio. Inténtalo de nuevo.',
    ),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'Iniciar sesión',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
