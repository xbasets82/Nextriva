# Issue #105 — Rediseño del listado general de incidencias

## Alcance y trazabilidad

- Issue aprobada: [#105](https://github.com/xbasets82/Nextriva/issues/105).
- HU07 y HU15; mejora previa a I10, sin adelantar funcionalidades.
- Rama: `codex/incident-list-redesign`, desde `main` `63939d57614c1dd037fa1ff74d2ddc6d54b69273`.
- Estado: implementación y validación automatizada local; pendiente de validación humana y autorización de publicación.

El listado general solicita diez elementos por página, filtra automáticamente y muestra tarjetas compactas con código, título, promoción e indicadores accesibles reutilizados. La búsqueda espera 300 ms desde la última entrada; los selectores se aplican directamente. La navegación al detalle conserva filtros y página en el componente de la sesión autenticada; no usa almacenamiento persistente del navegador.

El servidor ordena por prioridad `HIGH`, `MEDIUM`, `LOW`, después fecha e ID descendentes, antes de paginar. Sustituye expresamente el orden de #77 para todos los consumidores. El API conserva `pageSize=20` por defecto y máximo 100. Se utiliza el orden del enum PostgreSQL ya existente y `orderBy` Prisma; no se modifica esquema ni migraciones.

`GET /api/incidents/filter-options` devuelve únicamente responsables distintos de incidencias visibles, con `id`, `firstName`, `lastName`, `email`. Incluye inactivos todavía asignados. Reutiliza la política de visibilidad mediante una relación Prisma filtrada en PostgreSQL, antes de devolver usuarios. No utiliza el directorio administrativo de usuarios. Las promociones proceden de `GET /api/promotions` bajo la autorización vigente. OpenAPI y cliente generado incluyen el contrato.

## TDD observado

### Orden prioritario antes de paginar

1. Se añadió una prueba HTTP/PostgreSQL con LOW reciente, MEDIUM intermedia y dos HIGH antiguos con fecha idéntica; se consultaron cuatro páginas de tamaño uno.
2. Primera preparación fallida: la promoción activa no tenía fase y PostgreSQL rechazó el fixture. No cuenta como RED. Se añadió su fase `PLANNING` y se repitió.
3. RED real: `mise exec -- pnpm --filter @nextriva/api test:integration`, salida 1; los IDs recibidos correspondían a LOW/MEDIUM primero, frente a HIGH/HIGH/MEDIUM/LOW esperados.
4. GREEN: mismo comando, salida 0; 208 pruebas superadas y dos omisiones existentes.
5. Cambio mínimo: `orderBy` prioridad descendente y después fecha e ID descendentes. No requiere SQL concatenado ni cambios de enum.

### Opciones autorizadas

1. Prueba de ADMIN/MANAGER/COLLABORATOR con dos promociones, autoría propia/ajena, responsables inactivos, duplicados y retirada de vinculación.
2. RED: integración salida 1; `/api/incidents/filter-options` devolvía 400 al interpretarse como UUID de detalle, frente al 200 esperado.
3. GREEN: integración salida 0; 209 pruebas superadas, dos omisiones existentes. Se declaró la ruta fija antes del detalle y se aplicó el ámbito en la consulta relacional.
4. Se verificaron ausencia de duplicados, nombres/email aprobados, 401 anónimo, revocación y conservación de incidencias/actividades.

### Filtros automáticos y accesibilidad

1. RED web: `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentsScreen.test.tsx`, salida 1; seguía existiendo Buscar, frente al filtrado automático solicitado.
2. GREEN dirigido: ocho pruebas superadas, salida 0. Incluye reloj controlado (ninguna consulta a 299 ms y una a 300 ms), descarte de respuesta antigua, página 10, opciones por nombre/ID, limpieza, foco y conservación de filtros/página al volver.
3. RED E2E adicional real: 51 de 53 pruebas superadas; los dos nuevos casos por rol no localizaban `Responsable` mediante etiqueta exacta tras poblar opciones, aunque las respuestas HTTP eran 200.
4. Se sustituyó la etiqueta implícita que envolvía el selector por `label htmlFor` y `select id` generado con `useId`.
5. GREEN: E2E completo, 53 de 53, salida 0, 19,9 s. Los casos nuevos comprueban opciones visibles, ausencia de promoción privada, filtro por responsable, UUID privado 404 y datos/actividades sin cambios.

**Limitación TDD:** algunos subcomportamientos visuales y la conservación del contexto se incorporaron durante el mismo GREEN de UI antes de disponer de un RED individual. Sus pruebas son regresiones posteriores; no se reconstruyen RED históricos ni se afirma un ciclo separado para cada detalle. Los tests anteriores se adaptaron al contrato visual aprobado: iconos en vez de etiquetas textuales, diez resultados y filtros automáticos. La prueba de autenticación conserva la prohibición de consultar `/api/users`; `GET /api/promotions` ahora es una fuente autorizada necesaria para el filtro.

## Verificaciones finales observadas

Todos los comandos se ejecutaron desde la raíz con Node y pnpm fijados por `mise` y los manifiestos. Las pruebas persistentes usaron exclusivamente bases PostgreSQL temporales independientes del runner seguro en `127.0.0.1:5433`. No se cargó `.env.local` ni se utilizó `nextriva_dev`.

| Comando                                                                                                                                               | Resultado observado                                                                                               | Salida |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/api test`                                                                                                       | 259/259 unitarias, 31 archivos                                                                                    | 0      |
| `mise exec -- node scripts/test-integration.mjs --isolated-validator-test`                                                                            | Caso sin validador independiente superado en base aislada; otros 94 casos del archivo no seleccionados por diseño | 0      |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                              | 301 pruebas, 22 archivos; umbrales superados                                                                      | 0      |
| `mise exec -- pnpm --filter @nextriva/api test:coverage`                                                                                              | 469 pruebas, 43 archivos; dos omisiones del runner compartido declaradas abajo                                    | 0      |
| `mise exec -- env NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 pnpm --filter @nextriva/api test:e2e`                                         | 53/53, Chromium con API y PostgreSQL reales, 19,9 s                                                               | 0      |
| `mise exec -- pnpm api:types`                                                                                                                         | Cliente regenerado desde OpenAPI real con openapi-typescript 7.10.1                                               | 0      |
| `mise exec -- pnpm api:types:check`                                                                                                                   | Regeneración reproducible sin diferencias                                                                         | 0      |
| `mise exec -- pnpm typecheck`                                                                                                                         | API y web                                                                                                         | 0      |
| `mise exec -- pnpm lint`                                                                                                                              | Sin infracciones                                                                                                  | 0      |
| `mise exec -- pnpm format:check`                                                                                                                      | Formato comprobado                                                                                                | 0      |
| `mise exec -- pnpm build`                                                                                                                             | API y web                                                                                                         | 0      |
| `mise exec -- pnpm audit --json`                                                                                                                      | Una vulnerabilidad Multer ya exceptuada; ningún aviso nuevo                                                       | 1      |
| `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-105-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1` | Baseline estricto superado; única excepción temporal GHSA-q7qp-rjg7-q26m, caduca 23/11/2026                       | 0      |
| `mise exec -- pnpm test:audit-baseline`                                                                                                               | 30/30 pruebas del evaluador del baseline                                                                          | 0      |
| `git diff --check`                                                                                                                                    | Sin errores de espacios                                                                                           | 0      |

Cobertura medida:

| Ámbito                             | Líneas  | Ramas   | Funciones | Sentencias |
| ---------------------------------- | ------- | ------- | --------- | ---------- |
| API (unitarias e integración real) | 91,61 % | 86,29 % | 95,55 %   | 90,29 %    |
| Web                                | 95,39 % | 90,45 % | 95,77 %   | 94,21 %    |

Las omisiones preexistentes del runner compartido corresponden al escenario sin validador independiente, ejecutado también localmente con resultado 1/1 y mediante el runner aislado obligatorio en CI, y al modo específico de backup/restauración (fuera del alcance de esta mejora). Se conserva su separación de aislamiento; no se debilitaron umbrales ni aserciones.

## Fallos y límites observados

- La primera E2E completa terminó 49/51: un test de comentarios esperaba el control de logout tras login y un fixture de participantes perdió el contexto JavaScript durante navegación. La traza del primero no registraba POST login; no se ha demostrado una causa raíz común. Una repetición completa sin cambios a esos tests pasó 51/51. El resultado final ampliado pasó 53/53. Se conservan estos fallos como observaciones, sin ocultarlos con reintentos automáticos ni relajar aserciones.
- Una primera cobertura API falló porque la lista exacta de rutas OpenAPI aún no incluía el nuevo endpoint aprobado; se actualizó su expectativa manteniendo el listado exhaustivo.
- Typecheck detectó `toSorted` no incluido en la librería objetivo y propiedades opcionales con `undefined`; se usó copia con `sort` y eliminación de filtros ausentes, manteniendo el modo estricto.
- ESLint rechazó un hash sintético fijo del fixture; se reemplazó por Argon2id de contraseña aleatoria.
- No se introdujeron dependencias, migraciones, backfill, entidades ni modificaciones de permisos.
- VoiceOver, Safari y Firefox y la validación visual humana permanecen pendientes. Las pruebas Chromium incluyen móvil; no acreditan conformidad WCAG completa.

## Validación manual propuesta

1. Iniciar la aplicación con los comandos de desarrollo documentados, sin ejecutar migraciones ni seed por esta mejora.
2. Entrar como ADMIN y abrir Incidencias; comprobar diez tarjetas por página, nombres de promociones, iconos con foco/tooltip y prioridad alta antes de media/baja.
3. Escribir parte de un código/título y seleccionar promoción, responsable, estado, categoría y prioridad; comprobar filtro automático y vuelta a página 1.
4. Avanzar página, abrir un detalle y usar Volver a incidencias; comprobar que conserva filtros y página.
5. Limpiar filtros mediante icono, cerrar sesión y entrar con un rol menor; comprobar que opciones y registros respetan sus vinculaciones y autoría/responsabilidad.
6. Repetir con teclado y móvil; completar VoiceOver y otros navegadores por separado.

## Corrección de carga independiente de opciones

Tras la validación inicial se informó que no aparecían promociones en las tarjetas ni en el filtro y tampoco responsables en el selector. Se reprodujo una fragilidad: la carga conjunta con `Promise.all` hacía que un error en cualquiera de las dos fuentes (`/api/promotions` o `/api/incidents/filter-options`) dejara ambas opciones indisponibles.

- RED: dos pruebas dirigidas fallaron con salida 1 al simular por separado el fallo de cada endpoint; cada caso comprobó que los datos de la fuente que respondía correctamente no debían desaparecer.
- GREEN: la suite web pasó 303/303, salida 0. Typecheck, ESLint focalizado, Prettier y `git diff --check` también terminaron con salida 0.
- La carga, error y reintento ahora son independientes para promociones y responsables. La API local en `127.0.0.1:4317` respondió 401 sin sesión a ambas rutas, confirmando que existen; no se inspeccionó una respuesta autenticada ni se modificaron datos de desarrollo.
- Si tras recargar la interfaz el selector de responsables queda vacío, la comprobación pendiente es si `filter-options` devuelve una lista vacía para los incidentes visibles del usuario; no se añade un directorio global de usuarios ni se amplía el ámbito de acceso.

## Diagnóstico del backend local desactualizado

La revisión posterior confirmó el motivo por el que el selector seguía sin opciones en la aplicación abierta: el proceso vivo de API en `127.0.0.1:4317` y el proxy de `127.0.0.1:5173` exponen OpenAPI con `/api/incidents`, pero sin `/api/incidents/filter-options` (HTTP 200 en ambos documentos). En cambio, el código fuente y `apps/api/dist/src/incidents/incidents.controller.js` ya contienen la ruta. El proceso Node cargó una versión anterior al build y debe reiniciarse para registrar el endpoint.

La comprobación fue de solo lectura; no se enviaron cookies ni se consultó `nextriva_dev`. No falta migración: este cambio no añade esquema. Tras reiniciar, el resultado autenticado esperado es HTTP 200 con `{ assignees: [...] }`; `assignees: []` solo sería válido si no hay responsables en incidencias visibles para ese usuario.

## Uso de IA

Codex se utilizó para analizar el listado, redactar pruebas, implementar el cambio autorizado y ejecutar los comandos registrados. Los resultados proceden de ejecuciones reales; la revisión y validación humana de producto siguen pendientes. No se publicaron cambios ni se realizaron commits desde esta tarea.
