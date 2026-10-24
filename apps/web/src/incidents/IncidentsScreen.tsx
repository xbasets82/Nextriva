import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  listIncidents,
  incidentListError,
  statusLabels,
  categories,
  priorities,
  type Incident,
  type IncidentListQuery,
  type IncidentPage,
} from '../api/incidents.js';
import { phaseLabels } from '../api/promotions.js';
import { Card, CardContent } from '@/components/ui/card';

type StatusFilter = NonNullable<IncidentListQuery['status']>;
type PriorityFilter = NonNullable<IncidentListQuery['priority']>;
type CategoryFilter = NonNullable<IncidentListQuery['category']>;
type FilterValues = {
  q: string;
  promotionId: string;
  status: '' | StatusFilter;
  priority: '' | PriorityFilter;
  category: '' | CategoryFilter;
  assignedToId: string;
};
type ListState =
  | { kind: 'loading' }
  | { kind: 'success'; result: IncidentPage }
  | { kind: 'error'; message: string };

const pageSize = 20;
const statuses: StatusFilter[] = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VALIDATION',
  'CLOSED',
];
const priorityValues: PriorityFilter[] = ['LOW', 'MEDIUM', 'HIGH'];
const categoryValues: CategoryFilter[] = [
  'STRUCTURE',
  'ENVELOPE',
  'INSTALLATIONS',
  'FINISHES',
  'CARPENTRY',
  'COMMON_AREAS',
  'CLEANING',
  'SAFETY',
  'OTHER',
];
const emptyFilters: FilterValues = {
  q: '',
  promotionId: '',
  status: '',
  priority: '',
  category: '',
  assignedToId: '',
};

function toQuery(filters: FilterValues, page: number): IncidentListQuery {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.promotionId ? { promotionId: filters.promotionId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    page,
    pageSize,
  };
}

export function IncidentsScreen() {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [draft, setDraft] = useState<FilterValues>(emptyFilters);
  const [applied, setApplied] = useState<FilterValues>(emptyFilters);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    void listIncidents(toQuery(applied, page)).then(
      (result) => {
        if (active) setState({ kind: 'success', result });
      },
      (error: unknown) => {
        if (active)
          setState({ kind: 'error', message: incidentListError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [applied, page, attempt]);

  useEffect(() => {
    if (state.kind !== 'loading') heading.current?.focus();
  }, [state]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({
      ...draft,
      q: draft.q.trim(),
      promotionId: draft.promotionId.trim(),
      assignedToId: draft.assignedToId.trim(),
    });
    setPage(1);
    setAttempt((value) => value + 1);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
    setAttempt((value) => value + 1);
  }

  function renderIncident(incident: Incident) {
    return (
      <li key={incident.id}>
        <Card>
          <CardContent className="space-y-2 pt-4">
            <a
              href={`#/incidents/${incident.id}`}
              className="block break-words font-semibold underline"
            >
              {incident.publicCode} — {incident.title}
            </a>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd>{statusLabels[incident.status]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fase de origen</dt>
                <dd>{phaseLabels[incident.originPhase]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Categoría</dt>
                <dd>{categories[incident.category]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prioridad</dt>
                <dd>{priorities[incident.priority]}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </li>
    );
  }

  return (
    <section
      aria-labelledby="incidents-heading"
      aria-busy={state.kind === 'loading'}
      className="space-y-4"
    >
      <h2
        id="incidents-heading"
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold"
      >
        Incidencias
      </h2>

      <form
        role="search"
        aria-label="Filtros de incidencias"
        onSubmit={applyFilters}
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <label className="grid gap-1 text-sm font-medium">
          Código o título
          <input
            type="search"
            value={draft.q}
            maxLength={150}
            onChange={(event) =>
              setDraft((current) => ({ ...current, q: event.target.value }))
            }
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Promoción (UUID)
          <input
            type="text"
            value={draft.promotionId}
            maxLength={36}
            aria-describedby="promotion-filter-help"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                promotionId: event.target.value,
              }))
            }
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          />
          <span
            id="promotion-filter-help"
            className="font-normal text-muted-foreground"
          >
            Filtra por el identificador de una promoción.
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Estado
          <select
            value={draft.status}
            onChange={(event) => {
              const status = statuses.find(
                (value) => value === event.target.value,
              );
              setDraft((current) => ({ ...current, status: status ?? '' }));
            }}
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          >
            <option value="">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Prioridad
          <select
            value={draft.priority}
            onChange={(event) => {
              const priority = priorityValues.find(
                (value) => value === event.target.value,
              );
              setDraft((current) => ({
                ...current,
                priority: priority ?? '',
              }));
            }}
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          >
            <option value="">Todas las prioridades</option>
            {priorityValues.map((priority) => (
              <option key={priority} value={priority}>
                {priorities[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Categoría
          <select
            value={draft.category}
            onChange={(event) => {
              const category = categoryValues.find(
                (value) => value === event.target.value,
              );
              setDraft((current) => ({
                ...current,
                category: category ?? '',
              }));
            }}
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          >
            <option value="">Todas las categorías</option>
            {categoryValues.map((category) => (
              <option key={category} value={category}>
                {categories[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Responsable (UUID)
          <input
            type="text"
            value={draft.assignedToId}
            maxLength={36}
            aria-describedby="assignee-filter-help"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                assignedToId: event.target.value,
              }))
            }
            className="min-h-10 rounded-md border bg-background px-3 font-normal"
          />
          <span
            id="assignee-filter-help"
            className="font-normal text-muted-foreground"
          >
            Filtra por el identificador del responsable actual.
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
          <button
            type="submit"
            className="min-h-10 rounded-md bg-primary px-4 text-primary-foreground"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-10 rounded-md border px-4"
          >
            Limpiar filtros
          </button>
        </div>
      </form>

      {state.kind === 'loading' && (
        <p role="status">Consultando incidencias…</p>
      )}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <button
            type="button"
            className="rounded-md border px-4 py-2"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar
          </button>
        </>
      )}
      {state.kind === 'success' && (
        <>
          <p role="status">{state.result.total} resultados</p>
          {state.result.items.length === 0 ? (
            <p role="status">No hay incidencias accesibles.</p>
          ) : (
            <ul aria-label="Incidencias accesibles" className="space-y-3">
              {state.result.items.map(renderIncident)}
            </ul>
          )}
          {state.result.totalPages > 1 && (
            <nav
              aria-label="Paginación de incidencias"
              className="flex items-center justify-between gap-3"
            >
              <button
                type="button"
                disabled={state.result.page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="min-h-10 rounded-md border px-4 disabled:opacity-50"
              >
                Anterior
              </button>
              <span role="status">
                Página {state.result.page} de {state.result.totalPages}
              </span>
              <button
                type="button"
                disabled={state.result.page >= state.result.totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="min-h-10 rounded-md border px-4 disabled:opacity-50"
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
