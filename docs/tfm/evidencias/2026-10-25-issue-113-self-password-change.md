# Cambio de contraseña propia desde la cabecera

Fecha: 25/10/2026. Issue [#113](https://github.com/xbasets82/Nextriva/issues/113), verificado `status:approved`. Rama `codex/issue-113-self-password-change`, desde `main` actualizado en `ee6be982008b27d9ced8070e4519fa86a8fbf352`.

## Alcance y decisiones

La aprobación del Issue incorpora este ajuste transversal de autenticación antes de I10; no crea una HU16 ni un incremento funcional nuevo. Cualquier usuario autenticado activo puede modificar exclusivamente su propia contraseña desde el icono situado inmediatamente a la izquierda de logout. Se reutilizan Argon2id, cookie de sesión, guard de sesión/Origin/CSRF y coordinación Web Locks entre transiciones de autenticación.

Contrato implementado: `POST /api/auth/change-password`, body con `currentPassword`, `newPassword` y `confirmPassword`, sin campos adicionales ni `userId`. Éxito HTTP 204 con cookie caducada. Datos inválidos o contraseña actual incorrecta producen HTTP 400, sin interpretar este error como sesión expirada. Sesión inválida/inactiva: 401; CSRF/origen inválidos: 403; límite de intentos: 429; fallo inesperado de persistencia/hash: 503 con mensaje seguro.

Se conserva la validación vigente: contraseña no vacía, máximo 1.024 unidades de `string.length`, sin introducir composición ni mínimo nuevos. La confirmación debe coincidir y la nueva debe ser distinta de la actual. El limitador reutiliza cinco fallos por email normalizado e IP en quince minutos, en una instancia independiente de login. Es memoria local del proceso, como el mecanismo existente; no representa un limitador distribuido.

Persistencia: bloqueo `FOR UPDATE` de la fila de usuario, comprobación de identidad, hash/rol verificados y sesión todavía vigente, actualización del hash y `revokeSessionsForUser` en una sola transacción. El bloqueo es compatible con el `FOR SHARE` existente de creación de sesión. Una verificación antigua no permite crear una sesión tras sustituirse el hash. No hay cambios de esquema, migraciones, entidades ni actividad de incidencias.

## TDD realmente observado

| Ciclo                  | Comando                                                                          | RED observado                                                                  | GREEN observado                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Cambio propio por HTTP | `mise exec -- pnpm --filter @nextriva/api test:integration`                      | Test nuevo esperaba 204 y recibió 404 porque no existía el endpoint; código 1  | Tras mínimo API/transacción, 211 pruebas aprobadas y 2 omitidas preexistentes; código 0                    |
| Allowlist del body     | Mismo runner                                                                     | El caso con `userId` adicional recibió 204 en vez de 400; código 1             | Allowlist estricta y validación de confirmación/contraseña distinta; regresión completa posterior aprobada |
| Acción/formulario web  | `mise exec -- pnpm --filter @nextriva/web test src/auth/ChangePassword.test.tsx` | Dos pruebas fallaron al no existir el botón «Cambiar contraseña»; código 1     | Dos pruebas iniciales aprobadas después de implementar el formulario; código 0                             |
| Redacción Pino         | `mise exec -- pnpm --filter @nextriva/api test src/observability/logger.test.ts` | Las propiedades estructuradas de los tres campos no se eliminaban; código 1    | Se incorporaron los tres nombres a la redacción; dos pruebas aprobadas; código 0                           |
| Foco durante envío     | `mise exec -- pnpm --filter @nextriva/web test src/auth/ChangePassword.test.tsx` | Durante carga el foco estaba fuera del diálogo y no en su contenedor; código 1 | Foco al contenedor del diálogo durante carga, Tab contenido; cinco pruebas aprobadas; código 0             |

Refactor: se extrajeron validación y traducción de errores del formulario a funciones pequeñas; se mantuvieron servicios de Auth, persistencia y UI separados. No se rebajaron umbrales ni se desactivaron reglas ESLint. Se conservó la coordinación existente de cookies y se reutilizó el contexto transaccional.

**Limitación TDD:** las pruebas de rollback, carreras y limitación de intentos se añadieron como regresión después del mínimo inicial; no se observó un RED independiente para cada una. No se reconstruyen ni se declaran ciclos RED históricos para esos casos. El RED de allowlist no demuestra por sí solo que cada variante de validación fallara previamente.

## Pruebas de seguridad y persistencia

- Cambio correcto con los tres roles; hash Argon2id verificado y revocación de todas las sesiones propias, incluida otra sesión ya abierta; las sesiones de otro usuario permanecen vigentes.
- Contraseña anterior devuelve 401 al autenticar; la nueva permite login 200; una cookie revocada devuelve 401.
- Cuerpo inválido, contraseña actual incorrecta, identidad adicional, confirmación distinta, misma contraseña, tamaño inválido y CSRF/origen inválidos conservan usuario y sesiones sin cambios.
- Cuenta inactiva devuelve 401 sin escrituras adicionales.
- Cinco verificaciones fallidas y sexta 429 sin escrituras; el bucket no impide un login válido.
- Un trigger PostgreSQL restringido al UUID del fixture provoca fallo de revocación: HTTP 503 seguro y rollback de hash/sesiones. El trigger y la función se retiran mediante `finally`.
- Dos servicios con barrera en la verificación fuerzan dos cambios basados en el mismo hash: exactamente uno confirma y el otro falla sin sobrescribir.
- Una barrera antes de crear sesión mantiene un login ya verificado hasta después del cambio de contraseña: login rechazado, sin sesión creada con hash antiguo.
- Chromium real prueba ADMIN, MANAGER y COLLABORATOR, apertura/cancelación por teclado, foco, ojos, error 400 sin logout involuntario, cambio y regreso a login, antigua 401/nueva 200 y ausencia de almacenamiento persistente de credenciales.

## Resultados de validación

Todos los comandos se ejecutaron desde la raíz `/Users/xbasets/Repos/Nextriva`. Integración, cobertura API y E2E utilizaron exclusivamente bases temporales creadas y eliminadas por el runner seguro en PostgreSQL de pruebas. No se cargó `.env.local`, no se usó `nextriva_dev` y no se modificaron datos de desarrollo.

| Control                             | Comando                                                                                                                                               | Resultado real                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unitarias API                       | `mise exec -- pnpm --filter @nextriva/api test`                                                                                                       | 263 aprobadas, 31 archivos; código 0                                                                                     |
| Unitarias web                       | `mise exec -- pnpm --filter @nextriva/web test`                                                                                                       | 328 aprobadas, 23 archivos; código 0                                                                                     |
| Web y cobertura                     | `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                              | 328 aprobadas, 23 archivos; código 0. Líneas 95,44 %, ramas 90,41 %, sentencias 94,34 %, funciones 96,86 %               |
| Integración PostgreSQL              | `mise exec -- pnpm --filter @nextriva/api test:integration`                                                                                           | 217 aprobadas y 2 omitidas preexistentes, 13 archivos aprobados y 1 omitido; código 0                                    |
| API y cobertura PostgreSQL          | `mise exec -- pnpm --filter @nextriva/api test:coverage`                                                                                              | 480 aprobadas y 2 omitidas preexistentes; código 0. Líneas 91,55 %, ramas 86,30 %, sentencias 90,17 %, funciones 95,18 % |
| Caso aislado de validador existente | `mise exec -- node scripts/test-integration.mjs --isolated-validator-test`                                                                            | 1 aprobada, 94 no seleccionadas por este runner dirigido; código 0                                                       |
| E2E Chromium                        | `NEXTRIVA_E2E_API_PORT=4517 NEXTRIVA_E2E_WEB_PORT=5517 mise exec -- pnpm --filter @nextriva/api test:e2e`                                             | 61 aprobadas; código 0. Repetido después del refactor con 61 aprobadas y código 0                                        |
| Cliente OpenAPI                     | `mise exec -- pnpm api:types`; `mise exec -- pnpm api:types:check`                                                                                    | Cliente regenerado con herramienta fijada; reproducción sin diferencias, código 0                                        |
| TypeScript                          | `mise exec -- pnpm typecheck`                                                                                                                         | API/web correctos; código 0                                                                                              |
| ESLint                              | `mise exec -- pnpm lint`                                                                                                                              | Código 0                                                                                                                 |
| Formato                             | `mise exec -- pnpm format:check`                                                                                                                      | Código 0                                                                                                                 |
| Build                               | `mise exec -- pnpm build`                                                                                                                             | API/web correctos; código 0                                                                                              |
| Diff                                | `git diff --check`                                                                                                                                    | Código 0                                                                                                                 |
| Auditoría actual                    | `mise exec -- pnpm audit --json`                                                                                                                      | Código 1 por una vulnerabilidad high conocida: Multer `GHSA-q7qp-rjg7-q26m`; ninguna nueva                               |
| Baseline estricto                   | `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-113-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1` | Código 0, únicamente la excepción Multer ya aprobada, caduca 23/11/2026. Baseline sin cambios                            |

Los dos omitidos del runner compartido corresponden a la estrategia de aislamiento ya existente (caso de validador único y suite dedicada al runner aislado). La ejecución dirigida del validador se repitió explícitamente y pasó.

## Incidencias durante las verificaciones

- Una ejecución de integración durante el RED de allowlist mostró además dos fallos de promociones relacionados con fixtures concurrentes de unicidad/conteo. No se modificaron pruebas ni reglas de promociones; la suite completa posterior pasó sin esos fallos.
- El E2E inicial se detuvo antes de ejecutar pruebas porque el puerto 4317 estaba ocupado. Se preservó el proceso ajeno y se utilizaron las variables de puertos validadas existentes, manteniendo `reuseExistingServer: false`.
- Los primeros E2E nuevos tenían un selector de contraseña ambiguo con el nombre accesible del ojo; se utilizaron etiquetas exactas. El caso MANAGER requería esperar que el listado inicial terminara su carga/foco antes de activar el icono por teclado. Las aserciones de seguridad y funcionalidad se conservaron.
- Una cobertura API ejecutada simultáneamente con E2E/cobertura web agotó los 15 segundos de un bootstrap existente; la repetición con carga reducida pasó sin cambiar timeout ni aserciones. La cobertura web simultánea también encontró una aserción existente de hash antes del efecto de redirección; la repetición pasó sin modificarla.
- Las comprobaciones iniciales ESLint detectaron literales de contraseñas sintéticas y complejidad del formulario; se sustituyeron por valores generados y se extrajeron funciones, sin supresiones.

## Validación manual pendiente

El usuario confirmó visualmente que el icono de candado se entiende mejor y que el tooltip está visible. Con la aplicación local y una cuenta existente, reiniciar la API para cargar la ruta nueva; iniciar sesión, abrir el cambio de contraseña desde el candado, comprobar los tres ojos y cancelar mediante Escape. Volver a abrir, informar contraseña actual y una nueva distinta dos veces, guardar y comprobar la confirmación en login. Verificar que la antigua ya no autentica y la nueva sí. Otra sesión del mismo usuario debe quedar invalidada; una de otro usuario debe seguir vigente. Esta validación funcional del cambio aún no se ha confirmado.

Pendientes: revisión visual humana de escritorio/tablet/móvil, VoiceOver, Safari y Firefox. No se declara conformidad WCAG completa ni validación manual realizada. La seguridad de la operación no depende de ocultar el botón. No hay notificaciones, recuperación por email ni cambio de contraseña de otros usuarios.

## Uso de IA y estado

Codex colaboró en diseño, implementación y pruebas; los resultados anteriores proceden de ejecuciones observadas y se conservan las limitaciones de TDD. Los datos y contraseñas de prueba son sintéticos y generados por test, no credenciales reales. No se realizaron commits, push, PR, merge ni operaciones sobre datos de desarrollo. La validación humana y la autorización de publicación son pasos posteriores.

## Ajuste posterior del icono y tooltip

Tras la prueba del usuario, se sustituyó el icono de llave por un candado con bocallave (`lock-keyhole`) y se añadió un tooltip visible «Cambiar contraseña» en hover y foco de teclado. El tooltip está asociado con `aria-describedby`, se puede descartar mediante Escape y se oculta mientras el formulario está abierto o la acción está deshabilitada. Se conserva el nombre accesible y la lógica de cambio de contraseña. No se modificó API ni se reinició ningún proceso.

| Etapa/control       | Comando                                                                                                                  | Resultado observado                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| RED icono y tooltip | `mise exec -- pnpm --filter @nextriva/web test src/auth/ChangePassword.test.tsx`                                         | 2 nuevas fallaron por icono ausente y falta de elemento `tooltip`; 5 existentes aprobadas, código 1 |
| GREEN dirigido      | Mismo comando tras el ajuste                                                                                             | 7 aprobadas, código 0                                                                               |
| Regresión web       | `mise exec -- pnpm --filter @nextriva/web test`                                                                          | 330 aprobadas, 23 archivos, código 0                                                                |
| Tipos web           | `mise exec -- pnpm --filter @nextriva/web typecheck`                                                                     | Código 0                                                                                            |
| ESLint afectado     | `mise exec -- pnpm exec eslint apps/web/src/auth/ChangePassword.tsx apps/web/src/auth/ChangePassword.test.tsx`           | Código 0                                                                                            |
| Formato afectado    | `mise exec -- pnpm exec prettier --check apps/web/src/auth/ChangePassword.tsx apps/web/src/auth/ChangePassword.test.tsx` | Código 0                                                                                            |
| Diff                | `git diff --check`                                                                                                       | Código 0                                                                                            |

Refactor adicional innecesario para este ajuste local. La presentación visual del nuevo tooltip requiere confirmación humana; VoiceOver y otros navegadores continúan pendientes. No se repitieron integración PostgreSQL ni E2E en este ajuste exclusivamente visual; los resultados anteriores corresponden a la revisión previa.
