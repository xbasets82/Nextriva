import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  phases,
  phaseLabels,
  promotionError,
  savePromotion,
  type Promotion,
} from '../api/promotions.js';

import {
  configuredAddressProvider,
  type AddressAutocompleteProvider,
} from './AddressAutocompleteProvider.js';
import { PromotionLocationInput } from './PromotionLocationInput.js';

const fields = [
  ['name', 'Nombre', 3, 150],
  ['description', 'Descripción', 0, 1000],
  ['location', 'Ubicación', 0, 200],
] as const;
export function PromotionForm({
  promotion,
  onSaved,
  onCancel,
  addressProvider = configuredAddressProvider,
}: {
  promotion: Promotion | undefined;
  onSaved: (promotion: Promotion) => void;
  onCancel: () => void;
  addressProvider?: AddressAutocompleteProvider;
}) {
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(promotion?.location ?? '');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const active = useRef(true);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const input = {
      name: String(values.get('name')).trim(),
      description: String(values.get('description')).trim(),
      location: String(values.get('location')).trim(),
      phases: phases.filter((phase) => values.getAll('phases').includes(phase)),
    };
    const invalid: string[] = fields
      .filter(
        ([field, , min, max]) =>
          input[field].length < min || input[field].length > max,
      )
      .map(([field]) => field);
    if (input.phases.length === 0) invalid.push('phases');
    setErrors(invalid);
    if (invalid.length) {
      setMessage('Revisa los campos indicados.');
      form.current
        ?.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const saved = await savePromotion(input, promotion?.id);
      if (!active.current) return;
      if (form.current) form.current.dataset.promotionDirty = 'false';
      setDirty(false);
      onSaved(saved);
    } catch (error) {
      if (active.current) setMessage(promotionError(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <form
      ref={form}
      aria-label={promotion ? 'Editar promoción' : 'Crear promoción'}
      aria-busy={busy}
      data-promotion-dirty={dirty}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <h3 className="text-xl font-semibold">
        {promotion ? 'Editar promoción' : 'Crear promoción'}
      </h3>
      {message && <p role="alert">{message}</p>}
      <fieldset disabled={busy} className="grid gap-4">
        <legend className="sr-only">Datos de la promoción</legend>
        {fields
          .filter(([field]) => field !== 'location')
          .map(([field, label, min, max]) => (
            <div key={field}>
              <label
                htmlFor={`promotion-${field}`}
                className="mb-1 block font-medium"
              >
                {label}
              </label>
              {field === 'description' ? (
                <textarea
                  id={`promotion-${field}`}
                  name={field}
                  defaultValue={promotion?.[field] ?? ''}
                  maxLength={max}
                  aria-invalid={errors.includes(field)}
                  aria-describedby={
                    errors.includes(field)
                      ? `promotion-error-${field}`
                      : undefined
                  }
                  className="min-h-24 w-full rounded-md border bg-background p-2"
                />
              ) : (
                <input
                  id={`promotion-${field}`}
                  name={field}
                  defaultValue={promotion?.[field] ?? ''}
                  required={min > 0}
                  minLength={min}
                  maxLength={max}
                  autoFocus={field === 'name'}
                  aria-invalid={errors.includes(field)}
                  aria-describedby={
                    errors.includes(field)
                      ? `promotion-error-${field}`
                      : undefined
                  }
                  className="w-full rounded-md border bg-background p-2"
                />
              )}
              {errors.includes(field) && (
                <p id={`promotion-error-${field}`} className="text-destructive">
                  {min
                    ? `${label}: entre ${min} y ${max} caracteres.`
                    : `${label}: máximo ${max} caracteres.`}
                </p>
              )}
            </div>
          ))}
        <div>
          <label
            htmlFor="promotion-location"
            className="mb-1 block font-medium"
          >
            Ubicación
          </label>
          <PromotionLocationInput
            value={location}
            onChange={(value) => {
              setLocation(value);
              setDirty(true);
            }}
            invalid={errors.includes('location')}
            provider={addressProvider}
          />
          {errors.includes('location') && (
            <p id="promotion-error-location" className="text-destructive">
              Ubicación: máximo 200 caracteres.
            </p>
          )}
        </div>
        <fieldset
          aria-describedby={
            errors.includes('phases')
              ? 'promotion-error-phases'
              : 'promotion-phase-help'
          }
          className="grid gap-2 rounded-md border p-3"
        >
          <legend className="font-medium">Fases activas</legend>
          <p id="promotion-phase-help">
            Selecciona una o varias fases simultáneas.
          </p>
          {phases.map((phase) => (
            <label key={phase} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="phases"
                value={phase}
                defaultChecked={promotion?.phases.includes(phase)}
              />
              {phaseLabels[phase]}
            </label>
          ))}
          {errors.includes('phases') && (
            <p id="promotion-error-phases" className="text-destructive">
              Selecciona al menos una fase activa.
            </p>
          )}
        </fieldset>
        <div
          role="group"
          aria-label="Acciones del formulario"
          className="flex flex-wrap justify-end gap-3 border-t border-border pt-4"
        >
          <button
            type="button"
            onClick={() => {
              if (!dirty || window.confirm('¿Descartar cambios sin guardar?'))
                onCancel();
            }}
            disabled={busy}
            className="min-h-10 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="min-h-10 rounded-lg border border-primary bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            disabled={busy}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
