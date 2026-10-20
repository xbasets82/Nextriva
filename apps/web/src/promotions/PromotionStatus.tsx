import { useEffect, useRef, useState } from 'react';
import {
  promotionError,
  setPromotionStatus,
  type Promotion,
} from '../api/promotions.js';

export function PromotionStatus({
  promotion,
  onSaved,
}: {
  promotion: Promotion;
  onSaved: (promotion: Promotion) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!confirming && restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [confirming]);
  const archiving = promotion.status === 'ACTIVE';
  const title = archiving ? 'Confirmar archivo' : 'Confirmar reactivación';
  function close() {
    restoreFocus.current = true;
    setConfirming(false);
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      onSaved(
        await setPromotionStatus(
          promotion.id,
          archiving ? 'ARCHIVED' : 'ACTIVE',
        ),
      );
      close();
    } catch (error) {
      setMessage(promotionError(error));
      close();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {message && <p role="alert">{message}</p>}
      <button
        ref={trigger}
        type="button"
        disabled={busy || confirming}
        onClick={() => {
          setMessage('');
          setConfirming(true);
        }}
        className="rounded-md border px-4 py-2"
      >
        {archiving ? 'Archivar promoción' : 'Reactivar promoción'}
      </button>
      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="promotion-status-title"
          aria-describedby="promotion-status-description"
          aria-busy={busy}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              close();
            }
          }}
          className="space-y-4 rounded-xl border bg-card p-4"
        >
          <h3 id="promotion-status-title" className="font-semibold">
            {title}
          </h3>
          <p id="promotion-status-description">
            {archiving
              ? 'La promoción quedará archivada y disponible para consulta. Se conservarán sus fases y registros.'
              : 'La promoción volverá a estar activa con sus fases conservadas.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={close}
              className="rounded-md border px-4 py-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              {busy ? 'Guardando…' : title}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
