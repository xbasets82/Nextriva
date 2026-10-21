# I03.3 — Login web y gestión de sesión

El Issue [#41](https://github.com/xbasets82/Nextriva/issues/41), aprobado, completa la experiencia de HU01 en navegador reutilizando Auth de I01. La implementación está lista para publicación en una única PR. La validación humana de accesibilidad y compatibilidad adicional de navegadores sigue pendiente.

## Relación con las fuentes y secuencia

Este suplemento conserva intactos el diseño funcional v1.0 (§§4, 7–9), el diseño técnico v1.0 (§§3.3, 5, 7, 10) y la guía TDD v1.0 bajo `docs/references/`. Concreta su autenticación web y una excepción transitoria de entrada aprobada en el Issue. No sustituye sus HU, actores, entidades ni reglas.

La secuencia de ejecución aprobada es I03.1 backend → I03.2 interfaz de promociones → **I03.3 login web** → siguiente incremento según planificación original y nueva autorización. I01.2/I01.3 siguen identificando login/sesiones y logout/revocación del backend; no se renumeran. No se avanza automáticamente a I04.

## Comportamiento aprobado

Todos los actores inician y cierran sesión con email/contraseña. No hay registro público, recuperación por email ni endpoints adicionales. El formulario valida email/contraseña, anuncia errores, enfoca el primer error y bloquea doble envío. La contraseña se borra al terminar cada intento y no se guarda en estado React ni Web Storage.

Mientras se comprueba la sesión, las pantallas privadas y sus enlaces no se montan. ADMIN vuelve a la ruta de Usuarios/Promociones solicitada. Desde raíz recibe una entrada transitoria con enlaces a esas dos pantallas. El diseño funcional §8.2 prevé Incidencias como entrada definitiva: sigue pendiente y no se implementa aquí. MANAGER/COLLABORATOR permanecen autenticados, pueden salir y ven un estado sin acceso administrativo. La autorización de servidor conserva su responsabilidad exclusiva.

| Respuesta/estado                      | Interfaz                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Recuperación 200                      | Usuario público y navegación permitida por rol.                                                                                         |
| Recuperación o petición protegida 401 | Desmontar contenido privado, mostrar login; no reintentar automáticamente. El contrato no diferencia ausencia, expiración y revocación. |
| 403                                   | Acceso denegado; no convertirlo en credenciales incorrectas ni logout.                                                                  |
| Recuperación 503/red                  | Mensaje temporal y reintento explícito; no mostrar formulario de credenciales incorrectas.                                              |
| Login 401                             | Mensaje genérico idéntico para cuenta existente/inexistente.                                                                            |
| Login 400/403/429                     | Mensaje seguro y recuperable; sin mostrar cuerpo/stack del servidor.                                                                    |
| Logout 204                            | Sesión revocada, desmontar estado privado y volver al login.                                                                            |
| Logout 503/red                        | Conservar sesión visible y permitir repetir cierre. No afirmar revocación.                                                              |

## Arquitectura y seguridad

`SessionGate` coordina recuperación, login/logout y montaje por rol. `LoginForm` gestiona presentación/validación/foco. El cliente `api/auth.ts` deriva la entrada de `operations` OpenAPI y proyecta solo el usuario público reutilizado. El transporte compartido coordina invalidaciones 401 de usuarios/promociones. Una revisión numérica en memoria impide que respuestas de una sesión anterior invaliden una autenticación posterior, incluida la doble ejecución de efectos de React StrictMode.

Se conservan `POST /api/auth/login`, `GET /api/auth/session`, `GET /api/auth/csrf` y `POST /api/auth/logout`. No cambia OpenAPI ni la criptografía. Fetch usa `credentials: same-origin` y `cache: no-store`; el servidor administra la cookie HttpOnly, SameSite y Secure conforme a su configuración. La excepción HTTP es exclusivamente local. Login utiliza la protección Origin/Referer existente; logout pide CSRF y lo conserva solo durante su petición.

No hay contraseñas/tokens en URL, localStorage, sessionStorage, consola ni monitorización añadida. React renderiza texto y mensajes permitidos, no cuerpos de error. Al desmontar pantallas se descartan sus datos privados de estado; no se incorpora caché persistente. No se añade entidad, migración ni dependencia.

## Aceptación y validación

Los criterios completos viven en el Issue #41. Vitest cubre formulario, carga, errores, navegación, reintento, logout y carreras; Playwright comprueba UI real, cookies, persistencia/revocación, roles negativos, teclado y viewport 390×844 con API y PostgreSQL temporal reales. Las suites Auth/usuarios/promociones existentes se repiten como regresión. Los resultados observados y los ciclos TDD están en [la evidencia](../tfm/evidencias/2026-10-20-i03-3-web-login.md).

Accesibilidad de teclado/DOM y móvil no equivalen a certificación WCAG ni pruebas en Safari/Firefox. La revisión humana y esos navegadores permanecen pendientes. El usuario autorizó commits funcionales de menos de 400 líneas y una única PR con `size:exception`. Merge y auto-merge requieren autorización posterior.
