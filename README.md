# Nextriva

**Plataforma web para coordinar promociones inmobiliarias y gestionar sus incidencias desde su creación hasta su resolución y validación.**

Nextriva es un proyecto desarrollado como Trabajo Final de Máster (TFM) en Inteligencia Artificial.

Nextriva centraliza la información de las promociones, sus participantes y las incidencias para que los equipos autorizados puedan colaborar y mantener trazabilidad durante el ciclo de vida de la obra.

El proyecto también pretende evaluar la utilización de herramientas de inteligencia artificial como apoyo al proceso de desarrollo de software, desde el análisis y el diseño hasta la implementación, las pruebas y la documentación.

> **Estado del proyecto:** En desarrollo. `main` incluye autenticación, gestión de usuarios y promociones, y el ciclo de incidencias descrito en §6. La evaluación del alojamiento forma parte de I10.1; la aplicación todavía no está desplegada públicamente.

---

## 1. Descripción general

### 1.1. Contexto

El desarrollo de una promoción inmobiliaria implica la participación de distintos profesionales y organizaciones:

- Promotoras inmobiliarias.
- Arquitectos e ingenieros.
- Responsables y jefes de obra.
- Equipos comerciales.
- Constructoras, industriales y proveedores.

Durante las fases del proyecto aparecen incidencias y decisiones que deben comunicarse, asignarse, resolverse y documentarse.

Habitualmente, esta información se encuentra distribuida entre correos electrónicos, documentos, hojas de cálculo y distintas herramientas, dificultando su seguimiento y trazabilidad.

### 1.2. Objetivos

Nextriva ofrece una plataforma para:

- Gestionar promociones inmobiliarias.
- Registrar y consultar incidencias.
- Asignar responsables y realizar el seguimiento de su resolución.
- Coordinar a los diferentes participantes.
- Mantener un historial de actuaciones y decisiones.
- Facilitar la colaboración mediante comentarios y validación de soluciones.
- Controlar el acceso a la información mediante roles y permisos.
- Garantizar la trazabilidad de los cambios durante todo el ciclo de vida de una promoción.

### 1.3. Ciclo de vida de una promoción

Nextriva contempla las siguientes fases:

1. **Planificación:** definición inicial y elaboración de planos básicos.
2. **Comercialización:** inicio de ventas hasta alcanzar un porcentaje mínimo.
3. **Proyecto ejecutivo:** elaboración de planos definitivos.
4. **Construcción:** ejecución y seguimiento de las obras.
5. **Preentrega:** revisión y resolución de incidencias previas a la entrega.
6. **Entrega:** entrega de las viviendas a sus compradores.
7. **Posventa:** seguimiento y resolución de incidencias posteriores.

Las fases pueden solaparse, especialmente la comercialización y la construcción.

El sistema debe permitir registrar incidencias y cambios desde las primeras fases, incluyendo modificaciones de diseño y planificación.

### 1.4. Inteligencia artificial en el proyecto

El objetivo principal del TFM no es necesariamente incorporar funcionalidades de inteligencia artificial dentro de la aplicación, sino utilizar herramientas de IA durante su desarrollo.

La inteligencia artificial se utiliza como apoyo en:

- Análisis de requisitos.
- Diseño funcional y técnico.
- Definición de arquitectura.
- Generación y revisión de código.
- Elaboración de pruebas automatizadas.
- Detección y resolución de errores.
- Documentación técnica.
- Revisión de calidad y seguridad.

Las decisiones arquitectónicas, la validación de resultados y la aprobación de cambios permanecen bajo supervisión humana.

---

## 2. Stack tecnológico

Nextriva utiliza una arquitectura web basada en TypeScript y organizada mediante un monorepositorio.

