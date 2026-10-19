# Nextriva — Guía de prompts para desarrollar el MVP con TDD

**De cero a una demo pública, una microfase y una validación cada vez.**
Versión 1.0 · 18 de octubre de 2026 · Documento de trabajo en castellano.

Esta guía no ejecuta ninguna operación. Su entrega autoriza únicamente crear este documento, no crear repositorios, instalar herramientas, modificar una aplicación ni desplegarla. Copia primero el preámbulo y después **un solo prompt**. Cada prompt inicia una conversación de planificación; la ejecución requiere tu confirmación específica.

## Índice

- [Cómo utilizarla](#como-utilizarla)
- [Fuentes, decisiones y supuestos](#fuentes-decisiones-y-supuestos)
- [Preámbulo común](#preambulo-comun)
- [Preparación P00–P04](#preparacion)
- [I00 — Base ejecutable](#i00)
- [I01 — Autenticación y sesiones](#i01)
- [I02 — Usuarios y roles](#i02)
- [I03 — Promociones y fases](#i03)
- [I04 — Participantes](#i04)
- [I05 — Incidencias](#i05)
- [I06 — Comentarios y asignación](#i06)
- [I07 — Estados, solución y aprobación](#i07)
- [I08 — Auditoría y filtros](#i08)
- [I09 — Consolidación](#i09)
- [I10 — Demo pública](#i10)
- [Trazabilidad de las 15 HU](#trazabilidad)
- [Errores, bugs y refactor](#recuperacion)
- [Evidencias y retrospectiva TFM](#tfm)
- [Comandos y fuentes oficiales](#comandos)

<a id="como-utilizarla"></a>
## Cómo utilizarla

1. Abre una carpeta de desarrollo nueva, distinta del espejo de referencias de ChatGPT. No trabajes sobre `sources/`.
2. Pega el preámbulo completo. Pega P00 y revisa su respuesta; no pegues todos los prompts juntos.
3. Antes de cada escritura, revisa alcance, archivos, comandos, pruebas y coste. Confirma solo esa microfase.
4. Observa RED → GREEN → REFACTOR. Lee la explicación y reproduce la comprobación manual.
5. Si falta una decisión, evidencia o permiso, detente. No confundas «no ejecutado» con «correcto».
6. Valida el hito y guarda evidencia. Solo entonces copia el siguiente prompt.

**Confirmación reutilizable** — copia después de revisar un plan real, completando los campos:

```text
Confirmo únicamente la microfase [ID] y la revisión del plan [identificador]. Autorizo escribir exclusivamente [archivos/directorios enumerados] y ejecutar [comandos exactos revisados], en [ruta local]. No autorizo push, PR, merge, servicios remotos, despliegue, pagos, borrado de datos ni continuar con otra microfase. Si cambia el plan o aparece una operación no cubierta, detente y solicita confirmación.
```

Para operaciones remotas, usa una confirmación diferente y limitada a **destino, operación y cuenta/sesión**. Nunca pegues tokens ni contraseñas en el chat. Aprobar un plan local no autoriza publicar.

### Definition of Done común — se aplica a CADA paso

- [ ] Requisitos y decisiones fuente identificados; supuestos visibles y aprobados cuando afectan al comportamiento.
- [ ] Plan explicado antes de escribir; autorización recibida y limitada a esa microfase.
- [ ] RED real registrado con comando, resultado, salida y causa esperada; fallo de infraestructura no vale como RED funcional.
- [ ] GREEN mínimo y REFACTOR con pruebas verdes; no debilitar tests para aprobar.
- [ ] Unidad Vitest, integración con PostgreSQL real y E2E Playwright ejecutados donde sean pertinentes; justificar cada «no aplica».
- [ ] Tests negativos, permisos y reglas críticas incluidos; rechazo no modifica datos.
- [ ] SOLID revisado sin sobrearquitectura, OWASP revisado, OpenAPI y cliente sincronizados cuando cambia HTTP.
- [ ] Cobertura ≥85% líneas y ≥80% ramas del código de aplicación, con exclusiones justificadas; 100% de casos críticos identificados pasa. No equivale a 100% de líneas.
- [ ] Tipos, formato, lint, build y suite aplicables comprobados con comandos existentes; fallos previos separados de regresiones.
- [ ] Validación manual específica superada; evidencia TFM sin secretos; diff revisado y commit solo si autorizado.
- [ ] Informe de pruebas fallidas, omitidas y pendientes; **STOP** sin ejecutar el siguiente paso.

En preparación, documentación y scaffolding sin regla ejecutable, documenta la excepción TDD: comprobación estructural o de configuración antes/después, sin fabricar un test fallido. En las primeras fases, la cobertura se mide sobre lo existente; el inventario crítico crece con cada regla aprobada. Un hito incompleto no permite avanzar.

<a id="fuentes-decisiones-y-supuestos"></a>
## Fuentes, decisiones y supuestos

Se consultó la conversación «Definir funcionalitats MVP». El contenido recuperado especifica I00 y anuncia dos documentos, pero **no contiene esos documentos completos ni las 15 HU**. La carpeta `sources/` no aportó archivos al preparar esta guía. El AGENTS.md suministrado corresponde al entorno de trabajo, no sustituye las instrucciones de producto de Nextriva.

**Confirmado por el encargo:** Nextriva, una única promotora, tres roles, cuatro estados, quince HU; ocho entidades exactas; stack indicado; TDD; solución y aprobación independiente; demo sin datos reales. Fuera de alcance: portal comprador, implementación de notificaciones, gestión formal de cambios y gestión de documentos. Esto último no impide documentación técnica o evidencias del TFM.

**Recuperado de I00:** pnpm workspaces sin Nx/Turborepo; `apps/api`, `apps/web`, `e2e`, `docs`; NestJS modular, TypeScript estricto, React/Vite; PostgreSQL dev/test separados; Prisma incremental sin crear todas las entidades en I00; `GET /api/health` devuelve `{"status":"ok"}`; Pino con redacción; Vitest/Playwright y OpenAPI.

**Pendiente, NO inventar:** nombres de los tres roles y cuatro estados, permisos exactos, textos e IDs oficiales de las HU, transiciones, campos obligatorios, reglas de participantes/asignación, identidad que no puede aprobar y política de edición/borrado. P02 bloquea negocio si faltan. «Independiente» exige aclarar si la exclusión afecta al solucionador, creador, asignado o a varios; no basta con cambiar el texto de un botón.

I01–I10 se distribuyen aquí como **secuencia propuesta**, no como reproducción de un diseño técnico ausente. Si aparecen fuentes aprobadas, preservar sus decisiones y ajustar la guía y trazabilidad antes de implementar. No reemplazar una decisión fuente por una recomendación del asistente.

<a id="preambulo-comun"></a>
## Preámbulo común — pegar al iniciar o recuperar una sesión

```text
Vamos a desarrollar Nextriva como aprendizaje práctico para un TFM. Explica en castellano, con pasos pequeños y comprobables. Respeta las fuentes aprobadas y el AGENTS.md real de la carpeta; no confundas documentos de referencia con instrucciones ejecutables. No uses PromoGest como nombre del producto.

El MVP tiene una promotora, tres roles, cuatro estados y quince HU. No inventes sus nombres ni reglas: localízalos en fuentes o pide una aclaración, una por turno, y espera. No implementes portal comprador, notificaciones, gestión formal de cambios ni gestión documental. Usa solo las ocho entidades aprobadas: users, sessions, promotions, promotion_phases, promotion_participants, incidents, incident_comments, incident_activities. Una tabla técnica de migraciones no es una novena entidad de negocio. Propón cualquier necesidad adicional, no la introduzcas silenciosamente.

Modo inicial: SOLO LECTURA. Para la microfase que pegue después:
1. Identifica carpeta, estado Git, fuentes y decisiones aplicables. No leas secretos ni accedas a cuentas o servidores por disponibilidad de credenciales.
2. Explica objetivo, qué podré ver, HU/reglas, archivos afectados, plan, riesgos, coste y comandos exactos. Lee package.json y el lockfile antes de citar scripts; si no existen, propón crearlos sin fingir que ya funcionan. Consulta documentación oficial actual para compatibilidad y sintaxis.
3. Presenta tests concretos: entrada, resultado, estado HTTP/salida y datos persistidos. Separa unidad Vitest, integración Vitest con PostgreSQL REAL aislado y E2E Playwright. No uses SQLite o mocks como sustituto de la integración PostgreSQL. Justifica los no aplicables.
4. Pide confirmación para esa microfase y DETENTE antes de cualquier escritura, instalación, migración, commit o ejecución con efectos. No avances por aprobación general ni conviertas este prompt en permiso remoto.
5. Después de confirmar: escribe el test primero, ejecuta y muestra RED por la regla pendiente; implementa lo mínimo, muestra GREEN, refactoriza y repite pruebas. Si aún no existe runner, configura y verifica el runner como subpaso autorizado; no falsifiques RED. No implementes antes de observar RED funcional.
6. Revisa SOLID, validación, permisos de servidor, OWASP, errores, logs sin secretos y coherencia OpenAPI/cliente. No ocultes fallos, reduzcas umbrales o excluyas lógica para subir cobertura. Objetivo: ≥85% líneas, ≥80% ramas y todos los casos críticos identificados aprobados.
7. Cierra con diff, comandos y resultados reales, pruebas omitidas/fallidas, instrucciones manuales exactas, evidencia TFM y limitaciones. No digas completado si falta proof. Solicita validación humana y DETENTE. El siguiente prompt requiere una nueva acción mía.

No borres datos, no hagas reset/clean/force-push, no publiques, no despliegues, no instales servicios de pago ni uses conexiones remotas sin autorización específica. Trabaja con datos sintéticos y secretos locales ignorados. No añadas atribución IA a commits; utiliza Conventional Commits, pequeños y revisables, cuando los autorice.
```

<a id="preparacion"></a>
## Preparación P00–P04

### P00 — Inventario local sin modificar nada

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en P00: Inventario local sin modificar nada.

ALCANCE
Comprueba ruta y si existe repositorio; inventaría SO, Git, gh, Node, pnpm, Docker Engine/Compose y navegador. No inicialices Git ni instales nada. Explica diferencia entre herramientas ausentes y errores del proyecto. Comprueba licencia/coste de Docker Desktop para mi situación; ofrece motor compatible gratuito si no aplica. Verifica versiones soportadas y compatibilidad NestJS/TypeScript/Vite/Prisma/Vitest/Playwright en documentación oficial; no elijas latest por inercia. Propón versiones fijadas, lockfile y matriz local/CI.

PRUEBAS Y TDD
No hay RED funcional: registra comandos de versión y disponibilidad; una herramienta ausente no demuestra TDD.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Veo una tabla instalado/compatible/pendiente y comprendo qué instalaría.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### P01 — Preparar carpeta y herramientas

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en P01: Preparar carpeta y herramientas.

ALCANCE
Propón una carpeta nueva fuera de sources, herramientas mínimas y comandos de instalación por mi SO. Separa lo ya instalado de lo pendiente y no cambies versiones globales sin permiso. Después de confirmación instala solo lo aprobado, fija versión Node/pnpm del proyecto y vuelve a comprobar versiones. No crees negocio ni repositorio remoto.

PRUEBAS Y TDD
Usa comprobaciones antes/después de versiones y una instalación reproducible; no inventes RED de negocio.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo abrir la carpeta y reproducir los comandos de versión sin privilegios inesperados.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### P02 — Importar fuentes y resolver reglas

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en P02: Importar fuentes y resolver reglas.

ALCANCE
Localiza o solicita diseño funcional, DISENO_TECNICO_NEXTRIVA_MVP_v1.0.md y AGENTS.md de Nextriva. Lee sin modificar originales; propón copias de referencia en docs/references solo tras permiso. Extrae decisiones con archivo/sección y separa aprobadas, propuestas y contradictorias. Construye matriz exacta de 15 HU, tres roles, cuatro estados y ocho entidades. Revisa que el AGENTS no ordene avanzar, publicar o escribir sin confirmación; si hay conflicto, explica y pide resolverlo antes de aplicar cambios. Formula una sola pregunta pendiente por turno. No implementes negocio hasta tener reglas suficientes.

PRUEBAS Y TDD
Validación documental: ninguna HU sin texto fuente, ninguna transición o permiso supuesto. TDD no aplica a copiar referencias.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo explicar los roles y estados oficiales, y la aprobación independiente está definida sin ambigüedad.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### P03 — Repositorio privado GitHub con permisos explícitos

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en P03: Repositorio privado GitHub con permisos explícitos.

ALCANCE
Primero planifica Git local y repositorio remoto privado, sin operar todavía. Pide propietario, nombre y cuenta/sesión autorizada para la operación remota; no deduzcas permiso por gh instalado. Tras permiso específico, comprueba autenticación sin mostrar tokens. Antes de git add revisa archivos y secretos, crea .gitignore y .env.example sin valores reales tras autorización local. Propón rama principal y rama de trabajo con protección proporcional. Para remoto usa gh repo create con --private y propietario/nombre revisados; separa crear repositorio de push y PR. No añadas --push por comodidad. Si ya existe origin o repo, verifica identidad y no lo sobrescribas. No cambies visibilidad ni credenciales.

PRUEBAS Y TDD
Comprueba Git local antes/después; tras crear, verifica nameWithOwner e isPrivate con gh repo view. No es TDD funcional; ante error de red verifica resultado antes de reintentar creación.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Reviso que GitHub indique Private, origin apunte al destino aprobado y no haya .env, volcados ni tokens versionados.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### P04 — Baseline y evidencia inicial TFM

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en P04: Baseline y evidencia inicial TFM.

ALCANCE
Propón docs/tfm para diario, decisiones, matriz de casos críticos y evidencias saneadas. Registra fecha, versiones, requisitos, qué existía al inicio y qué no se ha ejecutado. Si hay código, ejecuta los checks disponibles tras permiso y separa fallos baseline. Si no hay código, registra ausencia sin inventar métricas. Propón primer commit local solo con autorización; no tag ni push implícitos. Usa identificador de commit para relacionar cada evidencia posterior.

PRUEBAS Y TDD
Verifica que el diario enlaza prompt, plan, autorización y salida real, sin secretos; los resultados no medidos quedan N/D.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo reconstruir el punto de partida y distinguir trabajo propio, IA y correcciones humanas.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i00"></a>
## I00 — Base ejecutable

### I00.1 — Monorepo mínimo reproducible

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.1: Monorepo mínimo reproducible.

ALCANCE
Prepara pnpm workspaces con apps/api NestJS/TypeScript estricto y apps/web React/Vite/TypeScript. Sin Nx ni Turborepo salvo fuente aprobada distinta. Propón estructura y scripts reales antes de crearlos, fija dependencias y lockfile. No ejecutes generadores no fijados ni aceptes telemetría/costes por defecto. Instala y prueba el entorno autorizado, sin negocio.

PRUEBAS Y TDD
Configura Vitest en ambas apps y demuestra un test de prueba controlado rojo y verde, separado de evidencia funcional; build y tipos deben pasar.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Desde instalación limpia puedo compilar API y web; conozco sus nombres de paquete y comandos.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I00.2 — Health con TDD y OpenAPI inicial

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.2: Health con TDD y OpenAPI inicial.

ALCANCE
Implementa únicamente GET /api/health con HTTP 200 y JSON exacto {"status":"ok"}. Usa un servicio y controlador NestJS sin lógica de negocio en el controlador. Publica contrato OpenAPI inicial y prueba que contrato y respuesta real coinciden, sin exponer detalles internos.

PRUEBAS Y TDD
Unidad Vitest del servicio RED antes de implementar; integración HTTP de método, ruta, status y cuerpo; no necesita PostgreSQL para un health de vida. Playwright comprueba petición o pantalla de estado.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Veo la respuesta exacta en navegador o cliente HTTP; no se declara conexión DB por devolver ok.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I00.3 — PostgreSQL real y Prisma aislado

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.3: PostgreSQL real y Prisma aislado.

ALCANCE
Configura Docker Compose PostgreSQL y Prisma sin las ocho tablas de negocio todavía. Separa nextriva_dev y nextriva_test con credenciales locales ignoradas, puertos y volúmenes revisados. Valida DATABASE_URL sin imprimirla; impide ejecutar pruebas contra dev o cloud. Fija versión PostgreSQL e integra arranque/espera/limpieza del entorno de pruebas. No uses down -v ni migrate reset sobre datos existentes.

PRUEBAS Y TDD
Integración Vitest conecta a PostgreSQL real, ejecuta consulta simple y verifica aislamiento; prueba RED de la comprobación de configuración pendiente, no simple DB apagada como RED de negocio.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Compruebo conexiones dev/test distintas y que las pruebas no alteran datos dev.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I00.4 — Primera pantalla y E2E

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.4: Primera pantalla y E2E.

ALCANCE
Configura Tailwind y shadcn compatibles con versiones fijadas, sin copiar configuración de otra major. Implementa pantalla inicial Nextriva y estado obtenido del endpoint, con carga y fallo accesibles. Durante desarrollo usa proxy /api; prepara el mismo origen en producción, no URLs localhost incrustadas. No añadas pantallas de negocio.

PRUEBAS Y TDD
Vitest de estados carga/éxito/error con mocks solo en unidad; Playwright contra API real comprueba nombre Nextriva y health, sin reemplazar API por mocks.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo detener API y ver error comprensible; con API activa se recupera y funciona a tamaño móvil.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I00.5 — Calidad, hooks y Pino

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.5: Calidad, hooks y Pino.

ALCANCE
Configura ESLint, Prettier, SonarJS y Husky con comprobación rápida de archivos modificados, sin convertir hooks en única garantía. Añade Pino con requestId y redacción de cookies, authorization, passwords y tokens; no registrar cuerpos sensibles. Propón scripts verificables y excluye artefactos generados con justificación.

PRUEBAS Y TDD
Test RED de redacción y requestId antes de implementarlos; lint detecta un defecto temporal controlado y después pasa. Captura un log sin credenciales.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Una petición tiene identificador rastreable y ninguna cookie o contraseña aparece en logs.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I00.6 — CI y cadena de suministro

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I00.6: CI y cadena de suministro.

ALCANCE
Propón GitHub Actions para instalación con lockfile congelado, tipos, lint check-only, unidad, PostgreSQL real, E2E y build. Reutiliza versiones locales, permisos mínimos, timeout y acciones fijadas a revisiones verificadas. No expongas secretos a PR no confiables ni uses pull_request_target para ejecutar código externo. Añade Dependabot para pnpm y Actions con frecuencia y agrupación razonables. Audita con pnpm audit; analiza npm audit según el apartado comandos, sin segundo lockfile artificial. CI remota solo tras permiso de push/ejecución.

PRUEBAS Y TDD
Demuestra localmente los comandos de CI; si se autoriza, muestra un fallo deliberado de fixture en rama y su corrección sin tocar main. No atribuyas RED funcional a fallo de CI.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Reviso un workflow verde real, o queda explícitamente pendiente por no autorizar GitHub; no avanzar si es requisito del hito.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i01"></a>
## I01 — Autenticación y sesiones

### I01.1 — Usuarios y contraseñas

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I01.1: Usuarios y contraseñas.

ALCANCE
Confirma campos y roles aprobados. Introduce users con migración Prisma revisable y hash de contraseña con algoritmo y parámetros justificados por OWASP actual. No guardes texto plano; no añadas registro público si no está en HU. Crea bootstrap local solo de forma aprobada y sin credenciales por defecto publicadas.

PRUEBAS Y TDD
RED de hash/verificación y usuario duplicado; integración PostgreSQL de restricciones y migración desde esquema anterior sobre copia temporal; respuestas y logs nunca contienen hash.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo crear usuario sintético por mecanismo autorizado y no veo contraseña ni hash en API.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I01.2 — Login y sesiones persistentes

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I01.2: Login y sesiones persistentes.

ALCANCE
Introduce sessions según diseño; si falta estrategia, detente antes de elegir. Para sesiones opacas propuestas, identificador aleatorio fuerte, valor derivado protegido en DB, expiración servidor y cookie HttpOnly/Secure en HTTPS/SameSite apropiado. No uses localStorage para token de sesión. Define protección CSRF para mutaciones, validación de origen y límites de intentos sin enumerar usuarios.

PRUEBAS Y TDD
RED login válido/inválido, expiración y fijación de sesión; integración real comprueba persistencia y rechazo sin efectos; E2E login y ruta protegida. Fake clock para expiración determinista.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Credencial errónea no revela si existe el usuario; recargar mantiene sesión válida según fuente.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I01.3 — Logout y revocación

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I01.3: Logout y revocación.

ALCANCE
Implementa cierre de sesión e invalidación servidor y cookie; aplica reglas aprobadas a sesiones de usuario desactivado o cambio de permisos. No añadas recuperación por email o notificaciones. Reutiliza guard y evita autorizaciones solo de interfaz.

PRUEBAS Y TDD
RED de reutilización de cookie tras logout, sesión expirada/desactivada y CSRF inválido; integración prueba 401 y ausencia de mutación; Playwright logout y retorno a ruta protegida.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Cerrar sesión bloquea volver mediante URL directa; otra pestaña no mantiene acceso útil con cookie revocada.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i02"></a>
## I02 — Usuarios y roles

### I02.1 — Matriz de roles y gestión de usuarios

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I02.1: Matriz de roles y gestión de usuarios.

ALCANCE
Implementa únicamente operaciones de gestión de usuarios incluidas en HU: consulta/alta/edición/activación si están aprobadas. Aplica tres roles exactos en servidor y evita mass assignment. Aclara política de último administrador y borrado antes de añadirla; no la inventes. No añadas tabla roles si el modelo aprobado no la requiere.

PRUEBAS Y TDD
RED por cada permiso permitido/denegado, incluido acceso directo a API y cambio de identificador; integración de unicidad y persistencia; E2E del gestor y usuario sin permiso.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Pruebo las tres cuentas sintéticas; ocultar un botón no sustituye 403 en servidor.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I02.2 — Interfaz de usuarios

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I02.2: Interfaz de usuarios.

ALCANCE
Conecta formularios y lista de usuarios al cliente tipado OpenAPI. Validación accesible y errores útiles sin revelar datos sensibles; respeta campos y acciones aprobadas. No dupliques lógica de permisos como fuente de verdad.

PRUEBAS Y TDD
Vitest formulario y errores; integración conserva reglas del backend; Playwright alta/edición permitida y rechazo a cuenta sin permisos.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Pruebo teclado, campos inválidos y recarga para comprobar persistencia, no solo cambio optimista.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i03"></a>
## I03 — Promociones y fases

### I03.1 — Promociones y fases persistentes

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I03.1: Promociones y fases persistentes.

ALCANCE
Introduce promotions y promotion_phases. Una sola promotora: no añadas tenants ni entidad promotora. Confirma campos, orden y restricciones desde fuentes. Implementa operaciones autorizadas sin borrado en cascada inventado.

PRUEBAS Y TDD
RED campos inválidos y reglas de fases aprobadas; integración PostgreSQL de FK, orden y rollback de operación incompleta; E2E mínimo creación/consulta.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Creo promoción sintética con fases, recargo y verifico que no aparecen promociones de ejemplo no solicitadas.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I03.2 — Interfaz de promociones y fases

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I03.2: Interfaz de promociones y fases.

ALCANCE
Construye listado, detalle y formulario solo para HU aprobadas, con estados vacíos, carga y errores; usa shadcn/Tailwind y cliente OpenAPI. No incorpores documentos ni flujos de cambio formal.

PRUEBAS Y TDD
Vitest de campos y navegación; Playwright flujo completo con API y PostgreSQL reales, incluyendo permiso negativo e identificación de fase.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Navego lista→detalle→fase, pruebo datos inválidos y compruebo que usuario no autorizado recibe rechazo real.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i04"></a>
## I04 — Participantes

### I04.1 — Participantes y perímetro de acceso

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I04.1: Participantes y perímetro de acceso.

ALCANCE
Introduce promotion_participants según definición funcional, sin suponer que participante es comprador o un nuevo rol. Confirma relación con users, ámbito y duplicados. Implementa altas/bajas permitidas y alcance de lectura/escritura por promoción; no borres historial al retirar acceso.

PRUEBAS Y TDD
RED acceso cruzado e identificador adivinado; integración unicidad/FK y cambio de acceso; E2E dos promociones y usuario fuera de ámbito.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Compruebo que cambiar ID en URL/API no permite ver o modificar otra promoción.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I04.2 — Pantalla de participantes

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I04.2: Pantalla de participantes.

ALCANCE
Conecta listado y acciones aprobadas de participantes; confirma permiso y feedback de retirada. No introduzcas invitaciones, correos ni portal comprador.

PRUEBAS Y TDD
Vitest de estados vacíos y errores; Playwright asignar/retirar y verificar alcance posterior con sesión real.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Tras retirar acceso y recargar, la cuenta afectada ya no opera en esa promoción según reglas fuente.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i05"></a>
## I05 — Incidencias

### I05.1 — Crear incidencias

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I05.1: Crear incidencias.

ALCANCE
Introduce incidents con promoción/fase/autor y campos exactos de las HU. Estado inicial entre los cuatro oficiales, nunca un quinto implícito. Valida relaciones, entradas y ámbito en servidor; reutiliza servicios de acceso.

PRUEBAS Y TDD
RED creación válida, campos inválidos y fase ajena; integración comprueba datos persistidos y cero inserts en rechazo; E2E crear y abrir detalle.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Creo incidencia sintética, recargo detalle y compruebo estado inicial y relaciones correctas.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I05.2 — Consultar y editar incidencias

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I05.2: Consultar y editar incidencias.

ALCANCE
Implementa lista y detalle, y solo edición si está aprobada. No introduzcas borrado, adjuntos o prioridades no definidas. Centraliza permisos y errores sin filtrar existencia de recursos privados.

PRUEBAS Y TDD
RED lectura/edición permitida y denegada; integración PostgreSQL de valores conservados tras rechazo; Playwright navegación, vacío y validación.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Busco incidencia recién creada y verifico que editar un campo no cambia otros ni relaciones.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i06"></a>
## I06 — Comentarios y asignación

### I06.1 — Comentarios

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I06.1: Comentarios.

ALCANCE
Introduce incident_comments. Confirma autores, permisos y si editar/borrar comentarios pertenece a HU. Renderiza texto seguro sin HTML ejecutable. Mantén referencia a autor y fecha según fuente.

PRUEBAS Y TDD
RED comentario vacío/permitido/denegado; integración persistencia y relación; Playwright texto con caracteres HTML se muestra sin ejecución.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Añado comentario, recargo y veo autor/fecha; otra cuenta sin permiso no puede publicarlo por API.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I06.2 — Asignación de responsables

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I06.2: Asignación de responsables.

ALCANCE
Implementa asignación y reasignación solo a usuarios elegibles según fuente, incluyendo desactivados y participantes cuando corresponda. Aclara desasignación si no está definida. No mandes notificaciones.

PRUEBAS Y TDD
RED responsable elegible/no elegible y actor sin permiso; integración rechazo sin cambiar responsable; E2E asignar, recargar y verificar valor.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Intento asignar cuenta no elegible y confirmo que la asignación anterior sigue intacta.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i07"></a>
## I07 — Estados, solución y aprobación

### I07.1 — Máquina de cuatro estados

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I07.1: Máquina de cuatro estados.

ALCANCE
Extrae tabla de transiciones de fuente con estado origen, destino, actor y condiciones. Implementa política central del dominio; rechaza estados desconocidos y saltos prohibidos incluso por HTTP directo. No asumas etiquetas ni añadas estado de aprobación separado si no está aprobado.

PRUEBAS Y TDD
RED parametrizado para todas las transiciones permitidas/prohibidas y roles; integración comprueba estado persistido y ausencia de efectos en rechazo; E2E camino principal.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Recorro el diagrama oficial y pruebo salto prohibido; siguen existiendo exactamente cuatro estados.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I07.2 — Registrar solución

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I07.2: Registrar solución.

ALCANCE
Implementa solución y transición correspondiente con permisos y campos aprobados, sin confundir proponer solución con aprobarla. Define atomicidad con auditoría en I08; prepara servicio de operación reutilizable.

PRUEBAS Y TDD
RED solución inválida, actor no permitido y transición fuera de orden; integración atómica de solución/estado; Playwright solución pendiente de validación según fuente.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** La incidencia muestra solución persistida, pero no queda aprobada por el mero hecho de proponerla.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I07.3 — Aprobación independiente y consistencia

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I07.3: Aprobación independiente y consistencia.

ALCANCE
Implementa aprobación/rechazo únicamente con la separación de identidades aprobada en P02. Comprueba permiso y exclusión en servidor. Evita doble aprobación y pérdida de actualización mediante transacción y precondición/versionado acorde al esquema aprobado; no añadas entidad adicional. Pregunta si el esquema necesita un campo no previsto.

PRUEBAS Y TDD
RED autoaprobación, actor indebido, orden incorrecto y petición repetida; integración con dos conexiones PostgreSQL y barrera determinista de concurrencia, sin sleeps arbitrarios; E2E dos sesiones distintas resuelven y aprueban.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Intento aprobar con quien no debe; luego uso cuenta independiente válida. Compruebo un solo resultado coherente y ningún doble efecto.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i08"></a>
## I08 — Auditoría y filtros

### I08.1 — Auditoría funcional transaccional

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I08.1: Auditoría funcional transaccional.

ALCANCE
Introduce incident_activities y registra eventos aprobados de creación, edición, comentarios, asignación, estados, solución y aprobación donde corresponda. Conecta retrospectivamente operaciones de I05–I07 al mismo servicio/transacción. No finjas historial anterior: migración de datos y backfill requieren decisión explícita. Auditoría no equivale a logs Pino y no necesita una novena entidad.

PRUEBAS Y TDD
RED evento con actor/fecha/tipo correctos y ausencia en rechazo; integración inyecta fallo de inserción para demostrar rollback de operación y evento; E2E historial ordenado según criterio fuente.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Veo secuencia coherente; al rechazar una acción no aparece un evento de éxito ni cambia el estado.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I08.2 — Filtros y paginación autorizada

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I08.2: Filtros y paginación autorizada.

ALCANCE
Extrae filtros exactos de HU y combínalos con ámbito de acceso antes de paginar. Valida entradas, límites, orden determinista y campos permitidos; no uses SQL interpolado. No añadas búsqueda avanzada fuera de alcance.

PRUEBAS Y TDD
RED combinación de filtros, vacío y acceso cruzado; integración PostgreSQL con datos que evidencien filtrado antes de paginar; E2E aplicar/limpiar filtros y volver a lista.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Cuento resultados de datos sintéticos conocidos, pruebo segunda página y verifico que filtros no amplían permisos.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i09"></a>
## I09 — Consolidación

### I09.1 — Contrato, calidad y cobertura final

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I09.1: Contrato, calidad y cobertura final.

ALCANCE
Revisa OpenAPI generado frente a rutas, códigos, DTO, enum de tres roles/cuatro estados, cookies y errores reales. Regenera cliente con herramienta/version fijadas y comprueba diff reproducible. Añade pruebas de contrato sin usar esquema y cliente falsos como única evidencia. Audita SOLID por módulos y casos críticos antes de refactor.

PRUEBAS Y TDD
Muestra test rojo para cada discrepancia real corregible en alcance, después verde; ejecuta suites completas y cobertura ≥85% líneas/≥80% ramas. Cada crítico inventariado debe tener prueba que pase; lista cualquier hueco sin declarar 100% por porcentaje de líneas.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo vincular una acción de interfaz a contrato HTTP y prueba, y no hay endpoint de negocio sin control de acceso.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I09.2 — Seguridad y vulnerabilidades

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I09.2: Seguridad y vulnerabilidades.

ALCANCE
Revisa OWASP actual con amenazas concretas: autenticación/sesión, CSRF, control de acceso por objeto, XSS, inyección, validación, rate limits, headers, secretos y logs. Ejecuta auditoría de dependencias con base de datos actual, separa directo/transitivo/dev/runtime. Sin audit fix --force ni actualización mayor automática. Snyk y Sentry son opt-in, no requisitos; verificar cuotas, permisos y envío de código/telemetría antes de proponerlos.

PRUEBAS Y TDD
RED de vulnerabilidad reproducida antes de parche; integración y E2E adversos correspondientes. No ejecutes ataques en destinos externos ni aceptes vulnerabilidades críticas abiertas sin decisión explícita.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Pruebo sesión expirada, URL ajena, autoaprobación y entrada maliciosa; compruebo que los logs no revelan el payload sensible.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I09.3 — Backup, restauración y candidato

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I09.3: Backup, restauración y candidato.

ALCANCE
Propón backup PostgreSQL y restauración en instancia temporal aislada, con comandos exactos revisados, secretos fuera de historial y dumps fuera de Git. Verifica compatibilidad de herramientas y extensión de backup. Nunca pruebes restauración sobre dev/demo existente. Revisa migraciones desde baseline y rollback de aplicación compatible sin borrar datos. Prepara commit/PR con pruebas y riesgos, sin ejecutar commit/push/PR/merge sin permiso específico.

PRUEBAS Y TDD
Restaura copia sintética real y compara conteos, relaciones e invariantes; ejecuta smoke sobre restauración y tests completos del candidato. Un archivo de backup sin restaurar no demuestra recuperación.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo recuperar una incidencia y sus comentarios/actividades; tengo commit candidato y sé qué comandos serían destructivos.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="i10"></a>
## I10 — Demo pública

### I10.1 — Elegir alojamiento sin pagar

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I10.1: Elegir alojamiento sin pagar.

ALCANCE
Consulta hoy planes oficiales y compatibilidad para API NestJS persistente, web React y PostgreSQL. Prioriza servir build Vite y /api desde un único servicio/origen HTTPS o proxy equivalente, con DB externa TLS privada cuando exista. Evalúa Render gratuito para demo temporal y alternativa de frontend Vercel Hobby con proxy de mismo origen y backend/DB por verificar. No prometas permanencia gratuita. Compara coste cero real, tarjeta, suspensión, expiración DB, RAM, build, cuotas, tráfico, región, almacenamiento, TLS, conexión Prisma y backups. Si no hay opción íntegramente gratuita viable, STOP: no contratar nada. Entrega plan y pide destino/cuenta/operación autorizados.

PRUEBAS Y TDD
No despliegues: verifica diseño y comandos contra documentación oficial; plan de smoke Playwright HTTPS/cookie/CSRF, y prueba de presupuesto con límites sin consumo facturable.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Entiendo caducidad, suspensión y cómo apagar/eliminar recursos; no hay tarjeta ni facturación activada sin mi consentimiento.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I10.2 — Preparar artefacto y datos de demo

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I10.2: Preparar artefacto y datos de demo.

ALCANCE
Tras validar alojamiento, prepara artefacto reproducible: build web servido con API o proxy mismo origen, /api preservado y fallback SPA sin interceptar rutas API. Configura variables documentadas, HTTPS y trust proxy limitado al entorno, CORS sin comodines con credenciales. Crea seed DEMO explícito solo sobre base vacía marcada, con datos totalmente ficticios y tres roles; no incluyas credenciales en repo. Cuentas demo de mínimo privilegio; acceso administrativo privado. No despliegues todavía.

PRUEBAS Y TDD
RED de rutas/proxy y protecciones de seed; integración PostgreSQL real; Playwright contra build de producción local de login→incidencia→comentario→solución→aprobación independiente.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Puedo ensayar la demo en build de producción; refrescar una ruta SPA no rompe y /api inexistente no devuelve HTML.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I10.3 — Desplegar solo con consentimiento remoto

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I10.3: Desplegar solo con consentimiento remoto.

ALCANCE
Primero muestra destino, cuenta/sesión elegida, recursos, región, coste, comandos y efectos exactos. Pide confirmación explícita para cada bloque: crear recursos, configurar secretos sin mostrarlos, migrar DB demo y publicar servicio. No descubras/reutilices credenciales remotas por tu cuenta. Tras autorización, despliega solo candidato probado, ejecuta migraciones revisadas y smoke no destructivo en HTTPS. Datos sintéticos únicamente. Si algo falla, conserva evidencia y usa plan de reversión autorizado, sin resetear DB.

PRUEBAS Y TDD
Smoke real HTTPS: origen único, cookie segura, login/logout, autorización por objeto, autoaprobación bloqueada y flujo válido con dos identidades. Comprueba ausencia de secretos en bundle, errores y logs; no publiques cuentas privilegiadas.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Abro URL pública desde otra sesión/navegador y verifico flujo; si la demo no cumple seguridad no la declaro lista.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

### I10.4 — Ensayo final y cierre TFM

**Entrada:** preámbulo activo, paso anterior validado y fuentes reconciliadas. En P00 no hay prerrequisito. Los pasos documentales no autorizan implementar negocio.

**Prompt listo para copiar:**

```text
Aplica el preámbulo común. Trabaja exclusivamente en I10.4: Ensayo final y cierre TFM.

ALCANCE
Prepara guion breve y repetible con tres cuentas sintéticas: acceso, promoción, participantes, incidencia, comentario, asignación, solución, aprobación independiente e historial/filtros. Lista precondiciones, resultado y cómo recuperar demo sin borrar datos. Documenta fecha de expiración del servicio/DB, backup y apagado autorizado. Exporta evidencias saneadas, métricas y retrospectiva sin afirmar beneficios causales de IA sin comparación. No pases repo a público ni crees release sin permiso.

PRUEBAS Y TDD
Reejecuta suites del candidato y smoke público autorizado; ensaya un error controlado de permiso y recuperación. Todos los críticos deben pasar; fallo pendiente implica demo no validada.
Antes de escribir, explica plan y pruebas con ejemplos concretos y comandos reales. Pide confirmación y espera. Después, para cada regla ejecutable: test primero → ejecutar y mostrar RED esperado → implementación mínima → GREEN → revisión SOLID/seguridad y REFACTOR → repetir pruebas. No avances si RED falla por un motivo distinto del esperado. Si no procede TDD, explica la excepción antes de actuar.

CIERRE
Aplica la Definition of Done común, indicando cada no aplicable y por qué. Muestra comandos, salidas resumidas y códigos de salida reales; verifica contrato OpenAPI/cliente si cambia HTTP y PostgreSQL real si hay persistencia. Actualiza evidencias solo dentro de archivos autorizados. Explica cómo validar manualmente lo construido. No hagas commit ni operación remota sin confirmación específica. Solicita mi validación del resultado y STOP: no ejecutes otra microfase.
```

**Validación manual del paso:** Completo el guion sin datos reales y puedo explicar cada decisión y evidencia al tribunal.

**DoD específico:** la validación anterior y las pruebas descritas están demostradas, además de la DoD común. Si falta una fuente o permiso, el estado es «bloqueado», no «terminado».

**STOP humano:** revisa evidencia y diff. Si no puedes reproducirlo, usa la plantilla de bug; no pegues el siguiente prompt.

<a id="trazabilidad"></a>
## Trazabilidad de las 15 HU

**No se dispone de sus textos oficiales.** No sería riguroso inventar quince historias y atribuirlas al diseño funcional. La tabla siguiente contiene quince posiciones pendientes, no quince requisitos nuevos. P02 debe sustituir cada posición por ID y texto literal de la HU, asignar pasos y pruebas y obtener validación antes de implementar negocio. Una HU puede cubrir varios pasos y un paso puede cubrir varias HU.

| Posición provisional | ID y texto oficial | Microfases | Pruebas y evidencia | Estado |
|---|---|---|---|---|
| HU-P01 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P02 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P03 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P04 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P05 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P06 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P07 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P08 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P09 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P10 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P11 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P12 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P13 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P14 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |
| HU-P15 | Pendiente de fuente | Pendiente de P02 | Pendiente | No validada |

### Mapa temático para completar la tabla, NO numeración oficial de HU

| Área conocida del encargo | Pasos candidatos | Prueba observable |
|---|---|---|
| Acceso/sesiones | I01.1–I01.3 | Login, expiración, logout y revocación |
| Usuarios/tres roles | I02.1–I02.2 | Matriz permitida/denegada en API y UI |
| Promociones/fases | I03.1–I03.2 | Relaciones válidas y persistencia |
| Participantes | I04.1–I04.2 | Acceso acotado a promoción |
| Incidencias | I05.1–I05.2 | Crear, consultar y editar solo si aprobado |
| Comentarios | I06.1 | Texto persistido y seguro |
| Asignación | I06.2 | Elegibilidad y rechazo sin cambios |
| Cuatro estados | I07.1 | Tabla completa de transiciones |
| Solución/aprobación independiente | I07.2–I07.3 | Dos identidades y autoaprobación bloqueada |
| Auditoría/filtros | I08.1–I08.2 | Eventos atómicos y resultados autorizados |
| Requisitos técnicos transversales | I00, I09, I10 | CI, contratos, seguridad, restauración y demo |

**Prompt para completar y verificar trazabilidad — solo lectura inicialmente:**

```text
Lee las quince HU oficiales y compara cada frase con la tabla de esta guía. No asignes números por intuición. Propón una tabla con ID oficial, texto literal, fuente/sección, microfases, criterios, casos críticos, tests unitarios/integración/E2E, validación manual y evidencia/commit. Marca requisitos no cubiertos y pasos que no tienen respaldo funcional. Revisa también exactamente tres roles, cuatro estados y las ocho entidades. Si falta una HU o hay contradicción, formula una sola pregunta y STOP. No implementes ni edites documentos hasta que confirme la matriz y sus archivos de destino.
```

### Inventario mínimo de riesgos y pruebas críticas

Este inventario es una propuesta técnica de verificación; las reglas de negocio exactas deben venir de fuentes. Cada fila se desglosa en casos identificados, sin reducirla a un único test feliz.

| ID crítico | Invariante | Evidencia mínima |
|---|---|---|
| C01 | Sesión válida exigida; expirada/revocada rechazada | Unidad + HTTP/DB + Playwright |
| C02 | Permisos exactos de tres roles, servidor como autoridad | Matriz completa por operación y rol |
| C03 | Sin acceso cruzado por promoción o ID manipulado | Dos promociones, actor ajeno, API directa |
| C04 | Solo transiciones oficiales de cuatro estados | Matriz origen/destino/actor, rechazo sin cambios |
| C05 | Aprobación independiente real | Actor excluido rechazado y actor válido admitido |
| C06 | Estado, solución y auditoría consistentes | Fallo intermedio y rollback en PostgreSQL |
| C07 | Peticiones concurrentes no duplican aprobación | Dos conexiones, orden controlado, resultado persistido |
| C08 | Contraseñas/tokens/cookies no se exponen | API, DB protegida, logs y bundle inspeccionados |
| C09 | Entradas y CSRF no eluden permisos | Requests adversos; cero mutaciones rechazadas |
| C10 | Migraciones y recuperación conservan datos | Upgrade y restauración sintética aislada |

**Cierre crítico = casos críticos aprobados / casos críticos identificados × 100.** El denominador debe constar, estar revisado y crecer si aparece una amenaza pertinente. No borrar un caso para alcanzar 100%. Un crítico bloqueado o no ejecutado no pasa.

### Modelo incremental de ocho entidades

| Entidad | Introducción | Comprobación central |
|---|---|---|
| users | I01.1 | Identidad, hash, rol exacto, unicidad |
| sessions | I01.2 | Expiración/revocación y relación con usuario |
| promotions | I03.1 | Una promotora, sin multitenancy añadido |
| promotion_phases | I03.1 | Pertenencia a promoción y reglas fuente |
| promotion_participants | I04.1 | Ámbito y elegibilidad según fuente |
| incidents | I05.1 | Fase/promoción coherentes y estado válido |
| incident_comments | I06.1 | Incidencia/autor y contenido seguro |
| incident_activities | I08.1 | Actor/evento, atomicidad y orden |

No se congelan campos ni cardinalidades no suministrados. Las migraciones se incorporan por microfase; antes de aplicar sobre datos existentes, revisar SQL, backup, compatibilidad y permiso. No usar el modelo como excusa para omitir una restricción aprobada: elevar incompatibilidad antes de escribir.

### Validación manual de cada hito I00–I10

Además de la comprobación de cada microfase, cerrar el incremento completo:

| Hito | Prueba manual obligatoria |
|---|---|
| I00 | Arranque documentado desde limpio; pantalla Nextriva; health; logs saneados; CI real o bloqueo explícito |
| I01 | Login válido/erróneo, recarga, expiración y logout; cookie revocada no accede |
| I02 | Repetir operaciones con cada uno de los tres roles y petición directa denegada |
| I03 | Crear/consultar promoción con fase; recargar y probar relaciones inválidas |
| I04 | Añadir/retirar participante; comprobar acceso desde otra sesión |
| I05 | Crear incidencia y localizarla; inválida no deja registro parcial |
| I06 | Comentar y asignar; texto seguro y responsable elegible |
| I07 | Recorrer estados; bloquear salto y autoaprobación; aprobar con cuenta independiente |
| I08 | Comparar historial con acciones; filtros y páginas no filtran datos privados |
| I09 | Revisar cobertura, críticos, vulnerabilidades, contrato y restauración efectiva |
| I10 | Ensayar flujo HTTPS en otro navegador; sin datos reales; backup y caducidad conocidos |

Para cada fila marca **fecha, commit, cuentas ficticias usadas, pasos, resultado esperado/real, evidencia y validación del usuario**. Una captura bonita no sustituye persistencia ni permisos.

<a id="recuperacion"></a>
## Errores, correcciones y refactor

### Qué hacer cuando algo falla

| Señal | Acción segura | No hacer |
|---|---|---|
| RED falla por import o DB caída | Arreglar runner/entorno como subpaso autorizado y repetir RED funcional | Presentar fallo de infraestructura como prueba de negocio |
| Test pasa antes de implementar | Comprobar que ejerce la regla y que no está mockeada; revisar baseline | Fabricar fallo borrando código válido |
| Puerto ocupado | Identificar proceso y proponer puerto compatible | Matar procesos ajenos automáticamente |
| Integración toca dev | Parar pruebas; preservar estado y evaluar daño antes de continuar | Resetear todas las bases |
| Migración pendiente o fallida | Inspeccionar estado/SQL/copia y pedir recuperación concreta | migrate reset o manipular historial sin plan |
| Playwright inestable | Conservar trace saneada; aislar causa y esperar condiciones de UI | Subir retries o sleeps para ocultarla |
| API y cliente divergen | Corregir contrato o implementación según fuente, regenerar y probar | Casts any o clientes manuales duplicados |
| Auditoría da alertas | Evaluar alcance, parche y regresiones | audit fix --force |
| CI falla y local pasa | Comparar versiones, entorno, servicios y comandos exactos | Saltarse CI o desactivar test |
| Error al crear repo/desplegar | Comprobar identidad y resultado solo con permiso remoto existente | Repetir creación a ciegas o cambiar visibilidad |
| Secret expuesto | Detener publicación, revocar/rotar con permiso y evaluar historial/artefactos | Creer que borrar .env del último commit lo revoca |

### Plantilla de bug — lista para copiar

```text
Aplica el preámbulo. Investiga SOLO este bug, inicialmente sin escribir.
Microfase/HU: [ID y fuente]. Commit/entorno/versiones: [datos no sensibles].
Esperado: [resultado y regla exactos]. Observado: [resultado real].
Reproducción mínima: [pasos y datos sintéticos]. Evidencia saneada: [salida/captura].

Reproduce por la interfaz pública y distingue baseline de regresión. Explica causa demostrada, alcance y plan de corrección mínimo; no afirmes que ya funciona sin repetir mis pasos. Si falta información, una pregunta y espera. Propón test de regresión RED que compruebe salida/status/datos y persistencia sin efectos tras rechazo. Pide autorización de archivos/comandos antes de escribir. Después de confirmación: RED real → fix mínimo → GREEN → REFACTOR y suites afectadas, PostgreSQL real/E2E si corresponde. No cambies expectativas ni elimines tests para ocultar fallo. Revisa comportamiento previo de otros consumidores del código compartido. Entrega causa, diff, pruebas y validación manual. No commit/push/deploy sin permiso. STOP.
```

### Plantilla de refactor — lista para copiar

```text
Aplica el preámbulo. Analiza SOLO [módulo/ruta], en [commit], para mejorar [problema concreto de comprensión/acoplamiento/duplicación]. No cambies comportamiento, contrato HTTP, permisos, datos ni alcance. Lee tests y consumidores existentes y explica qué principio SOLID mejora y qué abstracciones NO hacen falta. Primero propone plan/archivos/comandos y pide confirmación.
Tras autorización, ejecuta baseline verde y añade tests de caracterización si falta protección. En refactor puro no inventes RED funcional: el comportamiento se conserva; si el test descubre un bug, STOP y separa corrección autorizada. Refactoriza en pasos mínimos y repite tests, tipos y contrato OpenAPI/cliente. Compara antes/después en entradas representativas, incluyendo rechazos. No mezcles nuevas funcionalidades ni migraciones. Entrega diff, resultados reales y validación manual; STOP sin commit ni operaciones remotas implícitas.
```

### Branch, commits y PR — operación separada

```text
Solo lectura: revisa git status, diff y pruebas de la microfase [ID]. Propón un commit atómico Conventional Commit con código, pruebas y documentación coherentes; enumera archivos exactos, excluyendo secretos, dumps, node_modules y evidencias sensibles. No incluyas Co-Authored-By ni atribución IA. No mezcles cambios previos ajenos. Pide confirmación antes de git add/commit. Si estamos en rama principal, propón rama de trabajo antes de escribir.
Para push y PR, pide aparte propietario/repositorio, rama, cuenta/sesión autorizada y operación exacta. Revisa privacidad, costes de CI y diff. Propón PR con objetivo, HU, RED/GREEN, cobertura, críticos, riesgos y pasos manuales. No publiques, hagas merge ni cambies protección/visibilidad automáticamente. Si el cambio es demasiado amplio, propone división coherente sin reescribir historia ajena.
```

### Retomar tras interrumpir

```text
Retoma Nextriva en SOLO LECTURA. Lee fuentes aprobadas, AGENTS, diario y último hito validado, git status y diff. No supongas que la última microfase está terminada. Distingue validado, implementado sin validar y pendiente. Comprueba que evidencia corresponde al commit actual y recuerda reglas exactas de roles, estados e independencia. Propón reejecutar checks mínimos con comandos existentes, explica coste/efectos y pide confirmación. No empieces el siguiente prompt ni escribas por continuidad automática.
```

<a id="tfm"></a>
## Evidencias TFM, diario IA y retrospectiva

Guardar evidencias no exige publicar prompts completos con información privada. Mantener repositorio privado no convierte los secretos en seguros. Sanea capturas, logs, traces y artefactos; limita retención de CI y evita subir cookies de Playwright (`storageState`) o dumps.

### Registro por microfase — plantilla reutilizable

```markdown
# Evidencia [ID] — [título]
Fecha y zona horaria:
Commit inicial/final:
Fuente y HU oficial:
Objetivo y criterio de aceptación:
Prompt exacto saneado y versión del preámbulo:
Modelo/herramienta y versiones observadas (N/D si no disponible):
Plan presentado:
Autorización y alcance:
RED: comando, código de salida, extracto, causa esperada:
GREEN: comando, código de salida, resultado:
REFACTOR: cambio y regresión comprobada:
Unidad / integración PostgreSQL / E2E: resultados o no aplica justificado:
Contrato OpenAPI/cliente y revisión SOLID/OWASP:
Cobertura líneas y ramas, configuración y exclusiones:
Casos críticos identificados/pasados/pendientes:
Validación manual: pasos, esperado, real y validación humana:
Intervenciones humanas y errores de IA corregidos:
Tiempo humano / tiempo de espera / intentos:
Costes y cuotas consumidas o N/D:
Limitaciones, fallos, permisos no concedidos y siguiente paso:
Rutas de artefactos saneados:
```

### Métricas que sí permiten comparar

- Tiempo activo humano y tiempo transcurrido por microfase: no mezclarlos.
- Intentos de prompt, correcciones manuales y defectos encontrados antes/después del hito.
- Tests pasados/total, omitidos y fallidos; cobertura con configuración estable.
- Casos críticos aprobados/identificados; cumplimiento por HU, no por cantidad de código.
- Builds/CI aprobados y duración; costes observados y cuotas restantes.
- Cambios de alcance y supuestos corregidos; registrar denominadores y datos ausentes.

No afirmar «la IA ahorró X%» sin un baseline comparable. No inferir calidad por líneas generadas. Conservar ejemplos de fallos y decisiones humanas, no solo éxitos.

**Prompt de retrospectiva al cerrar cada incremento:**

```text
Solo lectura. Usa evidencias reales de [Ixx] y sus commits para explicar qué aprendí, qué hizo la IA, qué tuve que corregir, dónde ayudó TDD y qué limitaciones permanecen. Resume métricas con denominadores y N/D, sin inventar tiempo/coste ni conclusiones causales. Contrasta HU y casos críticos con tests y validación manual. Propón un único ajuste de proceso si está justificado; no lo apliques ni avances de incremento. Pide mi validación y STOP. Si apruebo guardar el diario, solicita alcance de escritura concreto.
```

<a id="comandos"></a>
## Comandos verificables y precauciones

Son referencias, **no una receta para ejecutar todo**. Validar versión/ayuda y carpeta antes de usarlos. Los comandos que escriben o acceden a red requieren la confirmación correspondiente. No pegar literalmente marcadores como `PROPIETARIO` o `PAQUETE_API`.

### Inventario local — sin instalar

```bash
pwd
git --version
gh --version
node --version
pnpm --version
docker --version
docker compose version
```

Si hay repo, `git status --short`, `git branch --show-current` y `git diff --stat`; no inicializar por detectar ausencia. `docker info` comprueba motor pero no debe exponer configuración sensible. Inspeccionar claves `scripts`, `packageManager` y `engines` de los `package.json`, no imprimir `.env`.

### GitHub — solo tras autorización remota específica

```bash
gh auth status
gh repo create PROPIETARIO/nextriva --private --source=. --remote=origin
gh repo view PROPIETARIO/nextriva --json nameWithOwner,isPrivate,url
```

El segundo comando crea un recurso remoto y configura un remote local; requiere Git local y ausencia de `origin` conflictivo. No incluye `--push`: subir commits es otra operación. `gh auth login` es un flujo de consentimiento interactivo separado, nunca extraer tokens con `gh auth token`. La cuenta autenticada debe coincidir con la autorizada. La documentación oficial distingue crear y subir mediante `--push`: [GitHub CLI: repo create](https://cli.github.com/manual/gh_repo_create).

### Scripts y runners — propuestos, no existentes por esta guía

En I00.1 se propone definir scripts **después** de elegir configuración: `typecheck`, `lint`, `format:check`, `test:unit`, `test:integration`, `test:coverage`, `test:e2e`, `build`. Nombres finales y ubicación deben constar en `package.json`. No ejecutar `pnpm test:e2e` porque lo mencione esta guía: leer primero su definición.

Ejemplos condicionales de ejecutables locales, sin descarga implícita mediante `dlx`/`npx`:

```bash
# Solo si Vitest y su configuración están en ese workspace:
pnpm --filter PAQUETE_API exec vitest run --config RUTA_CONFIG_UNIDAD
pnpm --filter PAQUETE_API exec vitest run --config RUTA_CONFIG_INTEGRACION
pnpm --filter PAQUETE_API exec vitest run --coverage
# Solo si Playwright y configuración están en la raíz:
pnpm exec playwright test --config RUTA_CONFIG_E2E
# Instala navegadores: necesita autorización de descarga y espacio.
pnpm exec playwright install chromium
```

Reemplazar nombres/rutas por valores descubiertos. La configuración de cobertura debe incluir archivos de aplicación no ejecutados, no únicamente los importados por tests. Fijar provider compatible y thresholds de líneas 85/ramas 80; no `autoUpdate` que altere configuración silenciosamente. Verificar si Vitest instrumenta decoradores/metadatos usados por NestJS; probar DI real, no asumir compatibilidad porque compila una unidad. Fuente: [Vitest, cobertura](https://vitest.dev/guide/coverage.html).

En Linux CI, las dependencias de navegador pueden requerir instalación adicional con efectos sobre el entorno; planificarla antes. Fuente: [Playwright, CLI](https://playwright.dev/docs/test-cli).

### Base de datos y migraciones

Comandos candidatos tras verificar servicio, versión y configuración:

```bash
docker compose config --quiet
docker compose ps
pnpm --filter PAQUETE_API exec prisma validate
pnpm --filter PAQUETE_API exec prisma migrate status
```

`migrate status` consulta la DB configurada: autorizar el destino, nunca inferirlo. Proponer separadamente `migrate dev` para desarrollo y `migrate deploy` para migraciones revisadas en destino; ambos escriben. No usar `db push` como sustituto del historial revisable. No listar URLs con contraseñas. En pruebas, BD efímera dedicada con guard de nombre/host y limpieza aislada; nunca compartir DB con demo. Revisar la sintaxis de configuración Prisma de la major elegida.

Backups: diseñar uso de `pg_dump`/`pg_restore` según versión y formato, con servicio/secret seguro y destino fuera de Git. No incluir una cadena con contraseña en argumentos o diario. La guía no prescribe restaurar sobre una DB viva.

### Auditoría pnpm y requisito npm audit

```bash
pnpm audit --json
```

Es una consulta de red que puede comunicar metadatos de dependencias: revisar registro/destino. Código distinto de cero puede indicar vulnerabilidades, no fallo de runner; guardar salida saneada y evaluar severidad/alcance.

El proyecto usa **un único `pnpm-lock.yaml`**. `npm audit` no debe presentarse como auditoría equivalente de ese lockfile. Si el TFM exige ejecutarlo literalmente, proponer un experimento separado en carpeta temporal autorizada, con manifiesto y lock npm derivados/documentados, sin scripts de instalación y sin tocar el monorepo. Registrar que resuelve un árbol potencialmente diferente; no usar su resultado como garantía del árbol pnpm. Si no es requisito literal, documentar sustitución por auditoría pnpm y obtener validación. No crear `package-lock.json` en el repo solo para hacer pasar una comprobación. Fuente: [npm audit](https://docs.npmjs.com/cli/commands/npm-audit/) y [pnpm audit](https://pnpm.io/cli/audit).

### Política de coste cero

- No confundir «herramienta open source» con infraestructura o uso de IA ilimitado gratuito. Usar solo acceso existente aprobado; no contratar plan para seguir esta guía.
- Comprobar minutos/almacenamiento de Actions en repo privado antes de subir workflows; imponer presupuesto cero y no habilitar gasto adicional.
- SonarJS se usa como reglas locales; no obliga a SonarCloud de pago.
- Snyk/Sentry se omiten por defecto. Opt-in exige revisar precio, cuotas, privacidad, retención y permisos actuales. Pino y pruebas locales permiten continuar sin esos servicios.
- Cloud: rechazar activación automática de facturación, recursos fuera de free tier, dominios de pago y pruebas temporales que se convierten en pago. Si no se puede garantizar coste cero, no desplegar hasta decisión del usuario.

### Hosting: alternativas verificadas y lo que falta verificar

Consulta documental: **18/10/2026**. Revalidar inmediatamente antes de contratar/publicar; estos datos no son garantía futura.

| Alternativa | Encaje y contrapartida | Pendiente antes de autorizar |
|---|---|---|
| Render free web + PostgreSQL free temporal | Posible demo de un único servicio sirviendo web y API. Render documenta suspensión por inactividad y expiración de PostgreSQL free a 30 días; no es almacenamiento gratuito duradero. | Cuotas vigentes, cuenta/tarjeta, región, Node/build, TLS DB, conexiones y fechas de expiración; exportar antes de vencer |
| Vercel Hobby para frontend + backend/DB separados | Hobby se limita a uso personal no comercial. No resuelve por sí solo API Nest persistente ni DB; se necesita proxy para que el navegador use un único origen. Más componentes y validación de cookies/rewrites. | Elegibilidad del TFM, backend/DB gratis vigentes, límites, proxy y costes totales; no aprobar solo por frontend gratis |

Fuentes: [Render: servicios gratuitos](https://render.com/docs/free), [Render: primer despliegue](https://render.com/docs/your-first-deploy), [Vercel: Hobby](https://vercel.com/docs/plans/hobby).

No recomendar un proveedor por precio recordado. Si no encaja ninguna alternativa, conservar demo local grabada como contingencia académica, **sin presentarla como cumplimiento de demo pública**; pedir decisión para el requisito pendiente.

## Cierre de la guía

No se ha creado repositorio, instalado software, implementado Nextriva ni desplegado nada al generar este documento. La primera acción del lector es **preámbulo + P00**. La puerta obligatoria antes de negocio es P02: recuperar y validar las fuentes, no rellenar supuestos con código.
