import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IncidentScreen } from './IncidentScreen.js';
const promotion = {
  id: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  name: 'Promoción de prueba',
  status: 'ACTIVE',
  phases: ['PLANNING'],
  createdAt: '2026-10-22',
  updatedAt: '2026-10-22',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => response({ promotion }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
it('announces field validation and focuses the first invalid field without sending a create request', async () => {
  render(<IncidentScreen promotionId={promotion.id} />);
  fireEvent.submit(
    await screen.findByRole('form', { name: 'Crear incidencia' }),
  );
  expect(
    await screen.findByText('Título: entre 5 y 150 caracteres.'),
  ).toBeTruthy();
  const title = screen.getByLabelText('Título', { exact: true });
  expect(title.getAttribute('aria-invalid')).toBe('true');
  expect(title.getAttribute('aria-describedby')).toBe('incident-error-title');
  expect(document.activeElement).toBe(title);
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/incidents')).toBe(
    false,
  );
});

it('shows a recoverable safe loading error and can retry the real route request', async () => {
  fetchMock.mockResolvedValueOnce(
    response({ message: 'private infrastructure diagnostic' }, 503),
  );
  render(<IncidentScreen promotionId={promotion.id} />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo completar la solicitud. Inténtalo de nuevo.',
  );
  expect(screen.queryByText('private infrastructure diagnostic')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(
    await screen.findByRole('form', { name: 'Crear incidencia' }),
  ).toBeTruthy();
});

const incident = {
  comments: [],
  id: 'i051',
  publicCode: 'INC-000001',
  promotionId: promotion.id,
  originPhase: 'AFTER_SALES',
  title: 'Incidencia sintética',
  description: 'Descripción sintética completa',
  category: 'STRUCTURE',
  priority: 'HIGH',
  status: 'OPEN',
  createdById: 'author',
  version: 1,
  createdAt: '2026-10-22',
  updatedAt: '2026-10-22',
};
function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Título', { exact: true }), {
    target: { value: incident.title },
  });
  fireEvent.change(screen.getByLabelText('Descripción', { exact: true }), {
    target: { value: incident.description },
  });
  fireEvent.change(screen.getByLabelText('Fase de origen'), {
    target: { value: 'AFTER_SALES' },
  });
  fireEvent.change(screen.getByLabelText('Categoría'), {
    target: { value: 'STRUCTURE' },
  });
  fireEvent.change(screen.getByLabelText('Prioridad'), {
    target: { value: 'HIGH' },
  });
}
it('creates with CSRF, prevents duplicate submissions and routes to the returned detail', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ promotion });
  });
  render(<IncidentScreen promotionId={promotion.id} />);
  const form = await screen.findByRole('form', { name: 'Crear incidencia' });
  fillValidForm();
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Creando…' });
  fireEvent.submit(form);
  expect(
    fetchMock.mock.calls.filter(([path]) => path === '/api/incidents'),
  ).toHaveLength(1);
  const [, init] = fetchMock.mock.calls.find(
    ([path]) => path === '/api/incidents',
  )!;
  expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'synthetic-csrf' });
  expect(JSON.parse(String(init?.body))).toMatchObject({
    originPhase: 'AFTER_SALES',
    priority: 'HIGH',
    promotionId: promotion.id,
  });
  finish(response({ incident }, 201));
  await vi.waitFor(() => expect(window.location.hash).toBe('#/incidents/i051'));
});
it.each([400, 403, 404, 409, 503])(
  'shows a safe %i mutation error and keeps form values',
  async (status) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/csrf')
        return response({ csrfToken: 'synthetic-csrf' });
      if (path === '/api/incidents')
        return response({ message: 'private diagnostic' }, status);
      return response({ promotion });
    });
    render(<IncidentScreen promotionId={promotion.id} />);
    await screen.findByRole('form', { name: 'Crear incidencia' });
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Crear incidencia' }));
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe(
      incident.title,
    );
    expect(
      screen
        .getByRole('form', { name: 'Crear incidencia' })
        .getAttribute('aria-busy'),
    ).toBe('false');
  },
);
it('loads existing detail safely and focuses its heading', async () => {
  fetchMock.mockResolvedValue(response({ incident }));
  render(<IncidentScreen id={incident.id} />);
  expect(screen.getByRole('status').textContent).toBe(
    'Consultando incidencia…',
  );
  const heading = await screen.findByRole('heading', { name: incident.title });
  expect(document.activeElement).toBe(heading);
  expect(screen.getByText('Posventa')).toBeTruthy();
  expect(screen.getByText('Abierta')).toBeTruthy();
  expect(screen.queryByRole('form', { name: 'Crear incidencia' })).toBeNull();
});
it('reports missing detail without exposing the response body', async () => {
  fetchMock.mockResolvedValue(response({ message: 'private diagnostic' }, 404));
  render(<IncidentScreen id="missing" />);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'No se ha encontrado la incidencia o la promoción.',
  );
});
it('does not navigate after an unmounted creation response', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ promotion });
  });
  const view = render(<IncidentScreen promotionId={promotion.id} />);
  await screen.findByRole('form', { name: 'Crear incidencia' });
  fillValidForm();
  fireEvent.submit(screen.getByRole('form', { name: 'Crear incidencia' }));
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  view.unmount();
  window.location.hash = '/promotions';
  finish(response({ incident }, 201));
  await vi.waitFor(() => expect(window.location.hash).toBe('#/promotions'));
});

