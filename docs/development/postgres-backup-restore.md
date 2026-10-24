# Copia PostgreSQL y prueba de restauración

I09.3 verifica una copia sintética mediante `pg_dump` y `pg_restore` en bases temporales. El ejercicio no respalda datos reales ni demuestra recuperación de `nextriva_dev`, demo o producción.

## Verificación reproducible

Desde la raíz, con la configuración de test segura ya disponible:

```sh
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:backup-restore
```

El runner valida `.env.test.local` o `TEST_DATABASE_URL`, inicia el servicio PostgreSQL de test si hace falta y crea tres bases únicas `nextriva_test_i09_3_<32 hex>`: origen migrado, destino de restauración y destino para comprobar rollback de una restauración inválida. Genera datos sintéticos en el origen, crea un archivo custom fuera del repositorio con permisos restrictivos, lo restaura con transacción única y compara las ocho tablas de negocio, migraciones, claves foráneas, extensiones, secuencia e invariantes relacionales. Después elimina exclusivamente esas tres bases. No lee `.env.local` ni utiliza `nextriva_dev`.

La prueba también verifica que un archivo inválido no deja objetos parciales en su base destino. Los mensajes del runner no imprimen URLs, contraseñas ni contenido del archivo.

## Crear una copia local de desarrollo

Este procedimiento es manual y no forma parte de pruebas automatizadas. Requiere que `postgres-dev` ya esté iniciado y que `.env.local` sea la configuración local vigente. El archivo resultante puede contener datos personales o credenciales de prueba: consérvalo fuera del repositorio y con permisos privados.

Desde la raíz del repositorio en macOS:

```sh
(
set -euo pipefail
umask 077
backup_directory="$HOME/NextrivaBackups"
mkdir -p "$backup_directory"
chmod 700 "$backup_directory"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_directory="$(mktemp -d "$backup_directory/.nextriva_dev-$timestamp.XXXXXX")"
temporary_id="${temporary_directory##*.}"
partial_path="$temporary_directory/archive.partial"
backup_path="$backup_directory/nextriva_dev-$timestamp-$temporary_id.dump"
trap 'rm -rf "$temporary_directory"' EXIT
docker compose --env-file .env.local exec -T postgres-dev sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --no-password --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$partial_path"
test -s "$partial_path"
chmod 600 "$partial_path"
ln "$partial_path" "$backup_path"
printf 'Copia creada fuera del repositorio: %s\n' "$backup_path"
)
```

El bloque se ejecuta en un subshell, por lo que su `trap EXIT` limpia el directorio temporal al terminar aunque se pegue en una terminal interactiva. El comando ejecuta `pg_dump` dentro del contenedor PostgreSQL 18.6; la contraseña se lee del entorno del contenedor y no se pasa como argumento. `mktemp` da un directorio temporal único por ejecución; el identificador también hace único el nombre final. `ln` publica el archivo completo atómicamente y falla si el destino ya existe, sin sobrescribir una copia anterior. No subas, adjuntes ni incluyas el dump en Git. Conservación, cifrado en reposo y ubicación de copias externas quedan pendientes de una decisión operativa; esta guía no crea una política de backup.

## Restaurar un dump local en un candidato desechable

El siguiente procedimiento restaura un dump sintético en un PostgreSQL nuevo, aislado de la red y sin volumen persistente. No recibe credenciales como argumento ni publica un puerto. Desde la raíz, sustituye `/ruta/privada/nextriva_dev-AAAAMMDDTHHMMSSZ.dump` por la ruta local del archivo:

```sh
bash -s -- /ruta/privada/nextriva_dev-AAAAMMDDTHHMMSSZ.dump <<'BASH'
set -euo pipefail
archive_path="$1"
test -f "$archive_path"
restore_root="$(mktemp -d "${TMPDIR:-/tmp}/nextriva-restore.XXXXXX")"
chmod 700 "$restore_root"
password_file="$restore_root/postgres-password"
openssl rand -hex 32 > "$password_file"
chmod 600 "$password_file"
container_name="nextriva-restore-$(openssl rand -hex 16)"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -f "$password_file"
  rmdir "$restore_root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --detach --rm --name "$container_name" --network none \
  --env POSTGRES_DB=nextriva_candidate \
  --env POSTGRES_USER=nextriva_candidate \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
  --mount "type=bind,src=$password_file,dst=/run/secrets/postgres-password,readonly" \
  postgres:18.6-bookworm
for attempt in {1..60}; do
  if docker exec "$container_name" pg_isready -U nextriva_candidate -d nextriva_candidate >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container_name" pg_isready -U nextriva_candidate -d nextriva_candidate >/dev/null
docker exec -i "$container_name" sh -c 'pg_restore --no-password --exit-on-error --single-transaction --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "$archive_path"
table_count="$(docker exec "$container_name" psql -X --no-password -U nextriva_candidate -d nextriva_candidate -Atc 'SELECT count(*) FROM information_schema.tables WHERE table_schema = $q$public$q$ AND table_type = $q$BASE TABLE$q$')"
test "$table_count" -gt 0
printf 'Restore smoke check passed; public tables: %s\n' "$table_count"
BASH
```

La restauración usa confianza local del socket dentro del contenedor oficial; el contenedor no publica puertos y no se conecta a un servidor existente. El `trap` elimina únicamente este contenedor y el archivo temporal de contraseña, incluso ante error, SIGINT o SIGTERM. Un cierre forzado del sistema (SIGKILL o pérdida de energía) puede dejar un contenedor desechable; identifica el nombre aleatorio `nextriva-restore-*` con Docker y elimina solo el contenedor de esta ejecución. No se borra el dump original. El smoke check confirma que el esquema público restaurado contiene tablas; no ejecuta la aplicación, migraciones posteriores ni pruebas funcionales sobre datos reales.

## Candidato y recuperación

La restauración comprobada por el comando automatizado usa una copia **sintética** en el PostgreSQL temporal de test. La receta manual restaura una copia local en un contenedor nuevo y desechable. Este incremento no ejecuta la aplicación candidata ni `prisma migrate status` contra una copia real; no se hizo backup ni restore de `nextriva_dev`. No dirijas `pg_restore` a una base existente de desarrollo, demo o producción.

Las herramientas de dump y restore deben tener la misma versión mayor que el servidor usado por este proyecto: PostgreSQL `18.6`. El formato custom requiere `pg_restore`; `--single-transaction` evita aplicar una restauración parcial y no se combina con restauración paralela. La restauración de un archivo no confiable puede ejecutar código SQL procedente del propio archivo; solo se deben restaurar archivos de origen confiable.

No se añadió rollback destructivo de migraciones. I09.3 no cambia esquema ni aplicación; la reversión compatible de aplicación consiste en volver al artefacto anterior sin eliminar ni revertir datos. Cambios futuros de esquema requieren evaluación explícita de compatibilidad y una estrategia de recuperación propia.

## Referencias oficiales

- [PostgreSQL 18 `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL 18 `pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html)
- [Docker Official Image for PostgreSQL](https://hub.docker.com/_/postgres)
