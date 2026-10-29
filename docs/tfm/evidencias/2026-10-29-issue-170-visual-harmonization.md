# Issue #170 — Armonización visual e identidad de sesión

## Alcance aprobado

Issue #170 (`status:approved`) implementada localmente en `codex/issue-170-ux-ui-harmonization`, desde `32df736`. Mejora visual transversal sobre funcionalidades existentes; no altera API, base de datos, reglas de permisos ni infraestructura.

Se reutilizan los assets oficiales, tokens CSS y controles existentes. La guía de mantenimiento queda en `docs/development/visual-system.md`.

## Cambios

- Shell privado fluido limitado a 90rem, márgenes adaptables y formularios con límites de lectura.
- Fondo claro con degradado radial azul muy tenue; texto, bordes, superficies y foco coordinados mediante tokens.
- Cabecera sobre superficie blanca natural para integrar el fondo del wordmark original. No se edita ni filtra el asset.
- Wordmark proporcionado; navegación centrada; cuenta con nombre/rol de la sesión existente, disclosure de correo e iniciales en tamaños compactos.
- Variante `action-primary` clara y reutilizada en las nueve acciones inventariadas en la guía visual; acciones destructivas conservadas.
- Listados en dos columnas a partir de 1280px; Home con resumen e incidencias prioritarias en paneles paralelos. Orden de datos y paginación conservados.

## TDD y regresión

Toolchain comprobada: `mise exec -- node --version` → `v24.22.0`; `mise exec -- pnpm --version` → `10.34.7`. El PATH global presenta versiones distintas; se utiliza la toolchain del proyecto sin instalar ni desactivar validaciones.

### Identidad de sesión

1. RED: `mise exec -- pnpm --filter @nextriva/web test src/App.test.tsx` → código 1: cuatro fallos esperados por ausencia del grupo accesible `Cuenta de usuario` (roles ADMIN/MANAGER/COLLABORATOR y retirada al cerrar sesión).
2. GREEN: mismo comando → código 0, 11/11 pruebas superadas. Las pruebas reutilizan el contrato de Web Locks del entorno de test; no cambian la coordinación de autenticación.
3. Refactor: componente `AccountIdentity` separado de la navegación, sin consulta de red ni reglas de autorización. Escape cierra el disclosure y devuelve el foco. Regresión completa web: 420/420 superadas.

Las pruebas anteriores con selectores globales de identidad se acotan a la fila de participante, registro de auditoría o región de solución correspondiente: el mismo usuario aparece legítimamente también en la cabecera. Se conservan los nombres, correos y expectativas funcionales.

### Comandos y resultados observados

| Comando                                                                                                   | Resultado          | Salida resumida                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `mise exec -- pnpm --filter @nextriva/web test`                                                           | Superado, código 0 | 32 ficheros; 420 pruebas                                                                                          |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                  | Superado, código 0 | Líneas 95,44%; ramas 89,97%; sentencias 94,47%; funciones 96,27%                                                  |
| `mise exec -- pnpm typecheck`                                                                             | Superado, código 0 | API y web                                                                                                         |
| `mise exec -- pnpm lint`                                                                                  | Superado, código 0 | Sin errores                                                                                                       |
| `mise exec -- pnpm format:check`                                                                          | Superado, código 0 | Archivos incluidos por el script                                                                                  |
| `mise exec -- pnpm build`                                                                                 | Superado, código 0 | API TypeScript y build Vite                                                                                       |
| `NEXTRIVA_E2E_API_PORT=4331 NEXTRIVA_E2E_WEB_PORT=5190 mise exec -- pnpm --filter @nextriva/api test:e2e` | Superado, código 0 | 77 regresiones + matriz visual temporal; 78 pruebas                                                               |
| Runner temporal de integración aislada (sin `--e2e`)                                                      | Superado, código 0 | 271 pruebas; 2 omitidas por condiciones existentes; ejecución accidental registrada como integración, no como E2E |

El primer intento E2E no ejecutó pruebas porque 4317 estaba ocupado. Se preservó el proceso ajeno y se utilizaron 4331/5190 tras comprobar que estaban libres. La primera suite ejecutable encontró dos selectores ambiguos por la nueva identidad visible; se corrigió su ámbito y se repitió sin cambiar reglas funcionales.

## Validación visual

