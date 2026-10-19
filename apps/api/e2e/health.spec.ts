import { expect, test } from '@playwright/test';

test('health response matches the published OpenAPI contract', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ status: 'ok' });

  const contractResponse = await request.get('/api/docs-json');
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
