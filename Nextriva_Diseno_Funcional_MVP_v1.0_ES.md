# Nextriva — Diseño funcional del MVP

**Proyecto:** TFM IA · Nextriva  
**Documento:** DF-MVP-01 · Especificación funcional consolidada  
**Versión:** 1.0  
**Fecha:** 18/10/2026  
**Estado:** Alcance funcional consolidado (sujeto a validación durante la implementación)  

## 1. Propósito y visión de producto

Nextriva es una futura plataforma web colaborativa para promotoras inmobiliarias que permitirá gestionar problemas, incidencias, cambios, documentación y comunicaciones **desde la planificación hasta la posventa**. La visión completa da la misma importancia a la coordinación operativa interna que a la relación con el comprador.

**Objetivo exclusivo del MVP del TFM:** demostrar un flujo completo de **registro, asignación, colaboración, resolución, validación y trazabilidad de incidencias** en distintas fases de una promoción. El MVP **no es** todavía una plataforma integral de gestión inmobiliaria.

La IA se utilizará como herramienta de apoyo al proceso de desarrollo y evaluación del TFM; **no es necesario integrar funcionalidades de IA en el producto**.

## 2. Alcance del MVP — compromiso de entrega

### 2.1. Incluido

| Ámbito | Capacidad incluida |
|---|---|
| Organización | **Una única promotora**, con múltiples promociones |
| Usuarios | Autenticación, cierre de sesión, alta/edición/activación/desactivación de usuarios administrada |
| Roles | **Administrador, gestor y colaborador**, un rol global por usuario |
| Promociones | Alta, consulta, edición, fases activas simultáneas, archivo/reactivación |
| Participantes | Asignación y retirada de usuarios de las promociones |
| Incidencias | Alta, consulta, edición acotada, categoría, prioridad, fase de origen, asignación/reasignación |
| Flujo de estados | **Abierta → En curso → Pendiente de validación → Cerrada**; el rechazo de la validación devuelve a En curso |
| Resolución | Texto de solución, borrador, envío a validación, aceptación/rechazo justificado |
| Colaboración | Comentarios internos, con autor y fecha |
| Trazabilidad | Historial inmutable de operaciones relevantes sobre incidencias |
| Consulta | Listado, búsqueda por ID/título, filtros, ordenación y paginación |
| Interfaz | Web responsive; listado de promociones, listado de incidencias y detalle de incidencia como tres vistas centrales; formularios auxiliares |
| Seguridad básica | Autorización por rol **y recurso**, validación de datos en el servidor, gestión de sesiones, control básico de concurrencia |

### 2.2. Excluido del MVP (backlog posterior)

- Multi-tenancy y administración SaaS de varias promotoras.
- Portal del comprador; gestión detallada de compradores, viviendas, bloques y plantas.
- Comercialización, ventas, reservas y porcentajes de venta automáticos.
- Gestión **formal** de cambios, aprobaciones de cambios y análisis de impacto.
- Gestión documental avanzada, versiones de planos, BIM y adjuntos como requisito de la entrega mínima.
- Inspecciones/checklists de preentrega, actas de entrega y garantías avanzadas.
- Notificaciones automáticas por correo, mensajería, dashboard e informes analíticos.
- Configuración dinámica de roles, categorías, fases y flujos de estado.
- Tareas independientes, planificación de obra, costes, facturación, firmas y app móvil nativa.
- Reapertura de incidencias cerradas y edición/eliminación ordinaria de comentarios o historial.
- Dark mode como funcionalidad comprometida; se puede facilitar con tokens de diseño.

**Regla de alcance:** cualquier elemento excluido se registrará en el backlog futuro y no se incorporará al compromiso del TFM sin una decisión explícita de cambio de alcance.

## 3. Ciclo de vida de la promoción (contexto transversal)

1. **Planificación y planos básicos**.
2. **Comercialización** (con hito de venta mínima X % en la visión completa).
3. **Proyecto ejecutivo / planos definitivos**.
4. **Construcción** (puede coincidir con la comercialización).
5. **Preentrega** (revisiones e incidencias previas).
6. **Entrega**.
7. **Posventa**.

