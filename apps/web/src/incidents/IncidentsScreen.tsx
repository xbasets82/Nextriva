import { useEffect, useId, useRef, useState } from 'react';
import {
  listIncidents,
  incidentListError,
  incidentFilterOptions,
  statusLabels,
  categories,
  priorities,
  type IncidentListQuery,
  type IncidentPage,
  type IncidentFilterAssignee,
} from '../api/incidents.js';
import { listPromotions, type Promotion } from '../api/promotions.js';
import {
  FilterChevron,
  PromotionAction,
} from '../promotions/PromotionControls.js';
import { PromotionIncidentIndicators } from '../promotions/PromotionIncidentIndicators.js';

type ListState =
  | { kind: 'loading' }
  | { kind: 'success'; result: IncidentPage }
  | { kind: 'error'; message: string };
type OptionsState<Value> =
  { kind: 'loading' } | { kind: 'ready'; values: Value[] } | { kind: 'error' };

function useFilterOptions<Value>(load: () => Promise<Value[]>) {
  const [state, setState] = useState<OptionsState<Value>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void load().then(
      (values) => {
        if (current) setState({ kind: 'ready', values });
      },
      () => {
        if (current) setState({ kind: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  empty,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  empty: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-3 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <span className="relative min-w-0">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="block min-h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 font-normal focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <option value="">{empty}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FilterChevron />
      </span>
    </div>
  );
}
function enumValue<T extends string>(
  value: string,
  labels: Record<T, string>,
): T | undefined {
  for (const candidate in labels) if (candidate === value) return candidate;
  return undefined;
}
const labelOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export function IncidentsScreen({
  query,
  onQueryChange,
}: {
  query: IncidentListQuery;
  onQueryChange: (query: IncidentListQuery) => void;
}) {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const promotionOptions = useFilterOptions<Promotion>(listPromotions);
  const responsibleOptions = useFilterOptions<IncidentFilterAssignee>(
    incidentFilterOptions,
  );
  const [search, setSearch] = useState(query.q ?? '');
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(true);
  useEffect(() => {
    if (search.trim() === (query.q ?? '')) return;
    const otherFilters = { ...query };
    delete otherFilters.q;
    const timeout = window.setTimeout(
      () =>
        onQueryChange({
          ...otherFilters,
          ...(search.trim() ? { q: search.trim() } : {}),
          page: 1,
          pageSize: 10,
        }),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [search, query, onQueryChange]);
  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void listIncidents({ ...query, page: query.page ?? 1, pageSize: 10 }).then(
      (result) => {
        if (!current) return;
        const lastPage = Math.max(1, result.totalPages);
        if ((query.page ?? 1) > lastPage) {
          onQueryChange({ ...query, page: lastPage });
          return;
        }
        setState({ kind: 'success', result });
      },
      (error: unknown) => {
        if (current)
          setState({ kind: 'error', message: incidentListError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [query, attempt, onQueryChange]);
  useEffect(() => {
    if (state.kind !== 'loading' && focusAfterLoad.current) {
      heading.current?.focus();
      focusAfterLoad.current = false;
    }
  }, [state]);
  function change<Key extends keyof IncidentListQuery>(
    key: Key,
    value: IncidentListQuery[Key],
  ) {
    focusAfterLoad.current = false;
    const next: IncidentListQuery = { ...query, page: 1, pageSize: 10 };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onQueryChange(next);
  }
  function clear() {
    setSearch('');
    focusAfterLoad.current = false;
    onQueryChange({ page: 1, pageSize: 10 });
  }
  const promotions =
    promotionOptions.state.kind === 'ready'
      ? [...promotionOptions.state.values].sort(
          (a, b) =>
            a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id),
        )
      : [];
  return (
    <section
      aria-labelledby="incidents-heading"
      aria-busy={state.kind === 'loading'}
      className="min-w-0 space-y-4"
    >
      <h2
        id="incidents-heading"
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold"
      >
        Incidencias
      </h2>
      <div
        role="search"
        aria-label="Filtros de incidencias"
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <label className="grid min-w-0 gap-3 text-sm font-medium">
          Código o título
          <input
            type="search"
            value={search}
            maxLength={150}
            onChange={(event) => {
              focusAfterLoad.current = false;
              setSearch(event.target.value);
            }}
            className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <FilterSelect
          label="Promoción"
          value={query.promotionId ?? ''}
          onChange={(value) => change('promotionId', value || undefined)}
          disabled={promotionOptions.state.kind !== 'ready'}
          empty="Todas las promociones"
          options={promotions.map(({ id, name }) => ({
            value: id,
            label: name,
          }))}
        />
        <FilterSelect
          label="Estado"
          value={query.status ?? ''}
          onChange={(value) => change('status', enumValue(value, statusLabels))}
          empty="Todos los estados"
          options={labelOptions(statusLabels)}
        />
        <FilterSelect
          label="Prioridad"
          value={query.priority ?? ''}
          onChange={(value) => change('priority', enumValue(value, priorities))}
          empty="Todas las prioridades"
          options={labelOptions(priorities)}
        />
        <FilterSelect
          label="Categoría"
          value={query.category ?? ''}
          onChange={(value) => change('category', enumValue(value, categories))}
          empty="Todas las categorías"
          options={labelOptions(categories)}
        />
        <FilterSelect
          label="Responsable"
          value={query.assignedToId ?? ''}
          onChange={(value) => change('assignedToId', value || undefined)}
          disabled={responsibleOptions.state.kind !== 'ready'}
          empty="Todos los responsables"
          options={
            responsibleOptions.state.kind === 'ready'
              ? responsibleOptions.state.values.map(
                  ({ id, firstName, lastName, email }) => ({
                    value: id,
                    label: `${firstName} ${lastName} — ${email}`,
                  }),
                )
              : []
          }
        />
        <div className="flex justify-end sm:col-span-2">
          <PromotionAction
            label="Limpiar filtros"
            icon="clear"
            onClick={clear}
          />
        </div>
        {(promotionOptions.state.kind === 'loading' ||
          responsibleOptions.state.kind === 'loading') && (
          <p role="status" className="text-sm">
            Consultando opciones de filtros…
          </p>
        )}
        {promotionOptions.state.kind === 'error' && (
          <div className="sm:col-span-2">
            <p role="alert">No se pudieron cargar las promociones.</p>
            <button
              type="button"
              onClick={promotionOptions.retry}
              className="min-h-10 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Reintentar promociones
            </button>
          </div>
        )}
        {responsibleOptions.state.kind === 'error' && (
          <div className="sm:col-span-2">
            <p role="alert">No se pudieron cargar los responsables.</p>
            <button
              type="button"
              onClick={responsibleOptions.retry}
              className="min-h-10 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Reintentar responsables
            </button>
          </div>
        )}
      </div>
      {state.kind === 'loading' && (
        <p role="status">Consultando incidencias…</p>
      )}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <button
            type="button"
            className="min-h-10 rounded-lg border px-4 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              focusAfterLoad.current = true;
              setAttempt((value) => value + 1);
            }}
          >
            Reintentar
          </button>
        </>
      )}
      {state.kind === 'success' && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {state.result.total} resultados
            {state.result.total > 0 &&
              ` · ${(state.result.page - 1) * state.result.pageSize + 1}–${(state.result.page - 1) * state.result.pageSize + state.result.items.length}`}
          </p>
          {state.result.items.length === 0 ? (
            <p role="status">No hay incidencias accesibles.</p>
          ) : (
            <ul aria-label="Incidencias accesibles" className="grid gap-2">
              {state.result.items.map((incident) => (
                <li
                  key={incident.id}
                  className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-3 ${incident.priority === 'HIGH' ? 'border-l-4 border-l-muted-foreground' : ''}`}
                >
                  <a
                    href={`#/incidents/${incident.id}`}
                    aria-label={`${incident.publicCode} — ${incident.title}`}
                    className="col-start-1 row-start-1 min-w-0 text-xs text-muted-foreground underline underline-offset-4 [overflow-wrap:anywhere]"
                  >
                    {incident.publicCode}
                  </a>
                  <p className="col-start-1 row-start-2 min-w-0 break-words text-sm font-medium">
                    {incident.title}
                  </p>
                  <p className="col-start-1 row-start-3 min-w-0 break-words text-xs text-muted-foreground">
                    {promotions.find(({ id }) => id === incident.promotionId)
                      ?.name ?? 'Promoción no disponible'}
                  </p>
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
              aria-label="Paginación de incidencias"
              className="flex flex-wrap items-center justify-between gap-3 text-sm"
            >
              <button
                type="button"
                disabled={state.result.page <= 1}
                onClick={() => {
                  focusAfterLoad.current = true;
                  onQueryChange({ ...query, page: state.result.page - 1 });
                }}
                className="min-h-10 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Anterior
              </button>
              <span role="status">
                Página {state.result.page} de {state.result.totalPages}
              </span>
              <button
                type="button"
                disabled={state.result.page >= state.result.totalPages}
                onClick={() => {
                  focusAfterLoad.current = true;
                  onQueryChange({ ...query, page: state.result.page + 1 });
                }}
                className="min-h-10 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
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
