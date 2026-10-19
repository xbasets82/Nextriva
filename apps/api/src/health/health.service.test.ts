import { expect, test } from 'vitest';
import { HealthService } from './health.service.js';

test('returns the public health status', () => {
  expect(new HealthService().getStatus()).toStrictEqual({ status: 'ok' });
});
