# Nextriva

**Plataforma web para gestionar promociones inmobiliarias y coordinar incidencias desde su registro hasta su resolución y validación.**

Nextriva es un proyecto desarrollado como Trabajo Final de Máster (TFM) en Inteligencia Artificial. La aplicación centraliza promociones, participantes e incidencias para facilitar el seguimiento y la colaboración según los permisos de cada usuario.

El TFM también estudia el uso de herramientas de inteligencia artificial como apoyo al análisis, diseño, implementación, pruebas y documentación; las decisiones y validaciones del proyecto permanecen bajo supervisión humana.

> **Estado (29 de octubre de 2026):** la aplicación está publicada en [nextriva.es](https://nextriva.es), y `main` incluye las funciones descritas en §6. El CI completo del commit `8c3d27a` pasó. El despacho automático posterior al CI está habilitado; todavía falta observar una ejecución automática completa posterior a su activación. El historial operativo de la VPS se consultó vacío y no permite deducir qué SHA está desplegado.

---

## 1. Descripción general

### 1.1. Contexto

El desarrollo de una promoción inmobiliaria implica la participación de diferentes profesionales y organizaciones:

- Promotoras inmobiliarias.
- Arquitectos e ingenieros.
- Responsables y jefes de obra.
- Equipos comerciales.
- Constructoras, industriales y proveedores.

Durante las distintas fases aparecen incidencias que deben comunicarse, asignarse, resolverse y documentarse.

Habitualmente, esta información se encuentra distribuida entre correos electrónicos, documentos, hojas de cálculo y distintas herramientas, dificultando su seguimiento y trazabilidad.

### 1.2. Objetivos

Nextriva ofrece una plataforma centralizada para:

- Gestionar promociones inmobiliarias.
- Registrar y consultar incidencias vinculadas a una promoción y a una fase de origen.
- Asignar responsables y realizar el seguimiento de su resolución.
- Coordinar a los diferentes participantes.
- Colaborar mediante comentarios y soluciones sujetas a validación independiente.
- Mantener un historial de actuaciones.
- Controlar el acceso a la información mediante roles y permisos.
- Conservar la trazabilidad de las transiciones y decisiones.

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

Las incidencias conservan la fase en la que se originaron, aunque la promoción avance posteriormente.

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

| Componente           | Tecnología         | Finalidad                            |
| -------------------- | ------------------ | ------------------------------------ |
| Backend              | Node.js 24.22.0    | Entorno de ejecución                 |
| Framework backend    | NestJS 12.0.3      | Desarrollo de la API                 |
| Lenguaje             | TypeScript         | Tipado estático                      |
| Frontend             | React 19.3.0       | Interfaz de usuario                  |
| Herramienta frontend | Vite 8.3.3         | Desarrollo y compilación             |
| Estilos              | Tailwind CSS 4.3.0 | Estilos de interfaz                  |
| Base de datos        | PostgreSQL 18.6    | Persistencia de datos                |
| ORM                  | Prisma 7.10.1      | Acceso y modelado de datos           |
| Gestor de paquetes   | pnpm 10.34.7       | Dependencias y workspaces            |
| Gestión de versiones | mise               | Control de versiones de herramientas |
| Contenedores         | Docker Compose     | Entorno PostgreSQL                   |
| Pruebas unitarias    | Vitest 5.0.5       | Validación de API y web              |
| Pruebas E2E          | Playwright 1.64.0  | Pruebas con navegador                |
| Documentación API    | OpenAPI            | Especificación de endpoints          |
| Control de versiones | Git y GitHub       | Gestión del código                   |
| Integración continua | GitHub Actions     | Validación automatizada              |
| Dependencias         | Dependabot         | Seguimiento de actualizaciones       |
| Calidad              | ESLint y Prettier  | Análisis estático y formato          |
| Hooks Git            | Husky              | Validaciones locales                 |

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

Las versiones fijadas por el proyecto son:

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

Crear `.env.local` desde la plantilla, sin sobrescribir un archivo existente:

```bash
test -f .env.local || cp .env.example .env.local
chmod 600 .env.local
```

Edita los marcadores con credenciales sintéticas locales. `DATABASE_URL` debe apuntar a `127.0.0.1:5432/nextriva_dev` y usar el usuario/contraseña de `NEXTRIVA_DEV_USER` y `NEXTRIVA_DEV_PASSWORD`. Son credenciales de base de datos, no cuentas de Nextriva. La plantilla también incluye los valores del entorno de prueba; crea `.env.test.local` según la [guía de PostgreSQL local](docs/development/postgres.md), con una única variable `TEST_DATABASE_URL` dirigida a `127.0.0.1:5433/nextriva_test`.

Ambos archivos están excluidos de Git. No cargues `.env.local` para ejecutar pruebas y no pongas credenciales reales en la plantilla, el repositorio o el historial de shell.

### 4.5. Iniciar PostgreSQL

Nextriva utiliza Docker Compose para gestionar entornos independientes:

- `postgres-dev`: base de datos de desarrollo.
- `postgres-test`: base auxiliar de pruebas, definida solo en `compose.test.yaml` y usada por el runner de integración.

Para iniciar únicamente la base de desarrollo:

```bash
docker compose --env-file .env.local up -d --wait postgres-dev
```

El runner de pruebas inicia `postgres-test` por separado, crea una base temporal por ejecución y no carga `.env.local`. Solo requiere `TEST_DATABASE_URL`, con credenciales válidas y destino `127.0.0.1:5433/nextriva_test`; extrae de esa URL las credenciales para Compose. No exportes `DATABASE_URL` al ejecutarlo.

La copia manual local y la prueba de restauración sintética aislada están explicadas en la [guía PostgreSQL de backup y restore](docs/development/postgres-backup-restore.md). La prueba no accede a `nextriva_dev`.

El runner lee `.env.test.local` y crea una base temporal por ejecución. Ejecuta integración así:

```bash
env -u DATABASE_URL -u TEST_DATABASE_URL mise exec -- pnpm --filter @nextriva/api test:integration
```

El runner rechaza `DATABASE_URL` heredada antes de iniciar Docker o conectarse. También hay comandos E2E y de cobertura descritos en §8 y en la guía PostgreSQL. Las pruebas automatizadas no usan `nextriva_dev`.

Para comprobar el estado de desarrollo:

```bash
docker compose --env-file .env.local ps postgres-dev
```

### 4.6. Generar el cliente Prisma

```bash
mise exec -- pnpm --filter @nextriva/api db:generate
```

Este comando genera el cliente Prisma a partir del esquema de datos.

### 4.6.1. Aplicar migraciones locales

Con `postgres-dev` activo y `.env.local` apuntando únicamente a `nextriva_dev`, aplica las migraciones versionadas:

```bash
mise exec -- pnpm --filter @nextriva/api exec prisma migrate deploy --config prisma.config.ts
```

Comprueba el destino antes de ejecutar el comando. No uses `prisma migrate reset` ni `db push` para sustituir las migraciones.

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

El autocompletado de direcciones es opcional. Para habilitarlo en desarrollo, crea `apps/web/.env.local` a partir de la plantilla y configura `VITE_GEOAPIFY_API_KEY` con una clave pública de Geoapify restringida por origen y cuota:

```bash
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
```

Vite incorpora esta clave al bundle del navegador: no es un secreto y no debe ser una clave privada de servidor. Sin ella, se puede introducir la ubicación manualmente.

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

Abre `http://127.0.0.1:5173/` e inicia sesión mediante el formulario. Tras el login, todos los roles llegan a Incidencias (`#/incidents`); una sesión válida que abre la raíz también se dirige allí. Si se solicita una ruta interna conocida antes del login, se recupera después solo cuando el rol puede acceder al módulo. La recarga conserva la ruta actual. ADMIN puede navegar a Usuarios; los tres roles mantienen Promociones e Incidencias en el menú. «Cerrar sesión» revoca la sesión y devuelve al login. No necesitas peticiones POST manuales. `AUTH_LOCAL_HTTP=true` es una excepción exclusiva de desarrollo local: HTTPS conserva la cookie segura configurada por el backend.

Estos comandos no aprovisionan ni migran bases de datos. El recorrido verificable y las pruebas aisladas están en [el suplemento de I03.3](docs/architecture/i03-3-web-login.md).

---

## 5. Estructura del proyecto

La organización general del repositorio es:

```text
Nextriva/
|
+-- .github/
|   +-- workflows/
|   |   +-- ci.yml
|   |   +-- deploy.yml
|   |   +-- auto-deploy.yml
|   +-- dependabot.yml
|   +-- audit-baseline.json
|
+-- apps/
|   +-- api/
|   |   +-- e2e/ (flujos de navegador)
|   |   +-- src/
|   |   |   +-- auth/ users/ promotions/ incidents/
|   |   |   +-- health/ database/ observability/ dev-seed/ demo-seed/
|   |   +-- prisma/ (esquema y migraciones)
|   |   +-- package.json
|   |
|   +-- web/
|       +-- public/ (marca y recursos estáticos)
|       +-- src/
|       |   +-- api/ auth/ users/ promotions/ incidents/ public/
|       +-- package.json
|
+-- docs/
|   +-- architecture/
|   +-- development/
|   +-- planning/
|   +-- references/
|   +-- tfm/
|       +-- evidencias/
|
+-- scripts/
|   +-- test-integration.mjs
|   +-- audit-baseline*.mjs
|   +-- cd-*.mjs
|   +-- backup-*.mjs
|
+-- AGENTS.md
+-- compose.yaml
+-- compose.test.yaml
+-- mise.toml
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

Contiene los workflows de CI y publicación, Dependabot y el baseline de auditoría.

**`scripts`**

Incluye el runner de integración aislada, validadores de seguridad y utilidades de CD y backup.

**`AGENTS.md`**

Define las instrucciones y normas de desarrollo que deben respetar los asistentes de IA utilizados en el proyecto.

---

## 6. Funcionalidades principales

### 6.1. Funcionalidades implementadas

Los módulos de negocio descritos a continuación están implementados en `main`. La tabla resume capacidades de usuario; no sustituye las reglas de autorización del backend.

| Área                   | Funcionalidades disponibles                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceso y usuarios      | Inicio y cierre de sesión, cambio de contraseña, gestión de usuarios y roles ADMIN, MANAGER y COLLABORATOR. Las cuentas se aprovisionan de forma controlada; no hay registro público ni recuperación por correo.                   |
| Promociones            | Crear, consultar, editar y archivar promociones; gestionar sus fases y participantes; filtrar y paginar el listado. La ubicación admite entrada manual y sugerencias de Geoapify cuando se configura una clave.                    |
| Incidencias            | Crear, consultar, editar campos permitidos, filtrar y paginar; asignar responsable; añadir comentarios; presentar soluciones, rechazarlas con motivo y aprobarlas mediante una persona distinta del presentador.                   |
| Ciclo de vida          | Estados Abierta, En curso, Pendiente de validación y Cerrada; historial de actividad; eliminación lógica y consulta autorizada de eliminadas; reapertura aprobada de Cerrada a En curso con motivo y nueva asignación obligatoria. |
| Inicio y sitio público | Landing pública y Home autenticada con incidencias visibles para el usuario y vistas según los permisos existentes.                                                                                                                |
| Operación              | API de salud, contrato OpenAPI, persistencia PostgreSQL/Prisma, CI, publicación manual de producción y despacho de CD automático posterior a CI.                                                                                   |

El borrado de incidencias es lógico y no elimina comentarios ni actividad. La reapertura es una excepción aprobada y conserva una instantánea histórica de la solución anterior. No se implementan adjuntos de incidencias, compras de viviendas, gestión formal de cambios ni otras funciones no enumeradas.

### 6.2. Límites y configuración opcional

- Las siete fases de promoción están definidas por el producto; pueden estar activas simultáneamente. La fase de origen de una incidencia se conserva como dato histórico.
- Geoapify es opcional: sin clave configurada, la dirección puede introducirse manualmente.
- El almacenamiento de producción y los despliegues se describen en [la guía de entrega continua](docs/development/vps-continuous-delivery.md). Los cambios de esquema no se ejecutan automáticamente en producción.

---

## 7. Usuarios y credenciales de prueba

Para probar el login en desarrollo local, primero ejecuta el seed sintético descrito en [§4.7.1](#471-datos-ficticios-para-desarrollo-local). Las cuentas están limitadas a la base `nextriva_dev`:

| Rol          | Usuario de prueba                        | Contraseña |
| ------------ | ---------------------------------------- | ---------- |
| ADMIN        | `admin@demo.nextriva.invalid`            | `123456`   |
| MANAGER      | `manager@demo.nextriva.invalid`          | `123456`   |
| COLLABORATOR | `collaborator@demo.nextriva.invalid`     | `123456`   |

Son cuentas ficticias para desarrollo local, no credenciales de producción. La contraseña está almacenada mediante Argon2id en la base local. El seed completo incluye más cuentas y perfiles; algunas cuentas están inactivas y no pueden iniciar sesión. No uses estas credenciales en el sitio público. En producción las cuentas se administran de forma privada y este README no publica usuarios ni contraseñas.

No hay registro público ni recuperación de contraseña por correo. Las credenciales de la base de datos y los secretos de sesión son independientes de estas cuentas y no se incluyen en el repositorio.

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

El workflow instala dependencias con lockfile congelado y ejecuta jobs de calidad/build, unitarias/cobertura, integración con PostgreSQL temporal, E2E con Playwright y auditoría. Un job de validación agregado exige el resultado correcto de los controles requeridos. La integración y la cobertura usan jobs aislados; la generación de Prisma no comparte archivos de trabajo entre runners.

Las modificaciones se desarrollan en ramas independientes y se integran mediante Pull Requests.

### 9.1. Publicación continua

La publicación usa dos workflows separados: `deploy.yml` permite la ejecución manual controlada desde `main`; `auto-deploy.yml` escucha el resultado de CI y, si pasan sus guardas, solicita el workflow manual para el SHA exacto. La configuración automática está habilitada, pero el primer ciclo automático posterior a esa activación aún está pendiente de confirmación. No se ejecutan migraciones Prisma ni seeds en producción. El detalle de permisos, GHCR, SSH, comprobaciones de salud, recuperación y desactivación está en [la guía de entrega continua para VPS](docs/development/vps-continuous-delivery.md).

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

El baseline versionado en [`.github/audit-baseline.json`](.github/audit-baseline.json) registra una excepción temporal para `GHSA-q7qp-rjg7-q26m` en `multer@2.4.0`, dependencia transitiva de NestJS. Está asociada al [Issue #18](https://github.com/xbasets82/Nextriva/issues/18) y caduca el **23 de noviembre de 2026**. No se registran otras excepciones en ese archivo. La excepción no significa que la vulnerabilidad se haya corregido; el workflow evalúa que solo permanezca el aviso aprobado.

### 10.2. Dependabot

Dependabot está configurado para proponer actualizaciones de dependencias. Las versiones instaladas se controlan mediante los manifiestos, `mise.toml` y `pnpm-lock.yaml`; revisa y valida sus Pull Requests antes de integrarlas.

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

Los incrementos de producto y preparación de despliegue hasta I10.3 están integrados en `main`; el estado de cada microfase y sus evidencias se conserva en `docs/planning/` y `docs/tfm/evidencias/`. La automatización CD posterior al CI se habilitó mediante la Issue #163. Al 29 de octubre de 2026, el CI observado para `8c3d27a` pasó, pero la ejecución automática asociada ocurrió antes de habilitar el despachador y fue omitida. Activar variables no vuelve a disparar eventos anteriores: falta observar el próximo ciclo automático completo.

El archivo remoto `history.jsonl` se encontró vacío en una consulta del operador. Un historial vacío no prueba que no haya habido despliegues ni identifica la versión activa; para conocer el estado actual, contrasta el SHA publicado en `/release.json` con `/var/lib/nextriva-cd/state.json` en la VPS y el historial de ejecuciones de GitHub Actions. No inventes ni deduzcas el SHA desplegado a partir de ese archivo.

La planificación y las evidencias pueden conservar estados históricos de fases anteriores. Para saber qué está actualmente integrado, prevalecen el código de `main`, el estado actual de GitHub y las verificaciones operativas más recientes.

---

## 13. Licencia

Proyecto desarrollado en el contexto de un Trabajo Final de Máster.

El repositorio es privado.

No se concede una licencia de uso, distribución o modificación a terceros salvo autorización expresa del titular.


## 14. Despliegue o publicación

        url : https://nextriva.es/

## 15. Slides 

        https://docs.google.com/presentation/d/1p6nPOtQmCziOyXIjrbVqGGI0YAyrWL5p/edit?usp=drive_link&rtpof=true&sd=true

## 15. Vídeo

        https://drive.google.com/file/d/1AMrkOieJFwcqF_Ou2etyh_GUAEaCE4xa/view?usp=drive_link