# Formularios de usuarios — Slice 1: estado desde edición

Fecha: 25/10/2026. Issue #95 aprobado. Rama `codex/issue-95-status-edit`, desde `origin/main` en `b380c493`. Unidad 1 de 3; referencias a #95, sin cerrar el Issue.

## Alcance

HU02: activar/desactivar desde el formulario existente mediante la operación de estado y CSRF actuales, separada de Guardar. Confirmación explícita, foco seguro y Escape, bloqueo durante petición, errores sin detalles internos y conservación del borrador. Se mantienen permisos, último ADMIN y restricciones de responsables del backend. Sin edición de contraseñas, cambios de API, migraciones ni dependencias.

El E2E propio que comprueba desactivación/reactivación con PostgreSQL real, borrador no persistido y hash conservado se publica con la unidad 2, que depende de esta; se redistribuye sin eliminar aserciones. Los ajustes visuales y la continuidad del listado pertenecen a las unidades 2/3. La reversión de esta unidad afecta solo esta UI y sus pruebas.

## Evidencia observada

Los RED/GREEN proceden de la implementación original de #95: controles de estado ausentes en el RED inicial y GREEN posterior; el caso de Escape falló por foco no restaurado y pasó tras corregirlo. Esta partición reorganiza código ya verificado; no se reconstruye un RED histórico nuevo.

En este worktree: `mise exec -- pnpm --filter @nextriva/web test`: 245/245, código 0; `mise exec -- pnpm lint` y `mise exec -- pnpm format:check`: código 0; `mise exec -- pnpm typecheck`: código 0 tras la generación Prisma segura del runner (antes falló por cliente generado ausente).

El runner E2E seguro, con DATABASE_URL/TEST_DATABASE_URL heredadas eliminadas y puertos 14317/15173, validó la configuración test y ejecutó Chromium/API/PostgreSQL temporales: 46/47, código 1; los 4 casos de users.spec.ts pasaron. Falló el caso existente `incident-list-ui.spec.ts:228` al esperar el enlace Propia tras Buscar; causa sin confirmar. Una repetición completa sin cambios pasó 47/47, código 0; ambos resultados se conservan, sin atribuir una causa no demostrada ni relajar aserciones. El primer intento en el worktree había sido rechazado antes de BD por configuración test enlazada; se preparó archivo propio regular 0600 autorizado, sin debilitar el lector. Vite advierte sobre fuentes enlazadas fuera de su allow list; no se atribuye el fallo a ese aviso sin prueba.
Pendientes: seguimiento del fallo intermitente ajeno, revisión fresca, validación visual humana, VoiceOver, Safari y Firefox. No se utilizó nextriva_dev, no se cargó .env.local, no se mostraron secretos y no hay commit/publicación. Codex asistió en el análisis, pruebas y partición; no se declara conformidad WCAG completa.

## Revisión fresca: Escape durante guardado

La revisión detectó que Escape cerraba la confirmación durante la mutación pendiente. Se añadió primero una prueba con promesa diferida: `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx -t 'keeps the edit status confirmation open'` produjo 1 fallida/4 no seleccionadas, código 1, porque el diálogo desaparecía. La corrección condiciona Escape a `!busy`; la promesa se libera en finally. `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx src/users/StatusUser.test.tsx`: 16/16, código 0. Typecheck, lint y formato raíz pasaron con código 0; la repetición E2E completa posterior, con el runner seguro y sin cambios de código/runner, pasó 46/46 en 17,5 s, código 0 (el E2E específico de estado se conserva para la unidad 2). Se conserva la regresión junto al fix y el E2E de estado se desplaza intacto a la unidad 2 para respetar 400 líneas por PR; no se reconstruye otro RED.
