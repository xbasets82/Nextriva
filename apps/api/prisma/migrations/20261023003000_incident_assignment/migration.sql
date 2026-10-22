-- Cambios aditivos; los eventos CREATED y las incidencias existentes se conservan.
ALTER TYPE "incident_event_type" ADD VALUE 'ASSIGNED';
ALTER TYPE "incident_event_type" ADD VALUE 'REASSIGNED';
ALTER TABLE "incidents" ADD COLUMN "assigned_to_id" UUID;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "incidents_assigned_to_id_status_idx" ON "incidents"("assigned_to_id", "status");
