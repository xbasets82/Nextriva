# Evidencia TFM — I06.1 Comentarios — 2026-10-22

## Identificación y alcance

Issue [#57](https://github.com/xbasets82/Nextriva/issues/57), comprobado con `status:approved` antes del desarrollo. Rama `codex/i06-1-incident-comments`, desde `main` consolidada con la optimización CI de PR #56. HU11 exclusivamente. Estado: implementación local y verificación automatizada; validación humana pendiente. No se han autorizado commit, push, PR o merge de I06.1.

Se añade `incident_comments` con UUID, incidencia, autor, cuerpo y fecha UTC/TIMESTAMPTZ; migración versionada `20261022233000_incident_comments`, dos FK restrictivas y un índice cronológico. Los comentarios son inmutables funcionalmente: no hay rutas de edición o borrado. No se añade actividad `COMMENTED`, asignación, historial ampliado ni otra entidad. La numeración sigue la guía original (I06.1), conservando sin editar la referencia técnica histórica que situaba comentarios en I07.

## Reglas implementadas

`POST /api/incidents/:id/comments` devuelve 201 y determina autor/fecha en servidor. Solo admite `body`, normalizado en extremos, entre 1 y 2000 caracteres; estructura inválida o campos adicionales devuelven 400. El detalle incorpora `comments`, ordenados por `createdAt ASC, id ASC`.

Se reutiliza la visibilidad de I05.2: ADMIN global; MANAGER vinculado; COLLABORATOR vinculado y autor de la incidencia. No existe todavía asignación de responsables. UUID no visible devuelve 404; sesión ausente/inactiva devuelve 401 y CSRF ausente devuelve 403. Los rechazos probados no insertan comentarios. Retirar un vínculo revoca el acceso y conserva comentarios y autoría.

Una promoción archivada o incidencia cerrada devuelve 409. Pendiente de validación admite comentarios. La transacción bloquea primero promoción, después actor con `FOR SHARE` y después incidencia con `FOR UPDATE`; revalida ámbito y estado antes de insertar. Así coordina archivo/retirada y cambio de rol con el comentario, y bloquea frente al cierre de la fila de incidencia. El futuro flujo de cierre deberá conservar el orden común de bloqueo. Los comentarios no incrementan `version` ni crean actividad de negocio.

La interfaz muestra texto con JSX, conserva saltos y permite añadir sin abandonar el detalle. Incluye vacío, validación asociada, prevención de envíos duplicados, progreso, mensajes seguros y recuperación del foco. Autoría visible mediante identificador estable; fecha mediante elemento `time`. Un fallo mantiene el texto para reintentar. El contrato OpenAPI y los tipos generados están actualizados.

## TDD observado y límites

| Unidad                              | RED real observado                                                                                                                                                                                                      | GREEN / revisión                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Validación del cuerpo               | Prueba nueva de `newIncidentComment`: función aún ausente; 15 existentes superadas, 1 fallida, salida 1. Comando: `mise exec -- pnpm --filter @nextriva/api exec vitest run src/incidents/incident.validation.test.ts`. | Normalización y validación compartida: 16/16, salida 0. No fue necesario otro refactor.                                                    |
| Alta y consulta persistentes        | Runner seguro PostgreSQL: se esperaba 201 en la ruta de comentarios inexistente y llegó 404; 124 superadas, 1 fallida, salida 1.                                                                                        | Modelo/migración/ruta/transacción y detalle: 125/125, salida 0, tras actualizar dos inventarios de tablas para la octava entidad aprobada. |
| Contrato de comentarios             | Nueva prueba OpenAPI: respuesta 201 sin esquema `content`; salida 1.                                                                                                                                                    | Decoradores/esquemas y detalle actualizados: 126/126, salida 0; tipos cliente regenerados.                                                 |
| Renderizado seguro y validación web | En el detalle no se encontraba el comentario literal con marcas HTML; salida 1. Comando: `mise exec -- pnpm --filter @nextriva/web exec vitest run src/incidents/IncidentScreen.test.tsx`.                              | Componente y cliente: 15/15, salida 0; ningún nodo `img`.                                                                                  |
| Foco después de guardar             | Nueva prueba de envío válido falló porque el foco permanecía en el encabezado; el campo estaba deshabilitado al intentar enfocarlo. Salida 1.                                                                           | Foco tras finalizar el estado ocupado, comprobado con espera por condición: 16/16, salida 0.                                               |
| Refactor de errores UI              | Pruebas de errores 403/404/409/503 como red de seguridad: 20/20, salida 0.                                                                                                                                              | Extracción de mensajes seguros para reducir complejidad y eliminar ternarios anidados; 20/20, salida 0.                                    |

Los guardas de cerrada/archivada y el orden de bloqueo se incluyeron junto a la primera transacción antes de escribir sus casos específicos. Esos casos tienen pruebas de regresión posteriores, pero **no tienen un RED independiente observado**. No se reconstruye un ciclo histórico ni se elimina temporalmente un control para presentarlo como TDD. Las pruebas de permisos reutilizan el acceso existente y acreditan su comportamiento con PostgreSQL; no se atribuye un RED nuevo a política reutilizada. La E2E se añadió después del GREEN unitario de texto seguro; es regresión real de navegador, no un RED E2E histórico.

## Verificaciones reales

Todas las ejecuciones de persistencia usan el runner existente, que valida la configuración de test, elimina la herencia de `DATABASE_URL`, crea una base PostgreSQL temporal independiente en 127.0.0.1:5433, aplica desde cero las seis migraciones y limpia únicamente esa base. No se ha cargado `.env.local` ni accedido a `nextriva_dev`. Credenciales de fixtures generadas en memoria y salida del runner redactada.

| Control                | Comando / resultado observado                                                                                                                                                                                                 | Salida |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Integración final      | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration`: 10 ficheros, 133/133                                                                                                    |      0 |
| Cobertura API          | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:coverage`: 36 ficheros, 313/313 en la repetición final                                                                                |      0 |
| Cobertura web final    | `mise exec -- pnpm --filter @nextriva/web test:coverage`: 19 ficheros, 162/162                                                                                                                                                |      0 |
| E2E Chromium final     | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:e2e`: 31/31, API y PostgreSQL reales; comentario literal persistido/recargado, móvil y envío con teclado/foco                         |      0 |
| OpenAPI                | `mise exec -- pnpm api:types`; `mise exec -- pnpm api:types:check`                                                                                                                                                            |      0 |
| Calidad                | `mise exec -- pnpm typecheck`; `mise exec -- pnpm lint`; `mise exec -- pnpm format:check`; `mise exec -- pnpm build`                                                                                                          |      0 |
| Evaluador de auditoría | `mise exec -- pnpm test:audit-baseline`: 35/35 del evaluador                                                                                                                                                                  |      0 |
| Auditoría real         | `mise exec -- pnpm audit --json`, informe en `/tmp/i061-audit.json`                                                                                                                                                           |      1 |
| Baseline               | `node scripts/check-audit-baseline.mjs --report /tmp/i061-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1`: exactamente tres excepciones Prisma del Issue #18, vigentes hasta 18/11/2026; ninguna nueva |      0 |
| Espacios del diff      | `git diff --check`                                                                                                                                                                                                            |      0 |

La integración incluye: HTTP/CSRF, permisos positivos/negativos y UUID, retirada de acceso sin borrar autoría, FK, ausencia de filas tras rechazo, estado pendiente/cerrado/archivado, orden con fechas empatadas y rollback con error técnico seguro. Las carreras fuerzan una transacción de archivo o cierre pendiente; observan la espera real mediante `pg_stat_activity`/`pg_blocking_pids`, confirman el bloqueo, liberan la transacción y verifican HTTP 409 y cero comentarios añadidos. No hay esperas arbitrarias para decidir el orden.

Fallos intermedios declarados: inventarios de tablas/rutas no actualizados al nuevo contrato; consulta de catálogo necesitó `confdeltype::text` porque el adaptador no deserializa el tipo PostgreSQL `char`; una prueba de borrado Prisma devolvió P2039 y se sustituyó por comprobación explícita de FK restrictivas en catálogo, conservando pruebas reales de FK de alta P2003. Se observaron también dos carreras de conteos globales en tests existentes (participantes E2E e integración) durante ejecución paralela. Las nuevas pruebas se ajustaron para reutilizar fixtures existentes y no introducir altas de promociones/participantes; no se cambiaron las aserciones ajenas ni se serializó el runner. Las ejecuciones finales pasaron; la fragilidad previa de conteos globales entre ficheros sigue como riesgo de infraestructura de pruebas.

## Cobertura y seguridad

| Ámbito                               |  Líneas |   Ramas |
| ------------------------------------ | ------: | ------: |
| API global medida                    | 92,32 % | 87,71 % |
| API `src/incidents`                  | 98,98 % | 85,07 % |
| Validación de dominio de incidencias |   100 % |   100 % |
| Web global                           | 96,08 % | 91,13 % |
| Web `src/incidents`                  |   100 % | 91,03 % |
| Componente de comentarios            |   100 % | 88,88 % |

No se cambian umbrales ni exclusiones. Los umbrales configurados globales pasan. El objetivo adicional del 90 % de ramas no se alcanza en todo el agregado del módulo API (incluye HTTP/persistencia); no debe confundirse el 100 % de la validación pura con cobertura completa del módulo. La autorización se contrasta también con pruebas reales por recurso y ausencia de mutaciones.

No se añaden dependencias ni excepciones de auditoría. Se reutilizan sesiones y CSRF; no hay almacenamiento de credenciales en navegador ni nuevos mecanismos criptográficos. Los comentarios se interpolan como texto; la E2E confirma ausencia de elemento `img` y de ejecución del manejador. Un fallo de PostgreSQL conserva HTTP 503 con mensaje genérico; no se transforma indiscriminadamente en 400 ni revela el texto de la excepción. No se registran cuerpos de comentarios.

## Verificación humana pendiente

1. Con el entorno de desarrollo ya actualizado por su propietario, seguir los comandos vigentes de arranque del README y abrir `http://127.0.0.1:5173/`. Esta entrega no ejecuta migraciones, bootstrap ni limpieza sobre desarrollo.
2. Entrar con ADMIN, abrir una incidencia y comprobar vacío o comentarios existentes. Añadir texto, verificar autor/fecha y recargar: debe conservarse.
3. Probar texto vacío y `<img src=x onerror=window.__commentXss=true>`: el vacío debe avisar con foco y el segundo texto debe verse literalmente. Comprobar Tab, Shift+Tab y Enter, error recuperable y móvil.
4. Repetir con MANAGER vinculado y COLLABORATOR autor vinculado. Un UUID ajeno debe mostrar recurso no disponible; tras retirar el vínculo, consulta/escritura deben denegarse y ADMIN conservar el comentario histórico.
5. Confirmar el rechazo de promoción archivada y de incidencia cerrada con datos controlados ya existentes; no crear un endpoint de cierre ni modificar manualmente estados de desarrollo como parte de esta validación sin autorización.

VoiceOver y Safari/Firefox siguen pendientes; no se declara conformidad WCAG completa. El catálogo de ocho entidades queda completo, pero otras HU y el cierre futuro quedan fuera de esta microfase. La migración de desarrollo y su validación humana requieren autorización independiente. El diseño actual muestra el UUID del autor; una mejora de presentación del nombre puede evaluarse sin alterar su identidad histórica.

## Uso de herramientas de IA

Codex y un agente de implementación aplicaron el alcance del Issue aprobado, TDD observado y revisión de seguridad. Se utilizó la skill `sdd-apply` como guía de implementación y `cognitive-doc-design` para organizar esta evidencia; no se crearon artefactos SDD ni se alteraron referencias históricas. Los resultados proceden de comandos ejecutados; los límites TDD y fallos se conservan explícitos. No se realizaron operaciones de integración Git.
