CREATE TYPE "promotion_status" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "promotion_phase" AS ENUM (
    'PLANNING',
    'COMMERCIALIZATION',
    'EXECUTIVE_PROJECT',
    'CONSTRUCTION',
    'PRE_HANDOVER',
    'HANDOVER',
    'AFTER_SALES'
);

CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(1000),
    "location" VARCHAR(200),
    "status" "promotion_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotions_name_length" CHECK (char_length(btrim("name")) BETWEEN 3 AND 150),
    CONSTRAINT "promotions_description_length" CHECK ("description" IS NULL OR char_length("description") <= 1000),
    CONSTRAINT "promotions_location_length" CHECK ("location" IS NULL OR char_length("location") <= 200)
);

CREATE TABLE "promotion_phases" (
    "promotion_id" UUID NOT NULL,
    "phase" "promotion_phase" NOT NULL,

    CONSTRAINT "promotion_phases_pkey" PRIMARY KEY ("promotion_id", "phase"),
    CONSTRAINT "promotion_phases_promotion_id_fkey" FOREIGN KEY ("promotion_id")
        REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION "enforce_active_promotion_phase"() RETURNS TRIGGER AS $$
DECLARE
    target_ids UUID[];
    target_promotion_id UUID;
    promotion_is_active BOOLEAN;
    has_phase BOOLEAN;
BEGIN
    IF TG_TABLE_NAME = 'promotions' THEN
        IF TG_OP = 'DELETE' THEN
            target_ids := ARRAY[OLD."id"];
        ELSIF TG_OP = 'UPDATE' THEN
            target_ids := ARRAY[OLD."id", NEW."id"];
        ELSE
            target_ids := ARRAY[NEW."id"];
        END IF;
    ELSE
        IF TG_OP = 'DELETE' THEN
            target_ids := ARRAY[OLD."promotion_id"];
        ELSIF TG_OP = 'UPDATE' THEN
            target_ids := ARRAY[OLD."promotion_id", NEW."promotion_id"];
        ELSE
            target_ids := ARRAY[NEW."promotion_id"];
        END IF;
    END IF;

    FOREACH target_promotion_id IN ARRAY target_ids LOOP
        SELECT "status" = 'ACTIVE' INTO promotion_is_active
        FROM "promotions"
        WHERE "id" = target_promotion_id;

        IF promotion_is_active IS TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM "promotion_phases"
                WHERE "promotion_id" = target_promotion_id
            ) INTO has_phase;

            IF has_phase IS NOT TRUE THEN
                RAISE EXCEPTION 'Active promotions require at least one phase'
                    USING ERRCODE = '23514', CONSTRAINT = 'promotions_active_phase_required';
            END IF;
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "promotions_active_phase_required"
AFTER INSERT OR UPDATE OR DELETE ON "promotions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_active_promotion_phase"();

CREATE CONSTRAINT TRIGGER "promotion_phases_active_phase_required"
AFTER INSERT OR UPDATE OR DELETE ON "promotion_phases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_active_promotion_phase"();
