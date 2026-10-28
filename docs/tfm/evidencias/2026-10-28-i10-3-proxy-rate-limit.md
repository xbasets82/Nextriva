# I10.3 — Verificación de proxy, rate limit y recuperación sintética

## Alcance y estado

Se añadió una regresión E2E al candidato de I10.3 para comprobar que variar una cabecera `X-Forwarded-For` enviada por el cliente no permite eludir el límite de intentos de login cuando la solicitud atraviesa Caddy. La prueba utiliza una identidad ficticia inexistente y servicios temporales del runner de I10.2. También se verificó el comportamiento del rate limit por HTTPS en la VPS y se ejecutó la prueba de restauración PostgreSQL sintética.

No se modificaron la VPS, DNS, Caddy activo, servicios ni bases persistentes. Las solicitudes remotas fueron lecturas HTTP de salud y logins inválidos con identidad sintética. Estas verificaciones parciales no constituyen la validación completa ni el despliegue de I10.3.

## Validación observada

| Comando                                                                                                                                                | Resultado                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise exec -- pnpm --filter @nextriva/api test:e2e:production`                                                                                         | **Superado**, 1 prueba E2E; cinco intentos inválidos respondieron 401 y el sexto 429 aunque cada solicitud incluyó una IP falsificada distinta en `X-Forwarded-For`. Código de salida 0. PostgreSQL fue efímero y el runner confirmó limpieza de recursos. |
| `mise exec -- pnpm exec prettier --check apps/api/e2e-production/demo.spec.ts`                                                                         | Primer chequeo **fallido**, código 1; se aplicó formato Prettier. Repetición **superada**, código 0.                                                                                                                                                       |
| `mise exec -- pnpm exec eslint apps/api/e2e-production/demo.spec.ts`                                                                                   | **Superado**, código 0.                                                                                                                                                                                                                                    |
| `env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:backup-restore`                                                | **Superado**, 1 prueba de restauración sintética en PostgreSQL temporal; se compararon datos e invariantes y el runner confirmó la limpieza de las bases. Código de salida 0.                                                                              |
| `mise exec -- pnpm audit --json`                                                                                                                       | Código de salida 1; el informe actual muestra únicamente `GHSA-q7qp-rjg7-q26m` / `CVE-2026-113872`, Multer 2.4.0, severidad alta; cero críticas.                                                                                                           |
| `mise exec -- node scripts/check-audit-baseline.mjs --report /tmp/nextriva-i103-audit.json --baseline .github/audit-baseline.json --audit-exit-code 1` | **Superado**, código 0; acepta únicamente la excepción aprobada, que vence el 23/11/2026.                                                                                                                                                                  |

## Inspección remota de solo lectura

El 28/10/2026, mediante SSH de solo lectura a la VPS OVH de Estrasburgo, se observó que el candidato `39636e4` ya está ejecutándose: API y PostgreSQL aparecen `healthy`; web está arriba. API y web publican únicamente en loopback del host (`127.0.0.1:3100` y `127.0.0.1:8180`); PostgreSQL muestra solo el puerto interno del contenedor, sin binding al host. No se reiniciaron servicios ni se modificaron archivos o bases de datos.

Las solicitudes HTTPS iniciales devolvieron `200` para `https://nextriva.es` (`text/html`) y `https://nextriva.es/api/health` (`application/json`). La prueba limitada de login inválido y rate limit se documenta en la siguiente sección.

El test nuevo pasó al ejecutarse por primera vez. No se alteró producción ni se reconstruyó un RED artificial: esta modificación añade evidencia de regresión para una política que ya estaba implementada.

## Verificación real por HTTPS y Caddy en la VPS

Con autorización explícita para estas peticiones, se envió un login inválido con una cuenta ficticia inexistente y contraseña de prueba, primero desde el Mac y después desde la ruta local de Caddy en la VPS. No se usaron cuentas válidas ni se modificaron datos persistentes.

| Origen y petición                                                                                                                                                      | Resultado observado                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mac, seis peticiones al mismo email ficticio, cada una con un `X-Forwarded-For` distinto                                                                               | `401` en los intentos 1–4 y `429` en 5–6. La primera tanda reutilizó un bucket que ya tenía intentos; no se usó para concluir sobre el umbral. |
| Mac, repetición con un email ficticio nuevo y seis `X-Forwarded-For` distintos                                                                                         | `401` en intentos 1–5 y `429` en el 6. Cambiar la cabecera desde el cliente no evitó el límite.                                                |
| VPS, una petición con el mismo email nuevo, enviada a `https://nextriva.es` mediante Caddy local (`--resolve nextriva.es:443:127.0.0.1`) y con otra IP XFF falsificada | `401`; el contador no estaba bloqueado como el del Mac.                                                                                        |

