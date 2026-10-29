# Issue #149 — Diagnóstico seguro de la política GHCR

Fecha: 29/10/2026. Estado: implementación y validación local; diagnóstico real con el token de Actions pendiente.

## Problema y límite de la evidencia

La ejecución `40788970287` falló en `verify-package-api` con la categoría `package_policy_rejected`. Esa categoría agrupaba dos predicados: visibilidad privada y vinculación exacta al repositorio. El job de despliegue se omitió. Los datos disponibles no permiten afirmar cuál de los dos predicados devolvió un resultado distinto con el token efímero de esa ejecución.

Esta modificación conserva ambos requisitos. No modifica la visibilidad, la vinculación ni los permisos del paquete; tampoco introduce PAT, secretos ni cambios en el VPS.

## Implementación

- Un rechazo de política incluye un motivo de una lista cerrada: `visibility_not_private`, `repository_mismatch`, `visibility_and_repository_mismatch` o `invalid_metadata`.
- Los valores recibidos, el repositorio devuelto, las respuestas completas y los tokens no se incluyen en el mensaje. Los fallos HTTP conservan únicamente una categoría con el código de estado.
- La operación manual `diagnose` verifica primero el repositorio, la rama `main`, el SHA actual y su CI exitoso. Después consulta por GET los dos paquetes y emite únicamente servicio, categoría de resultado y los booleanos `private` y `repositoryMatches`, con motivo cuando corresponde.
- Un HTTP 404 se informa como `github_http_404`; por sí solo no demuestra si el paquete falta o no es accesible al token.
- `diagnose` termina correctamente cuando completa las consultas y presenta sus resultados; ese resultado no acredita que la política de publicación se cumpla.
- El job de diagnóstico dispone de `contents: read`, `actions: read` y `packages: read`, sin secretos SSH. Puede ejecutarse con la habilitación de despliegue manual desactivada.
- El input es una única elección. `publish` solo admite `deploy` y el job `deploy` excluye explícitamente `diagnose`; un diagnóstico no puede continuar publicando ni desplegando en esa ejecución.
- `expected_sha` queda opcional en el formulario, porque no se usa en diagnóstico. El gate valida una operación de la lista cerrada y exige un SHA válido para `deploy` y `rollback` antes de emitir la salida que habilita publicación; `diagnose` está exento únicamente de ese SHA. `assertRequest` conserva la misma protección en el cliente de despliegue y el helper.

## TDD observado

Se utilizó el runner Node nativo definido por `test:cd`, con Node `24.22.0` disponible en mise. El Node y pnpm predeterminados del shell eran `25.4.0` y `11.25.0`; no se instalaron ni cambiaron herramientas.

En los comandos siguientes, `NODE` representa la ruta exacta utilizada: `/Users/xbasets/.local/share/mise/installs/node/24.22.0/bin/node`.

| Regla                                                    | Comando ejecutado con esa ruta en lugar de `NODE`                                | RED observado                                                            | GREEN observado                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Motivo seguro por cada predicado                         | `NODE --test --test-name-pattern='política informa' scripts/cd-client.test.mjs`  | 4 fallos: `reason` era `undefined`; salida 1                             | 4/4 superadas; salida 0                                            |
| Diagnóstico aislado mediante la entrada real del cliente | `NODE --test --test-name-pattern='diagnose consulta' scripts/cd-client.test.mjs` | Operación todavía no admitida: resultado 1 frente a 0 esperado; salida 1 | 1/1 superada; 5 GET controlados y cero comandos externos; salida 0 |
| Exclusión de publicación y despliegue en el workflow     | `NODE --test --test-name-pattern='workflow diagnose' scripts/cd-client.test.mjs` | El input no contenía `diagnose`; salida 1                                | 1/1 superada; salida 0                                             |

La prueba del cliente usa respuestas controladas: tres consultas de CI, paquete API privado con repositorio discrepante y paquete web con 404. Comprueba el resultado JSON exacto y la ausencia de metadatos y token sensibles. La rama de despliegue no se ejecuta; la prueba concluye sin configuración SSH y el espía de comandos permanece vacío.

Refactor: el cálculo de política se comparte entre publicación y diagnóstico. Los motivos se validan mediante lista cerrada. ESLint detectó inicialmente `sonarjs/no-nested-template-literals` en la construcción del mensaje (salida 1); se extrajo el sufijo a una variable, sin cambiar comportamiento. La suite se repitió después.

### Corrección tras revisión independiente