| Componente           | Tecnología        | Finalidad                            |
| -------------------- | ----------------- | ------------------------------------ |
| Backend              | Node.js 24.22.0   | Entorno de ejecución                 |
| Framework backend    | NestJS 12.0.3     | Desarrollo de la API                 |
| Lenguaje             | TypeScript        | Tipado estático                      |
| Frontend             | React 19.3.0      | Interfaz de usuario                  |
| Herramienta frontend | Vite 8.3.3        | Desarrollo y compilación             |
| Base de datos        | PostgreSQL 18.6   | Persistencia de datos                |
| ORM                  | Prisma 7.10.1     | Acceso y modelado de datos           |
| Gestor de paquetes   | pnpm 10.34.7      | Dependencias y workspaces            |
| Gestión de versiones | mise              | Control de versiones de herramientas |
| Contenedores         | Docker Compose    | Entorno PostgreSQL                   |
| Pruebas unitarias    | Vitest 5.0.5      | Validación de API y web              |
| Pruebas E2E          | Playwright 1.64.0 | Pruebas con navegador                |
| Documentación API    | OpenAPI           | Especificación de endpoints          |
| Control de versiones | Git y GitHub      | Gestión del código                   |
| Integración continua | GitHub Actions    | Validación automatizada              |
| Dependencias         | Dependabot        | Seguimiento de actualizaciones       |
| Calidad              | ESLint y Prettier | Análisis estático y formato          |
| Hooks Git            | Husky             | Validaciones locales                 |

### 2.1. Arquitectura general

La aplicación sigue una arquitectura cliente-servidor:

```text
                   USUARIO
                      |
                      v
              +---------------+
              |   FRONTEND    |
              | React + Vite  |
              +---------------+
                      |
                   HTTP/API
                      |
                      v
              +---------------+
              |    BACKEND    |
              | NestJS + TS   |
              +---------------+
                      |
                    Prisma
                      |
                      v
              +---------------+
              |  PostgreSQL   |
              +---------------+
```

La separación entre frontend, backend y persistencia facilita:

- El mantenimiento del código.
- La evolución independiente de los componentes.
- La implementación de pruebas automatizadas.
- La reutilización de funcionalidades.
- La incorporación de nuevas capacidades.

---

## 3. Requisitos previos

Para ejecutar Nextriva en un entorno local es necesario disponer de:

- Git.
- Node.js 24.
- pnpm 10.
- Docker.
- Docker Compose.
- Un navegador web moderno.

Se recomienda utilizar `mise` para gestionar las versiones de Node.js y pnpm definidas por el proyecto.

---

## 4. Instalación y configuración

### 4.1. Clonar el repositorio

```bash
git clone https://github.com/xbasets82/Nextriva.git
cd Nextriva
```

> El repositorio es privado. Es necesario disponer de permisos de acceso.

### 4.2. Configurar las herramientas

Con `mise` instalado:

```bash
mise install
```

Las versiones fijadas actualmente por el proyecto son:

```text
Node.js: 24.22.0
pnpm: 10.34.7
```

### 4.3. Instalar dependencias

```bash
mise exec -- pnpm install --frozen-lockfile
```

Este comando instala las dependencias utilizando las versiones fijadas en `pnpm-lock.yaml`.

### 4.4. Configurar las variables de entorno

Crear el archivo local de desarrollo a partir de la plantilla, sin sobrescribir uno existente:

```bash
test -f .env.local || cp .env.example .env.local
```

Completa `NEXTRIVA_DEV_USER`, `NEXTRIVA_DEV_PASSWORD` y `DATABASE_URL` con credenciales sintéticas locales. La URL debe apuntar a `127.0.0.1:5432/nextriva_dev` y utilizar el mismo usuario y contraseña configurados para el contenedor. Son credenciales de PostgreSQL, no cuentas de la aplicación.

`.env.local` está excluido de Git y no debe publicarse. La configuración de pruebas es independiente: usa `.env.test.local` con una única variable `TEST_DATABASE_URL`, como explica la [guía PostgreSQL local](docs/development/postgres.md). Nunca cargues `.env.local` para ejecutar pruebas de integración o E2E.

### 4.5. Iniciar PostgreSQL

