# Nextriva — Diseño técnico del MVP v1.0

**Fecha:** 18/10/2026 · **Idioma:** castellano · **Estado:** especificación, no implementación.  
**Base funcional:** `Nextriva_Diseno_Funcional_MVP_v1.0_ES.md`, versión 1.0, y decisiones de la conversación «Definir funcionalitats MVP».  
**Objetivo:** desarrollar y demostrar las 15 HU sin ampliar el alcance del TFM.

## 1. Lectura rápida y estado real

Se diseña un monolito modular con API NestJS/Node.js/TypeScript, PostgreSQL y Prisma. El frontend propuesto es React/Vite con Tailwind CSS y componentes shadcn/ui. La seguridad y la auditoría forman parte de cada caso de uso, no de una fase final.

Este documento **no acredita** que existan repositorio ejecutable, dependencias instaladas, migraciones, comandos, pruebas, pipeline ni despliegue. Las rutas, módulos y contratos siguientes son el diseño objetivo. I00 deberá comprobar versiones compatibles y registrar los comandos reales antes de utilizarlos.

La especificación funcional prevalece en reglas de negocio. Este diseño concreta mecanismos técnicos; no aprueba nuevas funcionalidades. Una discrepancia se registra y se consulta antes de implementar la parte afectada.

## 2. Alcance y trazabilidad

Una única promotora, varias promociones y tres roles globales: administrador, gestor y colaborador. No se necesita una entidad de organización ni aislamiento multi-tenant.

| HU | Compromiso | Incremento principal |
|---|---|---|
| HU01 | Iniciar/cerrar sesión | I01 |
| HU02 | Gestionar usuarios | I02 |
| HU03 | Gestionar promociones | I03 |
| HU04 | Asignar participantes | I04 |
| HU05 | Consultar promociones | I03–I04 |
| HU06 | Crear incidencia | I05 |
| HU07 | Consultar incidencias | I05 |
| HU08 | Editar incidencias | I06 |
| HU09 | Asignar responsables | I06 |
| HU10 | Cambiar estados | I06, I08–I09 |
| HU11 | Añadir comentarios | I07 |
| HU12 | Documentar solución | I08 |
| HU13 | Validar/cerrar | I09 |
| HU14 | Consultar historial | Persistencia I05; consulta I07 |
| HU15 | Buscar y filtrar | I10 |

Quedan fuera: multi-tenancy, portal de compradores, viviendas/bloques, ventas, gestión formal de cambios, adjuntos y BIM, notificaciones automáticas, dashboard, informes, catálogos configurables, planificación, facturación, firmas, aplicación nativa, reapertura y edición/eliminación ordinaria de comentarios o historial. Tampoco se integra IA en el producto. Los requisitos técnicos de seguridad no autorizan pantallas nuevas fuera de las HU.

## 3. Arquitectura y límites

### 3.1. Topología objetivo

```text
Navegador → HTTPS / origen único → frontend estático
                              └→ /api → monolito NestJS → PostgreSQL
                                                     └→ logs Pino (stdout)
```

Un único backend desplegable y una base de datos. No microservicios, broker, Redis obligatorio, CQRS, event sourcing ni repositorios genéricos universales. Un monolito modular permite transacciones locales y reduce el coste operativo; exige vigilar dependencias entre módulos.

Monorepo propuesto con pnpm workspaces, sin Nx/Turborepo inicialmente:

```text
apps/api/src/{auth,users,promotions,incidents,health,config,database,observability}
apps/api/prisma/{schema.prisma,migrations/}
apps/api/test/
apps/web/src/{features,components,pages}/
e2e/
docs/{architecture,development}/
.github/workflows/
```

Esta estructura no existe todavía. Compartir únicamente contratos o configuración que lo justifiquen; nunca enviar Prisma Client, secretos o entidades de persistencia al navegador.

### 3.2. Responsabilidades

| Módulo | Responsabilidad y frontera |
|---|---|
| Auth | Credenciales, sesiones, cierre y revocación; obtiene usuario activo de Users |
| Users | Cuentas, rol global, activación y restricciones de responsabilidades |
| Promotions | Promoción, fases, participantes y acceso por vinculación |
| Incidents | Incidencia, asignación, máquina de estados, comentarios e historial |
| Database | Prisma, conexión y soporte transaccional mínimo |
| Observability | Pino, correlación, redacción y errores técnicos |
| Health/Config | Liveness, disponibilidad y configuración validada al arrancar |