Para el MVP, una promoción puede tener **varias fases activas** seleccionadas manualmente. La fase de origen de una incidencia es obligatoria, histórica e inmutable, aunque no coincida con las fases activas actuales. No se implementan transiciones de fase automáticas ni la condición de venta X %.

## 4. Actores y autorización

### 4.1. Roles del MVP

| Rol | Ámbito | Responsabilidad |
|---|---|---|
| **Administrador** | Todas las promociones de la única promotora | Usuarios, promociones, participantes, incidencias y validaciones |
| **Gestor** | Promociones asignadas | Gestión de participantes colaboradores, incidencias, asignaciones y validaciones |
| **Colaborador** | Promociones asignadas; incidencias creadas o asignadas | Registro, consulta, comentarios y resolución cuando es responsable |

Los ocho perfiles de la visión final (administrador SaaS, administrador de promotora, técnico, arquitecto/ingenieros, jefe de obra, equipo comercial, comprador y colaborador externo) **no se desarrollan como ocho roles** en el MVP.

### 4.2. Matriz de permisos consolidada

Leyenda: **Sí**, **Cond.** (sujeto a promoción/incidencia, estado y reglas), **No**.

| Operación | Administrador | Gestor | Colaborador |
|---|:---:|:---:|:---:|
| Iniciar/cerrar sesión y ver el perfil propio | Sí | Sí | Sí |
| Crear/editar/activar/desactivar usuarios; cambiar rol | Cond. | No | No |
| Crear/editar/archivar/reactivar promoción | Sí | No | No |
| Consultar promociones | Sí | Cond. | Cond. |
| Consultar participantes | Sí | Cond. | Cond. |
| Asignar/retirar participantes | Sí | Cond. (solo colaboradores) | No |
| Crear incidencia | Cond. | Cond. | Cond. |
| Consultar incidencias e historial | Sí | Cond. | Cond. |
| Editar datos generales de la incidencia | Cond. | Cond. | No |
| Asignar/reasignar responsable | Cond. | Cond. | No |
| Iniciar resolución | Cond. | Cond. | Cond. (si es responsable) |
| Escribir comentario | Cond. | Cond. | Cond. |
| Documentar solución y enviar a validación | Cond. (si es responsable) | Cond. (si es responsable) | Cond. (si es responsable) |
| Validar/rechazar resolución y cerrar | Cond. | Cond. | No |
| Borrar incidencia, comentarios o historial | No | No | No |

**Condiciones de visibilidad:** administrador: todas las incidencias; gestor: todas las de promociones asignadas; colaborador: solo las que **ha creado o tiene asignadas**, siempre que mantenga la vinculación con la promoción. Todos los controles se comprueban en el backend, también en accesos directos por URL/API.

**Validación independiente aprobada:** quien ha presentado una solución **no puede validarla**. Un administrador puede validar cualquier promoción si no es quien ha presentado esa solución. Antes de enviar a validación, debe existir un usuario activo y elegible distinto del presentador.

## 5. Datos funcionales básicos

### 5.1. Usuario

Nombre (2–100 caracteres), apellidos (2–150), correo electrónico válido y único, rol global, estado activo/inactivo. Identificador interno estable distinto del correo. No hay registro público; el primer administrador se crea durante la inicialización segura del sistema.

### 5.2. Promoción

Nombre (3–150 caracteres), descripción opcional (≤1.000), ubicación opcional (≤200), una o más fases activas cuando está activa, estado **activa/archivada**, participantes. Sin bloques ni fichas de viviendas en el MVP.

### 5.3. Incidencia

| Campo | Regla |
|---|---|
| Identificador interno y código visible | Generados por el sistema, únicos e inmutables (p. ej. `INC-000125`) |
| Promoción | Obligatoria; inmutable después de crear |
| Título | Obligatorio; 5–150 caracteres |
| Descripción | Obligatoria; 10–5.000 caracteres |
| Fase de origen | Obligatoria; una de las siete; inmutable |
| Categoría | Obligatoria; catálogo predefinido |
| Prioridad | Obligatoria; baja/media/alta |
| Estado | Automático, inicialmente **Abierta** |
| Creador y fecha | Asignados por el servidor, inmutables |
| Responsable principal | Cero o un usuario elegible; inicialmente puede estar vacío |
| Solución | Texto ≤5.000; necesaria para presentar la resolución |
| Validación/cierre | Autor y fecha generados por el servidor |

