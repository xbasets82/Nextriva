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
      setMessage('Solución enviada a validación.');
    } catch (error) {
      setFailed(true);
      setMessage(solutionError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="incident-solution-heading"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <h3 id="incident-solution-heading" className="text-xl font-semibold">
        Solución
      </h3>
      <p className="whitespace-pre-wrap break-words">
        {incident.solution ?? 'Todavía no hay una solución guardada.'}
      </p>
      {incident.status === 'PENDING_VALIDATION' && (
        <p>Solución enviada a validación.</p>
      )}
      {canEdit && (
        <form
          aria-label="Documentar solución"
          aria-busy={busy}
          className="space-y-2"
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
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border px-4 py-2"
            >
              {busy && !message ? 'Guardando borrador…' : 'Guardar borrador'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              {busy && !message ? 'Enviando solución…' : 'Enviar a validación'}
            </button>
          </div>
        </form>
      )}
      {!canEdit && message && (
        <p role={failed ? 'alert' : 'status'}>{message}</p>
      )}
    </section>
  );
}
