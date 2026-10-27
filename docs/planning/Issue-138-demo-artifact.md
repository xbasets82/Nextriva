# I10.2 — Artefacto y datos de demo

Referencia: [Issue #138](https://github.com/xbasets82/Nextriva/issues/138), aprobado por el usuario; base I10.1 integrada mediante PR #137 (`942a772`). Rama `codex/i10-2-demo-artifact`. Sin despliegue ni publicación.

Se prepara un proyecto Compose separado y un modo explícito `demo` que únicamente acepta `postgres:5432/nextriva_demo`. La inicialización exige una base migrada, marcada y vacía, credenciales externas y confirmación explícita. No reutiliza el seed de desarrollo ni su contraseña. Conserva las ocho entidades y todas las migraciones existentes.

El comentario administrativo inicial `nextriva:demo:ready:v1` identifica el destino autorizado. Dentro de la transacción, el seed bloquea y verifica las ocho tablas de negocio, escribe los datos ficticios y consume el marcador convirtiéndolo en `nextriva:demo:initialized:v1`. Esta interpretación conserva una marca previa verificable y hace atómica su transición con los datos, sin inventar una entidad funcional. Los metadatos de Prisma no cuentan como datos de negocio; el usuario de runtime no puede leerlos ni escribirlos.

El artefacto se verifica localmente con imágenes reales, proxy Caddy y Playwright sobre HTTPS. El certificado efímero se limita por pin SPKI del navegador de pruebas; no modifica la confianza del sistema ni acredita TLS público. La API no habilita CORS y la confianza en IP reenviada se limita a un único peer explícito. El proxy sobrescribe la cabecera y tanto `/api` como `/api/*` quedan fuera del fallback SPA.

La prueba de seed usa una base hija aleatoria creada y retirada por el runner PostgreSQL temporal existente; invoca la operación transaccional directamente. El comando público mantiene la allowlist exacta de DEMO y rechaza CI y conexiones test. El runner adicional del artefacto usa su propio PostgreSQL tmpfs, redes y credenciales aleatorias; no escribe en una demo persistente.

Runbook: [demo-artifact.md](../development/demo-artifact.md). Evidencia: [registro de I10.2](../tfm/evidencias/2026-10-27-i10-2-demo-artifact.md). La migración/despliegue remotos, acceso al VPS y publicación requieren autorización posterior.