La edición general solo permite título, descripción, categoría y prioridad.

### 5.4. Comentario y auditoría

- **Comentario:** texto no vacío ≤2.000 caracteres, autor, fecha, incidencia; no editable/eliminable desde el MVP.
- **Historial:** registro separado, con acción, autor, fecha e información anterior/nueva pertinente; las modificaciones y el registro de auditoría deben ser atómicos.

## 6. Reglas de negocio definitivas

### 6.1. Usuarios y participantes

- Solo los usuarios activos y autenticados pueden operar; la desactivación revoca el acceso y las sesiones existentes.
- Solo el administrador gestiona cuentas y roles; no puede desactivar o degradar al último administrador activo.
- No se puede desactivar, degradar ni retirar de la promoción a un responsable con incidencias no cerradas; primero hay que reasignarlas.
- Ningún cambio de usuario, rol o asignación puede dejar una incidencia **pendiente de validación** sin ningún validador elegible distinto de quien ha presentado la solución.
- El administrador tiene acceso global y puede ser responsable sin estar añadido manualmente a una promoción.
- Los gestores pueden añadir o retirar **colaboradores** solo en sus promociones; el administrador gestiona cualquier participante.
- No se pueden duplicar vinculaciones usuario-promoción. La retirada revoca el acceso, pero conserva la autoría histórica.
- Una promoción puede no tener gestor asignado: el administrador asume su supervisión.

### 6.2. Promociones

- La promoción activa tiene al menos una fase activa; se permiten fases simultáneas.
- El archivo requiere confirmación y **suspende las operaciones ordinarias** sobre incidencias, sin cambiar estados, asignaciones ni historial.
- El administrador puede reactivar una promoción; las incidencias reanudan las operaciones que les permite su estado.
- No hay eliminación física desde la aplicación.

### 6.3. Incidencias y responsables

- Solo se crean incidencias en promociones activas y accesibles; pueden crearse sin responsable.
- Responsable: usuario activo, con acceso a la promoción (o administrador global). Un único responsable principal.
- Asignar/reasignar es posible **solo en estado Abierta o En curso**; reasignar no cambia el estado automáticamente.
- Editar datos generales solo es posible **en Abierta o En curso**, por un administrador/gestor autorizado.
- Promoción, fase de origen, creador, fecha e identificador de una incidencia son inmutables.
- Incidencias cerradas: consulta sí; edición, reapertura, comentarios, asignación y transiciones no.
- La edición concurrente no debe sobrescribir silenciosamente cambios de otros usuarios.

### 6.4. Máquina de estados

| Estado actual | Acción | Estado nuevo | Condiciones adicionales |
|---|---|---|---|
| **Abierta** | Iniciar resolución | **En curso** | Responsable asignado; responsable o gestor/administrador autorizado |
| **En curso** | Enviar a validación | **Pendiente de validación** | Lo hace el responsable; solución no vacía; existe un validador distinto |
| **Pendiente de validación** | Rechazar | **En curso** | Gestor/administrador autorizado, distinto del presentador; motivo 5–2.000 caracteres |
| **Pendiente de validación** | Validar y cerrar | **Cerrada** | Gestor/administrador autorizado, distinto del presentador |

**Ninguna otra transición** es válida. Promoción activa y autorización son condiciones de todas las transiciones.

- En **En curso**, el responsable puede guardar/modificar el borrador de solución.
- En **Pendiente de validación**, se bloquean la edición de datos generales, la solución y la reasignación; se permiten comentarios autorizados.
- Un rechazo conserva la solución anterior y permite revisarla una vez que la incidencia ha vuelto a **En curso**.
- Validar registra autor y fecha, y bloquea definitivamente la incidencia en el MVP.

### 6.5. Comentarios, historial y consulta

