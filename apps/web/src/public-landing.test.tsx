import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { admin, fetchMock, response } from '../test-support/auth-test-setup.js';
import { App } from './App.js';

it('shows the public presentation at the anonymous root without private requests', async () => {
  window.history.replaceState(null, '', '/');
  render(<App />);
  expect(
    await screen.findByRole('heading', {
      name: 'Cada promoción. Cada incidencia. Todo bajo control.',
    }),
  ).toBeTruthy();
  expect(window.location.hash).toBe('');
  expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/auth/session',
  ]);
  fireEvent.click(screen.getByRole('link', { name: 'Acceder a Nextriva' }));
  expect(
    await screen.findByRole('form', { name: 'Iniciar sesión' }),
  ).toBeTruthy();
});

it('opens the stable public route without mounting authenticated modules', async () => {
  window.history.replaceState(null, '', '/#/welcome');
  fetchMock.mockResolvedValue(response({ user: admin }));
  render(<App />);
  expect(
    await screen.findByRole('heading', {
      name: 'Cada promoción. Cada incidencia. Todo bajo control.',
    }),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
});

it('navigates public sections and exposes the seven existing phases without unavailable claims', async () => {
  window.history.replaceState(null, '', '/#/welcome');
  render(<App />);
  const navigation = await screen.findByRole('navigation', { name: 'Pública' });
  fireEvent.click(
    within(navigation).getByRole('link', { name: 'Funcionalidades' }),
  );
  await waitFor(() => expect(window.location.hash).toBe('#/welcome/features'));
  expect(
    screen.getByRole('heading', {
      name: 'El trabajo, conectado de principio a fin.',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('list', { name: 'Fases de una promoción' }).children,
  ).toHaveLength(7);
  expect(
    screen.queryByText(
      /gestión formal de cambios|adjuntos disponibles|inteligencia artificial integrada/i,
    ),
  ).toBeNull();
});

it('offers an accessible mobile menu that closes with Escape', async () => {
  window.history.replaceState(null, '', '/#/welcome');
  render(<App />);
  const toggle = await screen.findByRole('button', { name: 'Abrir menú' });
  fireEvent.click(toggle);
  expect(
    screen
      .getByRole('button', { name: 'Cerrar menú' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  fireEvent.keyDown(screen.getByRole('navigation', { name: 'Pública' }), {
    key: 'Escape',
  });
  expect(
    screen
      .getByRole('button', { name: 'Abrir menú' })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  expect(document.activeElement).toBe(toggle);
});

it.each(['#/welcome/contact', '#/welcome'])(
  'returns to the start when the footer logo is activated from %s',
  async (route) => {
    window.history.replaceState(null, '', `/${route}`);
    render(<App />);
    const start = screen.getByRole('heading', {
      name: 'Cada promoción. Cada incidencia. Todo bajo control.',
    });
    const scroll = vi.fn();
    start.closest<HTMLElement>('.landing')!.scrollIntoView = scroll;
    screen
      .getByRole('heading', {
        name: /El siguiente paso/,
      })
      .focus();

    fireEvent.click(
      screen.getAllByRole('link', {
        name: 'Nextriva — Presentación',
      })[1]!,
    );

    await waitFor(() => expect(document.activeElement).toBe(start));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(window.location.hash).toBe('#/welcome');
  },
);

it.each([
  {
    route: '#/welcome/features',
    link: 'Funcionalidades',
    navigation: 'Pie de página',
    heading: 'El trabajo, conectado de principio a fin.',
  },
  {
    route: '#/welcome/features',
    link: 'Funcionalidades',
    navigation: 'Pública',
    heading: 'El trabajo, conectado de principio a fin.',
  },
  {
    route: '#/welcome/features',
    link: 'Descubrir funcionalidades',
    heading: 'El trabajo, conectado de principio a fin.',
  },
  {
    route: '#/welcome/content',
    link: 'Saltar al contenido',
    heading: 'Cada promoción. Cada incidencia. Todo bajo control.',
  },
])(
  'returns to the current section through $link ($navigation)',
  async ({ route, link, navigation, heading }) => {
    window.history.replaceState(null, '', `/${route}`);
    render(<App />);
    const target = screen.getByRole('heading', { name: heading });
    const scroll = vi.fn();
    const scrollTarget = route.endsWith('/content')
      ? target.closest<HTMLElement>('.landing')!
      : target;
    scrollTarget.scrollIntoView = scroll;
    screen.getByRole('heading', { name: /El siguiente paso/ }).focus();
    const scope = navigation
      ? within(screen.getByRole('navigation', { name: navigation }))
      : screen;
    fireEvent.click(scope.getByRole('link', { name: link }));
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(window.location.hash).toBe(route);
  },
);

it('clearly marks contact as a demo and never sends or stores entered data', async () => {
  window.history.replaceState(null, '', '/#/welcome/contact');
  const local = vi.spyOn(Storage.prototype, 'setItem');
  render(<App />);
  const form = await screen.findByRole('form', {
    name: 'Contacto de demostración',
  });
  fireEvent.change(within(form).getByLabelText('Nombre'), {
    target: { value: 'Persona ficticia' },
  });
  fireEvent.change(within(form).getByLabelText('Email'), {
    target: { value: 'demo@example.test' },
  });
  fireEvent.change(within(form).getByLabelText('Mensaje'), {
    target: { value: 'Consulta ficticia' },
  });
  fireEvent.submit(form);
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'El contacto todavía no está disponible. No se ha enviado ni guardado ningún dato.',
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(local).not.toHaveBeenCalled();
});
