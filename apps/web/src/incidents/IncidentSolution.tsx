import {
  PromotionAction,
  iconButtonClassName,
} from '../promotions/PromotionControls.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  saveIncidentSolution,
  solutionError,
  submitIncidentSolution,
  type IncidentDetail,
  type Incident,
} from '../api/incidents.js';

export function IncidentSolution({
  incident,
  userId,
  onUpdated,
}: {
  incident: IncidentDetail;
  userId?: string;
  onUpdated: (incident: Incident) => void;
}) {
  const [solution, setSolution] = useState(incident.solution ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [invalidLength, setInvalidLength] = useState(false);
  const solutionInput = useRef<HTMLTextAreaElement>(null);
  const canEdit =
    userId === incident.assignedToId &&
    incident.status === 'IN_PROGRESS' &&
    incident.promotionStatus === 'ACTIVE';

  useEffect(() => {
    setSolution(incident.solution ?? '');
  }, [incident.solution]);

  function validateLength(): boolean {
    const invalid = [...solution].length > 5000;
    setInvalidLength(invalid);
    if (invalid) {
      setFailed(true);
      setMessage('La solución no puede superar los 5.000 caracteres.');
      solutionInput.current?.focus();
    }
    return !invalid;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!validateLength()) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const updated = await saveIncidentSolution(
        incident.id,
        solution,
        incident.version,
      );
      onUpdated(updated);
      setSolution(updated.solution ?? '');
      setMessage('Borrador guardado.');
    } catch (error) {
      setFailed(true);
      setMessage(solutionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (!validateLength()) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const draft = await saveIncidentSolution(
        incident.id,
        solution,
        incident.version,
      );
      onUpdated(draft);
      const submitted = await submitIncidentSolution(
        incident.id,
        draft.version,
      );
      onUpdated(submitted);
      setSolution(submitted.solution ?? '');
    } catch (error) {
      setFailed(true);
      setMessage(solutionError(error));
    } finally {
      setBusy(false);
    }
  }

  let solutionLabel = 'Borrador de solución';
  if (
    incident.status === 'CLOSED' &&
    incident.validatedById &&
    incident.closedAt
  ) {
    solutionLabel = 'Solución aprobada';
  } else if (
    incident.status === 'PENDING_VALIDATION' &&
    incident.solutionSubmittedById &&
    incident.solutionSubmittedAt
  ) {
    solutionLabel = 'Solución presentada';
  }

  return (
    <section
      aria-labelledby="incident-solution-heading"
      className="space-y-3 border-t pt-4"
    >
      <h3 id="incident-solution-heading" className="text-base font-semibold">
        Solución
      </h3>
      {incident.solution !== null && (
        <p className="text-xs font-medium text-muted-foreground">
          {solutionLabel}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words text-sm">
        {incident.solution ?? 'Todavía no hay una solución guardada.'}
      </p>
      {incident.status === 'PENDING_VALIDATION' && (
        <p role="status">Solución enviada a validación.</p>
      )}
      {canEdit && (
        <form
          aria-label="Documentar solución"
          aria-busy={busy}
          className="grid gap-2"
          noValidate
          onSubmit={(event) => void save(event)}
        >
          <label htmlFor="incident-solution">Solución</label>
          <textarea
            ref={solutionInput}
            id="incident-solution"
            className="min-h-32 w-full rounded-md border bg-background p-2"
            aria-invalid={invalidLength || undefined}
            aria-describedby={
              invalidLength
                ? 'incident-solution-help incident-solution-error'
                : 'incident-solution-help'
            }
            value={solution}
            disabled={busy}
            onChange={(event) => {
              setSolution(event.currentTarget.value);
              if (invalidLength) {
                setMessage('');
                setFailed(false);
              }
              setInvalidLength(false);
            }}
          />
          <p id="incident-solution-help">Máximo 5.000 caracteres.</p>
          {message &&
            (failed ? (
              <p id="incident-solution-error" role="alert">
                {message}
              </p>
            ) : (
              <p role="status">{message}</p>
            ))}
          <div className="flex flex-wrap justify-end gap-2">
            <PromotionAction
              type="submit"
              icon="save"
              label={
                busy && !message ? 'Guardando borrador…' : 'Guardar borrador'
              }
              disabled={busy}
            />
            <PromotionAction
              icon="send"
              label={
                busy && !message ? 'Enviando solución…' : 'Enviar a validación'
              }
              disabled={busy}
              onClick={() => void submit()}
              className={`${iconButtonClassName} bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}
            />
          </div>
        </form>
      )}
      {Boolean(incident.solutionRejections?.length) && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
            Propuestas rechazadas ({incident.solutionRejections?.length})
          </summary>
          <ol className="mt-3 divide-y">
            {incident.solutionRejections?.map((rejection, index) => (
              <li
                key={`${rejection.rejectedAt}-${index}`}
                className="space-y-2 py-3"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  Propuesta rechazada
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {rejection.solution}
                </p>
                <dl className="space-y-1">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Motivo del rechazo
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {rejection.reason}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Presentada
                    </dt>
                    <dd>
                      <time dateTime={rejection.submittedAt}>
                        {new Date(rejection.submittedAt).toLocaleString(
                          'es-ES',
                        )}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Rechazada</dt>
                    <dd>
                      <time dateTime={rejection.rejectedAt}>
                        {new Date(rejection.rejectedAt).toLocaleString('es-ES')}
                      </time>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!canEdit && message && (
        <p role={failed ? 'alert' : 'status'}>{message}</p>
      )}
    </section>
  );
}
