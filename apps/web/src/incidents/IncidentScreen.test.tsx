import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
  const form = await screen.findByRole('form', { name: 'Crear incidencia' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Crear incidencia' }),
    ),
  );
  fireEvent.submit(form);
  expect(
    await screen.findByText('Título: entre 5 y 150 caracteres.'),
  ).toBeTruthy();
  const title = screen.getByLabelText('Título', { exact: true });
  expect(title.getAttribute('aria-invalid')).toBe('true');
  expect(title.getAttribute('aria-describedby')).toBe('incident-error-title');
  await waitFor(() => expect(document.activeElement).toBe(title));
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
  assignedToId: null,
  solution: null,
  solutionSubmittedById: null,
  solutionSubmittedAt: null,
  validatedById: null,
  closedAt: null,
  promotionStatus: 'ACTIVE',
  assignedTo: null,
  version: 1,
  createdAt: '2026-10-22',
  updatedAt: '2026-10-22',
};

it('109 shows the authorized promotion name and distinct accessible return icons with existing indicators', async () => {
  fetchMock.mockImplementation(async (path) =>
    String(path).startsWith('/api/promotions/')
      ? response({ promotion })
      : response({ incident }),
  );
  render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
  const promotionLink = await screen.findByRole('link', {
    name: promotion.name,
  });
  expect(promotionLink.getAttribute('href')).toBe(
    `#/promotions/${promotion.id}`,
  );
  const listBack = screen.getByRole('link', { name: 'Volver a incidencias' });
  const promotionBack = screen.getByRole('link', {
    name: 'Volver a la promoción',
  });
  expect(listBack.querySelector('svg')?.getAttribute('data-icon')).toBe('list');
  expect(promotionBack.querySelector('svg')?.getAttribute('data-icon')).toBe(
    'building-2',
  );
  expect(screen.getByRole('img', { name: 'Abierta' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Alta' })).toBeTruthy();
  expect(
    screen
      .getByText('Fecha de creación')
      .parentElement?.querySelector('time')
      ?.getAttribute('dateTime'),
  ).toBe(incident.createdAt);
  expect(
    screen.getByText('Fecha de creación').parentElement?.querySelector('time')
      ?.textContent,
  ).toContain('2026');
  fireEvent.focus(listBack);
  expect(screen.getByRole('tooltip').textContent).toBe('Volver a incidencias');
  expect(document.body.textContent).not.toContain(promotion.id);
});

it.each([403, 404, 503])(
  '109 omits unauthorized or unavailable promotion links on HTTP %i without hiding the incident',
  async (status) => {
    fetchMock.mockImplementation(async (path) =>
      String(path).startsWith('/api/promotions/')
        ? response({ message: 'private diagnostic' }, status)
        : response({ incident }),
    );
    render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
    await screen.findByRole('heading', { name: incident.title });
    expect(
      screen.queryByRole('link', { name: 'Volver a la promoción' }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain(promotion.id);
    expect(document.body.textContent).not.toContain('private diagnostic');
  },
);

it('shows the authorized incident while the auxiliary promotion lookup is pending', async () => {
  fetchMock.mockImplementation(async (path) =>
    String(path).startsWith('/api/promotions/')
      ? new Promise<Response>(() => {})
      : response({ incident }),
  );
  render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
  expect(
    await screen.findByRole('heading', { name: incident.title }),
  ).toBeTruthy();
});

it('109 publishes a plain-text comment through an accessible icon with keyboard tooltip', async () => {
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/comments'))
      return response(
        {
          comment: {
            id: 'comment-109',
            incidentId: incident.id,
            authorId: 'author',
            authorName: 'Ana Prueba',
            body: '<script>alert(1)</script>',
            createdAt: incident.createdAt,
          },
        },
        201,
      );
    if (String(path).startsWith('/api/promotions/'))
      return response({ promotion });
    return response({ incident });
  });
  render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
  const publish = await screen.findByRole('button', {
    name: 'Publicar comentario',
  });
  expect(publish.querySelector('svg')).toBeTruthy();
  fireEvent.focus(publish);
  expect(screen.getByRole('tooltip').textContent).toBe('Publicar comentario');
  fireEvent.change(screen.getByLabelText('Comentario', { exact: true }), {
    target: { value: '<script>alert(1)</script>' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Añadir comentario' }));
  expect(await screen.findByText('<script>alert(1)</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
});

it('109 keeps native assignment controls with an aligned chevron and accessible save icon', async () => {
  fetchMock.mockImplementation(async (path) => {
    if (String(path).endsWith('/eligible-assignees'))
      return response({
        users: [{ id: 'target', firstName: 'Ana', lastName: 'Responsable' }],
      });
    if (String(path).startsWith('/api/promotions/'))
      return response({ promotion });
    return response({ incident });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" />);
  const select = await screen.findByRole('combobox', {
    name: 'Selecciona un nuevo responsable',
  });
  expect(select.className).toContain('appearance-none');
  expect(select.parentElement?.querySelector('svg')).toBeTruthy();
  expect(
    screen.getByRole('option', { name: 'Selecciona un nuevo responsable' }),
  ).toBeTruthy();
  expect(screen.queryByText('Nuevo responsable')).toBeNull();
  expect(screen.queryByText(/^Responsable:/)).toBeNull();
  const save = screen.getByRole('button', { name: 'Asignar responsable' });
  expect(save.querySelector('svg')).toBeTruthy();
  expect(select.parentElement?.parentElement).toBe(
    save.parentElement?.parentElement,
  );
});

it.each([
  {
    status: 'IN_PROGRESS',
    solution: 'Borrador actualizado',
    label: 'Borrador de solución',
  },
  {
    status: 'PENDING_VALIDATION',
    solution: 'Propuesta presentada',
    solutionSubmittedById: 'presenter',
    solutionSubmittedAt: '2026-10-25T10:00:00Z',
    label: 'Solución presentada',
  },
  {
    status: 'CLOSED',
    solution: 'Propuesta aprobada',
    validatedById: 'reviewer',
    closedAt: '2026-10-25T11:00:00Z',
    label: 'Solución aprobada',
  },
])(
  '109 identifies a documented solution state: $label',
  async ({ label, ...changes }) => {
    fetchMock.mockImplementation(async (path) =>
      String(path).startsWith('/api/promotions/')
        ? response({ promotion })
        : response({ incident: { ...incident, ...changes } }),
    );
    render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
    expect(await screen.findByText(label, { exact: true })).toBeTruthy();
  },
);

it('109 preserves a rejected proposal separately from a later draft using existing activity evidence', async () => {
  fetchMock.mockImplementation(async (path) =>
    String(path).startsWith('/api/promotions/')
      ? response({ promotion })
      : response({
          incident: {
            ...incident,
            status: 'IN_PROGRESS',
            solution: 'Nuevo borrador',
            activities: [
              {
                id: 'historical-rejection',
                incidentId: incident.id,
                actorId: 'reviewer',
                eventType: 'STATUS_CHANGED',
                createdAt: '2026-10-25T11:00:00Z',
                changes: {
                  previousStatus: 'PENDING_VALIDATION',
                  status: 'IN_PROGRESS',
                  solution: '<script>propuesta rechazada</script>',
                  solutionSubmittedById: 'presenter',
                  solutionSubmittedAt: '2026-10-25T10:00:00Z',
                  reason: 'Revisar el sellado',
                },
              },
            ],
          },
        }),
  );
  render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
  expect(
    await screen.findByText('Propuesta rechazada', { exact: true }),
  ).toBeTruthy();
  expect(screen.getByText('<script>propuesta rechazada</script>')).toBeTruthy();
  expect(screen.getByText('Nuevo borrador')).toBeTruthy();
  expect(screen.getByText('Revisar el sellado')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
});
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
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.getByText('Posventa')).toBeTruthy();
  expect(screen.getByText('Abierta')).toBeTruthy();
  expect(screen.queryByRole('form', { name: 'Crear incidencia' })).toBeNull();
});

it('shows solution controls only to the assigned responsible on an active in-progress incident', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
    status: 'IN_PROGRESS',
    version: 2,
    solution: null,
    solutionSubmittedById: null,
    solutionSubmittedAt: null,
    validatedById: null,
    closedAt: null,
    promotionStatus: 'ACTIVE',
  };
  fetchMock.mockImplementation(async (path) =>
    path === '/api/incidents/i051'
      ? response({ incident: assigned })
      : response({ csrfToken: 'synthetic-csrf' }),
  );
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  expect(
    await screen.findByRole('form', { name: 'Documentar solución' }),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole('form', { name: 'Documentar solución' }),
    ).getByLabelText('Solución', { exact: true }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Enviar a validación' }),
  ).toBeTruthy();
});

it.each([
  ['a different collaborator', 'another-user', 'IN_PROGRESS', 'ACTIVE'],
  ['a manager', 'manager', 'IN_PROGRESS', 'ACTIVE', 'MANAGER'],
  ['a pending incident', 'responsible', 'PENDING_VALIDATION', 'ACTIVE'],
  ['an archived promotion', 'responsible', 'IN_PROGRESS', 'ARCHIVED'],
])(
  'hides draft actions for %s while preserving the saved text',
  async (
    _description,
    userId,
    status,
    promotionStatus,
    role = 'COLLABORATOR',
  ) => {
    const readOnly = {
      ...incident,
      assignedToId: 'responsible',
      assignedTo: {
        id: 'responsible',
        firstName: 'Ana',
        lastName: 'Responsable',
      },
      status,
      solution: 'Texto conservado',
      promotionStatus,
    };
    fetchMock.mockResolvedValue(response({ incident: readOnly }));
    render(
      <IncidentScreen
        id={incident.id}
        role={role as 'COLLABORATOR' | 'MANAGER'}
        userId={userId}
      />,
    );
    expect(
      await screen.findByText('Texto conservado', { selector: 'p' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('form', { name: 'Documentar solución' }),
    ).toBeNull();
  },
);

it('saves a draft with CSRF, the current version, accessible feedback and updated response', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
    status: 'IN_PROGRESS',
    version: 2,
    solution: null,
    promotionStatus: 'ACTIVE',
  };
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/incidents/i051')
      return response({ incident: { ...assigned, comments: [] } });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/solution') {
      expect(init?.method).toBe('PUT');
      expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'synthetic-csrf' });
      expect(JSON.parse(String(init?.body))).toEqual({
        solution: 'Reparación comprobada',
        version: 2,
      });
      return response({
        incident: {
          ...assigned,
          solution: 'Reparación comprobada',
          version: 3,
        },
      });
    }
    return response({});
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  const form = await screen.findByRole('form', { name: 'Documentar solución' });
  fireEvent.change(within(form).getByLabelText('Solución'), {
    target: { value: 'Reparación comprobada' },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Guardar borrador' }),
  );
  expect((await screen.findByRole('status')).textContent).toBe(
    'Borrador guardado.',
  );
  expect(
    screen.getByText('Reparación comprobada', { selector: 'p' }),
  ).toBeTruthy();
});

it('submits a non-empty solution after saving and renders pending validation without edit controls', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
    status: 'IN_PROGRESS',
    version: 2,
    solution: null,
    promotionStatus: 'ACTIVE',
  };
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/incidents/i051')
      return response({ incident: { ...assigned, comments: [] } });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/solution') {
      const body = JSON.parse(String(init?.body)) as { solution: string };
      return response({ incident: { ...assigned, ...body, version: 3 } });
    }
    if (path === '/api/incidents/i051/submit-solution') {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'synthetic-csrf' });
      expect(JSON.parse(String(init?.body))).toEqual({ version: 3 });
      return response({
        incident: {
          ...assigned,
          solution: 'Reparación lista para validar',
          status: 'PENDING_VALIDATION',
          solutionSubmittedById: 'responsible',
          solutionSubmittedAt: '2026-10-23T12:00:00.000Z',
          version: 4,
        },
      });
    }
    return response({});
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  const form = await screen.findByRole('form', { name: 'Documentar solución' });
  fireEvent.change(within(form).getByLabelText('Solución'), {
    target: { value: 'Reparación lista para validar' },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Enviar a validación' }),
  );
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(
    screen.getByText('Reparación lista para validar', { selector: 'p' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('form', { name: 'Documentar solución' }),
  ).toBeNull();
});

it('keeps the saved draft editable and shows a safe error when submission is rejected', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
    status: 'IN_PROGRESS',
    version: 2,
    solution: null,
    promotionStatus: 'ACTIVE',
  };
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/incidents/i051')
      return response({ incident: { ...assigned, comments: [] } });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/solution') {
      const body = JSON.parse(String(init?.body)) as { solution: string };
      return response({ incident: { ...assigned, ...body, version: 3 } });
    }
    if (path === '/api/incidents/i051/submit-solution')
      return response({ message: 'private validator diagnostic' }, 409);
    return response({});
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  const form = await screen.findByRole('form', { name: 'Documentar solución' });
  const textarea = within(form).getByLabelText('Solución');
  fireEvent.change(textarea, { target: { value: 'Borrador listo' } });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Enviar a validación' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'La incidencia cambió, la promoción está archivada o falta un validador. Recarga y revisa los datos.',
  );
  expect(screen.queryByText('private validator diagnostic')).toBeNull();
  expect((textarea as HTMLTextAreaElement).value).toBe('Borrador listo');
  expect(
    screen.getByRole('form', { name: 'Documentar solución' }),
  ).toBeTruthy();
});

