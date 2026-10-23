-- El evento conserva estado anterior y nuevo en changes; sin alterar filas existentes.
ALTER TYPE "incident_event_type" ADD VALUE 'STATUS_CHANGED';
