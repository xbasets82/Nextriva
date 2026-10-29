# Issue #153 — Diagnóstico seguro de metadatos GHCR en Actions

Fecha: 29/10/2026. Estado: diagnóstico ampliado integrado y observado en Actions; corrección de consulta REST implementada y verificada localmente, pendiente de confirmar con el token remoto. Publicación y despliegue siguen pendientes.

## Alcance y datos observados previamente

La Issue #151 normalizó la identidad del repositorio, pero el run remoto `40796822003`, sobre `f4674ea7d6386a1a6568ace5993bdee76b0b17de`, siguió informando API privada con `repositoryMatches: false`. La consulta autenticada de GitHub CLI mostraba el vínculo esperado; eso no demuestra qué metadatos recibió el token de Actions. El 404 de web corresponde al paquete aún pendiente de bootstrap. No se atribuye una causa sin obtener el nuevo diagnóstico con ese token.

Este cambio añade exclusivamente indicadores seguros al modo `diagnose`:

- `repositoryMetadata: absent`: falta el vínculo `repository` o su `full_name`, o tiene valor nulo.
- `repositoryMetadata: invalid`: el paquete o el vínculo tienen forma inválida, o `full_name` no es una cadena con dos componentes no vacíos y sin espacios separados por una barra.
- `repositoryMetadata: valid`: existe una identidad interpretable, que aún puede pertenecer a otro repositorio.
- `repositoryOwnerMatches` y `repositoryNameMatches`: indican coincidencia por componente, sin distinguir mayúsculas. Son `false` cuando la identidad no se puede interpretar; se deben leer junto a `repositoryMetadata`.

No se imprimen los componentes, metadatos brutos, tokens ni valores de entorno. Se conservan `private`, `repositoryMatches` y los motivos seguros existentes. Publicación y diagnóstico siguen compartiendo la misma política; el criterio de aceptación de paquetes no cambia. Metadatos ausentes, inválidos, públicos o ajenos continúan rechazándose antes del login/push y bloquean digests tras el push. Un 404 no se presenta como paquete listo.

## TDD observado

Entorno fijado: Node `24.22.0`, pnpm `10.34.7`, ejecutados mediante `mise exec --`.

| Paso                 | Comando                                                                                    | Resultado observado                                                                                                   | Código |
| -------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------ |
| RED                  | `mise exec -- node --test scripts/cd-client.test.mjs`                                      | 109 pruebas: 93 superadas y 16 fallidas por ausencia de los tres nuevos campos diagnósticos en las comparaciones JSON | 1      |
| GREEN mínimo         | Mismo comando tras implementar los indicadores                                             | 109 superadas, 0 fallidas                                                                                             | 0      |
| Refactor y regresión | `mise exec -- node --test scripts/cd-*.test.mjs`                                           | 126 superadas; 0 fallidas, omitidas o canceladas                                                                      | 0      |
| ESLint               | `mise exec -- pnpm exec eslint scripts/cd-client.mjs scripts/cd-client.test.mjs`           | Sin incidencias                                                                                                       | 0      |
| Formato              | `mise exec -- pnpm exec prettier --check scripts/cd-client.mjs scripts/cd-client.test.mjs` | Todos los archivos cumplen formato                                                                                    | 0      |
| Espacios             | `git diff --check`                                                                         | Sin errores                                                                                                           | 0      |

Los 16 fallos RED corresponden a 13 casos nuevos y tres expectativas existentes ampliadas. Se verificó que todos fallaban por las nuevas aserciones y no por errores del entorno. Los casos cubren paquete nulo/no objeto/array, vínculo ausente/nulo/inválido, nombre ausente/nulo/no cadena/malformado/con espacios y propietario o repositorio ajenos. Los positivos existentes prueban identidad equivalente con distintas mayúsculas. Las expectativas comparan el JSON completo y rechazan valores sensibles; el fixture bloquea comandos Docker/SSH y conserva el 404 de web. La regresión completa mantiene las guardas de publicación anteriores y posteriores al push.

