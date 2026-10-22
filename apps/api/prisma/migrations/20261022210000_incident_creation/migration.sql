CREATE TYPE "incident_category" AS ENUM ('STRUCTURE','ENVELOPE','INSTALLATIONS','FINISHES','CARPENTRY','COMMON_AREAS','CLEANING','SAFETY','OTHER');
CREATE TYPE "incident_priority" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE "incident_status" AS ENUM ('OPEN','IN_PROGRESS','PENDING_VALIDATION','CLOSED');
CREATE TYPE "incident_event_type" AS ENUM ('CREATED');
CREATE SEQUENCE incident_public_code_seq;
CREATE FUNCTION next_incident_public_code() RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT 'INC-' || CASE WHEN length(n::text) < 6 THEN lpad(n::text, 6, '0') ELSE n::text END FROM (SELECT nextval('incident_public_code_seq') AS n) value $$;
CREATE TABLE incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 public_code text NOT NULL DEFAULT next_incident_public_code(),
 promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 origin_phase promotion_phase NOT NULL,
 title varchar(150) NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 150),
 description varchar(5000) NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 5000),
 category incident_category NOT NULL,
 priority incident_priority NOT NULL,
 status incident_status NOT NULL DEFAULT 'OPEN',
 created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz(6) NOT NULL DEFAULT now(),
 updated_at timestamptz(6) NOT NULL DEFAULT now(),
 CONSTRAINT incidents_public_code_key UNIQUE(public_code)
);
CREATE INDEX incidents_promotion_id_status_created_at_idx ON incidents(promotion_id,status,created_at);
CREATE TABLE incident_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 event_type incident_event_type NOT NULL,
 changes jsonb,
 created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX incident_activities_incident_id_created_at_idx ON incident_activities(incident_id,created_at);
