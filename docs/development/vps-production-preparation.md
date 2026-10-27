# Preparar Nextriva para el VPS

El Issue [#134](https://github.com/xbasets82/Nextriva/issues/134) prepara imágenes y configuración para el VPS OVH. Los archivos son una propuesta revisable: no acreditan un despliegue. La landing y la aplicación se sirven desde `https://nextriva.es`; `www` redirige al dominio principal. Las llamadas relativas `/api` mantienen un solo origen de sesión y CSRF.

## Verificar localmente

Desde la raíz del repositorio, con Docker en ejecución:

```bash
mise exec -- node --test scripts/test-production-config.test.mjs
docker build -f deploy/Dockerfile.postgres -t nextriva-issue134-postgres:local .
docker build -f deploy/Dockerfile.api -t nextriva-issue134-api:local .
docker build -f deploy/Dockerfile.web -t nextriva-issue134-web:local .
mise exec -- node scripts/smoke-production-images.mjs
```

El smoke crea una red interna con nombre aleatorio, PostgreSQL sintético en memoria y contenedores propios. Aplica las migraciones desde la imagen, verifica Argon2id, login, atributos de cookie HTTPS, consulta autenticada, CSRF, logout y HTML compilado. No publica puertos, usa `.env.local` ni accede a `nextriva_dev`. El transporte interno del smoke es HTTP: no demuestra TLS ni cookies en un navegador HTTPS. Al terminar elimina sus contenedores y red; nunca ejecuta una limpieza global de Docker. Si el proceso recibe SIGKILL o el host falla, revisar exclusivamente los recursos cuyo prefijo `nextriva-smoke-` corresponda a la ejecución interrumpida antes de retirarlos.

## Configuración preparada

| Pieza                 | Decisión                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                   | Node 24.22.0, pnpm 10.34.7, instalación congelada, Prisma 7.10.1; imagen final con dependencias de producción, usuario no root y OpenSSL.                        |
| Web                   | Build Vite y Caddy 2.11.2 en contenedor no root; incluye landing, login y módulos existentes.                                                                    |
| Entrada HTTPS         | Caddy instalado en el host, ejemplo en `deploy/Caddyfile.example`; conserva `/api` al reenviar.                                                                  |
| PostgreSQL            | 18.6-bookworm; solo red Docker interna, sin puerto publicado. Volumen en `/var/lib/postgresql`, ubicación de datos de PostgreSQL 18.                             |
| Destino de producción | URL explícita con credenciales, host `postgres`, puerto `5432`, base `nextriva_production`, sin parámetros ni fragmentos. No admite destinos dev/test o remotos. |
| Migraciones           | Servicio manual `migrate`, perfil `maintenance`, configuración `prisma.production.config.ts`; no carga dotenv ni modifica el esquema por iniciativa propia.      |
| Recursos              | PostgreSQL 1 GiB, API 512 MiB y web 128 MiB; logs limitados. El build necesita memoria adicional y no garantiza capacidad con carga real.                        |

Las imágenes fijan versiones, no digests inmutables. Registrar los digests de la publicación revisada y evaluar parches del sistema antes del despliegue. La clave Geoapify es opcional y pública dentro del bundle: restringirla a `https://nextriva.es`, con cuotas del proveedor. Nunca usar una clave privada de servidor como argumento de build.

## Requisitos antes de desplegar

La ejecución de los comandos siguientes requiere una autorización de despliegue posterior. Preparar primero una copia restaurable cuando exista información, un destino de backup separado del VPS, retención y supervisión de espacio. La copia automática del VPS no sustituye la prueba de restauración PostgreSQL descrita en [backup y restauración](postgres-backup-restore.md).

También falta autorizar y preparar la inicialización del primer administrador de producción: el comando actual `users:bootstrap` rechaza producción y el seed solo funciona en desarrollo. No copiar cuentas seed, usar `123456` ni introducir usuarios mediante SQL manual para evitar esa protección. La inicialización de un volumen vacío crea `nextriva_migrator` como propietario del esquema/base y `nextriva_app` con permisos de datos, sin superusuario ni creación de objetos. El bootstrap `postgres` queda separado. El init no vuelve a aplicarse en volúmenes existentes: no resetees un volumen para cambiar credenciales.

## Runbook propuesto para una publicación autorizada

Antes de exponer el login, queda pendiente revisar la identificación de IP detrás de Caddy: el rate limit actual utiliza `request.socket.remoteAddress`, por lo que las conexiones comparten la IP del proxy y el límite se comparte por cuenta. No habilitar `trust proxy` de forma indiscriminada ni confiar en cabeceras proporcionadas directamente por clientes. La configuración y las pruebas con proxy autorizado necesitan una revisión específica antes de publicar.

El servicio `migrate` ejecuta `prisma migrate deploy` y, solo si termina correctamente, retira todos los permisos de `nextriva_app` sobre `public._prisma_migrations`. Si falla esa restricción, el servicio devuelve error. Usar siempre el servicio completo: ejecutar únicamente el comando Prisma omite este control de privilegios.

Los comandos se muestran para revisión; no se han ejecutado en el VPS. Ejecutarlos desde una copia del repositorio en el commit autorizado, por ejemplo `/opt/nextriva`. No copiar `.env.local`, dumps ni datos locales al servidor.

1. Crear los archivos fuera del repositorio con permisos restringidos, por ejemplo `/etc/nextriva/production.env`, `/etc/nextriva/migration.env` y tres archivos de contraseña dentro de `/etc/nextriva/secrets`, mediante un editor seguro. No escribir contraseñas en comandos ni historial. Los archivos de entorno deben tener modo 0600: el primero contiene `DATABASE_URL` con usuario `nextriva_app`; el segundo, la misma URL con usuario `nextriva_migrator`, ambos apuntando a `postgres:5432/nextriva_production`. Codificar contraseñas como componentes URL. Los archivos `postgres-password`, `runtime-password` y `migration-password` contienen contraseñas distintas; las dos últimas coinciden con las respectivas URL. Para los mounts de Compose, los archivos secret deben ser legibles por UID 999 dentro del contenedor (por ejemplo modo 0444), conservando el directorio del host con modo 0700. No imprimirlos en logs ni permitir acceso al directorio a usuarios ajenos.
2. Definir únicamente rutas y referencia de versión en la terminal:

   ```bash
   export NEXTRIVA_RELEASE="$(git rev-parse HEAD)"
   export NEXTRIVA_PRODUCTION_ENV=/etc/nextriva/production.env
   export NEXTRIVA_MIGRATION_ENV=/etc/nextriva/migration.env
   export NEXTRIVA_POSTGRES_PASSWORD_FILE=/etc/nextriva/secrets/postgres-password
   export NEXTRIVA_RUNTIME_PASSWORD_FILE=/etc/nextriva/secrets/runtime-password
   export NEXTRIVA_MIGRATION_PASSWORD_FILE=/etc/nextriva/secrets/migration-password
   docker compose -f compose.production.yaml --profile maintenance config --quiet
   docker compose -f compose.production.yaml build postgres api web
   ```

   No utilizar `docker compose config` sin `--quiet` con credenciales reales: puede mostrar el entorno resuelto. `VITE_GEOAPIFY_API_KEY` puede proporcionarse al build de manera local si se habilita ese servicio.

3. Solo tras aprobar destino, credenciales, backup y administrador:

   ```bash
   docker compose -f compose.production.yaml up -d postgres
   docker compose -f compose.production.yaml --profile maintenance run --rm migrate
   docker compose -f compose.production.yaml up -d api web
   docker compose -f compose.production.yaml ps
   curl --fail http://127.0.0.1:3000/api/health
   curl --fail --head http://127.0.0.1:8080/
   ```

   Revisar `deploy/Caddyfile.example` y la configuración activa antes de sustituirla. Conservar copia de la configuración existente. Validar el archivo candidato con `caddy validate --config /ruta/al/Caddyfile-candidato` y aplicar la recarga únicamente tras autorizarla. Los certificados y el estado de Caddy permanecen en el host.

4. Con HTTPS conectado a Nextriva, verificar landing, `/#/login`, login, navegación por rol, cookie `__Host-nextriva_session` con Secure/HttpOnly/SameSite, CSRF rechazado sin token, logout, redirección www y ausencia de un puerto público PostgreSQL. Realizar el smoke Playwright HTTPS con cuentas autorizadas y sin capturar tokens/contraseñas en evidencias.

## Parada y recuperación

`docker compose -f compose.production.yaml stop api web` detiene la aplicación sin retirar PostgreSQL. No usar `down -v`, `docker volume prune`, resets o `migrate dev` en producción. Cambiar la etiqueta de una imagen no revierte el esquema: revisar compatibilidad de la aplicación anterior con todas las migraciones antes de volver a arrancarla. Mantener el volumen y restaurar solo en una instancia temporal aislada con aprobación explícita.

Si el smoke falla, el error redactado identifica el paso Docker y conserva la causa como limitación de verificación; no consultar ni publicar variables de conexión reales para depurarlo.
