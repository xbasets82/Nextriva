import { expect, test, type Response } from '@playwright/test';

test('health response matches the published OpenAPI contract', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4317/api/health');

  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ status: 'ok' });

  const contractResponse = await request.get('http://127.0.0.1:4317/api/docs-json');
  expect(contractResponse.status()).toBe(200);
  const contract = await contractResponse.json();
  expect(contract.paths['/api/health'].get.responses['200'].content['application/json'].schema)
    .toStrictEqual({
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      required: ['status'],
      additionalProperties: false,
    });
});

test('the initial screen displays health returned by the real API', async ({ page }) => {
  let healthResponse: Response | undefined;
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/health') {
      healthResponse = response;
    }
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Nextriva' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Estado del servicio: ok');

  if (!healthResponse) {
    throw new Error('La pantalla no recibió la respuesta de salud de la API.');
  }

  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toStrictEqual({ status: 'ok' });
  expect(new URL(healthResponse.url()).origin).toBe(new URL(page.url()).origin);
});
