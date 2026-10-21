# I03.3 — Login web y gestión de sesión

El Issue [#41](https://github.com/xbasets82/Nextriva/issues/41), aprobado, completa la experiencia de HU01 en navegador reutilizando Auth de I01. I03.3 quedó integrado en `main` mediante la PR [#42](https://github.com/xbasets82/Nextriva/pull/42) (merge `20b14a0`). El Issue [#43](https://github.com/xbasets82/Nextriva/issues/43) documenta la corrección de la carrera logout/reautenticación. La validación humana de accesibilidad y compatibilidad adicional de navegadores sigue pendiente.

## Relación con las fuentes y secuencia

Este suplemento conserva intactos el diseño funcional v1.0 (§§4, 7–9), el diseño técnico v1.0 (§§3.3, 5, 7, 10) y la guía TDD v1.0 bajo `docs/references/`. Concreta su autenticación web y una excepción transitoria de entrada aprobada en el Issue. No sustituye sus HU, actores, entidades ni reglas.

La secuencia de ejecución aprobada es I03.1 backend → I03.2 interfaz de promociones → **I03.3 login web** → siguiente incremento según planificación original y nueva autorización. I01.2/I01.3 siguen identificando login/sesiones y logout/revocación del backend; no se renumeran. No se avanza automáticamente a I04.

## Comportamiento aprobado

Todos los actores inician y cierran sesión con email/contraseña. No hay registro público, recuperación por email ni endpoints adicionales. El formulario valida email/contraseña, anuncia errores, enfoca el primer error y bloquea doble envío. La contraseña se borra al terminar cada intento y no se guarda en estado React ni Web Storage.

Mientras se comprueba la sesión, las pantallas privadas y sus enlaces no se montan. ADMIN vuelve a la ruta de Usuarios/Promociones solicitada. Desde raíz recibe una entrada transitoria con enlaces a esas dos pantallas. El diseño funcional §8.2 prevé Incidencias como entrada definitiva: sigue pendiente y no se implementa aquí. MANAGER/COLLABORATOR permanecen autenticados, pueden salir y ven un estado sin acceso administrativo. La autorización de servidor conserva su responsabilidad exclusiva.

| Respuesta/estado                      | Interfaz                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Recuperación 200                      | Usuario público y navegación permitida por rol.                                                                                         |
| Recuperación o petición protegida 401 | Desmontar contenido privado y mostrar login; no reintentar automáticamente. Si hay un logout pendiente, mostrar estado de cierre y esperar su respuesta antes de habilitar otro login, para que su `Set-Cookie` no expire una sesión nueva. El contrato no diferencia ausencia, expiración y revocación. |
| 403                                   | Acceso denegado; no convertirlo en credenciales incorrectas ni logout.                                                                  |
| Recuperación 503/red                  | Mensaje temporal y reintento explícito; no mostrar formulario de credenciales incorrectas.                                              |
| Login 401                             | Mensaje genérico idéntico para cuenta existente/inexistente.                                                                            |
| Login 400/403/429                     | Mensaje seguro y recuperable; sin mostrar cuerpo/stack del servidor.                                                                    |
| Logout 204                            | Sesión revocada, desmontar estado privado y volver al login.                                                                            |
| Logout 503/red                        | Sin un 401 concurrente, conservar sesión visible y permitir repetir cierre. Si hubo 401 durante el cierre, habilitar login solo después de que finalice la respuesta. No afirmar revocación por el 503. |

## Arquitectura y seguridad

`SessionGate` coordina recuperación, login/logout y montaje por rol. `LoginForm` gestiona presentación/validación/foco. El cliente `api/auth.ts` deriva la entrada de `operations` OpenAPI y proyecta solo el usuario público reutilizado. El transporte compartido coordina invalidaciones 401 de usuarios/promociones. Una revisión numérica en memoria impide que respuestas de bootstrap antiguas invaliden una autenticación posterior, incluida la doble ejecución de efectos de React StrictMode. Durante un logout, un 401 desmonta el contenido privado y muestra un estado de cierre; el formulario de login no se habilita hasta que la respuesta de logout haya terminado y el navegador haya procesado sus cabeceras de cookie.

Se conservan `POST /api/auth/login`, `GET /api/auth/session`, `GET /api/auth/csrf` y `POST /api/auth/logout`. No cambia OpenAPI ni la criptografía. Fetch usa `credentials: same-origin` y `cache: no-store`; el servidor administra la cookie HttpOnly, SameSite y Secure conforme a su configuración. La excepción HTTP es exclusivamente local. Login utiliza la protección Origin/Referer existente; logout pide CSRF y lo conserva solo durante su petición.

La ampliación aprobada de #43 cubre también pestañas del mismo origen: `api/auth.ts` adquiere el bloqueo exclusivo Web Locks `nextriva-auth-transition` antes de cada login y de la secuencia completa CSRF/logout. Lo conserva hasta que termina la petición, cuando el navegador ya ha procesado `Set-Cookie`. Un login solicitado desde otra pestaña permanece en carga, sin enviar credenciales, hasta que el logout libere el bloqueo. El estado de React continúa siendo local a cada pestaña; la garantía sobre el orden de cookies la aporta el bloqueo compartido, no una revisión numérica local. El servidor conserva la autorización y revocación efectivas.

Web Locks requiere un contexto seguro y soporte del navegador. En ausencia de `navigator.locks`, login y logout fallan antes de enviar sus peticiones con un mensaje accesible que solicita navegador actualizado y HTTPS o localhost. No existe fallback sin coordinación, ni almacenamiento de credenciales o bloqueos en Web Storage. La garantía cubre las transiciones realizadas por esta versión del cliente en el mismo origen; peticiones manuales u otras aplicaciones que no usen el bloqueo no participan en él. Referencia de la API: [MDN Navigator.locks](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/locks).

No hay contraseñas/tokens en URL, localStorage, sessionStorage, consola ni monitorización añadida. React renderiza texto y mensajes permitidos, no cuerpos de error. Al desmontar pantallas se descartan sus datos privados de estado; no se incorpora caché persistente. No se añade entidad, migración ni dependencia.

## Aceptación y validación

Los criterios iniciales viven en el Issue #41; la regresión de respuesta tardía se especifica en el Issue #43. Vitest cubre formulario, carga, errores, navegación, reintento, logout y estados concurrentes; Playwright comprueba UI real, cookies, persistencia/revocación, roles negativos, teclado y viewport 390×844 con API y PostgreSQL temporal reales. Las suites Auth/usuarios/promociones existentes se repiten como regresión. Los resultados observados y los ciclos TDD de ambos incrementos están en [la evidencia](../tfm/evidencias/2026-10-20-i03-3-web-login.md).

Accesibilidad de teclado/DOM y móvil no equivalen a certificación WCAG ni pruebas en Safari/Firefox. La revisión humana y esos navegadores permanecen pendientes. I03.3 está integrado en `main`; la corrección del Issue #43 está publicada en la PR [#44](https://github.com/xbasets82/Nextriva/pull/44), con CI y revisión pendientes. No se ha hecho merge ni se ha iniciado I04.
