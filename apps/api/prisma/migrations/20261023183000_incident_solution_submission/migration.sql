ALTER TYPE "incident_event_type" ADD VALUE 'SOLUTION_SUBMITTED';

ALTER TABLE "incidents"
  ADD COLUMN "solution" VARCHAR(5000),
  ADD COLUMN "solution_submitted_by_id" UUID,
  ADD COLUMN "solution_submitted_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "incidents_solution_submission_fields_check"
    CHECK (("solution_submitted_by_id" IS NULL) = ("solution_submitted_at" IS NULL)),
  ADD CONSTRAINT "incidents_submitted_solution_content_check"
    CHECK ("solution_submitted_at" IS NULL OR ("solution" IS NOT NULL AND btrim("solution") <> ''));

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_solution_submitted_by_id_fkey"
  FOREIGN KEY ("solution_submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