- Los comentarios son internos, accesibles a los usuarios autorizados; solo se añaden en incidencias no cerradas de promociones activas.
- Comentarios e historial son registros **diferentes**; no es necesaria una línea temporal unificada.
- El historial registra creación, edición de campos, asignación/reasignación, estados, edición de solución, rechazo y cierre; no se puede editar/eliminar funcionalmente.
- La búsqueda se limita al código y al título (sin diferenciar mayúsculas/minúsculas). Filtros combinables: promoción, estado, prioridad, categoría, responsable. Ordenación inicial: más recientes primero. Con paginación.
- Los filtros y los parámetros de la URL **nunca amplían** los permisos.

## 7. Backlog funcional — 15 historias aprobadas

| ID | Historia | Prioridad | Aceptación resumida |
|---|---|---|---|
| HU01 | Iniciar/cerrar sesión | P0 | Autenticación, sesión válida, errores genéricos, denegación de recursos privados |
| HU02 | Gestionar usuarios | P0 | Crear, editar, activar/desactivar, rol, email único, restricciones de último administrador y responsabilidades abiertas |
| HU03 | Gestionar promociones | P0 | Crear, editar, fases múltiples, archivar/reactivar sin perder registros |
| HU04 | Asignar participantes | P0 | Asignaciones sin duplicados, limitación por rol, revocación segura, bloqueo si hay incidencias asignadas |
| HU05 | Consultar promociones | P0 | Listado/detalle según promociones accesibles; consulta de archivadas |
| HU06 | Crear incidencia | P0 | Campos obligatorios, fase de origen, estado inicial Abierta, autor y fecha automáticos, control de promoción |
| HU07 | Consultar incidencias | P0 | Listado/detalle solo de las accesibles, incluidas las cerradas en modo lectura |
| HU08 | Editar incidencias | P0 | Solo campos editables, autorizaciones, estados Abierta/En curso, historial y concurrencia |
| HU09 | Asignar responsables | P0 | Usuario elegible, asignación/reasignación solo Abierta/En curso, registro de actividad |
| HU10 | Cambiar estados | P0 | Solo transiciones válidas y usuarios autorizados; responsable obligatorio para iniciar |
| HU11 | Añadir comentarios | P0 | Texto válido, autor/fecha, visibilidad restringida, inmutabilidad, no comentar en Cerrada |
| HU12 | Documentar solución | P0 | Borrador en En curso, solución obligatoria para enviar, validador distinto disponible |
| HU13 | Validar/cerrar | P0 | Validador distinto del presentador, rechazo con motivo, cierre auditado |
| HU14 | Consultar historial | P0 | Actividad automática, cronológica, inmutable, permisos coherentes |
| HU15 | Buscar y filtrar | P1 | Búsqueda textual, filtros combinados, paginación, respeto a los permisos |

**Criterio de cierre de una historia:** funcionamiento implementado, validaciones, permisos en el servidor, persistencia coherente, errores previstos, pruebas automatizadas aplicables y criterios de aceptación superados.

## 8. Navegación y pantallas

### 8.1. Estructura

```text
Login
└── Aplicación (menú lateral en escritorio, adaptable al móvil)
    ├── Incidencias [pantalla inicial]
    │   ├── Listado + búsqueda + filtros
    │   ├── Crear / Editar incidencia
    │   └── Detalle
    │       ├── Descripción, categoría, fase, prioridad, responsable y estado
    │       ├── Comentarios
    │       ├── Historial
    │       └── Solución y acciones contextuales
    ├── Promociones
    │   ├── Listado de tarjetas
    │   ├── Crear / Editar promoción
    │   └── Detalle + participantes + acceso a incidencias filtradas
    └── Administración (solo administrador)
        └── Usuarios (listado, crear, editar, activar/desactivar)
```

### 8.2. Tres pantallas fundamentales

1. **Promociones:** tarjetas con nombre, ubicación, fases y recuento de incidencias accesibles no cerradas. Entrada a incidencias filtradas por promoción.
2. **Incidencias:** tabla de escritorio; tarjetas en móvil; búsqueda, filtros y nueva incidencia. Esta es la página de entrada después del login.
3. **Detalle de incidencia:** cabecera de contexto; descripción y pestañas Comentarios/Historial; columna de información y acciones de responsable/estado; en móvil pasa a una columna.

Cada incidencia tiene una URL propia; los filtros del listado se pueden conservar en la URL. No hay dashboard ni centro de notificaciones en el MVP.