Revisión SOLID/seguridad: la clasificación de identidad es una función pequeña y pura reutilizada por la política existente. Se mantienen el endpoint, los permisos y el cálculo de aceptación anterior; los nuevos datos solo explican un rechazo. No se necesita otro servicio o dependencia. Se normalizó el formato y se repitió la suite completa después de la implementación.

## Límites y Definition of Done proporcional

- Implementado y probado localmente: clasificación segura, privacidad de salida, ausencia de comandos de publicación/SSH en `diagnose`, conservación de rechazo por defecto y verificaciones de SHA/CI del flujo existente.
- Pendiente: integrar el cambio, observar CI del SHA exacto y ejecutar un diagnóstico remoto autorizado con el token real de Actions. Hasta entonces no se considera corregida la causa ni desbloqueada la publicación. El criterio de aceptación relativo a resolver la causa queda abierto.
- Sin cambios en workflow, permisos de paquetes, secretos, variables, VPS, Caddy, PostgreSQL ni producción durante esta implementación.
- No aplican OpenAPI, cliente HTTP de producto, migraciones, PostgreSQL real, UI/accesibilidad, Playwright ni build/typecheck de aplicación: solo se modifica una herramienta MJS de CD. Las pruebas correspondientes son Node, ESLint y Prettier.
- Cobertura global y auditoría de dependencias no ejecutadas para esta ampliación sin dependencias nuevas; no se declara porcentaje ni resultado nuevo.
- No se ejecutó publicación, despliegue, rollback ni activación automática. Commit, push y PR requieren autorización posterior.

## Validación posterior

Con el cambio integrado en `main` y el CI del SHA exacto satisfactorio, ejecutar únicamente `diagnose` según el procedimiento autorizado. Comprobar para API el nuevo indicador de metadatos y las coincidencias de propietario/nombre. Si falta o es inválida la identidad, mantener bloqueada la publicación y corregir el origen comprobado mediante una decisión posterior respaldada por GitHub; no aceptar el paquete solo por nombre o privacidad. Comprobar que web conserva `github_http_404` y que `publish` y `deploy` quedan omitidos. Esta implementación no permite inferir ni sustituir el resultado de esa ejecución remota.

## Continuación: consulta de paquetes privados con el usuario autenticado

Tras integrar la PR #154, el diagnóstico autorizado `40799394063` sobre `247a41510f90e04b0500b047a556e7d5fd6fac87` terminó correctamente y observó:

- API: `private: true`, `repositoryMatches: false`, `repositoryMetadata: absent`, `repositoryOwnerMatches: false`, `repositoryNameMatches: false`, `reason: repository_mismatch`.
- Web: `status: github_http_404`.
- Los jobs de publicación y despliegue quedaron omitidos.

La consulta local autenticada mediante GitHub CLI sí devolvía el paquete privado vinculado a `xbasets82/Nextriva`. La diferencia confirma que faltaba la identidad del repositorio en la respuesta recibida por Actions, pero no permite atribuir por sí sola la causa al token o a la vinculación real.

