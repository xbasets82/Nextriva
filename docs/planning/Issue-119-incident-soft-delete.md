# Issue #119 — Eliminación lógica auditable de incidencias

## Estado y trazabilidad

Issue [#119](https://github.com/xbasets82/Nextriva/issues/119), `status:approved`. Rama `feat/issue-119-incident-soft-delete`, creada desde `main` integrado en `1eacb25e9f945a8bcbae98dd39a30dc74d23efcc` (PR #123). Implementación local realizada; pendiente de revisión final y validación humana, sin commit ni publicación. Alcance aprobado; no se añade HU ni se avanza a I10.

## Decisiones aprobadas

- Añadir `deletedAt`, `deletedById` y `deletionReason` a `incidents`, relación restrictiva al usuario y evento `DELETED` en `incident_activities`. No crear entidad y no borrar filas ni relaciones físicamente.
- `POST /api/incidents/:id/soft-delete` acepta `{ version, reason }`; la operación conserva el estado real, registra actor/instante del servidor/motivo/estado anterior y aumenta versión una sola vez dentro de la transacción que inserta la actividad.
- `GET /api/incidents/deleted` ofrece una proyección restringida de registros eliminados, con paginación y datos de auditoría. Las rutas operativas ordinarias no revelan una incidencia eliminada (404).
- ADMIN tiene ámbito global. MANAGER requiere vinculación vigente. COLLABORATOR no elimina ni consulta eliminadas. Recurso fuera de ámbito: 404; actor visible sin permiso: 403.
- Solo se permite eliminar desde `OPEN`, `IN_PROGRESS` o `CLOSED`; `PENDING_VALIDATION` y promociones archivadas se rechazan sin mutaciones.
- El motivo se normaliza con `trim`, mide entre 5 y 2.000 puntos de código Unicode y es inmutable. No hay restauración.
- Una incidencia eliminada mantiene su estado real y sigue participando en las protecciones de responsables/validadores de I02/I04. No añadir `deletedAt` a esas guardas.
- La exclusión de eliminadas se aplica en listas, detalle operativo, opciones de filtro, Home/recuentos y mutaciones secundarias, sin ocultar filas globalmente en Prisma.

## Diseño y límites

La operación de borrado sigue el orden transaccional del módulo: bloqueo de administración, promoción, actor e incidencia; revalidación de alcance/estado/versión; actualización condicional; actividad; commit. Repetición, versión obsoleta y conflictos responden 409 sin actividad adicional. El motivo se conserva también en la actividad para mantener la instantánea histórica.

Las consultas operativas componen el ámbito de acceso existente con `deletedAt: null` antes de contar, paginar o proyectar datos. La consulta histórica dedicada reevaluará permisos vigentes y no expondrá datos por UUID, conteos o paginación fuera de ámbito. Los endpoints específicos se registran antes de rutas dinámicas.

No se inventará una ruta de edición general: no existe en el código actual. No se implementa restauración ni historial general nuevo, más allá de presentar la auditoría mínima requerida para eliminadas.

## Riesgo funcional aprobado

Una incidencia `OPEN` o `IN_PROGRESS` eliminada conserva su responsable y sigue bloqueándolo en las protecciones de desactivación, degradación o retirada; al mismo tiempo, las operaciones ordinarias sobre la incidencia quedan cerradas y no hay restauración. Esto puede mantener bloqueado permanentemente a ese responsable. Se respeta la decisión aprobada de conservar la protección, sin introducir una vía de reasignación fuera de alcance.

## Pruebas y TDD

- Vitest: motivo (vacío, límites, trim y Unicode), roles, estados, archivo y conflictos.
- Integración HTTP con PostgreSQL temporal: ADMIN/MANAGER/COLLABORATOR, UUID fuera de ámbito, archivo, estado, repetición, versión, rollback por fallo de actividad, FK y conservación de comentarios/actividades; exclusión en listado, detalle operativo, opciones y resumen personal; las guardas I02/I04 deben continuar considerando eliminadas.
- Playwright con API y PostgreSQL temporal: confirmación/motivo, desaparición operativa y consulta restringida según rol. No se usa `nextriva_dev`.
- Registrar Red/Green/Refactor solo con comandos y resultados observados; no reconstruir evidencia histórica.

## Validación

Comandos definidos en los manifiestos actuales: `mise exec -- pnpm --filter @nextriva/api test`, `test:integration`, `test:e2e`, `mise exec -- pnpm --filter @nextriva/web test`, y controles raíz de API types, typecheck, lint, formato y build. Integración/E2E deben ejecutarse mediante `scripts/test-integration.mjs`, que valida la configuración y utiliza una base PostgreSQL temporal aislada. Los resultados se añadirán tras observar ejecuciones reales.

## Estado de evidencia

Diseñado y aprobado; implementación local y verificaciones automatizadas documentadas en [la evidencia TFM](../tfm/evidencias/2026-10-26-issue-119-incident-soft-delete.md). Pendientes revisión final y validación humana, incluidas las limitaciones TDD y el incidente de generación Prisma allí descritos. Esta planificación no autoriza commit, push, PR ni merge.
