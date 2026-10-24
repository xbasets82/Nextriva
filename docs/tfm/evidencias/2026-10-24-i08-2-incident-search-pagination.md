# Evidencia TFM — I08.2 Búsqueda, filtros y paginación — 2026-10-24

## Identificación y alcance

Issue [#77](https://github.com/xbasets82/Nextriva/issues/77), aprobada. Rama `codex/i08-2-incident-search-pagination`, basada en `main` actualizado, commit `9b6d91c4423229d6c17bb0769a230248ea0f818f`. Publicación autorizada como PR única con `size:exception`; no se autoriza ni ejecuta merge.

HU15 implementada en API y web. La búsqueda `q` recortada y sin distinguir mayúsculas busca subcadenas en código o título; los filtros aprobados se combinan mediante AND. La visibilidad por rol forma parte de la consulta PostgreSQL antes del recuento y la paginación. El orden es `createdAt DESC, id DESC`. La respuesta contiene `items`, `page`, `pageSize`, `total` y `totalPages`. No se añadieron entidades, migraciones, campos ni SQL interpolado.

La guía incremental asigna HU15 a I08.2 y el diseño técnico histórico a I10. Se conserva esta discrepancia sin editar referencias de solo lectura.

## TDD observado

| Regla                                      | RED observado                                                                                                                                                         | GREEN/refactor observado                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respuesta API paginada y filtros validados | Integración HTTP/PostgreSQL temporal falló porque el endpoint aún devolvía el contrato anterior `{ incidents }`; 1 prueba fallida, 203 pasadas y 1 omitida, salida 1. | Parser allowlist, filtros combinados, conteo autorizado, orden y paginación implementados. Integración final: 12 archivos, 205 pasadas y 1 omitida, salida 0. |
| Cliente web del contrato paginado          | Prueba del cliente falló al recibir la forma antigua de listado y no poder leer `items`/metadatos; salida 1.                                                          | Cliente limitado a parámetros aprobados, validación defensiva de respuesta y serialización de filtros; `incidents.test.ts`: 12/12, salida 0.                  |
| Controles accesibles de UI                 | Vitest no encontró el campo `searchbox` “Código o título”; 1 fallida y 4 omitidas, salida 1.                                                                          | UI responsive con filtros, limpiar, paginación, estados accesibles y navegación; suite web completa pasó 209/209.                                             |
| Parámetros OpenAPI                         | La prueba de contrato añadida tras la implementación detectó `q` sin `type: string`; no se atribuye un RED anterior a la implementación.                              | Se explicitó el schema de parámetros y se regeneraron tipos. Integración de contrato y `api:types:check` pasaron, salida 0.                                   |

Durante la primera validación UI hubo una aserción ambigua porque “Cerrada” aparecía en filtro y fila; se acotó al listado de resultados. La suite web oficial pasó completa. Una ejecución manual combinando dos archivos aislados de Vitest mostró una interacción no reproducida por `pnpm test`; no afecta la ejecución oficial, que pasó.

La revisión independiente detectó que los comodines SQL `%` y `_` no se interpretaban literalmente. Se añadieron fixtures PostgreSQL con ambos caracteres y la prueba RED falló con total 5 frente a 1 para la búsqueda `%`. Se escaparon `\`, `%` y `_` antes de construir los filtros Prisma; la integración pasó después: 12 archivos, 205 pasadas y 1 omitida, salida 0. La omisión corresponde al caso aislado de validador ya existente.

La misma revisión observó que al volver desde el detalle la lista se monta de nuevo y reinicia página y filtros. El criterio aprobado comprueba el retorno a la lista, que está cubierto por E2E; no exige restaurar su estado. La conservación de criterios queda pendiente de validación/decisión funcional y no se declara implementada.

La primera ejecución E2E no inició porque el puerto API 4317 estaba ocupado por el backend local de desarrollo. Se dejó intacto y se repitió en puertos libres 4318/5174 mediante variables ya admitidas por Playwright. Esa ejecución reveló que una prueba de red interceptaba `/api/incidents` sin query string; se actualizó el matcher para aceptar los parámetros de paginación, conservando la expectativa original. Repetición final: 37/37 Chromium, salida 0.

No se reconstruyeron resultados anteriores. La prueba de contrato OpenAPI se incorporó después de la primera implementación API y su hallazgo se documenta como verificación posterior, no como RED histórico.

## Resultados locales observados

Las pruebas de integración/E2E usaron el runner seguro y PostgreSQL temporal en `127.0.0.1:5433`; los nombres de DB se redactaron. No se usó ni modificó `nextriva_dev`.

| Control                       | Comando                                                                                                       | Resultado                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias API y web           | `mise exec -- pnpm test`                                                                                      | API 30 archivos/252 pruebas; web 20 archivos/209 pruebas; salida 0.                                                                                                     |
| Integración HTTP y PostgreSQL | `mise exec -- pnpm --filter @nextriva/api test:integration`                                                   | 12 archivos, 205 pasadas, 1 omitida por el runner compartido; salida 0. La prueba aislada de validador es un caso dedicado fuera de I08.2.                              |
| E2E Chromium real             | `env NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | 37/37, salida 0; API, web y PostgreSQL temporales reales.                                                                                                               |
| Cobertura API                 | `mise exec -- pnpm --filter @nextriva/api test:coverage`                                                      | Líneas 90,92 %, ramas 85,96 %, sentencias 89,64 %, funciones 95,31 %; salida 0.                                                                                         |
| Cobertura web                 | `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                      | Líneas 95,06 %, ramas 89,16 %, sentencias 93,21 %, funciones 93,91 %; salida 0.                                                                                         |
| Validación de dominio         | Informes `coverage-summary.json`                                                                              | `incident.validation.ts`: líneas 97,43 %, ramas 96,33 %; `incidents.store.ts`: líneas 97,08 %, ramas 82,97 %.                                                           |
| OpenAPI/tipos                 | `mise exec -- pnpm api:types:check`                                                                           | Tipos generados coinciden con OpenAPI; salida 0. `mise exec -- pnpm api:types` regeneró el cliente; salida 0.                                                           |
| TypeScript                    | `mise exec -- pnpm typecheck`                                                                                 | API y web; salida 0.                                                                                                                                                    |
| ESLint/SonarJS                | `mise exec -- pnpm lint`                                                                                      | Salida 0 después del refactor para reducir complejidad cognitiva del parser.                                                                                            |
| Prettier                      | `mise exec -- pnpm format:check`                                                                              | Salida 0 tras formatear archivos tocados.                                                                                                                               |
| Build                         | `mise exec -- pnpm build`                                                                                     | API y web; salida 0.                                                                                                                                                    |
| Baseline                      | `mise exec -- pnpm test:audit-baseline`                                                                       | 30/30 pruebas; salida 0. Evaluador estricto real: salida 0, acepta únicamente la excepción temporal aprobada de Multer.                                                 |
| Auditoría                     | `mise exec -- pnpm audit --json`                                                                              | Salida 1 por `GHSA-q7qp-rjg7-q26m` (`multer@2.4.0`), excepción vigente del Issue #18; no se añadieron excepciones. El evaluador estricto sobre el informe real salió 0. |
| Diff                          | `git diff --check`                                                                                            | Salida 0.                                                                                                                                                               |

Los umbrales globales configurados son 80 % de líneas/funciones/sentencias y 75 % de ramas; ambos proyectos los superan. La cobertura por archivo de UI no reemplaza los umbrales globales.

## Diseño y seguridad

El store compone el ámbito vigente del actor con filtros en `where: { AND: clauses }`, consulta total con el mismo predicado y solo después obtiene la página con orden estable. La búsqueda código/título queda en un OR interno. Prisma construye consultas parametrizadas y los metacaracteres LIKE se escapan para que la búsqueda sea literal. La validación rechaza claves desconocidas, enums e IDs inválidos y límites de página incorrectos.

No se modificó OpenAPI de otros recursos, esquema Prisma ni migraciones. No hubo cambios de dependencias. La auditoría conserva el único riesgo residual ya aprobado: Multer; este incremento no amplía su baseline.

## Validación manual pendiente

En un navegador local, iniciar sesión con cada rol de prueba y comprobar: filtros por código/título y enums, combinación AND, borrar filtros, total y navegación de páginas, abrir un detalle y regresar. Confirmar que un colaborador solo ve filas propias o asignadas en promociones vinculadas y que sus totales no muestran otras incidencias. Revisar especialmente las entradas “Promoción (UUID)” y “Responsable (UUID)”, que requieren un identificador conocido porque no se aprobó un endpoint de opciones.

Quedan pendientes VoiceOver y validación en Safari/Firefox. No se declara WCAG completa. No se ejecutaron migraciones ni cambios en `nextriva_dev`.

## Uso de herramientas

Se usaron Codex para inspección, implementación y ejecución de Vitest, el runner seguro PostgreSQL y Playwright; pnpm/Vitest, Prisma/PostgreSQL, OpenAPI TypeScript, ESLint, Prettier y Playwright para verificación. Los resultados TDD consignados son los observados en esta sesión. El artefacto queda pendiente de validación manual humana; no se ha creado commit ni publicación.
