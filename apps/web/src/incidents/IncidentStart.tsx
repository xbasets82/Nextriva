import {
  PromotionAction,
  iconButtonClassName,
} from '../promotions/PromotionControls.js';
import { useEffect, useRef, useState } from 'react';
import {
  startIncident,
  type Incident,
  type IncidentDetail,
} from '../api/incidents.js';
import { ApiError } from '../api/transport.js';
import type { Role } from '../api/users.js';

function startError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return 'No tienes permiso para iniciar la incidencia.';
    if (error.status === 404) return 'La incidencia ya no está disponible.';
    if (error.status === 409)
      return 'La incidencia cambió o no puede iniciarse. Recárgala antes de continuar.';
  }
  return 'No se pudo iniciar la incidencia. Inténtalo de nuevo.';
}

export function IncidentStart({
  incident,
  role,
  userId,
  onStarted,
}: {
  incident: IncidentDetail;
  role: Role | undefined;
  userId: string | undefined;
  onStarted: (updated: Incident) => void;
}) {
  const allowed =
    incident.status === 'OPEN' &&
    incident.assignedToId !== null &&
    (role === 'ADMIN' ||
      role === 'MANAGER' ||
      userId === incident.assignedToId);
  const sending = useRef(false);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (!allowed) return null;
  async function start() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await startIncident(incident.id, incident.version);
      if (!active.current) return;
      onStarted(updated);
    } catch (failure) {
      if (active.current) setError(startError(failure));
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Estado de incidencia" className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold">Estado</h3>
      <PromotionAction
        icon="start"
        label={busy ? 'Iniciando resolución…' : 'Iniciar resolución'}
        disabled={busy}
        onClick={() => void start()}
        className={`${iconButtonClassName} bg-background text-foreground hover:bg-muted`}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
