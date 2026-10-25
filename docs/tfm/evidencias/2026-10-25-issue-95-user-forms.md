# Formularios de usuarios — Slice 1: estado desde edición

Fecha: 25/10/2026. Issue #95 aprobado. Rama `codex/issue-95-status-edit`, desde `origin/main` en `b380c493`. Unidad 1 de 3; referencias a #95, sin cerrar el Issue.

## Alcance

HU02: activar/desactivar desde el formulario existente mediante la operación de estado y CSRF actuales, separada de Guardar. Confirmación explícita, foco seguro y Escape, bloqueo durante petición, errores sin detalles internos y conservación del borrador. Se mantienen permisos, último ADMIN y restricciones de responsables del backend. Sin edición de contraseñas, cambios de API, migraciones ni dependencias.

El E2E propio que comprueba desactivación/reactivación con PostgreSQL real, borrador no persistido y hash conservado se publica con la unidad 2, que depende de esta; se redistribuye sin eliminar aserciones. Los ajustes visuales y la continuidad del listado pertenecen a las unidades 2/3. La reversión de esta unidad afecta solo esta UI y sus pruebas.

## Evidencia observada

Los RED/GREEN proceden de la implementación original de #95: controles de estado ausentes en el RED inicial y GREEN posterior; el caso de Escape falló por foco no restaurado y pasó tras corregirlo. Esta partición reorganiza código ya verificado; no se reconstruye un RED histórico nuevo.

En este worktree: `mise exec -- pnpm --filter @nextriva/web test`: 245/245, código 0; `mise exec -- pnpm lint` y `mise exec -- pnpm format:check`: código 0; `mise exec -- pnpm typecheck`: código 0 tras la generación Prisma segura del runner (antes falló por cliente generado ausente).

El runner E2E seguro, con DATABASE_URL/TEST_DATABASE_URL heredadas eliminadas y puertos 14317/15173, validó la configuración test y ejecutó Chromium/API/PostgreSQL temporales: 46/47, código 1; los 4 casos de users.spec.ts pasaron. Falló el caso existente `incident-list-ui.spec.ts:228` al esperar el enlace Propia tras Buscar; causa sin confirmar. Una repetición completa sin cambios pasó 47/47, código 0; ambos resultados se conservan, sin atribuir una causa no demostrada ni relajar aserciones. El primer intento en el worktree había sido rechazado antes de BD por configuración test enlazada; se preparó archivo propio regular 0600 autorizado, sin debilitar el lector. Vite advierte sobre fuentes enlazadas fuera de su allow list; no se atribuye el fallo a ese aviso sin prueba.
Pendientes: seguimiento del fallo intermitente ajeno, validación visual humana, VoiceOver, Safari y Firefox. No se utilizó nextriva_dev, no se cargó .env.local ni se mostraron secretos. El Slice 1 se integró mediante PR #96 tras CI verde. Codex asistió en el análisis, pruebas y partición; no se declara conformidad WCAG completa.

## Revisión fresca: Escape durante guardado

La revisión detectó que Escape cerraba la confirmación durante la mutación pendiente. Se añadió primero una prueba con promesa diferida: `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx -t 'keeps the edit status confirmation open'` produjo 1 fallida/4 no seleccionadas, código 1, porque el diálogo desaparecía. La corrección condiciona Escape a `!busy`; la promesa se libera en finally. `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx src/users/StatusUser.test.tsx`: 16/16, código 0. Typecheck, lint y formato raíz pasaron con código 0; la repetición E2E completa posterior, con el runner seguro y sin cambios de código/runner, pasó 46/46 en 17,5 s, código 0 (el E2E específico de estado se conserva para la unidad 2). Se conserva la regresión junto al fix y el E2E de estado se desplaza intacto a la unidad 2 para respetar 400 líneas por PR; no se reconstruye otro RED.

## Slice 2: formularios y coherencia visual

Rama `codex/issue-95-form-visuals`, desde `origin/main` `1401f35` (merge #96, Slice 1). Se confirmó árbol limpio antes de crearla. Depende del estado desde edición ya integrado; no incluye continuidad/recuperación del listado de la unidad 3 ni cierra #95.

Formulario centrado, etiquetas separadas, controles alineados y acciones con SVG/texto visible, nombres accesibles Guardar usuario/Cancelar y estados de foco/carga. El ojo se limita a contraseña inicial de creación; edición no recibe ni envía contraseñas. Rol reutiliza el patrón visual del filtro; las tarjetas de confirmación comparten estilos de borde/título/acciones y mensaje. Sin dependencias, backend, contrato, esquema ni cambios de permisos.

Antes de aplicar producción, se añadieron las pruebas UI al Slice 1 integrado: `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx` produjo RED, 5 fallidas/4 superadas, código 1, por ojo/dropdowns/Guardar accesible ausentes y tarjeta distinta. Tras aplicar solo UI, formularios+estado pasaron 20/20, código 0. Se conservaron sin cambios el guard !busy y la prueba diferida de Escape; se comparten estilos sin crear otro patrón.

El E2E de estado trasladado intacto desde Slice 1 acompaña ahora a esta unidad: compara estado/borrador/hash en PostgreSQL real. El flujo de creación existente comprueba el ojo mediante Enter/Espacio y sus selectores usan Guardar usuario, sin rebajar aserciones.

`mise exec -- pnpm --filter @nextriva/web test:coverage`: 250/250, 21 archivos, código 0; 95,33 % líneas, 89,40 % ramas, 93,84 % funciones y 93,38 % sentencias. `src/users`: 97,08 % líneas y 92,51 % ramas.

`env -u DATABASE_URL -u TEST_DATABASE_URL NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e`: 47/47, 21,2 s, código 0. Se mantuvo el runner seguro con PostgreSQL temporal; continúa el aviso de fuentes externas al allow list por enlaces locales del worktree, sin modificar configuración.

Typecheck, lint, formato y build raíz, y git diff --check: códigos 0. La configuración test propia 0600 sigue ignorada; no se cargó .env.local ni se utilizó nextriva_dev. Integración/OpenAPI no se repitieron: no cambia persistencia/HTTP. Pendientes revisión fresca y validación visual humana/VoiceOver/Safari/Firefox; sin conformidad WCAG completa.

Codex asistió en pruebas y partición. Se preserva el resultado histórico del E2E fallido y sus repeticiones anteriores. La revisión fresca del Slice 2 no halló problemas accionables; se publicó en PR #97 con el commit `737be76`. El Slice 3 queda pendiente de integrar esta PR; no se avanza a I10.
