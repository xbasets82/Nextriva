import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Promotion } from '../api/promotions.js';
import { FilterChevron } from '../promotions/PromotionControls.js';

export function IncidentPromotionSelection({
  promotions,
  loading,
  failed,
  onRetry,
  onCancel,
  onSelect,
}: {
  promotions: Promotion[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onSelect: (promotionId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const promotionFieldId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const eligible = promotions.filter(({ status }) => status === 'ACTIVE');
  const canContinue =
    !loading && !failed && eligible.some(({ id }) => id === selected);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canContinue) onSelect(selected);
  }
  return (
    <form
      aria-label="Seleccionar promoción"
      aria-busy={loading}
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
        Seleccionar promoción
      </h2>
      <p className="text-sm text-muted-foreground">
        Selecciona la promoción para crear la incidencia.
      </p>
      {loading && <p role="status">Consultando promociones…</p>}
      {failed && (
        <div className="space-y-2">
          <p role="alert">No se pudieron cargar las promociones.</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-10 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Reintentar promociones
          </button>
        </div>
      )}
      {!loading && !failed && eligible.length === 0 && (
        <p role="status">
          No hay promociones activas disponibles para crear incidencias.
        </p>
      )}
      <div className="grid gap-3 text-sm font-medium">
        <label htmlFor={promotionFieldId}>Promoción</label>
        <span className="relative min-w-0">
          <select
            id={promotionFieldId}
            value={selected}
            disabled={loading || failed || eligible.length === 0}
            onChange={(event) => setSelected(event.target.value)}
            className="min-h-10 w-full appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 font-normal focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            <option value="">Selecciona una promoción</option>
            {eligible.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <FilterChevron />
        </span>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 rounded-lg border px-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canContinue}
          className="min-h-10 rounded-lg action-primary px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    </form>
  );
}