## 9. Formularios y validaciones

| Formulario | Campos principales | Acción y resultado |
|---|---|---|
| Login | Email, contraseña | Iniciar sesión → incidencias; error de autenticación genérico |
| Crear/editar usuario | Nombre, apellidos, email, rol | Guardar → listado; activar/desactivar como acción separada |
| Crear/editar promoción | Nombre, descripción, ubicación, fases activas | Guardar → detalle; archivar/reactivar en acción independiente |
| Añadir participante | Usuario activo elegible | Asignar; retirar con confirmación |
| Crear incidencia | Promoción, título, descripción, fase, categoría, prioridad | Crear → detalle con ID y estado Abierta |
| Editar incidencia | Título, descripción, categoría, prioridad | Guardar → detalle y entrada en el historial |
| Asignar responsable | Usuario elegible | Asignar/reasignar; historial |
| Añadir comentario | Texto 1–2.000 | Publicar sin salir de la página |
| Documentar solución | Texto ≤5.000 | Guardar borrador o enviar a validación |
| Validar y cerrar | Confirmación | Registra al validador y cierra |
| Rechazar resolución | Motivo 5–2.000 | Devuelve a En curso, registra el motivo |
| Búsqueda y filtros | ID/título, promoción, estado, prioridad, categoría, responsable | Actualización de resultados autorizados |

**Validación visual común:** campos obligatorios marcados, errores junto al campo, conservación de datos en caso de error, desactivación del botón mientras se envía, notificación discreta de éxito, confirmación para descartar cambios. El backend repite todas las validaciones.

### 9.1. Mensajes de error de referencia

| Situación | Texto propuesto |
|---|---|
| Campo obligatorio | «Completa este campo.» (preferentemente con el nombre del campo) |
| Email inválido | «Introduce una dirección de correo válida.» |
| Email duplicado | «Ya existe un usuario con este correo electrónico.» |
| Acceso denegado | «No tienes permisos para realizar esta operación.» |
| Promoción archivada | «No se pueden modificar registros de una promoción archivada.» |
| Solución vacía | «Describe la solución aplicada antes de enviarla a validación.» |
| Sin responsable | «Asigna un responsable antes de iniciar la resolución.» |
| Autovalidación | «No puedes validar una solución que has presentado tú mismo.» |
| Ningún validador disponible | «Se necesita otro usuario autorizado para validar esta solución.» |
| Motivo de rechazo vacío | «Indica por qué rechazas la resolución.» |
| Registro modificado por otra persona | «Los datos han cambiado. Actualiza la información antes de continuar.» |
| Sesión caducada | «La sesión ha caducado. Vuelve a iniciar sesión.» |
| Error inesperado | «No se ha podido completar la operación. Vuelve a intentarlo.» |

### 9.2. Confirmaciones

- **Requieren diálogo:** desactivar usuario, retirar participante, archivar promoción, validar y cerrar incidencia, descartar formulario con cambios sin guardar.
- **Sin diálogo adicional:** guardar formulario, asignar responsable, publicar comentario, iniciar resolución, enviar a validación, rechazar con motivo obligatorio.
- **Después del éxito:** aviso breve («Incidencia creada correctamente», «Comentario publicado», «Resolución enviada a validación», etc.).

## 10. Pruebas de coherencia prioritarias

| ID | Prueba | Esperado |
|---|---|---|
| VC01 | Colaborador consulta una incidencia ajena | Denegado |
| VC02 | Gestor accede a una promoción no asignada | Denegado |
| VC03 | Crear incidencia sin responsable | Permitido (Abierta) |
| VC04 | Iniciar resolución sin responsable | Denegado |
| VC05 | Gestor inicia resolución con responsable asignado | Permitido |
| VC06 | Colaborador edita datos generales | Denegado |
| VC07 | Responsable registra solución en En curso | Permitido |
| VC08 | Enviar a validación sin solución | Denegado |
| VC09 | Enviar a validación sin validador distinto | Denegado |
| VC10 | Presentador valida su propia solución | Denegado |
| VC11 | Otro gestor/admin elegible valida | Permitido |
| VC12 | Reasignar en Pendiente de validación | Denegado |
| VC13 | Editar datos en Pendiente de validación | Denegado |
| VC14 | Rechazar sin justificación | Denegado |
| VC15 | Rechazar con justificación | Devuelve a En curso |
| VC16 | Modificar incidencia Cerrada | Denegado |
| VC17 | Desactivar/retirar responsable con incidencias abiertas | Denegado |
| VC18 | Archivar promoción con incidencias abiertas | Permitido con confirmación; bloqueo de operaciones |
| VC19 | Modificar incidencia en promoción archivada | Denegado |
| VC20 | Reactivar promoción | Vuelve a permitir las operaciones válidas |
| VC21 | Consultar incidencia cerrada con permisos | Permitido |
| VC22 | Edición concurrente sobre una incidencia | Conflicto detectado, sin sobrescritura silenciosa |
| VC23 | Cambiar rol elimina al único validador elegible | Denegado |
| VC24 | Desactivar usuario con sesión abierta | Acceso revocado |

