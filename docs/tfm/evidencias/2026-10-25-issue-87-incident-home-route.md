# Incidencias como pantalla inicial después del login

Fecha: 25/10/2026. Issue [#87](https://github.com/xbasets82/Nextriva/issues/87), aprobado. Rama `feat/web-incidents-home`, creada desde `main` actualizado en `6418c4c43fc2effb8e3812c2025d8e9f7b4b0125`.

## Decisión e implementación

Después de autenticar, los tres roles abren `#/incidents` cuando no existe un destino recuperable. Una sesión válida que llega a la raíz también se dirige allí. El router conserva rutas internas conocidas y permitidas, como Promociones y el detalle de una incidencia; `#/users` solo se conserva para ADMIN. Destinos desconocidos, malformados, externos o sin permiso vuelven a Incidencias. `#/promotions/`, ya reconocido por el módulo como listado, se normaliza a `#/promotions`.

La lista permitida se centraliza en `apps/web/src/auth/navigation.ts` y la usan tanto `SessionGate` como el render de `App`, evitando mostrar brevemente la pantalla genérica mientras se normaliza la raíz. Logout conserva el flujo existente y vuelve a login. No cambian API, OpenAPI, persistencia, permisos de servidor ni dependencias. No se modificaron las referencias históricas; se actualizó el suplemento de I03.3 y README.

## TDD observado

| Etapa                     | Comando/observación                                                                                                                                                               | Resultado                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED                       | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/auth-login.test.tsx src/auth-session.test.tsx`                                                                      | 10 casos nuevos fallaron por la pantalla genérica o el estado denegado en vez del listado de Incidencias; 24 pruebas existentes pasaron. Código 1. |
| GREEN                     | El mismo conjunto, junto con `src/auth-session-edge.test.tsx` y `src/App.test.tsx`                                                                                                | 45/45 pruebas pasaron. Código 0.                                                                                                                   |
| Refactor y compatibilidad | La suite web completa detectó que `#/promotions/` era una variante de listado ya soportada y no estaba admitida inicialmente. Se normalizó esa ruta sin ampliar la lista general. | `PromotionForm.test.tsx`, `auth-login.test.tsx` y `auth-session.test.tsx`: 46/46. Código 0. Suite web completa: 219/219. Código 0.                 |

La prueba comprueba login ADMIN/MANAGER/COLLABORATOR, raíz con sesión válida, restauración del destino, fallback de hash externo/desconocido y fallback de Usuarios para roles sin permiso. La suite existente conserva verificaciones de logout, sesión, permisos y navegación.

## E2E y PostgreSQL

El primer intento con los puertos predeterminados terminó antes de iniciar Playwright porque `127.0.0.1:4317` estaba ocupado por un proceso Node preexistente; no se finalizó ese proceso. La suite se ejecutó después con los puertos loopback libres `14317` y `15173`, usando el runner seguro y una base temporal PostgreSQL con las migraciones vigentes. No se utilizó `nextriva_dev`.

La primera ejecución funcional tuvo 36 pruebas superadas y 4 fallidas porque dos especificaciones E2E aún esperaban la antigua alerta visual de Usuarios para MANAGER/COLLABORATOR (cuatro casos en total). Se actualizaron esas expectativas para comprobar el nuevo fallback a Incidencias. Se mantuvieron sin cambios las aserciones de HTTP 403 y de ausencia de mutaciones en PostgreSQL.

Ejecución final: `NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e`: **40/40 pruebas superadas**, código 0. Incluye login y apertura de raíz para los tres roles, recarga en Incidencias, logout/revocación, restricciones de usuarios, promociones e incidencias. El runner empleó PostgreSQL temporal aislado y limpió su base al finalizar.

## Calidad y alcance de verificación

| Comprobación  | Comando                                                  | Resultado                                                                                                                        |
| ------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Vitest web    | `mise exec -- pnpm --filter @nextriva/web test`          | 20 archivos, 219 pruebas superadas. Código 0.                                                                                    |
| Cobertura web | `mise exec -- pnpm --filter @nextriva/web test:coverage` | 219 pruebas; global 95,02 % líneas y 89,13 % ramas. `auth/navigation.ts`: 100 % líneas, ramas, funciones y sentencias. Código 0. |
| TypeScript    | `mise exec -- pnpm typecheck`                            | API y web sin errores. Código 0.                                                                                                 |
| ESLint        | `mise exec -- pnpm lint`                                 | Sin errores. Código 0.                                                                                                           |
| Prettier      | `mise exec -- pnpm format:check`                         | Formato correcto. Código 0.                                                                                                      |
| Build         | `mise exec -- pnpm build`                                | API y web compiladas. Código 0.                                                                                                  |
| Diff          | `git diff --check`                                       | Sin errores. Código 0.                                                                                                           |

Integración HTTP/PostgreSQL directa y regeneración/verificación OpenAPI no aplican: el cambio es navegación cliente y no modifica servidor ni contratos. La persistencia real se ejercitó en los E2E sobre PostgreSQL temporal. No se añadieron dependencias.

## Pendientes y limitaciones

VoiceOver, Safari y Firefox requieren validación manual y permanecen pendientes. No se afirma conformidad WCAG completa. El proceso que ocupaba el puerto predeterminado no se investigó ni se detuvo; para la verificación se seleccionaron puertos alternativos. No se ejecutó ningún flujo contra `nextriva_dev`.
