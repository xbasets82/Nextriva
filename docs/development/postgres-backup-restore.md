# Copia PostgreSQL y prueba de restauración

I09.3 verifica una copia sintética mediante `pg_dump` y `pg_restore` en bases temporales. Como validación operativa separada de I10.3, el 28/10/2026 también se descargó y restauró una copia de `nextriva_demo` en una instancia PostgreSQL 18.6 desechable, aislada y sin volumen. No se usó ni modificó `nextriva_dev` ni producción.

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

El bloque se ejecuta en un subshell, por lo que su `trap EXIT` limpia el directorio temporal al terminar aunque se pegue en una terminal interactiva. El comando ejecuta `pg_dump` dentro del contenedor PostgreSQL 18.6; la contraseña se lee del entorno del contenedor y no se pasa como argumento. `mktemp` da un directorio temporal único por ejecución; el identificador también hace único el nombre final. `ln` publica el archivo completo atómicamente y falla si el destino ya existe, sin sobrescribir una copia anterior. No subas, adjuntes ni incluyas el dump en Git. Para la automatización de I10.3 se aprobó una retención de 3 copias diarias y 2 semanales. El destino externo, la implementación de esa retención, el cifrado local y la supervisión de espacio siguen pendientes; esta receta local no crea ni aplica esa política.

## Candidato local de automatización I10.3

`scripts/backup-demo-postgres.mjs` contiene el coordinador y adaptadores Docker/Proton Drive; `scripts/run-demo-backup.mjs` los compone. El 28/10/2026 se ejecutó correctamente la unidad `nextriva-demo-backup.service` en la VPS contra `nextriva_demo`: resultado systemd `success`, salida `Demo backup verified` y SHA-256 confirmado tras descarga. La credencial GPG está instalada como `LoadCredentialEncrypted` y se verificó sin revelar la frase. El servicio queda inactivo al terminar, como corresponde a `oneshot`. El timer está habilitado y activo; el próximo disparo observado es el 29/10/2026 a las 02:13:30 UTC.

El timer anterior, que ejecutaba un script como `root`, se deshabilitó tras guardar una copia privada recuperable en `/root/nextriva-backup-legacy-20261028`. El candidato lee las rutas configuradas para estado local y Proton, no recibe credenciales ni keygrip por argumentos y fija `prune: false`. La transferencia manual sintética de 33 bytes y la operación del dump real se validaron por SHA-256. Las pruebas automatizadas siguen usando dobles y no se conectan a PostgreSQL, Proton ni VPS.

La comprobación local, desde la raíz y con Node `24.22.0` definido en `mise.toml`, es:

```sh
mise exec -- node --test scripts/backup-demo-postgres.test.mjs
mise exec -- node --test scripts/backup-demo-postgres.test.mjs scripts/run-demo-backup.test.mjs
```

La suite combinada incluye el coordinador, el helper GPG y el entrypoint. La CLI rechaza configuración incompleta antes de iniciar adaptadores; las pruebas componen dobles y no demuestran una copia real. Los casos GPG comprueban rechazo de keygrip inválido, credenciales vacías o inseguras, sanitización de un ejecutable fallido y borrado del buffer; usan credenciales sintéticas y no desbloquean la clave real.

El coordinador recibe `dump`, `transport.upload`, `transport.download` y, únicamente si se solicita `prune: true`, `transport.trash`. `createProtonTransport({ executable, remoteDirectory })` construye el transporte sin iniciarlo: exige ejecutable absoluto terminado en `proton-drive`, carpeta remota absoluta normalizada con al menos dos segmentos y usuario efectivo `ubuntu` al operar. La carpeta debe ser exclusiva para estas copias y estar preparada mediante una operación autorizada. No se ejecuta Proton con `sudo`; los argumentos se pasan a `spawn` con `shell: false`. El proceso hijo usa una lista cerrada de variables e incluye `PROTON_DRIVE_CREDENTIALS_STORE=pass` para que systemd no recurra al almacén `keychain` por defecto.

