ALTER TABLE "incidents"
  ADD COLUMN "validated_by_id" UUID,
  ADD COLUMN "closed_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "incidents_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "incidents_closure_pair_check" CHECK (("validated_by_id" IS NULL) = ("closed_at" IS NULL)),
  ADD CONSTRAINT "incidents_independent_closure_check" CHECK (
    "closed_at" IS NULL OR (
      "status" = 'CLOSED' AND "solution_submitted_by_id" IS NOT NULL
      AND "validated_by_id" <> "solution_submitted_by_id"
      AND "solution_submitted_at" IS NOT NULL
      AND "solution" IS NOT NULL AND btrim("solution") <> ''
    )
  );
