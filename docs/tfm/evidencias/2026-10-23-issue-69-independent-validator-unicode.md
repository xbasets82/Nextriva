# Evidencia TFM — Issue #69: validador independiente y longitud Unicode

## Alcance y trazabilidad

- Corrección aprobada en Issue #69, vinculada a I07.2 / HU12 e invariantes de I02/I04. El usuario autorizó implementarla en `codex/i07-2-incident-solution`, conservando el trabajo de Issue #68 y preparando una única PR conjunta.
- No incorpora aprobación, rechazo ni cierre de I07.3, nuevas entidades, migraciones adicionales o dependencias.
- Esta evidencia complementa [I07.2](2026-10-23-i07-2-incident-solution.md). Conserva sus limitaciones TDD históricas; no reconstruye fases anteriores.

## Causa y corrección

El envío comprobaba que existiera un ADMIN activo global o MANAGER activo vinculado, distinto del presentador. Posteriormente, I02/I04 podían desactivar, degradar o retirar al único validador porque sus comprobaciones solo protegían a los responsables de incidencias no cerradas.

Se añade una colaboración transaccional de Incidents que detecta si el cambio deja alguna incidencia pendiente afectada sin otro candidato. Se comprueba después del cambio de usuario o de vinculación, antes del commit; el conflicto 409 revierte la operación completa, incluidas sus fechas y posibles revocaciones. No se modifican la incidencia ni sus actividades al rechazar la operación.

`submitSolution` y la administración de usuarios ya tomaban el advisory lock transaccional `210021`. La retirada de participantes ahora lo adquiere también, antes de bloquear promoción y usuario. Así, el envío y las operaciones que reducen la elegibilidad se serializan y vuelven a comprobar el estado confirmado por la operación anterior. Las altas de participantes solo amplían el conjunto de candidatos. La excepción global de ADMIN se mantiene: retirar su vinculación opcional no elimina su elegibilidad.

El formulario usaba `maxlength=5000`, que limita unidades UTF-16. La API cuenta puntos de código: 5.000 emojis de par sustituto son válidos, aunque ocupen 10.000 unidades UTF-16. Se retira esa restricción nativa y se valida el mismo máximo de 5.000 puntos de código antes de guardar/enviar, con error anunciado, asociación al campo y foco. El servidor sigue aplicando su propia validación.