La diferencia de resultado entre el origen Mac y el origen VPS es evidencia de comportamiento de que el límite distingue ambos orígenes a través de la ruta HTTPS/Caddy activa. El resultado del Mac también confirma que variar el XFF del cliente no permite eludir el límite. No se imprimió ninguna dirección ni valor de entorno. La comparación de configuración frente a Docker se detalla a continuación; la dirección exacta de peer observada por NestJS durante una petición no se capturó directamente.

Después, con autorización separada de solo lectura, se comparó en la VPS `AUTH_TRUSTED_PROXY_IP` con las puertas de enlace de la red Docker conectada al contenedor API. El comando devolvió únicamente `trusted_proxy_matches_docker_gateway=true` (código de salida 0); no imprimió direcciones ni otros valores de entorno. Esto verifica la configuración frente a la puerta de enlace Docker, pero no captura directamente la dirección del socket TCP que NestJS ve durante una petición.

## Proton Drive: compatibilidad de rotación

Con autorización limitada a consultar versión y ayuda, el 28/10/2026 se observó Proton Drive CLI `0.9.0` y SDK `0.22.2`; la CLI indicó que era la versión más reciente. La ayuda de `filesystem upload` admite conflicto `rename` y `create-new-revision`; `filesystem trash <ruta>` mueve rutas concretas a la papelera y `filesystem delete <ruta>` elimina permanentemente únicamente elementos ya enviados a la papelera. No se vació la papelera, no se listó la cuenta, no se inició sesión y no se subieron ni eliminaron archivos.

La retención aprobada es 3 copias diarias y 2 semanales. La automatización debe mantener nombres propios con patrón acotado, comprobar la subida y poder identificar únicamente esas rutas para poda; nunca debe usar `filesystem empty-trash`. Proton informa que el plan Free ofrece hasta 5 GB y que los elementos en papelera siguen ocupando almacenamiento, así que el espacio disponible y tamaño real de las copias deberán verificarse antes de activar el timer. Referencias oficiales: [CLI](https://proton.me/support/drive-cli), [planes y almacenamiento](https://proton.me/support/set-up-proton-drive), [papelera](https://proton.me/support/proton-drive-delete-restore-synced-files).

## Limitaciones y siguiente puerta

- La prueba local acredita que el Caddy temporal sobrescribe la cabecera y que el rate limit no se evade variándola desde un mismo origen de red.
- La comprobación HTTPS real valida la separación de contadores y el rechazo efectivo de XFF falsificado. `AUTH_TRUSTED_PROXY_IP` coincide con la puerta de enlace de la red Docker API; la dirección exacta del peer TCP observada por NestJS no se capturó directamente.
- La configuración activa inspeccionada publica API y web en loopback del host en `3100/8180`. El ejemplo `deploy/Caddyfile.example` usa upstreams `3000/8080`; no se debe asumir que ese ejemplo describe la configuración activa.
- La restauración sintética temporal está verificada. Proton Drive fue elegido como destino y el usuario aprobó retener 3 copias diarias y 2 semanales. Siguen pendientes comprobar cuota disponible y ubicación aislada, implementar/probar la rotación selectiva, supervisar espacio y probar recuperación operacional. No se generó ni cargó un dump real de la VPS.
- La excepción temporal aprobada de Multer (`GHSA-q7qp-rjg7-q26m`) sigue vigente hasta el 23/11/2026. No hay rutas multipart habilitadas; no ampliar la excepción ni habilitar subidas mientras aplique.
- La auditoría actual solo contiene la excepción aprobada de Multer; revisar de nuevo antes de publicar porque las dependencias y avisos pueden cambiar.
- Solo se ejecutaron solicitudes de login inválidas con identidad ficticia. Login válido, cookie/sesión, CSRF, roles y flujos de negocio públicos continúan pendientes de las autorizaciones y preparativos de Issue #140.

**Estado I10.3:** prueba sintética de backup/restore y comprobación acotada de login inválido/rate limit por HTTPS superadas. No se declara completado el despliegue de Issue #140; permanecen pendientes las decisiones operativas de backup, la comprobación directa del peer TCP, la auditoría vigente antes de publicar y el flujo público funcional autorizado.
