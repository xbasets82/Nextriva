import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IncidentReopen } from './IncidentReopen.js';
import {
  eligibleAssignees,
  reopenIncident,
  type IncidentDetail,
} from '../api/incidents.js';
import { ApiError } from '../api/transport.js';
vi.mock('../api/incidents.js', async (original) => ({
  ...(await original<typeof import('../api/incidents.js')>()),
  eligibleAssignees: vi.fn(),
  reopenIncident: vi.fn(),
}));
const incident: IncidentDetail = {
  id: 'synthetic',
  publicCode: 'INC-000001',
  promotionId: 'promotion',
  originPhase: 'PLANNING',
  title: 'Synthetic closure',
  description: 'Synthetic closure test',
  category: 'OTHER',
  priority: 'HIGH',
  status: 'CLOSED',
  createdById: 'author',
  assignedToId: 'responsible',
  solution: 'Approved solution',
  solutionSubmittedById: 'responsible',
  solutionSubmittedAt: '2026-10-24T10:00:00Z',
  validatedById: 'validator',
  closedAt: '2026-10-25T10:00:00Z',
  version: 4,
  createdAt: '2026-10-24T09:00:00Z',
  updatedAt: '2026-10-25T10:00:00Z',
  comments: [],
  assignedTo: { id: 'responsible', firstName: 'Persona', lastName: 'Elegible' },
  promotionStatus: 'ACTIVE',
};
beforeEach(() => {
  vi.mocked(eligibleAssignees).mockResolvedValue([incident.assignedTo!]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
async function open(onReopened = vi.fn()) {
  render(
    <IncidentReopen incident={incident} role="ADMIN" onReopened={onReopened} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir incidencia' }));
  await screen.findByRole('option', { name: 'Persona Elegible' });
  return onReopened;
}
function fill() {
  fireEvent.change(screen.getByLabelText('Motivo de reapertura'), {
    target: { value: 'Revisión adicional del cierre' },
  });
  fireEvent.change(screen.getByLabelText('Responsable de la nueva revisión'), {
    target: { value: 'responsible' },
  });
}
it('requires an explicit selected assignee even when retaining the old one and prevents duplicate requests', async () => {
  let complete: (() => void) | undefined;
  vi.mocked(reopenIncident).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () => resolve({ ...incident, status: 'IN_PROGRESS' });
      }),
  );
  const onReopened = await open();
  expect(
    screen.getByLabelText('Responsable de la nueva revisión'),
  ).toHaveProperty('value', '');
  fill();
  const form = screen.getByRole('form', {
    name: 'Confirmar reapertura de incidencia',
  });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(reopenIncident).toHaveBeenCalledTimes(1);
  expect(reopenIncident).toHaveBeenCalledWith(incident.id, {
    version: 4,
    reason: 'Revisión adicional del cierre',
    assignedToId: 'responsible',
  });
  expect(screen.getByRole('button', { name: 'Reabriendo…' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => complete?.());
  expect(onReopened).toHaveBeenCalledTimes(1);
});
it.each([400, 403, 404, 409, 503])(
  'announces a safe recoverable error for HTTP %i',
  async (status) => {
    vi.mocked(reopenIncident).mockRejectedValue(new ApiError(status));
    await open();
    fill();
    fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirmar reapertura' }),
      ).toHaveProperty('disabled', false),
    );
  },
);
it('offers retry after an eligible-assignee load failure', async () => {
  vi.mocked(eligibleAssignees).mockRejectedValueOnce(new ApiError(503));
  render(
    <IncidentReopen incident={incident} role="MANAGER" onReopened={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir incidencia' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reintentar responsables' }),
  );
  expect(
    await screen.findByRole('option', { name: 'Persona Elegible' }),
  ).toBeTruthy();
});
it.each([
  { role: 'COLLABORATOR' as const },
  { role: undefined },
  { status: 'IN_PROGRESS' as const },
  { promotionStatus: 'ARCHIVED' as const },
])('does not offer reopening outside visible UI preconditions %#', (change) => {
  render(
    <IncidentReopen
      incident={{ ...incident, ...change }}
      role={
        change.role ?? (Object.hasOwn(change, 'role') ? undefined : 'ADMIN')
      }
      onReopened={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(eligibleAssignees).not.toHaveBeenCalled();
});

it('focuses the missing responsible when the reason is valid', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Motivo de reapertura'), {
    target: { value: 'Valid reopen reason' },
  });
  fireEvent.submit(screen.getByRole('form'));
  expect(screen.getByLabelText('Responsable de la nueva revisión')).toBe(
    document.activeElement,
  );
  expect(reopenIncident).not.toHaveBeenCalled();
});

it.each([409, 503])(
  'keeps a focusable target inside the pending dialog and restores field focus after HTTP %i',
  async (status) => {
    let reject: ((reason: ApiError) => void) | undefined;
    vi.mocked(reopenIncident).mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    await open();
    fill();
    const dialog = screen.getByRole('dialog');
    const submit = screen.getByRole('button', { name: 'Confirmar reapertura' });
    submit.focus();
    fireEvent.submit(screen.getByRole('form'));
    expect(document.activeElement).toBe(dialog);
    expect(dialog.tabIndex).toBe(-1);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dialog);
    await act(async () => reject?.(new ApiError(status)));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByLabelText('Motivo de reapertura'),
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
  },
);
