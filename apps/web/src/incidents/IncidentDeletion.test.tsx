import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IncidentDeletion } from './IncidentDeletion.js';
import type { IncidentDetail } from '../api/incidents.js';
const incident: IncidentDetail = {
  id: 'incident',
  publicCode: 'INC-000001',
  promotionId: 'promotion',
  originPhase: 'PLANNING',
  title: 'Synthetic incident',
  description: 'Synthetic description',
  category: 'OTHER',
  priority: 'LOW',
  status: 'OPEN',
  createdById: 'author',
  assignedToId: null,
  solution: null,
  solutionSubmittedAt: null,
  solutionSubmittedById: null,
  validatedById: null,
  closedAt: null,
  version: 1,
  createdAt: '2026-10-26T12:00:00Z',
  updatedAt: '2026-10-26T12:00:00Z',
  comments: [],
  assignedTo: null,
  promotionStatus: 'ACTIVE',
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('requires explicit confirmation and a validated reason, preserving focus on cancel', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(
    <IncidentDeletion incident={incident} role="ADMIN" onDeleted={vi.fn()} />,
  );
  const open = screen.getByRole('button', { name: 'Eliminar incidencia' });
  fireEvent.click(open);
  const reason = screen.getByLabelText('Motivo de eliminación');
  await waitFor(() => expect(document.activeElement).toBe(reason));
  fireEvent.submit(
    screen.getByRole('form', { name: 'Confirmar eliminación de incidencia' }),
  );
  expect(screen.getByRole('alert').textContent).toContain('entre 5 y 2.000');
  expect(reason.getAttribute('aria-invalid')).toBe('true');
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(open);
});
it('sends a single versioned CSRF-protected request and exits only after success', async () => {
  let finish: ((value: Response) => void) | undefined;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: 'synthetic-csrf' })),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const onDeleted = vi.fn();
  render(
    <IncidentDeletion
      incident={incident}
      role="MANAGER"
      onDeleted={onDeleted}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar incidencia' }));
  fireEvent.change(screen.getByLabelText('Motivo de eliminación'), {
    target: { value: '  Motivo sintético  ' },
  });
  const form = screen.getByRole('form', {
    name: 'Confirmar eliminación de incidencia',
  });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(onDeleted).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls[1]).toEqual([
    '/api/incidents/incident/soft-delete',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ version: 1, reason: 'Motivo sintético' }),
      headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
    }),
  ]);
  await act(async () =>
    finish!(
      new Response(
        JSON.stringify({
          incident: {
            ...incident,
            deletedAt: '2026-10-26T13:00:00Z',
            deletedById: 'manager',
            deletionReason: 'Motivo sintético',
            deletedBy: {
              id: 'manager',
              firstName: 'Synthetic',
              lastName: 'Manager',
            },
          },
        }),
      ),
    ),
  );
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
});
it('keeps conflicts recoverable without exposing server diagnostics', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'synthetic' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'private database details' }), {
          status: 409,
        }),
      ),
  );
  render(
    <IncidentDeletion incident={incident} role="ADMIN" onDeleted={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar incidencia' }));
  fireEvent.change(screen.getByLabelText('Motivo de eliminación'), {
    target: { value: 'Motivo válido' },
  });
  fireEvent.submit(
    screen.getByRole('form', { name: 'Confirmar eliminación de incidencia' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Recarga');
  expect(document.body.textContent).not.toContain('private database');
});
it('does not offer deletion to collaborators, pending incidents or archived promotions', () => {
  for (const props of [
    { role: 'COLLABORATOR' as const, incident },
    {
      role: 'ADMIN' as const,
      incident: { ...incident, status: 'PENDING_VALIDATION' as const },
    },
    {
      role: 'ADMIN' as const,
      incident: { ...incident, promotionStatus: 'ARCHIVED' as const },
    },
  ]) {
    const view = render(<IncidentDeletion {...props} onDeleted={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Eliminar incidencia' }),
    ).toBeNull();
    view.unmount();
  }
});

it('traps keyboard focus, cancels with Escape and restores focus without a request', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(
    <IncidentDeletion incident={incident} role="ADMIN" onDeleted={vi.fn()} />,
  );
  const trigger = screen.getByRole('button', { name: 'Eliminar incidencia' });
  fireEvent.click(trigger);
  const field = screen.getByLabelText('Motivo de eliminación');
  await waitFor(() => expect(document.activeElement).toBe(field));
  fireEvent.keyDown(field, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Confirmar eliminación' }),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(field);
  fireEvent.keyDown(field, { key: 'Tab' });
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Cancelar' }),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(field);
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('keeps a pending confirmation open and ignores a late success after leaving the screen', async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'synthetic' })),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
  );
  const onDeleted = vi.fn();
  const view = render(
    <IncidentDeletion incident={incident} role="ADMIN" onDeleted={onDeleted} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar incidencia' }));
  fireEvent.change(screen.getByLabelText('Motivo de eliminación'), {
    target: { value: 'Motivo controlado' },
  });
  fireEvent.submit(
    screen.getByRole('form', { name: 'Confirmar eliminación de incidencia' }),
  );
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled'),
  ).toBe(true);
  view.unmount();
  await act(async () =>
    finish!(
      new Response(
        JSON.stringify({
          incident: {
            deletedAt: '2026-10-26T13:00:00Z',
            deletedById: 'admin',
            deletionReason: 'Motivo controlado',
          },
        }),
      ),
    ),
  );
  expect(onDeleted).not.toHaveBeenCalled();
});
