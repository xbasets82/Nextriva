import { expect, test } from 'vitest';
import { resolveRequestId } from './request-id.js';

test.each([undefined, 'invalid request id', 'x'.repeat(65)])(
  'generates a UUID for an absent or invalid request ID',
  (candidate) => {
    expect(resolveRequestId(candidate)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  },
);

test('preserves a valid bounded request ID', () => {
  expect(resolveRequestId('nextriva-request-123')).toBe('nextriva-request-123');
});
