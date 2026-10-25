import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { IncidentDetail } from '../api/incidents.js';
import {
  saveIncidentSolution,
  submitIncidentSolution,
} from '../api/incidents.js';
import { IncidentSolution } from './IncidentSolution.js';

vi.mock('../api/incidents.js', () => ({
  saveIncidentSolution: vi.fn(),
  submitIncidentSolution: vi.fn(),
  solutionError: () => 'No se pudo guardar la solución.',
}));

const incident: IncidentDetail = {
  id: 'synthetic-incident',
  publicCode: 'INC-000001',
  promotionId: 'synthetic-promotion',
  createdById: 'responsible',
  assignedToId: 'responsible',
  title: 'Incidencia sintética',
  description: 'Descripción sintética completa',
  category: 'STRUCTURE',
  priority: 'MEDIUM',
  originPhase: 'PLANNING',
  status: 'IN_PROGRESS',
  solution: null,
  solutionSubmittedById: null,
  solutionSubmittedAt: null,
  validatedById: null,
  closedAt: null,
  version: 1,
  createdAt: '2026-10-23',
  updatedAt: '2026-10-23',
  promotionStatus: 'ACTIVE',
  assignedTo: null,
  comments: [],
};

function StatefulSolution() {
  const [current, setCurrent] = useState(incident);
  return (
    <IncidentSolution
      incident={current}
      userId="responsible"
      onUpdated={(updated) =>
        setCurrent((previous) => ({ ...previous, ...updated }))
      }
    />
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('accepts exactly 5000 Unicode code points without a UTF-16 native length restriction', async () => {
  const solution = '😀'.repeat(5000);
  vi.mocked(saveIncidentSolution).mockResolvedValue({ ...incident, solution });
  render(
    <IncidentSolution
      incident={incident}
      userId="responsible"
      onUpdated={vi.fn()}
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Solución' });
  expect(input.hasAttribute('maxlength')).toBe(false);
  fireEvent.change(input, { target: { value: solution } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Borrador guardado.',
  );
  expect(saveIncidentSolution).toHaveBeenCalledWith(incident.id, solution, 1);
});

it.each(['Guardar borrador', 'Enviar a validación'])(
  'rejects 5001 Unicode code points accessibly before %s without an HTTP mutation',
  (action) => {
    render(
      <IncidentSolution
        incident={incident}
        userId="responsible"
        onUpdated={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Solución' });
    fireEvent.change(input, { target: { value: '😀'.repeat(5001) } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(screen.getByRole('alert')).toHaveProperty(
      'textContent',
      'La solución no puede superar los 5.000 caracteres.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(
      'incident-solution-error',
    );
    expect(document.activeElement).toBe(input);
    expect(saveIncidentSolution).not.toHaveBeenCalled();
    expect(submitIncidentSolution).not.toHaveBeenCalled();
  },
);

it('shows only one success message after the incident enters pending validation', async () => {
  const draft = { ...incident, solution: 'Solución sintética', version: 2 };
  const submitted = {
    ...draft,
    status: 'PENDING_VALIDATION' as const,
    solutionSubmittedById: 'responsible',
    solutionSubmittedAt: '2026-10-26T10:00:00.000Z',
    version: 3,
  };
  vi.mocked(saveIncidentSolution).mockResolvedValue(draft);
  vi.mocked(submitIncidentSolution).mockResolvedValue(submitted);

  render(<StatefulSolution />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Solución' }), {
    target: { value: 'Solución sintética' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar a validación' }));

  await vi.waitFor(() => {
    expect(submitIncidentSolution).toHaveBeenCalledTimes(1);
  });
  expect(
    screen.getAllByText('Solución enviada a validación.', { exact: true }),
  ).toHaveLength(1);
});

it('shows the submission error once without a success message when submit fails', async () => {
  const draft = { ...incident, solution: 'Solución sintética', version: 2 };
  vi.mocked(saveIncidentSolution).mockResolvedValue(draft);
  vi.mocked(submitIncidentSolution).mockRejectedValue(new Error('conflict'));

  render(<StatefulSolution />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Solución' }), {
    target: { value: 'Solución sintética' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar a validación' }));

  expect((await screen.findByRole('alert')).textContent).toBe(
    'No se pudo guardar la solución.',
  );
  expect(
    screen.queryByText('Solución enviada a validación.', { exact: true }),
  ).toBeNull();
  expect(submitIncidentSolution).toHaveBeenCalledTimes(1);
});
