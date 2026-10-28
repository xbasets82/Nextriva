# I10.3 — Candidato local de copia y retención

Fecha: 28/10/2026. Alcance autorizado: implementación local y TDD; retención de 3 copias diarias y 2 semanales dominicales, pudiendo compartir una copia. Las pruebas automatizadas del candidato no se conectan al VPS, Docker real ni Proton Drive. El usuario verificó aparte una transferencia manual sintética en el VPS.

## Implementado

- `scripts/backup-demo-postgres.mjs`: coordinador importable con adaptadores inyectados; manifiesto privado, verificación de descarga por SHA-256, bloqueo local y retirada selectiva desactivada por defecto.
- Adaptador Docker con argumentos fijos y selección única por etiquetas Compose, sin nombre de contenedor supuesto.
- `scripts/backup-demo-postgres.test.mjs`: 23 pruebas `node:test` con dump y ejecución de CLI simulados. No necesitan credenciales ni servicios.
- Guía actualizada en `docs/development/postgres-backup-restore.md`.

## Evidencia TDD observada

Runtime observado: `mise exec -- node --version` → `v24.22.0`, código `0`. Coincide con `package.json` y `mise.toml`.

Comando de cada ejecución: `mise exec -- node --test scripts/backup-demo-postgres.test.mjs`.

| Ciclo                                        | Red observado                                                                 | Green observado              |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| Retención y validación de nombres/fechas     | 0/2 superadas, 2 fallidas; código `1`; selector vacío no satisface retención. | 2/2 superadas; código `0`.   |
| Coordinación, fallos y estado privado        | 3/9 superadas, 6 fallidas; código `1`; coordinador sin implementar.           | 9/9 superadas; código `0`.   |
| Adaptador Docker y argumentos                | 9/14 superadas, 5 fallidas; código `1`; adaptador sin implementar.            | 14/14 superadas; código `0`. |
| Prohibición de estado dentro del repositorio | 17/18 superadas, 1 fallida; código `1`; faltaba rechazar ese destino.         | 18/18 superadas; código `0`. |

En el segundo ciclo, una ejecución intermedia tuvo 7/9 superadas y 2 fallidas porque macOS representa el directorio temporal mediante `/var` → `/private/var`. El control canónico rechazaba el fixture antes del dump. Se corrigió el fixture con `realpath`, conservando las expectativas, y se añadieron aserciones de secuencia para demostrar que las pruebas de fallo alcanzan dump/subida/descarga. No se relajó el control de rutas.

Las pruebas cubren retención UTC, una posición por día, domingo compartido, fecha futura, traversal y nombres ajenos, SHA-256, archivos vacíos o permisos inseguros, fallos de dump/subida/descarga, bloqueo concurrente, manifiesto inseguro/enlace, destino dentro del repositorio, nombres exactos retirados y parada/persistencia tras fallo de retirada. Los mensajes de error no exponen los secretos sintéticos lanzados por los dobles.

Refactor observado: extracción de validación del directorio y lectura del manifiesto, simplificación de las expectativas de secuencia y destino de enlace de prueba dentro del fixture privado. Una primera ejecución de ESLint falló con 3 errores (complejidad cognitiva, ternario anidado y ruta pública de prueba); se corrigieron sin desactivar reglas. Tras el refactor y el formato, la suite volvió a superar 18/18, código `0`.

Comprobaciones finales observadas:

- `mise exec -- pnpm exec eslint scripts/backup-demo-postgres.mjs scripts/backup-demo-postgres.test.mjs`: superada, código `0`.
- `git diff --check`: superada, código `0`.
- Prettier aplicado a los dos módulos y esta evidencia, código `0`. No se reformatearon los demás cambios previos del árbol.

## Corrección tras revisión: activación estricta de retirada

La revisión detectó que un valor no booleano como `prune: "false"` podía activar la retirada por conversión implícita. Se añadió primero una regresión para cadenas, números, `null`, arrays y objetos, exigiendo rechazo antes del dump o transporte. El mismo comando de pruebas dio **18/19 superadas y 1 fallida**, código `1`, con `Missing expected rejection`. Después se añadió una validación de tipo al principio del coordinador: solo se admiten `true`, `false` o la opción omitida (por defecto `false`).

Green observado: **19/19 superadas**, código `0`. ESLint de ambos módulos y Prettier check de ambos módulos: superados, código `0`. La corrección conserva las expectativas existentes y no añade operaciones remotas.

