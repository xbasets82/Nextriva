# Recursos oficiales de marca — Issue #111

Fecha: 25/10/2026. Rama: `codex/issue-111-brand-assets`. Base: `0ff7dec4ccfa8a7f03a5ae3e3d49c6743e7a3601`.

## Autorización y alcance

La consulta `gh issue view 111 --json title,body,labels,state,url` confirmó el issue [#111](https://github.com/xbasets82/Nextriva/issues/111) abierto con `status:approved` y `type:feature`. Árbol limpio al empezar. Mejora transversal de presentación I00–I10; no añade HU ni modifica autenticación, API, permisos, navegación protegida o persistencia.

En el cambio inicial se sustituyó el literal visual NEXTRIVA del login y de la cabecera por el icono oficial. El login muestra 96 × 96 píxeles CSS; la cabecera mostraba 48 × 48 y 64 × 64 desde `sm`. Se conservó el contenido y proporción cuadrados con `object-contain`. Cada pantalla contenía una imagen con nombre accesible «Nextriva», sin texto de marca duplicado. La imagen no añade una interacción. Se conservó la distribución de navegación y logout. El ajuste posterior de wordmark en la cabecera se documenta abajo.

En el cambio inicial se incorporaron `nextriva-icon-192.png` y `nextriva-favicon-32.png`, copiados desde los recursos proporcionados a `apps/web/public/`. Las variantes de 512 y 1024 píxeles no se incorporan porque no se usan. El documento HTML declara el favicon local, PNG, 32 × 32. El wordmark horizontal se añadió después, según se detalla abajo.

## TDD observado

### Red — fallida por comportamiento ausente

Antes de copiar recursos o modificar la implementación:

```text
mise exec -- pnpm --filter @nextriva/web test src/App.test.tsx
Test Files  1 failed (1)
Tests       4 failed | 3 passed (7)
Exit status 1
```

Los cuatro fallos fueron `Unable to find an accessible element with the role "img" and name "Nextriva"`: login y cabecera para ADMIN, MANAGER y COLLABORATOR. No fueron fallos de entorno. Salida completa local: `/tmp/nextriva-issue111-red.log`.

### Green — superada

Tras añadir las dos imágenes y el favicon:

```text
mise exec -- pnpm --filter @nextriva/web test src/App.test.tsx
Test Files  1 passed (1)
Tests       7 passed (7)
Exit status 0
```

### Ajustes durante la validación y refactor

La primera suite E2E terminó con 55 pruebas superadas y 3 fallidas, salida 1. Tres comprobaciones XSS existentes exigían que toda la página careciera de imágenes; detectaban el logo oficial. Se acotaron a sus regiones semánticas «Comentarios» y «Solución». Permanecen las comprobaciones de texto literal, ausencia de ejecución del payload y persistencia. No se modifica el código de incidencias. La segunda ejecución completa superó las 58 pruebas.

El primer typecheck falló con salida 2 por el uso de `exact` en `getAllByRole` de Testing Library. Se retiró esa opción no admitida; el nombre de cadena mantiene la coincidencia exacta por defecto. El typecheck final fue superado.

No se extrajo un componente para las dos imágenes: los tamaños son específicos de cada ubicación y no hay lógica compartida que lo requiera. Se normalizaron los archivos modificados con Prettier y se repitieron las pruebas y controles afectados.

## Comprobaciones finales

Todos los comandos se ejecutaron desde la raíz del repositorio con los scripts existentes y Node 24.22.0/pnpm 10.34.7 mediante mise.

| Comando                                                                                                   | Resultado observado                                        | Salida |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test`                                                           | **Superada**: 22 archivos, 323 pruebas                     | 0      |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | **Superada**: 58 pruebas, Chromium; 25,3 s                 | 0      |
| `mise exec -- pnpm typecheck`                                                                             | **Superada**: API y web                                    | 0      |
| `mise exec -- pnpm lint`                                                                                  | **Superada**                                               | 0      |
| `mise exec -- pnpm format:check`                                                                          | **Superada**: `All matched files use Prettier code style!` | 0      |
| `mise exec -- pnpm --filter @nextriva/web build`                                                          | **Superada**: Vite, 46 módulos                             | 0      |
| `git diff --check`                                                                                        | **Superada**: sin salida                                   | 0      |

La suite E2E usó el runner seguro: PostgreSQL temporal aislado, migraciones de prueba y puertos 4318/5174. No se ejecutaron pruebas contra `nextriva_dev`. La integración Vitest/PostgreSQL específica no aplica porque el cambio es estático; la suite E2E sí conserva sus comprobaciones existentes de sesión y persistencia.

Las pruebas de navegador comprueban carga de la imagen (`complete`, tamaño natural 192 × 192), proporción cuadrada, `object-fit: contain`, nombre accesible único y ausencia de la marca textual. Login: 320, 390, 768 y 1280 píxeles de ancho. Cabecera de los tres roles: 320, 390, 640, 768 y 1440; navegación centrada, logout en su posición, sin desbordamiento horizontal. Se comprueba favicon PNG con respuesta 200, tipo, firma y dimensiones 32 × 32 desde raíz y después de recargar `/#/incidents`; no hubo 404 de recursos de marca. Se mantienen los flujos existentes de teclado, login/logout, roles y restauración de rutas.

La revisión con Python de `apps/web/dist/index.html` confirmó `href="/nextriva-favicon-32.png"`. Comparación binaria original/public/dist: idénticos, salida 0. SHA-256:

- Icono: `787ecb7b124db7e4225343ac4561856e41262d05cc40b436e246824d2df9c0b4`.
- Favicon: `6c1846aca0f416ffba96f7ecba1db936a97dae143e7578b6f14cbc6c52010960`.

Salidas completas locales: `/tmp/nextriva-issue111-green-focused.log`, `/tmp/nextriva-issue111-web-tests-final.log`, `/tmp/nextriva-issue111-e2e.log` (primera ejecución), `/tmp/nextriva-issue111-e2e-final.log`, `/tmp/nextriva-issue111-typecheck.log` (primer intento), `/tmp/nextriva-issue111-typecheck-final.log`, `/tmp/nextriva-issue111-lint-final.log`, `/tmp/nextriva-issue111-format-final.log` y `/tmp/nextriva-issue111-build.log`. Los temporales no forman parte del cambio entregado.

## Límites y pendientes

- Los PNG son RGB opacos sin canal alfa. Se conserva su fondo y composición originales; no hubo recorte, redibujo ni recoloreado.
- **No ejecutadas**: revisión visual humana, VoiceOver, Safari/Firefox y revisión en modo oscuro. La evidencia responsive es automatizada en Chromium; no constituye certificación de accesibilidad.
- Cobertura porcentual no medida en esta unidad. No se afirma un valor ni se modifican umbrales.
- Vitest avisó de `Window.scrollTo` no implementado en jsdom; las 323 pruebas finalizaron correctamente. Playwright emitió avisos `NO_COLOR`/`FORCE_COLOR`, sin fallo final.
- CI remota, commit, push, PR e integración pendientes. Este informe registra implementación y verificaciones locales; no acredita aprobación humana ni merge.

## Ajuste del wordmark en navegación

El usuario pidió usar el logotipo horizontal proporcionado para que el nombre completo se vea en la cabecera. Se mantiene el icono cuadrado en login y favicon; únicamente cambia la imagen de navegación. El PNG se copia sin transformación a `apps/web/public/nextriva-wordmark-blue.png`, conserva dimensiones 2508 × 627 y su SHA-256 coincide con el original (`7225992356bd938525413f98abe98f947c583c19751ea2fe17fcdee8f15d429c`). La cabecera lo muestra con anchura responsive, proporción intrínseca y `object-fit: contain`; no añade texto de marca duplicado ni altera navegación, roles o sesión.

### TDD observado para el ajuste

RED: `mise exec -- pnpm --filter @nextriva/web exec vitest run src/App.test.tsx -t 'active promotion tab'` falló para ADMIN, MANAGER y COLLABORATOR porque la cabecera todavía referenciaba `/nextriva-icon-192.png` en vez del wordmark esperado. Resultado: 3 fallidos, 4 omitidos, salida 1. La primera ejecución de RED tuvo una consulta de test dentro del elemento `nav` que no podía encontrar la marca, ya que el logo está correctamente fuera de la navegación semántica; se corrigió la consulta para comprobar la imagen única del encabezado. RED se repitió y confirmó entonces el fallo de comportamiento por `src` esperado, no por el test.

GREEN y regresión:

| Comando                                                                                                   | Resultado observado                                             | Salida |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web exec vitest run src/App.test.tsx -t 'active promotion tab'`     | Superada: 3 pruebas de roles                                    | 0      |
| `mise exec -- pnpm --filter @nextriva/web test`                                                           | Superada: 22 archivos, 323 pruebas                              | 0      |
| `NEXTRIVA_E2E_API_PORT=4318 NEXTRIVA_E2E_WEB_PORT=5174 mise exec -- pnpm --filter @nextriva/api test:e2e` | Superada: 58 pruebas con Chromium y PostgreSQL temporal aislado | 0      |
| `mise exec -- pnpm typecheck`                                                                             | Superada: API y web                                             | 0      |
| `mise exec -- pnpm lint`                                                                                  | Superada                                                        | 0      |
| `mise exec -- pnpm format:check`                                                                          | Superada                                                        | 0      |
| `mise exec -- pnpm --filter @nextriva/web build`                                                          | Superada                                                        | 0      |

La E2E comprueba la carga HTTP y dimensiones naturales del wordmark, proporción visual cercana a 4:1, nombre accesible único, ausencia de texto de marca duplicado, centrado de navegación y ausencia de desbordamiento horizontal en 1440, 768, 640, 390 y 320 píxeles para los tres roles. La comparación binaria del original y el recurso copiado coincide. No se modificó API ni persistencia; no se ejecutaron pruebas de integración Vitest ni OpenAPI por no ser aplicables. No se ejecutó una revisión visual manual fuera de Chromium.