Dentro de cada módulo: controlador HTTP delgado → caso de uso/servicio de aplicación → reglas de dominio y persistencia. Las reglas puras no dependen de HTTP. Usar inyección de dependencias; introducir interfaces solo cuando separen un límite real o permitan probarlo. No crear capas vacías por cada tabla.

Otros módulos no escriben tablas ajenas indiscriminadamente. Las operaciones que afectan responsabilidades, usuarios y participantes coordinan las comprobaciones mediante servicios explícitos y el mismo contexto transaccional. No usar llamadas HTTP entre módulos del monolito.

### 3.3. Frontend propuesto

React + TypeScript estricto + Vite; Tailwind y shadcn/ui como propuesta pendiente de validar en I00. shadcn/ui se incorporará como componentes revisables del proyecto, no como garantía automática de accesibilidad.

Organización por funcionalidades; componentes de presentación separados de acceso a API y estado cuando reduzca acoplamiento. Tres vistas centrales: promociones, incidencias y detalle de incidencia; login y formularios auxiliares de administración. Incidencias es la entrada tras login. Tabla en escritorio y tarjetas/una columna en móvil. Formularios con etiquetas, foco, teclado, errores accesibles, conservación de entradas y confirmaciones funcionales. Referencia: WCAG 2.2 AA, sin afirmar certificación.

El cliente puede ocultar acciones por usabilidad, pero nunca decide permisos. Ante 409 conserva el formulario y pide recargar; no reintenta sobrescribiendo. Tras logout o revocación descarta datos privados en memoria/caché. No almacenar tokens de sesión en localStorage.

## 4. Modelo de datos: ocho entidades

UUID internos; tablas/columnas en inglés `snake_case`; modelos TypeScript en inglés `PascalCase`/`camelCase`. UI y documentación de usuario en castellano. Fechas `TIMESTAMPTZ`, UTC en persistencia y representación local en interfaz. Enums cerrados para rol, fase, estado, categoría y prioridad; la traducción no se usa como clave.

Los campos siguientes constituyen un diseño lógico, no un esquema Prisma ejecutable.

| Entidad | Campos principales | Relaciones y restricciones |
|---|---|---|
| `users` | id, first_name, last_name, email, password_hash, role, is_active, created_at, updated_at | Email normalizado único; rol obligatorio; referencias históricas conservadas |
| `sessions` | id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at | N:1 usuario; hash único; expiración posterior a creación; nunca token en claro |
| `promotions` | id, name, description?, location?, status, created_at, updated_at | 1:N fases, participantes e incidencias; activa/archivada |
| `promotion_phases` | promotion_id, phase | Clave compuesta única; N:1 promoción; varias fases simultáneas |
| `promotion_participants` | promotion_id, user_id, joined_at | N:M explícita; pareja única; rol obtenido de usuario, no rol local inventado |
| `incidents` | id, public_code, promotion_id, origin_phase, title, description, category, priority, status, created_by_id, assigned_to_id?, solution?, solution_submitted_by_id?, solution_submitted_at?, validated_by_id?, closed_at?, version, created_at, updated_at | Código único e inmutable; versión positiva; creador/promoción obligatorios; responsable opcional |
| `incident_comments` | id, incident_id, author_id, body, created_at | N:1 incidencia y autor; inmutable funcionalmente |
| `incident_activities` | id, incident_id, actor_id, event_type, changes, created_at | N:1 incidencia y actor; eventos estructurados; inmutable funcionalmente |

```text
users 1──N sessions
users N──M promotions      mediante promotion_participants
promotions 1──N promotion_phases
promotions 1──N incidents
users 1──N incidents       creador / responsable / presentador / validador
incidents 1──N incident_comments ──N:1 users (autor)
incidents 1──N incident_activities ──N:1 users (actor)
```

