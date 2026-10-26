# Issue #129 — Panel plegable de filtros de incidencias

## Alcance y decisiones

Implementación local de [#129](https://github.com/xbasets82/Nextriva/issues/129), aprobada por el usuario, en `codex/incident-filter-panel`, desde `main` `fc4dba5eb11f1713c4b2b3f2594da7046e4e3e59`. Mejora de presentación de HU15, independiente de I10. No se han realizado commit, push ni PR.

- El panel comienza cerrado en cada entrada al listado. Un botón real con `aria-expanded` y `aria-controls` permite abrirlo y cerrarlo. Los controles permanecen montados con `hidden` y `display: none` cuando corresponde: conservan sus valores y no participan en tabulación ni en el árbol accesible.
- El contador incluye únicamente búsqueda aplicada (tras el debounce existente de 300 ms), promoción, responsable, estado, prioridad y categoría. No cuenta página, tamaño ni ordenación. La ordenación seleccionada se presenta aparte con campo y dirección incluso con el panel cerrado.
- Cerrar o abrir no cambia consultas ni filtros; filtrar o paginar no abre el panel. El retorno del detalle conserva el contexto existente de filtros, ordenación y página y presenta el panel inicialmente cerrado.
- Limpiar restablece la consulta existente por defecto y la página 1 con tamaño 10. El nuevo icono `reset` representa `rotate-ccw`; el `clear`/`filter-x` utilizado por otras pantallas mantiene su representación.
- Se reutilizan tokens, controles, selector con flecha corregida y tooltip existentes. Hover/foco tienen transición de color con `motion-reduce:transition-none`; el contenido oculto no deja márgenes. No se añaden dependencias.
- API, autorización, consultas PostgreSQL, OpenAPI, esquema, migraciones y baseline permanecen sin modificaciones. La ordenación continúa realizándose en servidor antes de paginar.

## TDD observado

1. Se añadieron primero las pruebas del panel y se adaptaron las interacciones previas que requieren abrirlo, sin modificar producción.
2. RED: `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentsScreen.test.tsx`, salida 1: 12 fallidas y 9 superadas (21). Los fallos fueron `Unable to find role="button" and name /^Filtros/` o `Filtros`: faltaba el control de despliegue, sin error de entorno.
3. GREEN: mismo comando, salida 0: 21/21. Se añadieron el estado local de apertura, atributos ARIA, contador de consulta aplicada e iconos. Las pruebas verifican cierre inicial, accesibilidad de controles, conservación de valores y peticiones, seis filtros efectivos, debounce, orden separado y limpieza.
4. REFACTOR: no fue necesaria una nueva abstracción de panel para una única pantalla. Se conservaron funciones de consulta/limpieza y el componente compartido de acciones; se añadió solo una variante de icono. Se normalizó formato y se ejecutó la regresión.

No se reconstruyen RED históricos ni se afirman nuevas pruebas de reglas de negocio sin cambios.

## Resultados y fallos investigados

La primera cobertura web encontró 395 superadas y 1 fallida: un caso existente de Home leía el selector Responsable sin abrir el panel. Se añadió únicamente la apertura explícita y se conservaron sus comprobaciones de usuario, valor y opción accesible. Repetición: 30 archivos y 396/396, salida 0.

Primera ejecución E2E: bloqueada por entorno, salida 1. El runner preparó una base temporal en `127.0.0.1:5433` y aplicó las 13 migraciones existentes, pero Playwright rechazó reutilizar el servicio local ya presente en 4317. No se detuvo el proceso ajeno, no se modificó `reuseExistingServer: false` ni la configuración del runner. Se utilizaron después los puertos alternativos admitidos por la configuración existente (14317/15173), preservando el mismo aislamiento de PostgreSQL y eliminando variables heredadas de base de datos en el comando.

| Comando desde la raíz                                                                                                                                | Resultado observado                                                                         | Salida |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentsScreen.test.tsx`                                                               | GREEN final: 23/23                                                                          | 0      |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                             | 30 archivos, 398/398; 95,40 % líneas, 89,98 % ramas, 96,61 % funciones y 94,37 % sentencias | 0      |
| `env -u DATABASE_URL -u TEST_DATABASE_URL NEXTRIVA_E2E_API_PORT=14317 NEXTRIVA_E2E_WEB_PORT=15173 mise exec -- pnpm --filter @nextriva/api test:e2e` | 76/76 en 35,7 s; Chromium/API/PostgreSQL reales temporales                                  | 0      |
| `mise exec -- pnpm typecheck`                                                                                                                        | API y web                                                                                   | 0      |
| `mise exec -- pnpm lint`                                                                                                                             | Sin infracciones                                                                            | 0      |
| `mise exec -- pnpm format:check`                                                                                                                     | Formato correcto                                                                            | 0      |
| `mise exec -- pnpm build`                                                                                                                            | API y web                                                                                   | 0      |
| `git diff --check`                                                                                                                                   | Sin errores                                                                                 | 0      |

La primera ejecución completa en puertos alternativos pasó 75/76 y falló el nuevo gesto de Enter: el test enfocaba el botón tras ver el heading, antes del foco que aplica la carga inicial existente. Se conservó la activación real con teclado y su expectativa, esperando primero el heading enfocado como condición observable de esa carga, sin sleeps ni reintentos. La repetición completa pasó 76/76, incluida apertura con Enter y reapertura con Espacio, persistencia de filtros cerrados, paginación 10 y retorno desde detalle. El runner no admite selección individual de E2E; el escenario afectado se ejecutó dentro de esta suite obligatoria. Esta sincronización permitió superar el flujo, pero no descartaba un defecto real de foco durante la carga. La revisión posterior confirmó la carrera descrita a continuación.

Los avisos existentes de jsdom sobre `window.scrollTo` no impidieron superar pruebas. No se alteran umbrales de cobertura, aserciones de permisos ni expectativas de datos. Las pruebas previas de creación desde listado y navegación desde Home ahora abren explícitamente los filtros cuando necesitan consultar sus controles.

Integración Vitest específica y nueva cobertura API: no aplican a este cambio sin modificación HTTP, permisos o persistencia. No se requiere regenerar cliente/OpenAPI ni crear/aplicar migraciones de desarrollo. La regresión E2E usa API y PostgreSQL reales exclusivamente temporales. `nextriva_dev` no se ha utilizado ni modificado.

## Corrección de revisión independiente: foco durante la carga inicial

La revisión detectó que enfocar o activar el botón antes de terminar la primera carga dejaba `focusAfterLoad` activo. Al llegar la respuesta, el efecto cambiaba el foco al heading. Se añadieron primero dos variantes deterministas con promesa diferida de respuesta inicial: foco sin expandir y foco con expansión; no usan esperas arbitrarias.

RED observado con el mismo comando focal: 2 fallidas y 21 superadas, salida 1. En ambos casos `document.activeElement` era el heading y se esperaba el botón. La corrección mínima cancela la entrega de foco inicial cuando el usuario enfoca o activa el control de filtros. El foco inicial del heading se mantiene si no se ha interactuado. GREEN focal: 23/23, salida 0. Refactor adicional innecesario; se reutiliza la referencia de control de foco existente.

La cobertura web completa posterior pasó 398/398, salida 0, con 95,40 % líneas, 89,98 % ramas, 96,61 % funciones y 94,37 % sentencias. Se conservaron las aserciones E2E de teclado y se repitió la suite completa tras corregir producción: 76/76 en 35,7 s, salida 0. Typecheck, lint, formato y build también se repitieron con salida 0.

## Validación manual pendiente

Con la aplicación ya iniciada, abrir `#/incidents`: el panel debe estar cerrado. Activar Filtros mediante Tab/Enter o Espacio, seleccionar filtros y ordenación, cerrarlo y verificar indicador y resultados. Paginar, abrir un detalle y regresar: se conservan contexto y página, con panel cerrado; al reabrir se mantienen valores. Limpiar devuelve valores predeterminados y diez elementos por página. Comprobar escritorio/móvil, foco y contraste.

Pendientes: aprobación visual humana, VoiceOver, Safari y Firefox. No se declara conformidad WCAG completa ni validación manual realizada.

## Uso de IA

Codex produjo pruebas, implementación y esta evidencia a partir del Issue aprobado y de ejecuciones observadas. La revisión independiente y la validación humana se comunicarán por separado. Esta evidencia no autoriza publicación ni el siguiente incremento.
