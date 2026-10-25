import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { PromotionForm } from './PromotionForm.js';

const promotion = {
  id: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  name: 'Promoción sintética',
  description: '',
  location: '',
  status: 'ACTIVE',
  phases: ['PLANNING'],
  createdAt: 'date',
  updatedAt: 'date',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.history.replaceState(null, '', '/#/promotions');
  vi.stubGlobal('fetch', (path: RequestInfo | URL, init?: RequestInit) =>
    path === '/api/auth/session'
      ? Promise.resolve(
          response({
            user: {
              id: 'admin',
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: 'admin@example.test',
              role: 'ADMIN',
              isActive: true,
              createdAt: 'date',
              updatedAt: 'date',
            },
          }),
        )
      : fetchMock(path, init),
  );
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/health') return response({ status: 'ok' });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (init?.method)
      return response({ promotion }, init.method === 'POST' ? 201 : 200);
    return response(
      path === '/api/promotions' ? { promotions: [promotion] } : { promotion },
    );
  });
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
async function create() {
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Crear promoción' }),
  );
}
it.each([
  ['Nombre', 'ab', 'Nombre: entre 3 y 150 caracteres.'],
  ['Nombre', 'x'.repeat(151), 'Nombre: entre 3 y 150 caracteres.'],
  ['Descripción', 'x'.repeat(1001), 'Descripción: máximo 1000 caracteres.'],
  ['Ubicación', 'x'.repeat(201), 'Ubicación: máximo 200 caracteres.'],
])(
  'rejects invalid %s without requesting CSRF or writing',
  async (label, value, message) => {
    await create();
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Promoción válida' },
    });
    fireEvent.click(screen.getByLabelText('Planificación y planos básicos'));
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/csrf',
      expect.anything(),
    );
  },
);
it('requires one phase, preserves input and focuses the error', async () => {
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Promoción válida' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(
    await screen.findByText('Selecciona al menos una fase activa.'),
  ).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByLabelText('Planificación y planos básicos'),
  );
});
it('submits only approved fields with simultaneous phases and opens saved detail', async () => {
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: '  Promoción sintética  ' },
  });
  fireEvent.click(screen.getByLabelText('Posventa'));
  fireEvent.click(screen.getByLabelText('Planificación y planos básicos'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(
    await screen.findByRole('heading', { name: promotion.name, level: 2 }),
  ).toBeTruthy();
  const mutation = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  );
  expect(mutation?.[0]).toBe('/api/promotions');
  expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
    name: promotion.name,
    description: '',
    location: '',
    phases: ['PLANNING', 'AFTER_SALES'],
  });
  expect(mutation?.[1]?.headers).toEqual({
    'Content-Type': 'application/json',
    'X-CSRF-Token': 'synthetic-csrf',
  });
});
it('opens saved detail when the list route has a trailing slash', async () => {
  window.history.replaceState(null, '', '/#/promotions/');
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Promoción sintética' },
  });
  fireEvent.click(screen.getByLabelText('Planificación y planos básicos'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(
    await screen.findByRole('heading', { name: promotion.name, level: 2 }),
  ).toBeTruthy();
  expect(window.location.hash).toBe(`#/promotions/${promotion.id}`);
});
it('edits existing fields and replaces the phase selection using PATCH', async () => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Editar promoción' }),
  );
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    promotion.name,
  );
  fireEvent.click(screen.getByLabelText('Planificación y planos básicos'));
  fireEvent.click(screen.getByLabelText('Construcción'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(true),
  );
  const mutation = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(JSON.parse(String(mutation?.[1]?.body)).phases).toEqual([
    'CONSTRUCTION',
  ]);
});
it('groups form actions accessibly and aligns them to the right', async () => {
  await create();
  const actions = screen.getByRole('group', {
    name: 'Acciones del formulario',
  });
  expect(actions.className).toContain('justify-end');
  expect(within(actions).getByRole('button', { name: 'Guardar' })).toBeTruthy();
  expect(
    within(actions).getByRole('button', { name: 'Cancelar' }),
  ).toBeTruthy();
});
it('requires confirmation to discard changed fields and keeps them when declined', async () => {
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Sin guardar' },
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(confirm).toHaveBeenCalled();
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    'Sin guardar',
  );
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('form')).toBeNull();
});
it('retains entered data and displays generic mutation errors without diagnostics', async () => {
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: promotion.name },
  });
  fireEvent.click(screen.getByLabelText('Construcción'));
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) =>
    init?.method
      ? Promise.resolve(response({ message: 'private diagnostic' }, 503))
      : base(path, init),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain(
    'private diagnostic',
  );
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(
    promotion.name,
  );
});

it('protects dirty forms when leaving through navigation or closing the page', async () => {
  await create();
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Sin guardar' },
  });
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('link', { name: 'Usuarios' }));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(window.location.hash).toBe('#/promotions');
  expect(screen.getByRole('form', { name: 'Crear promoción' })).toBeTruthy();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('link', { name: 'Usuarios' }));
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
});

it('does not call the save callback after the form is abandoned during save', async () => {
  let finishSave!: (result: Response) => void;
  const saveResult = new Promise<Response>((resolve) => {
    finishSave = resolve;
  });
  fetchMock.mockImplementation((path, init) => {
    if (path === '/api/health')
      return Promise.resolve(response({ status: 'ok' }));
    if (path === '/api/auth/csrf')
      return Promise.resolve(response({ csrfToken: 'synthetic-csrf' }));
    if (path === '/api/auth/session') return Promise.resolve(response({}, 401));
    if (init?.method) return saveResult;
    return Promise.resolve(
      path === '/api/promotions'
        ? response({ promotions: [] })
        : response({ promotion }),
    );
  });
  const onSaved = vi.fn();
  const view = render(
    <PromotionForm
      promotion={undefined}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Promoción nueva' },
  });
  fireEvent.click(screen.getByLabelText('Planificación y planos básicos'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(true),
  );

  view.unmount();
  await act(async () => {
    finishSave(
      response({ promotion: { ...promotion, name: 'Promoción nueva' } }, 201),
    );
    await saveResult;
  });

  expect(onSaved).not.toHaveBeenCalled();
});