La subida crea temporalmente un enlace privado con el nombre exacto de la copia y ejecuta `filesystem upload --file-conflict-strategy skip --folder-conflict-strategy skip <archivo> <carpeta-remota>`. La descarga usa `filesystem download` con las mismas opciones, el único archivo remoto y una carpeta temporal `0700`; exige recibir el nombre esperado como archivo regular, aplica `0600` y entrega sus bytes al control SHA-256 del coordinador. Un destino inesperado, descarga ausente o hash distinto detiene la ejecución. Los nombres contienen UUID aleatorio; un conflicto no autoriza sobrescribir un archivo remoto.

### Desbloqueo GPG de la tarea systemd

Proton usa el almacén `pass`. La unidad entrega la frase GPG mediante `LoadCredentialEncrypted=` al helper `scripts/proton-gpg-credentials.mjs unlock`; el helper pasa los bytes solo por stdin a `gpg-preset-passphrase --preset <keygrip>`, sin argumentos, entorno ni logs con la frase. Al finalizar, `forget` limpia solo ese keygrip y exige respuesta Assuan `OK`. GnuPG requiere `allow-preset-passphrase`; `max-cache-ttl` limita la caché ante una salida abrupta. La credencial systemd se descifra en tiempo de ejecución; root puede acceder a ella y la recuperación depende de la clave host de systemd. La VPS informó que `/var/lib/systemd/credential.secret` no está en almacenamiento cifrado: esto no protege ante una copia que incluya tanto ese archivo como la credencial ni ante root.

La compatibilidad observada en la VPS incluye `systemd 259.9-0ubuntu0.1`, GnuPG `2.4.8-4ubuntu3.1`, Docker y Node `24.22.0` instalado bajo `/home/ubuntu/.local/lib/node-v24.22.0-linux-x64` tras verificar el SHA-256 oficial. Se habilitó _linger_ para `ubuntu`, el socket `gpg-agent` y `allow-preset-passphrase` con `max-cache-ttl 1800`. `/etc/nextriva/backup.env` contiene el keygrip, sin la frase, y tiene modo `0600`. Las unidades se verificaron con `systemd-analyze verify` (código `0`; avisos XFS preexistentes). El archivo cifrado runtime está en `/etc/credstore.encrypted/nextriva-proton-gpg-passphrase`; systemd lo descifró y la unidad de backup lo utilizó correctamente.

La clave host de systemd se inicializó con `systemd-creds setup`; la herramienta advirtió que `/var/lib/systemd/credential.secret` no está en almacenamiento cifrado. La credencial cifrada de systemd protege frente a usuarios sin privilegios, pero no frente a root ni frente a una copia de disco que incluya tanto la credencial como esa clave host. Se verificó en `/run` un ciclo cifrado/descifrado con contenido sintético; el nombre de credencial debe coincidir también al descifrar. El intento inicial de smoke omitió `--name` al descifrar y falló; el comando corregido verificó el round-trip sin revelar el contenido.

Para provisionar la frase GPG en una sesión SSH interactiva, introducila solo en el prompt oculto del siguiente bloque. No la pegues en el comando, ni en el chat, ni en un archivo temporal:

```bash
set -euo pipefail
set +x
sudo -n install -d -o root -g root -m 0700 /etc/credstore.encrypted
IFS= read -r -s -p 'Frase de GPG (entrada oculta): ' gpg_passphrase
printf '\n'
trap 'unset gpg_passphrase' EXIT
printf '%s\n' "$gpg_passphrase" | sudo -n systemd-creds encrypt \
  --name=proton-gpg-passphrase --with-key=host - \
  /etc/credstore.encrypted/nextriva-proton-gpg-passphrase
unset gpg_passphrase
trap - EXIT
sudo -n chmod 0600 /etc/credstore.encrypted/nextriva-proton-gpg-passphrase
sudo -n chown root:root /etc/credstore.encrypted/nextriva-proton-gpg-passphrase
sudo -n systemd-creds decrypt --name=proton-gpg-passphrase \
  /etc/credstore.encrypted/nextriva-proton-gpg-passphrase - >/dev/null
```

