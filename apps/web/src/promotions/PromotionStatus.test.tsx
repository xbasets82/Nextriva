import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.js';
const promotion = {
  id: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  name: 'Promoción sintética',
  status: 'ACTIVE',
  phases: ['CONSTRUCTION', 'AFTER_SALES'],
  createdAt: 'date',
  updatedAt: 'date',
};
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.history.replaceState(null, '', `/#/promotions/${promotion.id}`);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (path) =>
    path === '/api/health'
      ? response({ status: 'ok' })
      : response({ promotion }),
  );
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
it('archives only after accessible confirmation, preserves phases and can reactivate', async () => {
  let saved = { ...promotion };
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/health') return response({ status: 'ok' });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-token' });
    if (init?.method)
      saved = { ...saved, status: JSON.parse(String(init.body)).status };
    return response({ promotion: saved });
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Archivar promoción' }),
  );
  const dialog = screen.getByRole('alertdialog', { name: 'Confirmar archivo' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }));
  expect(await screen.findByText('Archivada')).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Fases activas' }).textContent).toBe(
    'ConstrucciónPosventa',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reactivar promoción' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar reactivación' }),
  );
  expect(await screen.findByText('Activa')).toBeTruthy();
  expect(
    fetchMock.mock.calls
      .filter(([, init]) => init?.method)
      .map(([, init]) => JSON.parse(String(init?.body))),
  ).toEqual([{ status: 'ARCHIVED' }, { status: 'ACTIVE' }]);
});
it('cancels confirmation with Escape and restores trigger focus without writing', async () => {
  render(<App />);
  const trigger = await screen.findByRole('button', {
    name: 'Archivar promoción',
  });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
});
it('shows safe failure without claiming the state was updated', async () => {
  fetchMock.mockImplementation(async (path, init) => {
    if (path === '/api/health') return response({ status: 'ok' });
    if (path === '/api/auth/csrf')
      return response({ csrfToken: 'synthetic-token' });
    if (init?.method) return response({ message: 'private diagnostic' }, 409);
    return response({ promotion });
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Archivar promoción' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'estado de la promoción ha cambiado',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Archivar promoción' }),
    ).toBeTruthy(),
  );
  expect(screen.queryByText('Archivada')).toBeNull();
});

it('ignores a status response after navigating back to the list', async () => {
  let finishStatus!: (response: Response) => void;
  const statusResponse = new Promise<Response>((resolve) => {
    finishStatus = resolve;
  });
  fetchMock.mockImplementation((path, init) => {
    if (path === '/api/health')
      return Promise.resolve(response({ status: 'ok' }));
    if (path === '/api/auth/csrf')
      return Promise.resolve(response({ csrfToken: 'synthetic-token' }));
    if (init?.method) return statusResponse;
    if (path === '/api/promotions')
      return Promise.resolve(response({ promotions: [] }));
    return Promise.resolve(response({ promotion }));
  });

  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Archivar promoción' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(true),
  );

  fireEvent.click(screen.getByRole('link', { name: 'Volver a promociones' }));
  expect(
    await screen.findByRole('heading', { name: 'Promociones', level: 2 }),
  ).toBeTruthy();
  finishStatus(response({ promotion: { ...promotion, status: 'ARCHIVED' } }));

  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Promociones', level: 2 }),
    ).toBeTruthy(),
  );
  expect(
    screen.queryByRole('heading', { name: promotion.name, level: 2 }),
  ).toBeNull();
  expect(window.location.hash).toBe('#/promotions');
});