Referencias consultadas: [bloqueos explícitos y advisory locks de PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) y [atributo maxlength del estándar HTML](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#limiting-user-input-length:-the-maxlength-attribute). La disciplina de orden de bloqueo y su cobertura por todos los escritores es responsabilidad de la aplicación.

## TDD realmente observado

| Ciclo           | RED observado                                                                                                                                                                                                                                                                                                              | GREEN y refactor                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Único validador | Tras corregir exclusivamente problemas de preparación y limpieza del nuevo fixture, la integración real falló en tres casos: desactivar/degradar devolvía 200 y retirar devolvía 204, en lugar de 409. Comando `mise exec -- pnpm --filter @nextriva/api test:integration`, salida 1: 3 fallidas, 169 pasadas y 1 omitida. | Se añadió la comprobación transaccional compartida y el bloqueo previo a la retirada. La suite pasó con 172 pruebas y 1 omisión dedicada, salida 0. Posteriormente se ampliaron carreras y límites, sin atribuirles un RED histórico: 182 pasadas y 1 omitida, salida 0. |
| Unicode web     | Tras corregir un selector ambiguo del nuevo test, tres pruebas fallaron por el `maxlength` UTF-16 y por ausencia de validación accesible de 5.001 puntos de código. `mise exec -- pnpm --filter @nextriva/web test src/incidents/IncidentSolution.test.tsx`, salida 1.                                                     | Validación común a guardar/enviar mediante puntos de código y referencia de foco al campo. Las tres pruebas pasaron, salida 0. Refactor mínimo: reutilizar la validación y retirar el error local al corregir el texto.                                                  |

Los errores iniciales del fixture y los selectores no se consideran RED funcional. La primera preparación dejó dos bases temporales propias al encontrar conexiones del módulo de incidencias al finalizar. Se corrigió el `afterAll` para terminar exclusivamente conexiones de su base generada antes de eliminarla. Se recuperaron únicamente esas bases sintéticas de este fixture, verificando su identidad; no se usaron datos de desarrollo. Las ejecuciones completas posteriores finalizaron sin fallo de limpieza.

## Escenarios comprobados

La suite nueva `incident-validator.integration.test.ts` crea una base PostgreSQL temporal exclusiva dentro del runner seguro existente, aplica las diez migraciones y usa sesiones HTTP reales. No cambia fixtures globales. Sus dieciséis casos cubren:

- HTTP 409 al desactivar, degradar o retirar el único MANAGER independiente; usuario, vinculación, sesiones, incidencia y actividades permanecen iguales.
- Operaciones permitidas si permanece otro MANAGER activo vinculado, sin alterar la incidencia ni su actividad.
- Seis carreras con barreras PostgreSQL observadas mediante `pg_blocking_pids`: envío primero y retirada primero, para desactivación, degradación y desvinculación. No hay esperas temporales arbitrarias. El ganador confirma su cambio y la segunda operación responde 409, conservando el invariante.
- Retirada y desactivación concurrentes de dos validadores: una operación se acepta, otra se rechaza y permanece un candidato elegible.
- ADMIN global como único validador: desactivar/degradar se rechaza; retirar su vinculación opcional se permite; degradarlo a MANAGER exige conservar una vinculación elegible.
- API: 5.000 emojis se guardan; 5.001 reciben 400 y conservan borrador, metadatos, versión y actividad.
- Un MANAGER inactivo vinculado o activo sin vinculación no sirve como alternativa al único validador.

La prueba Playwright de I07.2 también verifica 5.000/5.001 emojis en Chromium real y consulta PostgreSQL para confirmar que la denegación de la UI no produce cambios. Incluye vaciar y volver a guardar el borrador y rechazar el envío vacío. Se añadió después del GREEN de la corrección, como prueba de aceptación; no se reconstruye un RED de implementación. La [evidencia I07.2](2026-10-23-i07-2-incident-solution.md) registra el fallo inicial del selector del test y el resultado completo de 35/35 E2E.

## Validaciones de esta corrección

Todos los comandos siguientes se ejecutaron desde la raíz con `mise exec --`. Los conteos incluyen I07.2 y esta corrección.

| Comando                                                                    | Resultado observado                                                                                                             | Código de salida |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `pnpm --filter @nextriva/api test:integration`                             | 11 archivos; 182 pasadas y 1 caso omitido, reservado al comando aislado obligatorio de CI                                       | 0                |
| `pnpm --filter @nextriva/web test src/incidents/IncidentSolution.test.tsx` | 3 pruebas de límites Unicode pasadas                                                                                            | 0                |
| `pnpm --filter @nextriva/web test`                                         | Primera ejecución: 190 pasadas y 1 fallo de foco en un test anterior de creación. Repetición completa: 20 archivos, 191 pasadas | 1 y después 0    |
| `pnpm --filter @nextriva/web test src/incidents/IncidentScreen.test.tsx`   | Repetición del archivo afectado por el foco: 46/46 pasadas, sin cambiar la aserción ni el código de foco                        | 0                |
| `pnpm api:types`                                                           | Contrato generado con descripciones 409 de protección de responsables/validadores                                               | 0                |
| `pnpm api:types:check`                                                     | Contrato OpenAPI y tipos generados coherentes                                                                                   | 0                |
| `pnpm format:check`                                                        | Formato global de código                                                                                                        | 0                |
| `pnpm typecheck`                                                           | API y web                                                                                                                       | 0                |
| `pnpm lint`                                                                | ESLint                                                                                                                          | 0                |
| `pnpm build`                                                               | API y web                                                                                                                       | 0                |
| `git diff --check`                                                         | Sin errores de whitespace                                                                                                       | 0                |

La comprobación de foco falló una vez al recibirlo la cabecera en lugar del campo; el fallo no se ha ocultado ni se ha relajado su aserción. No se ha demostrado una relación causal con esta corrección, que actúa en el detalle y no en la creación. Las repeticiones indicadas pasaron; se conserva como riesgo de inestabilidad observado.

El resto de la regresión, cobertura, auditoría y la ejecución remota de CI se informará tras la revisión final conjunta. No se atribuyen aquí resultados aún no ejecutados sobre esta versión.

## Límites, revisión humana y herramientas

- VoiceOver, Safari y Firefox siguen pendientes de validación manual. No se declara conformidad WCAG completa.
- No se ha usado `nextriva_dev`, cargado `.env.local` ni registrado credenciales o URLs completas. El fixture solo configura su URL temporal validada en el worker de pruebas.
- Los advisory locks exigen que los futuros escritores del invariante mantengan el mismo protocolo; no constituyen una restricción SQL automática para escrituras manuales fuera de la aplicación.
- Codex ayudó a investigar la causa, escribir y ejecutar pruebas y aplicar la corrección autorizada. Las decisiones funcionales proceden de las fuentes y de los Issues #68/#69 aprobados.
- Esta unidad no ha realizado commit, push, PR ni merge; quedan a cargo del flujo de publicación autorizado y su revisión final.