Este bloque es solo para aprovisionar o reemplazar la credencial; no la repitas si ya está configurada. La verificación real del servicio y de una restauración temporal se completó el 28/10/2026. El timer fue activado con autorización expresa del usuario.

Con `prune: true`, solo se pasan los nombres exactos retirables del manifiesto a `filesystem trash <ruta-remota-exacta>`. **Mover a la papelera no libera cuota en Proton Drive**; por tanto, la política 3 diarias + 2 semanales solo limita las copias visibles en la carpeta, no el almacenamiento consumido. El adaptador no implementa `filesystem delete`, listados ni vaciado de papelera. Falta verificar cómo identificar inequívocamente cada archivo tras moverlo a la papelera y autorizar un flujo permanente seguro antes de poder prometer un límite efectivo de almacenamiento. Véase la [documentación de Proton sobre papelera y cuota](https://proton.me/support/proton-drive-delete-restore-synced-files).

| Regla implementada   | Comportamiento comprobado por suite local y validación operativa cuando se indica                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copia y verificación | Dump no vacío; subida; descarga a otro archivo privado; SHA-256 idéntico antes de registrar la copia o retirar una anterior.                                                                                                            |
| Retención aprobada   | El selector local identifica las últimas 3 posiciones diarias UTC y 2 semanales; una copia dominical puede cubrir ambas. El entrypoint remoto mantiene `prune: false`, por lo que no limita las copias almacenadas en Proton.           |
| Propiedad de copias  | Solo nombres exactos `nextriva_demo-<fecha UTC>-<32 hex>.dump` registrados en `manifest.json`, con fecha y SHA-256 válidos. No se lista ni se limpia una carpeta remota.                                                                |
| Estado local         | Directorio existente, canónico, privado `0700`, propiedad del usuario y fuera del repositorio; manifiesto `0600`; archivos de trabajo `0600` en directorio temporal `0700`. Se rechazan enlaces simbólicos del estado y del manifiesto. |
| Exclusión y fallos   | Bloqueo por directorio; cualquier fallo de dump, subida, descarga o hash impide la retirada. Errores externos no se imprimen. La retirada está desactivada por defecto y devuelve candidatos pendientes.                                |

`createDockerDump()` selecciona exactamente un contenedor en ejecución mediante las etiquetas Compose de proyecto `nextriva-demo`, servicio `postgres` y `oneoff=False`; `compose.demo.yaml` no fija `container_name`. Utiliza `/usr/bin/sudo -n /usr/bin/docker` con argumentos separados y salida del dump a un descriptor privado. Dentro del contenedor verifica `POSTGRES_DB=nextriva_demo` y `POSTGRES_USER=postgres`, lee `POSTGRES_PASSWORD_FILE` sin imprimirlo y usa `pg_dump` del propio contenedor. El adaptador exige Linux con esas rutas y permisos ya autorizados; las pruebas simulan Docker y no acreditan acceso al daemon ni sudo operativo.

Después de verificar la copia, el manifiesto se sustituye atómicamente. Cada retirada selectiva confirmada se registra antes de intentar la siguiente; si falla una retirada, se detiene. Una caída entre la retirada remota y la actualización local puede exigir reconciliar esa entrada exacta. Una subida cuya verificación falle puede dejar un archivo remoto sin registrar: no se elimina automáticamente. SIGKILL o pérdida de energía pueden dejar el bloqueo y temporales privados; revisarlos manualmente antes de retirar únicamente los recursos de esa ejecución. No hay garantía de recuperación ante fallo de disco ni verificación de restauración real en esta suite.

La copia real de `nextriva_demo` y su restauración desechable quedaron verificadas. El timer diario está habilitado y activo con retraso aleatorio máximo de 15 minutos; systemd lo activó con una primera ejecución inmediata satisfactoria por `Persistent=true`. El candidato no cifra el dump local: los permisos restringen acceso, pero no sustituyen cifrado en reposo. El manifiesto conserva el estado local y la descarga verificada, pero `prune: false` evita eliminar copias remotas. Además, moverlas a Trash no libera cuota; la política 3 diarias + 2 semanales todavía no impone un máximo de almacenamiento real en Proton. La Issue [#141](https://github.com/xbasets82/Nextriva/issues/141) registra implementar una retención remota segura. No se realizó despliegue nuevo de la aplicación.

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
ready=false
for attempt in {1..120}; do
  if docker exec "$container_name" sh -ec 'IFS= read -r PGPASSWORD < "$POSTGRES_PASSWORD_FILE"; export PGPASSWORD; exec psql -X -w -At -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
docker exec -i "$container_name" sh -c 'pg_restore --no-password --exit-on-error --single-transaction --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "$archive_path"
table_count="$(docker exec "$container_name" psql -X --no-password -U nextriva_candidate -d nextriva_candidate -Atc 'SELECT count(*) FROM information_schema.tables WHERE table_schema = $q$public$q$ AND table_type = $q$BASE TABLE$q$')"
test "$table_count" -gt 0
printf 'Restore smoke check passed; public tables: %s\n' "$table_count"
BASH
```

La restauración no publica puertos y no se conecta a un servidor existente. La espera exige `SELECT 1` por TCP en `127.0.0.1`, autenticándose con el archivo de contraseña ya montado: el servidor temporal de inicialización de la imagen oficial no escucha por TCP, por lo que solo se acepta el servidor definitivo. El `trap` elimina únicamente este contenedor y el archivo temporal de contraseña, incluso ante error, SIGINT o SIGTERM. Un cierre forzado del sistema (SIGKILL o pérdida de energía) puede dejar un contenedor desechable; identifica el nombre aleatorio `nextriva-restore-*` con Docker y elimina solo el contenedor de esta ejecución. No se borra el dump original. El smoke check confirma que el esquema público restaurado contiene tablas; no ejecuta la aplicación ni migraciones posteriores.

## Candidato y recuperación

La suite automatizada usa una copia **sintética** en PostgreSQL temporal. Además, la validación operativa de I10.3 descargó desde Proton la última copia cuyo SHA-256 coincidía con el manifiesto y la restauró en `postgres:18.6-bookworm`, con `--network none`, sin volumen ni puertos publicados. La instancia restaurada y la base `nextriva_demo` tenían 9 tablas públicas, 45 filas totales y 14 claves foráneas validadas; los conjuntos de tablas y los conteos por tabla coincidieron. Se comprobó `SELECT 1` antes de restaurar y se retiraron el contenedor y los temporales exactos al finalizar. No se ejecutó la aplicación candidata ni `prisma migrate status` contra la copia. No se hizo backup ni restore de `nextriva_dev` o producción. No dirijas `pg_restore` a una base existente de desarrollo, demo o producción.

Las herramientas de dump y restore deben tener la misma versión mayor que el servidor usado por este proyecto: PostgreSQL `18.6`. El formato custom requiere `pg_restore`; `--single-transaction` evita aplicar una restauración parcial y no se combina con restauración paralela. La restauración de un archivo no confiable puede ejecutar código SQL procedente del propio archivo; solo se deben restaurar archivos de origen confiable.

No se añadió rollback destructivo de migraciones. I09.3 no cambia esquema ni aplicación; la reversión compatible de aplicación consiste en volver al artefacto anterior sin eliminar ni revertir datos. Cambios futuros de esquema requieren evaluación explícita de compatibilidad y una estrategia de recuperación propia.

## Referencias oficiales

- [PostgreSQL 18 `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL 18 `pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html)
- [Docker Official Image for PostgreSQL](https://hub.docker.com/_/postgres)
