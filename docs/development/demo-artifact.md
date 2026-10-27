# Preparar y verificar la demo local

I10.2 prepara un artefacto reproducible sin desplegar. La demo utiliza exclusivamente una base separada `nextriva_demo`. No reutiliza `nextriva_dev` ni `nextriva_production` y no publica credenciales administrativas.

## Verificación automática del artefacto

Desde la raíz del repositorio, con las versiones de mise y Docker disponibles:

```bash
mise exec -- pnpm --filter @nextriva/api test:e2e:production
```

El comando construye las imágenes con los Dockerfiles y versiones fijadas, aplica las migraciones en PostgreSQL temporal dentro de una red privada y genera credenciales aleatorias exclusivas de la sesión. Ejecuta el seed explícito y Playwright sobre el build Vite y la API en un único origen HTTPS de loopback. El colaborador crea y comenta; el gestor asigna; el colaborador inicia y presenta la solución; una segunda sesión de gestor la aprueba. Finalmente comprueba la persistencia y elimina sus contenedores, volúmenes anónimos, redes, imágenes etiquetadas y archivos temporales.

El certificado local dura un día y Chromium admite exclusivamente su clave pública mediante pin SPKI. `ignoreHTTPSErrors` permanece en `false`; no se modifica el almacén de confianza del sistema. Esto comprueba HTTPS/cookies/CSRF del navegador local y no acredita certificados públicos, DNS ni despliegue en el VPS. Las trazas, vídeos y capturas de este login están desactivados para evitar conservar credenciales efímeras.

El runner rechaza conexiones heredadas y CI. PostgreSQL no publica puertos; únicamente Caddy publica un puerto aleatorio en `127.0.0.1`. No usa Vite dev server, `.env.local` ni servicios externos. El E2E habitual conserva su comando y configuración:

```bash
mise exec -- pnpm --filter @nextriva/api test:e2e
```

## Configuración del artefacto DEMO

`compose.demo.yaml` es un proyecto separado (`nextriva-demo`) con volumen propio, runtime sin privilegios de migración y perfiles manuales `maintenance` y `demo-seed`. Su preparación no autoriza ejecutarlo en un servidor ni contra una base existente.

| Variable                           | Uso                                                           |
| ---------------------------------- | ------------------------------------------------------------- |
| `NEXTRIVA_RELEASE`                 | SHA revisado para etiquetar las imágenes                      |
| `NEXTRIVA_DEMO_ORIGIN`             | Origen HTTPS exacto, sin barra final                          |
| `NEXTRIVA_DEMO_PROXY_IP`           | IP exacta del salto de proxy que ve la conexión TCP de la API |
| `NEXTRIVA_DEMO_ENV`                | Ruta absoluta del archivo privado del runtime                 |
| `NEXTRIVA_DEMO_MIGRATION_ENV`      | Ruta absoluta del archivo privado del migrador                |
| `NEXTRIVA_DEMO_SEED_ENV`           | Ruta absoluta del archivo privado de inicialización           |
| `NEXTRIVA_POSTGRES_PASSWORD_FILE`  | Archivo externo de contraseña administrativa de PostgreSQL    |
| `NEXTRIVA_RUNTIME_PASSWORD_FILE`   | Archivo externo de contraseña de `nextriva_app`               |
| `NEXTRIVA_MIGRATION_PASSWORD_FILE` | Archivo externo de contraseña de `nextriva_migrator`          |

Los archivos externos deben estar fuera del repositorio y del contexto Docker, con permisos locales restrictivos. Runtime y migrador requieren `NODE_ENV=production`, `AUTH_DATABASE_MODE=demo` y una `DATABASE_URL` con su usuario correspondiente hacia `postgres:5432/nextriva_demo`, sin query parameters. El comando no lee dotenv ni deriva un destino alternativo. No se permiten bases de desarrollo, producción, pruebas o hosts arbitrarios.

