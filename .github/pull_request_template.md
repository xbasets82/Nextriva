## Issue relacionado

Closes #

## Resumen

- ¿Qué cambia y por qué?
- HU e incremento cubiertos:
- ¿Qué queda explícitamente fuera del alcance?

## Revisión del alcance

- [ ] El diff contiene solo archivos del incremento autorizado.
- [ ] Las decisiones y reglas coinciden con las fuentes aprobadas.
- [ ] No se añadieron entidades, estados, roles ni funcionalidades no aprobados.
- [ ] Revisé el diff completo y conservé cambios ajenos.

## Evidencia TDD

| Fase | Prueba / comando | Resultado observado |
|---|---|---|
| Red |  |  |
| Green |  |  |
| Refactor y repetición |  |  |

- Excepción a TDD, si aplica:
- No afirmes un resultado que no se ejecutó y observó.

## Pruebas ejecutadas

| Nivel | Comando real | Resultado / código de salida | Evidencia |
|---|---|---|---|
| Vitest unitario |  |  |  |
| Vitest integración con PostgreSQL real, si aplica |  |  |  |
| Playwright E2E, si aplica |  |  |  |
| Typecheck / build / otros checks disponibles |  |  |  |

- Pruebas omitidas o fallidas y motivo:
- PostgreSQL es una instancia real aislada cuando se valida persistencia; SQLite o mocks no la sustituyen.

## Cobertura

- Líneas: **N/D** — objetivo global ≥80%.
- Ramas: **N/D** — objetivo global ≥75%.
- Comando ejecutado y artefacto del informe:
- Explica exclusiones; no reduzcas umbrales ni excluyas lógica para elevar el porcentaje.

## Calidad del código

- [ ] Formato (modo comprobación):
- [ ] Lint:
- [ ] Typecheck:
- [ ] Build:
- [ ] Revisé SOLID, validación, errores y coherencia con las capas existentes.
- [ ] OpenAPI y cliente revisados si cambia el contrato HTTP.

## Seguridad e integridad

- [ ] Permisos comprobados en servidor por rol, recurso y estado.
- [ ] Denegaciones verificadas sin mutación persistida indebida.
- [ ] Sin secretos en código, fixtures, logs ni evidencias; logs redactan datos sensibles.
- [ ] Migraciones versionadas y verificadas desde una PostgreSQL aislada, si aplica.
- [ ] Revisé concurrencia, atomicidad de actividad y rollback, si aplica.

## Problemas pendientes y revisión manual

- Riesgos, limitaciones y decisiones pendientes:
- Pasos manuales exactos para revisar el cambio:
- Evidencia TFM relacionada (si aplica):
