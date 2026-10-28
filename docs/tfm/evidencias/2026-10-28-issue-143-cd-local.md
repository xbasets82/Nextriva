# Issue #143 — Candidato local de publicación al VPS

Fecha: 28/10/2026. Rama: `codex/issue-143-vps-cd`, basada en `main` `1d5e154`. Issue verificada `status:approved`. Solo fases locales A/B; no se ha configurado GitHub, contactado el VPS, publicado imágenes, ejecutado un dispatch ni desplegado por este trabajo.

## Implementación observada

Workflow manual deshabilitado por variable ausente; verificación de CI push exacto y todos los jobs vigentes; imágenes API/web privadas por digest; SSH con host key preestablecida; helper con entrada acotada, archivos root-owned, bloqueo/journal, migraciones solo lectura y rollback de aplicación con igualdad de esquema. No modifica negocio, esquema Prisma, Compose público, Caddy, DNS, firewall ni backups.

La guía operativa está en `docs/development/vps-continuous-delivery.md`. Las rutas nuevas del helper/configuración son propuestas para instalación posterior; no acreditan el layout actual del VPS. GHCR privado, permisos reales de su API, plan GitHub/Environments y primer despliegue permanecen pendientes. No existe trigger automático al merge.

## TDD realmente observado

| Bloque                              | Comando ejecutado                                                                                         | RED observado                                                     | GREEN observado                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Política CI/main/payload            | `mise exec -- node --test scripts/cd-policy.test.mjs`                                                     | 3 fallos, módulo aún ausente, exit 1                              | 3 superadas, exit 0                                                                      |
| Coordinación de release             | `mise exec -- node --test scripts/cd-deploy.test.mjs`                                                     | Stub «Despliegue aún no implementado»: 6 fallos/8 pruebas, exit 1 | 8 superadas, exit 0                                                                      |
| Recuperación de candidata pendiente | `mise exec -- node --test --test-name-pattern='recuperar candidata pendiente' scripts/cd-deploy.test.mjs` | `previous` se sobrescribía con `current`, exit 1                  | 1 superada, exit 0; conserva A al recuperar B desde `{current:B, previous:A, pending:C}` |
| Esquema/archivos/lock/Compose       | `mise exec -- node --test scripts/cd-runtime.test.mjs`                                                    | 4 fallos por verificaciones aún pendientes, exit 1                | 4 superadas, exit 0                                                                      |
| SSH/workflow                        | `mise exec -- node --test scripts/cd-client.test.mjs`                                                     | Módulo y workflow aún ausentes: 2 fallos, exit 1                  | 2 superadas, exit 0                                                                      |

Limitaciones: el primer RED de política/SSH fue ausencia del módulo/archivo completo; no demuestra individualmente cada guarda. Dos negativas del coordinador podían pasar con el rechazo genérico del stub; no se les atribuye RED individual. Se reforzaron después para exigir el error y la invocación concretos. Integración PostgreSQL y E2E de artefacto verifican el candidato ya implementado, sin reconstruir un RED histórico.

Durante GREEN del adaptador se corrigieron dos fixtures: nombre de migración de 14 dígitos y ruta temporal canónica de macOS (`/var` es symlink). No se debilitó la prohibición de symlinks. En la prueba PostgreSQL hubo fallo de arranque inicial y luego espera agotada porque Docker actual expone `.Action`, no `.Status`, en eventos. Se corrigió la espera para consumir eventos de salud del daemon; la ejecución final terminó correctamente. Esos fallos de infraestructura no se cuentan como RED funcional.

Refactor/revisión: funciones de política compartidas por runner/helper, operación Compose allowlisted, token efímero con Docker config temporal, sin shell para argumentos externos, sin PAT de VPS, errores sanitizados, recuperación fail-closed y comprobación repetida de main antes de activar. ESLint detectó problemas de estilo/rutas de herramientas en el primer pase; se corrigieron sin desactivar reglas.

## Resultados reales

