import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  assignIncident,
  eligibleAssignees,
  type Assignee,
  type IncidentDetail,
} from '../api/incidents.js';
import { ApiError } from '../api/transport.js';
import type { Role } from '../api/users.js';

function assignmentError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400)
      return 'El responsable ya no es elegible. Recarga la incidencia.';
    if (error.status === 403)
      return 'No tienes permiso para asignar responsables.';
    if (error.status === 404)
      return 'La incidencia no está disponible o ya no tienes acceso.';
    if (error.status === 409)
      return 'La incidencia cambió o ya no admite asignación. Recarga antes de continuar.';
  }
  return 'No se pudieron cargar o guardar los responsables. Inténtalo de nuevo.';
}
export function IncidentAssignment({
  incident,
  role,
  onRefresh,
}: {
  incident: IncidentDetail;
  role: Role | undefined;
  onRefresh: () => Promise<void>;
}) {
  const allowed =
    (role === 'ADMIN' || role === 'MANAGER') &&
    ['OPEN', 'IN_PROGRESS'].includes(incident.status);
  const [users, setUsers] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const sending = useRef(false);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    active.current = true;
    let current = true;
    if (allowed) {
      setLoading(true);
      setError('');
      void eligibleAssignees(incident.id)
        .then((items) => {
          if (current) setUsers(items);
        })
        .catch((failure) => {
          if (current) setError(assignmentError(failure));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }
    return () => {
      current = false;
      active.current = false;
    };
  }, [incident.id, allowed, attempt]);
  async function reload() {
    setBusy(true);
    setError('');
    try {
      await onRefresh();
      if (active.current) {
        setStale(false);
        setAttempt((value) => value + 1);
      }
    } catch (failure) {
      if (active.current) setError(assignmentError(failure));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || stale) return;
    if (!selected) {
      setInvalid(true);
      select.current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setInvalid(false);
    try {
      await assignIncident(incident.id, selected, incident.version);
      if (!active.current) return;
      await onRefresh();
      if (active.current) {
        setSelected('');
        setMessage('Responsable actualizado.');
      }
    } catch (failure) {
      if (active.current) {
        setError(assignmentError(failure));
        if (failure instanceof ApiError && [400, 409].includes(failure.status))
          setStale(true);
      }
    } finally {
      sending.current = false;
      if (active.current) {
        setBusy(false);
        requestAnimationFrame(() => select.current?.focus());
      }
    }
  }
  const choices = users.filter((user) => user.id !== incident.assignedToId);
  const emptyMessage = incident.assignedToId
    ? 'No hay otros responsables elegibles disponibles.'
    : 'No hay responsables elegibles disponibles.';
  const actionLabel = incident.assignedToId
    ? 'Reasignar responsable'
    : 'Asignar responsable';
  return (
    <section
      aria-label="Responsable"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <h3 className="text-xl font-semibold">Responsable</h3>
      <p className="break-words">
        {incident.assignedTo
          ? `Responsable: ${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
          : 'Sin responsable asignado.'}
      </p>
      {allowed && (
        <>
          {loading ? (
            <p role="status">Consultando responsables…</p>
          ) : (
            <form
              aria-label="Asignar responsable"
              aria-busy={busy}
              onSubmit={(event) => void submit(event)}
              noValidate
              className="space-y-3"
            >
              <label htmlFor="incident-assignee">Nuevo responsable</label>
              <select
                ref={select}
                id="incident-assignee"
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setInvalid(false);
                }}
                disabled={busy || stale || choices.length === 0}
                required
                aria-invalid={invalid}
                aria-describedby={
                  invalid ? 'incident-assignee-error' : undefined
                }
                className="w-full rounded-md border bg-background p-2"
              >
                <option value="">Selecciona un responsable</option>
                {choices.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
              {invalid && (
                <p role="alert" id="incident-assignee-error">
                  Selecciona un responsable elegible.
                </p>
              )}
              {!choices.length && !error && <p role="status">{emptyMessage}</p>}
              <button
                type="submit"
                disabled={busy || stale || choices.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
              >
                {busy ? 'Guardando responsable…' : actionLabel}
              </button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
          {error && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reload()}
              className="underline"
            >
              Recargar incidencia
            </button>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
