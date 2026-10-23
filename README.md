# Nextriva

**Plataforma web para la gestión integral de promociones inmobiliarias, incidencias y cambios durante su ciclo de vida.**

Nextriva es un proyecto desarrollado como Trabajo Final de Máster (TFM) en Inteligencia Artificial.

Su objetivo es diseñar e implementar una aplicación web que facilite la coordinación de los profesionales que intervienen en una promoción inmobiliaria, centralizando la información, las incidencias, las solicitudes de cambio y su seguimiento.

El proyecto también pretende evaluar la utilización de herramientas de inteligencia artificial como apoyo al proceso de desarrollo de software, desde el análisis y el diseño hasta la implementación, las pruebas y la documentación.

> **Estado del proyecto:** En desarrollo. I00, I01, I02 e I03.1–I03.3 están integrados en `main`. I04 y las funcionalidades posteriores siguen pendientes de planificación/aprobación.

---

## 1. Descripción general

### 1.1. Contexto

El desarrollo de una promoción inmobiliaria implica la participación de diferentes profesionales y organizaciones:

- Promotoras inmobiliarias.
- Arquitectos e ingenieros.
- Responsables y jefes de obra.
- Equipos comerciales.
- Constructoras, industriales y proveedores.
- Compradores de viviendas.

Durante las diferentes fases del proyecto se producen incidencias, modificaciones, solicitudes y decisiones que deben comunicarse, resolverse y documentarse.

Habitualmente, esta información se encuentra distribuida entre correos electrónicos, documentos, hojas de cálculo y distintas herramientas, dificultando su seguimiento y trazabilidad.

### 1.2. Objetivos

Nextriva pretende ofrecer una plataforma centralizada que permita:

- Gestionar promociones inmobiliarias.
- Registrar incidencias, problemas y solicitudes de cambio.
- Asignar responsables y realizar el seguimiento de su resolución.
- Coordinar a los diferentes participantes.
- Mantener un historial de actuaciones y decisiones.
- Facilitar la comunicación entre los actores.
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
| Backend              | Node.js 24        | Entorno de ejecución                 |
| Framework backend    | NestJS 12         | Desarrollo de la API                 |
| Lenguaje             | TypeScript        | Tipado estático                      |
| Frontend             | React 19          | Interfaz de usuario                  |
| Herramienta frontend | Vite 8            | Desarrollo y compilación             |
| Base de datos        | PostgreSQL        | Persistencia de datos                |
| ORM                  | Prisma 7          | Acceso y modelado de datos           |
| Gestor de paquetes   | pnpm 10           | Dependencias y workspaces            |
| Gestión de versiones | mise              | Control de versiones de herramientas |
| Contenedores         | Docker Compose    | Entorno PostgreSQL                   |
| Pruebas unitarias    | Vitest            | Validación de componentes            |
| Pruebas E2E          | Playwright        | Pruebas con navegador                |
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

Las versiones utilizadas durante el desarrollo de I00 son:

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

Crear un archivo `.env.local` en la raíz del proyecto.

Ejemplo:

```dotenv
NEXTRIVA_DEV_USER=nextriva_dev
NEXTRIVA_DEV_PASSWORD=<contraseña_local_segura>

NEXTRIVA_TEST_USER=nextriva_test
NEXTRIVA_TEST_PASSWORD=<contraseña_de_pruebas_segura>
```

Estas credenciales corresponden a las bases de datos PostgreSQL, no a usuarios de la aplicación.

El archivo `.env.local` está excluido del control de versiones y no debe publicarse en GitHub.

### 4.5. Iniciar PostgreSQL

Nextriva utiliza Docker Compose para gestionar entornos independientes:

- `postgres-dev`: base de datos de desarrollo.
- `postgres-test`: base auxiliar de pruebas, definida solo en `compose.test.yaml` y usada por el runner de integración.

Para iniciar únicamente la base de desarrollo:

```bash
docker compose --env-file .env.local up -d --wait postgres-dev
```

El runner de pruebas inicia `postgres-test` por separado, crea una base temporal por ejecución y no carga `.env.local`. Solo requiere `TEST_DATABASE_URL`, con credenciales válidas y destino `127.0.0.1:5433/nextriva_test`; extrae de esa URL las credenciales para Compose. No exportes `DATABASE_URL` al ejecutarlo.

Si guardaste estas variables en `.env.local`, puedes cargarlas en la sesión actual sin imprimirlas y retirar la URL de desarrollo antes de ejecutar el runner:

