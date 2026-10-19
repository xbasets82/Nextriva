# Diario TFM — Baseline inicial Nextriva

## Registro P04

- **Fecha:** 2026-10-19 (Europe/Madrid).
- **Fase:** P04, baseline y evidencia inicial TFM.
- **Estado:** baseline documental; no equivale a implementación ni a I00.
- **Commit base de referencia:** `904fd375a68d991f613cf038a04ccd6d07ed544b` — `chore(repo): prepare private GitHub repository`.
- **Rama observada:** `setup/p03-github-private`, siguiendo `origin/setup/p03-github-private`.
- **HU afectadas:** ninguna implementación; la matriz de casos se vincula a HU01–HU15 únicamente para trazabilidad futura.

## Prompt, plan y autorización

- **Petición:** prompt del usuario de P04 recibido en esta conversación el 2026-10-19; define baseline, diario, decisiones, casos críticos, evidencia saneada, TDD proporcional y cierre sin commit remoto.
- **Plan autorizado:** crear los cuatro artefactos bajo `docs/tfm/`: este diario, [`decisiones.md`](decisiones.md), [`casos-criticos.md`](casos-criticos.md) y [`evidencias/2026-10-19-p04-baseline.md`](evidencias/2026-10-19-p04-baseline.md). Verificar fuentes, trazabilidad, estado y formato sin tocar archivos fuera de ese directorio.
- **Autorización:** confirmación explícita del usuario «si» en respuesta al plan P04. Autoriza estos documentos; no autoriza commit, tag, push, instalación, migración ni operación remota.
- **Salida observada:** comandos y códigos resumidos en el [registro de evidencia](evidencias/2026-10-19-p04-baseline.md).

## Estado inicial observado

El repositorio contiene los diseños funcional y técnico, `AGENTS.md`, la matriz de decisiones aprobada en P02 y la configuración `mise` para Node y pnpm. No se encontró código de aplicación ni manifiesto/lockfile de dependencias de la aplicación, configuración Vitest/Playwright, esquema Prisma, migraciones o pipeline CI. La carpeta `.atl/` está sin seguimiento y queda preservada, fuera de esta fase.

La guía fija Node `24.22.0` y pnpm `10.34.7` en `app/mise.toml`; el inventario previo P00 registró versiones globales activas Node `25.4.0` y pnpm `11.25.0`. Son observaciones distintas (versión fijada del proyecto frente a ejecutable global), no prueba de que la toolchain local de `mise` esté instalada o activada. El inventario P00 también registró macOS `26.6.2` arm64, Git `2.54.0`, GitHub CLI `2.88.1`, Docker CLI `29.3.1`, Compose `5.1.1`, Docker Desktop presente y Safari/Chrome presentes. `docker info` no pudo conectar con el daemon (código 1). Estos valores son inventario de P00 y no fueron medidos de nuevo en P04.

## Requisitos y decisiones relevantes

- Alcance: una promotora, tres roles, quince HU, cuatro estados y exactamente ocho entidades de negocio. Las exclusiones aprobadas permanecen vigentes.
- Pruebas objetivo: Vitest unitario; Vitest de integración contra PostgreSQL real aislado; E2E con Playwright. No hay runner o aplicación en el baseline.
- Cobertura objetivo ratificada: 80% líneas y 75% ramas. Ninguna cobertura medida; no se informa porcentaje.
- Versiones exactas de NestJS, TypeScript, Prisma, Vite, Vitest, Playwright y PostgreSQL aún no fijadas. La compatibilidad final corresponde a I00.
- Las reglas de concurrencia, acceso y auditoría están trazadas en la matriz de casos. Los valores de respuesta HTTP no descritos por el diseño quedan pendientes del contrato API y no se inventan aquí.
- Referencias: [AGENTS.md](../../AGENTS.md), [diseño funcional v1.0](../../docs/references/Nextriva_Diseno_Funcional_MVP_v1.0_ES.md), [diseño técnico v1.0](../../docs/references/DISENO_TECNICO_NEXTRIVA_MVP_v1.0.md) y [matriz P02](../architecture/decision-matrix.md).

## Qué no se ejecutó

No se ejecutaron pruebas de aplicación, Vitest, PostgreSQL, Prisma, migraciones, Playwright, build, lint, tipos, cobertura, OpenAPI/cliente ni CI. No hay lógica de producto contra la cual obtener RED/GREEN. No se instalaron herramientas ni dependencias; no se creó commit/tag ni se hizo push. Lo no medido se registra como **N/D**.

## Verificación documental

Esta fase es documentación pasiva; la excepción TDD está justificada por `AGENTS.md` §5. La revisión proporcional comprueba fuente y cobertura de IDs VC, marcas N/D, referencias a prompt/plan/autorización/salida y ausencia de secretos. Los comandos, resultados y límites se conservan en el [registro de evidencia P04](evidencias/2026-10-19-p04-baseline.md).