Los puertos locales preparados son API `127.0.0.1:3100` y web `127.0.0.1:8180`. Un proxy HTTPS propio debe conservar `/api` y `/api/*` hacia la API y enviar el resto a la web. `deploy/Caddyfile.example` muestra el patrón público; sus puertos deben revisarse para este proyecto separado antes de cualquier uso autorizado. `deploy/Caddyfile.demo-test` se utiliza exclusivamente en la red efímera del test.

La aplicación no habilita CORS: web y API usan el mismo origen. No se usa `trust proxy=true`. Los límites de autenticación solo consideran un `X-Forwarded-For` de una única IP válida si la conexión viene de `AUTH_TRUSTED_PROXY_IP`; el proxy debe sobrescribir esa cabecera. Si no hay confianza explícita o la cabecera es ambigua, se utiliza el peer TCP. No adivinar la IP del proxy: con contenedores puede ser distinta de `127.0.0.1`.

## Seed explícito y credenciales privadas

El comando de inicialización, una vez construido el paquete API, es:

```bash
mise exec -- pnpm db:seed:demo
```

Está destinado a ejecutarse en el entorno de mantenimiento configurado, donde `postgres` identifica exclusivamente al contenedor privado de demo; no desde el entorno de desarrollo habitual. En Compose, la operación equivalente preparada es `docker compose -f compose.demo.yaml --profile demo-seed run --rm seed`. No se ejecuta al arrancar ni durante las migraciones.

Exige `NEXTRIVA_DEMO_CONFIRM=INITIALIZE EMPTY DEMO`, sin `CI`, variables de conexión test ni bootstrap. El archivo privado de seed requiere las seis variables `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_MANAGER_EMAIL`, `DEMO_MANAGER_PASSWORD`, `DEMO_COLLABORATOR_EMAIL`, `DEMO_COLLABORATOR_PASSWORD`. Los emails deben ser distintos y terminar en `@demo.nextriva.invalid`; cada contraseña debe ser distinta y tener entre 16 y 128 caracteres. Se almacenan mediante el Argon2id existente. Generarlas externamente, no introducirlas en argumentos de shell ni pegarlas en informes. El acceso ADMIN se conserva exclusivamente por el operador; las cuentas de menor privilegio se entregan por un canal privado y autorizado.

Antes de inicializar debe haberse revisado el destino y aplicado sus migraciones. El operador marca únicamente la base local vacía prevista con este SQL constante, desde una conexión administrativa ya validada:

```sql
COMMENT ON DATABASE nextriva_demo IS 'nextriva:demo:ready:v1';
```

El seed bloquea las ocho tablas de negocio, verifica el marcador y comprueba que todas estén vacías. Crea tres usuarios (uno por rol), una promoción activa con fase Construcción, los participantes gestor y colaborador, y una incidencia Abierta con su actividad `CREATED`. Son datos ficticios; el administrador no se vincula como participante público.

Dentro de la misma transacción el marcador pasa a `nextriva:demo:initialized:v1`. Si falla una escritura o la actividad, se revierten datos y marcador. Una repetición o segundo inicializador concurrente aborta sin sobrescribir ni duplicar datos. No existe limpieza, reset ni restauración automática de demo. El resumen solo muestra cantidades y nunca credenciales, hashes o URLs de conexión.

## Interrupciones y revisión manual

Ctrl+C y SIGTERM finalizan el grupo de procesos Playwright y realizan la limpieza de los recursos propios. SIGKILL, caída del equipo o del daemon Docker impiden garantizar que se ejecute `finally`. Para recuperar esa situación, revisar la etiqueta `nextriva.demo-test.session` y eliminar únicamente los recursos de la sesión identificada; no usar `docker system prune`, limpiezas globales ni nombres de otras sesiones. Los datos temporales de PostgreSQL están en tmpfs.

La validación humana de la demo pública, su configuración TLS y accesibilidad con VoiceOver/Safari/Firefox permanece pendiente; este incremento no declara que se haya desplegado ni probado manualmente en esos entornos.
