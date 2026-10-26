import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Role } from '../api/users.js';
import {
  softDeleteIncident,
  deletionError,
  type IncidentDetail,
} from '../api/incidents.js';
import { PromotionAction } from '../promotions/PromotionControls.js';

export function IncidentDeletion({
  incident,
  role,
  onDeleted,
}: {
  incident: IncidentDetail;
  role: Role | undefined;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  if (
    (role !== 'ADMIN' && role !== 'MANAGER') ||
    incident.promotionStatus !== 'ACTIVE' ||
    incident.status === 'PENDING_VALIDATION'
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
    if (Array.from(value).length < 5 || Array.from(value).length > 2000) {
      setInvalid(true);
      setMessage('El motivo debe contener entre 5 y 2.000 caracteres.');
      field.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await softDeleteIncident(incident.id, {
        version: incident.version,
        reason: value,
      });
      if (active.current) onDeleted();
    } catch (error) {
      if (active.current) setMessage(deletionError(error));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <PromotionAction
        buttonRef={trigger}
        label="Eliminar incidencia"
        icon="delete"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg border text-destructive hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      />
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incident-delete-title"
            aria-describedby="incident-delete-description"
            className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-4"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
              if (event.key === 'Tab') {
                const elements = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'textarea:not(:disabled), button:not(:disabled)',
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
            <h3 id="incident-delete-title" className="font-semibold">
              Eliminar incidencia
            </h3>
            <p id="incident-delete-description" className="text-sm">
              La incidencia dejará de aparecer en las vistas habituales. Se
              conservarán sus datos y el historial. Esta acción no permite
              restauración.
            </p>
            <form
              aria-label="Confirmar eliminación de incidencia"
              aria-busy={busy}
              noValidate
              onSubmit={(event) => void submit(event)}
              className="grid gap-3"
            >
              <label htmlFor="incident-deletion-reason">
                Motivo de eliminación
              </label>
              <textarea
                ref={field}
                id="incident-deletion-reason"
                value={reason}
                disabled={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={
                  message
                    ? 'incident-deletion-help incident-deletion-error'
                    : 'incident-deletion-help'
                }
                onChange={(event) => {
                  setReason(event.target.value);
                  setInvalid(false);
                }}
                className="min-h-24 w-full rounded-lg border bg-background p-2"
              />
              <p
                id="incident-deletion-help"
                className="text-sm text-muted-foreground"
              >
                Entre 5 y 2.000 caracteres. El motivo quedará registrado y no
                podrá editarse.
              </p>
              {message && (
                <p id="incident-deletion-error" role="alert">
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
                  disabled={busy}
                  className="rounded-lg bg-destructive px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {busy ? 'Eliminando…' : 'Confirmar eliminación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
