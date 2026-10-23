# Evidencia TFM — I07.3: Validación y rechazo de soluciones

## Identificación y alcance

- HU13; Issue [#73](https://github.com/xbasets82/Nextriva/issues/73), `status:approved` verificado antes de desarrollar.
- Rama `codex/i07-3-incident-validation`, base `main` `fea96cab0ae0367c2e7d20dd2fb483235aa9d91c`.
- Aprobación independiente, rechazo motivado, instantánea histórica, dos campos de cierre previstos, API/OpenAPI y UI. Sin entidades o eventos nuevos, notificaciones ni avance a I08.
- [Planificación y decisiones](../../planning/I07.3-incident-validation.md). No hay commit, push, PR ni merge de I07.3 autorizados.

## Diseño aplicado y revisión

`IncidentsStore` coordina ambas operaciones con una implementación transaccional reutilizable. La política central impide validar al presentador; la consulta persistente aplica el ámbito de la promoción. Estado, versión y actividad se guardan de forma atómica. Los datos de actor/fecha proceden del servidor. Se mantienen sesión, CSRF y validación de origen; errores inesperados conservan 503 saneado y no se convierten en 400 genéricamente.

La migración `20261023210000_incident_validation` añade `validated_by_id`/`closed_at`, FK y checks para el par y la independencia de cierre registrado. No rellena metadatos históricos ni añade entidades. La operación nueva siempre escribe el par al cerrar. La historia del rechazo usa JSON estructurado existente; modificaciones posteriores del borrador no la cambian. OpenAPI añade una variante estricta del evento existente.

La UI presenta texto escapado por React, confirma cierre, exige motivo accesible, evita envíos duplicados y distingue errores mediante mensajes seguros. La visibilidad de botones solo orienta: los permisos se comprueban en servidor.

## TDD realmente observado

| Ciclo                      | RED observado, salida 1                                                                                                                                          | GREEN / revisión                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aprobación HTTP            | `test:integration`: nueva prueba esperaba 200 y recibió 404 por ruta ausente; 187 anteriores pasaron, 1 caso dedicado omitido.                                   | Ruta, migración y operación mínimas: 188 pasadas, 1 omitida; salida 0. Revisión de versión y actividad atómica.                                                  |
| Motivo de rechazo          | `vitest run src/incidents/incident.validation.test.ts`: `newIncidentSolutionRejection is not a function`, interfaz aún ausente; 25 anteriores pasaron y 1 falló. | Parser estricto de motivo/versión: 26/26, salida 0. Este fallo corresponde a interfaz ausente; no se presenta como un RED histórico de la política ya existente. |
| Rechazo HTTP e instantánea | `test:integration`: rechazo esperaba 200 y recibió 404 por ruta ausente; 188 anteriores pasaron, 1 omitida.                                                      | Rechazo y JSON histórico implementados: 189 pasadas, 1 omitida; salida 0. La prueba vacía/revisa/re-presenta y confirma que la instantánea no cambia.            |
| UI de aprobación/rechazo   | `vitest run src/incidents/IncidentScreen.test.tsx`: no encontraba botones Aprobar/Rechazar; 2 fallaron y 46 anteriores pasaron.                                  | Componente y cliente añadidos: 48/48; ampliación de regresión posterior: 59/59, salida 0.                                                                        |

Se observó además un defecto nuevo al revisar el límite del motivo: `String.length` contaba unidades UTF-16. Dos tests nuevos de política/parser produjeron RED real (2 fallidos y 65 pasados), porque 2.000 emojis válidos eran rechazados. La UI produjo RED real (1 fallido y 59 pasados), y HTTP produjo RED real al aceptar 4 emojis con 200 en vez del 400 esperado. La corrección usa puntos de código Unicode en los tres límites, conforme a `maxLength` y a la convención de I07.2; no cambia 5–2.000. GREEN unitario: 67/67, salida 0. La primera repetición HTTP encontró un fallo del selector del nuevo test: `findFirst` elegía la transición de inicio, no la actividad de rechazo; se corrigió para exigir exactamente una actividad añadida con su motivo completo. Ese fallo del test no se clasifica como RED funcional.

La matriz de transiciones de dominio ya estaba implementada en I07.1. Sus pruebas nuevas son ampliación de regresión observada, sin reconstruir RED anteriores. Los negativos HTTP, carreras, rollback, constraints y E2E se añadieron como verificaciones de la operación transaccional reutilizada tras los ciclos principales; no se atribuye un RED individual no observado a cada uno. Esta es una limitación de granularidad TDD que debe conservarse para la revisión humana.

El refactor centralizó el permiso del revisor y la comprobación de transición, compartió la operación transaccional y reutilizó el helper de instantáneas de tests, conservando expectativas. Se repiten pruebas y controles afectados tras el cambio.

## Ejecuciones y fallos registrados

- Integración ampliada previa: 197 pasadas, 1 omitida dedicada; salida 0. Incluye carreras con dos conexiones PostgreSQL, barrera determinista sin sleeps y rollback de ambas operaciones.
- E2E inicial: salida 1 antes de ejecutar tests porque el puerto 4317 estaba ocupado. No se detuvo ni reutilizó el servidor ajeno. No se clasifica como RED funcional.
- E2E con puertos alternativos admitidos por la configuración (`NEXTRIVA_E2E_API_PORT=4327`, `NEXTRIVA_E2E_WEB_PORT=5183`): 36/36 Chromium, 13,8 s, salida 0. Dos contextos/sesiones reales presentan, rechazan, revisan/vacían, re-presentan y aprueban. Se verifican persistencia, historia inmutable, teclado y móvil.
- Unitarias API iniciales: 249 pasadas y 1 fallo del inventario OpenAPI de rutas, que todavía enumeraba los endpoints anteriores. Se añadieron exactamente las dos rutas nuevas al inventario sin retirar ninguna comprobación existente.
- Typecheck inicial: salida 2 por propiedades opcionales exactas del nuevo componente; corregido el tipado. Repetición: salida 0.
- ESLint inicial: salida 1 por helper de snapshot duplicado; se reutilizó el existente. Una repetición detectó redundancia entre `?` y `undefined`; se ajustó el tipo sin desactivar reglas.
- Cobertura API inicial: salida 1; 449 pasadas, 1 fallida y 1 omitida. El test previo `promotions.validation.integration.test.ts:575` contó globalmente promociones y observó 13 en lugar de 12 durante escrituras de otro fixture. Se conserva el fallo como interferencia, sin alterar la aserción ni el archivo ajeno a I07.3. También se identificó su trigger global previo. El resultado posterior se registra en la tabla final.

## Resultados finales

Todas las ejecuciones finales siguientes terminaron con código **0**. Los resultados previos fallidos se conservan arriba; no se borraron ni se debilitaron aserciones.

| Control                          | Comando real desde la raíz                                                                                                                                 | Resultado final                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unitarias API                    | `mise exec -- pnpm --filter @nextriva/api test`                                                                                                            | 252/252; 30 archivos.                                                                                        |
| Unitarias web y cobertura        | `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                                   | 205/205; 20 archivos.                                                                                        |
| Integración HTTP/PostgreSQL      | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration`                                                       | 202 pasadas; 1 omitida dedicada; 12 archivos. Incluye Unicode, tres órdenes de carrera y rollback.           |
| Caso dedicado sin validador      | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api exec node ../../scripts/test-integration.mjs --isolated-validator-test` | 1 pasada; 88 filtradas explícitamente por nombre. El caso omitido en la suite compartida sí se ejecutó aquí. |
| Cobertura API con PostgreSQL     | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:coverage`                                                          | 454 pasadas y 1 omitida dedicada; 42 archivos.                                                               |
| E2E Chromium con API/PG reales   | `env -u DATABASE_URL -u TEST_DATABASE_URL NEXTRIVA_E2E_API_PORT=4327 NEXTRIVA_E2E_WEB_PORT=5183 mise exec -- pnpm --filter @nextriva/api test:e2e`         | 36/36; última ejecución 13,8 s, con código final.                                                            |
| Contrato/tipos                   | `mise exec -- pnpm api:types:check`                                                                                                                        | Esquema exportado y tipos generados coinciden.                                                               |
| TypeScript                       | `mise exec -- pnpm typecheck`                                                                                                                              | API y web sin errores.                                                                                       |
| ESLint/SonarJS                   | `mise exec -- pnpm lint`                                                                                                                                   | Sin errores ni reglas desactivadas.                                                                          |
| Prettier                         | `mise exec -- pnpm format:check`                                                                                                                           | Correcto. Documentación cambiada comprobada además explícitamente con Prettier.                              |
| Build                            | `mise exec -- pnpm build`                                                                                                                                  | API y web construidos correctamente; artefactos ignorados.                                                   |
| Auditoría                        | `mise exec -- pnpm audit --json`                                                                                                                           | 0 vulnerabilidades de todas las severidades.                                                                 |
| Evaluador baseline               | `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/i073-audit.json --baseline .github/audit-baseline.json --audit-exit-code 0`              | 0 excepciones; baseline intacto.                                                                             |
| Pruebas de baseline              | `mise exec -- pnpm test:audit-baseline`                                                                                                                    | 24/24.                                                                                                       |
| Seguridad de runner y generación | `mise exec -- node --test scripts/test-database-config.test.mjs scripts/test-output.test.mjs scripts/generate-api-types.test.mjs`                          | 51/51.                                                                                                       |
| Espacios del diff                | `git diff --check`                                                                                                                                         | Sin errores.                                                                                                 |

| Cobertura final          | Líneas | Ramas  | Funciones | Sentencias |
| ------------------------ | ------ | ------ | --------- | ---------- |
| API global               | 90,68% | 85,45% | 95,21%    | 89,38%     |
| API `src/incidents`      | 97,70% | 88,21% | 100%      | 93,38%     |
| Política de estados      | 97,29% | 98,14% | 100%      | 97,29%     |
| Web global               | 95,86% | 89,96% | 98,23%    | 94,54%     |
| Web `IncidentReview.tsx` | 100%   | 97,77% | 100%      | 98%        |

Se mantienen los umbrales globales configurados y ratificados de 80% líneas/75% ramas; no se rebajó ningún umbral ni se excluyó lógica. El objetivo de 90% por subárea sigue siendo propuesta no ratificada en la matriz; no se presenta el agregado de módulo como cumplimiento de un umbral no aprobado.

La revisión de archivos modificados y nuevos no encontró cadenas de conexión, claves privadas, cookies reales, tokens GitHub ni artefactos/locales accidentales en el diff. Es una revisión por patrones y del contenido, no una garantía absoluta de detección de secretos. La generación Prisma y las 11 migraciones se aplicaron desde cero en los runners temporales. Se comprobó además por consulta al PostgreSQL de pruebas la desaparición de las bases temporales creadas por las ejecuciones revisadas; no se eliminaron bases ajenas.

La interferencia preexistente del conteo/trigger global de I03.1 sigue sin corregir y se conserva como riesgo de fiabilidad de la suite. Las últimas integración, cobertura y E2E completas pasaron sin modificar ese fixture. No se atribuye una corrección a un fallo que solo se investigó.

## Validación manual y límites

La migración se aplica exclusivamente a PostgreSQL temporal durante estas verificaciones; `nextriva_dev` no se ha usado ni modificado. Para probar la UI en desarrollo, aplicar esa migración a desarrollo requiere autorización específica adicional. Tras disponer de esquema actualizado, iniciar con los comandos documentados en README desde la raíz:

```bash
mise exec -- pnpm build
NODE_ENV=development PORT=4317 AUTH_ORIGIN=http://127.0.0.1:5173 AUTH_LOCAL_HTTP=true mise exec -- node --env-file=.env.local apps/api/dist/src/main.js
```

En otra terminal:

```bash
API_PROXY_TARGET=http://127.0.0.1:4317 mise exec -- pnpm --filter @nextriva/web dev --host 127.0.0.1 --port 5173 --strictPort
```

1. Abrir `http://127.0.0.1:5173/` con dos perfiles de navegador o una ventana privada para tener sesiones independientes.
2. Con el responsable de una incidencia En curso en promoción activa, guardar una solución y enviarla a validación.
3. Con ADMIN o MANAGER vinculado distinto del presentador, abrirla. Rechazar con motivo: debe volver a En curso conservando el borrador. Un motivo de menos de 5 caracteres debe anunciar error y enfocar el campo.
4. Con el responsable, vaciar/corregir y reenviar. Con el revisor, Aprobar solución y confirmar: debe quedar Cerrada después de recargar.
5. Comprobar en DBeaver, sin modificar datos, la fila de incidencia, versión, validador/fecha y las actividades de rechazo/cierre. La instantánea de rechazo debe conservar la primera propuesta aunque el borrador se haya cambiado.
6. Comprobar Tab, Shift+Tab, Enter, Escape y foco. VoiceOver, Safari y Firefox permanecen pendientes de validación manual. No se declara conformidad WCAG completa.

No se ha publicado el cambio. La revisión humana debe aceptar las limitaciones TDD y completar las verificaciones manuales antes de autorizar integración.

## Uso de herramientas de IA

Codex asistió en lectura de fuentes/Issue, pruebas, implementación y documentación, con un agente escritor y coordinación/revisión humana posterior. Solo se registran ejecuciones observadas; la aprobación del producto y la autorización de publicación corresponden al usuario. No se incorporan credenciales, URLs de base de datos ni textos privados en esta evidencia.
