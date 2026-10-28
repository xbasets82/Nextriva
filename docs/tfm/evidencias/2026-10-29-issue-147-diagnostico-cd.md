# Issue #147 — Diagnóstico sanitizado de publicación CD

Fecha: 29/10/2026. Rama local: `codex/issue-147-cd-publish-diagnostics`, basada en `main` `4eff8c7228aeab6d2f602baf5e05b699fcb7c50d`. Issue `status:approved`. No se ha hecho commit, push, PR ni nueva operación remota.

## Contexto verificado

- Ejecuciones manuales autorizadas observadas: [#40783973175](https://github.com/xbasets82/Nextriva/actions/runs/40783973175) y [#40784817517](https://github.com/xbasets82/Nextriva/actions/runs/40784817517).
- Ambas validaron la puerta `gate`; el job `publish` falló y `deploy` se omitió. El wrapper mostraba el mismo mensaje genérico, sin causa interna.
- El paquete privado `nextriva-api` quedó creado/vinculado al repositorio con una etiqueta para el SHA probado; `nextriva-web` no figuraba en la consulta posterior. No se atribuye causa al fallo con esta evidencia.
- Se reprodujo localmente el build web mediante Docker con el Dockerfile de producción, SHA `4eff8c7228aeab6d2f602baf5e05b699fcb7c50d` y Geoapify vacío. Build completado; imagen diagnóstica local eliminada.
- Tras el segundo fallo, `NEXTRIVA_CD_MANUAL_ENABLED=false`; `https://nextriva.es/api/health` respondió `{"status":"ok"}`. No se modificó producción.

## Cambio local

El cliente clasifica fallos de publicación por etapa y categoría permitida (verificación GHCR, login, build, push, digest y salida). GitHub informa su estado HTTP; Docker informa categorías acotadas como permisos, espacio, red, timeout o referencia de imagen. No se imprime stdout/stderr arbitrario; los errores no reconocidos permanecen genéricos. El workflow conserva código no cero y su dependencia `deploy` sigue condicionada al éxito de `publish`.

## TDD observado

| Regla                                                                           | RED observado                                                                                                                                                               | GREEN observado                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Etapa/categoría del fallo Docker sin stderr sensible                            | `mise exec -- node --test --test-name-pattern='publicación informa etapa' scripts/cd-client.test.mjs`: 1 fallo, `stage` indefinido; exit 1                                  | Incluido en suite final de 54 pruebas; superada    |
| 403 de GitHub y formato seguro; política del paquete; salida de digest inválida | RED focalizado: 3 fallos por falta de etapa/categoría/formateador; exit 1. Prueba específica de política/digest: 2 fallos con categoría genérica y etapa indefinida; exit 1 | 5 superadas; exit 0                                |
| Etapas y categorías acotadas por allowlist                                      | Prueba del formateador: 1 fallo, no se rechazaban valores arbitrarios; exit 1                                                                                               | Incluida en la suite final de 54 pruebas; superada |
| Timeout real de `execFile`                                                      | `mise exec -- node --test --test-name-pattern='timeout real de execFile' scripts/cd-client.test.mjs`: 1 fallo; se clasificaba como `external_command_failed`; exit 1        | La misma prueba: 1 superada; exit 0                |

Comando Green para el conjunto de diagnósticos: `mise exec -- node --test --test-name-pattern='(publicación informa etapa | diagnóstico de GitHub | distingue el rechazo | digest ilegible | formatea errores CD)' scripts/cd-client.test.mjs`.

Refactor: centralización de la clasificación y el formato seguro, y validación de etapa/categoría en `PublishFailure`.

## Validación local final

- `mise exec -- pnpm test:cd`: **superada**, 54 pruebas; 0 fallos; exit 0.
- `mise exec -- pnpm exec prettier --check scripts/cd-client.mjs scripts/cd-client.test.mjs docs/tfm/evidencias/2026-10-29-issue-147-diagnostico-cd.md`: **superada**; exit 0.
- `mise exec -- pnpm exec eslint scripts/cd-client.mjs scripts/cd-client.test.mjs`: **superada**; exit 0.
- `mise exec -- node --check scripts/cd-client.mjs` y `mise exec -- node --check scripts/cd-client.test.mjs`: **superadas** en una secuencia; exit 0.
- `git diff --check`: **superada**; sin errores de whitespace.
- CI completo, nuevo publish de GitHub Actions y despliegue: **no ejecutados**. PostgreSQL, OpenAPI y Playwright: **no aplican** al cambio del script CD.

## Pendiente

La instrumentación local aún no revela cuál etapa causa el fallo real, porque la versión actual no se ha publicado. Se requiere validar esta modificación e integrarla antes de una nueva ejecución autorizada de publicación. Esa ejecución deberá mantener desactivado el despliegue hasta revisar el diagnóstico y decidir si corresponde una acción adicional.