it('keeps the draft and shows a safe retryable error when saving fails', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
    status: 'IN_PROGRESS',
    version: 2,
    solution: null,
    promotionStatus: 'ACTIVE',
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/incidents/i051')
      return response({ incident: { ...assigned, comments: [] } });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/solution')
      return response({ message: 'private database diagnostic' }, 503);
    return response({});
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  const form = await screen.findByRole('form', { name: 'Documentar solución' });
  const textarea = within(form).getByLabelText('Solución');
  fireEvent.change(textarea, { target: { value: 'Borrador a conservar' } });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Guardar borrador' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'No se pudo guardar o enviar la solución. Inténtalo de nuevo.',
  );
  expect(screen.queryByText('private database diagnostic')).toBeNull();
  expect((textarea as HTMLTextAreaElement).value).toBe('Borrador a conservar');
});

it('starts an assigned OPEN incident with CSRF, shows the persisted state and prevents duplicate submission', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
  };
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/start')
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (path === '/api/incidents/i051') return response({ incident: assigned });
    return response({ incident: assigned });
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  const button = await screen.findByRole('button', {
    name: 'Iniciar resolución',
  });
  fireEvent.click(button);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  fireEvent.click(button);
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === '/api/incidents/i051/start',
    ),
  ).toHaveLength(1);
  const [, init] = fetchMock.mock.calls.find(
    ([path]) => path === '/api/incidents/i051/start',
  )!;
  expect(init).toMatchObject({
    method: 'POST',
    headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
  });
  expect(JSON.parse(String(init?.body))).toEqual({ version: 1 });
  finish(
    response({ incident: { ...assigned, status: 'IN_PROGRESS', version: 2 } }),
  );
  expect(await screen.findByText('En curso')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Iniciar resolución' }),
  ).toBeNull();
});

