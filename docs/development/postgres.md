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

Edita `.env.local` con credenciales sintéticas exclusivamente para desarrollo. `DATABASE_URL` debe usar exactamente el usuario y la contraseña de `NEXTRIVA_DEV_USER` y `NEXTRIVA_DEV_PASSWORD`. La configuración de pruebas se mantiene separada en `.env.test.local`, como se explica más abajo.

| Variable            | Destino local                  | Uso                             |
| ------------------- | ------------------------------ | ------------------------------- |
| `DATABASE_URL`      | `127.0.0.1:5432/nextriva_dev`  | Base de desarrollo              |
| `TEST_DATABASE_URL` | `127.0.0.1:5433/nextriva_test` | Base exclusiva para integración |

No compartas ni versiones ninguno de esos archivos. No uses una URL de cloud o de desarrollo como URL de pruebas. El runner nunca carga `.env.local` y rechaza `DATABASE_URL` heredada. Extrae de `TEST_DATABASE_URL` el usuario y contraseña para iniciar `postgres-test`; no requiere `NEXTRIVA_TEST_USER` ni `NEXTRIVA_TEST_PASSWORD` por separado.

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

## Configuración persistente de pruebas para Codex Desktop

El runner acepta `TEST_DATABASE_URL` explícita (por ejemplo, en CI). Si no está definida, lee únicamente `.env.test.local` en la raíz del repositorio, independientemente del directorio actual de la terminal. Así Codex Desktop puede ejecutar las pruebas sin heredar variables de otra terminal.

Si el archivo todavía no existe, créalo vacío sin sobrescribir archivos previos:

```sh
mise exec -- node --input-type=module -e 'import { closeSync, openSync } from "node:fs"; closeSync(openSync(".env.test.local", "wx", 0o600));'
chmod 600 .env.test.local
open -e .env.test.local
```

Ejecuta estos comandos desde la raíz del repositorio. Si el archivo ya existe, omite el comando de creación y edítalo localmente. Introduce en el editor una sola asignación `TEST_DATABASE_URL=` seguida de la URL PostgreSQL de pruebas, sin comillas ni `export`. Usa las credenciales del servicio de pruebas existente en `127.0.0.1:5433` y el nombre exacto `nextriva_test`; no cambies credenciales de un volumen ya inicializado. Consúltalas únicamente en tu gestor local seguro. Los caracteres reservados del usuario y contraseña deben estar codificados para URL. No pegues el valor en comandos, el chat ni capturas. Si no tienes acceso a esas credenciales, detente y solicita un procedimiento de recuperación; no borres ni reinicialices el volumen.

El archivo debe ser regular, pertenecer al usuario actual y tener permisos `0600`; se rechazan enlaces simbólicos, claves adicionales y asignaciones duplicadas. No se ejecuta código ni se expanden variables del archivo. `.gitignore` ya lo excluye mediante `.env.*`.

Comprueba exclusión y disponibilidad sin mostrar valores, iniciar Docker ni conectarte a PostgreSQL:

```sh
git check-ignore .env.test.local
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- node scripts/test-integration.mjs --check-config
```

La segunda comprobación debe terminar con código `0` y mostrar `TEST_DATABASE_URL available and validated (source: file)`. Confirma presencia, formato y destino permitido; todavía no demuestra que las credenciales funcionen. Un error debe corregirse antes de ejecutar integración. Una variable explícita inválida falla sin recurrir al archivo.

## Ejecutar integración y E2E con PostgreSQL real

El script `test:integration` rechaza `DATABASE_URL` y valida `TEST_DATABASE_URL` antes de iniciar Docker o conectarse. Usa [`compose.test.yaml`](../../compose.test.yaml), que solo define `postgres-test`; no lee `.env.local` ni puede iniciar `postgres-dev`. El servicio de prueba usa el usuario y la contraseña explícitos de `TEST_DATABASE_URL`.

El runner crea en `nextriva_test` una base por ejecución con nombre `nextriva_test_iNN_N_<32 caracteres hexadecimales>`, aplica las migraciones y pasa a Vitest únicamente esa URL temporal. Los subprocesos reciben una lista de variables permitidas; Prisma no carga `.env.local` en la configuración de prueba. Al terminar, el runner elimina solo la base temporal que creó y detiene `postgres-test` únicamente si él lo inició. No elimina el volumen persistente `nextriva_test_data`.

```sh
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:e2e
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:coverage
```

Estos comandos seleccionan el archivo local y evitan heredar ambas variables de otra sesión. No uses `source .env.local` ni `node --env-file=.env.local` para ejecutar pruebas. El runner conserva la validación de host local, puerto `5433`, nombre exacto `nextriva_test`, credenciales presentes y ausencia de query/hash; `nextriva_dev` se rechaza antes de Docker o cualquier conexión. Pasa a sus subprocesos un entorno allowlist. Si el servicio de pruebas ya estaba activo, el script lo deja activo. Las pruebas de integración y E2E usan PostgreSQL real temporal.

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
