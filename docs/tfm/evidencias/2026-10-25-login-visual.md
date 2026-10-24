# Rediseño visual del login

Fecha: 25/10/2026. Issue [#89](https://github.com/xbasets82/Nextriva/issues/89), aprobado. Rama `feat/login-visual-refresh`, creada desde `main` actualizado en `f0ae14538ebb0738f3818d96f6089b005aba1393`.

## Alcance y decisiones

Se dejó una única marca `NEXTRIVA`, centrada y con mayor jerarquía tipográfica; se retiró la tarjeta de estado de salud y sus mensajes de la interfaz; el formulario quedó contenido y responsive con tokens existentes. El control de contraseña ahora usa SVG inline con ojo y ojo tachado, botón `type="button"` y nombre accesible dinámico. No hay biblioteca de iconos en los manifiestos, así que no se agregó dependencia.

No se modificaron las operaciones de autenticación, CSRF, cookies, sesiones, validaciones ni permisos. La redirección visual al cerrar sesión sí se ajustó para que la ruta de login sustituya la entrada protegida del historial. Se retiró de la interfaz el `GET /api/health` que únicamente alimentaba el panel, manteniendo el endpoint y el contrato OpenAPI sin cambios. La prueba E2E directa del contrato de salud continúa pasando.

## TDD observado

| Etapa                    | Prueba/comando                                                                                              | Resultado observado                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| RED: marca y panel       | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/App.test.tsx`                                 | 1 prueba nueva falló porque seguía presente el encabezado duplicado `Nextriva`; 2 pruebas existentes pasaron. Código 1.                 |
| GREEN: marca y panel     | Mismo comando, después del cambio de `App.tsx`                                                              | 3/3 pruebas pasaron. Código 0.                                                                                                          |
| RED: icono de contraseña | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/auth-login.test.tsx`                          | 1 prueba nueva falló porque el control no contenía SVG; 16 pruebas pasaron. Código 1.                                                   |
| RED: E2E del icono       | `NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e` | 40/41 pasaron; el caso nuevo falló por la ausencia esperada de `svg[data-icon="eye"]`. Código 1.                                        |
| GREEN                    | Vitest dirigido de `App.test.tsx` y `auth-login.test.tsx`                                                   | 20/20 pasaron. Código 0.                                                                                                                |
| Refactor y regresión     | Vitest web, cobertura y E2E completos repetidos                                                             | Resultados detallados abajo. Se eliminó el código de estado de salud que quedó sin presentación; no se añadieron dependencias ni capas. |

Durante el primer E2E, la especificación anterior de salud esperaba la pantalla antigua y falló; se actualizó para verificar la ausencia del panel y se conservó la prueba directa del contrato API. Una repetición E2E falló por ambigüedad del selector Playwright `getByLabel('Contraseña')` (el campo y el nuevo botón tenían ese nombre); se cambió el selector del campo a `#login-password`. No se relajaron las aserciones del flujo.

## Resultados finales

| Validación     | Comando                                                                                                     | Resultado                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Unitarias web  | `mise exec -- pnpm --filter @nextriva/web test`                                                             | 20 archivos, 216 pruebas; código 0.                                                                     |
| Cobertura web  | `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                    | 216 pruebas; 94,86 % líneas, 89,09 % ramas, 93,05 % sentencias y 93,54 % funciones; código 0.           |
| E2E Playwright | `NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e` | 42/42 pasaron; código 0. Chromium real con API y PostgreSQL temporal aislado; no se usó `nextriva_dev`. |
| TypeScript     | `mise exec -- pnpm typecheck`                                                                               | API y web sin errores; código 0.                                                                        |
| ESLint         | `mise exec -- pnpm lint`                                                                                    | Sin errores; código 0.                                                                                  |
| Prettier       | `mise exec -- pnpm format:check`                                                                            | Formato correcto; código 0.                                                                             |
| Build          | `mise exec -- pnpm build`                                                                                   | API y web compiladas; código 0.                                                                         |
| OpenAPI/salud  | Incluido en E2E `health.spec.ts`                                                                            | Contrato de `GET /api/health` conservado; prueba superada dentro de 42/42.                              |

La primera ejecución de cobertura, concurrente con E2E, falló en `PromotionStatus.test.tsx` mientras esperaba una promoción. Sin cambiar código ni aserciones, la suite de cobertura aislada se repitió y pasó 216/216 con las métricas indicadas. La suite web ordinaria también pasó 216/216.

## Diseño, accesibilidad y límites

Playwright comprobó foco inicial, navegación Tab entre email/contraseña/botón, activación del ojo con Enter, cambio de nombre accesible e icono, conservación del valor y ausencia de envío accidental desde el botón. Verificó el centrado del nombre respecto al formulario y ausencia de desbordamiento horizontal en 390×844 y 1280×800. También pasaron las pruebas existentes de login por Enter, logout/revocación, roles y estados de error.

Se reutilizan colores de tema, tipografía Geist y foco visible existentes; no se afirma conformidad WCAG completa. Revisión visual humana, VoiceOver, Safari y Firefox permanecen pendientes. Integración HTTP separada, migraciones y pruebas de persistencia no aplican porque no cambiaron API ni almacenamiento; el E2E siguió usando PostgreSQL temporal real por el runner compartido.

## Ajuste visual posterior

Se retiró el encabezado «Iniciar sesión» del formulario para evitar repetir el texto del botón. El formulario conserva su nombre accesible mediante `aria-label`.

| Etapa         | Prueba/comando                                                                                              | Resultado observado                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RED           | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/App.test.tsx`                                 | 1 prueba falló porque encontró el encabezado duplicado; 2 pasaron. Código 1. |
| GREEN         | `mise exec -- pnpm --filter @nextriva/web exec vitest run src/App.test.tsx src/auth-login.test.tsx`         | 2 archivos, 20 pruebas pasaron. Código 0.                                    |
| Regresión E2E | `NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e` | 42/42 pasaron con Chromium, API y PostgreSQL temporal aislado. Código 0.     |

## Ajuste de logout y separación de etiquetas

El E2E reprodujo que, tras logout, la tarjeta quedaba 206 px por encima del centro: `SessionGate` cambiaba el hash con `history.replaceState`, que no emite `hashchange`, mientras `App` depende de ese evento para cambiar el marco visual. El logout ahora navega al hash `#/login`, y la pantalla de login se centra en su contenedor. Los grupos de email y contraseña usan una cuadrícula con 12 px de espacio.

| Etapa | Prueba/comando                                                                                              | Resultado observado                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RED   | `NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e` | 40 pasaron y 2 fallaron por las reglas ausentes: login desplazado 206 px y separación de etiqueta-campo de 1 px. Código 1.                                         |
| GREEN | Mismo comando tras la corrección y ajuste del cálculo contra el contenedor de login                         | 42/42 pasaron con PostgreSQL temporal aislado. Código 0; la alineación queda dentro de 10 px del centro del contenedor y ambos campos superan 10 px de separación. |

En una corrida intermedia apareció además un fallo en la prueba existente de búsqueda de incidencias; la suite completa posterior pasó sin cambiar esa prueba. Una corrida intermedia midió 8 px frente al centro global del viewport; la aserción final compara con el contenedor real de login y admite hasta 10 px de margen visual.

## Revisión final: historial de navegación al cerrar sesión

La revisión independiente detectó que asignar `window.location.hash` al salir agrega una entrada al historial. Se añadió una comprobación E2E que captura `history.length` antes del logout y exige que se mantenga; la prueba confirmó RED con 41/42 casos superados y el nuevo caso fallido por un incremento de una entrada (código 1). La redirección ahora usa `window.location.replace('#/login')`, incluida la protección de rutas anónimas, para conservar la ruta segura sin apilar una entrada. La repetición del runner aislado pasó 42/42 (código 0). La fila de salud de arriba refleja este resultado final.