it('keeps the successful start result visible when a follow-up detail read would fail', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
  };
  let detailReads = 0;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/start')
      return response({
        incident: { ...assigned, status: 'IN_PROGRESS', version: 2 },
      });
    if (path === '/api/incidents/i051') {
      detailReads += 1;
      return detailReads === 1
        ? response({ incident: assigned })
        : response({ message: 'private read diagnostic' }, 503);
    }
    return response({ incident: assigned });
  });
  render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="responsible"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Iniciar resolución' }),
  );
  expect(await screen.findByText('En curso')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Iniciar resolución' }),
  ).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(detailReads).toBe(1);
});

it('ignores an older detail refresh that finishes after a successful start', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
  };
  let detailReads = 0;
  let finishOldRead!: (response: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/eligible-assignees')
      return response({ message: 'private diagnostic' }, 503);
    if (path === '/api/incidents/i051/start')
      return response({
        incident: { ...assigned, status: 'IN_PROGRESS', version: 2 },
      });
    if (path === '/api/incidents/i051') {
      detailReads += 1;
      return detailReads === 1
        ? response({ incident: assigned })
        : new Promise((resolve) => {
            finishOldRead = resolve;
          });
    }
    return response({ incident: assigned });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" userId="admin" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Recargar incidencia' }),
  );
  await vi.waitFor(() => expect(finishOldRead).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar resolución' }));
  expect(await screen.findByText('En curso')).toBeTruthy();
  await act(async () => {
    finishOldRead(response({ incident: assigned }));
  });
  expect(screen.getByText('En curso')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Iniciar resolución' }),
  ).toBeNull();
  expect(detailReads).toBe(2);
});