La documentación oficial distingue [el endpoint de paquetes públicos de un usuario](https://docs.github.com/en/rest/packages/packages#get-a-package-for-a-user) de [la consulta para el usuario autenticado](https://docs.github.com/en/rest/packages/packages#get-a-package-for-the-authenticated-user). Este último documenta compatibilidad con tokens de acceso de instalación de GitHub App. Se sustituye la consulta `/users/xbasets82/packages/container/nextriva-{api|web}` por `/user/packages/container/nextriva-{api|web}`, tanto en diagnóstico como en las comprobaciones anteriores y posteriores al push. Es una corrección de la consulta conforme al contrato documentado; su efecto con el token real requiere un nuevo diagnóstico autorizado.

La allowlist de `githubJson` se actualiza para admitir exclusivamente esos dos paquetes en el endpoint autenticado. Rechaza la ruta anterior, otros paquetes, tipos distintos de `container`, sufijos, query strings y subrutas. La identidad esperada continúa siendo `xbasets82/Nextriva`: la respuesta debe ser privada y contener un repositorio coincidente. No se acepta metadato ausente como éxito ni se amplían permisos de GitHub.

### TDD y controles observados en esta continuación

| Paso                                            | Comando                                               | Resultado observado                                                                                                              | Código |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| RED consulta                                    | `mise exec -- node --test scripts/cd-client.test.mjs` | 110 pruebas: 108 superadas y 2 fallidas. Las URLs observadas todavía usaban `/users/xbasets82/` en publicación y diagnóstico     | 1      |
| Comprobación inicial tras cambiar la consulta   | Mismo comando                                         | 27 superadas y 83 fallidas: la allowlist previa rechazaba el endpoint autenticado. Se identificó la guarda antes de modificarla  | 1      |
| Regresión inicial con la misma guarda pendiente | `mise exec -- node --test scripts/cd-*.test.mjs`      | 127 pruebas: 44 superadas y los mismos 83 fallos por la ruta no autorizada; no se consideró GREEN                                | 1      |
| RED allowlist                                   | `mise exec -- node --test scripts/cd-policy.test.mjs` | 6 pruebas: 3 superadas y 3 fallidas; no admitía la nueva ruta ni rechazaba la anterior y no alcanzaba los estados HTTP esperados | 1      |
| GREEN allowlist                                 | Mismo comando tras sustituir la ruta permitida        | 6 superadas, 0 fallidas                                                                                                          | 0      |
| GREEN consulta                                  | `mise exec -- node --test scripts/cd-client.test.mjs` | 110 superadas, 0 fallidas                                                                                                        | 0      |
| Regresión final                                 | `mise exec -- node --test scripts/cd-*.test.mjs`      | 129 superadas, 0 fallidas, omitidas o canceladas                                                                                 | 0      |

Controles finales observados: `mise exec -- pnpm exec eslint scripts/cd-client.mjs scripts/cd-client.test.mjs scripts/cd-policy.mjs scripts/cd-policy.test.mjs` terminó sin incidencias (código 0). `mise exec -- pnpm exec prettier --check scripts/cd-client.mjs scripts/cd-client.test.mjs scripts/cd-policy.mjs scripts/cd-policy.test.mjs docs/tfm/evidencias/2026-10-29-issue-153-ghcr-actions-metadata.md` confirmó el formato (código 0), y `git diff --check` terminó sin errores (código 0). Tras normalizar el formato se repitió la suite CD: 129/129 superadas, código 0.

Refactor: no se añadió otra abstracción para dos llamadas simples. Se conservaron la política pura compartida y las verificaciones de identidad, privacidad y SHA/CI existentes. La ampliación de archivos se limitó a la allowlist y sus pruebas, necesarias para que la nueva consulta fuese alcanzable con el mismo control estricto de destinos.

Pendiente: revisión e integración de esta corrección y diagnóstico con el token de Actions. Un resultado HTTP 401/403/404 o metadatos aún ausentes debe mantener bloqueada la publicación y motivar un diagnóstico posterior. No se declara resuelto el problema remoto. Durante esta implementación local no se publicaron paquetes, modificaron permisos, ejecutaron despliegues ni se accedió al VPS o PostgreSQL. Se mantienen las no aplicabilidades de la sección anterior para cambios de producto, BD y dependencias.

## Continuación aprobada: identidad del paquete y acceso del token de Actions

La PR #155 quedó integrada en `5f1b3c5b3cb2508b77760179e173616da4b56754`. Su CI `40801169542` terminó correctamente. El diagnóstico `40801581622` observó de nuevo API privada con `repositoryMetadata: absent` y web con HTTP 404; los jobs de publicación y despliegue quedaron omitidos. El cambio de endpoint no resolvió la ausencia de metadatos del repositorio en Actions. La Issue #153 continúa abierta.

El usuario autorizó expresamente sustituir la exigencia de asociación de repositorio en cada respuesta por identidad exacta de paquete, privacidad y lectura autenticada mediante el token del workflow. La comprobación local autenticada confirmó `name: nextriva-api`, `owner.login: xbasets82` y `visibility: private`; no sustituye la comprobación posterior con el token de Actions. Esta sección modifica el criterio vigente descrito en las secciones históricas anteriores, sin reconstruir sus resultados.

La política compartida de publicación y diagnóstico exige ahora:

- Consulta por las dos rutas exactas ya permitidas: `/user/packages/container/nextriva-api` y `/user/packages/container/nextriva-web`, con el token recibido del workflow.
- Respuesta HTTP satisfactoria, paquete objeto, `name` exacto del servicio, `owner.login` exacto `xbasets82` y `visibility: private`. Identidad ausente, malformada o ajena bloquea publicación antes de Docker y bloquea todos los outputs después del push.
- El campo opcional `repository` puede estar ausente. Si está presente y es inválido o identifica otro repositorio, el rechazo se conserva. Los indicadores históricos de asociación siguen siendo diagnósticos y no prueban por sí solos aceptación.
- HTTP 404 de API siempre bloquea. HTTP 404 de web solo permite intentar su publicación inicial; en diagnóstico se etiqueta `not_published_yet`. Un 404 no distingue inexistencia de falta de acceso y nunca demuestra autorización para desplegar. Ambos paquetes deben responder y superar la política después del push antes de entregar cualquier digest. Los errores 401, 403, 500 y de red siguen bloqueando.

No se incorporan credenciales nuevas, dependencias, cambios de permisos, excepciones a SHA/CI, activación automática ni modificaciones de PostgreSQL. El token de publicación sigue siendo el `GITHUB_TOKEN` limitado del job existente. La asociación visual del paquete a su repositorio y su acceso de Actions se verificaron en la preparación remota previa; la ausencia de esos metadatos en REST ya no es una garantía comprobable en cada ejecución y queda documentada como limitación aceptada.

### TDD y controles locales observados

| Paso                                                            | Comando                                                                                                                                                      | Resultado observado                                                                                                                          | Código |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| RED política                                                    | `mise exec -- node --test scripts/cd-client.test.mjs`                                                                                                        | 128 pruebas: 97 superadas y 31 fallidas por ausencia de las reglas aprobadas: identidad de paquete, repositorio omitido y bloqueo de API 404 | 1      |
| GREEN política mínima                                           | Mismo comando tras implementar la política                                                                                                                   | 128 superadas, 0 fallidas                                                                                                                    | 0      |
| RED estado de bootstrap                                         | Mismo comando tras cambiar las expectativas de diagnóstico                                                                                                   | 128 pruebas: 112 superadas y 16 fallidas exclusivamente por esperar `not_published_yet` donde se emitía `github_http_404` de web             | 1      |
| GREEN estado de bootstrap                                       | Mismo comando tras implementar el estado informativo                                                                                                         | 128 superadas, 0 fallidas                                                                                                                    | 0      |
| Regresión CD tras añadir comprobación de API 404 en diagnóstico | `mise exec -- node --test scripts/cd-*.test.mjs`                                                                                                             | 148 superadas, 0 fallidas, omitidas o canceladas                                                                                             | 0      |
| ESLint final                                                    | `mise exec -- pnpm exec eslint scripts/cd-client.mjs scripts/cd-client.test.mjs`                                                                             | Sin incidencias; una primera ejecución detectó una variable de fixture no utilizada y se corrigió antes de este resultado                    | 0      |
| Formato final                                                   | `mise exec -- pnpm exec prettier --check scripts/cd-client.mjs scripts/cd-client.test.mjs docs/tfm/evidencias/2026-10-29-issue-153-ghcr-actions-metadata.md` | Todos los archivos cumplen formato                                                                                                           | 0      |
| Espacios                                                        | `git diff --check`                                                                                                                                           | Sin errores                                                                                                                                  | 0      |

Revisión SOLID/seguridad: se conserva una única política pura para diagnóstico y publicación; no se añade arquitectura nueva. La identidad se obtiene de campos independientes del vínculo opcional al repositorio. La respuesta completa no se imprime. Las pruebas de denegación comprueban ausencia de outputs y de push/login cuando corresponde; las guardas posteriores no entregan resultados parciales aunque API ya se haya publicado. El workflow continúa exclusivamente manual, y las pruebas existentes comprueban el SHA/CI exactos, restricciones SSH y ausencia de Docker/SSH en diagnóstico.

No aplican migraciones, PostgreSQL real, OpenAPI, cliente de producto, UI, Playwright ni build/typecheck de aplicación para esta modificación MJS sin cambio de producto o persistencia. No se ejecutó cobertura global ni auditoría nueva; no cambian dependencias. Pendiente: revisión independiente, integración, CI del SHA exacto y diagnóstico real autorizado; después, publicación/despliegue manual y recuperación requieren sus verificaciones operativas. Esta implementación local no demuestra que producción ya se haya actualizado ni habilita el CD automático.

### Corrección tras revisión independiente: vínculo presente malformado

La revisión independiente reprodujo un rechazo insuficiente: `repository: {}` o `repository: { full_name: null }` se clasificaban como vínculo ausente, permitiendo publicar y entregar digests con un objeto presente sin identidad válida. Se corrigió la distinción: solo un campo `repository` ausente o nulo se admite como metadato opcional omitido; un objeto presente debe contener una identidad válida y coincidente. Las clasificaciones anteriores se conservan como evidencia histórica del comportamiento previo.

- RED observado: `mise exec -- node --test scripts/cd-client.test.mjs` terminó con código 1, 137 pruebas, 127 superadas y 10 fallidas exactamente por el defecto: ocho casos de API/web con objeto sin `full_name` o con `full_name: null` antes/después del push, y dos diagnósticos que debían clasificar esos objetos como inválidos. Las aserciones comprueban rechazo, ausencia de outputs/digests, ausencia de login/push antes de la publicación y bloqueo del siguiente servicio cuando falla la verificación posterior de API.
- GREEN observado: mismo comando tras la corrección mínima, código 0, 137/137 superadas. Se eliminó exclusivamente la clasificación de `full_name` ausente/nulo como `absent`; las reglas de identidad de paquete, privacidad, token y bootstrap no cambiaron.
- Regresión final: `mise exec -- node --test scripts/cd-*.test.mjs`, código 0, 156/156 superadas, sin fallos, omisiones ni cancelaciones.
- ESLint de los dos MJS, Prettier de los dos MJS y esta evidencia, y `git diff --check`: código 0.

Revisión de seguridad/refactor: el clasificador compartido conserva el rechazo seguro de objetos malformados en diagnóstico y publicación; no requiere otra abstracción ni cambio de workflow. No se realizaron operaciones remotas, commits, publicaciones ni despliegues durante esta corrección.

### Cierre del rechazo de vínculo nulo

La revisión final comprobó además `repository: null`: la comparación anterior `== null` aún lo admitía como omitido. El criterio definitivo permite únicamente el campo omitido (`undefined` en JavaScript). Un campo presente con valor nulo es inválido y bloquea la publicación y los digests. Este criterio sustituye la admisión de vínculo nulo descrita en la corrección anterior.

- RED: `mise exec -- node --test scripts/cd-client.test.mjs`, código 1; 141 pruebas, 136 superadas y cinco fallidas por aceptación indebida de `repository: null`: API/web antes y después del push y diagnóstico que aún informaba `absent`. Las pruebas exigen cero outputs, ausencia de login/push antes de publicar y bloqueo de web cuando la verificación posterior de API falla.
- GREEN: mismo comando tras distinguir explícitamente `undefined` de `null`, código 0; 141/141 superadas. El clasificador conserva `invalid` para nulo y evita acceder a sus propiedades.
- Regresión final: `mise exec -- node --test scripts/cd-*.test.mjs`, código 0; 160/160 superadas, sin fallos, omisiones ni cancelaciones.
- ESLint de los dos MJS, Prettier de los dos MJS y esta evidencia, y `git diff --check`: código 0.

No se añadieron abstracciones, dependencias, permisos ni operaciones remotas. La misma política clasifica el diagnóstico y bloquea publicación/digests.