| Comando                                                              | Resultado observado                                                                                                                                                                               | Código |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm test:cd`                                          | 18 superadas, incluida regresión de recuperación                                                                                                                                                  | 0      |
| `mise exec -- pnpm test:cd:postgres`                                 | 1 superada; PostgreSQL real tmpfs/sin red/puertos; conserva filas, relación FK e identidad en publicación/rollback simulados y rechazo de migración pendiente                                     | 0      |
| `mise exec -- pnpm --filter @nextriva/api test:e2e:production`       | 1 Playwright superada; imágenes reales, migraciones y seed sintéticos aislados, HTTPS/cookie/CSRF, comentario, solución y validación independiente; persistencia comprobada y limpieza confirmada | 0      |
| `mise exec -- pnpm test`                                             | API 323/323 y web 412/412 unitarias superadas                                                                                                                                                     | 0      |
| `mise exec -- pnpm --filter @nextriva/api test:integration`          | 268 superadas, 2 omitidas por diseño; PostgreSQL efímero, migraciones aplicadas                                                                                                                   | 0      |
| `mise exec -- pnpm -r --if-present test:coverage`                    | API: 91,67 % líneas / 87,16 % ramas; web: 95,53 % líneas / 90,24 % ramas                                                                                                                          | 0      |
| `mise exec -- pnpm test:backup-demo`                                 | 45 superadas                                                                                                                                                                                      | 0      |
| `mise exec -- pnpm format:check` / Prettier de workflow y scripts CD | Formato correcto                                                                                                                                                                                  | 0      |
| `mise exec -- pnpm lint` / ESLint de scripts CD                      | Sin errores                                                                                                                                                                                       | 0      |
| `mise exec -- pnpm typecheck`                                        | API y web superados                                                                                                                                                                               | 0      |
| `mise exec -- pnpm build`                                            | Build de producción API y web superado                                                                                                                                                            | 0      |
| `mise exec -- pnpm api:types:check`                                  | Contrato/tipos OpenAPI sin diferencias                                                                                                                                                            | 0      |
| `mise exec -- pnpm test:audit-baseline`                              | 30 pruebas del evaluador superadas                                                                                                                                                                | 0      |
| `mise exec -- pnpm audit --json` + evaluador estricto                | pnpm audit exit 1; solo GHSA-q7qp-rjg7-q26m (Multer 2.4.0, high), aceptado por la excepción aprobada hasta 23/11/2026; evaluador exit 0                                                           | 0 eval |
| `git diff --check`                                                   | Sin errores                                                                                                                                                                                       | 0      |

El CI incluye obligatoriamente `test:cd` en calidad estática y `test:cd:postgres` en integración. No hay ejecución GitHub Actions nueva porque no se ha publicado la rama. Actionlint no está disponible localmente; Prettier analiza sintaxis YAML y las pruebas verifican disparadores/permisos/guardas relevantes, pero no sustituyen una ejecución Actions. Una primera ejecución concurrente de integración y cobertura falló al regenerar ambas Prisma Client en `apps/api/generated/prisma`; la auditoría local confirmó la carrera. Al repetirlas secuencialmente, ambas pasaron. No se limpió el contenedor preexistente cuyo origen no se pudo acreditar.

La prueba de PostgreSQL coordina el núcleo real con persistencia real y activadores simulados. No demuestra reemplazo real de Compose ni autenticación SSH/GHCR; esas comprobaciones requieren el entorno de fase C autorizado. El E2E existente no incluye el helper remoto. No se han utilizado ni modificado `nextriva_dev` o producción.

## Pendientes y Definition of Done

- Candidato local A/B preparado; no declarar completado el CD público ni apto para activación automática.
- Inventario actual y baseline/instalación root/helper, permisos GHCR/API, secretos SSH/host key y variable de habilitación: pendientes de autorización específica.
- Primer dispatch y recuperación real: pendientes. Activación automática al merge requiere aprobación posterior independiente.
- Migraciones de producción y restauración automática: no ejecutadas; migraciones bloqueadas por diseño. OpenAPI/cliente y reglas de negocio: no aplican, sin cambios de contrato.
- Accesibilidad/responsive de producto: sin UI modificada; VoiceOver/Safari/Firefox siguen pendientes, sin afirmación WCAG completa.
- La primera corrida paralela de cobertura/integración falló por carrera de generación de Prisma; las corridas seriales posteriores pasaron con los resultados aquí registrados.
- No se han creado commit, push, PR ni merge.

El riesgo residual principal es la falta de prueba del adaptador completo contra una instalación remota inventariada y de la disponibilidad real de permisos GHCR. El helper conserva root para Docker, pero expone únicamente una operación fija; requiere revisión de la instalación y del sudoers/authorized_keys antes de habilitarlo. Una caída abrupta puede exigir recuperación manual de lock/journal, sin limpieza por edad ni restauración automática de datos.
