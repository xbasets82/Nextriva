CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'COLLABORATOR');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email"),
    CONSTRAINT "users_first_name_length" CHECK (char_length("first_name") BETWEEN 2 AND 100),
    CONSTRAINT "users_last_name_length" CHECK (char_length("last_name") BETWEEN 2 AND 150),
    CONSTRAINT "users_email_normalized" CHECK ("email" = lower("email") AND "email" = btrim("email"))
);