Nextriva utiliza Docker Compose para gestionar entornos independientes:

- `postgres-dev`: base de datos de desarrollo.
- `postgres-test`: base auxiliar de pruebas, definida solo en `compose.test.yaml` y usada por el runner de integración.

Para iniciar únicamente la base de desarrollo:

```bash
docker compose --env-file .env.local up -d --wait postgres-dev
```

El runner de pruebas inicia `postgres-test` por separado, crea una base temporal por ejecución y no carga `.env.local`. Valida `TEST_DATABASE_URL` antes de conectarse y rechaza cualquier `DATABASE_URL` heredada. Para configurarlo de forma persistente y segura, sigue la [guía PostgreSQL local](docs/development/postgres.md).

La copia manual local y la prueba de restauración sintética aislada están explicadas en la [guía PostgreSQL de backup y restore](docs/development/postgres-backup-restore.md). La prueba no accede a `nextriva_dev`.

Ejecuta las pruebas con las variables de base de datos retiradas del entorno heredado:

```bash
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration
```

El runner lee exclusivamente `.env.test.local` cuando no se proporciona `TEST_DATABASE_URL` en el entorno; crea una base PostgreSQL temporal y elimina solo esa base al terminar. No utiliza `nextriva_dev`.

Para comprobar el estado de desarrollo:

```bash
docker compose --env-file .env.local ps postgres-dev
```

### 4.6. Generar el cliente Prisma

```bash
mise exec -- pnpm --filter @nextriva/api db:generate
```

Este comando genera el cliente Prisma a partir del esquema de datos.

### 4.6.1. Aplicar las migraciones locales

Con `postgres-dev` activo y `.env.local` configurado, aplica únicamente las migraciones versionadas del proyecto:

```bash
mise exec -- pnpm --filter @nextriva/api exec prisma migrate deploy --config prisma.config.ts
```

Este comando no elimina datos ni sustituye las migraciones por `db push`. No lo ejecutes contra una base distinta de `nextriva_dev`.

### 4.7. Aprovisionar el primer administrador local

El comando interno `users:bootstrap` crea un administrador únicamente en la base local `nextriva_dev`; no crea usuarios al arrancar la aplicación ni ofrece un endpoint público. Comprueba que `.env.local` contiene una `DATABASE_URL` local válida. No debe ejecutarse con una base compartida, remota o de producción.

La entrada es un único objeto JSON por stdin con estos campos exactos: `firstName`, `lastName`, `email` y `password`. El rol se asigna en servidor a `ADMIN`; los campos adicionales se rechazan. El comando no admite argumentos ni stdin interactivo. Prepara el JSON en un archivo local con permisos restrictivos, fuera del repositorio y de carpetas sincronizadas, y pásalo por stdin:

```bash
umask 077
# Crea fuera del repositorio un JSON privado con firstName, lastName, email y password.
mise exec -- pnpm --filter @nextriva/api users:bootstrap < /ruta/local-protegida/primer-administrador.json
```

La contraseña se procesa con Argon2id y no se devuelve ni registra. El aprovisionamiento es idempotente: si ya existe cualquier administrador, incluso inactivo, no modifica usuarios. Elimina el archivo de entrada al terminar y nunca lo añadas a Git.

### 4.7.1. Datos ficticios para desarrollo local

