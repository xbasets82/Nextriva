# Issue #134 — Preparación de producción en VPS OVH

Estado: implementación local para revisión; despliegue pendiente de autorización. Referencia: [Issue #134](https://github.com/xbasets82/Nextriva/issues/134), relacionado con I10.1.

La ampliación aprobada permite seleccionar una `DATABASE_URL` de producción explícita y validada sin debilitar los destinos de desarrollo o las pruebas aisladas. También aprueba `nextriva.es` como origen canónico y la redirección de `www`.

Se preparan imágenes API/web, Compose separado, configuración exclusiva de migraciones y ejemplo de Caddy. El contrato HTTP y el modelo Prisma permanecen iguales. No hay ejecución remota, migraciones en `nextriva_dev`, copia de datos, seed de producción ni automatización de despliegue en GitHub Actions.

El runtime solo acepta en producción `postgres:5432/nextriva_production`, con credenciales y sin parámetros que sustituyan el destino. El servicio PostgreSQL no publica puertos. Las migraciones usan `migrate deploy` manualmente mediante el perfil `maintenance`; el arranque de API no migra automáticamente.

TDD previsto y observado: regresión del selector de destino antes de modificar producción; comprobaciones semánticas de Compose y smoke de las imágenes con PostgreSQL efímero. El red de configuración por archivos todavía ausentes no se presenta como reproducción de vulnerabilidad de negocio. Evidencia en [registro TFM](../tfm/evidencias/2026-10-27-issue-134-vps-production-preparation.md).

Antes de desplegar quedan pendientes el primer administrador de producción, acordar destino/retención de backups y recuperación. No se considera autorizada la modificación del Caddy activo ni de DNS. Véase el [runbook](../development/vps-production-preparation.md).

La revisión de privilegios exige retirar todo acceso del runtime a `public._prisma_migrations`: el servicio de mantenimiento realiza esa revocación después de un `migrate deploy` correcto y falla si no puede aplicarla. No es una migración de esquema. El smoke comprueba denegación de SELECT/INSERT/UPDATE/DELETE y conserva el acceso de negocio. Antes de exponer login queda pendiente validar la identificación de IP y el rate limit detrás del proxy, sin activar confianza indiscriminada en cabeceras.