it('hides start when unassigned or non-responsible and announces a safe conflict', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/eligible-assignees')
      return response({ users: [] });
    if (path === '/api/incidents/i051/start')
      return response({ message: 'private database diagnostic' }, 409);
    return response({ incident: assigned });
  });
  const view = render(
    <IncidentScreen
      id={incident.id}
      role="COLLABORATOR"
      userId="someone-else"
    />,
  );
  await screen.findByRole('heading', { name: incident.title });
  expect(
    screen.queryByRole('button', { name: 'Iniciar resolución' }),
  ).toBeNull();
  view.rerender(
    <IncidentScreen id={incident.id} role="MANAGER" userId="manager" />,
  );
  const button = await screen.findByRole('button', {
    name: 'Iniciar resolución',
  });
  fireEvent.click(button);
  const state = screen.getByRole('region', { name: 'Estado de incidencia' });
  await vi.waitFor(() =>
    expect(state.querySelector('[role="alert"]')?.textContent).toBe(
      'La incidencia cambió o no puede iniciarse. Recárgala antes de continuar.',
    ),
  );
  expect(screen.queryByText('private database diagnostic')).toBeNull();
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

it('does not fetch the old private detail when start finishes after leaving the route', async () => {
  const assigned = {
    ...incident,
    assignedToId: 'responsible',
    assignedTo: {
      id: 'responsible',
      firstName: 'Ana',
      lastName: 'Responsable',
    },
  };
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === '/api/incidents/i051/start')
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (path === '/api/incidents/new')
      return response({
        incident: {
          ...incident,
          id: 'new',
          title: 'Detalle nuevo',
          status: 'CLOSED',
        },
      });
    return response({ incident: assigned });
  });
  const view = render(
    <IncidentScreen id={incident.id} role="ADMIN" userId="admin" />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Iniciar resolución' }),
  );
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const oldReads = fetchMock.mock.calls.filter(
    ([path]) => path === '/api/incidents/i051',
  ).length;
  view.rerender(<IncidentScreen id="new" role="ADMIN" userId="admin" />);
  await screen.findByRole('heading', { name: 'Detalle nuevo' });
  await act(async () => {
    finish(
      response({
        incident: { ...assigned, status: 'IN_PROGRESS', version: 2 },
      }),
    );
  });
  expect(
    fetchMock.mock.calls.filter(([path]) => path === '/api/incidents/i051'),
  ).toHaveLength(oldReads);
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
            authorId: '00000000-0000-4000-8000-000000000062',
            authorName: 'Ada Lovelace',
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
  expect(screen.getByText('Autor: Ada Lovelace')).toBeTruthy();
  expect(
    screen.queryByText(/Autor: 00000000-0000-4000-8000-000000000062/),
  ).toBeNull();
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
    authorId: '00000000-0000-4000-8000-000000000062',
    authorName: 'Ada Lovelace',
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
  expect(screen.getByText('Autor: Ada Lovelace')).toBeTruthy();
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

