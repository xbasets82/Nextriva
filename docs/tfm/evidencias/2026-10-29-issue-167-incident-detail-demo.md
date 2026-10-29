# Issue #167 — Detalle de incidencias y escenarios DEMO

Implementación local de la [Issue #167](https://github.com/xbasets82/Nextriva/issues/167), aprobada por el usuario. Esta evidencia describe el código y las verificaciones locales; no acredita cambios en la DEMO pública. No se han ejecutado migraciones de producción, seeds remotos ni despliegues.

## Resultado funcional

- Diálogo «Aprobar solución» con explicación, botones explícitos, cancelación sin petición, foco y navegación de teclado. Un bloqueo síncrono evita dos envíos en el mismo lote de eventos.
- Creador identificable por nombre y apellidos, conservando la relación con cuentas inactivas. El correo solo se devuelve a ADMIN/MANAGER; COLLABORATOR recibe nombres.
- Validador visible con fecha de aprobación. Cuando existe una instantánea de aprobación, el detalle cerrado utiliza esa identidad inmutable incluso si cambia después el perfil.
- Presentador y validador de ciclos anteriores usan instantáneas registradas, sin consultas por cada usuario. Si no consta la identidad histórica, se muestra «Identidad histórica no registrada»; los UUID no se usan como nombres.
- «Solución aprobada» es un indicador no interactivo con icono verde y nombre accesible. Las acciones de gestión y solución comparten una zona compacta; los iconos de estado/prioridad aumentan solo en el detalle.
- Asignación, inicio, envío de solución, aprobación, publicación de comentario y confirmación de reapertura utilizan el estilo blanco existente. No cambia el botón de crear incidencia ni los botones del resto de la aplicación.

## Identidades, auditoría y compatibilidad

La presentación registra su identidad en `SOLUTION_SUBMITTED`. La aprobación captura al validador en su transacción y conserva la identidad del presentador desde aquella actividad. Si una presentación anterior al cambio carece de instantánea, la nueva aprobación conserva `submittedBy: null`: no reconstruye un nombre histórico desde el perfil vigente.

El ciclo de reapertura mantiene `snapshotVersion: 1` y los campos existentes. Las nuevas aprobaciones añaden metadatos opcionales a `approvedCycle`: `identitySnapshotVersion: 1`, `submittedBy` y `validatedBy`. Las actividades históricas permanecen intactas; no hay backfill, nuevas entidades ni migración Prisma.

El cliente anterior acepta el discriminante exterior 1 e ignora propiedades adicionales. Por tanto, mantiene su lectura operativa del ciclo. Un consumidor externo que valide literalmente el antiguo OpenAPI con `additionalProperties: false` necesitará actualizar el contrato. El cliente tipado del repositorio se regenera con `openapi-typescript@7.10.1` y se comprueba su reproducibilidad.

Los nombres del creador se consultan desde su cuenta vigente conservada, no se presentan como un snapshot de su nombre al crear. Para cierres antiguos sin instantánea de validador se conserva la relación autorizada existente; sus datos de perfil son actuales. Los ciclos históricos sin snapshot no se reinterpretan.

La proyección de correo se aplica en servidor tanto a las relaciones actuales como a las identidades anidadas de actividades. La consulta sigue autorizando la incidencia antes de devolver cualquier información. La escritura de negocio y de auditoría permanece en la misma transacción, con las políticas de validación independiente vigentes.

## Escenarios DEMO aditivos

El bootstrap original conserva su requisito de base marcada y vacía. El modo `--enrich` es independiente de ese bootstrap y exige `NEXTRIVA_DEMO_CONFIRM='ENRICH OWNED DEMO'`, modo DEMO, destino permitido y el marcador `nextriva:demo:initialized:v1`. CI/test se rechaza en el comando público; las pruebas llaman a la operación interna sobre una base temporal propia.

El enriquecimiento reutiliza las tres cuentas ficticias existentes con sus credenciales externas, sin crear cuentas ni tocar hashes, contraseñas, roles o usuarios manuales. Añade:

| Datos                 | Cantidad nueva |
| --------------------- | -------------: |
| Promociones ficticias |              6 |
| Incidencias           |             25 |
| Comentarios           |             50 |
| Actividades           |            185 |

Los escenarios representan las siete fases, promociones activas y archivadas, una promoción sin incidencias, tres prioridades, cuatro estados, rechazo motivado, aprobación independiente y reapertura con nueva revisión e instantánea anterior. Los responsables alternan entre gestión y colaboración. Las direcciones y descripciones son ficticias y los nombres de promoción se identifican con `DEMO —`; sus descripciones llevan `[DEMO-167]`.

Los UUID se generan de manera determinista en un espacio propio. Una segunda ejecución crea cero registros y preserva los existentes. Se comprueban el marcador, las cuentas esperadas y la propiedad de promociones/incidencias; una colisión ajena aborta la transacción. Las fechas de promoción preceden a las incidencias; las actividades y comentarios utilizan fechas UTC controladas. El seed de desarrollo permanece separado.

### Operación futura, pendiente de autorización

El código está preparado para ejecutar el siguiente comando desde la raíz, **solo después** de inventariar la DEMO real, confirmar las cuentas y el destino, disponer de copia recuperable y obtener permiso específico. Las variables privadas se suministran mediante la configuración segura del entorno; no se incluyen valores de credenciales en la documentación.

```sh
mise exec -- pnpm build
NEXTRIVA_DEMO_CONFIRM='ENRICH OWNED DEMO' node apps/api/dist/src/demo-seed/demo-seed.command.js --enrich
```

La operación adquiere bloqueos exclusivos de tablas durante la transacción. Su ejecución remota requiere acordar la ventana y verificar el resultado; aprobar el código no autoriza ejecutarla. No hay borrado ni actualización de datos existentes, ni migraciones automáticas.

## Evidencia TDD observada

Todos los comandos usan `mise exec --` para Node 24.22.0 y pnpm 10.34.7.

| Prueba/comportamiento                     | RED observado (salida 1)                                               | GREEN/refactor                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Diálogo e identidades en detalle          | No existía el diálogo con el título solicitado; no aparecía el creador | Pruebas web de #167 superadas                                      |
| Doble confirmación en un lote de eventos  | 2 peticiones CSRF en lugar de 1                                        | Bloqueo mediante referencia síncrona; una petición                 |
| Identidad de validador después de aprobar | No se encontraba el nombre tras la mutación                            | Recarga informativa del detalle con comprobación de versión y ruta |
| Relaciones e historial HTTP               | `detail.incident.createdBy` era `undefined`                            | Relaciones autorizadas y snapshots en PostgreSQL                   |
| Validador de cierre tras editar perfil    | Se devolvía `Changed validator` en lugar del nombre registrado         | El detalle prefiere la instantánea de aprobación                   |
| Presentación legacy sin snapshot          | Se devolvía el perfil actual en lugar de `null`                        | No se reconstruye la identidad histórica                           |
| Compatibilidad del ciclo                  | Discriminante exterior 2 frente al 1 esperado                          | Extensión aditiva dentro de `approvedCycle`                        |
| Confirmación del seed aditivo             | Se aceptaba la confirmación de inicialización para enriquecer          | Confirmación específica obligatoria                                |
| Enriquecimiento de base inicializada      | Se rechazaba como base no vacía                                        | Modo aditivo con propiedad de datos e idempotencia                 |
| Conteos de reejecución                    | Se informaban 6 promociones pese a no crear ninguna                    | Conteos de nuevas escrituras; segunda ejecución a cero             |
| Cronología sintética                      | Incidencias anteriores a la creación de su promoción                   | Fechas controladas y coherentes                                    |

El primer intento con `pnpm` del sistema falló por versiones de herramientas antes de ejecutar pruebas; **no se considera RED funcional**. La primera ejecución E2E detectó una aserción ambigua entre creador y responsable con el mismo nombre ficticio; se acotó a «Creada por», conservando las comprobaciones de ambos papeles.

El refactor separó construcción de escenarios, validación de propiedad y persistencia; ESLint/SonarJS se mantiene activo sin supresiones. Los cambios exclusivamente visuales se verifican con las regresiones de interacción y responsive, no mediante tests que dupliquen clases CSS.

## Verificaciones finales

Las siguientes verificaciones corresponden al estado final del código. Integración, cobertura API y E2E se ejecutaron en secuencia, sin compartir simultáneamente la generación de Prisma. Los runners verifican el destino temporal y limpian sus bases; no se utilizó `nextriva_dev`.

| Comando real desde la raíz                                                 | Resultado observado                                                                                            | Código |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -----: |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                   | 416 pruebas superadas; líneas 95,56 %, ramas 90,12 %, funciones 96,42 %, sentencias 94,58 %                    |      0 |
| `mise exec -- pnpm --filter @nextriva/api test`                            | 324 pruebas superadas                                                                                          |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:integration`                | 271 superadas, 2 omitidas por modos especializados, PostgreSQL real temporal                                   |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:coverage`                   | 595 superadas, 2 omitidas; líneas 91,78 %, ramas 87,37 %, funciones 94,98 %, sentencias 90,46 %                |      0 |
| `mise exec -- node scripts/test-integration.mjs --isolated-validator-test` | El único validador independiente elegible no puede ser el propio presentador: 1 superada; 138 no seleccionadas |      0 |
| `mise exec -- pnpm --filter @nextriva/api test:e2e`                        | 77 superadas; dos sesiones, aprobación/reapertura real, snapshots, correo por rol y móvil                      |      0 |
| `mise exec -- pnpm api:types`                                              | Cliente regenerado con versión fijada                                                                          |      0 |
| `mise exec -- pnpm api:types:check`                                        | Diff reproducible sin diferencias                                                                              |      0 |
| `mise exec -- pnpm typecheck`                                              | API y web sin errores                                                                                          |      0 |
| `mise exec -- pnpm lint`                                                   | ESLint/SonarJS sin errores ni supresiones nuevas                                                               |      0 |
| `mise exec -- pnpm format:check`                                           | Formato de código comprobado                                                                                   |      0 |
| `mise exec -- pnpm build`                                                  | API y web de producción construidas                                                                            |      0 |
| `git diff --check`                                                         | Sin errores de espacios                                                                                        |      0 |
| `mise exec -- pnpm audit --json` y `scripts/check-audit-baseline.mjs`      | Auditoría con una vulnerabilidad alta ya aceptada temporalmente; baseline aprobado                             |  1 / 0 |

La omisión del escenario del único validador se cubrió mediante su modo aislado. La suite especializada de backup/restauración no se ejecutó: no cambia el mecanismo de copia, el esquema PostgreSQL ni el procedimiento de restauración. La cobertura medida supera los umbrales vigentes; no equivale a demostrar el 100 % de situaciones posibles.

La excepción de auditoría vigente es `GHSA-q7qp-rjg7-q26m`, `multer@2.4.0`, transitiva de `@nestjs/platform-express`, alta, con vencimiento el 23/11/2026. No se añadieron dependencias ni se amplió esa excepción. No se han incorporado adjuntos ni rutas de subida.

La evidencia RED/GREEN cubre identidades, privacidad, legado, aprobación independiente y seed aditivo; E2E comprueba nombres accesibles, foco, cancelación, el flujo real y ausencia de desbordamiento móvil. La revisión visual y funcional del usuario sigue pendiente. Resultado técnico: **APTO para validación local**; commit y publicación de #167 pendientes de autorización posterior.

## Validación manual

1. Abrir una incidencia como ADMIN/MANAGER y comprobar «Creada por», nombre/correo y la zona agrupada de acciones. Como COLLABORATOR autorizado deben verse nombres sin correos de las nuevas identidades.
2. En una Pendiente de validación presentada por otra persona, abrir «Aprobar solución». Cancelar y comprobar que sigue pendiente; volver a abrir, confirmar y comprobar un solo cierre y su validador/fecha.
3. Reabrir un cierre nuevo y consultar su solución anterior: deben aparecer las identidades capturadas. Un ciclo antiguo sin snapshot debe mostrar la ausencia de identidad, sin UUID. Cambiar después un perfil no debe reescribir esas identidades.
4. Repetir en móvil, con Tab, Shift+Tab, Escape y Enter; comprobar ausencia de desbordamientos y que las acciones prohibidas siguen ocultas y rechazadas en servidor.
5. Los escenarios DEMO adicionales se inspeccionarán después de autorizar su carga en el destino concreto. No se afirma que ya estén en la instancia pública.

## Definition of Done y límites

- Alcance: HU07/HU09–HU14 y preparación de la demostración aprobada en #167; sin nuevas reglas de negocio.
- Seguridad e integridad: autorizaciones y aprobación independiente conservadas; identidades/correos proyectados por rol; seed sin sobrescritura ni borrado.
- Migraciones: no aplicable, no cambia Prisma ni el esquema de tablas. La ampliación se limita al JSON de actividades y OpenAPI.
- TDD: evidencia observada en la tabla; estilo visual con verificación proporcional, sin simular RED.
- API/cliente: ampliación documentada y tipos regenerados; compatibilidad de validadores externos estrictos declarada.
- Producción: no aplicable a esta validación local. No se ejecuta seed, migración, E2E mutable ni despliegue remoto.
- Validación humana: pendiente. Commit, push y PR de #167 requieren autorización posterior.