## Pendiente de activación

**No ejecutado por el candidato:** dump PostgreSQL real, conexión Docker/sudo desde la tarea, restauración real, instalación o ejecución de systemd, commit, push o despliegue. El módulo no inicia operaciones al ejecutarse directamente ni ofrece todavía una automatización instalable. Las garantías del coordinador corresponden a pruebas con dobles, no a una copia real.

## Adaptador Proton tras confirmar ayuda de CLI

El coordinador comunicó las siguientes salidas observadas en la consulta de ayuda de solo lectura autorizada (CLI `0.9.0`, SDK `0.22.2`); upload y download finalizaron con código `0`:

```text
filesystem upload [-f STRATEGY] [-d STRATEGY] [-t] localPath... parentPath
filesystem download [-f STRATEGY] [-d STRATEGY] path... localFolder
filesystem trash path...
```

Opciones confirmadas utilizadas: `--file-conflict-strategy skip --folder-conflict-strategy skip`. El usuario verificó manualmente una subida y descarga de 33 bytes en `Nextriva-Backups`; ambos SHA-256 coincidieron: `68cf5bb534d0a83799aed762eb1bbc3c806257bf5685247807264872a6531048`. Movió el archivo sintético a la papelera, lo eliminó por `/trash/<nombre>` y confirmó que `filesystem list /trash` quedó vacío. La prueba no tocó el dump `nextriva-demo.dump` ni ejercitó el candidato local.

Se añadió `createProtonTransport` como fábrica inerte: ejecutable fijo absoluto, carpeta remota absoluta dedicada, usuario `ubuntu`, argumentos separados y `shell: false`. La subida conserva el nombre generado; la descarga se realiza a otra carpeta privada y entrega un archivo `0600` al hash. La retirada solo mueve la ruta exacta a la papelera; no existe llamada a `delete`, listado o vaciado.

Ciclo observado con el mismo comando `node:test`: **19/22 superadas y 3 fallidas**, código `1`, ante fábrica sin implementar; después **22/22 superadas**, código `0`. Se añadió además una prueba de composición del adaptador con el coordinador: descarga válida permite exclusivamente los `trash` esperados del manifiesto; bytes corruptos impiden cualquier `trash`. Resultado: **23/23 superadas**, código `0`; ESLint de los dos módulos, código `0`. Los comandos se simulan íntegramente.

