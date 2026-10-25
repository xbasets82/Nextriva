import { useEffect, useId, useRef, useState } from 'react';
import {
  personalSummary,
  summaryStates,
  type PersonalSummary,
} from './api/personal-summary.js';
import { statusLabels } from './api/incidents.js';
import { PromotionIncidentIndicators } from './promotions/PromotionIncidentIndicators.js';
import { IncidentCreatedAt } from './incidents/IncidentCreatedAt.js';
type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; summary: PersonalSummary };

function StatusChart({
  assignedCounts,
  visibleCounts,
}: {
  assignedCounts: PersonalSummary['countsByStatus'];
  visibleCounts: PersonalSummary['visibleCountsByStatus'];
}) {
  const id = useId();
  const [showVisible, setShowVisible] = useState(false);
  const counts = showVisible ? visibleCounts : assignedCounts;
  const maximum = Math.max(1, ...Object.values(counts));
  return (
    <figure
      aria-labelledby={id}
      className="space-y-4 rounded-xl border border-border/70 bg-background p-4 sm:p-5"
    >
      <figcaption id={id} className="text-base font-semibold">
        {showVisible
          ? 'Incidencias visibles por estado'
          : 'Mis incidencias por estado'}
      </figcaption>
      <div
        role="group"
        aria-label="Ámbito del gráfico"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-1"
      >
        {(
          [
            { all: false, label: 'Asignadas a mí' },
            { all: true, label: 'Todas visibles' },
          ] as const
        ).map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={showVisible === option.all}
            onClick={() => setShowVisible(option.all)}
            className={`min-h-10 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${showVisible === option.all ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ul
        aria-label="Recuentos por estado"
        aria-live="polite"
        aria-atomic="true"
        className="space-y-4 text-sm"
      >
        {summaryStates.map((status) => (
          <li key={status} className="min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <span>
                {statusLabels[status]}: <strong>{counts[status]}</strong>
              </span>
            </div>
            <svg
              aria-hidden="true"
              className="h-3 w-full"
              viewBox="0 0 400 12"
              preserveAspectRatio="none"
            >
              <rect width="400" height="12" rx="4" className="fill-muted" />
              <rect
                width={(counts[status] / maximum) * 400}
                height="12"
                rx="4"
                className="fill-primary/70"
              />
            </svg>
          </li>
        ))}
      </ul>
    </figure>
  );
}
export function HomeScreen({ onViewAll }: { onViewAll: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void personalSummary().then(
      (summary) => {
        if (current) setState({ kind: 'ready', summary });
      },
      () => {
        if (current) setState({ kind: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const total =
    state.kind === 'ready'
      ? Object.values(state.summary.countsByStatus).reduce(
          (sum, value) => sum + value,
          0,
        )
      : 0;
  return (
    <section
      aria-labelledby="home-heading"
      aria-busy={state.kind === 'loading'}
      className="min-w-0 space-y-5"
    >
      <h2 id="home-heading" ref={heading} tabIndex={-1} className="sr-only">
        Resumen de incidencias
      </h2>
      {state.kind === 'loading' && (
        <p role="status">Cargando tus incidencias…</p>
      )}
      {state.kind === 'error' && (
        <div className="space-y-3">
          <p role="alert">No se pudo cargar tu resumen. Inténtalo de nuevo.</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            Reintentar
          </button>
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          <StatusChart
            assignedCounts={state.summary.countsByStatus}
            visibleCounts={state.summary.visibleCountsByStatus}
          />
          {total === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              No tienes incidencias asignadas.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Incidencias prioritarias</h3>
            <a
              href="#/incidents"
              onClick={onViewAll}
              className="rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Ver todas mis incidencias
            </a>
          </div>
          {state.summary.priorityItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tienes incidencias activas asignadas.
            </p>
          ) : (
            <ul aria-label="Incidencias prioritarias" className="space-y-2">
              {state.summary.priorityItems.map((item) => (
                <li
                  key={item.id}
                  className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-xl border border-border/70 bg-background p-4 ${item.priority === 'HIGH' ? 'border-l-4 border-l-primary/60' : ''}`}
                >
                  <a
                    href={`#/incidents/${encodeURIComponent(item.id)}`}
                    className="min-w-0 break-words text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {item.publicCode}
                  </a>
                  <PromotionIncidentIndicators
                    status={item.status}
                    priority={item.priority}
                  />
                  <p className="min-w-0 break-words text-sm">{item.title}</p>
                  <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 break-words text-xs text-muted-foreground">
                      {item.promotionName}
                    </p>
                    <IncidentCreatedAt value={item.createdAt} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
