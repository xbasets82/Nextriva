import { useEffect, useId, useRef, useState } from 'react';
import {
  listIncidents,
  incidentListError,
  statusLabels,
  categories,
  priorities,
  type IncidentListQuery,
  type IncidentPage,
} from '../api/incidents.js';
import { PromotionIncidentIndicators } from './PromotionIncidentIndicators.js';
import { IncidentCreatedAt } from '../incidents/IncidentCreatedAt.js';
import { FilterChevron } from './PromotionControls.js';

function allowedFilter<T extends string>(
  value: string,
  labels: Record<T, string>,
): T | undefined {
  for (const candidate in labels) if (candidate === value) return candidate;
  return undefined;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: IncidentPage };

export function PromotionIncidents({ promotionId }: { promotionId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<
    Pick<IncidentListQuery, 'q' | 'status' | 'category' | 'priority'>
  >({});
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void listIncidents({ ...filters, promotionId, page, pageSize: 20 }).then(
      (result) => {
        if (!current) return;
        const lastPage = Math.max(1, result.totalPages);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setState({ kind: 'ready', result });
      },
      (error: unknown) => {
        if (current)
          setState({ kind: 'error', message: incidentListError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [promotionId, page, attempt, filters]);
  useEffect(() => {
    if (state.kind !== 'loading' && focusAfterLoad.current) {
      heading.current?.focus();
      focusAfterLoad.current = false;
    }
  }, [state]);
  function changeFilter<Key extends keyof typeof filters>(
    key: Key,
    value: (typeof filters)[Key],
  ) {
    focusAfterLoad.current = false;
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  function changePage(next: number) {
    focusAfterLoad.current = true;
    setPage(next);
  }
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={state.kind === 'loading'}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h3
        ref={heading}
        id={headingId}
        tabIndex={-1}
        className="text-xl font-semibold"
      >
        Incidencias
      </h3>
      <div
        role="search"
        aria-label="Filtros de incidencias de la promoción"
        className="grid min-w-0 gap-3 sm:grid-cols-2"
      >
        <label className="grid min-w-0 gap-3 text-sm">
          Buscar incidencias
          <input
            type="search"
            maxLength={150}
            value={filters.q ?? ''}
            onChange={(event) => changeFilter('q', event.target.value)}
            placeholder="Código o título"
            className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <div className="grid min-w-0 gap-3 text-sm">
          <label htmlFor={`${headingId}-status`}>Estado de incidencia</label>
          <div className="relative min-w-0">
            <select
              id={`${headingId}-status`}
              value={filters.status ?? ''}
              onChange={(event) =>
                changeFilter(
                  'status',
                  allowedFilter(event.target.value, statusLabels),
                )
              }
              className="block min-h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="">Todos los estados</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FilterChevron />
          </div>
        </div>
        <div className="grid min-w-0 gap-3 text-sm">
          <label htmlFor={`${headingId}-category`}>
            Categoría de incidencia
          </label>
          <div className="relative min-w-0">
            <select
              id={`${headingId}-category`}
              value={filters.category ?? ''}
              onChange={(event) =>
                changeFilter(
                  'category',
                  allowedFilter(event.target.value, categories),
                )
              }
              className="block min-h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="">Todas las categorías</option>
              {Object.entries(categories).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FilterChevron />
          </div>
        </div>
        <div className="grid min-w-0 gap-3 text-sm">
          <label htmlFor={`${headingId}-priority`}>
            Prioridad de incidencia
          </label>
          <div className="relative min-w-0">
            <select
              id={`${headingId}-priority`}
              value={filters.priority ?? ''}
              onChange={(event) =>
                changeFilter(
                  'priority',
                  allowedFilter(event.target.value, priorities),
                )
              }
              className="block min-h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="">Todas las prioridades</option>
              {Object.entries(priorities).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FilterChevron />
          </div>
        </div>
      </div>
      {state.kind === 'loading' && (
        <p role="status">Consultando incidencias de la promoción…</p>
      )}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-border px-3 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              focusAfterLoad.current = true;
              setAttempt((value) => value + 1);
            }}
          >
            Reintentar incidencias
          </button>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {state.result.total} incidencias visibles
          </p>
          {state.result.items.length === 0 ? (
            <p role="status">No hay incidencias visibles en esta promoción.</p>
          ) : (
            <ul aria-label="Incidencias de la promoción" className="grid gap-2">
              {state.result.items.map((incident) => (
                <li
                  key={incident.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2"
                >
                  <a
                    href={`#/incidents/${incident.id}`}
                    className="col-start-1 row-start-1 min-w-0 text-xs text-muted-foreground underline underline-offset-4 [overflow-wrap:anywhere]"
                  >
                    {incident.publicCode}
                  </a>
                  <p
                    title={incident.title}
                    className="col-start-1 row-start-2 min-w-0 truncate text-sm font-medium"
                  >
                    {incident.title}
                  </p>
                  <IncidentCreatedAt
                    value={incident.createdAt}
                    className="col-start-1 row-start-3"
                  />
                  <PromotionIncidentIndicators
                    status={incident.status}
                    priority={incident.priority}
                  />
                </li>
              ))}
            </ul>
          )}
          {state.result.totalPages > 1 && (
            <nav
              aria-label="Paginación de incidencias de la promoción"
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <button
                type="button"
                aria-label="Anterior página de incidencias"
                disabled={state.result.page <= 1}
                onClick={() => changePage(state.result.page - 1)}
                className="min-h-10 rounded-lg border border-border px-3 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Anterior
              </button>
              <span role="status">
                Página {state.result.page} de {state.result.totalPages}
              </span>
              <button
                type="button"
                aria-label="Siguiente página de incidencias"
                disabled={state.result.page >= state.result.totalPages}
                onClick={() => changePage(state.result.page + 1)}
                className="min-h-10 rounded-lg border border-border px-3 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
