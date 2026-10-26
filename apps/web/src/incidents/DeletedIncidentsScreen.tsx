import { useEffect, useRef, useState } from 'react';
import type { Role } from '../api/users.js';
import {
  incidentListError,
  listDeletedIncidents,
  statusLabels,
  type DeletedIncidentPage,
} from '../api/incidents.js';
import { IncidentCreatedAt } from './IncidentCreatedAt.js';
import { PromotionAction } from '../promotions/PromotionControls.js';
type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: DeletedIncidentPage };
export function DeletedIncidentsScreen({ role }: { role: Role }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (role !== 'ADMIN' && role !== 'MANAGER') return;
    let active = true;
    setState({ kind: 'loading' });
    void listDeletedIncidents(page).then(
      (result) => {
        if (active) setState({ kind: 'ready', result });
      },
      (error: unknown) => {
        if (active)
          setState({ kind: 'error', message: incidentListError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [role, page, attempt]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  if (role !== 'ADMIN' && role !== 'MANAGER')
    return (
      <p role="alert">
        No tienes permiso para consultar incidencias eliminadas.
      </p>
    );
  return (
    <section className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
          Incidencias eliminadas
        </h2>
        <PromotionAction
          href="#/incidents"
          label="Volver a incidencias"
          icon="back"
        />
      </header>
      <p className="text-sm text-muted-foreground">
        Consulta histórica según tus permisos actuales. No se permite
        restauración ni edición.
      </p>
      {state.kind === 'loading' && (
        <p role="status">Cargando incidencias eliminadas…</p>
      )}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar
          </button>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <p className="text-sm">{state.result.total} incidencias eliminadas</p>
          {state.result.items.length === 0 ? (
            <p role="status">No hay incidencias eliminadas en esta página.</p>
          ) : (
            <ul className="grid gap-3">
              {state.result.items.map((incident) => (
                <li
                  key={incident.id}
                  className="min-w-0 space-y-2 rounded-xl border p-3"
                >
                  <div className="text-xs text-muted-foreground">
                    {incident.publicCode} · {statusLabels[incident.status]}
                  </div>
                  <h3 className="break-words font-medium">{incident.title}</h3>
                  <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Eliminada por</dt>
                      <dd>
                        {incident.deletedBy.firstName}{' '}
                        {incident.deletedBy.lastName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Fecha de eliminación
                      </dt>
                      <dd>
                        <IncidentCreatedAt
                          value={incident.deletedAt}
                          includeTime
                        />
                      </dd>
                    </div>
                  </dl>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {incident.deletionReason}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label="Paginación de incidencias eliminadas"
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <button
              type="button"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border px-3 py-2 disabled:opacity-50"
            >
              Anterior
            </button>
            <span>
              Página {page} de {Math.max(1, state.result.totalPages)}
            </span>
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={page >= state.result.totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border px-3 py-2 disabled:opacity-50"
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
