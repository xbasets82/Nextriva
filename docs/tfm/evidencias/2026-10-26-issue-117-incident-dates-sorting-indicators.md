# Issue #117 — Fechas, ordenación e indicadores de incidencias

## Alcance y trazabilidad

- Issue aprobada: [#117](https://github.com/xbasets82/Nextriva/issues/117).
- HU relacionadas: HU07, HU10 y HU15; mejora transversal previa a I10.
- Rama local: `feat/issue-117-incident-date-sorting-indicators`.
- Base actual: `main` integrado hasta `c374830f4e22caa4d07d02d7470702a39050f4bc`; incluye la integración de #118/#122.
- Estado: cambios locales sin commit; pendiente de validación humana. No hay migraciones ni cambios de esquema.

El trabajo añade `createdAt` en el listado general, lista de incidencias de promoción, detalle y Home. Las tarjetas usan fecha en formato `es-ES`; el detalle muestra fecha y hora. `Intl.DateTimeFormat` utiliza la zona horaria local del navegador y recibe el instante ISO enviado por el servidor. El campo no se modifica.

El listado general conserva el orden por defecto previamente consolidado: prioridad `HIGH`, `MEDIUM`, `LOW`, `createdAt DESC`, `id DESC`. Cuando se elige un campo, PostgreSQL ordena por prioridad, estado o fecha, con dirección ascendente/descendente, antes de la paginación. Prioridad y estado tienen desempate `createdAt DESC`, `id DESC`; fecha usa `id DESC`. El ámbito y los filtros existentes siguen formando parte de la consulta del servidor.

Los indicadores reutilizados asignan colores centralizados a cada estado y prioridad, conservando nombre accesible y tooltip. Se incluyen tonos claro/oscuro; el color no es la única señal.

## TDD observado

| Regla                          | RED observado                                                                                                                                                                                                                         | GREEN observado                                                                                                                            | Refactor / regresión                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Validación del orden           | Vitest de API: sortBy/direction aprobados se rechazaban como datos inválidos, salida 1.                                                                                                                                               | `mise exec -- pnpm --filter @nextriva/api test src/incidents/incident.validation.test.ts`: 29/29, salida 0.                                | `sortBy` sin dirección usa `desc`; dirección sin campo sigue siendo HTTP 400.                                                                 |
| Orden aplicado en PostgreSQL   | Integración HTTP: consulta ordenada recibía HTTP 400 antes de permitir los nuevos parámetros; el test de orden no podía verificar filas, salida 1.                                                                                    | Integración completa posterior: 226 pruebas pasaron y 2 se omitieron, salida 0. Incluye las tres claves y ambas direcciones entre páginas. | Orden Prisma con claves allowlist; sin SQL interpolado. El ámbito y filtros existentes se aplican antes de contar y paginar.                  |
| Serialización del cliente      | Vitest web esperaba `sortBy`/`sortDirection` en la URL y recibía la URL anterior, salida 1.                                                                                                                                           | Prueba del cliente: 15/15, salida 0.                                                                                                       | Se serializan los campos aprobados; los demás filtros se mantienen.                                                                           |
| Controles y reinicio de página | RED de Vitest: después de corregir selectores del fixture, no se encontró el control accesible «Ordenar por», salida 1.                                                                                                               | Prueba dirigida: 1/1, salida 0; conserva `category`, aplica sort y dirección, y vuelve a página 1 de 3.                                    | El campo predeterminado conserva el orden actual y la dirección elegida queda enlazada a la consulta.                                         |
| Fecha en tarjeta general       | RED de Vitest con una incidencia realmente incluida: `time[dateTime]` era `undefined`, salida 1.                                                                                                                                      | Prueba dirigida: 1/1, salida 0; verificaciones de lista de promoción, detalle y Home también pasaron.                                      | Un componente reutilizable presenta fecha local `es-ES` y `dateTime` conserva el valor ISO. No se recrean RED separados para cada superficie. |
| Colores de indicadores         | Las 12 combinaciones de estado/prioridad fallaron porque faltaban sus clases semánticas, salida 1.                                                                                                                                    | Las mismas 12 pruebas pasaron, salida 0.                                                                                                   | Una única paleta central, con contraste claro/oscuro, tooltip y etiqueta accesible mantenidos.                                                |
| E2E de orden                   | Primera ejecución segura: 65 pasaron y el caso nuevo leyó una lista vacía durante la carga después de cambiar el selector. El reporte mostró que la aserción se ejecutó antes de la respuesta; no era un fallo de orden del servidor. | Repetición completa tras esperar las cuatro filas: 66/66, salida 0.                                                                        | Espera explícita al resultado de cada nueva consulta; expectativas de orden intactas.                                                         |

Las primeras ejecuciones de pruebas web también detectaron selectores incorrectos en el test (nombre de paginación distinto y fixture sin filas). Esos intentos no se consideran RED funcional; se corrigió el fixture y el RED registrado arriba se produjo por la ausencia del control de orden. No se reconstruyen fallos históricos adicionales.

## Verificaciones finales observadas

Todas las pruebas persistentes utilizaron el runner existente con PostgreSQL temporal en `127.0.0.1:5433`; no se utilizó ni modificó `nextriva_dev`. No se cargó `.env.local`.

| Comando                                                                                                   | Resultado observado                                                                  | Código |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -----: |
| `mise exec -- pnpm --filter @nextriva/api test`                                                           | 32 archivos; 268 pruebas superadas                                                   |      0 |
| `mise exec -- pnpm --filter @nextriva/web test`                                                           | 26 archivos; 358 pruebas superadas                                                   |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:integration`                                               | PostgreSQL temporal; 14 archivos pasaron, 1 omitido; 226 pruebas pasaron, 2 omitidas |      0 |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | Chromium, API y PostgreSQL temporal; 66/66                                           |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:coverage`                                                  | API: líneas 91,75 %, ramas 86,39 %                                                   |      0 |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                  | Web: líneas 95,57 %, ramas 90,30 %                                                   |      0 |
| `mise exec -- pnpm api:types`                                                                             | Cliente regenerado desde OpenAPI con la herramienta fijada                           |      0 |
| `mise exec -- pnpm api:types:check`                                                                       | Generación reproducible, sin diferencias                                             |      0 |
| `mise exec -- pnpm typecheck`                                                                             | API y web                                                                            |      0 |
| `mise exec -- pnpm lint`                                                                                  | Sin infracciones                                                                     |      0 |
| `mise exec -- pnpm format:check`                                                                          | Prettier pasó                                                                        |      0 |
| `mise exec -- pnpm build`                                                                                 | API y web                                                                            |      0 |

Cobertura agregada observada en `coverage-summary.json`:

| Área                |  Líneas |   Ramas |
| ------------------- | ------: | ------: |
| API total           | 91,75 % | 86,39 % |
| API `src/incidents` | 97,52 % | 88,48 % |
| Web total           | 95,57 % | 90,30 % |
| Web `src/incidents` | 97,34 % | 88,25 % |

La primera comprobación de OpenAPI falló porque el cliente generado no incluía aún los parámetros nuevos; se regeneró con `api:types` y la comprobación posterior pasó. El primer typecheck detectó que una prueba describía incompletamente el tipo local de parámetros OpenAPI; se corrigió ese tipo y el typecheck final pasó. La primera ejecución E2E no pudo iniciar porque el puerto `4317` estaba ocupado por un proceso ajeno a la prueba; no se detuvo. La configuración admite puertos alternativos y la repetición en `4318`/`5174` pasó.

## Limitaciones y pendientes

- VoiceOver y validación visual manual siguen pendientes; Chromium E2E no acredita conformidad WCAG completa.
- No se cambió el orden propio de Home, no se modificaron permisos, estados, datos, migraciones, esquema ni dependencias.
- La auditoría de dependencias no se repitió: este incremento no modifica dependencias ni lockfile.
- `git diff --check`: superado, código de salida 0 tras la revisión final del diff.
- No se ha creado commit ni se ha publicado una PR.