it('assigns a responsible user with CSRF/version, prevents duplicates and reloads the persisted detail', async () => {
  let finish!: (value: Response) => void;
  const user = { id: 'target', firstName: 'Ana', lastName: 'Responsable' };
  let saved = false;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (path === `/api/incidents/${incident.id}/eligible-assignees`)
      return response({ users: [user] });
    if (path === `/api/incidents/${incident.id}/assignment`)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({
      incident: {
        ...incident,
        assignedToId: saved ? user.id : null,
        assignedTo: saved ? user : null,
        version: saved ? 2 : 1,
      },
    });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" />);
  const select = await screen.findByLabelText(
    'Selecciona un nuevo responsable',
    {
      exact: true,
    },
  );
  fireEvent.change(select, { target: { value: user.id } });
  const form = screen.getByRole('form', { name: 'Asignar responsable' });
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Guardando responsable…' });
  fireEvent.submit(form);
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === `/api/incidents/${incident.id}/assignment`,
    ),
  ).toHaveLength(1);
  const [, init] = fetchMock.mock.calls.find(
    ([path]) => path === `/api/incidents/${incident.id}/assignment`,
  )!;
  expect(init?.method).toBe('PATCH');
  expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'synthetic-csrf' });
  expect(JSON.parse(String(init?.body))).toEqual({
    assignedToId: user.id,
    version: 1,
  });
  saved = true;
  finish(
    response({ incident: { ...incident, assignedToId: user.id, version: 2 } }),
  );
  expect(
    await screen.findByText('Ana Responsable', { exact: true }),
  ).toBeTruthy();
  expect(await screen.findByText('Responsable actualizado.')).toBeTruthy();
});
it('validates an empty assignment accessibly and never offers unassignment', async () => {
  fetchMock.mockImplementation(async (path) =>
    path === `/api/incidents/${incident.id}/eligible-assignees`
      ? response({
          users: [{ id: 'target', firstName: 'Ana', lastName: 'Responsable' }],
        })
      : response({
          incident: { ...incident, assignedToId: null, assignedTo: null },
        }),
  );
  render(<IncidentScreen id={incident.id} role="MANAGER" />);
  const select = await screen.findByLabelText(
    'Selecciona un nuevo responsable',
    {
      exact: true,
    },
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Asignar responsable' }));
  expect(
    await screen.findByText('Selecciona un responsable elegible.'),
  ).toBeTruthy();
  expect(select.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(select);
  expect(screen.queryByText('Desasignar')).toBeNull();
});
it('keeps assignment permissions server-owned and hides controls from COLLABORATOR', async () => {
  fetchMock.mockResolvedValue(
    response({
      incident: { ...incident, assignedToId: null, assignedTo: null },
    }),
  );
  render(<IncidentScreen id={incident.id} role="COLLABORATOR" />);
  await screen.findByRole('heading', { name: incident.title });
  expect(
    screen.queryByRole('form', { name: 'Asignar responsable' }),
  ).toBeNull();
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).endsWith('/eligible-assignees'),
    ),
  ).toBe(false);
});

