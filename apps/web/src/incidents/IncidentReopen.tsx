import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { Role } from '../api/users.js';
import {
  reopenIncident,
  eligibleAssignees,
  type Assignee,
  reopenError,
  type IncidentDetail,
} from '../api/incidents.js';
import {
  PromotionAction,
  FilterChevron,
} from '../promotions/PromotionControls.js';

export function IncidentReopen({
  incident,
  role,
  onReopened,
}: {
  incident: IncidentDetail;
  role: Role | undefined;
  onReopened: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [users, setUsers] = useState<Assignee[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const wasBusy = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const assigneeField = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    if (busy) dialog.current?.focus();
    else if (wasBusy.current) field.current?.focus();
    wasBusy.current = busy;
  }, [open, busy]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoadingUsers(true);
    setMessage('');
    void eligibleAssignees(incident.id)
      .then((value) => {
        if (current) setUsers(value);
      })
      .catch((error: unknown) => {
        if (current) setMessage(reopenError(error));
      })
      .finally(() => {
        if (current) setLoadingUsers(false);
      });
    return () => {
      current = false;
    };
  }, [open, incident.id, attempt]);
  if (
    (role !== 'ADMIN' && role !== 'MANAGER') ||
    incident.promotionStatus !== 'ACTIVE' ||
    incident.status !== 'CLOSED'
  )
    return null;
  function cancel() {
    if (pending.current) return;
    setOpen(false);
    setMessage('');
    setInvalid(false);
    trigger.current?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const value = reason.trim();
    if (
      Array.from(value).length < 5 ||
      Array.from(value).length > 2000 ||
      !assignedToId
    ) {
      setInvalid(true);
      setMessage(
        'Indica un motivo de 5 a 2.000 caracteres y selecciona un responsable.',
      );
      const invalidReason =
        Array.from(value).length < 5 || Array.from(value).length > 2000;
      if (invalidReason) field.current?.focus();
      else assigneeField.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await reopenIncident(incident.id, {
        version: incident.version,
        reason: value,
        assignedToId,
      });
      if (active.current) onReopened();
    } catch (error) {
      if (active.current) setMessage(reopenError(error));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <PromotionAction
        buttonRef={trigger}
        label="Reabrir incidencia"
        icon="reactivate"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      />
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={dialog}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="incident-reopen-title"
            aria-describedby="incident-reopen-description"
            className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-4 focus-visible:outline-2 focus-visible:outline-ring"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
              if (event.key === 'Tab') {
                if (busy) {
                  event.preventDefault();
                  dialog.current?.focus();
                  return;
                }
                const elements = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'textarea:not(:disabled), select:not(:disabled), button:not(:disabled)',
                  ),
                );
                const index = elements.indexOf(
                  document.activeElement as HTMLElement,
                );
                const previous = index <= 0 ? elements.length - 1 : index - 1;
                const next = event.shiftKey
                  ? previous
                  : (index + 1) % elements.length;
                event.preventDefault();
                elements[next]?.focus();
              }
            }}
          >
            <h3 id="incident-reopen-title" className="font-semibold">
              Reabrir incidencia
            </h3>
            <p id="incident-reopen-description" className="text-sm">
              La incidencia volverá a En curso. La solución aprobada se
              conservará en el historial y será necesaria una nueva solución y
              validación independiente.
            </p>
            <form
              aria-label="Confirmar reapertura de incidencia"
              aria-busy={busy}
              noValidate
              onSubmit={(event) => void submit(event)}
              className="grid gap-3"
            >
              <label htmlFor="incident-reopening-reason">
                Motivo de reapertura
              </label>
              <textarea
                ref={field}
                id="incident-reopening-reason"
                value={reason}
                disabled={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={
                  message
                    ? 'incident-reopening-help incident-reopening-error'
                    : 'incident-reopening-help'
                }
                onChange={(event) => {
                  setReason(event.target.value);
                  setInvalid(false);
                }}
                className="min-h-24 w-full rounded-lg border bg-background p-2"
              />
              <p
                id="incident-reopening-help"
                className="text-sm text-muted-foreground"
              >
                Entre 5 y 2.000 caracteres. El motivo y el cierre anterior
                quedarán conservados en el historial.
              </p>
              <label htmlFor="incident-reopen-assignee">
                Responsable de la nueva revisión
              </label>
              <div className="relative min-w-0">
                <select
                  ref={assigneeField}
                  id="incident-reopen-assignee"
                  value={assignedToId}
                  disabled={busy || loadingUsers}
                  aria-invalid={(invalid && !assignedToId) || undefined}
                  aria-describedby={
                    message ? 'incident-reopening-error' : undefined
                  }
                  onChange={(event) => {
                    setAssignedToId(event.target.value);
                    setInvalid(false);
                  }}
                  className="w-full appearance-none rounded-lg border bg-background py-2 pl-3 pr-10 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="">Selecciona un responsable</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
                <FilterChevron />
              </div>
              {loadingUsers && <p role="status">Consultando responsables…</p>}
              {!loadingUsers && users.length === 0 && (
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Reintentar responsables
                </button>
              )}
              {message && (
                <p id="incident-reopening-error" role="alert">
                  {message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || loadingUsers}
                  className="rounded-lg bg-primary px-3 py-2 text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {busy ? 'Reabriendo…' : 'Confirmar reapertura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
