# Evidencia TFM — Issue #55 Optimización de GitHub Actions — 2026-10-22

## Identificación y autorización

- Issue [#55](https://github.com/xbasets82/Nextriva/issues/55), `status:approved` comprobado. Rama `codex/55-github-actions-parallel-ci`, basada en `main` `1b47a9165c4b8219ba808d5292a22fa5c612a1e8`.
- Alcance exclusivo: paralelización de CI, configuración de artefactos Playwright y documentación del proceso; no se modifica producto ni configuración de base de datos compartida.
- Usuario mantiene privado el repositorio y el plan actual; no autoriza modificar protección, hacer push, abrir PR ni merge. Autoriza commit local si pasan comprobaciones.

## Rendimiento anterior medido

Tres runs de PR con el mismo workflow: #54 (`39852761475`), #52 (`39846314655`) y #50 (`39831165631`). Sus duraciones, pasos principales, coste runner aproximado y enlaces están en [la planificación de Issue #55](../../planning/CI-optimization-55.md#línea-base-medida).

Calidad, pruebas y build: **3:31 / 13:22 / 15:24**. Total de pared: **3:33 / 13:26 / 15:28**. Coste aproximado sumando jobs activos: **4:01 / 13:51 / 15:58 runner-minutos**. Los jobs comenzaron a los 2–3 segundos del inicio del run. La instalación Chromium midió **0:21 / 9:49 / 12:08**; integración HTTP/PostgreSQL, E2E y cobertura se ejecutaban secuencialmente en el job principal. Instalación pnpm: 9–11 s por job.

## Decisiones aplicadas

- Paralelizar `static-quality`, `unit-coverage`, `integration`, `e2e` y `audit` sin dependencias mutuas; el runner de cobertura API también usa PostgreSQL temporal real.
- Preservar suites completas y umbrales. El test unitario repetido se elimina como paso separado porque los comandos de cobertura ejecutan los mismos tests unitarios; integraciones se mantienen en su propio job.
- Conservar el nombre de check legacy `Calidad, pruebas y build` en un agregador que exige resultado exitoso de los cinco jobs; conservar `Auditoría pnpm` como check separado.
- Habilitar caché explícita del store de pnpm por hash de lockfile; no cachear `node_modules`.
- No cachear Chromium: la recomendación oficial de Playwright señala que restaurar binarios puede costar parecido a descargarlos y no incluye dependencias del sistema. Se conserva `--with-deps` para no depender de bibliotecas implícitas del runner.
- Artefactos independientes con identificadores por run/intento y `if: !cancelled()` para conservar informes tras fallos. Acciones, Node, pnpm, runner, mínimos permisos y `persist-credentials: false` se conservan.
- Playwright se configura para generar HTML y retener trazas de pruebas fallidas. Prisma necesita un `.env.local` sintético que pase el validador local para generación del cliente; `db:generate` no conecta ni consulta la base indicada. Todas las pruebas PostgreSQL usan exclusivamente el runner temporal aislado en 5433.

## Protección de main y riesgos conocidos

GitHub reportó `protected: false` para `main`; consultar checks y rulesets dio HTTP 403: el plan actual no habilita protección de rama en este repositorio privado. No se cambió el plan, la visibilidad ni las reglas. GitHub actualmente no impide automáticamente un merge con checks fallidos; el equipo conserva la norma manual de exigir todos los checks verdes. El agregador preserva el nombre requerido legacy, pero no sustituye branch protection.

## Validación y resultados locales observados

| Comprobación                                                                                                       | Resultado real                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML del workflow (`ruby -r yaml -e 'YAML.load_file(...)'`) y estructura de jobs/agregador                         | Superada, código 0. No está disponible `actionlint`; no se instaló una herramienta.                                                                                                   |
| Formato (`pnpm format:check`) y Prettier del workflow/config/docs                                                  | Superados, código 0.                                                                                                                                                                  |
| ESLint (`pnpm lint`), TypeScript (`pnpm typecheck`), OpenAPI/tipos (`pnpm api:types:check`) y build (`pnpm build`) | Superados, cada comando código 0.                                                                                                                                                     |
| Tests de configuración, salida/redacción y generación de tipos (72 tests)                                          | 72/72, código 0.                                                                                                                                                                      |
| Prisma Client con URL sintética aceptada por el validador                                                          | `pnpm --filter @nextriva/api db:generate` superado, código 0; generado en 34 ms sin conexión PostgreSQL.                                                                              |
| Runner de configuración PostgreSQL                                                                                 | `node scripts/test-integration.mjs --check-config` informa que `TEST_DATABASE_URL` está disponible y validada (fuente: archivo), código 0; valor no mostrado.                         |
| Unitarias y cobertura API/web                                                                                      | `pnpm -r --if-present test:coverage` superado, código 0; umbrales existentes sin cambios.                                                                                             |
| Integración PostgreSQL temporal                                                                                    | 10 archivos, 124/124 tests; migraciones versionadas aplicadas a base temporal aleatoria en `127.0.0.1:5433`, código 0.                                                                |
| E2E                                                                                                                | 30/30 Playwright en Chromium contra API y PostgreSQL temporal, código 0. Informe HTML presente; Playwright configura trazas retenidas en fallo.                                       |
| Auditoría baseline                                                                                                 | 35/35 tests, código 0. `pnpm audit --json` devuelve 1 por los tres avisos Prisma conocidos; evaluador del baseline sale 0 y acepta únicamente las excepciones vigentes del Issue #18. |
| `git diff --check`                                                                                                 | Superado, código 0.                                                                                                                                                                   |

La revisión independiente detectó que `db:generate` valida la ruta local de base y que Playwright no producía informe ni trazas. Se corrigió configurando la URL sintética esperada únicamente para generación (sin conexión) y añadiendo el reporter HTML y retención de trazas en fallos; luego se observaron los resultados de Prisma, E2E, formato y YAML indicados arriba. Las pruebas usan exclusivamente el runner PostgreSQL aislado; no se cargó `.env.local` del desarrollador ni se accedió a `nextriva_dev`.

No se reconstruye evidencia RED/GREEN: el cambio es configuración CI y documentación, no una regla de producto. Los jobs nuevos de Actions, cache hit/miss y la comparación post-cambio quedan **no verificados** hasta una publicación autorizada. La estimación previa de **1:15–2:00** de pared y **4:30–6:00 runner-minutos** no es medición y supone instalación de Chromium cercana al run más rápido; un cache miss de navegador puede dejar E2E en el rango frío observado de 9:49–12:08. El posible aumento de runner-minutos sigue siendo una estimación; solo Actions permitirá medirlo.

GitHub confirmó que `main` no está protegida y que el plan actual no permite configurar protección para este repositorio privado. No se cambió visibilidad, plan ni protección. En el momento de la validación local, la ejecución posterior aún estaba pendiente; la medición observada tras publicar la PR se registra en la sección siguiente. Se creó el commit local autorizado sin atribución de IA.

## Primera ejecución de CI paralela

La PR [#56](https://github.com/xbasets82/Nextriva/pull/56), run [39855528280](https://github.com/xbasets82/Nextriva/actions/runs/39855528280), terminó con todos los checks exitosos. Duración de pared medida desde creación del run hasta el último job: **2:26**. El run anterior más rápido tardó 3:33, así que esta ejecución tardó 1:07 menos (aprox. 32 %); la mediana previa era 13:26. No se asume que runs futuros mantengan esa duración.

| Job                              | Duración observada |
| -------------------------------- | -----------------: |
| Calidad estática y build         |               1:11 |
| Unitarias y cobertura            |               1:44 |
| Integración PostgreSQL temporal  |               1:19 |
| E2E Playwright con Chromium      |               2:15 |
| Auditoría pnpm                   |               0:39 |
| Agregador de checks              |               0:04 |
| Suma de tiempo activo de runners |           **7:12** |

La suma activa creció 3:11 (aprox. 79 %) frente al run anterior más ligero de 4:01, y fue 6:39 (aprox. 48 %) menor que la mediana previa de 13:51. La reducción de espera se obtuvo aumentando el consumo de runners en comparación con la ejecución anterior más ligera.

La caché pnpm tuvo miss inicial en los cinco jobs. Un job guardó una caché de aproximadamente 137 MB; los otros recibieron un aviso de reserva concurrente ya creada y finalizaron exitosamente. La caché compartida aparece disponible para ejecuciones posteriores. Los tres artefactos esperados se subieron correctamente: `coverage-39855528280-1`, `playwright-39855528280-1` y `audit-39855528280-1`.

La comparación posterior mide una ejecución observada, no una tendencia. El siguiente run podrá medir restauración de caché; el coste de Chromium y la variación entre runners siguen siendo factores de riesgo.
