# Issue #127 — Landing pública de Nextriva

## Alcance y decisiones verificadas

Implementación local de [#127](https://github.com/xbasets82/Nextriva/issues/127), con `status:approved`, en `codex/public-landing`, desde `main` en `289f3260246350d2478fe21cb5198ce9759d0936`. Es una ampliación pública solicitada expresamente, independiente de las 15 HU y de I10. No se han realizado commit, push, PR, despliegue ni modificaciones de `nextriva_dev`.

- La raíz sin sesión presenta la landing después de la comprobación existente de sesión. Una sesión válida en raíz sigue entrando en Home. `#/welcome` y sus secciones son públicas incluso con sesión válida y no montan módulos privados.
- `Acceder` utiliza `#/login`. Se conserva la restauración de destinos protegidos admitidos, la navegación del logotipo privado a Home y el cierre real de sesión. `SessionGate` recibe únicamente una presentación alternativa para la raíz anónima; no se duplican consultas de sesión, autorización ni credenciales.
- La cabecera pública, hero, funcionalidades, fases, pasos, ventajas, contacto y footer reutilizan la marca y la tipografía local. Las siete fases proceden de `phaseLabels`; se explica su posible solapamiento. La ilustración está identificada como ficticia y no consulta información privada.
- El contenido se contrastó con Promotions, Incidents, usuarios/roles, comentarios, soluciones, actividades y Home presentes en el código. No se anuncian adjuntos, notificaciones, gestión formal de cambios, IA en producto, testimonios ni métricas comerciales sin evidencia. Las referencias históricas v1.0 permanecen intactas.
- Contacto es una demostración explícita: validación nativa de campos obligatorios/email, sin endpoint, envío, correo, analítica ni almacenamiento. El aviso precede a los campos y la respuesta dice que no se ha enviado ni guardado nada. No se inventan canales ni documentos legales.
- CSS limitado a `.landing`, navegación móvil con Escape y devolución de foco, saltos a encabezados enfocados, enlace para saltar al contenido y adaptación a reducción de movimiento. Se utilizan recursos propios, sin dependencias nuevas.

## TDD observado

| Ciclo                | Ejecución y RED real                                                                                                                                                     | GREEN y refactor                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentación pública | `mise exec -- pnpm --filter @nextriva/web test src/public-landing.test.tsx`: 5 fallos, salida 1, antes de producción. Faltaban titular/ruta pública/navegación/contacto. | Mismo comando: 5/5, salida 0. Se añadió vista pública y presentación anónima opcional en el gate existente. Se corrigió el espaciado semántico del titular y se acotó una consulta de test al CTA, pues cabecera y footer comparten «Acceder». |
| Movimiento reducido  | Primera suite E2E: el enlace mantenía `0.18s, 0.18s, 0.18s` con `prefers-reduced-motion: reduce`; fallo funcional real.                                                  | El selector de reducción tenía menor especificidad que `.landing a`; se igualó la especificidad. Segunda suite completa: 76/76, salida 0, incluida transición `0s`.                                                                            |
| Revisión de calidad  | Typecheck señaló `string \| undefined` incompatible con `exactOptionalPropertyTypes`; ESLint señaló dos ternarios anidados.                                              | Valor de sección vacío explícito y cálculo independiente de clases del layout; ambos controles pasaron sin supresiones.                                                                                                                        |

No se reconstruyen RED previos. El ajuste visual posterior de la etiqueta «Empresa (opcional)» procede de inspección de la captura: se presentó en una línea para alinear ambos inputs. Es presentación CSS/HTML; no se afirma un RED automatizado de esa alineación.

## Regresión y fallos investigados

La nueva raíz sustituye el acceso automático al login para visitantes. Los tests previos que prueban exclusivamente login ahora abren `/#/login`; se conservaron sus aserciones de permisos, cookies, CSRF, revocación, estados, persistencia y carreras. Las pruebas de sesión existente en raíz siguen abriendo `/`. Se incorporaron cinco E2E: tres roles con login real, un destino protegido y navegación móvil/contacto.

Primera suite E2E: 73/76, salida 1. Además del fallo de reducción de movimiento, se encontraron dos preparaciones de test incompatibles con la nueva pantalla pública:

1. El escenario previo de segunda sesión de asignación abría la raíz mediante `new URL('/')` y trataba de introducir el email de acceso en la landing. Se cambió únicamente su destino inicial a `/#/login`.
2. El helper nuevo podía rellenar el campo Email de la demo de contacto antes de que el evento de ruta montara el login. La traza mostraba GET de sesión, ninguna petición de login. Se espera ahora explícitamente al formulario «Iniciar sesión» antes de rellenar. No se añadieron reintentos ni se debilitaron expectativas.

Segunda suite E2E completa: 76/76 en 31,8 s, salida 0. El runner aplicó las 13 migraciones existentes en una base PostgreSQL temporal de `127.0.0.1:5433`; no cambió migraciones ni utilizó desarrollo. `reuseExistingServer: false` permanece intacto.

Después del ajuste visual de la etiqueta de empresa, la tercera ejecución completa volvió a pasar 76/76 en 34,8 s, salida 0; la cobertura web final volvió a pasar 388/388 con los mismos porcentajes. Se repitieron asimismo tipos, lint, formato y build del árbol final.

## Corrección de revisión independiente: retorno del logotipo público

La revisión detectó que el logo del footer no volvía al inicio desde Contacto: el efecto intentaba buscar un ID de sección vacío y, si la URL ya era `#/welcome`, no había cambio de ruta que lo disparase. Se añadieron primero dos casos web para ambas situaciones. El primer intento falló por un selector de título con salto de línea en jsdom; se corrigió ese selector antes de aceptar ningún RED. La ejecución siguiente produjo el RED funcional: 2 fallos y 5 verdes, salida 1, porque el foco permanecía en Contacto y no se desplazaba al inicio.

La solución mínima centraliza desplazamiento y foco en `focusSection`: la sección vacía resuelve al contenido inicial; el contenedor de la landing vuelve a la parte superior y se enfoca su titular sin desplazamiento adicional. El logo utiliza esa misma operación cuando la ruta ya coincide. No cambia autenticación ni código de negocio. La repetición focal pasó 7/7, salida 0. El E2E móvil comprueba también clic desde Contacto, activación con Enter desde el footer en la misma ruta, foco en el titular y `scrollY = 0`, sin sleeps.

Después de la corrección: cobertura web completa 390/390, salida 0; E2E completo 76/76 en 33,5 s, salida 0; typecheck, lint, formato y build repetidos con salida 0. Cobertura final: 95,36 % líneas, 89,91 % ramas, 96,38 % funciones, 94,34 % sentencias; `LandingPage.tsx`: 96,66 % líneas y 89,47 % ramas. API/OpenAPI y auditoría no se repitieron por este ajuste exclusivamente de navegación visual; sus resultados previos siguen registrados y no cambió su código/contrato ni el árbol de dependencias.

## Segunda corrección de revisión: enlaces de sección con ruta coincidente

La segunda revisión reprodujo el mismo patrón en los enlaces de secciones: desde `#/welcome/features`, bajar al footer y pulsar «Funcionalidades» no cambiaba el hash y dejaba el contenido abajo. Antes de modificar producción se añadieron cuatro casos para footer, cabecera, CTA de descubrimiento y salto al contenido con la ruta ya seleccionada. RED observado: 4 fallos y 7 verdes, salida 1; el foco permanecía en Contacto. La corrección extrajo `followCurrentSection` reutilizando el desplazamiento/foco del logotipo, y lo conectó a todos esos enlaces. Los clics modificados conservan el comportamiento del navegador.

GREEN focal: 11/11, salida 0. La regresión completa web con cobertura pasó 394/394, salida 0. El E2E real vuelve a Funcionalidades desde el footer, baja de nuevo, activa el mismo enlace con Enter y verifica ruta conservada, encabezado enfocado, viewport y desplazamiento restaurados: suite completa 76/76 en 34,0 s, salida 0. Typecheck, lint, formato y build también pasaron con salida 0. No se añadieron esperas arbitrarias ni reintentos de pruebas. Última cobertura: 95,33 % líneas, 89,90 % ramas, 96,41 % funciones, 94,31 % sentencias; `LandingPage.tsx`: 94,59 % líneas y 88,46 % ramas. Se conservan los resultados anteriores como trazabilidad de cada revisión.

## Resultados observados

| Comando desde la raíz                                                                                                                                      | Resultado                                                                     | Salida |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `mise exec -- pnpm --filter @nextriva/web test`                                                                                                            | 30 archivos, 394/394                                                          | 0      |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                                                                   | 394/394; 95,33 % líneas, 89,90 % ramas, 96,41 % funciones, 94,31 % sentencias | 0      |
| `mise exec -- pnpm --filter @nextriva/api test:e2e`                                                                                                        | Última ejecución: 76/76 en 34,0 s, Chromium/API/PostgreSQL reales             | 0      |
| `mise exec -- pnpm typecheck`                                                                                                                              | API y web                                                                     | 0      |
| `mise exec -- pnpm lint`                                                                                                                                   | Sin infracciones                                                              | 0      |
| `mise exec -- pnpm format:check`                                                                                                                           | Todos los archivos incluidos en el script                                     | 0      |
| `mise exec -- pnpm build`                                                                                                                                  | API y web; Vite 8.3.3, bundle 410,49 kB / 116,28 kB gzip                      | 0      |
| `mise exec -- pnpm api:types:check`                                                                                                                        | OpenAPI/tipos reproducibles, sin cambios de contrato                          | 0      |
| `mise exec -- pnpm audit --json > /tmp/nextriva-issue127-audit.json`                                                                                       | Un aviso alto ya aprobado: Multer `GHSA-q7qp-rjg7-q26m`                       | 1      |
| `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-issue127-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1` | Excepción previa vigente hasta 2026-11-23, sin avisos no aprobados            | 0      |
| `mise exec -- pnpm test:audit-baseline`                                                                                                                    | 30/30                                                                         | 0      |

La cobertura final de `LandingPage.tsx` es 94,59 % líneas y 88,46 % ramas. El porcentaje no demuestra conformidad de accesibilidad. Se mantienen los umbrales existentes. Vitest muestra avisos existentes de `window.scrollTo` no implementado por jsdom; las pruebas pasan y la navegación real se comprueba en Chromium. Playwright muestra los avisos existentes `NO_COLOR`/`FORCE_COLOR`.

Integración Vitest específica: no aplica, porque no se modifican API, dominio ni persistencia. No se realizaron instalaciones, nuevas migraciones, cambios de esquema o baseline. La regresión HTTP/sesión/CSRF/persistencia afectada se ejecutó mediante E2E real. No se declara una nueva cobertura API medida.

## Evidencia visual y validación humana pendiente

Playwright generó y se inspeccionaron capturas de escritorio y móvil bajo `apps/api/test-results/`, directorio ignorado por Git. La prueba comprueba ausencia de desbordamiento a 320, 390, 768 y 1440 px; navegación móvil con teclado, foco, validación nativa del contacto, ausencia de peticiones mutantes y almacenamiento, y reducción de movimiento. Se genera también captura de tema oscuro. Estas capturas contienen solo la ilustración y textos ficticios; no se incorporan al repositorio.

Procedimiento manual con la aplicación ya iniciada:

1. Abrir la URL local en una ventana sin sesión: debe mostrarse la landing. Probar enlaces de secciones y menú móvil con Tab, Enter y Escape.
2. Usar «Acceder a Nextriva», iniciar sesión y comprobar Home. Abrir una sección privada y pulsar la marca para volver a Home.
3. Visitar `/#/welcome` con sesión: se mantiene la presentación pública. Abrir `/`: se recupera Home. Cerrar sesión desde la zona privada: vuelve al login.
4. Abrir `/#/incidents` sin sesión e iniciar sesión: se restaura ese destino permitido.
5. Probar contacto únicamente con valores ficticios. Debe avisar antes de introducir datos, validar email/campos y confirmar que no se envió ni guardó nada.

Pendientes: aprobación visual humana; VoiceOver; Safari y Firefox; revisión completa de contraste y conformidad WCAG. No se declaran realizadas. La SPA con rutas hash y sin SSR tiene limitaciones de indexación. Metadatos básicos y Open Graph usan recursos propios; URL canónica/imagen absoluta y dominio final requieren revisión cuando exista destino de despliegue autorizado. No se publican páginas legales ficticias.

## Uso de herramientas de IA

Codex produjo pruebas, implementación y evidencia conforme al Issue aprobado, utilizando resultados reales. La revisión independiente y la validación humana se comunicarán por separado. No se autoriza automáticamente la integración ni el siguiente incremento.
