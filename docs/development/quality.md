# Calidad, hooks y logging

## Herramientas fijadas

Las versiones exactas están en los manifiestos y `pnpm-lock.yaml`. El entorno del
repositorio fija Node.js 24.22.0 y pnpm 10.34.7 mediante mise.

- ESLint 10.13.0, `typescript-eslint` 8.71.2 y `eslint-plugin-sonarjs` 4.2.2.
- Prettier 3.9.10.
- Husky 9.1.7 y lint-staged 17.6.0.
- Pino 10.4.0 en la API.

SonarJS se ejecuta como plugin local de ESLint; no requiere SonarQube ni
SonarCloud. Husky acelera la revisión local y puede omitirse, por lo que los
comandos directos siguen siendo necesarios y los controles remotos pertenecen a
I00.6.

Las versiones se eligieron por compatibilidad con el Node y TypeScript ya fijados,
no por copiar una configuración de otra major: ESLint 10 soporta Node 24; la
versión fijada de typescript-eslint admite ESLint 10 y TypeScript 5.9; SonarJS
declara compatibilidad de peer con ESLint 10. ESLint 10 requiere configuración
flat, utilizada en `eslint.config.mjs`. Las licencias directas revisadas son MIT,
salvo `eslint-plugin-sonarjs` (LGPL-3.0-only); todos los paquetes de calidad son
dependencias de desarrollo y no se incorpora un servicio remoto.

Referencias oficiales: [ESLint](https://eslint.org/docs/latest/use/getting-started),
[compatibilidad de typescript-eslint](https://typescript-eslint.io/users/dependency-versions/),
[SonarJS para ESLint](https://github.com/SonarSource/SonarJS/blob/master/packages/analysis/src/jsts/rules/README.md),
[redacción de Pino](https://github.com/pinojs/pino/blob/main/docs/api.md) y
[Husky](https://typicode.github.io/husky/get-started.html).

## Comandos reproducibles

Ejecuta comandos con las versiones fijadas:

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm lint
mise exec -- pnpm format:check
mise exec -- pnpm format
mise exec -- pnpm test
mise exec -- pnpm test:http
mise exec -- pnpm typecheck
mise exec -- pnpm build
mise exec -- pnpm check:staged
```

`lint` analiza TypeScript de API y web con ESLint y SonarJS. `format:check`
comprueba TypeScript, TSX, JavaScript y JSON de las aplicaciones y la
configuración raíz; no reescribe archivos. `format` aplica ese mismo alcance.
Las guías de referencia no entran en esos globs.

`test` ejecuta las suites unitarias Vitest de ambas aplicaciones.
`test:http` ejecuta la integración HTTP de Nest en loopback, sin PostgreSQL.
Los tests de base de datos mantienen su script de integración separado.

`check:staged` ejecuta ESLint y Prettier sobre los archivos preparados para
commit que coinciden con la configuración de lint-staged. El hook `.husky/pre-commit`
llama a ese mismo script.

## Archivos generados excluidos

- `node_modules/`: dependencias instaladas desde el lockfile.
- `dist/`: salida de compilación de API y web.
- `coverage/`: salida opcional del proveedor de cobertura.
- `playwright-report/` y `test-results/`: informes y resultados temporales de
  Playwright.
- `apps/api/generated/`: cliente Prisma generado a partir del esquema.
- `*.tsbuildinfo` y `*.log`: cachés de TypeScript y logs de herramientas.
- `pnpm-lock.yaml`: el lockfile lo genera pnpm y no se reescribe con Prettier.

Los scripts de Prettier tienen globs acotados y no incluyen las copias de
referencia de `docs/references/`.

## Logging HTTP

Pino escribe un registro JSON por petición con `requestId`, método, ruta
parametrizada, estado HTTP y duración. Se acepta el encabezado `x-request-id`
solo si cumple `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`; cuando falta o no es válido,
el servidor genera un UUID. El identificador se registra, sin añadir cabeceras
ni cambiar el contrato HTTP.

El middleware registra únicamente esos metadatos permitidos; no incorpora
headers, URL de petición ni cuerpo. Pino elimina rutas configuradas para
cookies, autorización, contraseñas, tokens, URLs de base de datos y cuerpos
completos si esos campos llegan accidentalmente al logger. Esa lista no es un
saneador recursivo universal para objetos arbitrarios, por lo que no se deben
enviar objetos de usuario al logger. No se registran comentarios ni soluciones
por defecto.

La captura y los casos de redacción de I00.5 están en
[`docs/tfm/evidencias/2026-10-19-i00-5.md`](../tfm/evidencias/2026-10-19-i00-5.md).

## Autenticación web y pruebas aisladas (I03.3)

El [README §4.8](../../README.md#48-ejecutar-la-aplicación) describe el arranque local con un administrador sintético ya provisionado. Inicia sesión en el formulario web; conserva el mismo origen configurado en `AUTH_ORIGIN`. No pegues credenciales en consola ni en informes. Login no necesita un CSRF previo: el backend comprueba Origin/Referer; logout obtiene `/api/auth/csrf` y envía `X-CSRF-Token`.

Las pruebas de UI están en `apps/web/src/auth-login.test.tsx`, `apps/web/src/auth-session.test.tsx` y `apps/web/src/auth-session-edge.test.tsx`; el cliente API se prueba en `apps/web/src/api/auth.test.ts` y Playwright en `apps/api/e2e/web-login.spec.ts`. El helper `apps/web/test-support/auth-test-setup.ts` queda fuera de la cobertura de producción. Los tests unitarios controlan respuestas HTTP para validar UI; la integración y Playwright usan API/PostgreSQL reales y las migraciones versionadas. Los escenarios de fallo temporal E2E se identifican como inyección de un 503, sin sustituir los flujos reales de autenticación y persistencia.

Si la URL de prueba local ya está configurada en `.env.local`, ejecuta desde raíz sin transmitir la URL de desarrollo al runner:

```sh
mise exec -- pnpm --filter @nextriva/web test:coverage
mise exec -- node --env-file=.env.local --input-type=module --eval 'delete process.env.DATABASE_URL; await import("./scripts/test-integration.mjs")'
mise exec -- node --env-file=.env.local --input-type=module --eval 'delete process.env.DATABASE_URL; process.argv.push("--e2e"); await import("./scripts/test-integration.mjs")'
```

El runner valida `127.0.0.1:5433/nextriva_test`, crea una base temporal por ejecución y elimina únicamente esa base. Nunca dirige tests automatizados a `nextriva_dev`. No se añade migración en I03.3. La evidencia registra comandos ejecutados, salidas, cobertura y pruebas de accesibilidad/navegadores aún pendientes.