Las relaciones repetidas Incident–User tendrán nombres Prisma explícitos. La solución actual vive en `incidents`; las propuestas anteriores se reconstruyen con eventos que conservan texto y autor. No crear una novena tabla de soluciones.

### 4.1. Integridad y límites

- Nombre de usuario 2–100; apellidos 2–150; email válido, normalizado antes de guardar y buscar, único en BD.
- Promoción: nombre 3–150, descripción opcional hasta 1.000, ubicación opcional hasta 200.
- Incidencia: título 5–150, descripción 10–5.000, solución hasta 5.000. Comentario no vacío hasta 2.000. Rechazo 5–2.000. Rechazar textos solo con espacios cuando se exige contenido.
- Una promoción activa tiene al menos una fase; sustituir su conjunto atómicamente. Fases: planificación, comercialización, proyecto ejecutivo, construcción, preentrega, entrega y posventa.
- La fase de origen es cualquiera de las siete, histórica e inmutable; **no debe exigirse que esté activa actualmente**. No derivarla después de las fases actuales.
- Promoción, origen, creador, fecha y código de incidencia no se editan. Solo título, descripción, categoría y prioridad en la edición general.
- SQL impondrá claves foráneas reales, unicidad, `NOT NULL` y `CHECK` locales relevantes. Regla entre tablas: dominio y transacciones, no un `CHECK` que pretenda consultar otras tablas.
- `CLOSED` exige solución, presentador, validador y fecha; validador distinto del presentador. Escribirlos conjuntamente y reforzar coherencia local mediante SQL revisado.
- Código `INC-000001`: secuencia PostgreSQL y restricción única, nunca `MAX + 1`. Los saltos por rollback son aceptables; seis dígitos son un mínimo visual, no un límite de negocio.
- Sin borrado físico ordinario de datos de negocio ni cascadas que eliminen historial. Retirar una vinculación no borra usuarios ni autoría. La limpieza técnica de sesiones caducadas se documentará aparte.

Índices iniciales: FK de consultas, usuario/expiración de sesión, promoción/estado/fecha de incidencia, responsable y orden temporal de comentarios/actividad. Revisar con consultas reales; no indexar todo ni instalar un motor de búsqueda. Categorías exactas y valores internos de enums pendientes de confirmar antes de su primera migración.

## 5. Autenticación, autorización y seguridad

### 5.1. Sesiones y contraseñas

Sesión opaca persistida en PostgreSQL, no JWT por defecto. Token generado con CSPRNG de 32 bytes; cookie lleva el secreto y BD conserva SHA-256 del token. SHA-256 es para este secreto aleatorio, **no para contraseñas**. Contraseñas con Argon2id y sal individual gestionada por biblioteca mantenida. Como base de evaluación: memoria 19 MiB, dos iteraciones y paralelismo uno; medir coste y elevarlo si procede antes de cerrar I01. Referencia: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Cookie de demo HTTPS propuesta `__Host-nextriva_session`, `Secure`, `HttpOnly`, `Path=/`, sin `Domain`, `SameSite=Lax`. Desarrollo HTTP requerirá configuración separada explícita; nunca relajar la demo. Caducidad absoluta e inactividad comprobadas por servidor; valores iniciales propuestos 8 horas y 30 minutos, pendientes de ratificar en I01. Expiración de cookie no sustituye revocación servidor. Renovar al autenticar; revocar al cerrar, desactivar o cambiar credenciales/privilegios. Consultar usuario activo y permisos actuales en cada petición, no confiar en un rol obsoleto guardado en la sesión. Referencia: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Sin registro público ni contraseñas de demostración en Git. Bootstrap administrativo explícito con secreto externo; no crear una ruta pública de inicialización. Política de longitud y entrega inicial de credenciales pendiente antes de I01; no añadir recuperación por email sin cambio de alcance.

### 5.2. CSRF, transporte y superficie

