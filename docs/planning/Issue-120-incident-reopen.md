# Issue #120 — Reapertura de incidencias con historial de soluciones

## Estado y trazabilidad

Issue [#120](https://github.com/xbasets82/Nextriva/issues/120), `status:approved`. Decisiones funcionales confirmadas por el usuario el 26/10/2026. Vinculada al ciclo de HU10, HU12, HU13 y HU14; independiente de I10. Este documento registra diseño aprobado, no implementación ni resultados de prueba. Commit, push, PR y merge requieren autorización posterior.

La excepción permite exclusivamente `CLOSED` → `IN_PROGRESS`. Las referencias históricas excluyen reapertura: [diseño funcional §§2/6.3–6.4](../references/Nextriva_Diseno_Funcional_MVP_v1.0_ES.md), [diseño técnico §§1/6](../references/DISENO_TECNICO_NEXTRIVA_MVP_v1.0.md), [I07.1](I07.1-incident-state-start.md) e [I07.3](I07.3-incident-validation.md). Se conservan sin modificaciones; la decisión posterior queda registrada en `AGENTS.md` y la [matriz de decisiones](../architecture/decision-matrix.md#issue-120--reapertura-con-conservación-de-la-solución-aprobada).

## Objetivo visible y alcance

ADMIN o MANAGER autorizado puede reabrir desde el detalle una incidencia cerrada, aportar un motivo y seleccionar un responsable elegible. La incidencia pasa a En curso con una solución mutable vacía; el cierre anterior sigue consultable en su actividad histórica. El responsable trabaja en una nueva solución y debe presentarla y obtener validación independiente para cerrar de nuevo.

Se reutilizan la política de acceso por incidencia, la elegibilidad I06.2, la transacción/versionado existentes y `incident_activities`. No se introduce entidad, estado ni tipo de actividad. Se añade la acción accesible `Reabrir incidencia` con confirmación, motivo y selección de responsable; carga, conflicto y errores deben ofrecer feedback seguro y evitar duplicar peticiones.

## Contrato HTTP aprobado

`POST /api/incidents/:id/reopen` recibe cuerpo estricto `{ version, reason, assignedToId }`, cookie de sesión y CSRF conforme al mecanismo vigente. `assignedToId` es obligatorio en **cada petición**, incluso si coincide con el responsable anterior. No admite desasignación ni `null`.

| Entrada o respuesta | Regla                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`           | Entero positivo esperado; no se sustituye automáticamente por una versión nueva.                                                            |
| `reason`            | Texto obligatorio de 5–2.000 puntos de código Unicode después de `trim`; no solo espacios.                                                  |
| `assignedToId`      | UUID obligatorio; usuario activo y participante vigente de la promoción, o ADMIN global conforme a I06.2.                                   |
| 200                 | Representación actualizada: `IN_PROGRESS`, responsable seleccionado, versión +1 y marcadores de solución/presentación/cierre vacíos.        |
| 400                 | Cuerpo inválido o responsable no elegible conforme al contrato de asignación existente.                                                     |
| 401 / 403           | Sesión inválida / acción prohibida sobre incidencia visible o protección CSRF fallida.                                                      |
| 404                 | Incidencia inexistente, eliminada lógicamente o fuera de ámbito.                                                                            |
| 409                 | Versión obsoleta, repetición, estado distinto de `CLOSED`, promoción archivada o metadatos insuficientes para conservar el cierre anterior. |
| 503                 | Fallo técnico redactado; no devuelve detalles de infraestructura ni escrituras parciales.                                                   |

OpenAPI, DTO y cliente generado deben representar este contrato, la variante histórica de `STATUS_CHANGED` y la representación del detalle sin aceptar campos calculados por servidor.

## Autorización y precondiciones

| Actor                   | Incidencia y promoción                                     | Resultado                                                          |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| ADMIN activo            | Ámbito global, cerrada, no eliminada y promoción activa    | Puede reabrir con responsable elegible y motivo.                   |
| MANAGER activo          | Vinculación vigente a la promoción y mismas precondiciones | Puede reabrir. Retirar el vínculo revoca esta capacidad.           |
| MANAGER fuera de ámbito | Incidencia de otra promoción                               | 404, sin revelar existencia ni mutar datos.                        |
| COLLABORATOR            | Incidencia visible                                         | 403; ser creador, presentador o responsable no concede reapertura. |
| Cualquier actor         | Recurso no visible o eliminado                             | 404.                                                               |

La identidad del anterior presentador o validador no concede por sí misma permiso de reapertura. La nueva presentación y validación conservan la separación de identidades vigente. No se permite reabrir para eludir archivo, eliminación lógica ni elegibilidad del responsable.

## Transacción e historia inmutable

1. Reutilizar el orden de bloqueos vigente de administración, promoción, usuarios e incidencia, coordinado con archivo, retirada de participantes, desactivación/degradación y cambios de responsable.
2. Revalidar dentro de la transacción actor, ámbito, promoción activa, ausencia de eliminación, estado `CLOSED`, versión y elegibilidad del responsable solicitado.
3. Capturar una instantánea versionada en `incident_activities.changes` con la solución aprobada íntegra, presentador y fecha de presentación, validador y fecha de cierre, estado y responsable anteriores. El motivo y el nuevo responsable completan el evento; actor/fecha de reapertura proceden del servidor.
4. Actualizar condicionalmente por versión y estado: `IN_PROGRESS`, responsable elegido y versión +1; dejar `solution`, `solutionSubmittedById`, `solutionSubmittedAt`, `validatedById` y `closedAt` en `null`. `createdAt`, código, promoción, autor y fase de origen permanecen intactos.
5. Insertar exactamente una actividad `STATUS_CHANGED` en el mismo contexto transaccional. Un fallo de actividad revierte todos los cambios. Un segundo cierre/reapertura conservará su propia instantánea, sin sobrescribir las anteriores.

El formato versionado de la instantánea se valida como una variante del evento existente, compatible con las actividades previas. Las filas históricas sin la información necesaria se rechazan con 409: no se infiere el actor, no se fabrica solución ni se ejecuta backfill. No se requiere migración de esquema por esta decisión; si la implementación descubre una necesidad persistente adicional, debe presentarse antes de introducirla.

La concurrencia mantiene la versión esperada: una carrera de reapertura contra reapertura solo admite un éxito, una actividad y un incremento. La otra petición recibe 409; no se reintenta con una versión actualizada. La elegibilidad se protege frente a cambios concurrentes de usuario/vínculo.

## Criterios de aceptación

- [ ] ADMIN y MANAGER autorizado reabren una incidencia cerrada activa con motivo y `assignedToId` obligatorio; COLLABORATOR y actores fuera de ámbito reciben los códigos previstos.
- [ ] Se rechazan motivo inválido, responsable omitido/inactivo/no elegible, promoción archivada, incidencia eliminada, estado incorrecto y versión obsoleta sin cambios en incidencia o actividades.
- [ ] Puede conservarse el responsable anterior o asignarse uno elegible nuevo en la misma operación; un responsable anterior no elegible no bloquea la selección de uno nuevo válido.
- [ ] La instantánea histórica conserva solución y metadatos completos antes de limpiar los campos mutables. Editar o vaciar un borrador posterior no altera la instantánea.
- [ ] El nuevo ciclo requiere solución nueva, presentación y validación independiente; puede repetirse conservando todos los cierres anteriores.
- [ ] Repeticiones/carreras producen una sola transición, actividad e incremento; fallo de actividad revierte estado, responsable, solución, metadatos y versión.
- [ ] Listados, detalle, filtros y Home reflejan de nuevo la incidencia activa y sus permisos, sin cambiar la fecha de creación ni mostrar eliminadas.
- [ ] API/OpenAPI/cliente y UI son coherentes; confirmación accesible, errores y carga se prueban sin debilitar controles existentes.
- [ ] Evidencia TFM contiene únicamente comandos/resultados observados, límites TDD y verificaciones manuales pendientes.

## Estrategia TDD y verificaciones previstas

| Capa                                 | Entrada y resultado que demostrar                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest dominio/DTO                   | Matriz de roles, estado, archivo, motivo Unicode/límites, versión y responsable requerido. Rechazos mantienen el contrato vigente.                                                                              |
| Integración HTTP/PostgreSQL temporal | Cierre completo → petición válida → 200, estado/responsable/versionado y una instantánea exacta persistidos; cambiar/vaciar el nuevo borrador deja la actividad anterior igual.                                 |
| Integración negativa                 | 400/403/404/409 según caso; comparar incidencia completa y conteo/contenido de actividades antes/después. Incluir cierre histórico incompleto sin rellenarlo.                                                   |
| Integración concurrente              | Dos conexiones reales y barrera PostgreSQL determinista: reapertura/reapertura, cambio concurrente de elegibilidad y fallo de inserción de actividad. Sin sleeps arbitrarios; rollback íntegro y ganador único. |
| Playwright/API real                  | Dos sesiones reales: cerrar con validador independiente, reabrir con motivo/responsable, recargar, trabajar nueva solución y validar otra vez. Comprobar historial, Home y denegación por rol.                  |

Para cada regla pendiente: escribir y ejecutar la prueba, observar RED por comportamiento ausente, implementar lo mínimo, observar GREEN y refactorizar/repetir. Una política ya implementada se verifica por regresión; no se reconstruye su RED histórico. Ningún resultado de esta tabla se considera ejecutado por estar planificado.

Comandos confirmados en los manifiestos: `mise exec -- pnpm --filter @nextriva/api test`, `mise exec -- pnpm --filter @nextriva/api test:integration`, `mise exec -- pnpm --filter @nextriva/api test:e2e`, `mise exec -- pnpm --filter @nextriva/api test:coverage`, `mise exec -- pnpm --filter @nextriva/web test` y `mise exec -- pnpm --filter @nextriva/web test:coverage`; controles raíz `api:types`, `api:types:check`, `typecheck`, `lint`, `format:check` y `build`.

Integración/E2E/cobertura API usan `scripts/test-integration.mjs` y `TEST_DATABASE_URL` validada con PostgreSQL temporal aislado. No cargar `.env.local`, heredar `DATABASE_URL` de desarrollo ni escribir en `nextriva_dev`. Auditoría y evaluador estricto del baseline conservan sus excepciones aprobadas. Las salidas y códigos de ejecución se incorporarán a la evidencia después de observarlos.

## Dependencias, riesgos y límites

Depende de I06.2 (elegibilidad/coordinación), I07.2–I07.3 (presentación/validación), I08.1 (auditoría transaccional), #119 (eliminación lógica y exclusión de operaciones) y Home vigente. La representación de actividades debe conservar lectura de eventos antiguos y mostrar la instantánea sin HTML ejecutable ni datos fuera de ámbito.

Los bloqueos reutilizados pueden serializar operaciones de promociones distintas durante transacciones cortas. Un cierre histórico incompleto puede requerir una decisión posterior de mantenimiento; este incremento no lo repara. La compatibilidad del cliente con la variante histórica debe demostrarse regenerando y verificando tipos. VoiceOver, Safari y Firefox requieren validación manual y no acreditan conformidad WCAG por pruebas automatizadas.

Fuera de alcance: restauración de eliminadas, entidad de revisiones, backfill, nuevas transiciones o estados, nuevos tipos de actividad, adjuntos, notificaciones, cambios en reglas de validación independiente y cualquier trabajo de I10. No se aplica migración a `nextriva_dev` ni se declara validación manual realizada.

La evidencia prevista es `docs/tfm/evidencias/2026-10-26-issue-120-incident-reopen.md`, a crear al registrar observaciones reales de implementación y pruebas. No se crea evidencia anticipada mediante esta planificación.