## 11. Iteraciones propuestas

| Iteración | HU | Resultado |
|---|---|---|
| 1. Base | HU01–HU05 | Usuarios, roles, promociones y participantes |
| 2. Incidencias | HU06–HU09 | Crear, consultar, editar y asignar incidencias |
| 3. Resolución | HU10–HU13 | Estados, comentarios, soluciones y validación |
| 4. Trazabilidad y búsqueda | HU14–HU15 | Historial visible, búsqueda, filtros y estabilización |

**Nota técnico-funcional:** la auditoría y la autorización deben implementarse desde las primeras operaciones que las requieran, aunque la pantalla de historial llegue en la cuarta iteración.

## 12. Requisitos no funcionales mínimos

- Autenticación y autorización comprobadas en el servidor.
- Protección de sesiones y mensajes de error que no expongan secretos ni información técnica interna.
- Web responsive, navegación con teclado, etiquetas de formulario y errores accesibles; WCAG 2.2 AA como referencia.
- Persistencia de datos e integridad entre incidencia, responsable, promoción y auditoría.
- Concurrencia optimista para modificaciones de incidencias.
- Pruebas automatizadas de los comportamientos y permisos críticos; documentación de las decisiones técnicas y de la API.
- Despliegue demostrable del MVP.

No se definen todavía un framework, una base de datos o una infraestructura concretos: corresponden al diseño técnico.

## 13. Criterios de salida del MVP

El MVP será funcionalmente aceptable si una demostración con usuarios de distintos roles permite:

1. Crear y consultar promociones y asignar participantes.
2. Registrar una incidencia en cualquier fase, sin necesidad de viviendas definidas.
3. Asignar un responsable e iniciar su resolución.
4. Debatir la incidencia en comentarios.
5. Documentar la solución y enviarla a revisión.
6. Validarla **por otra persona autorizada**, o rechazarla con justificación.
7. Cerrarla, consultar su solución y recuperar el historial íntegro.
8. Comprobar que un usuario sin permisos no puede ver ni manipular recursos ajenos.
9. Buscar y filtrar las incidencias accesibles.
10. Superar las pruebas de coherencia críticas y conservar registros al archivar/reactivar promociones.

## 14. Decisiones de coherencia aplicadas

Se han aceptado e incorporado los ajustes identificados en la validación final:

- **AC01:** validación por un usuario distinto del presentador; existencia de un validador elegible.
- **AC02:** las promociones pueden quedar sin gestor; el administrador asume la supervisión.
- **AC03:** bloqueo de reasignación en Pendiente de validación.
- **AC04:** bloqueo de edición general en Pendiente de validación.
- **AC05:** el cambio de rol no puede dejar responsabilidades o validaciones sin cobertura.
- **AC06:** comentarios e historial diferenciados.
- **AC07:** el archivo suspende operaciones, sin alterar incidencias ni asignaciones.

### Principio de control del alcance

La versión **1.0** constituye la referencia funcional del TFM. Nuevos módulos, nuevas pantallas o comportamientos ajenos a las 15 HU se considerarán mejoras posteriores, salvo que sean indispensables para corregir una incoherencia de la versión aprobada.

---

**Siguiente documento previsto:** diseño técnico y selección justificada de tecnologías, partiendo de este alcance sin ampliarlo.