En operaciones mutantes exigir token CSRF ligado a la sesión, enviado en cabecera y validado por servidor; proteger login contra login-CSRF mediante contexto previo/token o mecanismo equivalente documentado. Validar Origin contra origen permitido; fallback Referer controlado y rechazar si no hay prueba válida según política documentada. SameSite es defensa adicional, no sustituto del token. GET no muta estado. Referencia: [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Preferir un origen único. Si es imprescindible separar orígenes, lista CORS exacta con credenciales, nunca comodín; revisar cookies y CSRF antes del despliegue. HTTPS, cabeceras de seguridad y CSP adaptadas a la aplicación; configurar proxy confiable únicamente para saltos conocidos.

Validación y listas permitidas en DTO del servidor, límites de tamaño/paginación y consultas parametrizadas. Rechazar asignación masiva de rol, autor, estado o versión persistida. Texto plano en comentarios/solución, sin HTML arbitrario. Rate limiting en login y rutas sensibles, errores de autenticación genéricos y sin enumeración. Secretos en entorno/gestor del proveedor, usuario BD de privilegios mínimos, puertos de BD no expuestos públicamente, dependencias revisadas y ausencia de stack traces en respuestas. Aplicar OWASP como guía verificable, no afirmar cumplimiento total sin evaluación.

### 5.3. RBAC más autorización por recurso

| Operación | Administrador | Gestor | Colaborador |
|---|---|---|---|
| Gestionar usuarios/promociones | Sí, con invariantes | No | No |
| Ver promoción | Global | Si participante | Si participante |
| Gestionar participantes | Todos | Solo colaboradores en su promoción | No |
| Ver incidencia/historial/comentarios | Global | Promociones asignadas | Vinculado a promoción y creador o responsable |
| Crear incidencia | Promoción activa | Activa y asignada | Activa y asignada |
| Editar/asignar | Autorizado y estado permitido | Su promoción y estado permitido | No |
| Iniciar resolución | Con responsable | Con responsable, su promoción | Solo si responsable |
| Guardar/enviar solución | Solo si responsable | Solo si responsable | Solo si responsable |
| Validar/rechazar | Distinto del presentador | Su promoción y distinto del presentador | No |
| Comentar | Si acceso y operación permitida | Si acceso y operación permitida | Si acceso y operación permitida |

Guards autentican y filtran rol; políticas/casos de uso resuelven recurso, estado y pertenencia. Denegar por defecto. Listados, contadores, filtros e historial usan el mismo alcance; filtrar después de paginar es incorrecto y puede filtrar información mediante totales. Accesos directos por UUID también se protegen. Adoptar 404 para recurso inexistente/no visible y 403 para acción prohibida sobre recurso visible; probar que no se filtra existencia.

No degradar/desactivar al último administrador activo. No desactivar, degradar ni retirar responsables con incidencias no cerradas sin reasignar antes. Ningún cambio de rol, activación o vinculación puede dejar pendientes sin otro validador elegible. Administrador activo tiene acceso global y puede asumir responsabilidad sin vinculación manual. La retirada conserva historial pero revoca acceso del antiguo participante.

## 6. Estados, transacciones y concurrencia

| Estado | Acción | Destino | Condición específica |
|---|---|---|---|
| Abierta | Iniciar | En curso | Responsable; ejecuta responsable o gestor/admin autorizado |
| En curso | Enviar solución | Pendiente de validación | Responsable, solución no vacía y otro validador activo elegible |
| Pendiente de validación | Rechazar | En curso | Gestor/admin distinto, motivo 5–2.000 |
| Pendiente de validación | Validar | Cerrada | Gestor/admin distinto; autor/fecha de cierre |

No hay otras transiciones. Edición y asignación solo Abierta/En curso; borrador solo En curso por responsable. Pendiente bloquea solución, edición y reasignación, pero admite comentarios. Rechazo preserva la propuesta anterior en historial. Cerrada es solo lectura y no admite comentarios ni reapertura. Promoción archivada suspende toda operación ordinaria; reactivación recupera permisos según estado sin modificar incidencias.

### 6.1. Escritura atómica

Cada mutación de incidencia ejecutará en **una transacción**: lectura autorizada y validaciones relevantes → actualización condicional por `id` y `version` → incremento de versión → inserción de actividad estructurada → commit. Si falla auditoría, rollback de todo. El evento incluye acción, actor del servidor, fecha, campos anteriores/nuevos y, en presentación, texto/autor de la propuesta. Nunca credenciales. Las actividades no se editan mediante API.

Cliente envía la versión leída, no un nuevo valor arbitrario. Si la actualización afecta cero filas por versión obsoleta: `409`, código `INCIDENT_VERSION_CONFLICT`, mensaje «Los datos han cambiado. Actualiza la información antes de continuar.». No reintentar una modificación de usuario con versión nueva automáticamente. Las lecturas previas sin actualización condicional no protegen contra pérdidas.

Edición, asignación, transición y solución incrementan versión. Comentarios son inserciones independientes y no necesitan incrementarla; sin embargo, la comprobación de no cierre/no archivo y el comentario deben coordinarse con esas mutaciones para impedir un comentario confirmado después del cierre.

### 6.2. Invariantes entre registros

`version` de incidencia no resuelve por sí sola el último administrador ni la elegibilidad de validadores. El diseño exige transacciones serializables con reintentos acotados para conflictos de serialización, o bloqueo explícito equivalente revisado, en operaciones que compitan por esos invariantes. Todas las rutas participantes deben aplicar la misma estrategia. Mantener transacciones cortas y sin red externa; fijar en I02/I04 orden de bloqueo, límite de reintentos y respuesta final de conflicto. Revalidar permisos dentro de la unidad transaccional relevante. Probar carreras entre retirada/desactivación/cambio de rol y envío/validación, archivo y comentarios. No afirmar atomicidad mediante una mera consulta seguida de escritura independiente.

## 7. API y contrato OpenAPI

REST JSON bajo `/api`, controladores por módulo y OpenAPI generado/validado con la versión NestJS elegida. Documentar DTO, enums, cookies, CSRF, permisos, paginación y errores; no exponer hashes ni modelos Prisma completos. Revisar divergencias entre contrato y pruebas. UI OpenAPI restringida a desarrollo/demo autorizada.

| Grupo | Superficie objetivo; nombres finales por confirmar |
|---|---|
| Salud | `GET /api/health` → `200 {"status":"ok"}`; separar liveness de disponibilidad BD |
| Auth | Login, logout, sesión actual y entrega de token CSRF |
| Usuarios | Listar, crear, editar, activar/desactivar; no registro público |
| Promociones | Listar/detalle, crear/editar, archivar/reactivar, participantes |
| Incidencias | Listar/detalle, crear/editar, asignar, iniciar, solución, enviar, rechazar/cerrar |
| Colaboración | Consultar/añadir comentarios; consultar actividad |

No publicar un PATCH genérico capaz de cambiar estado o metadatos de servidor. Estados HTTP previstos: 201 creación; 200/204 operación satisfactoria según contrato; 400 validación; 401 sesión inválida; 403/404 acceso; 409 versión/invariante en conflicto; 429 límite; 500 genérico con identificador de petición. Normalizar errores como `code`, `message`, `requestId` y errores de campo seguros cuando proceda.

Búsqueda por código/título sin distinguir mayúsculas, filtros combinados promoción/estado/prioridad/categoría/responsable. Orden inicial fecha descendente con UUID como desempate; paginación propuesta página/tamaño, máximo 100, valor inicial 20, por cerrar en I10. Totales autorizados, filtros y órdenes en lista permitida. Las fechas viajan en ISO 8601 UTC. Contratos y límites definitivos se fijan antes de su implementación, no se presentan aquí como endpoints disponibles.

## 8. Logging, auditoría y evolución

Pino para registros técnicos JSON: nivel, fecha, requestId, método, ruta parametrizada, estado y duración. Aceptar/generar correlación con formato y longitud validados. Redactar cookies, Authorization, contraseñas, tokens y cadenas de conexión; no registrar cuerpos completos, consultas con datos sensibles ni textos de solución/comentarios por defecto. Correlacionar errores sin devolver detalles internos. Política de retención/acceso a logs pendiente del entorno de demo.

Auditoría funcional: `incident_activities` en PostgreSQL y misma transacción que negocio. No sustituir por Pino ni por un consumidor de eventos eventual. Esquema de `changes` discriminado por tipo y validado. Inmutabilidad funcional no significa protección absoluta frente a administradores de BD; limitar privilegios y documentar ese límite. Este MVP no crea un registro general de auditoría de todas las entidades.

Notificaciones **futuras, excluidas**: preservar separación de casos de uso y canales. No enviar correo dentro de transacciones ni crear ahora un broker. Si se aprueban entregas fiables posteriormente, evaluar outbox transaccional, consumidor idempotente, reintentos y deduplicación; una emisión en memoria tras commit no garantiza entrega. Esa evolución requerirá su propia decisión y posiblemente otra tabla.

## 9. Persistencia y migraciones

Prisma Migrate con migraciones versionadas y SQL revisable. Fijar versiones compatibles de Node LTS, NestJS, Prisma, PostgreSQL, pnpm y herramientas en I00; no mezclar ejemplos de versiones. No se prescriben comandos hasta comprobar el manifiesto y la versión.

Desarrollo: crear/revisar/aplicar migraciones. CI: BD efímera PostgreSQL real, migraciones desde vacío. Demo: aplicar solo migraciones ya versionadas, con autorización y copia previa si hay datos. No `db push` como sustituto de historial, no reset destructivo sin consentimiento y nunca editar una migración aplicada compartida. Restricciones SQL y secuencia en migraciones cuando no se expresen en Prisma. Separar seed de esquema; datos sintéticos, idempotencia controlada y credenciales externas.

Entornos dev/test/demo separados, URLs validadas y protección para impedir tests sobre demo. Comprobar rollback de transacciones, no asumir que cambiar un fichero de migración revierte datos. Documentar recuperación/restauración antes de la demo.

## 10. TDD y pruebas

Vitest propuesto para unitarias e integración; integración contra PostgreSQL real, no SQLite como sustituto. En I00 probar compatibilidad de transformación TypeScript/decoradores y metadatos requeridos por NestJS. Playwright para E2E de navegador. No se ha ejecutado ninguna de estas herramientas en esta entrega documental.

Cada comportamiento: prueba que falla por la regla ausente (**Red**) → mínima implementación (**Green**) → refactor sin cambiar comportamiento. Registrar comando real, prueba, fallo esperado y resultado final. Un fallo de instalación no demuestra Red funcional. Documentación pasiva no requiere un test artificial.

| Nivel | Qué debe demostrar |
|---|---|
| Unitarias | Políticas de acceso, estados, validación, elegibilidad, catálogos y reglas sin BD |
| Integración Vitest | HTTP/Nest, Prisma, FK/únicos/checks, migraciones, sesiones, CSRF, transacciones y concurrencia real |
| E2E Playwright | Login, roles, promociones, creación/asignación, comentario, solución, rechazo, validación independiente, cierre y búsqueda |

Objetivos normativos propuestos para configurar en I00: global ≥80 % líneas, funciones y sentencias; ≥75 % ramas. Dominio/autorización/estados ≥90 % líneas y ramas. Medir código productivo; excluir solo generado y configuración sin lógica con justificación. No afirmar cobertura actual ni convertir porcentajes en sustitutos de pruebas negativas.

Casos obligatorios: los VC01–VC24 del diseño funcional y además dos creaciones concurrentes con códigos distintos; dos escrituras sobre una versión con un solo éxito; fallo de auditoría sin cambio de negocio; retirada que conserva autoría; eliminación de fase activa sin alterar origen; dos presentaciones conservadas tras rechazo; último admin concurrente; pérdida concurrente de validador; cierre/archivo frente a comentario; cookies/CSRF; revocación inmediata y ausencia de secretos en logs. En rechazos verificar respuesta, persistencia y ausencia de actividad de negocio indebida. Pruebas deterministas con reloj/datos controlados, aislamiento y sin esperas arbitrarias.

## 11. Calidad, CI y herramientas gratuitas

Herramientas objetivo: TypeScript estricto, ESLint + SonarJS, Prettier, Vitest, Playwright, Git, OpenAPI y Prisma/PostgreSQL. SonarJS es análisis estático en ESLint; no implica servidor SonarQube ni servicio SonarCloud configurado. Husky/lint-staged y Dependabot son propuestas auxiliares, no requisitos para empezar ni herramientas existentes.

GitHub Actions previsto para pull requests y rama principal: checkout → versiones fijadas → instalación reproducible con lockfile → formato check/lint/tipado → unitarias y cobertura → PostgreSQL temporal/migraciones/integración → build API/web → E2E contra build → informes. Trabajos independientes pueden paralelizarse; E2E depende del arranque y migraciones. Permisos mínimos, acciones fijadas a revisiones verificadas, secretos no disponibles a PR no confiables y artifacts sin datos sensibles. No desplegar automáticamente por crear documentación.

Usar componentes gratuitos y de código abierto donde sea posible. GitHub Actions, almacenamiento de artifacts y cloud tienen cuotas/condiciones variables: **no se garantiza coste cero ilimitado**. Verificar licencia de cada versión y límites de la cuenta antes de adoptarla; no contratar servicios ni activar facturación sin permiso. No hay suscripción de pago obligatoria en el diseño.

## 12. Cloud de demostración

Objetivo, no despliegue realizado: frontend estático, API Node persistente y PostgreSQL gestionado o instancia controlada. Preferir un origen HTTPS con proxy `/api` para simplificar cookies y CORS. Mantener la API sin estado local salvo conexiones; sesiones en BD. Evitar elegir una plataforma de funciones incompatible con el ciclo de ejecución antes de comprobarla.

Proveedor y plan **pendientes**: contrastar en la fecha de despliegue coste real, suspensión por inactividad, persistencia, versión PostgreSQL, conexiones, TLS, ubicación UE, copias, restauración, exportación y límites de build. Si no existe opción gratuita compatible, mantener demo local reproducible y solicitar decisión de presupuesto; no prometer hosting gratuito permanente.

Usar datos ficticios y cuentas por rol; inyección externa de secretos, acceso BD restringido, migración controlada, smoke E2E y prueba de reinicio conservando datos. Separar liveness de readiness; rollback de aplicación solo si esquema compatible. Documentar borrado posterior de datos demo, retención y exportación. El despliegue exige autorización explícita para cuenta, destino y operación; este documento no la concede.

## 13. Estrategia I00–I10 y aceptación

Cada incremento aporta una sección vertical verificable: migración cuando corresponda, API, interfaz, permisos, pruebas y documentación. No esperar a I10 para introducir seguridad o auditoría.

| Incremento | Entrega prevista | Criterio de aceptación específico |
|---|---|---|
| I00 | Entorno mínimo, sin entidades de negocio | API/web arrancan; `/api/health` devuelve contrato; conexión PostgreSQL; unit/integración/E2E de humo observados; Prisma/migraciones preparados; OpenAPI inicial, logs redactados, calidad y CI comprobados; README con comandos reales |
| I01 | Users/Sessions; HU01 | Login/logout seguro; cookie y CSRF probados; expiración/revocación y usuario inactivo denegados; bootstrap sin credenciales versionadas |
| I02 | Administración; HU02 | CRUD acotado sin borrar, email único; último admin y responsabilidades protegidos; cambio de rol/desactivación revoca acceso y no deja validaciones sin cobertura |
| I03 | Promotions/Phases; HU03/HU05 | Fases simultáneas, mínimo una activa; archivo/reactivación conserva datos; consulta según rol, con prueba de acceso restringido |
| I04 | Participants; HU04/HU05 | Unicidad, gestor solo colaboradores; retirada segura; visibilidad y contadores no revelan datos ajenos |
| I05 | Incidents/Activities; HU06/HU07 | Alta Abierta sin responsable permitida; origen inmutable; listado/detalle autorizados; código único; creación y actividad atómicas |
| I06 | HU08/HU09/inicio HU10 | Solo campos/estados permitidos; responsable elegible; inicio exige responsable; versión obsoleta 409 sin pérdida ni auditoría parcial |
| I07 | Comments; HU11/HU14 | Comentarios autorizados e inmutables; historial separado y cronológico desde I05; Cerrada/archivada impiden comentar |
| I08 | Solución; HU12/envío HU10 | Borrador solo responsable En curso; envío exige solución y otro validador; propuesta/autor conservados y edición bloqueada en Pendiente |
| I09 | HU13/rechazo y cierre HU10 | Autovalidación denegada; rechazo motivado devuelve En curso; cierre atómico y definitivo; invariantes concurrentes probados |
| I10 | HU15 y estabilización | Búsqueda/filtros/paginación autorizados; VC01–VC24 superados; E2E de flujo completo, documentación y demo reproducible con evidencia |

En I02–I04, las restricciones que necesitan incidencias aún inexistentes se diseñan/proban mediante políticas; antes de I05 se conectan a persistencia y se añaden pruebas reales. No declarar completa su garantía final con un doble de prueba únicamente. Dependencias: I00 → I01 → I02–I04 → I05 → I06 → I07–I09 → I10; no paralelizar unidades que requieran garantías todavía no implementadas.

### Criterio de salida por HU y MVP

Una HU se acepta con reglas y permisos servidor, pruebas positivas/negativas aplicables, persistencia correcta, errores documentados, OpenAPI actualizado y evidencia de controles de calidad. Un test omitido o pipeline no ejecutado se declara pendiente, no aprobado.

El MVP termina con las 15 HU verificadas, los 24 VC funcionales, cobertura medida frente a objetivos, migraciones reproducibles y demostración del flujo completo por roles: crear → asignar → iniciar → comentar → proponer → rechazar/revisar o validar por otra persona → cerrar → consultar historial y buscar. Confirmar acceso ajeno denegado, archivado sin pérdida y conflicto concurrente sin sobrescritura. Ninguna herramienta pendiente se describe como ya configurada.

## 14. Registro de decisiones

| ID | Estado | Decisión y consecuencia |
|---|---|---|
| DT01 | Cerrada por contexto/requisito | Monolito modular NestJS/Node/TypeScript; transacciones locales, sin infraestructura distribuida |
| DT02 | Cerrada | PostgreSQL/Prisma, ocho entidades y migraciones versionadas |
| DT03 | Cerrada | Sesión opaca, hash de token, RBAC más recurso; no JWT obligatorio |
| DT04 | Cerrada | Auditoría transaccional, solución actual en incidencia, historial de propuestas |
| DT05 | Cerrada | UUID, secuencia pública, UTC, version optimista y sin borrado ordinario |
| DT06 | Cerrada | TDD; PostgreSQL real en integración; Vitest/Playwright como herramientas objetivo |
| DT07 | Propuesta | React/Vite/Tailwind/shadcn y pnpm workspaces; validar en I00 |
| DT08 | Pendiente I00 | Versiones exactas, compatibilidad Nest/Vitest, scripts reales y licencias |
| DT09 | Propuesta I00 | Umbrales de cobertura; configurar y medir antes de informar cumplimiento |
| DT10 | Pendiente I01 | Duraciones de sesión, coste Argon2id medido, política/entrega de credenciales y mecanismo login-CSRF |
| DT11 | Pendiente antes de migración | Categorías exactas y nombres internos de enums; no inventar catálogo aprobado |
| DT12 | Pendiente I02/I04 | Estrategia concreta serializable/bloqueos y reintentos para invariantes cruzados |
| DT13 | Pendiente por incremento | Rutas REST finales, DTO, paginación, códigos y límites operativos |
| DT14 | Pendiente antes de demo | Proveedor/plan, cuotas, región, retención, copias y autorización de despliegue |
| DT15 | Fuera del MVP | Notificaciones, outbox/broker y resto del backlog excluido |

«Cerrada» significa acordada en el diseño, **no implementada ni verificada en ejecución**. Las propuestas aquí detalladas no convierten automáticamente una decisión pendiente en aprobada. Resolver cada pendiente justo antes del incremento afectado y conservar motivo, alternativa descartada y evidencia; no bloquear la entrega de estos documentos por ello.

## 15. Fuentes y mantenimiento

- Diseño funcional local v1.0: autoridad para HU01–HU15, VC01–VC24, límites y reglas.
- Conversación «Definir funcionalitats MVP»: ocho tablas, persistencia y secuencia I00–I10; ejemplos previos no son código existente.
- OWASP: enlaces directos en §5, consultados el 18/10/2026. Revalidar al implementar; las guías no reemplazan pruebas.

Actualizar este diseño cuando se apruebe una decisión pendiente; registrar cambios de alcance aparte. Siguiente acción posible, **no ejecutada**: ratificar pendientes de I00 y autorizar la creación del repositorio de aplicación.
