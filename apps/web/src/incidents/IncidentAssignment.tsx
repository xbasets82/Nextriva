import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  assignIncident,
  eligibleAssignees,
  type Assignee,
  type IncidentDetail,
} from '../api/incidents.js';
import {
  FilterChevron,
  PromotionAction,
  iconButtonClassName,
} from '../promotions/PromotionControls.js';
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
    <section aria-label="Responsable" className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">Responsable</h3>
      <p className="break-words">
        {incident.assignedTo
          ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
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
              className="grid gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <select
                    ref={select}
                    id="incident-assignee"
                    aria-label="Selecciona un nuevo responsable"
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
                    className="w-full appearance-none rounded-lg border bg-background py-2 pl-3 pr-10 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <option value="">Selecciona un nuevo responsable</option>
                    {choices.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                  <FilterChevron />
                </div>
                <PromotionAction
                  type="submit"
                  icon="save"
                  disabled={busy || stale || choices.length === 0}
                  label={busy ? 'Guardando responsable…' : actionLabel}
                  className={`${iconButtonClassName} shrink-0 bg-background text-foreground hover:bg-muted`}
                />
              </div>
              {invalid && (
                <p role="alert" id="incident-assignee-error">
                  Selecciona un responsable elegible.
                </p>
              )}
              {!choices.length && !error && <p role="status">{emptyMessage}</p>}
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
