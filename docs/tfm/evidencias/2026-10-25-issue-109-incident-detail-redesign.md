# Issue #109 — Rediseño del detalle de incidencias

## Alcance y estado

Issue [#109](https://github.com/xbasets82/Nextriva/issues/109), comprobada con `status:approved`; rama `codex/issue-109-incident-detail-redesign` desde `main` `8178961550950ddf788778c41edba2ff741a1048`. Mejora de presentación sobre HU07 y HU09–HU14, independiente de I10. Implementación local pendiente de validación humana. No se realiza commit, push, PR ni merge.

La ficha integra código, título, descripción, categoría, fase de origen e indicadores existentes de estado/prioridad. Los retornos usan iconos distintos (`list` y `building-2`), nombres accesibles y el tooltip ya disponible. El nombre de promoción se obtiene mediante `GET /api/promotions/:id` y solo se enlaza si esa consulta autorizada tiene éxito; los errores 403/404/503 omiten el enlace sin ocultar el detalle autorizado ni mostrar UUID o diagnóstico privado.

Se compactan responsable, inicio, solución, revisión y comentarios. Los controles existentes conservan sus operaciones, cuerpos, versiones, permisos orientativos y mensajes. La asignación utiliza un `select` nativo con la flecha reutilizada y padding derecho. Publicar comentario se presenta mediante icono `send` y nombre accesible «Publicar comentario»; el nombre del formulario sigue siendo «Añadir comentario». Se mantienen carga, bloqueo de envíos duplicados, confirmación de aprobación, foco y teclado.

Los estados de solución se describen a partir de campos existentes: borrador, presentada con metadatos de presentación, aprobada con validador/fecha de cierre. Las propuestas rechazadas solo se presentan cuando una actividad `STATUS_CHANGED` de Pendiente a En curso contiene el texto histórico, motivo y fechas. El lector frontend conserva una proyección de esos campos ya entregados por el contrato vigente; no hay nuevas llamadas de escritura ni cambios de servidor, OpenAPI o tipos generados. La propuesta histórica se distingue del borrador actual y se muestra como texto inerte en un desplegable nativo. No se inventan actividades ni se hace backfill. El nuevo historial se recibe al consultar/recargar el detalle; las respuestas de mutación siguen siendo las existentes.

No se incorpora edición general HU08 ni nuevos endpoints, permisos, estados, dependencias, esquema o migraciones. Las referencias históricas no se modifican.

## TDD observado

1. **RED 1:** se añadieron cinco pruebas del nombre/enlace autorizado, retornos diferenciados/indicadores, ausencia de enlaces de promoción en 403/404/503 y publicación accesible de texto HTML inerte. `mise exec -- pnpm --filter @nextriva/web test -- src/incidents/IncidentScreen.test.tsx` terminó con código 1: 5 fallidas y 310 superadas. Los fallos fueron la ausencia de nombre/enlace, enlaces de retorno aún expuestos y la ausencia del botón «Publicar comentario». El separador `--` hizo que se ejecutase la suite web completa.
2. **GREEN 1:** mismo comando, código 0: 315/315 pruebas, 22 archivos.
3. **RED 2:** se añadieron cinco casos: selector con chevron/acción accesible, etiquetas de borrador/presentación/aprobación y propuesta rechazada separada del borrador posterior. `mise exec -- pnpm --filter @nextriva/web test` terminó con código 1: 5 fallidas y 315 superadas. Los fallos correspondieron al selector sin la presentación aprobada y a las etiquetas/historia todavía ausentes.
4. **GREEN 2:** `mise exec -- pnpm --filter @nextriva/web test`, código 0: 320/320.
5. **REFACTOR:** se reutilizaron acciones, iconos, tooltip y flecha de promociones. Se añadieron únicamente los iconos necesarios y la opción `type="submit"` al componente compartido, manteniendo `button` como valor por defecto. El primer lint detectó una condición ternaria anidada en la etiqueta de solución (código 1). Se extrajo a una decisión explícita sin cambiar reglas ni desactivar SonarJS. Lint y cobertura posteriores, código 0.

6. **Regresión de foco detectada en revisión:** el coordinador observó una ejecución completa con 319/320 superadas: al validar un motivo vacío el foco terminó en el título, aunque la textarea ya estaba marcada inválida. Las repeticiones iniciales focalizada (1/1), archivo (70/70) y suite (320/320) pasaron, por lo que el fallo era intermitente. Se conservó la aserción original.
7. **RED determinista del foco:** una prueba nueva observa la inserción real del formulario mediante `MutationObserver` y dispara un evento nativo de envío inmediatamente cuando queda disponible, sin esperas arbitrarias ni mocks de React. `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentScreen.test.tsx -t '109 keeps validation focus'` falló: esperaba textarea inválida enfocada y recibió `h2` (1 fallida, 70 omitidas, código 1). Confirma que el efecto pasivo inicial de enfoque podía ejecutarse después de la validación. La consulta adicional de promoción introducida en este rediseño cambió la secuencia asíncrona que exponía esa carrera.
8. **GREEN del foco:** se cambió exclusivamente el efecto de enfoque del título a `useLayoutEffect`, conservando sus dependencias y la lógica de validación. El enfoque inicial se ejecuta durante el commit antes de que el formulario pueda recibir la interacción nativa. Mismo comando: 1 superada, 70 omitidas, código 0. La suite completa con cobertura pasó después 321/321, sin debilitar la aserción existente. Typecheck, lint y formato también volvieron a pasar con código 0.

Las modificaciones meramente visuales de espaciados, tipografía y disposición se verifican mediante regresión y viewport; no se simulan RED adicionales para CSS ni para comportamiento previamente existente. Los E2E existentes se adaptaron únicamente al nuevo nombre accesible aprobado del botón de comentario y se ampliaron con comprobaciones de cabecera, tooltip y propuesta rechazada. No se redujeron sus aserciones de persistencia, autorización o XSS.

## Verificaciones observadas

| Comando desde la raíz                                                                                     | Resultado                                                                                                                              | Código |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                  | 321/321; 22 archivos. Líneas 95,75%; ramas 91,03%; funciones 96,65%; sentencias 94,55%.                                                | 0      |
| `mise exec -- pnpm typecheck`                                                                             | API y web correctas.                                                                                                                   | 0      |
| `mise exec -- pnpm lint`                                                                                  | Sin infracciones tras el refactor de etiqueta.                                                                                         | 0      |
| `mise exec -- pnpm format:check`                                                                          | Todos los archivos comprobados respetan Prettier.                                                                                      | 0      |
| `mise exec -- pnpm api:types:check`                                                                       | OpenAPI y tipos reproducibles, sin cambios.                                                                                            | 0      |
| `mise exec -- pnpm build`                                                                                 | Compilan API y web.                                                                                                                    | 0      |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | 57/57 en Chromium, API y PostgreSQL temporal reales; 23,3 s tras el ajuste visual de responsable (anteriores: 57/57, 22,0 s y 33,6 s). | 0      |
| `git diff --check`                                                                                        | Sin errores de whitespace.                                                                                                             | 0      |

La primera ejecución con `mise exec -- pnpm --filter @nextriva/api test:e2e` terminó con código 1 antes de ejecutar tests: el puerto 4317 estaba ocupado. El runner creó/aplicó las 12 migraciones existentes en una base temporal y ejecutó su limpieza al terminar. Se comprobaron las variables soportadas en `playwright.config.ts` y se repitió con 4318/5174; no se detuvo ningún servicio local ni se modificó `reuseExistingServer: false`, el runner, las migraciones o los tests para ocultar el conflicto.

Tras el ajuste visual solicitado para responsable se observó otra ejecución E2E con 54/57, código 1. El caso de rechazo/revisión no llegó a Pendiente porque su `PUT /solution` fue interrumpido (estado de red -1) por una navegación completa no solicitada; la prueba de estado de usuarios había recibido PATCH 200, pero perdió el formulario/foco por la misma recarga. Los traces muestran documentos nuevos en las tres páginas a las 18:31:05.972–.974 UTC. El fichero `IncidentScreen.test.tsx` fue formateado a las 18:31:05.930 UTC mientras Vite estaba activo; el coordinador confirmó esa escritura concurrente. La recarga global por HMR invalidó la ejecución. El tercer fallo, «Página 2 de 3», mostró duplicación de los fixtures `Page fixture` después del reinicio del worker provocado por el fallo anterior (cinco páginas en vez de tres). No se modificó lógica de usuarios ni se relajaron las aserciones. Con todos los archivos estables se repitió exclusivamente el comando E2E seguro, sin escrituras/build concurrentes: 57/57 en 23,3 s, código 0, incluidos los tres casos. El runner actual no transmite filtros de spec/test adicionales; no se modificó para esta comprobación.

El runner rechaza cualquier `DATABASE_URL` heredada, valida `TEST_DATABASE_URL`, usa exclusivamente la infraestructura local de pruebas en `127.0.0.1:5433`, crea la base temporal de la ejecución y la elimina en `finally`. No se carga `.env.local` ni se consulta/modifica `nextriva_dev`.

Los umbrales web configurados siguen en 80% líneas/funciones/sentencias y 75% ramas; los resultados también superan 85% líneas/80% ramas. No se han rebajado ni añadido exclusiones. Cobertura API e integración Vitest separada no se repiten porque no se modifica servidor/persistencia; los E2E sí ejecutan las API reales y comprueban persistencia y denegaciones. La auditoría de dependencias no se repite porque no cambian manifiestos ni lockfile. Migración/backfill: no aplicables.

## Seguridad y revisión

La autorización sigue siendo del servidor. Se conservan las pruebas reales de asignación/denegación COLLABORATOR sin mutaciones, revocación, estados, guardado/envío, rechazo y aprobación independientes. Las pruebas verifican HTML inerte tanto en comentarios como en soluciones/motivos. No se muestran emails que el contrato del responsable no contiene. Se conservan controles de versiones, confirmaciones, errores seguros y las políticas existentes; el rediseño no concede acceso adicional.

La composición visual reutiliza controles existentes. Los componentes operativos mantienen su responsabilidad de presentar y ejecutar sus operaciones; la proyección de historial solo lee datos existentes. No se exportan datos internos al navegador fuera del contrato autorizado.

## Validación manual pendiente

1. Desde la aplicación local ya iniciada, autenticar un usuario y abrir una incidencia accesible desde el listado filtrado/paginado.
2. Revisar cabecera, promoción enlazada, estado/prioridad y los dos retornos; comprobar que volver al listado mantiene criterios y página en memoria.
3. Con ADMIN/MANAGER, asignar/reasignar y comprobar selector, foco, tooltip y errores existentes. Con COLLABORATOR, comprobar la ausencia de controles de asignación.
4. Con el responsable, iniciar cuando proceda, guardar y enviar solución. Con otro validador autorizado, rechazar con motivo; recargar y desplegar la propuesta histórica. Modificar el borrador y comprobar que el texto rechazado sigue separado. Repetir el flujo hasta aprobación.
5. Publicar comentario mediante teclado y revisar autor/fecha/texto. Comprobar móvil, tablet y escritorio.
6. VoiceOver, Safari y Firefox siguen pendientes. No se declara conformidad WCAG completa ni validación humana realizada.

La suite Chromium verifica teclado, confirmaciones, foco y ausencia de desbordamiento en viewport móvil. La evaluación visual humana sigue pendiente. El contexto de filtros/página se conserva en memoria durante navegación; la recarga completa conserva el comportamiento anterior.

## Uso de IA y límites

Codex se empleó para leer la Issue/fuentes, escribir pruebas, adaptar la presentación y ejecutar los controles registrados. Solo se documentan RED/GREEN observados. No se atribuye una ejecución manual inexistente ni se reconstruyen ciclos históricos.

## Ajuste posterior solicitado: fila de asignación

Tras la revisión humana se cambió la presentación del responsable actual para mostrar solo el nombre, sin el prefijo redundante «Responsable:». Se eliminó el rótulo «Nuevo responsable» y el selector ahora tiene el texto «Selecciona un nuevo responsable» tanto como opción inicial como nombre accesible. El selector y el botón de guardar comparten una fila flexible; la flecha y los permisos existentes se conservan.

Se modificó primero la prueba de presentación y se observó RED: aún no existía el nuevo nombre accesible ni el layout en una misma fila. La primera ejecución también señaló selectores antiguos en pruebas ya existentes; se actualizaron para el texto accesible aprobado y la expectativa estructural para verificar el contenedor flex común. No se cambiaron las aserciones funcionales de autorización, persistencia o errores. GREEN final: `mise exec -- pnpm --filter @nextriva/web test`, 321/321, código 0; cobertura posterior, 321/321, código 0; typecheck, lint, formato, OpenAPI y build, códigos 0; E2E con PostgreSQL temporal, 57/57, código 0.

## Ajuste posterior solicitado: opciones de revisión

La revisión de soluciones muestra inicialmente las acciones «Aprobar solución» y «Rechazar solución»; el motivo no se monta hasta elegir rechazar. Al hacerlo, el foco pasa al campo del motivo y se ofrecen «Cancelar rechazo» y «Confirmar rechazo». Cancelar cierra el formulario y devuelve el foco a la acción de rechazo. Aprobar conserva su diálogo de confirmación y ambas operaciones mantienen permisos, precondiciones, errores y contratos existentes.

RED: una prueba de pantalla comprobó que el motivo no estuviera visible antes de elegir rechazo; falló porque el formulario aparecía desde el inicio (1 fallida, 71 omitidas, código 1). GREEN/refactor: se añadió estado local explícito para abrir/cancelar el rechazo y pruebas para foco, cancelación, validación y envío. Se actualizaron las pruebas y el flujo E2E para confirmar el rechazo después de introducir el motivo; no se redujeron aserciones de persistencia, permisos ni atomicidad. `mise exec -- pnpm --filter @nextriva/web test`: 322/322, código 0. `mise exec -- pnpm --filter @nextriva/web test:coverage`: 322/322; 95,79% líneas y 91,07% ramas, código 0. E2E seguro con Chromium, API y PostgreSQL temporal: 57/57, código 0. Typecheck, lint, formato, OpenAPI, build y diff-check: código 0.

## Revisión final independiente: carga auxiliar de promoción

La revisión independiente observó que la ficha esperaba a `GET /api/promotions/:id` antes de abandonar el estado de carga, aunque `GET /api/incidents/:id` ya hubiera devuelto la incidencia. La API no garantiza un timeout para la consulta auxiliar.

**RED observado:** se agregó una prueba con la consulta de promoción pendiente indefinidamente y la respuesta de incidencia inmediata. `mise exec -- pnpm --filter @nextriva/web exec vitest run src/incidents/IncidentScreen.test.tsx -t 'shows the authorized incident while the auxiliary promotion lookup is pending'` falló por el motivo esperado: no apareció el encabezado de la incidencia y la pantalla quedó en «Consultando incidencia…» (1 fallida, 72 omitidas, código 1).

**GREEN/refactor:** la incidencia ahora se muestra y libera el estado de carga al completar su propia consulta; el nombre/enlace de promoción se carga de forma independiente y sigue ocultándose si falla la autorización o la consulta. No se modificaron APIs, permisos ni reglas de negocio. La prueba focalizada pasó (1/1, código 0), y la suite web completa pasó con 323/323 (22 archivos, código 0). La tabla siguiente contiene los resultados finales de cobertura y controles repetidos después de este ajuste.

### Verificación final tras el ajuste

| Comando                                                                                                   | Resultado observado                                                         | Código |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                  | 323/323; 95,79% líneas, 91,00% ramas, 96,69% funciones y 94,54% sentencias. | 0      |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | 57/57 con Chromium, API real y PostgreSQL temporal aislado; 22,8 s.         | 0      |
| `mise exec -- pnpm typecheck`                                                                             | API y web correctas.                                                        | 0      |
| `mise exec -- pnpm lint`                                                                                  | Sin infracciones.                                                           | 0      |
| `mise exec -- pnpm format:check`                                                                          | Archivos de código comprobados por Prettier.                                | 0      |
| `mise exec -- pnpm api:types:check`                                                                       | OpenAPI y tipos reproducibles, sin cambios.                                 | 0      |
| `mise exec -- pnpm build`                                                                                 | Compilan API y web.                                                         | 0      |
| `git diff --check`                                                                                        | Sin errores de whitespace.                                                  | 0      |

La suite de integración PostgreSQL separada no se repitió: el ajuste solo cambia cuándo se muestra el detalle en frontend y no modifica rutas, persistencia ni contrato. E2E sí volvió a ejecutar API y PostgreSQL temporal reales. La revisión visual humana, VoiceOver, Safari y Firefox continúan pendientes; no se declara conformidad WCAG completa.
