# PostgreSQL local para I00.3

Esta guía reproduce la configuración local de PostgreSQL de I00.3. El incremento prepara dos bases aisladas; todavía no crea modelos, tablas ni migraciones de negocio.

## Requisitos

- Docker Engine con Docker Compose v2 disponible.
- Las versiones de Node.js y pnpm fijadas en [`mise.toml`](../../mise.toml): Node.js `24.22.0` y pnpm `10.34.7`.

Desde la raíz del repositorio, comprueba que mise está activo y selecciona esas versiones:

```sh
mise install
mise exec -- node --version
mise exec -- pnpm --version
```

## Preparar credenciales locales

`.env.local` contiene credenciales locales para el servicio de desarrollo y está excluido de Git. Créalo solo si aún no existe, para no sobrescribir una configuración previa:

```sh
test -f .env.local || cp .env.example .env.local
```

Edita `.env.local` con credenciales sintéticas. `DATABASE_URL` debe usar exactamente el usuario y la contraseña de `NEXTRIVA_DEV_USER` y `NEXTRIVA_DEV_PASSWORD`. Para el runner, las credenciales de `TEST_DATABASE_URL` son las que se usan al iniciar `postgres-test`; el runner las deriva de la URL. `NEXTRIVA_TEST_USER` y `NEXTRIVA_TEST_PASSWORD` solo son necesarias al iniciar ese servicio de Compose manualmente y, en ese caso, deben coincidir con la URL. Mantén cada URL en su destino local indicado en la tabla.

| Variable            | Destino local                  | Uso                             |
| ------------------- | ------------------------------ | ------------------------------- |
| `DATABASE_URL`      | `127.0.0.1:5432/nextriva_dev`  | Base de desarrollo              |
| `TEST_DATABASE_URL` | `127.0.0.1:5433/nextriva_test` | Base exclusiva para integración |

No compartas ni versionés `.env.local`. No uses una URL de cloud o de desarrollo como URL de pruebas. El runner de integración no carga `.env.local`: requiere únicamente que `TEST_DATABASE_URL` esté configurada explícitamente. Extrae de esa URL el usuario y contraseña para iniciar `postgres-test`; no requiere `NEXTRIVA_TEST_USER` ni `NEXTRIVA_TEST_PASSWORD` por separado. No exportes `DATABASE_URL` al ejecutar pruebas.

## Iniciar y detener desarrollo

Valida la configuración sin mostrar sus valores y levanta solo el servicio de desarrollo:

```sh
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local up -d --wait postgres-dev
docker compose --env-file .env.local ps postgres-dev
```

El servicio debe aparecer como `healthy`. Para detenerlo sin borrar datos:

```sh
docker compose --env-file .env.local stop postgres-dev
```

Compose conserva los datos en el volumen nombrado `nextriva_dev_data`. No uses `docker compose down -v` ni `prisma migrate reset`.

## Ejecutar integración con PostgreSQL real

El script `test:integration` rechaza `DATABASE_URL` y valida `TEST_DATABASE_URL` antes de iniciar Docker o conectarse. Usa [`compose.test.yaml`](../../compose.test.yaml), que solo define `postgres-test`; no lee `.env.local` ni puede iniciar `postgres-dev`. El servicio de prueba usa el usuario y la contraseña explícitos de `TEST_DATABASE_URL`.

El runner crea en `nextriva_test` una base por ejecución con nombre `nextriva_test_iNN_N_<32 caracteres hexadecimales>`, aplica las migraciones y pasa a Vitest únicamente esa URL temporal. Los subprocesos reciben una lista de variables permitidas; Prisma no carga `.env.local` en la configuración de prueba. Al terminar, el runner elimina solo la base temporal que creó y detiene `postgres-test` únicamente si él lo inició. No elimina el volumen persistente `nextriva_test_data`.

```sh
mise exec -- pnpm --filter @nextriva/api test:integration
```

Antes de ejecutar el comando, configura `TEST_DATABASE_URL` en la sesión de terminal con el destino `127.0.0.1:5433/nextriva_test` y credenciales locales sintéticas. Si partes del `.env.local` del repositorio, puedes cargarlo sin mostrar valores y retirar la URL de desarrollo:

```sh
set -a
source .env.local
set +a
unset DATABASE_URL
```

Después ejecuta `mise exec -- pnpm --filter @nextriva/api test:integration`. El runner valida el destino, rechaza `DATABASE_URL` si sigue presente, y pasa a sus subprocesos un entorno allowlist. Si el servicio de pruebas ya estaba activo, el script lo deja activo. Las pruebas de integración y E2E usan PostgreSQL real temporal; no uses una URL de desarrollo o cloud.

## Comprobaciones del monorepo

Después de preparar `.env.local`, genera Prisma Client antes del typecheck. El cliente es un artefacto local excluido de Git; este comando valida la URL de desarrollo, pero no necesita conectarse a PostgreSQL:

```sh
mise exec -- pnpm --filter @nextriva/api db:generate
```

Después, desde la raíz:

```sh
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```

Los comandos anteriores verifican el esqueleto existente. I00.3 no incorpora funcionalidad de negocio ni cambia el contrato HTTP.
