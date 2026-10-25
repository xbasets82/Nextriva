# Home personal de incidencias — Issue #115

**Estado:** implementación local; validación humana e integración pendientes. **Ubicación aprobada:** mejora transversal previa a I10, después de las mejoras de navegación y del cambio de contraseña del Issue #113. Issue [#115](https://github.com/xbasets82/Nextriva/issues/115), `status:approved`. Base `main`: `1aa4d5619d046f8f697e00c847eb9ab8f8dde6d9`.

## Decisión de alcance

La aprobación constituye una excepción acotada a la exclusión histórica de dashboards de AGENTS.md y los diseños funcional/técnico v1.0: únicamente Home de incidencias con gráfico personal o de todas las visibles según el rol, y listado prioritario siempre personal. El refinamiento del gráfico y la retirada del encabezado visible fueron confirmados posteriormente por el usuario en la misma tarea; no se modifica el Issue remoto. Se relaciona con HU07, HU09, HU10 y HU15 sin crear HU16, inventar una microfase I09.x ni alterar I10. Los documentos de referencia históricos se conservan íntegros.

## Comportamiento

- Login sin destino, raíz autenticada y logotipo abren `#/home`. Los destinos internos permitidos y las rutas específicas al recargar se conservan. Inicio está disponible para los tres roles; Usuarios sigue limitado a ADMIN.
- `GET /api/incidents/personal-summary` obtiene identidad exclusivamente de la sesión y devuelve `countsByStatus` de las asignadas, `visibleCountsByStatus` de todas las visibles, `priorityItems` personales y `priorityLimit: 10`. Ambos recuentos contienen los cuatro estados con cero explícito.
- `countsByStatus` exige responsabilidad actual y visibilidad vigente; `visibleCountsByStatus` exige únicamente la visibilidad vigente. ADMIN global; MANAGER requiere vinculación; COLLABORATOR requiere vinculación y autoría o responsabilidad. La responsabilidad es además obligatoria para `countsByStatus` y para la lista prioritaria; nunca se amplía esta lista al alternar el gráfico. Ningún parámetro del cliente amplía el ámbito.
- El top excluye Cerrada. Orden propio: HIGH/MEDIUM/LOW; IN_PROGRESS/OPEN/PENDING_VALIDATION; `createdAt ASC`; `id ASC`. El listado general conserva su ordenación.
- «Ver todas mis incidencias» aplica el filtro de responsable al listado existente. El filtro vive en el estado actual de navegación y se conserva al abrir detalle y volver; no se introduce querystring ni almacenamiento persistente.
- Carga, error/reintento, cero asignadas y ausencia de incidencias activas tienen mensajes accesibles. El gráfico usa SVG local y etiquetas/recuentos textuales junto a cada barra, sin dependencia nueva. Su control accesible «Asignadas a mí» / «Todas visibles» alterna exclusivamente los recuentos recibidos del servidor, sin enviar IDs ni roles y sin cargar incidencias completas. El encabezado visible «Inicio» se elimina; se mantiene un heading `sr-only` «Resumen de incidencias» para jerarquía, región y foco. El enlace Inicio sigue disponible.

## Persistencia, seguridad y costes

Se comparte la política de visibilidad para ORM y SQL. La consulta realiza tres lecturas de datos, dos agregaciones por estado y top con `CASE`/`LIMIT 10`, dentro de un snapshot PostgreSQL `RepeatableRead`; añade una lectura/bloqueo de la identidad vigente. El número de consultas es constante, sin N+1. `Prisma.sql` y los tagged templates parametrizan identificadores de usuario; los alias y el orden son constantes. No hay esquema, migración, entidad ni dependencia nueva. No se fabrica actividad histórica.

## Validación y límites

Unitarias API/web, HTTP con PostgreSQL temporal real, E2E Chromium y controles de calidad. La evidencia observada y la regresión inicial de aislamiento del fixture nuevo y su corrección se registran en [el informe TFM](../tfm/evidencias/2026-10-25-issue-115-personal-home.md). VoiceOver, Safari, Firefox y validación visual humana siguen pendientes. No se declara conformidad WCAG completa.
