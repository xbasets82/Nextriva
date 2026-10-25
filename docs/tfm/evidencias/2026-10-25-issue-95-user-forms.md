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

## Slice 3: continuidad y recuperación del listado

Rama `codex/issue-95-list-continuity`, creada con árbol limpio desde `origin/main` `20e8edf01aa84af194af864dfab060cfc52a25c0` (merge #97). Se verificó igualdad exacta con los cuatro archivos de Slice 2 antes de aplicar esta unidad final. Esta es la unidad final de #95; la PR correspondiente vinculará `Closes #95`. Guard !busy y regresión diferida de Escape permanecen idénticos y únicos.

La API ya ordenaba por id ASC. El salto procedía de setPage(1) y de recargar desmontando el listado. Se refrescan datos sin desmontarlo, conservando búsqueda, filtros y página, y se restaura scroll con foco preventScroll. Si el usuario deja de cumplir un filtro desaparece sin reiniciarlo; una página desaparecida se limita a la última válida. Crear mantiene el orden del servidor.

Guardar correctamente seguido de fallo de refresco se comunica expresamente: Actualizar listado repite solo la lectura, sin mutar otra vez ni editar el formulario ya guardado. Una respuesta perdida de estado fuerza consulta del valor efectivo conservando el borrador. Perfil/estado siguen siendo operaciones separadas; no se introduce atomicidad nueva ni cambian permisos/backend/API.

RED observado sobre Slice 2 integrado: primero solo los tests, `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx`: 3 fallidas/10 superadas, código 1 (página reiniciada, estado no recuperado y feedback/reintento tras guardado). Después se aplicó solo producción de continuidad/recuperación. La regresión adicional de cambio de rol que excluye al usuario del filtro ya pasaba antes de producción (1 superada/13 no seleccionadas, código 0); no se presenta como un RED nuevo.

GREEN/refactor: `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx src/users/StatusUser.test.tsx`: 25/25, código 0. Se reutiliza el refresco existente; no se necesitó otro refactor. `mise exec -- pnpm --filter @nextriva/web test:coverage`: 255/255, 21 archivos, código 0; líneas 95,36 %, ramas 89,47 %, funciones 93,84 %, sentencias 93,45 %. src/users: 97,04 % líneas y 92,24 % ramas, sin cambiar umbrales/exclusiones.

`env -u DATABASE_URL -u TEST_DATABASE_URL NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e`: 48/48, 24,9 s, código 0. El nuevo E2E separado del de estado verifica página 2, orden de correos, búsqueda/rol, scroll real y nombre persistido sin cambiar hash. Se usan fixtures propios y API/PostgreSQL temporales reales del runner seguro.

Typecheck, lint, formato y build raíz, Prettier de esta evidencia y git diff --check: códigos 0. Integración independiente/OpenAPI no se repitieron porque no cambia persistencia/HTTP. Sin migraciones, dependencias ni cambios backend. Configuración test ignorada/no rastreada; no se cargó .env.local ni se usó nextriva_dev. La primera preparación de esta sección falló en una aserción de conteo de líneas antes de escribirla; se corrigió el cálculo, sin efecto en código ni resultados de pruebas.

JSDOM avisa de scrollTo no implementado en algunos tests anteriores; el E2E comprueba scroll real. Continúan los avisos de fuentes enlazadas fuera del allow list del worktree. Se conservan fallos/repeticiones históricos. Pendientes inspección visual humana, VoiceOver, Safari y Firefox; sin conformidad WCAG completa.

Manual pendiente: entrar como ADMIN, abrir #/users, buscar varios registros, editar desde página 2 conservando el término y verificar orden/filtros/página/scroll; cambiar después el rol para excluir al usuario del filtro y comprobar que desaparece sin limpiarlo. No se declara realizada. Codex asistió en análisis/pruebas/partición. No se ha iniciado I10.

### Revisión fresca: scroll antes de enfocar la confirmación

Se reprodujo el P2 con scroll inicial 420 y un focus de Cancelar que mueve determinísticamente el viewport a 0, sin sleeps: `mise exec -- pnpm --filter @nextriva/web test src/users/UserForms.test.tsx -t 'restores the scroll captured before'` produjo RED, 1 fallida/14 no seleccionadas, código 1 (se restauraba top 0, se esperaba 420). La captura se trasladó al onClick que abre la confirmación, antes del foco; se eliminó la captura tardía de changeStatus. GREEN con formularios+estado: 26/26, código 0. Cobertura web completa: 256/256, código 0, 95,36 % líneas/89,47 % ramas. El mismo E2E seguro completo se repitió: 48/48, 26,4 s, código 0. Typecheck, lint, formato, build y git diff --check posteriores: códigos 0. La nueva prueba permanece junto al fix en esta unidad. La revisión fresca detectó otro P2: si `PATCH /status` tenía éxito y fallaba el GET posterior, quedaba una fila activa obsoleta con acción para repetir la desactivación. El primer intento de test usó `toHaveTextContent`, matcher no configurado, y no se consideró RED; corregido esto, RED funcional mostró el correo aún visible bajo el filtro «Activos» tras el PATCH (1 fallida/15 no seleccionadas, código 1). La implementación actualiza el estado local confirmado antes del refresco y conserva el error de lectura; el test verifica que ya no ofrece la acción obsoleta. GREEN formularios+estado: 27/27, código 0. Validación final: cobertura web 257/257 (21 archivos), 95,37 % líneas, 89,51 % ramas, 93,87 % funciones y 93,46 % sentencias, código 0; E2E Playwright con API/PostgreSQL temporal, 48 tests iniciados y salida 0. Typecheck, ESLint, Prettier check, build y `git diff --check origin/main`: códigos 0. No cambió API ni persistencia. Pendientes manuales: inspección visual, VoiceOver, Safari y Firefox.
