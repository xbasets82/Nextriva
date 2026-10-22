import { useEffect, useRef, useState } from 'react';
import {
  listIncidents,
  incidentError,
  statusLabels,
  categories,
  priorities,
  type Incident,
} from '../api/incidents.js';
import { phaseLabels } from '../api/promotions.js';
import { Card, CardContent } from '@/components/ui/card';

type ListState =
  | { kind: 'loading' }
  | { kind: 'success'; incidents: Incident[] }
  | { kind: 'error'; message: string };

export function IncidentsScreen() {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    void listIncidents().then(
      (incidents) => {
        if (active) setState({ kind: 'success', incidents });
      },
      (error: unknown) => {
        if (active) setState({ kind: 'error', message: incidentError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (state.kind !== 'loading') heading.current?.focus();
  }, [state]);
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
      {state.kind === 'success' &&
        (state.incidents.length === 0 ? (
          <p role="status">No hay incidencias accesibles.</p>
        ) : (
          <ul aria-label="Incidencias accesibles" className="space-y-3">
            {state.incidents.map((incident) => (
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
                        <dt className="text-muted-foreground">
                          Fase de origen
                        </dt>
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
            ))}
          </ul>
        ))}
    </section>
  );
}
