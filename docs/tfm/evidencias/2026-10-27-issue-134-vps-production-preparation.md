# Evidencia — Issue #134: preparación del VPS

Fecha: 27/10/2026. Rama: `codex/issue-134-vps-production-prep`, base `6fa161a`. Preparación local; no desplegado.

## Decisiones y alcance

API NestJS y build Vite en contenedores separados, Caddy del host para landing y `/api` en `https://nextriva.es`, redirección www y PostgreSQL 18.6 en red interna con volumen persistente. Credenciales externas al repositorio. La ampliación del Issue autoriza el selector mínimo de URL de producción y sus regresiones. No se modifican esquema, migraciones existentes, endpoints ni CI.

## TDD observado

1. `mise exec -- pnpm --filter @nextriva/api exec vitest run src/database/runtime-database-url.test.ts`: **fallida**, salida 1; 12 fallos/4 superadas. Producción rechazaba la URL privada como si fuera desarrollo y aceptaba `nextriva_dev`, causa esperada de la regla pendiente.
2. Tras añadir la rama explícita de producción, `mise exec -- pnpm --filter @nextriva/api exec vitest run src/database/runtime-database-url.test.ts src/database/database-url.test.ts src/database/migration-database-url.test.ts src/users/bootstrap-database.test.ts`: **superada**, salida 0, 43 pruebas. Se reutiliza el validador de destinos exactos y se mantienen los límites de test y bootstrap.
3. `mise exec -- node --test scripts/test-production-config.test.mjs`: primera ejecución **fallida**, salida 1, porque no existían los archivos de producción. Es una comprobación de configuración ausente. Tras escribirlos, una ejecución falló por omitir `--profile maintenance` en el propio test; se corrigió esa invocación. Resultado posterior: 2 pruebas **superadas**, salida 0.

No se reconstruyen ciclos históricos ni se declara un RED de negocio para la documentación o los Dockerfiles. Los fallos de herramienta descritos son distintos de una prueba de funcionalidad ausente.

## Verificaciones

Verificaciones realizadas localmente; las operaciones del VPS siguen pendientes de autorización.

