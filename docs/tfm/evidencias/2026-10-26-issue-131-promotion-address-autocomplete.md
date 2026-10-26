# Issue #131 — Ubicación y autocompletado en promociones

## Alcance y decisiones

Implementación de [#131](https://github.com/xbasets82/Nextriva/issues/131), aprobada por el usuario. Rama `codex/promotion-location-autocomplete`, creada desde `main` actualizado en `e438ccd52de184564fc2b7be2976cd909548def8`. El commit funcional es `38907a2729c79f1b08e8826c9fb168777355ab73`; la publicación y PR quedan pendientes de completar.

- Las tarjetas muestran nombre y acciones en la primera fila, y pin y ubicación en una segunda fila siempre independiente. El estado vacío indica «Ubicación no indicada».
- El formulario compartido de creación/edición conserva la ubicación existente y permite entrada manual además de sugerencias por teclado o ratón.
- Se conserva el contrato actual: `location` es texto nullable recortado de hasta 200 caracteres. No se añadieron migraciones, campos, coordenadas, dependencias, endpoints ni cambios OpenAPI.
- El proveedor es una interfaz pequeña con adaptador Geoapify en el navegador. La clave configurada con `VITE_GEOAPIFY_API_KEY` es pública, no un secreto; no se creó cuenta ni se incorporó una clave real. Si no está configurada, el formulario continúa permitiendo edición manual.
- La consulta espera 350 ms y requiere 3 caracteres; limita a cinco sugerencias, favorece España mediante sesgo geográfico sin excluir otros países y descarta/cancela resultados obsoletos. Una sugerencia superior a 200 caracteres se rechaza con mensaje, sin truncarla.
- La interfaz atribuye Geoapify y OpenStreetMap y comunica que el texto de búsqueda se envía al proveedor. Las pruebas interceptan las solicitudes y usan una clave sintética exclusiva de E2E.
- Se conserva la regresión de ubicación sin espacios de 200 caracteres en viewport móvil. Búsqueda, filtros, paginación, detalle, permisos y seed mantienen su comportamiento.

La revisión oficial de Geoapify usada para la planificación registró 3.000 créditos diarios y 5 solicitudes por segundo en el nivel gratuito, a un crédito por autocomplete. El proveedor permite uso comercial dentro de los límites con atribución requerida; los términos generales indican limitaciones en producción, por lo que deben revisarse antes de desplegar. Su política declara recepción de cuerpo, cabeceras, IP y hora; las solicitudes exitosas se conservan normalmente hasta 24 horas. Tras configurar una clave restringida localmente, el usuario confirmó que la validación manual de Geoapify funcionó. No se registraron detalles adicionales del navegador o de la petición, así que esta evidencia queda atribuida al usuario y no a una ejecución observada por el agente.

## TDD observado

1. **Red web:** se añadieron aserciones para la fila separada y el combobox de ubicación antes de implementar el cambio. `mise exec -- pnpm --filter @nextriva/web test -- src/promotions/PromotionForm.test.tsx src/promotions/PromotionsScreen.test.tsx` ejecutó la suite web completa: 398 superadas y 2 fallidas, código 1. Los fallos esperados indicaban que faltaba el combobox y que ubicación no estaba estructuralmente separada del nombre.
2. **Green web:** se implementó el input accesible y el layout de tarjeta. Las pruebas focales pasaron 34/34 y los tests nuevos del input/proveedor 11/11, ambos con código 0. Typecheck web pasó con código 0.
3. **Red E2E de fixture:** el primer E2E añadió un flujo con Geoapify simulado y falló 1 de 77, porque Playwright aún no proporcionaba la clave sintética al servidor Vite. Se corrigió únicamente la configuración de prueba; no se contabiliza como RED funcional.
4. **Green E2E:** con clave sintética e interceptación de red, el flujo selecciona una sugerencia mediante teclado, crea la promoción, la edita mediante otra sugerencia y comprueba persistencia. También se intercepta/aborta Geoapify en la prueba de entrada manual. E2E completo: 77/77, código 0.
5. **Refactor/verificación final:** formato aplicado a los tres archivos señalados por la primera comprobación. No se añadieron dependencias ni abstracciones adicionales. Se repitieron la suite web, cobertura, E2E y controles finales.

## Resultados observados

| Comprobación                                                                                                  |                                                            Resultado | Código |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------: | -----: |
| `mise exec -- pnpm --filter @nextriva/web test`                                                               |                                         32 archivos, 412/412 pruebas |      0 |
| `mise exec -- pnpm --filter @nextriva/web test:coverage`                                                      | Líneas 95,53 %, ramas 90,24 %, funciones 96,56 %, sentencias 94,54 % |      0 |
| `mise exec -- pnpm typecheck`                                                                                 |                                                            API y web |      0 |
| `mise exec -- pnpm lint`                                                                                      |                                                               ESLint |      0 |
| `mise exec -- pnpm format:check`                                                                              |                                                             Prettier |      0 |
| `mise exec -- pnpm build`                                                                                     |                                                            API y web |      0 |
| `mise exec -- env NEXTRIVA_E2E_API_PORT=4417 NEXTRIVA_E2E_WEB_PORT=5273 pnpm --filter @nextriva/api test:e2e` |              Playwright Chromium, PostgreSQL temporal, 77/77; 29,6 s |      0 |
| `mise exec -- pnpm audit --json`                                                                              | Código 1 por el aviso conocido `GHSA-q7qp-rjg7-q26m` de Multer 2.4.0 |      1 |
| Evaluador estricto de `.github/audit-baseline.json`                                                           |  La única excepción temporal vigente fue aceptada; caduca 2026-11-23 |      0 |

El runner validó `TEST_DATABASE_URL` desde el archivo local de pruebas y creó/aplicó migraciones en una base PostgreSQL temporal en el puerto 5433. Playwright utilizó puertos aislados 4417 y 5273 porque ya había servicios escuchando en los puertos habituales; no se modificó `reuseExistingServer: false`, ni se detuvieron procesos existentes. El runner limpió sus recursos temporales. `nextriva_dev` no se utilizó.

La primera comprobación `format:check` devolvió código 1 para `promotions-ui.spec.ts`, `AddressAutocompleteProvider.test.ts` y `PromotionLocationInput.test.tsx`. Prettier los formateó y la repetición final pasó con código 0.

## Validación manual pendiente

La prueba manual de sugerencias reales con la clave restringida quedó confirmada por el usuario. No se ha observado independientemente el tráfico real ni se documentaron navegador o cuota consumida. La clave no debe enviarse por chat ni guardarse en Git.

Quedan pendientes revisión visual adicional, VoiceOver y comprobaciones con Safari/Firefox. No se afirma conformidad WCAG completa ni se modificaron datos de desarrollo.

## Uso de IA

Codex asistió en pruebas, implementación y redacción de esta evidencia a partir del Issue aprobado. Los resultados automatizados corresponden a comandos ejecutados; la comprobación real del proveedor se consigna como confirmación del usuario, no como ejecución observada por el agente. No se atribuye a la IA la decisión de producto ni la aprobación del Issue.
