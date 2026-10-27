#!/bin/sh
set -eu

# Solo se ejecuta en un volumen vacío por el entrypoint oficial de PostgreSQL.
IFS= read -r NEXTRIVA_RUNTIME_PASSWORD < /run/secrets/runtime_password || test -n "$NEXTRIVA_RUNTIME_PASSWORD"
IFS= read -r NEXTRIVA_MIGRATION_PASSWORD < /run/secrets/migration_password || test -n "$NEXTRIVA_MIGRATION_PASSWORD"
test -n "$NEXTRIVA_RUNTIME_PASSWORD"
test -n "$NEXTRIVA_MIGRATION_PASSWORD"
export NEXTRIVA_RUNTIME_PASSWORD NEXTRIVA_MIGRATION_PASSWORD
case "$POSTGRES_DB" in
  nextriva_production|nextriva_demo) ;;
  *) exit 1 ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv runtime_password NEXTRIVA_RUNTIME_PASSWORD
\getenv migration_password NEXTRIVA_MIGRATION_PASSWORD
\getenv database_name POSTGRES_DB
CREATE ROLE nextriva_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
CREATE ROLE nextriva_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'runtime_password';
ALTER DATABASE :"database_name" OWNER TO nextriva_migrator;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO nextriva_app;
ALTER SCHEMA public OWNER TO nextriva_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nextriva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nextriva_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nextriva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nextriva_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nextriva_app;
SQL

unset NEXTRIVA_RUNTIME_PASSWORD NEXTRIVA_MIGRATION_PASSWORD
