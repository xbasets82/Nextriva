import {
  PromotionAction,
  iconButtonClassName,
} from '../promotions/PromotionControls.js';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '../api/users.js';
import {
  reviewIncidentSolution,
  reviewError,
  type Incident,
  type IncidentDetail,
} from '../api/incidents.js';

export function IncidentReview({
  incident,
  role,
  userId,
  onUpdated,
}: {
  incident: IncidentDetail;
  role: Role | undefined;
  userId: string | undefined;
  onUpdated: (incident: Incident) => void;
}) {
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const canReview =
    incident.status === 'PENDING_VALIDATION' &&
    incident.promotionStatus === 'ACTIVE' &&
    (role === 'ADMIN' || role === 'MANAGER') &&
    Boolean(userId) &&
    userId !== incident.solutionSubmittedById;
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (rejecting) field.current?.focus();
  }, [rejecting]);
  function closeConfirmation() {
    if (busy) return;
    setConfirming(false);
    approve.current?.focus();
  }
  function closeRejection() {
    if (busy) return;
    setRejecting(false);
    setInvalid(false);
    setMessage('');
    reject.current?.focus();
  }
  async function review(action: 'approve' | 'reject') {
    if (busy) return;
    if (
      action === 'reject' &&
      (Array.from(reason.trim()).length < 5 ||
        Array.from(reason.trim()).length > 2000)
    ) {
      setInvalid(true);
      setFailed(true);
      setMessage('El motivo debe contener entre 5 y 2.000 caracteres.');
      field.current?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    setMessage('');
    try {
      const updated = await reviewIncidentSolution(incident.id, action, {
        version: incident.version,
        ...(action === 'reject' ? { reason: reason.trim() } : {}),
      });
      setConfirming(false);
      setRejecting(false);
      onUpdated(updated);
      setMessage(
        action === 'approve'
          ? 'Solución aprobada. Incidencia cerrada.'
          : 'Solución rechazada. La incidencia vuelve a En curso.',
      );
    } catch (error) {
      setFailed(true);
      setMessage(reviewError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Validación de solución"
      className="space-y-3 empty:hidden"
    >
      {canReview && (
        <>
          <p>
            La validación debe realizarla una persona distinta del presentador.
          </p>
          <div className="flex flex-wrap gap-2">
            <PromotionAction
              buttonRef={approve}
              icon="approve"
              label="Aprobar solución"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className={`${iconButtonClassName} bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}
            />
            <PromotionAction
              buttonRef={reject}
              icon="reject"
              label="Rechazar solución"
              disabled={busy}
              onClick={() => {
                setInvalid(false);
                setMessage('');
                setRejecting(true);
              }}
              className={`${iconButtonClassName} text-destructive hover:text-destructive`}
            />
          </div>
          {rejecting && (
            <form
              aria-label="Rechazar solución"
              aria-busy={busy}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void review('reject');
              }}
              className="grid gap-2"
            >
              <label htmlFor="incident-rejection-reason">
                Motivo del rechazo
              </label>
              <textarea
                ref={field}
                id="incident-rejection-reason"
                value={reason}
                disabled={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={
                  invalid
                    ? 'incident-rejection-help incident-review-message'
                    : 'incident-rejection-help'
                }
                className="min-h-24 w-full rounded-md border bg-background p-2"
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                  setInvalid(false);
                }}
              />
              <p id="incident-rejection-help">
                Entre 5 y 2.000 caracteres. El motivo quedará en el historial.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeRejection}
                  className="rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Cancelar rechazo
                </button>
                <PromotionAction
                  type="submit"
                  icon="reject"
                  disabled={busy}
                  label={busy ? 'Validando…' : 'Confirmar rechazo'}
                  className={`${iconButtonClassName} text-destructive hover:text-destructive`}
                />
              </div>
            </form>
          )}
        </>
      )}
      {message && !confirming && (
        <p id="incident-review-message" role={failed ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incident-approve-title"
            aria-describedby="incident-approve-description"
            aria-busy={busy}
            className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-4"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeConfirmation();
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                (document.activeElement === cancel.current
                  ? confirm.current
                  : cancel.current
                )?.focus();
              }
            }}
          >
            <h3 id="incident-approve-title">Aprobar y cerrar incidencia</h3>
            <p id="incident-approve-description">
              La incidencia quedará cerrada. Una reapertura posterior requerirá
              autorización y conservará este cierre en el historial.
            </p>
            {failed && message && <p role="alert">{message}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                ref={cancel}
                type="button"
                disabled={busy}
                onClick={closeConfirmation}
              >
                Cancelar
              </button>
              <button
                ref={confirm}
                type="button"
                disabled={busy}
                onClick={() => void review('approve')}
              >
                Confirmar aprobación
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