Con las migraciones ya aplicadas en `nextriva_dev`, el seed de los [Issues #71](https://github.com/xbasets82/Nextriva/issues/71) y [#85](https://github.com/xbasets82/Nextriva/issues/85) crea datos ficticios para recorrer los flujos implementados hasta I09. Usa únicamente `DATABASE_URL` del entorno o del archivo ignorado `.env.local`; en este último caso exige que el archivo pertenezca al usuario actual y tenga permisos `0600`. Valida `127.0.0.1`/`localhost`, puerto `5432`, nombre `nextriva_dev` y el nombre de la base conectada antes de escribir. No carga la configuración Prisma de desarrollo ni ejecuta migraciones.

```bash
chmod 600 .env.local
mise exec -- pnpm db:seed:dev
NEXTRIVA_SEED_INCIDENT_COUNT=24 mise exec -- pnpm db:seed:dev
NEXTRIVA_SEED_PROFILE=medium mise exec -- pnpm db:seed:dev
NEXTRIVA_SEED_PROFILE=large mise exec -- pnpm db:seed:dev
```

El perfil predeterminado `small` conserva 12 usuarios, 5 promociones y 60 incidencias. `medium` crea 20 usuarios, 10 promociones y 150 incidencias; `large` crea 30 usuarios, 15 promociones, 300 incidencias y entre 600 y 900 comentarios. El perfil `small` permite configurar de 0 a 500 incidencias mediante `NEXTRIVA_SEED_INCIDENT_COUNT`; no combines esa variable con `medium` o `large`. Repetir el mismo perfil conserva identificadores, fechas, versiones y hashes existentes. Pasar de `small` predeterminado a `medium` y luego a `large` solo añade registros. Reducir el perfil o cambiar desde un `small` personalizado con más de 60 incidencias puede requerir la limpieza confirmada para evitar reasignar registros. Nunca se limpia automáticamente.

Las promociones seed se reconocen por el prefijo `[SEED]`, las cuentas por `@seed.nextriva.invalid` y los registros seed tienen identificadores deterministas. Los perfiles ampliados incluyen promociones vacías, incidencia sin asignación, borradores, presentaciones, rechazos y cierres; los primeros 60 registros del seed original conservan su identidad y contenido. Si un identificador reservado coincide con un registro ajeno, el comando aborta sin cambios.

Todas las cuentas ficticias tienen la contraseña **`123456`**, almacenada con Argon2id. Son credenciales exclusivas de `nextriva_dev`, **no aptas para producción**. Las cuentas inactivas sirven para comprobar restricciones y no pueden iniciar sesión.

| Rol          | Cuentas ficticias                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN        | `ana.admin@seed.nextriva.invalid`, `pablo.admin@seed.nextriva.invalid`; inactiva: `marta.admin@seed.nextriva.invalid`                                                                                                                                               |
| MANAGER      | `lucia.gestor@seed.nextriva.invalid`, `diego.gestor@seed.nextriva.invalid`; inactiva: `irene.gestor@seed.nextriva.invalid`                                                                                                                                          |
| COLLABORATOR | `nora.colaborador@seed.nextriva.invalid`, `hugo.colaborador@seed.nextriva.invalid`, `eva.colaborador@seed.nextriva.invalid`, `leo.colaborador@seed.nextriva.invalid`, `clara.colaborador@seed.nextriva.invalid`; inactiva: `raul.colaborador@seed.nextriva.invalid` |

La limpieza es una operación separada e interactiva:

```bash
mise exec -- pnpm db:seed:dev:clean
```

Escribe exactamente `BORRAR SOLO DATOS SEED` cuando se solicite. El comando no acepta confirmación por redirección o proceso sin terminal. Borra solo filas identificadas como propias del seed y aborta de forma atómica si hay sesiones, comentarios, incidencias u otras referencias ajenas vinculadas a esos datos. Esto puede suceder después de usar una cuenta seed en el navegador: la limpieza requiere resolver esas referencias por separado y no las elimina automáticamente. El resumen final contiene únicamente cantidades, sin contraseñas ni URL de conexión. Ni el seed ni su limpieza se ejecutan en CI, pruebas o migraciones.

### 4.8. Ejecutar la aplicación

El monorepositorio contiene dos aplicaciones independientes:

- `@nextriva/api`: backend.
- `@nextriva/web`: frontend.

#### Autocompletado de ubicaciones (opcional)

El formulario de promociones permite escribir ubicaciones manualmente sin configurar un proveedor. Para activar las sugerencias con Geoapify, crea una clave de navegador en Geoapify MyProjects, limita la clave a la API Address Autocomplete y configura **Allowed origins** con el origen exacto de cada entorno. La clave es pública y queda visible en el bundle del navegador; no es un secreto. Como la aplicación usa `Referrer-Policy: no-referrer`, no dependas de una restricción basada únicamente en HTTP referrer. CORS tampoco sustituye la restricción de la clave.

Para desarrollo local, copia `apps/web/.env.example` a `apps/web/.env.local` y añade la clave restringida:

```dotenv
VITE_GEOAPIFY_API_KEY=<clave_publica_restringida>
```

`apps/web/.env.local` está ignorado por Git. Para producción, configura la misma variable en el entorno de compilación con una clave distinta, restringida a los orígenes de producción; nunca la incluyas en el repositorio. Sin clave o ante un fallo de Geoapify, la entrada manual sigue disponible. El texto escrito se consulta directamente con Geoapify y la interfaz muestra la atribución requerida. Revisa las cuotas, términos y atribuciones actuales del proveedor antes de desplegar: [planes](https://www.geoapify.com/pricing/), [claves](https://myprojects.geoapify.com/help/api-keys/), [privacidad](https://www.geoapify.com/privacy-policy/) y [términos](https://www.geoapify.com/terms-and-conditions/).

Con una base local sintética ya provisionada con las migraciones vigentes y un administrador creado mediante §4.7, compila desde la raíz:

```bash
mise exec -- pnpm build
```

Arranca la API en una terminal:

```bash
NODE_ENV=development PORT=4317 AUTH_ORIGIN=http://127.0.0.1:5173 AUTH_LOCAL_HTTP=true mise exec -- node --env-file=.env.local apps/api/dist/src/main.js
```

En otra terminal, arranca la interfaz con el mismo origen permitido:

```bash
API_PROXY_TARGET=http://127.0.0.1:4317 mise exec -- pnpm --filter @nextriva/web dev --host 127.0.0.1 --port 5173 --strictPort
```

Abre `http://127.0.0.1:5173/` e inicia sesión mediante el formulario. Tras el login sin destino previo, todos los roles llegan a Inicio (`#/home`); una sesión válida que abre la raíz también se dirige allí. El logotipo vuelve a Inicio. Esta Home personal es la excepción acotada aprobada en el [Issue #115](https://github.com/xbasets82/Nextriva/issues/115), previa a I10: permite alternar el gráfico entre incidencias asignadas al usuario y todas las visibles según sus permisos. El listado prioritario y «Ver todas mis incidencias» permanecen siempre personales. Si se solicita una ruta interna conocida antes del login, se recupera después solo cuando el rol puede acceder al módulo. La recarga conserva la ruta actual. ADMIN puede navegar a Usuarios; los tres roles mantienen Inicio, Promociones e Incidencias en el menú. «Ver todas mis incidencias» abre el listado con el responsable actual filtrado y conserva ese filtro al volver del detalle. «Cerrar sesión» revoca la sesión y devuelve al login. No necesitas peticiones POST manuales. `AUTH_LOCAL_HTTP=true` es una excepción exclusiva de desarrollo local: HTTPS conserva la cookie segura configurada por el backend.

Estos comandos no aprovisionan ni migran bases de datos. El recorrido verificable y las pruebas aisladas están en [el suplemento de I03.3](docs/architecture/i03-3-web-login.md).

---

## 5. Estructura del proyecto

La organización general del repositorio es:

```text
Nextriva/
|
+-- apps/
|   +-- api/
|   |   +-- e2e/                 # Flujos de navegador con Playwright
|   |   +-- prisma/              # Esquema y migraciones versionadas
|   |   +-- src/
|   |       +-- auth/
|   |       +-- users/
|   |       +-- promotions/
|   |       +-- incidents/
|   |       +-- database/
|   |       +-- dev-seed/
|   |   +-- package.json
|   |
|   +-- web/
|       +-- public/              # Marca y recursos estáticos
|       +-- src/
|           +-- auth/
|           +-- users/
|           +-- promotions/
|           +-- incidents/
|           +-- public/          # Landing page
|       +-- package.json
|
+-- docs/
|   +-- architecture/
|   +-- development/
|   +-- planning/
|   +-- references/
|   +-- tfm/evidencias/
|
+-- scripts/                     # Runner seguro y utilidades CI
+-- .github/                     # CI, Dependabot y baseline de auditoría
+-- compose.yaml                 # PostgreSQL local de desarrollo
+-- compose.test.yaml            # PostgreSQL auxiliar de pruebas
+-- mise.toml                    # Versiones fijadas de Node.js y pnpm
+-- AGENTS.md
+-- package.json
+-- pnpm-workspace.yaml
+-- pnpm-lock.yaml
+-- README.md
```

### 5.1. Directorios principales

**`apps/api`**

Contiene el backend desarrollado con NestJS y TypeScript.

Incluye la API HTTP, la configuración de Prisma y las pruebas correspondientes.

**`apps/web`**

Contiene la aplicación frontend desarrollada con React y Vite.

**`docs`**

Agrupa la documentación de planificación, decisiones técnicas y evidencias del desarrollo del TFM.

**`.github`**

Contiene la configuración de integración continua y actualización de dependencias.

**`scripts`**

Incluye herramientas auxiliares, como el evaluador de las excepciones temporales de seguridad.

**`AGENTS.md`**

Define las instrucciones y normas de desarrollo que deben respetar los asistentes de IA utilizados en el proyecto.

---

## 6. Funcionalidades principales

La versión actual incluye una landing page pública y una aplicación privada. El acceso a la aplicación requiere autenticación; las operaciones y los datos visibles dependen del rol global y de las vinculaciones vigentes del usuario.

### 6.1. Aplicación privada

- **Autenticación y usuarios:** inicio y cierre de sesión, gestión de usuarios, roles `ADMIN`, `MANAGER` y `COLLABORATOR`, cambio de contraseña y autorización en servidor.
- **Promociones:** creación, edición, archivo, fases del proyecto y participantes; búsqueda por nombre o ubicación, filtros y paginación. Los formularios pueden sugerir direcciones mediante Geoapify si se configura una clave pública restringida.
- **Incidencias:** creación, listado, detalle, edición de campos permitidos, búsqueda, filtros, ordenación y paginación. La visibilidad respeta permisos, promoción, vinculación, autoría y responsable actual.
- **Resolución de incidencias:** asignación de responsable, comentarios, borradores y envío de soluciones, aprobación independiente o rechazo con motivo, historial de actividades, eliminación lógica y reapertura con motivo.
- **Inicio personal:** resumen de incidencias visibles y asignadas al usuario, con navegación a los listados correspondientes.
- **Seguridad de sesión:** cookie protegida, CSRF en operaciones mutables y autorización por recurso en la API.

### 6.2. Landing pública y límites

El frontend contiene una landing page pública. La aplicación no incluye registro público, recuperación de contraseña por correo, portal de compradores ni subida de documentos adjuntos a incidencias. El despliegue público todavía no está configurado.

---

## 7. Usuario y contraseña de prueba

El seed de desarrollo crea cuentas ficticias para iniciar sesión. Primero ejecútalo en una base local `nextriva_dev` con `mise exec -- pnpm db:seed:dev`; consulta §4.7.1 para perfiles y la lista completa.

| Rol          | Usuario de prueba activo                 | Contraseña |
| ------------ | ---------------------------------------- | ---------- |
| ADMIN        | `ana.admin@seed.nextriva.invalid`        | `123456`   |
| MANAGER      | `lucia.gestor@seed.nextriva.invalid`     | `123456`   |
| COLLABORATOR | `nora.colaborador@seed.nextriva.invalid` | `123456`   |

Estas credenciales ficticias funcionan exclusivamente en desarrollo local después de ejecutar el seed. No las uses en producción ni las apliques a usuarios manuales. Las cuentas inactivas del seed no pueden iniciar sesión. El seed almacena las contraseñas con Argon2id y no imprime contraseñas ni hashes.

No hay registro público ni recuperación de contraseña por correo. El administrador local inicial puede aprovisionarse con el procedimiento seguro de §4.7. La contraseña de la aplicación no es una credencial de PostgreSQL.

---

## 8. Pruebas y calidad del código

Nextriva utiliza diferentes niveles de pruebas para verificar su funcionamiento.

| Tipo              | Herramienta         | Objetivo                              |
| ----------------- | ------------------- | ------------------------------------- |
| Unitarias         | Vitest              | Validar componentes y funciones       |
| Integración       | Vitest y PostgreSQL | Validar componentes y base de datos   |
| End-to-end        | Playwright          | Verificar flujos reales con navegador |
| Cobertura         | Vitest Coverage     | Medir la cobertura del código         |
| Análisis estático | ESLint              | Detectar problemas de calidad         |
| Tipado            | TypeScript          | Comprobar tipos                       |
| Formato           | Prettier            | Mantener un estilo consistente        |

### 8.1. Ejecutar pruebas unitarias

```bash
mise exec -- pnpm test
```

### 8.2. Comprobar tipos

```bash
mise exec -- pnpm typecheck
```

### 8.3. Comprobar formato

```bash
mise exec -- pnpm format:check
```

### 8.4. Ejecutar lint

```bash
mise exec -- pnpm lint
```

### 8.5. Compilar

```bash
mise exec -- pnpm build
```

### 8.6. Comprobar cobertura

```bash
mise exec -- pnpm --filter @nextriva/api test:coverage
mise exec -- pnpm --filter @nextriva/web test:coverage
```

Los umbrales mínimos configurados son:

| Métrica    | Umbral |
| ---------- | -----: |
| Líneas     |   80 % |
| Sentencias |   80 % |
| Funciones  |   80 % |
| Ramas      |   75 % |

### 8.7. Pruebas de integración

```bash
mise exec -- pnpm --filter @nextriva/api test:integration
mise exec -- pnpm --filter @nextriva/api test:backup-restore
```

`test:backup-restore` crea, restaura y compara una base sintética en PostgreSQL temporal; no restaura datos reales ni modifica la base de desarrollo.

### 8.8. Pruebas E2E

```bash
mise exec -- pnpm --filter @nextriva/api test:e2e
```

Este comando ejecuta la suite E2E y limpia su PostgreSQL temporal al terminar. Para abrir Playwright UI con una base temporal que permanece disponible durante toda la sesión:

```bash
mise exec -- pnpm --filter @nextriva/api test:e2e:ui
```

La modalidad UI usa la configuración local validada de `TEST_DATABASE_URL`; no carga `.env.local` ni acepta `DATABASE_URL`. En la barra lateral, expandí un archivo, seleccioná el caso y pulsá **Run** para ejecutar una prueba individual; el buscador filtra por nombre. Seleccioná una prueba fallida para revisar sus acciones, capturas y errores, y volvé a pulsar **Run** para repetirla dentro de la misma sesión. Consultá la [guía oficial de Playwright UI Mode](https://playwright.dev/docs/test-ui-mode) para conocer las vistas de depuración. Cerrá la interfaz con `Ctrl+C` en la terminal: el runner detiene Playwright y elimina solo la base temporal que registró para esa sesión. Si el proceso termina de forma inesperada, una ejecución UI posterior puede recuperar esa base mediante su marcador privado.

La modalidad UI elige automáticamente dos puertos loopback libres para la API y la web cuando no definís `NEXTRIVA_E2E_API_PORT` y `NEXTRIVA_E2E_WEB_PORT`. Así puede convivir con servidores de desarrollo que usan `4317` y `5173`. El comando `test:e2e` conserva sus puertos configurados y ambos modos mantienen `reuseExistingServer: false`; nunca reutilizan un servidor ajeno. La interfaz gráfica requiere un entorno de escritorio local.

---

## 9. Integración continua

El proyecto utiliza GitHub Actions para automatizar las comprobaciones de calidad.

El workflow principal se encuentra en:

```text
.github/workflows/ci.yml
```

Se ejecuta automáticamente cuando:

- Se crea o actualiza un Pull Request.
- Se publican cambios en la rama `main`.

El workflow divide en paralelo las comprobaciones independientes:

| Job              | Comprobaciones                                                                |
| ---------------- | ----------------------------------------------------------------------------- |
| `static-quality` | Formato, ESLint, tipos, OpenAPI/tipos generados y build                       |
| `unit-coverage`  | Unitarias y umbrales de cobertura                                             |
| `integration`    | PostgreSQL temporal, integración HTTP, migraciones y backup/restore sintético |
| `e2e`            | Flujos Playwright con API y PostgreSQL temporales                             |
| `audit`          | Auditoría de dependencias y evaluación estricta del baseline                  |

Las modificaciones se desarrollan en ramas independientes y se integran mediante Pull Requests.

---

## 10. Seguridad

Nextriva incorpora diferentes medidas de seguridad durante su desarrollo:

- Dependencias fijadas mediante lockfile.
- Auditoría automatizada de dependencias.
- Seguimiento de actualizaciones mediante Dependabot.
- Variables de entorno excluidas de Git.
- Permisos limitados en GitHub Actions.
- Control de cambios mediante Pull Requests.
- Registro y seguimiento de vulnerabilidades conocidas.

### 10.1. Vulnerabilidades conocidas

El baseline versionado en [`.github/audit-baseline.json`](.github/audit-baseline.json) es la fuente de verdad para las excepciones temporales aprobadas. A 27 de octubre de 2026 contiene una única excepción para `GHSA-q7qp-rjg7-q26m` (`multer@2.4.0`), con vencimiento el 23 de noviembre de 2026, asociada al seguimiento del [Issue #18](https://github.com/xbasets82/Nextriva/issues/18). Ejecuta la auditoría y el evaluador estricto antes de publicar cambios; no agregues excepciones desde este documento.

### 10.2. Dependabot

Dependabot está configurado para proponer actualizaciones de dependencias. Las versiones instaladas y las reglas de resolución se controlan mediante los manifiestos, `mise.toml` y `pnpm-lock.yaml`.

---

## 11. Metodología de desarrollo

El proyecto sigue un desarrollo incremental, organizado en fases y microfases.

Se utiliza una metodología basada en **Test-Driven Development (TDD)** cuando resulta aplicable.

El ciclo de trabajo contempla:

1. Definir requisitos y criterios de aceptación.
2. Crear y revisar el issue correspondiente.
3. Implementar pruebas y funcionalidad.
4. Ejecutar las validaciones locales.
5. Crear un Pull Request.
6. Ejecutar GitHub Actions.
7. Revisar e integrar los cambios.
8. Documentar las evidencias.

La utilización de herramientas de inteligencia artificial no sustituye la revisión y aprobación humana de los cambios.

---

## 12. Estado del desarrollo

El proyecto sigue en desarrollo incremental. La rama `main` contiene las funcionalidades privadas y públicas descritas en §6. **No hay un despliegue público de la aplicación documentado**; I10.1 evalúa el alojamiento y el diseño del despliegue, sin realizarlo automáticamente.

Para conocer el estado vigente de una microfase, sus criterios aprobados y las tareas pendientes, consulta `docs/planning/` y el Issue de GitHub correspondiente. Las notas de planificación y evidencias TFM conservan también contexto histórico y pueden describir estados anteriores a una integración; el código de `main` y el estado actual de GitHub determinan qué está integrado.

---

## 13. Licencia

Proyecto desarrollado en el contexto de un Trabajo Final de Máster.

El repositorio es privado.

No se concede una licencia de uso, distribución o modificación a terceros salvo autorización expresa del titular.
