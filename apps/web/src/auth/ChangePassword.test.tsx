import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  admin,
  fetchMock,
  fixturePassword,
  response,
} from '../../test-support/auth-test-setup.js';
import { App } from '../App.js';
import { PasswordChangeControl } from './ChangePassword.js';
async function open() {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/session') return response({ user: admin });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    return response({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
  });
  render(<App />);
  const button = await screen.findByRole('button', {
    name: 'Cambiar contraseña',
  });
  fireEvent.click(button);
  return {
    button,
    dialog: screen.getByRole('dialog', { name: 'Cambiar contraseña' }),
  };
}
it('opens an accessible password dialog, validates, toggles and restores focus on cancel', async () => {
  const { button, dialog } = await open();
  const current = within(dialog).getByLabelText('Contraseña actual');
  expect(document.activeElement).toBe(current);
  fireEvent.submit(within(dialog).getByRole('form'));
  expect(current.getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Mostrar contraseña actual' }),
  );
  expect(current.getAttribute('type')).toBe('text');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(button));
});
it('submits once, clears private content and returns to login with confirmation', async () => {
  const { dialog } = await open();
  const next = crypto.randomUUID();
  fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), {
    target: { value: fixturePassword },
  });
  fireEvent.change(within(dialog).getByLabelText('Nueva contraseña'), {
    target: { value: next },
  });
  fireEvent.change(
    within(dialog).getByLabelText('Confirmar nueva contraseña'),
    { target: { value: next } },
  );
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/csrf'
      ? response({ csrfToken: 'synthetic-csrf' })
      : new Response(null, { status: 204 }),
  );
  const form = within(dialog).getByRole('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  await screen.findByRole('form', { name: 'Iniciar sesión' });
  expect(
    screen.getByText(
      'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
    ),
  ).toBeTruthy();
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === '/api/auth/change-password',
    ),
  ).toHaveLength(1);
  expect(localStorage.length + sessionStorage.length).toBe(0);
  await waitFor(() => expect(window.location.hash).toBe('#/login'));
});

it('keeps session and fields safe after an incorrect current password and permits retry', async () => {
  const { dialog } = await open();
  const next = crypto.randomUUID();
  const fill = () => {
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), {
      target: { value: fixturePassword },
    });
    fireEvent.change(within(dialog).getByLabelText('Nueva contraseña'), {
      target: { value: next },
    });
    fireEvent.change(
      within(dialog).getByLabelText('Confirmar nueva contraseña'),
      { target: { value: next } },
    );
  };
  fill();
  fetchMock.mockImplementation(async (path) =>
    path === '/api/auth/csrf'
      ? response({ csrfToken: 'synthetic-csrf' })
      : response({ message: 'private-diagnostic' }, 400),
  );
  fireEvent.submit(within(dialog).getByRole('form'));
  const error = await screen.findByText(
    'No se pudo cambiar la contraseña. Revisa los datos.',
  );
  await waitFor(() => expect(document.activeElement).toBe(error));
  expect(screen.getByRole('navigation')).toBeTruthy();
  expect(
    (within(dialog).getByLabelText('Contraseña actual') as HTMLInputElement)
      .value,
  ).toBe('');
  expect(document.body.textContent).not.toContain('private-diagnostic');
});
it('prevents mismatching and unchanged passwords without HTTP requests', async () => {
  const { dialog } = await open();
  for (const [next, confirmation, error] of [
    [
      fixturePassword,
      fixturePassword,
      'La nueva contraseña debe ser distinta de la actual.',
    ],
    [crypto.randomUUID(), crypto.randomUUID(), 'Las contraseñas no coinciden.'],
  ]) {
    fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), {
      target: { value: fixturePassword },
    });
    fireEvent.change(within(dialog).getByLabelText('Nueva contraseña'), {
      target: { value: next },
    });
    fireEvent.change(
      within(dialog).getByLabelText('Confirmar nueva contraseña'),
      { target: { value: confirmation } },
    );
    fireEvent.submit(within(dialog).getByRole('form'));
    expect(screen.getByText(error!)).toBeTruthy();
  }
  expect(
    fetchMock.mock.calls.some(([path]) => path === '/api/auth/change-password'),
  ).toBe(false);
});

it('keeps keyboard focus within the modal while submission disables its fields', async () => {
  const { dialog } = await open();
  const next = crypto.randomUUID();
  fireEvent.change(within(dialog).getByLabelText('Contraseña actual'), {
    target: { value: fixturePassword },
  });
  fireEvent.change(within(dialog).getByLabelText('Nueva contraseña'), {
    target: { value: next },
  });
  fireEvent.change(
    within(dialog).getByLabelText('Confirmar nueva contraseña'),
    { target: { value: next } },
  );
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation((path) =>
    path === '/api/auth/csrf'
      ? Promise.resolve(response({ csrfToken: 'synthetic-csrf' }))
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  fireEvent.submit(within(dialog).getByRole('form'));
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(dialog);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  finish(new Response(null, { status: 204 }));
  await screen.findByRole('form', { name: 'Iniciar sesión' });
});

it('identifies the password action with a recognizable lock icon', () => {
  render(
    <PasswordChangeControl
      disabled={false}
      onBusy={() => undefined}
      onChanged={() => undefined}
    />,
  );
  const button = screen.getByRole('button', { name: 'Cambiar contraseña' });
  expect(button.querySelector('svg[data-icon="lock-keyhole"]')).not.toBeNull();
  expect(button.getAttribute('type')).toBe('button');
});
it('shows a visible password tooltip on hover and keyboard focus and dismisses it with Escape', () => {
  render(
    <PasswordChangeControl
      disabled={false}
      onBusy={() => undefined}
      onChanged={() => undefined}
    />,
  );
  const button = screen.getByRole('button', { name: 'Cambiar contraseña' });
  const tooltip = screen.getByRole('tooltip', { hidden: true });
  expect(tooltip.textContent).toBe('Cambiar contraseña');
  expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
  expect(tooltip.hidden).toBe(true);
  fireEvent.mouseEnter(button.parentElement!);
  expect(tooltip.hidden).toBe(false);
  fireEvent.mouseLeave(button.parentElement!);
  expect(tooltip.hidden).toBe(true);
  fireEvent.focus(button);
  expect(tooltip.hidden).toBe(false);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(tooltip.hidden).toBe(true);
  fireEvent.blur(button);
  fireEvent.focus(button);
  expect(tooltip.hidden).toBe(false);
});
