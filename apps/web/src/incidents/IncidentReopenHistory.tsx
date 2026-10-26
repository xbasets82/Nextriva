import type { ReopenedCycle } from '../api/incidents.js';
import { IncidentCreatedAt } from './IncidentCreatedAt.js';

export function IncidentReopenHistory({ cycles }: { cycles: ReopenedCycle[] }) {
  if (cycles.length === 0) return null;
  return (
    <section
      aria-label="Cierres anteriores y reaperturas"
      className="space-y-3 border-t pt-4"
    >
      <h3 className="text-sm font-semibold">
        Cierres anteriores y reaperturas
      </h3>
      <ol className="space-y-3">
        {cycles.map((cycle) => (
          <li
            key={cycle.id}
            className="space-y-2 rounded-lg border p-3 text-sm"
          >
            <p className="font-medium">Solución aprobada del ciclo anterior</p>
            <p className="whitespace-pre-wrap break-words">
              {cycle.approvedCycle.solution}
            </p>
            <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt>Presentación</dt>
                <dd>
                  <IncidentCreatedAt
                    value={cycle.approvedCycle.solutionSubmittedAt}
                    includeTime
                  />
                </dd>
              </div>
              <div>
                <dt>Cierre</dt>
                <dd>
                  <IncidentCreatedAt
                    value={cycle.approvedCycle.closedAt}
                    includeTime
                  />
                </dd>
              </div>
              <div>
                <dt>Identificador del presentador</dt>
                <dd className="break-all">
                  {cycle.approvedCycle.solutionSubmittedById}
                </dd>
              </div>
              <div>
                <dt>Identificador del validador</dt>
                <dd className="break-all">
                  {cycle.approvedCycle.validatedById}
                </dd>
              </div>
              <div>
                <dt>Reapertura</dt>
                <dd>
                  <IncidentCreatedAt value={cycle.createdAt} includeTime />
                </dd>
              </div>
              <div>
                <dt>Identificador del actor</dt>
                <dd className="break-all">{cycle.actorId}</dd>
              </div>
              <div>
                <dt>Responsable anterior</dt>
                <dd className="break-all">
                  {cycle.previousAssignedToId ?? 'Sin responsable'}
                </dd>
              </div>
              <div>
                <dt>Responsable de la nueva revisión</dt>
                <dd className="break-all">{cycle.assignedToId}</dd>
              </div>
            </dl>
            <p className="whitespace-pre-wrap break-words">{cycle.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