Capturas sintéticas sobre PostgreSQL temporal creado por `scripts/test-integration.mjs`. Login real de cada contexto y cookies independientes entre antes/después. Baseline servido desde un snapshot `git archive HEAD` en `/tmp`; no se cambia ni restaura el workspace para capturarlo.

Los intentos preliminares con mocks y glob excesivo se descartaron al detectar páginas vacías o rutas incorrectas; no acreditan ninguna pantalla. La matriz válida espera marcadores específicos y URL exacta antes de capturar.

Resoluciones: 390×844, 768×1024, 1366×768, 1440×900 y 1920×1080. Matriz: landing, login, Home, usuarios, formulario de usuario, promociones, formulario de promoción, detalle/participantes, incidencias, filtros, resultado vacío, detalle/formulario de incidencia, aprobación, error y carga. Se comprueba ausencia de overflow y colores calculados de acción principal (superficie blanca y texto marino).

Las capturas y logs temporales quedan en `/tmp/nextriva-issue170/`; no incluyen datos personales reales ni secretos runtime. La matriz final reforzada terminó con código 0 (1 prueba focalizada, 1,2 minutos): 160 capturas antes/después de 16 pantallas/estados y 5 capturas adicionales del menú de cuenta. Registro en `/tmp/nextriva-issue170/verified-final/report.json`; ningún overflow observado. Incluye error y carga mediante fallo/timing controlado exclusivamente de GET sobre sesiones reales de test. Se comprobaron URL antes/después del marcador, enlace persistente a la incidencia y región de incidencias cargada. El spec y runner temporales se retiraron del repositorio y se conservaron junto a las evidencias de `/tmp` para auditoría.

## Capturas comparativas conservadas

Los siguientes pares se copian sin transformación desde la matriz sintética verificada `verified-final`; se comprobó que su SHA-256 coincide con el origen. La matriz completa permanece temporal para evitar incorporar binarios innecesarios.

| Pantalla                         | Antes                                                     | Después                                                    |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Home · 1440×900                  | [Antes](assets/issue-170/home-1440-before.png)            | [Después](assets/issue-170/home-1440-after.png)            |
| Incidencias · 390×844            | [Antes](assets/issue-170/incidents-390-before.png)        | [Después](assets/issue-170/incidents-390-after.png)        |
| Promociones · 1366×768           | [Antes](assets/issue-170/promotions-1366-before.png)      | [Después](assets/issue-170/promotions-1366-after.png)      |
| Detalle de incidencia · 1440×900 | [Antes](assets/issue-170/incident-detail-1440-before.png) | [Después](assets/issue-170/incident-detail-1440-after.png) |
| Login · 390×844                  | [Antes](assets/issue-170/login-390-before.png)            | [Después](assets/issue-170/login-390-after.png)            |

## No aplicables y límites

- OpenAPI/cliente generado y migraciones de producto: no cambia HTTP ni persistencia.
- Backend de autorización: conserva contratos y reglas existentes, cubiertos por regresiones E2E.
- Nuevas dependencias: ninguna; no se incorpora librería UI ni iconográfica.
- Activación de tema oscuro: no se incorpora selector; se conservan los tokens oscuros existentes.
- Despliegue, secretos, producción, DNS, Caddy y PostgreSQL de producción: no realizados.
- Matriz completa temporal; cinco pares representativos se conservan en `assets/issue-170/` para revisión y trazabilidad.
- Inspección visual directa inicial: Home 1440, incidencias 390, promociones 390, cuenta 390 y aprobación 768. Las restantes capturas están generadas y comprobadas automáticamente; quedan sujetas a revisión visual del coordinador.
- Zoom real del navegador y dispositivos físicos: no comprobados; no se afirman validados.
- Validación humana: pendiente; esta evidencia no supone aprobación del resultado ni autorización de publicación.

## Validación manual

Con el entorno local habitual y datos sintéticos, abrir Home, usuarios, promociones e incidencias. Revisar la distribución en escritorio, reducir a móvil, abrir cuenta con Enter/Espacio y cerrarla con Escape. Comprobar nombre/rol, cambio de contraseña y logout. Crear/editar únicamente registros de prueba y comparar las acciones principales claras con las destructivas. Abrir filtros, cambiar página, navegar a detalle y comprobar retorno. Revisar los diálogos y el foco con teclado.