it('does not fetch private detail after an assignment finishes on an unmounted screen', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/eligible-assignees'))
      return response({
        users: [{ id: 'target', firstName: 'Ana', lastName: 'Responsable' }],
      });
    if (String(path).endsWith('/assignment'))
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ incident });
  });
  const view = render(<IncidentScreen id={incident.id} role="ADMIN" />);
  fireEvent.change(
    await screen.findByLabelText('Selecciona un nuevo responsable'),
    {
      target: { value: 'target' },
    },
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Asignar responsable' }));
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  view.unmount();
  await act(async () => {
    finish(response({ incident }));
  });
  expect(
    fetchMock.mock.calls.filter(
      ([path]) => path === `/api/incidents/${incident.id}`,
    ),
  ).toHaveLength(1);
});

it.each([400, 403, 404, 409, 503])(
  'presents a safe %i assignment error, preserves selection and requires explicit reload for stale data',
  async (status) => {
    const target = { id: 'target', firstName: 'Ana', lastName: 'Responsable' };
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/csrf')
        return response({ csrfToken: 'synthetic-csrf' });
      if (String(path).endsWith('/eligible-assignees'))
        return response({ users: [target] });
      if (String(path).endsWith('/assignment'))
        return response({ message: 'private assignment diagnostic' }, status);
      return response({ incident });
    });
    render(<IncidentScreen id={incident.id} role="ADMIN" />);
    const select = await screen.findByLabelText(
      'Selecciona un nuevo responsable',
    );
    fireEvent.change(select, { target: { value: target.id } });
    fireEvent.submit(screen.getByRole('form', { name: 'Asignar responsable' }));
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toContain(
      'private assignment diagnostic',
    );
    expect((select as HTMLSelectElement).value).toBe(target.id);
    expect((select as HTMLSelectElement).disabled).toBe(
      [400, 409].includes(status),
    );
    expect(
      fetchMock.mock.calls.filter(([path]) =>
        String(path).endsWith('/assignment'),
      ),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Recargar incidencia' }),
    );
    await vi.waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            'Selecciona un nuevo responsable',
          ) as HTMLSelectElement
        ).disabled,
      ).toBe(false),
    );
  },
);
it('announces empty eligible assignees and retries a temporary discovery error', async () => {
  let attempts = 0;
  fetchMock.mockImplementation(async (path) => {
    if (String(path).endsWith('/eligible-assignees'))
      return ++attempts === 1
        ? response({ message: 'private discovery' }, 503)
        : response({ users: [] });
    return response({ incident });
  });
  render(<IncidentScreen id={incident.id} role="MANAGER" />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudieron cargar o guardar los responsables. Inténtalo de nuevo.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Recargar incidencia' }));
  expect(
    await screen.findByText('No hay responsables elegibles disponibles.'),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'Asignar responsable',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it('does not offer assignment for pending-validation incidents', async () => {
  fetchMock.mockResolvedValue(
    response({ incident: { ...incident, status: 'PENDING_VALIDATION' } }),
  );
  render(<IncidentScreen id={incident.id} role="ADMIN" />);
  await screen.findByRole('heading', { name: incident.title });
  expect(screen.queryByLabelText('Selecciona un nuevo responsable')).toBeNull();
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).endsWith('/eligible-assignees'),
    ),
  ).toBe(false);
});

it('disables reassignment accessibly when the current responsible user is the only eligible candidate', async () => {
  const current = { id: 'current', firstName: 'Ana', lastName: 'Responsable' };
  fetchMock.mockImplementation(async (path) =>
    String(path).endsWith('/eligible-assignees')
      ? response({ users: [current] })
      : response({
          incident: {
            ...incident,
            assignedToId: current.id,
            assignedTo: current,
          },
        }),
  );
  render(<IncidentScreen id={incident.id} role="ADMIN" />);
  const select = await screen.findByLabelText(
    'Selecciona un nuevo responsable',
  );
  expect((select as HTMLSelectElement).disabled).toBe(true);
  expect(
    (
      screen.getByRole('button', {
        name: 'Reasignar responsable',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(await screen.findByRole('status', { name: '' })).toHaveProperty(
    'textContent',
    'No hay otros responsables elegibles disponibles.',
  );
});

it('I07.3 confirms approval as an independent reviewer and updates the visible status', async () => {
  const pending = {
    ...incident,
    status: 'PENDING_VALIDATION',
    solution: 'Solución comprobada',
    solutionSubmittedById: 'presenter',
    solutionSubmittedAt: '2026-10-23T10:00:00Z',
    validatedById: null,
    closedAt: null,
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/approve-solution'))
      return response({
        incident: {
          ...pending,
          status: 'CLOSED',
          validatedById: 'reviewer',
          closedAt: '2026-10-23T11:00:00Z',
          version: 2,
        },
      });
    return response({ incident: pending });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Aprobar solución' }),
  );
  const dialog = screen.getByRole('dialog', {
    name: 'Aprobar y cerrar incidencia',
  });
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).endsWith('/approve-solution'),
    ),
  ).toBe(false);
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Confirmar aprobación' }),
  );
  expect(await screen.findByText('Cerrada', { exact: true })).toBeTruthy();
  expect(
    fetchMock.mock.calls.find(([path]) =>
      String(path).endsWith('/approve-solution'),
    )?.[1],
  ).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ version: 1 }),
    headers: { 'X-CSRF-Token': 'synthetic-csrf' },
  });
});
it('109 presents approval and rejection choices before opening the rejection reason field', async () => {
  fetchMock.mockResolvedValue(
    response({
      incident: {
        ...incident,
        status: 'PENDING_VALIDATION',
        solution: 'Solución pendiente',
        solutionSubmittedById: 'presenter',
        solutionSubmittedAt: '2026-10-25T10:00:00Z',
      },
    }),
  );
  render(<IncidentScreen id={incident.id} role="MANAGER" userId="reviewer" />);

  expect(
    await screen.findByRole('button', { name: 'Aprobar solución' }),
  ).toBeTruthy();
  const reject = screen.getByRole('button', { name: 'Rechazar solución' });
  expect(
    screen.queryByRole('textbox', { name: 'Motivo del rechazo' }),
  ).toBeNull();
  expect(screen.queryByRole('form', { name: 'Rechazar solución' })).toBeNull();

  fireEvent.click(reject);

  expect(
    await screen.findByRole('form', { name: 'Rechazar solución' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('textbox', { name: 'Motivo del rechazo' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancelar rechazo' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar rechazo' }));
  expect(
    screen.queryByRole('textbox', { name: 'Motivo del rechazo' }),
  ).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Rechazar solución' }),
  );
});
it('I07.3 validates a rejection reason accessibly and preserves its value on a conflict', async () => {
  const pending = {
    ...incident,
    status: 'PENDING_VALIDATION',
    solution: '<b>Solución</b>',
    solutionSubmittedById: 'presenter',
    solutionSubmittedAt: '2026-10-23T10:00:00Z',
    validatedById: null,
    closedAt: null,
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/reject-solution'))
      return response({ message: 'private diagnostic' }, 409);
    return response({ incident: pending });
  });
  render(<IncidentScreen id={incident.id} role="MANAGER" userId="reviewer" />);
  const reject = await screen.findByRole('button', {
    name: 'Rechazar solución',
  });
  fireEvent.click(reject);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
  const field = screen.getByRole('textbox', { name: 'Motivo del rechazo' });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(field);
  expect(screen.getByRole('alert').textContent).toContain('entre 5 y 2.000');
  fireEvent.change(field, { target: { value: 'Falta una comprobación' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain(
    'private diagnostic',
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([path]) =>
        String(path).endsWith('/reject-solution'),
      ),
    ).toBe(true),
  );
  expect(field).toHaveProperty('value', 'Falta una comprobación');
});

it('109 focuses the rejection reason when the reviewer chooses to reject', async () => {
  fetchMock.mockImplementation(async (path) =>
    String(path).startsWith('/api/promotions/')
      ? response({ promotion })
      : response({
          incident: {
            ...incident,
            status: 'PENDING_VALIDATION',
            solution: 'Solución',
            solutionSubmittedById: 'presenter',
            solutionSubmittedAt: '2026-10-25T10:00:00Z',
          },
        }),
  );
  let submitted = false;
  const observer = new MutationObserver(() => {
    const form = document.querySelector('form[aria-label="Rechazar solución"]');
    if (!form || submitted) return;
    submitted = true;
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  observer.observe(document.body, { childList: true, subtree: true });
  try {
    render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rechazar solución' }),
    );
    await screen.findByRole('alert');
    expect(submitted).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Motivo del rechazo' }),
    );
  } finally {
    observer.disconnect();
  }
});

it.each([
  { role: 'ADMIN' as const, userId: 'presenter' },
  { role: 'COLLABORATOR' as const, userId: 'reviewer' },
  { role: 'MANAGER' as const, userId: 'reviewer', status: 'IN_PROGRESS' },
  { role: 'ADMIN' as const, userId: 'reviewer', promotionStatus: 'ARCHIVED' },
])(
  'I07.3 hides review controls outside actor/state preconditions %#',
  async ({ role, userId, ...changes }) => {
    fetchMock.mockResolvedValue(
      response({
        incident: {
          ...incident,
          status: 'PENDING_VALIDATION',
          solution: 'Solución',
          solutionSubmittedById: 'presenter',
          solutionSubmittedAt: '2026-10-23T10:00:00Z',
          ...changes,
        },
      }),
    );
    render(<IncidentScreen id={incident.id} role={role} userId={userId} />);
    await screen.findByRole('heading', { name: incident.title });
    expect(
      screen.queryByRole('button', { name: 'Aprobar solución' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Rechazar solución' }),
    ).toBeNull();
  },
);
it('I07.3 cancels confirmation by Escape, restores focus and traps keyboard navigation', async () => {
  fetchMock.mockResolvedValue(
    response({
      incident: {
        ...incident,
        status: 'PENDING_VALIDATION',
        solution: 'Solución',
        solutionSubmittedById: 'presenter',
        solutionSubmittedAt: '2026-10-23T10:00:00Z',
      },
    }),
  );
  render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
  const approve = await screen.findByRole('button', {
    name: 'Aprobar solución',
  });
  fireEvent.click(approve);
  const dialog = screen.getByRole('dialog');
  const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
  const confirm = within(dialog).getByRole('button', {
    name: 'Confirmar aprobación',
  });
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(confirm);
  fireEvent.keyDown(confirm, { key: 'Tab' });
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(cancel, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(approve);
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).endsWith('/approve-solution'),
    ),
  ).toBe(false);
});
it.each([400, 403, 404, 409, 503])(
  'I07.3 approval reports safe HTTP %i failure and keeps its confirmation open',
  async (status) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/auth/csrf')
        return response({ csrfToken: 'synthetic-csrf' });
      if (String(path).endsWith('/approve-solution'))
        return response({ message: 'private diagnostic' }, status);
      return response({
        incident: {
          ...incident,
          status: 'PENDING_VALIDATION',
          solution: 'Solución',
          solutionSubmittedById: 'presenter',
          solutionSubmittedAt: '2026-10-23T10:00:00Z',
        },
      });
    });
    render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Aprobar solución' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar aprobación' }),
    );
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      'private diagnostic',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirmar aprobación' }),
      ).toHaveProperty('disabled', false),
    );
  },
);
it('I07.3 sends rejection only once while pending, updates state and preserves the returned draft', async () => {
  let finish!: (value: Response) => void;
  const pending = {
    ...incident,
    status: 'PENDING_VALIDATION',
    solution: 'Solución comprobada',
    solutionSubmittedById: 'presenter',
    solutionSubmittedAt: '2026-10-23T10:00:00Z',
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/reject-solution'))
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response({ incident: pending });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Rechazar solución' }),
  );
  const form = await screen.findByRole('form', { name: 'Rechazar solución' });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Motivo del rechazo' }),
    { target: { value: '  Falta comprobar reparación  ' } },
  );
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Validando…' });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([path]) =>
        String(path).endsWith('/reject-solution'),
      ),
    ).toHaveLength(1),
  );
  finish(
    response({
      incident: {
        ...pending,
        status: 'IN_PROGRESS',
        solutionSubmittedById: null,
        solutionSubmittedAt: null,
        version: 2,
      },
    }),
  );
  expect(await screen.findByText('En curso', { exact: true })).toBeTruthy();
  expect(
    await screen.findByText(
      'Solución rechazada. La incidencia vuelve a En curso.',
    ),
  ).toBeTruthy();
  expect(
    fetchMock.mock.calls.find(([path]) =>
      String(path).endsWith('/reject-solution'),
    )?.[1]?.body,
  ).toBe(JSON.stringify({ version: 1, reason: 'Falta comprobar reparación' }));
});

it('I07.3 accepts 2000 Unicode characters as rejection reason without a UTF-16 length mismatch', async () => {
  const pending = {
    ...incident,
    status: 'PENDING_VALIDATION',
    solution: 'Solución',
    solutionSubmittedById: 'presenter',
    solutionSubmittedAt: '2026-10-23T10:00:00Z',
  };
  fetchMock.mockImplementation(async (path) => {
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-csrf' });
    if (String(path).endsWith('/reject-solution'))
      return response({
        incident: {
          ...pending,
          status: 'IN_PROGRESS',
          solutionSubmittedById: null,
          solutionSubmittedAt: null,
          version: 2,
        },
      });
    return response({ incident: pending });
  });
  render(<IncidentScreen id={incident.id} role="ADMIN" userId="reviewer" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Rechazar solución' }),
  );
  const field = await screen.findByRole('textbox', {
    name: 'Motivo del rechazo',
  });
  fireEvent.change(field, { target: { value: '😀'.repeat(2000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
  expect(await screen.findByText('En curso', { exact: true })).toBeTruthy();
});