it('ignores a late detail response from a previous route', async () => {
  let finishOld!: (value: Response) => void;
  fetchMock.mockImplementation(async (path) =>
    path === '/api/incidents/old'
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : response({
          incident: { ...incident, id: 'new', title: 'Detalle vigente' },
        }),
  );
  const view = render(<IncidentScreen id="old" />);
  await vi.waitFor(() => expect(finishOld).toBeTypeOf('function'));
  view.rerender(<IncidentScreen id="new" />);
  await screen.findByRole('heading', { name: 'Detalle vigente' });
  await act(async () => {
    finishOld(
      response({
        incident: { ...incident, id: 'old', title: 'Detalle anterior' },
      }),
    );
  });
  await vi.waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Detalle anterior' }),
    ).toBeNull(),
  );
  expect(screen.getByRole('heading', { name: 'Detalle vigente' })).toBeTruthy();
});

it('resets busy when changing promotion during a pending creation and ignores its late response', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ promotion });
  });
  const view = render(<IncidentScreen promotionId={promotion.id} />);
  await screen.findByRole('form', { name: 'Crear incidencia' });
  fillValidForm();
  fireEvent.submit(screen.getByRole('form', { name: 'Crear incidencia' }));
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  view.rerender(<IncidentScreen promotionId="another-promotion" />);
  const nextForm = await screen.findByRole('form', {
    name: 'Crear incidencia',
  });
  expect(nextForm.getAttribute('aria-busy')).toBe('false');
  expect(
    screen.getByRole('button', { name: 'Crear incidencia' }).closest('fieldset')
      ?.disabled,
  ).toBe(false);
  window.location.hash = '/incidents/new/another-promotion';
  await act(async () => {
    finish(response({ incident }, 201));
  });
  expect(window.location.hash).toBe('#/incidents/new/another-promotion');
  expect(
    screen
      .getByRole('form', { name: 'Crear incidencia' })
      .getAttribute('aria-busy'),
  ).toBe('false');
});
it('clears validation errors when opening a different promotion form', async () => {
  const view = render(<IncidentScreen promotionId={promotion.id} />);
  fireEvent.submit(
    await screen.findByRole('form', { name: 'Crear incidencia' }),
  );
  expect(
    await screen.findByText('Título: entre 5 y 150 caracteres.'),
  ).toBeTruthy();
  view.rerender(<IncidentScreen promotionId="another-promotion" />);
  await screen.findByRole('form', { name: 'Crear incidencia' });
  expect(screen.getByLabelText('Título').getAttribute('aria-invalid')).toBe(
    'false',
  );
  expect(screen.queryByText('Título: entre 5 y 150 caracteres.')).toBeNull();
});

it('shows comments as inert text and validates an empty comment accessibly', async () => {
  fetchMock.mockResolvedValue(
    response({
      incident: {
        ...incident,
        comments: [
          {
            id: 'comment',
            incidentId: incident.id,
            authorId: 'author',
            body: '<img src=x onerror=window.__commentXss=true>',
            createdAt: '2026-10-22T12:00:00Z',
          },
        ],
      },
    }),
  );
  render(<IncidentScreen id={incident.id} />);
  expect(
    await screen.findByText('<img src=x onerror=window.__commentXss=true>'),
  ).toBeTruthy();
  expect(document.querySelector('img')).toBeNull();
  fireEvent.submit(screen.getByRole('form', { name: 'Añadir comentario' }));
  expect(
    await screen.findByText('Escribe entre 1 y 2000 caracteres.'),
  ).toBeTruthy();
  const field = screen.getByLabelText('Comentario', { exact: true });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  await vi.waitFor(() => expect(document.activeElement).toBe(field));
});

it('adds a comment using CSRF, prevents duplicates and returns focus after saving', async () => {
  let finish!: (value: Response) => void;
  const comment = {
    id: 'comment',
    incidentId: incident.id,
    authorId: 'author',
    body: 'Comentario enviado',
    createdAt: '2026-10-22T12:00:00Z',
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === `/api/incidents/${incident.id}/comments`)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ incident });
  });
  render(<IncidentScreen id={incident.id} />);
  const field = await screen.findByLabelText('Comentario', { exact: true });
  fireEvent.change(field, { target: { value: comment.body } });
  const form = screen.getByRole('form', { name: 'Añadir comentario' });
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Añadiendo…' });
  fireEvent.submit(form);
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === `/api/incidents/${incident.id}/comments`,
    ),
  ).toHaveLength(1);
  finish(response({ comment }, 201));
  expect(await screen.findByText(comment.body)).toBeTruthy();
  expect((field as HTMLTextAreaElement).value).toBe('');
  await vi.waitFor(() => expect(document.activeElement).toBe(field));
});

it.each([403, 404, 409, 503])(
  'keeps comment text after a safe %i error',
  async (status) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/csrf')
        return response({ csrfToken: 'synthetic-csrf' });
      if (path === `/api/incidents/${incident.id}/comments`)
        return response({ message: 'private diagnostic' }, status);
      return response({ incident });
    });
    render(<IncidentScreen id={incident.id} />);
    const field = await screen.findByLabelText('Comentario', { exact: true });
    fireEvent.change(field, { target: { value: 'Comentario conservado' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Añadir comentario' }));
    await screen.findByText(
      (
        {
          403: 'No tienes permiso para añadir comentarios.',
          404: 'La incidencia no está disponible o ya no tienes acceso.',
          409: 'La incidencia está cerrada o la promoción archivada. No admite comentarios.',
        } as Record<number, string>
      )[status] ?? 'No se pudo añadir el comentario. Inténtalo de nuevo.',
    );
    expect((field as HTMLTextAreaElement).value).toBe('Comentario conservado');
    expect(document.body.textContent).not.toContain('private diagnostic');
  },
);