| Comando                                                                                                     | Resultado observado                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise exec -- pnpm --filter @nextriva/api test`                                                             | Superada: 299 pruebas/34 archivos, salida 0.                                                                                                                                                                         |
| `mise exec -- pnpm typecheck`                                                                               | Superada API/web, salida 0.                                                                                                                                                                                          |
| `mise exec -- pnpm lint`                                                                                    | Superada, salida 0.                                                                                                                                                                                                  |
| `mise exec -- pnpm api:types:check`                                                                         | Superada, salida 0; sin cambios de contrato.                                                                                                                                                                         |
| `docker build -f deploy/Dockerfile.api -t nextriva-issue134-api:local .`                                    | Superada, salida 0; Prisma y TypeScript generados dentro de imagen. Se añadió OpenSSL/CA tras aviso del primer build y se repitió con éxito.                                                                         |
| `docker build -f deploy/Dockerfile.postgres -t nextriva-issue134-postgres:local .`                          | Superada, salida 0; init de roles incorporado en modo 0644.                                                                                                                                                          |
| `mise exec -- node scripts/smoke-production-images.mjs`                                                     | Superada, salida 0; 13 migraciones, roles separados, runtime sin superusuario/DDL, Argon2id, login/consulta, cookie segura, CSRF, revocación y HTML web. Contenedores/red eliminados, sin recursos smoke residuales. |
| `mise exec -- node --test scripts/test-production-config.test.mjs`                                          | Superada, 2 pruebas, salida 0.                                                                                                                                                                                       |
| `mise exec -- pnpm exec eslint scripts/test-production-config.test.mjs scripts/smoke-production-images.mjs` | Superada, salida 0.                                                                                                                                                                                                  |
| `docker build -f deploy/Dockerfile.web -t nextriva-issue134-web:local .`                                    | Superada, salida 0, después de corregir la capability del binario para ejecutarlo con `cap_drop=ALL`.                                                                                                                |

## Limitaciones y controles manuales

No se han aplicado migraciones en el VPS ni en `nextriva_dev`. TLS público, smoke Playwright HTTPS, navegación real con roles, configuración Caddy activa y validaciones manuales de accesibilidad no se acreditan mediante el smoke interno HTTP. La inicialización de administrador, backups separados y recuperación se resolverán antes de desplegar. Los roles PostgreSQL separados sí se verificaron sobre la base efímera; no se ha aplicado esta inicialización a un volumen persistente real. No se afirma conformidad WCAG completa ni capacidad medida del VPS.

## Fallos de empaquetado detectados y corregidos

- El primer build de API avisó de ausencia de OpenSSL: se añadió OpenSSL/CA a la base común de build y runtime; nueva generación y build superados.
- El primer smoke de PostgreSQL falló con el script init montado desde macOS (`bad interpreter: Permission denied`). Se incorporó el init en una imagen PostgreSQL con modo 0644; la inicialización efímera posterior pasó.
- `pnpm deploy --legacy --prod` no conservaba el schema-engine descargado por Prisma: el smoke de migraciones lo detectó. La imagen copia explícitamente el binario nativo y define `PRISMA_SCHEMA_ENGINE_BINARY`; las 13 migraciones pasaron después desde la imagen final.
- Caddy oficial incluye una capability para puertos bajos que impedía arrancar con `cap_drop=ALL`. Se retiró de la imagen web, que escucha en 8080; posterior arranque y lectura de HTML superados.
- Se corrigieron restricciones ESLint de los scripts nuevos (ruta absoluta de Docker, destinos sintéticos de configuración y ubicación de aserciones) sin desactivar reglas.

## Definition of Done proporcional

- Alcance e Issue aprobado: sí, preparación local y selector de destino autorizados.
- Reglas de destino, aislamiento y roles: pruebas unitarias, configuración semántica y PostgreSQL sintético desde imágenes superados.
- Migraciones de esquema nuevas: no aplicable; no hay cambios del modelo. Sí se aplicaron las 13 existentes desde cero en PostgreSQL efímero.
- HTTP/OpenAPI: sin modificación; cliente y contrato comprobados con salida 0.
- UI nueva/accesibilidad: no aplicable; el build sirve la interfaz existente. La revisión gráfica/HTTPS pública permanece pendiente.
- Unitarias API: 299 superadas; unitarias web, integración funcional completa, E2E Playwright completo y cobertura nueva no ejecutados en esta unidad de preparación. El smoke PostgreSQL empaquetado no se presenta como esas suites.
- Calidad: tipos, ESLint, compilaciones API/web en Docker y formato de archivos modificados comprobados. CI remota no ejecutada.
- Secretos y datos: credenciales del smoke aleatorias y redactadas; sin `.env.local`, datos dev ni acceso remoto. Temporales propios retirados tras éxito y tras fallos observados.
- Publicación: no realizada; commit/push/PR y despliegue requieren autorización posterior.

## Correcciones de la revisión fresca

La revisión detectó que los privilegios por defecto del migrador también concedían DML al runtime sobre `_prisma_migrations`. Se añadió primero la regresión al smoke: SELECT/INSERT/UPDATE/DELETE deben responder con PostgreSQL `42501`. Ejecución observada: `mise exec -- node scripts/smoke-production-images.mjs`, **fallida**, salida 1 con `Missing expected rejection`, después de aplicar las 13 migraciones. También falló el test de configuración al exigir un paso de revocación todavía ausente, salida 1.

La corrección mínima incorpora `deploy/revoke-migration-access.mjs` a la imagen API. El servicio de mantenimiento ejecuta `migrate deploy` y después revoca todos los privilegios de `nextriva_app` sobre esa tabla, con error redactado y salida no cero si no puede completar la restricción. El smoke ejecuta el mismo comando; no se añadieron migraciones ni dependencias.

Se corrigió además el registro de contenedores antes de intentar arrancarlos. La limpieza admite el recurso que no llegó a crearse y puede repetirse. `--check-failed-start-cleanup` provoca un fallo real con entrypoint inexistente, verifica que Docker creó el contenedor, retira ese contenedor y otro nombre propio nunca creado, repite limpieza y comprueba que el primero ya no existe. Todos los nombres pertenecen exclusivamente a su sesión aleatoria.

Validación posterior observada:

- `docker build -f deploy/Dockerfile.api -t nextriva-issue134-api:local .`: **superada**, salida 0.
- `mise exec -- pnpm exec eslint deploy/revoke-migration-access.mjs scripts/smoke-production-images.mjs scripts/test-production-config.test.mjs`: **superada**, salida 0.
- `mise exec -- node --test scripts/test-production-config.test.mjs`: **superada**, 2 pruebas, salida 0.
- `mise exec -- node scripts/smoke-production-images.mjs --check-failed-start-cleanup`: **superada**, salida 0.
- `mise exec -- node scripts/smoke-production-images.mjs`: **superada**, salida 0; 13 migraciones, denegación de metadatos, login y sesiones, CSRF, negocio y web conservados; limpieza final completada.

El rate limit vigente obtiene la IP de `request.socket.remoteAddress`. Detrás de Caddy, las conexiones comparten la IP del proxy y el límite se comparte por cuenta. Validar/configurar esta identificación antes de exponer el login permanece pendiente; no se modificó la lógica funcional ni se habilitó `trust proxy` indiscriminadamente.
