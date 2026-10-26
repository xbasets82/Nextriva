-- Eliminación lógica aditiva: no modifica datos históricos ni elimina relaciones.
ALTER TYPE "incident_event_type" ADD VALUE 'DELETED';
ALTER TABLE "incidents"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_by_id" UUID,
  ADD COLUMN "deletion_reason" VARCHAR(2000),
  ADD CONSTRAINT "incidents_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "incidents_deletion_complete" CHECK (
    (deleted_at IS NULL AND deleted_by_id IS NULL AND deletion_reason IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL AND deletion_reason IS NOT NULL
      AND char_length(deletion_reason) BETWEEN 5 AND 2000
      AND deletion_reason = btrim(deletion_reason))
  );
CREATE INDEX "incidents_deleted_at_created_at_id_idx" ON "incidents"("deleted_at", "created_at", "id");
