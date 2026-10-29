# Issue #153 — Diagnóstico seguro de metadatos GHCR en Actions

Fecha: 29/10/2026. Estado: diagnóstico ampliado implementado y verificado localmente; causa remota y desbloqueo de publicación pendientes.

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