```bash
set -a
source .env.local
set +a
unset DATABASE_URL
mise exec -- pnpm --filter @nextriva/api test:integration
```

El runner rechaza `DATABASE_URL` antes de iniciar Docker o conectarse y solo pasa variables permitidas a cada subproceso.

Para comprobar el estado de desarrollo:

```bash
docker compose --env-file .env.local ps postgres-dev
```

### 4.6. Generar el cliente Prisma

```bash
mise exec -- pnpm --filter @nextriva/api db:generate
```

Este comando genera el cliente Prisma a partir del esquema de datos.

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

Con las migraciones ya aplicadas en `nextriva_dev`, el seed del [Issue #71](https://github.com/xbasets82/Nextriva/issues/71) crea 12 usuarios, 5 promociones y 60 incidencias ficticias por defecto. Usa únicamente `DATABASE_URL` del entorno o del archivo ignorado `.env.local`; en este último caso exige que el archivo pertenezca al usuario actual y tenga permisos `0600`. Valida `127.0.0.1`/`localhost`, puerto `5432`, nombre `nextriva_dev` y el nombre de la base conectada antes de escribir. No carga la configuración Prisma de desarrollo ni ejecuta migraciones.

```bash
chmod 600 .env.local
mise exec -- pnpm db:seed:dev
NEXTRIVA_SEED_INCIDENT_COUNT=24 mise exec -- pnpm db:seed:dev
```

La cantidad admitida es de 0 a 500 incidencias. Repetir el comando con la misma cantidad conserva identificadores, fechas, versiones y hashes existentes. Puede aumentar la cantidad; para reducirla, ejecuta primero la limpieza confirmada. Las promociones seed se reconocen por el prefijo `[SEED]`, las cuentas por `@seed.nextriva.invalid` y todos los registros seed tienen identificadores deterministas. Si un identificador reservado coincide con un registro ajeno, el comando aborta sin cambios.

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

Abre `http://127.0.0.1:5173/` e inicia sesión mediante el formulario. ADMIN puede navegar a Usuarios y Promociones. La recarga recupera la sesión del servidor; «Cerrar sesión» la revoca y devuelve al login. No necesitas peticiones POST manuales. `AUTH_LOCAL_HTTP=true` es una excepción exclusiva de desarrollo local: HTTPS conserva la cookie segura configurada por el backend.

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
|   +-- dependabot.yml
|   +-- audit-baseline.json
|
+-- apps/
|   +-- api/
|   |   +-- src/
|   |   +-- prisma/
|   |   +-- generated/
|   |   +-- package.json
|   |
|   +-- web/
|       +-- src/
|       +-- package.json
|
+-- docs/
|   +-- planning/
|   +-- tfm/
|       +-- evidencias/
|
+-- scripts/
|   +-- audit-baseline.mjs
|   +-- audit-baseline.test.mjs
|   +-- check-audit-baseline.mjs
|
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

### 6.1. Funcionalidades implementadas

Actualmente está completado el incremento **I00 — Foundation**.

Este incremento proporciona la infraestructura técnica necesaria para desarrollar las funcionalidades de negocio.

| Funcionalidad                           | Estado                                             |
| --------------------------------------- | -------------------------------------------------- |
| Estructura monorepositorio              | Implementada                                       |
| Aplicación backend NestJS               | Implementada                                       |
| Aplicación frontend React               | Implementada                                       |
| Endpoint de salud de la API             | Implementado                                       |
| Documentación OpenAPI inicial           | Implementada                                       |
| Entorno PostgreSQL con Docker           | Implementado                                       |
| Configuración de Prisma                 | Implementada                                       |
| Pruebas unitarias                       | Implementadas                                      |
| Pruebas de integración                  | Implementadas                                      |
| Pruebas E2E con Playwright              | Implementadas                                      |
| Cobertura automatizada                  | Implementada                                       |
| Integración continua con GitHub Actions | Implementada                                       |
| Auditoría de dependencias               | Implementada                                       |
| Configuración de Dependabot             | Implementada, con incidencia pendiente de revisión |

### 6.2. Funcionalidades previstas

Las funcionalidades de negocio se incorporarán durante los siguientes incrementos.

#### Autenticación y usuarios

- Inicio y cierre de sesión.
- Gestión de usuarios.
- Control de acceso basado en roles.
- Protección de rutas y operaciones.

#### Gestión de promociones

- Creación y administración de promociones inmobiliarias.
- Gestión de las fases del proyecto.
- Asignación de participantes.
- Consulta del estado de cada promoción.

#### Gestión de incidencias y cambios

- Registro de incidencias y solicitudes de cambio.
- Asignación de responsables.
- Seguimiento de estados.
- Validación de resoluciones.
- Historial de actuaciones.
- Trazabilidad y auditoría.

#### Colaboración

- Participación de profesionales internos y externos.
- Acceso a la información según permisos.
- Coordinación de actuaciones relacionadas con cada promoción.

#### Relación con compradores

La visión funcional de Nextriva contempla también la relación entre la promotora y los compradores durante las distintas fases del proceso inmobiliario.

Su incorporación concreta dependerá del alcance y la planificación de los incrementos posteriores del MVP.

---

## 7. Usuarios y credenciales de prueba

La interfaz de inicio y cierre de sesión de I03.3 (Issue [#41](https://github.com/xbasets82/Nextriva/issues/41), PR [#42](https://github.com/xbasets82/Nextriva/pull/42)) está integrada en `main`. Reutiliza el backend de I01: cookie HttpOnly y CSRF para mutaciones autenticadas. La corrección de la carrera logout/reautenticación está publicada en la PR [#44](https://github.com/xbasets82/Nextriva/pull/44), vinculada al Issue [#43](https://github.com/xbasets82/Nextriva/issues/43); CI #49 pasó y la revisión sigue pendiente. La validación humana con VoiceOver y otros navegadores sigue pendiente.

La corrección de #43, en revisión en la PR #44, coordina login/logout entre pestañas del mismo origen mediante Web Locks. Requiere un navegador con esa API en contexto seguro (HTTPS o loopback local); cuando no está disponible, las transiciones se bloquean con un mensaje accesible antes de enviar credenciales o pedir CSRF. Si otra pestaña está cerrando sesión, el login espera a que termine su respuesta. No se necesita iniciar sesión mediante POST manual.

No hay registro público ni recuperación de contraseña. Las cuentas son sintéticas, provisionadas localmente mediante el administrador de §4.7. No se versionan ni publican credenciales reales ni secretos. La contraseña común de las cuentas ficticias se documenta en §4.7.1 y solo es válida en `nextriva_dev`. Las credenciales de PostgreSQL son independientes de las cuentas de aplicación.

ADMIN dispone de Usuarios y Promociones. MANAGER y COLLABORATOR pueden autenticarse y cerrar sesión, pero no reciben enlaces ni acceso administrativo; las funcionalidades de participantes siguen pendientes de I04. La entrada transitoria de ADMIN solo enlaza pantallas existentes: Incidencias continúa pendiente.

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
```

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

El workflow realiza:

1. Instalación reproducible de dependencias.
2. Preparación del entorno sintético.
3. Generación del cliente Prisma.
4. Comprobación de formato.
5. Análisis estático con ESLint.
6. Comprobación de tipos.
7. Pruebas unitarias.
8. Pruebas de integración con PostgreSQL.
9. Pruebas E2E con Playwright.
10. Compilación de backend y frontend.
11. Validación de cobertura.
12. Auditoría de dependencias.

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

Actualmente existe deuda técnica de seguridad relacionada con dependencias transitivas de Prisma.

Su seguimiento se realiza mediante:

[Issue #18 — Vulnerabilidades de dependencias](https://github.com/xbasets82/Nextriva/issues/18)

Las excepciones aprobadas son temporales y caducan el **18 de noviembre de 2026**.

### 10.2. Dependabot

Dependabot está configurado para revisar las actualizaciones de dependencias.

Se ha identificado una incidencia relacionada con la política `minimumReleaseAge` de pnpm, que puede impedir resolver versiones publicadas recientemente.

Esta incidencia está pendiente de revisión.

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

| Incremento  | Descripción                                  | Estado                                                                     |
| ----------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| I00         | Infraestructura y fundamentos técnicos       | Integrado en `main`                                                        |
| I01         | Backend de autenticación y control de acceso | Integrado en `main`                                                        |
| I02         | Gestión de usuarios                          | Integrado en `main`                                                        |
| I03.1–I03.3 | Promociones, fases y login web               | Integrados en `main`; corrección del Issue #43 en revisión mediante PR #44 |
| I04+        | Funcionalidades posteriores del MVP          | Pendientes de planificación/aprobación                                     |

La planificación detallada se encuentra en la documentación del proyecto.

---

## 13. Licencia

Proyecto desarrollado en el contexto de un Trabajo Final de Máster.

El repositorio es privado.

No se concede una licencia de uso, distribución o modificación a terceros salvo autorización expresa del titular.
