# Matriz de casos críticos — Baseline P04

**Fecha:** 2026-10-19. **Estado de ejecución de todos los casos:** N/D (no existe aplicación ni runner). Esta matriz transcribe el resultado esperado de diseño; no acredita pruebas ejecutadas ni fija códigos HTTP.

La regla y el resultado esperado remiten al diseño funcional §10 (VC01–VC24), con criterios técnicos adicionales del diseño técnico §10. La ausencia de un código HTTP específico se conserva como pendiente del contrato API. En denegaciones, la prueba futura debe revisar respuesta y ausencia de mutación persistida o actividad indebida donde aplique.

| Caso | HU | Regla/caso según fuente | Comprobación futura requerida | Resultado baseline |
|---|---|---|---|---|
| VC01 | HU05, HU07, HU14, HU15 | Colaborador consulta incidencia ajena: denegado | Acceso directo, listado, detalle, historial, filtros y totales no revelan recurso/datos ajenos; ninguna mutación | N/D |
| VC02 | HU03, HU05 | Gestor accede a promoción no asignada: denegado | Respuesta denegada; sin filtración ni mutación | N/D |
| VC03 | HU06 | Crear incidencia sin responsable: permitido, estado Abierta | Persistencia con responsable nulo, autor/fecha de servidor y actividad atómica | N/D |
| VC04 | HU10 | Iniciar resolución sin responsable: denegado | Estado permanece Abierta; sin actividad de transición | N/D |
| VC05 | HU10 | Gestor inicia resolución con responsable asignado: permitido | Estado En curso y actividad en la misma transacción | N/D |
| VC06 | HU08 | Colaborador edita datos generales: denegado | Sin cambios de campos, versión o actividad | N/D |
| VC07 | HU12 | Responsable registra solución en En curso: permitido | Guardar solución y actor/actividad conforme a la operación | N/D |
| VC08 | HU12, HU10 | Enviar a validación sin solución: denegado | Continúa En curso; sin presentación/actividad | N/D |
| VC09 | HU12, HU13 | Enviar sin validador distinto elegible: denegado | Continúa En curso; elegibilidad se valida en servidor y no queda Pendiente | N/D |
| VC10 | HU13 | Presentador valida su propia solución: denegado | No cerrar ni guardar validación/actividad | N/D |
| VC11 | HU13 | Otro gestor/admin elegible valida: permitido | Cierre y actividad con validador distinto del presentador | N/D |
| VC12 | HU09 | Reasignar en Pendiente de validación: denegado | Responsable sin cambios y ninguna actividad | N/D |
| VC13 | HU08 | Editar en Pendiente de validación: denegado | Campos, versión y actividad no cambian | N/D |
| VC14 | HU13 | Rechazar sin justificación: denegado | Sigue Pendiente; no registrar rechazo | N/D |
| VC15 | HU13 | Rechazar con justificación: vuelve a En curso | Conservar propuesta anterior, motivo, actor y actividad atómica | N/D |
| VC16 | HU08, HU09, HU10, HU11 | Modificar incidencia Cerrada: denegado | Edición, asignación, comentario y transición no mutan ni agregan actividad | N/D |
| VC17 | HU02, HU04, HU09 | Desactivar/retirar responsable con incidencias abiertas: denegado | Mantener vínculo/estado o exigir reasignación válida; sin pérdida de autoría | N/D |
| VC18 | HU03 | Archivar promoción con incidencias abiertas: permitido con confirmación; operaciones bloqueadas | Archivo conserva historial; confirmar acción; impedir operaciones ordinarias | N/D |
| VC19 | HU08 | Modificar incidencia de promoción archivada: denegado | Sin cambio de incidencia o actividad | N/D |
| VC20 | HU03 | Reactivar promoción: vuelven operaciones válidas | Estado de promoción y acceso se actualizan sin alterar historia | N/D |
| VC21 | HU07, HU14 | Consultar incidencia cerrada con permisos: permitido | Consulta de solo lectura para actor autorizado | N/D |
| VC22 | HU08 | Edición concurrente de una incidencia: conflicto sin sobrescritura | Dos escrituras con misma versión: como máximo una gana; conflicto esperado `INCIDENT_VERSION_CONFLICT`, sin reintento silencioso | N/D |
| VC23 | HU02, HU04 | Cambio de rol elimina único validador elegible: denegado | Invariante validada bajo concurrencia; no deja presentación sin validador | N/D |
| VC24 | HU01, HU02 | Desactivar usuario con sesión abierta: acceso revocado | Solicitud posterior denegada por estado actual del usuario; sesión no conserva privilegio | N/D |
| CT01 | HU06 | Dos creaciones concurrentes generan códigos públicos distintos | PostgreSQL real; unicidad y secuencia, permitiendo huecos | N/D |
| CT02 | HU08, HU10, HU13 | Fallo al insertar actividad revierte la mutación de negocio | PostgreSQL real; misma transacción y ningún cambio parcial | N/D |
| CT03 | HU02, HU04, HU12, HU13 | Carreras por último administrador o validador elegible | PostgreSQL real; bloqueo/serialización coherente y ausencia de estado inválido | N/D |
| CT04 | HU11, HU03 | Cierre/archivo concurrente con comentario | PostgreSQL real; resultado serializado respeta bloqueo y política de comentario | N/D |
| CT05 | HU01, HU02 | Cookie, CSRF, revocación inmediata y secretos en logs | Pruebas HTTP/browser; mutación protegida; logs sin cookie, token, contraseña o texto sensible | N/D |
| CT06 | HU03, HU06 | Eliminar fase activa no modifica fase histórica de origen de incidencia | PostgreSQL real; conservar referencia/integridad histórica según diseño | N/D |
| CT07 | HU12, HU13, HU14 | Rechazos sucesivos preservan cada propuesta y su autoría | Persistencia de historial completo; no sobrescribir texto/autor anterior | N/D |

## Estrategia de pruebas prevista

- **Vitest unitario:** reglas de dominio, permisos por rol/recurso/estado, transición, validación y elegibilidad, usando límites aislados. N/D: no hay código ni configuración de runner.
- **Vitest integración + PostgreSQL real aislado:** API/Nest, Prisma, restricciones, sesiones/CSRF, atomicidad, versiones y carreras. N/D: no hay esquema, migraciones, aplicación ni servidor PostgreSQL preparado; SQLite o mocks no serían sustitutos válidos.
- **Playwright E2E:** recorridos por rol de autenticación, creación/asignación, resolución, rechazo/validación, cierre, historial y filtros. N/D: no hay frontend ni configuración E2E.

Los casos se ejecutarán en incrementos vinculados a HU cuando exista implementación autorizada. No se reportarán métricas hasta ejecutar los comandos reales definidos en el manifiesto correspondiente.
