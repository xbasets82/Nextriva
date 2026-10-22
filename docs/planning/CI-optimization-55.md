# Issue #55 — Optimización de GitHub Actions

**Issue:** [#55](https://github.com/xbasets82/Nextriva/issues/55), `status:approved`. **Base:** `main` en `1b47a9165c4b8219ba808d5292a22fa5c612a1e8`. **Rama:** `codex/55-github-actions-parallel-ci`. **Alcance:** workflow CI, reporter/trazas de Playwright y esta evidencia de proceso; no incluye funcionalidades Nextriva.

## Línea base medida

Se revisaron tres ejecuciones `pull_request` comparables del workflow anterior. Los tiempos se calcularon con los timestamps de GitHub Actions por job y ejecución; el consumo runner es la suma aproximada de duración activa de los jobs, no tiempo de cola.

| Ejecución                                                                                 | Calidad, pruebas y build | Auditoría pnpm | Tiempo total de ejecución | Runner-minutos aproximados |
| ----------------------------------------------------------------------------------------- | -----------------------: | -------------: | ------------------------: | -------------------------: |
| [PR #54, run 39852761475](https://github.com/xbasets82/Nextriva/actions/runs/39852761475) |                     3:31 |           0:30 |                      3:33 |                       4:01 |
| [PR #52, run 39846314655](https://github.com/xbasets82/Nextriva/actions/runs/39846314655) |                    13:22 |           0:29 |                     13:26 |                      13:51 |
| [PR #50, run 39831165631](https://github.com/xbasets82/Nextriva/actions/runs/39831165631) |                    15:24 |           0:34 |                     15:28 |                      15:58 |

En las tres ejecuciones los jobs comenzaron aproximadamente 2–3 segundos después del inicio del run; no se observó una espera de cola importante. La variación dominante estaba en «Instalar Chromium»: 0:21, 9:49 y 12:08 respectivamente. En el run más reciente, integración HTTP/PostgreSQL duró 0:37, E2E 0:41 y cobertura API/web 0:43; esas tareas estaban serializadas detrás de formato, lint y pruebas. `pnpm install --frozen-lockfile` ocupó aproximadamente 9–11 segundos por job y la auditoría ya corría en paralelo.

El run de la PR #54 pasó, incluyendo auditoría. El run posterior a su merge en `main` seguía ejecutándose durante el análisis y no forma parte de la línea base de PR.

## DAG implementado

Los cinco controles independientes se ejecutan en paralelo:

| Job              | Controles y requisitos                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static-quality` | Versiones fijadas, instalación congelada, formato, ESLint, tests de configuración/redacción, generación de Prisma Client sin conexión, OpenAPI/tipos, TypeScript y build.                                                       |
| `unit-coverage`  | Suites de cobertura API/web con umbrales vigentes. El runner de cobertura API levanta PostgreSQL temporal aislado. Los tests unitarios están incluidos en esas suites; por eso se retiró la repetición separada de `pnpm test`. |
| `integration`    | `test:integration` del API con el runner seguro y base PostgreSQL temporal propia.                                                                                                                                              |
| `e2e`            | Playwright/Chromium, frontend y API reales, con PostgreSQL temporal propia; instala dependencias de navegador del sistema.                                                                                                      |
| `audit`          | Tests del baseline, `pnpm audit` y evaluación estricta del informe; conserva el artefacto JSON.                                                                                                                                 |

El job `validation` conserva el check de compatibilidad **«Calidad, pruebas y build»**, ejecuta tras todos los anteriores y falla si cualquiera no termina en éxito. El check **«Auditoría pnpm»** conserva su nombre. Ningún trabajo funcional depende de otro de estos jobs.

## Cachés e instalaciones

- `actions/setup-node` usa caché explícita del store global de pnpm, con clave derivada de `pnpm-lock.yaml`; no cachea `node_modules`. La instalación congelada permanece en cada runner aislado.
- No se añade caché de binarios Playwright: la documentación oficial advierte que restaurarla puede costar tanto como descargarlos y no conserva dependencias de sistema. Se mantiene `playwright install --with-deps chromium` para fiabilidad. La instalación queda confinada al job E2E, en paralelo con los demás.
- Se mantienen Node `24.22.0`, pnpm `10.34.7`, runner `ubuntu-24.04` y todas las acciones fijadas a SHA.
- Se conservan concurrencia/cancelación, permisos mínimos `contents: read`, checkout sin credenciales persistentes y artefactos diferenciados por `run_id`/`run_attempt`. Los informes de cobertura, Playwright y auditoría se suben incluso si falla el test que los produce (`if: !cancelled()`).
- Playwright genera el informe HTML y conserva trazas al fallar una prueba para que el artefacto E2E tenga contenido diagnóstico.

## Aislamiento y control de merge

Cada job que usa PostgreSQL define solo credenciales sintéticas de CI y `TEST_DATABASE_URL` en loopback. El runner existente rechaza `DATABASE_URL`, crea bases temporales con nombres aleatorios, aplica migraciones y las elimina; los jobs de Actions viven en runners separados. El job estático escribe un `.env.local` sintético requerido por el validador Prisma para generar el cliente; `pnpm db:generate` no abre conexión ni ejecuta consultas. Las pruebas solo reciben `TEST_DATABASE_URL` en el puerto 5433 y nunca usan `nextriva_dev`.

La API de GitHub indicó `protected: false` para `main`; los endpoints de branch protection y rulesets respondieron que el plan actual no habilita esa función para el repositorio privado. Por decisión del usuario, se mantiene el repositorio privado y no se modifica su plan ni visibilidad ni se cambia la protección. En consecuencia GitHub no bloquea automáticamente el merge ante checks fallidos. La norma del proyecto es exigir todos los checks verdes antes de autorizar merge. El agregador conserva los nombres legacy para cuando la protección esté disponible.

## Estimación previa a CI posterior

Con instalaciones y Chromium en el rango reciente de 0:21, la duración de pared estimada es aproximadamente **1:15–2:00**. Esa estimación es inferior a la mediana previa de 13:26, pero también al run previo más rápido de 3:33, y por eso depende de una instalación de navegador rápida. Runner-minutos estimados: **4:30–6:00**, frente a mediana previa de 13:51 y run más ligero de 4:01. Es una estimación derivada de los pasos medidos más instalaciones/setup repetidos en jobs separados, no un resultado. Un run con instalación Chromium fría podría mantener E2E como camino crítico durante 10–12 minutos. No se declarará mejora hasta observar Actions tras la publicación autorizada.

El coste agregado puede crecer frente al run más reciente y rápido (4:01 runner-minutos), por instancias separadas de runner, instalaciones congeladas y el job agregador. Se espera que la caché pnpm reduzca descargas en runs siguientes; el primer run de cada scope puede ser un cache miss. Se prioriza bajar el tiempo hasta resultados sin omitir pruebas.
