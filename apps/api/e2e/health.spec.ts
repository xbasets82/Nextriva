import { expect, test } from '@playwright/test';

test('health response matches the published OpenAPI contract', async ({
  request,
}) => {
  const response = await request.get(
    `http://127.0.0.1:${process.env.NEXTRIVA_E2E_API_PORT ?? '4317'}/api/health`,
  );

  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ status: 'ok' });

  const contractResponse = await request.get(
    `http://127.0.0.1:${process.env.NEXTRIVA_E2E_API_PORT ?? '4317'}/api/docs-json`,
  );
  expect(contractResponse.status()).toBe(200);
  const contract = await contractResponse.json();
  expect(
    contract.paths['/api/health'].get.responses['200'].content[
      'application/json'
    ].schema,
  ).toStrictEqual({
    type: 'object',
    properties: { status: { type: 'string', enum: ['ok'] } },
    required: ['status'],
    additionalProperties: false,
  });
});

test('the login screen omits technical service status from the interface', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await expect(page.getByText('NEXTRIVA', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Nextriva', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      /Estado inicial del servicio|Estado del servicio|Consultando el estado/,
    ),
  ).toHaveCount(0);
});
