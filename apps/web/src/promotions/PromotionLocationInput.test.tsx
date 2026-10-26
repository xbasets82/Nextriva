import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  AddressAutocompleteProvider,
  AddressSuggestion,
} from './AddressAutocompleteProvider.js';
import { PromotionLocationInput } from './PromotionLocationInput.js';

function Field({
  provider,
  initial = '',
}: {
  provider: AddressAutocompleteProvider | undefined;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="promotion-location">Ubicación</label>
      <PromotionLocationInput
        value={value}
        onChange={setValue}
        invalid={false}
        provider={provider}
      />
    </>
  );
}
const address = { id: 'one', label: 'Carrer de la Indústria 25, Sabadell' };
async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}
function search(value = 'Sabadell') {
  const field = screen.getByRole('combobox', { name: 'Ubicación' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  return field;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('references the suggestions list only while it is visible', async () => {
  render(
    <Field provider={{ suggest: vi.fn().mockResolvedValue([address]) }} />,
  );
  const field = screen.getByRole('combobox', { name: 'Ubicación' });
  expect(field.getAttribute('aria-controls')).toBeNull();
  search();
  await advance();
  expect(field.getAttribute('aria-controls')).toBe(
    screen.getByRole('listbox').id,
  );
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(field.getAttribute('aria-controls')).toBeNull();
});

it('preserves an existing location and allows manual input without a configured provider', async () => {
  render(<Field provider={undefined} initial="Dirección existente" />);
  const field = screen.getByRole('combobox') as HTMLInputElement;
  expect(field.value).toBe('Dirección existente');
  search('Dirección manual');
  await advance();
  expect(field.value).toBe('Dirección manual');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('aborts and ignores stale responses even when the provider ignores the signal', async () => {
  let completeOld!: (items: AddressSuggestion[]) => void;
  const suggest = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AddressSuggestion[]>((resolve) => {
          completeOld = resolve;
        }),
    )
    .mockResolvedValueOnce([{ id: 'new', label: 'Barcelona nueva' }]);
  render(<Field provider={{ suggest }} />);
  const field = search();
  await advance();
  const signal = suggest.mock.calls[0]?.[1] as AbortSignal;
  fireEvent.change(field, { target: { value: 'Barcelona' } });
  expect(signal.aborted).toBe(true);
  await advance();
  await act(async () => {
    completeOld([address]);
  });
  expect(screen.getByRole('option').textContent).toBe('Barcelona nueva');
  expect(screen.queryByText(address.label)).toBeNull();
});

it('announces loading, empty results and failure while keeping the manual value', async () => {
  let finish!: (items: AddressSuggestion[]) => void;
  const suggest = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AddressSuggestion[]>((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('private provider detail'));
  render(<Field provider={{ suggest }} />);
  const field = search() as HTMLInputElement;
  await advance();
  expect(screen.getByRole('status').textContent).toBe('Buscando direcciones…');
  await act(async () => {
    finish([]);
  });
  expect(screen.getByRole('status').textContent).toContain(
    'No hay sugerencias',
  );
  fireEvent.change(field, { target: { value: 'Manual nueva' } });
  await advance();
  expect(screen.getByRole('status').textContent).toContain(
    'Puedes introducirla manualmente',
  );
  expect(screen.getByRole('status').textContent).not.toContain(
    'private provider detail',
  );
  expect(field.value).toBe('Manual nueva');
});

it('limits suggestions, navigates with arrows and Escape, and keeps focus after mouse selection', async () => {
  const suggest = vi.fn().mockResolvedValue(
    Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      label: `Dirección ${index}`,
    })),
  );
  render(<Field provider={{ suggest }} />);
  const field = search();
  await advance();
  expect(screen.getAllByRole('option')).toHaveLength(5);
  fireEvent.keyDown(field, { key: 'ArrowUp' });
  expect(screen.getAllByRole('option')[4]?.getAttribute('aria-selected')).toBe(
    'true',
  );
  expect(field.getAttribute('aria-activedescendant')).toBe(
    screen.getAllByRole('option')[4]?.id,
  );
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(field, { target: { value: 'Otra dirección' } });
  await advance();
  fireEvent.mouseDown(screen.getAllByRole('option')[0]!);
  fireEvent.click(screen.getAllByRole('option')[0]!);
  expect((field as HTMLInputElement).value).toBe('Dirección 0');
  expect(document.activeElement).toBe(field);
  await advance();
  expect(suggest).toHaveBeenCalledTimes(2);
});

it('rejects an oversized suggestion without truncating or replacing the entered location', async () => {
  const label = 'x'.repeat(201);
  render(
    <Field
      provider={{ suggest: vi.fn().mockResolvedValue([{ id: 'long', label }]) }}
    />,
  );
  const field = search() as HTMLInputElement;
  await advance();
  fireEvent.click(screen.getByRole('option'));
  expect(field.value).toBe('Sabadell');
  expect(screen.getByRole('alert').textContent).toContain(
    'supera los 200 caracteres',
  );
});

it('cancels pending requests on unmount and never looks up a short or oversized query', async () => {
  const suggest = vi.fn().mockResolvedValue([address]);
  const view = render(<Field provider={{ suggest }} />);
  const field = search('ab');
  await advance();
  expect(suggest).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: 'x'.repeat(201) } });
  await advance();
  expect(suggest).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: 'Sabadell' } });
  await advance();
  const signal = suggest.mock.calls[0]?.[1] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
