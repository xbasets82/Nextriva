# Issue #143 — Publicación verificada al VPS

Issue aprobada: https://github.com/xbasets82/Nextriva/issues/143. Mantenimiento posterior a I10.3; no renumera la guía incremental ni añade comportamiento de producto.

## Corte local A/B

Se prepara `workflow_dispatch` independiente que verifica el CI push de main del SHA exacto y los seis jobs vigentes. Publica API/web privadas en GHCR por digest y llama a un helper fijo mediante SSH. El workflow queda inerte hasta configurar explícitamente `NEXTRIVA_CD_MANUAL_ENABLED=true`. No añade triggers push, PR ni workflow_run.

El helper usa un token GitHub efímero recibido por stdin; no requiere PAT persistente. El usuario SSH dedicado no obtiene Docker ni sudo general. Configuración, módulos y estado son del operador root; rutas y baseline se fijarán tras inventario actual autorizado. Preserva `nextriva-demo`, sus servicios/puertos y el volumen PostgreSQL existente. Las migraciones son una comparación de checksums, nunca una ejecución automática.

## Criterios y prueba

| Garantía                     | Verificación local prevista                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| Solo main/repo/CI exactos    | Políticas con fork, PR, SHA incorrecto, job omitido/fallido                |
| Digests y solicitud acotada  | Allowlist de repositorios, campos y operación                              |
| Concurrencia/orden/reintento | Barrera determinista, lock de filesystem, expected SHA y run ID            |
| Fallo y recuperación         | Journal pending, rollback de aplicación y rechazo si cambia PostgreSQL     |
| Esquema                      | Checksum/estado de migración y rechazo antes de activar                    |
| Preservación de datos        | PostgreSQL sintético real sin red/puertos; activación simulada             |
| Artefacto de producción      | Runner existente con HTTPS, PostgreSQL temporal y aprobación independiente |
| SSH/Compose real en VPS      | Pendiente de autorización, inventario y primer dispatch                    |

Las pruebas negativas que solo podían pasar por un rechazo genérico del stub no constituyen RED individual acreditado. Se conserva esa limitación en evidencia; no se reconstruyen ciclos históricos. Los detalles operativos y las decisiones GHCR/Environments viven en [la guía CD](../development/vps-continuous-delivery.md).

## Puertas de aprobación

1. Validación local de este candidato.
2. Autorización de commit/publicación/PR, por separado de desarrollo.
3. Autorización de configuración remota e inventario vigente.
4. Autorización del primer despliegue manual y recuperación.
5. Autorización independiente para activar CD automático al merge.

No aplicar migraciones ni modificar runtime, DNS, Caddy, firewall o backups dentro de la implementación local. No declarar finalizado el despliegue automático mientras esas puertas permanezcan pendientes.
