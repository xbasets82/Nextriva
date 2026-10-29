# Issue #151 — Identidad del repositorio en la política GHCR

Fecha: 29/10/2026. Estado: implementado y verificado localmente; validación con el token real de Actions pendiente.

## Alcance y límite del diagnóstico

La política de `scripts/cd-client.mjs` comparaba `repository.full_name` mediante igualdad sensible a mayúsculas. Por tanto, rechazaba `xbasets82/nextriva` aunque identificase el mismo repositorio que `xbasets82/Nextriva`.

El diagnóstico remoto previo informó `private: true` y `repositoryMatches: false` para API, y HTTP 404 para web. No mostró el valor recibido de `full_name`; esta evidencia local no demuestra que una diferencia de mayúsculas fuese la causa concreta de aquel resultado. Si el token recibe metadatos ausentes o un repositorio diferente, la política seguirá bloqueando la publicación.

## Cambio y garantías conservadas

- Solo se acepta `full_name` cuando es una cadena y coincide con el repositorio configurado tras convertir ambas cadenas a minúsculas.
- No se recortan espacios ni se aceptan URLs, prefijos, sufijos, otros propietarios o nombres de repositorio distintos.
- Los paquetes deben seguir siendo privados. Metadatos ausentes, inválidos o ajenos se rechazan antes del login/publicación inicial y bloquean todos los digests después del push.
- Publicación y diagnóstico comparten la misma política; el diagnóstico continúa emitiendo únicamente categorías, motivos y booleanos, sin valores recibidos ni tokens.
- La excepción inicial de HTTP 404 de #145 permanece intacta: permite intentar la primera publicación, pero exige verificar el paquete privado y vinculado después del push. Un 404 posterior bloquea los digests.
- No se modifica el workflow, su habilitación, los permisos de paquetes, secretos, configuración del VPS ni servicios de producción.

## TDD observado

Runtime utilizado para el ciclo y los controles: Node `24.22.0` y pnpm `10.34.7`, mediante `mise exec --`, conforme a `mise.toml` y `package.json`. Una primera comprobación adicional con el Node predeterminado `25.4.0` también pasó; la safety net se repitió con la versión fijada antes de modificar archivos.

| Paso                        | Comando                                                                  | Resultado observado                                                                   | Salida |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ |
| Safety net                  | `mise exec -- node --test scripts/cd-client.test.mjs`                    | 50 superadas, 0 fallidas                                                              | 0      |
| RED                         | Mismo comando, tras añadir 4 casos de identidad con mayúsculas distintas | 50 superadas y 4 fallidas con `package_policy_rejected`, motivo `repository_mismatch` | 1      |
| GREEN mínimo                | Mismo comando, tras comprobar el tipo y normalizar mayúsculas            | 54 superadas, 0 fallidas                                                              | 0      |
| Triangulación y regresiones | Mismo comando, con matriz de denegaciones pre/post-push y diagnóstico    | 96 superadas, 0 fallidas                                                              | 0      |

Los cuatro casos RED ejercitan API y web con dos variantes de mayúsculas. Cada positivo comprueba las verificaciones antes y después del push y la entrega de ambos digests. La matriz negativa añade diez valores ausentes, inválidos o ajenos por servicio y etapa; comprueba el motivo seguro, ausencia de digests y ausencia de login antes del rechazo inicial. Dos casos verifican la salida JSON exacta del diagnóstico con identidad equivalente y la ausencia de metadatos sensibles.

Los 42 casos adicionales son triangulación/regresión de garantías ya existentes y del comportamiento corregido; no se declara un RED independiente para ellos. No se reconstruyen ciclos históricos.

Revisión SOLID y seguridad: se conserva el cálculo único de política utilizado por publicación y diagnóstico. La comparación sigue siendo pura, sin efectos externos. No se necesita añadir otra abstracción ni modificar las fases de publicación. Se revisaron las aserciones de ausencia de login para comprobar cualquier servicio, no un nombre deducido del fixture; la suite CD se repitió tras esa mejora.

## Controles finales observados

| Comando                                                                                    | Resultado                                        | Salida |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------ |
| `mise exec -- node --test scripts/cd-*.test.mjs`                                           | 113 superadas; 0 fallidas, omitidas o canceladas | 0      |
| `mise exec -- pnpm exec eslint scripts/cd-client.mjs scripts/cd-client.test.mjs`           | Sin incidencias                                  | 0      |
| `mise exec -- pnpm exec prettier --check scripts/cd-client.mjs scripts/cd-client.test.mjs` | Formato correcto                                 | 0      |
| `git diff --check`                                                                         | Sin errores de espacios                          | 0      |

La suite completa de CD conserva las verificaciones de SHA/CI exactos, autorización de rama, paquetes privados, esquema, rollback, bloqueo concurrente e identidad/volumen PostgreSQL mediante fixtures locales. No prueba por sí misma un despliegue real ni el acceso actual del token de Actions a GHCR.

## Definition of Done proporcional

- Criterios locales: identidad equivalente aceptada; metadatos ausentes, inválidos y repositorios distintos rechazados; privacidad y comprobación posterior conservadas.
- TDD y calidad: ciclo y códigos observados arriba, sin dependencias nuevas ni cambios de manifiesto/lockfile.
- OpenAPI, cliente HTTP, migraciones y PostgreSQL real: no aplicables; no se modifican contratos de aplicación ni persistencia.
- UI, accesibilidad, Playwright, unitarias web/API, typecheck y build de aplicación: no aplicables a esta comparación MJS sin cambios de producto. Los controles afectados son Node, ESLint y Prettier.
- Cobertura global y auditoría de dependencias: no ejecutadas para este parche acotado sin dependencias nuevas. No se afirma un porcentaje nuevo ni un resultado nuevo de auditoría.
- Validación remota: pendiente de integración, CI del SHA exacto y autorización de una nueva ejecución de `diagnose`. No se ha publicado, desplegado ni activado CD automático durante esta implementación.
- Commit, push y PR: requieren la autorización posterior correspondiente.

## Validación posterior propuesta

Tras integrar el cambio y observar CI satisfactorio para su SHA, ejecutar únicamente el diagnóstico autorizado desde `main`, manteniendo `NEXTRIVA_CD_MANUAL_ENABLED=false`. Verificar `repositoryMatches: true` si el único desacuerdo era de mayúsculas; si sigue siendo `false`, conservar el bloqueo e investigar los metadatos de forma segura. Verificar que `publish` y `deploy` quedan omitidos. La creación inicial del paquete web pertenece a la publicación manual previamente diseñada y necesita su autorización específica.
