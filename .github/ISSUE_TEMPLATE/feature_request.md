---
name: Solicitud de incremento
about: Proponer un incremento o una funcionalidad para Nextriva.
title: "feat: "
labels: enhancement
assignees: ''
---

## Objetivo

¿Qué resultado necesita conseguir el usuario y qué problema resuelve?

## Alcance

- Incremento I00–I10:
- HU aprobada relacionada (si aplica):
- Incluye:
- Fuera de alcance:
- Dependencias o decisiones pendientes:

## Historia de usuario

Como **[rol aprobado]**, quiero **[capacidad]** para **[resultado]**.

## Reglas y referencias

- Diseño funcional: [archivo y sección]
- Diseño técnico: [archivo y sección]
- Matriz de decisiones: [decisión o fila]
- Otras referencias pertinentes:

No infieras permisos, transiciones, estados, entidades ni reglas ausentes de las fuentes aprobadas. Anota cualquier contradicción o decisión pendiente.

## Criterios de aceptación

- [ ] Dado **[contexto]**, cuando **[acción]**, entonces **[resultado observable]**.
- [ ] Para una denegación, especifica respuesta esperada y confirma que no cambia ningún dato persistido.
- [ ] Añade criterios de permisos, integridad o historial cuando correspondan.

## Estrategia TDD

### Red

- Regla pendiente que demostrará el fallo:
- Prueba y comando previstos:
- Resultado fallido esperado (debe deberse a la regla ausente):

### Green

- Implementación mínima que debería hacer pasar la prueba:
- Resultado esperado:

### Refactor

- Mejora estructural prevista sin cambiar el comportamiento:
- Pruebas que se repetirán:

No declares Red/Green sin ejecutar la prueba y observar el resultado. Si TDD no aplica o el runner no está disponible, explica la excepción antes de implementar.

## Pruebas previstas

| Nivel | Casos, entrada y resultado esperado | Persistencia / respuesta esperada |
|---|---|---|
| Vitest unitario | Reglas de dominio, permisos y validación aisladas | No aplica persistencia; indica el resultado esperado |
| Vitest integración | API y persistencia con PostgreSQL real aislado, si aplica | Indica datos antes/después y HTTP esperado |
| Playwright E2E | Flujo de navegador y rol, si aplica | Indica resultado visible y estado final |

- [ ] Justifiqué por qué cada nivel no aplica, si corresponde.
- [ ] Consideré permisos negativos, concurrencia y rollback cuando el cambio pueda afectarlos.

## Riesgos y seguridad

- Recursos/roles/estados afectados:
- Validación de servidor y autorización:
- Datos sensibles, secretos y logs:
- Migración o cambio de contrato OpenAPI, si aplica:
- Riesgos y limitaciones conocidas:
