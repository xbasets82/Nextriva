# Issue #119 — Eliminación lógica auditable de incidencias

## Resultado local y trazabilidad

Implementación local de [#119](https://github.com/xbasets82/Nextriva/issues/119), aprobada por el usuario, en `feat/issue-119-incident-soft-delete`, desde `main` en `1eacb25e9f945a8bcbae98dd39a30dc74d23efcc` (PR #123 integrada). Mejora transversal relacionada con HU07, HU10 y HU14; no inicia I10. Pendiente de revisión final y validación humana; sin commit ni publicación.

La eliminación conserva la fila, el estado real y todas sus relaciones. Añade `deleted_at`, `deleted_by_id`, `deletion_reason` y una actividad `DELETED`, con estado anterior y motivo. La migración es aditiva: no reconstruye ni inventa actividades anteriores. El motivo recortado admite 5–2.000 puntos de código Unicode; no existe una operación para modificarlo ni restaurar la incidencia.

## Reglas y diseño implementados

- ADMIN tiene ámbito global; MANAGER requiere vinculación vigente. COLLABORATOR no elimina ni consulta eliminadas. Recurso ajeno: 404; acción prohibida sobre recurso visible: 403. La consulta histórica vuelve a comprobar el ámbito actual.
- Solo se elimina en `OPEN`, `IN_PROGRESS` o `CLOSED`, con promoción activa. Se rechaza `PENDING_VALIDATION` y promoción archivada.
- `POST /api/incidents/:id/soft-delete` acepta `{ version, reason }`, requiere sesión, origen y CSRF, y devuelve HTTP 200 con la incidencia y los metadatos de eliminación. Repetición o versión obsoleta: 409 sin nueva actividad.
- `GET /api/incidents/deleted` ofrece paginación y los filtros del listado existente, exclusivamente para ADMIN/MANAGER autorizado. Su proyección identifica motivo, fecha y usuario responsable de la eliminación. El frontend presenta una consulta histórica de diez registros por página sin enlazar al detalle operativo oculto.
- La transacción coordina bloqueo de administración, promoción, actor e incidencia, reevalúa el ámbito, cambia los marcadores y la versión, e inserta la actividad. Fallar esta inserción revierte todos los cambios.
- El predicado operativo del store añade `deletedAt: null`; Home aplica la misma exclusión en agregados y SQL parametrizado. Se excluyen eliminadas de detalle, listados, totales, opciones y todas las acciones secundarias.
- El ámbito general `incidentVisibility` y las guardas I02/I04 se conservan: una incidencia eliminada no cerrada sigue protegiendo a su responsable. Puede mantenerlo bloqueado indefinidamente porque no hay restauración ni operaciones ordinarias posteriores. Se conserva expresamente la decisión aprobada.
- El frontend reutiliza controles, iconos, tooltip y cliente basado en OpenAPI. La confirmación exige motivo, contiene el foco y evita peticiones duplicadas; un resultado tardío tras desmontar el componente no navega de nuevo a una vista privada. React representa el motivo como texto.

La migración incorpora FK restrictiva hacia el usuario, consistencia de los tres marcadores y límite de motivo en PostgreSQL. Se mantienen las ocho entidades. No hay borrado físico, cascadas destructivas, cambios de dependencias ni modificaciones de las guardas de responsables/validadores.

## TDD observado y límites

| Unidad                | RED observado                                                                                                                                                                                                                                                                              | GREEN / refactor observado                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política y motivo     | El primer intento falló por importar un módulo aún inexistente y no se considera RED funcional. Tras añadir un esqueleto sin conducta, 2 de 3 tests fallaron porque no se rechazaba al colaborador ni se normalizaba el motivo (salida 1).                                                 | Las 3 pruebas pasaron (salida 0), reutilizando el parser estricto del motivo de rechazo; política de eliminación separada. Cobertura de la política: 100 % de líneas y ramas.                                                         |
| HTTP/persistencia     | Los primeros intentos detectaron errores del fixture: email no normalizado y promoción activa sin fase; se corrigieron antes de persistencia y no se cuentan como RED. Con fixtures válidos, los 5 casos iniciales fallaron por rutas ausentes: 404 frente a 200/400 esperados (salida 1). | Integración final: 236 pruebas pasaron, 2 omitidas por el diseño del runner compartido (salida 0). Exclusión operativa centralizada sin cambiar las guardas I02/I04.                                                                  |
| Confirmación de UI    | 3 de 4 pruebas fallaron por ausencia del botón «Eliminar incidencia» (salida 1).                                                                                                                                                                                                           | 4 de 4 pasaron; se añadieron posteriormente dos regresiones funcionales de teclado, foco y respuesta tardía. Suite web final: 367/367. Se extrajo el cálculo del índice de foco para eliminar un ternario anidado detectado por lint. |
| Consulta histórica    | 3 pruebas fallaron por ausencia de carga, resultados y denegación accesibles (salida 1).                                                                                                                                                                                                   | 3/3 pasaron: carga, vacío, error/reintento, auditoría segura, paginación y denegación al colaborador.                                                                                                                                 |
| Integración E2E de UI | Primera ejecución bloqueada por puerto 4317 ocupado, sin tests: no es RED. Con puertos alternativos admitidos por la configuración, 67 pruebas pasaron y la nueva prueba ADMIN falló al no existir el botón en el detalle (salida 1).                                                      | Tras conectar componentes y navegación, ambos casos nuevos pasaron. Repetición completa final: 68/68 (salida 0).                                                                                                                      |

Limitación TDD: los casos adicionales de rollback, concurrencia, FK, guardas y opciones se incorporaron después de implementar la transacción; su primera ejecución fue GREEN. El RED común de las cinco pruebas HTTP iniciales no demuestra un ciclo RED independiente para cada aserción posterior. No se han reconstruido RED históricos ni introducido fallos artificiales en producción.

La primera versión separada del archivo de integración escribía en paralelo con pruebas antiguas que cuentan filas globales y produjo interferencias. Las nuevas pruebas se agruparon en un `describe` secuencial al final del archivo HTTP existente; sus aserciones y el runner no se relajaron. Los triggers de fallo están restringidos al UUID sintético y se retiran en `finally`.

## Casos críticos comprobados

| Garantía                           | Evidencia                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rol, promoción y estado            | ADMIN/MANAGER permitido; COLLABORATOR 403; promoción ajena 404; pendiente/archivada 409; capturas antes/después sin mutación.                             |
| Auditoría y conservación           | Actor/instante del servidor, estado previo y motivo; versión +1; comentarios y actividades previas intactos.                                              |
| Repetición, versión, sesión y CSRF | 409/400/401/403 con captura persistente sin cambios.                                                                                                      |
| Rollback                           | Trigger restringido al incidente rechaza `DELETED`: HTTP 503 y restauración completa de marcadores, versión e historial.                                  |
| Concurrencia                       | Dos conexiones PostgreSQL y barrera observable mediante bloqueos, sin sleeps arbitrarios: 200/409, una versión y un evento.                               |
| Ocultación operativa               | Detalle, elegibles, comentario, asignación, inicio, borrador, envío, aprobación y rechazo devuelven 404; lista/totales/opciones/Home excluyen eliminadas. |
| Histórico y revocación             | Total/filas limitados al ámbito; COLLABORATOR 403; retirada de vinculación elimina acceso del MANAGER.                                                    |
| Integridad y protecciones          | Marcadores parciales y FK inexistente rechazados; desactivar/degradar/retirar un responsable no cerrado eliminado sigue dando 409 sin mutaciones.         |
| UI y XSS                           | Confirmación/motivo obligatorios, foco/teclado, solicitud única, error seguro, texto HTML literal y salida tardía ignorada.                               |
| Contrato                           | Respuestas HTTP reales comparadas con las claves de su proyección OpenAPI, rutas documentadas y cliente regenerado reproduciblemente.                     |

## Verificaciones observadas

Las pruebas persistentes utilizaron el runner seguro y PostgreSQL temporal. No se ejecutaron migraciones de prueba ni limpieza sobre `nextriva_dev`. Véase el incidente de generación de Prisma más abajo antes de interpretar el aislamiento.

| Comando                                                                                                                                                    | Resultado                                                                                                                | Código |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -----: |
| `mise exec -- pnpm --filter @nextriva/api test`                                                                                                            | 33 archivos, 272 pruebas pasaron                                                                                         |      0 |
| `mise exec -- pnpm --filter @nextriva/web test`                                                                                                            | Primera suite completa: 365 pruebas pasaron, antes de añadir dos regresiones de foco; la cobertura final ejecutó las 367 |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:integration`                                                                                                | 14 archivos pasaron, 1 omitido; 236 pruebas pasaron, 2 omitidas                                                          |      0 |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e`                                                  | Chromium, API y PostgreSQL temporal: 68/68                                                                               |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:coverage`                                                                                                   | 508 pruebas pasaron, 2 omitidas; líneas 91,85 %, ramas 86,61 %                                                           |      0 |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                                   | 367/367; líneas 95,42 %, ramas 90,34 %                                                                                   |      0 |
| `mise exec -- pnpm api:types`                                                                                                                              | Tipos generados con la versión fijada desde las rutas/esquemas reales                                                    |      0 |
| `mise exec -- pnpm api:types:check`                                                                                                                        | Reproducible, sin diferencias                                                                                            |      0 |
| `mise exec -- pnpm typecheck`                                                                                                                              | API/web pasaron                                                                                                          |      0 |
| `mise exec -- pnpm lint`                                                                                                                                   | Sin infracciones tras el refactor de foco                                                                                |      0 |
| `mise exec -- pnpm format:check`                                                                                                                           | Prettier pasó                                                                                                            |      0 |
| `mise exec -- pnpm build`                                                                                                                                  | API/web pasaron                                                                                                          |      0 |
| `mise exec -- pnpm audit --json`                                                                                                                           | Solo el aviso aprobado de Multer                                                                                         |      1 |
| `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-issue119-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1` | Evaluador estricto: una excepción temporal vigente, ninguna nueva                                                        |      0 |
| `mise exec -- node scripts/test-integration.mjs --isolated-validator-test`                                                                                 | Caso obligatorio sin validador: 1 pasó; 105 no seleccionadas                                                             |      0 |
| `git diff --check`                                                                                                                                         | Sin errores de whitespace                                                                                                |      0 |
| `mise exec -- pnpm test:audit-baseline`                                                                                                                    | 30/30                                                                                                                    |      0 |

La omisión del caso sin validador en la suite compartida se contrasta mediante el runner aislado obligatorio: `mise exec -- node scripts/test-integration.mjs --isolated-validator-test` pasó con código 0 (1 prueba pasada, 105 no seleccionadas por el filtro explícito del runner). La comprobación separada de backup/restauración permanece fuera de este cambio; su archivo se omite en la suite ordinaria conforme a la configuración existente. Las migraciones se aplicaron desde cero mediante `prisma.test.config.ts` dentro de cada ejecución del runner. No se ejecutó `prisma validate` por separado; el esquema fue procesado por generación y migración en el runner seguro.

Cobertura agregada de Incidents: API 97,33 % líneas / 88,89 % ramas; web 97,35 % / 89,03 %. Los umbrales configurados no se rebajaron. La política nueva alcanza 100 % / 100 %; el componente de confirmación alcanza 100 % / 97,5 %. La cobertura no demuestra por sí sola seguridad ni ausencia de casos pendientes.

## Fallos intermitentes observados

Una ejecución E2E posterior al RED dejó 67/68: falló el caso previo de logout tardío entre pestañas con `route.fulfill: Route is already handled!` y una espera agotada. Ambos casos de eliminación pasaron. Se repitió completa con fuentes estables y pasó 68/68; no se modificaron autenticación ni aserciones. La causa del intermitente no se ha demostrado y no se declara corregida.

Una ejecución de cobertura web dejó 366/367: el caso previo de guardar borrador no encontró su mensaje `status` antes del timeout. Pasó individualmente y, después, la cobertura completa pasó 367/367, sin modificar la aserción ni el componente de solución. No se atribuye una causa que no se haya probado.

## Incidente del procedimiento de generación Prisma

Durante la preparación se utilizó el flujo `db:generate` / `prisma generate`, que lee `prisma.config.ts` y carga implícitamente `.env.local`. Esto incumple la intención de no cargar configuración de desarrollo durante esta tarea. La auditoría fresca comprobó estáticamente que ese flujo genera archivos únicamente en `apps/api/generated/prisma` (ignorado) y no contiene una operación de conexión, migración o escritura de datos; no se ha encontrado evidencia de persistencia en la base de datos por ese comando.

No se conserva una transcripción íntegra de aquella invocación y su salida en la evidencia del repositorio. No puede certificarse exposición cero de secretos ni acreditarse el estado previo de la base de datos. No se inspeccionó el archivo de secretos para reconstruir evidencias ni se ejecutaron comprobaciones sobre desarrollo. Se pausó el trabajo para auditoría fresca y se reanudó exclusivamente mediante los runners con `prisma.test.config.ts`. No se ha vuelto a ejecutar `db:generate`.

## Seguridad residual y validación manual pendiente

El baseline conserva exactamente la excepción existente `GHSA-q7qp-rjg7-q26m` de `multer@2.4.0`, severidad alta, hasta `2026-11-23T00:00:00.000Z`. No se amplió ni modificó. No se implementan subidas de archivos ni `fileFilter` asíncronos.

Pendientes: revisión humana, validación visual/VoiceOver y Safari/Firefox. Las verificaciones Chromium y de teclado no acreditan conformidad WCAG completa. No se aplicó la migración a `nextriva_dev` como parte de las pruebas y no se afirma realizada validación manual.

Para validación humana, una vez autorizada y preparada la migración del entorno local: abrir una incidencia permitida como ADMIN/MANAGER, probar motivo inválido y cancelación, confirmar con motivo válido y comprobar su desaparición operativa; abrir «Consultar incidencias eliminadas» y verificar motivo/actor/fecha. Probar también una cerrada, la denegación en pendiente/archivada y la ausencia de la acción como colaborador. La fila y sus relaciones deben seguir presentes. No desactivar un responsable eliminado esperando que desaparezca la protección aprobada.

## Uso de herramientas de IA

Codex produjo pruebas, implementación y documentación a partir del Issue aprobado. Los resultados se basan en comandos observados; no se reconstruyen ciclos RED ni validaciones manuales. La aprobación funcional y de publicación corresponde al usuario. La revisión independiente final continúa siendo necesaria.
