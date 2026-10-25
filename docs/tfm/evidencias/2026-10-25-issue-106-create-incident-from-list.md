# Issue #106 — Crear incidencias desde el listado general

## Alcance y estado

Issue [#106](https://github.com/xbasets82/Nextriva/issues/106), aprobada; rama `codex/issue-106-create-incident-from-list`, desde `main` `0790fa378afa5bf120fd24d7abd54cce58c6d2dc`, que contiene la PR #107. HU06/HU07. Implementación local pendiente de validación humana; no se autoriza ni realiza commit, push, PR o merge.

El listado general incorpora la acción accesible «Crear incidencia». El paso previo ofrece únicamente promociones activas procedentes de la respuesta autorizada de `GET /api/promotions`. Al confirmar, se navega a la ruta existente `#/incidents/new/:promotionId` y se reutiliza el formulario y `POST /api/incidents` existentes. ADMIN conserva acceso global; MANAGER/COLLABORATOR conservan sus vinculaciones. La API vuelve a comprobar permisos y estado al escribir.

No hay cambios de API, OpenAPI, cliente generado, esquema, migraciones, dependencias o reglas de negocio. Las referencias históricas permanecen íntegras. Cancelar desde el selector o desde el formulario iniciado aquí devuelve al listado y conserva sus filtros/página en el estado de React. La búsqueda pendiente del debounce se conserva al abrir el selector. No se utiliza almacenamiento del navegador.

## Ciclos TDD observados

1. **RED del flujo:** se añadieron cinco casos web: selección y formulario existente para ADMIN/MANAGER/COLLABORATOR, ausencia de promociones activas con cancelación conservando filtros/página y carga/error/reintento. `mise exec -- pnpm --filter @nextriva/web test -- src/incidents/IncidentsScreen.test.tsx -t 'Issue 106'` terminó con código 1: 5 fallidas, 303 superadas. En este script, el separador `--` hizo que también se ejecutase la suite completa; los cinco fallos fueron la ausencia de la acción «Crear incidencia».
2. **GREEN:** tras incorporar el selector y la navegación, `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentsScreen.test.tsx` pasó 15/15, código 0; la suite web completa pasó 308/308, código 0.
3. **REFACTOR:** se separó la presentación del selector y los enlaces de regreso para mantener el formulario existente y cumplir SonarJS. El primer typecheck encontró cuatro usos de `exact` no admitidos por Testing Library (código 2); se corrigieron en las pruebas nuevas. El primer lint detectó complejidad 17 frente al límite 15 en `IncidentScreen`; se extrajeron los enlaces de presentación, sin desactivar reglas. Los controles posteriores pasaron.
4. **RED en Chromium:** la primera suite E2E terminó con código 1: 52/57 superadas. Los cuatro casos nuevos agotaron el tiempo al localizar exactamente la etiqueta «Promoción». El trace mostró que el `label` envolvía el `select` y todos sus textos `option`; se sustituyó por asociación explícita `htmlFor`/`id`, como en los filtros existentes. No se relajó el locator.
5. **RED de búsqueda pendiente:** una prueba con temporizador controlado abrió creación antes de los 300 ms y verificó que el criterio quedaba guardado; falló por la ausencia del criterio en la consulta (1 fallida/15 omitidas por filtro, código 1). Se conserva ahora el criterio al abrir creación; los 16 casos del archivo pasaron, código 0.

La primera E2E también falló en el caso previo `expired session returns to login and can authenticate again`: tras reautenticar esperaba Promociones, pero el trace terminaba en `#/incidents`. No se modificó autenticación ni esa prueba. Durante esa ejecución se había refactorizado el componente compartido, por lo que la posible interferencia de HMR no permite atribuir una causa definitiva. La repetición final con los fuentes estables pasó 57/57, incluido ese caso, sin modificar la prueba ni la autenticación; la causa precisa del fallo inicial no queda demostrada.

## Verificaciones observadas

| Comando desde la raíz                                                                                                         | Resultado                                                                                                                                       | Código |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                      | 309/309; 22 archivos. Líneas 95,70%; ramas 90,88%; funciones 96,62%; sentencias 94,60%. Selector nuevo: 100% líneas y 93,75% ramas.             | 0      |
| `mise exec -- pnpm typecheck`                                                                                                 | API y web correctos, tras corregir los tipos de las pruebas nuevas.                                                                             | 0      |
| `mise exec -- pnpm lint`                                                                                                      | Sin infracciones tras extraer enlaces.                                                                                                          | 0      |
| `mise exec -- pnpm format:check`                                                                                              | Formato correcto.                                                                                                                               | 0      |
| `mise exec -- pnpm api:types:check`                                                                                           | Contrato y tipos reproducibles, sin diff.                                                                                                       | 0      |
| `mise exec -- pnpm build`                                                                                                     | API y web compiladas.                                                                                                                           | 0      |
| `env -u DATABASE_URL NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | Repetición final: 57/57 en Chromium con API y PostgreSQL reales, 23,7 s; los cuatro casos nuevos y el caso previo de sesión caducada superados. | 0      |
| `git diff --check`                                                                                                            | Sin errores de whitespace.                                                                                                                      | 0      |

El resultado final es favorable para validación humana. El archivo focalizado tiene 16 pruebas y la suite completa 309; no se han reducido umbrales, aserciones ni controles. El caso inicial E2E fallido y su causa no confirmada se conservan expresamente como limitación observada.

## Seguridad, persistencia y límites

El runner E2E recibe `env -u DATABASE_URL` y obtiene la configuración validada de pruebas; crea su base exclusiva en `127.0.0.1:5433`, aplica las 12 migraciones existentes y elimina la base al finalizar. No se carga `.env.local` ni se consulta/modifica `nextriva_dev`.

Las pruebas nuevas usan cuentas sintéticas y contraseña aleatoria generada en memoria. Los E2E comprueban creación para los tres roles, HTTP 201, incidencia `OPEN`, autor correcto, fase global válida no activa (`AFTER_SALES`) y actividad `CREATED`. La retirada del participante después de abrir el formulario debe devolver HTTP 404 sin incidencias ni actividades; al regresar se presenta la ausencia de promociones elegibles. Los fixtures se limitan a sus propias promociones y usuarios.

La integración Vitest separada y la cobertura API no se repiten: no cambia código servidor ni persistencia; los E2E sí ejercitan API y PostgreSQL reales. La auditoría de dependencias no se repite: no cambia ningún manifiesto ni lockfile. La generación de una migración no aplica porque el esquema permanece idéntico.

Pendientes: validación humana de producto y comprobaciones manuales con VoiceOver, Safari y Firefox. Chromium comprueba teclado, nombres accesibles y viewport móvil, sin afirmar conformidad WCAG completa. El contexto de filtros y procedencia se conserva en memoria durante la navegación; una recarga completa reinicia ese contexto, como el listado existente.

## Validación manual propuesta

1. Con la aplicación local iniciada, autenticar un usuario con una promoción activa accesible y abrir Incidencias.
2. Cambiar búsqueda/filtros y página; pulsar el icono «Crear incidencia».
3. Comprobar que el selector solo ofrece promociones activas accesibles. Cancelar y comprobar que se conservan los criterios/página.
4. Reabrir, elegir promoción y continuar. Cancelar desde el formulario y comprobar el regreso al listado.
5. Reabrir, completar el formulario existente y crear. Comprobar el detalle y «Volver a incidencias».
6. Repetir con ADMIN, MANAGER y COLLABORATOR; sin promociones activas debe mostrarse la explicación y Continuar deshabilitado.

## Ajuste visual solicitado

Se igualó el botón «Crear incidencia» al énfasis primario de los botones de creación de Usuarios y Promociones. Las demás acciones del listado conservan su estilo neutro.

- **RED:** `mise exec -- pnpm --filter @nextriva/web test` → falló con código 1: 1 prueba nueva fallida porque el botón no tenía `bg-primary`; 309 pruebas pasaron.
- **GREEN:** mismo comando → 310/310 pruebas pasaron, código 0.
- **Refactor/verificaciones:** `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`, `mise exec -- pnpm format:check`, `mise exec -- pnpm build` y `git diff --check` → todos código 0.
- E2E no se repitió tras este ajuste únicamente visual; la suite funcional completa previa pasó 57/57 en Chromium con API y PostgreSQL temporales.

## Uso de IA

Codex se utilizó para revisar las fuentes aprobadas, escribir pruebas, implementar el flujo de interfaz y ejecutar las verificaciones registradas. No se reconstruyen RED históricos ni se declara validación manual realizada. La validación humana continúa pendiente.
