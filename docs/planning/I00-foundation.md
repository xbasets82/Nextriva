# I00 — Base ejecutable

**Estado del incremento:** en curso. I00.1–I00.4 están integradas en `main`; I00.5 está validada localmente y pendiente de integración en `main`; I00.6 sigue planificada.
**Fuente de planificación:** [guía original íntegra](../references/NEXTRIVA_GUIA_PROMPTS_DESARROLLO_TDD_v1.0.md), sección I00.
**Contexto técnico:** [diseño técnico §13](../references/DISENO_TECNICO_NEXTRIVA_MVP_v1.0.md#13-estrategia-i00i10-y-aceptación). I00 prepara una base ejecutable; no incorpora entidades ni funciones de negocio.

## Objetivo

Establecer una base local reproducible para desarrollar Nextriva: monorepo y herramientas fijadas, API de salud con OpenAPI, PostgreSQL real aislado y preparación de calidad, observabilidad y CI. La planificación describe seis microfases en el orden siguiente. Los estados distinguen el plan de la implementación y se basan en issues, PR y evidencias verificables.

## Índice de microfases

| Microfase | Nombre original | Objetivo resumido | Issue | PR | Estado |
|---|---|---|---|---|---|
| I00.1 | Monorepo mínimo reproducible | Workspaces, esqueleto API/web, herramientas fijadas y pruebas smoke. | [#1](https://github.com/xbasets82/Nextriva/issues/1) | [#2](https://github.com/xbasets82/Nextriva/pull/2) | Integrada en `main`; issue cerrado |
| I00.2 | Health con TDD y OpenAPI inicial | Endpoint técnico de salud y contrato verificable. | [#4](https://github.com/xbasets82/Nextriva/issues/4) | [#5](https://github.com/xbasets82/Nextriva/pull/5) | Integrada en `main`; issue cerrado |
| I00.3 | PostgreSQL real y Prisma aislado | Entornos locales dev/test separados y Prisma sin tablas de negocio. | [#8](https://github.com/xbasets82/Nextriva/issues/8) | [#9](https://github.com/xbasets82/Nextriva/pull/9) | Integrada en `main`; issue cerrado |
| I00.4 | Primera pantalla y E2E | Pantalla inicial con health real y E2E en navegador real. | [#11](https://github.com/xbasets82/Nextriva/issues/11) | [#12](https://github.com/xbasets82/Nextriva/pull/12) | Integrada en `main`; issue cerrado |
| I00.5 | Calidad, hooks y Pino | Configurar controles de calidad, hooks y logging técnico redactado. | [#15](https://github.com/xbasets82/Nextriva/issues/15) | Pendiente | Validada localmente; pendiente de integración en `main` |
| I00.6 | CI y cadena de suministro | Proponer CI, auditoría de dependencias y Dependabot. | Pendiente | Pendiente | Planificada; issue y PR no creados |

GitHub consultado el 2026-10-19: issues #1, #4, #8 y #11 están cerrados; PR #2, #5, #9 y #12 están integrados en `main`. El Issue #15 de I00.5 está abierto y aprobado; todavía no existe PR. I00.6 no tiene issue ni PR asociados. El estado “integrada” no significa que cada control no aplicable de la Definition of Done global esté implementado.

## Fichas

Los criterios de I00.1–I00.5 proceden de sus issues aprobados; el estado de implementación se indica en cada ficha. Para I00.6, los apartados “alcance y entregables previstos” resumen el prompt original; **no son criterios de aceptación aprobados**.

### I00.1 — Monorepo mínimo reproducible

- **Objetivo y alcance previsto:** preparar pnpm workspaces, `apps/api` con NestJS y TypeScript estricto, `apps/web` con React/Vite y TypeScript, Vitest en ambas apps y versiones Node/pnpm fijadas con mise; sin negocio.
- **Entregables:** manifiestos y lockfile, estructura mínima de API/web, configuraciones TypeScript/Vitest y pruebas smoke.
- **Criterios del issue #1:** instalación reproducible; smoke Nest con Express y render web del encabezado Nextriva; `pnpm test`, `pnpm typecheck` y `pnpm build` pasan; tecnologías aprobadas registradas en la matriz.
- **Dependencias:** el issue documenta “sin prerrequisito I00”.
- **Estado y trazabilidad:** issue #1 cerrado; PR #2 integrado en `main` (merge `efd2fc6`, implementación `26dda82`); rama `chore/i00-1-monorepo-baseline`. No existe un informe TFM dedicado de I00.1; PR y issue registran los resultados.
- **Diferencia relevante:** `mise.toml` y `mise.lock` se trasladaron a la raíz y no quedaron copias duplicadas en `app/`, según el issue.

### I00.2 — Health con TDD y OpenAPI inicial

- **Objetivo y alcance previsto:** implementar solo `GET /api/health`, HTTP 200 y JSON exacto `{"status":"ok"}`, con servicio, controlador delgado y OpenAPI; sin persistencia ni negocio.
- **Entregables:** endpoint, contrato OpenAPI y pruebas unitarias/HTTP/E2E según la ejecución registrada.
- **Criterios del issue #4:** respuesta exacta; delegación a servicio; contrato OpenAPI coincidente con HTTP; pruebas unitarias e integración; ruta inexistente 404; no revelar información interna ni añadir entidades.
- **Dependencias:** la planificación prescribe orden I00.1 → I00.2.
- **Estado y trazabilidad:** issue #4 cerrado; PR #5 integrado en `main` (merge `761b275`, implementación `f39fde8`); rama `chore/i00-2-baseline-follow-up`. No hay evidencia TFM individual; el PR registra unitarias, una E2E aprobada, repetición E2E bloqueada por puerto ocupado, typecheck y build. La comprobación manual de OpenAPI/404 está registrada en el issue.
- **Diferencia relevante:** la repetición de Playwright no se ejecutó por el puerto 4317 ocupado; el PR distingue el bloqueo de la prueba aprobada inicial. Cobertura quedó pendiente.

### I00.3 — PostgreSQL real y Prisma aislado

- **Objetivo y alcance previsto:** Compose con PostgreSQL fijado, bases/servicios dev y test separados, secretos locales, validación de `DATABASE_URL`, guardas contra dev/cloud y Prisma sin tablas de negocio.
- **Entregables:** configuración Compose/Prisma, aislamiento, flujo de inicio/espera/parada para pruebas y documentación reproducible.
- **Criterios del issue #8:** PostgreSQL y recursos dev/test separados; secretos ignorados y URLs protegidas; integración Vitest con PostgreSQL real (`SELECT 1`, base `nextriva_test`, sin tablas de negocio); flujo de pruebas sin eliminar volúmenes; Prisma sin modelos de negocio; instalación/typecheck/build correctos. El issue mantiene sus casillas sin marcar; no se presenta ese checklist como evidencia de aceptación.
- **Dependencias:** preflight de Docker, puertos, volúmenes y montaje PostgreSQL 18 según issue #8; secuencia I00 en diseño técnico §13.
- **Estado y trazabilidad:** issue #8 cerrado; PR #9 integrado en `main` (merge `dd8cf9c`, commits `08a8a68` y `5199518`); rama `feat/i00-3-postgres-prisma`. Sin evidencia TFM individual; PR registra unitarias e integración PostgreSQL real, typecheck/build/configuración y prueba manual de persistencia con dato sintético eliminado.
- **Diferencia relevante:** el PR declara que no hay traza RED conservada; no se atribuye una. El issue fue cerrado aunque sus criterios siguen visualmente sin marcar.

### I00.4 — Primera pantalla y E2E

- **Objetivo y alcance previsto:** configurar Tailwind/shadcn compatibles, mostrar una pantalla inicial Nextriva con carga/éxito/error accesibles desde health, proxy `/api` durante desarrollo y mismo origen en producción; sin pantallas de negocio.
- **Entregables:** pantalla y componentes locales, proxy, pruebas Vitest y Playwright con API real, evidencia saneada.
- **Criterios del issue #11:** encabezado Nextriva y health real; estados accesibles/error genérico; mocks solo en unidad; proxy/ruta relativa sin localhost incrustado; versiones fijadas; Playwright con Chromium y API reales; reportes ignorados y evidencia saneada; sin cambio del contrato health; pruebas, tipos y build aplicables.
- **Dependencias:** health existente de I00.2. El issue documentó compatibilidad de herramientas/navegadores y conservación de trazas saneadas.
- **Estado y trazabilidad:** issue #11 cerrado; PR #12 integrado en `main` (merge `9c83911`, commits `c9e3536` y `afef9b3`); rama `feat/i00-4-initial-screen-e2e`. Evidencia: [informe I00.4](../tfm/evidencias/2026-10-19-i00-4.md). La evidencia registra 2 E2E, unitarias, typecheck y build aprobados; cobertura N/D, lint/formato no configurados, CI inexistente, revisión visual manual no ejecutada y `pnpm audit` con tres avisos preexistentes bajo Prisma.
- **Diferencias y decisiones posteriores aprobadas:** shadcn CLI `4.22.1` se utilizó como generador y no se conserva como dependencia permanente por la vulnerabilidad documentada; permanecen componentes locales. La pantalla no incorpora negocio. La evidencia de pruebas mantiene sus resultados históricos y ahora refleja el PR integrado.

### I00.5 — Calidad, hooks y Pino

- **Objetivo original:** incorporar controles locales de calidad y logging técnico con identificador de petición y redacción.
- **Alcance previsto en la guía:** ESLint, Prettier, SonarJS y Husky con comprobación rápida de archivos modificados; Pino con `requestId` y redacción de cookies, Authorization, contraseñas y tokens, sin registrar cuerpos sensibles; scripts comprobables y exclusiones justificadas.
- **Entregables previstos:** configuración y scripts de calidad, hooks locales y logging Pino con evidencia de redacción/identificador.
- **Criterios de aceptación aprobados en el issue #15:** ESLint con reglas TypeScript/SonarJS y fixture de defecto; Prettier con comandos reproducibles de escritura y check-only; Husky/lint-staged para archivos staged sin sustituir controles directos; Pino con `requestId` seguro y metadatos permitidos; pruebas Vitest de IDs ausente/válido/inválido y redacción; integración HTTP real contra Nest; no registrar cuerpos, comentarios ni soluciones; dependencias mínimas, justificadas, licenciadas y fijadas; scripts, Vitest aplicable, typecheck y build funcionales; evidencia TDD y log sintético saneado; sin cambios de negocio, HTTP/OpenAPI, persistencia ni CI de I00.6.
- **Dependencias:** la guía sitúa I00.5 después de I00.4; no hay otra dependencia documentada.
- **Estado y trazabilidad:** issue [#15](https://github.com/xbasets82/Nextriva/issues/15), abierto con `status:approved`; rama `chore/i00-5-quality-logging`. Implementación validada localmente con Vitest unitario e integración HTTP, Playwright, lint, formato, typecheck y build. Evidencia: [informe I00.5](../tfm/evidencias/2026-10-19-i00-5.md). Sin commit ni PR; pendiente de integración en `main`. La evidencia deja constancia de que el test unitario del fallback UUID se añadió después de implementar esa resolución y no tuvo un RED independiente; no se reconstruye esa ejecución.

### I00.6 — CI y cadena de suministro

- **Objetivo original:** preparar validación automatizada y controles básicos de cadena de suministro para el repositorio.
- **Alcance previsto en la guía:** GitHub Actions con lockfile congelado, tipos, lint check-only, unitarias, PostgreSQL real, E2E y build; versiones locales, permisos mínimos, timeout y acciones fijadas a revisiones verificadas; Dependabot para pnpm y Actions; auditoría de dependencias. La ejecución CI remota requiere permiso.
- **Entregables previstos:** workflow(s), configuración Dependabot y evidencia local/remota autorizada.
- **Criterios de aceptación aprobados:** no definidos. El prompt original establece pruebas y una demostración local, pero no consta Issue aprobado.
- **Dependencias:** la guía sitúa I00.6 después de I00.5; no hay otra dependencia documentada.
- **Estado y trazabilidad:** planificada; sin Issue, rama, commit, PR o evidencia propia. La existencia de checks CI no está verificada como entregable implementado; el PR #12 indicó que no había workflows.

## Decisiones y desviaciones verificadas

| Tema | Planificación original | Decisión posterior aprobada | Implementación observada |
|---|---|---|---|
| Umbrales globales | La guía original define 85% líneas y 80% ramas. | Se ratificó 80% líneas y 75% ramas en P02; la matriz de decisiones lo registra. | I00.4 no tiene cobertura medida/configurada; no se afirma cumplimiento. |
| shadcn | I00.4 prevé configurar shadcn compatible y fijado. | Se autorizó usar shadcn como generador, sin CLI vulnerable permanente. | CLI `4.22.1` usado para generar configuración/componentes locales y retirado de dependencias; evidencia I00.4. |
| CI y calidad | I00.5/I00.6 están planificadas, en ese orden. | El issue #15 de I00.5 fue aprobado; I00.6 continúa sin criterios aprobados. | I00.5 está validada localmente y pendiente de integración; PR #12 registró que al cierre de I00.4 aún no había lint/formato ni workflows CI. |
| Trazabilidad I00.4 | La evidencia inicialmente indicaba commit/PR/merge pendientes al momento de redactarse. | Sin cambio de criterio funcional. | PR #12 y issue #11 están integrados/cerrados; se actualizó solo la referencia de estado de la evidencia, preservando resultados históricos. |

## Fuentes y mantenimiento

- [Guía original de prompts](../references/NEXTRIVA_GUIA_PROMPTS_DESARROLLO_TDD_v1.0.md): nombres, orden y alcance planificado de I00.1–I00.6.
- [Diseño funcional v1.0](../references/Nextriva_Diseno_Funcional_MVP_v1.0_ES.md) y [diseño técnico v1.0](../references/DISENO_TECNICO_NEXTRIVA_MVP_v1.0.md): contexto funcional y arquitectura.
- [Matriz de decisiones](../architecture/decision-matrix.md): decisiones aprobadas y pendientes, incluidas tecnologías y cobertura.
- Issues y PR enlazados arriba: alcance autorizado e implementación integrada. [Evidencia I00.4](../tfm/evidencias/2026-10-19-i00-4.md).

Actualizar estados solo después de consultar GitHub y la evidencia del incremento. No convertir el prompt original en criterios aprobados para I00.5/I00.6, ni marcar I00 completo hasta verificar todas sus microfases.
