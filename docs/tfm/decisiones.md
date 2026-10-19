# Registro de decisiones — Baseline P04

**Fecha de corte:** 2026-10-19. **Estado:** resumen de fuentes; no crea decisiones de producto.

Este registro distingue las decisiones aprobadas de las propuestas pendientes. La [matriz P02](../architecture/decision-matrix.md) mantiene la trazabilidad exhaustiva de HU, roles, estados y entidades.

## Aprobadas

| Decisión | Fuente/registro | Aplicación al baseline |
|---|---|---|
| Una promotora, 3 roles (administrador, gestor, colaborador), HU01–HU15, 4 estados y las 8 entidades nombradas en el diseño | Diseño funcional §§2, 4, 6–7; diseño técnico §§2, 4; matriz P02 | Solo se usan como límites y trazabilidad; no hay implementación. |
| Backend objetivo como monolito modular NestJS, Node.js y TypeScript estricto; PostgreSQL y Prisma | `AGENTS.md` §3; diseño técnico §§1, 3–4 | No implica que el stack esté creado. |
| Vitest para unitarias e integración con PostgreSQL real; Playwright E2E | `AGENTS.md` §§5–6; diseño técnico §10 | Herramientas objetivo, no instaladas ni ejecutadas en este baseline. |
| Cobertura global objetivo de 80% líneas y 75% ramas | Confirmación del usuario en P02; matriz P02 | Objetivo, no resultado medido. |
| Node `24.22.0` y pnpm `10.34.7` fijados mediante `mise` | P01; `app/mise.toml`, `app/mise.lock` | Fijaciones presentes en archivos; activación local no comprobada en P04. |
| Sin portal comprador, notificaciones, gestión formal de cambios ni gestión documental avanzada | Diseño funcional §2.2; `AGENTS.md` §2 | Fuera del alcance P04 y del MVP aprobado. |
| No añadir una novena entidad de negocio | `AGENTS.md` §9; diseño técnico §4; matriz P02 | Tabla técnica de migraciones, si se crea en el futuro, no cuenta como entidad de negocio. |

## Pendientes; no asumir aprobados

| Decisión pendiente | Fuente | Cuándo resolver |
|---|---|---|
| Ratificación/compatibilidad de React, Vite, Tailwind, shadcn/ui y pnpm workspaces | `AGENTS.md` §3; diseño técnico §3.3, DT07 | Antes de instalar/crear frontend y en I00. |
| Versiones compatibles de NestJS, TypeScript, Prisma, Vite, Vitest, Playwright y PostgreSQL; scripts y lockfile de aplicación | Diseño técnico §§9–10, 13–14, DT08 | I00, consultando documentación oficial vigente. |
| Umbral de 90% líneas/ramas para dominio, autorización y estados | Diseño técnico §10, DT09 | Propuesta pendiente; la ratificación de P02 cubre solo 80% global de líneas y 75% de ramas. |
| Duraciones de sesión, coste medido Argon2id, gestión de credenciales y protección de login-CSRF | Diseño técnico §§5.1–5.2, DT10 | I01. |
| Categorías y nombres internos de enums | Diseño técnico §§4, 14, DT11 | Antes de migración. |
| Estrategia concreta de aislamiento/bloqueos, orden y reintentos | Diseño técnico §6.2, DT12 | I02/I04; deberá cubrir invariantes cruzados y carreras reales. |
| Rutas REST, DTO, códigos HTTP y límites de paginación | Diseño técnico §7, DT13 | Al definir cada incremento y contrato. |
| Proveedor/plan de demo, cuotas, región, retención, copias y autorización de despliegue | Diseño técnico §12, DT14 | Antes de cualquier demo remota. |

## Contradicciones y resolución vigente

| Tema | Estado | Resolución y fuentes |
|---|---|---|
| Umbrales de cobertura: texto previo de conversación 85%/80% frente a fuentes 80%/75% | Resuelta en P02 | La instrucción posterior del usuario ratificó 80% líneas y 75% ramas; ese es el objetivo registrado. |
| Visión menciona cambios/documentación y el alcance excluye gestión formal de cambios/documental avanzada | Resuelta por el alcance explícito | Diseño funcional §§1–2.2 y técnico §2: aplican exclusiones expresas; la visión no amplía MVP. |
| Diseño funcional no fija framework/BD/infraestructura y diseño técnico concreta stack | Resuelta por separación de autoridad | Diseño funcional §12 delega concreción técnica; diseño técnico concreta tecnología, mientras reglas funcionales siguen prevaleciendo para negocio. |

No se detectó una contradicción pendiente entre las fuentes que requiera bloquear la creación del baseline. Los pendientes anteriores no se han decidido en P04.