La revisión detectó un P2: al convertir `expected_sha` en opcional, la validación tardía de `assertRequest` podía permitir publicar imágenes antes de rechazar el despliegue. Se reprodujo con `NODE --test --test-name-pattern='gate bloquea deploy' scripts/cd-client.test.mjs`: el gate devolvía 0 en lugar de 1, salida 1. El test exige además ausencia de comandos externos y de cualquier archivo de salida que habilite publicación/digests.

Se añadieron casos de rollback sin SHA, deploy con SHA malformado y operación desconocida, además de verificar que el workflow entrega ambos inputs al gate. `NODE --test --test-name-pattern='gate rechaza|workflow diagnose' scripts/cd-client.test.mjs` mostró los cuatro fallos esperados, salida 1: contratos indebidamente aceptados y variables ausentes en el job gate.

La corrección valida operación y SHA al entrar en gate, antes de consultas y de emitir outputs. `NODE --test --test-name-pattern='gate bloquea deploy|gate rechaza|gate acepta|workflow diagnose|diagnose consulta' scripts/cd-client.test.mjs` terminó con 9/9 superadas, salida 0. Incluye positivos de deploy/rollback con SHA válido y diagnose sin SHA. Refactor: se extrajo la preparación común del cliente en las pruebas y se reutiliza `isSha` del módulo de políticas.

## Controles observados

| Comando                                                                                   | Resultado                                     | Código |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- | ------ |
| `NODE --test scripts/cd-*.test.mjs`                                                       | 67 pruebas superadas; 0 fallidas y 0 omitidas | 0      |
| `actionlint .github/workflows/deploy.yml`                                                 | Sin incidencias de sintaxis o expresiones     | 0      |
| `NODE node_modules/eslint/bin/eslint.js scripts/cd-client.mjs scripts/cd-client.test.mjs` | Sin incidencias tras el refactor              | 0      |

También se ejecutaron `NODE node_modules/prettier/bin/prettier.cjs --check scripts/cd-client.mjs scripts/cd-client.test.mjs .github/workflows/deploy.yml docs/tfm/evidencias/2026-10-29-issue-149-ghcr-policy-diagnostics.md` y `git diff --check`: formato correcto y sin errores de espacios, ambos con salida 0.

La suite CD conserva las regresiones de CI exacto, ramas no autorizadas, publicación privada, checksums de migraciones, rollback, bloqueo concurrente e identidad/volumen PostgreSQL. En esta entrega son comprobaciones locales con fixtures y archivos temporales; no equivalen a un despliegue ni a recuperación real en producción.

## Validación posterior propuesta, todavía no ejecutada

Después de integrar este cambio y comprobar el CI de ese SHA, y solo con autorización específica para la ejecución remota:

1. Abrir el workflow «Publicación manual VPS» en GitHub Actions sobre `main`.
2. Elegir `operation=diagnose` e indicar el ID del CI push exitoso del SHA actual. `expected_sha` puede quedar vacío.
3. Mantener `NEXTRIVA_CD_MANUAL_ENABLED=false`.
4. Comprobar que `gate` y `diagnose` terminan y que `publish` y `deploy` quedan omitidos.
5. Leer únicamente las dos líneas JSON del diagnóstico. Distinguir `private=false` de `repositoryMatches=false` o de un error HTTP.
6. Si existe discrepancia, resolverla con evidencia y autorización antes de repetir una publicación. La política no se relaja automáticamente.

No se ha ejecutado ese workflow ni publicado imágenes. El token real de Actions no está disponible durante estas pruebas locales; la causa concreta del rechazo observado continúa pendiente de ese diagnóstico.

## Definition of Done proporcional

- Alcance: diagnóstico de infraestructura del Issue #149, sin ampliación funcional ni cambios HTTP.
- Seguridad: salida limitada a categorías y booleanos; permisos de lectura; las guardas de publicación permanecen activas.
- TDD: los tres ciclos anteriores están observados; no se reconstruyen ciclos históricos.
- PostgreSQL, migraciones, OpenAPI y cliente tipado: no aplicables, porque el cambio no modifica persistencia ni contratos HTTP y no accede a ninguna base de datos.
- UI responsive, Playwright y suites funcionales web/API: no aplicables a estos scripts y condiciones de GitHub Actions; no se cambia la aplicación.
- Typecheck y build de aplicación: no aplicables al cambio MJS/YAML sin TypeScript ni artefactos de producto; se ejecutan pruebas Node, lint y actionlint sobre los archivos afectados.
- Dependencias: no se modifica manifiesto ni lockfile; no se añade ninguna herramienta o paquete.
- Validación remota: pendiente y declarada; no se afirma que GHCR ni el despliegue estén desbloqueados.
- Commit, push, PR y ejecución remota: pendientes de sus autorizaciones correspondientes.
