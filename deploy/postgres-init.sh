#!/bin/sh
set -eu

# Solo se ejecuta en un volumen vacío por el entrypoint oficial de PostgreSQL.
IFS= read -r NEXTRIVA_RUNTIME_PASSWORD < /run/secrets/runtime_password || test -n "$NEXTRIVA_RUNTIME_PASSWORD"
IFS= read -r NEXTRIVA_MIGRATION_PASSWORD < /run/secrets/migration_password || test -n "$NEXTRIVA_MIGRATION_PASSWORD"
test -n "$NEXTRIVA_RUNTIME_PASSWORD"
test -n "$NEXTRIVA_MIGRATION_PASSWORD"
export NEXTRIVA_RUNTIME_PASSWORD NEXTRIVA_MIGRATION_PASSWORD

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv runtime_password NEXTRIVA_RUNTIME_PASSWORD
\getenv migration_password NEXTRIVA_MIGRATION_PASSWORD
CREATE ROLE nextriva_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
CREATE ROLE nextriva_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'runtime_password';
ALTER DATABASE nextriva_production OWNER TO nextriva_migrator;
REVOKE ALL ON DATABASE nextriva_production FROM PUBLIC;
GRANT CONNECT ON DATABASE nextriva_production TO nextriva_app;
ALTER SCHEMA public OWNER TO nextriva_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nextriva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nextriva_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nextriva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nextriva_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nextriva_app;
SQL

unset NEXTRIVA_RUNTIME_PASSWORD NEXTRIVA_MIGRATION_PASSWORD