**Límite pendiente:** los archivos en la papelera siguen consumiendo cuota, según [Proton](https://proton.me/support/proton-drive-delete-restore-synced-files). La política actual no garantiza un máximo de almacenamiento de 3 + 2 copias. Aunque el usuario comprobó el borrado permanente de un archivo sintético exacto desde `/trash/<nombre>`, el candidato sigue sin listar la papelera ni implementar `filesystem delete`; no se ampliará esa operación hasta definir una forma inequívoca de borrar únicamente archivos propiedad del manifiesto.

## Continuación — selección del almacén y desbloqueo GPG

Se añadió una prueba que fallaba al importar la configuración aún inexistente (`mise exec -- node --test --test-name-pattern='Proton child process selects the pass credential store' scripts/backup-demo-postgres.test.mjs`, código `1`). Tras añadir `PROTON_DRIVE_CREDENTIALS_STORE=pass` a la lista cerrada del proceso Proton, el test superó **1/1**, código `0`.

El helper `scripts/proton-gpg-credentials.mjs` permite a systemd desbloquear la clave protegida usando una credencial runtime: valida el keygrip y el archivo de credencial, pasa el secreto únicamente por stdin a `gpg-preset-passphrase`, limpia el buffer y ofrece una acción `forget` dirigida al keygrip. No imprime la frase ni la incluye en argumentos. TDD observado: import de helper ausente, código `1`; GREEN del helper de desbloqueo **1/1**, código `0`. La primera ejecución GREEN detectó el enlace `/tmp`→`/private/tmp` en el fixture macOS; se canonicalizó el fixture sin relajar validaciones. El test de `forget` se ejecutó primero con export ausente (**código `1`**) y luego superó **1/1**, código `0`.

Se añadió `scripts/run-demo-backup.mjs` como punto de entrada que compone los adaptadores, espera la verificación y devuelve código `1` con mensaje genérico ante fallos. Solo lee rutas/configuración del ejecutable Proton y directorio remoto; no acepta credenciales ni keygrip y fija `prune: false`. TDD observado: configuración incompleta inicialmente devolvía código `0` (RED, código `1`); composición no invocaba los adaptadores esperados (RED, código `1`); los errores sintéticos se propagaban y la CLI sin configuración terminaba incorrectamente en código `0` (RED, código `1`). Tras la implementación, las cinco pruebas del entrypoint pasaron, código `0`. La primera corrida usó un módulo ausente; se añadió el scaffold y se confirmó el RED por aserción antes de implementar.

Suite conjunta posterior: **31/31**, código `0`; ESLint, Prettier y `git diff --check`, código `0`. Solo se usaron dobles para Docker/Proton; la CLI se ejecutó sin configuración y rechazó antes de conectar. No se ejecutó backup real, restauración, servicio systemd ni timer.

Se añadieron cuatro regresiones del helper GPG: keygrip inválido; credencial vacía, symlink o permisos compartidos; fallo del ejecutable con borrado del buffer; y CLI que suprime stdout/stderr reflejando el secreto sintético y devuelve código `1`. Pasaron contra el comportamiento ya implementado; no hubo RED útil y no se cambió producción para fingirlo. Suite conjunta final: **35/35**, código `0`; ESLint, Prettier y `git diff --check`, código `0`. Los ejecutables/credenciales de prueba fueron sintéticos y temporales. No se usó la frase ni la clave GPG real.

El usuario comprobó interactivamente que GPG podía descifrar una prueba sintética después de exportar `GPG_TTY` y actualizar la terminal de `gpg-agent`. Esto no demuestra desbloqueo bajo systemd. En la VPS se verificó por SSH de solo lectura `systemd 259.9-0ubuntu0.1`, `systemd-creds` en PATH y GnuPG `2.4.8-4ubuntu3.1`; `gpg-preset-passphrase` está en `/usr/lib/gnupg/gpg-preset-passphrase` y su ayuda confirma `--preset` y `--forget`. `sudo -n docker` responde con código `0`. La VPS no tiene Node.js ni mise en el host; el repositorio requiere Node `24.22.0` y APT ofrece `22.22.1`, incompatible con el runtime fijado. El socket GPG estaba presente al consultar, pero `loginctl` informa que `ubuntu` no tiene _linger_ habilitado y la configuración activa del agente no lista `allow-preset-passphrase`; estos puntos requieren resolverse para ejecución autónoma. La frase no se ha escrito en el repositorio; no se ha instalado ni configurado la automatización systemd en la VPS. La compatibilidad de versiones no demuestra todavía una ejecución del servicio.

## Continuación — preparación e instalación systemd en VPS

El usuario autorizó sustituir el timer de backup que ya existía. La revisión previa encontró `nextriva-demo-backup.timer` activo y habilitado, con servicio anterior ejecutado como `root` desde `/usr/local/sbin/nextriva-demo-backup`; el servicio estaba inactivo y no había drop-ins. Antes de detenerlo se guardó una copia recuperable de unidad, timer y script, con `cmp` satisfactorio, en `/root/nextriva-backup-legacy-20261028` (directorio `root` privado). Después se deshabilitó y detuvo el timer anterior. **No hay backup programado mientras se completa la validación del candidato.**

Node `v24.22.0` se instaló para `ubuntu` en `/home/ubuntu/.local/lib/node-v24.22.0-linux-x64`. El checksum comprobado del artefacto oficial Linux x64 fue `cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008`; `node --version` devolvió `v24.22.0` antes y después de instalarlo. No se sustituyó el Node del sistema.

Se habilitó _linger_ para `ubuntu` y el socket del agente GPG del usuario. Se configuró `allow-preset-passphrase` con `max-cache-ttl 1800` y se reinició el agente mediante el gestor de usuario; ambos `gpg-agent.service` y `gpg-agent.socket` reportaron `active`. El archivo de configuración mantiene modo privado. El keygrip se colocó en `/etc/nextriva/backup.env`, sin frase de contraseña, con propietario `root:root` y modo `0600`.

Se instalaron como `root:root`, modo `0644`, los scripts `backup-demo-postgres.mjs`, `run-demo-backup.mjs` y `proton-gpg-credentials.mjs` bajo `/opt/nextriva/backup`, más `nextriva-demo-backup.service` y `.timer` en `/etc/systemd/system`. El servicio declara `User=ubuntu`, utiliza Node fijado, desbloqueo GPG por `LoadCredentialEncrypted`, limpieza con `forget` y timeout de 15 minutos. La unidad evita `NoNewPrivileges=true` porque el adaptador existente invoca `sudo -n docker`; también deja el home accesible para que GPG/pass actualice su almacén. Esas concesiones mantienen una dependencia fuerte de los privilegios ya concedidos a `ubuntu` y de la seguridad de la VPS.

TDD observado para la integración del entorno GPG y las unidades: primero falló el test que exigía pasar `GNUPGHOME` y `XDG_RUNTIME_DIR` al proceso Proton porque esas variables no se propagaban (exit `1`); tras implementar una lista permitida, la prueba de allowlist pasó **2/2**, exit `0`. Los tests de plantillas systemd fallaron por ausencia de los archivos (2 fallos `ENOENT`, exit `1`); después de crearlos, el conjunto final quedó en **40/40**, exit `0`. El test de entorno verifica además que no se filtran `DATABASE_URL` ni `CREDENTIALS_DIRECTORY` y que no se invoca un shell.

Comprobaciones observadas el 28/10/2026:

| Comprobación                                                                                      | Resultado                                                             |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `mise exec -- node --test scripts/backup-demo-postgres.test.mjs scripts/run-demo-backup.test.mjs` | **40/40**, exit `0`                                                   |
| ESLint de los cinco módulos JS de backup                                                          | exit `0`                                                              |
| Prettier check de módulos y Markdown                                                              | exit `0`                                                              |
| `git diff --check`                                                                                | exit `0`                                                              |
| `systemd-analyze verify` de las unidades instaladas                                               | exit `0`; solo advertencias preexistentes de unidades XFS del sistema |
| `systemctl is-active nextriva-demo-backup.service`                                                | `inactive`                                                            |
| `systemctl is-active nextriva-demo-backup.timer` / `is-enabled`                                   | `inactive` / `disabled`                                               |
| `LoadCredentialEncrypted`                                                                         | archivo cifrado **ausente**                                           |

El timer candidato es diario a las 02:00 UTC con retraso aleatorio de hasta 15 minutos, pero permanece deshabilitado. No se ejecutó `systemctl start`, no se creó la credencial, no hubo dump real, upload real de base de datos ni restauración. No se activó ninguna prueba contra `nextriva_dev`. El timer antiguo permanece deshabilitado y su rollback está conservado. La retención automática efectiva sigue pendiente: el entrypoint fija `prune: false`; mover a Trash no libera cuota y no se han implementado ni probado borrados permanentes selectivos.

La clave host se inicializó con `systemd-creds setup`; la propia herramienta informó que el archivo `/var/lib/systemd/credential.secret` no está en almacenamiento cifrado. El impacto y la advertencia sobre copias de disco/root se documentaron en la guía. Un primer smoke sintético de `systemd-creds decrypt` falló porque faltó `--name=proton-gpg-passphrase`; el nombre del archivo temporal no coincide con el nombre embebido. Tras corregir el comando, el round-trip sintético en `/run` se verificó, exit `0`, sin mostrar su contenido. El primer intento, mal citado, dejó un directorio vacío exacto en `/tmp`; se comprobó que era un directorio root-only vacío y se eliminó mediante `rmdir` de esa ruta concreta. No quedaron temporales.

## Cierre — copia real y restauración aislada

El usuario confirmó que la credencial GPG runtime está cifrada por systemd y verificada. No se mostró ni registró la frase. Se ejecutó manualmente `nextriva-demo-backup.service`: `Result=success`, `ExecMainStatus=0`, salida `Demo backup verified`; se comprobó upload, descarga y coincidencia SHA-256 antes de publicar el manifiesto. No se habilitó el timer.

La última entrada del manifiesto identifica `nextriva_demo-20261028T191925Z-fba51ce5a4d4d23b293d564e01a4002e.dump`, con SHA-256 `69f2009238bce2ad7179c7c4b8509c77862b18a9a2efa20cd7f82b92e9312108`. El archivo se descargó nuevamente desde Proton mediante un servicio transitorio de systemd usando `PROTON_DRIVE_CREDENTIALS_STORE=pass`; el hash descargado coincidió con el manifiesto.

La restauración se ejecutó en `postgres:18.6-bookworm`, en un contenedor efímero `--network none`, sin volumen ni puerto publicado, con base `nextriva_candidate`. Se ejecutó `pg_restore --exit-on-error --single-transaction --no-owner --no-acl`. Resultado observado: restauración superada; **9 tablas públicas, 45 filas totales y 14 claves foráneas validadas**, coincidentes con la base `nextriva_demo` al comparar conteos por tabla, conjuntos de tablas y restricciones. `SELECT 1` comprobó la disponibilidad SQL antes de restaurar. El contenedor, el archivo temporal de contraseña y el dump descargado se eliminaron al cerrar la verificación. No se modificó `nextriva_demo`; solo se consultaron sus conteos. `nextriva_dev` no se utilizó.

Una primera tentativa de restauración encontró `the database system is shutting down`: `pg_isready` había respondido durante la transición entre el servidor de inicialización y el servidor definitivo del contenedor. La instancia temporal se eliminó. Se corrigió la verificación para esperar una consulta SQL real (`SELECT 1`) antes de `pg_restore`; la repetición completa terminó correctamente. La guía de restauración refleja esta comprobación más fuerte.

La validación confirmó que el almacén Proton debe declararse como `PROTON_DRIVE_CREDENTIALS_STORE=pass` también al ejecutar la CLI de descarga; omitirlo selecciona el backend `keychain`, que no está disponible en el servicio systemd. También se corrigió el candidato para aceptar la limpieza GPG solo cuando `gpg-connect-agent` devuelve una respuesta Assuan `OK`, ya que el código de salida `0` puede ocultar un `ERR`.

Estado operativo al cierre:

- `nextriva-demo-backup.service`: ejecución manual superada; el último estado de unidad es oneshot inactivo tras completar correctamente.
- `nextriva-demo-backup.timer`: permanece `disabled` e `inactive`; la periodicidad no está activada.
- Retención remota efectiva 3 diarias + 2 semanales: **no garantizada**. El entrypoint conserva `prune: false`; mover a Trash no libera cuota y no se automatiza el borrado permanente. La política de retención del manifiesto no equivale a limitar el almacenamiento remoto.
- Aplicación candidata, migraciones y smoke Playwright: no forman parte de esta verificación de backup/restauración. No hubo despliegue nuevo.

La primera restauración fallida y la repetición corregida son resultados operativos observados; no se presentan como ciclos TDD. La suite automatizada continúa separada y usa dobles para Docker/Proton.

## Activación programada autorizada

El usuario autorizó habilitar el timer pese a que la retención remota efectiva queda pendiente. Preflight: `systemd-analyze verify` terminó con código `0`; servicio previo `Result=success`, `ExecMainStatus=0`; timer `inactive`/`disabled` antes del cambio. Se ejecutó `sudo systemctl enable --now nextriva-demo-backup.timer`, código `0`.

La verificación posterior observó `ActiveState=active`, `UnitFileState=enabled`, último disparo `Wed 2026-10-28 19:36:38 UTC` y siguiente ejecución `Thu 2026-10-29 02:13:30 UTC`. Por `Persistent=true`, systemd lanzó una ejecución inmediata al habilitarlo; acabó `Result=success`, `ExecMainStatus=0` y el journal mostró `Demo backup verified`. El servicio oneshot volvió a `inactive` tras finalizar, con normalidad. No hubo errores ni temporales de restauración pendientes.

La Issue [#141](https://github.com/xbasets82/Nextriva/issues/141) quedó abierta con `status:needs-review` y `type:chore` para implementar identificación y borrado permanente inequívocos de copias fuera de retención. Hasta que esa Issue se resuelva, el timer puede acumular archivos en Proton: `prune: false` sigue vigente y mover objetos a Trash no libera cuota. No se habilitó ninguna limpieza destructiva automática.

## Revisión de la espera de restauración

Una revisión fresca detectó que la comprobación histórica `SELECT 1` usaba el socket local y aún podía responder desde el servidor temporal de inicialización. El runbook ahora autentica una consulta `SELECT 1` por TCP a `127.0.0.1`, usando dentro del contenedor el archivo de contraseña ya montado. La imagen `postgres:18.6-bookworm` no expone TCP en su servidor temporal de inicialización. Se probó esta consulta en un contenedor desechable `--network none`; respondió `1` al iniciar el servidor definitivo (código de salida `0`). La restauración del dump real y sus conteos se habían completado antes de esta corrección de la receta; no se repitió esa restauración después del cambio documental. La suite de automatización del backup se añadió como ejecución obligatoria de CI.
