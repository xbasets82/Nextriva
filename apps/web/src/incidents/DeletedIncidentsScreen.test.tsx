import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeletedIncidentsScreen } from './DeletedIncidentsScreen.js';
const item = {
  promotionId: 'promotion',
  originPhase: 'PLANNING',
  description: 'Synthetic history',
  category: 'OTHER',
  priority: 'LOW',
  createdById: 'author',
  assignedToId: null,
  solution: null,
  solutionSubmittedAt: null,
  solutionSubmittedById: null,
  validatedById: null,
  closedAt: null,
  version: 2,
  updatedAt: '2026-10-26T12:00:00Z',
  deletedById: 'admin',
  id: 'deleted',
  publicCode: 'INC-000019',
  title: 'Retirada sintética',
  status: 'OPEN',
  createdAt: '2026-10-25T12:00:00Z',
  deletedAt: '2026-10-26T12:00:00Z',
  deletionReason: '<script>Motivo seguro</script>',
  deletedBy: { id: 'admin', firstName: 'Persona', lastName: 'Sintética' },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows the immutable deletion audit and paginates without an operational detail link', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [item],
          page: 1,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        }),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<DeletedIncidentsScreen role="ADMIN" />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  expect(await screen.findByText('Retirada sintética')).toBeTruthy();
  expect(screen.getByText('Persona Sintética')).toBeTruthy();
  expect(screen.getByText(item.deletionReason)).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.queryByRole('link', { name: item.publicCode })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/incidents/deleted?page=2&pageSize=10',
      expect.anything(),
    ),
  );
  expect(
    await screen.findByText('No hay incidencias eliminadas en esta página.'),
  ).toBeTruthy();
});
it('shows an accessible empty state and a recoverable safe error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            page: 1,
            pageSize: 10,
            total: 0,
            totalPages: 0,
          }),
        ),
      ),
  );
  render(<DeletedIncidentsScreen role="MANAGER" />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(
    await screen.findByText('No hay incidencias eliminadas en esta página.'),
  ).toBeTruthy();
});
it('denies collaborators without issuing a history request', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<DeletedIncidentsScreen role="COLLABORATOR" />);
  expect(screen.getByRole('alert').textContent).toContain('No tienes permiso');
  expect(fetchMock).not.toHaveBeenCalled();
});
