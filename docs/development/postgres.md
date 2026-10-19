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

`.env.local` contiene credenciales locales y está excluido de Git. Créalo solo si aún no existe, para no sobrescribir una configuración previa:

```sh
test -f .env.local || cp .env.example .env.local
```

Edita `.env.local` con credenciales sintéticas. Los valores de `DATABASE_URL` deben usar exactamente el usuario y la contraseña correspondientes a `NEXTRIVA_DEV_USER` y `NEXTRIVA_DEV_PASSWORD`. Haz lo mismo con `TEST_DATABASE_URL`, `NEXTRIVA_TEST_USER` y `NEXTRIVA_TEST_PASSWORD`. Mantén cada URL en su destino local indicado en la tabla.

| Variable | Destino local | Uso |
| --- | --- | --- |
| `DATABASE_URL` | `127.0.0.1:5432/nextriva_dev` | Base de desarrollo |
| `TEST_DATABASE_URL` | `127.0.0.1:5433/nextriva_test` | Base exclusiva para integración |

No compartas ni versionés `.env.local`. No uses una URL de cloud o de desarrollo como URL de pruebas.

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

El script `test:integration` valida `TEST_DATABASE_URL` antes de arrancar contenedores y rechaza destinos que no sean la base local de pruebas. Después genera Prisma Client, levanta `postgres-test`, espera su estado saludable, ejecuta Vitest contra PostgreSQL real y detiene el servicio si el script lo inició. No elimina su volumen `nextriva_test_data`.

```sh
mise exec -- pnpm --filter @nextriva/api test:integration
```

Si el servicio de pruebas ya estaba activo, el script lo deja activo. La URL de pruebas debe apuntar a `127.0.0.1:5433/nextriva_test`; nunca ejecutes estas pruebas contra datos compartidos.

## Comprobaciones del monorepo

Desde la raíz:

```sh
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```

Los comandos anteriores verifican el esqueleto existente. I00.3 no incorpora funcionalidad de negocio ni cambia el contrato HTTP.
