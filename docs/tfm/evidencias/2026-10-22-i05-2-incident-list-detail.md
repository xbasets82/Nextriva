# Evidencia TFM — I05.2 Listado y detalle de incidencias — 2026-10-22

## Identificación y alcance

- Issue [#53](https://github.com/xbasets82/Nextriva/issues/53), `status:approved` comprobado antes del desarrollo; base `main` en `eb5a6b7f875b3e56099469a4425a9b2b9c1b87dc`, con I05.1 integrada mediante PR #52.
- Rama `codex/i05-2-incident-list-detail`. Implementación y verificaciones automatizadas observadas; validación manual comunicada por el usuario y revisión independiente final sin bloqueos. Commit, push y una PR con `size:exception` autorizados; merge pendiente y no autorizado.
- HU07 exclusivamente: listado y navegación al detalle de solo lectura. HU08 queda reservada para I06. No hay edición, asignación, borrado, adjuntos, filtros/búsqueda HU15, nueva prioridad, entidad o migración.
- Decisión expresa del usuario, reflejada en el Issue y el [suplemento de planificación](../../planning/I05.2-incident-list-detail.md): ADMIN global; MANAGER con vinculación vigente; COLLABORATOR solo incidencias creadas por él en promoción con vinculación vigente. La visibilidad por responsable se conectará en I06, cuando exista el modelo; no se añadió `assignedToId`.

## Implementación y permisos

`GET /api/incidents` devuelve `{ incidents: [...] }`, con sesión válida, `Cache-Control: no-store` y orden `createdAt DESC, id DESC`. Prisma aplica el predicado de visibilidad en PostgreSQL. Listado y detalle comparten el predicado; el actor se consulta bajo `FOR SHARE` antes de determinar su ámbito, conservando la protección de I05.1 frente a degradación concurrente. Una lectura privada por UUID devuelve 404. Las consultas sin sesión válida devuelven 401.

Se conserva la consulta histórica de incidencias cerradas y promociones archivadas. Los rechazos no modifican las incidencias ni sus actividades. El contrato OpenAPI incluye el listado y el cliente usa sus tipos generados, con comprobación de la estructura recibida en ejecución. Errores inesperados de infraestructura conservan 503 y mensaje seguro; no se convierten indiscriminadamente en 400.

La interfaz añade la navegación «Incidencias», tarjetas shadcn/Tailwind con enlace código/título, estado, fase de origen, categoría y prioridad. Incluye carga anunciable, vacío, error seguro y reintento, foco en el encabezado y retorno desde el detalle. El estado local se descarta al desmontar la vista; los permisos efectivos siguen en el servidor.

## TDD observado

| Regla                                      | RED funcional observado                                                                                                                                                                                      | GREEN y refactor observados                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listado autorizado y orden estable         | Tras preparar fixtures válidos, la nueva prueba de integración esperaba 200 en `GET /api/incidents` y recibió 404, porque aún no existía el endpoint. Suite: 123 superadas y 1 fallida; código 1.            | Endpoint y consulta filtrada: 124/124, código 0. Se extrajo un predicado común para listado/detalle sin cambiar el contrato de detalle; repetición 124/124, código 0. |
| Carga, vacío, error/reintento y navegación | Los cuatro tests web nuevos fallaron: faltaban «Consultando incidencias…», el vacío, el error y el enlace al detalle. La aplicación mostraba la selección inicial. Ejecución dirigida: 4 fallidas, código 1. | Listado y cliente mínimos: 4/4, código 0. Después del formato y revisión del estado/foco, suite web y cobertura: 156/156, código 0.                                   |

Los tests de permisos por rol, autoría, UUID directo, revocación, orden con fecha empatada y conservación de valores se escribieron antes del endpoint. Como el primer fallo era la ausencia del endpoint, no se observaron RED independientes de cada combinación de permisos: su GREEN conjunto acredita ejecución y cobertura de esos casos, sin inventar ciclos históricos separados.

El detalle y su política de autoría ya existían; sus comprobaciones nuevas son regresión, no RED de una funcionalidad inexistente. Las pruebas de payloads malformados, transporte autenticado y error 503 del store se añadieron como verificación adicional del comportamiento/reutilización. Los E2E complementan los ciclos unitario e integración; no se presenta un RED histórico independiente para cada escenario de navegador.

### Fallos de preparación y validación, no contabilizados como RED

- Primer fixture: una promoción activa sin fase incumplió la restricción real PostgreSQL (23514). Una segunda preparación coincidió con un trigger global de la suite de promociones y falló con `synthetic phase write failure`; también alteró su contador global. La preparación final reutiliza promociones existentes y no escribe fases ni crea promociones durante el nuevo caso. Un intento intermedio dejó una promoción archivada tras abortar la prueba y provocó un fallo posterior; se eliminó esa mutación del fixture.
- El primer fixture web de sesión omitía fechas requeridas por el lector existente. Se completó el fixture antes de considerar el RED funcional del listado.
- El primer E2E abortaba solo una petición para simular red caída; StrictMode podía emitir otra. Se sustituyó por una barrera de red indisponible hasta observar el error, abierta antes de pulsar «Reintentar». No se cambió producción para ocultar este fallo.
- Una ejecución E2E tuvo 29 superadas y 1 fallida: la retirada de los vínculos del nuevo fixture coincidió con un contador global de participantes de I04.2. Se ajustó exclusivamente el spec nuevo a lectura/vacío/denegación sin crear o retirar vínculos; la revocación real queda verificada en integración. No se modificaron tests ajenos, runner ni aislamiento. Las dos ejecuciones finales completas pasaron 30/30.
- Typecheck detectó una opción `exact` no soportada por Testing Library y ESLint una ternaria anidada en un test nuevo. Se corrigieron únicamente esos tests; ambas comprobaciones finales pasaron.

## Validaciones observadas

Todos los procesos PostgreSQL utilizaron el runner seguro existente y retiraron `DATABASE_URL`/`TEST_DATABASE_URL` heredadas. El runner validó la configuración local de pruebas, creó una base temporal en PostgreSQL real de `127.0.0.1:5433`, generó Prisma y aplicó las cinco migraciones versionadas desde cero. No se cargó `.env.local` ni se accedió a `nextriva_dev`.

| Validación                               | Comando y resultado final observado                                                                                                                                                                                                      |     Salida |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| Unitarias API                            | `mise exec -- pnpm --filter @nextriva/api test`: 26 ficheros, 179/179                                                                                                                                                                    |          0 |
| Integración PostgreSQL GREEN y REFACTOR  | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration`: 10 ficheros, 124/124 en ambas                                                                                                      |          0 |
| Cobertura API                            | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:coverage`: 36 ficheros, 303/303                                                                                                                  |          0 |
| Web GREEN dirigida                       | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/incidents/IncidentsScreen.test.tsx`: 4/4                                                                                                                                   |          0 |
| Web regresión                            | `mise exec -- pnpm --filter @nextriva/web test`: 19 ficheros, 149/149 antes de siete comprobaciones adicionales del cliente                                                                                                              |          0 |
| Cobertura web final                      | `mise exec -- pnpm --filter @nextriva/web test:coverage`: 19 ficheros, 156/156                                                                                                                                                           |          0 |
| E2E Chromium completo y repetición final | `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:e2e`: 30/30; repetición 30/30                                                                                                                    |          0 |
| OpenAPI/tipos generados                  | `mise exec -- pnpm api:types`; `mise exec -- pnpm api:types:check`                                                                                                                                                                       | 0 cada uno |
| Calidad                                  | `mise exec -- pnpm typecheck`; `mise exec -- pnpm lint`; `mise exec -- pnpm format:check`; `mise exec -- pnpm build`                                                                                                                     | 0 cada uno |
| Evaluador unitario de auditoría          | `mise exec -- pnpm test:audit-baseline`: 35/35                                                                                                                                                                                           |          0 |
| Auditoría de dependencias                | `mise exec -- pnpm audit --json` guardado temporalmente fuera del repositorio: tres avisos Prisma existentes (dos altos y uno moderado)                                                                                                  |          1 |
| Evaluación del informe real              | `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-i052-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1`: acepta exactamente las tres excepciones del Issue #18, vigentes hasta 18/11/2026 |          0 |
| Diferencias y espacios                   | `git diff --check`: sin errores, antes de la revisión documental final; repetir al cierre                                                                                                                                                |          0 |

Los logs de ejecución y el informe bruto de auditoría están en temporales fuera del cambio entregable. No contienen valores de conexión ni credenciales de los usuarios sintéticos generados durante los tests. No se añadieron dependencias ni excepciones de seguridad. La auditoría pnpm bruta permanece en código 1 por las excepciones conocidas; el evaluador vigente pasa.

## Cobertura medida y límites

| Ámbito                      |  Líneas |   Ramas |
| --------------------------- | ------: | ------: |
| API global                  | 92,07 % | 87,61 % |
| API `src/incidents`         | 98,64 % | 82,60 % |
| Web global                  | 95,89 % | 91,31 % |
| Web `src/incidents`         |   100 % | 91,74 % |
| Nuevo `IncidentsScreen.tsx` |   100 % | 85,71 % |

Los umbrales configurados globales (80 % líneas/funciones/sentencias y 75 % ramas) pasan. No se modificaron exclusiones ni umbrales. El objetivo adicional del 90 % de ramas de dominio/autorización no queda acreditado para todo el módulo `src/incidents`: su agregado incluye controller/store y alcanza 82,60 %. Las decisiones reales de visibilidad se comprueban con PostgreSQL; la cobertura por sí sola no acredita seguridad.

## Verificación humana y DoD

1. Con el entorno de desarrollo ya configurado y actualizado por su propietario, iniciar API/web mediante las instrucciones vigentes de desarrollo. Esta unidad no ejecutó arranque, bootstrap o migraciones sobre la base de desarrollo.
2. Entrar desde la pantalla real con un ADMIN existente y pulsar «Incidencias». Comprobar código, título, estado, fase de origen, categoría y prioridad; abrir una fila y volver mediante «Volver a incidencias».
3. Repetir con MANAGER vinculado y COLLABORATOR autor vinculado. Comprobar que el primero solo ve sus promociones y el segundo solo las incidencias que creó. Un usuario sin vínculos debe ver el vacío y un UUID ajeno debe mostrar el error seguro de recurso no encontrado.
4. Validar teclado (Tab/Shift+Tab/Enter), foco al entrar en listado/detalle, reintento tras error y viewport móvil. VoiceOver, Safari y Firefox siguen pendientes; no se declara conformidad WCAG completa.
5. Si se revisa persistencia con DBeaver, usar solo SELECT sobre datos de desarrollo controlados; esta entrega no autoriza cambios sobre `nextriva_dev`.

La atomicidad de escritura/actividad y las migraciones no cambian en HU07; su regresión existente se ejecutó en las suites completas. No hay nuevo flujo CSRF porque se añaden únicamente GET y se conserva el transporte/cookie existente. Se mantienen como límites la lista sin paginación aprobada para I05.2 y la futura consulta por responsable en I06. La validación manual fue comunicada por el usuario; VoiceOver y Safari/Firefox siguen pendientes. Commit, push y una PR con `size:exception` están autorizados; merge e inicio de I06 requieren autorización posterior.

## Uso de herramientas de IA

Codex implementó y revisó esta unidad bajo las decisiones aprobadas y con la skill local `cognitive-doc-design` para organizar planificación y evidencia. Se registran exclusivamente ejecuciones observadas, incluidos fallos de preparación y límites TDD; no se reconstruyen RED históricos. Las referencias v1.0 se conservaron íntegras.
