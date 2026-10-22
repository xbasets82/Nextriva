CREATE TABLE "incident_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incident_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_comments_body_check" CHECK (length(btrim("body")) BETWEEN 1 AND 2000),
  CONSTRAINT "incident_comments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "incident_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "incident_comments_incident_id_created_at_id_idx" ON "incident_comments"("incident_id", "created_at", "id");
