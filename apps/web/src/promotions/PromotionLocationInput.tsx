import { useEffect, useId, useRef, useState } from 'react';
import type {
  AddressAutocompleteProvider,
  AddressSuggestion,
} from './AddressAutocompleteProvider.js';
import { PromotionIcon } from './PromotionControls.js';

type Lookup =
  | { kind: 'idle' | 'loading' | 'error'; query: string }
  | { kind: 'results'; query: string; items: AddressSuggestion[] };

export function PromotionLocationInput({
  value,
  onChange,
  invalid,
  provider,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  provider: AddressAutocompleteProvider | undefined;
}) {
  const listId = useId();
  const helpId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle', query: '' });
  const [selected, setSelected] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectionError, setSelectionError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const query = value.trim();
  useEffect(() => {
    if (
      !provider ||
      !focused ||
      dismissed ||
      query.length < 3 ||
      query.length > 200 ||
      value === selected
    )
      return;
    const controller = new AbortController();
    let current = true;
    const timer = window.setTimeout(() => {
      setLookup({ kind: 'loading', query });
      void provider.suggest(query, controller.signal).then(
        (items) => {
          if (current)
            setLookup({ kind: 'results', query, items: items.slice(0, 5) });
        },
        () => {
          if (current) setLookup({ kind: 'error', query });
        },
      );
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [provider, focused, dismissed, query, selected, value]);
  const visible =
    focused &&
    !dismissed &&
    query.length >= 3 &&
    query === lookup.query &&
    value !== selected;
  const suggestions = visible && lookup.kind === 'results' ? lookup.items : [];
  const open = suggestions.length > 0;
  function choose(item: AddressSuggestion) {
    if (item.label.length > 200) {
      setSelectionError(
        'La dirección sugerida supera los 200 caracteres. Introduce una dirección más breve manualmente.',
      );
      return;
    }
    onChange(item.label);
    setSelected(item.label);
    setDismissed(true);
    setSelectionError('');
    setActiveIndex(-1);
    input.current?.focus();
  }
  return (
    <div className="min-w-0">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-3 text-muted-foreground">
          <PromotionIcon kind="location" />
        </span>
        <input
          ref={input}
          id="promotion-location"
          name="location"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          aria-invalid={invalid || Boolean(selectionError)}
          aria-describedby={[helpId, invalid ? 'promotion-error-location' : '']
            .filter(Boolean)
            .join(' ')}
          autoComplete="street-address"
          maxLength={200}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setSelected(undefined);
            setDismissed(false);
            setActiveIndex(-1);
            setSelectionError('');
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDismissed(true);
              setActiveIndex(-1);
            }
            if (
              open &&
              (event.key === 'ArrowDown' || event.key === 'ArrowUp')
            ) {
              event.preventDefault();
              setActiveIndex((index) => {
                if (event.key === 'ArrowDown')
                  return (index + 1) % suggestions.length;
                return (index <= 0 ? suggestions.length : index) - 1;
              });
            }
            if (event.key === 'Enter' && open && activeIndex >= 0) {
              event.preventDefault();
              const item = suggestions[activeIndex];
              if (item) choose(item);
            }
          }}
          className="w-full min-w-0 rounded-md border bg-background p-2 pl-10 focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias de direcciones"
          className="mt-1 max-h-56 overflow-y-auto rounded-md border bg-background p-1 text-sm"
        >
          {suggestions.map((item, index) => (
            <li
              key={`${item.id}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              className={`cursor-pointer rounded px-3 py-2 [overflow-wrap:anywhere] hover:bg-muted ${activeIndex === index ? 'bg-muted' : ''}`}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div id={helpId} className="mt-1 space-y-1 text-xs text-muted-foreground">
        {selectionError && <p role="alert">{selectionError}</p>}
        <p role="status" aria-live="polite">
          {!provider && 'Puedes introducir la dirección manualmente.'}
          {visible && lookup.kind === 'loading' && 'Buscando direcciones…'}
          {visible &&
            lookup.kind === 'error' &&
            'No se pudieron consultar direcciones. Puedes introducirla manualmente.'}
          {visible &&
            lookup.kind === 'results' &&
            (suggestions.length
              ? `${suggestions.length} sugerencias disponibles.`
              : 'No hay sugerencias. Puedes introducir la dirección manualmente.')}
        </p>
        {provider && (
          <p>
            Sugerencias de{' '}
            <a
              href="https://www.geoapify.com/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Geoapify
            </a>{' '}
            · ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              OpenStreetMap
            </a>
            . La búsqueda se envía a Geoapify.
          </p>
        )}
      </div>
    </div>
  );
}
